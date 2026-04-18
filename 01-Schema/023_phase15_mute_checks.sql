-- ============================================================
-- Phase 15.1 — Mute enforcement on comments + DMs
--
-- Fixes the CRITICAL flag from Phase 8: post_comment never checked
-- is_muted / muted_until / mute_level, and messages_insert RLS did
-- not either. Muted users could keep posting through both paths.
--
-- Mute semantics (set by apply_penalty in Phase 8):
--   mute_level = 0          no mute
--   mute_level = 1          24h comment-only mute
--   mute_level = 2          7-day full mute (comments + DMs)
--   is_banned = true        terminal, blocks everything
--   is_muted + muted_until  active flags; expired if muted_until < now()
--
-- Two helpers, two enforcement points:
--   _user_is_comment_blocked -> true if banned OR any active mute
--   _user_is_dm_blocked      -> true if banned OR active mute_level>=2
-- ============================================================

CREATE OR REPLACE FUNCTION public._user_is_comment_blocked(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
     WHERE id = p_user_id
       AND (
         is_banned = true
         OR (
           is_muted = true
           AND mute_level >= 1
           AND (muted_until IS NULL OR muted_until > now())
         )
       )
  );
$$;
GRANT EXECUTE ON FUNCTION public._user_is_comment_blocked(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public._user_is_dm_blocked(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
     WHERE id = p_user_id
       AND (
         is_banned = true
         OR (
           is_muted = true
           AND mute_level >= 2
           AND (muted_until IS NULL OR muted_until > now())
         )
       )
  );
$$;
GRANT EXECUTE ON FUNCTION public._user_is_dm_blocked(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- post_comment: re-declared with mute check inserted right
-- after the email-verified guard. All other behaviour is
-- identical to the Phase 5 version.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_comment(
  p_user_id uuid,
  p_article_id uuid,
  p_body text,
  p_parent_id uuid DEFAULT NULL,
  p_mentions jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_tier text;
  v_is_paid boolean;
  v_body text;
  v_max_len int := _setting_int('comment_max_length', 4000);
  v_max_depth int := _setting_int('comment_max_depth', 3);
  v_parent comments%ROWTYPE;
  v_root_id uuid;
  v_depth int := 0;
  v_mentions jsonb := '[]'::jsonb;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF NOT v_user.email_verified THEN
    RAISE EXCEPTION 'email must be verified to comment';
  END IF;

  -- Phase 15.1: mute / ban gate.
  IF _user_is_comment_blocked(p_user_id) THEN
    RAISE EXCEPTION 'account is muted or banned — cannot post comments';
  END IF;

  -- D6/D8: quiz-gate check.
  IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
    RAISE EXCEPTION 'quiz not passed — discussion is locked';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'comment body is empty'; END IF;
  IF length(v_body) > v_max_len THEN
    RAISE EXCEPTION 'comment exceeds max length (% chars)', v_max_len;
  END IF;

  -- D21: strip mentions for free tier.
  SELECT p.tier INTO v_tier FROM plans p WHERE p.id = v_user.plan_id;
  v_is_paid := v_tier IN ('verity','verity_pro','verity_family','verity_family_xl');
  IF v_is_paid AND jsonb_typeof(p_mentions) = 'array' THEN
    v_mentions := p_mentions;
  END IF;

  -- Thread wiring.
  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM comments
      WHERE id = p_parent_id AND article_id = p_article_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'parent comment not found on this article'; END IF;
    v_root_id := COALESCE(v_parent.root_id, v_parent.id);
    v_depth := v_parent.thread_depth + 1;
    IF v_depth > v_max_depth THEN
      RAISE EXCEPTION 'max reply depth reached (%)', v_max_depth;
    END IF;
  END IF;

  INSERT INTO comments
    (article_id, user_id, parent_id, root_id, thread_depth, body,
     mentions, status)
  VALUES
    (p_article_id, p_user_id, p_parent_id, v_root_id, v_depth, v_body,
     v_mentions, 'visible')
  RETURNING id INTO v_new_id;

  IF p_parent_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count + 1, updated_at = now()
     WHERE id = p_parent_id;
  END IF;

  UPDATE users SET comment_count = comment_count + 1, updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('id', v_new_id, 'root_id', v_root_id, 'depth', v_depth);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_comment(uuid, uuid, text, uuid, jsonb) TO service_role;


-- ------------------------------------------------------------
-- messages INSERT policy: add DM mute/ban gate.
-- Drops and recreates the existing policy (Phase 3 version).
-- Frozen/grace DM revoke stays handled by user_has_dm_access at
-- the API/UI layer; this policy is the hard floor for muted users.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "messages_insert" ON "messages";
CREATE POLICY "messages_insert" ON "messages" FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
  AND NOT public._user_is_dm_blocked(auth.uid())
);
