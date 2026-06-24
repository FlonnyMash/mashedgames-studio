/**
 * ES256 (ECDSA P-256 + SHA-256) JWT utilities using the Web Crypto API.
 *
 * Edge-compatible — uses `crypto.subtle` only (no node:crypto).
 * Import via `@mashedgames/shared/auth-jwt` from server / edge code only.
 */

const ECDSA_PARAMS: EcKeyImportParams = {
  name: "ECDSA",
  namedCurve: "P-256",
};

const SIGN_VERIFY_ALGORITHM: EcdsaParams = {
  name: "ECDSA",
  hash: "SHA-256",
};

const JWT_ES256_ALG = "ES256";

export type SupabaseJwtClaims = {
  sub: string;
  role?: string;
  email?: string;
  exp: number;
  iat?: number;
  iss?: string;
  aud?: string | string[];
  [key: string]: unknown;
};

export type VerifyJwtOptions = {
  /** Expected issuer (e.g. `https://<ref>.supabase.co/auth/v1`). */
  issuer?: string;
  /** Allowed audiences; when set, claim `aud` must match one entry. */
  audience?: string | string[];
  /** Clock skew tolerance in seconds (default 30). */
  clockSkewSec?: number;
};

export type SignJwtOptions = {
  kid?: string;
  header?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

function base64UrlToBytes(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// PEM / base64 key import
// ---------------------------------------------------------------------------

function decodeStandardBase64(body: string): Uint8Array {
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function keyMaterialToBytes(keyMaterial: string): Uint8Array {
  const trimmed = keyMaterial.trim();
  if (trimmed.includes("-----BEGIN")) {
    const body = trimmed.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, "");
    return decodeStandardBase64(body);
  }
  return decodeStandardBase64(trimmed.replace(/\s/g, ""));
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function importEs256PublicKey(
  keyMaterial: string,
): Promise<CryptoKey> {
  const bytes = keyMaterialToBytes(keyMaterial);
  return crypto.subtle.importKey(
    "spki",
    bufferSource(bytes),
    ECDSA_PARAMS,
    true,
    ["verify"],
  );
}

export async function importEs256PrivateKey(
  keyMaterial: string,
): Promise<CryptoKey> {
  const bytes = keyMaterialToBytes(keyMaterial);
  return crypto.subtle.importKey(
    "pkcs8",
    bufferSource(bytes),
    ECDSA_PARAMS,
    false,
    ["sign"],
  );
}

// ---------------------------------------------------------------------------
// JWS ↔ Web Crypto ECDSA signature format conversion
// JWS uses raw IEEE P1363 (r||s); Web Crypto expects ASN.1 DER SEQUENCE.
// ---------------------------------------------------------------------------

function trimLeadingZeros(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
  return bytes.slice(start);
}

function derEncodeInteger(bytes: Uint8Array): Uint8Array {
  const trimmed = trimLeadingZeros(bytes);
  const needsPad = (trimmed[0]! & 0x80) !== 0;
  const content = needsPad
    ? Uint8Array.from([0, ...trimmed])
    : trimmed.length > 0
      ? trimmed
      : Uint8Array.from([0]);
  return Uint8Array.from([0x02, content.length, ...content]);
}

function jwsSignatureToDer(jwsSig: Uint8Array): Uint8Array {
  if (jwsSig.length !== 64) {
    throw new Error("Invalid ES256 signature length.");
  }
  const r = derEncodeInteger(jwsSig.slice(0, 32));
  const s = derEncodeInteger(jwsSig.slice(32, 64));
  const sequence = Uint8Array.from([...r, ...s]);
  return Uint8Array.from([0x30, sequence.length, ...sequence]);
}

function derSignatureToJws(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) {
    throw new Error("Invalid DER ECDSA signature.");
  }

  let offset = 2;
  if (der[1]! & 0x80) {
    offset = 2 + (der[1]! & 0x7f);
  }

  if (der[offset] !== 0x02) {
    throw new Error("Invalid DER ECDSA signature: missing r integer.");
  }
  const rLen = der[offset + 1]!;
  let rStart = offset + 2;
  let rBytes = der.slice(rStart, rStart + rLen);
  if (rBytes[0] === 0x00) rBytes = rBytes.slice(1);

  offset = rStart + rLen;
  if (der[offset] !== 0x02) {
    throw new Error("Invalid DER ECDSA signature: missing s integer.");
  }
  const sLen = der[offset + 1]!;
  let sStart = offset + 2;
  let sBytes = der.slice(sStart, sStart + sLen);
  if (sBytes[0] === 0x00) sBytes = sBytes.slice(1);

  const jws = new Uint8Array(64);
  jws.set(rBytes, 32 - rBytes.length);
  jws.set(sBytes, 64 - sBytes.length);
  return jws;
}

// ---------------------------------------------------------------------------
// JWT parse / validate claims
// ---------------------------------------------------------------------------

function parseJwtParts(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array;
} {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts as [
    string,
    string,
    string,
  ];

  const header = JSON.parse(bytesToUtf8(base64UrlToBytes(encodedHeader))) as Record<
    string,
    unknown
  >;
  const payload = JSON.parse(bytesToUtf8(base64UrlToBytes(encodedPayload))) as Record<
    string,
    unknown
  >;
  const signature = base64UrlToBytes(encodedSignature);

  return {
    header,
    payload,
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature,
  };
}

function assertAudience(
  audClaim: unknown,
  expected: string | string[] | undefined,
): boolean {
  if (!expected) return true;
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (typeof audClaim === "string") return allowed.includes(audClaim);
  if (Array.isArray(audClaim)) {
    return audClaim.some((entry) => typeof entry === "string" && allowed.includes(entry));
  }
  return false;
}

function validateClaims(
  payload: Record<string, unknown>,
  options: VerifyJwtOptions,
): SupabaseJwtClaims | null {
  const sub = payload.sub;
  const exp = payload.exp;

  if (typeof sub !== "string" || sub.length === 0) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;

  const skew = options.clockSkewSec ?? 30;
  const now = Math.floor(Date.now() / 1000);
  if (exp + skew < now) return null;

  if (options.issuer && payload.iss !== options.issuer) return null;
  if (!assertAudience(payload.aud, options.audience)) return null;

  return payload as SupabaseJwtClaims;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies an ES256 JWT and returns typed Supabase-compatible claims.
 * Returns `null` when verification fails for any reason.
 */
export async function verifyJwtEs256(
  token: string,
  publicKeyMaterial: string,
  options: VerifyJwtOptions = {},
): Promise<SupabaseJwtClaims | null> {
  try {
    const { header, payload, signingInput, signature } = parseJwtParts(token);

    if (header.alg !== JWT_ES256_ALG) return null;

    const publicKey = await importEs256PublicKey(publicKeyMaterial);
    const derSignature = jwsSignatureToDer(signature);
    const valid = await crypto.subtle.verify(
      SIGN_VERIFY_ALGORITHM,
      publicKey,
      bufferSource(derSignature),
      bufferSource(utf8ToBytes(signingInput)),
    );

    if (!valid) return null;
    return validateClaims(payload, options);
  } catch {
    return null;
  }
}

/**
 * Signs a JWT payload with ES256 using a P-256 private key.
 */
export async function signJwtEs256(
  payload: Record<string, unknown>,
  privateKeyMaterial: string,
  options: SignJwtOptions = {},
): Promise<string> {
  const header: Record<string, string> = {
    alg: JWT_ES256_ALG,
    typ: "JWT",
    ...options.header,
  };
  if (options.kid) header.kid = options.kid;

  const encodedHeader = bytesToBase64Url(utf8ToBytes(JSON.stringify(header)));
  const encodedPayload = bytesToBase64Url(utf8ToBytes(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await importEs256PrivateKey(privateKeyMaterial);
  const derSignature = await crypto.subtle.sign(
    SIGN_VERIFY_ALGORITHM,
    privateKey,
    bufferSource(utf8ToBytes(signingInput)),
  );
  const jwsSignature = derSignatureToJws(new Uint8Array(derSignature));

  return `${signingInput}.${bytesToBase64Url(jwsSignature)}`;
}

/** Normalizes a Supabase project URL to the GoTrue issuer string. */
export function supabaseAuthIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
}

/** JWKS document URL for ES256 access-token verification. */
export function supabaseJwksUrl(supabaseUrl: string): string {
  return `${supabaseAuthIssuer(supabaseUrl)}/.well-known/jwks.json`;
}

type JsonWebKeyWithKid = JsonWebKey & { kid?: string; alg?: string; kty?: string };

async function fetchJwksKeys(jwksUrl: string): Promise<JsonWebKeyWithKid[]> {
  const response = await fetch(jwksUrl, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`JWKS fetch failed (${response.status}).`);
  }
  const body = (await response.json()) as { keys?: JsonWebKeyWithKid[] };
  return body.keys ?? [];
}

async function verifyJwtWithJwk(
  signingInput: string,
  signature: Uint8Array,
  jwk: JsonWebKeyWithKid,
): Promise<boolean> {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    ECDSA_PARAMS,
    true,
    ["verify"],
  );
  const derSignature = jwsSignatureToDer(signature);
  return crypto.subtle.verify(
    SIGN_VERIFY_ALGORITHM,
    publicKey,
    bufferSource(derSignature),
    bufferSource(utf8ToBytes(signingInput)),
  );
}

/**
 * Verifies a Supabase user access token against the project's published JWKS.
 * Preferred for runtime verification — no manual PEM paste required.
 */
export async function verifyJwtEs256ViaJwks(
  token: string,
  jwksUrl: string,
  options: VerifyJwtOptions = {},
): Promise<SupabaseJwtClaims | null> {
  try {
    const { header, payload, signingInput, signature } = parseJwtParts(token);
    if (header.alg !== JWT_ES256_ALG) return null;

    const keys = await fetchJwksKeys(jwksUrl);
    const kid = typeof header.kid === "string" ? header.kid : undefined;
    const candidates = kid
      ? keys.filter((entry) => entry.kid === kid)
      : keys;

    for (const jwk of candidates.length > 0 ? candidates : keys) {
      if (jwk.kty && jwk.kty !== "EC") continue;
      if (jwk.alg && jwk.alg !== JWT_ES256_ALG) continue;
      const valid = await verifyJwtWithJwk(signingInput, signature, jwk);
      if (!valid) continue;
      const claims = validateClaims(payload, options);
      if (claims) return claims;
    }

    return null;
  } catch {
    return null;
  }
}
