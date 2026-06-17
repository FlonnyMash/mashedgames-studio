import { getWorkspacePath } from "@/lib/env";
import { isWorkspaceDesktop } from "@/lib/runtime-env";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Next dev/prod server cwd is apps/dashboard (or standalone/apps/dashboard).
 * Resolve monorepo paths from cwd — import.meta.url lands in .next chunks and
 * breaks relative monorepo resolution.
 */
const dashboardRoot = path.resolve(process.cwd());

/** Monorepo root (mashedgames-studio) */
export const monorepoRoot = path.resolve(dashboardRoot, "../..");

/** apps/game-engine — used for sync-manifest-registry spawn cwd */
export const gameEngineRoot = path.resolve(monorepoRoot, "apps/game-engine");

/** packages/templates/src — canonical TypeScript source for all game templates */
export const engineTemplatesRoot = path.resolve(
  monorepoRoot,
  "packages/templates/src",
);

export const TEMPLATES_DIR_NAME = "templates" as const;

/** Workspace-relative templates root: MASHEDGAMES_WORKSPACE_PATH/templates */
export function getWorkspaceTemplatesRoot(): string {
  return path.join(getWorkspacePath(), TEMPLATES_DIR_NAME);
}

/**
 * Unified template root on disk — single flat directory, no library/development split.
 * Priority: TEMPLATE_LIBRARY_ROOT env → workspace/templates → monorepo engine templates.
 */
export const templateLibraryRoot = (() => {
  const fromEnv = process.env.TEMPLATE_LIBRARY_ROOT?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(monorepoRoot, fromEnv);
  }
  if (isWorkspaceDesktop()) {
    return getWorkspaceTemplatesRoot();
  }
  return engineTemplatesRoot;
})();

/** True when the monorepo template folder is present (local dev / Studio). */
export function isMonorepoTemplateLibraryOnDisk(): boolean {
  return existsSync(templateLibraryRoot);
}
