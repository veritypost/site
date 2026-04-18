-- ============================================================
-- Phase 5 — Discussion & comments
-- Decisions: D6 (invisible until pass), D7 (score next to name for paid),
-- D8 (no bypass), D15/D16 (organic context pinning), D21 (@mentions paid-only),
-- D29 (upvote/downvote separate counts), D39 (report/block all verified).
-- ============================================================

-- ------------------------------------------------------------
-- can_user_see_discussion(user, article) -> bool
-- The single gate used by comment endpoints. Wraps
-- user_passed_article_quiz so the API has one place to check.
-- D6/D8: every role must have a passing attempt, no bypass.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_user_see_discussion(
  p_user_id uuid,
  p_article_id uuid
) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_passed_article_quiz(p_user_id, p_article_id);
$$;

GRANT EXECUTE ON FUNCTION public.can_user_see_discussion(uuid, uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- Default settings rows for D15/D16 autopin.
-- Admins can edit values via the settings admin later.
-- ------------------------------------------------------------
INSERT INTO settings (key, value, value_type, category, display_name, description, is_public)
VALUES
  ('context_pin_min_count', '5', 'integer', 'moderation',
   'Context pin — minimum tag count',
   'Floor of Article Context tags a comment needs before autopin is possible (D16).',
   false),
  ('context_pin_percent', '10', 'integer', 'moderation',
   'Context pin — participant percentage',
   'Percent of discussion participants who must tag a comment for autopin (D16). Uses max(min_count, ceil(participants * pct / 100)).',
   false),
  ('comment_max_depth', '2', 'integer', 'moderation',
   'Comment thread max depth',
   'How deep nested replies can go. Root is depth 0.',
   false),
  ('comment_max_length', '4000', 'integer', 'moderation',
   'Comment max length (chars)', 'Hard cap on comment body length.', false)
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------
-- _setting_int(key, default) -> int
-- Tiny helper: read an int setting, fall back to default.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._setting_int(p_key text, p_default int)
RETURNS int
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE((SELECT value::int FROM settings WHERE key = p_key), p_default);
$$;


-- ------------------------------------------------------------
-- post_comment — create a new comment or threaded reply.
-- D6/D8: must have passed the article quiz.
-- D21: @mentions allowed only for paid tiers. Stored as jsonb
-- array of {user_id, username}. Free users silently have mentions
-- dropped (client also hides the affordance).
-- Parent wiring: root_id = parent's root_id (or parent.id),
-- thread_depth = parent.thread_depth + 1.
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
-- toggle_vote — atomic upvote/downvote toggle for a comment.
-- D29: counts tracked separately, both displayed. No net score.
-- Rules: same vote type twice = clear. Different type = switch.
-- Voter must have passed the article quiz (same gate as reading
-- the discussion — D6/D8).
-- p_vote_type: 'upvote' | 'downvote' | 'clear'
-- Returns: {up, down, your_vote}
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_vote(
  p_user_id uuid,
  p_comment_id uuid,
  p_vote_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment comments%ROWTYPE;
  v_existing comment_votes%ROWTYPE;
  v_final text;
  v_up int;
  v_down int;
BEGIN
  IF p_vote_type NOT IN ('upvote', 'downvote', 'clear') THEN
    RAISE EXCEPTION 'vote_type must be upvote/downvote/clear';
  END IF;

  SELECT * INTO v_comment FROM comments WHERE id = p_comment_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found'; END IF;

  IF NOT user_passed_article_quiz(p_user_id, v_comment.article_id) THEN
    RAISE EXCEPTION 'quiz not passed — cannot vote';
  END IF;

  SELECT * INTO v_existing FROM comment_votes
    WHERE comment_id = p_comment_id AND user_id = p_user_id FOR UPDATE;

  IF FOUND THEN
    IF p_vote_type = 'clear' OR v_existing.vote_type = p_vote_type THEN
      DELETE FROM comment_votes WHERE id = v_existing.id;
      v_final := NULL;
    ELSE
      UPDATE comment_votes SET vote_type = p_vote_type WHERE id = v_existing.id;
      v_final := p_vote_type;
    END IF;
  ELSIF p_vote_type <> 'clear' THEN
    INSERT INTO comment_votes (comment_id, user_id, vote_type)
    VALUES (p_comment_id, p_user_id, p_vote_type);
    v_final := p_vote_type;
  ELSE
    v_final := NULL;
  END IF;

  -- Recount from source of truth.
  SELECT
    COUNT(*) FILTER (WHERE vote_type = 'upvote'),
    COUNT(*) FILTER (WHERE vote_type = 'downvote')
    INTO v_up, v_down
    FROM comment_votes WHERE comment_id = p_comment_id;

  UPDATE comments
     SET upvote_count = v_up,
         downvote_count = v_down,
         updated_at = now()
   WHERE id = p_comment_id;

  RETURN jsonb_build_object('up', v_up, 'down', v_down, 'your_vote', v_final);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_vote(uuid, uuid, text) TO service_role;


-- ------------------------------------------------------------
-- toggle_context_tag — D15/D16 organic autopin.
-- Any user who passed the article quiz can tag (D16).
-- Autopin fires when tag_count >= max(min_count, ceil(participants * pct / 100)).
-- "Participants" = distinct users who have posted at least one visible
-- comment on the article.
-- Once pinned, stays pinned (community can work this out later).
-- Returns: {tagged, count, auto_pinned}
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_context_tag(
  p_user_id uuid,
  p_comment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment comments%ROWTYPE;
  v_tag_id uuid;
  v_tagged boolean;
  v_count int;
  v_participants int;
  v_min_count int := _setting_int('context_pin_min_count', 5);
  v_pct int := _setting_int('context_pin_percent', 10);
  v_threshold int;
  v_auto_pinned boolean := false;
BEGIN
  SELECT * INTO v_comment FROM comments WHERE id = p_comment_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found'; END IF;

  IF NOT user_passed_article_quiz(p_user_id, v_comment.article_id) THEN
    RAISE EXCEPTION 'quiz not passed — cannot tag';
  END IF;

  SELECT id INTO v_tag_id FROM comment_context_tags
    WHERE comment_id = p_comment_id AND user_id = p_user_id;

  IF v_tag_id IS NOT NULL THEN
    DELETE FROM comment_context_tags WHERE id = v_tag_id;
    v_tagged := false;
  ELSE
    INSERT INTO comment_context_tags (comment_id, user_id, tag_type)
    VALUES (p_comment_id, p_user_id, 'article_context');
    v_tagged := true;
  END IF;

  SELECT COUNT(*) INTO v_count FROM comment_context_tags WHERE comment_id = p_comment_id;

  SELECT COUNT(DISTINCT user_id) INTO v_participants
    FROM comments
   WHERE article_id = v_comment.article_id
     AND status = 'visible'
     AND deleted_at IS NULL;

  v_threshold := GREATEST(v_min_count, CEIL((v_participants::numeric * v_pct) / 100)::int);

  UPDATE comments
     SET context_tag_count = v_count,
         updated_at = now()
   WHERE id = p_comment_id;

  IF v_count >= v_threshold AND NOT v_comment.is_context_pinned THEN
    UPDATE comments
       SET is_context_pinned = true,
           context_pinned_at = now()
     WHERE id = p_comment_id;
    v_auto_pinned := true;
  END IF;

  RETURN jsonb_build_object(
    'tagged', v_tagged,
    'count', v_count,
    'threshold', v_threshold,
    'participants', v_participants,
    'auto_pinned', v_auto_pinned,
    'is_pinned', v_comment.is_context_pinned OR v_auto_pinned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_context_tag(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- soft_delete_comment — user-initiated delete.
-- Owner only (API route also checks, belt + braces).
-- Preserves thread integrity by setting body='[deleted]' and
-- status='deleted'; deleted_at marks the row.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_comment(
  p_user_id uuid,
  p_comment_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment comments%ROWTYPE;
BEGIN
  SELECT * INTO v_comment FROM comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found'; END IF;
  IF v_comment.user_id <> p_user_id THEN
    RAISE EXCEPTION 'not your comment';
  END IF;
  UPDATE comments
     SET body = '[deleted]',
         body_html = NULL,
         mentions = '[]'::jsonb,
         status = 'deleted',
         deleted_at = now(),
         updated_at = now()
   WHERE id = p_comment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_comment(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- edit_comment — owner edits their own comment body.
-- Sets is_edited flag + edit_count for transparency.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_comment(
  p_user_id uuid,
  p_comment_id uuid,
  p_body text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment comments%ROWTYPE;
  v_body text;
  v_max_len int := _setting_int('comment_max_length', 4000);
BEGIN
  SELECT * INTO v_comment FROM comments WHERE id = p_comment_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found'; END IF;
  IF v_comment.user_id <> p_user_id THEN
    RAISE EXCEPTION 'not your comment';
  END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'body empty'; END IF;
  IF length(v_body) > v_max_len THEN RAISE EXCEPTION 'too long'; END IF;

  UPDATE comments
     SET body = v_body,
         is_edited = true,
         edited_at = now(),
         edit_count = edit_count + 1,
         updated_at = now()
   WHERE id = p_comment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_comment(uuid, uuid, text) TO service_role;
