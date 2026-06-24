import type { NextRequest } from "next/server";
import {
  createServiceRoleClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";

export const runtime = "edge";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AcquirePayload = {
  template_id: string;
  org_id: string;
};

function validatePayload(body: unknown): AcquirePayload | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const { template_id, org_id } = body as Record<string, unknown>;

  if (typeof template_id !== "string" || !UUID_RE.test(template_id)) {
    return { error: "template_id must be a valid UUID v4 string." };
  }

  if (typeof org_id !== "string" || org_id.trim().length === 0) {
    return { error: "org_id must be a non-empty string." };
  }

  return { template_id, org_id };
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

  const caller = await verifyAuthenticatedCaller(bearerToken, env);
  if ("error" in caller) {
    return Response.json(
      { ok: false, error: caller.error },
      { status: caller.status },
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

  const { template_id, org_id } = validated;

  if (caller.orgId !== org_id) {
    return Response.json(
      { ok: false, error: "org_id does not match the caller's organization." },
      { status: 403 },
    );
  }

  const serviceClient = createServiceRoleClient(env);

  const { data: template, error: templateError } = await serviceClient
    .from("templates")
    .select("id, tier, yanked, is_latest")
    .eq("id", template_id)
    .maybeSingle();

  if (templateError) {
    console.error("[acquire-license] Template lookup error:", templateError);
    return Response.json(
      { ok: false, error: "Template lookup failed." },
      { status: 500 },
    );
  }

  if (!template) {
    return Response.json(
      { ok: false, error: "Template not found." },
      { status: 404 },
    );
  }

  if (template.yanked || !template.is_latest) {
    return Response.json(
      { ok: false, error: "Template is not available for acquisition." },
      { status: 410 },
    );
  }

  if (template.tier !== "free") {
    return Response.json(
      {
        ok: false,
        error:
          "Only free-tier templates can be self-acquired. Contact your account manager to license premium or enterprise templates.",
      },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await serviceClient
    .from("licenses")
    .select("id, valid_until")
    .eq("organization_id", org_id)
    .eq("template_id", template_id)
    .maybeSingle();

  if (existingError) {
    console.error("[acquire-license] Idempotency check error:", existingError);
    return Response.json(
      { ok: false, error: "License lookup failed." },
      { status: 500 },
    );
  }

  if (existing) {
    const isActive =
      existing.valid_until === null || existing.valid_until > now;

    if (isActive) {
      return Response.json(
        { ok: true, licenseId: existing.id, alreadyOwned: true },
        { status: 200 },
      );
    }
  }

  const { data: inserted, error: insertError } = await serviceClient
    .from("licenses")
    .insert({
      organization_id: org_id,
      template_id,
      max_projects: -1,
      valid_until: null,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await serviceClient
        .from("licenses")
        .select("id")
        .eq("organization_id", org_id)
        .eq("template_id", template_id)
        .maybeSingle();

      if (raced) {
        return Response.json(
          { ok: true, licenseId: raced.id, alreadyOwned: true },
          { status: 200 },
        );
      }
    }

    console.error("[acquire-license] Insert error:", insertError);
    return Response.json(
      { ok: false, error: "Failed to create license record." },
      { status: 500 },
    );
  }

  console.info(
    `[acquire-license] Free template acquired: org=${org_id} ` +
      `template=${template_id} license_id=${inserted.id} ` +
      `caller=${caller.userId} role=${caller.role}`,
  );

  return Response.json({ ok: true, licenseId: inserted.id }, { status: 201 });
}
