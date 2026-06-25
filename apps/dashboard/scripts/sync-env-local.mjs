import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dashboardRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const monorepoRoot = path.join(dashboardRoot, "../..");
const rootEnvPath = path.join(monorepoRoot, ".env.local");
const dashboardEnvPath = path.join(dashboardRoot, ".env.local");

/**
 * Next.js loads env from apps/dashboard/.env.local, while Electron main reads
 * the monorepo root copy first. Keep them in sync so login, API routes, and
 * IPC-backed store fetches all use the same Supabase keys.
 */
export function syncEnvLocalFromMonorepoRoot() {
  if (!fs.existsSync(rootEnvPath)) {
    return;
  }

  const rootContents = fs.readFileSync(rootEnvPath, "utf8");
  const dashboardContents = fs.existsSync(dashboardEnvPath)
    ? fs.readFileSync(dashboardEnvPath, "utf8")
    : null;

  if (dashboardContents === rootContents) {
    return;
  }

  fs.writeFileSync(dashboardEnvPath, rootContents, "utf8");
  console.log(
    `[sync-env-local] Synced ${path.relative(monorepoRoot, rootEnvPath)} → ` +
      `${path.relative(monorepoRoot, dashboardEnvPath)}`,
  );
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  syncEnvLocalFromMonorepoRoot();
}
