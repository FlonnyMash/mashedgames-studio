import { getProjectDetails } from "@/lib/project-io";
import { normalizeTemplateId } from "@mashedgames/shared";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const result = await getProjectDetails(projectId);

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  const { data } = result;
  return Response.json({
    ok: true,
    projectId: data.manifest.projectId,
    repositoryPath: data.repositoryPath,
    directoryPath: data.directoryPath,
    manifest: {
      ...data.manifest,
      parentTemplateId: normalizeTemplateId(data.manifest.parentTemplateId),
    },
    createdAt: data.manifest.createdAt,
    updatedAt: data.updatedAt,
  });
}
