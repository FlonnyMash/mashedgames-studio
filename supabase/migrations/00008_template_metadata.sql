-- =============================================================================
-- Migration: 00008_template_metadata
-- Mashed Games Studio — Slug-level template metadata decoupled from versioning
--
-- Adds:
--   public.template_badge_type enum
--   public.template_metadata table (1 row per template_slug)
--   public.sync_template_metadata_and_tags() atomic RPC
--   Updated public.published_templates_with_tags view
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Enum: marketing badge types for storefront ribbons
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_badge_type') THEN
    CREATE TYPE public.template_badge_type AS ENUM (
      'NEW', 'POPULAR', 'UPDATED', 'HOT', 'PREMIUM'
    );
  END IF;
END
$$;

COMMENT ON TYPE public.template_badge_type IS
  'Marketing badge shown on storefront template cards. NULL on template_metadata means no ribbon.';

-- ---------------------------------------------------------------------------
-- Table: slug-level metadata (hot-patchable without republish)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.template_metadata (
  template_slug  text        PRIMARY KEY,
  title          text        NOT NULL DEFAULT '',
  description    text        NOT NULL DEFAULT '',
  badge_type     public.template_badge_type,
  tutorial       text        NOT NULL DEFAULT '',
  thumbnail_url  text        NOT NULL DEFAULT '',
  preview_urls   text[]      NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.template_metadata IS
  'Slug-level promotional metadata. Decoupled from versioned templates rows.';
COMMENT ON COLUMN public.template_metadata.template_slug IS
  'Stable template identifier (matches templates.template_slug / local templateId).';
COMMENT ON COLUMN public.template_metadata.title IS
  'Storefront display name. Overrides manifest.displayName when set.';
COMMENT ON COLUMN public.template_metadata.badge_type IS
  'Marketing ribbon type. NULL hides the ribbon on storefront cards.';

DROP TRIGGER IF EXISTS template_metadata_set_updated_at ON public.template_metadata;
CREATE TRIGGER template_metadata_set_updated_at
  BEFORE UPDATE ON public.template_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill from latest live template rows
-- ---------------------------------------------------------------------------

INSERT INTO public.template_metadata (
  template_slug,
  title,
  description,
  tutorial,
  thumbnail_url,
  preview_urls
)
SELECT DISTINCT ON (template_slug)
  template_slug,
  COALESCE(manifest->>'displayName', template_slug),
  description,
  tutorial,
  thumbnail_url,
  preview_urls
FROM public.templates
WHERE is_latest = true
  AND yanked = false
ORDER BY template_slug, published_at DESC
ON CONFLICT (template_slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Atomic sync RPC: metadata upsert + tag replacement in one transaction
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_template_metadata_and_tags(
  p_template_slug   text,
  p_title           text,
  p_description     text,
  p_badge_type      public.template_badge_type,
  p_tutorial        text,
  p_thumbnail_url   text,
  p_preview_urls    text[],
  p_tag_ids         uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_count integer;
BEGIN
  IF p_tag_ids IS NOT NULL AND cardinality(p_tag_ids) > 0 THEN
    SELECT COUNT(*) INTO v_missing_count
    FROM unnest(p_tag_ids) AS req(id)
    LEFT JOIN public.tags tg ON tg.id = req.id
    WHERE tg.id IS NULL;

    IF v_missing_count > 0 THEN
      RAISE EXCEPTION 'One or more tag IDs do not exist.';
    END IF;
  END IF;

  INSERT INTO public.template_metadata (
    template_slug,
    title,
    description,
    badge_type,
    tutorial,
    thumbnail_url,
    preview_urls
  )
  VALUES (
    p_template_slug,
    COALESCE(p_title, ''),
    COALESCE(p_description, ''),
    p_badge_type,
    COALESCE(p_tutorial, ''),
    COALESCE(p_thumbnail_url, ''),
    COALESCE(p_preview_urls, '{}')
  )
  ON CONFLICT (template_slug) DO UPDATE SET
    title         = EXCLUDED.title,
    description   = EXCLUDED.description,
    badge_type    = EXCLUDED.badge_type,
    tutorial      = EXCLUDED.tutorial,
    thumbnail_url = EXCLUDED.thumbnail_url,
    preview_urls  = EXCLUDED.preview_urls,
    updated_at    = now();

  DELETE FROM public.template_tags
  WHERE template_slug = p_template_slug;

  IF p_tag_ids IS NOT NULL AND cardinality(p_tag_ids) > 0 THEN
    INSERT INTO public.template_tags (template_slug, tag_id)
    SELECT p_template_slug, unnest(p_tag_ids)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_template_metadata_and_tags IS
  'Atomically upserts template_metadata and replaces template_tags for a slug.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.template_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "studio admins manage template metadata" ON public.template_metadata;
CREATE POLICY "studio admins manage template metadata"
  ON public.template_metadata
  FOR ALL
  TO authenticated
  USING (public.is_studio_admin())
  WITH CHECK (public.is_studio_admin());

DROP POLICY IF EXISTS "users can view metadata on live templates" ON public.template_metadata;
CREATE POLICY "users can view metadata on live templates"
  ON public.template_metadata
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.templates t
      WHERE t.template_slug = template_metadata.template_slug
        AND t.is_latest = true
        AND t.yanked = false
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_metadata TO authenticated;

-- ---------------------------------------------------------------------------
-- Recreate published_templates_with_tags — metadata from template_metadata
-- DROP required: CREATE OR REPLACE cannot insert/reorder columns (42P16).
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.published_templates_with_tags;

CREATE VIEW public.published_templates_with_tags
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (template_slug) t.*
  FROM public.templates t
  WHERE t.yanked = false
  ORDER BY t.template_slug, t.published_at DESC
),
popularity AS (
  SELECT * FROM public.all_template_popularity_scores()
)
SELECT
  l.id,
  l.template_slug,
  l.version,
  l.tier,
  l.manifest,
  l.storage_key,
  l.checksum,
  l.bundle_signature,
  l.is_latest,
  l.published_at,
  l.yanked,
  COALESCE(m.title, '')          AS title,
  COALESCE(m.description, '')     AS description,
  m.badge_type,
  COALESCE(m.tutorial, '')        AS tutorial,
  COALESCE(m.thumbnail_url, '')   AS thumbnail_url,
  COALESCE(m.preview_urls, '{}')  AS preview_urls,
  COALESCE(tag_agg.tags, '[]'::jsonb) AS tags,
  COALESCE(pop.popularity_score, 0)::bigint AS popularity_score
FROM latest l
LEFT JOIN public.template_metadata m ON m.template_slug = l.template_slug
LEFT JOIN popularity pop ON pop.template_slug = l.template_slug
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', tg.id,
      'slug', tg.slug,
      'name', tg.name,
      'category_id', tc.id,
      'category_slug', tc.slug,
      'category_name', tc.name
    )
    ORDER BY tc.sort_order, tg.name
  ) AS tags
  FROM public.template_tags tt
  JOIN public.tags tg ON tg.id = tt.tag_id
  JOIN public.tag_categories tc ON tc.id = tg.category_id
  WHERE tt.template_slug = l.template_slug
) tag_agg ON true
WHERE l.is_latest = true;

COMMENT ON VIEW public.published_templates_with_tags IS
  'Latest published template row per slug with slug-level metadata, tags, and popularity_score.';

GRANT SELECT ON public.published_templates_with_tags TO authenticated;
GRANT SELECT ON public.published_templates_with_tags TO service_role;

-- ---------------------------------------------------------------------------
-- Service role grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.template_metadata TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_template_metadata_and_tags TO service_role;

COMMIT;
