-- =============================================================================
-- Migration: 00014_coupons_multi_use
-- Mashed Games Studio — Built-in Rewards: multi-use coupons
--
-- Refactors public.coupons from single-use (is_used boolean + claimed_by_lead_id)
-- to multi-use pooled codes tracked by counters:
--   * max_uses     — how many times a code may be claimed (>= 1)
--   * current_uses — how many claims have happened so far (0 <= current_uses <= max_uses)
--
-- The Cloudflare leads worker claims a code atomically via public.claim_coupon()
-- (see 00016), incrementing current_uses under a row lock. Dashboard owners may
-- now also DELETE their own coupons (management table); claim-state mutation
-- remains service-role-only.
--
-- Depends on public.coupons (00013).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Drop the single-use model
-- ---------------------------------------------------------------------------

-- Partial index predicated on is_used; drop explicitly before the column so the
-- intent is documented (dropping the column would cascade this anyway).
DROP INDEX IF EXISTS public.idx_coupons_unused;

-- claimed_by_lead_id carried a FK to public.leads; dropping the column removes
-- the constraint automatically.
ALTER TABLE public.coupons DROP COLUMN IF EXISTS claimed_by_lead_id;
ALTER TABLE public.coupons DROP COLUMN IF EXISTS is_used;

-- ---------------------------------------------------------------------------
-- Add the multi-use counters
-- ---------------------------------------------------------------------------

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS max_uses     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_uses integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.coupons.max_uses IS
  'How many times this code may be claimed. >= 1.';
COMMENT ON COLUMN public.coupons.current_uses IS
  'How many claims have been made against this code. 0 <= current_uses <= max_uses.';

-- Guardrails: max_uses is always positive; current_uses never exceeds it. The
-- claim RPC checks current_uses < max_uses before incrementing, so these
-- constraints should never trip in practice — they are defense-in-depth.
ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_max_uses_positive;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_max_uses_positive CHECK (max_uses >= 1);

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_current_uses_bounds;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_current_uses_bounds
    CHECK (current_uses >= 0 AND current_uses <= max_uses);

-- Fast path for the worker claiming the next available code for a tier.
CREATE INDEX IF NOT EXISTS idx_coupons_available
  ON public.coupons (game_id, prize_tier)
  WHERE current_uses < max_uses;

-- ---------------------------------------------------------------------------
-- Row Level Security — owners may delete their own coupons
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "owners can delete own coupons" ON public.coupons;
CREATE POLICY "owners can delete own coupons"
  ON public.coupons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = coupons.game_id
        AND g.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants (cumulative with 00013)
-- ---------------------------------------------------------------------------

GRANT DELETE ON public.coupons TO authenticated;

COMMIT;
