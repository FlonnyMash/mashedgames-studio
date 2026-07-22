import { WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER } from "./webhook-contract";

/**
 * Shared HMAC-SHA256 signing for outbound webhooks.
 *
 * Uses the Web Crypto API (`crypto.subtle`) so the exact same implementation
 * runs in the Cloudflare Worker, the Next.js edge route, and Node 20+ (which
 * exposes `crypto.subtle` globally). No Node-only APIs.
 */

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Computes the hex-encoded HMAC-SHA256 of `payload` using `secret`.
 * `payload` MUST be the exact string that is sent as the request body so the
 * receiver can recompute the signature byte-for-byte.
 */
export async function signWebhookPayload(
  secret: string,
  payload: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return toHex(signature);
}

/**
 * Builds the headers for an outbound webhook request, including the
 * `sha256=<hex>` signature and the timestamp used to build the payload.
 */
export async function buildSignedWebhookHeaders(
  secret: string,
  payload: string,
  timestamp: string,
): Promise<Record<string, string>> {
  const hex = await signWebhookPayload(secret, payload);
  return {
    "Content-Type": "application/json",
    [WEBHOOK_SIGNATURE_HEADER]: `sha256=${hex}`,
    [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
  };
}
