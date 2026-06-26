import { type TemplateSchema } from "@mashedgames/shared";

export const testManifest = {
  templateId: "test",
  version: "1.0.0",
  displayName: "Test",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [],
  supportedEvents: [],
  assetRestrictions: [],
  meta: {},
  configFieldHints: {},
} satisfies TemplateSchema;

export type TestManifest = typeof testManifest;
