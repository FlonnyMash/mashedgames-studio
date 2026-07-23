"use client";

import { projectApiFetch } from "@/lib/project-api-client";
import { create } from "state";

/** A claimed game record owned by the current user (public.games). */
export type ClaimedGame = {
  id: string;
  slug: string;
  sourceTemplateId: string | null;
};

type GameLibraryStore = {
  /** Full claimed game records for the current user. */
  games: ClaimedGame[];
  /** Template IDs the user has claimed into public.games. */
  claimedTemplateIds: Set<string>;
  isLoading: boolean;
  /** True once a fetch has completed at least once (success or failure). */
  hasLoaded: boolean;
  error: string | null;

  fetchClaimedTemplates: () => Promise<void>;
  addClaimedTemplate: (templateId: string) => void;
  reset: () => void;
};

const INITIAL: Pick<
  GameLibraryStore,
  "games" | "claimedTemplateIds" | "isLoading" | "hasLoaded" | "error"
> = {
  games: [],
  claimedTemplateIds: new Set(),
  isLoading: false,
  hasLoaded: false,
  error: null,
};

export const useGameLibraryStore = create<GameLibraryStore>((set, get) => ({
  ...INITIAL,

  fetchClaimedTemplates: async () => {
    if (get().isLoading) return;

    set({ isLoading: true, error: null });

    // Go through the server API (Bearer on web, IPC-proxied in Electron) rather
    // than the renderer's anon Supabase client: in the Electron desktop context
    // the renderer holds no session, so a direct public.games query would be
    // denied by RLS. Owner scoping is enforced server-side by RLS.
    const result = await projectApiFetch<{ games: ClaimedGame[] }>("/api/games");

    if (result.ok) {
      const games = result.games;
      const ids = new Set(
        games
          .map((game) => game.sourceTemplateId)
          .filter((id): id is string => typeof id === "string"),
      );
      set({ games, claimedTemplateIds: ids, isLoading: false, hasLoaded: true });
    } else {
      set({ isLoading: false, hasLoaded: true, error: result.error });
    }
  },

  addClaimedTemplate: (templateId: string) => {
    set((s) => ({
      claimedTemplateIds: new Set([...s.claimedTemplateIds, templateId]),
      hasLoaded: false,
    }));
  },

  reset: () => set({ ...INITIAL, claimedTemplateIds: new Set() }),
}));
