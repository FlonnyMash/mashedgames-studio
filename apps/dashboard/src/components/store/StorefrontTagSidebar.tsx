"use client";

import { parseStorefrontTagFiltersFromRpc } from "@mashedgames/shared";
import type { StorefrontTagFilterCategory } from "@mashedgames/shared";
import { Check, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canBrowseStoreWithoutAuth } from "@/lib/dev-store-access";
import { fetchStorefrontTagFilters } from "@/lib/storefront-catalog";
import {
  buildStorefrontHref,
  parseStorefrontTagSlugs,
} from "@/lib/storefront-search-params";
import { parseStorefrontSortOption } from "@/components/store/storefront-types";
import { useAuthStore } from "@/store/useAuthStore";

type StorefrontTagSidebarProps = {
  activeTagSlugs: string[];
};

export function StorefrontTagSidebar({
  activeTagSlugs,
}: StorefrontTagSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const userId = useAuthStore((s) => s.userId);
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const devStorePreview = canBrowseStoreWithoutAuth();

  const [categories, setCategories] = useState<StorefrontTagFilterCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeTagSet = useMemo(
    () => new Set(activeTagSlugs),
    [activeTagSlugs],
  );

  const navigateWithTags = useCallback(
    (nextTags: string[]) => {
      if (pathname !== "/dashboard/store") return;

      const href = buildStorefrontHref({
        activeTagSlugs: nextTags,
        search: searchParams.get("search") ?? "",
        sort: parseStorefrontSortOption(searchParams.get("sort")),
        template: searchParams.get("template"),
      });

      router.push(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toggleTag = useCallback(
    (slug: string) => {
      const nextTags = activeTagSet.has(slug)
        ? activeTagSlugs.filter((value) => value !== slug)
        : [...activeTagSlugs, slug];
      navigateWithTags(nextTags);
    },
    [activeTagSet, activeTagSlugs, navigateWithTags],
  );

  const clearTags = useCallback(() => {
    navigateWithTags([]);
  }, [navigateWithTags]);

  useEffect(() => {
    if (authIsLoading) {
      return;
    }

    if (!userId && !devStorePreview) {
      setLoading(false);
      setCategories([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const raw = await fetchStorefrontTagFilters();
        if (!cancelled) {
          setCategories(parseStorefrontTagFiltersFromRpc(raw));
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load tag filters.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, authIsLoading, devStorePreview]);

  const asideClassName =
    "space-y-6 lg:w-[240px] lg:shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto";

  if (loading) {
    return (
      <aside className={asideClassName} aria-label="Filter by tag">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading filters…
        </div>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className={asideClassName} aria-label="Filter by tag">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      </aside>
    );
  }

  return (
    <aside className={asideClassName} aria-label="Filter by tag">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Browse by tag
        </h2>
        <button
          type="button"
          onClick={clearTags}
          className={`mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            activeTagSlugs.length === 0
              ? "bg-zinc-900 font-medium text-white"
              : "text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          <span>All templates</span>
          {activeTagSlugs.length === 0 ? (
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : null}
        </button>
      </div>

      {categories.map((category) => (
        <div key={category.id}>
          <h3 className="text-xs font-semibold text-zinc-500">{category.name}</h3>
          <ul className="mt-2 space-y-0.5">
            {category.tags.map((tag) => {
              const isActive = activeTagSet.has(tag.slug);
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    onClick={() => toggleTag(tag.slug)}
                    aria-pressed={isActive}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-zinc-900 font-medium text-white"
                        : "text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isActive ? (
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      ) : (
                        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="truncate">{tag.name}</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs ${
                        isActive ? "text-zinc-300" : "text-zinc-400"
                      }`}
                    >
                      {tag.usageCount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

/** Read active tag slugs from the current URL (client components). */
export function useStorefrontActiveTagSlugs(): string[] {
  const searchParams = useSearchParams();
  return parseStorefrontTagSlugs(searchParams.getAll("tag"));
}
