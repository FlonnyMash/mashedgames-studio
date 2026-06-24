import type { NextRequest } from "next/server";
import {
  createServiceRoleClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyStudioAdmin,
} from "@/lib/supabase-auth";

export const runtime = "edge";

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

type OrgOption = { id: string; name: string };
type TemplateOption = { id: string; template_slug: string };

type RefDataResponse =
  | { ok: true; orgs: OrgOption[]; templates: TemplateOption[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) {
    return Response.json<RefDataResponse>(
      { ok: false, error: "Server misconfiguration." },
      { status: 500 },
    );
  }
  const env = loaded.env;

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) {
    return Response.json<RefDataResponse>(
      { ok: false, error: "Authorization header with Bearer token required." },
      { status: 401 },
    );
  }

  const authResult = await verifyStudioAdmin(bearerToken, env);
  if ("error" in authResult) {
    return Response.json<RefDataResponse>(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }

  const serviceClient = createServiceRoleClient(env);

  const [orgsResult, templatesResult] = await Promise.all([
    serviceClient.from("organizations").select("id, name").order("name"),
    serviceClient
      .from("templates")
      .select("id, template_slug")
      .order("template_slug"),
  ]);

  if (orgsResult.error || templatesResult.error) {
    console.error("[admin/ref-data] Fetch failed:", {
      orgsError: orgsResult.error,
      templatesError: templatesResult.error,
    });
    return Response.json<RefDataResponse>(
      { ok: false, error: "Failed to fetch reference data." },
      { status: 500 },
    );
  }

  return Response.json<RefDataResponse>({
    ok: true,
    orgs: orgsResult.data ?? [],
    templates: templatesResult.data ?? [],
  });
}
