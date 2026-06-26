"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchPublishedTemplatesCatalog,
  type PublishedCatalogRow,
} from "@/lib/storefront-catalog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  buildStorefrontHref,
  parseStorefrontTagSlugs,
  storefrontTagSlugKey,
} from "@/lib/storefront-search-params";
import { canBrowseStoreWithoutAuth } from "@/lib/dev-store-access";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameLibraryStore } from "@/store/useGameLibraryStore";
import { useLicenseStore } from "@/store/useLicenseStore";
import { usePlatformStore } from "@/store/usePlatformStore";
import { StorefrontDetailsDialog } from "./StorefrontDetailsDialog";
import { StorefrontCatalogActionBar } from "./StorefrontCatalogActionBar";
import { StorefrontContextPanel } from "./StorefrontContextPanel";
import { StorefrontTagSidebar } from "./StorefrontTagSidebar";
import { TierRibbon, type TemplateTier } from "@/lib/tier-config";
import {
  applyStorefrontCatalogControls,
  parseManifest,
  parseStorefrontSortOption,
  slugToTitle,
  type EnrichedTemplate,
  type StorefrontSortOption,
} from "./storefront-types";

const STOREFRONT_GRID_WITH_SIDEBAR =
  "grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)_320px]";
const STOREFRONT_GRID_WITHOUT_SIDEBAR =
  "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]";
// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="h-40 bg-zinc-100" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 rounded bg-zinc-200" />
        <div className="h-3 w-full rounded bg-zinc-100" />
        <div className="h-3 w-2/3 rounded bg-zinc-100" />
        <div className="mt-4 h-8 w-full rounded-lg bg-zinc-200" />
      </div>
    </div>
  );
}

function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function StorefrontLayoutSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-zinc-100" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
        <div className="hidden h-64 animate-pulse rounded-xl bg-zinc-100 lg:block" />
        <SkeletonGrid count={4} />
        <div className="hidden space-y-4 lg:block">
          <div className="h-48 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-40 animate-pulse rounded-xl bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

const TEMPLATE_CARD_TIER_RIBBON =
  "pointer-events-none absolute top-4 -right-12 z-20 flex h-8 w-40 items-center justify-center border-transparent py-0 pt-0 text-[10px] font-bold uppercase leading-none tracking-wider whitespace-nowrap rotate-45 drop-shadow-sm";

function TemplateCard({
  template,
  atLicenseCap,
}: {
  template: EnrichedTemplate;
  atLicenseCap: boolean;
}) {
  const manifest = parseManifest(template.manifest);
  const displayName = manifest.displayName ?? slugToTitle(template.template_slug);
  const description = template.description || null;
  const imageUrl = template.thumbnail_url || null;
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setDetailOpen(true);
        }}
        className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
        aria-label={`View details for ${displayName}`}
      >
        {/* Thumbnail */}
        <div className="relative h-40 w-full overflow-hidden bg-zinc-100">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-zinc-300">
                <svg
                  className="h-10 w-10"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                  />
                </svg>
                <span className="text-xs font-mono">{template.template_slug}</span>
              </div>
            </div>
          )}

          {/* Lock overlay for unlicensed templates */}
          {!template.isLicensed ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-zinc-900/50 backdrop-blur-[2px]">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span className="text-[11px] font-semibold text-white">
                {atLicenseCap ? "License cap reached" : "Not licensed"}
              </span>
            </div>
          ) : null}

          <TierRibbon tier={template.tier} className={TEMPLATE_CARD_TIER_RIBBON} />
        </div>

        {/* Card body */}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-tight text-zinc-900">
              {displayName}
            </h3>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {template.isLicensed ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Owned
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  Locked
                </span>
              )}
            </div>
          </div>

          {description ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500">
              {description}
            </p>
          ) : (
            <p className="text-xs text-zinc-400">v{template.version}</p>
          )}

          <div className="mt-auto pt-3">
            <div className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-center text-xs font-medium text-zinc-600">
              View details →
            </div>
          </div>
        </div>
      </div>

      {detailOpen ? (
        <StorefrontDetailsDialog
          template={template}
          atLicenseCap={atLicenseCap}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dev-preview banner (DCE-eligible in production builds)
// ---------------------------------------------------------------------------

function DevPreviewBanner() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800"
    >
      <svg
        className="mt-px h-4 w-4 shrink-0 text-amber-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <span>
        <strong className="font-semibold">Dev Preview Mode</strong> — Supabase
        is not configured. Showing placeholder templates for local UI work only.
      </span>
    </div>
  );
}

type StorefrontTab = "store" | "my-games";

const STOREFRONT_TABS: { id: StorefrontTab; label: string }[] = [
  { id: "store", label: "Store" },
  { id: "my-games", label: "My Games" },
];

function StorefrontTabBar({
  activeTab,
  onTabChange,
  storeCount,
  myGamesCount,
}: {
  activeTab: StorefrontTab;
  onTabChange: (tab: StorefrontTab) => void;
  storeCount: number;
  myGamesCount: number;
}) {
  const counts: Record<StorefrontTab, number> = {
    store: storeCount,
    "my-games": myGamesCount,
  };

  return (
    <div
      role="tablist"
      aria-label="Store sections"
      className="flex gap-1 border-b border-zinc-200"
    >
      {STOREFRONT_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? "border-b-2 border-zinc-900 text-zinc-900"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          {tab.label}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              activeTab === tab.id
                ? "bg-zinc-100 text-zinc-700"
                : "bg-zinc-50 text-zinc-400"
            }`}
          >
            {counts[tab.id]}
          </span>
        </button>
      ))}
    </div>
  );
}

function TemplateGrid({
  templates,
  atLicenseCap,
  emptyState,
}: {
  templates: EnrichedTemplate[];
  atLicenseCap: boolean;
  emptyState: ReactNode;
}) {
  if (templates.length === 0) {
    return emptyState;
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {templates.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          atLicenseCap={atLicenseCap && !t.isLicensed}
        />
      ))}
    </div>
  );
}

function StoreSignInPrompt() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-12 text-center">
      <p className="text-sm font-medium text-zinc-800">Sign in to browse the live template catalog</p>
      <p className="mt-2 text-xs text-zinc-500">
        The store requires an authenticated session. Your profile menu appears
        after sign-in.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
      >
        Sign in
      </Link>
    </div>
  );
}

type TemplateStorefrontProps = {
  initialSearch?: string;
  initialSort?: StorefrontSortOption;
};

// ---------------------------------------------------------------------------
// Main storefront component
// ---------------------------------------------------------------------------

function enrichCatalogRows(
  rows: PublishedCatalogRow[],
  licensedIds: Set<string>,
): EnrichedTemplate[] {
  return rows.map((row) => ({
    ...row,
    isLicensed: licensedIds.has(row.id),
  }));
}

export function TemplateStorefront({
  initialSearch = "",
  initialSort = "newest",
}: TemplateStorefrontProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateParam = searchParams.get("template");
  const activeTagSlugs = useMemo(
    () => parseStorefrontTagSlugs(searchParams.getAll("tag")),
    [searchParams],
  );
  const activeTagSlugKey = useMemo(
    () => storefrontTagSlugKey(activeTagSlugs),
    [activeTagSlugs],
  );

  const userId = useAuthStore((s) => s.userId);
  // Guard against the brief window where AuthGuard is still resolving the
  // initial session.  Without this, `userId` is null → we'd show "Sign in"
  // before auth has finished, causing a hydration flash.
  const authIsLoading = useAuthStore((s) => s.isLoading);

  const devStorePreview = canBrowseStoreWithoutAuth();
  const maxTemplates = usePlatformStore((s) => s.features.maxTemplates);

  const licensedTemplateIds = useLicenseStore((s) => s.licensedTemplateIds);
  const claimedTemplateIds = useGameLibraryStore((s) => s.claimedTemplateIds);

  const [templates, setTemplates] = useState<EnrichedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDevPreview, setIsDevPreview] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [activeTab, setActiveTab] = useState<StorefrontTab>("store");
  const [tagFilterInvalid, setTagFilterInvalid] = useState(false);
  const [deepLinkTemplate, setDeepLinkTemplate] = useState<EnrichedTemplate | null>(null);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [sortBy, setSortBy] = useState<StorefrontSortOption>(initialSort);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    const nextHref = buildStorefrontHref({
      activeTagSlugs,
      search: debouncedSearch,
      sort: sortBy,
      template: templateParam,
    });
    const currentQuery = searchParams.toString();
    const currentHref = currentQuery
      ? `/dashboard/store?${currentQuery}`
      : "/dashboard/store";

    if (nextHref !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
  }, [
    activeTagSlugs,
    debouncedSearch,
    router,
    searchParams,
    sortBy,
    templateParam,
  ]);

  useEffect(() => {
    if (!userId && !devStorePreview) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(templates.length === 0);
      setError(null);
      setIsDevPreview(false);
      setNeedsSignIn(false);
      setTagFilterInvalid(false);

      try {
        let enriched: EnrichedTemplate[];
        let devPreview = false;

        if (typeof window !== "undefined" && window.electron) {
          type IpcResponse =
            | { ok: true; templates: EnrichedTemplate[]; _devPreview?: boolean }
            | { ok: false; error: string };

          const result = (await window.electron.ipcRenderer.invoke(
            "store:load-catalog",
            { tagSlugs: activeTagSlugs },
          )) as IpcResponse;

          if (!result.ok) {
            if (result.error === "NOT_AUTHENTICATED") {
              if (!cancelled) {
                setNeedsSignIn(true);
                setLoading(false);
              }
              return;
            }
            throw new Error(result.error ?? "Failed to load templates.");
          }

          enriched = result.templates;
          devPreview = result._devPreview === true;
        } else {
          if (userId) {
            await supabase.auth.refreshSession();
          }

          const [catalogResult] = await Promise.all([
            fetchPublishedTemplatesCatalog(activeTagSlugs),
            userId
              ? useLicenseStore.getState().fetchLicenses(userId)
              : Promise.resolve(),
            userId
              ? useGameLibraryStore.getState().fetchClaimedTemplates(userId)
              : Promise.resolve(),
          ]);

          if (!cancelled && catalogResult.tagInvalid) {
            setTagFilterInvalid(true);
          }

          const ids = useLicenseStore.getState().licensedTemplateIds;
          enriched = enrichCatalogRows(catalogResult.templates, ids);
        }

        if (!cancelled) {
          setTemplates(enriched);
          setIsDevPreview(devPreview);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load templates.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeTagSlugKey, devStorePreview, userId]);

  useEffect(() => {
    if (!templateParam || templates.length === 0) {
      setDeepLinkTemplate(null);
      return;
    }

    const match = templates.find(
      (t) => t.id === templateParam || t.template_slug === templateParam,
    );
    if (!match) {
      setDeepLinkTemplate(null);
      return;
    }

    setDeepLinkTemplate({
      ...match,
      isLicensed:
        match.isLicensed ||
        licensedTemplateIds.has(match.id) ||
        claimedTemplateIds.has(match.id),
    });
  }, [
    templateParam,
    templates,
    licensedTemplateIds,
    claimedTemplateIds,
  ]);

  const closeDeepLinkDialog = () => {
    setDeepLinkTemplate(null);
    router.replace(
      buildStorefrontHref({
        activeTagSlugs,
        search: debouncedSearch,
        sort: sortBy,
      }),
      { scroll: false },
    );
  };

  const storefrontGridClass = (showTagSidebar: boolean) =>
    showTagSidebar ? STOREFRONT_GRID_WITH_SIDEBAR : STOREFRONT_GRID_WITHOUT_SIDEBAR;

  // TODO: Connect to global auth/billing state once org plan → tier mapping is wired at layout level.
  const currentTier: TemplateTier = "premium";

  const contextPanelProps = {
    currentTier,
    activeTagSlugs,
  };

  const catalogActionBar = (
    <StorefrontCatalogActionBar
      sortBy={sortBy}
      onSortChange={setSortBy}
      searchQuery={searchInput}
      onSearchChange={setSearchInput}
      activeTagSlugs={activeTagSlugs}
      onClearTags={() => {
        router.replace(
          buildStorefrontHref({
            search: debouncedSearch,
            sort: sortBy,
            template: templateParam,
          }),
          { scroll: false },
        );
      }}
    />
  );

  // --- Loading skeleton — first load only; keep catalog visible while refetching ---
  const showInitialSkeleton =
    (loading && templates.length === 0) || (authIsLoading && templates.length === 0);

  if (showInitialSkeleton) {
    return <StorefrontLayoutSkeleton />;
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-medium text-red-700">Failed to load templates</p>
        <p className="mt-1 text-xs text-red-500">{error}</p>
      </div>
    );
  }

  // --- Sign-in required (Electron dev preview without main-process session) ---
  if (needsSignIn && !userId) {
    return <StoreSignInPrompt />;
  }

  // --- Unauthenticated (production only) ---
  if (!userId && !devStorePreview) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-12 text-center">
        <p className="text-sm font-medium text-zinc-600">Sign in to view templates</p>
      </div>
    );
  }

  // Merge live store state into the template list so that optimistic `addLicense`
  // calls from inside StorefrontDetailsDialog reflect immediately on the grid.
  const liveEnriched = templates.map((t) => ({
    ...t,
    isLicensed:
      t.isLicensed ||
      licensedTemplateIds.has(t.id) ||
      claimedTemplateIds.has(t.id),
  }));

  // --- Empty state ---
  if (liveEnriched.length === 0) {
    return (
      <div className="space-y-6">
        {isDevPreview && <DevPreviewBanner />}

        <StorefrontTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          storeCount={0}
          myGamesCount={0}
        />

        <div className={storefrontGridClass(activeTab === "store")}>
          {activeTab === "store" ? (
            <StorefrontTagSidebar activeTagSlugs={activeTagSlugs} />
          ) : null}

          <div className="min-w-0 space-y-6">
            {catalogActionBar}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-12 text-center">
              <p className="text-sm font-medium text-zinc-600">
                {debouncedSearch.trim()
                  ? "No templates match your search"
                  : tagFilterInvalid
                    ? "One or more selected tags were not found"
                    : activeTagSlugs.length > 0
                      ? "No templates found for the selected tags"
                      : "No templates available"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {debouncedSearch.trim()
                  ? "Try a different keyword or clear the search filter."
                  : tagFilterInvalid || activeTagSlugs.length > 0
                    ? "Try removing a tag filter or choose different tags."
                    : "Templates published by Mashed Games Studio will appear here."}
              </p>
            </div>
          </div>

          <StorefrontContextPanel
            {...contextPanelProps}
            featuredGames={[]}
          />
        </div>
      </div>
    );
  }

  // Apply the platform license cap: only the first `maxTemplates` licensed
  // templates count as active entitlements.
  const supabaseOwned = liveEnriched.filter((t) => t.isLicensed);
  const atLicenseCap = supabaseOwned.length >= maxTemplates;
  const cappedOwnedIds = new Set(
    supabaseOwned.slice(0, maxTemplates).map((t) => t.id),
  );

  const gatedTemplates = liveEnriched.map((t) => ({
    ...t,
    isLicensed: cappedOwnedIds.has(t.id),
  }));

  const owned = gatedTemplates.filter((t) => t.isLicensed);
  const featuredGames = gatedTemplates.slice(0, 3);
  const storeCatalogSource = gatedTemplates;
  const ownedCatalogSource = owned;
  const displayedStoreTemplates = applyStorefrontCatalogControls(
    storeCatalogSource,
    debouncedSearch,
    sortBy,
  );
  const displayedOwnedTemplates = applyStorefrontCatalogControls(
    ownedCatalogSource,
    debouncedSearch,
    sortBy,
  );

  return (
    <div className="space-y-6">
      {isDevPreview && <DevPreviewBanner />}

      <StorefrontTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        storeCount={displayedStoreTemplates.length}
        myGamesCount={displayedOwnedTemplates.length}
      />

      <div className={storefrontGridClass(activeTab === "store")}>
        {activeTab === "store" ? (
          <StorefrontTagSidebar activeTagSlugs={activeTagSlugs} />
        ) : null}

        <div className="min-w-0">
          {activeTab === "store" ? (
            <section role="tabpanel" aria-label="Store" className="space-y-6">
              {atLicenseCap && maxTemplates > 0 ? (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"
                >
                  <svg
                    className="mt-px h-4 w-4 shrink-0 text-amber-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    />
                  </svg>
                  <span>
                    <strong className="font-semibold">License cap reached</strong> —
                    your plan allows up to <strong>{maxTemplates}</strong> template
                    {maxTemplates === 1 ? "" : "s"}. Contact your account manager to
                    expand your entitlement.
                  </span>
                </div>
              ) : null}

              {catalogActionBar}

              <TemplateGrid
                templates={displayedStoreTemplates}
                atLicenseCap={atLicenseCap}
                emptyState={
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-12 text-center">
                    <p className="text-sm font-medium text-zinc-600">
                      {debouncedSearch.trim()
                        ? "No templates match your search"
                        : "No templates available"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {debouncedSearch.trim()
                        ? "Try a different keyword or clear the search filter."
                        : "Templates published by Mashed Games Studio will appear here."}
                    </p>
                  </div>
                }
              />
            </section>
          ) : (
            <section role="tabpanel" aria-label="My Games" className="space-y-6">
              {catalogActionBar}

              <TemplateGrid
                templates={displayedOwnedTemplates}
                atLicenseCap={false}
                emptyState={
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-12 text-center">
                    <p className="text-sm font-medium text-zinc-600">
                      {debouncedSearch.trim()
                        ? "No games match your search"
                        : "No games in your library yet"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {debouncedSearch.trim()
                        ? "Try a different keyword or clear the search filter."
                        : "Browse the Store to claim templates you have access to."}
                    </p>
                    {!debouncedSearch.trim() ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab("store")}
                        className="mt-6 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
                      >
                        Browse Store
                      </button>
                    ) : null}
                  </div>
                }
              />
            </section>
          )}
        </div>

        <StorefrontContextPanel
          {...contextPanelProps}
          featuredGames={featuredGames}
        />
      </div>

      {deepLinkTemplate ? (
        <StorefrontDetailsDialog
          template={deepLinkTemplate}
          atLicenseCap={atLicenseCap && !deepLinkTemplate.isLicensed}
          onClose={closeDeepLinkDialog}
        />
      ) : null}
    </div>
  );
}
