-- Session 1 / PM-A — Q01 Mass-impersonation REVOKE pass (Option A, ACL-only).
--
-- Closes the surface where 55 SECURITY DEFINER functions in public.* with EXECUTE
-- granted to PUBLIC/anon/authenticated allowed any anon-key holder to impersonate
-- any user via /rest/v1/rpc/<fn>. See REVIEW_SESSIONS/QUESTIONS/Q01_mass_impersonation_strategy.md
-- for the full inventory and rationale.
--
-- Strategy:
--   1. ALTER DEFAULT PRIVILEGES so future SECURITY DEFINER functions are deny-by-default.
--   2. Class A (server-only, ~50 fns): REVOKE from anon/authenticated/public, defensively GRANT to service_role.
--   3. Class B (lockdown_self): REVOKE from anon/public, GRANT to authenticated.
--   4. Class C (3 read helpers): REVOKE from anon/public, GRANT to authenticated.
--
-- No function bodies are edited. Class C parameter-drop rewrite is queued as a follow-up.

------------------------------------------------------------------------------
-- 1. Default-deny for future SECURITY DEFINER functions in public.
------------------------------------------------------------------------------

-- Postgres' built-in default is EXECUTE to PUBLIC, which is exactly the source of
-- the regression risk. Override that for any role that creates functions in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

-- Same for objects created by the postgres role (most migrations run as postgres).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

------------------------------------------------------------------------------
-- 2. Class A — server-only RPCs.
--    REVOKE from PUBLIC, anon, authenticated.
--    Defensive GRANT to service_role (CREATE OR REPLACE does not re-emit auto-grants).
------------------------------------------------------------------------------

-- _subject_local_today
REVOKE EXECUTE ON FUNCTION public._subject_local_today(p_user_id uuid, p_kid_profile_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._subject_local_today(p_user_id uuid, p_kid_profile_id uuid) TO service_role;

-- _user_is_comment_blocked
REVOKE EXECUTE ON FUNCTION public._user_is_comment_blocked(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._user_is_comment_blocked(p_user_id uuid) TO service_role;

-- _user_is_dm_blocked
REVOKE EXECUTE ON FUNCTION public._user_is_dm_blocked(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._user_is_dm_blocked(p_user_id uuid) TO service_role;

-- advance_streak
REVOKE EXECUTE ON FUNCTION public.advance_streak(p_user_id uuid, p_kid_profile_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.advance_streak(p_user_id uuid, p_kid_profile_id uuid) TO service_role;

-- ask_expert
REVOKE EXECUTE ON FUNCTION public.ask_expert(p_user_id uuid, p_article_id uuid, p_body text, p_target_type text, p_target_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ask_expert(p_user_id uuid, p_article_id uuid, p_body text, p_target_type text, p_target_id uuid) TO service_role;

-- award_points
REVOKE EXECUTE ON FUNCTION public.award_points(p_action text, p_user_id uuid, p_kid_profile_id uuid, p_article_id uuid, p_category_id uuid, p_source_type text, p_source_id uuid, p_synthetic_key text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.award_points(p_action text, p_user_id uuid, p_kid_profile_id uuid, p_article_id uuid, p_category_id uuid, p_source_type text, p_source_id uuid, p_synthetic_key text) TO service_role;

-- billing_cancel_subscription
REVOKE EXECUTE ON FUNCTION public.billing_cancel_subscription(p_user_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.billing_cancel_subscription(p_user_id uuid, p_reason text) TO service_role;

-- billing_change_plan
REVOKE EXECUTE ON FUNCTION public.billing_change_plan(p_user_id uuid, p_new_plan_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.billing_change_plan(p_user_id uuid, p_new_plan_id uuid) TO service_role;

-- billing_freeze_profile
REVOKE EXECUTE ON FUNCTION public.billing_freeze_profile(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.billing_freeze_profile(p_user_id uuid) TO service_role;

-- billing_resubscribe
REVOKE EXECUTE ON FUNCTION public.billing_resubscribe(p_user_id uuid, p_new_plan_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.billing_resubscribe(p_user_id uuid, p_new_plan_id uuid) TO service_role;

-- claim_queue_item
REVOKE EXECUTE ON FUNCTION public.claim_queue_item(p_user_id uuid, p_queue_item_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_queue_item(p_user_id uuid, p_queue_item_id uuid) TO service_role;

-- clear_failed_login
REVOKE EXECUTE ON FUNCTION public.clear_failed_login(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.clear_failed_login(p_user_id uuid) TO service_role;

-- convert_kid_trial
REVOKE EXECUTE ON FUNCTION public.convert_kid_trial(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.convert_kid_trial(p_user_id uuid) TO service_role;

-- create_bookmark_collection
REVOKE EXECUTE ON FUNCTION public.create_bookmark_collection(p_user_id uuid, p_name text, p_description text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_bookmark_collection(p_user_id uuid, p_name text, p_description text) TO service_role;

-- create_notification
REVOKE EXECUTE ON FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_action_url text, p_action_type text, p_action_id uuid, p_priority text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_action_url text, p_action_type text, p_action_id uuid, p_priority text, p_metadata jsonb) TO service_role;

-- decline_queue_item
REVOKE EXECUTE ON FUNCTION public.decline_queue_item(p_user_id uuid, p_queue_item_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.decline_queue_item(p_user_id uuid, p_queue_item_id uuid) TO service_role;

-- delete_bookmark_collection
REVOKE EXECUTE ON FUNCTION public.delete_bookmark_collection(p_user_id uuid, p_collection_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_bookmark_collection(p_user_id uuid, p_collection_id uuid) TO service_role;

-- edit_comment
REVOKE EXECUTE ON FUNCTION public.edit_comment(p_user_id uuid, p_comment_id uuid, p_body text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.edit_comment(p_user_id uuid, p_comment_id uuid, p_body text) TO service_role;

-- expert_can_see_back_channel
REVOKE EXECUTE ON FUNCTION public.expert_can_see_back_channel(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expert_can_see_back_channel(p_user_id uuid) TO service_role;

-- export_user_data
REVOKE EXECUTE ON FUNCTION public.export_user_data(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.export_user_data(p_user_id uuid) TO service_role;

-- freeze_kid_trial
REVOKE EXECUTE ON FUNCTION public.freeze_kid_trial(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.freeze_kid_trial(p_user_id uuid) TO service_role;

-- is_category_supervisor
REVOKE EXECUTE ON FUNCTION public.is_category_supervisor(p_user_id uuid, p_category_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_category_supervisor(p_user_id uuid, p_category_id uuid) TO service_role;

-- is_expert_in_probation
REVOKE EXECUTE ON FUNCTION public.is_expert_in_probation(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_expert_in_probation(p_user_id uuid) TO service_role;

-- is_family_owner
REVOKE EXECUTE ON FUNCTION public.is_family_owner(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_family_owner(p_user_id uuid) TO service_role;

-- is_user_expert
REVOKE EXECUTE ON FUNCTION public.is_user_expert(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_user_expert(p_user_id uuid) TO service_role;

-- log_ad_impression
REVOKE EXECUTE ON FUNCTION public.log_ad_impression(p_ad_unit_id uuid, p_placement_id uuid, p_campaign_id uuid, p_user_id uuid, p_session_id uuid, p_article_id uuid, p_page text, p_position text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.log_ad_impression(p_ad_unit_id uuid, p_placement_id uuid, p_campaign_id uuid, p_user_id uuid, p_session_id uuid, p_article_id uuid, p_page text, p_position text) TO service_role;

-- post_back_channel_message
REVOKE EXECUTE ON FUNCTION public.post_back_channel_message(p_user_id uuid, p_category_id uuid, p_body text, p_source_comment_id uuid, p_parent_id uuid, p_title text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.post_back_channel_message(p_user_id uuid, p_category_id uuid, p_body text, p_source_comment_id uuid, p_parent_id uuid, p_title text) TO service_role;

-- post_comment
REVOKE EXECUTE ON FUNCTION public.post_comment(p_user_id uuid, p_article_id uuid, p_body text, p_parent_id uuid, p_mentions jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.post_comment(p_user_id uuid, p_article_id uuid, p_body text, p_parent_id uuid, p_mentions jsonb) TO service_role;

-- post_expert_answer
REVOKE EXECUTE ON FUNCTION public.post_expert_answer(p_user_id uuid, p_queue_item_id uuid, p_body text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.post_expert_answer(p_user_id uuid, p_queue_item_id uuid, p_body text) TO service_role;

-- post_message
REVOKE EXECUTE ON FUNCTION public.post_message(p_user_id uuid, p_conversation_id uuid, p_body text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.post_message(p_user_id uuid, p_conversation_id uuid, p_body text) TO service_role;

-- preview_capabilities_as
REVOKE EXECUTE ON FUNCTION public.preview_capabilities_as(p_user_id uuid, p_section text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.preview_capabilities_as(p_user_id uuid, p_section text) TO service_role;

-- recompute_verity_score
REVOKE EXECUTE ON FUNCTION public.recompute_verity_score(p_user_id uuid, p_kid_profile_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recompute_verity_score(p_user_id uuid, p_kid_profile_id uuid) TO service_role;

-- record_failed_login
REVOKE EXECUTE ON FUNCTION public.record_failed_login(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_failed_login(p_user_id uuid) TO service_role;

-- rename_bookmark_collection
REVOKE EXECUTE ON FUNCTION public.rename_bookmark_collection(p_user_id uuid, p_collection_id uuid, p_name text, p_description text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rename_bookmark_collection(p_user_id uuid, p_collection_id uuid, p_name text, p_description text) TO service_role;

-- score_on_comment_post
REVOKE EXECUTE ON FUNCTION public.score_on_comment_post(p_user_id uuid, p_comment_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.score_on_comment_post(p_user_id uuid, p_comment_id uuid) TO service_role;

-- score_on_quiz_submit
REVOKE EXECUTE ON FUNCTION public.score_on_quiz_submit(p_user_id uuid, p_kid_profile_id uuid, p_article_id uuid, p_attempt_number integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.score_on_quiz_submit(p_user_id uuid, p_kid_profile_id uuid, p_article_id uuid, p_attempt_number integer) TO service_role;

-- score_on_reading_complete
REVOKE EXECUTE ON FUNCTION public.score_on_reading_complete(p_user_id uuid, p_kid_profile_id uuid, p_article_id uuid, p_reading_log_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.score_on_reading_complete(p_user_id uuid, p_kid_profile_id uuid, p_article_id uuid, p_reading_log_id uuid) TO service_role;

-- serve_ad
REVOKE EXECUTE ON FUNCTION public.serve_ad(p_placement_name text, p_user_id uuid, p_article_id uuid, p_session_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.serve_ad(p_placement_name text, p_user_id uuid, p_article_id uuid, p_session_id uuid) TO service_role;

-- soft_delete_comment
REVOKE EXECUTE ON FUNCTION public.soft_delete_comment(p_user_id uuid, p_comment_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.soft_delete_comment(p_user_id uuid, p_comment_id uuid) TO service_role;

-- start_kid_trial
REVOKE EXECUTE ON FUNCTION public.start_kid_trial(p_user_id uuid, p_display_name text, p_avatar_color text, p_pin_hash text, p_date_of_birth date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.start_kid_trial(p_user_id uuid, p_display_name text, p_avatar_color text, p_pin_hash text, p_date_of_birth date) TO service_role;

-- start_quiz_attempt
REVOKE EXECUTE ON FUNCTION public.start_quiz_attempt(p_user_id uuid, p_article_id uuid, p_kid_profile_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.start_quiz_attempt(p_user_id uuid, p_article_id uuid, p_kid_profile_id uuid) TO service_role;

-- submit_appeal
REVOKE EXECUTE ON FUNCTION public.submit_appeal(p_user_id uuid, p_warning_id uuid, p_text text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_appeal(p_user_id uuid, p_warning_id uuid, p_text text) TO service_role;

-- submit_expert_application
REVOKE EXECUTE ON FUNCTION public.submit_expert_application(p_user_id uuid, p_application_type text, p_full_name text, p_organization text, p_title text, p_bio text, p_expertise_areas text[], p_website_url text, p_social_links jsonb, p_credentials jsonb, p_portfolio_urls text[], p_sample_responses jsonb, p_category_ids uuid[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_expert_application(p_user_id uuid, p_application_type text, p_full_name text, p_organization text, p_title text, p_bio text, p_expertise_areas text[], p_website_url text, p_social_links jsonb, p_credentials jsonb, p_portfolio_urls text[], p_sample_responses jsonb, p_category_ids uuid[]) TO service_role;

-- submit_quiz_attempt
REVOKE EXECUTE ON FUNCTION public.submit_quiz_attempt(p_user_id uuid, p_article_id uuid, p_answers jsonb, p_kid_profile_id uuid, p_time_taken_seconds integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_quiz_attempt(p_user_id uuid, p_article_id uuid, p_answers jsonb, p_kid_profile_id uuid, p_time_taken_seconds integer) TO service_role;

-- submit_recap_attempt
REVOKE EXECUTE ON FUNCTION public.submit_recap_attempt(p_user_id uuid, p_recap_quiz_id uuid, p_answers jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_recap_attempt(p_user_id uuid, p_recap_quiz_id uuid, p_answers jsonb) TO service_role;

-- supervisor_flag_comment
REVOKE EXECUTE ON FUNCTION public.supervisor_flag_comment(p_user_id uuid, p_comment_id uuid, p_category_id uuid, p_reason text, p_description text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.supervisor_flag_comment(p_user_id uuid, p_comment_id uuid, p_category_id uuid, p_reason text, p_description text) TO service_role;

-- supervisor_opt_in
REVOKE EXECUTE ON FUNCTION public.supervisor_opt_in(p_user_id uuid, p_category_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.supervisor_opt_in(p_user_id uuid, p_category_id uuid) TO service_role;

-- supervisor_opt_out
REVOKE EXECUTE ON FUNCTION public.supervisor_opt_out(p_user_id uuid, p_category_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.supervisor_opt_out(p_user_id uuid, p_category_id uuid) TO service_role;

-- toggle_context_tag (2-arg form ONLY — 3-arg overload is out of scope per Q01)
REVOKE EXECUTE ON FUNCTION public.toggle_context_tag(p_user_id uuid, p_comment_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.toggle_context_tag(p_user_id uuid, p_comment_id uuid) TO service_role;

-- toggle_vote
REVOKE EXECUTE ON FUNCTION public.toggle_vote(p_user_id uuid, p_comment_id uuid, p_vote_type text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.toggle_vote(p_user_id uuid, p_comment_id uuid, p_vote_type text) TO service_role;

-- update_metadata
REVOKE EXECUTE ON FUNCTION public.update_metadata(p_user_id uuid, p_keys jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_metadata(p_user_id uuid, p_keys jsonb) TO service_role;

-- user_supervisor_eligible_for
REVOKE EXECUTE ON FUNCTION public.user_supervisor_eligible_for(p_user_id uuid, p_category_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.user_supervisor_eligible_for(p_user_id uuid, p_category_id uuid) TO service_role;

------------------------------------------------------------------------------
-- 3. Class B — direct-from-client, body-guarded.
--    REVOKE PUBLIC + anon, regrant authenticated. service_role retains via auto-grant.
------------------------------------------------------------------------------

-- lockdown_self
REVOKE EXECUTE ON FUNCTION public.lockdown_self(p_user_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.lockdown_self(p_user_id uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.lockdown_self(p_user_id uuid) TO service_role;

------------------------------------------------------------------------------
-- 4. Class C — direct-from-client read helpers.
--    REVOKE PUBLIC + anon, regrant authenticated. Class C parameter-drop rewrite
--    is queued as a follow-up migration.
------------------------------------------------------------------------------

-- user_is_supervisor_in
REVOKE EXECUTE ON FUNCTION public.user_is_supervisor_in(p_user_id uuid, p_category_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_is_supervisor_in(p_user_id uuid, p_category_id uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_is_supervisor_in(p_user_id uuid, p_category_id uuid) TO service_role;

-- user_passed_article_quiz
REVOKE EXECUTE ON FUNCTION public.user_passed_article_quiz(p_user_id uuid, p_article_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_passed_article_quiz(p_user_id uuid, p_article_id uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_passed_article_quiz(p_user_id uuid, p_article_id uuid) TO service_role;

-- user_passed_quiz
REVOKE EXECUTE ON FUNCTION public.user_passed_quiz(p_user_id uuid, p_article_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_passed_quiz(p_user_id uuid, p_article_id uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_passed_quiz(p_user_id uuid, p_article_id uuid) TO service_role;
