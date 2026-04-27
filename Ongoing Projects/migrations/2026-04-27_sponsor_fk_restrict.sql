-- T4.11 — flip sponsor FKs from CASCADE to RESTRICT.
--
-- Discovery (reviewer pass on Wave 21): the original TODO framed this as
-- "sponsor DELETE may orphan revenue rows," but the actual risk is the
-- inverse. Two FKs reference `sponsors.id` today and BOTH cascade:
--
--   fk_articles_sponsor_id   on articles.sponsor_id   ON DELETE CASCADE
--   fk_campaigns_sponsor_id  on campaigns.sponsor_id  ON DELETE CASCADE
--
-- The admin Sponsor DELETE handler at
-- `web/src/app/api/admin/sponsors/[id]/route.js` is a hard-delete with no
-- guard. Today, deleting a sponsor row silently cascade-deletes every
-- article AND every campaign tied to that sponsor. That's the real
-- production risk: a financially-relevant relationship that loses every
-- linked row on a single click, with no admin warning.
--
-- Fix: flip both FKs to ON DELETE RESTRICT so the DB rejects the delete
-- when sponsored articles/campaigns exist. Admin will get a 400 from the
-- DELETE route (already wrapped in safeErrorResponse) and the operator
-- can decide how to handle the relationship — repoint articles, archive
-- the sponsor, etc. — rather than silently nuking history.
--
-- This is a SAFE change: RESTRICT only blocks deletes that would have
-- triggered the cascade. It does not affect sponsor row CRUD where no
-- linked articles/campaigns exist, and it does not affect any read or
-- update path on either side of the FK.
--
-- Owner runs in SQL editor.

BEGIN;

ALTER TABLE public.articles
  DROP CONSTRAINT IF EXISTS fk_articles_sponsor_id;
ALTER TABLE public.articles
  ADD CONSTRAINT fk_articles_sponsor_id
    FOREIGN KEY (sponsor_id)
    REFERENCES public.sponsors (id)
    ON DELETE RESTRICT;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS fk_campaigns_sponsor_id;
ALTER TABLE public.campaigns
  ADD CONSTRAINT fk_campaigns_sponsor_id
    FOREIGN KEY (sponsor_id)
    REFERENCES public.sponsors (id)
    ON DELETE RESTRICT;

-- Verify both rules flipped before commit.
DO $$
DECLARE
  v_articles_rule    "char";
  v_campaigns_rule   "char";
BEGIN
  SELECT confdeltype INTO v_articles_rule
    FROM pg_constraint
    WHERE conname = 'fk_articles_sponsor_id';
  SELECT confdeltype INTO v_campaigns_rule
    FROM pg_constraint
    WHERE conname = 'fk_campaigns_sponsor_id';

  IF v_articles_rule IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'fk_articles_sponsor_id confdeltype=% (expected r)', v_articles_rule;
  END IF;
  IF v_campaigns_rule IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'fk_campaigns_sponsor_id confdeltype=% (expected r)', v_campaigns_rule;
  END IF;
END $$;

COMMIT;
