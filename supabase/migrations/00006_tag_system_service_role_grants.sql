-- =============================================================================
-- Migration: 00006_tag_system_service_role_grants
-- Mashed Games Studio — Tag System service_role table grants
--
-- Admin API routes use createServiceRoleClient() (service_role key). New tables
-- from 00005 were granted only to authenticated; service_role still needs
-- explicit table/view/function privileges even though it bypasses RLS.
-- =============================================================================

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_tags TO service_role;

GRANT SELECT ON public.published_tag_usage TO service_role;
GRANT SELECT ON public.published_templates_with_tags TO service_role;

GRANT EXECUTE ON FUNCTION public.get_storefront_tag_filters() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_studio_admin() TO service_role;

COMMIT;
