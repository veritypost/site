-- 163 — COPPA `parental_consents` table.
--
-- C15 / Q8 Option A+refinement — the Kids COPPA gate is placed at
-- pair time (parent is demonstrably present: logged into adult app,
-- generated code, handed it to the child). That pair flow IS the
-- consent ceremony. Per COPPA + GDPR-Kids standards of care, the
-- consent must be documented as a structured record, not just
-- inferred from "a row got written".
--
-- This table is the legal-evidence layer. The pair-code redemption
-- RPC has always implicitly recorded parent↔kid linkage via
-- kid_pair_codes; this migration adds an explicit, queryable,
-- immutable-by-convention row tied to the exact pairing event with
-- IP + UA + method so a COPPA audit can point at a single row per
-- pairing.
--
-- Downstream: `/api/kids/pair` writes this row after the JWT mint
-- succeeds. Future auditors, deletion flows, and GDPR export paths
-- read from this table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.parental_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  kid_profile_id uuid NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  -- Enum of method identifiers so a future migration can add other
  -- consent paths (e.g. 'credit_card_verify_v1', 'signed_form_v1')
  -- without schema change. Current canonical value:
  --   'pair_code_redeem_v1' — parent generated + shared a pair code
  --                            that the kid device redeemed.
  consent_method text NOT NULL,
  -- Truncated IP stored as text so we're flexible on IPv4/IPv6/
  -- redaction scheme. Caller decides how much of the IP to persist.
  consent_ip text,
  -- User-agent of the kid device at pair time, capped to 512 chars
  -- at the caller. Not for tracking — for audit forensics.
  consent_user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fk_parental_consents_parent
    FOREIGN KEY (parent_user_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT fk_parental_consents_kid
    FOREIGN KEY (kid_profile_id) REFERENCES public.kid_profiles (id) ON DELETE CASCADE,
  -- One live consent record per parent↔kid pair. If a kid is
  -- unpaired + re-paired, the old row gets replaced on re-pair via
  -- ON CONFLICT DO UPDATE in the pair route. Historical rows go to
  -- a separate `parental_consent_revocations` table when that
  -- lifecycle lands (separate migration when unpair UX requires it).
  CONSTRAINT uq_parental_consents_parent_kid UNIQUE (parent_user_id, kid_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_parental_consents_kid_profile_id
  ON public.parental_consents (kid_profile_id);
CREATE INDEX IF NOT EXISTS idx_parental_consents_parent_user_id
  ON public.parental_consents (parent_user_id);

ALTER TABLE public.parental_consents ENABLE ROW LEVEL SECURITY;

-- Parent reads their own consent records (and only their own).
-- Used by the GDPR export + admin audit surfaces.
CREATE POLICY "parental_consents_select_parent" ON public.parental_consents
FOR SELECT USING (
  parent_user_id = auth.uid()
);

-- Writes are service-role only. The /api/kids/pair route writes via
-- service_role after a successful redeem; nothing else should write
-- directly. No INSERT/UPDATE/DELETE policies for authenticated means
-- those paths fail closed.

COMMIT;
