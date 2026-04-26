-- 180_strip_superadmin_references.sql
-- T-004 (Q16) — Remove dead 'superadmin' role references from 8 RPCs and 2 RLS policies.
--
-- Context: migration 105_remove_superadmin_role.sql deleted the superadmin role
-- from the roles table. However, IN (...) clauses in RPC bodies and RLS policy
-- expressions still reference the string 'superadmin'. Since the role no longer
-- exists in the roles table, the references are dead — no row will ever match
-- r.name = 'superadmin' — but they are misleading and should be cleaned up.
--
-- Strategy:
--   RPCs: CREATE OR REPLACE FUNCTION — rewrite with 'superadmin' removed from
--         each IN (...) list. Signatures and all other logic are unchanged.
--   Policies: DROP + CREATE (same idempotent pattern used in schema/174).
--
-- After this migration:
--   SELECT proname FROM pg_proc WHERE prosrc ILIKE '%superadmin%' → 0 rows
--   SELECT policyname FROM pg_policies
--     WHERE qual ILIKE '%superadmin%' OR with_check ILIKE '%superadmin%' → 0 rows
--
-- Affected RPCs (8):
--   _user_is_moderator, approve_expert_answer, approve_expert_application,
--   expert_can_see_back_channel, grant_role, mark_probation_complete,
--   reject_expert_application, revoke_role
--
-- Affected policies (2, 4 expressions):
--   weekly_recap_questions_modify, weekly_recap_quizzes_modify
--
-- Notes on schema files:
--   schema/092 line 62: 'superadmin' inside a one-time UPDATE on users data —
--     already-executed migration, no behavioral impact. Not touched.
--   schema/103 line 20: 'superadmin' as a reserved username seed row —
--     correct behavior (keeps username reserved even without the role). Not touched.
--   reset_and_rebuild_v2.sql: zero superadmin references. Not touched.

BEGIN;

-- ============================================================================
-- RPCs
-- ============================================================================

-- 1. _user_is_moderator
--    Source: schema/016_phase8_trust_safety.sql
--    Remove: 'superadmin' from the moderator-or-higher role set.
CREATE OR REPLACE FUNCTION public._user_is_moderator(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_user_id
       AND r.name IN ('moderator', 'editor', 'admin', 'owner')
  );
$$;


-- 2. expert_can_see_back_channel
--    Source: schema/014_phase6_expert_helpers.sql
--    Remove: 'superadmin' from the back-channel access list.
CREATE OR REPLACE FUNCTION public.expert_can_see_back_channel(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND r.name IN ('expert', 'educator', 'journalist',
                     'editor', 'admin', 'owner')
  );
$$;

GRANT EXECUTE ON FUNCTION public.expert_can_see_back_channel(uuid) TO authenticated, service_role;


-- 3. approve_expert_application
--    Source: schema/014_phase6_expert_helpers.sql (body unchanged from live)
--    Remove: 'superadmin' from reviewer auth check.
CREATE OR REPLACE FUNCTION public.approve_expert_application(
  p_reviewer_id uuid,
  p_application_id uuid,
  p_review_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app expert_applications%ROWTYPE;
  v_role_id uuid;
BEGIN
  -- Reviewer must be editor or higher.
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_reviewer_id
       AND r.name IN ('editor', 'admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'not authorised to approve expert applications';
  END IF;

  SELECT * INTO v_app FROM expert_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application not found'; END IF;
  IF v_app.status <> 'pending' AND v_app.status <> 'under_review' THEN
    RAISE EXCEPTION 'application is not pending (status=%)', v_app.status;
  END IF;
  IF v_app.application_type = 'journalist'
     AND COALESCE(v_app.background_check_status, 'pending') <> 'cleared' THEN
    RAISE EXCEPTION 'journalist approval requires background_check_status=cleared';
  END IF;

  SELECT id INTO v_role_id FROM roles WHERE name = v_app.application_type;
  IF v_role_id IS NULL THEN RAISE EXCEPTION 'role % missing', v_app.application_type; END IF;

  -- Idempotent role grant.
  INSERT INTO user_roles (user_id, role_id)
  SELECT v_app.user_id, v_role_id
  WHERE NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = v_app.user_id AND role_id = v_role_id
  );

  UPDATE expert_applications
     SET status = 'approved',
         reviewed_by = p_reviewer_id,
         reviewed_at = now(),
         review_notes = p_review_notes,
         probation_starts_at = now(),
         probation_ends_at = now() + interval '30 days',
         probation_completed = false,
         credential_verified_at = now(),
         credential_expires_at = now() + interval '365 days',
         updated_at = now()
   WHERE id = p_application_id;

  -- Mark user as expert on the public row too (flag for badge display).
  UPDATE users SET is_expert = true,
                   expert_title = COALESCE(expert_title, v_app.title),
                   expert_organization = COALESCE(expert_organization, v_app.organization),
                   updated_at = now()
   WHERE id = v_app.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_expert_application(uuid, uuid, text) TO service_role;


-- 4. reject_expert_application
--    Source: schema/014_phase6_expert_helpers.sql
--    Remove: 'superadmin' from reviewer auth check.
CREATE OR REPLACE FUNCTION public.reject_expert_application(
  p_reviewer_id uuid,
  p_application_id uuid,
  p_rejection_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_reviewer_id
       AND r.name IN ('editor', 'admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'not authorised to reject expert applications';
  END IF;
  UPDATE expert_applications
     SET status = 'rejected',
         reviewed_by = p_reviewer_id,
         reviewed_at = now(),
         rejection_reason = p_rejection_reason,
         updated_at = now()
   WHERE id = p_application_id
     AND status IN ('pending', 'under_review');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_expert_application(uuid, uuid, text) TO service_role;


-- 5. approve_expert_answer
--    Source: schema/167_ext_audit_cc1_cc7.sql (most recent rewrite, live version)
--    Remove: 'superadmin' from editor auth check.
CREATE OR REPLACE FUNCTION public.approve_expert_answer(
  p_editor_id uuid,
  p_comment_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question_id uuid;
  v_asker_id uuid;
  v_article_id uuid;
  v_question_excerpt text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_editor_id
       AND r.name IN ('editor', 'admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'not authorised to approve';
  END IF;

  UPDATE comments
     SET status = 'visible',
         moderated_by = p_editor_id,
         moderated_at = now(),
         updated_at = now()
   WHERE id = p_comment_id
     AND status = 'pending_review'
     AND is_expert_reply = true;

  -- Flip the matching queue item's question status so the asker
  -- sees "answered" too. Capture the asker info while we're in the row
  -- so we can fire the notification below.
  UPDATE comments
     SET expert_question_status = 'answered', updated_at = now()
   WHERE id = (SELECT parent_id FROM comments WHERE id = p_comment_id)
     AND is_expert_question = true
   RETURNING id, user_id, article_id, left(coalesce(body, ''), 80)
        INTO v_question_id, v_asker_id, v_article_id, v_question_excerpt;

  -- Ext-CC7 — notify the asker that their question was approved-answered.
  -- Best-effort: if v_question_id is NULL (already answered, or the
  -- approve fired against an orphan reply), skip the notify quietly.
  IF v_asker_id IS NOT NULL THEN
    PERFORM create_notification(
      v_asker_id,
      'expert_answered',
      'Your question was answered',
      coalesce(v_question_excerpt, 'An expert replied to your question.'),
      '/story/' || coalesce(v_article_id::text, '') || '#comment-' || p_comment_id::text,
      'comment',
      p_comment_id,
      'normal',
      jsonb_build_object(
        'question_comment_id', v_question_id,
        'answer_comment_id', p_comment_id,
        'article_id', v_article_id
      )
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_expert_answer(uuid, uuid) TO service_role;


-- 6. mark_probation_complete
--    Source: schema/014_phase6_expert_helpers.sql
--    Remove: 'superadmin' from admin auth check.
CREATE OR REPLACE FUNCTION public.mark_probation_complete(
  p_admin_id uuid,
  p_application_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_admin_id
       AND r.name IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  UPDATE expert_applications
     SET probation_completed = true, updated_at = now()
   WHERE id = p_application_id AND status = 'approved';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_probation_complete(uuid, uuid) TO service_role;


-- 7. grant_role
--    Source: schema/026_phase18_sql.sql (most recent rewrite, live version)
--    Remove: 'superadmin' from admin auth check.
CREATE OR REPLACE FUNCTION public.grant_role(
  p_admin_id uuid,
  p_user_id uuid,
  p_role_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_inserted boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_admin_id
       AND r.name IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  SELECT id INTO v_role_id FROM roles WHERE name = p_role_name;
  IF v_role_id IS NULL THEN RAISE EXCEPTION 'unknown role %', p_role_name; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role_id = v_role_id
  ) THEN
    INSERT INTO user_roles (user_id, role_id) VALUES (p_user_id, v_role_id);
    v_inserted := true;
  END IF;

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_admin_id, 'user', 'role.grant', 'user', p_user_id,
          jsonb_build_object('role', p_role_name, 'was_new', v_inserted));
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_role(uuid, uuid, text) TO service_role;


-- 8. revoke_role
--    Source: schema/026_phase18_sql.sql (most recent rewrite, live version)
--    Remove: 'superadmin' from admin auth check.
CREATE OR REPLACE FUNCTION public.revoke_role(
  p_admin_id uuid,
  p_user_id uuid,
  p_role_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_removed int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_admin_id
       AND r.name IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  SELECT id INTO v_role_id FROM roles WHERE name = p_role_name;
  DELETE FROM user_roles
   WHERE user_id = p_user_id AND role_id = v_role_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_admin_id, 'user', 'role.revoke', 'user', p_user_id,
          jsonb_build_object('role', p_role_name, 'rows_removed', v_removed));
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, uuid, text) TO service_role;


-- ============================================================================
-- RLS Policies
-- ============================================================================
-- Both policies were created by schema/174_ext_audit_rls_six_tables.sql.
-- Pattern: DROP + CREATE (same approach used in 174). No behavior change —
-- editor/admin/owner retain identical write access; 'superadmin' was dead.

-- 1. weekly_recap_questions_modify
DROP POLICY IF EXISTS weekly_recap_questions_modify ON public.weekly_recap_questions;

CREATE POLICY weekly_recap_questions_modify ON public.weekly_recap_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('editor', 'admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('editor', 'admin', 'owner')
    )
  );


-- 2. weekly_recap_quizzes_modify
DROP POLICY IF EXISTS weekly_recap_quizzes_modify ON public.weekly_recap_quizzes;

CREATE POLICY weekly_recap_quizzes_modify ON public.weekly_recap_quizzes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('editor', 'admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('editor', 'admin', 'owner')
    )
  );


-- ============================================================================
-- Verification queries (run after applying to confirm zero superadmin hits)
-- ============================================================================
-- SELECT proname FROM pg_proc WHERE prosrc ILIKE '%superadmin%';
-- -- Expected: 0 rows
--
-- SELECT policyname FROM pg_policies
--   WHERE qual ILIKE '%superadmin%' OR with_check ILIKE '%superadmin%';
-- -- Expected: 0 rows

COMMIT;
