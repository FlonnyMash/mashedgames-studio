import { ensureWorkspaceExists, templateLibraryRoot } from "@/lib/project-paths";
import { resolveAssetFilePath } from "@/lib/serve-workspace-asset";
import { readTemplateFields, readTemplateSupportsUI } from "@/lib/template-fields";
import {
  getDynamicTextureFieldMap,
  GameConfigSchema,
  normalizeGameConfig,
  normalizeTemplateId,
  UNIVERSAL_TEXTURE_FIELD_MAP,
  type GameConfig,
  type TemplateFieldDescriptor,
} from "@mashedgames/shared";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ templateId: string }> };

function buildRuntimeAssets(
  templateDir: string,
  config: GameConfig,
  templateFields: TemplateFieldDescriptor[],
): Record<string, string> {
  const runtimeAssets: Record<string, string> = {};

  const resolve = (assetPath: unknown) => {
    if (typeof assetPath !== "string" || !assetPath.trim()) {
      return;
    }
    const relativePath = assetPath.replace(/^\//, "");
    const absolutePath = resolveAssetFilePath(templateDir, relativePath);
    if (absolutePath) {
      runtimeAssets[relativePath] = absolutePath;
    }
  };

  for (const fieldKey of Object.keys(UNIVERSAL_TEXTURE_FIELD_MAP)) {
    resolve(config[fieldKey as keyof GameConfig]);
  }
  for (const fieldKey of Object.keys(getDynamicTextureFieldMap(templateFields))) {
    resolve(config.fields?.[fieldKey]);
  }

  return runtimeAssets;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { templateId } = await context.params;

  try {
    ensureWorkspaceExists();
    const resolvedTemplateId = normalizeTemplateId(templateId);
    const templateDir = path.join(templateLibraryRoot, resolvedTemplateId);
    const configPath = path.join(templateDir, "config.json");
    const templateFields = readTemplateFields(resolvedTemplateId);
    const supportsUI = readTemplateSupportsUI(resolvedTemplateId);

    if (!existsSync(configPath)) {
      return Response.json({
        ok: true,
        templateId: resolvedTemplateId,
        config: null,
        runtimeAssets: {},
        templateFields,
        supportsUI,
      });
    }

    const raw = JSON.parse(await readFile(configPath, "utf8"));
    const config = GameConfigSchema.parse(
      normalizeGameConfig({
        ...raw,
        activeTemplateId: resolvedTemplateId,
        appMode: "studio",
      }),
    );

    return Response.json({
      ok: true,
      templateId: resolvedTemplateId,
      config,
      runtimeAssets: buildRuntimeAssets(templateDir, config, templateFields),
      templateFields,
      supportsUI,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load config.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
