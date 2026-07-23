import { z } from "zod";
import { PrizeTierEnum } from "./prize-tier";

/**
 * Webhook Dispatcher contracts.
 *
 * These types describe the platform-agnostic outbound webhook system that lets
 * enterprise clients pipe captured leads into their own CRM (Klaviyo, custom
 * endpoints, etc.). No platform-specific plugin logic lives here — the payload
 * is a plain signed JSON POST the client consumes however they like.
 *
 * Webhook settings (`webhook_url` / `webhook_secret`) are dedicated columns on
 * `public.games`, deliberately kept OUT of the flat `GameConfig` blob so the
 * signing secret never leaks into an exported `client.json` bundle.
 */

export const LEAD_WEBHOOK_EVENT = "lead.captured" as const;

/** Header carrying the HMAC-SHA256 signature (`sha256=<hex>`). */
export const WEBHOOK_SIGNATURE_HEADER = "X-MashedGames-Signature";

/** Header carrying the ISO timestamp used for the payload / replay checks. */
export const WEBHOOK_TIMESTAMP_HEADER = "X-MashedGames-Timestamp";

/**
 * Inbound payload posted by the game UI to the leads worker
 * (`POST /api/leads/submit`).
 */
export const LeadSubmitPayloadSchema = z.object({
  gameId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().max(200).optional(),
  prizeTier: PrizeTierEnum.optional(),
  sourceDomain: z.string().max(255).optional(),
});

export type LeadSubmitPayload = z.infer<typeof LeadSubmitPayloadSchema>;

/**
 * The data envelope delivered to the client's `webhook_url`. `timestamp` is
 * stamped server-side (never trusted from the caller).
 */
export const LeadWebhookDataSchema = z.object({
  email: z.string().email(),
  gameId: z.string().uuid(),
  name: z.string().optional(),
  prizeTier: PrizeTierEnum.optional(),
  sourceDomain: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type LeadWebhookData = z.infer<typeof LeadWebhookDataSchema>;

/** Full outbound webhook body: `{ event: "lead.captured", data: {...} }`. */
export const LeadWebhookEventSchema = z.object({
  event: z.literal(LEAD_WEBHOOK_EVENT),
  data: LeadWebhookDataSchema,
});

export type LeadWebhookEvent = z.infer<typeof LeadWebhookEventSchema>;

export function parseLeadSubmitPayload(input: unknown): LeadSubmitPayload {
  return LeadSubmitPayloadSchema.parse(input);
}

/**
 * Builds the canonical outbound webhook event from an inbound lead submission.
 * The returned object is what should be serialized and signed.
 */
export function buildLeadWebhookEvent(
  lead: LeadSubmitPayload,
  timestamp: string = new Date().toISOString(),
): LeadWebhookEvent {
  return {
    event: LEAD_WEBHOOK_EVENT,
    data: {
      email: lead.email,
      gameId: lead.gameId,
      name: lead.name,
      prizeTier: lead.prizeTier,
      sourceDomain: lead.sourceDomain,
      timestamp,
    },
  };
}
