import { ensureWorkspaceExists, templateLibraryRoot } from "@/lib/project-paths";
import { resolveAssetFilePath } from "@/lib/serve-workspace-asset";
import {
  CONFIG_TEXTURE_FIELD_MAP,
  GameConfigSchema,
  normalizeGameConfig,
  normalizeTemplateId,
  type GameConfig,
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
): Record<string, string> {
  const runtimeAssets: Record<string, string> = {};

  for (const fieldKey of Object.keys(CONFIG_TEXTURE_FIELD_MAP)) {
    const assetPath = config[fieldKey as keyof GameConfig];
    if (typeof assetPath !== "string" || !assetPath.trim()) {
      continue;
    }
    const relativePath = assetPath.replace(/^\//, "");
    const absolutePath = resolveAssetFilePath(templateDir, relativePath);
    if (absolutePath) {
      runtimeAssets[relativePath] = absolutePath;
    }
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

    if (!existsSync(configPath)) {
      return Response.json({
        ok: true,
        templateId: resolvedTemplateId,
        config: null,
        runtimeAssets: {},
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
      runtimeAssets: buildRuntimeAssets(templateDir, config),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load config.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
