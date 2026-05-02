-- Add four missing RPCs that are called by web API routes but have no
-- corresponding migration:
--   toggle_follow       web/src/app/api/follows/route.js
--   toggle_vote         web/src/app/api/comments/[id]/vote/route.js
--   start_quiz_attempt  web/src/app/api/quiz/start/route.js
--   submit_quiz_attempt web/src/app/api/quiz/submit/route.js
--
-- Schema sources verified from web/src/types/database.ts:
--   follows         columns: id, follower_id, following_id, notify, created_at, updated_at
--   comment_votes   columns: id, user_id, comment_id, vote_type, created_at
--   comments        columns: ..., upvote_count, downvote_count, ...
--   users           columns: ..., followers_count, following_count, ...
--   quizzes         columns: id, article_id, question_text, options(json), explanation,
--                             is_active, deleted_at, sort_order, metadata(json with correct_index)
--   quiz_attempts   columns: id, user_id, kid_profile_id, article_id, quiz_id,
--                             selected_answer, is_correct, attempt_number, points_earned,
--                             questions_served, time_taken_seconds, created_at
--
-- All functions are SECURITY DEFINER so the service-role client that calls
-- them can operate without RLS interference. search_path is pinned to
-- 'public', 'pg_temp' to prevent search_path hijacking.

-- ============================================================
-- 1. toggle_follow
--    Params:  p_follower_id uuid, p_target_id uuid
--    Returns: jsonb  { following: bool, follower_count: int }
--
--    Inserts or deletes a row in follows and keeps the denormalised
--    followers_count / following_count on the users table in sync.
--    Self-follow is rejected with SQLSTATE 22023.
-- ============================================================
CREATE OR REPLACE FUNCTION public.toggle_follow(
  p_follower_id uuid,
  p_target_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_exists   boolean;
  v_count    int;
  v_now      timestamptz := now();
BEGIN
  IF p_follower_id = p_target_id THEN
    RAISE EXCEPTION 'cannot_follow_self' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.follows
     WHERE follower_id = p_follower_id
       AND following_id = p_target_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.follows
     WHERE follower_id = p_follower_id
       AND following_id = p_target_id;

    UPDATE public.users
       SET followers_count = GREATEST(followers_count - 1, 0)
     WHERE id = p_target_id;

    UPDATE public.users
       SET following_count = GREATEST(following_count - 1, 0)
     WHERE id = p_follower_id;
  ELSE
    INSERT INTO public.follows (follower_id, following_id, notify, created_at, updated_at)
    VALUES (p_follower_id, p_target_id, true, v_now, v_now)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    UPDATE public.users
       SET followers_count = followers_count + 1
     WHERE id = p_target_id;

    UPDATE public.users
       SET following_count = following_count + 1
     WHERE id = p_follower_id;
  END IF;

  SELECT followers_count INTO v_count
    FROM public.users
   WHERE id = p_target_id;

  RETURN jsonb_build_object(
    'following',       NOT v_exists,
    'follower_count',  COALESCE(v_count, 0)
  );
END;
$$;

-- ============================================================
-- 2. toggle_vote
--    Params:  p_user_id uuid, p_comment_id uuid, p_vote_type text
--             p_vote_type IN ('upvote','downvote','clear')
--    Returns: jsonb  { vote_type: text|null, upvote_count: int,
--                       downvote_count: int }
--
--    Rules (matching D29 spec referenced in the route):
--      Same vote twice  → clears (same as explicit 'clear')
--      Different vote   → switches
--      'clear'          → always removes existing vote
--    Keeps upvote_count / downvote_count on comments in sync.
-- ============================================================
CREATE OR REPLACE FUNCTION public.toggle_vote(
  p_user_id    uuid,
  p_comment_id uuid,
  p_vote_type  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_prior_type text;
  v_new_type   text;
  v_up         int;
  v_down       int;
BEGIN
  IF p_vote_type NOT IN ('upvote', 'downvote', 'clear') THEN
    RAISE EXCEPTION 'invalid_vote_type' USING ERRCODE = '22023';
  END IF;

  SELECT vote_type INTO v_prior_type
    FROM public.comment_votes
   WHERE comment_id = p_comment_id
     AND user_id    = p_user_id;

  -- Determine new desired state.
  IF p_vote_type = 'clear' OR v_prior_type = p_vote_type THEN
    -- Explicit clear, or toggling off the same vote.
    v_new_type := NULL;
  ELSE
    v_new_type := p_vote_type;
  END IF;

  -- Mutate comment_votes.
  IF v_prior_type IS NULL AND v_new_type IS NOT NULL THEN
    INSERT INTO public.comment_votes (user_id, comment_id, vote_type, created_at)
    VALUES (p_user_id, p_comment_id, v_new_type, now());

  ELSIF v_prior_type IS NOT NULL AND v_new_type IS NULL THEN
    DELETE FROM public.comment_votes
     WHERE comment_id = p_comment_id
       AND user_id    = p_user_id;

  ELSIF v_prior_type IS NOT NULL AND v_new_type IS NOT NULL AND v_prior_type <> v_new_type THEN
    UPDATE public.comment_votes
       SET vote_type = v_new_type
     WHERE comment_id = p_comment_id
       AND user_id    = p_user_id;
  END IF;

  -- Keep denormalised counts accurate.
  -- Decrement previous, increment new (guard against going negative).
  IF v_prior_type = 'upvote' THEN
    UPDATE public.comments
       SET upvote_count = GREATEST(upvote_count - 1, 0)
     WHERE id = p_comment_id;
  ELSIF v_prior_type = 'downvote' THEN
    UPDATE public.comments
       SET downvote_count = GREATEST(downvote_count - 1, 0)
     WHERE id = p_comment_id;
  END IF;

  IF v_new_type = 'upvote' THEN
    UPDATE public.comments SET upvote_count = upvote_count + 1 WHERE id = p_comment_id;
  ELSIF v_new_type = 'downvote' THEN
    UPDATE public.comments SET downvote_count = downvote_count + 1 WHERE id = p_comment_id;
  END IF;

  SELECT upvote_count, downvote_count
    INTO v_up, v_down
    FROM public.comments
   WHERE id = p_comment_id;

  RETURN jsonb_build_object(
    'vote_type',      v_new_type,
    'upvote_count',   COALESCE(v_up,   0),
    'downvote_count', COALESCE(v_down, 0)
  );
END;
$$;

-- ============================================================
-- 3. start_quiz_attempt
--    Params:  p_user_id uuid, p_article_id uuid,
--             p_kid_profile_id uuid (nullable)
--    Returns: jsonb  { attempt_number: int, questions: [{id, question_text, options}] }
--
--    Resolves the next attempt_number for this user+article (or
--    user+kid_profile+article) and returns the active questions
--    for the article. Does NOT insert any quiz_attempts rows —
--    those are written by submit_quiz_attempt.
--
--    Raises SQLSTATE P0001 'quiz_pool_not_ready' when the article
--    has no active questions.
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(
  p_user_id        uuid,
  p_article_id     uuid,
  p_kid_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_attempt_number int;
  v_questions      jsonb;
BEGIN
  -- Resolve next attempt number.  quiz_attempts stores one row per
  -- question answered, so attempt_number groups a full quiz session.
  -- We look at the highest attempt_number for prior completed attempts
  -- (defined as: at least one quiz_attempt row exists for this session
  -- key) and add 1.
  SELECT COALESCE(MAX(attempt_number), 0) + 1
    INTO v_attempt_number
    FROM public.quiz_attempts
   WHERE user_id    = p_user_id
     AND article_id = p_article_id
     AND (
       p_kid_profile_id IS NULL AND kid_profile_id IS NULL
       OR kid_profile_id = p_kid_profile_id
     );

  -- Fetch active questions, stripping the correct_index from the
  -- client-visible payload.  options were stored without is_correct
  -- flags (see persist_generated_article), so options is already safe
  -- to send verbatim.
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',            q.id,
      'question_text', q.question_text,
      'options',       q.options
    )
    ORDER BY q.sort_order
  )
    INTO v_questions
    FROM public.quizzes q
   WHERE q.article_id = p_article_id
     AND q.is_active   = true
     AND q.deleted_at  IS NULL;

  IF v_questions IS NULL OR jsonb_array_length(v_questions) = 0 THEN
    RAISE EXCEPTION 'quiz pool not ready for this article'
      USING ERRCODE = 'P0001', HINT = 'quiz_pool_not_ready';
  END IF;

  RETURN jsonb_build_object(
    'attempt_number', v_attempt_number,
    'questions',      v_questions
  );
END;
$$;

-- ============================================================
-- 4. submit_quiz_attempt
--    Params:  p_user_id uuid, p_article_id uuid,
--             p_answers jsonb  -- array of {quiz_id, selected_answer}
--             p_kid_profile_id uuid (nullable)
--             p_time_taken_seconds int (nullable)
--    Returns: jsonb  {
--               passed: bool, correct: int, total: int,
--               attempt_number: int, percentile: int,
--               results: [{quiz_id, question_text, selected_answer,
--                           correct_answer, is_correct, options, explanation}]
--             }
--
--    Resolves the current attempt_number (MAX existing + 1 when there
--    are no rows yet for this attempt, MAX when a start_quiz_attempt
--    was already called — we use MAX regardless because start_quiz_attempt
--    does not insert rows).  Inserts one quiz_attempts row per answer,
--    increments quizzes.attempt_count + correct_count, then evaluates
--    pass/fail against the threshold setting (default 60 %).
--    percentile is a simple approximation: correct / total * 100.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  p_user_id             uuid,
  p_article_id          uuid,
  p_answers             jsonb,
  p_kid_profile_id      uuid    DEFAULT NULL,
  p_time_taken_seconds  integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_attempt_number  int;
  v_threshold       int;
  v_total           int;
  v_correct_count   int := 0;
  v_is_passed       boolean;
  v_results         jsonb := '[]'::jsonb;
  v_questions_array uuid[];

  -- Loop vars
  v_answer          jsonb;
  v_quiz            record;
  v_selected        text;
  v_correct_index   int;
  v_correct_text    text;
  v_is_correct      boolean;
  v_result_row      jsonb;
BEGIN
  -- Determine attempt_number: use the same value start_quiz_attempt
  -- would return (MAX prior attempts + 1).  If start was never called
  -- this is also correct because MAX of empty set = 0 → 1.
  SELECT COALESCE(MAX(attempt_number), 0) + 1
    INTO v_attempt_number
    FROM public.quiz_attempts
   WHERE user_id    = p_user_id
     AND article_id = p_article_id
     AND (
       p_kid_profile_id IS NULL AND kid_profile_id IS NULL
       OR kid_profile_id = p_kid_profile_id
     );

  -- Read pass threshold from settings; default 60.
  BEGIN
    SELECT NULLIF(value, '')::int
      INTO v_threshold
      FROM public.settings
     WHERE key = 'quiz.pass_threshold_pct';
  EXCEPTION WHEN invalid_text_representation THEN
    v_threshold := NULL;
  END;
  IF v_threshold IS NULL OR v_threshold < 0 OR v_threshold > 100 THEN
    v_threshold := 60;
  END IF;

  -- Count active questions for this article (used for pass calc).
  SELECT COUNT(*)::int
    INTO v_total
    FROM public.quizzes
   WHERE article_id = p_article_id
     AND is_active  = true
     AND deleted_at IS NULL;

  -- Process each answer.
  FOR v_answer IN SELECT jsonb_array_elements(p_answers)
  LOOP
    SELECT *
      INTO v_quiz
      FROM public.quizzes
     WHERE id         = (v_answer->>'quiz_id')::uuid
       AND article_id = p_article_id
       AND is_active  = true
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
      CONTINUE;  -- Skip unknown / inactive quiz IDs.
    END IF;

    v_selected      := v_answer->>'selected_answer';
    v_correct_index := COALESCE((v_quiz.metadata->>'correct_index')::int, 0);

    -- options is stored as [{text: ...}, ...] — extract the text at correct_index.
    v_correct_text := v_quiz.options -> v_correct_index ->> 'text';

    v_is_correct := (v_selected = v_correct_text);

    IF v_is_correct THEN
      v_correct_count := v_correct_count + 1;
    END IF;

    -- Insert the attempt row.
    INSERT INTO public.quiz_attempts (
      user_id, kid_profile_id, article_id, quiz_id,
      selected_answer, is_correct, attempt_number,
      points_earned, time_taken_seconds, created_at
    ) VALUES (
      p_user_id, p_kid_profile_id, p_article_id, v_quiz.id,
      v_selected, v_is_correct, v_attempt_number,
      CASE WHEN v_is_correct THEN v_quiz.points ELSE 0 END,
      p_time_taken_seconds,
      now()
    );

    -- Update quizzes aggregate counters.
    UPDATE public.quizzes
       SET attempt_count = attempt_count + 1,
           correct_count = correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END
     WHERE id = v_quiz.id;

    -- Build per-question result row.
    v_result_row := jsonb_build_object(
      'quiz_id',          v_quiz.id,
      'question_text',    v_quiz.question_text,
      'selected_answer',  v_selected,
      'correct_answer',   v_correct_index,
      'is_correct',       v_is_correct,
      'options',          v_quiz.options,
      'explanation',      v_quiz.explanation
    );
    v_results := v_results || jsonb_build_array(v_result_row);
  END LOOP;

  -- Pass if correct_count / total >= threshold (integer-safe arithmetic).
  IF v_total = 0 THEN
    v_is_passed := false;
  ELSE
    v_is_passed := (v_correct_count * 100 >= v_threshold * v_total);
  END IF;

  RETURN jsonb_build_object(
    'passed',         v_is_passed,
    'correct',        v_correct_count,
    'total',          v_total,
    'attempt_number', v_attempt_number,
    'percentile',     CASE WHEN v_total > 0
                           THEN ROUND((v_correct_count::numeric / v_total) * 100)::int
                           ELSE 0
                      END,
    'results',        v_results
  );
END;
$$;
