export const LEGACY_DEFAULT_TEMPLATE_ID = "default";
export const BASELINE_TEMPLATE_ID = "catch-game";

/**
 * Resolves a template id for runtime use.
 *
 * The legacy fallback is STRICTLY limited to the exact string "default"
 * (the pre-2.0 placeholder id). Every other value — including empty or
 * missing ids — passes through unchanged so that invalid template ids fail
 * loudly downstream instead of being silently remapped onto the baseline
 * template and overriding valid, newly created projects.
 */
export function normalizeTemplateId(
  templateId: string | null | undefined,
): string {
  const normalized = (templateId ?? "").trim();
  if (normalized === LEGACY_DEFAULT_TEMPLATE_ID) {
    return BASELINE_TEMPLATE_ID;
  }
  return normalized;
}

export function isLegacyTemplateId(templateId: string): boolean {
  return templateId.trim() === LEGACY_DEFAULT_TEMPLATE_ID;
}
