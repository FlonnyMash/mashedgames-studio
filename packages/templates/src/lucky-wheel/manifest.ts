import { type TemplateSchema } from "@mashedgames/shared";

export const luckyWheelManifest = {
  templateId: "lucky-wheel",
  version: "1.0.0",
  displayName: "Lucky Wheel",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [],
  supportedEvents: [],
  assetRestrictions: [],
  fields: [],
} satisfies TemplateSchema;

export type LuckyWheelManifest = typeof luckyWheelManifest;
