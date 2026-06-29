export type AdminTemplateTab = "settings" | "content" | "preview";

export function buildStorefrontEditorHref(
  slug: string,
  options?: { fromAdmin?: boolean },
): string {
  const params = new URLSearchParams({ edit: "true" });
  if (options?.fromAdmin) {
    params.set("from", "admin");
  }
  return `/dashboard/store/templates/${encodeURIComponent(slug)}?${params.toString()}`;
}

export function buildStorefrontPreviewHref(
  slug: string,
  options?: { fromAdmin?: boolean },
): string {
  const params = new URLSearchParams();
  if (options?.fromAdmin) {
    params.set("from", "admin");
  }
  const query = params.toString();
  const base = `/dashboard/store/templates/${encodeURIComponent(slug)}`;
  return query ? `${base}?${query}` : base;
}

export function buildAdminTemplateHref(
  slug: string,
  tab: AdminTemplateTab = "preview",
): string {
  const params = new URLSearchParams({ template: slug, tab });
  return `/admin?${params.toString()}`;
}

export function parseAdminTemplateTab(
  value: string | null | undefined,
): AdminTemplateTab {
  if (value === "content" || value === "preview" || value === "settings") {
    return value;
  }
  return "preview";
}
