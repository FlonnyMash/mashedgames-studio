"use client";

import { supabase } from "@/lib/supabaseClient";
import { create } from "state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LicenseStore = {
  /**
   * The organization_id resolved from the signed-in user's profile row.
   * Populated by `fetchLicenses`; null until then.
   */
  organizationId: string | null;

  /**
   * Set of template IDs that have an active (non-expired) license for the
   * current user's organization.  Updated by `fetchLicenses` on load and by
   * `addLicense` for optimistic updates after self-service acquisition.
   */
  licensedTemplateIds: Set<string>;

  /** True while `fetchLicenses` is in flight. */
  isLoading: boolean;

  /** Last fetch error message, or null. */
  error: string | null;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Resolves the user's organization and fetches all active licenses.
   * Safe to call multiple times — sets `isLoading` guard to prevent parallel
   * fetches.  Clears previous error on each invocation.
   */
  fetchLicenses: (userId: string) => Promise<void>;

  /**
   * Optimistically marks a template as licensed in the local store without
   * waiting for a re-fetch.  Call immediately after a successful
   * `/api/acquire-license` response.
   */
  addLicense: (templateId: string) => void;

  /**
   * Resets all state to initial values.  Call on user sign-out.
   */
  reset: () => void;
};

// ---------------------------------------------------------------------------
// Initial state (extracted so reset() can reuse it)
// ---------------------------------------------------------------------------

const INITIAL: Pick<
  LicenseStore,
  "organizationId" | "licensedTemplateIds" | "isLoading" | "error"
> = {
  organizationId: null,
  licensedTemplateIds: new Set(),
  isLoading: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useLicenseStore = create<LicenseStore>((set, get) => ({
  ...INITIAL,

  fetchLicenses: async (userId: string) => {
    if (get().isLoading) return;

    set({ isLoading: true, error: null });

    try {
      // 1. Resolve the user's organization.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      const orgId = profile?.organization_id ?? null;

      if (!orgId) {
        set({ organizationId: null, licensedTemplateIds: new Set(), isLoading: false });
        return;
      }

      // 2. Fetch all licenses for the organization.
      const { data: licenses, error: licensesError } = await supabase
        .from("licenses")
        .select("template_id, valid_until")
        .eq("organization_id", orgId);

      if (licensesError) throw licensesError;

      // 3. Keep only non-expired licenses.
      const now = new Date();
      const activeIds = new Set(
        (licenses ?? [])
          .filter(
            (l) => l.valid_until === null || new Date(l.valid_until) > now,
          )
          .map((l) => l.template_id),
      );

      set({ organizationId: orgId, licensedTemplateIds: activeIds, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load licenses.",
      });
    }
  },

  addLicense: (templateId: string) => {
    set((s) => ({
      licensedTemplateIds: new Set([...s.licensedTemplateIds, templateId]),
    }));
  },

  reset: () => set({ ...INITIAL }),
}));
