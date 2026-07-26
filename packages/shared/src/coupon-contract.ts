import { z } from "zod";
import { PRIZE_TIER_VALUES, PrizeTierEnum, type PrizeTier } from "./prize-tier";

/**
 * Built-in Rewards coupon contracts.
 *
 * The dashboard's "Built-in System (Easy)" tab lets non-technical users paste a
 * batch of discount codes against a strict `prizeTier`. Codes live in the
 * `public.coupons` table; the Cloudflare leads worker claims an unused code for
 * a verified lead using the service role. Every payload is keyed on the strict
 * `PrizeTierEnum` — the single source of truth shared across the monorepo.
 */

/** Maximum codes accepted in a single batch upload. */
export const COUPON_UPLOAD_MAX_CODES = 2000;

/** Upper bound for `maxUses` on a single coupon (sanity guard against abuse). */
export const COUPON_MAX_USES_LIMIT = 1_000_000;

/** Payload the dashboard POSTs to `/api/games/{gameId}/coupons`. */
export const CouponUploadInputSchema = z.object({
  prizeTier: PrizeTierEnum,
  codes: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(COUPON_UPLOAD_MAX_CODES),
  /** How many times each uploaded code may be claimed. */
  maxUses: z.number().int().min(1).max(COUPON_MAX_USES_LIMIT).default(1),
});

export type CouponUploadInput = z.infer<typeof CouponUploadInputSchema>;

/** Payload the dashboard PATCHes to `/api/games/{gameId}/coupons/{couponId}`. */
export const CouponUpdateInputSchema = z.object({
  maxUses: z.number().int().min(1).max(COUPON_MAX_USES_LIMIT),
});

export type CouponUpdateInput = z.infer<typeof CouponUpdateInputSchema>;

/**
 * A single coupon row as returned by `GET /api/games/{gameId}/coupons` for the
 * dashboard management table. Shared between the API route and the UI.
 */
export type CouponListItem = {
  id: string;
  code: string;
  prizeTier: PrizeTier;
  maxUses: number;
  currentUses: number;
  createdAt: string;
};

export function parseCouponUploadInput(input: unknown): CouponUploadInput {
  return CouponUploadInputSchema.parse(input);
}

/** Per-tier unused-code tally returned by `GET /api/games/{gameId}/coupons`. */
export type CouponTierCounts = Record<PrizeTier, number>;

/** Builds a fully-populated counts map with every tier defaulting to 0. */
export function emptyCouponTierCounts(): CouponTierCounts {
  return PRIZE_TIER_VALUES.reduce((acc, tier) => {
    acc[tier] = 0;
    return acc;
  }, {} as CouponTierCounts);
}
