import { createClient } from "@supabase/supabase-js";
import {
  parseSupabasePublicEnv,
  parseSupabaseRuntimeEnv,
  type SupabasePublicEnv,
  type SupabaseRuntimeEnv,
} from "@mashedgames/shared/env-schema";
import {
  supabaseAuthIssuer,
  supabaseJwksUrl,
  verifyJwtEs256,
  verifyJwtEs256ViaJwks,
  type SupabaseJwtClaims,
} from "@mashedgames/shared/auth-jwt";
import type { Database } from "@/types/database.types";

export type { SupabasePublicEnv, SupabaseRuntimeEnv, SupabaseJwtClaims };

export type AuthFailure = { error: string; status: number };

export type VerifiedStudioAdmin = { userId: string };

export type VerifiedCaller = {
  userId: string;
  orgId: string;
  role: "studio_admin" | "b2b_user";
};

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return parseSupabasePublicEnv(process.env);
}

export function getSupabaseRuntimeEnv(): SupabaseRuntimeEnv {
  return parseSupabaseRuntimeEnv(process.env);
}

export function extractBearerToken(
  authHeader: string | null,
): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

// ---------------------------------------------------------------------------
// ES256 JWT verification (local — no round-trip to GoTrue)
// ---------------------------------------------------------------------------

export type TokenVerificationResult =
  | { ok: true; claims: SupabaseJwtClaims }
  | { ok: false; error: string; status: number };

export async function verifySupabaseAccessToken(
  bearerToken: string,
  env: Pick<
    SupabaseRuntimeEnv,
    "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_AUTH_PUBLIC_KEY_P256"
  >,
): Promise<TokenVerificationResult> {
  const verifyOptions = {
    issuer: supabaseAuthIssuer(env.NEXT_PUBLIC_SUPABASE_URL),
    audience: "authenticated",
  };

  const pemKey = env.SUPABASE_AUTH_PUBLIC_KEY_P256?.trim();
  const claims = pemKey
    ? await verifyJwtEs256(bearerToken, pemKey, verifyOptions)
    : await verifyJwtEs256ViaJwks(
        bearerToken,
        supabaseJwksUrl(env.NEXT_PUBLIC_SUPABASE_URL),
        verifyOptions,
      );

  if (!claims) {
    return { ok: false, error: "Invalid or expired token.", status: 401 };
  }

  return { ok: true, claims };
}

// ---------------------------------------------------------------------------
// Supabase client factories (server / edge route handlers)
// ---------------------------------------------------------------------------

export function createAnonSupabaseClient(
  env: SupabasePublicEnv,
  bearerToken?: string,
) {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: bearerToken
        ? { headers: { Authorization: `Bearer ${bearerToken}` } }
        : undefined,
    },
  );
}

export function createServiceRoleClient(env: SupabaseRuntimeEnv) {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

// ---------------------------------------------------------------------------
// Role-aware authorization helpers
// ---------------------------------------------------------------------------

export async function verifyStudioAdmin(
  bearerToken: string,
  env: SupabaseRuntimeEnv,
): Promise<VerifiedStudioAdmin | AuthFailure> {
  const tokenResult = await verifySupabaseAccessToken(bearerToken, env);
  if (!tokenResult.ok) {
    return { error: tokenResult.error, status: tokenResult.status };
  }

  const userClient = createAnonSupabaseClient(env, bearerToken);
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", tokenResult.claims.sub)
    .maybeSingle();

  if (profileError) {
    console.error("[supabase-auth] Profile lookup error:", {
      userId: tokenResult.claims.sub,
      code: profileError.code,
      message: profileError.message,
    });
    return { error: "Profile lookup failed.", status: 403 };
  }

  if (!profile) {
    return { error: "User profile not found.", status: 403 };
  }

  if (profile.role !== "studio_admin") {
    return { error: "Forbidden: studio_admin role required.", status: 403 };
  }

  return { userId: tokenResult.claims.sub };
}

export async function verifyAuthenticatedCaller(
  bearerToken: string,
  env: SupabaseRuntimeEnv,
): Promise<VerifiedCaller | AuthFailure> {
  const tokenResult = await verifySupabaseAccessToken(bearerToken, env);
  if (!tokenResult.ok) {
    return { error: tokenResult.error, status: tokenResult.status };
  }

  const userClient = createAnonSupabaseClient(env, bearerToken);
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role, organization_id")
    .eq("id", tokenResult.claims.sub)
    .maybeSingle();

  if (profileError) {
    console.error("[supabase-auth] Profile lookup error:", {
      userId: tokenResult.claims.sub,
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

  return {
    userId: tokenResult.claims.sub,
    orgId,
    role: profile.role,
  };
}

export function misconfiguredSupabaseResponse(): Response {
  console.error(
    "[supabase-auth] Missing required environment variables. " +
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and " +
      "SUPABASE_SERVICE_ROLE_KEY must all be set. " +
      "Use sb_publishable_ / sb_secret_ keys if legacy JWT keys are disabled.",
  );
  return Response.json({ ok: false, error: "Server misconfiguration." }, { status: 500 });
}

export function loadSupabaseRuntimeEnv():
  | { ok: true; env: SupabaseRuntimeEnv }
  | { ok: false; response: Response } {
  try {
    return { ok: true, env: getSupabaseRuntimeEnv() };
  } catch {
    return { ok: false, response: misconfiguredSupabaseResponse() };
  }
}
