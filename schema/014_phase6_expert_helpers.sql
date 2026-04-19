-- ============================================================
-- Phase 6 — Expert System
-- Decisions: D3 (badges = only public authority), D8 (no bypass),
-- D20 (Ask an Expert — Verity Pro+, blurred for free), D33
-- (expert queue + private back-channel per-category + per-question).
-- ============================================================

-- ------------------------------------------------------------
-- is_user_expert(user_id) -> bool
-- Expert / Educator / Journalist all count as "expert" for
-- queue and back-channel access (D33 names them together).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_user_expert(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND r.name IN ('expert', 'educator', 'journalist')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_expert(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- expert_can_see_back_channel(user_id) -> bool
-- D33: Experts, Editors, Admins, Superadmins, Owners.
-- Category Supervisors and regular users are explicitly excluded.
-- ------------------------------------------------------------
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
                     'editor', 'admin', 'superadmin', 'owner')
  );
$$;

GRANT EXECUTE ON FUNCTION public.expert_can_see_back_channel(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- is_expert_in_probation(user_id) -> bool
-- D3: 30-day probationary period. While true, the expert's
-- answers are inserted with status='pending_review' and must
-- be approved by an editor before becoming visible.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_expert_in_probation(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM expert_applications
     WHERE user_id = p_user_id
       AND status = 'approved'
       AND probation_completed = false
       AND probation_ends_at > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_expert_in_probation(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- submit_expert_application
-- Single active application at a time. Journalist role triggers
-- background_check_status='pending'. sample_responses must have
-- exactly 3 entries (D3).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_expert_application(
  p_user_id uuid,
  p_application_type text,
  p_full_name text,
  p_organization text,
  p_title text,
  p_bio text,
  p_expertise_areas text[],
  p_website_url text,
  p_social_links jsonb,
  p_credentials jsonb,
  p_portfolio_urls text[],
  p_sample_responses jsonb,
  p_category_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_id uuid;
  v_cat_id uuid;
BEGIN
  IF p_application_type NOT IN ('expert', 'educator', 'journalist') THEN
    RAISE EXCEPTION 'application_type must be expert / educator / journalist';
  END IF;
  IF p_sample_responses IS NULL OR jsonb_array_length(p_sample_responses) <> 3 THEN
    RAISE EXCEPTION 'exactly 3 sample responses required (D3)';
  END IF;
  IF p_category_ids IS NULL OR array_length(p_category_ids, 1) = 0 THEN
    RAISE EXCEPTION 'pick at least one category';
  END IF;

  IF EXISTS (SELECT 1 FROM expert_applications
              WHERE user_id = p_user_id AND status IN ('pending', 'under_review')) THEN
    RAISE EXCEPTION 'you already have an application in review';
  END IF;

  INSERT INTO expert_applications (
    user_id, application_type, full_name, organization, title, bio,
    expertise_areas, website_url, social_links, credentials,
    portfolio_urls, sample_responses, status, background_check_status
  ) VALUES (
    p_user_id, p_application_type, p_full_name, p_organization, p_title, p_bio,
    p_expertise_areas, p_website_url, COALESCE(p_social_links, '{}'::jsonb),
    COALESCE(p_credentials, '[]'::jsonb), p_portfolio_urls, p_sample_responses,
    'pending',
    CASE WHEN p_application_type = 'journalist' THEN 'pending' ELSE NULL END
  )
  RETURNING id INTO v_app_id;

  FOREACH v_cat_id IN ARRAY p_category_ids LOOP
    INSERT INTO expert_application_categories (application_id, category_id)
    VALUES (v_app_id, v_cat_id);
  END LOOP;

  RETURN v_app_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_expert_application(
  uuid, text, text, text, text, text, text[], text, jsonb, jsonb, text[], jsonb, uuid[]
) TO service_role;


-- ------------------------------------------------------------
-- approve_expert_application
-- Editor/Admin approves. Grants matching role, sets 30-day
-- probation window, stamps credential verification.
-- Journalist role requires background_check_status='cleared'.
-- ------------------------------------------------------------
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
       AND r.name IN ('editor', 'admin', 'superadmin', 'owner')
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


-- ------------------------------------------------------------
-- reject_expert_application
-- ------------------------------------------------------------
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
       AND r.name IN ('editor', 'admin', 'superadmin', 'owner')
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


-- ------------------------------------------------------------
-- ask_expert — D20 entry point for Verity Pro+ users.
-- Inserts a comment flagged is_expert_question=true with
-- expert_question_target_* set, then inserts a matching
-- expert_queue_items row for routing.
-- Enforces: Verity Pro+ tier AND quiz pass (D8).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ask_expert(
  p_user_id uuid,
  p_article_id uuid,
  p_body text,
  p_target_type text,                     -- 'category' | 'expert'
  p_target_id uuid                        -- category_id or expert user_id
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_tier text;
  v_comment_id uuid;
  v_queue_id uuid;
  v_body text;
BEGIN
  IF p_target_type NOT IN ('category', 'expert') THEN
    RAISE EXCEPTION 'target_type must be category or expert';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF NOT v_user.email_verified THEN
    RAISE EXCEPTION 'verify email first'; END IF;

  SELECT p.tier INTO v_tier FROM plans p WHERE p.id = v_user.plan_id;
  IF v_tier NOT IN ('verity_pro', 'verity_family', 'verity_family_xl') THEN
    RAISE EXCEPTION 'Ask an Expert requires Verity Pro or higher';
  END IF;

  IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
    RAISE EXCEPTION 'quiz not passed';
  END IF;

  -- Target validation.
  IF p_target_type = 'category' THEN
    IF NOT EXISTS (SELECT 1 FROM categories WHERE id = p_target_id) THEN
      RAISE EXCEPTION 'category not found';
    END IF;
  ELSE
    IF NOT is_user_expert(p_target_id) THEN
      RAISE EXCEPTION 'target user is not an expert';
    END IF;
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'question body empty'; END IF;

  INSERT INTO comments
    (article_id, user_id, body, status,
     is_expert_question, expert_question_target_type,
     expert_question_target_id, expert_question_status)
  VALUES
    (p_article_id, p_user_id, v_body, 'visible',
     true, p_target_type, p_target_id, 'pending')
  RETURNING id INTO v_comment_id;

  INSERT INTO expert_queue_items
    (article_id, comment_id, asking_user_id, target_type,
     target_category_id, target_expert_id, status)
  VALUES
    (p_article_id, v_comment_id, p_user_id, p_target_type,
     CASE WHEN p_target_type = 'category' THEN p_target_id END,
     CASE WHEN p_target_type = 'expert'   THEN p_target_id END,
     'pending')
  RETURNING id INTO v_queue_id;

  UPDATE users SET comment_count = comment_count + 1, updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('comment_id', v_comment_id, 'queue_item_id', v_queue_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ask_expert(uuid, uuid, text, text, uuid) TO service_role;


-- ------------------------------------------------------------
-- claim_queue_item — expert takes ownership before answering.
-- Category targets are claimable by any expert tagged to that
-- category (expert_application_categories). Expert targets
-- must match the invoking user.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_queue_item(
  p_user_id uuid,
  p_queue_item_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item expert_queue_items%ROWTYPE;
BEGIN
  IF NOT is_user_expert(p_user_id) THEN
    RAISE EXCEPTION 'only experts can claim queue items';
  END IF;

  SELECT * INTO v_item FROM expert_queue_items
    WHERE id = p_queue_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue item not found'; END IF;
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'queue item is % (not pending)', v_item.status;
  END IF;

  IF v_item.target_type = 'expert' AND v_item.target_expert_id <> p_user_id THEN
    RAISE EXCEPTION 'this question is directed at a specific expert';
  END IF;
  IF v_item.target_type = 'category' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM expert_application_categories eac
        JOIN expert_applications a ON a.id = eac.application_id
       WHERE a.user_id = p_user_id
         AND a.status = 'approved'
         AND eac.category_id = v_item.target_category_id
    ) THEN
      RAISE EXCEPTION 'you are not verified for this category';
    END IF;
  END IF;

  UPDATE expert_queue_items
     SET status = 'claimed',
         claimed_by = p_user_id,
         claimed_at = now(),
         updated_at = now()
   WHERE id = p_queue_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_queue_item(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- decline_queue_item — adds user to declined_by; status stays
-- pending so another expert can claim it.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_queue_item(
  p_user_id uuid,
  p_queue_item_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE expert_queue_items
     SET declined_by = array_append(COALESCE(declined_by, '{}'::uuid[]), p_user_id),
         updated_at = now()
   WHERE id = p_queue_item_id
     AND NOT (p_user_id = ANY(COALESCE(declined_by, '{}'::uuid[])));
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_queue_item(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- post_expert_answer — publishes the expert's response as a
-- threaded reply to the original question comment.
-- During probation the row is inserted with status='pending_review'
-- and is invisible to non-experts until an editor approves.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_expert_answer(
  p_user_id uuid,
  p_queue_item_id uuid,
  p_body text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item expert_queue_items%ROWTYPE;
  v_question comments%ROWTYPE;
  v_answer_id uuid;
  v_status text;
  v_in_probation boolean;
  v_body text;
BEGIN
  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'answer body empty'; END IF;

  IF NOT is_user_expert(p_user_id) THEN
    RAISE EXCEPTION 'only experts can answer';
  END IF;

  SELECT * INTO v_item FROM expert_queue_items
    WHERE id = p_queue_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue item not found'; END IF;
  IF v_item.status <> 'claimed' OR v_item.claimed_by <> p_user_id THEN
    RAISE EXCEPTION 'you must claim the item before answering';
  END IF;

  SELECT * INTO v_question FROM comments WHERE id = v_item.comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'original question comment missing'; END IF;

  v_in_probation := is_expert_in_probation(p_user_id);
  v_status := CASE WHEN v_in_probation THEN 'pending_review' ELSE 'visible' END;

  INSERT INTO comments
    (article_id, user_id, parent_id, root_id, thread_depth,
     body, status, is_expert_reply)
  VALUES
    (v_item.article_id, p_user_id, v_question.id,
     COALESCE(v_question.root_id, v_question.id),
     v_question.thread_depth + 1,
     v_body, v_status, true)
  RETURNING id INTO v_answer_id;

  UPDATE comments SET reply_count = reply_count + 1, updated_at = now()
   WHERE id = v_question.id;

  UPDATE expert_queue_items
     SET status = 'answered',
         answered_at = now(),
         answer_comment_id = v_answer_id,
         updated_at = now()
   WHERE id = p_queue_item_id;

  UPDATE comments
     SET expert_question_status = CASE WHEN v_in_probation THEN 'pending_review' ELSE 'answered' END,
         updated_at = now()
   WHERE id = v_question.id;

  RETURN jsonb_build_object(
    'answer_comment_id', v_answer_id,
    'pending_review', v_in_probation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_expert_answer(uuid, uuid, text) TO service_role;


-- ------------------------------------------------------------
-- approve_expert_answer — editor flips a probation response
-- from pending_review to visible.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_expert_answer(
  p_editor_id uuid,
  p_comment_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_editor_id
       AND r.name IN ('editor', 'admin', 'superadmin', 'owner')
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
  -- sees "answered" too.
  UPDATE comments
     SET expert_question_status = 'answered', updated_at = now()
   WHERE id = (SELECT parent_id FROM comments WHERE id = p_comment_id)
     AND is_expert_question = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_expert_answer(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- post_back_channel_message — D33. Single back-channel per
-- category + optional per-question thread via source_comment_id.
-- Visible to Experts / Editors / Admins / Superadmins / Owners.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_back_channel_message(
  p_user_id uuid,
  p_category_id uuid,
  p_body text,
  p_source_comment_id uuid DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_body text;
  v_type text;
BEGIN
  IF NOT expert_can_see_back_channel(p_user_id) THEN
    RAISE EXCEPTION 'not authorised for the back-channel';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'message empty'; END IF;

  v_type := CASE WHEN p_source_comment_id IS NOT NULL THEN 'queue_response' ELSE 'general' END;

  INSERT INTO expert_discussions
    (category_id, user_id, parent_id, source_comment_id,
     discussion_type, title, body, status)
  VALUES
    (p_category_id, p_user_id, p_parent_id, p_source_comment_id,
     v_type, p_title, v_body, 'visible')
  RETURNING id INTO v_id;

  IF p_parent_id IS NOT NULL THEN
    UPDATE expert_discussions SET reply_count = reply_count + 1, updated_at = now()
     WHERE id = p_parent_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_back_channel_message(uuid, uuid, text, uuid, uuid, text) TO service_role;


-- ------------------------------------------------------------
-- mark_probation_complete — admin-only override to close
-- probation early. Normally just wait for probation_ends_at.
-- ------------------------------------------------------------
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
       AND r.name IN ('admin', 'superadmin', 'owner')
  ) THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  UPDATE expert_applications
     SET probation_completed = true, updated_at = now()
   WHERE id = p_application_id AND status = 'approved';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_probation_complete(uuid, uuid) TO service_role;
