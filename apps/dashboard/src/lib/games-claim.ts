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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves an engine template identifier to a `public.templates` uuid suitable
 * for `games.source_template_id`.
 *
 * The identifier is normally the template_slug (e.g. "lucky-wheel"), but some
 * callers may already pass a uuid. Returns undefined when the slug is not in
 * the registry so the caller can create an unlinked games row rather than fail.
 *
 * Shared by the configurator project-creation and Cloudflare deploy routes so
 * both resolve the same registry uuid for a given engine template.
 */
export async function resolveSourceTemplateId(
  supabase: ReturnType<typeof createAnonSupabaseClient>,
  templateIdentifier: string,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("templates")
    .select("id")
    .eq("template_slug", templateIdentifier)
    .maybeSingle();

  if (!error && data?.id) {
    return data.id;
  }

  // Already a uuid (e.g. storefront-originated flows) — use as-is.
  if (UUID_RE.test(templateIdentifier)) {
    return templateIdentifier;
  }

  return undefined;
}

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
