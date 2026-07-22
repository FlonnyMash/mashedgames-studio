-- =============================================================================
-- Migration: 00011_game_webhooks
-- Mashed Games Studio — Webhook Dispatcher (enterprise CRM integration)
--
-- Adds per-game outbound webhook settings to public.games:
--   - webhook_url:    nullable client CRM endpoint (Klaviyo, custom, etc.)
--   - webhook_secret: HMAC-SHA256 signing secret, auto-generated on insert.
--
-- The secret is NOT a platform token — it is a per-game shared signing secret
-- the client uses to verify our payloads. It lives behind the existing
-- owner-scoped RLS on public.games (see 00003) so the owning user can read it
-- to configure verification on their end. The Cloudflare leads-worker reads it
-- via the service role (bypassing RLS) to sign outbound webhooks.
-- =============================================================================

BEGIN;

-- On hosted Supabase, pgcrypto lives in the `extensions` schema (not public),
-- so gen_random_bytes must be schema-qualified. CREATE EXTENSION is a no-op if
-- already present.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS webhook_url text;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS webhook_secret text NOT NULL
    DEFAULT encode(extensions.gen_random_bytes(32), 'hex');

-- Backfill any rows that predate the default (defensive; DEFAULT covers new rows).
UPDATE public.games
  SET webhook_secret = encode(extensions.gen_random_bytes(32), 'hex')
  WHERE webhook_secret IS NULL OR webhook_secret = '';

COMMENT ON COLUMN public.games.webhook_url IS
  'Client CRM webhook endpoint. When set, lead capture dispatches a signed lead.captured event here and bypasses internal handling.';
COMMENT ON COLUMN public.games.webhook_secret IS
  'Per-game HMAC-SHA256 signing secret (hex). Auto-generated on insert. Used to sign the X-MashedGames-Signature header on outbound webhooks.';

COMMIT;
