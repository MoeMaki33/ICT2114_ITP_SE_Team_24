-- Safe development-data cleanup for the Weekly Summary demonstration.
-- This script never deletes readings, reading batches, users, summaries,
-- positions, Locations or Test Points. Placeholder points are deactivated.

begin;

do $$
declare
  v_missing_baselines integer;
  v_inactive_engineers integer;
begin
  with required(id, minimum_reading_count) as (
    values
      ('135c1e2b-b724-4403-8907-c2b6e815ff3b'::uuid, 3033::bigint),
      ('31f570b6-a24a-4bba-a875-06f5d9eb40b6'::uuid, 3033::bigint),
      ('6995cf3f-a817-4e1e-bc60-fe472eb38dbe'::uuid, 3033::bigint),
      ('fda4550e-ab01-420f-b868-3ff3030f3915'::uuid, 3033::bigint)
  ), actual as (
    select r.id, count(tpr.id)::bigint as reading_count
    from required r
    left join public.test_point_readings tpr on tpr.test_point_id = r.id
    group by r.id
  )
  select count(*)
  into v_missing_baselines
  from required r
  join actual a using (id)
  where a.reading_count < r.minimum_reading_count;

  if v_missing_baselines > 0 then
    raise exception 'Historical Jalan Ban preservation baseline failed; cleanup cancelled.';
  end if;

  select count(*)
  into v_inactive_engineers
  from public.users
  where id = 'bb00ac74-9b8b-4371-b2f8-6a3d7e60f57c'::uuid
    and role = 'corrosion_engineer'
    and is_active = true;

  if v_inactive_engineers <> 1 then
    raise exception 'Expected active corrosion engineer is unavailable; cleanup cancelled.';
  end if;
end;
$$;

-- Deactivate only the UUIDs approved in weekly_summary_cleanup_manifest.json.
update public.test_points
set is_active = false
where id = any(array[
  '86ff03e8-8e44-4056-8985-2916d3f0329f'::uuid,
  'ee6c86f2-988a-455c-bfe8-6870050086b1'::uuid,
  'c0ff9adb-15e9-40d8-8985-737a670d6f52'::uuid,
  'e95fccc5-abe4-4778-8d53-77aa16c820cb'::uuid,
  '12f835e5-ce41-4db7-bf91-7e628077a314'::uuid,
  'ddd3987f-5f3e-49ca-8a5a-3e168b8d9757'::uuid,
  '8e412d79-863e-40ac-9025-c610172e5b0e'::uuid,
  '94769541-6486-40bd-9ed6-5be25d81751d'::uuid,
  '6bf29770-f6c2-4bce-8bb1-0589fdef4e08'::uuid,
  'e3c37016-a9f1-47e8-9ba0-dbc897b03bbd'::uuid,
  '9d2637df-6326-4fc5-b008-0f298cc05f4f'::uuid,
  '34b8b6a3-6c16-4c75-af90-d7e971ec0938'::uuid,
  '97e1a850-8857-481f-82d6-bf7f378eaaa5'::uuid,
  '6b015ab0-f75b-4621-9668-b8695018a0b7'::uuid,
  '99a9d012-27c4-4edf-b2b8-3bfaade59859'::uuid,
  'b52d15ee-ebdc-44ae-ac94-bfade73ed1fb'::uuid,
  '3edaa706-0c85-449d-8773-c610f58a33bf'::uuid,
  '35078272-388d-4082-b5ad-b8a8d0b6def6'::uuid,
  '6b80e418-9991-4047-b9c4-e95e009c4df1'::uuid
]);

-- Retain all historical Jalan Ban UUIDs and normalise their public codes.
with retained(id, new_code) as (
  values
    ('135c1e2b-b724-4403-8907-c2b6e815ff3b'::uuid, 'JBN-TP-001'::text),
    ('31f570b6-a24a-4bba-a875-06f5d9eb40b6'::uuid, 'JBN-TP-002'::text),
    ('6995cf3f-a817-4e1e-bc60-fe472eb38dbe'::uuid, 'JBN-TP-003'::text),
    ('fda4550e-ab01-420f-b868-3ff3030f3915'::uuid, 'JBN-TP-004'::text)
)
update public.test_points tp
set
  label = r.new_code,
  test_point_code = r.new_code,
  threshold_mv = -850,
  assigned_engineer_id = 'bb00ac74-9b8b-4371-b2f8-6a3d7e60f57c'::uuid,
  is_active = true,
  note = 'Historical Jalan Ban readings are preserved. July 2026 Weekly Summary demo readings are synthetic and tagged synthetic_weekly_summary_demo_v1.'
from retained r
where tp.id = r.id;

-- Reuse four empty, meaningful development points as clearly tagged demo profiles.
with retained(id, new_code, note_text) as (
  values
    ('71bfcb59-4d46-4f4e-aa69-82a9dd0f2116'::uuid, 'JBS-TP-001'::text, 'Synthetic Weekly Summary demonstration point; readings are not client measurements.'::text),
    ('9ceff82f-c341-4882-be40-60d7797b1e75'::uuid, 'JBS-TP-002'::text, 'Synthetic Weekly Summary demonstration point; readings are not client measurements.'::text),
    ('747b4a41-6211-4dd4-a5e8-cd3316a2f751'::uuid, 'PAN-TP-001'::text, 'Synthetic Weekly Summary demonstration profile. Existing Location coordinates are unchanged.'::text),
    ('e8ec011c-85fa-493e-80d1-d5341e30d400'::uuid, 'PAN-TP-002'::text, 'Synthetic Weekly Summary demonstration profile. Existing Location coordinates are unchanged.'::text)
)
update public.test_points tp
set
  label = r.new_code,
  test_point_code = r.new_code,
  threshold_mv = -850,
  assigned_engineer_id = 'bb00ac74-9b8b-4371-b2f8-6a3d7e60f57c'::uuid,
  is_active = true,
  note = r.note_text
from retained r
where tp.id = r.id;

-- Remove placeholder coordinates without inventing exact coordinates for real-named sites.
update public.locations
set
  latitude = null,
  longitude = null,
  description = case id
    when 'f5b1ed29-cd62-4b14-ac2e-dd88109fa08e'::uuid then 'Historical imported readings retained. Exact site coordinates are unverified; July 2026 demo readings are synthetic and tagged.'
    when '2500a72e-79b1-4821-be46-d67875ecd133'::uuid then 'Synthetic Weekly Summary demonstration profile. Exact site coordinates are unverified.'
    when '7e54fbe4-355d-4f30-8091-cad995f5a253'::uuid then 'Inactive development placeholder retained for auditability; dependent history is preserved.'
    when 'd13630aa-ae22-4978-816c-84ad8a98287b'::uuid then 'Inactive development placeholder retained for auditability; dependent history is preserved.'
    when 'ed49cb57-7aa5-4135-bbdd-fd210936d985'::uuid then 'Inactive development placeholder retained for auditability.'
    when '235562a3-8a68-4331-92ca-1b66d438405e'::uuid then 'Inactive development placeholder retained for auditability.'
    when '1afd1c0a-91ea-452b-9f2e-6b166c1291a4'::uuid then 'Inactive development placeholder retained for auditability; dependent history is preserved.'
    when 'f2a2f7b5-0f24-44be-b7f3-00c29d84fb97'::uuid then 'Inactive development placeholder retained for auditability.'
    else description
  end,
  updated_at = now()
where id = any(array[
  'f5b1ed29-cd62-4b14-ac2e-dd88109fa08e'::uuid,
  '2500a72e-79b1-4821-be46-d67875ecd133'::uuid,
  '7e54fbe4-355d-4f30-8091-cad995f5a253'::uuid,
  'd13630aa-ae22-4978-816c-84ad8a98287b'::uuid,
  'ed49cb57-7aa5-4135-bbdd-fd210936d985'::uuid,
  '235562a3-8a68-4331-92ca-1b66d438405e'::uuid,
  '1afd1c0a-91ea-452b-9f2e-6b166c1291a4'::uuid,
  'f2a2f7b5-0f24-44be-b7f3-00c29d84fb97'::uuid
]);

update public.locations
set
  description = 'Synthetic Weekly Summary demonstration profile. Existing Location coordinates are retained and are not asserted as client-verified.',
  updated_at = now()
where id = '88267f8b-6677-4519-950b-3d88244b6e9e'::uuid;

-- Postcondition: no historical Jalan Ban raw reading was removed.
do $$
declare
  v_total bigint;
begin
  select count(*)
  into v_total
  from public.test_point_readings
  where test_point_id = any(array[
    '135c1e2b-b724-4403-8907-c2b6e815ff3b'::uuid,
    '31f570b6-a24a-4bba-a875-06f5d9eb40b6'::uuid,
    '6995cf3f-a817-4e1e-bc60-fe472eb38dbe'::uuid,
    'fda4550e-ab01-420f-b868-3ff3030f3915'::uuid
  ]);

  if v_total < 12132 then
    raise exception 'Historical Jalan Ban reading total fell below the audited baseline; cleanup rolled back.';
  end if;
end;
$$;

commit;
