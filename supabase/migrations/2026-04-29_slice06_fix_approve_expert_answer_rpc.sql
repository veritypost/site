-- Fix approve_expert_answer: notification URL used `/story/<article_id>` (no slug
-- lookup, wrong prefix). Now resolves via stories join to get the canonical `/<slug>`.

CREATE OR REPLACE FUNCTION public.approve_expert_answer(
  p_editor_id  uuid,
  p_comment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question_id      uuid;
  v_asker_id         uuid;
  v_article_id       uuid;
  v_question_excerpt text;
  v_story_slug       text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_editor_id
       AND r.name IN ('editor', 'admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'not authorised to approve';
  END IF;

  UPDATE comments
     SET status       = 'visible',
         moderated_by = p_editor_id,
         moderated_at = now(),
         updated_at   = now()
   WHERE id = p_comment_id
     AND status = 'pending_review'
     AND is_expert_reply = true;

  UPDATE comments
     SET expert_question_status = 'answered', updated_at = now()
   WHERE id = (SELECT parent_id FROM comments WHERE id = p_comment_id)
     AND is_expert_question = true
   RETURNING id, user_id, article_id, left(coalesce(body, ''), 80)
        INTO v_question_id, v_asker_id, v_article_id, v_question_excerpt;

  -- Resolve canonical story slug for the notification URL.
  IF v_article_id IS NOT NULL THEN
    SELECT s.slug INTO v_story_slug
      FROM articles a
      LEFT JOIN stories s ON s.id = a.story_id
      WHERE a.id = v_article_id;
  END IF;

  IF v_asker_id IS NOT NULL THEN
    PERFORM create_notification(
      v_asker_id,
      'expert_answered',
      'Your question was answered',
      coalesce(v_question_excerpt, 'An expert replied to your question.'),
      '/' || coalesce(v_story_slug, v_article_id::text, '') || '#comment-' || p_comment_id::text,
      'comment',
      p_comment_id,
      'normal',
      jsonb_build_object(
        'question_comment_id', v_question_id,
        'answer_comment_id',   p_comment_id,
        'article_id',          v_article_id
      )
    );
  END IF;
END;
$$;
