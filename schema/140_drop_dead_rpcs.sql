-- 140_drop_dead_rpcs.sql
--
-- Drop 7 orphan RPCs that are remnants of a scrapped "device mode + per-device
-- PIN" design. The current kids auth system uses:
--   - per-kid pair-code (web/src/app/api/kids/pair + generate-pair-code)
--   - per-kid PIN stored in `kid_profiles.pin_hash`, mutated by
--     web/src/app/api/kids/set-pin and web/src/app/api/kids/reset-pin
-- No application code (web, VerityPost, VerityPostKids) or other SQL object
-- (RPC body, RLS policy) references these 7 functions; verified via
-- pg_proc body grep + pg_policies qual/with_check grep + full-repo ripgrep
-- on 2026-04-23.
--
-- Related: these functions were originally defined in
-- schema/reset_and_rebuild_v2.sql lines 5459-5631 (the DR baseline).
-- They survived into live Supabase as leftover drift after the auth
-- redesign. Dropping them removes the dead surface area from the
-- generated TypeScript types (web/src/types/database.ts) next time
-- types are regenerated.
--
-- Ship/rollback:
--   apply:    this file
--   rollback: schema/141_rollback_140.sql (documents that a full rollback
--             would require re-running reset_and_rebuild_v2.sql; we do
--             not re-embed the original bodies here).

BEGIN;

DROP FUNCTION IF EXISTS public.set_kid_pin(uuid, text);
DROP FUNCTION IF EXISTS public.set_parent_pin(text);
DROP FUNCTION IF EXISTS public.set_device_mode(text, text, uuid);
DROP FUNCTION IF EXISTS public.lock_device(text);
DROP FUNCTION IF EXISTS public.unlock_as_kid(uuid, text, text);
DROP FUNCTION IF EXISTS public.unlock_as_parent(text, text);
DROP FUNCTION IF EXISTS public.list_profiles_for_device(text);

COMMIT;
