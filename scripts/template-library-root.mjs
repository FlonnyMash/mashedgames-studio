import fs from "node:fs";
import path from "node:path";

/**
 * Mirrors apps/dashboard/src/lib/template-library-root.ts resolution so
 * Studio save-config and deploy bundle builds read the same on-disk folder.
 */
export function resolveTemplateLibraryRoot(repoRoot, env = process.env) {
  const fromEnv = env.TEMPLATE_LIBRARY_ROOT?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(repoRoot, fromEnv);
  }

  const isDesktop = env.NEXT_PUBLIC_WORKSPACE_DESKTOP === "1";

  if (isDesktop) {
    const workspacePath = env.MASHEDGAMES_WORKSPACE_PATH?.trim();
    if (workspacePath) {
      return path.join(path.resolve(workspacePath), "templates");
    }
  }

  return path.join(repoRoot, "packages", "templates", "src");
}

export function resolveTemplateDir(repoRoot, templateSlug, env = process.env) {
  return path.join(resolveTemplateLibraryRoot(repoRoot, env), templateSlug);
}

export function loadDeployEnv(repoRoot) {
  const envPath = path.join(repoRoot, ".env.local");
  const merged = { ...process.env };

  try {
    const content = fs.readFileSync(envPath, "utf8");
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
      merged[key] = value;
    }
  } catch {
    // .env.local is optional
  }

  return merged;
}
