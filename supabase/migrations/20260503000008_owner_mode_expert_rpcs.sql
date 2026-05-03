-- QA Finding #10 (admin/owner backstage pass for /profile) — Step 3 caught
-- that the SECURITY DEFINER RPCs `claim_queue_item` and `post_expert_answer`
-- hard-code `is_user_expert(p_user_id)` which only matches roles
-- (expert | educator | journalist). Owner-mode users (role `owner` +
-- `admin.owner_mode` permission) clicking Claim/Answer in the now-unlocked
-- /profile Expert queue UI would hit "only experts can claim queue items" /
-- "only experts can answer" — UI looks broken.
--
-- Owner override (LOCKED 2026-05-03 in QA.md §8.4 / Finding #10):
-- "owner mode can do it all" — full edit access on every /profile section
-- including Expert queue claim/answer/back-channel.
--
-- This migration:
--   1. Adds `is_owner_mode_user(p_user_id)` helper — true when the user
--      holds the `admin.owner_mode` permission (via any granted permission
--      set, the same way the web `permissions.js:179` short-circuit works).
--   2. Replaces `claim_queue_item` with a version that allows owner-mode
--      users through every expert-specific guard (is_user_expert,
--      target-expert mismatch, target-category not verified). Status /
--      not-found checks are preserved.
--   3. Replaces `post_expert_answer` with a version that allows owner-mode
--      users through `is_user_expert`. The "must claim before answer"
--      guard is preserved — owner must claim first, same as an expert.
--      Probation logic still applies if the owner is somehow flagged in
--      `is_expert_in_probation` (will be false for typical owners; safe
--      no-op).
--
-- Reads (RLS `expert_queue_items_select`) already allow `is_admin_or_above()`
-- so owner reads succeed without further changes. Back-channel writes
-- (`expert_can_see_back_channel`) already include `owner` in the role set.

CREATE OR REPLACE FUNCTION public.is_owner_mode_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Honor expiry on user_permission_sets so a temp-granted owner-mode
  -- (e.g. for a 24h ops window) doesn't keep bypassing after expires_at.
  -- Mirrors the pattern used elsewhere on user_permission_sets reads.
  SELECT EXISTS (
    SELECT 1
      FROM user_permission_sets ups
      JOIN permission_set_perms psp ON psp.permission_set_id = ups.permission_set_id
      JOIN permissions p ON p.id = psp.permission_id
     WHERE ups.user_id = p_user_id
       AND p.key = 'admin.owner_mode'
       AND (ups.expires_at IS NULL OR ups.expires_at > now())
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_owner_mode_user(uuid) TO authenticated;

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
END;
$function$;

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

  RETURN jsonb_build_object(
    'answer_comment_id', v_answer_id,
    'pending_review', v_in_probation
  );
END;
$function$;
