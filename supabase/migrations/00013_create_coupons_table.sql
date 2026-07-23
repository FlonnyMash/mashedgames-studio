-- =============================================================================
-- Migration: 00013_create_coupons_table
-- Mashed Games Studio — Built-in Rewards: coupon pools
--
-- Stores discount codes uploaded by dashboard users (Built-in System tab),
-- pooled per game + prize_tier. The Cloudflare leads worker claims an unused
-- code for a verified lead via the service role (marking is_used / linking
-- claimed_by_lead_id). Dashboard owners may upload (INSERT) and read (SELECT)
-- their own game's coupons; they may not mutate claim state.
--
-- Depends on public.prize_tier (00012) and public.leads (00012).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Table: public.coupons
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupons (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            uuid              NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  prize_tier         public.prize_tier NOT NULL,
  code               text              NOT NULL,
  is_used            boolean           NOT NULL DEFAULT false,
  claimed_by_lead_id uuid              REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  UNIQUE (game_id, code)
);

COMMENT ON TABLE public.coupons IS
  'Discount code pool per game + prize_tier. Uploaded by dashboard owners; claimed by the leads worker (service role).';

CREATE INDEX IF NOT EXISTS idx_coupons_game_tier ON public.coupons (game_id, prize_tier);

-- Fast path for the worker claiming the next unused code for a tier.
CREATE INDEX IF NOT EXISTS idx_coupons_unused
  ON public.coupons (game_id, prize_tier)
  WHERE is_used = false;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- SELECT: owners can read coupons for games they own.
DROP POLICY IF EXISTS "owners can select own coupons" ON public.coupons;
CREATE POLICY "owners can select own coupons"
  ON public.coupons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = coupons.game_id
        AND g.owner_id = auth.uid()
    )
  );

-- INSERT: owners can upload coupons for games they own. No UPDATE/DELETE policy
-- for `authenticated`, so claim-state mutation is restricted to the service
-- role (the leads worker) under RLS default-deny.
DROP POLICY IF EXISTS "owners can insert own coupons" ON public.coupons;
CREATE POLICY "owners can insert own coupons"
  ON public.coupons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = coupons.game_id
        AND g.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- authenticated: read + upload (RLS still applies); no update/delete.
GRANT SELECT, INSERT ON public.coupons TO authenticated;

-- service_role bypasses RLS but still needs explicit table privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO service_role;

COMMIT;
