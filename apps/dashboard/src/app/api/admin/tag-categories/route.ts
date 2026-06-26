import type { NextRequest } from "next/server";
import {
  CreateTagCategoryInputSchema,
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

type ListResponse =
  | { ok: true; categories: ReturnType<typeof tagCategoryFromRow>[] }
  | { ok: false; error: string };

type MutateResponse =
  | { ok: true; category: ReturnType<typeof tagCategoryFromRow> }
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

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.serviceClient
    .from("tag_categories")
    .select("*")
    .order("sort_order")
    .order("name");

  if (error) {
    console.error("[admin/tag-categories] List failed:", error);
    return Response.json(
      { ok: false, error: "Failed to fetch tag categories." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    categories: (data as TagCategoryRow[]).map(tagCategoryFromRow),
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

  const parsed = CreateTagCategoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 422 },
    );
  }

  const slug = resolveTagSlug(parsed.data.name, parsed.data.slug);
  const { data, error } = await auth.serviceClient
    .from("tag_categories")
    .insert({
      slug,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? "",
      sort_order: parsed.data.sortOrder ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { ok: false, error: "A category with this slug already exists." },
        { status: 409 },
      );
    }
    console.error("[admin/tag-categories] Create failed:", error);
    return Response.json(
      { ok: false, error: "Failed to create tag category." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    category: tagCategoryFromRow(data as TagCategoryRow),
  } satisfies MutateResponse);
}
