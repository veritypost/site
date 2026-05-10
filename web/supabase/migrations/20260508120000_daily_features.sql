-- daily_features
--
-- One curated typographic feature per editorial day, surfaced as the
-- MidFeedFeature on the home page (mid-river, between supporting cards
-- 5 and 6). NOT story-driven: editorial team writes one entry per day.
--
-- Currently used for the "by_numbers" type — three figures with one-line
-- captions. Future types ("receipts", "quote", "pull_quote") extend
-- `feature_type` without schema churn since `items` stays jsonb.
--
-- Read path: public SELECT for status='published' AND deleted_at IS NULL
-- (matches the existing `articles`/`stories` read pattern). Writes are
-- service-role only — the admin UI uses the service client like the rest
-- of editorial tooling, so we don't need a row-level admin policy.

CREATE TABLE IF NOT EXISTS public.daily_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_date  DATE NOT NULL,
  feature_type  TEXT NOT NULL DEFAULT 'by_numbers'
                  CHECK (feature_type IN ('by_numbers', 'receipts', 'quote', 'pull_quote')),
  label         TEXT NOT NULL DEFAULT 'By the numbers',
  sub_label     TEXT,
  -- Shape per feature_type:
  --   by_numbers:  [{ "figure": "$2.3M", "caption": "..." }, ...]   (3–4 items)
  --   receipts:    [{ "claim": "...", "verdict": "...", "source_line": "..." }, ...]
  --   quote:       { "quote": "...", "speaker": "...", "context": "..." }
  --   pull_quote:  { "quote": "...", "attribution": "..." }
  items         JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
);

-- One published feature per editorial day (drafts are unbounded).
CREATE UNIQUE INDEX IF NOT EXISTS daily_features_one_published_per_day
  ON public.daily_features (feature_date)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Hot path index for the home fetch: most recent published feature on or
-- before today. Partial so we don't index drafts/soft-deleted rows.
CREATE INDEX IF NOT EXISTS daily_features_published_date_idx
  ON public.daily_features (feature_date DESC)
  WHERE status = 'published' AND deleted_at IS NULL;

-- updated_at trigger.
CREATE OR REPLACE FUNCTION public.daily_features_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_features_updated_at ON public.daily_features;
CREATE TRIGGER daily_features_updated_at
  BEFORE UPDATE ON public.daily_features
  FOR EACH ROW EXECUTE FUNCTION public.daily_features_set_updated_at();

-- RLS — public read of published features only. Writes happen via the
-- service-role client from the admin UI, so no INSERT/UPDATE/DELETE
-- policy is required for authenticated users.
ALTER TABLE public.daily_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_features_public_read ON public.daily_features;
CREATE POLICY daily_features_public_read ON public.daily_features
  FOR SELECT
  USING (status = 'published' AND deleted_at IS NULL);

-- Seed today's feature so the home page renders immediately after this
-- migration runs. Idempotent — ON CONFLICT DO NOTHING means re-running
-- the migration won't replace whatever the editorial team has published.
INSERT INTO public.daily_features (
  feature_date, feature_type, label, sub_label, items, status, published_at
)
VALUES (
  CURRENT_DATE,
  'by_numbers',
  'By the numbers',
  E'Today’s figures',
  '[
    {"figure": "$2.3M", "caption": "Total alleged in the Lucas affidavit, across 11 transactions between 2022 and 2024."},
    {"figure": "5",     "caption": "UK parties polling above 10% — first time the two-party threshold has broken since 1923."},
    {"figure": "$480K", "caption": "Largest single transfer; the recipient LLC dissolved within 30 days of receipt."}
  ]'::jsonb,
  'published',
  NOW()
)
ON CONFLICT DO NOTHING;
