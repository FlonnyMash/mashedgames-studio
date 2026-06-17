import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function isSafeAssetsRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/^\//, "").replace(/\\/g, "/");
  if (!normalized.startsWith("assets/")) {
    return false;
  }
  if (normalized.includes("..")) {
    return false;
  }
  return true;
}

export function resolveAssetFilePath(
  baseDir: string,
  relativePath: string,
): string | null {
  if (!isSafeAssetsRelativePath(relativePath)) {
    return null;
  }

  const normalized = relativePath.replace(/^\//, "").replace(/\\/g, "/");
  const resolved = path.normalize(path.join(baseDir, normalized));
  const resolvedBase = path.resolve(baseDir);

  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    return null;
  }

  return resolved;
}

export async function readWorkspaceAsset(
  absolutePath: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!existsSync(absolutePath)) {
    return null;
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const buffer = await readFile(absolutePath);
  return { buffer, contentType };
}
