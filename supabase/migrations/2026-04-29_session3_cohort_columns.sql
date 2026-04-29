-- Session 3 — cohort source/medium columns + invite cap default setting.
--
-- Adds:
--   access_codes.cohort_source  — e.g. 'referral', 'owner-link', 'press-day'
--   access_codes.cohort_medium  — e.g. 'user-cliff', 'twitter', 'direct'
--   access_requests.referral_medium — mirrors referral_source (already exists)
--   settings.invite_cap_default — global default (2). Per-user override in Session 3 Migration F.

ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS cohort_source text,
  ADD COLUMN IF NOT EXISTS cohort_medium text;

CREATE INDEX IF NOT EXISTS access_codes_cohort_source_idx
  ON public.access_codes (cohort_source) WHERE cohort_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS access_codes_cohort_medium_idx
  ON public.access_codes (cohort_medium) WHERE cohort_medium IS NOT NULL;

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS referral_medium text;

INSERT INTO public.settings (key, value, value_type, category, display_name, description)
VALUES (
  'invite_cap_default', '2', 'number', 'beta',
  'Default invite cap (during beta)',
  'Default number of personal-link invitations each user can send during beta. Override per-user via admin user dossier.'
)
ON CONFLICT (key) DO NOTHING;
