import type { NextRequest } from "next/server";
import {
  SyncTemplateTagsInputSchema,
  tagFromRow,
  type TagRow,
} from "@mashedgames/shared";
import {
  createServiceRoleClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyStudioAdmin,
} from "@/lib/supabase-auth";

export const runtime = "edge";

import type { TagWithCategory } from "@/lib/tag-api-types";

type GetResponse =
  | { ok: true; templateSlug: string; tags: TagWithCategory[] }
  | { ok: false; error: string };

type PutResponse =
  | { ok: true; templateSlug: string; tagIds: string[] }
  | { ok: false; error: string };

type RouteContext = { params: Promise<{ templateId: string }> };

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

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { templateId: templateSlug } = await context.params;

  const { data: links, error: linkError } = await auth.serviceClient
    .from("template_tags")
    .select("tag_id")
    .eq("template_slug", templateSlug);

  if (linkError) {
    console.error("[templates/tags] Link fetch failed:", linkError);
    return Response.json(
      { ok: false, error: "Failed to fetch template tags." },
      { status: 500 },
    );
  }

  const tagIds = (links ?? []).map((row) => row.tag_id);
  if (tagIds.length === 0) {
    return Response.json({
      ok: true,
      templateSlug,
      tags: [],
    } satisfies GetResponse);
  }

  const { data, error } = await auth.serviceClient
    .from("tags")
    .select("*, tag_categories(name, slug)")
    .in("id", tagIds)
    .order("name");

  if (error) {
    console.error("[templates/tags] Tag fetch failed:", error);
    return Response.json(
      { ok: false, error: "Failed to fetch template tags." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    templateSlug,
    tags: (data ?? []).map((row) =>
      mapTagRow(
        row as TagRow & { tag_categories: { name: string; slug: string } | null },
      ),
    ),
  } satisfies GetResponse);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { templateId: templateSlug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = SyncTemplateTagsInputSchema.safeParse({
    ...(typeof body === "object" && body !== null ? body : {}),
    templateSlug,
  });

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 422 },
    );
  }

  const { tagIds } = parsed.data;

  const { error: deleteError } = await auth.serviceClient
    .from("template_tags")
    .delete()
    .eq("template_slug", templateSlug);

  if (deleteError) {
    console.error("[templates/tags] Clear failed:", deleteError);
    return Response.json(
      { ok: false, error: "Failed to update template tags." },
      { status: 500 },
    );
  }

  if (tagIds.length > 0) {
    const { error: insertError } = await auth.serviceClient
      .from("template_tags")
      .insert(
        tagIds.map((tagId) => ({
          template_slug: templateSlug,
          tag_id: tagId,
        })),
      );

    if (insertError) {
      console.error("[templates/tags] Insert failed:", insertError);
      return Response.json(
        { ok: false, error: "Failed to update template tags." },
        { status: 500 },
      );
    }
  }

  return Response.json({
    ok: true,
    templateSlug,
    tagIds,
  } satisfies PutResponse);
}
