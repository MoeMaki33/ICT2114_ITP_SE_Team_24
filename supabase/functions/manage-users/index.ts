import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type Account,
  ROLES,
  canChangeRole,
  canCreateUser,
  canDeleteUser,
  canEditDetails,
  canSetActive
} from "./permissions.mts";
// The only writer of public.users (R12): the browser has no write policy and the
// guard trigger refuses direct writes. Level rules: ./permissions.mts.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
const ACCOUNT_COLUMNS = "id, role, is_active, is_super_admin";
export default {
  async fetch (req) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: corsHeaders
      });
    }
    if (req.method !== 'POST') return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders
    });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders
    });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders
    });
    const { data: profile } = await callerClient.from("users").select(ACCOUNT_COLUMNS).eq("id", caller.id).single();
    const callerAccount = profile as Account | null;
    if (callerAccount?.role !== "admin" || callerAccount.is_active !== true) return new Response("Forbidden", {
      status: 403,
      headers: corsHeaders
    });
    // X-CPM-Actor-Id lets the audit trigger record who made each change.
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false
      },
      global: {
        headers: {
          "X-CPM-Actor-Id": caller.id
        }
      }
    });
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    async function loadTarget(id) {
      if (typeof id !== "string" || !id) return null;
      const { data } = await adminClient.from("users").select(ACCOUNT_COLUMNS).eq("id", id).maybeSingle();
      return data as Account | null;
    }
    // ── CREATE ──────────────────────────────────────────────────────────────
    if (action === 'create') {
      const { name, email, password, role } = body;
      if (!ROLES.includes(role)) return json({
        error: "Invalid role."
      }, 400);
      if (!canCreateUser(callerAccount, role)) return json({
        error: "Only the Super Admin can create Admin accounts."
      }, 403);
      const { data: newUser, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (authError) return json({
        error: authError.message
      }, 400);
      const { error: dbError } = await adminClient.from("users").insert({
        id: newUser.user.id,
        full_name: name,
        email,
        role,
        created_by: caller.id
      });
      if (dbError) {
        // No profile row: remove the sign-in account again so no half-created user remains.
        await adminClient.auth.admin.deleteUser(newUser.user.id);
        return json({
          error: dbError.message
        }, 400);
      }
      return json({
        success: true
      });
    }
    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (action === 'update') {
      const { id, name, email, role, is_active } = body;
      const target = await loadTarget(id);
      if (!target) return json({
        error: "User not found."
      }, 404);
      if (!canEditDetails(callerAccount, target)) return json({
        error: "You cannot edit this account."
      }, 403);
      if (role !== undefined && role !== target.role) {
        if (!ROLES.includes(role)) return json({
          error: "Invalid role."
        }, 400);
        if (!canChangeRole(callerAccount, target)) return json({
          error: "Only the Super Admin can promote or demote Admins."
        }, 403);
      }
      if (is_active !== undefined) {
        if (typeof is_active !== "boolean") return json({
          error: "Invalid status."
        }, 400);
        if (is_active !== target.is_active && !canSetActive(callerAccount, target)) return json({
          error: "You cannot change this account's status."
        }, 403);
      }
      // Update email in auth.users if provided
      if (email) {
        const { error: authError } = await adminClient.auth.admin.updateUserById(id, {
          email
        });
        if (authError) return json({
          error: authError.message
        }, 400);
      }
      // Update public.users (undefined fields are left unchanged)
      const { error: dbError } = await adminClient.from("users").update({
        full_name: name,
        email,
        role,
        is_active
      }).eq("id", id);
      if (dbError) return json({
        error: dbError.message
      }, 400);
      return json({
        success: true
      });
    }
    // ── DELETE ──────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { id } = body;
      const target = await loadTarget(id);
      if (!target) return json({
        error: "User not found."
      }, 404);
      if (!canDeleteUser(callerAccount, target)) return json({
        error: "You cannot delete this account."
      }, 403);
      // Deleting the sign-in account cascades to public.users.
      const { error: authError } = await adminClient.auth.admin.deleteUser(id);
      if (authError) return json({
        error: authError.message
      }, 400);
      // The cascade runs inside Auth, without the actor header: record who deleted it.
      const { error: auditError } = await adminClient.from("user_account_changes").update({
        changed_by: caller.id
      }).eq("user_id", id).eq("action", "deleted").is("changed_by", null);
      // The account is already deleted, so a failed audit update is logged, not returned.
      if (auditError) console.error("manage-users: could not record who deleted the account:", auditError.message);
      return json({
        success: true
      });
    }
    return json({
      error: 'Invalid action'
    }, 400);
  }
};
