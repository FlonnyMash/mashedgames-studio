import { isElectronRuntime } from "@/lib/admin-api-client";
import { loadStoreTagFiltersViaIpc } from "@/lib/auth-ipc";
import { supabase } from "@/lib/supabaseClient";
import type { Tables } from "@/lib/supabaseClient";
import type { PublishedTagRef } from "@mashedgames/shared";
import type { StorefrontSortOption } from "@/components/store/storefront-types";

export type PublishedCatalogRow = Tables<"published_templates_with_tags">;

export type CatalogFetchOptions = {
  sort?: StorefrontSortOption;
  search?: string;
};

export type CatalogFetchResult = {
  templates: PublishedCatalogRow[];
  /** True when at least one requested tag slug does not exist. */
  tagInvalid: boolean;
  /** Subset of requested slugs that were not found in the tags table. */
  invalidTagSlugs: string[];
};

function parseTagsJson(tags: unknown): PublishedTagRef[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter(
    (item): item is PublishedTagRef =>
      Boolean(
        item &&
          typeof item === "object" &&
          "slug" in item &&
          typeof (item as { slug: unknown }).slug === "string",
      ),
  );
}

/** Escape `%` and `_` for safe use inside ilike patterns. */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function applyCatalogSearch<T extends { or: (filters: string) => T }>(
  query: T,
  search: string,
): T {
  const trimmed = search.trim();
  if (!trimmed) return query;

  const escaped = escapeIlikePattern(trimmed);
  const pattern = `%${escaped}%`;
  return query.or(
    `description.ilike.${pattern},template_slug.ilike.${pattern},manifest->>displayName.ilike.${pattern}`,
  );
}

type OrderableQuery = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => OrderableQuery;
};

function applyCatalogSort<T extends OrderableQuery>(
  query: T,
  sort: StorefrontSortOption = "newest",
): T {
  if (sort === "popular") {
    return query
      .order("popularity_score", { ascending: false })
      .order("published_at", { ascending: false }) as T;
  }

  if (sort === "alphabetical") {
    return query.order("template_slug", { ascending: true }) as T;
  }

  return query.order("published_at", { ascending: false }) as T;
}

export function catalogRowHasTag(
  row: PublishedCatalogRow,
  tagSlug: string,
): boolean {
  return parseTagsJson(row.tags).some((tag) => tag.slug === tagSlug);
}

export function catalogRowHasAnyTag(
  row: PublishedCatalogRow,
  tagSlugs: string[],
): boolean {
  if (tagSlugs.length === 0) return true;
  const slugSet = new Set(tagSlugs);
  return parseTagsJson(row.tags).some((tag) => slugSet.has(tag.slug));
}

function normalizeTagSlugs(tagSlugs?: string[] | null): string[] {
  if (!tagSlugs?.length) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const slug of tagSlugs) {
    const trimmed = slug.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

async function fetchCatalogRows(
  slugs: string[] | null,
  options: CatalogFetchOptions,
): Promise<PublishedCatalogRow[]> {
  const sort = options.sort ?? "newest";
  const search = options.search ?? "";

  let query = supabase.from("published_templates_with_tags").select("*");

  if (slugs !== null) {
    if (slugs.length === 0) {
      return [];
    }
    query = query.in("template_slug", slugs);
  }

  query = applyCatalogSearch(query, search);
  query = applyCatalogSort(query, sort);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Resolves template slugs that match ANY of the given tag slugs (OR semantics).
 * The view exposes tags as JSONB objects; filtering uses template_tags junction.
 */
async function resolveMultiTagFilteredSlugs(
  tagSlugs: string[],
): Promise<{ slugs: string[]; invalidTagSlugs: string[] }> {
  const { data: tagRows, error: tagError } = await supabase
    .from("tags")
    .select("id, slug")
    .in("slug", tagSlugs);

  if (tagError) throw tagError;

  const foundBySlug = new Map(
    (tagRows ?? []).map((row) => [row.slug, row.id] as const),
  );
  const invalidTagSlugs = tagSlugs.filter((slug) => !foundBySlug.has(slug));
  const tagIds = [...foundBySlug.values()];

  if (tagIds.length === 0) {
    return { slugs: [], invalidTagSlugs };
  }

  const { data: links, error: linkError } = await supabase
    .from("template_tags")
    .select("template_slug")
    .in("tag_id", tagIds);

  if (linkError) throw linkError;

  const slugs = [
    ...new Set((links ?? []).map((row) => row.template_slug).filter(Boolean)),
  ];

  return { slugs, invalidTagSlugs };
}

/**
 * Fetches published templates from `published_templates_with_tags`.
 * When tag slugs are provided, returns templates that have at least one
 * matching tag (OR). Search and sort are applied server-side on the view query.
 */
export async function fetchPublishedTemplatesCatalog(
  tagSlugs?: string[] | null,
  options: CatalogFetchOptions = {},
): Promise<CatalogFetchResult> {
  const normalizedTags = normalizeTagSlugs(tagSlugs);

  if (normalizedTags.length === 0) {
    const templates = await fetchCatalogRows(null, options);
    return { templates, tagInvalid: false, invalidTagSlugs: [] };
  }

  const { slugs, invalidTagSlugs } =
    await resolveMultiTagFilteredSlugs(normalizedTags);
  const templates = await fetchCatalogRows(slugs, options);

  return {
    templates,
    tagInvalid: invalidTagSlugs.length > 0,
    invalidTagSlugs,
  };
}

/**
 * Fetches grouped storefront sidebar filters via `get_storefront_tag_filters`.
 * Electron: main-process JWT (renderer Supabase client is anonymous).
 * Web: authenticated Supabase session required; returns [] when unauthenticated.
 */
export async function fetchStorefrontTagFilters(): Promise<unknown> {
  if (isElectronRuntime()) {
    const result = await loadStoreTagFiltersViaIpc();
    if (!result) {
      throw new Error("Store tag filters are unavailable outside Electron.");
    }
    if (!result.ok) {
      if (result.error === "NOT_AUTHENTICATED") {
        return [];
      }
      throw new Error(result.error);
    }
    return result.filters ?? [];
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return [];
  }

  const { data, error } = await supabase.rpc("get_storefront_tag_filters");
  if (error) {
    throw error;
  }

  return data ?? [];
}

export { parseTagsJson };
