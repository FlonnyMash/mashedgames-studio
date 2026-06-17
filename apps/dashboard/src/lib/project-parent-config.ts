import {
  BASELINE_TEMPLATE_ID,
  DEFAULT_GAME_CONFIG,
  DEFAULT_SCHEMA_VERSION,
  isLegacyTemplateId,
  normalizeTemplateId,
  type GameConfig,
  type GameTemplateId,
} from "@mashedgames/shared";
import { existsSync } from "node:fs";
import path from "node:path";
import { templateLibraryRoot } from "@/lib/project-paths";
import { engineTemplatesRoot } from "@/lib/template-library-root";

export type ParentTemplateManifest = {
  id: GameTemplateId;
  version: string;
  status: "published" | "draft";
};

const DEFAULT_PARENT: ParentTemplateManifest = {
  id: DEFAULT_GAME_CONFIG.activeTemplateId,
  version: DEFAULT_SCHEMA_VERSION,
  status: "published",
};

function configPath(parentTemplateId: GameTemplateId): string {
  return path.join(
    templateLibraryRoot,
    normalizeTemplateId(parentTemplateId),
    "config.json",
  );
}

function sourceManifestPath(parentTemplateId: GameTemplateId): string {
  return path.join(
    engineTemplatesRoot,
    normalizeTemplateId(parentTemplateId),
    "manifest.ts",
  );
}

export function isParentTemplateInLibrary(
  parentTemplateId: GameTemplateId,
): boolean {
  if (isLegacyTemplateId(parentTemplateId)) {
    console.warn(
      `[project-parent-config] Migrating legacy template "${parentTemplateId}" -> "${BASELINE_TEMPLATE_ID}"`,
    );
  }
  const resolvedTemplateId = normalizeTemplateId(parentTemplateId);
  if (!resolvedTemplateId) {
    return false;
  }
  if (resolvedTemplateId === BASELINE_TEMPLATE_ID) {
    return true;
  }
  return (
    existsSync(configPath(resolvedTemplateId)) ||
    existsSync(sourceManifestPath(resolvedTemplateId))
  );
}

export function readParentManifest(
  parentTemplateId: GameTemplateId,
): ParentTemplateManifest {
  const resolvedTemplateId = normalizeTemplateId(parentTemplateId);
  if (isParentTemplateInLibrary(resolvedTemplateId)) {
    return {
      id: resolvedTemplateId,
      version: DEFAULT_SCHEMA_VERSION,
      status: "published",
    };
  }
  throw new Error(`Parent template "${resolvedTemplateId}" not found.`);
}

export function buildLiveParentConfig(
  parentTemplateId: GameTemplateId,
): { manifest: ParentTemplateManifest; config: GameConfig } {
  const resolvedTemplateId = normalizeTemplateId(parentTemplateId);
  const manifest = readParentManifest(resolvedTemplateId);
  return {
    manifest,
    config: {
      ...DEFAULT_GAME_CONFIG,
      activeTemplateId: resolvedTemplateId,
      schemaVersion: manifest.version,
    },
  };
}
