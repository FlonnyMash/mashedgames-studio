import { isWorkspaceDesktopClient } from "@/lib/runtime-env";

/** Keep in sync with apps/desktop/constants.js WORKSPACE_DIR_NAME */
export const WORKSPACE_FOLDER_NAME = "MashedGamesStudio";

/** Keep in sync with apps/dashboard/src/lib/project-paths.ts PROJECTS_DIR_NAME */
export const PROJECTS_FOLDER_NAME = "Projects";

/** Relative path label shown in UI for where configurator projects are stored. */
export function getProjectsStoragePathLabel(): string {
  if (isWorkspaceDesktopClient()) {
    return `Documents/${WORKSPACE_FOLDER_NAME}/${PROJECTS_FOLDER_NAME}/`;
  }
  return `.local-workspace/${PROJECTS_FOLDER_NAME}/`;
}

/** Monorepo or workspace template root label for Studio UI. */
export function getStudioTemplatesPathLabel(): string | null {
  if (isWorkspaceDesktopClient()) {
    return `${WORKSPACE_FOLDER_NAME}/templates/`;
  }
  return "packages/templates/src/";
}

export function getStudioTemplatesPackagesHint(): string {
  if (isWorkspaceDesktopClient()) {
    return "Export a scaffold zip or import a template package. Template IDs must match the folder name (kebab-case).";
  }
  return "Generate a scaffold zip or install an archive into the monorepo. Template IDs must match the folder name (kebab-case).";
}

export function getStudioTemplatesEmptyHint(): string {
  if (isWorkspaceDesktopClient()) {
    return "No templates in the catalog yet. Import one above or create a new template.";
  }
  return "No templates in the catalog yet. Import one above or run sync-manifest-registry after adding files.";
}
