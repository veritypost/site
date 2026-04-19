-- ============================================================
-- Phase 8 — Trust & Safety
-- Decisions: D22 (Category Supervisor — opt-in at score threshold,
-- flag + report, no direct mod action), D30 (supervisors flag →
-- moderators act → editors publish → admins manage), D39 (reports
-- + blocks for all verified — already wired in Phase 5).
-- Blueprint §10: progressive penalty stack warn → 24h comment mute
-- → 7-day full mute → ban with appeal.
-- ============================================================

-- ------------------------------------------------------------
-- Seed the supervisor threshold setting (D22 left it TBD; we
-- default to 500 per your call, admin-editable in settings).
-- ------------------------------------------------------------
INSERT INTO settings (key, value, value_type, category, display_name, description, is_public)
VALUES
  ('supervisor_eligibility_score', '500', 'integer', 'moderation',
   'Category Supervisor — eligibility score (D22)',
   'Minimum per-category Verity Score at which the system offers opt-in to Category Supervisor.',
   false)
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------
-- user_supervisor_eligible_for(user, category) -> bool
-- D22: the user's per-category score must meet the threshold.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_supervisor_eligible_for(
  p_user_id uuid,
  p_category_id uuid
) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT score FROM category_scores
                    WHERE user_id = p_user_id AND category_id = p_category_id), 0)
         >= _setting_int('supervisor_eligibility_score', 500);
$$;

GRANT EXECUTE ON FUNCTION public.user_supervisor_eligible_for(uuid, uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- user_is_supervisor_in(user, category) -> bool
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_supervisor_in(
  p_user_id uuid,
  p_category_id uuid
) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM category_supervisors
     WHERE user_id = p_user_id
       AND category_id = p_category_id
       AND is_active = true
       AND opted_out_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_supervisor_in(uuid, uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- supervisor_opt_in — D22 self-opt-in at threshold.
-- Creates / reactivates the row. Sets users.supervisor_opted_in
-- so UI can branch cheaply.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_opt_in(
  p_user_id uuid,
  p_category_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score int;
BEGIN
  SELECT score INTO v_score FROM category_scores
   WHERE user_id = p_user_id AND category_id = p_category_id;
  IF COALESCE(v_score, 0) < _setting_int('supervisor_eligibility_score', 500) THEN
    RAISE EXCEPTION 'not eligible — score below threshold';
  END IF;

  INSERT INTO category_supervisors (user_id, category_id, verity_score_at_grant, is_active)
  VALUES (p_user_id, p_category_id, v_score, true)
  ON CONFLICT DO NOTHING;

  -- If a prior row was opted-out, reactivate.
  UPDATE category_supervisors
     SET is_active = true, opted_out_at = NULL, updated_at = now(),
         verity_score_at_grant = v_score
   WHERE user_id = p_user_id AND category_id = p_category_id;

  UPDATE users SET supervisor_opted_in = true, updated_at = now()
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.supervisor_opt_in(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- supervisor_opt_out — user-initiated.
-- If no other active categories, clears users.supervisor_opted_in.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_opt_out(
  p_user_id uuid,
  p_category_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int;
BEGIN
  UPDATE category_supervisors
     SET is_active = false, opted_out_at = now(), updated_at = now()
   WHERE user_id = p_user_id AND category_id = p_category_id;

  SELECT COUNT(*) INTO v_remaining FROM category_supervisors
   WHERE user_id = p_user_id AND is_active = true AND opted_out_at IS NULL;
  IF v_remaining = 0 THEN
    UPDATE users SET supervisor_opted_in = false, updated_at = now()
     WHERE id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.supervisor_opt_out(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- supervisor_flag_comment — D22 fast-lane.
-- Supervisor in the flagged category writes a report with
-- is_supervisor_flag=true. These jump the moderator queue.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_flag_comment(
  p_user_id uuid,
  p_comment_id uuid,
  p_category_id uuid,
  p_reason text,
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT user_is_supervisor_in(p_user_id, p_category_id) THEN
    RAISE EXCEPTION 'not a supervisor in this category';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM comments WHERE id = p_comment_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'comment not found';
  END IF;

  INSERT INTO reports
    (reporter_id, target_type, target_id, reason, description,
     is_supervisor_flag, supervisor_category_id)
  VALUES
    (p_user_id, 'comment', p_comment_id, p_reason, p_description,
     true, p_category_id)
  RETURNING id INTO v_id;

  UPDATE category_supervisors
     SET flags_submitted = flags_submitted + 1, updated_at = now()
   WHERE user_id = p_user_id AND category_id = p_category_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.supervisor_flag_comment(uuid, uuid, uuid, text, text) TO service_role;


-- ------------------------------------------------------------
-- Moderation role check: moderator or higher (D30).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._user_is_moderator(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_user_id
       AND r.name IN ('moderator', 'editor', 'admin', 'superadmin', 'owner')
  );
$$;


-- ------------------------------------------------------------
-- hide_comment — moderator action (D30).
-- ------------------------------------------------------------
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.unhide_comment(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- apply_penalty — progressive stack (Blueprint §10).
-- p_level:
--   1 = warn only
--   2 = 24h comment mute    (mute_level=1)
--   3 = 7-day full mute     (mute_level=2)
--   4 = ban                 (is_banned=true)
-- Always writes a user_warnings row for history + appeal.
-- ------------------------------------------------------------
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

  RETURN v_warning_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_penalty(uuid, uuid, int, text) TO service_role;


-- ------------------------------------------------------------
-- resolve_report — moderator closes a report.
-- ------------------------------------------------------------
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_report(uuid, uuid, text, text) TO service_role;


-- ------------------------------------------------------------
-- submit_appeal — user attaches an appeal to a specific warning.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_appeal(
  p_user_id uuid,
  p_warning_id uuid,
  p_text text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warn user_warnings%ROWTYPE;
BEGIN
  IF btrim(COALESCE(p_text, '')) = '' THEN
    RAISE EXCEPTION 'appeal text required';
  END IF;
  SELECT * INTO v_warn FROM user_warnings WHERE id = p_warning_id;
  IF NOT FOUND OR v_warn.user_id <> p_user_id THEN
    RAISE EXCEPTION 'warning not found';
  END IF;
  IF v_warn.appeal_status IS NOT NULL THEN
    RAISE EXCEPTION 'appeal already filed';
  END IF;
  UPDATE user_warnings
     SET appeal_status = 'pending', appeal_text = p_text
   WHERE id = p_warning_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_appeal(uuid, uuid, text) TO service_role;


-- ------------------------------------------------------------
-- resolve_appeal — mod/admin approves or denies.
-- On approve, reverses the penalty that was active (if any).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_appeal(
  p_mod_id uuid,
  p_warning_id uuid,
  p_outcome text,                  -- 'approved' | 'denied'
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
    -- Reverse the effect. For warn-only there's nothing to lift.
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_appeal(uuid, uuid, text, text) TO service_role;


-- ------------------------------------------------------------
-- grant_role / revoke_role — admin-only role management.
-- Simple: pick a user, assign a role. No confirmation prompts,
-- no multi-step flow. Admin holds the keys.
-- ------------------------------------------------------------
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

  INSERT INTO user_roles (user_id, role_id)
  SELECT p_user_id, v_role_id
  WHERE NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role_id = v_role_id
  );
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, uuid, text) TO service_role;
