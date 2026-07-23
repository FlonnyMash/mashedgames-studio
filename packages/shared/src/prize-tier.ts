import { z } from "zod";

/**
 * Prize tiers — the strict, monorepo-wide contract shared by the Phaser game
 * engine, the Cloudflare leads worker, the dashboard UI, and the Supabase
 * schema.
 *
 * The Built-in Rewards system keys coupon pools off these tiers. `prizeTier`
 * on every lead / webhook payload is one of these five values — no free-text
 * loophole exists anywhere in the contract. Legacy freeform prize labels
 * emitted by templates (e.g. the lucky-wheel's `"10% Off"`) are converted at
 * the edge via `normalizePrizeToTier` before they touch a schema.
 */

export const PRIZE_TIER_VALUES = [
  "tier_1",
  "tier_2",
  "tier_3",
  "tier_4",
  "tier_5",
] as const;

export const PrizeTierEnum = z.enum(PRIZE_TIER_VALUES);

export type PrizeTier = z.infer<typeof PrizeTierEnum>;

/** Human-readable labels for dropdowns. The payload always uses the raw key. */
export const PRIZE_TIER_LABELS: Record<PrizeTier, string> = {
  tier_1: "Tier 1 (Grand Prize)",
  tier_2: "Tier 2 (Premium)",
  tier_3: "Tier 3 (Standard)",
  tier_4: "Tier 4 (Minor)",
  tier_5: "Tier 5 (Consolation)",
};

/** Ordered lowest-to-highest for fallback selection. */
const LOWEST_TIER: PrizeTier = "tier_5";

/**
 * Keyword patterns that map well-known legacy prize labels to a tier. Ordered
 * by tier so the first match wins. Case-insensitive, matched against the
 * lowercased raw label.
 */
const LEGACY_KEYWORD_PATTERNS: ReadonlyArray<[RegExp, PrizeTier]> = [
  [/\b(grand|jackpot|top|1st|first|gold|platinum|diamond)\b/, "tier_1"],
  [/\b(2nd|second|premium|silver|runner[\s-]?up)\b/, "tier_2"],
  [/\b(3rd|third|standard|bronze)\b/, "tier_3"],
  [/\b(4th|fourth|minor|small)\b/, "tier_4"],
  [/\b(5th|fifth|consolation|retry|try[\s-]?again|better luck)\b/, "tier_5"],
];

function slugifyTierKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Deterministically hashes an arbitrary string into a tier index (0-4). Stable
 * across calls and processes (simple FNV-1a style fold), so an unknown prize
 * label always resolves to the same tier — never throws.
 */
function hashToTier(value: string): PrizeTier {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash) % PRIZE_TIER_VALUES.length;
  return PRIZE_TIER_VALUES[index];
}

/**
 * Backwards-compatible adapter: converts a freeform prize label (as emitted by
 * a game template's `ON_GAME_OVER` reason) into a strict `PrizeTier`.
 *
 * Resolution order:
 *   1. Direct match — the slugified input already equals a tier key.
 *   2. Known legacy keyword patterns (grand/premium/standard/etc.).
 *   3. Deterministic hash fallback (stable per label).
 *   4. Empty / falsy input → lowest tier.
 */
export function normalizePrizeToTier(prizeName: string): PrizeTier {
  if (!prizeName || !prizeName.trim()) {
    return LOWEST_TIER;
  }

  const slug = slugifyTierKey(prizeName);
  const direct = PRIZE_TIER_VALUES.find((tier) => tier === slug);
  if (direct) {
    return direct;
  }

  const lower = prizeName.toLowerCase();
  for (const [pattern, tier] of LEGACY_KEYWORD_PATTERNS) {
    if (pattern.test(lower)) {
      return tier;
    }
  }

  return hashToTier(prizeName);
}

export function parsePrizeTier(input: unknown): PrizeTier {
  return PrizeTierEnum.parse(input);
}
