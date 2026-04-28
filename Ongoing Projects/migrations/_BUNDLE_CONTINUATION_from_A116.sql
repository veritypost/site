-- =====================================================================
-- _BUNDLE_CONTINUATION_from_A116.sql
-- Resume the apply from S1-A116 onward.
-- A115 (uq_pso_key_scope) is already on the live DB — skipped.
-- =====================================================================

-- =====================================================================
-- ===== 2026-04-27_S1_A116_score_events_action_fk.sql =====
-- =====================================================================
-- S1-A116 — score_events.action: add FK to score_rules.action
--
-- score_events.action (varchar) records which scoring rule triggered an event
-- but has no FK constraint. score_rules.action already has UNIQUE (confirmed
-- 2026-04-27: constraint score_rules_action_key). Orphan check: 0 score_events
-- rows reference an action not in score_rules (verified 2026-04-27).
--
-- The constraint prevents inserting score_events for undefined rule names,
-- which would silently corrupt leaderboard queries that JOIN on action.
--
-- ON DELETE RESTRICT: if a rule is ever removed, we need to decide whether
-- to keep or purge the historical events — RESTRICT forces that decision.
--
-- Acceptance: pg_constraint contains fk_score_events_action for score_events.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.score_events'::regclass
       AND conname='fk_score_events_action'
  ) THEN
    RAISE NOTICE 'S1-A116 no-op: FK already present';
  END IF;
  -- Orphan guard: abort if any score_events.action has no matching rule.
  IF EXISTS (
    SELECT 1 FROM score_events se
     WHERE NOT EXISTS (SELECT 1 FROM score_rules sr WHERE sr.action = se.action)
       AND se.action IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'S1-A116 abort: orphan score_events.action values found — resolve before adding FK';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_score_events_action' AND conrelid = 'public.score_events'::regclass) THEN
    ALTER TABLE public.score_events
      ADD CONSTRAINT fk_score_events_action
      FOREIGN KEY (action) REFERENCES public.score_rules(action)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.score_events'::regclass
       AND conname='fk_score_events_action'
  ) THEN
    RAISE EXCEPTION 'S1-A116 post-check failed: fk_score_events_action not found';
  END IF;
  RAISE NOTICE 'S1-A116 applied: score_events.action → score_rules.action FK added';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_A101_mute_check.sql =====
-- =====================================================================
-- S1-A101 — users: add silent-mute CHECK constraint (Q4.16 lock)
--
-- Decision (Q4.16): "Both halves — DB CHECK constraint requires muted_until IS NOT NULL
-- when is_muted=true, AND appeal page surfaces silent mutes honestly. Permanent mutes are
-- not a thing; if needed, set muted_until to a far-future date."
--
-- Verified state (2026-04-27): is_muted (boolean), muted_until (timestamptz) both present.
-- 0 users have is_muted=true AND muted_until IS NULL (pre-flight safe).
-- Existing CHECKs: chk_users_plan_status, users_cohort_check (no mute check).
--
-- Migration: pre-heal any violations (0 now), then add CHECK.
-- Pre-heal sets muted_until = now()+7d for any silent-muted user so the
-- constraint can be added without row-level failures.
--
-- Acceptance: pg_constraint shows users_mute_requires_until; attempt
-- UPDATE users SET is_muted=true WHERE id=<x> (with muted_until NULL) → 23514.

BEGIN;

DO $$
DECLARE bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM public.users
   WHERE is_muted = true AND muted_until IS NULL;
  IF bad_count > 0 THEN
    RAISE NOTICE 'S1-A101: % silent-muted users — setting muted_until = now()+7d', bad_count;
    UPDATE public.users SET muted_until = now() + interval '7 days'
     WHERE is_muted = true AND muted_until IS NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_mute_requires_until' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_mute_requires_until
      CHECK (NOT is_muted OR muted_until IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.users'::regclass AND conname='users_mute_requires_until'
  ) THEN
    RAISE EXCEPTION 'S1-A101 post-check failed: constraint not found';
  END IF;
  RAISE NOTICE 'S1-A101 applied: users_mute_requires_until CHECK live';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_A3_parental_consents_columns.sql =====
-- =====================================================================
-- S1-A3 — parental_consents: add consent_version + parent_name columns
--
-- The UNIQUE constraint (uq_parental_consents_parent_kid) already exists
-- from a prior migration. Missing pieces:
--
--   consent_version (text): the version string of the consent text the parent
--     agreed to (e.g., "2024-09-01"). Required for COPPA re-consent workflows
--     when the consent language changes. NOT NULL with default 'v1' so existing
--     rows are stamped without a backfill query.
--
--   parent_name (text): the parent's legal name as entered at consent time.
--     COPPA requires the operator to record who consented. Nullable so no
--     data is assumed for historical rows; new consents must explicitly supply it.
--
-- Both columns added with ADD COLUMN IF NOT EXISTS so re-runs are safe.
--
-- Downstream: S1-I11 (consent_versions table + reconsent trigger) depends on
-- consent_version being present — apply this migration before I11.
--
-- Acceptance: information_schema shows consent_version + parent_name on
-- public.parental_consents.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='parental_consents'
  ) THEN
    RAISE EXCEPTION 'S1-A3 abort: parental_consents table missing';
  END IF;
END $$;

ALTER TABLE public.parental_consents
  ADD COLUMN IF NOT EXISTS consent_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS parent_name text;

-- Stamp all existing rows with the initial consent version.
UPDATE public.parental_consents
   SET consent_version = 'v1'
 WHERE consent_version IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='parental_consents'
       AND column_name='consent_version'
  ) THEN
    RAISE EXCEPTION 'S1-A3 post-check failed: consent_version column missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='parental_consents'
       AND column_name='parent_name'
  ) THEN
    RAISE EXCEPTION 'S1-A3 post-check failed: parent_name column missing';
  END IF;
  RAISE NOTICE 'S1-A3 applied: consent_version + parent_name added to parental_consents';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_A67_parental_consents_fk_alignment.sql =====
-- =====================================================================
-- S1-A67 — FK alignment: graduation_tokens + kid_dob_correction_requests + kid_dob_history
--          to public.users(id) instead of auth.users(id)
--
-- Verified state (2026-04-27): three sibling COPPA-evidence tables have user-reference
-- FKs pointing to auth.users(id). parental_consents.parent_user_id already correctly
-- references public.users(id). The sibling tables should match for:
--   1. Cascade coherence — public.users deletion triggers proper cascade; auth.users
--      deletion bypasses it.
--   2. JOIN correctness — app queries join through public.users; cross-schema joins
--      require explicit schema qualification that is often omitted.
--
-- Existing FKs being replaced:
--   graduation_tokens_parent_user_id_fkey   → auth.users(id) ON DELETE CASCADE
--   graduation_tokens_consumed_by_user_id_fkey → auth.users(id)
--   kid_dob_correction_requests_parent_user_id_fkey → auth.users(id) ON DELETE CASCADE
--   kid_dob_correction_requests_decided_by_fkey → auth.users(id)
--   kid_dob_history_actor_user_id_fkey → auth.users(id)
--   (kid_profile_id FKs already point to kid_profiles(id) — unchanged)
--
-- Orphan check: 0 orphans against public.users (verified 2026-04-27).
--
-- Acceptance: pg_constraint for all 3 tables shows REFERENCES public.users(id),
-- not auth.users(id).

BEGIN;

-- Pre-flight orphan guard
DO $$
DECLARE
  gt_orphans int; kdcr_orphans int; kdh_orphans int;
BEGIN
  SELECT COUNT(*) INTO gt_orphans FROM public.graduation_tokens gt
   WHERE gt.parent_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = gt.parent_user_id);
  SELECT COUNT(*) INTO kdcr_orphans FROM public.kid_dob_correction_requests r
   WHERE r.parent_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = r.parent_user_id);
  SELECT COUNT(*) INTO kdh_orphans FROM public.kid_dob_history h
   WHERE h.actor_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = h.actor_user_id);
  IF gt_orphans + kdcr_orphans + kdh_orphans > 0 THEN
    RAISE EXCEPTION 'S1-A67 abort: orphan rows found (gt=%, kdcr=%, kdh=%) — resolve before re-pointing FKs',
      gt_orphans, kdcr_orphans, kdh_orphans;
  END IF;
END $$;

-- graduation_tokens: drop auth.users FKs, re-add to public.users
ALTER TABLE public.graduation_tokens
  DROP CONSTRAINT IF EXISTS graduation_tokens_parent_user_id_fkey,
  DROP CONSTRAINT IF EXISTS graduation_tokens_consumed_by_user_id_fkey;

ALTER TABLE public.graduation_tokens
  ADD CONSTRAINT graduation_tokens_parent_user_id_fkey
    FOREIGN KEY (parent_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT graduation_tokens_consumed_by_user_id_fkey
    FOREIGN KEY (consumed_by_user_id) REFERENCES public.users(id);

-- kid_dob_correction_requests: drop auth.users FKs, re-add to public.users
ALTER TABLE public.kid_dob_correction_requests
  DROP CONSTRAINT IF EXISTS kid_dob_correction_requests_parent_user_id_fkey,
  DROP CONSTRAINT IF EXISTS kid_dob_correction_requests_decided_by_fkey;

ALTER TABLE public.kid_dob_correction_requests
  ADD CONSTRAINT kid_dob_correction_requests_parent_user_id_fkey
    FOREIGN KEY (parent_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT kid_dob_correction_requests_decided_by_fkey
    FOREIGN KEY (decided_by) REFERENCES public.users(id);

-- kid_dob_history: drop auth.users FK, re-add to public.users
ALTER TABLE public.kid_dob_history
  DROP CONSTRAINT IF EXISTS kid_dob_history_actor_user_id_fkey;

ALTER TABLE public.kid_dob_history
  ADD CONSTRAINT kid_dob_history_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES public.users(id);

DO $$
DECLARE v_auth_refs int;
BEGIN
  SELECT COUNT(*) INTO v_auth_refs
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
   WHERE c.conrelid IN (
       'public.graduation_tokens'::regclass,
       'public.kid_dob_correction_requests'::regclass,
       'public.kid_dob_history'::regclass
     )
     AND c.contype = 'f'
     AND n.nspname = 'auth';
  IF v_auth_refs > 0 THEN
    RAISE EXCEPTION 'S1-A67 post-check failed: % FKs still pointing at auth schema', v_auth_refs;
  END IF;
  RAISE NOTICE 'S1-A67 applied: 5 user FKs re-pointed from auth.users → public.users';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_A2-PC_update_metadata_check.sql =====
-- =====================================================================
-- S1-A2-PC — update_metadata RPC verification (READ-ONLY)
--
-- Does NOT modify schema. Confirms whether update_metadata exists in pg_proc.
-- Caller: web/src/app/api/auth/email-change/route.js:166,171.
-- web/src/types/database.ts has zero defs for it — either type drift or broken RPC.

DO $$
DECLARE
  v_found  boolean;
  v_sig    text;
  v_rettype text;
  v_secdef  boolean;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_metadata' AND pronamespace='public'::regnamespace),
    pg_get_function_arguments(oid),
    prorettype::regtype::text,
    prosecdef
  INTO v_found, v_sig, v_rettype, v_secdef
  FROM pg_proc
  WHERE proname='update_metadata' AND pronamespace='public'::regnamespace
  LIMIT 1;

  IF v_found THEN
    RAISE NOTICE 'A2-PC-verify | update_metadata EXISTS | args=% | returns=% | security_definer=%',
      COALESCE(v_sig,'<none>'), v_rettype, v_secdef;
    RAISE NOTICE 'A2-PC-verify | ACTION: type drift only — flag S6 to regenerate web/src/types/database.ts so email-change/route.js:166,171 gets typed call site';
  ELSE
    RAISE NOTICE 'A2-PC-verify | update_metadata ABSENT — email-change/route.js:166,171 is calling a missing RPC';
    RAISE NOTICE 'A2-PC-verify | ACTION: flag S3 to rewrite route.js to call supabase.auth.updateUser() or direct users UPDATE instead';
  END IF;
END $$;



-- =====================================================================
-- ===== 2026-04-27_S1_D6_archive_cluster_check.sql =====
-- =====================================================================
-- S1-D6 — archive_cluster RPC verification (READ-ONLY)
--
-- Does NOT modify schema. Confirms archive_cluster exists and surfaces its signature
-- so S6 can regenerate types/database.ts and remove the `unknown` cast in
-- web/src/app/api/cron/pipeline-cleanup/route.ts:256-265.

DO $$
DECLARE
  v_found boolean;
  v_sig   text;
  v_rettype text;
  v_secdef boolean;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='archive_cluster' AND pronamespace='public'::regnamespace),
    pg_get_function_arguments(oid),
    prorettype::regtype::text,
    prosecdef
  INTO v_found, v_sig, v_rettype, v_secdef
  FROM pg_proc
  WHERE proname='archive_cluster' AND pronamespace='public'::regnamespace
  LIMIT 1;

  IF v_found THEN
    RAISE NOTICE 'D6-verify | archive_cluster EXISTS | args=% | returns=% | security_definer=%',
      COALESCE(v_sig,'<none>'), v_rettype, v_secdef;
    RAISE NOTICE 'D6-verify | ACTION: flag S6 to regenerate web/src/types/database.ts — pipeline-cleanup/route.ts:256-265 unknown-cast can be dropped once types include this RPC';
  ELSE
    RAISE NOTICE 'D6-verify | archive_cluster ABSENT — pipeline-cleanup/route.ts:256-265 is calling a missing RPC; flag S3 to implement or route.ts to remove the call';
  END IF;
END $$;



-- =====================================================================
-- ===== 2026-04-27_S1_J-verify_orphan_table_check.sql =====
-- =====================================================================
-- S1-J-verify — Orphan-table verification scan (READ-ONLY)
--
-- Does NOT modify schema. Run AFTER A114 (which drops deep_links, so that table
-- is intentionally absent here). Confirms whether app_config, analytics_events,
-- article_relations, audit_log, admin_audit_log are orphaned or load-bearing.
--
-- Output: NOTICE messages for the owner to review before any follow-up drops.

DO $$
DECLARE
  t text;
  row_count bigint;
  rls_count int;
  proc_count int;
BEGIN
  -- Spot-check core tables
  FOREACH t IN ARRAY ARRAY['app_config','analytics_events','article_relations']
  LOOP
    BEGIN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', t) INTO row_count;
      SELECT COUNT(*) INTO rls_count FROM pg_policies WHERE tablename = t AND schemaname = 'public';
      SELECT COUNT(*) INTO proc_count FROM pg_proc p
       WHERE p.prosrc ILIKE ('%' || t || '%')
         AND p.pronamespace = 'public'::regnamespace;
      RAISE NOTICE 'J-verify | table=% rows=% rls_policies=% rpc_references=%',
        t, row_count, rls_count, proc_count;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'J-verify | table=% ABSENT (already dropped or never existed)', t;
    END;
  END LOOP;

  -- audit_log vs admin_audit_log overlap
  BEGIN
    EXECUTE 'SELECT COUNT(*) FROM public.audit_log' INTO row_count;
    RAISE NOTICE 'J-verify | audit_log rows=%', row_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'J-verify | audit_log ABSENT';
  END;

  BEGIN
    EXECUTE 'SELECT COUNT(*) FROM public.admin_audit_log' INTO row_count;
    RAISE NOTICE 'J-verify | admin_audit_log rows=% — check whether this overlaps with audit_log or serves a distinct surface', row_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'J-verify | admin_audit_log ABSENT';
  END;
END $$;

-- Follow-up rule: if any table above shows rows=0 + rls_policies=0 + rpc_references=0,
-- write Ongoing Projects/migrations/2026-04-27_S1_J-followup_<table>_drop.sql using
-- the same pattern as A114. Do NOT drop tables with rows or active callers without
-- owner review.



-- =====================================================================
-- ===== 2026-04-27_S1_I11_consent_versions_schema.sql =====
-- =====================================================================
-- S1-I11 — consent_versions: COPPA re-consent version tracking
--
-- When consent text changes (privacy update, COPPA amendment), regulators expect
-- a re-consent path. Without versioning, the platform can't prove which version
-- a given kid's parent agreed to, or surface parents who need to re-consent.
--
-- MUST apply AFTER S1-A3 (which adds parental_consents.consent_version column).
--
-- Creates:
--   consent_versions table     — canonical registry of all consent text versions
--   consent_versions_one_current index — ensures only one is_current=true at a time
--   parental_consents.consent_version FK → consent_versions.version
--   kid_profiles.reconsent_required_at + reconsented_at columns
--   _mark_reconsent_required() trigger function
--   consent_version_current_change trigger on consent_versions
--   Seed row for current version 'v1' (matches parental_consents.consent_version DEFAULT 'v1')
--
-- Apply order note: run BEFORE Q4.20 is also fine since this migration uses service-role
-- INSERTs and the Q4.20 trigger bypasses service-role operations.
--
-- Acceptance: INSERT new consent_versions row with is_current=true → trigger stamps
-- all kid_profiles whose parental_consents.consent_version != new version with
-- reconsent_required_at. FK refuses unknown version on parental_consents INSERT.

BEGIN;

-- Pre-flight: confirm S1-A3 has landed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='parental_consents'
       AND column_name='consent_version'
  ) THEN
    RAISE EXCEPTION 'S1-I11 abort: parental_consents.consent_version missing — apply S1-A3 first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.consent_versions (
  version       text        PRIMARY KEY,
  text_md       text        NOT NULL,
  is_current    boolean     NOT NULL DEFAULT false,
  effective_at  timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz
);

-- Only one current version at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS consent_versions_one_current
  ON public.consent_versions ((1))
  WHERE is_current = true;

-- Backfill: seed any consent versions referenced in parental_consents but missing here.
-- Uses consented_at (real column — there is no created_at on parental_consents).
INSERT INTO public.consent_versions (version, text_md, is_current, effective_at)
SELECT DISTINCT
  pc.consent_version,
  '[legacy consent text not preserved]',
  false,
  MIN(pc.consented_at)
FROM public.parental_consents pc
WHERE pc.consent_version IS NOT NULL
GROUP BY pc.consent_version
ON CONFLICT DO NOTHING;

-- Seed the known-current version matching the DEFAULT 'v1' stamped by S1-A3
INSERT INTO public.consent_versions (version, text_md, is_current, effective_at)
VALUES ('v1', '[consent text v1 — populate from app config before marking current]', true, now())
ON CONFLICT (version) DO UPDATE
  SET is_current = EXCLUDED.is_current;

-- FK from parental_consents.consent_version → consent_versions.version
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parental_consents_consent_version' AND conrelid = 'public.parental_consents'::regclass) THEN
    ALTER TABLE public.parental_consents
      ADD CONSTRAINT fk_parental_consents_consent_version
      FOREIGN KEY (consent_version) REFERENCES public.consent_versions(version);
  END IF;
END $$;

-- Re-consent columns on kid_profiles
ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS reconsent_required_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconsented_at timestamptz;

-- Trigger: when a new consent version becomes current, stamp affected kid_profiles
CREATE OR REPLACE FUNCTION public._mark_reconsent_required()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- Only fires when is_current transitions from false/NULL → true
  IF NEW.is_current = true AND (OLD IS NULL OR OLD.is_current IS DISTINCT FROM true) THEN
    UPDATE public.kid_profiles
       SET reconsent_required_at = now()
     WHERE id IN (
       SELECT DISTINCT pc.kid_profile_id
         FROM public.parental_consents pc
        WHERE pc.consent_version IS DISTINCT FROM NEW.version
     );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS consent_version_current_change ON public.consent_versions;
CREATE TRIGGER consent_version_current_change
  AFTER INSERT OR UPDATE OF is_current ON public.consent_versions
  FOR EACH ROW EXECUTE FUNCTION public._mark_reconsent_required();

-- RLS: service_role + parent can read their own consent version
ALTER TABLE public.consent_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_versions_public_read ON public.consent_versions;
CREATE POLICY consent_versions_public_read ON public.consent_versions
  FOR SELECT USING (true);  -- version strings are not PII; all users can read

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='consent_versions'
  ) THEN
    RAISE EXCEPTION 'S1-I11 post-check failed: consent_versions table missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname='consent_version_current_change'
       AND tgrelid='public.consent_versions'::regclass
  ) THEN
    RAISE EXCEPTION 'S1-I11 post-check failed: reconsent trigger missing';
  END IF;
  RAISE NOTICE 'S1-I11 applied: consent_versions schema + re-consent tracking live';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_Q4.7_clear_frozen_on_free.sql =====
-- =====================================================================
-- S1-Q4.7 — users: clear frozen_at for frozen+free legacy state
--
-- Decision (Q4.7): "A — clear frozen_at on admin-driven downgrade. Frozen+free is
-- logically incoherent. Admin downgrade is a clean exit."
--
-- Verified state (2026-04-27): 0 users have frozen_at IS NOT NULL with a free plan tier.
-- 0 users have plan_status='frozen'. 0 frozen_verity_score orphans.
-- This migration is a forward-correctness cleanup — it runs safely as a no-op today
-- and repairs any drift that accumulates before the S6 caller fix ships.
--
-- Note: T347 user_state enum (also S1) will make frozen+free structurally impossible
-- once all callers migrate. Until then, this one-shot reconciliation closes the gap.
--
-- Acceptance: post-apply, SELECT COUNT(*) FROM users u JOIN plans p ON p.id=u.plan_id
-- WHERE u.frozen_at IS NOT NULL AND p.tier='free' returns 0.

BEGIN;

DO $$
DECLARE bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count
    FROM public.users u
    JOIN public.plans p ON p.id = u.plan_id
   WHERE u.frozen_at IS NOT NULL AND p.tier = 'free';
  IF bad_count > 0 THEN
    RAISE NOTICE 'S1-Q4.7: % frozen+free users — clearing frozen_at + frozen_verity_score', bad_count;
    UPDATE public.users
       SET frozen_at           = NULL,
           frozen_verity_score = NULL,
           updated_at          = now()
     WHERE id IN (
       SELECT u2.id FROM public.users u2
       JOIN public.plans p2 ON p2.id = u2.plan_id
       WHERE u2.frozen_at IS NOT NULL AND p2.tier = 'free'
     );
  ELSE
    RAISE NOTICE 'S1-Q4.7: no frozen+free users found — no-op';
  END IF;
END $$;

DO $$
DECLARE bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count
    FROM public.users u
    JOIN public.plans p ON p.id = u.plan_id
   WHERE u.frozen_at IS NOT NULL AND p.tier = 'free';
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'S1-Q4.7 post-check failed: % frozen+free users remain', bad_count;
  END IF;
  RAISE NOTICE 'S1-Q4.7 applied: frozen+free state cleared';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_Q4.8_freeze_content_lockout_rls.sql =====
-- =====================================================================
-- S1-Q4.8 — freeze content-lockout RLS: add frozen_at check to 4 INSERT policies
--
-- Decision (Q4.8): "B — content lockout. Add frozen_at IS NULL to comment INSERT
-- RLS, vote routes, follow routes, message routes. If a user's payment is disputed
-- enough to trigger a freeze, they shouldn't be active in community."
--
-- Verified state (2026-04-27):
--   comments_insert:    with_check = auth.uid()=user_id AND has_verified_email() AND NOT is_banned() AND user_passed_article_quiz(...)
--   comment_votes_insert: with_check = auth.uid()=user_id AND has_verified_email() AND NOT is_banned() AND user_passed_article_quiz(...)
--   follows_insert:     with_check = auth.uid()=follower_id AND has_verified_email() AND NOT is_banned() AND is_premium()
--   messages_insert:    with_check = auth.uid()=sender_id AND conversation membership AND NOT _user_is_dm_blocked(auth.uid())
-- None have a frozen_at check.
--
-- Pattern: inline correlated subquery `(SELECT frozen_at IS NULL FROM users WHERE id=auth.uid())`
-- rather than a helper function. The helper would be an extra dependency; the subquery
-- is self-contained and equally fast (auth.uid() lookup is hot).
--
-- Service-role callers are unaffected (no auth.uid() → policies don't fire for service_role).
--
-- Acceptance: pg_policies.with_check for all 4 policies contains 'frozen_at'.

BEGIN;

DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE tablename IN ('comments','comment_votes','follows','messages')
     AND cmd='INSERT' AND with_check LIKE '%frozen_at%';
  IF v_count >= 4 THEN
    RAISE NOTICE 'S1-Q4.8 no-op: all INSERT policies already have frozen_at check';
  END IF;
END $$;

-- Comments INSERT
ALTER POLICY comments_insert ON public.comments
  WITH CHECK (
    user_id = auth.uid()
    AND has_verified_email()
    AND (NOT is_banned())
    AND user_passed_article_quiz(auth.uid(), article_id)
    AND (SELECT u.frozen_at IS NULL FROM public.users u WHERE u.id = auth.uid())
  );

-- Comment votes INSERT
ALTER POLICY comment_votes_insert ON public.comment_votes
  WITH CHECK (
    user_id = auth.uid()
    AND has_verified_email()
    AND (NOT is_banned())
    AND user_passed_article_quiz(
      auth.uid(),
      (SELECT c.article_id FROM public.comments c WHERE c.id = comment_votes.comment_id)
    )
    AND (SELECT u.frozen_at IS NULL FROM public.users u WHERE u.id = auth.uid())
  );

-- Follows INSERT
ALTER POLICY follows_insert ON public.follows
  WITH CHECK (
    follower_id = auth.uid()
    AND has_verified_email()
    AND (NOT is_banned())
    AND is_premium()
    AND (SELECT u.frozen_at IS NULL FROM public.users u WHERE u.id = auth.uid())
  );

-- Messages INSERT
ALTER POLICY messages_insert ON public.messages
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT cp.conversation_id
        FROM public.conversation_participants cp
       WHERE cp.user_id = auth.uid()
    )
    AND (NOT _user_is_dm_blocked(auth.uid()))
    AND (SELECT u.frozen_at IS NULL FROM public.users u WHERE u.id = auth.uid())
  );

DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE tablename IN ('comments','comment_votes','follows','messages')
     AND cmd='INSERT' AND with_check LIKE '%frozen_at%';
  IF v_count < 4 THEN
    RAISE EXCEPTION 'S1-Q4.8 post-check failed: only % of 4 INSERT policies updated', v_count;
  END IF;
  RAISE NOTICE 'S1-Q4.8 applied: frozen_at check added to 4 INSERT policies';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_Q4.9_public_profiles_v_is_pro.sql =====
-- =====================================================================
-- S1-Q4.9 — public_profiles_v: add is_pro derived boolean
--
-- The view currently exposes is_frozen (derived from frozen_at IS NOT NULL)
-- but no paid-status indicator. Client code has to join plans or query tier
-- separately to decide whether to show the "pro" badge or unlock pro-only
-- social features (follow, DM).
--
-- Verified state (2026-04-27): view body is a SELECT from users u with
-- profile_visibility='public' and no is_banned / deletion_scheduled_for.
-- No JOIN to plans. Existing columns include verity_score, is_expert,
-- is_verified_public_figure, and is_frozen.
--
-- Change: add a correlated subquery that resolves is_pro as true when the
-- user's plan tier is not 'free'. Uses a correlated scalar subquery on plans
-- rather than a JOIN to avoid row multiplication if plans ever allows
-- multiple rows per plan_id (currently 1:1 but the subquery is safer).
--
-- Acceptance: pg_get_viewdef contains 'is_pro'.

BEGIN;

CREATE OR REPLACE VIEW public.public_profiles_v AS
 SELECT
    u.id,
    u.username,
    u.display_name,
    u.bio,
    u.avatar_url,
    u.avatar_color,
    u.banner_url,
    u.verity_score,
    u.streak_current,
    u.is_expert,
    u.expert_title,
    u.expert_organization,
    u.is_verified_public_figure,
    u.articles_read_count,
    u.quizzes_completed_count,
    u.comment_count,
    u.followers_count,
    u.following_count,
    u.show_activity,
    u.show_on_leaderboard,
    u.profile_visibility,
    u.email_verified,
    u.created_at,
    u.frozen_at IS NOT NULL AS is_frozen,
    COALESCE(
      (SELECT p.tier <> 'free'
         FROM public.plans p
        WHERE p.id = u.plan_id),
      false
    ) AS is_pro
   FROM public.users u
  WHERE u.profile_visibility::text = 'public'::text
    AND COALESCE(u.is_banned, false) = false
    AND COALESCE(u.deletion_scheduled_for, NULL::timestamp with time zone) IS NULL;

DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_viewdef('public.public_profiles_v', true);
  IF v_def NOT LIKE '%is_pro%' THEN
    RAISE EXCEPTION 'S1-Q4.9 post-check failed: is_pro not in view definition';
  END IF;
  RAISE NOTICE 'S1-Q4.9 applied: public_profiles_v now exposes is_pro';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_T347_user_state_enum.sql =====
-- =====================================================================
-- S1-T347 — users: user_state enum consolidation (stage 1 of 2)
--
-- Decision (Q4.1): "Single user_state enum column replaces the 8 booleans/timestamps.
-- Enum: ('active','banned','locked','muted','frozen','deletion_scheduled','beta_locked','comped').
-- Sweep callers in batch-mode. State priority for AccountStateBanner derives from enum."
--
-- Stage 1 (this migration): add enum type + user_state column, backfill from existing
-- flags, add consistency CHECK, keep legacy columns (S6/S7/S9 still need them).
-- Stage 2 (follow-up after all callers migrate): drop legacy columns + CHECK.
--
-- Verified columns present (2026-04-27):
--   is_banned, locked_until, is_muted, muted_until, deletion_scheduled_for,
--   frozen_at, frozen_verity_score, verify_locked_at, comped_until
--
-- Backfill priority (highest wins): banned > locked > deletion_scheduled >
--   frozen > muted > beta_locked > comped > active
--
-- Consistency CHECK is unidirectional (enum value implies corresponding flag is set).
-- Bidirectional is impractical for multi-flag users where one flag wins.
--
-- Acceptance: every user has non-null user_state; pg_enum shows 8 values;
-- check constraint rejects inconsistent states.

BEGIN;

-- Idempotency: skip if already done
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname='user_state_t' AND typnamespace='public'::regnamespace) THEN
    RAISE NOTICE 'S1-T347 no-op: user_state_t type already exists';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_state_t' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.user_state_t AS ENUM (
      'active',
      'banned',
      'locked',
      'muted',
      'frozen',
      'deletion_scheduled',
      'beta_locked',
      'comped'
    );
  END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS user_state public.user_state_t;

-- Backfill: highest-priority flag wins when multiple are set.
UPDATE public.users SET user_state =
  CASE
    WHEN is_banned = true
      THEN 'banned'::public.user_state_t
    WHEN locked_until IS NOT NULL AND locked_until > now()
      THEN 'locked'::public.user_state_t
    WHEN deletion_scheduled_for IS NOT NULL
      THEN 'deletion_scheduled'::public.user_state_t
    WHEN frozen_at IS NOT NULL
      THEN 'frozen'::public.user_state_t
    WHEN is_muted = true
      THEN 'muted'::public.user_state_t
    WHEN verify_locked_at IS NOT NULL
      THEN 'beta_locked'::public.user_state_t
    WHEN comped_until IS NOT NULL AND comped_until > now()
      THEN 'comped'::public.user_state_t
    ELSE 'active'::public.user_state_t
  END
WHERE user_state IS NULL;

ALTER TABLE public.users
  ALTER COLUMN user_state SET NOT NULL,
  ALTER COLUMN user_state SET DEFAULT 'active'::public.user_state_t;

-- Unidirectional consistency CHECK: when enum = X, the primary flag for X must be set.
-- Allows multi-flag scenarios (e.g., banned + frozen) as long as the enum matches
-- the highest-priority flag (which the backfill and callers must enforce).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_state_consistent' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_state_consistent CHECK (
        CASE user_state
          WHEN 'banned'             THEN is_banned = true
          WHEN 'locked'             THEN locked_until IS NOT NULL
          WHEN 'deletion_scheduled' THEN deletion_scheduled_for IS NOT NULL
          WHEN 'frozen'             THEN frozen_at IS NOT NULL
          WHEN 'muted'              THEN is_muted = true
          WHEN 'beta_locked'        THEN verify_locked_at IS NOT NULL
          WHEN 'comped'             THEN comped_until IS NOT NULL
          WHEN 'active'             THEN true
          ELSE false
        END
      );
  END IF;
END $$;

DO $$
DECLARE v_count bigint; v_null_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_enum
   WHERE enumtypid = 'public.user_state_t'::regtype;
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'S1-T347 post-check failed: expected 8 enum values, got %', v_count;
  END IF;
  SELECT COUNT(*) INTO v_null_count FROM public.users WHERE user_state IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'S1-T347 post-check failed: % users have NULL user_state', v_null_count;
  END IF;
  RAISE NOTICE 'S1-T347 stage-1 applied: user_state enum live; legacy columns retained for S6/S7/S9 migration';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_T14_use_streak_freeze_rpc.sql =====
-- =====================================================================
-- S1-T14 — use_streak_freeze(p_user_id uuid) RPC
--
-- Adult plumbing exists (streak_freeze_remaining on users, iOS Models.swift decodes it,
-- admin streak_freeze flag lives in metadata) but there is no server endpoint to consume
-- a freeze and restore the streak. This RPC provides that endpoint.
--
-- Mirrors the shape of the existing use_kid_streak_freeze RPC.
--
-- Auth: self-or-admin. Kid tokens are blocked via JWT claim check (is_kid_delegated()
-- helper not yet created — inline check on jwt()->> 'kid_profile_id'; updates to
-- use is_kid_delegated() once Q3b lands).
--
-- Logic:
--   1. Auth gate (self or admin; kid token rejected)
--   2. Lock row for update
--   3. Guard: ≥1 freeze remaining
--   4. Restore streak_current = streak_best; decrement streak_freeze_remaining
--   5. Audit log + return jsonb
--
-- audit_log columns (verified 2026-04-27): actor_id, actor_type, action,
--   target_type, target_id, metadata (no target_user_id column).
--
-- Acceptance: pg_proc shows use_streak_freeze with prosecdef=true;
-- GRANT EXECUTE to authenticated present.

BEGIN;

CREATE OR REPLACE FUNCTION public.use_streak_freeze(p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_remaining int;
  v_current   int;
  v_best      int;
BEGIN
  -- Self-or-admin gate
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin_or_above() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Kid token rejection (inline until is_kid_delegated() is created by Q3b)
  IF auth.jwt() ->> 'kid_profile_id' IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden: kid token cannot use adult streak freeze'
      USING ERRCODE = '42501';
  END IF;

  SELECT streak_freeze_remaining, streak_current, streak_best
    INTO v_remaining, v_current, v_best
    FROM public.users
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  IF v_remaining IS NULL OR v_remaining <= 0 THEN
    RAISE EXCEPTION 'no streak freezes remaining' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.users
     SET streak_current          = v_best,
         streak_freeze_remaining = v_remaining - 1,
         streak_freeze_used_at   = now(),
         updated_at              = now()
   WHERE id = p_user_id;

  INSERT INTO public.audit_log
    (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (
    p_user_id, 'user',
    'streak_freeze_used',
    'user', p_user_id,
    jsonb_build_object(
      'restored_to',    v_best,
      'was',            v_current,
      'remaining_after', v_remaining - 1
    )
  );

  RETURN jsonb_build_object(
    'success',    true,
    'restored_to', v_best,
    'remaining',  v_remaining - 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.use_streak_freeze(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_streak_freeze(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'use_streak_freeze'
       AND pronamespace = 'public'::regnamespace
       AND prosecdef = true
  ) THEN
    RAISE EXCEPTION 'S1-T14 post-check failed: use_streak_freeze not found or not SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'S1-T14 applied: use_streak_freeze RPC live';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_T25_subscription_topics.sql =====
-- =====================================================================
-- S1-T25 — subscription_topics: topic/category alert subscription schema
--
-- Status: 🟧 OWNER-PENDING on fan-out trigger only. Per Q4 best-practice lock,
-- the schema ships; the publish-time fan-out trigger is deferred until owner
-- approves push delivery cost at scale. S5 wires opt-in/out routes against
-- this table; iOS flag flip (manageSubscriptionsEnabled) lands in S9+S10 once
-- trigger is approved.
--
-- Verified state (2026-04-27): subscription_topics does not exist.
-- categories table confirmed present.
--
-- is_kid_delegated() helper does not exist yet (pending Q3b). Kid-block policy
-- uses inline JWT check (auth.jwt() ->> 'kid_profile_id' IS NULL) which is
-- the correct top-level claim after S1-T0.5's fix to current_kid_profile_id.
--
-- Acceptance: table + policies present in information_schema + pg_policies.
-- Fan-out trigger NOT included — deferred pending owner sign-off.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='subscription_topics'
  ) THEN
    RAISE NOTICE 'S1-T25 no-op: subscription_topics already exists';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.subscription_topics (
  user_id     uuid        NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  category_id uuid        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);

ALTER TABLE public.subscription_topics ENABLE ROW LEVEL SECURITY;

-- Owner-rw: users manage their own subscriptions
DROP POLICY IF EXISTS subscription_topics_owner_rw ON public.subscription_topics;
CREATE POLICY subscription_topics_owner_rw ON public.subscription_topics
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Kid-block: kid tokens cannot subscribe (inline JWT check until is_kid_delegated() lands)
DROP POLICY IF EXISTS subscription_topics_block_kid_jwt ON public.subscription_topics;
CREATE POLICY subscription_topics_block_kid_jwt ON public.subscription_topics
  AS RESTRICTIVE
  FOR ALL
  USING     (auth.jwt() ->> 'kid_profile_id' IS NULL)
  WITH CHECK (auth.jwt() ->> 'kid_profile_id' IS NULL);

CREATE INDEX IF NOT EXISTS subscription_topics_category_idx
  ON public.subscription_topics(category_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='subscription_topics'
  ) THEN
    RAISE EXCEPTION 'S1-T25 post-check failed: table missing';
  END IF;
  RAISE NOTICE 'S1-T25 stage-1 applied: subscription_topics schema live; fan-out trigger deferred (owner-pending)';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_phase1_persist_article_consolidation.sql =====
-- =====================================================================
-- =====================================================================
-- 2026-04-27_phase1_persist_article_consolidation.sql
-- Phase 1 of AI + Plan Change Implementation: kid_articles consolidation
-- =====================================================================
-- Context:
--   The kid iOS app (VerityPostKids/ArticleListView.swift) reads from
--   `articles` filtered by is_kids_safe=true. The admin tool
--   (admin/kids-story-manager) reads + writes the same. The pipeline,
--   however, has been writing kid runs to a separate `kid_articles` table
--   that nothing reads. Path A from the planning docs: kill the dead
--   tables and consolidate kid runs into `articles` with is_kids_safe=true
--   and age_band tagged.
--
--   Pre-condition verified: zero rows in kid_articles, kid_sources,
--   kid_timelines, kid_quizzes, kid_discovery_items at time of migration.
--
-- Steps:
--   A. Add articles.age_band column (nullable; future Phase 3 will band-
--      split kid content into 'kids' 7-9 and 'tweens' 10-12, while adult
--      stays 'adult' or null).
--   B. Rewrite persist_generated_article RPC to write all audiences into
--      `articles` + sources/timelines/quizzes (no audience branch on
--      tables). Set is_kids_safe + age_band + kids_summary from payload.
--   C. Drop kid_* RLS policies (14 policies across 5 tables).
--   D. Drop kid_articles, kid_sources, kid_timelines, kid_quizzes,
--      kid_discovery_items tables.
--
-- Rollback:
--   Code rolls back via git revert. Tables cannot be restored without DB
--   backup. Verified zero rows pre-migration as the safety net.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Add age_band column on articles
-- ---------------------------------------------------------------------
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS age_band text
    CHECK (age_band IS NULL OR age_band IN ('kids', 'tweens', 'adult'));

CREATE INDEX IF NOT EXISTS idx_articles_kid_feed
  ON public.articles (is_kids_safe, age_band, status, published_at DESC)
  WHERE is_kids_safe = true AND status = 'published';

-- ---------------------------------------------------------------------
-- B. Rewrite persist_generated_article RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.persist_generated_article(p_payload jsonb)
RETURNS TABLE(article_id uuid, slug text, audience text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    v_audience           text   := p_payload->>'audience';
    v_age_band           text   := nullif(p_payload->>'age_band', '');
    v_is_kids_safe       boolean := (v_audience = 'kid');
    v_kids_summary       text   := p_payload->>'kids_summary';
    v_cluster_id         uuid   := nullif(p_payload->>'cluster_id','')::uuid;
    v_run_id             uuid   := nullif(p_payload->>'pipeline_run_id','')::uuid;
    v_title              text   := coalesce(nullif(trim(p_payload->>'title'),''), '');
    v_subtitle           text   := p_payload->>'subtitle';
    v_body               text   := p_payload->>'body';
    v_body_html          text   := p_payload->>'body_html';
    v_excerpt            text   := p_payload->>'excerpt';
    v_category_id        uuid   := nullif(p_payload->>'category_id','')::uuid;
    v_ai_provider        text   := p_payload->>'ai_provider';
    v_ai_model           text   := p_payload->>'ai_model';
    v_prompt_fingerprint text   := p_payload->>'prompt_fingerprint';
    v_source_feed_id     uuid   := nullif(p_payload->>'source_feed_id','')::uuid;
    v_source_url         text   := p_payload->>'source_url';
    v_word_count         int    := nullif(p_payload->>'word_count','')::int;
    v_reading_min        int    := nullif(p_payload->>'reading_time_minutes','')::int;
    v_tags               text[] := CASE WHEN jsonb_typeof(p_payload->'tags') = 'array' THEN
      array(SELECT jsonb_array_elements_text(p_payload->'tags')) ELSE NULL END;
    v_seo_keywords       text[] := CASE WHEN jsonb_typeof(p_payload->'seo_keywords') = 'array' THEN
      array(SELECT jsonb_array_elements_text(p_payload->'seo_keywords')) ELSE NULL END;
    v_seo_title          text   := p_payload->>'seo_title';
    v_seo_description    text   := p_payload->>'seo_description';
    v_metadata           jsonb  := coalesce(p_payload->'metadata','{}'::jsonb);
    v_sources            jsonb  := coalesce(p_payload->'sources','[]'::jsonb);
    v_timeline           jsonb  := coalesce(p_payload->'timeline','[]'::jsonb);
    v_quizzes            jsonb  := coalesce(p_payload->'quizzes','[]'::jsonb);
    v_slug_base          text;
    v_slug               text;
    v_attempt            int    := 0;
    v_article_id         uuid;
  BEGIN
    -- Validation
    IF v_audience IS NULL OR v_audience NOT IN ('adult','kid') THEN
      RAISE EXCEPTION 'persist_generated_article: audience must be adult|kid, got %', v_audience
        USING ERRCODE = '22023';
    END IF;
    IF v_audience = 'kid' AND v_age_band IS NULL THEN
      -- Backstop: kid runs without explicit age_band default to 'tweens'
      -- (closer to current single-tier kid voice; Phase 3 will require
      -- explicit kids/tweens band).
      v_age_band := 'tweens';
    END IF;
    IF v_age_band IS NOT NULL AND v_age_band NOT IN ('kids','tweens','adult') THEN
      RAISE EXCEPTION 'persist_generated_article: age_band must be kids|tweens|adult, got %', v_age_band
        USING ERRCODE = '22023';
    END IF;
    IF v_body IS NULL OR length(v_body) = 0 THEN
      RAISE EXCEPTION 'persist_generated_article: body required' USING ERRCODE = '22023';
    END IF;
    IF v_body_html IS NULL OR length(v_body_html) = 0 THEN
      RAISE EXCEPTION 'persist_generated_article: body_html required' USING ERRCODE = '22023';
    END IF;
    IF v_category_id IS NULL THEN
      RAISE EXCEPTION 'persist_generated_article: category_id required' USING ERRCODE = '22023';
    END IF;

    -- Slug computation (slug-collision retry preserved)
    v_slug_base := nullif(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), '');
    v_slug_base := nullif(trim(both '-' from coalesce(v_slug_base, '')), '');
    IF v_slug_base IS NULL THEN
      v_slug_base := 'article-' || substr(replace(coalesce(v_run_id::text, gen_random_uuid()::text), '-', ''), 1, 8);
    END IF;
    v_slug := left(v_slug_base, 80);

    <<slug_loop>>
    WHILE v_attempt < 3 LOOP
      BEGIN
        -- Single insert path: articles. Kid runs flag is_kids_safe + age_band
        -- + kids_summary; adult runs leave kids_summary null and is_kids_safe=false.
        INSERT INTO public.articles (
          title, slug, subtitle, body, body_html, excerpt, category_id, status,
          is_ai_generated, ai_provider, ai_model, generated_at, generated_by_provider,
          generated_by_model, prompt_fingerprint, source_feed_id, source_url,
          cluster_id, word_count, reading_time_minutes, tags, seo_keywords,
          seo_title, seo_description, metadata,
          is_kids_safe, kids_summary, age_band
        )
        VALUES (
          v_title, v_slug, v_subtitle, v_body, v_body_html, v_excerpt, v_category_id, 'draft',
          true, v_ai_provider, v_ai_model, now(), v_ai_provider, v_ai_model, v_prompt_fingerprint,
          v_source_feed_id, v_source_url, v_cluster_id, v_word_count, v_reading_min, v_tags, v_seo_keywords,
          v_seo_title, v_seo_description, v_metadata,
          v_is_kids_safe,
          CASE WHEN v_is_kids_safe THEN coalesce(v_kids_summary, v_excerpt) ELSE NULL END,
          v_age_band
        )
        RETURNING id INTO v_article_id;
        EXIT slug_loop;
      EXCEPTION WHEN unique_violation THEN
        v_attempt := v_attempt + 1;
        v_slug := left(v_slug_base, 72) || '-' ||
          lower(to_hex((extract(epoch from clock_timestamp())*1000)::bigint & 65535));
        IF v_attempt >= 3 THEN RAISE; END IF;
      END;
    END LOOP;

    -- Sources / timelines / quizzes — single insert path now (no kid_* tables)
    INSERT INTO public.sources (
      article_id, title, url, publisher, author_name, published_date,
      source_type, quote, sort_order, metadata
    )
    SELECT v_article_id, s->>'title', s->>'url', s->>'publisher', s->>'author_name',
      nullif(s->>'published_date','')::timestamptz, s->>'source_type', s->>'quote',
      coalesce(nullif(s->>'sort_order','')::int, (ord - 1)::int),
      coalesce(s - 'title' - 'url' - 'publisher' - 'author_name' - 'published_date'
        - 'source_type' - 'quote' - 'sort_order', '{}'::jsonb)
    FROM jsonb_array_elements(v_sources) WITH ORDINALITY AS t(s, ord);

    INSERT INTO public.timelines (
      article_id, title, description, event_date, event_label,
      event_body, event_image_url, source_url, sort_order, metadata
    )
    SELECT v_article_id, t->>'title', t->>'description',
      coalesce(nullif(t->>'event_date','')::timestamptz, now()),
      coalesce(nullif(t->>'event_label',''), 'Event'), t->>'event_body',
      t->>'event_image_url', t->>'source_url',
      coalesce(nullif(t->>'sort_order','')::int, (ord - 1)::int),
      coalesce(t - 'title' - 'description' - 'event_date' - 'event_label'
        - 'event_body' - 'event_image_url' - 'source_url' - 'sort_order', '{}'::jsonb)
    FROM jsonb_array_elements(v_timeline) WITH ORDINALITY AS tb(t, ord);

    INSERT INTO public.quizzes (
      article_id, title, question_text, question_type, options,
      explanation, difficulty, points, pool_group, sort_order, metadata
    )
    SELECT v_article_id, coalesce(nullif(q->>'title',''), 'Comprehension Quiz'),
      q->>'question_text', coalesce(nullif(q->>'question_type',''), 'multiple_choice'),
      (SELECT coalesce(jsonb_agg(o - 'is_correct'), '[]'::jsonb)
        FROM jsonb_array_elements(q->'options') o),
      q->>'explanation', q->>'difficulty',
      coalesce(nullif(q->>'points','')::int, 10),
      coalesce(nullif(q->>'pool_group','')::int, 0),
      coalesce(nullif(q->>'sort_order','')::int, (ord - 1)::int),
      jsonb_build_object('correct_index', coalesce(nullif(q->>'correct_index','')::int, 0))
    FROM jsonb_array_elements(v_quizzes) WITH ORDINALITY AS tq(q, ord);

    article_id := v_article_id;
    slug := v_slug;
    audience := v_audience;
    RETURN NEXT;
  END;
$function$;

-- ---------------------------------------------------------------------
-- C. Drop kid_* RLS policies (14 policies)
--
-- IDEMPOTENT: each DROP POLICY is guarded by to_regclass(...) so a
-- partial-replay (where the table itself was already dropped in a prior
-- run) doesn't error on the missing relation.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.kid_articles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_articles_admin_all ON public.kid_articles';
    EXECUTE 'DROP POLICY IF EXISTS kid_articles_block_adult_jwt ON public.kid_articles';
    EXECUTE 'DROP POLICY IF EXISTS kid_articles_read_kid_jwt ON public.kid_articles';
  END IF;
  IF to_regclass('public.kid_sources') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_sources_admin_all ON public.kid_sources';
    EXECUTE 'DROP POLICY IF EXISTS kid_sources_block_adult_jwt ON public.kid_sources';
    EXECUTE 'DROP POLICY IF EXISTS kid_sources_read_kid_jwt ON public.kid_sources';
  END IF;
  IF to_regclass('public.kid_timelines') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_timelines_admin_all ON public.kid_timelines';
    EXECUTE 'DROP POLICY IF EXISTS kid_timelines_block_adult_jwt ON public.kid_timelines';
    EXECUTE 'DROP POLICY IF EXISTS kid_timelines_read_kid_jwt ON public.kid_timelines';
  END IF;
  IF to_regclass('public.kid_quizzes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_quizzes_admin_all ON public.kid_quizzes';
    EXECUTE 'DROP POLICY IF EXISTS kid_quizzes_block_adult_jwt ON public.kid_quizzes';
    EXECUTE 'DROP POLICY IF EXISTS kid_quizzes_read_kid_jwt ON public.kid_quizzes';
  END IF;
  IF to_regclass('public.kid_discovery_items') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS kid_discovery_items_block_adult_jwt ON public.kid_discovery_items';
    EXECUTE 'DROP POLICY IF EXISTS kid_discovery_items_select_editor ON public.kid_discovery_items';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- D. Drop tables (verify zero rows once more inline; CASCADE for FK refs)
--
-- IDEMPOTENT: each table is checked-then-dropped via to_regclass(...) so
-- partial-replay scenarios (table already dropped in a prior partial run)
-- don't error out. Safe to re-run end-to-end.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_kid_articles_count int := 0;
  v_kid_sources_count int := 0;
  v_kid_timelines_count int := 0;
  v_kid_quizzes_count int := 0;
  v_kid_discovery_count int := 0;
BEGIN
  IF to_regclass('public.kid_articles') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_articles' INTO v_kid_articles_count;
  END IF;
  IF to_regclass('public.kid_sources') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_sources' INTO v_kid_sources_count;
  END IF;
  IF to_regclass('public.kid_timelines') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_timelines' INTO v_kid_timelines_count;
  END IF;
  IF to_regclass('public.kid_quizzes') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_quizzes' INTO v_kid_quizzes_count;
  END IF;
  IF to_regclass('public.kid_discovery_items') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.kid_discovery_items' INTO v_kid_discovery_count;
  END IF;
  IF v_kid_articles_count + v_kid_sources_count + v_kid_timelines_count
     + v_kid_quizzes_count + v_kid_discovery_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop: rows present (kid_articles=%, kid_sources=%, kid_timelines=%, kid_quizzes=%, kid_discovery_items=%)',
      v_kid_articles_count, v_kid_sources_count, v_kid_timelines_count,
      v_kid_quizzes_count, v_kid_discovery_count;
  END IF;
END $$;

DROP TABLE IF EXISTS public.kid_quizzes CASCADE;
DROP TABLE IF EXISTS public.kid_timelines CASCADE;
DROP TABLE IF EXISTS public.kid_sources CASCADE;
DROP TABLE IF EXISTS public.kid_articles CASCADE;
DROP TABLE IF EXISTS public.kid_discovery_items CASCADE;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_phase2_plan_structure_rewrite.sql =====
-- =====================================================================
-- =====================================================================
-- 2026-04-27_phase2_plan_structure_rewrite.sql
-- Phase 2 of AI + Plan Change Implementation: plan structure rewrite
-- =====================================================================
-- Decisions locked 2026-04-26:
--   - Verity solo: $7.99/mo, $79.99/yr
--   - Verity Family: $14.99/mo with 1 kid included; +$4.99/mo per extra kid
--                    up to 4 kids; $149.99/yr base + $49.99/yr per extra kid
--   - Verity Pro retired: existing subs grandfather (auto-migrate at next
--                          renewal at $7.99 — Option B), new signups blocked
--   - Verity Family XL retired permanently (per-kid model replaces)
--
-- Subscriptions table already has zero rows so column adds are clean.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Update Verity solo prices
-- ---------------------------------------------------------------------
UPDATE public.plans
SET price_cents = 799,
    updated_at = now()
WHERE name = 'verity_monthly';

UPDATE public.plans
SET price_cents = 7999,
    updated_at = now()
WHERE name = 'verity_annual';

-- ---------------------------------------------------------------------
-- B. Update Verity Family base + metadata; add Family annual
-- ---------------------------------------------------------------------
UPDATE public.plans
SET price_cents = 1499,
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(metadata, '{}'::jsonb), '{included_kids}', '1'),
          '{max_kids}', '4'),
        '{extra_kid_price_cents}', '499'),
      '{max_total_seats}', '6'),
    max_family_members = 6,
    updated_at = now()
WHERE name = 'verity_family_monthly';

INSERT INTO public.plans (
  id, name, display_name, description, tier, billing_period, price_cents, currency,
  max_family_members, is_active, is_visible, sort_order, metadata
)
SELECT
  gen_random_uuid(),
  'verity_family_annual',
  'Verity Family (annual)',
  'Family plan, billed yearly. Up to 4 kids; first kid included.',
  'verity_family',
  'year',
  14999,  -- $149.99/yr
  'usd',
  6,
  true,
  true,
  -- Place annual sort_order one notch after monthly (defensive)
  (SELECT coalesce(sort_order, 0) FROM public.plans WHERE name = 'verity_family_monthly' LIMIT 1),
  '{"included_kids": 1, "max_kids": 4, "extra_kid_price_cents": 4999, "max_total_seats": 6, "is_annual": true, "max_bookmarks": -1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'verity_family_annual');

-- ---------------------------------------------------------------------
-- C. Retire Verity Pro (Option B grandfather: keep rows so existing subs
--    keep working until their renewal cron migrates them; hide from
--    new signups via is_active=false + is_visible=false)
-- ---------------------------------------------------------------------
UPDATE public.plans
SET is_active = false,
    is_visible = false,
    updated_at = now()
WHERE name IN ('verity_pro_monthly', 'verity_pro_annual');

-- ---------------------------------------------------------------------
-- D. Retire Family XL if it exists (per-kid model replaces).
--    Code references are being dropped in this same commit, so the row
--    going inactive prevents any stragglers from hitting it.
-- ---------------------------------------------------------------------
UPDATE public.plans
SET is_active = false,
    is_visible = false,
    updated_at = now()
WHERE tier = 'verity_family_xl' OR name LIKE 'verity_family_xl%';

-- ---------------------------------------------------------------------
-- E. Subscriptions: add kid_seats_paid + platform columns.
--    `source` column already exists (stripe | apple | google) — `platform`
--    is the cleaner name for the new code path. We add it as a generated/
--    derived column from `source` so existing webhooks don't have to
--    backfill, and so `source` stays as the historical/billing-source
--    indicator.
--
--    Note: subscriptions has zero rows at migration time, so DEFAULT 1
--    on kid_seats_paid is safe even though family-tier subs in the future
--    will need this set per the active SKU.
-- ---------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS kid_seats_paid integer NOT NULL DEFAULT 1
    CHECK (kid_seats_paid BETWEEN 0 AND 4);

-- platform: derived from source; we add it as a real column so RLS + UI
-- can rely on it without joining. Default to 'stripe' (most common at
-- launch); the webhook handlers set it explicitly on every write.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'stripe'
    CHECK (platform IN ('stripe', 'apple', 'google'));

-- next_renewal_at: alias for current_period_end semantically, but
-- explicitly named so support tooling reads cleanly. Indexed for the
-- Pro grandfather migration cron + reconciliation crons.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS next_renewal_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_renewal
  ON public.subscriptions (next_renewal_at)
  WHERE next_renewal_at IS NOT NULL AND status = 'active';

-- ---------------------------------------------------------------------
-- F. Permission seeds (Phase 2 + Phase 4 prep)
-- ---------------------------------------------------------------------
-- deny_mode is varchar(10): valid values are 'hidden' or 'locked'.
-- Use 'locked' for parent-controlled actions so unauthorized users see
-- the gated CTA and a lock-message rather than the option being hidden.
INSERT INTO public.permissions (key, display_name, category, ui_section, deny_mode)
VALUES
  ('family.seats.manage', 'Manage family seats (add/remove kid seats)', 'family', 'profile', 'locked'),
  ('family.kids.manage', 'Manage kid profiles on family plan', 'family', 'profile', 'locked')
ON CONFLICT (key) DO NOTHING;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_phase3_age_banding.sql =====
-- =====================================================================
-- =====================================================================
-- 2026-04-27_phase3_age_banding.sql
-- Phase 3 of AI + Plan Change Implementation: age banding
-- =====================================================================
-- Decisions locked 2026-04-26:
--   - 3 reading bands: kids (7-9) / tweens (10-12) / graduated (13+)
--   - Ratchet-only progression: never reverts (graduated > tweens > kids)
--   - System-derived from kid_profiles.date_of_birth, never user-set
--   - articles.age_band tags every article into one of: kids|tweens|adult
--   - RLS keyed off (is_kids_safe, age_band, profile.reading_band):
--       kids profiles see age_band='kids' only
--       tweens profiles see age_band IN ('kids','tweens')
--       graduated profiles see nothing in kid app (their JWT no longer
--         resolves; they go through adult app)
--
-- This migration:
--   A. Adds reading_band + band_changed_at + band_history to kid_profiles
--   B. Backfills reading_band from existing date_of_birth values
--   C. Drops vestigial kid_profiles.age_range column
--   D. Drops the 5 (Kids) category variants and reparents any refs
--   E. Ensures base kid-safe categories are flagged is_kids_safe=true
--   F. Adds feed_clusters sibling FK columns
--   G. Helper SQL functions for band-aware RLS (kid_visible_bands +
--      current_kid_profile_id)
--   H. Rewrites articles RLS for kid SELECT to gate on band visibility
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. kid_profiles: reading_band + band_changed_at + band_history
-- ---------------------------------------------------------------------

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS reading_band text NOT NULL DEFAULT 'kids'
    CHECK (reading_band IN ('kids', 'tweens', 'graduated'));

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS band_changed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS band_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------
-- B. Backfill reading_band from date_of_birth
--    Ages 0-9 → 'kids'; 10-12 → 'tweens'; 13+ → 'graduated' (these
--    profiles will be retired by the graduation flow when Phase 5 ships;
--    flag them now so kid app reads return empty for graduated rows).
-- ---------------------------------------------------------------------
UPDATE public.kid_profiles
SET reading_band = CASE
  WHEN date_of_birth IS NULL THEN 'kids'
  WHEN extract(year FROM age(date_of_birth)) >= 13 THEN 'graduated'
  WHEN extract(year FROM age(date_of_birth)) >= 10 THEN 'tweens'
  ELSE 'kids'
END,
  band_changed_at = now(),
  band_history = jsonb_build_array(
    jsonb_build_object(
      'band', CASE
        WHEN date_of_birth IS NULL THEN 'kids'
        WHEN extract(year FROM age(date_of_birth)) >= 13 THEN 'graduated'
        WHEN extract(year FROM age(date_of_birth)) >= 10 THEN 'tweens'
        ELSE 'kids'
      END,
      'set_at', now(),
      'set_by', null,
      'reason', 'phase3_backfill_from_dob'
    )
  );

-- ---------------------------------------------------------------------
-- C. Drop vestigial kid_profiles.age_range column
--    Audit found 0 production rows had this set (1 row total in DB,
--    age_range NULL). Adult app's iOS Models.swift reads it for
--    legacy ageLabel paths but Phase 5 of the plan retires those.
--    Defensive: column exists; drop with IF EXISTS so re-runs are safe.
-- ---------------------------------------------------------------------
ALTER TABLE public.kid_profiles
  DROP COLUMN IF EXISTS age_range;

-- ---------------------------------------------------------------------
-- D. Category dedup: drop (Kids) variants, reparent refs to base.
--    Verified categories with the suffix 2026-04-26: 5 variants exist
--    (Science (Kids), World (Kids), Tech (Kids), Sports (Kids),
--    Health (Kids)). Each has a base counterpart ("Science", "World",
--    "Tech", "Sports", "Health"). Reparent any FK references then drop
--    the variant rows.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_pair record;
BEGIN
  FOR v_pair IN
    SELECT k.id AS kid_id, k.name AS kid_name,
           b.id AS base_id, b.name AS base_name
    FROM public.categories k
    JOIN public.categories b ON regexp_replace(k.name, ' \(Kids\)$', '') = b.name
    WHERE k.name LIKE '% (Kids)'
  LOOP
    -- Reparent articles
    UPDATE public.articles SET category_id = v_pair.base_id WHERE category_id = v_pair.kid_id;
    -- Reparent any prompt overrides that reference the variant
    UPDATE public.ai_prompt_overrides SET category_id = v_pair.base_id WHERE category_id = v_pair.kid_id;
    -- Reparent feed_clusters
    UPDATE public.feed_clusters SET category_id = v_pair.base_id WHERE category_id = v_pair.kid_id;
    -- Now safe to delete the variant
    DELETE FROM public.categories WHERE id = v_pair.kid_id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- E. Ensure base kid-safe categories are flagged is_kids_safe=true.
--    Some natural-kid base categories may not have the flag set in DB;
--    set defensively. Audit 2026-04-26 verified `is_kids_safe` exists
--    on categories.
-- ---------------------------------------------------------------------
UPDATE public.categories
SET is_kids_safe = true
WHERE name IN (
  'Animals', 'Arts', 'History', 'Space', 'Weather',
  'Health', 'Science', 'Technology', 'World', 'Sports',
  'Education'
)
  AND (is_kids_safe IS NULL OR is_kids_safe = false);

-- ---------------------------------------------------------------------
-- F. feed_clusters sibling FK columns for the 3-article cluster pattern
--    primary_article_id stays as "the adult article" for back-compat.
--    primary_kid_article_id + primary_tween_article_id track the kid/tween
--    siblings produced by Phase 3's band-loop generation.
-- ---------------------------------------------------------------------
ALTER TABLE public.feed_clusters
  ADD COLUMN IF NOT EXISTS primary_kid_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_tween_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feed_clusters_primary_kid
  ON public.feed_clusters (primary_kid_article_id)
  WHERE primary_kid_article_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feed_clusters_primary_tween
  ON public.feed_clusters (primary_tween_article_id)
  WHERE primary_tween_article_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- G. Helper SQL functions for band-aware RLS
-- ---------------------------------------------------------------------

-- Returns the array of age_band values a given kid profile can read.
-- Stable so RLS can call it once per query.
CREATE OR REPLACE FUNCTION public.kid_visible_bands(p_profile_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_band text;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;
  SELECT reading_band INTO v_band FROM public.kid_profiles WHERE id = p_profile_id;
  RETURN CASE v_band
    WHEN 'kids' THEN ARRAY['kids']
    WHEN 'tweens' THEN ARRAY['kids', 'tweens']
    -- graduated → empty (kid app login is rejected; defensive return)
    ELSE ARRAY[]::text[]
  END;
END;
$$;

-- Pulls the active kid_profile_id from JWT app_metadata for kid sessions.
-- Returns NULL for non-kid JWTs.
CREATE OR REPLACE FUNCTION public.current_kid_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'kid_profile_id', '')::uuid
$$;

-- ---------------------------------------------------------------------
-- H. Rewrite articles RLS for kid SELECT to gate on band visibility.
--    The Phase 1 consolidation (kid_articles → articles + is_kids_safe)
--    ran without updating any kid-specific RLS. Phase 3 wires the band
--    filter so a kids-band JWT can only see age_band='kids' articles,
--    and tweens see kids+tweens. Adults are unaffected.
--
--    is_kid_delegated() is the existing helper for kid sessions.
-- ---------------------------------------------------------------------

-- Drop any leftover or pre-existing kid-on-articles policies first
DROP POLICY IF EXISTS articles_read_kid_jwt ON public.articles;

CREATE POLICY articles_read_kid_jwt ON public.articles
  FOR SELECT
  USING (
    is_kid_delegated()
    AND status = 'published'
    AND is_kids_safe = true
    AND (age_band IS NULL OR age_band = ANY(public.kid_visible_bands(public.current_kid_profile_id())))
  );

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_phase6_birthday_prompt_clearing.sql =====
-- =====================================================================
-- =====================================================================
-- 2026-04-27_phase6_birthday_prompt_clearing.sql
-- Phase 6: clear kid_profiles.birthday_prompt_at on parent action
-- =====================================================================
-- Problem:
--   The birthday-band-check cron (Phase 5) stamps
--   kid_profiles.birthday_prompt_at when a kid crosses an age boundary
--   without the parent advancing the band. Web + iOS surfaces read this
--   column to render the "Time to advance [name]" banner. The column
--   was never being cleared once the parent acted, so the banner stuck
--   around forever after the band flip / graduation / claim.
--
-- Fix scope:
--   This migration replaces the two existing band-mutating RPCs with
--   identical bodies plus a NULL-out of birthday_prompt_at at the same
--   scope as the band / is_active update.
--
--     1. graduate_kid_profile  (Phase 5) — kid -> graduated transition.
--        Clear after the band flip, before sessions revoke.
--
--     2. claim_graduation_token (Phase 5) — token consumption + new
--        adult-user wiring. Defensive belt-and-braces clear: kid was
--        already graduated by graduate_kid_profile, but if any path
--        re-stamps the column between mint and claim, this guarantees
--        a clean slate on claim.
--
--   The kids -> tweens band advance is handled in the TypeScript route
--   web/src/app/api/kids/[id]/advance-band/route.ts (no SECURITY DEFINER
--   RPC exists for that path) and already clears birthday_prompt_at in
--   the same UPDATE statement that flips reading_band -> 'tweens'. No
--   admin_advance_kid_band RPC exists in the schema; the band-advance
--   surface area is the TS route only. Confirmed via pg_proc query
--   2026-04-27 — only claim_graduation_token + graduate_kid_profile
--   exist among graduation-flow functions. No DB change required for
--   the kids -> tweens path.
--
-- Signatures, return types, security flags, search_path, GRANTs, and
-- existing bodies are preserved exactly. Only the clearing UPDATE is
-- added.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. graduate_kid_profile — add birthday_prompt_at = NULL clearing
--    inside the same UPDATE that flips reading_band -> 'graduated' and
--    is_active -> false. Single atomic statement, no extra round trip.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.graduate_kid_profile(
  p_kid_profile_id uuid,
  p_intended_email text
)
RETURNS TABLE(token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_kid public.kid_profiles%ROWTYPE;
  v_token text;
  v_expires timestamptz;
  v_email text := lower(trim(p_intended_email));
  v_email_re text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  v_existing_user uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Email format
  IF v_email IS NULL OR v_email = '' OR v_email !~ v_email_re THEN
    RAISE EXCEPTION 'p_intended_email must be a valid email' USING ERRCODE = '22023';
  END IF;
  -- Email must not already belong to an existing auth.users row
  SELECT id INTO v_existing_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_existing_user IS NOT NULL THEN
    RAISE EXCEPTION 'Email already in use' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_kid FROM public.kid_profiles WHERE id = p_kid_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kid not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kid.parent_user_id <> v_actor THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_kid.is_active = false THEN
    RAISE EXCEPTION 'Kid profile already inactive' USING ERRCODE = '22023';
  END IF;
  IF v_kid.reading_band = 'graduated' THEN
    RAISE EXCEPTION 'Kid already graduated' USING ERRCODE = '22023';
  END IF;
  IF v_kid.reading_band <> 'tweens' THEN
    RAISE EXCEPTION 'Only tweens-band kids can graduate (current=%)', v_kid.reading_band USING ERRCODE = '22023';
  END IF;

  -- Mint token (32 hex chars; cryptographically random via gen_random_bytes)
  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires := now() + interval '24 hours';

  INSERT INTO public.graduation_tokens (
    token, kid_profile_id, parent_user_id, intended_email, expires_at, metadata
  )
  VALUES (
    v_token, p_kid_profile_id, v_actor, v_email, v_expires,
    jsonb_build_object('display_name', v_kid.display_name)
  );

  -- Override session vars permit the band-ratchet trigger to flip to graduated
  PERFORM set_config('app.dob_admin_override', 'true', true);

  UPDATE public.kid_profiles
  SET is_active = false,
      reading_band = 'graduated',
      band_changed_at = now(),
      band_history = band_history || jsonb_build_array(
        jsonb_build_object(
          'old_band', v_kid.reading_band,
          'new_band', 'graduated',
          'set_at', now(),
          'set_by', v_actor,
          'reason', 'graduation:' || v_token
        )
      ),
      pin_hash = null,
      pin_salt = null,
      birthday_prompt_at = null
  WHERE id = p_kid_profile_id;

  PERFORM set_config('app.dob_admin_override', '', true);

  -- Revoke kid sessions
  UPDATE public.kid_sessions
  SET revoked_at = now()
  WHERE kid_profile_id = p_kid_profile_id AND revoked_at IS NULL;

  -- Subscription seat decrement (only if extra seat was paid — base
  -- Family includes 1 kid, so kid_seats_paid > 1 means extras exist).
  -- The webhook reconciliation will re-sync against Stripe/Apple but
  -- we want the local count to drop immediately.
  UPDATE public.subscriptions
  SET kid_seats_paid = greatest(1, kid_seats_paid - 1),
      updated_at = now()
  WHERE user_id = v_actor
    AND status IN ('active','trialing')
    AND kid_seats_paid > 1;

  token := v_token;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.graduate_kid_profile(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.graduate_kid_profile(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. claim_graduation_token — defensive clearing on the kid profile
--    that the consumed token points at. graduate_kid_profile already
--    nulled the column when the token was minted; this is belt-and-
--    braces so any window where the cron re-stamped between mint and
--    claim still resolves clean. v_row.kid_profile_id is the target.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_graduation_token(
  p_token text,
  p_new_user_id uuid
)
RETURNS TABLE(kid_profile_id uuid, parent_user_id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.graduation_tokens%ROWTYPE;
  v_kid_meta jsonb;
  v_categories jsonb;
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_new_user_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'New user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_row FROM public.graduation_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Token already consumed' USING ERRCODE = '22023';
  END IF;
  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'Token expired' USING ERRCODE = '22023';
  END IF;
  IF lower(v_user_email) <> lower(v_row.intended_email) THEN
    RAISE EXCEPTION 'Email mismatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.graduation_tokens
  SET consumed_at = now(),
      consumed_by_user_id = p_new_user_id
  WHERE token = p_token;

  -- Defensive clear of the birthday-prompt staging column on the kid
  -- profile this token resolves to. graduate_kid_profile already cleared
  -- this when the kid was retired, but if the cron re-stamped between
  -- mint and claim, the parent banner would otherwise persist forever.
  UPDATE public.kid_profiles
  SET birthday_prompt_at = null
  WHERE id = v_row.kid_profile_id;

  -- Carry over kid's category preferences. kid_profiles.metadata may
  -- contain a 'feed_cats' array; if present, write into the new
  -- user's users.metadata->'feed'->'cats'. Falls back gracefully if
  -- either side is missing the key.
  SELECT metadata INTO v_kid_meta FROM public.kid_profiles WHERE id = v_row.kid_profile_id;
  v_categories := COALESCE(v_kid_meta->'feed_cats', '[]'::jsonb);

  UPDATE public.users
  SET metadata = jsonb_set(
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{feed}',
          COALESCE(metadata->'feed', '{}'::jsonb),
          true
        ),
        '{feed,cats}',
        v_categories,
        true
      ),
      updated_at = now()
  WHERE id = p_new_user_id;

  kid_profile_id := v_row.kid_profile_id;
  parent_user_id := v_row.parent_user_id;
  display_name := v_row.metadata->>'display_name';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_graduation_token(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_graduation_token(text, uuid) TO service_role;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_drop_dead_permission_keys.sql =====
-- =====================================================================
-- T4.1 — Drop 7 dead permission keys (zero callers across web/ + VerityPost/ + VerityPostKids/).
--
-- Verified 2026-04-27 via grep across .ts / .tsx / .swift / .sql:
--   kids.bookmark.add               — zero callers
--   kids.bookmarks.add              — zero callers
--   kids.streak.use_freeze          — zero callers (live key is `kids.streak.freeze.use`)
--   kids.leaderboard.global_opt_in  — zero callers
--   kids.leaderboard.global.opt_in  — zero callers
--   kids.streak.view_own            — zero callers
--   kids.streaks.view_own           — zero callers
--
-- The `guard_system_permissions` trigger refuses DELETE on permissions
-- by default; it honors `app.allow_system_perm_edits=true` GUC as an
-- escape hatch. Set LOCAL inside this txn. 15 dependent
-- permission_set_perms FK rows are removed first.

BEGIN;
SET LOCAL app.allow_system_perm_edits = 'true';

DELETE FROM public.permission_set_perms
WHERE permission_id IN (
  SELECT id FROM public.permissions
  WHERE key IN (
    'kids.bookmark.add',
    'kids.bookmarks.add',
    'kids.streak.use_freeze',
    'kids.leaderboard.global_opt_in',
    'kids.leaderboard.global.opt_in',
    'kids.streak.view_own',
    'kids.streaks.view_own'
  )
);

DELETE FROM public.permissions
WHERE key IN (
  'kids.bookmark.add',
  'kids.bookmarks.add',
  'kids.streak.use_freeze',
  'kids.leaderboard.global_opt_in',
  'kids.leaderboard.global.opt_in',
  'kids.streak.view_own',
  'kids.streaks.view_own'
);

DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.permissions
  WHERE key IN (
    'kids.bookmark.add',
    'kids.bookmarks.add',
    'kids.streak.use_freeze',
    'kids.leaderboard.global_opt_in',
    'kids.leaderboard.global.opt_in',
    'kids.streak.view_own',
    'kids.streaks.view_own'
  );
  IF remaining > 0 THEN
    RAISE EXCEPTION 'T4.1 abort: % dead permission rows still present', remaining;
  END IF;
  RAISE NOTICE 'T4.1 applied: 7 dead permission keys removed';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-28_S1_Q3b_users_rls_restrictive.sql =====
-- =====================================================================
-- =====================================================================
-- 2026-04-28_S1_Q3b_users_rls_restrictive.sql
-- S1-Q3b — restrictive kid-blocks on public.users INSERT + UPDATE
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-Q3b)
-- Severity: P0 (kid-JWT defense-in-depth)
-- =====================================================================
-- Verified state (2026-04-28 via pg_policy):
--   users_insert        PERMISSIVE  INSERT  WITH CHECK (id = auth.uid())
--   users_update        PERMISSIVE  UPDATE  USING ((id = auth.uid()) OR is_admin_or_above())
--   users_select_block_kid_jwt  RESTRICTIVE  SELECT  USING (NOT is_kid_delegated())
--   users_self_read     PERMISSIVE  SELECT  USING (id = auth.uid())
--   users_admin_read    PERMISSIVE  SELECT  USING (is_admin_or_above())
--
--   SELECT is already RESTRICTIVE-blocked. INSERT + UPDATE are not —
--   a kid token that smuggles past middleware (Q3b RED-verdict scenario)
--   could pass through users_insert / users_update because they're
--   permissive only.
--
-- Fix: add RESTRICTIVE policies on INSERT + UPDATE that require
-- NOT is_kid_delegated(). Restrictive policies AND with the permissive
-- branches; one missed check elsewhere in the kid-isolation layer can't
-- bypass these.
--
-- Coordination: This migration is independent of S3 middleware fix +
-- S10 issuer flip. The DB hardening lands first; whatever issuer S10
-- ultimately picks, the RESTRICTIVE policies block all kid tokens
-- regardless. Per session manual: "the migration set above hardens
-- the DB regardless of which option S10 picks."
--
-- Idempotency: pre-flight check on policy existence; refuses to apply
-- twice with a no-op NOTICE.
--
-- Rollback:
--   BEGIN;
--   DROP POLICY users_block_kid_jwt_insert ON public.users;
--   DROP POLICY users_block_kid_jwt_update ON public.users;
--   COMMIT;
-- =====================================================================

BEGIN;

-- Pre-flight: confirm is_kid_delegated() helper exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='is_kid_delegated'
                   AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'is_kid_delegated() helper missing — abort';
  END IF;
END $$;

-- Restrictive INSERT policy. ANDs with users_insert (permissive) so an
-- INSERT must satisfy BOTH (id=auth.uid()) AND (NOT is_kid_delegated()).
DROP POLICY IF EXISTS users_block_kid_jwt_insert ON public.users;
CREATE POLICY users_block_kid_jwt_insert ON public.users
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.is_kid_delegated());

-- Restrictive UPDATE policy. ANDs with users_update (permissive) so an
-- UPDATE must satisfy BOTH the owner-or-admin gate AND not-kid.
DROP POLICY IF EXISTS users_block_kid_jwt_update ON public.users;
CREATE POLICY users_block_kid_jwt_update ON public.users
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

-- Post-verification.
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='users'
     AND p.polname IN ('users_block_kid_jwt_insert','users_block_kid_jwt_update')
     AND p.polpermissive = false;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'expected 2 restrictive kid-block policies on users; found %', v_count;
  END IF;
  RAISE NOTICE 'S1-Q3b (users RLS) applied: restrictive insert + update kid-block policies live';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-28_S1_Q3b_weekly_recap_kid_block.sql =====
-- =====================================================================
-- =====================================================================
-- 2026-04-28_S1_Q3b_weekly_recap_kid_block.sql
-- S1-Q3b — restrictive kid-blocks on weekly_recap_questions/quizzes
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-Q3b)
-- Severity: P0 (kid-JWT defense-in-depth)
-- =====================================================================
-- Verified state (2026-04-28 via pg_policies):
--   weekly_recap_questions  weekly_recap_questions_modify  PERMISSIVE  ALL
--   weekly_recap_questions  weekly_recap_questions_select  PERMISSIVE  SELECT
--   weekly_recap_quizzes    weekly_recap_quizzes_modify    PERMISSIVE  ALL
--   weekly_recap_quizzes    weekly_recap_quizzes_select    PERMISSIVE  SELECT
--
--   No kid-block. Q3b audit: "weekly_recap_questions and
--   weekly_recap_quizzes have no kid-block on SELECT." A kid token
--   passing through PostgREST sees the adult weekly recap content set.
--
-- Fix: add RESTRICTIVE FOR ALL policies that require NOT
-- is_kid_delegated(). Mirrors the pattern used elsewhere
-- (messages_block_kid_jwt, etc).
--
-- Rollback:
--   DROP POLICY weekly_recap_questions_block_kid_jwt ON public.weekly_recap_questions;
--   DROP POLICY weekly_recap_quizzes_block_kid_jwt ON public.weekly_recap_quizzes;
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='is_kid_delegated' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'is_kid_delegated() helper missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='weekly_recap_questions') THEN
    RAISE EXCEPTION 'weekly_recap_questions table missing — abort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='weekly_recap_quizzes') THEN
    RAISE EXCEPTION 'weekly_recap_quizzes table missing — abort';
  END IF;
END $$;

DROP POLICY IF EXISTS weekly_recap_questions_block_kid_jwt ON public.weekly_recap_questions;
CREATE POLICY weekly_recap_questions_block_kid_jwt ON public.weekly_recap_questions
  AS RESTRICTIVE
  FOR ALL
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

DROP POLICY IF EXISTS weekly_recap_quizzes_block_kid_jwt ON public.weekly_recap_quizzes;
CREATE POLICY weekly_recap_quizzes_block_kid_jwt ON public.weekly_recap_quizzes
  AS RESTRICTIVE
  FOR ALL
  USING (NOT public.is_kid_delegated())
  WITH CHECK (NOT public.is_kid_delegated());

DO $$ BEGIN RAISE NOTICE 'S1-Q3b (weekly_recap) applied: restrictive kid-block on questions + quizzes'; END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-28_S1_Q3b_events_partition_rls.sql =====
-- =====================================================================
-- =====================================================================
-- 2026-04-28_S1_Q3b_events_partition_rls.sql
-- S1-Q3b — enable RLS + restrictive kid-block on events_* partitions
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-Q3b)
-- Severity: P0 (kid-JWT defense-in-depth)
-- =====================================================================
-- Verified state (2026-04-28 via pg_class + pg_inherits):
--   public.events parent: relrowsecurity=true, 0 policies
--   All events_YYYYMMDD partitions + events_default:
--     relrowsecurity=false, 0 policies
--
--   Per Q3b audit: "events parent partition has RLS enabled with 0
--   policies; partitions have RLS disabled entirely." Postgres applies
--   RLS at the partition level (not the parent), so a kid token through
--   PostgREST can SELECT from any partition directly. Defense-in-depth:
--   events writes are service-role today, but a kid token shouldn't
--   even appear at this surface.
--
-- Fix: ALTER TABLE ... ENABLE ROW LEVEL SECURITY on every partition,
-- plus a RESTRICTIVE FOR ALL policy USING (NOT is_kid_delegated()).
-- Idempotent: enumerates partitions via pg_inherits at apply time so
-- new partitions added after this migration get caught by a follow-up
-- run.
--
-- Note: this migration does NOT add a permissive policy. Without one,
-- non-service callers see zero rows (RLS default deny). Service-role
-- bypasses RLS entirely (Postgres bypassrls attribute), so the
-- analytics writes from server cron/edge functions remain unaffected.
-- If a future feature needs a non-service caller to SELECT events
-- (e.g., a user-facing analytics view), add a permissive policy in a
-- separate migration; do NOT widen the kid-block.
--
-- Rollback:
--   For each partition:
--     DROP POLICY events_<n>_block_kid_jwt ON public.events_<n>;
--     ALTER TABLE public.events_<n> DISABLE ROW LEVEL SECURITY;
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_partition record;
  v_policy_name text;
  v_count int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='is_kid_delegated' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'is_kid_delegated() helper missing — abort';
  END IF;

  FOR v_partition IN
    SELECT child.relname AS partition_name,
           child.oid AS partition_oid,
           child.relrowsecurity AS rls_enabled
      FROM pg_inherits i
      JOIN pg_class parent ON parent.oid=i.inhparent
      JOIN pg_class child ON child.oid=i.inhrelid
      JOIN pg_namespace n ON n.oid=parent.relnamespace
     WHERE n.nspname='public' AND parent.relname='events'
  LOOP
    v_policy_name := v_partition.partition_name || '_block_kid_jwt';

    -- Enable RLS if not already.
    IF NOT v_partition.rls_enabled THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
                     v_partition.partition_name);
    END IF;

    -- Drop + create the restrictive policy (idempotent).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_policy_name, v_partition.partition_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
      || 'USING (NOT public.is_kid_delegated()) '
      || 'WITH CHECK (NOT public.is_kid_delegated())',
      v_policy_name, v_partition.partition_name
    );

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'S1-Q3b (events partitions) applied: RLS enabled + kid-block on % partitions', v_count;
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-28_S1_Q3b_rpc_kid_rejects.sql =====
-- =====================================================================
-- =====================================================================
-- 2026-04-28_S1_Q3b_rpc_kid_rejects.sql
-- S1-Q3b — kid-token reject prologue on every adult-only RPC
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-Q3b)
-- Severity: P0 (kid-JWT defense-in-depth)
-- =====================================================================
-- Verified state (2026-04-28 via pg_proc + has_kid_check grep):
--   AT-RISK list per session manual (25 RPCs). Live state of those
--   that exist in pg_proc:
--
--   Existing in pg_proc, all WITHOUT is_kid_delegated() check (19):
--     update_own_profile, lockdown_self, update_metadata,
--     register_push_token, upsert_user_push_token, revoke_session,
--     revoke_all_other_sessions, session_heartbeat,
--     create_support_ticket, mint_owner_referral_link,
--     mint_referral_codes, clear_kid_lockout, graduate_kid_profile,
--     grant_pro_to_cohort, get_own_login_activity, convert_kid_trial,
--     submit_appeal, post_comment
--
--   NOT YET in pg_proc — out of scope for this migration; future
--   implementations must include the check (6):
--     block_user, unblock_user, report_comment, vote_comment,
--     request_data_export, request_account_deletion
--
-- Carve-outs (legitimately need kid token):
--   - clear_kid_lockout → ALREADY parent-only (auth.uid() resolves to
--     the parent's user; kid sessions don't reach this RPC). The
--     kid-reject is a no-op on legitimate calls but defends against a
--     stolen kid token attempting to clear lockout. SAFE TO ADD.
--   - convert_kid_trial → service-role + admin path; kids should never
--     invoke. SAFE TO ADD.
--   - graduate_kid_profile → parent-action; kid token must NOT graduate
--     itself. SAFE TO ADD.
--
-- Pattern (added at function entry, after existing parameter-shape
-- guards but before any state mutation):
--   IF public.is_kid_delegated() THEN
--     RAISE EXCEPTION 'forbidden: kid token cannot invoke <fn>'
--       USING ERRCODE = '42501';
--   END IF;
--
-- Idempotency: each CREATE OR REPLACE FUNCTION reapplies cleanly.
-- The migration ships all 19 in one transaction — partial success is
-- not tolerated.
--
-- Coordination: independent of S3 middleware fix and S10 issuer flip.
-- Hardens regardless of which issuer S10 picks.
--
-- Rollback:
--   Restore each function from its prior pg_get_functiondef snapshot.
--   No DDL outside the function bodies.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE proname='is_kid_delegated' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'is_kid_delegated() helper missing — abort';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. update_own_profile
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_own_profile(p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_updated_at timestamptz;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke update_own_profile' USING ERRCODE = '42501';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'p_fields must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users u
  SET
    username = CASE
                 WHEN p_fields ? 'username' AND u.username IS NULL
                   THEN NULLIF(p_fields->>'username', '')::varchar
                 ELSE u.username
               END,
    display_name = CASE WHEN p_fields ? 'display_name'
                        THEN NULLIF(p_fields->>'display_name', '')::varchar
                        ELSE u.display_name END,
    bio = CASE WHEN p_fields ? 'bio'
               THEN (p_fields->>'bio')::varchar
               ELSE u.bio END,
    avatar_url = CASE WHEN p_fields ? 'avatar_url'
                      THEN (p_fields->>'avatar_url')::text
                      ELSE u.avatar_url END,
    avatar_color = CASE WHEN p_fields ? 'avatar_color'
                        THEN (p_fields->>'avatar_color')::varchar
                        ELSE u.avatar_color END,
    banner_url = CASE WHEN p_fields ? 'banner_url'
                      THEN (p_fields->>'banner_url')::text
                      ELSE u.banner_url END,
    profile_visibility = CASE WHEN p_fields ? 'profile_visibility'
                              THEN (p_fields->>'profile_visibility')::varchar
                              ELSE u.profile_visibility END,
    show_activity = CASE WHEN p_fields ? 'show_activity'
                         THEN (p_fields->>'show_activity')::boolean
                         ELSE u.show_activity END,
    show_on_leaderboard = CASE WHEN p_fields ? 'show_on_leaderboard'
                               THEN (p_fields->>'show_on_leaderboard')::boolean
                               ELSE u.show_on_leaderboard END,
    allow_messages = CASE WHEN p_fields ? 'allow_messages'
                          THEN (p_fields->>'allow_messages')::boolean
                          ELSE u.allow_messages END,
    dm_read_receipts_enabled = CASE WHEN p_fields ? 'dm_read_receipts_enabled'
                                    THEN (p_fields->>'dm_read_receipts_enabled')::boolean
                                    ELSE u.dm_read_receipts_enabled END,
    notification_email = CASE WHEN p_fields ? 'notification_email'
                              THEN (p_fields->>'notification_email')::boolean
                              ELSE u.notification_email END,
    notification_push = CASE WHEN p_fields ? 'notification_push'
                             THEN (p_fields->>'notification_push')::boolean
                             ELSE u.notification_push END,
    att_status = CASE WHEN p_fields ? 'att_status'
                      THEN (p_fields->>'att_status')::varchar
                      ELSE u.att_status END,
    att_prompted_at = CASE WHEN p_fields ? 'att_prompted_at'
                           THEN (p_fields->>'att_prompted_at')::timestamptz
                           ELSE u.att_prompted_at END,
    last_login_at = CASE WHEN p_fields ? 'last_login_at'
                         THEN (p_fields->>'last_login_at')::timestamptz
                         ELSE u.last_login_at END,
    onboarding_completed_at = CASE WHEN p_fields ? 'onboarding_completed_at'
                                   THEN (p_fields->>'onboarding_completed_at')::timestamptz
                                   ELSE u.onboarding_completed_at END,
    expert_title = CASE WHEN p_fields ? 'expert_title'
                        THEN (p_fields->>'expert_title')::varchar
                        ELSE u.expert_title END,
    expert_organization = CASE WHEN p_fields ? 'expert_organization'
                               THEN (p_fields->>'expert_organization')::varchar
                               ELSE u.expert_organization END,
    metadata = CASE
                 WHEN p_fields ? 'metadata'
                      AND jsonb_typeof(p_fields->'metadata') = 'object'
                 THEN COALESCE(u.metadata, '{}'::jsonb) || (p_fields->'metadata')
                 ELSE u.metadata
               END
  WHERE u.id = v_uid
  RETURNING u.updated_at INTO v_updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user row not found for %', v_uid USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated_at', v_updated_at);
END;
$function$;

-- ---------------------------------------------------------------------
-- 2. lockdown_self
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lockdown_self(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_followers_removed integer := 0;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke lockdown_self' USING ERRCODE = '42501';
  END IF;
  IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users
     SET profile_visibility = 'hidden',
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH deleted AS (
    DELETE FROM public.follows
     WHERE following_id = p_user_id
     RETURNING 1
  )
  SELECT count(*) INTO v_followers_removed FROM deleted;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    p_user_id,
    'self:lockdown',
    'user',
    p_user_id,
    jsonb_build_object('followers_removed', v_followers_removed)
  );

  PERFORM bump_user_perms_version(p_user_id);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'profile_visibility', 'hidden',
    'followers_removed', v_followers_removed
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. update_metadata
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_metadata(p_user_id uuid, p_keys jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke update_metadata' USING ERRCODE = '42501';
  END IF;
  IF v_caller IS NOT NULL
     AND v_caller <> p_user_id
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_keys IS NULL OR jsonb_typeof(p_keys) <> 'object' THEN
    RAISE EXCEPTION 'p_keys must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
     SET metadata = COALESCE(metadata, '{}'::jsonb) || p_keys
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. register_push_token
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_push_token(uuid, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_session_id uuid, p_provider text, p_token text,
  p_device_id text DEFAULT NULL::text, p_platform text DEFAULT NULL::text,
  p_app_version text DEFAULT NULL::text, p_os_name text DEFAULT NULL::text,
  p_os_version text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke register_push_token' USING ERRCODE = '42501';
  END IF;
  IF p_provider NOT IN ('apns','fcm','web_push','expo') THEN
    RAISE EXCEPTION 'Invalid push provider';
  END IF;
  UPDATE sessions SET
    push_token            = p_token,
    push_token_type       = p_provider,
    push_token_updated_at = now(),
    device_id             = COALESCE(p_device_id, device_id),
    app_version           = COALESCE(p_app_version, app_version),
    os_name               = COALESCE(p_os_name, os_name),
    os_version            = COALESCE(p_os_version, os_version),
    last_active_at        = now()
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. upsert_user_push_token
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.upsert_user_push_token(text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.upsert_user_push_token(
  p_provider text, p_token text,
  p_environment text DEFAULT NULL::text,
  p_device_name text DEFAULT NULL::text,
  p_platform text DEFAULT NULL::text,
  p_os_version text DEFAULT NULL::text,
  p_app_version text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke upsert_user_push_token' USING ERRCODE = '42501';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_provider NOT IN ('apns','fcm','web_push','expo') THEN
    RAISE EXCEPTION 'invalid provider: %', p_provider;
  END IF;
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RAISE EXCEPTION 'token required';
  END IF;

  INSERT INTO user_push_tokens
    (user_id, provider, push_token, environment,
     device_name, platform, os_version, app_version,
     last_registered_at, invalidated_at)
  VALUES
    (v_user_id, p_provider, p_token, p_environment,
     p_device_name, p_platform, p_os_version, p_app_version,
     now(), NULL)
  ON CONFLICT (user_id, push_token) DO UPDATE SET
    provider           = EXCLUDED.provider,
    environment        = COALESCE(EXCLUDED.environment, user_push_tokens.environment),
    device_name        = COALESCE(EXCLUDED.device_name, user_push_tokens.device_name),
    platform           = COALESCE(EXCLUDED.platform, user_push_tokens.platform),
    os_version         = COALESCE(EXCLUDED.os_version, user_push_tokens.os_version),
    app_version        = COALESCE(EXCLUDED.app_version, user_push_tokens.app_version),
    last_registered_at = now(),
    invalidated_at     = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 6. revoke_session
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke revoke_session' USING ERRCODE = '42501';
  END IF;
  UPDATE sessions SET is_active = false, is_current = false
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------
-- 7. revoke_all_other_sessions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_all_other_sessions(p_current_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke revoke_all_other_sessions' USING ERRCODE = '42501';
  END IF;
  UPDATE sessions SET is_active = false, is_current = false
  WHERE user_id = auth.uid() AND id <> p_current_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------
-- 8. session_heartbeat
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.session_heartbeat(uuid, text, text);
CREATE OR REPLACE FUNCTION public.session_heartbeat(
  p_session_id uuid, p_app_version text DEFAULT NULL::text, p_os_version text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke session_heartbeat' USING ERRCODE = '42501';
  END IF;
  UPDATE sessions SET
    last_active_at = now(),
    app_version    = COALESCE(p_app_version, app_version),
    os_version     = COALESCE(p_os_version, os_version)
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------
-- 9. create_support_ticket
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_support_ticket(p_category text, p_subject text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id       uuid := auth.uid();
  v_email         text;
  v_ticket_number text;
  v_ticket_id     uuid;
  v_body          text;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke create_support_ticket' USING ERRCODE = '42501';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'category required';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'subject required';
  END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN RAISE EXCEPTION 'body required'; END IF;

  SELECT email INTO v_email
    FROM public.users
   WHERE id = v_user_id;

  v_ticket_number := 'VP-' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint));

  INSERT INTO public.support_tickets (
    ticket_number, user_id, email, category, subject, status, source
  ) VALUES (
    v_ticket_number, v_user_id, v_email, p_category, p_subject, 'open', 'in_app'
  ) RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (ticket_id, sender_id, is_staff, body)
  VALUES (v_ticket_id, v_user_id, false, v_body);

  RETURN jsonb_build_object(
    'id',            v_ticket_id,
    'ticket_number', v_ticket_number,
    'status',        'open'
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 10. mint_owner_referral_link
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mint_owner_referral_link(uuid, text, integer, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.mint_owner_referral_link(
  p_actor_user_id uuid DEFAULT NULL::uuid,
  p_description text DEFAULT NULL::text,
  p_max_uses integer DEFAULT NULL::integer,
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := COALESCE(p_actor_user_id, auth.uid());
  v_slug text;
  v_attempt int;
  v_id uuid;
  v_actor_is_admin boolean := false;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke mint_owner_referral_link' USING ERRCODE = '42501';
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'mint_owner_referral_link: no actor (pass p_actor_user_id or call as authenticated user)'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_actor
      AND r.name IN ('admin', 'owner', 'superadmin')
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) INTO v_actor_is_admin;

  IF NOT v_actor_is_admin THEN
    RAISE EXCEPTION 'mint_owner_referral_link: actor % is not admin/owner/superadmin', v_actor
      USING ERRCODE = '42501';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_slug := public.generate_referral_slug();
    BEGIN
      INSERT INTO public.access_codes
        (code, type, tier, owner_user_id, slot, is_active, created_by,
         description, max_uses, expires_at)
      VALUES
        (v_slug, 'referral', 'owner', v_actor, NULL, true, v_actor,
         COALESCE(p_description, 'Owner-minted seed referral'),
         p_max_uses, p_expires_at)
      RETURNING access_codes.id INTO v_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt = 5 THEN
          RAISE EXCEPTION 'mint_owner_referral_link: slug retries exhausted';
        END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_id, v_slug;
END;
$function$;

-- ---------------------------------------------------------------------
-- 11. mint_referral_codes
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mint_referral_codes(p_user_id uuid)
RETURNS TABLE(id uuid, code text, slot smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_slot smallint;
  v_slug text;
  v_attempt int;
  v_existing record;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke mint_referral_codes' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'service_role'
     AND auth.uid() <> p_user_id
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'mint_referral_codes: not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'mint_referral_codes: p_user_id required';
  END IF;

  FOR v_slot IN 1..2 LOOP
    SELECT ac.id, ac.code, ac.slot
      INTO v_existing
      FROM public.access_codes ac
     WHERE ac.type = 'referral'
       AND ac.tier = 'user'
       AND ac.owner_user_id = p_user_id
       AND ac.slot = v_slot
     LIMIT 1;
    IF FOUND THEN
      CONTINUE;
    END IF;

    FOR v_attempt IN 1..5 LOOP
      v_slug := public.generate_referral_slug();
      BEGIN
        INSERT INTO public.access_codes
          (code, type, tier, owner_user_id, slot, max_uses, is_active, created_by, description)
        VALUES
          (v_slug, 'referral', 'user', p_user_id, v_slot, 1, true, p_user_id,
           'Auto-minted user referral, slot ' || v_slot::text);
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_attempt = 5 THEN
            RAISE EXCEPTION 'mint_referral_codes: slug retries exhausted for user %', p_user_id;
          END IF;
      END;
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT ac.id, ac.code::text, ac.slot
      FROM public.access_codes ac
     WHERE ac.type = 'referral'
       AND ac.tier = 'user'
       AND ac.owner_user_id = p_user_id
     ORDER BY ac.slot;
END;
$function$;

-- ---------------------------------------------------------------------
-- 12. clear_kid_lockout (parent action; kid token reject defends against
--      stolen-token clearing the lockout the parent set)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_kid_lockout(p_kid_profile_id uuid, p_parent_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_parent users%ROWTYPE;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke clear_kid_lockout' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_parent FROM users WHERE id = auth.uid();
  IF v_parent.parent_pin_hash IS NULL
     OR v_parent.parent_pin_hash <> crypt(p_parent_pin, v_parent.parent_pin_hash) THEN
    RAISE EXCEPTION 'Invalid parent PIN';
  END IF;
  UPDATE kid_profiles SET pin_attempts = 0, pin_locked_until = NULL
    WHERE id = p_kid_profile_id AND parent_user_id = auth.uid();
  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------
-- 13. graduate_kid_profile (parent action)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.graduate_kid_profile(p_kid_profile_id uuid, p_intended_email text)
RETURNS TABLE(token text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_kid public.kid_profiles%ROWTYPE;
  v_token text;
  v_expires timestamptz;
  v_email text := lower(trim(p_intended_email));
  v_email_re text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  v_existing_user uuid;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke graduate_kid_profile' USING ERRCODE = '42501';
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email = '' OR v_email !~ v_email_re THEN
    RAISE EXCEPTION 'p_intended_email must be a valid email' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_existing_user FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_existing_user IS NOT NULL THEN
    RAISE EXCEPTION 'Email already in use' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_kid FROM public.kid_profiles WHERE id = p_kid_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kid not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kid.parent_user_id <> v_actor THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_kid.is_active = false THEN
    RAISE EXCEPTION 'Kid profile already inactive' USING ERRCODE = '22023';
  END IF;
  IF v_kid.reading_band = 'graduated' THEN
    RAISE EXCEPTION 'Kid already graduated' USING ERRCODE = '22023';
  END IF;
  IF v_kid.reading_band <> 'tweens' THEN
    RAISE EXCEPTION 'Only tweens-band kids can graduate (current=%)', v_kid.reading_band USING ERRCODE = '22023';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires := now() + interval '24 hours';

  INSERT INTO public.graduation_tokens (
    token, kid_profile_id, parent_user_id, intended_email, expires_at, metadata
  )
  VALUES (
    v_token, p_kid_profile_id, v_actor, v_email, v_expires,
    jsonb_build_object('display_name', v_kid.display_name)
  );

  PERFORM set_config('app.dob_admin_override', 'true', true);

  UPDATE public.kid_profiles
  SET is_active = false,
      reading_band = 'graduated',
      band_changed_at = now(),
      band_history = band_history || jsonb_build_array(
        jsonb_build_object(
          'old_band', v_kid.reading_band,
          'new_band', 'graduated',
          'set_at', now(),
          'set_by', v_actor,
          'reason', 'graduation:' || v_token
        )
      ),
      pin_hash = null,
      pin_salt = null,
      birthday_prompt_at = null
  WHERE id = p_kid_profile_id;

  PERFORM set_config('app.dob_admin_override', '', true);

  UPDATE public.kid_sessions
  SET revoked_at = now()
  WHERE kid_profile_id = p_kid_profile_id AND revoked_at IS NULL;

  UPDATE public.subscriptions
  SET kid_seats_paid = greatest(1, kid_seats_paid - 1),
      updated_at = now()
  WHERE user_id = v_actor
    AND status IN ('active','trialing')
    AND kid_seats_paid > 1;

  token := v_token;
  expires_at := v_expires;
  RETURN NEXT;
END;
$function$;

-- ---------------------------------------------------------------------
-- 14. grant_pro_to_cohort (admin action)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_pro_to_cohort(p_cohort text, p_months integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_actor uuid := auth.uid();
  v_pro_plan_id uuid;
  v_count int;
  v_now timestamptz := now();
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke grant_pro_to_cohort' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_cohort IS NULL OR p_cohort = '' THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: cohort required';
  END IF;
  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: months must be 1..24';
  END IF;

  SELECT id INTO v_pro_plan_id FROM public.plans WHERE name = 'verity_pro_monthly' LIMIT 1;
  IF v_pro_plan_id IS NULL THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: verity_pro_monthly plan not found';
  END IF;

  WITH bumped AS (
    UPDATE public.users
       SET plan_id = v_pro_plan_id,
           plan_status = 'active',
           comped_until = GREATEST(COALESCE(comped_until, v_now), v_now)
                          + (p_months || ' months')::interval,
           perms_version = perms_version + 1,
           perms_version_bumped_at = v_now
     WHERE cohort = p_cohort
       AND COALESCE(is_kids_mode_enabled, false) = false
       AND id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM bumped;

  INSERT INTO public.audit_log (actor_id, actor_type, action, target_type, metadata)
  VALUES (v_actor, 'admin', 'cohort.grant_pro', 'cohort',
          jsonb_build_object('cohort', p_cohort, 'months', p_months, 'count', v_count));

  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------
-- 15. get_own_login_activity
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_own_login_activity(integer);
CREATE OR REPLACE FUNCTION public.get_own_login_activity(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, action character varying, created_at timestamp with time zone, metadata jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke get_own_login_activity' USING ERRCODE = '42501';
  END IF;
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.action, a.created_at, a.metadata
    FROM public.audit_log a
    WHERE a.actor_id = v_uid
      AND a.action IN ('login', 'signup')
    ORDER BY a.created_at DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 200);
END;
$function$;

-- ---------------------------------------------------------------------
-- 16. convert_kid_trial (service-role / billing internal)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_kid_trial(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_converted int;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke convert_kid_trial' USING ERRCODE = '42501';
  END IF;
  UPDATE kid_profiles
     SET is_active = true,
         metadata = metadata - 'trial' || jsonb_build_object('trial_converted_at', now()),
         updated_at = now()
   WHERE parent_user_id = p_user_id
     AND (metadata->>'trial')::boolean = true;
  GET DIAGNOSTICS v_converted = ROW_COUNT;

  UPDATE users
     SET kid_trial_ends_at = NULL, updated_at = now()
   WHERE id = p_user_id;

  RETURN v_converted;
END;
$function$;

-- ---------------------------------------------------------------------
-- 17. submit_appeal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_appeal(p_user_id uuid, p_warning_id uuid, p_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warn user_warnings%ROWTYPE;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke submit_appeal' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(p_text, '')) = '' THEN
    RAISE EXCEPTION 'appeal text required';
  END IF;
  SELECT * INTO v_warn FROM user_warnings WHERE id = p_warning_id;
  IF NOT FOUND OR v_warn.user_id <> p_user_id THEN
    RAISE EXCEPTION 'warning not found';
  END IF;
  IF v_warn.appeal_status IS NOT NULL THEN
    RAISE EXCEPTION 'appeal already filed';
  END IF;
  UPDATE user_warnings
     SET appeal_status = 'pending', appeal_text = p_text
   WHERE id = p_warning_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 18. post_comment — kid-reject prologue (defense-in-depth; kids app
--      has no comments per architecture, but RPC must reject regardless).
--      Body kept identical to the post-T0.2 (blocked_users) version.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.post_comment(uuid, uuid, text, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.post_comment(
  p_user_id uuid,
  p_article_id uuid,
  p_body text,
  p_parent_id uuid DEFAULT NULL::uuid,
  p_mentions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_tier text;
  v_is_paid boolean;
  v_body text;
  v_max_len int := _setting_int('comment_max_length', 4000);
  v_max_depth int := _setting_int('comment_max_depth', 3);
  v_parent comments%ROWTYPE;
  v_root_id uuid;
  v_depth int := 0;
  v_mentions jsonb := '[]'::jsonb;
  v_new_id uuid;
  v_article_title text;
  v_article_slug text;
  v_actor_username text;
  v_mention_entry jsonb;
  v_mentioned_id uuid;
  v_blocked boolean;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke post_comment' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF NOT v_user.email_verified THEN
    RAISE EXCEPTION 'email must be verified to comment';
  END IF;

  IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
    RAISE EXCEPTION 'quiz not passed — discussion is locked';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'comment body is empty'; END IF;
  IF length(v_body) > v_max_len THEN
    RAISE EXCEPTION 'comment exceeds max length (% chars)', v_max_len;
  END IF;

  SELECT p.tier INTO v_tier FROM plans p WHERE p.id = v_user.plan_id;
  v_is_paid := v_tier IN ('verity','verity_pro','verity_family','verity_family_xl');
  IF v_is_paid AND jsonb_typeof(p_mentions) = 'array' THEN
    v_mentions := p_mentions;
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM comments
      WHERE id = p_parent_id AND article_id = p_article_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'parent comment not found on this article'; END IF;
    v_root_id := COALESCE(v_parent.root_id, v_parent.id);
    v_depth := v_parent.thread_depth + 1;
    IF v_depth > v_max_depth THEN
      RAISE EXCEPTION 'max reply depth reached (%)', v_max_depth;
    END IF;
  END IF;

  INSERT INTO comments
    (article_id, user_id, parent_id, root_id, thread_depth, body,
     mentions, status)
  VALUES
    (p_article_id, p_user_id, p_parent_id, v_root_id, v_depth, v_body,
     v_mentions, 'visible')
  RETURNING id INTO v_new_id;

  IF p_parent_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count + 1, updated_at = now()
     WHERE id = p_parent_id;
  END IF;

  UPDATE users SET comment_count = comment_count + 1, updated_at = now()
   WHERE id = p_user_id;

  SELECT a.title, a.slug INTO v_article_title, v_article_slug
    FROM articles a WHERE a.id = p_article_id;
  SELECT u.username INTO v_actor_username
    FROM users u WHERE u.id = p_user_id;

  IF p_parent_id IS NOT NULL AND v_parent.user_id IS NOT NULL
     AND v_parent.user_id <> p_user_id THEN
    SELECT EXISTS(
      SELECT 1 FROM blocked_users b
       WHERE b.blocker_id = v_parent.user_id AND b.blocked_id = p_user_id
    ) INTO v_blocked;
    IF NOT v_blocked THEN
      INSERT INTO notifications
        (user_id, type, title, body, action_url, metadata, email_sent)
      VALUES (
        v_parent.user_id,
        'comment_reply',
        format('@%s replied to your comment', COALESCE(v_actor_username, 'someone')),
        left(v_body, 280),
        format('/story/%s#comment-%s', COALESCE(v_article_slug, p_article_id::text), v_new_id),
        jsonb_build_object(
          'comment_id', v_new_id,
          'article_id', p_article_id,
          'article_title', v_article_title,
          'parent_comment_id', p_parent_id,
          'actor_user_id', p_user_id,
          'actor_username', v_actor_username
        ),
        true
      );
    END IF;
  END IF;

  FOR v_mention_entry IN SELECT * FROM jsonb_array_elements(v_mentions)
  LOOP
    BEGIN
      v_mentioned_id := (v_mention_entry->>'user_id')::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF v_mentioned_id IS NULL OR v_mentioned_id = p_user_id THEN
      CONTINUE;
    END IF;
    IF p_parent_id IS NOT NULL AND v_mentioned_id = v_parent.user_id THEN
      CONTINUE;
    END IF;
    SELECT EXISTS(
      SELECT 1 FROM blocked_users b
       WHERE b.blocker_id = v_mentioned_id AND b.blocked_id = p_user_id
    ) INTO v_blocked;
    IF v_blocked THEN
      CONTINUE;
    END IF;
    INSERT INTO notifications
      (user_id, type, title, body, action_url, metadata, email_sent)
    VALUES (
      v_mentioned_id,
      'comment_mention',
      format('@%s mentioned you', COALESCE(v_actor_username, 'someone')),
      left(v_body, 280),
      format('/story/%s#comment-%s', COALESCE(v_article_slug, p_article_id::text), v_new_id),
      jsonb_build_object(
        'comment_id', v_new_id,
        'article_id', p_article_id,
        'article_title', v_article_title,
        'parent_comment_id', p_parent_id,
        'actor_user_id', p_user_id,
        'actor_username', v_actor_username
      ),
      true
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_new_id, 'root_id', v_root_id, 'depth', v_depth);
END;
$function$;

-- Post-verification: confirm every targeted RPC now references is_kid_delegated().
DO $$
DECLARE
  v_target text;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_target IN ARRAY ARRAY[
    'update_own_profile','lockdown_self','update_metadata','register_push_token',
    'upsert_user_push_token','revoke_session','revoke_all_other_sessions',
    'session_heartbeat','create_support_ticket','mint_owner_referral_link',
    'mint_referral_codes','clear_kid_lockout','graduate_kid_profile',
    'grant_pro_to_cohort','get_own_login_activity','convert_kid_trial',
    'submit_appeal','post_comment'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
       WHERE proname = v_target
         AND pronamespace='public'::regnamespace
         AND prosrc ~ 'is_kid_delegated'
    ) THEN
      v_missing := v_missing || v_target;
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'S1-Q3b: % RPCs still missing kid-reject: %',
      array_length(v_missing, 1), v_missing;
  END IF;
  RAISE NOTICE 'S1-Q3b (RPC kid-rejects) applied: 18 RPCs (post_comment + 17 others) now reject kid tokens';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-28_V1-fix_get_kid_quiz_verdict_table_rename.sql =====
-- =====================================================================
-- V1-fix — get_kid_quiz_verdict — fix dangling reference to non-existent
--          public.quiz_questions; rewrite over public.quizzes (1 row per
--          question) + public.quiz_attempts.quiz_id FK.
--
-- Source: V1 verification pass 2026-04-28. S10 agent's final report flagged
-- this; live MCP confirmed:
--   - public.quiz_questions does NOT exist (SELECT FROM information_schema
--     .tables → not present)
--   - public.quizzes IS the questions table — one row per question, with
--     article_id, options, points, is_active, deleted_at, pool_group, etc.
--   - public.quiz_attempts.quiz_id FK → quizzes.id (not question_id)
--
-- Current broken body (verified via pg_get_functiondef 2026-04-28):
--   SELECT COUNT(*) INTO v_total FROM public.quiz_questions
--    WHERE article_id = p_article_id;
--   SELECT COUNT(DISTINCT question_id) FILTER (WHERE is_correct)
--     INTO v_correct
--    FROM public.quiz_attempts
--    WHERE kid_profile_id = p_kid_profile_id
--      AND article_id = p_article_id;
--
-- Both SELECTs throw 42P01 (quiz_questions) / 42703 (question_id column on
-- quiz_attempts). Every kid-quiz verdict call currently errors out — kid
-- discussion-gate / quiz-pass surface is dead.
--
-- Fix:
--   - Total: COUNT(*) FROM public.quizzes WHERE article_id = p_article_id
--     AND is_active = true AND deleted_at IS NULL.
--     (quizzes.is_active and deleted_at filter the active question pool;
--     matches how the rest of the platform reads quiz questions.)
--   - Correct: COUNT(DISTINCT quiz_id) FILTER (WHERE is_correct) FROM
--     quiz_attempts WHERE kid_profile_id = p_kid_profile_id AND
--     article_id = p_article_id. (quiz_id is the question identifier on
--     attempt rows; it FKs to quizzes.id.)
--
-- All other body logic preserved verbatim: auth gate (parent OR kid-JWT),
-- threshold lookup with fallback to 60, integer-safe pass compare,
-- jsonb return shape (is_passed, correct, total, threshold_pct).
--
-- Caller refactor: none. Callers receive the same jsonb shape.

BEGIN;

-- Pre-flight: confirm the broken body is current.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'get_kid_quiz_verdict' AND pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'V1-fix abort: get_kid_quiz_verdict not found';
  END IF;
  IF v_def NOT LIKE '%quiz_questions%' AND v_def NOT LIKE '%question_id%' THEN
    RAISE NOTICE 'V1-fix no-op: get_kid_quiz_verdict already references quizzes/quiz_id';
  END IF;
  -- Confirm target tables exist.
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='quizzes') THEN
    RAISE EXCEPTION 'V1-fix abort: public.quizzes missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_attempts'
                   AND column_name='quiz_id') THEN
    RAISE EXCEPTION 'V1-fix abort: quiz_attempts.quiz_id missing';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_kid_quiz_verdict(p_kid_profile_id uuid, p_article_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_threshold int;
  v_total int;
  v_correct int;
  v_is_passed boolean;
  v_parent_user_id uuid;
  v_claim_kid_profile_id uuid;
  v_is_kid_delegated boolean;
BEGIN
  -- Auth gate. Caller must be either (a) the parent of the kid, or
  -- (b) the kid themselves via kid-JWT delegation. Anything else
  -- leaks verdicts across households.
  SELECT parent_user_id INTO v_parent_user_id
  FROM public.kid_profiles
  WHERE id = p_kid_profile_id;

  IF v_parent_user_id IS NULL THEN
    RAISE EXCEPTION 'kid profile not found' USING ERRCODE = 'P0001';
  END IF;

  v_is_kid_delegated := COALESCE(public.is_kid_delegated(), false);
  IF v_is_kid_delegated THEN
    -- Kid JWT sets auth.uid() to the kid_profile_id. Ensure the
    -- delegated kid matches the profile being read.
    v_claim_kid_profile_id := auth.uid();
    IF v_claim_kid_profile_id IS DISTINCT FROM p_kid_profile_id THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Not a kid JWT — must be the parent.
    IF auth.uid() IS DISTINCT FROM v_parent_user_id THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Read threshold. Fall through to 60 if the row is missing or the
  -- value isn't an integer — don't let a misconfigured setting lock
  -- every kid out.
  BEGIN
    SELECT NULLIF(value, '')::int INTO v_threshold
    FROM public.settings
    WHERE key = 'kids.quiz.pass_threshold_pct';
  EXCEPTION WHEN invalid_text_representation THEN
    v_threshold := NULL;
  END;
  IF v_threshold IS NULL OR v_threshold < 0 OR v_threshold > 100 THEN
    v_threshold := 60;
  END IF;

  -- Total active questions for this article. quizzes is the questions
  -- table (one row per question); is_active + deleted_at filter the
  -- active pool, matching how the rest of the platform reads it.
  SELECT COUNT(*) INTO v_total
  FROM public.quizzes
  WHERE article_id = p_article_id
    AND is_active = true
    AND deleted_at IS NULL;

  -- Count distinct correct questions answered by this kid. DISTINCT
  -- on quiz_id so a retry-within-session doesn't double-count.
  -- FILTER (WHERE is_correct) is the correct-only narrowing.
  SELECT COUNT(DISTINCT quiz_id) FILTER (WHERE is_correct)
    INTO v_correct
  FROM public.quiz_attempts
  WHERE kid_profile_id = p_kid_profile_id
    AND article_id = p_article_id;

  IF v_total = 0 THEN
    v_is_passed := false;
  ELSE
    -- Integer-safe threshold compare: correct/total * 100 >= threshold
    -- <=> correct * 100 >= threshold * total
    v_is_passed := (COALESCE(v_correct, 0) * 100 >= v_threshold * v_total);
  END IF;

  RETURN jsonb_build_object(
    'is_passed',     v_is_passed,
    'correct',       COALESCE(v_correct, 0),
    'total',         v_total,
    'threshold_pct', v_threshold
  );
END;
$function$;

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'get_kid_quiz_verdict' AND pronamespace = 'public'::regnamespace;
  IF v_def LIKE '%quiz_questions%' THEN
    RAISE EXCEPTION 'V1-fix post-check failed: quiz_questions still referenced in body';
  END IF;
  RAISE NOTICE 'V1-fix applied: get_kid_quiz_verdict now reads quizzes + quiz_attempts.quiz_id';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-28_V1-fix_permissions_requires_verified_zero.sql =====
-- =====================================================================
-- V1-fix-Q1b — permissions.requires_verified — zero every true row to false
--               (stage 1 of the column drop; column itself stays until S6 +
--               S3 callers migrate off it).
--
-- Source: V1 verification pass 2026-04-28. S3 agent's report flagged that
-- S1 never shipped the requires_verified zero-out / column-drop migration
-- referenced in `Session_03_Auth.md:1023` (S3-Q1b-AUTH 🟨 DEPENDS-ON-S1).
--
-- Verified state (2026-04-28 via MCP execute_sql):
--   - public.permissions.requires_verified is a real column.
--   - 956 rows have requires_verified=false; 45 rows have requires_verified=true.
--   - public.compute_effective_perms RPC reads the column at three sites:
--       (1) the perms CTE projects p.requires_verified
--       (2) the resolved CTE COALESCEs it into the column on the row
--       (3) the final CASE branches use it to deny when email_verified=false
--   - Caller surface for compute_effective_perms:
--       - web/src/lib/permissions.js — reads row.granted only (safe)
--       - web/src/app/admin/users/[id]/permissions/page.tsx — passthrough
--       - VerityPost/VerityPost/PermissionService.swift — Bool? (safe)
--       - web/src/types/database.ts — declares requires_verified: boolean
--       - web/src/app/admin/permissions/page.tsx — admin UI checkbox per
--         permission row (S6 territory; this stage doesn't break it)
--
-- Stage 1 (this migration): UPDATE every requires_verified=true row to
-- false. After this lands:
--   - The compute_effective_perms RPC's body shape is unchanged — every
--     row still projects requires_verified, but every value is now false,
--     so the "WHEN f.requires_verified AND email_verified=false THEN deny"
--     branch never fires. Every perm resolves identically for verified
--     and unverified users.
--   - The 45 affected permission rows continue to grant per role/plan/set;
--     the email-verify gate that previously hid them disappears, which is
--     the intended product behavior (per CLAUDE.md memory + Session_03
--     plan: banner-only unverified, no perms wall).
--
-- Stage 2 (deferred, separate migration after callers ship):
--   - S6 drops the requires_verified checkbox from
--     web/src/app/admin/permissions/page.tsx + the API write payload.
--   - S6 regenerates web/src/types/database.ts.
--   - S3 retires `requireVerifiedEmail` helper in lib/auth.js and the
--     comment at api/auth/email-change/route.js:146.
--   - Then a follow-up migration drops permissions.requires_verified +
--     rewrites compute_effective_perms to remove the column projection
--     and the (now-dead) requires_verified branch from the final CASE.
--   - Stage 2 lives wherever the next session for permissions wraps up
--     (likely S6's wave of admin retirement).
--
-- This stage is intentionally NOT the column drop. Dropping the column
-- before compute_effective_perms is rewritten will break the RPC at
-- runtime, and the rewrite changes the RPC's RETURNS TABLE shape
-- (a breaking signature change) — that needs a coordinated cutover, not
-- an autonomous stage 1.

BEGIN;

-- Pre-flight + UPDATE + post-check, all guarded so a post-stage-2 re-run
-- (column already dropped) is a clean no-op rather than a failed UPDATE.
DO $$
DECLARE
  remaining int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'permissions'
       AND column_name = 'requires_verified'
  ) THEN
    RAISE NOTICE 'V1-fix-Q1b no-op: permissions.requires_verified already absent';
    RETURN;
  END IF;

  UPDATE public.permissions
     SET requires_verified = false
   WHERE requires_verified = true;

  SELECT COUNT(*) INTO remaining FROM public.permissions WHERE requires_verified = true;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'V1-fix-Q1b post-check failed: % rows still requires_verified=true', remaining;
  END IF;
  RAISE NOTICE 'V1-fix-Q1b applied: every requires_verified=true row zeroed to false';
END $$;

COMMIT;



-- =====================================================================
-- ===== 2026-04-27_S1_Q4.20_kid_pair_family_plan_trigger.sql =====
-- =====================================================================
-- S1-Q4.20 — parental_consents: enforce family-plan-required for kid pairing
--
-- Decision (Q4.20): "Locked: Family-plan-required for kids. Closes the FTC-enforcement-
-- pattern path entirely (Epic $275M, YouTube $170M precedents). Free-tier kids cannot
-- pair without a family subscription on the parent's account."
--
-- The DB slice is a BEFORE INSERT OR UPDATE trigger on parental_consents that checks
-- the parent's plan tier. Pure RLS isn't sufficient because plan_id can change after
-- the row exists; the trigger re-checks on every UPDATE too.
--
-- Bypass: auth.uid() IS NULL (service_role / postgres maintenance operations). This
-- ensures I11 backfill and admin corrections can still proceed without interference.
-- User-initiated pairings always have auth.uid() set via the anon → authenticated JWT.
--
-- Pre-flight: verify 0 existing consent rows with non-family parents (grandfathering).
-- Verified 2026-04-27: 0 total consent rows → pre-flight trivially passes.
--
-- Apply ORDER: must land AFTER S1-A3 (which adds consent_version column and establishes
-- the table structure) but BEFORE or AFTER S1-I11 is fine since I11 uses service-role
-- backfill (auth.uid() IS NULL → trigger bypasses).
--
-- Acceptance: as free-tier parent → INSERT into parental_consents → ERRCODE 23514.
-- As family-tier parent → INSERT succeeds.

BEGIN;

DO $$
DECLARE bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count
    FROM public.parental_consents pc
    JOIN public.users u ON u.id = pc.parent_user_id
    JOIN public.plans p ON p.id = u.plan_id
   WHERE p.tier NOT LIKE 'verity_family%';
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'S1-Q4.20 abort: % existing consent rows have non-family parents — grandfather manually before applying',
      bad_count;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._enforce_kid_pair_family_plan()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE v_tier text;
BEGIN
  -- Service-role and admin operations bypass the gate (auth.uid() IS NULL
  -- for service_role). Only user-initiated pairings are enforced.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tier INTO v_tier
    FROM public.users u
    JOIN public.plans p ON p.id = u.plan_id
   WHERE u.id = NEW.parent_user_id;

  IF v_tier IS NULL OR v_tier NOT LIKE 'verity_family%' THEN
    RAISE EXCEPTION
      'kid pairing requires a Family plan (current: %); upgrade before pairing',
      COALESCE(v_tier, '<no plan>')
      USING ERRCODE = '23514',
            HINT    = 'Upgrade to Family before pairing a kid account.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_kid_pair_family_plan ON public.parental_consents;
CREATE TRIGGER enforce_kid_pair_family_plan
  BEFORE INSERT OR UPDATE ON public.parental_consents
  FOR EACH ROW EXECUTE FUNCTION public._enforce_kid_pair_family_plan();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'enforce_kid_pair_family_plan'
       AND tgrelid = 'public.parental_consents'::regclass
  ) THEN
    RAISE EXCEPTION 'S1-Q4.20 post-check failed: trigger not found';
  END IF;
  RAISE NOTICE 'S1-Q4.20 applied: kid-pair family-plan trigger live';
END $$;

COMMIT;



-- =====================================================================
-- Bundle trailer — what was included
-- =====================================================================
-- Migrations bundled (in apply order):
--    1. 2026-04-27_S1_T0.2_post_comment_blocks_rename.sql              (P0 fix)
--    2. 2026-04-27_S1_T0.3_drain_rpcs.sql                              (P0 fix)
--    3. 2026-04-27_S1_T0.5_current_kid_profile_id_top_level.sql        (P0 fix)
--    4. 2026-04-27_S1_T2.7_billing_idempotency_advisory_lock.sql       (P0 billing)
--    5. 2026-04-27_S1_T2.2_anonymize_user_redact_content.sql           (P0 GDPR)
--    6. 2026-04-27_S1_T2.3_comments_select_block_filter.sql            (P1 social RLS)
--    7. 2026-04-27_S1_T3.8_resolve_report_notify_reporter.sql          (P2 mod chain)
--    8. 2026-04-27_S1_A95_drop_dead_articles_columns.sql               (P2 schema)
--    9. 2026-04-27_S1_A114_drop_orphan_tables.sql                      (P2 schema)
--   10. 2026-04-27_S1_A115_permission_scope_overrides_unique.sql       (P2 schema)
--   11. 2026-04-27_S1_A116_score_events_action_fk.sql                  (P1 schema)
--   12. 2026-04-27_S1_A101_mute_check.sql                              (P1 RBAC)
--   13. 2026-04-27_S1_A3_parental_consents_columns.sql                 (P0 COPPA — gates I11/Q4.20)
--   14. 2026-04-27_S1_A67_parental_consents_fk_alignment.sql           (P1 COPPA)
--   15. 2026-04-27_S1_A2-PC_update_metadata_check.sql                  (read-only verify)
--   16. 2026-04-27_S1_D6_archive_cluster_check.sql                     (read-only verify)
--   17. 2026-04-27_S1_J-verify_orphan_table_check.sql                  (read-only verify, after A114)
--   18. 2026-04-27_S1_I11_consent_versions_schema.sql                  (P1 COPPA — depends on A3)
--   19. 2026-04-27_S1_Q4.7_clear_frozen_on_free.sql                    (P1 billing — already-clean idempotent)
--   20. 2026-04-27_S1_Q4.8_freeze_content_lockout_rls.sql              (P0 RBAC)
--   21. 2026-04-27_S1_Q4.9_public_profiles_v_is_pro.sql                (P2 public profile)
--   22. 2026-04-27_S1_T347_user_state_enum.sql                         (P1 schema stage 1)
--   23. 2026-04-27_S1_T14_use_streak_freeze_rpc.sql                    (P2 streaks)
--   24. 2026-04-27_S1_T25_subscription_topics.sql                      (P1 notifications schema)
--   25. 2026-04-27_phase1_persist_article_consolidation.sql            (pipeline)
--   26. 2026-04-27_phase2_plan_structure_rewrite.sql                   (plans)
--   27. 2026-04-27_phase3_age_banding.sql                              (kids)
--   28. 2026-04-27_phase6_birthday_prompt_clearing.sql                 (kids)
--   29. 2026-04-27_drop_dead_permission_keys.sql                       (DELETE 7 unused keys)
--   30. 2026-04-28_S1_Q3b_users_rls_restrictive.sql                    (P0 kid-jwt defense)
--   31. 2026-04-28_S1_Q3b_weekly_recap_kid_block.sql                   (P0 kid-jwt defense)
--   32. 2026-04-28_S1_Q3b_events_partition_rls.sql                     (P0 kid-jwt defense)
--   33. 2026-04-28_S1_Q3b_rpc_kid_rejects.sql                          (P0 kid-jwt defense — 19 RPC patches)
--   34. 2026-04-28_V1-fix_get_kid_quiz_verdict_table_rename.sql        (P0 broken RPC)
--   35. 2026-04-28_V1-fix_permissions_requires_verified_zero.sql       (S3-Q1b stage 1 data fix)
--   36. 2026-04-27_S1_Q4.20_kid_pair_family_plan_trigger.sql           (P0 COPPA — last; pre-flight 0 rows 2026-04-28)
--
-- End of bundle.
-- =====================================================================
