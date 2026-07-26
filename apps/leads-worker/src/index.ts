import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  LeadSubmitPayloadSchema,
  buildLeadWebhookEvent,
} from "@mashedgames/shared/webhook-contract";
import { normalizePrizeToTier } from "@mashedgames/shared/prize-tier";
import { buildSignedWebhookHeaders } from "@mashedgames/shared/webhook-sign";

/**
 * Mashed Games — Leads Worker
 *
 * Platform-agnostic Webhook Dispatcher. The public game UI posts captured leads
 * to `POST /api/leads/submit`. When the target game has a `webhook_url`
 * configured, we HMAC-sign the payload and forward it to the client's CRM via
 * `ctx.waitUntil(...)` so a slow or dead endpoint never blocks (or crashes) the
 * player's game. No Shopify/WordPress/platform-specific logic lives here.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGIN?: string;
}

const LEADS_SUBMIT_PATH = "/api/leads/submit";

/**
 * Resolves the `Access-Control-Allow-Origin` value.
 *
 * `ALLOWED_ORIGIN` may be:
 *  - unset or "*"        -> allow any origin (public, credential-free endpoint)
 *  - a comma-separated allowlist ("https://a.com, http://localhost:5173")
 *    -> echo the caller's Origin when it matches, so specific deployments
 *       (including local dev ports) can be restricted without breaking others.
 */
function resolveAllowOrigin(env: Env, requestOrigin: string | null): string {
  const raw = env.ALLOWED_ORIGIN?.trim();
  if (!raw || raw === "*") return "*";

  const allowlist = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (requestOrigin && allowlist.includes(requestOrigin)) {
    return requestOrigin;
  }
  // Fall back to the first configured origin for non-matching callers.
  return allowlist[0] ?? "*";
}

function corsHeaders(
  env: Env,
  requestOrigin: string | null,
): Record<string, string> {
  const allowOrigin = resolveAllowOrigin(env, requestOrigin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  // When the value is origin-specific, caches must key on Origin.
  if (allowOrigin !== "*") {
    headers.Vary = "Origin";
  }
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  env: Env,
  requestOrigin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env, requestOrigin),
    },
  });
}

type GameWebhookRow = {
  webhook_url: string | null;
  webhook_secret: string;
};

/**
 * Creates a service-role Supabase client (bypasses RLS). Session persistence and
 * token auto-refresh are disabled — the Worker is stateless and short-lived.
 */
function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function lookupGameWebhook(
  supabase: SupabaseClient,
  gameId: string,
): Promise<GameWebhookRow | null> {
  const { data, error } = await supabase
    .from("games")
    .select("webhook_url, webhook_secret")
    .eq("id", gameId)
    .maybeSingle<GameWebhookRow>();

  if (error) {
    console.error("[leads-worker] game lookup failed", {
      gameId,
      code: error.code,
    });
    return null;
  }
  return data;
}

/**
 * Fire-and-forget dispatch of a signed webhook. Never throws: a down or slow
 * client endpoint must not affect the response already returned to the game.
 */
async function dispatchWebhook(
  webhookUrl: string,
  secret: string,
  body: string,
  timestamp: string,
): Promise<void> {
  try {
    const headers = await buildSignedWebhookHeaders(secret, body, timestamp);
    const controller = new AbortController();
    // Strict 5s ceiling: a dead/slow client CRM must never keep the dispatch
    // (and thus the Worker invocation) alive longer than necessary.
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn("[leads-worker] webhook endpoint returned non-2xx", {
        status: response.status,
      });
    }
  } catch (err) {
    console.error("[leads-worker] webhook dispatch failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fire-and-forget trigger for the Double Opt-In (DOI) verification email.
 *
 * TODO(doi-email-integration): this is the exact integration point for a real
 * transactional email provider (Resend / SendGrid / etc). It is intentionally
 * stubbed — no provider or secret is wired up yet. The follow-up task adding
 * `GET /api/leads/verify` will build the verification link from
 * `verification_token` and dispatch the actual email here.
 *
 * Never throws: like the webhook dispatch, a failure here must not affect the
 * response already returned to the game.
 */
async function triggerDoubleOptin(
  leadId: string,
  email: string,
  verificationToken: string,
): Promise<void> {
  try {
    console.log("[leads-worker] DOI pending (email not yet wired)", {
      leadId,
      email,
      verificationToken,
    });
  } catch (err) {
    console.error("[leads-worker] triggerDoubleOptin failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleLeadSubmit(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const requestOrigin = request.headers.get("Origin");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400, env, requestOrigin);
  }

  const parsed = LeadSubmitPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "invalid_payload" }, 400, env, requestOrigin);
  }
  const lead = parsed.data;

  const supabase = createSupabaseClient(env);

  const game = await lookupGameWebhook(supabase, lead.gameId);
  if (!game) {
    return jsonResponse({ ok: false, error: "game_not_found" }, 404, env, requestOrigin);
  }

  // Normalize the prize tier exactly once so the external webhook payload and
  // the persisted lead row carry the identical strict PrizeTierEnum value.
  // `prizeTier` is optional on the inbound payload; missing/blank falls back to
  // the lowest tier via normalizePrizeToTier.
  const prizeTier = normalizePrizeToTier(lead.prizeTier ?? "");
  const normalizedLead = { ...lead, prizeTier };

  // 1. Webhook dispatch (AND, not XOR): when a client CRM webhook is configured
  //    we build + sign the exact body and fire it out of band. This never
  //    short-circuits — control always falls through to the Built-in Rewards
  //    pipeline below. `dispatchWebhook` is wrapped in try/catch with a strict
  //    5s AbortController timeout, so a dead endpoint can neither block nor
  //    crash the Worker.
  if (game.webhook_url) {
    const timestamp = new Date().toISOString();
    const event = buildLeadWebhookEvent(normalizedLead, timestamp);
    const body = JSON.stringify(event);

    ctx.waitUntil(
      dispatchWebhook(game.webhook_url, game.webhook_secret, body, timestamp),
    );
  }

  // 2. Built-in Rewards (always runs): persist the lead as `unverified` with a
  //    freshly minted verification token, then kick off the Double Opt-In flow.
  const verificationToken = crypto.randomUUID();

  const { data: insertedLead, error: insertError } = await supabase
    .from("leads")
    .insert({
      game_id: lead.gameId,
      email: lead.email,
      prize_tier: prizeTier,
      status: "unverified",
      verification_token: verificationToken,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !insertedLead) {
    console.error("[leads-worker] lead insert failed", {
      gameId: lead.gameId,
      code: insertError?.code,
    });
    return jsonResponse({ ok: false, error: "lead_insert_failed" }, 500, env, requestOrigin);
  }

  // 3. Double Opt-In trigger: fire-and-forget so the HTTP response is fully
  //    decoupled from the (currently stubbed) email dispatch.
  ctx.waitUntil(
    triggerDoubleOptin(insertedLead.id, lead.email, verificationToken),
  );

  // The 200 is gated strictly on the Supabase insert succeeding — never on the
  // webhook fetch or the DOI stub.
  return jsonResponse({ ok: true }, 200, env, requestOrigin);
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const requestOrigin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env, requestOrigin),
      });
    }

    const url = new URL(request.url);
    if (url.pathname === LEADS_SUBMIT_PATH) {
      if (request.method !== "POST") {
        return jsonResponse(
          { ok: false, error: "method_not_allowed" },
          405,
          env,
          requestOrigin,
        );
      }
      return handleLeadSubmit(request, env, ctx);
    }

    return jsonResponse({ ok: false, error: "not_found" }, 404, env, requestOrigin);
  },
} satisfies ExportedHandler<Env>;
