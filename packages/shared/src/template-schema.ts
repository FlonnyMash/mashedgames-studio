import { z } from "zod";
import { GameLifecycleEventTypeSchema } from "./game-events";
import { TemplateControlsSchema } from "./template-metadata-schema";
import { TemplateFieldDescriptorSchema } from "./template-field-schema";

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
// Template schema
//
// Authoring-time metadata that describes what a template supports and
// what configurators are permitted to change. This is NOT the runtime
// GameConfig — it is never sent to the game engine directly.
//
// Flat-config law: `fields` is the only dynamic section and each descriptor
// resolves to a flat primitive (string | number | boolean) at runtime. No
// nested objects, no .passthrough().
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
   * The template's dynamic, template-specific runtime fields. This is the
   * ONLY place a template declares its mechanics — the global GameConfig
   * schema never gains hardcoded per-template keys. Each descriptor is
   * self-describing (type/label/min/max/step/default), which is enough for
   * the Configurator/Studio UI to render the right control automatically
   * and for the runtime to validate GameConfig.fields against it.
   *
   * Example:
   *   [{ key: "gravity", type: "slider", label: "Gravity", min: 0, max: 100,
   *      default: 50 }]
   */
  fields: z.array(TemplateFieldDescriptorSchema).default([]),

  // ---------------------------------------------------------------------------
  // Storefront / tutorial metadata
  // These fields are informational only — they are never sent to the game
  // engine. Heavy promotional assets (thumbnail, previews) are stored in the
  // template's meta/ directory and excluded from game bundle exports.
  // ---------------------------------------------------------------------------

  /**
   * Rich HTML marketing description shown in the Storefront detail view and
   * Studio list. Legacy Markdown is converted at render time. Leave absent in
   * manifest.ts — populated from the template's meta/template-meta.json
   * sidecar by the publish pipeline.
   */
  description: z.string().optional(),

  /**
   * Relative path to the thumbnail image inside the template's meta/ dir.
   * Leave absent in manifest.ts — populated from meta/template-meta.json.
   * Example: "meta/thumbnail.png"
   */
  thumbnail: z.string().optional(),

  /**
   * Relative paths to preview media (gif / mp4 / png) inside meta/.
   * Leave absent in manifest.ts — populated from meta/template-meta.json.
   * Example: ["meta/previews/gameplay.gif", "meta/previews/config.mp4"]
   */
  previews: z.array(z.string()).optional(),

  /**
   * Rich HTML rendered as a help tutorial inside the Configurator. Legacy
   * Markdown is converted at render time. Leave absent in manifest.ts —
   * populated from meta/template-meta.json.
   */
  tutorial: z.string().optional(),

  /**
   * Optional URL for an embeddable live demo of this template.
   * Rendered as a sandboxed <iframe> in the Storefront details dialog.
   * Leave absent in manifest.ts — populated from meta/template-meta.json
   * or set directly by the publish pipeline.
   * Example: "https://demos.mashedgames.com/catch-game"
   */
  demo_url: z.string().url().optional(),

  /**
   * Total size of the deployed standalone demo bundle in kilobytes.
   * Populated by the deploy-demo pipeline after a successful Cloudflare Pages upload.
   */
  demo_size_kb: z.number().optional(),

  /**
   * Key-action hints for the storefront demo theater controls popover.
   * Populated from template_metadata at read time.
   */
  controls: TemplateControlsSchema.optional(),
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
