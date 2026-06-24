import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

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
// Authorization: verify bearer token; b2b_user and studio_admin both allowed
// ---------------------------------------------------------------------------

type VerifiedCaller = {
  userId: string;
  orgId: string;
  role: "studio_admin" | "b2b_user";
};

async function verifyCaller(
  bearerToken: string,
  supabaseUrl: string,
  anonKey: string,
): Promise<VerifiedCaller | { error: string; status: number }> {
  // Authenticate using the caller's own JWT so profile RLS applies.
  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData?.user) {
    return { error: "Invalid or expired token.", status: 401 };
  }

  const userId = userData.user.id;

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[acquire-license] Profile lookup error:", {
      userId,
      code: profileError.code,
      message: profileError.message,
    });
    return { error: "Profile lookup failed.", status: 403 };
  }

  if (!profile) {
    return { error: "User profile not found.", status: 403 };
  }

  if (profile.role !== "studio_admin" && profile.role !== "b2b_user") {
    return { error: "Forbidden: authenticated user role required.", status: 403 };
  }

  const orgId = profile.organization_id;
  if (!orgId) {
    return { error: "User is not associated with an organization.", status: 403 };
  }

  return { userId, orgId, role: profile.role };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // --- Environment guard ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error(
      "[acquire-license] Missing required environment variables.",
    );
    return Response.json(
      { ok: false, error: "Server misconfiguration." },
      { status: 500 },
    );
  }

  // --- Authorization ---
  const authHeader = request.headers.get("Authorization");
  const bearerToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!bearerToken) {
    return Response.json(
      { ok: false, error: "Authorization header with Bearer token required." },
      { status: 401 },
    );
  }

  const caller = await verifyCaller(bearerToken, supabaseUrl, anonKey);

  if ("error" in caller) {
    return Response.json(
      { ok: false, error: caller.error },
      { status: caller.status },
    );
  }

  // --- Input validation ---
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

  // Prevent a caller from acquiring a license for a different org than their own.
  if (caller.orgId !== org_id) {
    return Response.json(
      { ok: false, error: "org_id does not match the caller's organization." },
      { status: 403 },
    );
  }

  // Service-role client is created locally — bypasses RLS for read/write ops.
  const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Verify template exists and is free-tier ---
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

  // --- Idempotency: return existing license if already active ---
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
      // Already licensed — return the existing record (idempotent success).
      return Response.json(
        { ok: true, licenseId: existing.id, alreadyOwned: true },
        { status: 200 },
      );
    }
  }

  // --- Insert license ---
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
    // Concurrent insert race — treat as idempotent success by re-querying.
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
