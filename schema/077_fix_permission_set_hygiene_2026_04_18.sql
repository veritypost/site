-- 077_fix_permission_set_hygiene_2026_04_18.sql
-- Migration: 20260418234320 fix_permission_set_hygiene_2026_04_18
--
-- ============================================================================
-- Permission-set hygiene sweep — 2026-04-18
-- ============================================================================
-- One-shot across all active keys in the DB. Groups:
--   Pattern A (leak anon->signed-in): 0 findings (no action)
--   Pattern B (user-facing keys admin/owner-only -> silently denies every tier):
--     - 54 keys backfilled to `free` set (all signed-in users inherit anon+unverified+free
--       via role bindings, so `free` covers the whole authenticated population)
--     - 2 keys backfilled to mod+editor (expert.queue.oversight_all_categories)
--     - 3 keys flagged, NOT fixed (supervisor.*, settings.supervisor.view) — need
--       product decision on family-plan scoping; and 5 ios.* keys not referenced in code
--   Pattern C (9+ set membership, collapse-to-anon candidates):
--     - 3 keys (home.search, home.subcategories, leaderboard.view) collapsed
--       to anon-only. anon is inherited by every signed-in role so behavior is preserved.
--   Pattern D (orphans): 1 key (comments.view) — references in code, bind to anon
--     (public read). Resolver was already returning granted=true via public fallback
--     but explicit binding is more defensible.
--
-- Everything is idempotent: DELETE uses predicate sub-selects, INSERT uses ON CONFLICT.
-- ============================================================================

DO $hygiene$
DECLARE
  v_anon       uuid := (SELECT id FROM permission_sets WHERE key='anon'       AND is_active=true);
  v_unverified uuid := (SELECT id FROM permission_sets WHERE key='unverified' AND is_active=true);
  v_free       uuid := (SELECT id FROM permission_sets WHERE key='free'       AND is_active=true);
  v_pro        uuid := (SELECT id FROM permission_sets WHERE key='pro'        AND is_active=true);
  v_family     uuid := (SELECT id FROM permission_sets WHERE key='family'     AND is_active=true);
  v_expert     uuid := (SELECT id FROM permission_sets WHERE key='expert'     AND is_active=true);
  v_moderator  uuid := (SELECT id FROM permission_sets WHERE key='moderator'  AND is_active=true);
  v_editor     uuid := (SELECT id FROM permission_sets WHERE key='editor'     AND is_active=true);
  v_admin      uuid := (SELECT id FROM permission_sets WHERE key='admin'      AND is_active=true);
  v_owner      uuid := (SELECT id FROM permission_sets WHERE key='owner'      AND is_active=true);

  -- Target permission ids.
  k_appeals_submit                        uuid := (SELECT id FROM permissions WHERE key='appeals.submit');
  k_appeals_view_own                      uuid := (SELECT id FROM permissions WHERE key='appeals.view_own');
  k_article_bookmark_remove               uuid := (SELECT id FROM permissions WHERE key='article.bookmark.remove');
  k_article_experts_answered_see_count    uuid := (SELECT id FROM permissions WHERE key='article.experts_answered.see_count');
  k_article_media_expand                  uuid := (SELECT id FROM permissions WHERE key='article.media.expand');
  k_article_share_copy_link               uuid := (SELECT id FROM permissions WHERE key='article.share.copy_link');
  k_article_share_external                uuid := (SELECT id FROM permissions WHERE key='article.share.external');
  k_article_timeline_follow_link          uuid := (SELECT id FROM permissions WHERE key='article.timeline.follow_link');
  k_billing_payment_change_method         uuid := (SELECT id FROM permissions WHERE key='billing.payment.change_method');
  k_billing_plans_view                    uuid := (SELECT id FROM permissions WHERE key='billing.plans.view');
  k_bookmarks_filter_by_category          uuid := (SELECT id FROM permissions WHERE key='bookmarks.filter_by_category');
  k_bookmarks_list_view                   uuid := (SELECT id FROM permissions WHERE key='bookmarks.list.view');
  k_bookmarks_quota_view                  uuid := (SELECT id FROM permissions WHERE key='bookmarks.quota.view');
  k_bookmarks_search                      uuid := (SELECT id FROM permissions WHERE key='bookmarks.search');
  k_comments_author_open_profile          uuid := (SELECT id FROM permissions WHERE key='comments.author.open_profile');
  k_comments_badge_view                   uuid := (SELECT id FROM permissions WHERE key='comments.badge.view');
  k_comments_block_list                   uuid := (SELECT id FROM permissions WHERE key='comments.block.list');
  k_comments_context_tag_remove           uuid := (SELECT id FROM permissions WHERE key='comments.context_tag.remove');
  k_comments_downvotes_view               uuid := (SELECT id FROM permissions WHERE key='comments.downvotes.view');
  k_comments_upvotes_view                 uuid := (SELECT id FROM permissions WHERE key='comments.upvotes.view');
  k_comments_vote_remove                  uuid := (SELECT id FROM permissions WHERE key='comments.vote.remove');
  k_expert_queue_oversight_all_categories uuid := (SELECT id FROM permissions WHERE key='expert.queue.oversight_all_categories');
  k_leaderboard_privacy_toggle            uuid := (SELECT id FROM permissions WHERE key='leaderboard.privacy.toggle');
  k_permissions_version_get               uuid := (SELECT id FROM permissions WHERE key='permissions.version.get');
  k_profile_achievements_view_other       uuid := (SELECT id FROM permissions WHERE key='profile.achievements.view.other');
  k_profile_achievements_view_own         uuid := (SELECT id FROM permissions WHERE key='profile.achievements.view.own');
  k_profile_activity_view_own             uuid := (SELECT id FROM permissions WHERE key='profile.activity.view.own');
  k_profile_avatar_upload                 uuid := (SELECT id FROM permissions WHERE key='profile.avatar.upload');
  k_profile_bio_edit                      uuid := (SELECT id FROM permissions WHERE key='profile.bio.edit');
  k_profile_card_share_link               uuid := (SELECT id FROM permissions WHERE key='profile.card.share_link');
  k_profile_card_view                     uuid := (SELECT id FROM permissions WHERE key='profile.card.view');
  k_profile_display_name_edit             uuid := (SELECT id FROM permissions WHERE key='profile.display_name.edit');
  k_profile_followers_view_other          uuid := (SELECT id FROM permissions WHERE key='profile.followers.view.other');
  k_profile_followers_view_own            uuid := (SELECT id FROM permissions WHERE key='profile.followers.view.own');
  k_profile_following_view_other          uuid := (SELECT id FROM permissions WHERE key='profile.following.view.other');
  k_profile_following_view_own            uuid := (SELECT id FROM permissions WHERE key='profile.following.view.own');
  k_profile_radar_view_own                uuid := (SELECT id FROM permissions WHERE key='profile.radar.view.own');
  k_profile_score_view_own_categories     uuid := (SELECT id FROM permissions WHERE key='profile.score.view.own.categories');
  k_profile_score_view_own_subcategories  uuid := (SELECT id FROM permissions WHERE key='profile.score.view.own.subcategories');
  k_profile_score_view_own_total          uuid := (SELECT id FROM permissions WHERE key='profile.score.view.own.total');
  k_profile_username_edit                 uuid := (SELECT id FROM permissions WHERE key='profile.username.edit');
  k_profile_view_own                      uuid := (SELECT id FROM permissions WHERE key='profile.view.own');
  k_profile_view_public                   uuid := (SELECT id FROM permissions WHERE key='profile.view.public');
  k_push_invalidate_token                 uuid := (SELECT id FROM permissions WHERE key='push.invalidate_token');
  k_search_history_clear                  uuid := (SELECT id FROM permissions WHERE key='search.history.clear');
  k_search_history_view                   uuid := (SELECT id FROM permissions WHERE key='search.history.view');
  k_settings_accessibility_font_size      uuid := (SELECT id FROM permissions WHERE key='settings.accessibility.font_size');
  k_settings_appearance_theme             uuid := (SELECT id FROM permissions WHERE key='settings.appearance.theme');
  k_settings_data_deletion_request        uuid := (SELECT id FROM permissions WHERE key='settings.data.deletion.request');
  k_settings_data_export_download         uuid := (SELECT id FROM permissions WHERE key='settings.data.export.download');
  k_settings_data_export_request          uuid := (SELECT id FROM permissions WHERE key='settings.data.export.request');
  k_settings_data_export_status           uuid := (SELECT id FROM permissions WHERE key='settings.data.export.status');
  k_settings_expert_view                  uuid := (SELECT id FROM permissions WHERE key='settings.expert.view');
  k_settings_language_set                 uuid := (SELECT id FROM permissions WHERE key='settings.language.set');
  k_support_ticket_list_own               uuid := (SELECT id FROM permissions WHERE key='support.ticket.list.own');
  k_support_ticket_reply_own              uuid := (SELECT id FROM permissions WHERE key='support.ticket.reply.own');
  k_support_ticket_view_own               uuid := (SELECT id FROM permissions WHERE key='support.ticket.view.own');

  k_home_search      uuid := (SELECT id FROM permissions WHERE key='home.search');
  k_home_subcats     uuid := (SELECT id FROM permissions WHERE key='home.subcategories');
  k_leaderboard_view uuid := (SELECT id FROM permissions WHERE key='leaderboard.view');

  k_comments_view    uuid := (SELECT id FROM permissions WHERE key='comments.view');
BEGIN
  -- Pattern B: backfill user-facing keys to `free`.
  INSERT INTO permission_set_perms (permission_set_id, permission_id)
  VALUES
    (v_free, k_appeals_submit),
    (v_free, k_appeals_view_own),
    (v_free, k_article_bookmark_remove),
    (v_free, k_article_experts_answered_see_count),
    (v_free, k_article_media_expand),
    (v_free, k_article_share_copy_link),
    (v_free, k_article_share_external),
    (v_free, k_article_timeline_follow_link),
    (v_free, k_billing_payment_change_method),
    (v_free, k_billing_plans_view),
    (v_free, k_bookmarks_filter_by_category),
    (v_free, k_bookmarks_list_view),
    (v_free, k_bookmarks_quota_view),
    (v_free, k_bookmarks_search),
    (v_free, k_comments_author_open_profile),
    (v_free, k_comments_badge_view),
    (v_free, k_comments_block_list),
    (v_free, k_comments_context_tag_remove),
    (v_free, k_comments_downvotes_view),
    (v_free, k_comments_upvotes_view),
    (v_free, k_comments_vote_remove),
    (v_free, k_leaderboard_privacy_toggle),
    (v_free, k_profile_achievements_view_other),
    (v_free, k_profile_achievements_view_own),
    (v_free, k_profile_activity_view_own),
    (v_free, k_profile_avatar_upload),
    (v_free, k_profile_bio_edit),
    (v_free, k_profile_card_share_link),
    (v_free, k_profile_card_view),
    (v_free, k_profile_display_name_edit),
    (v_free, k_profile_followers_view_other),
    (v_free, k_profile_followers_view_own),
    (v_free, k_profile_following_view_other),
    (v_free, k_profile_following_view_own),
    (v_free, k_profile_radar_view_own),
    (v_free, k_profile_score_view_own_categories),
    (v_free, k_profile_score_view_own_subcategories),
    (v_free, k_profile_score_view_own_total),
    (v_free, k_profile_username_edit),
    (v_free, k_profile_view_own),
    (v_free, k_profile_view_public),
    (v_free, k_push_invalidate_token),
    (v_free, k_search_history_clear),
    (v_free, k_search_history_view),
    (v_free, k_settings_accessibility_font_size),
    (v_free, k_settings_appearance_theme),
    (v_free, k_settings_data_deletion_request),
    (v_free, k_settings_data_export_download),
    (v_free, k_settings_data_export_request),
    (v_free, k_settings_data_export_status),
    (v_free, k_settings_expert_view),
    (v_free, k_settings_language_set),
    (v_free, k_support_ticket_list_own),
    (v_free, k_support_ticket_reply_own),
    (v_free, k_support_ticket_view_own)
  ON CONFLICT DO NOTHING;

  INSERT INTO permission_set_perms (permission_set_id, permission_id)
  VALUES (v_anon, k_permissions_version_get)
  ON CONFLICT DO NOTHING;

  INSERT INTO permission_set_perms (permission_set_id, permission_id)
  VALUES
    (v_moderator, k_expert_queue_oversight_all_categories),
    (v_editor,    k_expert_queue_oversight_all_categories)
  ON CONFLICT DO NOTHING;

  -- Pattern C: collapse redundant keys to anon-only.
  DELETE FROM permission_set_perms
  WHERE permission_id IN (k_home_search, k_home_subcats, k_leaderboard_view)
    AND permission_set_id <> v_anon;

  INSERT INTO permission_set_perms (permission_set_id, permission_id)
  VALUES
    (v_anon, k_home_search),
    (v_anon, k_home_subcats),
    (v_anon, k_leaderboard_view)
  ON CONFLICT DO NOTHING;

  -- Pattern D: orphan comments.view.
  INSERT INTO permission_set_perms (permission_set_id, permission_id)
  VALUES (v_anon, k_comments_view)
  ON CONFLICT DO NOTHING;
END
$hygiene$;

UPDATE perms_global_version SET version = version + 1, bumped_at = now();
