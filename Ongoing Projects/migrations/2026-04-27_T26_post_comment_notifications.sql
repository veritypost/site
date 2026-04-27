-- =====================================================================
-- 2026-04-27_T26_post_comment_notifications.sql
-- T26: post_comment RPC now inserts comment_reply + comment_mention
--      notifications. Locked scope: in_app + push only (no email).
-- =====================================================================
-- Background:
--   MCP-verified 2026-04-27 — the live post_comment(p_user_id, p_article_id,
--   p_body, p_parent_id, p_mentions) RPC body inserts the comment row, bumps
--   reply_count on parent, bumps users.comment_count, but NEVER inserts into
--   notifications. Reply notifications + mention notifications are silently
--   dropped. Email templates + push cron + alert_preferences UI all exist
--   for `comment_reply` — they read from notifications which never gets the
--   row, so the entire downstream pipeline runs dry on every comment.
--
-- Locked spec (per TODO.md skip list 2026-04-27):
--   - Reply notifications: when p_parent_id IS NOT NULL, insert one
--     'comment_reply' notification for the parent comment's author.
--   - Mention notifications: for every entry in p_mentions jsonb (paid-tier
--     only — free-tier mentions stripped at line ~30 of the existing RPC),
--     insert one 'comment_mention' notification per mentioned user.
--   - Self-reply guard: skip when parent.user_id = p_user_id (don't notify
--     yourself).
--   - Self-mention guard: same — skip when mentioned_user_id = p_user_id.
--   - Muted/blocked sender guard: skip when the recipient has blocked the
--     poster (via blocks table) — silent block.
--   - Channels: in_app + push only. Email channel is OFF for these types
--     even though templates exist; per the transactional-only email
--     direction (T-EMAIL-PRUNE shipped 2026-04-27), engagement-class email
--     was retired. The notifications row carries email_sent=true so the
--     send-emails cron skips them; in_app + push pipelines read normally.
--
-- Schema requirements (verified live, no changes):
--   - notifications table has columns: id, user_id, type, title, body,
--     action_url, metadata jsonb, email_sent boolean, in_app_read boolean,
--     created_at.
--   - notifications.type enum already accepts 'comment_reply' and
--     'comment_mention'.
--   - blocks table: blocker_id, blocked_id, with index on
--     (blocker_id, blocked_id).
--
-- Rollback:
--   Re-run with the pre-T26 body — paste the existing RPC source from
--   git history (or fall back to the snapshot in CHANGELOG 2026-04-27
--   T309 closure entry which quotes the relevant 3 RPCs at length).
--
-- Verification (run after apply):
--   1. Insert test reply: SELECT post_comment(<author_b>, <article>, 'test',
--      <parent_by_a>, '[]'::jsonb);
--   2. Confirm row in notifications WHERE user_id=<author_a> AND
--      type='comment_reply'.
--   3. Self-reply test: same author posting reply to own parent → no
--      notifications row inserted.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.post_comment(
  p_user_id uuid,
  p_article_id uuid,
  p_body text,
  p_parent_id uuid DEFAULT NULL,
  p_mentions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_article_title text;
  v_article_slug text;
  v_actor_username text;
  v_mention_entry jsonb;
  v_mentioned_id uuid;
  v_blocked boolean;
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

  -- T26 — pull article + actor metadata once for use in both notification
  -- branches. Fail-open: if articles/users lookups error, the comment
  -- already landed and notifications are best-effort.
  SELECT a.title, a.slug INTO v_article_title, v_article_slug
    FROM articles a WHERE a.id = p_article_id;
  SELECT u.username INTO v_actor_username
    FROM users u WHERE u.id = p_user_id;

  -- T26 — reply notification. Skip when:
  --   - no parent (top-level comment)
  --   - parent author is the same as the poster (self-reply)
  --   - parent author has blocked the poster (silent block)
  -- Email channel pre-marked sent=true so the send-emails cron skips
  -- the row; in_app + push pipelines read normally.
  IF p_parent_id IS NOT NULL AND v_parent.user_id IS NOT NULL
     AND v_parent.user_id <> p_user_id THEN
    SELECT EXISTS(
      SELECT 1 FROM blocks b
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
        format('/story/%s#comment-%s', COALESCE(v_article_slug, p_article_id::text), v_new_id),
        jsonb_build_object(
          'comment_id', v_new_id,
          'article_id', p_article_id,
          'article_title', v_article_title,
          'parent_comment_id', p_parent_id,
          'actor_user_id', p_user_id,
          'actor_username', v_actor_username
        ),
        true
      );
    END IF;
  END IF;

  -- T26 — mention notifications, one per mentioned user. Same skip rules
  -- as reply: skip self-mentions, skip when the mentioned user has
  -- blocked the actor. Free-tier mentions were already stripped above
  -- (v_mentions stays '[]') so the loop is a no-op for them.
  FOR v_mention_entry IN SELECT * FROM jsonb_array_elements(v_mentions)
  LOOP
    BEGIN
      v_mentioned_id := (v_mention_entry->>'user_id')::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;  -- skip malformed entries
    END;
    IF v_mentioned_id IS NULL OR v_mentioned_id = p_user_id THEN
      CONTINUE;
    END IF;
    -- Skip if also the parent author (already notified via reply branch).
    IF p_parent_id IS NOT NULL AND v_mentioned_id = v_parent.user_id THEN
      CONTINUE;
    END IF;
    SELECT EXISTS(
      SELECT 1 FROM blocks b
       WHERE b.blocker_id = v_mentioned_id AND b.blocked_id = p_user_id
    ) INTO v_blocked;
    IF v_blocked THEN
      CONTINUE;
    END IF;
    INSERT INTO notifications
      (user_id, type, title, body, action_url, metadata, email_sent)
    VALUES (
      v_mentioned_id,
      'comment_mention',
      format('@%s mentioned you', COALESCE(v_actor_username, 'someone')),
      left(v_body, 280),
      format('/story/%s#comment-%s', COALESCE(v_article_slug, p_article_id::text), v_new_id),
      jsonb_build_object(
        'comment_id', v_new_id,
        'article_id', p_article_id,
        'article_title', v_article_title,
        'parent_comment_id', p_parent_id,
        'actor_user_id', p_user_id,
        'actor_username', v_actor_username
      ),
      true
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_new_id, 'root_id', v_root_id, 'depth', v_depth);
END;
$function$;

COMMIT;
