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
