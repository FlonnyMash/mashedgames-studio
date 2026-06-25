import { ensureWorkspaceExists } from "@/lib/project-paths";
import {
  readTemplateMeta,
  writeTemplateMeta,
  type TemplateMetaPatch,
} from "@/lib/template-meta-io";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ templateId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { templateId } = await context.params;

  try {
    ensureWorkspaceExists();
    const meta = readTemplateMeta(templateId);
    return Response.json({ ok: true, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read meta.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { templateId } = await context.params;

  let body: TemplateMetaPatch;
  try {
    body = (await request.json()) as TemplateMetaPatch;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  ensureWorkspaceExists();

  const allowedPatch: TemplateMetaPatch = {};
  if (typeof body.description === "string") allowedPatch.description = body.description;
  if (typeof body.tutorial === "string") allowedPatch.tutorial = body.tutorial;
  if (typeof body.thumbnail === "string") allowedPatch.thumbnail = body.thumbnail;
  if (Array.isArray(body.previews)) allowedPatch.previews = body.previews;
  if (typeof body.demo_url === "string") allowedPatch.demo_url = body.demo_url;

  const result = writeTemplateMeta(templateId, allowedPatch);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }

  return Response.json({ ok: true, meta: result.meta });
}
