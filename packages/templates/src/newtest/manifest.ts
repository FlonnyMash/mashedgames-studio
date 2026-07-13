import { type TemplateSchema } from "@mashedgames/shared";

export const newtestManifest = {
  templateId: "newtest",
  version: "1.0.0",
  displayName: "NewTest",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [],
  supportedEvents: [],
  assetRestrictions: [],
  fields: [],
} satisfies TemplateSchema;

export type NewtestManifest = typeof newtestManifest;
