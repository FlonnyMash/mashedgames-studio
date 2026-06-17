-- =============================================================================
-- Migration: 00002_template_meta_columns
-- Mashed Games Studio — Template Metadata Columns
--
-- Adds four promotional-metadata columns to public.templates so that the admin
-- publish pipeline can write description, tutorial, thumbnail_url and
-- preview_urls directly to the database row, decoupling storefront display
-- from the opaque `manifest` JSONB blob.
--
-- All columns are NOT NULL with safe empty defaults so that existing rows
-- produced by migration 00001 remain valid without a backfill step.
-- =============================================================================

BEGIN;

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS description   text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tutorial      text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS thumbnail_url text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preview_urls  text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.templates.description
  IS 'Human-readable description of the template shown in the Storefront modal.';

COMMENT ON COLUMN public.templates.tutorial
  IS 'Markdown tutorial content rendered in the TutorialDrawer for configurator users.';

COMMENT ON COLUMN public.templates.thumbnail_url
  IS 'Public URL of the hero thumbnail hosted in the template-assets Supabase Storage bucket. Empty string when no thumbnail has been uploaded.';

COMMENT ON COLUMN public.templates.preview_urls
  IS 'Ordered array of public URLs for preview media (images / videos) hosted in the template-assets Supabase Storage bucket.';

COMMIT;
