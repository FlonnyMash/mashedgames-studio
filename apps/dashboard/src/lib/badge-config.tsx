"use client";

import type { ReactNode } from "react";
import {
  BADGE_CONFIG,
  isBadgeType,
  type BadgeType,
} from "@mashedgames/shared";

export type { BadgeType };

export { BADGE_CONFIG, isBadgeType };

export const TEMPLATE_CARD_BADGE_RIBBON =
  "pointer-events-none absolute top-4 -right-12 z-20 flex h-8 w-40 items-center justify-center border-transparent py-0 pt-0 text-[10px] font-bold uppercase leading-none tracking-wider whitespace-nowrap rotate-45 drop-shadow-sm";

/** Static Tailwind literals — must live in dashboard for JIT (shared is not @source-scanned). */
const BADGE_RIBBON_CLASSES: Record<BadgeType, string> = {
  NEW: "border-0 bg-yellow-400 text-yellow-950",
  POPULAR: "border-0 bg-orange-500 text-white",
  HOT: "border-0 bg-amber-400 text-amber-950",
};

export function getBadgeStyle(badgeType: BadgeType | string | null | undefined) {
  if (badgeType == null || !isBadgeType(badgeType)) {
    return null;
  }

  return {
    label: BADGE_CONFIG[badgeType].label,
    ribbonClass: BADGE_RIBBON_CLASSES[badgeType],
  };
}

type BadgeRibbonProps = {
  badgeType: BadgeType | string | null | undefined;
  className: string;
  children?: ReactNode;
};

export function BadgeRibbon({ badgeType, className, children }: BadgeRibbonProps) {
  const style = getBadgeStyle(badgeType);
  if (!style) return null;

  return (
    <span className={`${style.ribbonClass} ${className}`}>
      {children ?? style.label}
    </span>
  );
}

const BADGE_PILL_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap";

type BadgePillProps = {
  badgeType: BadgeType | string | null | undefined;
  className?: string;
};

export function BadgePill({ badgeType, className }: BadgePillProps) {
  const style = getBadgeStyle(badgeType);
  if (!style) return null;

  const classes = className
    ? `${BADGE_PILL_BASE} ${style.ribbonClass} ${className}`
    : `${BADGE_PILL_BASE} ${style.ribbonClass}`;

  return <span className={classes}>{style.label}</span>;
}
