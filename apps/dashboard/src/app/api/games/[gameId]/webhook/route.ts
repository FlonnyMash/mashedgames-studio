import { type NextRequest } from "next/server";
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

function unauthorized(): Response {
  return Response.json(
    { ok: false, error: "Authorization header with Bearer token required." },
    { status: 401 },
  );
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { gameId } = await context.params;

  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) return loaded.response;
  const env = loaded.env;

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) return unauthorized();

  const caller = await verifyAuthenticatedCaller(bearerToken, env);
  if ("error" in caller) {
    return Response.json({ ok: false, error: caller.error }, { status: caller.status });
  }

  // Owner scoping is enforced by RLS on public.games: the row is only returned
  // if the authenticated caller owns the game.
  const supabase = createAnonSupabaseClient(env, bearerToken);
  const { data, error } = await supabase
    .from("games")
    .select("webhook_url, webhook_secret")
    .eq("id", gameId)
    .maybeSingle<WebhookSettings>();

  if (error) {
    console.error("[games/webhook] GET lookup error:", error.message);
    return Response.json({ ok: false, error: "Failed to load webhook settings." }, { status: 500 });
  }
  if (!data) {
    return Response.json({ ok: false, error: "Game not found." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    webhookUrl: data.webhook_url,
    webhookSecret: data.webhook_secret,
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { gameId } = await context.params;

  const loaded = loadSupabaseRuntimeEnv();
  if (!loaded.ok) return loaded.response;
  const env = loaded.env;

  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) return unauthorized();

  const caller = await verifyAuthenticatedCaller(bearerToken, env);
  if ("error" in caller) {
    return Response.json({ ok: false, error: caller.error }, { status: caller.status });
  }

  let body: { webhookUrl?: unknown };
  try {
    body = (await request.json()) as { webhookUrl?: unknown };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = body.webhookUrl;
  // Empty string / null clears the webhook.
  const webhookUrl =
    raw === null || raw === "" || raw === undefined ? null : String(raw).trim();

  if (webhookUrl !== null && !isValidHttpUrl(webhookUrl)) {
    return Response.json(
      { ok: false, error: "webhookUrl must be a valid http(s) URL." },
      { status: 400 },
    );
  }

  const supabase = createAnonSupabaseClient(env, bearerToken);
  const { data, error } = await supabase
    .from("games")
    .update({ webhook_url: webhookUrl })
    .eq("id", gameId)
    .select("webhook_url, webhook_secret")
    .maybeSingle<WebhookSettings>();

  if (error) {
    console.error("[games/webhook] PATCH update error:", error.message);
    return Response.json({ ok: false, error: "Failed to update webhook URL." }, { status: 500 });
  }
  if (!data) {
    return Response.json({ ok: false, error: "Game not found." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    webhookUrl: data.webhook_url,
    webhookSecret: data.webhook_secret,
  });
}
