-- =============================================================================
-- Migration: 00004_add_source_template_id_to_games
-- Links claimed games back to registry templates for storefront ownership UI.
-- =============================================================================

BEGIN;

ALTER TABLE public.games
  ADD COLUMN source_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.games.source_template_id IS
  'Registry template this game was claimed from. NULL for legacy or configurator claims.';

CREATE UNIQUE INDEX idx_games_owner_source_template
  ON public.games (owner_id, source_template_id)
  WHERE source_template_id IS NOT NULL;

COMMIT;
