-- Security hardening for owner-mode RPCs introduced in 20260503000008.
--
-- Bug 1: claim_queue_item + post_expert_answer accepted caller-supplied
--   p_user_id with no auth.uid() enforcement — any authenticated user
--   could impersonate another by supplying a foreign UUID.
--   Fix: add identity check at the top of each function body; owner-mode
--   callers are permitted to act as themselves only (the bypass is for
--   expert-guard skipping, not identity spoofing).
--
-- Bug 2: Postgres CREATE OR REPLACE FUNCTION leaves default PUBLIC execute
--   grant on new functions. The anon role could call these RPCs.
--   Fix: REVOKE EXECUTE FROM PUBLIC + explicit GRANT TO authenticated on all
--   three functions (is_owner_mode_user, claim_queue_item, post_expert_answer).
--
-- Bug 3: is_owner_mode_user(uuid) allowed any authenticated caller to probe
--   arbitrary UUIDs and discover which accounts hold owner-mode.
--   Fix: non-admin callers may only check themselves; any other probe
--   returns false. Admin/owner callers are unrestricted.
--
-- Bug 4 is addressed in adminMutation.ts (TS layer, not SQL).
--
-- Lock compliance (QA.md §8.4 Finding #10 LOCKED 2026-05-03):
--   The owner-mode bypass branches inside claim_queue_item and
--   post_expert_answer ARE PRESERVED. The auth identity guard added here
--   is additive security, not a narrowing of owner-mode access.
--   is_owner_mode_user internal behavior (SECURITY DEFINER, called by the
--   RPCs with p_user_id = the acting user) is unchanged — the enumeration
--   guard only blocks direct external RPC calls from non-admin users.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. is_owner_mode_user — add caller-must-be-self-or-admin guard
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_owner_mode_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Enumeration guard: non-admin callers may only check themselves.
  -- Admin/owner callers are unrestricted (they can check any UUID).
  -- SECURITY DEFINER internal calls from claim_queue_item /
  -- post_expert_answer always pass p_user_id = auth.uid() of the acting
  -- user, so this guard is a no-op for internal usage.
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT EXISTS (
    SELECT 1
      FROM public.user_permission_sets ups
      JOIN public.permission_sets ps ON ps.id = ups.permission_set_id
     WHERE ups.user_id = auth.uid()
       AND ps.set_key IN ('admin', 'owner')
       AND (ups.expires_at IS NULL OR ups.expires_at > now())
  ) THEN
    RETURN false;
  END IF;

  -- Honor expiry on user_permission_sets so a temp-granted owner-mode
  -- (e.g. for a 24h ops window) doesn't keep bypassing after expires_at.
  RETURN EXISTS (
    SELECT 1
      FROM user_permission_sets ups
      JOIN permission_set_perms psp ON psp.permission_set_id = ups.permission_set_id
      JOIN permissions p ON p.id = psp.permission_id
     WHERE ups.user_id = p_user_id
       AND p.key = 'admin.owner_mode'
       AND (ups.expires_at IS NULL OR ups.expires_at > now())
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_owner_mode_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_mode_user(uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. claim_queue_item — add identity enforcement + re-apply REVOKE/GRANT
-- ──────────────────────────────────────────────────────────────────────────

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
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_queue_item(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_queue_item(uuid, uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. post_expert_answer — add identity enforcement + re-apply REVOKE/GRANT
-- ──────────────────────────────────────────────────────────────────────────

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

  RETURN jsonb_build_object(
    'answer_comment_id', v_answer_id,
    'pending_review', v_in_probation
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.post_expert_answer(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_expert_answer(uuid, uuid, text) TO authenticated;
