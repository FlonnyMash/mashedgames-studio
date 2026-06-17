import { listProjectIds, loadProject } from "@/lib/project-io";
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

    const ids = await listProjectIds(
      mode !== undefined || templateId !== undefined
        ? { mode, templateId }
        : undefined,
    );

    const projects = await Promise.all(
      ids.map(async (projectId) => {
        const loaded = await loadProject(projectId);
        if (!loaded.ok) {
          return { projectId, error: loaded.error };
        }
        return {
          projectId,
          displayName: loaded.data.manifest.displayName,
          parentTemplateId: normalizeTemplateId(
            loaded.data.manifest.parentTemplateId,
          ),
          parentVersion: loaded.data.manifest.parentVersion,
          mode: loaded.data.manifest.mode,
        };
      }),
    );
    return Response.json({ ok: true, projects });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list projects.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
