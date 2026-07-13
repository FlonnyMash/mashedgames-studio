import { z } from "zod";
import { NullableAssetStringSchema } from "./asset-reference";

// ---------------------------------------------------------------------------
// Template field descriptors
//
// The single source of truth for a template's dynamic, template-specific
// runtime values. A template's manifest.ts declares its own `fields` array;
// nothing about a template's mechanics is ever hardcoded into the global
// GameConfigSchema. Each descriptor carries enough metadata (type, label,
// min/max/step, default) for the Configurator/Studio UI to render the right
// Tailwind control with zero per-template UI code.
//
// Runtime values for these fields live in the flat `GameConfig.fields`
// record (string | number | boolean), keyed by `TemplateFieldDescriptor.key`.
// ---------------------------------------------------------------------------

export const TEMPLATE_FIELD_TYPE = {
  COLOR: "color",
  IMAGE: "image",
  SLIDER: "slider",
  TEXT: "text",
  NUMBER: "number",
  TOGGLE: "toggle",
  STYLED_TEXT: "styled-text",
} as const;

export type TemplateFieldType =
  (typeof TEMPLATE_FIELD_TYPE)[keyof typeof TEMPLATE_FIELD_TYPE];

export const TemplateFieldTypeSchema = z.enum([
  TEMPLATE_FIELD_TYPE.COLOR,
  TEMPLATE_FIELD_TYPE.IMAGE,
  TEMPLATE_FIELD_TYPE.SLIDER,
  TEMPLATE_FIELD_TYPE.TEXT,
  TEMPLATE_FIELD_TYPE.NUMBER,
  TEMPLATE_FIELD_TYPE.TOGGLE,
  TEMPLATE_FIELD_TYPE.STYLED_TEXT,
]);

export const TemplateFieldDescriptorSchema = z.object({
  /** Flat key inside GameConfig.fields. Unique within a template. */
  key: z.string().min(1),
  type: TemplateFieldTypeSchema,
  /** Human-readable label shown above the control in the sidebar. */
  label: z.string().min(1),
  /** Optional accordion group id — fields sharing a group render together. */
  group: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  placeholder: z.string().optional(),
  /** Fallback runtime value used until a project overrides this field. */
  default: z.union([z.string(), z.number(), z.boolean()]),
  /**
   * Only valid when `type === "image"`. Matches a Phaser texture key
   * declared in the template's `assetRestrictions`, so the bridge/scene can
   * resolve the uploaded sprite by field key without a hardcoded map.
   */
  textureKey: z.string().optional(),
});

export type TemplateFieldDescriptor = z.infer<
  typeof TemplateFieldDescriptorSchema
>;

/**
 * Builds a Zod validator for a template's `fields` record from its own
 * descriptor list. Used to validate GameConfig.fields whenever a template's
 * config is parsed, without ever touching the global GameConfigSchema.
 */
export function buildFieldsZodSchema(
  descriptors: TemplateFieldDescriptor[],
): z.ZodType<Record<string, string | number | boolean>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const descriptor of descriptors) {
    shape[descriptor.key] = buildFieldValueSchema(descriptor).optional();
  }

  return z.object(shape).partial().catchall(
    z.union([z.string(), z.number(), z.boolean()]),
  );
}

function buildFieldValueSchema(descriptor: TemplateFieldDescriptor): z.ZodTypeAny {
  switch (descriptor.type) {
    case TEMPLATE_FIELD_TYPE.NUMBER:
    case TEMPLATE_FIELD_TYPE.SLIDER: {
      let schema = z.number();
      if (typeof descriptor.min === "number") {
        schema = schema.min(descriptor.min);
      }
      if (typeof descriptor.max === "number") {
        schema = schema.max(descriptor.max);
      }
      return schema;
    }
    case TEMPLATE_FIELD_TYPE.TOGGLE:
      return z.boolean();
    case TEMPLATE_FIELD_TYPE.IMAGE:
      return NullableAssetStringSchema;
    case TEMPLATE_FIELD_TYPE.COLOR:
    case TEMPLATE_FIELD_TYPE.TEXT:
    case TEMPLATE_FIELD_TYPE.STYLED_TEXT:
    default:
      return z.string();
  }
}

/** Derives the initial `fields` record straight from each descriptor's default. */
export function buildDefaultFieldValues(
  descriptors: TemplateFieldDescriptor[],
): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {};
  for (const descriptor of descriptors) {
    defaults[descriptor.key] = descriptor.default;
  }
  return defaults;
}

/** Returns the image-type descriptors that carry a `textureKey`. */
export function imageFieldDescriptors(
  descriptors: TemplateFieldDescriptor[],
): TemplateFieldDescriptor[] {
  return descriptors.filter(
    (descriptor) =>
      descriptor.type === TEMPLATE_FIELD_TYPE.IMAGE && descriptor.textureKey,
  );
}
