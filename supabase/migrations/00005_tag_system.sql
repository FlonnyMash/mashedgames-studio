-- =============================================================================
-- Migration: 00005_tag_system
-- Mashed Games Studio — Normalized Template Tagging
--
-- Tables:
--   public.tag_categories — global tag groupings (Genre, Mechanic, …)
--   public.tags             — global tag pool with URL-safe slugs
--   public.template_tags    — M:N mapping keyed on template_slug (no FK to templates)
--
-- Views:
--   public.published_tag_usage            — tags in use on live templates, with counts
--   public.published_templates_with_tags  — latest published templates + tag JSON
--
-- Functions:
--   public.is_studio_admin()              — RLS helper
--   public.get_storefront_tag_filters()   — grouped sidebar payload
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: studio_admin gate (matches existing profiles.role subquery pattern)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_studio_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'studio_admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.tag_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_categories_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON TABLE public.tag_categories IS 'Global tag groupings shown in the storefront sidebar.';
COMMENT ON COLUMN public.tag_categories.slug IS 'URL-safe kebab-case identifier for category filters.';

CREATE TABLE public.tags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES public.tag_categories(id) ON DELETE RESTRICT,
  slug        text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT tags_unique_name_per_category UNIQUE (category_id, name)
);

COMMENT ON TABLE public.tags IS 'Global tag pool shared across all templates.';
COMMENT ON COLUMN public.tags.slug IS 'URL-safe kebab-case identifier used in ?tag= storefront filters.';

CREATE TABLE public.template_tags (
  template_slug text        NOT NULL,
  tag_id        uuid        NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_slug, tag_id)
);

COMMENT ON TABLE public.template_tags IS 'M:N mapping from template_slug to global tags. No FK to templates — slug may exist before first publish.';
COMMENT ON COLUMN public.template_tags.template_slug IS 'Stable template identifier (matches templates.template_slug / local templateId).';

CREATE INDEX idx_template_tags_slug ON public.template_tags (template_slug);
CREATE INDEX idx_template_tags_tag_id ON public.template_tags (tag_id);
CREATE INDEX idx_tags_category_id ON public.tags (category_id);

CREATE TRIGGER tag_categories_set_updated_at
  BEFORE UPDATE ON public.tag_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tags_set_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_tags ENABLE ROW LEVEL SECURITY;

-- tag_categories: public read when category has tags on live templates
DROP POLICY IF EXISTS "studio admins manage tag categories" ON public.tag_categories;
CREATE POLICY "studio admins manage tag categories"
  ON public.tag_categories
  FOR ALL
  TO authenticated
  USING (public.is_studio_admin())
  WITH CHECK (public.is_studio_admin());

DROP POLICY IF EXISTS "users can view categories with live tags" ON public.tag_categories;
CREATE POLICY "users can view categories with live tags"
  ON public.tag_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tags tg
      JOIN public.template_tags tt ON tt.tag_id = tg.id
      JOIN public.templates t ON t.template_slug = tt.template_slug
      WHERE tg.category_id = tag_categories.id
        AND t.is_latest = true
        AND t.yanked = false
    )
  );

-- tags: public read when tag is on a live template
DROP POLICY IF EXISTS "studio admins manage tags" ON public.tags;
CREATE POLICY "studio admins manage tags"
  ON public.tags
  FOR ALL
  TO authenticated
  USING (public.is_studio_admin())
  WITH CHECK (public.is_studio_admin());

DROP POLICY IF EXISTS "users can view tags on live templates" ON public.tags;
CREATE POLICY "users can view tags on live templates"
  ON public.tags
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.template_tags tt
      JOIN public.templates t ON t.template_slug = tt.template_slug
      WHERE tt.tag_id = tags.id
        AND t.is_latest = true
        AND t.yanked = false
    )
  );

-- template_tags: public read when linked template is live
DROP POLICY IF EXISTS "studio admins manage template tags" ON public.template_tags;
CREATE POLICY "studio admins manage template tags"
  ON public.template_tags
  FOR ALL
  TO authenticated
  USING (public.is_studio_admin())
  WITH CHECK (public.is_studio_admin());

DROP POLICY IF EXISTS "users can view tags on live template slugs" ON public.template_tags;
CREATE POLICY "users can view tags on live template slugs"
  ON public.template_tags
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.templates t
      WHERE t.template_slug = template_tags.template_slug
        AND t.is_latest = true
        AND t.yanked = false
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_tags TO authenticated;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.published_tag_usage
WITH (security_invoker = true) AS
SELECT
  tg.id              AS tag_id,
  tg.slug            AS tag_slug,
  tg.name            AS tag_name,
  tc.id              AS category_id,
  tc.slug            AS category_slug,
  tc.name            AS category_name,
  tc.sort_order      AS category_sort_order,
  COUNT(DISTINCT tt.template_slug) AS usage_count
FROM public.tags tg
JOIN public.tag_categories tc ON tc.id = tg.category_id
JOIN public.template_tags tt ON tt.tag_id = tg.id
JOIN public.templates t
  ON t.template_slug = tt.template_slug
 AND t.is_latest = true
 AND t.yanked = false
GROUP BY
  tg.id, tg.slug, tg.name,
  tc.id, tc.slug, tc.name, tc.sort_order;

COMMENT ON VIEW public.published_tag_usage IS 'Tags attached to at least one live published template, with usage counts for storefront sidebar.';

CREATE OR REPLACE VIEW public.published_templates_with_tags
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (template_slug) t.*
  FROM public.templates t
  WHERE t.yanked = false
  ORDER BY t.template_slug, t.published_at DESC
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
  COALESCE(tag_agg.tags, '[]'::jsonb) AS tags
FROM latest l
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

COMMENT ON VIEW public.published_templates_with_tags IS 'Latest published template row per slug with aggregated tag JSON for storefront catalog.';

GRANT SELECT ON public.published_tag_usage TO authenticated;
GRANT SELECT ON public.published_templates_with_tags TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: grouped storefront sidebar payload
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_storefront_tag_filters()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(cat ORDER BY (cat->>'sort_order')::int), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', category_id,
      'slug', category_slug,
      'name', category_name,
      'sort_order', category_sort_order,
      'tags', jsonb_agg(
        jsonb_build_object(
          'id', tag_id,
          'slug', tag_slug,
          'name', tag_name,
          'usage_count', usage_count
        )
        ORDER BY usage_count DESC, tag_name
      )
    ) AS cat
    FROM public.published_tag_usage
    GROUP BY category_id, category_slug, category_name, category_sort_order
  ) grouped;
$$;

GRANT EXECUTE ON FUNCTION public.get_storefront_tag_filters() TO authenticated;

COMMIT;
