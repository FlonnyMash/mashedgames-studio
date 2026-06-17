import { createProject } from "@/lib/project-io";
import { normalizeTemplateId, type GameTemplateId } from "@mashedgames/shared";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: {
    displayName?: string;
    parentTemplateId?: string;
    projectId?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.displayName?.trim()) {
    return Response.json(
      { ok: false, error: "displayName is required." },
      { status: 400 },
    );
  }

  // Resolve the EXACT template id chosen by the user. normalizeTemplateId only
  // remaps the legacy literal "default" -> baseline; every other id passes
  // through verbatim. Blank ids are rejected here instead of being silently
  // remapped onto the baseline template.
  const requestedTemplateId = normalizeTemplateId(body.parentTemplateId);
  if (!requestedTemplateId) {
    return Response.json(
      { ok: false, error: "parentTemplateId is required." },
      { status: 400 },
    );
  }

  try {
    const result = await createProject({
      displayName: body.displayName,
      parentTemplateId: requestedTemplateId as GameTemplateId,
      projectId: body.projectId,
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }

    return Response.json({
      ok: true,
      projectId: result.data.manifest.projectId,
      manifest: result.data.manifest,
      client: result.data.client,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create project.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
