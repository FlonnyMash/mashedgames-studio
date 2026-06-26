"use client";

import { supabase } from "@/lib/supabaseClient";
import { create } from "state";

type GameLibraryStore = {
  /** Template IDs the user has claimed into public.games. */
  claimedTemplateIds: Set<string>;
  isLoading: boolean;
  error: string | null;

  fetchClaimedTemplates: (userId: string) => Promise<void>;
  addClaimedTemplate: (templateId: string) => void;
  reset: () => void;
};

const INITIAL: Pick<GameLibraryStore, "claimedTemplateIds" | "isLoading" | "error"> = {
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
        .select("source_template_id")
        .eq("owner_id", userId)
        .not("source_template_id", "is", null);

      if (error) throw error;

      const ids = new Set(
        (data ?? [])
          .map((row) => row.source_template_id)
          .filter((id): id is string => typeof id === "string"),
      );

      set({ claimedTemplateIds: ids, isLoading: false });
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

  reset: () => set({ ...INITIAL }),
}));
