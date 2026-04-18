-- ============================================================
-- Phase 19.1 — GDPR data export
--
-- One RPC (export_user_data) returns every row referencing the
-- subject across the engagement tables. The cron worker wraps
-- this in Supabase Storage upload + signed URL + notification.
--
-- Storage bucket 'data-exports' (private) is created here if
-- missing. Service-role bypasses RLS so no per-bucket policies
-- are needed for the worker; signed URLs carry their own short
-- lived access.
-- ============================================================


-- ------------------------------------------------------------
-- Ensure the private bucket exists. Idempotent.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('data-exports', 'data-exports', false)
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------
-- export_user_data — snapshot of every user-identifying row.
-- Excludes: audit_log entries about the user (moderation-internal),
-- sessions (auth-internal), and other users' content.
-- Includes kid profiles the user parents and all their activity.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kid_ids uuid[];
  v_out jsonb := '{}'::jsonb;
BEGIN
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
          WHERE r.user_id = p_user_id
             OR r.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('quiz_attempts', (
         SELECT COALESCE(jsonb_agg(to_jsonb(q.*)), '[]'::jsonb)
           FROM quiz_attempts q
          WHERE q.user_id = p_user_id
             OR q.kid_profile_id = ANY(v_kid_ids)
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
          WHERE a.user_id = p_user_id
             OR a.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('category_scores', (
         SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb)
           FROM category_scores s
          WHERE s.user_id = p_user_id
             OR s.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('score_events', (
         SELECT COALESCE(jsonb_agg(to_jsonb(e.*)), '[]'::jsonb)
           FROM score_events e
          WHERE e.user_id = p_user_id
             OR e.kid_profile_id = ANY(v_kid_ids)
       ))
    || jsonb_build_object('streaks', (
         SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb)
           FROM streaks s
          WHERE s.user_id = p_user_id
             OR s.kid_profile_id = ANY(v_kid_ids)
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
    || jsonb_build_object('_export_meta', jsonb_build_object(
         'generated_at', now(),
         'regulation', 'gdpr',
         'subject_user_id', p_user_id,
         'kid_profile_ids', v_kid_ids
       ));

  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.export_user_data(uuid) TO service_role;


-- ------------------------------------------------------------
-- Ancillary: claim_next_export_request — picks and locks the
-- oldest verified pending export so the cron worker doesn't
-- double-process. Sets processing_started_at; returns the row
-- or NULL if nothing to do.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_next_export_request()
RETURNS data_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row data_requests;
BEGIN
  UPDATE data_requests
     SET processing_started_at = now(), status = 'processing'
   WHERE id = (
     SELECT id FROM data_requests
      WHERE type = 'export'
        AND status = 'pending'
        AND identity_verified = true
        AND legal_hold = false
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_next_export_request() TO service_role;
