import type { GameConfig } from "./flat-game-config";
import { imageFieldDescriptors, type TemplateFieldDescriptor } from "./template-field-schema";

/**
 * Universal (template-agnostic) GameConfig asset keys mapped to their
 * Phaser texture key. Only branding-level assets belong here — anything
 * template-specific is declared by the template itself via image-type
 * TemplateFieldDescriptor.textureKey (see template-field-schema.ts).
 */
export const UNIVERSAL_TEXTURE_FIELD_MAP = {
  logoUrl: "logo",
} as const satisfies Record<string, string>;

export type UniversalTextureFieldKey = keyof typeof UNIVERSAL_TEXTURE_FIELD_MAP;

export function isUniversalTextureField(
  fieldKey: string,
): fieldKey is UniversalTextureFieldKey {
  return fieldKey in UNIVERSAL_TEXTURE_FIELD_MAP;
}

/** Derives a `{ fieldKey: textureKey }` map from a template's own image-type fields. */
export function getDynamicTextureFieldMap(
  templateFields: TemplateFieldDescriptor[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const descriptor of imageFieldDescriptors(templateFields)) {
    map[descriptor.key] = descriptor.textureKey as string;
  }
  return map;
}

/**
 * Resolves the Phaser texture key for a GameConfig asset field, checking
 * universal fields first, then the active template's dynamic image fields
 * (when supplied).
 */
export function textureKeyForConfigField(
  fieldKey: string,
  templateFields?: TemplateFieldDescriptor[],
): string | null {
  if (isUniversalTextureField(fieldKey)) {
    return UNIVERSAL_TEXTURE_FIELD_MAP[fieldKey];
  }
  if (templateFields) {
    return getDynamicTextureFieldMap(templateFields)[fieldKey] ?? null;
  }
  return null;
}

export type ConfiguredAssetUpload = {
  fieldKey: string;
  textureKey: string;
  absolutePath: string;
  /** False for universal branding fields (top-level GameConfig keys). */
  isTemplateField: boolean;
};

/**
 * Lists every asset field with an uploaded runtime asset ready to load —
 * universal branding fields (top-level GameConfig keys) plus the active
 * template's dynamic image fields (config.fields.*), when supplied.
 */
export function listConfiguredAssetUploads(
  config: GameConfig,
  runtimeAssets: Record<string, string>,
  templateFields: TemplateFieldDescriptor[] = [],
): ConfiguredAssetUpload[] {
  const uploads: ConfiguredAssetUpload[] = [];

  const resolve = (
    fieldKey: string,
    textureKey: string,
    path: unknown,
    isTemplateField: boolean,
  ) => {
    if (typeof path !== "string" || !path.trim()) {
      return;
    }
    const relativePath = path.replace(/^\//, "");
    const absolutePath = runtimeAssets[relativePath];
    if (!absolutePath) {
      return;
    }
    uploads.push({ fieldKey, textureKey, absolutePath, isTemplateField });
  };

  for (const [fieldKey, textureKey] of Object.entries(UNIVERSAL_TEXTURE_FIELD_MAP)) {
    resolve(fieldKey, textureKey, config[fieldKey as keyof GameConfig], false);
  }

  for (const [fieldKey, textureKey] of Object.entries(
    getDynamicTextureFieldMap(templateFields),
  )) {
    resolve(fieldKey, textureKey, config.fields?.[fieldKey], true);
  }

  return uploads;
}
