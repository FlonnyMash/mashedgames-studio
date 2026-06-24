import type { NextRequest } from "next/server";
import type { SupabaseRuntimeEnv } from "@/lib/supabase-auth";
import {
  createServiceRoleClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyStudioAdmin,
} from "@/lib/supabase-auth";

export const runtime = "edge";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORG_ID_RE = /^org_[a-z0-9_-]{1,64}$/;

type ProvisionPayload = {
  org_id: string;
  template_id: string;
  max_projects?: number;
  valid_until?: string | null;
};

function validatePayload(body: unknown): ProvisionPayload | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const { org_id, template_id, max_projects, valid_until } = body as Record<
    string,
    unknown
  >;

  if (typeof org_id !== "string" || !ORG_ID_RE.test(org_id)) {
    return {
      error:
        'org_id must be a string matching the pattern "org_<slug>" (e.g. "org_acme").',
    };
  }

  if (typeof template_id !== "string" || !UUID_RE.test(template_id)) {
    return { error: "template_id must be a valid UUID v4 string." };
  }

  if (max_projects !== undefined) {
    if (
      typeof max_projects !== "number" ||
      !Number.isInteger(max_projects) ||
      max_projects < -1
    ) {
      return {
        error: "max_projects must be an integer ≥ -1 (use -1 for unlimited).",
      };
    }
  }

  if (valid_until !== undefined && valid_until !== null) {
    if (typeof valid_until !== "string" || isNaN(Date.parse(valid_until))) {
      return { error: "valid_until must be an ISO 8601 date string or null." };
    }
  }

  return {
    org_id,
    template_id,
    max_projects: typeof max_projects === "number" ? max_projects : -1,
    valid_until: valid_until ?? null,
  };
}

// ---------------------------------------------------------------------------
// Core provisioning logic
// ---------------------------------------------------------------------------

async function provisionOrgLicense(
  org_id: string,
  template_id: string,
  max_projects: number,
  valid_until: string | null,
  env: SupabaseRuntimeEnv,
): Promise<{ ok: true; licenseId: string } | { ok: false; error: string }> {
  const serviceClient = createServiceRoleClient(env);

  const { data, error } = await serviceClient
    .from("licenses")
    .insert({
      organization_id: org_id,
      template_id,
      max_projects,
      valid_until: valid_until ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: `License for org '${org_id}' and template '${template_id}' already exists.`,
      };
    }
    if (error.code === "23503") {
      return {
        ok: false,
        error: `org_id or template_id not found. Verify both exist before provisioning.`,
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, licenseId: data.id };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) return loaded.response;
  const env = loaded.env;

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) {
    return Response.json(
      { ok: false, error: "Authorization header with Bearer token required." },
      { status: 401 },
    );
  }

  const authResult = await verifyStudioAdmin(bearerToken, env);
  if ("error" in authResult) {
    return Response.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const validated = validatePayload(body);
  if ("error" in validated) {
    return Response.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const { org_id, template_id, max_projects, valid_until } = validated;

  const result = await provisionOrgLicense(
    org_id,
    template_id,
    max_projects ?? -1,
    valid_until ?? null,
    env,
  );

  if (!result.ok) {
    const isClientError =
      result.error.includes("already exists") ||
      result.error.includes("not found");
    return Response.json(
      { ok: false, error: result.error },
      { status: isClientError ? 409 : 500 },
    );
  }

  console.info(
    `[provision-license] License provisioned: org=${org_id} ` +
      `template=${template_id} max_projects=${max_projects} ` +
      `valid_until=${valid_until ?? "perpetual"} ` +
      `license_id=${result.licenseId} ` +
      `granted_by=${authResult.userId}`,
  );

  return Response.json({ ok: true, licenseId: result.licenseId }, { status: 201 });
}
