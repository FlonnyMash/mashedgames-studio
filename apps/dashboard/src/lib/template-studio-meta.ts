import { normalizeTemplateId, isLegacyTemplateId } from "@mashedgames/shared";
import type { TemplateManifestStatus } from "@/lib/template-overview-types";
import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { templateLibraryRoot } from "@/lib/project-paths";
import { engineTemplatesRoot } from "@/lib/template-library-root";

export type TemplateStudioMeta = {
  id: string;
  version: string;
  status: TemplateManifestStatus;
};

export type TemplateManifestPatch = Partial<TemplateStudioMeta>;

type TemplateDetailsData = {
  templateId: string;
  directoryPath: string;
  repositoryPath: string;
  manifest: TemplateStudioMeta;
  createdAt: string;
  updatedAt: string;
  manifestUpdatedAt: string;
};

// ---------------------------------------------------------------------------
// Manifest.ts source parsers — lightweight regex extraction, no TS compilation
// ---------------------------------------------------------------------------

function parseManifestField(
  source: string,
  field: "displayName" | "version",
): string | null {
  const match = new RegExp(`${field}:\\s*["']([^"']+)["']`).exec(source);
  return match?.[1] ?? null;
}

function readManifestTs(templateId: string): string | null {
  const manifestPath = path.join(
    engineTemplatesRoot,
    normalizeTemplateId(templateId),
    "manifest.ts",
  );
  if (!existsSync(manifestPath)) return null;
  try {
    return readFileSync(manifestPath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Read the config.json written by createGameTemplate as a fallback when
 * the template directory exists but manifest.ts is not yet present.
 */
function readConfigJsonDisplayName(templateId: string): string | null {
  const configPath = path.join(
    templateLibraryRoot,
    normalizeTemplateId(templateId),
    "config.json",
  );
  if (!existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<
      string,
      unknown
    >;
    return typeof raw.displayName === "string" ? raw.displayName : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function readTemplateStudioMeta(templateId: string): TemplateStudioMeta {
  const resolvedTemplateId = normalizeTemplateId(templateId);
  if (isLegacyTemplateId(templateId)) {
    console.warn(
      `[template-studio-meta] Migrating legacy template "${templateId}" -> "${resolvedTemplateId}"`,
    );
  }
  const source = readManifestTs(templateId);
  const version =
    (source ? parseManifestField(source, "version") : null) ?? "1.0.0";
  return { id: resolvedTemplateId, version, status: "published" };
}

export function getTemplateDetails(templateId: string):
  | { ok: true; data: TemplateDetailsData }
  | { ok: false; error: string; status: number } {
  const resolvedTemplateId = normalizeTemplateId(templateId);
  const libraryPath = path.join(templateLibraryRoot, resolvedTemplateId);
  const sourcePath = path.join(engineTemplatesRoot, resolvedTemplateId);
  if (!existsSync(libraryPath)) {
    if (!existsSync(sourcePath)) {
      return {
        ok: false,
        error: `Template "${resolvedTemplateId}" not found.`,
        status: 404,
      };
    }
  }
  const directoryPath = existsSync(libraryPath) ? libraryPath : sourcePath;

  const now = new Date().toISOString();
  const manifest = readTemplateStudioMeta(resolvedTemplateId);

  return {
    ok: true,
    data: {
      templateId: resolvedTemplateId,
      directoryPath,
      repositoryPath: directoryPath,
      manifest,
      createdAt: now,
      updatedAt: now,
      manifestUpdatedAt: now,
    },
  };
}

export function resolveTemplateLocation(templateId: string): string {
  return path.join(templateLibraryRoot, normalizeTemplateId(templateId));
}

/**
 * Enumerate templates by scanning packages/templates/src/ (engineTemplatesRoot).
 * Each subdirectory with a manifest.ts is treated as a template entry.
 * Falls back to config.json metadata when manifest.ts is absent.
 */
export function listTemplateOverviewFromDisk(): Array<{
  id: string;
  displayName: string;
  status: TemplateManifestStatus;
}> {
  const root = engineTemplatesRoot;
  if (!existsSync(root)) return [];

  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }

  const results: Array<{
    id: string;
    displayName: string;
    status: TemplateManifestStatus;
  }> = [];

  for (const templateId of names) {
    const entryPath = path.join(root, templateId);
    if (!statSync(entryPath).isDirectory()) continue;

    const manifestTs = readManifestTs(templateId);
    if (!manifestTs) {
      // Only include this directory if a config.json fallback exists
      const fallbackName = readConfigJsonDisplayName(templateId);
      if (fallbackName === null) continue;
      results.push({ id: templateId, displayName: fallbackName, status: "draft" });
      continue;
    }

    const displayName =
      parseManifestField(manifestTs, "displayName") ??
      templateId.replace(/-/g, " ");

    results.push({ id: templateId, displayName, status: "published" });
  }

  return results;
}

export async function publishTemplate(
  _templateId: string,
): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}

export function patchTemplateManifest(
  templateId: string,
  patch: TemplateManifestPatch,
):
  | { ok: true; manifest: TemplateStudioMeta }
  | { ok: false; error: string; status: number } {
  const resolvedTemplateId = normalizeTemplateId(templateId);
  const current = readTemplateStudioMeta(resolvedTemplateId);
  return {
    ok: true,
    manifest: { ...current, ...patch, id: resolvedTemplateId },
  };
}

export function openTemplateDirectory(templateId: string):
  | { ok: true; data: { directoryPath: string } }
  | { ok: false; error: string; status: number } {
  const details = getTemplateDetails(templateId);
  if (!details.ok) {
    return details;
  }
  return {
    ok: true,
    data: { directoryPath: details.data.directoryPath },
  };
}

export function saveTemplatePreviewPng(
  _templateId: string,
  _buffer: Buffer,
):
  | { ok: true; previewUrl: string }
  | { ok: false; error: string; status: number } {
  return {
    ok: false,
    error: "Preview capture is unavailable after architectural reset.",
    status: 501,
  };
}
