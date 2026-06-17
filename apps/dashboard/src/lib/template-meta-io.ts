import { normalizeTemplateId } from "@mashedgames/shared";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { templateLibraryRoot } from "@/lib/template-library-root";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateMeta = {
  description: string;
  thumbnail: string;
  previews: string[];
  tutorial: string;
};

export type TemplateMetaPatch = Partial<TemplateMeta>;

const EMPTY_META: TemplateMeta = {
  description: "",
  thumbnail: "",
  previews: [],
  tutorial: "",
};

const META_DIR_NAME = "meta";
const META_JSON_FILE = "template-meta.json";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function resolveTemplateDir(templateId: string): string {
  return path.join(templateLibraryRoot, normalizeTemplateId(templateId));
}

export function resolveTemplateMetaDir(templateId: string): string {
  return path.join(resolveTemplateDir(templateId), META_DIR_NAME);
}

export function resolveTemplateMetaJson(templateId: string): string {
  return path.join(resolveTemplateMetaDir(templateId), META_JSON_FILE);
}

/** Build the URL path that the meta/asset route serves for a given filename. */
export function buildMetaAssetUrl(templateId: string, filename: string): string {
  const normalized = normalizeTemplateId(templateId);
  const safe = path.basename(filename);
  return `/api/templates/${normalized}/meta/asset?file=${encodeURIComponent(safe)}`;
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

export function readTemplateMeta(templateId: string): TemplateMeta {
  const jsonPath = resolveTemplateMetaJson(templateId);
  if (!existsSync(jsonPath)) return { ...EMPTY_META };

  try {
    const raw = readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<TemplateMeta>;
    return {
      description: typeof parsed.description === "string" ? parsed.description : "",
      thumbnail: typeof parsed.thumbnail === "string" ? parsed.thumbnail : "",
      previews: Array.isArray(parsed.previews) ? parsed.previews.filter((p) => typeof p === "string") : [],
      tutorial: typeof parsed.tutorial === "string" ? parsed.tutorial : "",
    };
  } catch {
    return { ...EMPTY_META };
  }
}

export function writeTemplateMeta(
  templateId: string,
  patch: TemplateMetaPatch,
):
  | { ok: true; meta: TemplateMeta }
  | { ok: false; error: string; status: number } {
  try {
    const metaDir = resolveTemplateMetaDir(templateId);
    if (!existsSync(metaDir)) {
      mkdirSync(metaDir, { recursive: true });
    }

    const current = readTemplateMeta(templateId);
    const updated: TemplateMeta = {
      ...current,
      ...(typeof patch.description === "string" ? { description: patch.description } : {}),
      ...(typeof patch.tutorial === "string" ? { tutorial: patch.tutorial } : {}),
      ...(typeof patch.thumbnail === "string" ? { thumbnail: patch.thumbnail } : {}),
      ...(Array.isArray(patch.previews) ? { previews: patch.previews } : {}),
    };

    writeFileSync(
      resolveTemplateMetaJson(templateId),
      `${JSON.stringify(updated, null, 2)}\n`,
      "utf8",
    );
    return { ok: true, meta: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to write meta.";
    return { ok: false, error: message, status: 500 };
  }
}

// ---------------------------------------------------------------------------
// Asset persistence
// ---------------------------------------------------------------------------

const ALLOWED_ASSET_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm",
]);

const MAX_META_ASSET_BYTES = 20 * 1024 * 1024; // 20 MB

export function saveTemplateMetaAsset(
  templateId: string,
  buffer: Buffer,
  originalName: string,
  assetType: "thumbnail" | "preview",
):
  | { ok: true; filename: string; url: string }
  | { ok: false; error: string; status: number } {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_ASSET_EXTS.has(ext)) {
    return {
      ok: false,
      error: `Unsupported file type "${ext}". Allowed: png, jpg, webp, gif, mp4, webm.`,
      status: 400,
    };
  }

  if (buffer.length > MAX_META_ASSET_BYTES) {
    return {
      ok: false,
      error: "File exceeds 20 MB limit.",
      status: 400,
    };
  }

  try {
    const metaDir = resolveTemplateMetaDir(templateId);
    if (!existsSync(metaDir)) {
      mkdirSync(metaDir, { recursive: true });
    }

    let filename: string;
    if (assetType === "thumbnail") {
      // Always use a fixed base name so we overwrite on replace.
      // The upload route always sends JPEG from the canvas crop, but we
      // handle other formats gracefully and delete any stale thumbnail.*
      // files left from a previous upload with a different extension.
      filename = `thumbnail${ext}`;
      // Remove any existing thumbnail files with different extensions so we
      // never accumulate orphaned thumbnails (e.g. thumbnail.png when the
      // new one is thumbnail.jpg).
      for (const candidate of ALLOWED_ASSET_EXTS) {
        if (candidate === ext) continue;
        const stale = path.join(metaDir, `thumbnail${candidate}`);
        if (existsSync(stale)) {
          try {
            unlinkSync(stale);
          } catch {
            // best-effort cleanup
          }
        }
      }
    } else {
      // Timestamped preview filenames to avoid collisions
      filename = `preview-${Date.now()}${ext}`;
    }

    const destPath = path.join(metaDir, filename);

    // Verify the dest is inside metaDir (path traversal guard)
    const resolved = path.resolve(destPath);
    const resolvedMeta = path.resolve(metaDir);
    if (!resolved.startsWith(resolvedMeta + path.sep)) {
      return { ok: false, error: "Invalid file path.", status: 400 };
    }

    writeFileSync(destPath, buffer);

    const url = buildMetaAssetUrl(templateId, filename);
    return { ok: true, filename, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save asset.";
    return { ok: false, error: message, status: 500 };
  }
}

export function resolveTemplateMetaAssetPath(
  templateId: string,
  filename: string,
):
  | { ok: true; absolutePath: string; ext: string }
  | { ok: false; error: string; status: number } {
  const safe = path.basename(filename);
  if (!safe || safe !== filename) {
    return { ok: false, error: "Invalid filename.", status: 400 };
  }

  const ext = path.extname(safe).toLowerCase();
  if (!ALLOWED_ASSET_EXTS.has(ext)) {
    return { ok: false, error: "Unsupported file type.", status: 400 };
  }

  const absolutePath = path.join(resolveTemplateMetaDir(templateId), safe);
  const resolved = path.resolve(absolutePath);
  const resolvedMeta = path.resolve(resolveTemplateMetaDir(templateId));

  if (!resolved.startsWith(resolvedMeta + path.sep)) {
    return { ok: false, error: "Invalid path.", status: 400 };
  }

  if (!existsSync(absolutePath)) {
    return { ok: false, error: "Asset not found.", status: 404 };
  }

  return { ok: true, absolutePath, ext };
}
