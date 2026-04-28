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
ALTER TABLE public.parental_consents
  ADD CONSTRAINT fk_parental_consents_consent_version
  FOREIGN KEY (consent_version) REFERENCES public.consent_versions(version);

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
