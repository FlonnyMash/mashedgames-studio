-- =============================================================================
-- Migration: 00012_create_leads_table
-- Mashed Games Studio — Built-in Rewards: captured leads
--
-- Stores leads captured by the in-game lead-capture overlay. Rows are written
-- exclusively by the Cloudflare leads worker via the service role (which
-- bypasses RLS) to prevent lead spoofing. Dashboard-authenticated users get
-- read-only, owner-scoped access to their own game's leads.
--
-- `prize_tier` is strictly typed to the monorepo-wide PrizeTierEnum
-- ('tier_1'..'tier_5') defined in packages/shared/src/prize-tier.ts.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prize_tier') THEN
    CREATE TYPE public.prize_tier AS ENUM (
      'tier_1', 'tier_2', 'tier_3', 'tier_4', 'tier_5'
    );
  END IF;
END
$$;

COMMENT ON TYPE public.prize_tier IS
  'Strict prize tier shared across the monorepo (packages/shared PrizeTierEnum). Keys coupon pools and lead attribution.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE public.lead_status AS ENUM ('unverified', 'verified');
  END IF;
END
$$;

COMMENT ON TYPE public.lead_status IS
  'Lifecycle of a captured lead. Double opt-in verification flips unverified -> verified.';

-- ---------------------------------------------------------------------------
-- Table: public.leads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.leads (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            uuid              NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  email              text              NOT NULL,
  prize_tier         public.prize_tier NOT NULL,
  status             public.lead_status NOT NULL DEFAULT 'unverified',
  verification_token uuid              NOT NULL DEFAULT gen_random_uuid(),
  created_at         timestamptz       NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS
  'Leads captured in-game. Written only by the leads worker (service role); dashboard owners have read-only access via RLS.';

CREATE INDEX IF NOT EXISTS idx_leads_game_id ON public.leads (game_id);
CREATE INDEX IF NOT EXISTS idx_leads_verification_token ON public.leads (verification_token);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- SELECT: owners can read leads for games they own. No INSERT/UPDATE/DELETE
-- policy exists for `authenticated`, so those operations are default-denied
-- under RLS — only the service role (which bypasses RLS) may write leads.
DROP POLICY IF EXISTS "owners can select own leads" ON public.leads;
CREATE POLICY "owners can select own leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = leads.game_id
        AND g.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- authenticated: read-only (RLS still applies).
GRANT SELECT ON public.leads TO authenticated;

-- service_role bypasses RLS but still needs explicit table privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO service_role;

COMMIT;
