"use client";

import { supabase } from "@/lib/supabaseClient";
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
  error: string | null;

  fetchClaimedTemplates: (userId: string) => Promise<void>;
  addClaimedTemplate: (templateId: string) => void;
  reset: () => void;
};

const INITIAL: Pick<
  GameLibraryStore,
  "games" | "claimedTemplateIds" | "isLoading" | "error"
> = {
  games: [],
  claimedTemplateIds: new Set(),
  isLoading: false,
  error: null,
};

export const useGameLibraryStore = create<GameLibraryStore>((set, get) => ({
  ...INITIAL,

  fetchClaimedTemplates: async (userId: string) => {
    if (get().isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from("games")
        .select("id, slug, source_template_id")
        .eq("owner_id", userId);

      if (error) throw error;

      const games: ClaimedGame[] = (data ?? []).map((row) => ({
        id: row.id,
        slug: row.slug,
        sourceTemplateId: row.source_template_id,
      }));

      const ids = new Set(
        games
          .map((game) => game.sourceTemplateId)
          .filter((id): id is string => typeof id === "string"),
      );

      set({ games, claimedTemplateIds: ids, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load claimed games.",
      });
    }
  },

  addClaimedTemplate: (templateId: string) => {
    set((s) => ({
      claimedTemplateIds: new Set([...s.claimedTemplateIds, templateId]),
    }));
  },

  reset: () => set({ ...INITIAL, claimedTemplateIds: new Set() }),
}));
