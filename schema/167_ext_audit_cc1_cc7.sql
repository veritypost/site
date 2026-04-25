-- 167_ext_audit_cc1_cc7.sql
-- External-audit Bucket-5 fixes for the social/expert-loop RPCs.
--
-- Ext-CC.1 — toggle_follow doesn't consult blocked_users.
--   If user A blocks user B, user B should not be able to follow user A.
--   The audit flagged the absence of this check; current behavior lets B
--   follow A despite the block, only the visibility surfaces enforce the
--   block. Tighten the RPC.
--
-- Ext-CC.7 — approve_expert_answer doesn't notify the asker. The asker
--   gets no signal that their question was answered + approved. Real
--   core-loop break (the whole point of the expert flow is the asker
--   coming back to read the answer). Wire create_notification.

-- ============================================================================
-- CC.1 — block-aware toggle_follow
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_follow(
  p_follower_id uuid,
  p_target_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_now_following boolean;
BEGIN
  IF p_follower_id = p_target_id THEN
    RAISE EXCEPTION 'cannot follow yourself';
  END IF;
  IF NOT _user_is_paid(p_follower_id) THEN
    RAISE EXCEPTION 'following requires Verity or higher (D28)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'target user not found';
  END IF;

  -- Ext-CC1 — block-aware: refuse if either side has blocked the other.
  -- Both directions, because a block by either party should sever the
  -- relationship in BOTH directions per the social-graph semantic the
  -- product expects.
  IF EXISTS (
    SELECT 1 FROM blocked_users
     WHERE (blocker_id = p_target_id AND blocked_id = p_follower_id)
        OR (blocker_id = p_follower_id AND blocked_id = p_target_id)
  ) THEN
    RAISE EXCEPTION 'cannot follow a user with whom you have a block relationship'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing FROM follows
   WHERE follower_id = p_follower_id AND following_id = p_target_id;

  IF v_existing IS NOT NULL THEN
    DELETE FROM follows WHERE id = v_existing;
    v_now_following := false;
    UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = p_follower_id;
    UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = p_target_id;
  ELSE
    INSERT INTO follows (follower_id, following_id) VALUES (p_follower_id, p_target_id);
    v_now_following := true;
    UPDATE users SET following_count = following_count + 1 WHERE id = p_follower_id;
    UPDATE users SET followers_count = followers_count + 1 WHERE id = p_target_id;
  END IF;

  RETURN jsonb_build_object(
    'following', v_now_following,
    'target_id', p_target_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_follow(uuid, uuid) TO service_role;

-- ============================================================================
-- CC.7 — approve_expert_answer notifies the asker
-- ============================================================================

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

-- ============================================================================
-- Ext-E2 — DB-tunable kid PIN lockout
-- ============================================================================
-- Seeds the settings rows /api/kids/verify-pin reads. Hardcoded constants
-- in the route are now fallbacks; DB values win when present.

INSERT INTO public.settings (key, value, value_type, category, description)
VALUES
  ('kids.pin.max_attempts', '3', 'number', 'kids',
   'Wrong-PIN attempts before per-kid lockout window kicks in'),
  ('kids.pin.lockout_seconds', '60', 'number', 'kids',
   'Lockout duration (seconds) once max_attempts is reached')
ON CONFLICT (key) DO NOTHING;

