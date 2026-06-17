import { templateLibraryRoot } from "@/lib/project-paths";
import { normalizeTemplateId } from "@mashedgames/shared";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function persistBufferToTemplateAssets(
  templateId: string,
  buffer: Buffer,
  hintName: string,
): Promise<{ relativePath: string; absolutePath: string }> {
  const resolvedTemplateId = normalizeTemplateId(templateId);
  const assetsDir = path.join(templateLibraryRoot, resolvedTemplateId, "assets");
  await mkdir(assetsDir, { recursive: true });

  const safeName = sanitizeFileName(hintName);
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 8);
  const ext = path.extname(safeName) || ".png";
  const base = ext ? safeName.replace(/\.[^.]+$/, "") : safeName;
  const destName = `${hash}-${base}${ext.startsWith(".") ? ext : `.${ext}`}`;
  const absolutePath = path.join(assetsDir, destName);
  await writeFile(absolutePath, buffer);

  return {
    relativePath: `assets/${destName}`.replace(/\\/g, "/"),
    absolutePath,
  };
}
