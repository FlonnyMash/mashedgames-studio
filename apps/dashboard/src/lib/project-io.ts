import {
  BASELINE_TEMPLATE_ID,
  buildInitialClientPayload,
  buildProjectConfigFromClient,
  ClientProjectPayloadSchema,
  DEFAULT_GAME_CONFIG,
  GameProjectManifestSchema,
  ParentLockSnapshotSchema,
  PROJECT_ID_PATTERN,
  SaveModeSchema,
  slugifyProjectId,
  normalizeTemplateId,
  isLegacyTemplateId,
  type ClientProjectPayload,
  type GameConfig,
  type GameTemplateId,
  type ParentLockSnapshot,
  type SaveMode,
  textureKeyForConfigField,
} from "@mashedgames/shared";
import {
  migrateClientBrandingAssets,
  persistBufferToProjectAssets,
  setFlatConfigField,
} from "@/lib/project-assets";
import { isWorkspaceDesktop } from "@/lib/runtime-env";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { getProjectLocation } from "@/lib/project-location";
import {
  ensureWorkspaceExists,
  getProjectsRoot,
  PROJECT_FILES,
  resolveProjectDir,
} from "@/lib/project-paths";
import {
  buildLiveParentConfig,
  isParentTemplateInLibrary,
  readParentManifest,
} from "@/lib/project-parent-config";

export type ProjectIoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function buildParentLockSnapshot(
  parentTemplateId: GameTemplateId,
  config: GameConfig,
  manifestVersion: string,
): ParentLockSnapshot {
  return {
    lockedAt: new Date().toISOString(),
    parentTemplateId,
    parentVersion: manifestVersion,
    parentSchemaVersion: config.schemaVersion,
    config: structuredClone(config),
  };
}

export async function listProjectIds(
  filters?: { mode?: SaveMode; templateId?: string },
): Promise<string[]> {
  ensureWorkspaceExists();
  const projectsRoot = getProjectsRoot();
  if (!existsSync(projectsRoot)) {
    return [];
  }
  const normalizedFilterTemplateId =
    filters?.templateId !== undefined
      ? normalizeTemplateId(filters.templateId)
      : undefined;
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !PROJECT_ID_PATTERN.test(entry.name)) {
      continue;
    }
    const manifestPath = path.join(
      projectsRoot,
      entry.name,
      PROJECT_FILES.manifest,
    );
    if (!existsSync(manifestPath)) {
      continue;
    }
    if (filters?.mode !== undefined || filters?.templateId !== undefined) {
      try {
        const raw = JSON.parse(await readFile(manifestPath, "utf8"));
        const parsed = GameProjectManifestSchema.safeParse(raw);
        if (!parsed.success) {
          continue;
        }
        if (filters.mode !== undefined && parsed.data.mode !== filters.mode) {
          continue;
        }
        const normalizedParentTemplateId = normalizeTemplateId(
          parsed.data.parentTemplateId,
        );
        if (
          normalizedFilterTemplateId !== undefined &&
          normalizedParentTemplateId !== normalizedFilterTemplateId
        ) {
          continue;
        }
      } catch {
        continue;
      }
    }
    ids.push(entry.name);
  }
  return ids.sort();
}

export async function getProjectDetails(projectId: string): Promise<
  ProjectIoResult<{
    manifest: import("@mashedgames/shared").GameProjectManifest;
    repositoryPath: string;
    directoryPath: string;
    updatedAt: string;
  }>
> {
  const location = getProjectLocation(projectId);
  if (!location.ok) {
    return { ok: false, error: location.error, status: location.status };
  }

  const loaded = await loadProject(projectId);
  if (!loaded.ok) {
    return loaded;
  }

  const manifestPath = path.join(location.data.directoryPath, PROJECT_FILES.manifest);
  let updatedAt = loaded.data.manifest.createdAt;
  try {
    updatedAt = statSync(manifestPath).mtime.toISOString();
  } catch {
    /* keep createdAt */
  }

  return {
    ok: true,
    data: {
      manifest: loaded.data.manifest,
      repositoryPath: location.data.repositoryPath,
      directoryPath: location.data.directoryPath,
      updatedAt,
    },
  };
}

export async function patchProjectDisplayName(
  projectId: string,
  displayName: string,
): Promise<ProjectIoResult<{ manifest: import("@mashedgames/shared").GameProjectManifest }>> {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return { ok: false, error: "Display name is required.", status: 400 };
  }

  try {
    ensureWorkspaceExists();
    const projectDir = resolveProjectDir(projectId);
    if (!existsSync(projectDir)) {
      return { ok: false, error: `Project "${projectId}" not found.`, status: 404 };
    }

    const manifestPath = path.join(projectDir, PROJECT_FILES.manifest);
    const manifestRaw = JSON.parse(await readFile(manifestPath, "utf8"));
    const manifestParsed = GameProjectManifestSchema.safeParse(manifestRaw);
    if (!manifestParsed.success) {
      return { ok: false, error: "Invalid project.json.", status: 500 };
    }

    const manifest = {
      ...manifestParsed.data,
      displayName: trimmed,
    };

    await writeJson(manifestPath, manifest);
    return { ok: true, data: { manifest } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update project.";
    return { ok: false, error: message, status: 500 };
  }
}

export async function createProject(input: {
  displayName: string;
  parentTemplateId: GameTemplateId;
  projectId?: string;
}): Promise<
  ProjectIoResult<{
    manifest: import("@mashedgames/shared").GameProjectManifest;
    client: ClientProjectPayload;
  }>
> {
  ensureWorkspaceExists();
  const parentTemplateId = normalizeTemplateId(input.parentTemplateId);
  if (isLegacyTemplateId(input.parentTemplateId)) {
    console.warn(
      `[project-io] Migrating legacy template "${input.parentTemplateId}" -> "${BASELINE_TEMPLATE_ID}" for project creation`,
    );
  }
  if (!isParentTemplateInLibrary(parentTemplateId)) {
    return {
      ok: false,
      error: `Parent template "${parentTemplateId}" is not available.`,
      status: 404,
    };
  }

  let manifest;
  try {
    manifest = readParentManifest(parentTemplateId);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid parent template.",
      status: 400,
    };
  }

  if (manifest.status !== "published") {
    return {
      ok: false,
      error: `Template "${parentTemplateId}" has not been published yet.`,
      status: 400,
    };
  }

  let baseProjectId = input.projectId ?? slugifyProjectId(input.displayName);
  if (!PROJECT_ID_PATTERN.test(baseProjectId)) {
    return { ok: false, error: "Invalid project ID.", status: 400 };
  }

  let projectId = baseProjectId;
  let suffix = 1;
  while (existsSync(resolveProjectDir(projectId))) {
    projectId = `${baseProjectId}-${suffix}`;
    suffix += 1;
  }

  let parentConfig: GameConfig;
  try {
    ({ config: parentConfig } = buildLiveParentConfig(parentTemplateId));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid parent template.",
      status: 400,
    };
  }

  const now = new Date().toISOString();
  const projectManifest = {
    projectId,
    displayName: input.displayName.trim(),
    parentTemplateId,
    parentVersion: manifest.version,
    parentSchemaVersion: parentConfig.schemaVersion,
    lastParentAckAt: now,
    createdAt: now,
    mode: "configurator" as SaveMode,
  };

  const client = buildInitialClientPayload(
    projectManifest,
    parentConfig,
    manifest.version,
  );

  const projectDir = resolveProjectDir(projectId);
  await mkdir(path.join(projectDir, PROJECT_FILES.assetsDir), { recursive: true });
  await writeJson(path.join(projectDir, PROJECT_FILES.manifest), projectManifest);
  await writeJson(path.join(projectDir, PROJECT_FILES.client), client);
  await writeJson(
    path.join(projectDir, PROJECT_FILES.parentLock),
    buildParentLockSnapshot(parentTemplateId, parentConfig, manifest.version),
  );

  return { ok: true, data: { manifest: projectManifest, client } };
}

export async function loadProject(projectId: string): Promise<
  ProjectIoResult<{
    manifest: import("@mashedgames/shared").GameProjectManifest;
    client: ClientProjectPayload;
    config: GameConfig;
    parentLock: ParentLockSnapshot | null;
    runtimeAssets: Record<string, string>;
  }>
> {
  try {
    ensureWorkspaceExists();
    const projectDir = resolveProjectDir(projectId);
    if (!existsSync(projectDir)) {
      return { ok: false, error: `Project "${projectId}" not found.`, status: 404 };
    }

    const manifestRaw = JSON.parse(
      await readFile(path.join(projectDir, PROJECT_FILES.manifest), "utf8"),
    );
    const manifestParsed = GameProjectManifestSchema.safeParse(manifestRaw);
    if (!manifestParsed.success) {
      return { ok: false, error: "Invalid project.json.", status: 500 };
    }
    const manifest = manifestParsed.data;
    const resolvedParentTemplateId = normalizeTemplateId(
      manifest.parentTemplateId,
    );
    if (resolvedParentTemplateId !== manifest.parentTemplateId) {
      console.warn(
        `[project-io] Project "${projectId}" uses legacy template "${manifest.parentTemplateId}", falling back to "${resolvedParentTemplateId}"`,
      );
    }
    const normalizedManifest = {
      ...manifest,
      parentTemplateId: resolvedParentTemplateId,
    };

    const clientRaw = JSON.parse(
      await readFile(path.join(projectDir, PROJECT_FILES.client), "utf8"),
    );
    const clientParsed = ClientProjectPayloadSchema.safeParse(clientRaw);
    if (!clientParsed.success) {
      return { ok: false, error: "Invalid client.json.", status: 500 };
    }
    const client = clientParsed.data;

    const config = buildProjectConfigFromClient(
      client,
      normalizedManifest.parentTemplateId,
    );

    const lockPath = path.join(projectDir, PROJECT_FILES.parentLock);
    let parentLock: ParentLockSnapshot | null = null;
    if (existsSync(lockPath)) {
      const lockRaw = JSON.parse(await readFile(lockPath, "utf8"));
      const lockParsed = ParentLockSnapshotSchema.safeParse(lockRaw);
      if (lockParsed.success) {
        parentLock = lockParsed.data;
      }
    }

    return {
      ok: true,
      data: {
        manifest: normalizedManifest,
        client,
        config,
        parentLock,
        runtimeAssets: manifest.runtimeAssets ?? {},
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load project.";
    return { ok: false, error: message, status: 500 };
  }
}

export async function importProjectAsset(
  projectId: string,
  targetPath: string,
  input: { fileName: string; buffer: Buffer },
): Promise<
  ProjectIoResult<{
    relativePath: string;
    absolutePath: string;
    textureKey: string | null;
    client: ClientProjectPayload;
    manifest: import("@mashedgames/shared").GameProjectManifest;
  }>
> {
  try {
    ensureWorkspaceExists();
    const projectDir = resolveProjectDir(projectId);
    if (!existsSync(projectDir)) {
      return { ok: false, error: `Project "${projectId}" not found.`, status: 404 };
    }

    const manifestRaw = JSON.parse(
      await readFile(path.join(projectDir, PROJECT_FILES.manifest), "utf8"),
    );
    const manifestParsed = GameProjectManifestSchema.safeParse(manifestRaw);
    if (!manifestParsed.success) {
      return { ok: false, error: "Invalid project.json.", status: 500 };
    }

    const clientRaw = JSON.parse(
      await readFile(path.join(projectDir, PROJECT_FILES.client), "utf8"),
    );
    const clientParsed = ClientProjectPayloadSchema.safeParse(clientRaw);
    if (!clientParsed.success) {
      return { ok: false, error: "Invalid client.json.", status: 500 };
    }

    const { relativePath, absolutePath } = await persistBufferToProjectAssets(
      projectId,
      input.buffer,
      input.fileName,
    );

    const fieldKey = targetPath as keyof GameConfig;
    const client = setFlatConfigField(clientParsed.data, fieldKey, relativePath);

    const runtimeAssets = {
      ...(manifestParsed.data.runtimeAssets ?? {}),
      [relativePath]: absolutePath,
    };

    const manifest = {
      ...manifestParsed.data,
      runtimeAssets,
    };

    await writeJson(path.join(projectDir, PROJECT_FILES.client), client);
    await writeJson(path.join(projectDir, PROJECT_FILES.manifest), manifest);

    return {
      ok: true,
      data: {
        relativePath,
        absolutePath,
        textureKey: textureKeyForConfigField(targetPath),
        client,
        manifest,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import asset.";
    return { ok: false, error: message, status: 500 };
  }
}

export async function saveProjectClient(
  projectId: string,
  client: ClientProjectPayload,
): Promise<ProjectIoResult<{ projectId: string }>> {
  try {
    ensureWorkspaceExists();
    const projectDir = resolveProjectDir(projectId);
    if (!existsSync(projectDir)) {
      return { ok: false, error: `Project "${projectId}" not found.`, status: 404 };
    }

    const parsed = ClientProjectPayloadSchema.safeParse(client);
    if (!parsed.success) {
      return { ok: false, error: "Invalid client payload.", status: 400 };
    }

    let clientToSave = parsed.data;
    let manifestUpdate: import("@mashedgames/shared").GameProjectManifest | null = null;

    if (isWorkspaceDesktop()) {
      const manifestRaw = JSON.parse(
        await readFile(path.join(projectDir, PROJECT_FILES.manifest), "utf8"),
      );
      const manifestParsed = GameProjectManifestSchema.safeParse(manifestRaw);
      if (!manifestParsed.success) {
        return { ok: false, error: "Invalid project.json.", status: 500 };
      }

      const migrated = await migrateClientBrandingAssets(
        projectId,
        parsed.data,
        manifestParsed.data.runtimeAssets ?? {},
      );

      clientToSave = migrated.branding;

      manifestUpdate = {
        ...manifestParsed.data,
        runtimeAssets: migrated.runtimeAssets,
      };
    }

    await writeJson(path.join(projectDir, PROJECT_FILES.client), clientToSave);
    if (manifestUpdate) {
      await writeJson(
        path.join(projectDir, PROJECT_FILES.manifest),
        manifestUpdate,
      );
    }

    return { ok: true, data: { projectId } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save project.";
    return { ok: false, error: message, status: 500 };
  }
}

export async function ackParentLock(projectId: string): Promise<
  ProjectIoResult<{
    manifest: import("@mashedgames/shared").GameProjectManifest;
    parentLock: ParentLockSnapshot;
  }>
> {
  try {
    ensureWorkspaceExists();
    const loaded = await loadProject(projectId);
    if (!loaded.ok) {
      return loaded;
    }

    const { manifest } = loaded.data;
    const { manifest: parentManifest, config: liveParent } = buildLiveParentConfig(
      manifest.parentTemplateId,
    );
    const now = new Date().toISOString();
    const updatedManifest = {
      ...manifest,
      parentVersion: parentManifest.version,
      parentSchemaVersion: liveParent.schemaVersion,
      lastParentAckAt: now,
    };

    const parentLock = buildParentLockSnapshot(
      manifest.parentTemplateId,
      liveParent,
      parentManifest.version,
    );

    const projectDir = resolveProjectDir(projectId);
    await writeJson(path.join(projectDir, PROJECT_FILES.manifest), updatedManifest);
    await writeJson(path.join(projectDir, PROJECT_FILES.parentLock), parentLock);

    return { ok: true, data: { manifest: updatedManifest, parentLock } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to acknowledge parent.";
    return { ok: false, error: message, status: 500 };
  }
}

export { DEFAULT_GAME_CONFIG };
