import { GameClaimSchema } from "@mashedgames/shared";
import { type NextRequest, NextResponse } from "next/server";
import {
  createAnonSupabaseClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";
import { ensureClaimedGameRow } from "@/lib/games-claim";
import type { Tables } from "@/lib/supabaseClient";

export const runtime = "edge";

type ClaimSuccessResponse = { ok: true; game: Tables<"games"> };
type ClaimErrorResponse = { ok: false; error: string };

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
  const result = await ensureClaimedGameRow(supabase, {
    ownerId: parsed.data.targetOwnerId,
    slug: parsed.data.slug,
    templateId: parsed.data.templateId,
  });

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
