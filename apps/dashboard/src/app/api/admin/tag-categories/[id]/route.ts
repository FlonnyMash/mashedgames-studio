import type { NextRequest } from "next/server";
import {
  UpdateTagCategoryInputSchema,
  resolveTagSlug,
  tagCategoryFromRow,
  type TagCategoryRow,
} from "@mashedgames/shared";
import {
  createServiceRoleClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyStudioAdmin,
} from "@/lib/supabase-auth";

export const runtime = "edge";

type MutateResponse =
  | { ok: true; category: ReturnType<typeof tagCategoryFromRow> }
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

  const parsed = UpdateTagCategoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 422 },
    );
  }

  const patch: Record<string, string | number> = {};
  if (parsed.data.name !== undefined) {
    patch.name = parsed.data.name.trim();
  }
  if (parsed.data.description !== undefined) {
    patch.description = parsed.data.description;
  }
  if (parsed.data.sortOrder !== undefined) {
    patch.sort_order = parsed.data.sortOrder;
  }
  if (parsed.data.slug !== undefined) {
    patch.slug = resolveTagSlug(parsed.data.name ?? "", parsed.data.slug);
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: false, error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await auth.serviceClient
    .from("tag_categories")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { ok: false, error: "A category with this slug already exists." },
        { status: 409 },
      );
    }
    console.error("[admin/tag-categories] Update failed:", error);
    return Response.json(
      { ok: false, error: "Failed to update tag category." },
      { status: 500 },
    );
  }

  if (!data) {
    return Response.json({ ok: false, error: "Category not found." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    category: tagCategoryFromRow(data as TagCategoryRow),
  } satisfies MutateResponse);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  const { error } = await auth.serviceClient
    .from("tag_categories")
    .delete()
    .eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return Response.json(
        { ok: false, error: "Cannot delete a category that still has tags assigned." },
        { status: 409 },
      );
    }
    console.error("[admin/tag-categories] Delete failed:", error);
    return Response.json(
      { ok: false, error: "Failed to delete tag category." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true } satisfies DeleteResponse);
}
