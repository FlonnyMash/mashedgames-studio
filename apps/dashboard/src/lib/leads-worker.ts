/**
 * Resolves the base URL of the Mashed Games leads worker (Cloudflare Worker).
 *
 * The URL is deployment-global (not per-game), so it comes from
 * `NEXT_PUBLIC_WORKER_URL`. In the Vite demo shell this env is injected via a
 * `define` in `vite.demo.config.ts`; in Next.js it is inlined at build time.
 *
 * When unset we fall back to the local `wrangler dev` default. This mirrors the
 * existing `NEXT_PUBLIC_GAME_ENGINE_URL` -> `http://localhost:5173` convention
 * in `bridge/messenger.ts` and keeps local development turnkey without
 * hardcoding a production URL.
 */

const DEFAULT_DEV_WORKER_URL = "http://127.0.0.1:8787";

export function getLeadsWorkerUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WORKER_URL?.trim();
  const base = fromEnv || DEFAULT_DEV_WORKER_URL;
  return base.replace(/\/+$/, "");
}

/** Full endpoint for lead ingestion (`POST`). */
export function getLeadsSubmitUrl(): string {
  return `${getLeadsWorkerUrl()}/api/leads/submit`;
}
