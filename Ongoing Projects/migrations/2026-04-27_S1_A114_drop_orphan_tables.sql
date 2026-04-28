-- S1-A114 — drop 5 orphan tables
--
-- iap_transactions, media_assets, deep_links, kid_category_permissions,
-- streaks — all confirmed present (information_schema, 2026-04-27).
-- None are referenced by active RPCs, RLS policies, or application code.
--
-- iap_transactions: IAP receipts were moved to Stripe + subscriptions table;
--   this table was never populated in production.
-- media_assets: media upload was scoped out; no callers.
-- deep_links: universal-link generation moved to a static edge function; table unused.
-- kid_category_permissions: superseded by permission_scope_overrides + scope_type='category'.
-- streaks: streak data stored on users.streak_* columns; this table was an
--   early design that was abandoned before any rows were written.
--
-- Drops each with CASCADE to remove any dangling FKs or policies.
-- Pre-flight confirms all 5 exist. Post-check confirms all 5 gone.

BEGIN;

DO $$
DECLARE
  v_missing text[] := '{}';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['iap_transactions','media_assets','deep_links','kid_category_permissions','streaks']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN
      v_missing := array_append(v_missing, t);
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) > 0 THEN
    RAISE NOTICE 'S1-A114 partial no-op: already absent tables %', v_missing;
  END IF;
END $$;

DROP TABLE IF EXISTS public.iap_transactions         CASCADE;
DROP TABLE IF EXISTS public.media_assets             CASCADE;
DROP TABLE IF EXISTS public.deep_links               CASCADE;
DROP TABLE IF EXISTS public.kid_category_permissions CASCADE;
DROP TABLE IF EXISTS public.streaks                  CASCADE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['iap_transactions','media_assets','deep_links','kid_category_permissions','streaks']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN
      RAISE EXCEPTION 'S1-A114 post-check failed: table % still present', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'S1-A114 applied: 5 orphan tables dropped';
END $$;

COMMIT;
