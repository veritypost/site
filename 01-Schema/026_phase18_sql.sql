-- ============================================================
-- Phase 18 — Admin gaps (SQL batch)
--
-- Covers items 4 and 5 from launch-readiness Phase 18:
--   4. audit_log inserts in hide_comment / unhide_comment / apply_penalty
--      / resolve_report / resolve_appeal / grant_role / revoke_role.
--      Full metadata per action — reason, level, outcome, affected ids.
--   5. send_breaking_news: keyset-paged in 1000-row chunks so a 100k+
--      user base doesn't hold a single query's worth of rows in memory
--      at once. Signature + return shape unchanged.
--
-- submit_appeal is user-initiated (not a mod action), so it is not
-- audited here.
-- ============================================================


-- ============================================================
-- Item 4: audit_log stamping
-- ============================================================

CREATE OR REPLACE FUNCTION public.hide_comment(
  p_mod_id uuid,
  p_comment_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _user_is_moderator(p_mod_id) THEN
    RAISE EXCEPTION 'moderator role required';
  END IF;
  UPDATE comments
     SET status = 'hidden',
         moderation_reason = p_reason,
         moderated_by = p_mod_id,
         moderated_at = now(),
         updated_at = now()
   WHERE id = p_comment_id;

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_mod_id, 'user', 'comment.hide', 'comment', p_comment_id,
          jsonb_build_object('reason', p_reason));
END;
$$;
GRANT EXECUTE ON FUNCTION public.hide_comment(uuid, uuid, text) TO service_role;


CREATE OR REPLACE FUNCTION public.unhide_comment(
  p_mod_id uuid,
  p_comment_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _user_is_moderator(p_mod_id) THEN
    RAISE EXCEPTION 'moderator role required';
  END IF;
  UPDATE comments
     SET status = 'visible',
         moderation_reason = NULL,
         moderated_by = p_mod_id,
         moderated_at = now(),
         updated_at = now()
   WHERE id = p_comment_id AND status = 'hidden';

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_mod_id, 'user', 'comment.unhide', 'comment', p_comment_id, '{}'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unhide_comment(uuid, uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.apply_penalty(
  p_mod_id uuid,
  p_target_id uuid,
  p_level int,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_mute_until timestamptz;
  v_warning_id uuid;
BEGIN
  IF NOT _user_is_moderator(p_mod_id) THEN
    RAISE EXCEPTION 'moderator role required';
  END IF;
  IF p_level NOT IN (1, 2, 3, 4) THEN
    RAISE EXCEPTION 'penalty level must be 1-4';
  END IF;
  IF p_target_id = p_mod_id THEN
    RAISE EXCEPTION 'cannot penalise yourself';
  END IF;

  IF p_level = 1 THEN
    v_action := 'warn';
    v_mute_until := NULL;
    UPDATE users
       SET warning_count = warning_count + 1,
           last_warning_at = now(),
           updated_at = now()
     WHERE id = p_target_id;
  ELSIF p_level = 2 THEN
    v_action := 'comment_mute_24h';
    v_mute_until := now() + interval '24 hours';
    UPDATE users
       SET mute_level = 1,
           is_muted = true,
           muted_until = v_mute_until,
           warning_count = warning_count + 1,
           last_warning_at = now(),
           updated_at = now()
     WHERE id = p_target_id;
  ELSIF p_level = 3 THEN
    v_action := 'mute_7d';
    v_mute_until := now() + interval '7 days';
    UPDATE users
       SET mute_level = 2,
           is_muted = true,
           muted_until = v_mute_until,
           warning_count = warning_count + 1,
           last_warning_at = now(),
           updated_at = now()
     WHERE id = p_target_id;
  ELSIF p_level = 4 THEN
    v_action := 'ban';
    v_mute_until := NULL;
    UPDATE users
       SET is_banned = true,
           banned_at = now(),
           banned_by = p_mod_id,
           ban_reason = p_reason,
           warning_count = warning_count + 1,
           last_warning_at = now(),
           updated_at = now()
     WHERE id = p_target_id;
  END IF;

  INSERT INTO user_warnings
    (user_id, warning_level, reason, action_taken, mute_until, issued_by)
  VALUES
    (p_target_id, p_level, p_reason, v_action, v_mute_until, p_mod_id)
  RETURNING id INTO v_warning_id;

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_mod_id, 'user', 'penalty.apply', 'user', p_target_id,
          jsonb_build_object(
            'level', p_level,
            'action_taken', v_action,
            'reason', p_reason,
            'warning_id', v_warning_id,
            'mute_until', v_mute_until
          ));

  RETURN v_warning_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_penalty(uuid, uuid, int, text) TO service_role;


CREATE OR REPLACE FUNCTION public.resolve_report(
  p_mod_id uuid,
  p_report_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _user_is_moderator(p_mod_id) THEN
    RAISE EXCEPTION 'moderator role required';
  END IF;
  UPDATE reports
     SET status = 'resolved',
         resolution = p_resolution,
         resolution_notes = p_notes,
         resolved_by = p_mod_id,
         resolved_at = now(),
         updated_at = now()
   WHERE id = p_report_id;

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_mod_id, 'user', 'report.resolve', 'report', p_report_id,
          jsonb_build_object('resolution', p_resolution, 'notes', p_notes));
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_report(uuid, uuid, text, text) TO service_role;


CREATE OR REPLACE FUNCTION public.resolve_appeal(
  p_mod_id uuid,
  p_warning_id uuid,
  p_outcome text,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warn user_warnings%ROWTYPE;
BEGIN
  IF NOT _user_is_moderator(p_mod_id) THEN
    RAISE EXCEPTION 'moderator role required';
  END IF;
  IF p_outcome NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'outcome must be approved or denied';
  END IF;
  SELECT * INTO v_warn FROM user_warnings WHERE id = p_warning_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'warning not found'; END IF;

  UPDATE user_warnings
     SET appeal_status = p_outcome,
         appeal_resolved_at = now(),
         appeal_resolved_by = p_mod_id
   WHERE id = p_warning_id;

  IF p_outcome = 'approved' THEN
    IF v_warn.action_taken IN ('comment_mute_24h', 'mute_7d') THEN
      UPDATE users
         SET is_muted = false,
             muted_until = NULL,
             mute_level = 0,
             updated_at = now()
       WHERE id = v_warn.user_id;
    ELSIF v_warn.action_taken = 'ban' THEN
      UPDATE users
         SET is_banned = false,
             banned_at = NULL,
             banned_by = NULL,
             ban_reason = NULL,
             updated_at = now()
       WHERE id = v_warn.user_id;
    END IF;
  END IF;

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_mod_id, 'user', 'appeal.resolve', 'user_warning', p_warning_id,
          jsonb_build_object(
            'outcome', p_outcome,
            'notes', p_notes,
            'affected_user_id', v_warn.user_id,
            'reversed_action', CASE WHEN p_outcome = 'approved' THEN v_warn.action_taken ELSE NULL END
          ));
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_appeal(uuid, uuid, text, text) TO service_role;


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
       AND r.name IN ('admin', 'superadmin', 'owner')
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
       AND r.name IN ('admin', 'superadmin', 'owner')
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


-- ============================================================
-- Item 5: send_breaking_news batching
-- ============================================================
-- Keyset-paged by users.id in 1000-row chunks. Interface unchanged:
-- same signature, same RETURNS integer (total notifications created).
-- Each chunk is its own SELECT so the query planner can use the
-- users_pkey index cleanly and memory never holds more than ~1000
-- eligible user ids at a time. All still runs in one transaction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_breaking_news(
  p_article_id uuid,
  p_title text,
  p_body text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_slug text;
  v_url text;
  v_count int := 0;
  v_nid uuid;
  v_last_id uuid := NULL;
  v_batch_size int := 1000;
  v_batch_processed int;
BEGIN
  SELECT slug INTO v_slug FROM articles WHERE id = p_article_id;
  v_url := '/story/' || COALESCE(v_slug, p_article_id::text);

  LOOP
    v_batch_processed := 0;
    FOR v_user_id IN
      SELECT id FROM users
       WHERE deleted_at IS NULL
         AND is_banned = false
         AND email_verified = true
         AND (v_last_id IS NULL OR id > v_last_id)
       ORDER BY id
       LIMIT v_batch_size
    LOOP
      v_nid := create_notification(
        v_user_id,
        'breaking_news',
        p_title,
        p_body,
        v_url,
        'article',
        p_article_id,
        'high',
        jsonb_build_object('article_id', p_article_id)
      );
      IF v_nid IS NOT NULL THEN v_count := v_count + 1; END IF;
      v_last_id := v_user_id;
      v_batch_processed := v_batch_processed + 1;
    END LOOP;
    EXIT WHEN v_batch_processed = 0;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_breaking_news(uuid, text, text) TO service_role;
