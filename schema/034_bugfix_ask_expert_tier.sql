-- 034_bugfix_ask_expert_tier.sql
-- Fix: Ask an Expert was gated to verity_pro+ but Design Decision D20 says
-- all paid tiers (Verity, Verity Pro, Verity Family, Verity Family XL) can
-- @ experts and read full expert responses. Free users see the blurred
-- "expert answered" indicator only. This migration widens the RPC's
-- tier check to include 'verity'. The UI gate was fixed in the same pass.

CREATE OR REPLACE FUNCTION public.ask_expert(
  p_user_id uuid,
  p_article_id uuid,
  p_body text,
  p_target_type text,
  p_target_id uuid
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
  IF v_tier NOT IN ('verity', 'verity_pro', 'verity_family', 'verity_family_xl') THEN
    RAISE EXCEPTION 'Ask an Expert requires a paid plan';
  END IF;

  IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
    RAISE EXCEPTION 'quiz not passed';
  END IF;

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
