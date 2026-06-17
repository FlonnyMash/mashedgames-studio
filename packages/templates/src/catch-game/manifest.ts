import {
  GAME_LIFECYCLE_EVENT_TYPE,
  UI_MODULE,
  type TemplateSchema,
} from "@mashedgames/shared";

export const catchGameManifest = {
  templateId: "catch-game",
  version: "1.0.0",
  displayName: "Catch Game",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [UI_MODULE.HIGHSCORE, UI_MODULE.COUNTDOWN_TIMER],
  supportedEvents: [
    GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_READY,
    GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_START,
    GAME_LIFECYCLE_EVENT_TYPE.ON_SCORE_UPDATE,
    GAME_LIFECYCLE_EVENT_TYPE.ON_TIMER_UPDATE,
    GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_OVER,
  ],
  assetRestrictions: [
    {
      key: "player-catcher",
      label: "Catcher",
      allowedFormats: ["png", "webp"],
      dimensions: { width: 120, height: 40, strict: false },
    },
    {
      key: "collectible-good",
      label: "Good collectible",
      allowedFormats: ["png", "webp"],
      dimensions: { width: 48, height: 48, strict: false },
    },
    {
      key: "collectible-bad",
      label: "Bad collectible",
      allowedFormats: ["png", "webp"],
      dimensions: { width: 48, height: 48, strict: false },
    },
  ],
  meta: {
    goodItemPoints: 10,
    spawnIntervalMs: 900,
    minSpawnIntervalMs: 420,
    fallSpeedStart: 150,
    fallSpeedMax: 280,
    badItemPenalty: 5,
    badSpawnIntervalMs: 1800,
    badMinSpawnIntervalMs: 900,
    badFallSpeedStart: 130,
    badFallSpeedMax: 260,
  },
  configFieldHints: {
    goodItemPoints: "number",
    spawnIntervalMs: "number",
    minSpawnIntervalMs: "number",
    fallSpeedStart: "number",
    fallSpeedMax: "number",
    badItemPenalty: "number",
    badSpawnIntervalMs: "number",
    badMinSpawnIntervalMs: "number",
    badFallSpeedStart: "number",
    badFallSpeedMax: "number",
  },
} satisfies TemplateSchema;

export type CatchGameManifest = typeof catchGameManifest;
