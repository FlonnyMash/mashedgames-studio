/**
 * Unsigned directory build for local IPC and OTA testing.
 *
 * Mirrors the materialize-deps.mjs approach: runs `pnpm deploy --node-linker=hoisted`
 * into an ephemeral staging directory to produce a flat, symlink-free node_modules.
 * This is the only reliable way to handle packages with conflicting transitive-dep
 * version requirements (e.g. archiver-utils needs readable-stream@^4, while
 * lazystream needs readable-stream@^2 — both must resolve correctly in the
 * packaged app).
 *
 * Key differences from materialize-deps.mjs:
 *   - Uses `electron-builder --dir` (unpacked app, no installer — faster iteration)
 *   - Skips NSIS resource copying (not needed for unpacked builds)
 *   - Suppresses all code signing (CSC_IDENTITY_AUTO_DISCOVERY=false + mac.identity=null)
 *   - Output lands in apps/desktop/dist/dir-build/{timestamp}/win-unpacked
 *
 * Usage: pnpm run build:dir
 */

import { execFileSync, execSync } from "node:child_process";
import { cpSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");
const workspaceRoot = join(desktopDir, "..", "..");

const stamp = Date.now();
const stagingDir = join(desktopDir, `_dir_staging_${stamp}`);
const outputDir = join(desktopDir, "dist", "dir-build", String(stamp));

function log(msg) {
  console.log(`[build:dir] ${msg}`);
}

// All desktop source files that must be present in the packaged app.
// Keep in sync with the "files" array in package.json and with materialize-deps.mjs.
const SOURCE_FILES = [
  "main.js",
  "preload.js",
  "constants.js",
  "asset-ipc-utils.js",
  "auth-ipc-utils.js",
  "license-ipc-utils.js",
  "store-ipc-utils.js",
  "export-ipc-utils.js",
  "flat-config-ipc-utils.js",
  "admin-ipc-utils.js",
  "projects-ipc-utils.js",
  "updater-ipc-utils.js",
  "template-update-ipc-utils.js",
  "splash.html",
  "splash-logo.png",
  "package.json",
  "runtime-supabase.json",
];

// Find electron-builder's cli.js inside the pnpm virtual store.
// electron-builder is a devDependency of apps/desktop and is not on PATH in
// this pnpm workspace setup, so we resolve it from the .pnpm store directory.
// Scanning for "electron-builder@" avoids hardcoding the pnpm store hash.
function findEbCli() {
  const pnpmDir = join(workspaceRoot, "node_modules", ".pnpm");
  const entries = readdirSync(pnpmDir);
  const entry = entries.find((d) => d.startsWith("electron-builder@"));
  if (!entry) {
    throw new Error(
      "electron-builder not found in pnpm store. Run `pnpm install` from the workspace root.",
    );
  }
  return join(pnpmDir, entry, "node_modules", "electron-builder", "cli.js");
}
const ebCliPath = findEbCli();

// Environment for electron-builder: suppress all code signing.
// CSC_IDENTITY_AUTO_DISCOVERY=false prevents the Windows cert-store scan and the
// macOS identity lookup. WIN_PUBLISHER_NAME must be absent so the
// "${env.WIN_PUBLISHER_NAME}" interpolation in package.json produces an empty
// string (publisherName.length === 0), which causes WinPackager.signApp to
// return early without signing.
const buildEnv = { ...process.env };
delete buildEnv.WIN_PUBLISHER_NAME;
delete buildEnv.WIN_CSC_LINK;
delete buildEnv.CSC_LINK;
buildEnv.CSC_IDENTITY_AUTO_DISCOVERY = "false";

// ── Pre-flight: dashboard standalone build must exist ────────────────────────
const standaloneDir = join(workspaceRoot, "apps", "dashboard", ".next", "standalone");
if (!existsSync(standaloneDir)) {
  console.error(
    `\n[build:dir] ERROR: Dashboard standalone build not found.\n` +
    `  Expected: ${standaloneDir}\n\n` +
    `  The Next.js dashboard must be built before packaging the Electron app.\n` +
    `  Run this from the workspace root:\n\n` +
    `    pnpm --filter=dashboard build\n\n` +
    `  Then re-run: pnpm --filter=desktop build:dir\n`,
  );
  process.exit(1);
}

try {
  // ── 1. Clean staging dir ──────────────────────────────────────────────────
  log(`staging  → ${stagingDir}`);
  log(`output   → ${outputDir}`);
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }

  // ── 2. pnpm deploy (hoisted) — flat, symlink-free node_modules ───────────
  // --node-linker=hoisted collapses the pnpm virtual store into a conventional
  // flat node_modules. When two packages require different major versions of the
  // same dep (e.g. readable-stream), pnpm nests the minority version inside the
  // package's own node_modules rather than creating a broken conflict.
  log("phase deploy: pnpm deploy --node-linker=hoisted ...");
  execSync(
    `pnpm deploy --filter=desktop --prod --legacy --config.node-linker=hoisted "${stagingDir}"`,
    {
      stdio: "inherit",
      cwd: workspaceRoot,
      env: { ...process.env, CI: "true" },
    },
  );

  // ── 3. Copy source files into staging ────────────────────────────────────
  log("phase stage-files: copying desktop source files...");
  for (const file of SOURCE_FILES) {
    const src = join(desktopDir, file);
    if (existsSync(src)) {
      cpSync(src, join(stagingDir, file), { force: true });
    } else {
      log(`  (skipped — not found) ${file}`);
    }
  }

  // ── 3.5. Patch staging package.json: fix extraResources absolute path ─────
  // When electron-builder runs with --projectDir pointing at the staging dir
  // (inside apps/desktop/), the relative path "../dashboard/.next/standalone"
  // resolves to apps/desktop/dashboard/ which does not exist. We rewrite it
  // to an absolute path — matching what materialize-deps.mjs already does.
  log("phase patch-config: fixing extraResources path in staging package.json ...");
  const stagingPkgPath = join(stagingDir, "package.json");
  const stagingPkg = JSON.parse(readFileSync(stagingPkgPath, "utf8"));
  const standaloneAbsPath = standaloneDir.replace(/\\/g, "/");
  if (stagingPkg.build?.extraResources) {
    for (const res of stagingPkg.build.extraResources) {
      if (res.from && res.from.includes("dashboard")) {
        res.from = standaloneAbsPath;
      }
    }
  }
  writeFileSync(stagingPkgPath, JSON.stringify(stagingPkg, null, 2));

  // ── 4. Run electron-builder --dir (unpacked, unsigned) ───────────────────
  // electron-builder is not on PATH in this pnpm workspace. We invoke its
  // cli.js directly with the Node binary currently running this script, using
  // the path resolved from the pnpm store above.
  log(`phase package: node ${ebCliPath} --dir ...`);
  execFileSync(
    process.execPath,
    [
      ebCliPath,
      "--dir",
      "--projectDir", stagingDir,
      "-c.mac.identity=null",
      `--config.directories.output=${outputDir}`,
    ],
    {
      stdio: "inherit",
      cwd: desktopDir,
      env: buildEnv,
    },
  );

  log(`done — unpacked app at ${outputDir}`);
} finally {
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
    log("cleanup: removed ephemeral staging dir.");
  }
}
