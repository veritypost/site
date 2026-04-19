-- ============================================================
-- 062_kid_global_leaderboard_opt_in.sql
-- Chunk 6a of the kids-mode audit + repair pass.
--
-- D12 2026-04-16 clarified that a kids-only global leaderboard may
-- expose kid display_name + score across families. This migration
-- adds a per-kid opt-in so the exposure is explicit, parental, and
-- conservative-by-default (minors under COPPA).
--
-- Semantics:
--   - global_leaderboard_opt_in boolean NOT NULL DEFAULT false.
--   - Flag is set via /api/kids/[id] PATCH (parent-owned only).
--   - /api/kids/global-leaderboard filters to rows where the flag is
--     true. The caller's own kid receives a CTA-vs-ranking branch
--     on the client: if self is not opted in, the leaderboard renders
--     an opt-in prompt instead of an artificially-narrow ranking.
--   - No backfill — every existing kid starts opted out. There is
--     zero real kid activity at this point in the rollout, so
--     starting cold is honest, and any parent who wants visibility
--     makes a deliberate toggle.
--
-- Partial index: optimises the default leaderboard branch, which
-- reads from kid_profiles WHERE is_active=true AND opted-in, sorted
-- by verity_score descending.
--
-- Idempotent. Apply after 061_kid_paused_at.sql.
-- ============================================================

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS global_leaderboard_opt_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.kid_profiles.global_leaderboard_opt_in IS
  'Parent-controlled opt-in (D12 2026-04-16). When true, this kid '
  'appears on /kids/leaderboard global scope with display_name + '
  'score. Default false — conservative privacy posture for minors. '
  'No backfill; existing kids must be explicitly opted in.';

CREATE INDEX IF NOT EXISTS idx_kid_profiles_global_leaderboard_opt_in
  ON public.kid_profiles (verity_score DESC)
  WHERE global_leaderboard_opt_in = true AND is_active = true;
