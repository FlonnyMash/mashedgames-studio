import type { GameConfig } from "@mashedgames/shared";
import { patchFlatConfig } from "@mashedgames/shared";
import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_FILES, resolveProjectDir } from "@/lib/project-paths";

const CLIENT_LOGO_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
]);

const MAX_CLIENT_LOGO_BYTES = 4 * 1024 * 1024;

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function copyDroppedFileToProjectAssets(
  projectId: string,
  fileName: string,
  sourceAbsolutePath: string,
): Promise<{ relativePath: string; absolutePath: string }> {
  const assetsDir = path.join(resolveProjectDir(projectId), PROJECT_FILES.assetsDir);
  await mkdir(assetsDir, { recursive: true });
  const safeName = sanitizeFileName(fileName);
  const hash = createHash("sha256")
    .update(sourceAbsolutePath)
    .digest("hex")
    .slice(0, 8);
  const destName = `${hash}-${safeName}`;
  const absolutePath = path.join(assetsDir, destName);
  await copyFile(sourceAbsolutePath, absolutePath);
  return {
    relativePath: `${PROJECT_FILES.assetsDir}/${destName}`.replace(/\\/g, "/"),
    absolutePath,
  };
}

export async function persistBufferToProjectAssets(
  projectId: string,
  buffer: Buffer,
  hintName: string,
): Promise<{ relativePath: string; absolutePath: string }> {
  const assetsDir = path.join(resolveProjectDir(projectId), PROJECT_FILES.assetsDir);
  await mkdir(assetsDir, { recursive: true });
  const safeName = sanitizeFileName(hintName);
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 8);
  const ext = path.extname(safeName) || ".png";
  const base = ext ? safeName.replace(/\.[^.]+$/, "") : safeName;
  const destName = `${hash}-${base}${ext.startsWith(".") ? ext : `.${ext}`}`;
  const absolutePath = path.join(assetsDir, destName);
  await writeFile(absolutePath, buffer);
  return {
    relativePath: `${PROJECT_FILES.assetsDir}/${destName}`.replace(/\\/g, "/"),
    absolutePath,
  };
}

export function resolveClientLogoExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext && CLIENT_LOGO_EXTENSIONS.has(ext)) {
    return ext;
  }
  return ".png";
}

export function assertClientLogoWithinSize(byteLength: number): void {
  if (byteLength > MAX_CLIENT_LOGO_BYTES) {
    throw new Error("Client logo must be 4 MB or smaller.");
  }
}

export async function persistClientLogoToProjectAssets(
  projectId: string,
  buffer: Buffer,
  fileName: string,
): Promise<{ relativePath: string; absolutePath: string }> {
  assertClientLogoWithinSize(buffer.byteLength);

  const assetsDir = path.join(resolveProjectDir(projectId), PROJECT_FILES.assetsDir);
  await mkdir(assetsDir, { recursive: true });

  const ext = resolveClientLogoExtension(fileName);
  const destName = `client-logo${ext}`;
  const absolutePath = path.join(assetsDir, destName);
  await writeFile(absolutePath, buffer);

  return {
    relativePath: `${PROJECT_FILES.assetsDir}/${destName}`.replace(/\\/g, "/"),
    absolutePath,
  };
}

export async function migrateClientBrandingAssets(
  projectId: string,
  client: GameConfig,
  existingRuntime: Record<string, string>,
): Promise<{ branding: GameConfig; runtimeAssets: Record<string, string> }> {
  void projectId;
  return {
    branding: client,
    runtimeAssets: existingRuntime,
  };
}

export function setFlatConfigField(
  config: GameConfig,
  key: keyof GameConfig,
  value: GameConfig[keyof GameConfig],
): GameConfig {
  return patchFlatConfig(config, key, value);
}
