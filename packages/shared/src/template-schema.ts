import { z } from "zod";
import { GameLifecycleEventTypeSchema } from "./game-events";

// ---------------------------------------------------------------------------
// UI Modules
// Overlay elements a template may activate. The dashboard renders only the
// modules declared in TemplateSchema.supportsUI for the active template.
// ---------------------------------------------------------------------------

export const UI_MODULE = {
  HIGHSCORE: "highscore",
  PERCENTAGE_WIN: "percentage-win",
  LEAD_CAPTURE: "lead-capture",
  COUNTDOWN_TIMER: "countdown-timer",
  LIVES_DISPLAY: "lives-display",
  COMBO_MULTIPLIER: "combo-multiplier",
} as const;

export type UIModule = (typeof UI_MODULE)[keyof typeof UI_MODULE];

export const UIModuleSchema = z.enum(
  Object.values(UI_MODULE) as [UIModule, ...UIModule[]],
);

// ---------------------------------------------------------------------------
// Asset restriction
// Declares one replaceable sprite slot for a template.
// The Studio configurator enforces these constraints before accepting uploads.
// ---------------------------------------------------------------------------

export const AssetFormatSchema = z.enum(["png", "jpg", "webp", "svg"]);
export type AssetFormat = z.infer<typeof AssetFormatSchema>;

export const AssetDimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** If true, the uploaded image must match the dimensions exactly. */
  strict: z.boolean().default(false),
});

export const AssetRestrictionSchema = z.object({
  /** Matches the Phaser texture key used in MainScene. */
  key: z.string().min(1),
  /** Human-readable label shown in the configurator asset picker. */
  label: z.string().min(1),
  allowedFormats: z
    .array(AssetFormatSchema)
    .min(1)
    .default(["png", "jpg", "webp"]),
  /** Max upload size in kilobytes. Omit to allow any size. */
  maxSizeKB: z.number().int().positive().optional(),
  /** Optional dimension constraint. */
  dimensions: AssetDimensionsSchema.optional(),
});

export type AssetRestriction = z.infer<typeof AssetRestrictionSchema>;

// ---------------------------------------------------------------------------
// Config field hints
//
// Allows a template manifest to annotate meta keys (or future GameConfig
// extensions) with a UI rendering hint. The FlatConfigPanel uses these
// hints to render the appropriate control for each field when a template
// is active. Values map to FlatFieldType in flat-field-registry.ts.
// ---------------------------------------------------------------------------

export const ConfigFieldHintSchema = z.enum([
  "color",
  "toggle",
  "text",
  "number",
  "image",
  "slider",
]);

export type ConfigFieldHint = z.infer<typeof ConfigFieldHintSchema>;

// ---------------------------------------------------------------------------
// Template schema
//
// Authoring-time metadata that describes what a template supports and
// what configurators are permitted to change. This is NOT the runtime
// GameConfig — it is never sent to the game engine directly.
//
// Flat-config law: meta is the only dynamic field and it accepts flat
// primitives only (string | number | boolean). No nested objects, no
// .passthrough(). Future features such as localizer key injection and
// A/B experiment flags use the meta record.
// ---------------------------------------------------------------------------

export const TemplateSchemaSchema = z.object({
  /** Must match the directory name under packages/templates/src/. */
  templateId: z.string().min(1),

  /** Semver string. Used for parent-drift detection. */
  version: z.string().min(1),

  /** Human-readable name shown in the Studio template library. */
  displayName: z.string().min(1),

  /**
   * Keys from GameConfig that the configurator is NOT allowed to change.
   * The permission guard in packages/shared/src/permissions.ts enforces this.
   */
  lockedFields: z.array(z.string()),

  /**
   * Which overlay modules this template activates.
   * The dashboard overlay renders only these modules when events arrive.
   */
  supportsUI: z.array(UIModuleSchema),

  /**
   * Which GAME_LIFECYCLE_EVENT types this template's Phaser scene emits.
   * Used for overlay wiring and to warn if an undeclared event is received.
   */
  supportedEvents: z.array(GameLifecycleEventTypeSchema),

  /**
   * Sprite slots that Studio/Configurator users may replace.
   * Each entry maps to a Phaser texture key in MainScene.
   */
  assetRestrictions: z.array(AssetRestrictionSchema),

  /**
   * Extensible flat key-value store.
   * Use for: localizer key overrides, A/B experiment flags, future feature
   * toggles. Values are primitives only — no nested objects.
   *
   * Examples:
   *   { "locale.startButton": "Speel nu!", "experiment.doubleScore": true }
   */
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),

  /**
   * Optional UI rendering hints for meta fields.
   * Maps a meta key to a FlatFieldType hint so the sidebar can render the
   * correct control. Only meta keys that need a non-text control require an
   * entry here; all other meta keys default to "text".
   *
   * Examples:
   *   { "catchZoneColor": "color", "showWinAnimation": "toggle" }
   */
  configFieldHints: z
    .record(z.string(), ConfigFieldHintSchema)
    .optional()
    .default({}),
});

export type TemplateSchema = z.infer<typeof TemplateSchemaSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseTemplateSchema(data: unknown): TemplateSchema {
  return TemplateSchemaSchema.parse(data);
}

export function isLockedField(
  schema: TemplateSchema,
  field: string,
): boolean {
  return schema.lockedFields.includes(field);
}

export function supportsUIModule(
  schema: TemplateSchema,
  module: UIModule,
): boolean {
  return (schema.supportsUI as string[]).includes(module);
}
