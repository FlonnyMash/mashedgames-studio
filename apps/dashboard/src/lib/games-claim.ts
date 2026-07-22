import { DEFAULT_GAME_CONFIG } from "@mashedgames/shared";
import type { createAnonSupabaseClient } from "@/lib/supabase-auth";
import type { Tables, TablesInsert } from "@/lib/supabaseClient";

/**
 * Idempotent find-or-create for a `public.games` row.
 *
 * Shared by the storefront claim route and the configurator project-creation
 * route so both surfaces resolve the SAME `games.id` for a given
 * (owner, source_template_id) pair. This is the durable link that lets a local
 * workspace project (`projectId`) persist its Supabase `games.id` into
 * `project.json` / `client.json`.
 *
 * Never throws: returns a discriminated result so callers can decide whether a
 * failure is fatal (claim) or non-fatal (project creation).
 */

export type EnsureClaimedGameParams = {
  ownerId: string;
  slug: string;
  templateId?: string;
};

export type EnsureClaimedGameResult =
  | { ok: true; game: Tables<"games"> }
  | { ok: false; error: string; status: 400 | 500 };

function insertErrorStatus(error: { code?: string }): 400 | 500 {
  // 23505 = unique violation, 42501 = RLS/permission — both are caller-fixable.
  if (error.code === "23505" || error.code === "42501") return 400;
  return 500;
}

export async function ensureClaimedGameRow(
  supabase: ReturnType<typeof createAnonSupabaseClient>,
  params: EnsureClaimedGameParams,
): Promise<EnsureClaimedGameResult> {
  const { ownerId, slug, templateId } = params;

  if (templateId) {
    // A game is uniquely a claim of (owner, template). Reuse the existing row
    // so repeated claims / project creations stay idempotent.
    const { data: existing, error: existingError } = await supabase
      .from("games")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("source_template_id", templateId)
      .maybeSingle();

    if (existingError) {
      console.error("[games-claim] Existing game lookup error:", existingError);
      return {
        ok: false,
        error: existingError.message,
        status: insertErrorStatus(existingError),
      };
    }

    if (existing) {
      return { ok: true, game: existing };
    }
  }

  const row: TablesInsert<"games"> = {
    owner_id: ownerId,
    slug,
    config: DEFAULT_GAME_CONFIG,
    ...(templateId ? { source_template_id: templateId } : {}),
  };

  const { data, error } = await supabase
    .from("games")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error("[games-claim] Insert error:", error);
    return {
      ok: false,
      error: error.message,
      status: insertErrorStatus(error),
    };
  }

  return { ok: true, game: data };
}
