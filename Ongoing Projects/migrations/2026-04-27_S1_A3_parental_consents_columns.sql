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
