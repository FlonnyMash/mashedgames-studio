import { ensureWorkspaceExists, templateLibraryRoot } from "@/lib/project-paths";
import { persistBufferToTemplateAssets } from "@/lib/template-assets";
import { readTemplateFields } from "@/lib/template-fields";
import {
  GameConfigSchema,
  isUniversalTextureField,
  normalizeTemplateId,
  patchFlatConfig,
  patchTemplateField,
  textureKeyForConfigField,
  type GameConfig,
} from "@mashedgames/shared";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ templateId: string }> };

const MAX_TEXTURE_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest, context: RouteContext) {
  const { templateId } = await context.params;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const targetPath = formData.get("targetPath");

    if (!(file instanceof File)) {
      return Response.json(
        { ok: false, error: "Missing image file." },
        { status: 400 },
      );
    }

    if (typeof targetPath !== "string" || !targetPath.trim()) {
      return Response.json(
        { ok: false, error: "Missing targetPath." },
        { status: 400 },
      );
    }

    if (file.size > MAX_TEXTURE_BYTES) {
      return Response.json(
        { ok: false, error: "Image must be 4 MB or smaller." },
        { status: 400 },
      );
    }

    ensureWorkspaceExists();
    const resolvedTemplateId = normalizeTemplateId(templateId);
    const templateDir = path.join(templateLibraryRoot, resolvedTemplateId);
    const configPath = path.join(templateDir, "config.json");

    const buffer = Buffer.from(await file.arrayBuffer());
    const { relativePath, absolutePath } = await persistBufferToTemplateAssets(
      resolvedTemplateId,
      buffer,
      file.name,
    );

    const fieldKey = targetPath.trim();
    const templateFields = readTemplateFields(resolvedTemplateId);
    let config: GameConfig | null = null;

    try {
      const raw = await readFile(configPath, "utf8");
      const parsed = GameConfigSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        config = isUniversalTextureField(fieldKey)
          ? patchFlatConfig(parsed.data, fieldKey, relativePath)
          : patchTemplateField(parsed.data, fieldKey, relativePath);
        await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      }
    } catch {
      // Template config may not exist yet — preview still works in memory.
    }

    return Response.json({
      ok: true,
      relativePath,
      absolutePath,
      textureKey: textureKeyForConfigField(fieldKey, templateFields),
      config,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import asset.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
