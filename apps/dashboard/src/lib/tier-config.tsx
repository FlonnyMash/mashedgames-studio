"use client";

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Tier styling — static Tailwind literals only (JIT-safe)
// ---------------------------------------------------------------------------

export type TemplateTier = "free" | "premium" | "enterprise";

export type TierStyle = {
  label: string;
  badgeClass: string;
};

export const TIER_ORDER: readonly TemplateTier[] = [
  "free",
  "premium",
  "enterprise",
] as const;

export const TIER_CONFIG: Record<TemplateTier, TierStyle> = {
  free: {
    label: "Free",
    badgeClass:
      "border-0 bg-slate-200 text-slate-950 dark:bg-slate-800 dark:text-slate-50",
  },
  premium: {
    label: "Pro",
    badgeClass:
      "border-0 bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-50",
  },
  enterprise: {
    label: "Enterprise",
    badgeClass:
      "border-0 bg-indigo-100 text-indigo-950 dark:bg-indigo-900 dark:text-indigo-50",
  },
};

const TIER_SET = new Set<string>(TIER_ORDER);

export function isTemplateTier(value: string): value is TemplateTier {
  return TIER_SET.has(value);
}

export function getTierStyle(tier: TemplateTier | string): TierStyle {
  if (isTemplateTier(tier)) {
    return TIER_CONFIG[tier];
  }
  return TIER_CONFIG.premium;
}

export function getUnlockedTiers(currentTier: TemplateTier): TemplateTier[] {
  const index = TIER_ORDER.indexOf(currentTier);
  if (index < 0) return ["free"];
  return TIER_ORDER.slice(0, index + 1);
}

// ---------------------------------------------------------------------------
// Shared tier badge presenter
// ---------------------------------------------------------------------------

const TIER_BADGE_BASE =
  "inline-flex items-center border-0 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap";

type TierBadgeProps = {
  tier: TemplateTier | string;
  className?: string;
  children?: ReactNode;
};

export function TierBadge({ tier, className, children }: TierBadgeProps) {
  const style = getTierStyle(tier);
  const classes = className
    ? `${TIER_BADGE_BASE} ${style.badgeClass} ${className}`
    : `${TIER_BADGE_BASE} ${style.badgeClass}`;

  return <span className={classes}>{children ?? style.label}</span>;
}

// ---------------------------------------------------------------------------
// Ownership status badge — storefront card metadata row
// ---------------------------------------------------------------------------

type OwnershipBadgeProps = {
  owned: boolean;
  className?: string;
};

export function OwnershipBadge({ owned, className }: OwnershipBadgeProps) {
  if (!owned) return null;

  const classes = className
    ? `${TIER_BADGE_BASE} bg-emerald-50 text-emerald-800 ${className}`
    : `${TIER_BADGE_BASE} bg-emerald-50 text-emerald-800`;

  return <span className={classes}>Owned</span>;
}

// ---------------------------------------------------------------------------
// Diagonal corner ribbon — template card thumbnails (layout set by consumer)
// ---------------------------------------------------------------------------

type TierRibbonProps = {
  tier: TemplateTier | string;
  className: string;
};

export function TierRibbon({ tier, className }: TierRibbonProps) {
  const style = getTierStyle(tier);
  return (
    <span className={`${style.badgeClass} ${className}`}>{style.label}</span>
  );
}
