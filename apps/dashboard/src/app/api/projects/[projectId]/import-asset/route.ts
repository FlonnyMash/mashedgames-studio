import { importProjectAsset } from "@/lib/project-io";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

const MAX_TEXTURE_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;

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

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importProjectAsset(projectId, targetPath.trim(), {
      fileName: file.name,
      buffer,
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }

    return Response.json({
      ok: true,
      relativePath: result.data.relativePath,
      absolutePath: result.data.absolutePath,
      textureKey: result.data.textureKey,
      client: result.data.client,
      manifest: result.data.manifest,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import asset.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
