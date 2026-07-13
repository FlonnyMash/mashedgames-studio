import { listProjectIds, loadProject } from "@/lib/project-io";
import { resolveProjectOwnerContext } from "@/lib/project-owner-context";
import { readTemplateMeta, buildMetaAssetUrl } from "@/lib/template-meta-io";
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

    const ids = await listProjectIds(
      mode !== undefined || templateId !== undefined
        ? { mode, templateId }
        : undefined,
    );

    const projects = (await Promise.all(
      ids.map(async (projectId) => {
        const loaded = await loadProject(projectId, ownerContext);
        if (!loaded.ok) {
          if (loaded.status === 403) {
            return null;
          }
          return { projectId, error: loaded.error };
        }
        const parentTemplateId = normalizeTemplateId(
          loaded.data.manifest.parentTemplateId,
        );

        // Inherit the template thumbnail — read-only, never saved to project
        let thumbnailUrl: string | undefined;
        try {
          const meta = readTemplateMeta(parentTemplateId);
          if (meta.thumbnail) {
            thumbnailUrl = buildMetaAssetUrl(parentTemplateId, meta.thumbnail);
          }
        } catch {
          // Non-fatal — thumbnail is informational only
        }

        return {
          projectId,
          displayName: loaded.data.manifest.displayName,
          parentTemplateId,
          parentVersion: loaded.data.manifest.parentVersion,
          mode: loaded.data.manifest.mode,
          thumbnailUrl,
        };
      }),
    )).filter(
      (project): project is NonNullable<typeof project> => project !== null,
    );
    return Response.json({ ok: true, projects });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list projects.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
