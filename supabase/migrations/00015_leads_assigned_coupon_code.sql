-- =============================================================================
-- Migration: 00015_leads_assigned_coupon_code
-- Mashed Games Studio — Built-in Rewards: lead -> coupon attribution
--
-- Adds public.leads.assigned_coupon_code so a captured lead records exactly
-- which discount code it was handed. Written by the claim RPC (00016) via the
-- service role at claim time; nullable because a lead may exist before (or
-- without) a coupon being available for its tier.
--
-- Depends on public.leads (00012).
-- =============================================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_coupon_code text;

COMMENT ON COLUMN public.leads.assigned_coupon_code IS
  'The discount code handed to this lead by public.claim_coupon(). NULL until a code is claimed (or if the tier pool is exhausted).';

COMMIT;
