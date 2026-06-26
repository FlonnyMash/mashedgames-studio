import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_DEV_DIST_DIR,
  shouldUseLocalDevCache,
  ensureLocalDevCacheJunction,
} from "./local-dev-cache-dir.mjs";

const dashboardRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const monorepoRoot = path.join(dashboardRoot, "../..");

/** Turbopack can leave a partial route manifest after hot restarts — nested API routes 404. */
function devRouteManifestLooksStale() {
  const routesFile = path.join(
    dashboardRoot,
    LOCAL_DEV_DIST_DIR,
    "dev",
    "types",
    "routes.d.ts",
  );
  if (!fs.existsSync(routesFile)) {
    return false;
  }
  const content = fs.readFileSync(routesFile, "utf8");
  if (content.includes("/api/templates/[templateId]")) {
    return false;
  }
  if (content.includes("/api/admin/")) {
    return false;
  }
  return (
    content.includes('AppRouteHandlerRoutes = "/api/acquire-license"') &&
    !content.includes("/api/projects/[projectId]")
  );
}

function clearDevCache(reason) {
  const cachePath = path.join(dashboardRoot, LOCAL_DEV_DIST_DIR);
  if (!fs.existsSync(cachePath)) {
    return;
  }
  console.warn(`[setup-dev-cache] ${reason} Clearing ${LOCAL_DEV_DIST_DIR}…`);
  fs.rmSync(cachePath, { recursive: true, force: true });
}

if (devRouteManifestLooksStale()) {
  clearDevCache("Stale Turbopack route manifest detected.");
}

if (shouldUseLocalDevCache(monorepoRoot)) {
  const junctionPath = ensureLocalDevCacheJunction(dashboardRoot);
  console.log(`[setup-dev-cache] Junction ready: ${junctionPath}`);
}
