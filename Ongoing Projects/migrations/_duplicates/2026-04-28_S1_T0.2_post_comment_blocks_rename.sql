-- =====================================================================
-- 2026-04-28_S1_T0.2_post_comment_blocks_rename.sql
-- S1-T0.2 — post_comment RPC: rename `blocks` → `blocked_users`
-- Source: Ongoing Projects/Sessions/Session_01_DB_Migrations.md (S1-T0.2)
-- Severity: P0 production-broken
-- =====================================================================
-- Verified state (2026-04-28 via pg_proc.prosrc + pg_get_functiondef):
--   public.post_comment(p_user_id uuid, p_article_id uuid, p_body text,
--                       p_parent_id uuid, p_mentions jsonb)
--   contains TWO references to the relation `blocks`:
--     (1) reply-notification branch — parent-author block-check
--     (2) mention-notification loop — mentioned-user block-check
--   Live `public.blocked_users` columns: id, blocker_id, blocked_id,
--   reason, created_at. Postgres throws 42P01 today; threaded replies
--   and paid-tier mention notifications fail silently inside the RPC's
--   transaction → the entire post_comment rolls back.
--
-- Fix: replace the two `FROM blocks b` references with `FROM blocked_users b`.
-- All other body logic preserved verbatim, including the T26 notification
-- structure, mentions iteration, and SECURITY DEFINER + search_path.
--
-- Rollback:
--   Replace `blocked_users` with `blocks` in the body (reintroduces bug).
-- =====================================================================

BEGIN;

-- Pre-flight: confirm function exists and currently still references `blocks`.
DO $$
DECLARE
  v_body text;
BEGIN
  SELECT prosrc INTO v_body
    FROM pg_proc
   WHERE proname = 'post_comment'
     AND pronamespace = 'public'::regnamespace;
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'post_comment RPC missing — abort';
  END IF;
  IF v_body !~ '\mblocks\M' THEN
    RAISE NOTICE 'post_comment already references blocked_users; this migration is a no-op';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.post_comment(
  p_user_id uuid,
  p_article_id uuid,
  p_body text,
  p_parent_id uuid DEFAULT NULL::uuid,
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
      SELECT 1 FROM blocked_users b
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

-- Post-verification: confirm body no longer references the bare relation `blocks`.
DO $$
DECLARE v_body text;
BEGIN
  SELECT prosrc INTO v_body
    FROM pg_proc WHERE proname='post_comment' AND pronamespace='public'::regnamespace;
  IF v_body ~ '\mFROM\s+blocks\M' THEN
    RAISE EXCEPTION 'post_comment still references blocks — abort';
  END IF;
  RAISE NOTICE 'S1-T0.2 applied: post_comment now references blocked_users';
END $$;

COMMIT;
