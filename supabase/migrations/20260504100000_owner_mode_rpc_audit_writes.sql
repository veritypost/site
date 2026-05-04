-- Audit-log writes for owner-mode bypass branches in expert queue RPCs.
--
-- Background:
--   `claim_queue_item` and `post_expert_answer` (introduced in
--   20260503000008 and hardened in 20260503200000) bypass the normal
--   expert gates when the caller holds the `admin.owner_mode` permission.
--   Until now those bypass branches wrote NOTHING to admin_audit_log —
--   the API-layer wrapper (`recordAdminAction` in adminMutation.ts) only
--   fires from the API route itself, which is correct for normal expert
--   actions but leaves owner-mode bypass actions silent.
--
-- Fix:
--   When the owner-mode bypass branch fires, write a single row to
--   admin_audit_log with action keys
--     `expert.queue.claim.owner_mode_bypass`
--     `expert.answer.owner_mode_bypass`
--   The row uses p_user_id as actor_user_id (the owner acting), the
--   queue item id as target_id, and a small jsonb new_value payload
--   capturing the queue item context. This complements (does not
--   double-log with) the API layer's recordAdminAction — the API layer
--   is for normal expert flows; this is for the bypass branch only.
--
-- Preserved verbatim from 20260503200000:
--   * Auth identity guard (`p_user_id IS DISTINCT FROM auth.uid() AND
--     NOT public.is_owner_mode_user(auth.uid())` raises 42501).
--   * REVOKE EXECUTE FROM PUBLIC + GRANT EXECUTE TO authenticated on both
--     RPCs.
--   * `is_owner_mode_user` enumeration guard (function untouched here).
--
-- Lock compliance (QA.md §8.4 Finding #10 LOCKED 2026-05-03):
--   The owner-mode bypass logic is unchanged. This migration only ADDS
--   an audit-log INSERT inside the bypass branch and is otherwise a
--   verbatim re-creation of the _200000 function bodies.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. claim_queue_item — preserve _200000 body, add audit INSERT in bypass
-- ──────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.claim_queue_item(uuid, uuid);

CREATE OR REPLACE FUNCTION public.claim_queue_item(p_user_id uuid, p_queue_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item expert_queue_items%ROWTYPE;
  v_is_owner_mode boolean;
BEGIN
  -- Identity enforcement: caller may only act as themselves.
  -- Owner-mode holders are still bound to this (the owner-mode bypass
  -- is for expert-guard skipping, not for impersonation).
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_owner_mode_user(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: caller may only act as themselves'
      USING ERRCODE = '42501';
  END IF;

  v_is_owner_mode := is_owner_mode_user(p_user_id);

  IF NOT (v_is_owner_mode OR is_user_expert(p_user_id)) THEN
    RAISE EXCEPTION 'only experts can claim queue items';
  END IF;

  SELECT * INTO v_item FROM expert_queue_items
    WHERE id = p_queue_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue item not found'; END IF;
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'queue item is % (not pending)', v_item.status;
  END IF;

  IF NOT v_is_owner_mode THEN
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
  END IF;

  UPDATE expert_queue_items
     SET status = 'claimed',
         claimed_by = p_user_id,
         claimed_at = now(),
         updated_at = now()
   WHERE id = p_queue_item_id;

  -- Owner-mode bypass audit. Only fires when the bypass branch is
  -- actually exercised; normal expert claims are audited via the API
  -- layer's recordAdminAction (no double-log). Direct INSERT (not via
  -- record_admin_action RPC) because we are inside SECURITY DEFINER and
  -- auth.uid() may be NULL when the API route uses the service client.
  IF v_is_owner_mode THEN
    INSERT INTO public.admin_audit_log (
      actor_user_id, action, target_table, target_id,
      reason, old_value, new_value
    ) VALUES (
      p_user_id,
      'expert.queue.claim.owner_mode_bypass',
      'expert_queue_items',
      p_queue_item_id,
      NULL,
      NULL,
      jsonb_build_object(
        'queue_item_id', p_queue_item_id,
        'article_id', v_item.article_id,
        'comment_id', v_item.comment_id,
        'target_type', v_item.target_type,
        'target_expert_id', v_item.target_expert_id,
        'target_category_id', v_item.target_category_id,
        'auth_uid', auth.uid()
      )
    );
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_queue_item(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_queue_item(uuid, uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. post_expert_answer — preserve _200000 body, add audit INSERT in bypass
-- ──────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.post_expert_answer(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.post_expert_answer(p_user_id uuid, p_queue_item_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item expert_queue_items%ROWTYPE;
  v_question comments%ROWTYPE;
  v_answer_id uuid;
  v_status text;
  v_in_probation boolean;
  v_body text;
  v_is_owner_mode boolean;
BEGIN
  -- Identity enforcement: caller may only act as themselves.
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_owner_mode_user(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: caller may only act as themselves'
      USING ERRCODE = '42501';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'answer body empty'; END IF;

  v_is_owner_mode := is_owner_mode_user(p_user_id);

  IF NOT (v_is_owner_mode OR is_user_expert(p_user_id)) THEN
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

  -- Owner-mode bypass audit (see claim_queue_item comment for rationale).
  IF v_is_owner_mode THEN
    INSERT INTO public.admin_audit_log (
      actor_user_id, action, target_table, target_id,
      reason, old_value, new_value
    ) VALUES (
      p_user_id,
      'expert.answer.owner_mode_bypass',
      'expert_queue_items',
      p_queue_item_id,
      NULL,
      NULL,
      jsonb_build_object(
        'queue_item_id', p_queue_item_id,
        'article_id', v_item.article_id,
        'comment_id', v_item.comment_id,
        'answer_comment_id', v_answer_id,
        'pending_review', v_in_probation,
        'answer_body_length', length(v_body),
        'auth_uid', auth.uid()
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'answer_comment_id', v_answer_id,
    'pending_review', v_in_probation
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.post_expert_answer(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_expert_answer(uuid, uuid, text) TO authenticated;
