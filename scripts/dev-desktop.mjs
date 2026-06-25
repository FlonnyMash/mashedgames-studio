import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveDesktopRoot,
  resolveElectronCli,
} from "./resolve-electron-cli.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(scriptDir, "..");

function parseEnvFile(filePath, targetEnv) {
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
      if (!(key in targetEnv)) {
        targetEnv[key] = value;
      }
    }
  } catch {
    // Optional file — main.js also loads these paths at runtime.
  }
}

const desktopRoot = resolveDesktopRoot();
const electronCli = resolveElectronCli(desktopRoot);
const dashboardUrl = process.env.MASHEDGAMES_DASHBOARD_URL ?? "http://127.0.0.1:3000";

const electronEnv = {
  ...process.env,
  NODE_ENV: "development",
  MASHEDGAMES_ELECTRON_DEV: "1",
  MASHEDGAMES_DASHBOARD_URL: dashboardUrl,
  NEXT_PUBLIC_MASHED_DEV_STORE_PREVIEW:
    process.env.NEXT_PUBLIC_MASHED_DEV_STORE_PREVIEW ?? "1",
  MASHEDGAMES_DEV_STORE_PREVIEW:
    process.env.MASHEDGAMES_DEV_STORE_PREVIEW ?? "1",
};

// Ensure Electron main inherits Supabase keys before main.js loadRuntimeConfig.
parseEnvFile(path.join(monorepoRoot, ".env.local"), electronEnv);
parseEnvFile(path.join(monorepoRoot, "apps/dashboard/.env.local"), electronEnv);

const result = spawnSync(process.execPath, [electronCli, "."], {
  cwd: desktopRoot,
  stdio: "inherit",
  shell: false,
  env: electronEnv,
});

process.exit(result.status ?? 1);
