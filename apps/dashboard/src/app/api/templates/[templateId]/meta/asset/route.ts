import { resolveTemplateMetaAssetPath } from "@/lib/template-meta-io";
import { readFileSync } from "node:fs";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ templateId: string }> };

const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { templateId } = await context.params;
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");

  if (!file) {
    return Response.json({ ok: false, error: "Missing file param." }, { status: 400 });
  }

  const resolved = resolveTemplateMetaAssetPath(templateId, file);
  if (!resolved.ok) {
    return Response.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }

  try {
    const buffer = readFileSync(resolved.absolutePath);
    const contentType = EXT_MIME[resolved.ext] ?? "application/octet-stream";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.json({ ok: false, error: "Failed to read asset." }, { status: 500 });
  }
}
