import { z } from "zod";

// ---------------------------------------------------------------------------
// Supabase API keys (publishable / secret) — NOT JWT signing keys.
// Legacy JWT anon/service_role keys (eyJ...) are rejected once disabled in
// the Supabase dashboard; use sb_publishable_ / sb_secret_ instead.
// ---------------------------------------------------------------------------

const LEGACY_JWT_KEY_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PUBLISHABLE_KEY_RE = /^sb_publishable_[A-Za-z0-9_-]+$/;
const SECRET_KEY_RE = /^sb_secret_[A-Za-z0-9_-]+$/;

function isSupabasePublishableKey(value: string): boolean {
  const trimmed = value.trim();
  return PUBLISHABLE_KEY_RE.test(trimmed) || LEGACY_JWT_KEY_RE.test(trimmed);
}

function isSupabaseSecretKey(value: string): boolean {
  const trimmed = value.trim();
  return SECRET_KEY_RE.test(trimmed) || LEGACY_JWT_KEY_RE.test(trimmed);
}

function isLegacyJwtKey(value: string): boolean {
  return LEGACY_JWT_KEY_RE.test(value.trim());
}

// ---------------------------------------------------------------------------
// JWT signing keys (ES256 P-256) — PEM SPKI / PKCS#8 from Dashboard →
// Project Settings → API → JWT Signing Keys. NOT sb_publishable / sb_secret.
// ---------------------------------------------------------------------------

const PEM_PUBLIC_KEY_RE =
  /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/;
const PEM_PRIVATE_KEY_RE =
  /^-----BEGIN (?:EC )?PRIVATE KEY-----[\s\S]+-----END (?:EC )?PRIVATE KEY-----$/;
const BASE64_KEY_RE = /^[A-Za-z0-9+/=\s-]+$/;

function isSbApiKey(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("sb_publishable_") || trimmed.startsWith("sb_secret_")
  );
}

function isP256PublicKey(value: string): boolean {
  const trimmed = value.trim();
  if (isSbApiKey(trimmed)) return false;
  if (PEM_PUBLIC_KEY_RE.test(trimmed)) return true;
  return BASE64_KEY_RE.test(trimmed) && trimmed.length >= 64;
}

function isP256PrivateKey(value: string): boolean {
  const trimmed = value.trim();
  if (isSbApiKey(trimmed)) return false;
  if (PEM_PRIVATE_KEY_RE.test(trimmed)) return true;
  return BASE64_KEY_RE.test(trimmed) && trimmed.length >= 64;
}

export const SupabasePublishableKeySchema = z
  .string()
  .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required.")
  .refine(isSupabasePublishableKey, {
    message:
      "NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable key (sb_publishable_...) or legacy anon JWT.",
  });

export const SupabaseSecretKeySchema = z
  .string()
  .min(1, "SUPABASE_SERVICE_ROLE_KEY is required.")
  .refine(isSupabaseSecretKey, {
    message:
      "SUPABASE_SERVICE_ROLE_KEY must be a secret key (sb_secret_...) or legacy service_role JWT.",
  });

export const SupabaseAuthPublicKeyP256Schema = z
  .string()
  .min(1, "SUPABASE_AUTH_PUBLIC_KEY_P256 is required.")
  .refine((value) => !isSbApiKey(value), {
    message:
      "SUPABASE_AUTH_PUBLIC_KEY_P256 must be a JWT signing public key (PEM), not sb_publishable_. " +
      "Use NEXT_PUBLIC_SUPABASE_ANON_KEY for the publishable API key.",
  })
  .refine(isP256PublicKey, {
    message:
      "SUPABASE_AUTH_PUBLIC_KEY_P256 must be a PEM SPKI public key from JWT Signing Keys.",
  });

export const SupabaseAuthPrivateKeyP256Schema = z
  .string()
  .min(1, "SUPABASE_AUTH_PRIVATE_KEY_P256 is required.")
  .refine((value) => !isSbApiKey(value), {
    message:
      "SUPABASE_AUTH_PRIVATE_KEY_P256 must be a JWT signing private key (PEM), not sb_secret_. " +
      "Use SUPABASE_SERVICE_ROLE_KEY for the secret API key.",
  })
  .refine(isP256PrivateKey, {
    message:
      "SUPABASE_AUTH_PRIVATE_KEY_P256 must be a PEM PKCS#8 private key from JWT Signing Keys.",
  });

// ---------------------------------------------------------------------------
// Public (browser-safe) Supabase configuration
// ---------------------------------------------------------------------------

export const SupabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL."),
  /** Publishable API key (sb_publishable_...) — replaces legacy anon JWT. */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: SupabasePublishableKeySchema,
});

export type SupabasePublicEnv = z.infer<typeof SupabasePublicEnvSchema>;

// ---------------------------------------------------------------------------
// Server-only Supabase configuration (never NEXT_PUBLIC_* prefixed)
// ---------------------------------------------------------------------------

export const SupabaseServerEnvSchema = z.object({
  /** Secret API key (sb_secret_...) — replaces legacy service_role JWT. */
  SUPABASE_SERVICE_ROLE_KEY: SupabaseSecretKeySchema,
  /** Optional PEM override; JWKS is used when omitted. */
  SUPABASE_AUTH_PUBLIC_KEY_P256: SupabaseAuthPublicKeyP256Schema.optional(),
  /** Optional — only required for custom JWT signing via signJwtEs256. */
  SUPABASE_AUTH_PRIVATE_KEY_P256: SupabaseAuthPrivateKeyP256Schema.optional(),
});

export type SupabaseServerEnv = z.infer<typeof SupabaseServerEnvSchema>;

export const SupabaseRuntimeEnvSchema = SupabasePublicEnvSchema.merge(
  SupabaseServerEnvSchema,
);

export type SupabaseRuntimeEnv = z.infer<typeof SupabaseRuntimeEnvSchema>;

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Returns true when the publishable/secret env vars still use disabled legacy JWT keys. */
export function usesLegacySupabaseApiKeys(env: Record<string, string | undefined>): boolean {
  return (
    isLegacyJwtKey(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "") ||
    isLegacyJwtKey(env.SUPABASE_SERVICE_ROLE_KEY ?? "")
  );
}

export function parseSupabasePublicEnv(
  env: Record<string, string | undefined>,
): SupabasePublicEnv {
  return SupabasePublicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function parseSupabaseServerEnv(
  env: Record<string, string | undefined>,
): SupabaseServerEnv {
  return SupabaseServerEnvSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_AUTH_PUBLIC_KEY_P256: emptyToUndefined(env.SUPABASE_AUTH_PUBLIC_KEY_P256),
    SUPABASE_AUTH_PRIVATE_KEY_P256: emptyToUndefined(env.SUPABASE_AUTH_PRIVATE_KEY_P256),
  });
}

export function parseSupabaseRuntimeEnv(
  env: Record<string, string | undefined>,
): SupabaseRuntimeEnv {
  return SupabaseRuntimeEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_AUTH_PUBLIC_KEY_P256: emptyToUndefined(env.SUPABASE_AUTH_PUBLIC_KEY_P256),
    SUPABASE_AUTH_PRIVATE_KEY_P256: emptyToUndefined(env.SUPABASE_AUTH_PRIVATE_KEY_P256),
  });
}
