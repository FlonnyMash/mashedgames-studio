import { saveProjectClient } from "@/lib/project-io";
import { resolveProjectOwnerContext } from "@/lib/project-owner-context";
import { ClientProjectPayloadSchema } from "@mashedgames/shared";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json()) as { client?: unknown };
    const parsed = ClientProjectPayloadSchema.safeParse(body.client);
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: "Invalid client payload." },
        { status: 400 },
      );
    }

    const ownerContext = await resolveProjectOwnerContext(request);
    const result = await saveProjectClient(projectId, parsed.data, ownerContext);
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }

    return Response.json({ ok: true, projectId: result.data.projectId });
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
}
