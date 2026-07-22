import { type NextRequest } from "next/server";
import { buildLeadWebhookEvent } from "@mashedgames/shared/webhook-contract";
import { buildSignedWebhookHeaders } from "@mashedgames/shared/webhook-sign";
import {
  createAnonSupabaseClient,
  extractBearerToken,
  loadSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";

export const runtime = "edge";

type RouteContext = { params: Promise<{ gameId: string }> };

type WebhookSettings = {
  webhook_url: string | null;
  webhook_secret: string;
};

const TEST_EMAIL = "test-lead@mashedgames.io";
const TEST_PRIZE_TIER = "test-tier";

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { gameId } = await context.params;

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
    return Response.json({ ok: false, error: caller.error }, { status: caller.status });
  }

  // Owner-scoped read (RLS). Reading the secret here is safe: the caller owns
  // the game and the secret never leaves the server on this path.
  const supabase = createAnonSupabaseClient(env, bearerToken);
  const { data, error } = await supabase
    .from("games")
    .select("webhook_url, webhook_secret")
    .eq("id", gameId)
    .maybeSingle<WebhookSettings>();

  if (error) {
    console.error("[games/webhook/test] lookup error:", error.message);
    return Response.json({ ok: false, error: "Failed to load webhook settings." }, { status: 500 });
  }
  if (!data) {
    return Response.json({ ok: false, error: "Game not found." }, { status: 404 });
  }
  if (!data.webhook_url) {
    return Response.json(
      { ok: false, error: "No webhook URL configured for this game." },
      { status: 400 },
    );
  }

  const timestamp = new Date().toISOString();
  const event = buildLeadWebhookEvent(
    {
      gameId,
      email: TEST_EMAIL,
      prizeTier: TEST_PRIZE_TIER,
      sourceDomain: request.headers.get("origin") ?? "dashboard.mashedgames.io",
    },
    timestamp,
  );
  const body = JSON.stringify(event);
  const headers = await buildSignedWebhookHeaders(
    data.webhook_secret,
    body,
    timestamp,
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(data.webhook_url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return Response.json({
      ok: response.ok,
      status: response.status,
      delivered: response.ok,
      error: response.ok ? undefined : `Endpoint returned ${response.status}.`,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        delivered: false,
        error:
          err instanceof Error && err.name === "AbortError"
            ? "Webhook endpoint timed out."
            : "Could not reach the webhook endpoint.",
      },
      { status: 502 },
    );
  }
}
