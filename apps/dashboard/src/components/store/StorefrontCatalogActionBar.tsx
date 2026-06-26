"use client";

import { Search } from "lucide-react";
import type { StorefrontSortOption } from "./storefront-types";

type StorefrontCatalogActionBarProps = {
  sortBy: StorefrontSortOption;
  onSortChange: (value: StorefrontSortOption) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeTagSlugs?: string[];
  onClearTags?: () => void;
};

export function StorefrontCatalogActionBar({
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
  activeTagSlugs = [],
  onClearTags,
}: StorefrontCatalogActionBarProps) {
  const hasTagFilters = activeTagSlugs.length > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-zinc-200 pb-4">
      <label className="relative block min-w-0 flex-1 basis-48">
        <span className="sr-only">Search templates</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search templates..."
          className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
        />
      </label>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {hasTagFilters ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>
              Filtered by{" "}
              <span className="font-mono text-zinc-700">
                {activeTagSlugs.join(", ")}
              </span>
            </span>
            {onClearTags ? (
              <button
                type="button"
                onClick={onClearTags}
                className="text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-700 hover:underline"
              >
                Reset
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <label htmlFor="storefront-sort" className="text-xs text-zinc-500">
            Sort by
          </label>
          <select
            id="storefront-sort"
            value={sortBy}
            onChange={(event) =>
              onSortChange(event.target.value as StorefrontSortOption)
            }
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="popular">Popular</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </div>
      </div>
    </div>
  );
}
