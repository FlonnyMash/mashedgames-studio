import type { GameConfig } from "./flat-game-config";
import { buildDefaultFieldValues, type TemplateFieldDescriptor } from "./template-field-schema";

/**
 * Fills missing template-specific field values from the active template's
 * own TemplateFieldDescriptor[] (its manifest.ts `fields` array). Generic
 * across every template — there is no hardcoded per-template branch here.
 * Pass the active template's descriptors when known (e.g. after loading its
 * manifest); omit them to leave `config.fields` untouched.
 */
export function applyTemplateConfigDefaults(
  config: GameConfig,
  templateFields?: TemplateFieldDescriptor[],
): GameConfig {
  if (!templateFields || templateFields.length === 0) {
    return config;
  }

  const defaults = buildDefaultFieldValues(templateFields);
  const fields = { ...defaults, ...config.fields };

  return { ...config, fields };
}
