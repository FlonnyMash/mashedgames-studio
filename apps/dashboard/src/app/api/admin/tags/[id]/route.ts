import type { NextRequest } from "next/server";
import {
  UpdateTagInputSchema,
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

type MutateResponse =
  | { ok: true; tag: TagWithCategory }
  | { ok: false; error: string };

type DeleteResponse = { ok: true } | { ok: false; error: string };

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = UpdateTagInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 422 },
    );
  }

  const patch: Record<string, string> = {};
  if (parsed.data.name !== undefined) {
    patch.name = parsed.data.name.trim();
  }
  if (parsed.data.categoryId !== undefined) {
    patch.category_id = parsed.data.categoryId;
  }
  if (parsed.data.slug !== undefined) {
    patch.slug = resolveTagSlug(parsed.data.name ?? "", parsed.data.slug);
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: false, error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await auth.serviceClient
    .from("tags")
    .update(patch)
    .eq("id", id)
    .select("*, tag_categories(name, slug)")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { ok: false, error: "A tag with this slug or name already exists." },
        { status: 409 },
      );
    }
    console.error("[admin/tags] Update failed:", error);
    return Response.json(
      { ok: false, error: "Failed to update tag." },
      { status: 500 },
    );
  }

  if (!data) {
    return Response.json({ ok: false, error: "Tag not found." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    tag: mapTagRow(
      data as TagRow & { tag_categories: { name: string; slug: string } | null },
    ),
  } satisfies MutateResponse);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  const { error } = await auth.serviceClient.from("tags").delete().eq("id", id);

  if (error) {
    console.error("[admin/tags] Delete failed:", error);
    return Response.json(
      { ok: false, error: "Failed to delete tag." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true } satisfies DeleteResponse);
}
