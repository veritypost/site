-- 174_ext_audit_rls_six_tables.sql
-- Ext-C.26 — RLS classification for the 6 RLS-enabled-but-policy-less tables.
-- Owner-greenlit posture per `Audit_2026-04-24/C26_RLS_CLASSIFICATION_DRAFT.md`.
-- Owner pasted the live list 2026-04-25:
--   expert_queue_items
--   family_achievements
--   kids_waitlist
--   perms_global_version
--   weekly_recap_questions
--   weekly_recap_quizzes
--
-- Postures applied:
--   expert_queue_items     — owner-with-claim-branch
--                             asker reads own; claiming expert reads claimed
--                             item; admin/editor reads all; service writes
--   family_achievements    — owner-only (family_owner_id)
--   kids_waitlist          — anon-can-insert, admin-only-read
--   perms_global_version   — read-public (everyone needs the cache key),
--                             write service-role only via existing RPC
--   weekly_recap_questions — authenticated-read, editor-or-above-write
--   weekly_recap_quizzes   — authenticated-read, editor-or-above-write
--
-- All policies are idempotent (DROP IF EXISTS first).

-- ============================================================================
-- expert_queue_items
-- ============================================================================
DROP POLICY IF EXISTS expert_queue_items_select ON public.expert_queue_items;
DROP POLICY IF EXISTS expert_queue_items_insert ON public.expert_queue_items;
DROP POLICY IF EXISTS expert_queue_items_update ON public.expert_queue_items;
DROP POLICY IF EXISTS expert_queue_items_delete ON public.expert_queue_items;

CREATE POLICY expert_queue_items_select ON public.expert_queue_items
  FOR SELECT
  USING (
    asker_user_id = auth.uid()
    OR claimed_by = auth.uid()
    OR public.is_admin_or_above()
  );

-- Asks: only verified users may ask, must be self.
CREATE POLICY expert_queue_items_insert ON public.expert_queue_items
  FOR INSERT
  WITH CHECK (
    asker_user_id = auth.uid()
    AND public.has_verified_email()
    AND NOT public.is_banned()
  );

-- Updates flow through claim_queue_item / approve_expert_answer RPCs
-- (SECURITY DEFINER, service_role grant). The base policy still allows
-- the claimer to update their own row directly — useful for "withdraw
-- claim" flows — and admin/editor for moderation.
CREATE POLICY expert_queue_items_update ON public.expert_queue_items
  FOR UPDATE
  USING (
    claimed_by = auth.uid()
    OR public.is_admin_or_above()
  )
  WITH CHECK (
    claimed_by = auth.uid()
    OR public.is_admin_or_above()
  );

CREATE POLICY expert_queue_items_delete ON public.expert_queue_items
  FOR DELETE
  USING (public.is_admin_or_above());

-- ============================================================================
-- family_achievements
-- ============================================================================
DROP POLICY IF EXISTS family_achievements_select ON public.family_achievements;
DROP POLICY IF EXISTS family_achievements_modify ON public.family_achievements;

CREATE POLICY family_achievements_select ON public.family_achievements
  FOR SELECT
  USING (
    family_owner_id = auth.uid()
    OR public.is_admin_or_above()
  );

-- Inserts/updates/deletes flow through SECURITY DEFINER RPCs (the
-- recompute_family_achievements cron + admin admin tooling); block
-- direct mutations from authenticated users.
CREATE POLICY family_achievements_modify ON public.family_achievements
  FOR ALL
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- ============================================================================
-- kids_waitlist
-- ============================================================================
DROP POLICY IF EXISTS kids_waitlist_insert_anon ON public.kids_waitlist;
DROP POLICY IF EXISTS kids_waitlist_select ON public.kids_waitlist;
DROP POLICY IF EXISTS kids_waitlist_modify ON public.kids_waitlist;

-- Anon can sign up. Route-level rate limiting handles abuse; RLS just
-- gates that the only legal write from a public caller is INSERT.
CREATE POLICY kids_waitlist_insert_anon ON public.kids_waitlist
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY kids_waitlist_select ON public.kids_waitlist
  FOR SELECT
  USING (public.is_admin_or_above());

CREATE POLICY kids_waitlist_modify ON public.kids_waitlist
  FOR ALL
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- ============================================================================
-- perms_global_version
-- ============================================================================
-- Single-row table that holds the global cache-bust counter every client
-- needs to read on permission cache check. Reads must be public so anon
-- + every signed-in user can compare against their cached value. Writes
-- happen exclusively through the bump_user_perms_version / bump_perms_*
-- RPCs (SECURITY DEFINER, service_role grant).
DROP POLICY IF EXISTS perms_global_version_select ON public.perms_global_version;
DROP POLICY IF EXISTS perms_global_version_modify ON public.perms_global_version;

CREATE POLICY perms_global_version_select ON public.perms_global_version
  FOR SELECT
  USING (true);

CREATE POLICY perms_global_version_modify ON public.perms_global_version
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- weekly_recap_questions
-- ============================================================================
DROP POLICY IF EXISTS weekly_recap_questions_select ON public.weekly_recap_questions;
DROP POLICY IF EXISTS weekly_recap_questions_modify ON public.weekly_recap_questions;

-- Authenticated readers only. Anon can't see recap questions; this
-- matches the "verified-user gated" feel of the recap flow.
CREATE POLICY weekly_recap_questions_select ON public.weekly_recap_questions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Editor / admin / owner write.
CREATE POLICY weekly_recap_questions_modify ON public.weekly_recap_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('editor', 'admin', 'superadmin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('editor', 'admin', 'superadmin', 'owner')
    )
  );

-- ============================================================================
-- weekly_recap_quizzes
-- ============================================================================
DROP POLICY IF EXISTS weekly_recap_quizzes_select ON public.weekly_recap_quizzes;
DROP POLICY IF EXISTS weekly_recap_quizzes_modify ON public.weekly_recap_quizzes;

CREATE POLICY weekly_recap_quizzes_select ON public.weekly_recap_quizzes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY weekly_recap_quizzes_modify ON public.weekly_recap_quizzes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('editor', 'admin', 'superadmin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('editor', 'admin', 'superadmin', 'owner')
    )
  );
