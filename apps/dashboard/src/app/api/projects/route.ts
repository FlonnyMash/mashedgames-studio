import { listProjectSummaries } from "@/lib/project-io";
import { resolveProjectOwnerContext } from "@/lib/project-owner-context";
import { normalizeTemplateId, SaveModeSchema } from "@mashedgames/shared";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const rawMode = searchParams.get("mode");
    const rawTemplateId = searchParams.get("templateId");

    const modeParsed = rawMode ? SaveModeSchema.safeParse(rawMode) : null;
    const mode = modeParsed?.success ? modeParsed.data : undefined;
    const templateId =
      rawTemplateId !== null ? normalizeTemplateId(rawTemplateId) : undefined;

    const ownerContext = await resolveProjectOwnerContext(request);

    const projects = await listProjectSummaries(
      mode !== undefined || templateId !== undefined
        ? { mode, templateId }
        : undefined,
      ownerContext,
    );

    return Response.json({ ok: true, projects });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list projects.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
