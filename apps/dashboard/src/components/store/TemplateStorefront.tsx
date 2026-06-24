"use client";

import { useEffect, useState } from "react";
import { canBrowseStoreWithoutAuth } from "@/lib/dev-store-access";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useLicenseStore } from "@/store/useLicenseStore";
import { usePlatformStore } from "@/store/usePlatformStore";
import { StorefrontDetailsDialog } from "./StorefrontDetailsDialog";
import {
  parseManifest,
  slugToTitle,
  TIER_BADGE,
  type EnrichedTemplate,
} from "./storefront-types";

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
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

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
  const tierInfo = TIER_BADGE[template.tier] ?? TIER_BADGE.premium;
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
        className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 ${
          template.isLicensed ? "border-zinc-200" : "border-zinc-200 opacity-80"
        }`}
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
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-zinc-900/50 backdrop-blur-[2px]">
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
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tierInfo.cls}`}
              >
                {tierInfo.label}
              </span>
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
        <strong className="font-semibold">Dev Preview Mode</strong> — The
        template catalog shown below is placeholder data. Supabase credentials
        are not configured for this local build. Set{" "}
        <code className="rounded bg-amber-100 px-1 font-mono">
          devStorePreview: true
        </code>{" "}
        in{" "}
        <code className="rounded bg-amber-100 px-1 font-mono">
          dev-runtime-override.json
        </code>{" "}
        alongside real credentials to browse the live catalog.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main storefront component
// ---------------------------------------------------------------------------

export function TemplateStorefront() {
  const userId = useAuthStore((s) => s.userId);
  // Guard against the brief window where AuthGuard is still resolving the
  // initial session.  Without this, `userId` is null → we'd show "Sign in"
  // before auth has finished, causing a hydration flash.
  const authIsLoading = useAuthStore((s) => s.isLoading);

  const devStorePreview = canBrowseStoreWithoutAuth();
  const maxTemplates = usePlatformStore((s) => s.features.maxTemplates);

  const fetchLicenses = useLicenseStore((s) => s.fetchLicenses);
  const licensedTemplateIds = useLicenseStore((s) => s.licensedTemplateIds);

  const [templates, setTemplates] = useState<EnrichedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDevPreview, setIsDevPreview] = useState(false);

  useEffect(() => {
    if (!userId && !devStorePreview) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadViaIpc(): Promise<{ templates: EnrichedTemplate[]; devPreview: boolean }> {
      type IpcResponse =
        | { ok: true; templates: EnrichedTemplate[]; _devPreview?: boolean }
        | { ok: false; error: string };

      const result = (await window.electron!.ipcRenderer.invoke(
        "store:load-catalog",
      )) as IpcResponse;

      if (!result.ok) {
        throw new Error(result.error ?? "Failed to load templates.");
      }

      return {
        templates: result.templates,
        devPreview: result._devPreview === true,
      };
    }

    async function loadTemplatesCatalog() {
      const { data, error: err } = await supabase
        .from("templates")
        .select(
          "id, template_slug, tier, version, manifest, published_at, is_latest, storage_key, checksum, bundle_signature, yanked, description, tutorial, thumbnail_url, preview_urls",
        )
        .eq("is_latest", true)
        .eq("yanked", false)
        .order("published_at", { ascending: false });

      if (err) throw err;
      return data ?? [];
    }

    async function load() {
      setLoading(true);
      setError(null);
      setIsDevPreview(false);

      try {
        let enriched: EnrichedTemplate[];
        let devPreview = false;

        if (typeof window !== "undefined" && window.electron) {
          // Electron: route through IPC so the main process uses its
          // authenticated JWT — the renderer's Supabase client is anon-only.
          const ipcResult = await loadViaIpc();
          enriched = ipcResult.templates;
          devPreview = ipcResult.devPreview;
        } else {
          // Web: fetch templates and licenses in parallel.
          const [catalog] = await Promise.all([
            loadTemplatesCatalog(),
            userId ? fetchLicenses(userId) : Promise.resolve(),
          ]);

          const ids = useLicenseStore.getState().licensedTemplateIds;

          enriched = catalog.map((template) => ({
            ...template,
            isLicensed: ids.has(template.id),
          }));
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
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [devStorePreview, userId, fetchLicenses]);

  // --- Loading skeleton — covers both auth resolution and data fetch ---
  if (loading || authIsLoading) {
    return <SkeletonGrid count={6} />;
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
    isLicensed: t.isLicensed || licensedTemplateIds.has(t.id),
  }));

  // --- Empty state ---
  if (liveEnriched.length === 0) {
    return (
      <div className="space-y-4">
        {isDevPreview && <DevPreviewBanner />}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No templates available</p>
          <p className="mt-1 text-xs text-zinc-400">
            Templates published by Mashed Games Studio will appear here.
          </p>
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
  const locked = gatedTemplates.filter((t) => !t.isLicensed);

  return (
    <div className="space-y-10">
      {isDevPreview && <DevPreviewBanner />}

      {/* License cap notice */}
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
            <strong className="font-semibold">License cap reached</strong> — your
            plan allows up to <strong>{maxTemplates}</strong> template
            {maxTemplates === 1 ? "" : "s"}. Contact your account manager to
            expand your entitlement.
          </span>
        </div>
      ) : null}

      {owned.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Your Games</h2>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {owned.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {owned.map((t) => (
              <TemplateCard key={t.id} template={t} atLicenseCap={false} />
            ))}
          </div>
        </section>
      )}

      {locked.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-500">
              Locked / Upgrade Required
            </h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
              {locked.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {locked.map((t) => (
              <TemplateCard key={t.id} template={t} atLicenseCap={atLicenseCap} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
