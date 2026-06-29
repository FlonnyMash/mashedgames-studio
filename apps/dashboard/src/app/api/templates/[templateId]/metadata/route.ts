import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import {
  UpdateTemplateMetadataInputSchema,
  parseTemplateControls,
  tagFromRow,
  type TagRow,
  type TemplateControlEntry,
} from "@mashedgames/shared";
import {
  createServiceRoleClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyStudioAdmin,
} from "@/lib/supabase-auth";
import type { TagWithCategory } from "@/lib/tag-api-types";
import {
  ensureMetaAssetsBucket,
  resolveSlugStableMetaPublicUrls,
} from "@/lib/template-meta-assets";
import { writeTemplateMeta } from "@/lib/template-meta-io";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ templateId: string }> };

type MetadataResponse =
  | {
      ok: true;
      templateSlug: string;
      title: string;
      description: string;
      badgeType: string | null;
      tutorial: string;
      thumbnailUrl: string;
      previewUrls: string[];
      controls: TemplateControlEntry[];
      tagIds: string[];
      tags: TagWithCategory[];
    }
  | { ok: false; error: string };

async function authorize(request: NextRequest) {
  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) {
    return { error: loaded.response } as const;
  }

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) {
    return {
      error: Response.json(
        { ok: false, error: "Authorization header with Bearer token required." },
        { status: 401 },
      ),
    } as const;
  }

  const authResult = await verifyStudioAdmin(bearerToken, loaded.env);
  if ("error" in authResult) {
    return {
      error: Response.json(
        { ok: false, error: authResult.error },
        { status: authResult.status },
      ),
    } as const;
  }

  return {
    serviceClient: createServiceRoleClient(loaded.env),
  } as const;
}

function mapTagRow(
  row: TagRow & { tag_categories: { name: string; slug: string } | null },
): TagWithCategory {
  const tag = tagFromRow(row);
  return {
    ...tag,
    categoryName: row.tag_categories?.name ?? "",
    categorySlug: row.tag_categories?.slug ?? "",
  };
}

async function loadAssignedTags(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  templateSlug: string,
): Promise<TagWithCategory[]> {
  const { data: links } = await serviceClient
    .from("template_tags")
    .select("tag_id")
    .eq("template_slug", templateSlug);

  const tagIds = (links ?? []).map((row) => row.tag_id);
  if (tagIds.length === 0) return [];

  const { data } = await serviceClient
    .from("tags")
    .select("*, tag_categories(name, slug)")
    .in("id", tagIds)
    .order("name");

  return (data ?? []).map((row) =>
    mapTagRow(
      row as TagRow & { tag_categories: { name: string; slug: string } | null },
    ),
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error as Response;

  const { templateId: templateSlug } = await context.params;

  const { data: metadata, error: metaError } = await auth.serviceClient
    .from("template_metadata")
    .select("*")
    .eq("template_slug", templateSlug)
    .maybeSingle();

  if (metaError) {
    console.error("[templates/metadata] Fetch failed:", metaError);
    return Response.json(
      { ok: false, error: "Failed to fetch template metadata." },
      { status: 500 },
    );
  }

  const tags = await loadAssignedTags(auth.serviceClient, templateSlug);

  return Response.json({
    ok: true,
    templateSlug,
    title: metadata?.title ?? "",
    description: metadata?.description ?? "",
    badgeType: metadata?.badge_type ?? null,
    tutorial: metadata?.tutorial ?? "",
    thumbnailUrl: metadata?.thumbnail_url ?? "",
    previewUrls: metadata?.preview_urls ?? [],
    controls: parseTemplateControls(metadata?.controls),
    tagIds: tags.map((t) => t.id),
    tags,
  } satisfies MetadataResponse);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error as Response;

  const { templateId: templateSlug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = UpdateTemplateMetadataInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 422 },
    );
  }

  const input = parsed.data;

  const { data: existingMetadata } = await auth.serviceClient
    .from("template_metadata")
    .select("thumbnail_url, preview_urls")
    .eq("template_slug", templateSlug)
    .maybeSingle();

  await ensureMetaAssetsBucket(auth.serviceClient);

  const localUrls = await resolveSlugStableMetaPublicUrls(
    auth.serviceClient,
    templateSlug,
    {
      thumbnailUrl: input.thumbnailUrl || existingMetadata?.thumbnail_url || undefined,
      previewUrls:
        input.previewUrls.length > 0
          ? input.previewUrls
          : existingMetadata?.preview_urls ?? undefined,
    },
  );

  const thumbnailUrl =
    localUrls.thumbnailUrl || input.thumbnailUrl || existingMetadata?.thumbnail_url || "";
  const previewUrls =
    localUrls.previewUrls.length > 0
      ? localUrls.previewUrls
      : input.previewUrls.length > 0
        ? input.previewUrls
        : existingMetadata?.preview_urls ?? [];

  const { error: rpcError } = await auth.serviceClient.rpc(
    "sync_template_metadata_and_tags",
    {
      p_template_slug: templateSlug,
      p_title: input.title,
      p_description: input.description || localUrls.description,
      p_badge_type: input.badgeType,
      p_tutorial: input.tutorial || localUrls.tutorial,
      p_thumbnail_url: thumbnailUrl,
      p_preview_urls: previewUrls,
      p_tag_ids: input.tagIds,
      p_controls: input.controls ?? [],
    },
  );

  if (rpcError) {
    console.error("[templates/metadata] RPC failed:", rpcError);
    return Response.json(
      { ok: false, error: "Failed to save template metadata." },
      { status: 500 },
    );
  }

  writeTemplateMeta(templateSlug, {
    description: input.description || localUrls.description,
    tutorial: input.tutorial || localUrls.tutorial,
  });

  if (input.tier) {
    const { error: tierError } = await auth.serviceClient
      .from("templates")
      .update({ tier: input.tier })
      .eq("template_slug", templateSlug)
      .eq("is_latest", true);

    if (tierError) {
      console.error("[templates/metadata] Tier update failed:", tierError);
    }
  }

  revalidatePath("/dashboard/store");
  revalidatePath(`/dashboard/store/templates/${templateSlug}`);

  return Response.json({
    ok: true,
    templateSlug,
    title: input.title,
    description: input.description || localUrls.description,
    badgeType: input.badgeType,
    tutorial: input.tutorial || localUrls.tutorial,
    thumbnailUrl,
    previewUrls,
    controls: input.controls ?? [],
    tagIds: input.tagIds,
  });
}
