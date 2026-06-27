-- =============================================================================
-- Migration: 00009_trim_template_badge_type
-- Remove UPDATED and PREMIUM badge values; keep NEW, POPULAR, HOT.
-- =============================================================================

BEGIN;

UPDATE public.template_metadata
SET badge_type = NULL
WHERE badge_type::text IN ('UPDATED', 'PREMIUM');

DROP VIEW IF EXISTS public.published_templates_with_tags;

DROP FUNCTION IF EXISTS public.sync_template_metadata_and_tags(
  text, text, text, public.template_badge_type, text, text, text[], uuid[]
);

CREATE TYPE public.template_badge_type_new AS ENUM (
  'NEW', 'POPULAR', 'HOT'
);

ALTER TABLE public.template_metadata
  ALTER COLUMN badge_type TYPE public.template_badge_type_new
  USING (
    CASE
      WHEN badge_type::text IN ('NEW', 'POPULAR', 'HOT')
        THEN badge_type::text::public.template_badge_type_new
      ELSE NULL
    END
  );

DROP TYPE public.template_badge_type;

ALTER TYPE public.template_badge_type_new RENAME TO template_badge_type;

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

GRANT EXECUTE ON FUNCTION public.sync_template_metadata_and_tags TO service_role;

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

COMMIT;
