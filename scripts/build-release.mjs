import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const mode = process.argv[2];

if (mode !== "client" && mode !== "studio") {
  console.error(
    'Usage: node scripts/build-release.mjs <client|studio>',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load .env.local so the Supabase public vars are available to both the
// Next.js build environment and the runtime-supabase.json we embed for the
// Electron main process.
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
    // File may not exist in CI; that's fine if the vars are already in the env.
  }
  return vars;
}

const envLocalVars = parseEnvFile(path.join(repoRoot, ".env.local"));

// Merge: shell env takes precedence over .env.local.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? envLocalVars.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? envLocalVars.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[build-release] WARNING: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not found. " +
      "Auth will not work in the packaged build.",
  );
}

// electron-builder expands ${env.MASHED_UPDATE_BASE_URL} from the process env
// at packaging time. If it is not defined the build hard-fails, so we always
// supply a value — defaulting to a placeholder when not explicitly configured.
// The auto-updater will simply never find an update at a placeholder URL;
// no harm is done and the installer is still produced correctly.
const mashedUpdateBaseUrl =
  process.env.MASHED_UPDATE_BASE_URL ??
  envLocalVars.MASHED_UPDATE_BASE_URL ??
  "https://releases.mashedgames.com";

if (!process.env.MASHED_UPDATE_BASE_URL && !envLocalVars.MASHED_UPDATE_BASE_URL) {
  console.warn(
    "[build-release] WARNING: MASHED_UPDATE_BASE_URL not set — OTA auto-updater will be " +
      `inactive. Using placeholder: ${mashedUpdateBaseUrl}`,
  );
}

// Write runtime-supabase.json so the Electron main process can load the public
// Supabase credentials at runtime (they are not available via process.env in a
// packaged build since NEXT_PUBLIC_* vars are baked into the JS bundle, not the env).
const runtimeSupabasePath = path.join(repoRoot, "apps", "desktop", "runtime-supabase.json");
fs.writeFileSync(
  runtimeSupabasePath,
  JSON.stringify({ supabaseUrl, supabaseAnonKey }, null, 2),
);
console.log(`[build-release] wrote ${runtimeSupabasePath}`);

const isStudioMode = mode === "studio" ? "true" : "false";
const baseEnv = {
  ...process.env,
  ...envLocalVars,
  NEXT_PUBLIC_ENABLE_STUDIO_MODE: isStudioMode,
  NEXT_PUBLIC_APP_MODE: mode === "client" ? "configurator" : "studio",
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  MASHED_UPDATE_BASE_URL: mashedUpdateBaseUrl,
  // Suppress pnpm's interactive "confirm module purge" prompt when running
  // without a TTY (electron-builder staging deploys leave node_modules in a
  // production state between runs, which triggers the guard on the next run).
  CI: "true",
};

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env,
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    console.error(result.error.message);
  }
  return 1;
}

// Ensure build-time toolchain binaries (tsc, vite, etc.) are present.
// Some local workflows leave the workspace in a production-only install state.
// --config.confirmModulesPurge=false prevents pnpm 11 from aborting when it
// needs to remove/recreate node_modules without an interactive TTY.
const installExitCode = run(
  "pnpm",
  ["install", "--prod=false", "--yes"],
  baseEnv,
);
if (installExitCode !== 0) {
  process.exit(installExitCode);
}

const result = run("pnpm", ["run", "build:pipeline"], baseEnv);

process.exit(result);
