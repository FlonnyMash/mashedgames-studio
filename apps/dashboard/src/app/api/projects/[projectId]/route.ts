import { deleteProject } from "@/lib/project-delete";
import { loadProject, patchProjectDisplayName } from "@/lib/project-io";
import { normalizeTemplateId } from "@mashedgames/shared";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const result = await loadProject(projectId);

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json({
    ok: true,
    manifest: {
      ...result.data.manifest,
      parentTemplateId: normalizeTemplateId(result.data.manifest.parentTemplateId),
    },
    client: result.data.client,
    config: {
      ...result.data.config,
      activeTemplateId: normalizeTemplateId(result.data.config.activeTemplateId),
    },
    parentLock: result.data.parentLock,
    runtimeAssets: result.data.runtimeAssets,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;

  let body: { displayName?: string };
  try {
    body = (await request.json()) as { displayName?: string };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.displayName !== "string") {
    return Response.json(
      { ok: false, error: "displayName is required." },
      { status: 400 },
    );
  }

  const result = await patchProjectDisplayName(projectId, body.displayName);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json({ ok: true, manifest: result.data.manifest });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const result = deleteProject(projectId);

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json({
    ok: true,
    projectId: result.projectId,
    repositoryPath: result.repositoryPath,
  });
}
