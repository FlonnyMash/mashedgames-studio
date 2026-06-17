import { type TemplateSchema } from "@mashedgames/shared";

export const ggManifest = {
  templateId: "gg",
  version: "1.0.0",
  displayName: "gg",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [],
  supportedEvents: [],
  assetRestrictions: [],
  meta: {},
  configFieldHints: {},
} satisfies TemplateSchema;

export type GgManifest = typeof ggManifest;
