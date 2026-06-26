import type { NextRequest } from "next/server";
import {
  CreateTagInputSchema,
  resolveTagSlug,
  tagFromRow,
  type TagRow,
} from "@mashedgames/shared";
import {
  createServiceRoleClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyStudioAdmin,
} from "@/lib/supabase-auth";

import type { TagWithCategory } from "@/lib/tag-api-types";

export const runtime = "edge";

type ListResponse =
  | { ok: true; tags: TagWithCategory[] }
  | { ok: false; error: string };

type MutateResponse =
  | { ok: true; tag: TagWithCategory }
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

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.serviceClient
    .from("tags")
    .select("*, tag_categories(name, slug)")
    .order("name");

  if (error) {
    console.error("[admin/tags] List failed:", error);
    return Response.json(
      { ok: false, error: "Failed to fetch tags." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    tags: (data ?? []).map((row) =>
      mapTagRow(
        row as TagRow & { tag_categories: { name: string; slug: string } | null },
      ),
    ),
  } satisfies ListResponse);
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = CreateTagInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 422 },
    );
  }

  const slug = resolveTagSlug(parsed.data.name, parsed.data.slug);
  const { data, error } = await auth.serviceClient
    .from("tags")
    .insert({
      category_id: parsed.data.categoryId,
      slug,
      name: parsed.data.name.trim(),
    })
    .select("*, tag_categories(name, slug)")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { ok: false, error: "A tag with this slug or name already exists in the category." },
        { status: 409 },
      );
    }
    if (error.code === "23503") {
      return Response.json(
        { ok: false, error: "Category not found." },
        { status: 404 },
      );
    }
    console.error("[admin/tags] Create failed:", error);
    return Response.json(
      { ok: false, error: "Failed to create tag." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    tag: mapTagRow(
      data as TagRow & { tag_categories: { name: string; slug: string } | null },
    ),
  } satisfies MutateResponse);
}
