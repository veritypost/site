-- 141_rollback_140.sql
--
-- Rollback companion for 140_drop_dead_rpcs.sql.
--
-- IMPORTANT: This rollback does NOT recreate the 7 dropped functions.
-- We do not re-embed the original function bodies here because:
--   1. The functions were dead code (zero callers across web, iOS apps,
--      other RPCs, and RLS policies) at the time of drop.
--   2. Re-introducing them by copy-paste risks drift from whatever
--      historical behavior they had if a future feature ever needs
--      them again.
--
-- If a rollback is genuinely required, the path is to re-run the
-- relevant section of schema/reset_and_rebuild_v2.sql (lines 5459-5631
-- as of 2026-04-23) which contains the original CREATE FUNCTION
-- statements for all 7 RPCs.
--
-- This script only emits a noisy RAISE NOTICE so whoever is running
-- rollback scripts in sequence is not surprised by a no-op.

DO $$
BEGIN
  RAISE NOTICE '-----------------------------------------------------------------';
  RAISE NOTICE '141_rollback_140: NO-OP.';
  RAISE NOTICE 'Migration 140 dropped 7 dead RPCs: set_kid_pin, set_parent_pin,';
  RAISE NOTICE '  set_device_mode, lock_device, unlock_as_kid, unlock_as_parent,';
  RAISE NOTICE '  list_profiles_for_device.';
  RAISE NOTICE 'Full rollback requires re-running the relevant CREATE FUNCTION';
  RAISE NOTICE 'blocks from schema/reset_and_rebuild_v2.sql (lines 5459-5631).';
  RAISE NOTICE 'This script intentionally leaves the DB state unchanged.';
  RAISE NOTICE '-----------------------------------------------------------------';
END $$;
