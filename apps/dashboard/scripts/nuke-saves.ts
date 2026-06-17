#!/usr/bin/env node
/**
 * NUKE LEGACY SAVES — wipes every locally persisted project save so the
 * workspace starts from a completely blank slate.
 *
 * Deletes (recursively, force):
 *   {workspace}/Projects   — canonical project root (project.json / client.json / parent-lock.json)
 *   {workspace}/projects   — legacy lowercase root from older builds
 *   {workspace}/saves      — legacy save-file root from older builds
 *
 * The workspace root is resolved through the same utilities the dashboard
 * uses at runtime (MASHEDGAMES_WORKSPACE_PATH, falling back to the local
 * `.local-workspace` directory), so dev and desktop workspaces are both
 * handled correctly.
 *
 * Usage:
 *   pnpm --filter dashboard nuke-saves
 *   (or from apps/dashboard: pnpm exec tsx scripts/nuke-saves.ts)
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(scriptDir, "..");

// The src/lib path utilities resolve the workspace relative to process.cwd()
// (Next.js server semantics). Pin the cwd to apps/dashboard BEFORE importing
// them so the script behaves identically regardless of invocation directory.
process.chdir(dashboardRoot);

const LEGACY_SAVE_DIR_NAMES = ["projects", "saves"] as const;

function wipeDirectory(target: string): boolean {
  if (!existsSync(target)) {
    console.log(`  [skip]   ${target} (not present)`);
    return false;
  }
  rmSync(target, { recursive: true, force: true });
  if (existsSync(target)) {
    throw new Error(`Directory still exists after deletion: ${target}`);
  }
  console.log(`  [nuked]  ${target}`);
  return true;
}

async function main(): Promise<void> {
  const { getWorkspacePath } = await import("../src/lib/env");
  const { ensureWorkspaceExists, getProjectsRoot } = await import(
    "../src/lib/project-paths"
  );

  ensureWorkspaceExists();

  const workspaceRoot = getWorkspacePath();
  const projectsRoot = path.resolve(getProjectsRoot());

  console.log(`Workspace root: ${workspaceRoot}`);
  console.log("Nuking legacy saves...");

  const targets = new Set<string>([projectsRoot]);
  for (const legacyDirName of LEGACY_SAVE_DIR_NAMES) {
    targets.add(path.resolve(workspaceRoot, legacyDirName));
  }

  let wipedCount = 0;
  for (const target of targets) {
    if (wipeDirectory(target)) {
      wipedCount += 1;
    }
  }

  // Recreate an empty canonical Projects root so the dashboard's project
  // listing I/O finds a valid (blank) directory on next launch.
  mkdirSync(projectsRoot, { recursive: true });
  console.log(`Recreated empty projects root: ${projectsRoot}`);
  console.log(`Done. ${wipedCount} director${wipedCount === 1 ? "y" : "ies"} wiped — blank slate ready.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`nuke-saves failed: ${message}`);
  process.exit(1);
});
