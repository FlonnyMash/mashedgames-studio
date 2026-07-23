import type { ProjectOwnerContext } from "@/lib/project-owner-context";
import {
  migrateClientBrandingAssets,
  persistBufferToProjectAssets,
  persistClientLogoToProjectAssets,
  setFlatConfigField,
} from "@/lib/project-assets";
import { isWorkspaceDesktop } from "@/lib/runtime-env";
import {
  BASELINE_TEMPLATE_ID,
  buildInitialClientPayload,
  buildProjectConfigFromClient,
  ClientProjectPayloadSchema,
  DEFAULT_GAME_CONFIG,
  GameProjectManifestSchema,
  isLegacyProjectManifest,
  isUniversalTextureField,
  ParentLockSnapshotSchema,
  PROJECT_ID_PATTERN,
  SaveModeSchema,
  signProjectPayload,
  slugifyProjectId,
  normalizeTemplateId,
  isLegacyTemplateId,
  UnauthorizedProjectAccessError,
  assertProjectOwnership,
  patchTemplateField,
  type ClientProjectPayload,
  type GameConfig,
  type GameProjectManifest,
  type GameTemplateId,
  type ParentLockSnapshot,
  type SaveMode,
  textureKeyForConfigField,
} from "@mashedgames/shared";
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
import { readTemplateFields, readTemplateSupportsUI } from "@/lib/template-fields";

export type ProjectIoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function projectIoFailure(error: unknown, fallback: string): ProjectIoResult<never> {
  if (error instanceof UnauthorizedProjectAccessError) {
    return { ok: false, error: error.message, status: 403 };
  }
  const message = error instanceof Error ? error.message : fallback;
  return { ok: false, error: message, status: 500 };
}

async function stampManifestOwnership(
  manifest: GameProjectManifest,
  client: ClientProjectPayload,
  ownerId: string,
): Promise<GameProjectManifest> {
  const signature = await signProjectPayload(client, ownerId);
  return { ...manifest, ownerId, signature };
}

async function tryPersistClaimedManifest(
  manifestPath: string,
  manifest: GameProjectManifest,
  projectId: string,
): Promise<void> {
  try {
    await writeJson(manifestPath, manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[project-io] Auto-claim persist failed for project "${projectId}": ${message}`,
    );
  }
}

async function resolveProjectOwnership(
  manifest: GameProjectManifest,
  client: ClientProjectPayload,
  manifestPath: string,
  ownerContext?: ProjectOwnerContext | null,
): Promise<GameProjectManifest> {
  if (isLegacyProjectManifest(manifest)) {
    if (ownerContext?.role === "studio_admin") {
      return manifest;
    }
    if (ownerContext?.ownerId && ownerContext.role === "b2b_user") {
      const claimed = await stampManifestOwnership(
        manifest,
        client,
        ownerContext.ownerId,
      );
      await tryPersistClaimedManifest(manifestPath, claimed, manifest.projectId);
      return claimed;
    }
    return manifest;
  }

  if (!manifest.ownerId || !manifest.signature) {
    throw new UnauthorizedProjectAccessError(
      "Project is missing ownership credentials.",
    );
  }

  if (!ownerContext?.ownerId) {
    throw new UnauthorizedProjectAccessError("Authentication required.");
  }

  await assertProjectOwnership(manifest, client, ownerContext.ownerId);
  return manifest;
}

function assertSaveOwnership(
  manifest: GameProjectManifest,
  ownerContext?: ProjectOwnerContext | null,
): void {
  if (isLegacyProjectManifest(manifest)) {
    if (ownerContext?.role === "b2b_user" && !ownerContext.ownerId) {
      throw new UnauthorizedProjectAccessError("Authentication required.");
    }
    return;
  }

  if (!ownerContext?.ownerId) {
    throw new UnauthorizedProjectAccessError("Authentication required.");
  }

  if (manifest.ownerId !== ownerContext.ownerId) {
    throw new UnauthorizedProjectAccessError(
      "Project belongs to a different user.",
    );
  }
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

export async function getProjectDetails(
  projectId: string,
  ownerContext?: ProjectOwnerContext | null,
): Promise<
  ProjectIoResult<{
    manifest: GameProjectManifest;
    repositoryPath: string;
    directoryPath: string;
    updatedAt: string;
  }>
> {
  const location = getProjectLocation(projectId);
  if (!location.ok) {
    return { ok: false, error: location.error, status: location.status };
  }

  const loaded = await loadProject(projectId, ownerContext);
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
  ownerContext?: ProjectOwnerContext | null,
): Promise<ProjectIoResult<{ manifest: GameProjectManifest }>> {
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

    const clientRaw = JSON.parse(
      await readFile(path.join(projectDir, PROJECT_FILES.client), "utf8"),
    );
    const clientParsed = ClientProjectPayloadSchema.safeParse(clientRaw);
    if (!clientParsed.success) {
      return { ok: false, error: "Invalid client.json.", status: 500 };
    }

    let manifest = {
      ...manifestParsed.data,
      displayName: trimmed,
    };

    assertSaveOwnership(manifest, ownerContext);

    if (!isLegacyProjectManifest(manifest) && ownerContext?.ownerId) {
      manifest = await stampManifestOwnership(
        manifest,
        clientParsed.data,
        ownerContext.ownerId,
      );
    }

    await writeJson(manifestPath, manifest);
    return { ok: true, data: { manifest } };
  } catch (error) {
    return projectIoFailure(error, "Failed to update project.");
  }
}

/**
 * Persist a resolved Supabase `public.games.id` onto an existing workspace
 * project. Writes `gameId` into both `project.json` (manifest) and `client.json`
 * (flat config) so a subsequent export/deploy embeds the id and captured leads
 * attribute correctly.
 *
 * Idempotent: a no-op (no disk write) when the manifest already carries the same
 * id. All reads/writes stay inside `resolveProjectDir`, which is workspace-guarded.
 */
export async function persistProjectGameId(
  projectId: string,
  gameId: string,
  ownerContext?: ProjectOwnerContext | null,
): Promise<ProjectIoResult<{ manifest: GameProjectManifest }>> {
  if (!gameId.trim()) {
    return { ok: false, error: "gameId is required.", status: 400 };
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

    const clientPath = path.join(projectDir, PROJECT_FILES.client);
    const clientRaw = JSON.parse(await readFile(clientPath, "utf8"));
    const clientParsed = ClientProjectPayloadSchema.safeParse(clientRaw);
    if (!clientParsed.success) {
      return { ok: false, error: "Invalid client.json.", status: 500 };
    }

    assertSaveOwnership(manifestParsed.data, ownerContext);

    // Idempotent: nothing to do when the durable link is already in place.
    if (manifestParsed.data.gameId === gameId) {
      return { ok: true, data: { manifest: manifestParsed.data } };
    }

    const client: ClientProjectPayload = { ...clientParsed.data, gameId };
    let manifest: GameProjectManifest = { ...manifestParsed.data, gameId };

    if (!isLegacyProjectManifest(manifest) && ownerContext?.ownerId) {
      // Re-sign over the mutated client payload so the signature stays valid.
      manifest = await stampManifestOwnership(
        manifest,
        client,
        ownerContext.ownerId,
      );
    }

    await writeJson(clientPath, client);
    await writeJson(manifestPath, manifest);

    return { ok: true, data: { manifest } };
  } catch (error) {
    return projectIoFailure(error, "Failed to persist gameId.");
  }
}

export async function createProject(input: {
  displayName: string;
  parentTemplateId: GameTemplateId;
  projectId?: string;
  clientName?: string;
  clientLogo?: { buffer: Buffer; fileName: string };
  ownerId: string;
  /** Supabase `public.games.id` to persist so captured leads attribute correctly. */
  gameId?: string;
}): Promise<
  ProjectIoResult<{
    manifest: GameProjectManifest;
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
  let runtimeAssets: Record<string, string> | undefined;

  let client = buildInitialClientPayload(
    { projectId, parentTemplateId, gameId: input.gameId },
    parentConfig,
    manifest.version,
  );

  const trimmedClientName = input.clientName?.trim();
  if (trimmedClientName) {
    client = { ...client, clientName: trimmedClientName };
  }

  const projectDir = resolveProjectDir(projectId);
  await mkdir(path.join(projectDir, PROJECT_FILES.assetsDir), { recursive: true });

  if (input.clientLogo) {
    const { relativePath, absolutePath } = await persistClientLogoToProjectAssets(
      projectId,
      input.clientLogo.buffer,
      input.clientLogo.fileName,
    );
    client = { ...client, clientLogoPath: relativePath };
    runtimeAssets = { [relativePath]: absolutePath };
  }

  let projectManifest: GameProjectManifest = {
    projectId,
    displayName: input.displayName.trim(),
    parentTemplateId,
    parentVersion: manifest.version,
    parentSchemaVersion: parentConfig.schemaVersion,
    lastParentAckAt: now,
    createdAt: now,
    mode: "configurator" as SaveMode,
    ...(input.gameId ? { gameId: input.gameId } : {}),
    ...(runtimeAssets ? { runtimeAssets } : {}),
  };

  projectManifest = await stampManifestOwnership(
    projectManifest,
    client,
    input.ownerId,
  );

  await writeJson(path.join(projectDir, PROJECT_FILES.manifest), projectManifest);
  await writeJson(path.join(projectDir, PROJECT_FILES.client), client);
  await writeJson(
    path.join(projectDir, PROJECT_FILES.parentLock),
    buildParentLockSnapshot(parentTemplateId, parentConfig, manifest.version),
  );

  return { ok: true, data: { manifest: projectManifest, client } };
}

export async function loadProject(
  projectId: string,
  ownerContext?: ProjectOwnerContext | null,
): Promise<
  ProjectIoResult<{
    manifest: GameProjectManifest;
    client: ClientProjectPayload;
    config: GameConfig;
    parentLock: ParentLockSnapshot | null;
    runtimeAssets: Record<string, string>;
    templateFields: ReturnType<typeof readTemplateFields>;
    supportsUI: ReturnType<typeof readTemplateSupportsUI>;
  }>
> {
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
    const manifest = manifestParsed.data;
    const resolvedParentTemplateId = normalizeTemplateId(
      manifest.parentTemplateId,
    );
    if (resolvedParentTemplateId !== manifest.parentTemplateId) {
      console.warn(
        `[project-io] Project "${projectId}" uses legacy template "${manifest.parentTemplateId}", falling back to "${resolvedParentTemplateId}"`,
      );
    }
    let normalizedManifest: GameProjectManifest = {
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

    normalizedManifest = await resolveProjectOwnership(
      normalizedManifest,
      client,
      manifestPath,
      ownerContext,
    );

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
        runtimeAssets: normalizedManifest.runtimeAssets ?? {},
        templateFields: readTemplateFields(normalizedManifest.parentTemplateId),
        supportsUI: readTemplateSupportsUI(normalizedManifest.parentTemplateId),
      },
    };
  } catch (error) {
    return projectIoFailure(error, "Failed to load project.");
  }
}

export async function importProjectAsset(
  projectId: string,
  targetPath: string,
  input: { fileName: string; buffer: Buffer },
  ownerContext?: ProjectOwnerContext | null,
): Promise<
  ProjectIoResult<{
    relativePath: string;
    absolutePath: string;
    textureKey: string | null;
    client: ClientProjectPayload;
    manifest: GameProjectManifest;
  }>
> {
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

    const clientRaw = JSON.parse(
      await readFile(path.join(projectDir, PROJECT_FILES.client), "utf8"),
    );
    const clientParsed = ClientProjectPayloadSchema.safeParse(clientRaw);
    if (!clientParsed.success) {
      return { ok: false, error: "Invalid client.json.", status: 500 };
    }

    assertSaveOwnership(manifestParsed.data, ownerContext);

    const { relativePath, absolutePath } = await persistBufferToProjectAssets(
      projectId,
      input.buffer,
      input.fileName,
    );

    const templateFields = readTemplateFields(
      normalizeTemplateId(manifestParsed.data.parentTemplateId),
    );
    const client = isUniversalTextureField(targetPath)
      ? setFlatConfigField(
          clientParsed.data,
          targetPath as keyof GameConfig,
          relativePath,
        )
      : patchTemplateField(clientParsed.data, targetPath, relativePath);

    const runtimeAssets = {
      ...(manifestParsed.data.runtimeAssets ?? {}),
      [relativePath]: absolutePath,
    };

    let manifest: GameProjectManifest = {
      ...manifestParsed.data,
      runtimeAssets,
    };

    if (ownerContext?.ownerId) {
      manifest = await stampManifestOwnership(manifest, client, ownerContext.ownerId);
    }

    await writeJson(path.join(projectDir, PROJECT_FILES.client), client);
    await writeJson(manifestPath, manifest);

    return {
      ok: true,
      data: {
        relativePath,
        absolutePath,
        textureKey: textureKeyForConfigField(targetPath, templateFields),
        client,
        manifest,
      },
    };
  } catch (error) {
    return projectIoFailure(error, "Failed to import asset.");
  }
}

export async function saveProjectClient(
  projectId: string,
  client: ClientProjectPayload,
  ownerContext?: ProjectOwnerContext | null,
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

    const manifestPath = path.join(projectDir, PROJECT_FILES.manifest);
    const manifestRaw = JSON.parse(await readFile(manifestPath, "utf8"));
    const manifestParsed = GameProjectManifestSchema.safeParse(manifestRaw);
    if (!manifestParsed.success) {
      return { ok: false, error: "Invalid project.json.", status: 500 };
    }

    assertSaveOwnership(manifestParsed.data, ownerContext);

    let clientToSave = parsed.data;
    let manifestUpdate: GameProjectManifest = { ...manifestParsed.data };

    if (isWorkspaceDesktop()) {
      const migrated = await migrateClientBrandingAssets(
        projectId,
        parsed.data,
        manifestParsed.data.runtimeAssets ?? {},
      );

      clientToSave = migrated.branding;
      manifestUpdate = {
        ...manifestUpdate,
        runtimeAssets: migrated.runtimeAssets,
      };
    }

    if (ownerContext?.ownerId) {
      manifestUpdate = await stampManifestOwnership(
        manifestUpdate,
        clientToSave,
        ownerContext.ownerId,
      );
    } else if (isLegacyProjectManifest(manifestUpdate)) {
      // Legacy unsigned project saved without auth — allowed for local dev.
    } else {
      throw new UnauthorizedProjectAccessError("Authentication required.");
    }

    await writeJson(path.join(projectDir, PROJECT_FILES.client), clientToSave);
    await writeJson(manifestPath, manifestUpdate);

    return { ok: true, data: { projectId } };
  } catch (error) {
    return projectIoFailure(error, "Failed to save project.");
  }
}

export async function ackParentLock(
  projectId: string,
  ownerContext?: ProjectOwnerContext | null,
): Promise<
  ProjectIoResult<{
    manifest: GameProjectManifest;
    parentLock: ParentLockSnapshot;
  }>
> {
  try {
    ensureWorkspaceExists();
    const loaded = await loadProject(projectId, ownerContext);
    if (!loaded.ok) {
      return loaded;
    }

    const { manifest, client } = loaded.data;
    const { manifest: parentManifest, config: liveParent } = buildLiveParentConfig(
      manifest.parentTemplateId,
    );
    const now = new Date().toISOString();
    let updatedManifest: GameProjectManifest = {
      ...manifest,
      parentVersion: parentManifest.version,
      parentSchemaVersion: liveParent.schemaVersion,
      lastParentAckAt: now,
    };

    assertSaveOwnership(updatedManifest, ownerContext);

    if (ownerContext?.ownerId) {
      updatedManifest = await stampManifestOwnership(
        updatedManifest,
        client,
        ownerContext.ownerId,
      );
    }

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
    return projectIoFailure(error, "Failed to acknowledge parent.");
  }
}

export { DEFAULT_GAME_CONFIG };
