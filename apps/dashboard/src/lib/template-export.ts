import {
  BASELINE_TEMPLATE_ID,
  GameConfigSchema,
  isLegacyTemplateId,
  normalizeTemplateId,
  type GameConfig,
} from "@mashedgames/shared";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { templateLibraryRoot } from "@/lib/project-paths";
import JSZip from "jszip";

/**
 * Build a zip archive for the given template.
 *
 * Contents:
 *   - All TypeScript source files from packages/templates/src/{templateId}/
 *     (manifest.ts, *Scene.ts, etc.)
 *   - config.json (GameConfig snapshot) if present
 *
 * The archive preserves the relative directory structure with the template
 * id as the top-level folder.
 */
export async function buildTemplateZip(templateId: string): Promise<
  | { ok: true; buffer: Buffer }
  | { ok: false; error: string; status: number }
> {
  const resolvedTemplateId = normalizeTemplateId(templateId);
  if (isLegacyTemplateId(templateId)) {
    console.warn(
      `[template-export] Migrating legacy template "${templateId}" -> "${BASELINE_TEMPLATE_ID}"`,
    );
  }
  const templateDir = path.join(templateLibraryRoot, resolvedTemplateId);
  if (!existsSync(templateDir)) {
    return {
      ok: false,
      error: `Template "${resolvedTemplateId}" not found.`,
      status: 404,
    };
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder(resolvedTemplateId);
    if (!folder) {
      return { ok: false, error: "Failed to create zip folder.", status: 500 };
    }

    addDirToZip(folder, templateDir, templateDir);

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    return { ok: true, buffer: Buffer.from(buffer) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Zip build failed.",
      status: 500,
    };
  }
}

const SKIP_ENTRIES = new Set(["node_modules", ".git", "dist", "build"]);
const INCLUDE_EXTENSIONS = new Set([".ts", ".tsx", ".json", ".md", ".png", ".webp"]);

function addDirToZip(
  zip: JSZip,
  absoluteDir: string,
  baseDir: string,
): void {
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (SKIP_ENTRIES.has(entry.name)) continue;
    const abs = path.join(absoluteDir, entry.name);
    const rel = path.relative(baseDir, abs).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      addDirToZip(zip.folder(rel) ?? zip, abs, baseDir);
    } else if (
      statSync(abs).isFile() &&
      INCLUDE_EXTENSIONS.has(path.extname(entry.name))
    ) {
      zip.file(rel, readFileSync(abs));
    }
  }
}

export function mergeFlatConfigIntoTemplateJson(
  templateJson: Record<string, unknown>,
  config: GameConfig,
): Record<string, unknown> {
  return {
    ...templateJson,
    ...GameConfigSchema.parse(config),
  };
}

export async function exportTemplateToDirectory(
  templateId: string,
  targetDir: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  void templateId;
  void targetDir;
  return {
    ok: false,
    error: "Deploy export is unavailable after reset.",
    status: 501,
  };
}
