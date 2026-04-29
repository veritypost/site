-- Slice 06: Fix post_comment RPC after articles.slug removal (slice05).
--
-- Three bugs introduced by the slug→stories migration:
-- 1. `SELECT a.slug FROM articles` fails — slug now lives on stories.
-- 2. comment INSERT omitted story_id (convenience FK, needed for admin queries).
-- 3. Notification action_url used `/story/<slug>` — canonical path is `/<slug>`.

CREATE OR REPLACE FUNCTION public.post_comment(
  p_user_id    uuid,
  p_article_id uuid,
  p_body       text,
  p_parent_id  uuid  DEFAULT NULL,
  p_mentions   jsonb DEFAULT '[]'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user           users%ROWTYPE;
  v_tier           text;
  v_is_paid        boolean;
  v_body           text;
  v_max_len        int   := _setting_int('comment_max_length', 4000);
  v_max_depth      int   := _setting_int('comment_max_depth', 3);
  v_parent         comments%ROWTYPE;
  v_root_id        uuid;
  v_depth          int   := 0;
  v_mentions       jsonb := '[]';
  v_new_id         uuid;
  v_story_id       uuid;
  v_article_title  text;
  v_story_slug     text;
  v_actor_username text;
  v_mention_entry  jsonb;
  v_mentioned_id   uuid;
  v_blocked        boolean;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke post_comment' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF NOT v_user.email_verified THEN
    RAISE EXCEPTION 'email must be verified to comment';
  END IF;

  IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
    RAISE EXCEPTION 'quiz not passed — discussion is locked';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'comment body is empty'; END IF;
  IF length(v_body) > v_max_len THEN
    RAISE EXCEPTION 'comment exceeds max length (% chars)', v_max_len;
  END IF;

  SELECT p.tier INTO v_tier FROM plans p WHERE p.id = v_user.plan_id;
  v_is_paid := v_tier IN ('verity','verity_pro','verity_family','verity_family_xl');
  IF v_is_paid AND jsonb_typeof(p_mentions) = 'array' THEN
    v_mentions := p_mentions;
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM comments
      WHERE id = p_parent_id AND article_id = p_article_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'parent comment not found on this article'; END IF;
    v_root_id := COALESCE(v_parent.root_id, v_parent.id);
    v_depth   := v_parent.thread_depth + 1;
    IF v_depth > v_max_depth THEN
      RAISE EXCEPTION 'max reply depth reached (%)', v_max_depth;
    END IF;
  END IF;

  -- Resolve story_id and slug (slug now lives on stories, not articles).
  SELECT a.title, s.id, s.slug
    INTO v_article_title, v_story_id, v_story_slug
    FROM articles a
    LEFT JOIN stories s ON s.id = a.story_id
    WHERE a.id = p_article_id;

  SELECT u.username INTO v_actor_username FROM users u WHERE u.id = p_user_id;

  INSERT INTO comments
    (article_id, story_id, user_id, parent_id, root_id, thread_depth, body, mentions, status)
  VALUES
    (p_article_id, v_story_id, p_user_id, p_parent_id, v_root_id, v_depth, v_body, v_mentions, 'visible')
  RETURNING id INTO v_new_id;

  IF p_parent_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count + 1, updated_at = now()
     WHERE id = p_parent_id;
  END IF;

  UPDATE users SET comment_count = comment_count + 1, updated_at = now()
   WHERE id = p_user_id;

  -- Reply notification
  IF p_parent_id IS NOT NULL AND v_parent.user_id IS NOT NULL
     AND v_parent.user_id <> p_user_id THEN
    SELECT EXISTS(
      SELECT 1 FROM blocked_users b
       WHERE b.blocker_id = v_parent.user_id AND b.blocked_id = p_user_id
    ) INTO v_blocked;
    IF NOT v_blocked THEN
      INSERT INTO notifications
        (user_id, type, title, body, action_url, metadata, email_sent)
      VALUES (
        v_parent.user_id,
        'comment_reply',
        format('@%s replied to your comment', COALESCE(v_actor_username, 'someone')),
        left(v_body, 280),
        format('/%s#comment-%s', COALESCE(v_story_slug, p_article_id::text), v_new_id),
        jsonb_build_object(
          'comment_id',        v_new_id,
          'article_id',        p_article_id,
          'article_title',     v_article_title,
          'parent_comment_id', p_parent_id,
          'actor_user_id',     p_user_id,
          'actor_username',    v_actor_username
        ),
        true
      );
    END IF;
  END IF;

  -- Mention notifications
  FOR v_mention_entry IN SELECT * FROM jsonb_array_elements(v_mentions)
  LOOP
    BEGIN
      v_mentioned_id := (v_mention_entry->>'user_id')::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF v_mentioned_id IS NULL OR v_mentioned_id = p_user_id THEN CONTINUE; END IF;
    IF p_parent_id IS NOT NULL AND v_mentioned_id = v_parent.user_id THEN CONTINUE; END IF;
    SELECT EXISTS(
      SELECT 1 FROM blocked_users b
       WHERE b.blocker_id = v_mentioned_id AND b.blocked_id = p_user_id
    ) INTO v_blocked;
    IF v_blocked THEN CONTINUE; END IF;
    INSERT INTO notifications
      (user_id, type, title, body, action_url, metadata, email_sent)
    VALUES (
      v_mentioned_id,
      'comment_mention',
      format('@%s mentioned you', COALESCE(v_actor_username, 'someone')),
      left(v_body, 280),
      format('/%s#comment-%s', COALESCE(v_story_slug, p_article_id::text), v_new_id),
      jsonb_build_object(
        'comment_id',     v_new_id,
        'article_id',     p_article_id,
        'article_title',  v_article_title,
        'actor_user_id',  p_user_id,
        'actor_username', v_actor_username
      ),
      true
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_new_id, 'root_id', v_root_id, 'depth', v_depth);
END;
$$;
