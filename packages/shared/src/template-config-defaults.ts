import type { GameConfig } from "./flat-game-config";
import { GameConfigSchema } from "./flat-game-config";
import { BASELINE_TEMPLATE_ID, normalizeTemplateId } from "./template-id";

/** Default tuning + overlay flags for the catch-game template. */
export const CATCH_GAME_CONFIG_DEFAULTS = {
  goodItemPoints: 10,
  badItemPenalty: 5,
  spawnIntervalMs: 900,
  minSpawnIntervalMs: 420,
  fallSpeedStart: 150,
  fallSpeedMax: 280,
  badSpawnIntervalMs: 1800,
  badMinSpawnIntervalMs: 900,
  badFallSpeedStart: 130,
  badFallSpeedMax: 260,
  showLeadCapture: true,
  showHighscore: true,
} as const satisfies Partial<GameConfig>;

/**
 * Fills missing catch-game tuning keys so Game Controls reflects runtime defaults.
 */
export function applyTemplateConfigDefaults(config: GameConfig): GameConfig {
  const templateId = normalizeTemplateId(config.activeTemplateId);
  if (templateId !== BASELINE_TEMPLATE_ID) {
    return config;
  }

  const merged: GameConfig = {
    ...config,
    activeTemplateId: templateId,
  };

  for (const [key, defaultValue] of Object.entries(CATCH_GAME_CONFIG_DEFAULTS)) {
    const configKey = key as keyof typeof CATCH_GAME_CONFIG_DEFAULTS;
    if (merged[configKey] === undefined) {
      (merged as Record<string, unknown>)[configKey] = defaultValue;
    }
  }

  const parsed = GameConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : config;
}
