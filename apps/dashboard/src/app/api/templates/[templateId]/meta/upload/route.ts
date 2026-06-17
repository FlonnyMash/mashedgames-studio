import { ensureWorkspaceExists } from "@/lib/project-paths";
import {
  saveTemplateMetaAsset,
  writeTemplateMeta,
  readTemplateMeta,
} from "@/lib/template-meta-io";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ templateId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { templateId } = await context.params;

  try {
    ensureWorkspaceExists();

    const formData = await request.formData();
    const file = formData.get("file");
    const assetType = formData.get("type");

    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "Missing file." }, { status: 400 });
    }

    if (assetType !== "thumbnail" && assetType !== "preview") {
      return Response.json(
        { ok: false, error: "type must be 'thumbnail' or 'preview'." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = saveTemplateMetaAsset(templateId, buffer, file.name, assetType);

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: result.status });
    }

    // Auto-update meta.json with the saved asset reference
    const current = readTemplateMeta(templateId);
    if (assetType === "thumbnail") {
      writeTemplateMeta(templateId, { thumbnail: result.filename });
    } else {
      const updated = [...current.previews, result.filename];
      writeTemplateMeta(templateId, { previews: updated });
    }

    return Response.json({ ok: true, filename: result.filename, url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
