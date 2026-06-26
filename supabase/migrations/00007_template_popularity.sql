-- =============================================================================
-- Migration: 00007_template_popularity
-- Mashed Games Studio — Template popularity scores for storefront sorting
--
-- Adds global claim counts (from public.games) to published_templates_with_tags.
-- Uses SECURITY DEFINER aggregate so RLS on games does not skew per-user counts.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Index for claim aggregation
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_games_source_template_id
  ON public.games (source_template_id)
  WHERE source_template_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER popularity aggregate (RLS-safe global counts)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.all_template_popularity_scores()
RETURNS TABLE (template_slug text, popularity_score bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.template_slug, COUNT(g.id)::bigint
  FROM public.templates t
  LEFT JOIN public.games g ON g.source_template_id = t.id
  GROUP BY t.template_slug;
$$;

COMMENT ON FUNCTION public.all_template_popularity_scores() IS
  'Global claim counts per template_slug for storefront popularity sorting.';

GRANT EXECUTE ON FUNCTION public.all_template_popularity_scores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.all_template_popularity_scores() TO service_role;

-- ---------------------------------------------------------------------------
-- Extend published_templates_with_tags with popularity_score
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.published_templates_with_tags
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
  l.description,
  l.tutorial,
  l.thumbnail_url,
  l.preview_urls,
  COALESCE(tag_agg.tags, '[]'::jsonb) AS tags,
  COALESCE(pop.popularity_score, 0)::bigint AS popularity_score
FROM latest l
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
  'Latest published template row per slug with aggregated tag JSON and claim-based popularity_score.';

GRANT SELECT ON public.published_templates_with_tags TO authenticated;
GRANT SELECT ON public.published_templates_with_tags TO service_role;

COMMIT;
