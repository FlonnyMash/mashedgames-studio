import { type TemplateSchema } from "@mashedgames/shared";

export const welpManifest = {
  templateId: "welp",
  version: "1.0.0",
  displayName: "welp",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [],
  supportedEvents: [],
  assetRestrictions: [],
  fields: [],
} satisfies TemplateSchema;

export type WelpManifest = typeof welpManifest;
