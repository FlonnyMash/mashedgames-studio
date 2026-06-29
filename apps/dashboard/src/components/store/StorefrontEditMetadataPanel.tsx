"use client";

import { TemplateTagSelector } from "@/components/admin/TemplateTagSelector";
import { getBadgeStyle, type BadgeType } from "@/lib/badge-config";
import type { TemplateTier } from "@/lib/tier-config";
import { BADGE_TYPES } from "@mashedgames/shared";
import { Settings2, X } from "lucide-react";

const TIER_OPTIONS: { value: TemplateTier; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "premium", label: "Premium" },
  { value: "enterprise", label: "Enterprise" },
];

export function StorefrontEditMetadataPanel({
  open,
  onClose,
  templateSlug,
  tier,
  badgeType,
  onTierChange,
  onBadgeTypeChange,
  onTagsDirtyChange,
  onTagIdsChange,
}: {
  open: boolean;
  onClose: () => void;
  templateSlug: string;
  tier: TemplateTier;
  badgeType: BadgeType | null;
  onTierChange: (tier: TemplateTier) => void;
  onBadgeTypeChange: (badge: BadgeType | null) => void;
  onTagsDirtyChange: (dirty: boolean) => void;
  onTagIdsChange: (tagIds: string[]) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed right-4 top-20 z-40 w-[min(100vw-2rem,360px)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur-md">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <Settings2 className="h-4 w-4 text-zinc-400" aria-hidden />
          Metadata
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          aria-label="Close metadata panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="max-h-[min(60vh,520px)] space-y-5 overflow-y-auto p-4">
        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            License tier
          </span>
          <select
            value={tier}
            onChange={(e) => onTierChange(e.target.value as TemplateTier)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            {TIER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Badge
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onBadgeTypeChange(null)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                badgeType === null
                  ? "border-white bg-white text-zinc-900"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              None
            </button>
            {BADGE_TYPES.map((type) => {
              const style = getBadgeStyle(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onBadgeTypeChange(type)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    badgeType === type
                      ? `${style?.ribbonClass ?? ""} border-transparent`
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {style?.label ?? type}
                </button>
              );
            })}
          </div>
        </div>

        <TemplateTagSelector
          templateSlug={templateSlug}
          mode="unified"
          onDirtyChange={onTagsDirtyChange}
          onSelectionChange={onTagIdsChange}
        />
      </div>
    </div>
  );
}
