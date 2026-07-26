-- =============================================================================
-- Migration: 00016_claim_coupon_function
-- Mashed Games Studio — Built-in Rewards: atomic coupon claim RPC
--
-- public.claim_coupon() hands out exactly one available code for a
-- (game_id, prize_tier) pool to a verified lead, race-safely:
--
--   1. Select ONE coupon where current_uses < max_uses, oldest first.
--   2. Lock it with FOR UPDATE SKIP LOCKED so concurrent callers never contend
--      on the same row — each gets a distinct available code (or NULL if none
--      remain unlocked/available).
--   3. Increment current_uses and stamp the code onto the lead.
--   4. Return the claimed code, or NULL when the tier pool is exhausted.
--
-- The lock is held for the duration of the calling transaction; the two UPDATEs
-- and the SELECT commit atomically, so a code can never be claimed past
-- max_uses even under heavy concurrency.
--
-- Invoked exclusively by the Cloudflare leads worker via the service role.
--
-- Depends on public.coupons (00014), public.leads (00015), public.prize_tier (00012).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_coupon(
  p_game_id    uuid,
  p_prize_tier public.prize_tier,
  p_lead_id    uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_coupon_id uuid;
  v_code      text;
BEGIN
  -- Grab the oldest still-available code for this pool and lock it. SKIP LOCKED
  -- means a concurrent claim already holding a row simply moves past it to the
  -- next candidate instead of blocking.
  SELECT id, code
    INTO v_coupon_id, v_code
    FROM public.coupons
   WHERE game_id = p_game_id
     AND prize_tier = p_prize_tier
     AND current_uses < max_uses
   ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
   LIMIT 1;

  -- No available code remained for this tier.
  IF v_coupon_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.coupons
     SET current_uses = current_uses + 1
   WHERE id = v_coupon_id;

  UPDATE public.leads
     SET assigned_coupon_code = v_code
   WHERE id = p_lead_id;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.claim_coupon(uuid, public.prize_tier, uuid) IS
  'Atomically claims one available coupon (current_uses < max_uses) for a game+tier, increments its usage, attributes it to the lead, and returns the code (or NULL if the pool is exhausted). Service-role only.';

-- Least privilege: only the service role (leads worker) may claim.
REVOKE ALL ON FUNCTION public.claim_coupon(uuid, public.prize_tier, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_coupon(uuid, public.prize_tier, uuid) TO service_role;

COMMIT;
