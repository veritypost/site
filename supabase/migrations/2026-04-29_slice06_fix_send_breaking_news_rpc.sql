-- Fix send_breaking_news: articles.slug no longer exists (moved to stories).
-- Also corrects notification URL from `/story/<slug>` to `/<slug>`.

CREATE OR REPLACE FUNCTION public.send_breaking_news(
  p_article_id uuid,
  p_title      text,
  p_body       text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id         uuid;
  v_slug            text;
  v_url             text;
  v_count           int  := 0;
  v_nid             uuid;
  v_last_id         uuid := NULL;
  v_batch_size      int  := 1000;
  v_batch_processed int;
BEGIN
  -- Slug now lives on stories, not articles.
  SELECT s.slug INTO v_slug
    FROM articles a
    LEFT JOIN stories s ON s.id = a.story_id
    WHERE a.id = p_article_id;

  v_url := '/' || COALESCE(v_slug, p_article_id::text);

  LOOP
    v_batch_processed := 0;
    FOR v_user_id IN
      SELECT id FROM users
       WHERE deleted_at IS NULL
         AND is_banned = false
         AND email_verified = true
         AND (v_last_id IS NULL OR id > v_last_id)
       ORDER BY id
       LIMIT v_batch_size
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
      v_last_id := v_user_id;
      v_batch_processed := v_batch_processed + 1;
    END LOOP;
    EXIT WHEN v_batch_processed = 0;
  END LOOP;

  RETURN v_count;
END;
$$;
