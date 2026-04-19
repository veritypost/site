-- 087_tighten_pso_select_rls_2026_04_19.sql
-- Migration: 20260419131302 tighten_pso_select_rls_2026_04_19
--
-- Round 6 SECURITY: tighten permission_scope_overrides read policy.
-- Previously: USING (true) — any session could read all rows.
-- Now: admins see all; users see only overrides scoped to themselves.

DROP POLICY IF EXISTS pso_select ON public.permission_scope_overrides;
CREATE POLICY pso_select ON public.permission_scope_overrides
  FOR SELECT
  USING (
    public.is_admin_or_above()
    OR (scope_type = 'user' AND scope_id = auth.uid())
  );

-- Bump global perms version so clients refresh effective perms.
UPDATE public.perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;
