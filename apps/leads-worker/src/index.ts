import { createClient } from "@supabase/supabase-js";
import {
  LeadSubmitPayloadSchema,
  buildLeadWebhookEvent,
} from "@mashedgames/shared/webhook-contract";
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

async function lookupGameWebhook(
  env: Env,
  gameId: string,
): Promise<GameWebhookRow | null> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

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
    const timeout = setTimeout(() => controller.abort(), 10_000);

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

  const game = await lookupGameWebhook(env, lead.gameId);
  if (!game) {
    return jsonResponse({ ok: false, error: "game_not_found" }, 404, env, requestOrigin);
  }

  // No webhook configured: fall through to internal handling. The internal
  // DOI/coupon pipeline does not exist yet; return success so the game UI
  // proceeds normally. (Documented stub — see plan.)
  if (!game.webhook_url) {
    return jsonResponse({ ok: true, handledBy: "internal" }, 200, env, requestOrigin);
  }

  // Webhook path: build + sign the exact body we send, dispatch out of band,
  // and immediately return success — bypassing internal DOI/coupon logic.
  const timestamp = new Date().toISOString();
  const event = buildLeadWebhookEvent(lead, timestamp);
  const body = JSON.stringify(event);

  ctx.waitUntil(
    dispatchWebhook(game.webhook_url, game.webhook_secret, body, timestamp),
  );

  return jsonResponse({ ok: true, handledBy: "webhook" }, 200, env, requestOrigin);
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
