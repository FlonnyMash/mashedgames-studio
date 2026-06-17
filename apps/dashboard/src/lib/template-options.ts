import { BASELINE_TEMPLATE_ID } from "@mashedgames/shared";

/**
 * Statically-known template IDs bundled with the workspace package.
 * The Studio gate also fetches /api/templates at runtime to recognise any
 * templates added dynamically (see StudioTemplateGate.tsx).
 */
const STATIC_TEMPLATE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: BASELINE_TEMPLATE_ID, label: "Catch Game" },
];

export function getProductionTemplateOptions(): Array<{ id: string; label: string }> {
  return STATIC_TEMPLATE_OPTIONS;
}

export function getStudioTemplateOptions(): Array<{ id: string; label: string }> {
  return STATIC_TEMPLATE_OPTIONS;
}
