-- Dead-letter counter for AI comment scoring. After 3 failures the comment
-- is skipped permanently (score stays null, attempts stays at 3).
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS ai_score_attempts smallint NOT NULL DEFAULT 0;
