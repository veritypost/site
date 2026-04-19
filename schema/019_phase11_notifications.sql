-- ============================================================
-- Phase 11 — Weekly Recap & Notifications
-- Decisions: D14 (1 breaking alert/day free, unlimited paid),
-- D24 (weekly family report — RPC from Phase 9),
-- D25 (no morning digest, no category email alerts),
-- D36 (weekly recap quiz — Verity+).
-- ============================================================

-- ------------------------------------------------------------
-- Settings: breaking-alert free-tier daily cap.
-- ------------------------------------------------------------
INSERT INTO settings (key, value, value_type, category, display_name, description, is_public)
VALUES
  ('breaking_alert_cap_free', '1', 'integer', 'notifications',
   'Breaking alerts — free-tier daily cap (D14)',
   'Free accounts see at most this many breaking-news alerts per 24 hours.',
   false)
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------
-- D25 cleanup — deactivate legacy templates the blueprint cut.
-- Rows stay in place so historical notifications still resolve;
-- they just won't be picked up by new send flows.
-- ------------------------------------------------------------
UPDATE email_templates
   SET is_active = false, updated_at = now()
 WHERE key IN ('morning_digest', 'daily_digest', 'category_alert',
               'category_digest', 'weekly_digest');


-- ------------------------------------------------------------
-- email_templates.key needs a unique constraint for the upserts
-- below. Schema didn't declare one; adding idempotently.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_key_unique
  ON email_templates (key);


-- ------------------------------------------------------------
-- Seed the templates the platform actually uses (idempotent).
-- ------------------------------------------------------------
INSERT INTO email_templates (key, name, subject, body_html, body_text, from_name, variables, is_active)
VALUES
  ('weekly_reading_report', 'Weekly Reading Report',
   'Your Verity Post week: {{articles_read}} reads · {{quizzes_completed}} quizzes',
   '<h1>Your week on Verity Post</h1><p>Hi {{username}},</p><p>You read <b>{{articles_read}}</b> articles and completed <b>{{quizzes_completed}}</b> quizzes this week. Your Verity Score is now <b>{{verity_score}}</b>. Current streak: <b>{{streak}}</b>.</p><p>Missed stories are in <a href="{{recap_url}}">this week''s recap quiz</a>.</p>',
   'Your week on Verity Post: {{articles_read}} reads, {{quizzes_completed}} quizzes. Score {{verity_score}}. Streak {{streak}}. Recap: {{recap_url}}',
   'Verity Post',
   '["username","articles_read","quizzes_completed","verity_score","streak","recap_url"]'::jsonb,
   true),
  ('weekly_family_report', 'Weekly Family Reading Report',
   'Your family''s week on Verity Post',
   '<h1>This week across the family</h1><p>Summary of every member''s reading, quizzes, and streak for the last 7 days.</p><p><a href="{{dashboard_url}}">Open the family dashboard</a>.</p>',
   'This week across the family. Open: {{dashboard_url}}',
   'Verity Post',
   '["dashboard_url"]'::jsonb,
   true),
  ('breaking_news_alert', 'Breaking News Alert',
   '⚡ Breaking: {{headline}}',
   '<p><strong>Breaking:</strong> {{headline}}</p><p>{{summary}}</p><p><a href="{{article_url}}">Read the story</a></p>',
   'Breaking: {{headline}}. {{summary}} Read: {{article_url}}',
   'Verity Post',
   '["headline","summary","article_url"]'::jsonb,
   true),
  ('kid_trial_day6', 'Kid Trial — one day left',
   '{{kid_name}}''s Verity Post trial ends tomorrow',
   '<p>{{kid_name}} read <b>{{articles_read}}</b> articles and has a <b>{{streak}}-day</b> streak.</p><p>Keep going with <a href="{{upgrade_url}}">Verity Family</a>.</p>',
   '{{kid_name}} read {{articles_read}} articles, {{streak}}-day streak. Keep going: {{upgrade_url}}',
   'Verity Post',
   '["kid_name","articles_read","streak","upgrade_url"]'::jsonb,
   true),
  ('kid_trial_expired', 'Kid Trial — frozen',
   '{{kid_name}}''s profile is frozen',
   '<p>The kid trial ended. {{kid_name}}''s progress is saved — <a href="{{upgrade_url}}">upgrade to Family</a> to unfreeze.</p>',
   'Trial ended. Upgrade: {{upgrade_url}}',
   'Verity Post',
   '["kid_name","upgrade_url"]'::jsonb,
   true)
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------
-- breaking_news_quota_check — D14 gate.
-- Free accounts: cap per calendar 24h window.
-- Paid accounts: unlimited.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.breaking_news_quota_check(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent int;
  v_cap int := _setting_int('breaking_alert_cap_free', 1);
  v_paid boolean := _user_is_paid(p_user_id);
BEGIN
  IF v_paid THEN
    RETURN jsonb_build_object('can_send', true, 'sent_today', 0, 'cap', NULL, 'paid', true);
  END IF;
  SELECT COUNT(*) INTO v_sent FROM notifications
   WHERE user_id = p_user_id
     AND type = 'breaking_news'
     AND created_at > now() - interval '24 hours';
  RETURN jsonb_build_object(
    'can_send', v_sent < v_cap,
    'sent_today', v_sent,
    'cap', v_cap,
    'paid', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.breaking_news_quota_check(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- create_notification — single entry point for any notification.
-- Respects alert_preferences (channel toggles, is_enabled) and the
-- D14 breaking-news quota. Writes in-app row; push/email delivery
-- is flagged false and handled by a later worker.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_action_url text DEFAULT NULL,
  p_action_type text DEFAULT NULL,
  p_action_id uuid DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs alert_preferences%ROWTYPE;
  v_id uuid;
  v_channel text := 'in_app';
  v_now time := now()::time;
BEGIN
  -- D14 breaking-news quota.
  IF p_type = 'breaking_news' THEN
    IF NOT ((breaking_news_quota_check(p_user_id))->>'can_send')::boolean THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT * INTO v_prefs FROM alert_preferences
    WHERE user_id = p_user_id AND alert_type = p_type;
  IF FOUND THEN
    IF NOT v_prefs.is_enabled THEN RETURN NULL; END IF;
    -- Quiet hours: create the in_app row but don't flag push eligible.
    IF v_prefs.quiet_hours_start IS NOT NULL AND v_prefs.quiet_hours_end IS NOT NULL THEN
      IF (v_prefs.quiet_hours_start < v_prefs.quiet_hours_end
            AND v_now >= v_prefs.quiet_hours_start AND v_now < v_prefs.quiet_hours_end)
         OR (v_prefs.quiet_hours_start > v_prefs.quiet_hours_end
            AND (v_now >= v_prefs.quiet_hours_start OR v_now < v_prefs.quiet_hours_end))
      THEN
        v_channel := 'in_app';  -- delivery worker will skip push/email
      END IF;
    END IF;
  END IF;

  INSERT INTO notifications
    (user_id, type, title, body, action_url, action_type, action_id,
     channel, priority, metadata)
  VALUES
    (p_user_id, p_type, p_title, p_body, p_action_url, p_action_type, p_action_id,
     v_channel, p_priority, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, text, uuid, text, jsonb) TO service_role;


-- ------------------------------------------------------------
-- send_breaking_news — admin fan-out.
-- Creates a `breaking_news` notification for every eligible user,
-- respecting the D14 per-user daily quota via create_notification.
-- Returns the count of notifications actually written.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_breaking_news(
  p_article_id uuid,
  p_title text,
  p_body text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_slug text;
  v_url text;
  v_count int := 0;
  v_nid uuid;
BEGIN
  SELECT slug INTO v_slug FROM articles WHERE id = p_article_id;
  v_url := '/story/' || COALESCE(v_slug, p_article_id::text);

  FOR v_user_id IN
    SELECT id FROM users
     WHERE deleted_at IS NULL
       AND is_banned = false
       AND email_verified = true
  LOOP
    v_nid := create_notification(
      v_user_id,
      'breaking_news',
      p_title,
      p_body,
      v_url,
      'article',
      p_article_id,
      'high',
      jsonb_build_object('article_id', p_article_id)
    );
    IF v_nid IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_breaking_news(uuid, text, text) TO service_role;


-- ------------------------------------------------------------
-- weekly_reading_report(user_id) → jsonb
-- Single-user aggregate for the D25 weekly email.
-- Paid users only (same gate as D36); check in API layer.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.weekly_reading_report(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - interval '7 days';
  v_reads int;
  v_quizzes int;
  v_passed_attempts int;
  v_u users%ROWTYPE;
BEGIN
  SELECT * INTO v_u FROM users WHERE id = p_user_id;

  SELECT COUNT(*) INTO v_reads FROM reading_log
    WHERE user_id = p_user_id AND created_at >= v_since;

  SELECT COUNT(DISTINCT (article_id, attempt_number)) INTO v_quizzes
    FROM quiz_attempts
    WHERE user_id = p_user_id AND created_at >= v_since;

  -- Attempts with >= 3 correct (D1 pass threshold).
  SELECT COUNT(*) INTO v_passed_attempts FROM (
    SELECT SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS sum_c
      FROM quiz_attempts
     WHERE user_id = p_user_id AND created_at >= v_since
     GROUP BY article_id, attempt_number
     HAVING SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) >= 3
  ) t;

  RETURN jsonb_build_object(
    'week_ending', now(),
    'username', v_u.username,
    'articles_read', COALESCE(v_reads, 0),
    'quizzes_completed', COALESCE(v_quizzes, 0),
    'quizzes_passed', COALESCE(v_passed_attempts, 0),
    'verity_score', v_u.verity_score,
    'streak', v_u.streak_current
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_reading_report(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- submit_recap_attempt — D36 grading for the weekly quiz.
-- Answers jsonb: [{ question_id, selected_answer:int }]
-- Returns per-question explanations + articles_missed array
-- so the result screen can show "go read these".
-- Verity+ only — check in API layer (RPC stays permissive).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_recap_attempt(
  p_user_id uuid,
  p_recap_quiz_id uuid,
  p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ans jsonb;
  v_q weekly_recap_questions%ROWTYPE;
  v_correct_idx int;
  v_selected int;
  v_is_correct boolean;
  v_score int := 0;
  v_total int := 0;
  v_results jsonb := '[]'::jsonb;
  v_missed uuid[] := '{}';
  v_attempt_id uuid;
BEGIN
  FOR v_ans IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    v_total := v_total + 1;
    SELECT * INTO v_q FROM weekly_recap_questions
      WHERE id = (v_ans->>'question_id')::uuid
        AND recap_quiz_id = p_recap_quiz_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_selected := (v_ans->>'selected_answer')::int;
    SELECT (i - 1)::int INTO v_correct_idx
      FROM jsonb_array_elements(v_q.options) WITH ORDINALITY AS e(opt, i)
     WHERE (opt->>'is_correct')::boolean = true LIMIT 1;

    v_is_correct := (v_selected = v_correct_idx);
    IF v_is_correct THEN v_score := v_score + 1;
    ELSIF v_q.article_id IS NOT NULL THEN
      v_missed := array_append(v_missed, v_q.article_id);
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'question_id', v_q.id,
      'question_text', v_q.question_text,
      'article_id', v_q.article_id,
      'selected_answer', v_selected,
      'correct_answer', v_correct_idx,
      'is_correct', v_is_correct,
      'explanation', v_q.explanation,
      'options', (SELECT jsonb_agg(jsonb_build_object('text', opt->>'text'))
                    FROM jsonb_array_elements(v_q.options) AS opt)
    ));
  END LOOP;

  INSERT INTO weekly_recap_attempts
    (recap_quiz_id, user_id, score, total_questions, answers, articles_missed, completed_at)
  VALUES
    (p_recap_quiz_id, p_user_id, v_score, v_total, p_answers, v_missed, now())
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_score,
    'total', v_total,
    'articles_missed', v_missed,
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_recap_attempt(uuid, uuid, jsonb) TO service_role;
