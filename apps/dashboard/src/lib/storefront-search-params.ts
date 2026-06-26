import type { StorefrontSortOption } from "@/components/store/storefront-types";
import { parseStorefrontSortOption } from "@/components/store/storefront-types";

/** Normalize Next.js `searchParams.tag` (undefined | string | string[]). */
export function parseStorefrontTagSlugs(
  tag: string | string[] | undefined,
): string[] {
  if (!tag) return [];

  const raw = Array.isArray(tag) ? tag : [tag];
  const seen = new Set<string>();
  const slugs: string[] = [];

  for (const value of raw) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    slugs.push(trimmed);
  }

  return slugs;
}

/** Stable string key for React effect dependencies (order-preserving). */
export function storefrontTagSlugKey(slugs: string[]): string {
  return slugs.join("\0");
}

export type StorefrontHrefOptions = {
  activeTagSlugs?: string[];
  search?: string;
  sort?: StorefrontSortOption;
  template?: string | null;
};

export function buildStorefrontHref({
  activeTagSlugs = [],
  search = "",
  sort = "newest",
  template = null,
}: StorefrontHrefOptions): string {
  const params = new URLSearchParams();

  for (const slug of activeTagSlugs) {
    params.append("tag", slug);
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch) params.set("search", trimmedSearch);
  if (sort !== "newest") params.set("sort", sort);
  if (template) params.set("template", template);

  const query = params.toString();
  return query ? `/dashboard/store?${query}` : "/dashboard/store";
}

export function parseStorefrontPageSearchParams(params: {
  tag?: string | string[];
  search?: string;
  sort?: string;
}) {
  return {
    activeTagSlugs: parseStorefrontTagSlugs(params.tag),
    initialSearch: params.search?.trim() ?? "",
    initialSort: parseStorefrontSortOption(params.sort),
  };
}

export function storefrontTagSlugsMatchUrl(
  slugs: string[],
  searchParams: URLSearchParams,
): boolean {
  const urlSlugs = searchParams.getAll("tag").map((s) => s.trim()).filter(Boolean);
  if (slugs.length !== urlSlugs.length) return false;
  return slugs.every((slug, index) => slug === urlSlugs[index]);
}
