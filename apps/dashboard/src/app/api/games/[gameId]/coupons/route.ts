import { type NextRequest } from "next/server";
import {
  CouponUploadInputSchema,
  emptyCouponTierCounts,
  type CouponListItem,
  type CouponTierCounts,
} from "@mashedgames/shared/coupon-contract";
import { type PrizeTier } from "@mashedgames/shared/prize-tier";
import {
  createAnonSupabaseClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";

export const runtime = "edge";

type RouteContext = { params: Promise<{ gameId: string }> };

function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "Authorization header with Bearer token required." },
    { status: 401 },
  );
}

/**
 * GET — returns two things in one round trip, both owner-scoped by RLS on
 * public.coupons:
 *   - `counts`: per-tier count of still-available coupons (current_uses <
 *     max_uses), powering the "X codes available for this tier" hint.
 *   - `coupons`: the full coupon list (newest first) for the management table.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { gameId } = await context.params;

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
    .select("id, code, prize_tier, max_uses, current_uses, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[games/coupons] GET list error:", error.message);
    return Response.json(
      { ok: false, error: "Failed to load coupons." },
      { status: 500 },
    );
  }

  const counts: CouponTierCounts = emptyCouponTierCounts();
  const coupons: CouponListItem[] = [];

  for (const row of data ?? []) {
    const tier = row.prize_tier as PrizeTier;
    if (row.current_uses < row.max_uses) {
      counts[tier] = (counts[tier] ?? 0) + 1;
    }
    coupons.push({
      id: row.id,
      code: row.code,
      prizeTier: tier,
      maxUses: row.max_uses,
      currentUses: row.current_uses,
      createdAt: row.created_at,
    });
  }

  return Response.json({ ok: true, counts, coupons });
}

/**
 * POST — batch-inserts pasted discount codes for a prize tier. Duplicates
 * (within the batch or already stored for this game) are skipped, not errored.
 * Owner scoping is enforced by the RLS INSERT policy on public.coupons.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { gameId } = await context.params;

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

  const parsed = CouponUploadInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Provide a valid prizeTier and at least one code.",
      },
      { status: 400 },
    );
  }

  const { prizeTier, codes, maxUses } = parsed.data;
  const totalSubmitted = codes.length;

  // Dedupe within the batch (codes are already trimmed by the schema).
  const uniqueCodes = Array.from(new Set(codes));

  const supabase = createAnonSupabaseClient(env, bearerToken);

  // Filter out codes already stored for this game so re-uploads are idempotent
  // and we can report an accurate skipped count without tripping the unique
  // constraint. (A concurrent insert could still race; that is handled below.)
  const { data: existingRows, error: existingError } = await supabase
    .from("coupons")
    .select("code")
    .eq("game_id", gameId)
    .in("code", uniqueCodes);

  if (existingError) {
    console.error(
      "[games/coupons] POST existing lookup error:",
      existingError.message,
    );
    return Response.json(
      { ok: false, error: "Failed to upload codes." },
      { status: 500 },
    );
  }

  const existing = new Set((existingRows ?? []).map((row) => row.code));
  const toInsert = uniqueCodes.filter((code) => !existing.has(code));

  if (toInsert.length === 0) {
    return Response.json({
      ok: true,
      inserted: 0,
      skippedDuplicates: totalSubmitted,
    });
  }

  const rows = toInsert.map((code) => ({
    game_id: gameId,
    prize_tier: prizeTier,
    code,
    max_uses: maxUses,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("coupons")
    .insert(rows)
    .select("id");

  if (insertError) {
    // 23505 = unique_violation: a concurrent upload inserted an overlapping
    // code between our lookup and insert. Surface a retryable conflict.
    if (insertError.code === "23505") {
      return Response.json(
        {
          ok: false,
          error: "Some codes were just added elsewhere. Please try again.",
        },
        { status: 409 },
      );
    }
    console.error("[games/coupons] POST insert error:", insertError.message);
    return Response.json(
      { ok: false, error: "Failed to upload codes." },
      { status: 500 },
    );
  }

  const inserted = insertedRows?.length ?? 0;

  return Response.json({
    ok: true,
    inserted,
    skippedDuplicates: totalSubmitted - inserted,
  });
}
