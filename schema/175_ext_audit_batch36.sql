-- 175_ext_audit_batch36.sql
-- Batch 36 — TIER A launch gates from EXT_AUDIT_FINAL_PLAN.md.
--
-- Ext-GG.3 — permission_set_perms / role_permission_sets /
--   plan_permission_sets all expose SELECT USING (true). Any
--   authenticated session can enumerate the entire permission
--   matrix. Real-world impact is low (no exfiltration path; the
--   matrix is the product), but security auditors flag it
--   categorically. Tighten to admin-or-above.

-- ============================================================================
-- GG.3 — admin-only SELECT on the permission-matrix join tables
-- ============================================================================

DROP POLICY IF EXISTS permission_set_perms_select ON public.permission_set_perms;
DROP POLICY IF EXISTS role_permission_sets_select ON public.role_permission_sets;
DROP POLICY IF EXISTS plan_permission_sets_select ON public.plan_permission_sets;

CREATE POLICY permission_set_perms_select ON public.permission_set_perms
  FOR SELECT
  USING (public.is_admin_or_above());

CREATE POLICY role_permission_sets_select ON public.role_permission_sets
  FOR SELECT
  USING (public.is_admin_or_above());

CREATE POLICY plan_permission_sets_select ON public.plan_permission_sets
  FOR SELECT
  USING (public.is_admin_or_above());

-- The existing service-role grants + the SECURITY DEFINER
-- compute_effective_perms / loadEffectivePerms RPCs continue to
-- bypass RLS for the legitimate read path. Authenticated users get
-- their effective permissions through the RPC return shape; they
-- lose direct read of the underlying joins (which they should never
-- have had).
