import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoBundle } from "./build-demo-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
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

const templateName = process.argv[2];

if (!templateName) {
  console.error(
    "[deploy-demo] ERROR: No template name provided.\n" +
      "Usage: node scripts/deploy-demo.mjs <template-name>\n" +
      "Example: node scripts/deploy-demo.mjs catch-game",
  );
  process.exit(1);
}

  console.log(`[deploy-demo] Building demo bundle for template: ${templateName}`);

  const envLocalVars = parseEnvFile(path.join(repoRoot, ".env.local"));
  const deployEnv = { ...process.env, ...envLocalVars };

const cfApiToken =
  deployEnv.CLOUDFLARE_API_TOKEN;
const cfAccountId =
  deployEnv.CLOUDFLARE_ACCOUNT_ID;
// Studio demo/store Pages project — distinct from the customer-games project
// (CLOUDFLARE_CLIENT_PROJECT_NAME) used by the configurator deploy route.
const cfDemoProject =
  deployEnv.CLOUDFLARE_DEMO_PROJECT_NAME || "mashedgames-demos";

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

// Persist bundle locally so deploy-demo API route can measure size after upload.
const stagingDir = path.join(repoRoot, ".demo-dist", templateName);

try {
  console.log(`\n[deploy-demo] Step 1: Materializing demo bundle in ${stagingDir} ...`);
  buildDemoBundle(templateName, stagingDir);

  console.log(`\n[deploy-demo] Step 2: Deploying to Cloudflare Pages (branch: ${templateName})...`);

  const deployResult = run(
    "pnpm",
    [
      "wrangler",
      "pages",
      "deploy",
      stagingDir,
      "--project-name",
      cfDemoProject,
      "--branch",
      templateName,
    ],
    {
      env: {
        ...deployEnv,
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
      `  https://${templateName}.${cfDemoProject}.pages.dev`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[deploy-demo] ERROR: ${message}`);
  process.exit(1);
}
