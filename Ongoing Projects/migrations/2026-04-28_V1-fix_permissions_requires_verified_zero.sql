-- V1-fix-Q1b — permissions.requires_verified — zero every true row to false
--               (stage 1 of the column drop; column itself stays until S6 +
--               S3 callers migrate off it).
--
-- Source: V1 verification pass 2026-04-28. S3 agent's report flagged that
-- S1 never shipped the requires_verified zero-out / column-drop migration
-- referenced in `Session_03_Auth.md:1023` (S3-Q1b-AUTH 🟨 DEPENDS-ON-S1).
--
-- Verified state (2026-04-28 via MCP execute_sql):
--   - public.permissions.requires_verified is a real column.
--   - 956 rows have requires_verified=false; 45 rows have requires_verified=true.
--   - public.compute_effective_perms RPC reads the column at three sites:
--       (1) the perms CTE projects p.requires_verified
--       (2) the resolved CTE COALESCEs it into the column on the row
--       (3) the final CASE branches use it to deny when email_verified=false
--   - Caller surface for compute_effective_perms:
--       - web/src/lib/permissions.js — reads row.granted only (safe)
--       - web/src/app/admin/users/[id]/permissions/page.tsx — passthrough
--       - VerityPost/VerityPost/PermissionService.swift — Bool? (safe)
--       - web/src/types/database.ts — declares requires_verified: boolean
--       - web/src/app/admin/permissions/page.tsx — admin UI checkbox per
--         permission row (S6 territory; this stage doesn't break it)
--
-- Stage 1 (this migration): UPDATE every requires_verified=true row to
-- false. After this lands:
--   - The compute_effective_perms RPC's body shape is unchanged — every
--     row still projects requires_verified, but every value is now false,
--     so the "WHEN f.requires_verified AND email_verified=false THEN deny"
--     branch never fires. Every perm resolves identically for verified
--     and unverified users.
--   - The 45 affected permission rows continue to grant per role/plan/set;
--     the email-verify gate that previously hid them disappears, which is
--     the intended product behavior (per CLAUDE.md memory + Session_03
--     plan: banner-only unverified, no perms wall).
--
-- Stage 2 (deferred, separate migration after callers ship):
--   - S6 drops the requires_verified checkbox from
--     web/src/app/admin/permissions/page.tsx + the API write payload.
--   - S6 regenerates web/src/types/database.ts.
--   - S3 retires `requireVerifiedEmail` helper in lib/auth.js and the
--     comment at api/auth/email-change/route.js:146.
--   - Then a follow-up migration drops permissions.requires_verified +
--     rewrites compute_effective_perms to remove the column projection
--     and the (now-dead) requires_verified branch from the final CASE.
--   - Stage 2 lives wherever the next session for permissions wraps up
--     (likely S6's wave of admin retirement).
--
-- This stage is intentionally NOT the column drop. Dropping the column
-- before compute_effective_perms is rewritten will break the RPC at
-- runtime, and the rewrite changes the RPC's RETURNS TABLE shape
-- (a breaking signature change) — that needs a coordinated cutover, not
-- an autonomous stage 1.

BEGIN;

-- Pre-flight: confirm the column exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'permissions'
       AND column_name = 'requires_verified'
  ) THEN
    RAISE NOTICE 'V1-fix-Q1b no-op: permissions.requires_verified already absent';
    RETURN;
  END IF;
END $$;

UPDATE public.permissions
   SET requires_verified = false
 WHERE requires_verified = true;

-- Post-verification: confirm zero remaining true rows.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM public.permissions WHERE requires_verified = true;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'V1-fix-Q1b post-check failed: % rows still requires_verified=true', remaining;
  END IF;
  RAISE NOTICE 'V1-fix-Q1b applied: every requires_verified=true row zeroed to false';
END $$;

COMMIT;
