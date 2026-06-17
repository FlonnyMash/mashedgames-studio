import { ensureWorkspaceExists, templateLibraryRoot } from "@/lib/project-paths";
import {
  readWorkspaceAsset,
  resolveAssetFilePath,
} from "@/lib/serve-workspace-asset";
import { normalizeTemplateId } from "@mashedgames/shared";
import path from "node:path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ templateId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { templateId } = await context.params;
  const assetPath = request.nextUrl.searchParams.get("path");

  if (!assetPath?.trim()) {
    return Response.json({ ok: false, error: "Missing path." }, { status: 400 });
  }

  try {
    ensureWorkspaceExists();
    const resolvedTemplateId = normalizeTemplateId(templateId);
    const templateDir = path.join(templateLibraryRoot, resolvedTemplateId);
    const absolutePath = resolveAssetFilePath(templateDir, assetPath.trim());

    if (!absolutePath) {
      return Response.json({ ok: false, error: "Invalid asset path." }, { status: 400 });
    }

    const asset = await readWorkspaceAsset(absolutePath);
    if (!asset) {
      return Response.json({ ok: false, error: "Asset not found." }, { status: 404 });
    }

    return new Response(asset.buffer, {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read asset.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
