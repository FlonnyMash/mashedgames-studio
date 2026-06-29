import type { NextRequest } from "next/server";
import {
  createAnonSupabaseClient,
  createServiceRoleClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyStudioAdmin,
} from "@/lib/supabase-auth";
import { fetchStorefrontTemplateBySlug } from "@/lib/storefront-template-fetch";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) {
    return loaded.response;
  }

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) {
    return Response.json(
      { ok: false, error: "Authorization header with Bearer token required." },
      { status: 401 },
    );
  }

  const userClient = createAnonSupabaseClient(loaded.env, bearerToken);
  const adminResult = await verifyStudioAdmin(bearerToken, loaded.env);
  const isStudioAdmin = !("error" in adminResult);

  const { slug } = await context.params;
  const serviceClient = isStudioAdmin
    ? createServiceRoleClient(loaded.env)
    : undefined;

  const result = await fetchStorefrontTemplateBySlug(slug, {
    userClient,
    serviceClient,
    isStudioAdmin,
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json({
    ok: true,
    template: result.template,
    isAdminPreview: result.isAdminPreview,
    isDraft: result.isDraft,
  });
}
