import { type NextRequest } from "next/server";
import {
  createAnonSupabaseClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";

export const runtime = "edge";

type GameRow = {
  id: string;
  slug: string;
  source_template_id: string | null;
};

function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "Authorization header with Bearer token required." },
    { status: 401 },
  );
}

/**
 * Lists the authenticated caller's claimed games (public.games).
 *
 * The renderer's anon Supabase client cannot query public.games directly in the
 * Electron desktop context (tokens live in the main process, so the client has
 * no auth.uid()). This route runs server-side with the caller's Bearer token,
 * and owner scoping is enforced by RLS on public.games (see 00003).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) return loaded.response;
  const env = loaded.env;

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) return unauthorized();

  const caller = await verifyAuthenticatedCaller(bearerToken, env);
  if ("error" in caller) {
    return Response.json({ ok: false, error: caller.error }, { status: caller.status });
  }

  const supabase = createAnonSupabaseClient(env, bearerToken);
  const { data, error } = await supabase
    .from("games")
    .select("id, slug, source_template_id")
    .eq("owner_id", caller.userId)
    .order("created_at", { ascending: true })
    .returns<GameRow[]>();

  if (error) {
    console.error("[games] list lookup error:", error.message);
    return Response.json({ ok: false, error: "Failed to load claimed games." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    games: (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      sourceTemplateId: row.source_template_id,
    })),
  });
}
