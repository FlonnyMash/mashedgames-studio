import type { Tables } from "@/lib/supabaseClient";

// ---------------------------------------------------------------------------
// Shared types for the Template Storefront feature
// ---------------------------------------------------------------------------

export type TemplateRow = Tables<"templates">;

export type EnrichedTemplate = TemplateRow & {
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
// Tier badge config
// ---------------------------------------------------------------------------

export const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  free: {
    label: "Free",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  premium: {
    label: "Pro",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  enterprise: {
    label: "Enterprise",
    cls: "bg-violet-50 text-violet-700 border-violet-200",
  },
};
