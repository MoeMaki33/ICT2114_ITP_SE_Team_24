#!/usr/bin/env node
/**
 * Visual baseline capture for the DESIGN.md standardisation refactor.
 *
 *   node scripts/capture-screenshots.js --label baseline
 *   node scripts/capture-screenshots.js --label after
 *
 * Writes PNGs plus a manifest.json to tests/visual/<label>/ so a refactor can
 * be diffed page by page. tests/visual/ is gitignored: these shots are taken
 * against a real Supabase project and may contain client data.
 *
 * Every protected page needs a signed-in session, so put credentials for the
 * STAGING project in the untracked root .env before running:
 *
 *   CPM_SCREENSHOT_SUPABASE_URL=https://<staging-ref>.supabase.co
 *   CPM_SCREENSHOT_SUPABASE_KEY=sb_publishable_...
 *   CPM_SCREENSHOT_EMAIL=...
 *   CPM_SCREENSHOT_PASSWORD=...
 *
 * The browser config (js/config/supabase-config.js) is hard-coded to the live
 * project and has no env override, so the run rewrites it in flight rather
 * than editing the file; PHP reads the same values from its environment. The
 * run refuses to sign in against the live project unless --allow-live says to.
 *
 * Without credentials only the public pages are captured and the rest are
 * listed as skipped. PHP comes from PHP_BIN, or C:\xampp\php\php.exe.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

// www/js/config/supabase-config.js and www/php/config.php both default here.
const LIVE_PROJECT_REF = "pscwapylbjvulvsszdur";
// asset_v() appends a cache-busting ?v=, so match on the path, not a .js glob.
const CONFIG_SCRIPT = /\/js\/config\/supabase-config\.js(\?|$)/;
const PORT = Number(process.env.CPM_SCREENSHOT_PORT || 5599);
const BASE_URL = `http://localhost:${PORT}`;

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

// Modals are opened by adding .show rather than by clicking through a flow, so
// a shot does not depend on which rows happen to exist in the database.
const PAGES = [
  { file: "index.php", name: "login", public: true },
  { file: "forgot-password.php", name: "forgot-password", public: true },
  { file: "reset-password.php", name: "reset-password", public: true },
  { file: "dashboard.php", name: "dashboard" },
  { file: "weekly.php", name: "weekly" },
  { file: "history.php", name: "history" },
  { file: "asset-map.php", name: "asset-map", modals: ["testPointPositionModal"] },
  {
    file: "testpoints.php",
    name: "testpoints",
    modals: ["addTpModal", "importTestPointsModal", "testPointPositionModal"],
  },
  {
    file: "testpoint-view.php",
    name: "testpoint-view",
    modals: [
      "addReadingModal",
      "importDetailReadingsModal",
      "equipmentChangeModal",
      "testPointPositionModal",
    ],
  },
  { file: "testpoint-update.php", name: "testpoint-update" },
  { file: "settings.php", name: "settings" },
  { file: "admin.php", name: "admin", modals: ["userModal", "editModal"] },
];

function parseArgs(argv) {
  const args = { label: "baseline", allowLive: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--label" && argv[i + 1]) args.label = argv[i += 1];
    else if (argv[i] === "--allow-live") args.allowLive = true;
  }
  if (!/^[a-z0-9-]+$/.test(args.label)) throw new Error(`--label must be kebab-case, got "${args.label}"`);
  return args;
}

/**
 * Which Supabase project the run points at, and whether it is safe to sign in.
 * Screenshots of the live project hold the client's real readings, which must
 * not be written to disk by accident (CLAUDE.md: never commit client data).
 */
function resolveTarget({ allowLive }) {
  const url = process.env.CPM_SCREENSHOT_SUPABASE_URL || "";
  const key = process.env.CPM_SCREENSHOT_SUPABASE_KEY || "";
  const email = process.env.CPM_SCREENSHOT_EMAIL || "";
  const password = process.env.CPM_SCREENSHOT_PASSWORD || "";

  if (!email || !password) {
    return { canSignIn: false, reason: "no CPM_SCREENSHOT_EMAIL / CPM_SCREENSHOT_PASSWORD" };
  }
  if (!url || !key) {
    return {
      canSignIn: false,
      reason: "no CPM_SCREENSHOT_SUPABASE_URL / CPM_SCREENSHOT_SUPABASE_KEY, and the committed config points at the live project",
    };
  }
  if (url.includes(LIVE_PROJECT_REF) && !allowLive) {
    return { canSignIn: false, reason: `refusing to sign in to the live project (${LIVE_PROJECT_REF}); pass --allow-live to override` };
  }
  return { canSignIn: true, url: url.replace(/\/+$/, ""), key, email, password, live: url.includes(LIVE_PROJECT_REF) };
}

function phpBinary() {
  if (process.env.PHP_BIN) return process.env.PHP_BIN;
  const xampp = "C:\\xampp\\php\\php.exe";
  if (process.platform === "win32" && fs.existsSync(xampp)) return xampp;
  return "php";
}

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`PHP server did not answer on ${url} within ${timeoutMs}ms`);
}

async function startServer(target) {
  const bin = phpBinary();
  // php/config.php prefers these over its live-project fallbacks.
  const env = { ...process.env };
  if (target.canSignIn) {
    env.SUPABASE_URL = target.url;
    env.SUPABASE_PUBLISHABLE_KEY = target.key;
  }
  const server = spawn(bin, ["-S", `localhost:${PORT}`, "-t", path.join(ROOT, "www")], {
    cwd: ROOT,
    stdio: "ignore",
    env,
  });
  server.on("error", (error) => {
    console.error(`Could not start PHP (${bin}): ${error.message}`);
    console.error("Set PHP_BIN to a php executable.");
    process.exit(1);
  });
  await waitForServer(`${BASE_URL}/index.php`);
  return server;
}

/**
 * supabase-config.js freezes a hard-coded url/publishableKey and offers no env
 * override, so point the browser elsewhere by rewriting the file as it is
 * served. Nothing on disk changes, and no key is written into the repo.
 */
async function installStagingConfig(context, target) {
  await context.route(CONFIG_SCRIPT, async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const patched = original
      .replace(/url: "[^"]*"/, `url: ${JSON.stringify(target.url)}`)
      .replace(/publishableKey: "[^"]*"/, `publishableKey: ${JSON.stringify(target.key)}`);
    if (patched === original) {
      throw new Error("supabase-config.js no longer matches the expected url/publishableKey shape");
    }
    if (patched.includes(LIVE_PROJECT_REF)) {
      throw new Error("the live project reference survived the rewrite; refusing to continue");
    }
    await route.fulfill({ response, body: patched });
  });
}

// The app signs in through Supabase in the browser, then hands the token to
// php/set-session.php, so the only reliable login is the real form.
async function signIn(context, email, password, expectedUrl) {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/index.php`, { waitUntil: "domcontentloaded" });

  // A rewrite that quietly misses would sign in to the live project and put
  // client data in the shots, so prove the page took the override first.
  const active = await page.evaluate(() => window.SUPABASE_CONFIG?.url || null);
  if (active !== expectedUrl) {
    throw new Error(`page is pointed at ${active}, expected ${expectedUrl}; config rewrite did not apply`);
  }

  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("index.php"), { timeout: 30000 }),
    page.click("#loginButton"),
  ]);
  await page.close();
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200); // charts and Supabase reads land after load
  // Charts animate; freeze them so two runs of the same page match.
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function shoot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

async function captureModal(page, dir, prefix, modalId) {
  const shots = [];
  const opened = await page.evaluate((id) => {
    const modal = document.getElementById(id);
    if (!modal) return false;
    document.querySelectorAll(".modal.show").forEach((other) => other.classList.remove("show"));
    modal.classList.add("show");
    modal.removeAttribute("aria-hidden");
    return true;
  }, modalId);
  if (!opened) return { shots, missing: true };

  await page.waitForTimeout(200);
  shots.push(await shoot(page, dir, `${prefix}-modal-${modalId}-idle`));

  const close = page.locator(`#${modalId} .modal-close, #${modalId} [data-close-position-modal]`).first();
  if (await close.count()) {
    await close.hover();
    await page.waitForTimeout(120);
    shots.push(await shoot(page, dir, `${prefix}-modal-${modalId}-close-hover`));

    await page.mouse.move(0, 0);
    await close.focus();
    await page.waitForTimeout(120);
    shots.push(await shoot(page, dir, `${prefix}-modal-${modalId}-close-focus`));
  }

  await page.evaluate((id) => document.getElementById(id)?.classList.remove("show"), modalId);
  return { shots, missing: false };
}

async function captureTableSorts(page, dir, prefix) {
  const shots = [];
  const tables = await page.locator("table").all();
  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index];
    if (!(await table.isVisible().catch(() => false))) continue;
    const buttons = table.locator("[data-table-sort-button]");
    if (!(await buttons.count())) continue;

    const first = buttons.first();
    await first.click();
    await page.waitForTimeout(250);
    shots.push(await shoot(page, dir, `${prefix}-table${index}-sort-asc`));
    await first.click();
    await page.waitForTimeout(250);
    shots.push(await shoot(page, dir, `${prefix}-table${index}-sort-desc`));
  }
  return shots;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.join(ROOT, "tests", "visual", args.label);
  fs.mkdirSync(outDir, { recursive: true });

  const target = resolveTarget(args);
  const canSignIn = target.canSignIn;
  if (!canSignIn) {
    console.warn(`Capturing public pages only: ${target.reason}.`);
  } else {
    console.log(`Signing in against ${target.url}${target.live ? " (LIVE, forced with --allow-live)" : ""}`);
  }

  const server = await startServer(target);
  const browser = await chromium.launch();
  const manifest = {
    label: args.label,
    baseUrl: BASE_URL,
    supabaseUrl: canSignIn ? target.url : null,
    capturedAt: new Date().toISOString(),
    shots: [],
    skipped: [],
    notes: canSignIn ? [] : [target.reason],
  };

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      if (canSignIn) {
        await installStagingConfig(context, target);
        try {
          await signIn(context, target.email, target.password, target.url);
        } catch (error) {
          manifest.notes.push(`sign-in failed at ${viewport.name}: ${error.message}`);
          console.error(`Sign-in failed: ${error.message}`);
        }
      }

      const page = await context.newPage();
      for (const target of PAGES) {
        if (!canSignIn && !target.public) {
          manifest.skipped.push(`${target.name}@${viewport.name} (needs sign-in)`);
          continue;
        }
        const prefix = `${target.name}-${viewport.name}`;
        await page.goto(`${BASE_URL}/${target.file}`, { waitUntil: "domcontentloaded" });
        if (!target.public && page.url().includes("index.php")) {
          manifest.skipped.push(`${target.name}@${viewport.name} (redirected to login)`);
          continue;
        }
        await settle(page);
        manifest.shots.push(await shoot(page, outDir, prefix));

        for (const modalId of target.modals || []) {
          const { shots, missing } = await captureModal(page, outDir, prefix, modalId);
          if (missing) manifest.skipped.push(`${prefix} modal #${modalId} (not in the page)`);
          manifest.shots.push(...shots);
        }

        manifest.shots.push(...(await captureTableSorts(page, outDir, prefix)));
        console.log(`captured ${prefix}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${manifest.shots.length} shots in tests/visual/${args.label}/`);
  if (manifest.skipped.length) console.log(`${manifest.skipped.length} skipped:\n  ${manifest.skipped.join("\n  ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
