"use client";

import { create } from "state";
import {
  fetchPublishedTemplatesCatalog,
} from "@/lib/storefront-catalog";
import { storefrontTagSlugKey } from "@/lib/storefront-search-params";
import { canBrowseStoreWithoutAuth } from "@/lib/dev-store-access";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameLibraryStore } from "@/store/useGameLibraryStore";
import { useLicenseStore } from "@/store/useLicenseStore";
import type { EnrichedTemplate } from "@/components/store/storefront-types";

export type StoreCatalogCacheEntry = {
  templates: EnrichedTemplate[];
  isDevPreview: boolean;
  tagInvalid: boolean;
  fetchedAt: number;
};

type StoreCatalogStore = {
  byTagKey: Record<string, StoreCatalogCacheEntry>;
  inFlight: Record<string, Promise<StoreCatalogCacheEntry> | undefined>;

  getCached: (tagSlugs: string[]) => StoreCatalogCacheEntry | null;
  setCached: (
    tagSlugs: string[],
    entry: Omit<StoreCatalogCacheEntry, "fetchedAt">,
  ) => void;
  /**
   * Loads the catalog for the given tags. Reuses in-flight requests and returns
   * cached data when present unless `force` is set. Always refreshes network
   * when forced or when cache is empty.
   */
  loadCatalog: (
    tagSlugs?: string[],
    options?: { force?: boolean },
  ) => Promise<StoreCatalogCacheEntry>;
  prefetch: (tagSlugs?: string[]) => void;
  reset: () => void;
};

function enrichCatalogRows(
  rows: Awaited<ReturnType<typeof fetchPublishedTemplatesCatalog>>["templates"],
  licensedIds: Set<string>,
): EnrichedTemplate[] {
  return rows.map((row) => ({
    ...row,
    isLicensed: row.id != null && licensedIds.has(row.id),
  }));
}

async function fetchCatalogEntry(
  tagSlugs: string[],
): Promise<Omit<StoreCatalogCacheEntry, "fetchedAt">> {
  const userId = useAuthStore.getState().userId;
  const devStorePreview = canBrowseStoreWithoutAuth();

  if (!userId && !devStorePreview) {
    return {
      templates: [],
      isDevPreview: false,
      tagInvalid: false,
    };
  }

  if (typeof window !== "undefined" && window.electron) {
    type IpcResponse =
      | { ok: true; templates: EnrichedTemplate[]; _devPreview?: boolean }
      | { ok: false; error: string };

    const result = (await window.electron.ipcRenderer.invoke(
      "store:load-catalog",
      { tagSlugs },
    )) as IpcResponse;

    if (!result.ok) {
      if (result.error === "NOT_AUTHENTICATED") {
        const err = new Error("NOT_AUTHENTICATED");
        throw err;
      }
      throw new Error(result.error ?? "Failed to load templates.");
    }

    return {
      templates: result.templates,
      isDevPreview: result._devPreview === true,
      tagInvalid: false,
    };
  }

  if (userId) {
    await supabase.auth.refreshSession();
  }

  const [catalogResult] = await Promise.all([
    fetchPublishedTemplatesCatalog(tagSlugs),
    userId
      ? useLicenseStore.getState().fetchLicenses(userId)
      : Promise.resolve(),
    userId
      ? useGameLibraryStore.getState().fetchClaimedTemplates()
      : Promise.resolve(),
  ]);

  const ids = useLicenseStore.getState().licensedTemplateIds;
  return {
    templates: enrichCatalogRows(catalogResult.templates, ids),
    isDevPreview: false,
    tagInvalid: catalogResult.tagInvalid,
  };
}

export const useStoreCatalogStore = create<StoreCatalogStore>((set, get) => ({
  byTagKey: {},
  inFlight: {},

  getCached: (tagSlugs) => {
    const key = storefrontTagSlugKey(tagSlugs);
    return get().byTagKey[key] ?? null;
  },

  setCached: (tagSlugs, entry) => {
    const key = storefrontTagSlugKey(tagSlugs);
    set((state) => ({
      byTagKey: {
        ...state.byTagKey,
        [key]: { ...entry, fetchedAt: Date.now() },
      },
    }));
  },

  loadCatalog: async (tagSlugs = [], options = {}) => {
    const key = storefrontTagSlugKey(tagSlugs);
    const cached = get().byTagKey[key];

    if (!options.force && cached) {
      // Soft refresh in background; return stale immediately.
      if (!get().inFlight[key]) {
        const refresh = fetchCatalogEntry(tagSlugs)
          .then((entry) => {
            const next = { ...entry, fetchedAt: Date.now() };
            set((state) => ({
              byTagKey: { ...state.byTagKey, [key]: next },
              inFlight: { ...state.inFlight, [key]: undefined },
            }));
            return next;
          })
          .catch(() => {
            set((state) => ({
              inFlight: { ...state.inFlight, [key]: undefined },
            }));
            return cached;
          });
        set((state) => ({
          inFlight: { ...state.inFlight, [key]: refresh },
        }));
      }
      return cached;
    }

    const existing = get().inFlight[key];
    if (existing) {
      return existing;
    }

    const request = fetchCatalogEntry(tagSlugs)
      .then((entry) => {
        const next = { ...entry, fetchedAt: Date.now() };
        set((state) => ({
          byTagKey: { ...state.byTagKey, [key]: next },
          inFlight: { ...state.inFlight, [key]: undefined },
        }));
        return next;
      })
      .catch((err) => {
        set((state) => ({
          inFlight: { ...state.inFlight, [key]: undefined },
        }));
        throw err;
      });

    set((state) => ({
      inFlight: { ...state.inFlight, [key]: request },
    }));

    return request;
  },

  prefetch: (tagSlugs = []) => {
    void get().loadCatalog(tagSlugs).catch(() => {
      // Prefetch failures are non-fatal.
    });
  },

  reset: () => set({ byTagKey: {}, inFlight: {} }),
}));
