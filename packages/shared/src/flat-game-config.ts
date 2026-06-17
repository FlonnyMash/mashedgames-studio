import { z } from "zod";
import { NullableAssetStringSchema } from "./asset-reference";

export const AppModeSchema = z.enum(["studio", "configurator"]);
export type AppMode = z.infer<typeof AppModeSchema>;

export const DEFAULT_SCHEMA_VERSION = "2.0.0";
export const DEFAULT_GAME_TEMPLATE_ID = "default";

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color");

export const GameConfigSchema = z.object({
  activeTemplateId: z.string().min(1),
  projectId: z.string().optional(),
  schemaVersion: z.string(),
  appMode: AppModeSchema.optional(),
  themeColor: hexColorSchema,
  backgroundColor: hexColorSchema,
  logoUrl: NullableAssetStringSchema.optional(),
  playerCatcherUrl: NullableAssetStringSchema.optional(),
  collectibleGoodUrl: NullableAssetStringSchema.optional(),
  collectibleBadUrl: NullableAssetStringSchema.optional(),
  startScreenTitle: z.string(),
  startScreenSubtitle: z.string().optional(),
  ctaLabel: z.string(),
  playerSpeed: z.number().min(0),
  gameDurationSeconds: z.number().min(1),
  parentTemplateId: z.string().optional(),
  parentPinnedVersion: z.string().optional(),
  lastParentSyncAt: z.string().optional(),
  // Text style overrides for overlay elements
  startScreenTitleColor: hexColorSchema.optional(),
  startScreenTitleBold: z.boolean().optional(),
  startScreenTitleItalic: z.boolean().optional(),
  startScreenTitleUnderline: z.boolean().optional(),
  startScreenSubtitleColor: hexColorSchema.optional(),
  startScreenSubtitleBold: z.boolean().optional(),
  startScreenSubtitleItalic: z.boolean().optional(),
  startScreenSubtitleUnderline: z.boolean().optional(),
  ctaTextColor: hexColorSchema.optional(),
  ctaLabelBold: z.boolean().optional(),
  ctaLabelItalic: z.boolean().optional(),
  ctaLabelUnderline: z.boolean().optional(),
  // Lead capture overlay copy + styles
  leadCaptureTitle: z.string().optional(),
  leadCaptureSubtitle: z.string().optional(),
  leadCaptureNamePlaceholder: z.string().optional(),
  leadCaptureEmailPlaceholder: z.string().optional(),
  leadCaptureSubmitLabel: z.string().optional(),
  leadCaptureRetryLabel: z.string().optional(),
  leadCaptureTitleColor: hexColorSchema.optional(),
  leadCaptureTitleBold: z.boolean().optional(),
  leadCaptureTitleItalic: z.boolean().optional(),
  leadCaptureTitleUnderline: z.boolean().optional(),
  leadCaptureSubtitleColor: hexColorSchema.optional(),
  leadCaptureSubtitleBold: z.boolean().optional(),
  leadCaptureSubtitleItalic: z.boolean().optional(),
  leadCaptureSubtitleUnderline: z.boolean().optional(),
  leadCaptureSubmitColor: hexColorSchema.optional(),
  leadCaptureSubmitBold: z.boolean().optional(),
  leadCaptureSubmitItalic: z.boolean().optional(),
  leadCaptureSubmitUnderline: z.boolean().optional(),
  leadCaptureRetryColor: hexColorSchema.optional(),
  leadCaptureRetryBold: z.boolean().optional(),
  leadCaptureRetryItalic: z.boolean().optional(),
  leadCaptureRetryUnderline: z.boolean().optional(),
  // Highscore overlay copy + styles
  highscoreTitle: z.string().optional(),
  highscoreSubtitle: z.string().optional(),
  highscoreTitleColor: hexColorSchema.optional(),
  highscoreTitleBold: z.boolean().optional(),
  highscoreTitleItalic: z.boolean().optional(),
  highscoreTitleUnderline: z.boolean().optional(),
  highscoreSubtitleColor: hexColorSchema.optional(),
  highscoreSubtitleBold: z.boolean().optional(),
  highscoreSubtitleItalic: z.boolean().optional(),
  highscoreSubtitleUnderline: z.boolean().optional(),
  // Visibility toggles for UI modules
  showStartScreen: z.boolean().optional(),
  showHighscore: z.boolean().optional(),
  showLeadCapture: z.boolean().optional(),
  showCountdownTimer: z.boolean().optional(),
  // Catch-game collectibles tuning (optional — ignored by other templates)
  goodItemPoints: z.number().int().min(0).optional(),
  badItemPenalty: z.number().int().min(0).optional(),
  badItemChancePercent: z.number().min(0).max(100).optional(),
  spawnIntervalMs: z.number().int().min(200).optional(),
  minSpawnIntervalMs: z.number().int().min(100).optional(),
  fallSpeedStart: z.number().min(50).optional(),
  fallSpeedMax: z.number().min(50).optional(),
  badSpawnIntervalMs: z.number().int().min(200).optional(),
  badMinSpawnIntervalMs: z.number().int().min(100).optional(),
  badFallSpeedStart: z.number().min(50).optional(),
  badFallSpeedMax: z.number().min(50).optional(),
});

export type GameConfig = z.infer<typeof GameConfigSchema>;
export type GameTemplateId = string;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  activeTemplateId: DEFAULT_GAME_TEMPLATE_ID,
  schemaVersion: DEFAULT_SCHEMA_VERSION,
  themeColor: "#6366f1",
  backgroundColor: "#0f172a",
  startScreenTitle: "Ready to play?",
  startScreenSubtitle: "Tap start when you are ready.",
  ctaLabel: "Start Game",
  playerSpeed: 320,
  gameDurationSeconds: 60,
  startScreenTitleColor: "#ffffff",
  startScreenTitleBold: false,
  startScreenTitleItalic: false,
  startScreenTitleUnderline: false,
  startScreenSubtitleColor: "#ffffff",
  startScreenSubtitleBold: false,
  startScreenSubtitleItalic: false,
  startScreenSubtitleUnderline: false,
  ctaTextColor: "#1e293b",
  ctaLabelBold: false,
  ctaLabelItalic: false,
  ctaLabelUnderline: false,
  leadCaptureTitle: "Great run!",
  leadCaptureSubtitle: "Enter your details to save your score.",
  leadCaptureNamePlaceholder: "Your name",
  leadCaptureEmailPlaceholder: "Email address",
  leadCaptureSubmitLabel: "Submit",
  leadCaptureRetryLabel: "Try again",
  leadCaptureTitleColor: "#ffffff",
  leadCaptureTitleBold: false,
  leadCaptureTitleItalic: false,
  leadCaptureTitleUnderline: false,
  leadCaptureSubtitleColor: "#a1a1aa",
  leadCaptureSubtitleBold: false,
  leadCaptureSubtitleItalic: false,
  leadCaptureSubtitleUnderline: false,
  leadCaptureSubmitColor: "#ffffff",
  leadCaptureSubmitBold: false,
  leadCaptureSubmitItalic: false,
  leadCaptureSubmitUnderline: false,
  leadCaptureRetryColor: "#1e293b",
  leadCaptureRetryBold: false,
  leadCaptureRetryItalic: false,
  leadCaptureRetryUnderline: false,
  highscoreTitle: "Leaderboard",
  highscoreSubtitle: "Top scores this week",
  highscoreTitleColor: "#ffffff",
  highscoreTitleBold: false,
  highscoreTitleItalic: false,
  highscoreTitleUnderline: false,
  highscoreSubtitleColor: "#a1a1aa",
  highscoreSubtitleBold: false,
  highscoreSubtitleItalic: false,
  highscoreSubtitleUnderline: false,
  showStartScreen: true,
  showHighscore: true,
  showLeadCapture: true,
  showCountdownTimer: true,
};

export function parseGameConfig(data: unknown): GameConfig {
  return GameConfigSchema.parse(data);
}

export function normalizeGameConfig(
  data: unknown,
  fallback: GameConfig = DEFAULT_GAME_CONFIG,
): GameConfig {
  const result = GameConfigSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  return { ...fallback };
}

export function patchFlatConfig<K extends keyof GameConfig>(
  config: GameConfig,
  key: K,
  value: GameConfig[K],
): GameConfig {
  return { ...config, [key]: value };
}

export function patchConfig(
  config: GameConfig,
  partial: Partial<GameConfig>,
): GameConfig {
  return { ...config, ...partial };
}

export function getPrimaryBrandColor(config: GameConfig): string {
  return config.themeColor;
}

export function exportClientPayload(config: GameConfig): GameConfig {
  return GameConfigSchema.parse(config);
}
