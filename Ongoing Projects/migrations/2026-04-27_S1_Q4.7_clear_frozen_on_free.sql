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
