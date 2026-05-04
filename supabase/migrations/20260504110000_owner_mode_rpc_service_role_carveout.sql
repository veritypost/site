-- Service-role carve-out for owner-mode expert RPCs.
--
-- PROD BREAK FIXED HERE:
--   The auth identity guard added in 20260503200000 evaluates
--   `auth.uid()` inside SECURITY DEFINER functions. When the API routes
--   `web/src/app/api/expert/queue/[id]/claim/route.js` and
--   `web/src/app/api/expert/queue/[id]/answer/route.js` invoke these RPCs
--   via `createServiceClient` (the service-role client), `auth.uid()`
--   returns NULL inside the function. The guard then evaluates:
--     p_user_id IS DISTINCT FROM NULL          -> TRUE
--     AND NOT is_owner_mode_user(NULL)         -> TRUE  (NULL has no perms)
--   so the guard raises 42501 'unauthorized' for EVERY call. Result:
--   experts cannot claim queue items, owner cannot use the backstage
--   pass on queue items.
--
-- FIX:
--   Add a service-role bypass to the identity guard. When the JWT role
--   claim is 'service_role', the API layer is trusted to have already
--   enforced auth + permission via `requirePermission(...)`. This mirrors
--   the pattern used in 5+ other migrations across this repo:
--     - 2026-04-28_auth_sync_guc_bypass.sql:53
--     - 2026-04-29_auth_redesign_consolidated.sql:367 / :488
--     - 2026-05-01_protect_users_username.sql:30
--     - 2026-04-29_session3_invite_cap.sql:32
--     - 2026-04-29_session4_i_apply_signup_cohort_comped_until.sql:30
--
-- Idiom used:
--   current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
--   `IS DISTINCT FROM` so a missing/NULL role claim is treated as
--   "not service_role" -> the guard still fires (fail-closed, not -open).
--
-- THREAT MODEL:
--   "An attacker with service-role keys could now bypass the identity
--   guard and impersonate any expert." True, but anyone with service-role
--   keys already has unrestricted DB write access (e.g. UPDATE
--   expert_queue_items SET claimed_by = ... directly). The SECURITY
--   DEFINER identity guard offers ZERO additional protection against a
--   compromised service-role key. Same posture as the 5 functions cited
--   above. The guard's purpose is to block direct authenticated-user-JWT
--   misuse via PostgREST; that path remains fully blocked.
--
-- PRESERVED VERBATIM FROM 20260504100000_owner_mode_rpc_audit_writes.sql:
--   * Owner-mode bypass branch (the QA.md §8.4 Finding #10 LOCKED logic).
--   * admin_audit_log INSERT inside the bypass branch.
--   * REVOKE EXECUTE FROM PUBLIC + GRANT EXECUTE TO authenticated.
--   * is_user_expert / is_owner_mode_user / is_expert_in_probation calls.
--   * All target_type / probation / status logic.
--
-- PRESERVED VERBATIM FROM 20260503200000_owner_mode_rpc_security_fixes.sql:
--   * Auth identity guard (now extended with the service-role carve-out).
--   * The is_owner_mode_user enumeration guard (function untouched here).
--
-- LOCK COMPLIANCE (QA.md §8.4 Finding #10 LOCKED 2026-05-03):
--   Owner-mode backstage pass logic for /profile and the expert queue
--   bypass branch are unchanged. This migration only widens the auth
--   identity guard to permit calls from the trusted service-role API
--   layer, which is the pattern already used for these RPCs end-to-end.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. claim_queue_item — preserve _100000 body, widen identity guard
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
  -- Identity enforcement: caller may only act as themselves, UNLESS the
  -- caller is the trusted service-role API layer (which has already run
  -- requirePermission(...) at the route layer) or is in owner-mode (the
  -- bypass is for expert-guard skipping, not impersonation, but
  -- owner-mode holders are permitted to act through the audit branch).
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND NOT public.is_owner_mode_user(auth.uid())
  THEN
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
-- 2. post_expert_answer — preserve _100000 body, widen identity guard
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
  -- Identity enforcement: same widened guard as claim_queue_item.
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND NOT public.is_owner_mode_user(auth.uid())
  THEN
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
