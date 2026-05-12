-- =====================================================================
-- Comment redesign — tags + replies + author self-tag
-- Spec: Workbench/COMMENT_REDESIGN_SPEC.md (2026-05-12, locked)
--
-- Intent (owner-approved, no back-compat shim):
--   * Reader tags collapse to two kinds only: i_agree, helpful.
--   * helpful awards scoring under a renamed action `receive_helpful`
--     (was `receive_context_tag`); i_agree awards nothing.
--   * Drop the entire agree/disagree reaction system + its table.
--   * Drop the cite_needed / off_topic / context tag kinds + their
--     counter columns and quality_score derivation.
--   * Drop auto-pin (is_context_pinned, context_pinned_at, threshold).
--   * Author can attach at most one self-tag at compose time:
--       adds_context | question (irrevocable).
--   * Replies pick one of three reply_types up front:
--       add_to_this | different_take | reply (only when parent_id set).
--
-- Existing data is intentionally wiped — comment_context_tags rows
-- are deleted; comment_agree_disagree is dropped CASCADE. No shim.
--
-- This migration is transactional and re-runnable in dev environments
-- (uses IF EXISTS / CREATE OR REPLACE wherever reasonable).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Drop the comment_agree_disagree system entirely
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.comment_agree_disagree CASCADE;
DROP FUNCTION IF EXISTS public._comment_agree_disagree_trg() CASCADE;

-- ---------------------------------------------------------------------
-- 2. Wipe + retighten comment_context_tags.tag_kind enum
-- ---------------------------------------------------------------------
DELETE FROM public.comment_context_tags;

-- Ensure (comment_id, user_id, tag_kind) is the unique tuple, not (comment_id, user_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.comment_context_tags'::regclass
      AND contype = 'u'
      AND conname <> 'comment_context_tags_comment_id_user_id_tag_kind_key'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.comment_context_tags DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.comment_context_tags'::regclass AND contype = 'u'
      LIMIT 1
    );
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.comment_context_tags'::regclass
      AND contype = 'u'
      AND conname = 'comment_context_tags_comment_id_user_id_tag_kind_key'
  ) THEN
    ALTER TABLE public.comment_context_tags
      ADD CONSTRAINT comment_context_tags_comment_id_user_id_tag_kind_key
      UNIQUE (comment_id, user_id, tag_kind);
  END IF;
END $$;

ALTER TABLE public.comment_context_tags
  DROP CONSTRAINT IF EXISTS comment_context_tags_tag_kind_check;

ALTER TABLE public.comment_context_tags
  ADD CONSTRAINT comment_context_tags_tag_kind_check
  CHECK (tag_kind IN ('i_agree','helpful'));

-- Default value of tag_kind is still 'context' from the historical
-- table definition; reset it so new inserts without an explicit kind
-- don't blow the new CHECK. Owner-side callers always pass a kind,
-- but the column-default fallback should be safe.
ALTER TABLE public.comment_context_tags
  ALTER COLUMN tag_kind DROP DEFAULT;

-- ---------------------------------------------------------------------
-- 3. Drop the auto-pin index (depends on is_context_pinned) before
--    we drop the column underneath it.
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_comments_article_thread_sort;
DROP INDEX IF EXISTS public.idx_comments_is_context_pinned;

-- ---------------------------------------------------------------------
-- 4. comments table: drop retired columns + add new ones
-- ---------------------------------------------------------------------
ALTER TABLE public.comments
  DROP COLUMN IF EXISTS context_tag_count,
  DROP COLUMN IF EXISTS cite_needed_count,
  DROP COLUMN IF EXISTS off_topic_count,
  DROP COLUMN IF EXISTS agree_count,
  DROP COLUMN IF EXISTS disagree_count,
  DROP COLUMN IF EXISTS quality_score,
  DROP COLUMN IF EXISTS is_context_pinned,
  DROP COLUMN IF EXISTS context_pinned_at;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS i_agree_count int NOT NULL DEFAULT 0;

-- Reset stale helpful_count values inherited from pre-redesign state.
-- helpful_count existed but was never surfaced; some rows carry non-zero
-- legacy values that would render as ghost "Helpful N" chips post-deploy.
UPDATE public.comments
   SET helpful_count = 0,
       i_agree_count = 0;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS author_self_tag text NULL;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_author_self_tag_chk;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_author_self_tag_chk
  CHECK (
    author_self_tag IS NULL
    OR (author_self_tag IN ('adds_context','question') AND parent_id IS NULL)
  );

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS reply_type text NULL;

UPDATE public.comments
   SET reply_type = 'reply'
 WHERE parent_id IS NOT NULL
   AND reply_type IS NULL;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_reply_type_chk;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_reply_type_chk
  CHECK (
    (reply_type IS NULL AND parent_id IS NULL)
    OR (reply_type IN ('add_to_this','different_take','reply')
        AND parent_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------
-- 5. Drop both overloads of toggle_context_tag
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.toggle_context_tag(uuid, uuid);
DROP FUNCTION IF EXISTS public.toggle_context_tag(uuid, uuid, text);

-- ---------------------------------------------------------------------
-- 6. Drop _revoke_context_tag_scores, replace with _revoke_helpful_scores
--    Must drop hide_comment + soft_delete_comment first (they reference
--    the old function); recreated below in steps 8 and 9.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._revoke_context_tag_scores(uuid);

CREATE OR REPLACE FUNCTION public._revoke_helpful_scores(p_comment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_count int;
BEGIN
  WITH d AS (
    DELETE FROM score_events
     WHERE action = 'receive_helpful'
       AND source_type = 'comment_tag'
       AND source_id = p_comment_id
    RETURNING user_id, points
  )
  SELECT count(*) INTO v_count FROM d;
  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------
-- 7. toggle_comment_tag (new RPC, replaces toggle_context_tag)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.toggle_comment_tag(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.toggle_comment_tag(
  p_user_id    uuid,
  p_comment_id uuid,
  p_kind       text DEFAULT 'helpful'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_comment     comments%ROWTYPE;
  v_existing_id uuid;
  v_now         timestamptz := now();
  v_tagged      boolean;
  v_count       int;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('i_agree','helpful') THEN
    RAISE EXCEPTION 'invalid_tag_kind' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_comment FROM public.comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_comment.user_id = p_user_id THEN
    RAISE EXCEPTION 'cannot_tag_own_comment' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_existing_id
    FROM public.comment_context_tags
   WHERE comment_id = p_comment_id
     AND user_id    = p_user_id
     AND tag_kind   = p_kind;

  IF v_existing_id IS NULL THEN
    -- Race-safe: parallel double-tap on the same (comment, user, kind) would
    -- otherwise raise 23505 against the (comment_id, user_id, tag_kind) UNIQUE.
    -- ON CONFLICT DO NOTHING leaves the existing row in place; v_tagged=TRUE
    -- is still the correct post-state from the caller's perspective.
    INSERT INTO public.comment_context_tags
      (comment_id, user_id, tag_kind, created_at)
    VALUES (p_comment_id, p_user_id, p_kind, v_now)
    ON CONFLICT (comment_id, user_id, tag_kind) DO NOTHING;
    v_tagged := TRUE;
  ELSE
    DELETE FROM public.comment_context_tags WHERE id = v_existing_id;
    v_tagged := FALSE;
  END IF;

  -- Read back the post-trigger counter the trigger maintains.
  IF p_kind = 'helpful' THEN
    SELECT helpful_count INTO v_count FROM public.comments WHERE id = p_comment_id;
  ELSE
    SELECT i_agree_count INTO v_count FROM public.comments WHERE id = p_comment_id;
  END IF;

  RETURN jsonb_build_object(
    'tagged', v_tagged,
    'count',  COALESCE(v_count, 0),
    'kind',   p_kind
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 8. Rewrite _comment_tag_counts_trg for the two-kind world
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._comment_tag_counts_trg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_comment_id uuid;
  v_kind       text;
  v_delta      int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_comment_id := NEW.comment_id;
    v_kind       := NEW.tag_kind;
    v_delta      := 1;
  ELSIF TG_OP = 'DELETE' THEN
    v_comment_id := OLD.comment_id;
    v_kind       := OLD.tag_kind;
    v_delta      := -1;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_kind = 'helpful' THEN
    UPDATE public.comments
       SET helpful_count = GREATEST(0, helpful_count + v_delta)
     WHERE id = v_comment_id;
  ELSIF v_kind = 'i_agree' THEN
    UPDATE public.comments
       SET i_agree_count = GREATEST(0, i_agree_count + v_delta)
     WHERE id = v_comment_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- The trigger object `comment_context_tags_tag_counts` still references
-- _comment_tag_counts_trg() by name and remains in place; the function
-- body swap above is sufficient.

-- ---------------------------------------------------------------------
-- 9. hide_comment — swap revoke call only; rest of behavior preserved
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hide_comment(
  p_mod_id     uuid,
  p_comment_id uuid,
  p_reason     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid;
  v_article_id uuid;
  v_story_slug text;
BEGIN
  IF NOT _user_is_moderator(p_mod_id) THEN
    RAISE EXCEPTION 'moderator role required';
  END IF;

  SELECT c.user_id, c.article_id, s.slug
    INTO v_user_id, v_article_id, v_story_slug
    FROM comments c
    LEFT JOIN stories s ON s.id = c.story_id
   WHERE c.id = p_comment_id;

  UPDATE comments
     SET status            = 'hidden',
         moderation_reason = p_reason,
         moderated_by      = p_mod_id,
         moderated_at      = now(),
         updated_at        = now()
   WHERE id = p_comment_id;

  PERFORM public._revoke_helpful_scores(p_comment_id);

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  VALUES (p_mod_id, 'user', 'comment.hide', 'comment', p_comment_id,
          jsonb_build_object('reason', p_reason));

  -- Author notification (unchanged from prior version).
  IF v_user_id IS NOT NULL AND v_user_id <> p_mod_id THEN
    INSERT INTO notifications
      (user_id, type, title, body, action_url, metadata, email_sent)
    VALUES (
      v_user_id,
      'comment_hidden',
      'A comment of yours was hidden by a moderator',
      'Tap to see the comment and the reason.',
      CASE
        WHEN v_story_slug IS NOT NULL
          THEN format('/%s#comment-%s', v_story_slug, p_comment_id)
        ELSE NULL
      END,
      jsonb_build_object(
        'comment_id', p_comment_id,
        'article_id', v_article_id,
        'reason',     COALESCE(p_reason, '')
      ),
      false
    );
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------
-- 10. soft_delete_comment — replace the revoke call with the new fn.
--     No dropped column references in the rest of the body.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_comment(
  p_user_id    uuid,
  p_comment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_comment comments%ROWTYPE;
BEGIN
  SELECT * INTO v_comment FROM comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found'; END IF;
  IF v_comment.user_id <> p_user_id THEN
    RAISE EXCEPTION 'not your comment';
  END IF;
  IF v_comment.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE comments
     SET body       = '[deleted]',
         body_html  = NULL,
         mentions   = '[]'::jsonb,
         status     = 'deleted',
         deleted_at = now(),
         updated_at = now()
   WHERE id = p_comment_id;

  UPDATE users
     SET comment_count = GREATEST(comment_count - 1, 0)
   WHERE id = v_comment.user_id;

  UPDATE articles
     SET comment_count = GREATEST(comment_count - 1, 0),
         updated_at    = now()
   WHERE id = v_comment.article_id;

  IF v_comment.parent_id IS NOT NULL THEN
    UPDATE comments
       SET reply_count = GREATEST(reply_count - 1, 0),
           updated_at  = now()
     WHERE id = v_comment.parent_id;
  END IF;

  PERFORM public._revoke_helpful_scores(p_comment_id);
END;
$function$;

-- ---------------------------------------------------------------------
-- 11. post_comment — add p_author_self_tag + p_reply_type, validate,
--     persist on INSERT. All other behavior preserved verbatim from
--     20260511200000_post_comment_gate_live_recipients.sql.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.post_comment(uuid, uuid, text, uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.post_comment(
  p_user_id               uuid,
  p_article_id            uuid,
  p_body                  text,
  p_parent_id             uuid    DEFAULT NULL,
  p_mentions              jsonb   DEFAULT '[]'::jsonb,
  p_real_world_experience text    DEFAULT NULL,
  p_author_self_tag       text    DEFAULT NULL,
  p_reply_type            text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_rwe            text;
  v_recipient_live boolean;
  v_self_tag       text;
  v_reply_type     text;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke post_comment' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;

  IF v_user.is_banned = true THEN
    RAISE EXCEPTION 'user_banned' USING ERRCODE = 'P0001';
  END IF;
  IF v_user.is_muted = true
     AND (v_user.muted_until IS NULL OR v_user.muted_until > now())
  THEN
    RAISE EXCEPTION 'muted_until:%',
      COALESCE(to_char(v_user.muted_until, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'indefinite')
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_user.email_verified THEN
    RAISE EXCEPTION 'email must be verified to comment';
  END IF;

  IF v_user.email NOT IN ('admin@veritypost.com') THEN
    IF NOT user_passed_article_quiz(p_user_id, p_article_id) THEN
      RAISE EXCEPTION 'quiz not passed — discussion is locked';
    END IF;
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'comment body is empty'; END IF;
  IF length(v_body) > v_max_len THEN
    RAISE EXCEPTION 'comment exceeds max length (% chars)', v_max_len;
  END IF;

  v_rwe := NULLIF(btrim(COALESCE(p_real_world_experience, '')), '');
  IF v_rwe IS NOT NULL AND length(v_rwe) > 80 THEN
    RAISE EXCEPTION 'real_world_experience exceeds 80 chars (got %)', length(v_rwe);
  END IF;

  -- author_self_tag: only on top-level comments; enum-bounded.
  v_self_tag := NULLIF(btrim(COALESCE(p_author_self_tag, '')), '');
  IF v_self_tag IS NOT NULL THEN
    IF v_self_tag NOT IN ('adds_context','question') THEN
      RAISE EXCEPTION 'invalid_author_self_tag' USING ERRCODE = '22023';
    END IF;
    IF p_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'author_self_tag_only_on_top_level' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- reply_type: only on replies; enum-bounded.
  v_reply_type := NULLIF(btrim(COALESCE(p_reply_type, '')), '');
  IF v_reply_type IS NOT NULL THEN
    IF v_reply_type NOT IN ('add_to_this','different_take','reply') THEN
      RAISE EXCEPTION 'invalid_reply_type' USING ERRCODE = '22023';
    END IF;
    IF p_parent_id IS NULL THEN
      RAISE EXCEPTION 'reply_type_only_on_replies' USING ERRCODE = '22023';
    END IF;
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

  SELECT a.title, s.id, s.slug
    INTO v_article_title, v_story_id, v_story_slug
    FROM articles a
    LEFT JOIN stories s ON s.id = a.story_id
    WHERE a.id = p_article_id;

  SELECT u.username INTO v_actor_username FROM users u WHERE u.id = p_user_id;

  INSERT INTO comments
    (article_id, story_id, user_id, parent_id, root_id, thread_depth,
     body, mentions, status, real_world_experience,
     author_self_tag, reply_type)
  VALUES
    (p_article_id, v_story_id, p_user_id, p_parent_id, v_root_id, v_depth,
     v_body, v_mentions, 'visible', v_rwe,
     v_self_tag, v_reply_type)
  RETURNING id INTO v_new_id;

  IF p_parent_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count + 1, updated_at = now()
     WHERE id = p_parent_id;
  END IF;

  UPDATE users SET comment_count = comment_count + 1, updated_at = now()
   WHERE id = p_user_id;

  UPDATE articles SET comment_count = comment_count + 1, updated_at = now()
   WHERE id = p_article_id;

  IF p_parent_id IS NOT NULL AND v_parent.user_id IS NOT NULL
     AND v_parent.user_id <> p_user_id THEN
    SELECT EXISTS(
      SELECT 1 FROM blocked_users b
       WHERE b.blocker_id = v_parent.user_id AND b.blocked_id = p_user_id
    ) INTO v_blocked;
    SELECT EXISTS(
      SELECT 1 FROM users u
       WHERE u.id = v_parent.user_id
         AND u.is_banned = false
         AND u.frozen_at IS NULL
         AND u.deletion_scheduled_for IS NULL
         AND u.deleted_at IS NULL
    ) INTO v_recipient_live;
    IF NOT v_blocked AND v_recipient_live THEN
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
    SELECT EXISTS(
      SELECT 1 FROM users u
       WHERE u.id = v_mentioned_id
         AND u.is_banned = false
         AND u.frozen_at IS NULL
         AND u.deletion_scheduled_for IS NULL
         AND u.deleted_at IS NULL
    ) INTO v_recipient_live;
    IF NOT v_recipient_live THEN CONTINUE; END IF;
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
$function$;

-- ---------------------------------------------------------------------
-- 12. Recreate the comments thread sort index without the pin key.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comments_article_thread_sort_v2
  ON public.comments (article_id, upvote_count DESC, created_at)
  WHERE status = 'visible' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 13. score_rules row for receive_helpful.
--     Copy points from the existing receive_context_tag row (live: 15)
--     so retention of intent is exact; default to 1 if no source row.
--     Per spec, the old row is left in place — historical data ignored.
-- ---------------------------------------------------------------------
INSERT INTO public.score_rules
  (action, display_name, description, points, max_per_day,
   max_per_article, cooldown_seconds, is_active, applies_to_kids,
   category_multiplier, metadata)
SELECT
  'receive_helpful',
  'Comment marked Helpful',
  'A reader marked your comment as helpful. Bucketed to the article''s category.',
  COALESCE(
    (SELECT points FROM public.score_rules WHERE action = 'receive_context_tag'),
    1
  ),
  COALESCE(
    (SELECT max_per_day FROM public.score_rules WHERE action = 'receive_context_tag'),
    20
  ),
  (SELECT max_per_article FROM public.score_rules WHERE action = 'receive_context_tag'),
  (SELECT cooldown_seconds FROM public.score_rules WHERE action = 'receive_context_tag'),
  true,
  COALESCE(
    (SELECT applies_to_kids FROM public.score_rules WHERE action = 'receive_context_tag'),
    false
  ),
  COALESCE(
    (SELECT category_multiplier FROM public.score_rules WHERE action = 'receive_context_tag'),
    true
  ),
  '{}'::jsonb
ON CONFLICT (action) DO NOTHING;

-- Deactivate the legacy receive_context_tag rule so no further awards
-- are issued under it; the row stays for FK validity of historical score_events.
UPDATE public.score_rules SET is_active = false WHERE action = 'receive_context_tag';

-- ---------------------------------------------------------------------
-- 14. Patch _evaluate_achievement_criterion: its 'context_pinned' case
--     reads comments.is_context_pinned, which we just dropped. The
--     auto-pin feature is retired; degrade that criterion to always-
--     false so existing achievement rows with that type stop firing
--     instead of crashing achievement evaluation entirely.
--     (Not in the spec body, but follows from "drop is_context_pinned"
--      since the function would otherwise raise on every call.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._evaluate_achievement_criterion(
  p_user_id  uuid,
  p_criteria jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type       text;
  v_threshold  integer;
  v_metric     integer;
  v_total_cats integer;
BEGIN
  IF p_user_id IS NULL OR p_criteria IS NULL THEN
    RETURN false;
  END IF;

  v_type := p_criteria ->> 'type';
  IF v_type IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_threshold := COALESCE((p_criteria ->> 'threshold')::integer, 1);
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  CASE v_type
    WHEN 'read_count' THEN
      SELECT COUNT(*) INTO v_metric FROM reading_log WHERE user_id = p_user_id AND completed = true;
      RETURN v_metric >= v_threshold;
    WHEN 'quiz_count' THEN
      SELECT COUNT(DISTINCT article_id) INTO v_metric FROM quiz_attempts WHERE user_id = p_user_id AND kid_profile_id IS NULL;
      RETURN v_metric >= v_threshold;
    WHEN 'perfect_quiz_count' THEN
      SELECT COUNT(*) INTO v_metric FROM (
        SELECT article_id FROM quiz_attempts WHERE user_id = p_user_id AND kid_profile_id IS NULL
        GROUP BY article_id, attempt_number HAVING SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) = 5
      ) perfect_articles;
      RETURN v_metric >= v_threshold;
    WHEN 'streak' THEN
      SELECT COALESCE(streak_current, 0) INTO v_metric FROM users WHERE id = p_user_id;
      RETURN v_metric >= v_threshold;
    WHEN 'score_reached' THEN
      SELECT COALESCE(verity_score, 0) INTO v_metric FROM users WHERE id = p_user_id;
      RETURN v_metric >= v_threshold;
    WHEN 'unique_categories_read' THEN
      SELECT COUNT(DISTINCT a.category_id) INTO v_metric FROM reading_log r
        JOIN articles a ON a.id = r.article_id
       WHERE r.user_id = p_user_id AND r.completed = true AND a.category_id IS NOT NULL;
      RETURN v_metric >= v_threshold;
    WHEN 'all_categories_read' THEN
      SELECT count(*) INTO v_total_cats FROM categories WHERE deleted_at IS NULL;
      SELECT COUNT(DISTINCT a.category_id) INTO v_metric FROM reading_log r
        JOIN articles a ON a.id = r.article_id
       WHERE r.user_id = p_user_id AND r.completed = true AND a.category_id IS NOT NULL;
      RETURN v_metric >= GREATEST(v_threshold, v_total_cats);
    WHEN 'comment_count' THEN
      SELECT COUNT(*) INTO v_metric FROM comments
       WHERE user_id = p_user_id AND deleted_at IS NULL AND status = 'visible';
      RETURN v_metric >= v_threshold;
    WHEN 'single_comment_upvotes' THEN
      SELECT COALESCE(MAX(upvote_count), 0) INTO v_metric FROM comments
       WHERE user_id = p_user_id AND deleted_at IS NULL AND status = 'visible';
      RETURN v_metric >= v_threshold;
    WHEN 'follower_count' THEN
      SELECT COALESCE(followers_count, 0) INTO v_metric FROM users WHERE id = p_user_id;
      RETURN v_metric >= v_threshold;
    WHEN 'context_pinned' THEN
      -- Auto-pin retired 2026-05-12 with the comment redesign.
      -- Always-false so achievement rows referencing this type stop
      -- firing; owner can prune the rows in a separate cleanup.
      RETURN false;
    ELSE
      RETURN NULL;
  END CASE;
END;
$function$;

-- ---------------------------------------------------------------------
-- 15. export_user_data — drop the comment_reactions_received block
--     that read from the now-dropped comment_agree_disagree table.
--     comment_context_tags_received stays (table survives with new
--     tag_kind values).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_user_data(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kid_ids  uuid[];
  v_user     users%ROWTYPE;
  v_out      jsonb := '{}'::jsonb;
  v_window   timestamptz := now() - interval '90 days';
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id;
  END IF;
  IF v_user.legal_hold = true THEN
    RAISE EXCEPTION 'legal_hold_active' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_kid_ids
    FROM kid_profiles WHERE parent_user_id = p_user_id;

  v_out := v_out
    || jsonb_build_object('user', (
         SELECT to_jsonb(u.*) - 'password_hash'
           FROM users u WHERE u.id = p_user_id
       ))
    || jsonb_build_object('kid_profiles', (
         SELECT COALESCE(jsonb_agg(to_jsonb(k.*)), '[]'::jsonb)
           FROM kid_profiles k WHERE k.parent_user_id = p_user_id
       ))
    || jsonb_build_object('reading_log', (
         SELECT COALESCE(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb)
           FROM reading_log r
          WHERE r.user_id = p_user_id OR r.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('quiz_attempts', (
         SELECT COALESCE(jsonb_agg(to_jsonb(q.*)), '[]'::jsonb)
           FROM quiz_attempts q
          WHERE q.user_id = p_user_id OR q.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('comments', (
         SELECT COALESCE(jsonb_agg(to_jsonb(c.*)), '[]'::jsonb)
           FROM comments c WHERE c.user_id = p_user_id
       ))
    || jsonb_build_object('comment_votes', (
         SELECT COALESCE(jsonb_agg(to_jsonb(v.*)), '[]'::jsonb)
           FROM comment_votes v WHERE v.user_id = p_user_id
       ))
    || jsonb_build_object('bookmarks', (
         SELECT COALESCE(jsonb_agg(to_jsonb(b.*)), '[]'::jsonb)
           FROM bookmarks b WHERE b.user_id = p_user_id
       ))
    || jsonb_build_object('follows', (
         SELECT COALESCE(jsonb_agg(to_jsonb(f.*)), '[]'::jsonb)
           FROM follows f
          WHERE f.follower_id = p_user_id OR f.following_id = p_user_id
       ))
    || jsonb_build_object('notifications', (
         SELECT COALESCE(jsonb_agg(to_jsonb(n.*)), '[]'::jsonb)
           FROM notifications n WHERE n.user_id = p_user_id
       ))
    || jsonb_build_object('user_achievements', (
         SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb)
           FROM user_achievements a
          WHERE a.user_id = p_user_id OR a.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('category_scores', (
         SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb)
           FROM category_scores s
          WHERE s.user_id = p_user_id OR s.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('score_events', (
         SELECT COALESCE(jsonb_agg(to_jsonb(e.*)), '[]'::jsonb)
           FROM score_events e
          WHERE e.user_id = p_user_id OR e.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('user_warnings', (
         SELECT COALESCE(jsonb_agg(to_jsonb(w.*)), '[]'::jsonb)
           FROM user_warnings w WHERE w.user_id = p_user_id
       ))
    || jsonb_build_object('messages', (
         SELECT COALESCE(jsonb_agg(to_jsonb(m.*)), '[]'::jsonb)
           FROM messages m WHERE m.sender_id = p_user_id
       ))
    || jsonb_build_object('conversation_participants', (
         SELECT COALESCE(jsonb_agg(to_jsonb(cp.*)), '[]'::jsonb)
           FROM conversation_participants cp WHERE cp.user_id = p_user_id
       ))
    || jsonb_build_object('reports_filed', (
         SELECT COALESCE(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb)
           FROM reports r WHERE r.reporter_id = p_user_id
       ))
    || jsonb_build_object('data_requests', (
         SELECT COALESCE(jsonb_agg(to_jsonb(d.*)), '[]'::jsonb)
           FROM data_requests d WHERE d.user_id = p_user_id
       ))
    || jsonb_build_object('subscriptions', (
         SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb)
           FROM subscriptions s WHERE s.user_id = p_user_id
       ))
    || jsonb_build_object('alert_preferences', (
         SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb)
           FROM alert_preferences a WHERE a.user_id = p_user_id
       ))
    || jsonb_build_object('user_push_tokens', (
         SELECT COALESCE(jsonb_agg(to_jsonb(t.*) - 'push_token'), '[]'::jsonb)
           FROM user_push_tokens t WHERE t.user_id = p_user_id
       ))
    || jsonb_build_object('audit_log_self', (
         SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb)
           FROM audit_log a WHERE a.actor_id = p_user_id
       ))
    || jsonb_build_object('support_tickets', (
         SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
           FROM support_tickets t WHERE t.user_id = p_user_id
       ))
    || jsonb_build_object('expert_applications', (
         SELECT COALESCE(jsonb_agg(to_jsonb(e.*)), '[]'::jsonb)
           FROM expert_applications e WHERE e.user_id = p_user_id
       ))
    || jsonb_build_object('kid_pair_codes', (
         SELECT COALESCE(jsonb_agg(to_jsonb(k.*) - 'code'), '[]'::jsonb)
           FROM kid_pair_codes k WHERE k.parent_user_id = p_user_id
       ))
    || jsonb_build_object('parental_consents', (
         SELECT COALESCE(jsonb_agg(to_jsonb(c.*)), '[]'::jsonb)
           FROM parental_consents c WHERE c.parent_user_id = p_user_id
       ))
    || jsonb_build_object('blocked_users', (
         SELECT COALESCE(jsonb_agg(to_jsonb(b.*)), '[]'::jsonb)
           FROM blocked_users b WHERE b.blocker_id = p_user_id
       ))
    || jsonb_build_object('comment_context_tags_received', (
         SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'comment_id', comment_id,
           'tag_kind', tag_kind,
           'count', cnt
         )), '[]'::jsonb)
           FROM (
             SELECT cct.comment_id, cct.tag_kind, count(*) AS cnt
               FROM comment_context_tags cct
              WHERE cct.comment_id IN (SELECT id FROM comments WHERE user_id = p_user_id)
              GROUP BY cct.comment_id, cct.tag_kind
           ) s
       ))
    || jsonb_build_object('comment_followups', (
         SELECT COALESCE(jsonb_agg(to_jsonb(cf.*)), '[]'::jsonb)
           FROM comment_followups cf WHERE cf.user_id = p_user_id
       ))
    || jsonb_build_object('expert_discussions', (
         SELECT COALESCE(jsonb_agg(to_jsonb(d.*)), '[]'::jsonb)
           FROM expert_discussions d WHERE d.user_id = p_user_id
       ))
    || jsonb_build_object('expert_thread_chains', (
         SELECT COALESCE(jsonb_agg(to_jsonb(c.*)), '[]'::jsonb)
           FROM expert_thread_chains c WHERE c.asker_user_id = p_user_id
       ))
    || jsonb_build_object('expert_queue_items', (
         SELECT COALESCE(jsonb_agg(to_jsonb(q.*)), '[]'::jsonb)
           FROM expert_queue_items q WHERE q.asking_user_id = p_user_id
       ))
    || jsonb_build_object('search_history', (
         SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb)
           FROM search_history s
          WHERE s.user_id = p_user_id
            AND s.created_at >= v_window
       ))
    || jsonb_build_object('analytics_events', (
         SELECT COALESCE(jsonb_agg(to_jsonb(e.*) - 'ip_address'), '[]'::jsonb)
           FROM analytics_events e
          WHERE e.user_id = p_user_id
            AND e.created_at >= v_window
       ))
    || jsonb_build_object('moderation_actions_against_me', (
         SELECT COALESCE(jsonb_agg(to_jsonb(m.*) - 'reason'), '[]'::jsonb)
           FROM moderation_actions m
          WHERE m.comment_id IN (SELECT id FROM comments WHERE user_id = p_user_id)
       ))
    || jsonb_build_object('invoices', (
         SELECT COALESCE(jsonb_agg(to_jsonb(i.*)), '[]'::jsonb)
           FROM invoices i WHERE i.user_id = p_user_id
       ))
    || jsonb_build_object('audit_log_against_me', (
         SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb)
           FROM audit_log a
          WHERE a.target_type = 'user' AND a.target_id = p_user_id
            AND a.actor_id IS DISTINCT FROM p_user_id
       ))
    || jsonb_build_object('auth_providers', (
         SELECT COALESCE(jsonb_agg(to_jsonb(ap.*) - 'provider_token' - 'refresh_token'), '[]'::jsonb)
           FROM auth_providers ap WHERE ap.user_id = p_user_id
       ))
    || jsonb_build_object('user_links', (
         SELECT COALESCE(jsonb_agg(to_jsonb(l.*)), '[]'::jsonb)
           FROM user_links l WHERE l.user_id = p_user_id
       ))
    || jsonb_build_object('user_education', (
         SELECT COALESCE(jsonb_agg(to_jsonb(e.*)), '[]'::jsonb)
           FROM user_education e WHERE e.user_id = p_user_id
       ))
    || jsonb_build_object('story_follows', (
         SELECT COALESCE(jsonb_agg(to_jsonb(sf.*)), '[]'::jsonb)
           FROM story_follows sf WHERE sf.user_id = p_user_id
       ))
    || jsonb_build_object('bookmark_collections', (
         SELECT COALESCE(jsonb_agg(to_jsonb(bc.*)), '[]'::jsonb)
           FROM bookmark_collections bc WHERE bc.user_id = p_user_id
       ))
    || jsonb_build_object('subscription_events', (
         SELECT COALESCE(jsonb_agg(to_jsonb(se.*)), '[]'::jsonb)
           FROM subscription_events se WHERE se.user_id = p_user_id
       ))
    || jsonb_build_object('message_receipts', (
         SELECT COALESCE(jsonb_agg(to_jsonb(mr.*)), '[]'::jsonb)
           FROM message_receipts mr WHERE mr.user_id = p_user_id
       ))
    || jsonb_build_object('_export_meta', jsonb_build_object(
         'generated_at',      now(),
         'regulation',        'gdpr',
         'subject_user_id',   p_user_id,
         'kid_profile_ids',   v_kid_ids,
         'schema_version',    201,
         'window_days',       90,
         'notes', jsonb_build_array(
           'analytics_events and search_history capped to last 90 days',
           'analytics_events.ip_address scrubbed',
           'moderation_actions.reason scrubbed (may name third parties)',
           'comment_context_tags_received is aggregate counts, not individual voter rows',
           'comment_agree_disagree retired 2026-05-12 (comment redesign); reactions now expressed via comment_context_tags (i_agree / helpful)',
           'blocked_users is outgoing direction only',
           'reports_filed is requester-as-reporter only; reports against requester are not included (NCMEC / safety sensitivity)',
           'storage binaries: avatar_url and banner_url are included as URLs in the user object'
         )
       ));

  RETURN v_out;
END;
$function$;

-- ---------------------------------------------------------------------
-- 16. Permissions table — rename old context_tag permission key to
--     comments.tag (now covers both new kinds) and drop the separate
--     .remove permission since toggle handles add+remove in one call.
-- ---------------------------------------------------------------------
UPDATE public.permissions
   SET key          = 'comments.tag',
       display_name = 'Tag a comment (I agree / Helpful)',
       description  = 'Add or remove I agree / Helpful tags on others'' comments'
 WHERE key = 'comments.context_tag';

DELETE FROM public.permission_set_perms
 WHERE permission_id = '00992db2-a9d8-48d5-a809-d96868e0b58c';
DELETE FROM public.permissions
 WHERE id = '00992db2-a9d8-48d5-a809-d96868e0b58c';

-- ---------------------------------------------------------------------
-- 17. Grants — match the executor set the dropped originals had.
--     toggle_context_tag (3-arg) had authenticated + service_role +
--     supabase_auth_admin. _revoke_context_tag_scores had service_role
--     + supabase_auth_admin (no authenticated).
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.toggle_comment_tag(uuid, uuid, text)
  TO authenticated, service_role, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public._revoke_helpful_scores(uuid)
  TO service_role, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.post_comment(uuid, uuid, text, uuid, jsonb, text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 18. Retire achievements that depended on the dropped auto-pin
--     criterion. Without this, `_evaluate_achievement_criterion` returns
--     false and the revoke-when-criterion-no-longer-met logic (commit
--     ce5e7d2b) would yank the badge from anyone who held it.
-- ---------------------------------------------------------------------
DELETE FROM public.user_achievements
 WHERE achievement_id IN (
   SELECT id FROM public.achievements WHERE key = 'context_contributor'
 );
DELETE FROM public.achievements
 WHERE key = 'context_contributor';

COMMIT;
