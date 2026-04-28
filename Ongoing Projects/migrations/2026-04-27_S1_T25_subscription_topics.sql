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
CREATE POLICY subscription_topics_owner_rw ON public.subscription_topics
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Kid-block: kid tokens cannot subscribe (inline JWT check until is_kid_delegated() lands)
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
