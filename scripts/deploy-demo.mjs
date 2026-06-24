import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Child-process helper — matches scripts/build-release.mjs and run-dev.mjs
// ---------------------------------------------------------------------------

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    // shell: true is required on Windows so pnpm (.cmd shim) resolves from PATH.
    shell: true,
    env: options.env ?? process.env,
  });

  if (result.error) {
    console.error(
      `[deploy-demo] Failed to spawn "${command}": ${result.error.message}`,
    );
    return { ok: false, status: 1 };
  }

  if (typeof result.status === "number" && result.status === 0) {
    return { ok: true };
  }

  console.error(
    `[deploy-demo] Command failed: ${command} ${args.join(" ")} ` +
      `(exit code ${result.status ?? "null"})`,
  );
  return { ok: false, status: result.status ?? 1 };
}

// ---------------------------------------------------------------------------
// CLI arg
// ---------------------------------------------------------------------------
const templateName = process.argv[2];

if (!templateName) {
  console.error(
    "[deploy-demo] ERROR: No template name provided.\n" +
      "Usage: node scripts/deploy-demo.mjs <template-name>\n" +
      "Example: node scripts/deploy-demo.mjs catch-game",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validate that the template folder exists
// ---------------------------------------------------------------------------
const tmplDir = path.join(repoRoot, "packages", "templates", "src", templateName);

if (!fs.existsSync(tmplDir) || !fs.statSync(tmplDir).isDirectory()) {
  console.error(
    `[deploy-demo] ERROR: Template folder not found: ${tmplDir}\n` +
      `Make sure "${templateName}" exists under packages/templates/src/.`,
  );
  process.exit(1);
}

const templateConfigJson = path.join(tmplDir, "config.json");
const templateAssetsDir = path.join(tmplDir, "assets");

if (!fs.existsSync(templateConfigJson)) {
  console.error(
    `[deploy-demo] ERROR: config.json not found in template folder: ${templateConfigJson}`,
  );
  process.exit(1);
}

console.log(`[deploy-demo] Building demo for template: ${templateName}`);

// ---------------------------------------------------------------------------
// Load .env.local (shell env takes precedence)
// ---------------------------------------------------------------------------
function parseEnvFile(filePath) {
  const vars = {};
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  } catch {
    // File may not exist in CI; credentials are expected to be in system env.
  }
  return vars;
}

const envLocalVars = parseEnvFile(path.join(repoRoot, ".env.local"));

const cfApiToken =
  process.env.CLOUDFLARE_API_TOKEN ?? envLocalVars.CLOUDFLARE_API_TOKEN;
const cfAccountId =
  process.env.CLOUDFLARE_ACCOUNT_ID ?? envLocalVars.CLOUDFLARE_ACCOUNT_ID;

if (!cfApiToken) {
  console.error(
    "[deploy-demo] ERROR: CLOUDFLARE_API_TOKEN is not set.\n" +
      "Set it in .env.local or as a system environment variable.",
  );
  process.exit(1);
}

if (!cfAccountId) {
  console.error(
    "[deploy-demo] ERROR: CLOUDFLARE_ACCOUNT_ID is not set.\n" +
      "Set it in .env.local or as a system environment variable.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: Build the game-engine with the template pinned at build time
// ---------------------------------------------------------------------------
console.log(`\n[deploy-demo] Step 1: Building game-engine (VITE_DEMO_TEMPLATE=${templateName})...`);

const buildResult = run(
  "pnpm",
  ["--config.verifyDepsBeforeRun=false", "--filter", "game-engine", "build"],
  { env: { ...process.env, VITE_DEMO_TEMPLATE: templateName } },
);

if (!buildResult.ok) {
  process.exit(buildResult.status);
}

// ---------------------------------------------------------------------------
// Step 2: Stage template config.json and assets into dist/ post-build
// ---------------------------------------------------------------------------
const distDir = path.join(repoRoot, "apps", "game-engine", "dist");

console.log(`\n[deploy-demo] Step 2: Staging template assets into ${distDir} ...`);

// config.json
fs.copyFileSync(templateConfigJson, path.join(distDir, "config.json"));
console.log(`  Copied config.json`);

// assets/ (only if the folder exists — some templates may have no binary assets)
if (fs.existsSync(templateAssetsDir) && fs.statSync(templateAssetsDir).isDirectory()) {
  const destAssetsDir = path.join(distDir, "assets");
  fs.cpSync(templateAssetsDir, destAssetsDir, { recursive: true });
  console.log(`  Copied assets/ → ${destAssetsDir}`);
} else {
  console.log(`  No assets/ folder found — skipping asset copy.`);
}

// ---------------------------------------------------------------------------
// Step 3: Deploy to Cloudflare Pages
// ---------------------------------------------------------------------------
console.log(`\n[deploy-demo] Step 3: Deploying to Cloudflare Pages (branch: ${templateName})...`);

const deployResult = run(
  "pnpm",
  [
    "wrangler",
    "pages",
    "deploy",
    distDir,
    "--project-name",
    "mashedgames-demos",
    "--branch",
    templateName,
  ],
  {
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: cfApiToken,
      CLOUDFLARE_ACCOUNT_ID: cfAccountId,
    },
  },
);

if (!deployResult.ok) {
  process.exit(deployResult.status);
}

console.log(
  `\n[deploy-demo] Done! Demo deployed to:\n` +
    `  https://${templateName}.mashedgames-demos.pages.dev`,
);
