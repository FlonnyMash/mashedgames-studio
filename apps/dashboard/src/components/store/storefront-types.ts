import type { Tables } from "@/lib/supabaseClient";

// ---------------------------------------------------------------------------
// Shared types for the Template Storefront feature
// ---------------------------------------------------------------------------

export type TemplateRow = Tables<"templates">;
export type CatalogTemplateRow = Tables<"published_templates_with_tags">;

export type EnrichedTemplate = CatalogTemplateRow & {
  /** True when the current user's org holds an active license for this template. */
  isLicensed: boolean;
};

// ---------------------------------------------------------------------------
// Manifest shape — the `manifest` column is untyped Json in the DB;
// this type captures the fields the storefront consumes.
// ---------------------------------------------------------------------------

export type ManifestShape = {
  displayName?: string;
  /** UIModule values declared by the template (e.g. "lead-capture"). */
  supportsUI?: string[];
  /** Optional URL for an embeddable live demo iframe. */
  demo_url?: string;
  /** Deployed demo bundle size in kilobytes (from deploy-demo pipeline). */
  demo_size_kb?: number;
  /** Optional path to a logo image for this template. */
  logoUrl?: string;
};

export function parseManifest(manifest: unknown): ManifestShape {
  if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
    return manifest as ManifestShape;
  }
  return {};
}

export function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Storefront catalog sorting
// ---------------------------------------------------------------------------

export type StorefrontSortOption = "newest" | "popular" | "alphabetical";

const STOREFRONT_SORT_OPTIONS: StorefrontSortOption[] = [
  "newest",
  "popular",
  "alphabetical",
];

export function parseStorefrontSortOption(
  value: string | null | undefined,
): StorefrontSortOption {
  if (value && STOREFRONT_SORT_OPTIONS.includes(value as StorefrontSortOption)) {
    return value as StorefrontSortOption;
  }
  return "newest";
}

function templateDisplayName(template: EnrichedTemplate): string {
  const manifest = parseManifest(template.manifest);
  const slug = template.template_slug ?? "";
  return (
    template.title?.trim() ||
    manifest.displayName ||
    slugToTitle(slug)
  );
}

function templatePublishedTime(template: EnrichedTemplate): number {
  if (!template.published_at) return 0;
  const time = new Date(template.published_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function filterStorefrontTemplates(
  templates: EnrichedTemplate[],
  searchQuery: string,
): EnrichedTemplate[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return templates;

  return templates.filter((template) => {
    const name = templateDisplayName(template).toLowerCase();
    const slug = (template.template_slug ?? "").toLowerCase();
    const description = (template.description ?? "").toLowerCase();
    return (
      name.includes(query) ||
      slug.includes(query) ||
      description.includes(query)
    );
  });
}

export function sortStorefrontTemplates(
  templates: EnrichedTemplate[],
  sortBy: StorefrontSortOption,
): EnrichedTemplate[] {
  const sorted = [...templates];

  if (sortBy === "newest") {
    sorted.sort(
      (a, b) => templatePublishedTime(b) - templatePublishedTime(a),
    );
    return sorted;
  }

  if (sortBy === "alphabetical") {
    sorted.sort((a, b) =>
      templateDisplayName(a).localeCompare(templateDisplayName(b)),
    );
    return sorted;
  }

  sorted.sort((a, b) => {
    const popularityDelta =
      (b.popularity_score ?? 0) - (a.popularity_score ?? 0);
    if (popularityDelta !== 0) return popularityDelta;
    return templatePublishedTime(b) - templatePublishedTime(a);
  });

  return sorted;
}

export function applyStorefrontCatalogControls(
  templates: EnrichedTemplate[],
  searchQuery: string,
  sortBy: StorefrontSortOption,
): EnrichedTemplate[] {
  return sortStorefrontTemplates(
    filterStorefrontTemplates(templates, searchQuery),
    sortBy,
  );
}
