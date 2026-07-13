import { computeParentDrift } from "@/lib/project-parent-drift";
import { resolveProjectOwnerContext } from "@/lib/project-owner-context";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const ownerContext = await resolveProjectOwnerContext(request);
  const result = await computeParentDrift(projectId, ownerContext);

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json({ ok: true, report: result.report });
}
