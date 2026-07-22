import type { GameConfig } from "./flat-game-config";
import { DEFAULT_SCHEMA_VERSION } from "./flat-game-config";
import type { ClientProjectPayload, GameProjectManifest } from "./game-project";
import { exportClientPayload } from "./flat-game-config";

export function slugifyProjectId(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (!slug) {
    return "project";
  }
  if (/^[a-z]/.test(slug)) {
    return slug;
  }
  return `project-${slug}`;
}

export function enrichClientMeta(
  config: GameConfig,
  project: Pick<GameProjectManifest, "projectId" | "parentTemplateId" | "gameId"> & {
    parentPinnedVersion?: string;
  },
): GameConfig {
  return {
    ...config,
    activeTemplateId: project.parentTemplateId,
    projectId: project.projectId,
    gameId: project.gameId ?? config.gameId,
    parentTemplateId: project.parentTemplateId,
    parentPinnedVersion:
      project.parentPinnedVersion ?? config.parentPinnedVersion,
    lastParentSyncAt: config.lastParentSyncAt,
  };
}

export function buildInitialClientPayload(
  project: Pick<GameProjectManifest, "projectId" | "parentTemplateId" | "gameId">,
  config: GameConfig,
  parentPinnedVersion: string,
): ClientProjectPayload {
  const payload = exportClientPayload(config);
  return enrichClientMeta(
    {
      ...payload,
      lastParentSyncAt: new Date().toISOString(),
      parentPinnedVersion,
    },
    project,
  );
}

export function buildProjectConfigFromClient(
  client: ClientProjectPayload,
  parentTemplateId: string,
): GameConfig {
  return {
    ...client,
    activeTemplateId: parentTemplateId,
    schemaVersion: client.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  };
}

export function defaultProjectManifestFields(
  parentTemplateId: string,
  parentVersion: string,
  parentSchemaVersion: string = DEFAULT_SCHEMA_VERSION,
): Pick<
  GameProjectManifest,
  "parentTemplateId" | "parentVersion" | "parentSchemaVersion" | "lastParentAckAt"
> {
  const now = new Date().toISOString();
  return {
    parentTemplateId,
    parentVersion,
    parentSchemaVersion,
    lastParentAckAt: now,
  };
}
