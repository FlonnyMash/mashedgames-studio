"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  getUnlockedTiers,
  TierBadge,
  type TemplateTier,
} from "@/lib/tier-config";
import { buildStorefrontHref } from "@/lib/storefront-search-params";
import {
  parseManifest,
  slugToTitle,
  type EnrichedTemplate,
} from "./storefront-types";

type StorefrontContextPanelProps = {
  currentTier: TemplateTier;
  featuredGames?: EnrichedTemplate[];
  activeTagSlugs?: string[];
};

function buildTemplateHref(
  templateId: string,
  activeTagSlugs: string[] = [],
): string {
  return buildStorefrontHref({
    activeTagSlugs,
    template: templateId,
  });
}

function WorkspaceAccessWidget({ currentTier }: { currentTier: TemplateTier }) {
  const unlockedTiers = getUnlockedTiers(currentTier);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Workspace Access
      </h3>

      <div className="mt-4">
        <p className="text-xs font-medium text-zinc-500">Current plan</p>
        <div className="mt-2">
          <TierBadge tier={currentTier} />
        </div>
      </div>

      <div className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-xs font-medium text-zinc-500">Unlocks</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unlockedTiers.map((tier) => (
            <TierBadge key={tier} tier={tier} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AiConsultantWidget() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-zinc-900">
        AI Advergaming Consultant
      </h3>
      <p className="mt-1 text-xs text-zinc-500">Coming soon</p>

      <p className="mt-4 text-xs leading-relaxed text-zinc-600">
        Match campaign goals to high-performing game mechanics before you commit
        budget.
      </p>

      <div className="mt-4 space-y-3">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <p className="text-xs text-zinc-400">
            Ask AI which game fits your Q3 campaign…
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Consult AI
        </button>
      </div>
    </div>
  );
}

function FeaturedGamesWidget({
  games,
  activeTagSlugs,
}: {
  games: EnrichedTemplate[];
  activeTagSlugs?: string[];
}) {
  if (games.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Featured Games
      </h3>

      <ul className="mt-4 divide-y divide-zinc-100">
        {games.map((game) => {
          const manifest = parseManifest(game.manifest);
          const displayName =
            manifest.displayName ?? slugToTitle(game.template_slug);
          const thumbnail = game.thumbnail_url || null;
          const href = buildTemplateHref(game.id, activeTagSlugs);

          return (
            <li key={game.id}>
              <Link
                href={href}
                scroll={false}
                className="group flex items-center gap-3 py-3.5 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-100">
                  {thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>

                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                  {displayName}
                </span>

                <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400 transition-colors group-hover:text-zinc-700">
                  View
                  <ArrowRight
                    className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StorefrontContextPanel({
  currentTier,
  featuredGames = [],
  activeTagSlugs = [],
}: StorefrontContextPanelProps) {
  const visibleGames = featuredGames.slice(0, 3);

  return (
    <aside
      className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:w-[320px] lg:shrink-0 lg:self-start lg:overflow-y-auto"
      aria-label="Store tools"
    >
      <WorkspaceAccessWidget currentTier={currentTier} />
      <AiConsultantWidget />
      <FeaturedGamesWidget games={visibleGames} activeTagSlugs={activeTagSlugs} />
    </aside>
  );
}
