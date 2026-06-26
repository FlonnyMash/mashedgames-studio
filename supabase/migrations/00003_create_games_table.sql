-- =============================================================================
-- Migration: 00003_create_games_table
-- Mashed Games Studio — Game Claiming Persistence
--
-- Creates public.games for persisting claimed game configurations.
-- config is jsonb validated at the application layer against GameConfigSchema
-- (flat top-level primitives only — no nested JSON trees).
-- =============================================================================

BEGIN;

CREATE TABLE public.games (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config     jsonb       NOT NULL,
  slug       text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.games IS 'Claimed game configurations owned by authenticated users.';
COMMENT ON COLUMN public.games.owner_id IS 'auth.users id of the user who claimed this game.';
COMMENT ON COLUMN public.games.config IS 'Flat GameConfig payload (top-level primitives only). Validated by GameConfigSchema at insert time.';
COMMENT ON COLUMN public.games.slug IS 'Unique public identifier for the claimed game.';

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners can view own games" ON public.games;
CREATE POLICY "owners can view own games"
  ON public.games
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "owners can insert own games" ON public.games;
CREATE POLICY "owners can insert own games"
  ON public.games
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "owners can update own games" ON public.games;
CREATE POLICY "owners can update own games"
  ON public.games
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "owners can delete own games" ON public.games;
CREATE POLICY "owners can delete own games"
  ON public.games
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;

CREATE INDEX idx_games_owner ON public.games (owner_id);

COMMIT;
