-- ============================================================
-- Phase 12 — Production Cutover prerequisites
-- Seeds the v2_live feature flag so the rollback kill-switch has
-- a row to flip.
-- ============================================================

INSERT INTO feature_flags (key, display_name, description, is_enabled, rollout_percentage)
VALUES
  ('v2_live',
   'v2 live',
   'Master rollback switch. When is_enabled=false, client code should fall back to read-only / maintenance mode. Flip via admin/feature-flags.',
   true, 100)
ON CONFLICT (key) DO NOTHING;
