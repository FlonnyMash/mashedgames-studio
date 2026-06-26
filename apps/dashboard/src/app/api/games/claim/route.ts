import {
  DEFAULT_GAME_CONFIG,
  GameClaimSchema,
  type GameClaim,
} from "@mashedgames/shared";
import { type NextRequest, NextResponse } from "next/server";
import {
  createAnonSupabaseClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";
import type { Tables, TablesInsert } from "@/lib/supabaseClient";

export const runtime = "edge";

type ClaimSuccessResponse = { ok: true; game: Tables<"games"> };
type ClaimErrorResponse = { ok: false; error: string };

type InsertResult =
  | { ok: true; game: Tables<"games"> }
  | { ok: false; error: string; status: 400 | 500 };

function insertErrorStatus(error: { code?: string }): 400 | 500 {
  if (error.code === "23505" || error.code === "42501") return 400;
  return 500;
}

async function insertClaimedGame(
  supabase: ReturnType<typeof createAnonSupabaseClient>,
  claim: GameClaim,
): Promise<InsertResult> {
  if (claim.templateId) {
    // TODO: Fetch default config from templateId and use it as base config
    const { data: existing, error: existingError } = await supabase
      .from("games")
      .select("*")
      .eq("owner_id", claim.targetOwnerId)
      .eq("source_template_id", claim.templateId)
      .maybeSingle();

    if (existingError) {
      console.error("[games/claim] Existing game lookup error:", existingError);
      return {
        ok: false,
        error: existingError.message,
        status: insertErrorStatus(existingError),
      };
    }

    if (existing) {
      return { ok: true, game: existing };
    }
  } else {
    // TODO: Fetch real ephemeral config using payload.temporaryConfigId
  }

  const config = DEFAULT_GAME_CONFIG;

  const row: TablesInsert<"games"> = {
    owner_id: claim.targetOwnerId,
    slug: claim.slug,
    config,
    ...(claim.templateId ? { source_template_id: claim.templateId } : {}),
  };

  const { data, error } = await supabase
    .from("games")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error("[games/claim] Insert error:", error);
    return {
      ok: false,
      error: error.message,
      status: insertErrorStatus(error),
    };
  }

  return { ok: true, game: data };
}

export async function POST(
  request: NextRequest,
): Promise<Response> {
  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) return loaded.response;
  const env = loaded.env;

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) {
    return Response.json(
      { ok: false, error: "Authorization header with Bearer token required." } satisfies ClaimErrorResponse,
      { status: 401 },
    );
  }

  const caller = await verifyAuthenticatedCaller(bearerToken, env);
  if ("error" in caller) {
    return Response.json(
      { ok: false, error: caller.error } satisfies ClaimErrorResponse,
      { status: caller.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body." } satisfies ClaimErrorResponse,
      { status: 400 },
    );
  }

  const parsed = GameClaimSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.errors.map((e) => e.message).join("; ") } satisfies ClaimErrorResponse,
      { status: 400 },
    );
  }

  if (parsed.data.targetOwnerId !== caller.userId) {
    return Response.json(
      { ok: false, error: "Forbidden: targetOwnerId must match the authenticated user." } satisfies ClaimErrorResponse,
      { status: 403 },
    );
  }

  const supabase = createAnonSupabaseClient(env, bearerToken);
  const result = await insertClaimedGame(supabase, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error } satisfies ClaimErrorResponse,
      { status: result.status },
    );
  }

  console.info(
    `[games/claim] Game claimed: id=${result.game.id} slug=${result.game.slug} caller=${caller.userId}`,
  );

  return NextResponse.json(
    { ok: true, game: result.game } satisfies ClaimSuccessResponse,
    { status: 201 },
  );
}
