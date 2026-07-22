import { type TemplateSchema } from "@mashedgames/shared";

export const testManifest = {
  templateId: "test",
  version: "1.0.0",
  displayName: "test",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [],
  supportedEvents: [],
  assetRestrictions: [],
  fields: [],
} satisfies TemplateSchema;

export type TestManifest = typeof testManifest;
