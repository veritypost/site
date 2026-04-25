-- 176_ext_audit_batch37_export_completeness.sql
-- Batch 37 — Tier B compliance.
-- Ext-X.8 — export_user_data RPC missing tables for GDPR Article 15
-- (right of access). The original RPC in schema/028 covers 18 tables;
-- the audit's review surfaced gaps. Add: subscriptions, alert_preferences,
-- user_push_tokens, billing_events, audit_log (own rows), support_tickets
-- (own tickets), expert_applications, kid_pair_codes (own), parental_consents
-- (added in schema/163).
--
-- Excluded by intent (still):
--   - sessions: auth-internal, no user-facing meaning, regenerable
--   - admin_audit_log: moderation-internal, never user data
--   - ad_events: large analytics table, anonymized after retention; if
--     EU traffic ever materialises this gets a separate dedicated path
--   - other users' content (mentions, replies addressed to user, etc.)
--
-- Backward-compat: the existing keys stay; only adds new keys to the
-- output. Callers that decode by-key continue to work.

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
    -- Ext-X.8 additions ------------------------------------------------------
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
    || jsonb_build_object('billing_events', (
         SELECT COALESCE(jsonb_agg(to_jsonb(b.*)), '[]'::jsonb)
           FROM billing_events b WHERE b.user_id = p_user_id
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
    -- ------------------------------------------------------------------------
    || jsonb_build_object('_export_meta', jsonb_build_object(
         'generated_at', now(),
         'regulation', 'gdpr',
         'subject_user_id', p_user_id,
         'kid_profile_ids', v_kid_ids,
         'schema_version', 176
       ));

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_user_data(uuid) TO service_role;
