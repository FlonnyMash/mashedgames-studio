"use client";

import { WebhookIntegrationPanel } from "@/components/integrations/WebhookIntegrationPanel";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameLibraryStore } from "@/store/useGameLibraryStore";
import { useEffect, useMemo, useState } from "react";

/**
 * Developer / Integrations section. Webhook settings live on public.games
 * rows, so this resolves the caller's claimed games and lets them pick which
 * game's webhook to configure.
 */
export function WebhookIntegrationsSection() {
  const userId = useAuthStore((s) => s.userId);
  const games = useGameLibraryStore((s) => s.games);
  const isLoading = useGameLibraryStore((s) => s.isLoading);
  const fetchClaimedTemplates = useGameLibraryStore((s) => s.fetchClaimedTemplates);

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  useEffect(() => {
    if (userId && games.length === 0 && !isLoading) {
      void fetchClaimedTemplates(userId);
    }
  }, [userId, games.length, isLoading, fetchClaimedTemplates]);

  useEffect(() => {
    if (!selectedGameId && games.length > 0) {
      setSelectedGameId(games[0]!.id);
    }
  }, [games, selectedGameId]);

  const selected = useMemo(
    () => games.find((g) => g.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  return (
    <section className="space-y-3">
      <div>
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Developer / Integrations
        </p>
        <p className="text-xs text-zinc-500">
          Connect a game to your own CRM via signed webhooks.
        </p>
      </div>

      {!userId ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          Sign in on the web dashboard to manage webhook integrations.
        </div>
      ) : isLoading && games.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-500">
          Loading your games...
        </div>
      ) : games.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          Claim a game from the store to configure its webhook integration.
        </div>
      ) : (
        <div className="space-y-3">
          {games.length > 1 ? (
            <select
              value={selectedGameId ?? ""}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-400 focus:outline-none"
            >
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.slug}
                </option>
              ))}
            </select>
          ) : null}

          {selected ? (
            <WebhookIntegrationPanel key={selected.id} gameId={selected.id} />
          ) : null}
        </div>
      )}
    </section>
  );
}
