import { z } from "zod";

// ---------------------------------------------------------------------------
// Game lifecycle event types
// Engine → Dashboard direction via GAME_LIFECYCLE_EVENT bridge message.
// Phaser emits these via overlay-shell.ts; the dashboard overlay renders UI
// based on the active TemplateSchema.supportsUI filter.
// ---------------------------------------------------------------------------

export const GAME_LIFECYCLE_EVENT_TYPE = {
  ON_GAME_START: "ON_GAME_START",
  ON_GAME_READY: "ON_GAME_READY",
  ON_SCORE_UPDATE: "ON_SCORE_UPDATE",
  ON_GAME_OVER: "ON_GAME_OVER",
  ON_LEVEL_COMPLETE: "ON_LEVEL_COMPLETE",
  ON_LIFE_LOST: "ON_LIFE_LOST",
  ON_COMBO_UPDATE: "ON_COMBO_UPDATE",
  ON_TIMER_UPDATE: "ON_TIMER_UPDATE",
} as const;

export type GameLifecycleEventType =
  (typeof GAME_LIFECYCLE_EVENT_TYPE)[keyof typeof GAME_LIFECYCLE_EVENT_TYPE];

export const GameLifecycleEventTypeSchema = z.enum(
  Object.values(GAME_LIFECYCLE_EVENT_TYPE) as [
    GameLifecycleEventType,
    ...GameLifecycleEventType[],
  ],
);

// ---------------------------------------------------------------------------
// Typed payload union — discriminated on the `event` field.
// Each variant carries only the data relevant to that event.
// ---------------------------------------------------------------------------

export const GameLifecycleEventPayloadSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal(GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_START),
    timestamp: z.number(),
  }),
  z.object({
    event: z.literal(GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_READY),
    timestamp: z.number(),
  }),
  z.object({
    event: z.literal(GAME_LIFECYCLE_EVENT_TYPE.ON_SCORE_UPDATE),
    score: z.number().nonnegative(),
    delta: z.number().optional(),
  }),
  z.object({
    event: z.literal(GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_OVER),
    finalScore: z.number().nonnegative(),
    reason: z.string().optional(),
  }),
  z.object({
    event: z.literal(GAME_LIFECYCLE_EVENT_TYPE.ON_LEVEL_COMPLETE),
    level: z.number().int().positive(),
    score: z.number().nonnegative(),
  }),
  z.object({
    event: z.literal(GAME_LIFECYCLE_EVENT_TYPE.ON_LIFE_LOST),
    livesRemaining: z.number().int().nonnegative(),
  }),
  z.object({
    event: z.literal(GAME_LIFECYCLE_EVENT_TYPE.ON_COMBO_UPDATE),
    combo: z.number().int().nonnegative(),
    multiplier: z.number().positive(),
  }),
  z.object({
    event: z.literal(GAME_LIFECYCLE_EVENT_TYPE.ON_TIMER_UPDATE),
    remaining: z.number().nonnegative(),
    elapsed: z.number().nonnegative(),
  }),
]);

export type GameLifecycleEventPayload = z.infer<
  typeof GameLifecycleEventPayloadSchema
>;

// ---------------------------------------------------------------------------
// Safe parse helper — used by dashboard bridge receiver
// ---------------------------------------------------------------------------

export function parseGameLifecycleEventPayload(
  data: unknown,
): GameLifecycleEventPayload | null {
  const result = GameLifecycleEventPayloadSchema.safeParse(data);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------------------
// Overlay subscriber interface
//
// Implemented by the React/HTML overlay component in the dashboard.
// The overlay shell forwards GAME_LIFECYCLE_EVENT payloads here; the
// subscriber decides what to render based on activeModules.
// ---------------------------------------------------------------------------

export interface GameOverlaySubscriber {
  /**
   * Called each time the engine emits a validated game lifecycle event.
   * The subscriber should guard against events not listed in activeModules.
   */
  onGameEvent(payload: GameLifecycleEventPayload): void;

  /**
   * The set of UI modules that are active for the current template.
   * Derived from TemplateSchema.supportsUI after template load.
   */
  activeModules: string[];
}
