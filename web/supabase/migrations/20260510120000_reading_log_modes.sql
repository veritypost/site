-- reading_log — interactive moments + mode aggregate counters
--
-- Adds five columns to capture article-level engagement on the kid iOS
-- Deep dive reader: which mode the kid completed in, plus tap counts
-- on glossary / reveal cards and the predict outcome. Aggregate-only —
-- no per-moment-id tracking, no per-tap timestamps, no per-kid
-- behavioral profile. COPPA-clean.
--
-- Write path: VerityPostKids logs once on "Take the quiz" tap as part
-- of the existing reading_log insert. Adult web/iOS do not write these
-- columns — they default to NULL / 0 / FALSE.
--
-- Platform applicability (LockedDecisions #18):
--   - Web (desktop + mobile): not applicable.
--   - iOS adult: not applicable.
--   - iOS Kids: applicable (sole writer).

ALTER TABLE public.reading_log
  ADD COLUMN IF NOT EXISTS mode_used TEXT NULL,
  ADD COLUMN IF NOT EXISTS moment_glossary_taps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moment_reveal_taps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moment_predict_shown BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS moment_predict_correct BOOLEAN NULL;

-- mode_used: 'quick' (summary-only read) or 'deep' (full body with markers).
-- NULL means the row predates this column or was written by a non-kid path.
ALTER TABLE public.reading_log
  ADD CONSTRAINT reading_log_mode_used_check
    CHECK (mode_used IS NULL OR mode_used IN ('quick', 'deep')) NOT VALID;
ALTER TABLE public.reading_log
  VALIDATE CONSTRAINT reading_log_mode_used_check;

-- Bounds-check tap counts. 200 in a single read is far beyond plausible
-- engagement; treat as bug or abuse.
ALTER TABLE public.reading_log
  ADD CONSTRAINT reading_log_moment_glossary_taps_bounded
    CHECK (moment_glossary_taps BETWEEN 0 AND 200) NOT VALID;
ALTER TABLE public.reading_log
  VALIDATE CONSTRAINT reading_log_moment_glossary_taps_bounded;

ALTER TABLE public.reading_log
  ADD CONSTRAINT reading_log_moment_reveal_taps_bounded
    CHECK (moment_reveal_taps BETWEEN 0 AND 200) NOT VALID;
ALTER TABLE public.reading_log
  VALIDATE CONSTRAINT reading_log_moment_reveal_taps_bounded;

-- predict_correct semantic: NULL = not answered (predict_shown may be
-- FALSE if no PREDICT marker, or TRUE if shown but kid bailed).
-- FALSE = wrong. TRUE = correct.
--
-- RLS: existing reading_log policies cover INSERT for the kid JWT path
-- (kid_profile_id row scope). New columns inherit row-level access; no
-- additional policy needed. Verify by running an INSERT via kid JWT
-- after applying.
