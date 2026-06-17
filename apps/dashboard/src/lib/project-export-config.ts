import {
  GameConfigSchema,
  normalizeTemplateId,
  type GameConfig,
} from "@mashedgames/shared";
import { loadProject } from "@/lib/project-io";

export function buildProjectExportConfigJsonFromConfig(config: GameConfig): string {
  return JSON.stringify(
    GameConfigSchema.parse({
      ...config,
      activeTemplateId: normalizeTemplateId(config.activeTemplateId),
    }),
    null,
    2,
  );
}

export async function buildProjectExportConfigJson(projectId: string): Promise<
  | { ok: true; configJson: string }
  | { ok: false; error: string; status: number }
> {
  const loaded = await loadProject(projectId);
  if (!loaded.ok) {
    return loaded;
  }

  return {
    ok: true,
    configJson: buildProjectExportConfigJsonFromConfig(loaded.data.config),
  };
}

export function normalizeExportConfig(
  raw: unknown,
  fallbackTemplateId: string,
): GameConfig | null {
  const resolvedTemplateId = normalizeTemplateId(fallbackTemplateId);
  const normalized = GameConfigSchema.safeParse({
    ...(typeof raw === "object" && raw !== null ? raw : {}),
    activeTemplateId: resolvedTemplateId,
  });
  return normalized.success ? normalized.data : null;
}
