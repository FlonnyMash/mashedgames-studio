import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTemplateControls } from "@mashedgames/shared";
import type { Database } from "@/types/database.types";
import type { PublishedCatalogRow } from "@/lib/storefront-catalog";
import type { EnrichedTemplate } from "@/components/store/storefront-types";

export type StorefrontTemplateFetchResult =
  | {
      ok: true;
      template: EnrichedTemplate;
      isAdminPreview: boolean;
      isDraft: boolean;
    }
  | { ok: false; error: string; status: number };

function enrichPublishedRow(
  row: PublishedCatalogRow,
  licensedIds?: Set<string>,
): EnrichedTemplate {
  return {
    ...row,
    controls: parseTemplateControls(row.controls),
    isLicensed: row.id != null && (licensedIds?.has(row.id) ?? false),
    isDraft: false,
  };
}

async function fetchPublishedRow(
  client: SupabaseClient<Database>,
  slug: string,
): Promise<PublishedCatalogRow | null> {
  const { data, error } = await client
    .from("published_templates_with_tags")
    .select("*")
    .eq("template_slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function loadTemplateTagsJson(
  serviceClient: SupabaseClient<Database>,
  slug: string,
): Promise<unknown[]> {
  const { data: links } = await serviceClient
    .from("template_tags")
    .select("tag_id")
    .eq("template_slug", slug);

  const tagIds = (links ?? []).map((row) => row.tag_id);
  if (tagIds.length === 0) return [];

  const { data: tagRows } = await serviceClient
    .from("tags")
    .select("id, slug, name, category_id, tag_categories(id, slug, name)")
    .in("id", tagIds)
    .order("name");

  return (tagRows ?? []).map((row) => {
    const category = row.tag_categories as
      | { id: string; slug: string; name: string }
      | null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category_id: row.category_id,
      category_slug: category?.slug ?? "",
      category_name: category?.name ?? "",
    };
  });
}

async function fetchAdminDraftTemplate(
  serviceClient: SupabaseClient<Database>,
  slug: string,
): Promise<EnrichedTemplate | null> {
  const [{ data: templateRow }, { data: metadata }, tags] = await Promise.all([
    serviceClient
      .from("templates")
      .select("*")
      .eq("template_slug", slug)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    serviceClient
      .from("template_metadata")
      .select("*")
      .eq("template_slug", slug)
      .maybeSingle(),
    loadTemplateTagsJson(serviceClient, slug),
  ]);

  if (!templateRow && !metadata) {
    return null;
  }

  const isLive =
    templateRow != null &&
    templateRow.is_latest === true &&
    templateRow.yanked === false;

  return {
    id: templateRow?.id ?? `draft:${slug}`,
    template_slug: slug,
    title: metadata?.title ?? null,
    description: metadata?.description ?? templateRow?.description ?? null,
    tutorial: metadata?.tutorial ?? templateRow?.tutorial ?? null,
    thumbnail_url: metadata?.thumbnail_url ?? templateRow?.thumbnail_url ?? null,
    preview_urls: metadata?.preview_urls ?? templateRow?.preview_urls ?? null,
    badge_type: metadata?.badge_type ?? null,
    controls: parseTemplateControls(metadata?.controls),
    tier: templateRow?.tier ?? "free",
    version: templateRow?.version ?? "draft",
    manifest: templateRow?.manifest ?? {},
    published_at: templateRow?.published_at ?? null,
    popularity_score: null,
    bundle_signature: templateRow?.bundle_signature ?? null,
    checksum: templateRow?.checksum ?? null,
    storage_key: templateRow?.storage_key ?? null,
    is_latest: templateRow?.is_latest ?? null,
    yanked: templateRow?.yanked ?? null,
    tags,
    isLicensed: false,
    isDraft: !isLive,
  };
}

/**
 * Resolves a storefront template by slug. Published templates are returned for
 * any authenticated caller. Draft / unpublished rows are admin-only.
 */
export async function fetchStorefrontTemplateBySlug(
  slug: string,
  options: {
    userClient: SupabaseClient<Database>;
    serviceClient?: SupabaseClient<Database>;
    isStudioAdmin?: boolean;
    licensedIds?: Set<string>;
  },
): Promise<StorefrontTemplateFetchResult> {
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    return { ok: false, error: "Template slug is required.", status: 400 };
  }

  try {
    const published = await fetchPublishedRow(options.userClient, trimmedSlug);
    if (published) {
      return {
        ok: true,
        template: enrichPublishedRow(published, options.licensedIds),
        isAdminPreview: false,
        isDraft: false,
      };
    }

    if (!options.isStudioAdmin || !options.serviceClient) {
      return { ok: false, error: "Template not found.", status: 404 };
    }

    const draft = await fetchAdminDraftTemplate(
      options.serviceClient,
      trimmedSlug,
    );
    if (!draft) {
      return { ok: false, error: "Template not found.", status: 404 };
    }

    return {
      ok: true,
      template: draft,
      isAdminPreview: true,
      isDraft: draft.isDraft === true,
    };
  } catch (err) {
    console.error("[storefront-template-fetch]", err);
    return { ok: false, error: "Failed to load template.", status: 500 };
  }
}
