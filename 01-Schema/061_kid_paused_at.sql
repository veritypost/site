-- ============================================================
-- 061_kid_paused_at.sql
-- Chunk 2 of the kids-mode audit + repair pass.
--
-- Adds a parent-controlled pause state to kid_profiles. Orthogonal
-- to `is_active` (which carries trial-freeze semantics — D44). A
-- paused kid:
--   - is hidden from /kids profile picker and the expert-session
--     "ask as" list,
--   - still renders in the parental dashboard with a "Paused" pill,
--   - resumes when the parent clears paused_at.
--
-- Idempotent. Apply after 060_resolve_username_anon_revoke.sql.
-- ============================================================

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

COMMENT ON COLUMN public.kid_profiles.paused_at IS
  'Parent-initiated pause marker. NULL = active. Non-null timestamp = '
  'paused at that moment (hides profile from kid surfaces but keeps '
  'data). Distinct from is_active, which is used for trial-freeze '
  'semantics per D44.';

CREATE INDEX IF NOT EXISTS idx_kid_profiles_paused_at
  ON public.kid_profiles (parent_user_id, paused_at)
  WHERE paused_at IS NULL;
