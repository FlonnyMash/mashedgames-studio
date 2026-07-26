import { type NextRequest } from "next/server";
import {
  CouponUpdateInputSchema,
  type CouponListItem,
} from "@mashedgames/shared/coupon-contract";
import { type PrizeTier } from "@mashedgames/shared/prize-tier";
import {
  createAnonSupabaseClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";

export const runtime = "edge";

type RouteContext = { params: Promise<{ gameId: string; couponId: string }> };

function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "Authorization header with Bearer token required." },
    { status: 401 },
  );
}

/**
 * DELETE — removes a single coupon from the game's pool (management table trash
 * action). Ownership is enforced by the RLS "owners can delete own coupons"
 * policy on public.coupons; the extra `.eq("game_id", gameId)` filter is
 * defense-in-depth so a couponId cannot be deleted out of another game's scope.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { gameId, couponId } = await context.params;

  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) return loaded.response;
  const env = loaded.env;

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) return unauthorized();

  const caller = await verifyAuthenticatedCaller(bearerToken, env);
  if ("error" in caller) {
    return Response.json(
      { ok: false, error: caller.error },
      { status: caller.status },
    );
  }

  const supabase = createAnonSupabaseClient(env, bearerToken);
  const { data, error } = await supabase
    .from("coupons")
    .delete()
    .eq("id", couponId)
    .eq("game_id", gameId)
    .select("id");

  if (error) {
    console.error("[games/coupons] DELETE error:", error.message);
    return Response.json(
      { ok: false, error: "Failed to delete coupon." },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return Response.json(
      { ok: false, error: "Coupon not found." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}

/**
 * PATCH — updates a coupon's `max_uses` (management table inline edit).
 * Ownership is enforced by RLS on public.coupons plus the defensive
 * `.eq("game_id", gameId)` filter, so a couponId cannot be edited across game
 * boundaries. The DB CHECK (current_uses <= max_uses) rejects shrinking a code
 * below what has already been claimed.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { gameId, couponId } = await context.params;

  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) return loaded.response;
  const env = loaded.env;

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) return unauthorized();

  const caller = await verifyAuthenticatedCaller(bearerToken, env);
  if ("error" in caller) {
    return Response.json(
      { ok: false, error: caller.error },
      { status: caller.status },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = CouponUpdateInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Provide a valid maxUses (integer >= 1)." },
      { status: 400 },
    );
  }

  const supabase = createAnonSupabaseClient(env, bearerToken);
  const { data, error } = await supabase
    .from("coupons")
    .update({ max_uses: parsed.data.maxUses })
    .eq("id", couponId)
    .eq("game_id", gameId)
    .select("id, code, prize_tier, max_uses, current_uses, created_at")
    .maybeSingle();

  if (error) {
    // 23514 = check_violation: max_uses set below current_uses.
    if (error.code === "23514") {
      return Response.json(
        {
          ok: false,
          error: "Max uses cannot be lower than the number already claimed.",
        },
        { status: 409 },
      );
    }
    console.error("[games/coupons] PATCH error:", error.message);
    return Response.json(
      { ok: false, error: "Failed to update coupon." },
      { status: 500 },
    );
  }

  if (!data) {
    return Response.json(
      { ok: false, error: "Coupon not found." },
      { status: 404 },
    );
  }

  const coupon: CouponListItem = {
    id: data.id,
    code: data.code,
    prizeTier: data.prize_tier as PrizeTier,
    maxUses: data.max_uses,
    currentUses: data.current_uses,
    createdAt: data.created_at,
  };

  return Response.json({ ok: true, coupon });
}
