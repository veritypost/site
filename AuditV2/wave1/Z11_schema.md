# Zone Z11: schema/

## Summary

178 SQL files in `schema/`: 169 numbered forward migrations + 1 disaster-recovery rebuild + 8 paired forward/rollback migrations under the F7 era and beyond. Files 005..177 form the canonical chain. Numbering is sequential with three intentional gaps (001-004, 007-008, 092-093, 100). Every file from 095 onward (kids JWT system, F7 pipeline, newsroom redesign, ext-audit fixes) is paired with an explicit `NNN_rollback_*.sql` companion. The disaster-recovery file `reset_and_rebuild_v2.sql` is a single-paste full rebuild from scratch (90 base tables + base RPCs + RLS + seeds) gated by a `vp.allow_destroy='yes'` GUC; later numbered migrations layer on top of it. The `snapshots/snapshot-2026-04-18-pre-perms-import.sql` file is empty (0 lines) — placeholder. Live `supabase_migrations.schema_migrations` tracks only 44 entries (through 20260420020544 = migration 099); per CLAUDE.md `MCP-verify schema, never trust supabase_migrations log` — the gap between tracked entries and on-disk files is expected because most files are applied via SQL editor paste, not `apply_migration`.

The chain shows a clear evolution:
- 005-031: Phase rollout (3-22), the original launch sprint covering billing, quizzes, comments, expert system, bookmarks, T&S, family, ads, notifications, scoring, deletion, GDPR, onboarding.
- 032-051: Bugfixes + small features layered on Phase output.
- 053-091: Pre-launch security + permission audit (round 4..8) including users-table privileged-update guard, search_path hardening, counter RPC lockdown, atomic rate limit, kid PIN salt, sub-RLS hardening.
- 094-099: Kid JWT auth model (custom-minted, RLS branches on `is_kid_delegated()`).
- 101-107: Seeds (rate_limits, email templates, reserved usernames, blocked words, RSS feeds).
- 108-110: Events pipeline + AdSense adapter.
- 111: Self-correction rollback of 109's accidentally-parallel score ledger.
- 114-127: F7 pipeline foundation + newsroom redesign (kid_articles + kid_sources + kid_timelines + kid_quizzes mirror tables, ai_models, ai_prompt_overrides, ai_prompt_presets, discovery_items + kid_discovery_items, persist_generated_article RPC, cluster mutation RPCs).
- 128-145: Polish + bug-hunt fixes (anon EXECUTE on is_kid_delegated, plan metadata caps, achievement rewrite, reading_log scoring trigger, defense-in-depth kid blocks, FK CASCADE → SET NULL cleanup, dead-RPC drops, profile/leaderboard ship, hero_pick).
- 146-177: Tier-1/Tier-2 audit fixes through 2026-04-25 (verify_password rate limit, billing perms_version bumps, DM error prefixes, kid family leaderboard, locked-decisions enforcement, RLS classification on 6 tables, GDPR export completeness, ai_models grant fix).

## Migration count and numbering

- Sequential range: 005..177 (note: 005 is the first file; pre-005 migrations folded into reset_and_rebuild_v2.sql section markers `001_schema.sql`, `002_seed.sql`, `003_rls_policies.sql`, `004_rpc_functions.sql`, `007_category_scores.sql`, `008_fix_scores.sql`).
- Gaps:
  - 001-004 (folded into reset_and_rebuild_v2.sql header sections)
  - 007-008 (folded into reset_and_rebuild_v2.sql)
  - 092, 093 (numbers reserved per migration log entries `092_rls_lockdown_2026_04_19`, `092b_rls_lockdown_followup_2026_04_19`, `093_rpc_actor_lockdown_2026_04_19` — these landed in DB via `apply_migration` MCP path but the on-disk SQL files were not committed to repo. Subsequent files start at 094.)
  - 100 (skipped; CLAUDE.md notes `100_backfill_admin_rank_rpcs_*.sql` as a backfill of live RPCs, not a real migration — the file does not exist on disk in this snapshot)
- Out-of-order numbers: none. All on-disk filenames sort consistently with their date stamps.
- Rollback companions (NNN paired with NNN+1): 112↔113, 114↔115, 116↔117, 118↔119, 120↔121, 122↔123, 124↔125, 126↔127, 128↔129, 130↔131, 132↔133, 134↔135, 136↔137, 138↔139, 140↔141, 142↔143, 144↔145, 146↔147, 148↔149.

## Per-migration index (every file)

### 005_test_content.sql
- Inserts: 2 kid_profiles + 16 articles across categories. Test seed only.
- Notes: hardcoded UUIDs for parent + author (test_family / e411d105-786c…).

### 006_test_comments.sql
- Inserts: random comments, reading_log, comment_votes, follows. Updates derived counts (comment_count, view_count, followers_count, following_count).
- Notes: random data via `ORDER BY random()` — non-deterministic seed.

### 009_test_timelines.sql
- Inserts: timelines rows for 6 named test article slugs.

### 010_fix_user_roles.sql
- Inserts: user_roles rows (owner / superadmin / admin / editor / moderator / expert / educator / journalist / user) on test accounts.
- Notes: pre-removal of superadmin (later dropped in 105).

### 011_phase3_billing_helpers.sql
- Creates RPCs: `user_has_dm_access`, `billing_cancel_subscription`, `billing_freeze_profile`, `billing_freeze_expired_grace`, `billing_resubscribe`, `billing_change_plan`.
- Notes: D40 7-day grace + freeze; bodies later modified by 024 (kid trial convert), 148 (perms_version bump), 157 (idempotent on frozen).

### 012_phase4_quiz_helpers.sql
- Creates RPCs: `article_quiz_pool_size`, `user_article_attempts`, `user_passed_article_quiz`, `start_quiz_attempt`, `submit_quiz_attempt`.
- Notes: 5-of-10 quiz model + 3/5 pass threshold (D1, D6, D8, D41).

### 013_phase5_comments_helpers.sql
- Creates RPCs: `can_user_see_discussion`, `_setting_int`, `post_comment`, `toggle_vote`, `toggle_context_tag`, `soft_delete_comment`, `edit_comment`.
- Inserts settings: `context_pin_min_count`, `context_pin_percent`, `comment_max_depth=2` (later overridden in 033 to keep 2), `comment_max_length=4000`.
- Notes: `post_comment` body re-declared by 023 (mute check), 025 (kid trial convert hits change_plan/resubscribe).

### 014_phase6_expert_helpers.sql
- Creates RPCs: `is_user_expert`, `expert_can_see_back_channel`, `is_expert_in_probation`, `submit_expert_application`, `approve_expert_application`, `reject_expert_application`, `ask_expert`, `claim_queue_item`, `decline_queue_item`, `post_expert_answer`, `approve_expert_answer`, `post_back_channel_message`, `mark_probation_complete`.
- Notes: D3, D8, D20 (Pro+ ask), D33 (back-channel). `ask_expert` body re-declared by 034 (widen to all paid). `approve_expert_answer` re-declared by 167 (notify asker).

### 015_phase7_helpers.sql
- Creates RPCs: `_user_is_paid`, `enforce_bookmark_cap` trigger, `bookmark_collection_count_sync` trigger, `create_bookmark_collection`, `rename_bookmark_collection`, `delete_bookmark_collection`, `toggle_follow`.
- Notes: D13 bookmarks, D28 follows (later widened with block-aware check in 167). `enforce_bookmark_cap` body re-declared by 132 (read from plans.metadata) and 133 (rollback).

### 016_phase8_trust_safety.sql
- Inserts settings: `supervisor_eligibility_score=500`.
- Creates RPCs: `user_supervisor_eligible_for`, `user_is_supervisor_in`, `supervisor_opt_in`, `supervisor_opt_out`, `supervisor_flag_comment`, `_user_is_moderator`, `hide_comment`, `unhide_comment`, `apply_penalty`, `resolve_report`, `submit_appeal`, `resolve_appeal`, `grant_role`, `revoke_role`.
- Notes: D22, D30, progressive penalty stack. `hide_comment`/`unhide_comment`/`apply_penalty`/`resolve_report`/`resolve_appeal`/`grant_role`/`revoke_role` re-declared by 026 (audit_log writes) and 086 (lockdown).

### 017_phase9_family.sql
- Alters `kid_profiles`: adds `streak_freeze_remaining`, `streak_freeze_week_start`.
- Creates RPCs: `start_kid_trial`, `freeze_kid_trial`, `sweep_kid_trial_expiries`, `convert_kid_trial`, `use_kid_streak_freeze`, `family_members`, `family_weekly_report`, `is_family_owner`.
- Notes: D9, D12, D19, D24, D34, D44. `freeze_kid_trial` body re-declared by 106 (notify parent).

### 018_phase10_ads.sql
- Creates RPCs: `_user_tier_or_anon`, `serve_ad`, `log_ad_impression`, `log_ad_click`.
- Index: `idx_ad_daily_stats_unit_placement_date` UNIQUE.
- Notes: D23. `serve_ad` re-declared by 025 (targeting_categories), 110 (AdSense adapter `ad_network` + `ad_network_unit_id`).

### 019_phase11_notifications.sql
- Inserts settings: `breaking_alert_cap_free=1`.
- Index: `idx_email_templates_key_unique` UNIQUE.
- Inserts email_templates: `weekly_reading_report`, `weekly_family_report`, `breaking_news_alert`, `kid_trial_day6`, `kid_trial_expired`.
- Updates email_templates: deactivates `morning_digest`, `daily_digest`, `category_alert`, `category_digest`, `weekly_digest` (D25).
- Creates RPCs: `breaking_news_quota_check`, `create_notification`, `send_breaking_news`, `weekly_reading_report`, `submit_recap_attempt`.
- Notes: `submit_recap_attempt` body re-declared by 025 (UNIQUE+UPSERT), 169 (award_points wire). `send_breaking_news` body re-declared by 026 (keyset paging).

### 020_phase12_cutover.sql
- Inserts feature_flags: `v2_live` enabled.

### 021_phase13_cleanup.sql
- Drops tables: `community_note_votes`, `community_notes`, `reactions`. CASCADE.

### 022_phase14_scoring.sql
- Creates table: `score_events` (subject XOR check, dedupe partial unique indexes).
- Alters users: adds `streak_freeze_week_start`.
- RLS: `score_events_select_own` (user OR parent of kid).
- Creates RPCs: `_user_freeze_allowance`, `_subject_local_today`, `award_points`, `advance_streak`, `score_on_quiz_submit`, `score_on_reading_complete`, `score_on_comment_post`, `recompute_verity_score`.
- Notes: launch-blocker scoring rebuild. `award_points` re-declared by 168 (advisory lock).

### 023_phase15_mute_checks.sql
- Creates RPCs: `_user_is_comment_blocked`, `_user_is_dm_blocked`. Re-declares `post_comment` (mute gate).
- RLS: replaces `messages_insert` policy with DM-block check.

### 024_phase15_kid_trial_convert.sql
- Re-declares `billing_change_plan` and `billing_resubscribe` to call `convert_kid_trial` on Family transitions.

### 025_phase17_fixes.sql
- Index: `idx_weekly_recap_attempts_quiz_user` UNIQUE.
- Re-declares: `submit_recap_attempt` (UPSERT), `serve_ad` (targeting + reduced-tier coin-flip), `log_ad_impression`, `log_ad_click` (CPM/CPC math), `recompute_family_achievements`.

### 026_phase18_sql.sql
- Re-declares with `audit_log` inserts: `hide_comment`, `unhide_comment`, `apply_penalty`, `resolve_report`, `resolve_appeal`, `grant_role`, `revoke_role`. Re-declares `send_breaking_news` (keyset paging in 1k chunks).

### 027_phase19_deletion.sql
- Creates RPCs: `schedule_account_deletion`, `cancel_account_deletion`, `anonymize_user`, `sweep_expired_deletions`. `anonymize_user` body re-declared by 086 (self-anon guard) and 088 (cron-safe guard refinement).

### 028_phase19_data_export.sql
- Inserts storage.buckets row `data-exports` (private).
- Creates RPCs: `export_user_data`, `claim_next_export_request`. `export_user_data` re-declared by 176 (ext-X.8 completeness — 9 added tables).

### 029_phase21_onboarding.sql
- Alters users: adds `onboarding_completed_at`. Backfills from `email_verified_at` / `created_at`.

### 030_phase22_error_logs.sql
- Creates table: `error_logs`.
- Indexes: `idx_error_logs_occurred_at`, `..._severity_occurred`, `..._user_id` (partial).
- RLS: `error_logs_select_own` (user OR admin).

### 031_phase22_quiet_hours.sql
- Creates RPC: `_is_in_quiet_hours` (extracted from `create_notification`).

### 032_seed_test_articles.sql
- Inserts: 5 articles + 12 quizzes each.

### 033_comment_depth_2.sql
- Updates settings: `comment_max_depth=2`.

### 034_bugfix_ask_expert_tier.sql
- Re-declares `ask_expert` widening tier to verity/verity_pro/verity_family/verity_family_xl.

### 035_kid_trial_perms.sql
- Re-declares `my_permission_keys(uuid, text)` to grant `family_perks` set during open kid trial window.
- Calls `bump_perms_global_version`.

### 036_ios_subscription_plans.sql
- Updates plans: 8 paid SKUs get `apple_product_id`.

### 037_user_push_tokens.sql
- Creates table: `user_push_tokens`.
- Index: `idx_user_push_tokens_active_user` (partial).
- RLS: `user_push_tokens_select_own`.
- Creates RPCs: `upsert_user_push_token`, `invalidate_user_push_token`.

### 038_messages_unread.sql
- Index: `idx_conversation_participants_user_conv` (partial).
- Creates RPC: `get_unread_counts`.

### 039_message_receipts_rls.sql
- Re-declares `message_receipts_select` policy: receiver OR sender.

### 040_data_export_email_template.sql
- Updates email_templates row `data_export_ready` body + variables.

### 041_expert_reverification.sql
- Alters `expert_applications`: adds `reverification_notified_at`.
- Inserts/updates email_templates: `expert_reverification_due`.
- Creates RPC: `flag_expert_reverifications_due`.

### 042_family_achievements_coadult.sql
- Re-declares `recompute_family_achievements` to fold in co-adults via `subscriptions.family_owner_id`.

### 043_conversations_realtime_publication.sql
- Adds `conversations` table to `supabase_realtime` publication.

### 044_dm_read_receipts_enabled.sql
- Alters users: adds `dm_read_receipts_enabled` (default true).

### 045_fix_bookmarks_rls.sql
- Replaces `bookmarks_insert` policy: ownership-only (cap enforced by trigger from 015).

### 046_articles_search_fts.sql
- Alters articles: adds `search_tsv` GENERATED tsvector column.
- Index: `articles_search_tsv_gin`.

### 047_follows_paid_only.sql
- Replaces `follows_insert` policy: paid + verified + not banned.

### 048_normalize_kid_category_names.sql
- Updates categories: strips parenthesised "(kids)/(kid)", trailing/leading "kids /kid " from name.

### 049_post_message_rpc.sql
- Creates RPC: `post_message` (paid gate + DM mute + body bounds + 30/min rate limit).

### 050_check_user_achievements.sql
- Index: `user_achievements_user_ach_unique` (partial).
- Creates RPC: `check_user_achievements`. Body re-declared by 132 (broadens criteria vocabulary, removes `passed` reference).

### 051_user_category_metrics_rpc.sql
- Alters articles: adds `subcategory_id` (uuid FK to categories).
- Index: `idx_articles_subcategory_id` (partial).
- Creates RPC: `get_user_category_metrics`.

### 053_resolve_username_to_email_rpc.sql
- Creates RPC: `resolve_username_to_email`. Granted to anon + authenticated. Later revoked from anon/authenticated by 060.

### 054_user_account_lockout.sql
- Alters users: adds `locked_until`, `failed_login_count` (idempotent — already in base schema).
- Creates RPCs: `record_failed_login`, `clear_failed_login`, `get_user_lockout_by_email`, `record_failed_login_by_email`, `is_email_registered`.

### 055_admin_audit_log.sql
- Creates table: `admin_audit_log` + 4 indexes.
- RLS: `admin_audit_log_select` (admin or above).
- Creates RPC: `record_admin_action`.

### 056_verity_score_rpcs.sql
- Re-declares `increment_field`: hardcoded 5-pair allowlist (articles.view/share/comment/bookmark_count, users.login_count). Magnitude bound ±1000. EXECUTE revoked from anon/authenticated.

### 057_rpc_lockdown.sql
- DO block: ALTER FUNCTION ... SET search_path = public on every SECURITY DEFINER function in public schema (47 funcs).
- Counter RPC lockdown: REVOKE EXECUTE on 7 funcs from anon/authenticated.
- Alters `rate_limit_events`: adds `key text`, drops NOT NULL on legacy cols.
- Index: `idx_rate_limit_events_key_created_at` (partial).
- Creates RPC: `check_rate_limit` (advisory_xact_lock + atomic count+insert). Granted anon/authenticated/service_role.

### 058_kid_pin_salt.sql
- Alters kid_profiles: adds `pin_salt`, `pin_hash_algo` (default 'sha256').

### 059_billing_hardening.sql
- Replaces `subscriptions_insert` and `subscriptions_update` RLS policies: admin-only WITH CHECK / USING.
- Creates RPC: `billing_uncancel_subscription` (mirror of `billing_cancel_subscription`; service-role only).

### 060_resolve_username_anon_revoke.sql
- REVOKE EXECUTE on `resolve_username_to_email` from anon/authenticated; service-role only.

### 061_kid_paused_at.sql
- Alters kid_profiles: adds `paused_at`.
- Index: `idx_kid_profiles_paused_at` (partial WHERE paused_at IS NULL).

### 062_kid_global_leaderboard_opt_in.sql
- Alters kid_profiles: adds `global_leaderboard_opt_in` boolean default false.
- Index: `idx_kid_profiles_global_leaderboard_opt_in` (partial).

### 063_kid_expert_session_rls.sql
- Adds RLS policies: `kid_expert_sessions_select_public/expert/mod`, `kid_expert_questions_select_parent/expert/mod`.

### 064_compute_effective_perms.sql
- Creates RPC: `compute_effective_perms(uuid)`. 5-layer resolver (scope_override → user_set → public → role → plan), banned-allowlist branch.

### 065_restrict_users_table_privileged_updates_2026_04_19.sql
- Creates RPC: `reject_privileged_user_updates` (SECURITY INVOKER). Trigger `trg_users_reject_privileged_updates` BEFORE UPDATE.
- Re-declared by 082 (idempotency reapply), 083 (BEFORE INSERT branch), 084 (allow column defaults on INSERT).

### 066_add_award_reading_points_rpc_2026_04_19.sql
- Creates RPC: `award_reading_points(uuid)` — server-authoritative read scoring for iOS.

### 067_add_post_signup_user_roles_trigger_2026_04_19.sql
- Re-declares `handle_new_auth_user`: resolves free plan + seeds 'user' role on every non-first signup.
- Body re-declared by 094 (N-03 owner-bootstrap hijack guard).

### 068_round4_permission_key_cleanup.sql
- Inserts permissions: `profile.expert.badge.view`. Binds to anon + every signed-in tier.
- Deactivates 5 dup keys (`billing.frozen.banner.view`, `profile.activity.view`, `profile.activity.view.own`, `leaderboard.global.view`, `leaderboard.global.full.view`).
- Idempotent re-insert of `notifications.mark_read`/`mark_all_read` perms.
- Bumps perms_global_version.

### 069_start_conversation_rpc_2026_04_18.sql
- Creates RPC: `start_conversation`. Re-declared by 089 (idempotency reapply), 150 (error prefixes).

### 070_create_support_ticket_rpc_2026_04_18.sql
- Creates RPC: `create_support_ticket`.

### 071_fix_article_reading_bindings.sql
- Permission_set_perms: `article.read.log` added to `free`. `article.view.ad_free` removed from `anon`, added to `pro/family/expert/admin/owner`.

### 072_fix_anon_leak_bindings.sql
- Removes 4 leak bindings from `anon` set: `article.ad_slot.view.paid`, `article.editorial_cost.view`, `article.other_scores.view`, plus `profile.categories`+`profile.header_stats` (collapsed to anon-only).

### 073_fix_home_breaking_banner_paid.sql
- Removes `home.breaking_banner.view.paid` from anon; adds to pro/family/expert/admin/owner.

### 074_bump_user_perms_version_atomic_security.sql
- Re-declares `bump_user_perms_version(uuid)` as SECURITY DEFINER with internal admin/service-role gate.

### 075_fix_notifications_core_bindings.sql
- Backfills 8 notifications.* perms onto free/pro/family/expert/moderator/editor.

### 076_fix_settings_leak_bindings.sql
- DO block: 32 `settings.*`/`billing.*` core keys to all-signed-in tiers; 4 pro-only keys to pro+ tiers. Bumps perms_version on every user row.

### 077_fix_permission_set_hygiene_2026_04_18.sql
- DO block hygiene sweep: 54 keys backfilled to `free` (Pattern B), 2 keys to mod+editor (`expert.queue.oversight_all_categories`), 3 keys collapsed to anon-only (`home.search`, `home.subcategories`, `leaderboard.view`), 1 orphan bound (`comments.view`).

### 078_fix_billing_bindings_2026_04_18.sql
- Backfills 8 billing.* keys onto pro+ tiers; 3 onto `free` for upgrade UX.

### 079_drop_role_permissions_table_2026_04_18.sql
- Drops table: `role_permissions` CASCADE.

### 080_fix_editor_access_regression_2026_04_18.sql
- Adds 10 admin.* permissions to the `editor` set.

### 081_deactivate_duplicate_billing_keys_2026_04_18.sql
- Deactivates `billing.cancel`, `billing.invoices.view`.

### 082_restrict_users_table_privileged_updates_v2_2026_04_19.sql
- Re-declares `reject_privileged_user_updates` (corrected: SECURITY INVOKER, not DEFINER).

### 083_restrict_users_table_privileged_inserts_2026_04_19.sql
- Re-declares `reject_privileged_user_updates` to also guard INSERTs. Trigger now BEFORE INSERT OR UPDATE.

### 084_restrict_users_table_privileged_inserts_v2_2026_04_19.sql
- Re-declares `reject_privileged_user_updates` allowing column defaults on INSERT (`plan_status='free'`, `perms_version=1`, `mute_level=0`).

### 085_add_update_own_profile_rpc_2026_04_19.sql
- Creates RPC: `update_own_profile(jsonb)` — 20-column allowlist + metadata deep-merge. Re-declared by 152 (freeze username after first set).

### 086_lock_down_admin_rpcs_2026_04_19.sql
- REVOKE EXECUTE from PUBLIC/anon/authenticated on 14 admin-surface RPCs. Re-declares `anonymize_user` with self-anon guard.

### 087_tighten_pso_select_rls_2026_04_19.sql
- Replaces `pso_select` policy: admin OR (scope='user' AND scope_id=auth.uid()).

### 088_anonymize_user_guard_cron_safe_2026_04_19.sql
- Re-declares `anonymize_user`: relaxed self-anon guard so cron (auth.uid IS NULL) passes.

### 089_start_conversation_rpc_2026_04_19_reapply.sql
- Idempotency reapply of `start_conversation` (no body changes vs 069).

### 090_fix_round8_permission_drift_2026_04_19.sql
- Reactivates `profile.activity.view.own`. Binds 4 ios.* + 3 supervisor.* keys to appropriate sets.
- Deactivates 4 dup keys (`billing.stripe.portal`, `kids.streak.use_freeze`, `kids.leaderboard.global_opt_in`, `kids.leaderboard.global.opt_in`).

### 091_get_own_login_activity_rpc_2026_04_18.sql
- Creates RPC: `get_own_login_activity(int)`.

### 094_round_e_auth_integrity_2026_04_19.sql
- Re-declares `handle_new_auth_user`: N-03 guard (force non-bootstrap when owner exists).

### 095_kid_pair_codes_2026_04_19.sql
- Creates table: `kid_pair_codes`.
- Indexes: `kid_pair_codes_parent_idx`, `kid_pair_codes_live_idx` (partial).
- RLS: `kpc_select` (parent's own), `kpc_insert` (parent self-insert).
- Creates RPCs: `generate_kid_pair_code(uuid)`, `redeem_kid_pair_code(text, text)`.

### 096_kid_jwt_rls_2026_04_19.sql
- Creates RPC: `is_kid_delegated()`.
- Adds RLS: `kid_profiles_select_kid_jwt`, `reading_log_select_kid_jwt`/`insert_kid_jwt`, `quiz_attempts_select_kid_jwt`/`insert_kid_jwt`. RESTRICTIVE `users_select_block_kid_jwt`.

### 097_kid_jwt_rls_extended_2026_04_19.sql
- Adds RLS kid-JWT SELECT on `user_achievements`, `category_scores`, `kid_category_permissions`, `kid_expert_questions` (SELECT + INSERT).

### 098_kid_jwt_leaderboard_reads_2026_04_19.sql
- Adds RLS kid-JWT SELECT on `kid_profiles` for siblings (parent_user_id JWT claim) + global leaderboard opt-in.

### 099_rls_hardening_kid_jwt_2026_04_19.sql
- Adds RESTRICTIVE policies blocking kid JWT on 14 tables: messages, message_receipts, conversations, conversation_participants, notifications, user_push_tokens, subscriptions, data_requests, support_tickets, error_logs, admin_audit_log, user_roles, expert_applications, sponsors, ad_campaigns, ad_placements. Adds `kid_expert_sessions_select_kid_jwt` (scheduled|live|completed).

### 101_seed_rate_limits.sql
- Inserts 32 rows into rate_limits (covers auth, account/profile, moderation, billing, expert, support, kids iOS, ads).

### 102_seed_data_export_ready_email_template.sql
- Upserts email_templates row `data_export_ready`.

### 103_seed_reserved_usernames.sql
- Inserts ~80 system/brand/route reserved usernames.

### 104_seed_blocked_words.sql
- Inserts ~35 blocked_words rows (medium 'flag' + high 'deny').

### 105_remove_superadmin_role.sql
- Reassigns user_roles superadmin→admin (except test_superadmin). Deletes `superadmin@test.veritypost.com` user. Drops `superadmin` role row + role_permission_sets.
- Bumps perms_global_version.

### 106_kid_trial_freeze_notification.sql
- Re-declares `freeze_kid_trial(uuid)`: emits `kid_trial_expired` notification to parent.

### 107_seed_rss_feeds.sql
- Inserts 234 rows into feeds (102 RSS active + 76 site inactive + 56 api inactive).

### 108_events_pipeline.sql
- Creates table: `events` (PARTITION BY RANGE on occurred_at). Default partition `events_default`. Today + tomorrow seeded.
- 6 indexes on parent (cascade to partitions).
- RLS enabled, no policies (service role only).
- Creates RPCs: `create_events_partition_for(date)`, `drop_old_events_partitions(int)`. Optional pg_cron jobs `events-create-next-partition`, `events-drop-old-partitions`.
- View: `events_24h_summary`.

### 109_verity_score_events.sql
- Creates table: `verity_score_events` (parallel ledger). 3 indexes (1 unique partial, 2 regular). RLS `users read own`.
- Creates RPC: `increment_verity_score`. Quiz-pass trigger `quiz_attempt_score` AFTER INSERT on `quiz_attempts`. RPC `reconcile_verity_scores`.
- Backfills `backfill_initial` rows.
- Notes: SUPERSEDED by 111 (parallel-ledger rollback after recognising the existing `score_events`/`award_points` system).

### 110_adsense_adapter.sql
- Re-declares `serve_ad`: adds `ad_network` + `ad_network_unit_id` to response.

### 111_rollback_parallel_score_ledger.sql
- Drops trigger `quiz_attempt_score`, function `on_quiz_attempt_score()`. Subtracts double-credit from users.verity_score for every parallel-ledger quiz_pass row. Drops `verity_score_events` CASCADE, `increment_verity_score`. Re-creates `reconcile_verity_scores` keyed on the real `score_events` ledger.
- Notes: rollback of 109; supersedes-self.

### 112_kids_waitlist.sql
- Creates table: `kids_waitlist` (CHECK constraints on email shape). Index `kids_waitlist_created_at_idx`. RLS enabled, zero policies (service-role only).
- Inserts rate_limits: `kids_waitlist_ip`, `kids_waitlist_addr`.

### 113_rollback_kids_waitlist.sql
- Drops `kids_waitlist`. Deletes 2 rate_limits rows.

### 114_f7_foundation.sql (LARGE — 651 lines)
- Creates trigger func: `tg_set_updated_at()`.
- Creates RPC: `pipeline_today_cost_usd()`.
- Creates tables: `ai_models`, `ai_prompt_overrides`, `kid_articles`, `kid_sources`, `kid_timelines`, `kid_quizzes`, `discovery_items`, `kid_discovery_items`.
- Alters articles: adds 4 audit cols (`generated_at`, `generated_by_provider`, `generated_by_model`, `prompt_fingerprint`).
- Alters pipeline_runs: adds 8 cols (cluster_id, audience, total_cost_usd, step_timings_ms, provider, model, freeform_instructions, prompt_fingerprint).
- Alters pipeline_costs: adds 7 cols (cache_read/creation_input_tokens, cluster_id, error_type, retry_count, audience, prompt_fingerprint). Backfills from metadata jsonb.
- Alters feeds: adds `audience` (NOT NULL after backfill, CHECK adult|kid).
- Alters categories: adds `category_density` jsonb.
- RLS: kid_articles/sources/timelines/quizzes get read_kid_jwt + admin_all + RESTRICTIVE block_adult_jwt. discovery_items + kid_discovery_items get select_editor + RESTRICTIVE block_kid_jwt or block_adult_jwt.
- RESTRICTIVE block_kid_jwt on articles/timelines/sources/quizzes.
- Inserts 19 settings (pipeline.* + ai.*ingest/adult/kid_generation_enabled).
- Inserts 4 ai_models seeds.
- Inserts 2 rate_limits (`newsroom_ingest`, `newsroom_generate`).
- Notes: cluster_id columns declared without REFERENCES — closed by 122.

### 115_rollback_f7_foundation.sql
- Reverses 114 fully.

### 116_f7_cluster_locks_and_perms.sql
- Alters feed_clusters: adds `locked_by`, `locked_at`, `last_generation_run_id`, `generation_state`. FKs to `pipeline_runs(id)`.
- Index: `idx_feed_clusters_locked_at` (partial).
- Creates RPCs: `claim_cluster_lock(uuid, uuid, int)`, `release_cluster_lock(uuid, uuid)`.
- Inserts permissions: `admin.pipeline.run_generate`, `admin.pipeline.release_cluster_lock`. Mirrors set bindings from `admin.pipeline.run_ingest`.
- Inserts rate_limits: `newsroom_cluster_unlock`.
- Inserts settings: `pipeline.default_category_id` (markets fallback).
- Indexes: `uniq_articles_cluster_active`, `uniq_kid_articles_cluster_active` (partial UNIQUE).

### 117_rollback_116_f7_cluster_locks.sql
- Reverses 116. Includes `feed_clusters_locked_by_fkey` re-add NO ACTION.

### 118_f7_persist_generated_article.sql
- Creates RPC: `persist_generated_article(jsonb)` — single transactional draft writer for both audiences. Body re-declared by 124 (drop kids_summary branch).

### 119_rollback_118_persist_generated_article.sql
- Drops `persist_generated_article(jsonb)`.

### 120_f7_pipeline_runs_error_type.sql
- Alters pipeline_runs: adds `error_type` text. Backfills from `output_summary->>'error_type'` and `..._final_error_type'`.

### 121_rollback_120_f7_pipeline_runs_error_type.sql
- Drops `error_type` column.

### 122_f7_cluster_id_fks.sql
- Adds 5 FKs: `discovery_items_cluster_id_fkey` SET NULL, `kid_discovery_items_cluster_id_fkey` SET NULL, `pipeline_runs_cluster_id_fkey` SET NULL, `pipeline_costs_cluster_id_fkey` SET NULL, `kid_articles_cluster_id_fkey` CASCADE.
- Indexes: `pipeline_runs_cluster_idx`, `pipeline_costs_cluster_idx` (partial).
- Flips `feed_clusters_locked_by_fkey` from NO ACTION → SET NULL.

### 123_rollback_122_f7_cluster_id_fks.sql
- Drops 5 FKs + 2 indexes. Restores `feed_clusters_locked_by_fkey` to NO ACTION.

### 124_f7_drop_kids_summary_from_rpc.sql
- Re-declares `persist_generated_article` removing the `v_kids_summary` declaration + `UPDATE kid_articles SET kids_summary = ...` block (column doesn't exist on `kid_articles`).

### 125_rollback_124_f7_drop_kids_summary_from_rpc.sql
- Reinstates the migration-118 RPC body.

### 126_newsroom_redesign_clusters_presets_mutations.sql
- Alters feed_clusters: adds `audience` (default adult, CHECK adult|kid), `archived_at`, `archived_reason`, `dismissed_at`, `dismissed_by`, `dismiss_reason`. Backfills audience='kid' from kid_discovery_items membership.
- Indexes: `idx_feed_clusters_audience_active`, `idx_feed_clusters_audience_created` (partial).
- Creates table: `ai_prompt_presets`. Index: `uniq_ai_prompt_presets_name_lower`, `idx_ai_prompt_presets_audience`. RLS `ai_prompt_presets_admin_all`. Trigger `trg_ai_prompt_presets_touch` BEFORE UPDATE → `update_updated_at_column()`.
- Creates RPCs: `reassign_cluster_items`, `merge_clusters`, `split_cluster`, `archive_cluster`, `dismiss_cluster`, `undismiss_cluster`.
- Inserts permissions: `admin.pipeline.clusters.manage`, `admin.pipeline.presets.manage`, `admin.pipeline.categories.manage`. Bound to owner/admin/editor.

### 127_rollback_126_newsroom_redesign.sql
- Reverses 126 (note: the DELETE of permissions uses incorrect keys `pipeline.manage_*` rather than `admin.pipeline.*.manage` — minor rollback bug).

### 128_grant_anon_is_kid_delegated_exec.sql
- Grants EXECUTE on `is_kid_delegated()` to anon (re-grants to authenticated). Fixes 401 on anon reads of any table with `*_block_kid_jwt` policy.

### 129_rollback_128_grant_anon_is_kid_delegated_exec.sql
- Revokes EXECUTE from anon.

### 130_grant_authenticated_is_expert_or_above.sql
- Re-grants EXECUTE on `is_expert_or_above()` to authenticated/anon/service_role.

### 131_rollback_130_grant_authenticated_is_expert_or_above.sql
- Revokes from authenticated/anon.

### 132_plan_metadata_caps_and_achievement_rewrite.sql
- Backfills plans.metadata: `max_kids` (0/2/4 by tier), `max_bookmarks` (10/-1).
- Re-declares: `enforce_bookmark_cap` (read from plans.metadata), `enforce_max_kids` (P0001 errcode), `check_user_achievements` (full rewrite — 11 criteria types, no `passed` reference).
- Replaces RLS `reading_log_insert`/`_kid_jwt`, `quiz_attempts_insert`/`_kid_jwt`, `streaks_insert`/`_kid_jwt`.

### 133_rollback_132_plan_metadata_caps.sql
- Restores enforce_bookmark_cap (hardcoded 10), enforce_max_kids (no errcode). Restores RLS shapes. Restores broken `check_user_achievements`.

### 134_trigger_reading_log_score.sql
- Creates trigger func: `tg_reading_log_score_on_complete()`. Triggers `trg_reading_log_score_insert` AFTER INSERT (WHEN completed=TRUE), `trg_reading_log_score_update` AFTER UPDATE OF completed (WHEN flips false→true).

### 135_rollback_134_trigger_reading_log_score.sql
- Drops triggers + function.

### 136_defense_in_depth_kid_jwt_blocks.sql
- Adds RESTRICTIVE `*_block_kid_jwt` policies on 13 tables: analytics_events, category_scores, device_profile_bindings, kid_category_permissions, kid_expert_questions, kid_pair_codes, kid_profiles, kid_sessions, quiz_attempts, reading_log, score_events, streaks, user_achievements.

### 137_rollback_136.sql
- Drops 13 RESTRICTIVE policies.

### 138_fk_cascade_cleanup.sql
- Flips 31 FKs from CASCADE → SET NULL: users.plan_id/banned_by/referred_by, subscriptions.downgraded_from_plan_id, reports.resolved_by/escalated_to, access_codes/feature_flags/settings/email_templates created_by/updated_by, plus 19 attribution-style FKs (access_requests, ad_campaigns, ad_units, app_config, articles.verified_by, blocked_words, campaigns, cohorts, comments.moderated_by, data_requests, deep_links, expert_applications.reviewed_by, feeds, media_assets, promo_codes, support_tickets, translations, user_roles).

### 139_rollback_138.sql
- Reverses all 31 FKs back to CASCADE.

### 140_drop_dead_rpcs.sql
- Drops 7 dead RPCs: `set_kid_pin`, `set_parent_pin`, `set_device_mode`, `lock_device`, `unlock_as_kid`, `unlock_as_parent`, `list_profiles_for_device`.

### 141_rollback_140.sql
- No-op (NOTICE only). Path to true rollback documented as re-running reset_and_rebuild_v2.sql lines 5459-5631.

### 142_profile_leaderboard_consensus_ship.sql
- Alters users: changes `profile_visibility` DEFAULT to 'public'. Backfills 'private' rows to 'public'. Adds CHECK `chk_users_profile_visibility (IN public|private)`.
- DO block: deprecates 4 perm key pairs (activity/achievements/categories/card_share → .view.own / .view.own / .score.view.own.categories / .card.share_link). Tightens winners' `requires_verified=true`.
- Creates RPC: `leaderboard_period_counts(timestamptz, int)`.

### 143_rollback_142.sql
- Restores DEFAULT 'private' (leaves data). Drops CHECK. Re-activates 4 deprecated keys.

### 144_articles_hero_pick.sql
- Alters articles: adds `hero_pick_for_date` DATE, `hero_pick_set_by` uuid FK, `hero_pick_set_at` timestamptz.
- Index: `idx_articles_hero_pick_today` (partial).

### 145_rollback_144.sql
- Drops 3 columns + index.

### 146_seed_verify_password_rate_limit.sql
- Inserts rate_limits: `verify_password` (5/3600s, user scope).

### 147_rollback_146.sql
- Deletes rate_limits row.

### 148_billing_rpcs_bump_perms_version.sql
- Re-declares 4 billing RPCs (`billing_cancel_subscription`, `billing_freeze_profile`, `billing_resubscribe`, `billing_change_plan`) to call `bump_user_perms_version(p_user_id)` after mutating users.plan_id/plan_status.

### 149_rollback_148.sql
- Reverts the 4 RPC bodies (no perms_version bump). Preserves Phase 15.2 `convert_kid_trial` logic in change_plan/resubscribe.

### 150_dm_rpc_error_prefixes.sql
- Re-declares `post_message` and `start_conversation` with stable `[CODE]` prefixes on RAISE EXCEPTION (DM_PAID_PLAN, DM_MUTED, NOT_PARTICIPANT, DM_EMPTY, DM_TOO_LONG, DM_RATE_LIMIT, DM_MISSING_IDS, SELF_CONV, USER_NOT_FOUND).

### 151_seed_check_username_rate_limit.sql
- Inserts rate_limits: `check_username` (20/60s, ip scope).

### 152_update_own_profile_freeze_username.sql
- Re-declares `update_own_profile`: accepts `username` only when current `users.username IS NULL` (first-time pick only; later renames silently ignored).

### 153_seed_kids_refresh_rate_limit.sql
- Inserts rate_limits: `kids_refresh` (30/60s, ip scope).

### 154_get_kid_category_rank.sql
- Creates RPC: `get_kid_category_rank(uuid)` (kid JWT only).

### 155_subscriptions_apple_user_unique.sql
- Creates UNIQUE INDEX `subscriptions_user_apple_unique` (partial WHERE apple_original_transaction_id IS NOT NULL).

### 156_seed_ios_subscription_sync_rate_limit.sql
- Inserts rate_limits: `ios_subscription_sync` (20/60s, ip scope).

### 157_billing_cancel_idempotent_on_frozen.sql
- Re-declares `billing_cancel_subscription`: returns `{already_frozen:true, skipped:true}` on frozen user (no exception). Audit row logged.

### 158_billing_unfreeze_rpc.sql
- Creates RPC: `billing_unfreeze(uuid)` — symmetric counterpart to `billing_freeze_profile`. Service-role only.

### 159_notifications_push_claimed_at.sql
- Alters notifications: adds `push_claimed_at`. Backfills already-sent rows. Index `idx_notifications_push_claim` (partial).
- Creates RPC: `claim_push_batch(int)` (FOR UPDATE SKIP LOCKED).

### 160_create_avatars_bucket.sql
- Inserts storage.buckets `avatars` (public, 5 MiB, png/jpeg/webp/gif). 4 RLS policies on storage.objects: select/insert/update/delete own folder.

### 161_comments_rls_accept_visible_status.sql
- Migrates comments.status='published'→'visible'. Replaces `comments_select` policy: `(status='visible' AND deleted_at IS NULL) OR user_id=auth.uid() OR public.is_mod_or_above()`.

### 162_kids_quiz_pass_threshold_pct.sql
- Inserts settings: `kids.quiz.pass_threshold_pct=60`.
- Creates RPC: `get_kid_quiz_verdict(uuid, uuid)` (auth-gated to parent or kid JWT).

### 163_parental_consents.sql
- Creates table: `parental_consents`. Indexes: `idx_parental_consents_kid_profile_id`, `idx_parental_consents_parent_user_id`. RLS `parental_consents_select_parent`. Service-role-only writes (no INSERT policies).

### 164_comments_rls_require_quiz_pass.sql
- Replaces `comments_insert` and `comment_votes_insert` policies: adds `user_passed_article_quiz(...)` check.

### 165_ai_prompt_preset_versioning.sql
- Alters ai_prompt_presets: adds `version int default 1`.
- Creates table: `ai_prompt_preset_versions`. Index: `idx_ai_prompt_preset_versions_preset_id`. RLS admin-read.
- Creates trigger func: `ai_prompt_presets_snapshot_history()`. Trigger `trg_ai_prompt_presets_snapshot` BEFORE UPDATE.

### 166_articles_needs_manual_review.sql
- Alters articles + kid_articles: adds `needs_manual_review boolean DEFAULT false`, `plagiarism_status text`. Partial indexes.

### 167_ext_audit_cc1_cc7.sql
- Re-declares `toggle_follow`: block-aware refusal.
- Re-declares `approve_expert_answer`: notifies asker via `create_notification`.
- Inserts settings: `kids.pin.max_attempts=3`, `kids.pin.lockout_seconds=60`.

### 168_award_points_advisory_lock.sql
- Re-declares `award_points`: adds `pg_advisory_xact_lock` keyed on (subject_id_hash, action_hash) at top.

### 169_recap_award_points.sql
- Inserts score_rules: `recap_pass` (6 pts, 1/day).
- Re-declares `submit_recap_attempt`: calls `award_points('recap_pass', ...)` when score/total >= 0.6.

### 170_ext_audit_cc2_cccs2_cccs5.sql
- Creates RPCs: `release_stale_expert_claims(int)`, `cleanup_rate_limit_events(int)`.
- Dedups + adds UNIQUE constraint `user_roles_user_role_uniq (user_id, role_id)`.

### 171_ext_audit_quiz_attempts_kid_select.sql
- Replaces `quiz_attempts_select_kid_jwt` policy (kid JWT can read own rows).

### 172_ext_audit_kid_family_leaderboard.sql
- Creates RPC: `kid_family_leaderboard(uuid)` (kid JWT or parent only).

### 173_ext_audit_locked_decisions.sql
- Replaces `follows_select` policy (private — follower OR followee OR admin).
- Inserts settings: `password.min_length`, `password.require_upper`, `password.require_number`, `password.require_special`.

### 174_ext_audit_rls_six_tables.sql
- Adds policies on 6 RLS-enabled-but-policy-less tables: expert_queue_items (4 policies), family_achievements (2), kids_waitlist (3), perms_global_version (2), weekly_recap_questions (2), weekly_recap_quizzes (2).

### 175_ext_audit_batch36.sql
- Replaces SELECT policies on `permission_set_perms`, `role_permission_sets`, `plan_permission_sets`: admin-or-above only.

### 176_ext_audit_batch37_export_completeness.sql
- Re-declares `export_user_data`: adds 9 tables (subscriptions, alert_preferences, user_push_tokens (- push_token), billing_events, audit_log_self, support_tickets, expert_applications, kid_pair_codes (- code), parental_consents). Stamps `_export_meta.schema_version=176`.

### 177_grant_ai_models_select.sql
- GRANTs SELECT on `ai_models`, `ai_prompt_overrides`, `kid_articles`, `kid_sources` to authenticated + service_role (RLS still gates row visibility).

## Tables created (with the migration that introduces them, and any alters)

| Table | Created in | Subsequent alters |
|---|---|---|
| categories | reset_v2 line 62 | 048 (name normalize), 051 (subcategory FK indirect), 114 (category_density) |
| score_rules | reset_v2:85 | 169 (recap_pass row insert) |
| score_tiers | reset_v2:105 | — |
| achievements | reset_v2:125 | — |
| plans | reset_v2:148 | 036 (apple_product_id), 132 (metadata.max_kids/max_bookmarks) |
| roles | reset_v2:173 | 105 (drop superadmin row) |
| permissions | reset_v2:189 | many; 068, 081, 090 deactivations; 116/126/142/173 inserts |
| rate_limits | reset_v2:202 | 101, 112, 116, 146, 151, 153, 156 (seed inserts) |
| webhook_log | reset_v2:221 | — |
| sponsors | reset_v2:247 | 099 (block_kid_jwt) |
| ad_placements | reset_v2:270 | 099 (block_kid_jwt) |
| users | reset_v2:299 | 022 (streak_freeze_week_start), 029 (onboarding_completed_at), 044 (dm_read_receipts_enabled), 054 (locked_until/failed_login_count idem), 058 implicit, 142 (profile_visibility default), 138 (FKs SET NULL) |
| plan_features | reset_v2:391 | — |
| auth_providers | reset_v2:414 | — |
| sessions | reset_v2:439 | — |
| kid_profiles | reset_v2:473 | 017 (streak_freeze_remaining/week_start), 058 (pin_salt/hash_algo), 061 (paused_at), 062 (global_leaderboard_opt_in), 099/136 (block policies) |
| follows | reset_v2:503 | 047 (paid-only RLS), 173 (private SELECT) |
| expert_applications | reset_v2:515 | 041 (reverification_notified_at), 099 (block_kid_jwt), 138 (FK SET NULL) |
| expert_discussions | reset_v2:550 | — |
| alert_preferences | reset_v2:580 | — |
| reports | reset_v2:599 | 138 (FK SET NULL) |
| blocked_words | reset_v2:626 | 104 (seed), 138 (FK SET NULL) |
| reserved_usernames | reset_v2:644 | 103 (seed) |
| blocked_users | reset_v2:656 | — |
| settings | reset_v2:667 | 013/016/018/019/114/116/162/167/173 (seed inserts), 138 (FK SET NULL) |
| feature_flags | reset_v2:685 | 020 (seed v2_live), 138 (FK SET NULL) |
| email_templates | reset_v2:714 | 019/040/041/102 (seeds), 138 (FK SET NULL) |
| user_roles | reset_v2:738 | 010, 067, 099/136 (block), 138 (FK), 170 (UNIQUE constraint) |
| access_codes | reset_v2:751 | 138 (FK SET NULL) |
| feeds | reset_v2:771 | 107 (seed 234 rows), 114 (audience), 138 (FK SET NULL) |
| data_requests | reset_v2:802 | 099 (block_kid_jwt), 138 (FK SET NULL) |
| cohorts | reset_v2:830 | 138 (FK SET NULL) |
| consent_records | reset_v2:847 | — |
| app_config | reset_v2:869 | 138 (FK SET NULL) |
| translations | reset_v2:891 | 138 (FK SET NULL) |
| media_assets | reset_v2:910 | 138 (FK SET NULL) |
| rate_limit_events | reset_v2:949 | 057 (key column + nullables), 170 (cleanup helper) |
| ad_campaigns | reset_v2:966 | 099 (block_kid_jwt), 138 (FK SET NULL) |
| user_preferred_categories | reset_v2:996 | — |
| audit_log | reset_v2:1007 | 099 (block_kid_jwt) |
| user_sessions | reset_v2:1029 | — |
| category_scores | reset_v2:1067 | 097 (kid_jwt SELECT), 136 (block_kid_jwt) |
| user_achievements | reset_v2:1083 | 050 (UNIQUE), 097, 136 (block) |
| streaks | reset_v2:1098 | 132 (RLS), 136 (block) |
| kid_category_permissions | reset_v2:1111 | 097, 136 |
| expert_application_categories | reset_v2:1122 | — |
| expert_discussion_votes | reset_v2:1132 | — |
| access_requests | reset_v2:1143 | 138 (FK SET NULL) |
| access_code_uses | reset_v2:1165 | — |
| pipeline_runs | reset_v2:1176 | 114 (8 cols), 116 (FKs from feed_clusters), 120 (error_type), 122 (cluster_id FK + index) |
| campaigns | reset_v2:1199 | 138 (FK SET NULL) |
| cohort_members | reset_v2:1238 | — |
| ad_units | reset_v2:1249 | 138 (FK SET NULL) |
| search_history | reset_v2:1289 | — |
| notifications | reset_v2:1309 | 099 (block_kid_jwt), 159 (push_claimed_at) |
| promo_codes | reset_v2:1341 | 138 (FK SET NULL) |
| deep_links | reset_v2:1368 | 138 (FK SET NULL) |
| campaign_recipients | reset_v2:1399 | — |
| ad_daily_stats | reset_v2:1416 | 018 (UNIQUE idx) |
| push_receipts | reset_v2:1441 | — |
| subscriptions | reset_v2:1463 | 059 (RLS admin-only), 099 (block_kid_jwt), 138 (FK), 155 (apple unique idx) |
| invoices | reset_v2:1503 | — |
| iap_transactions | reset_v2:1530 | — |
| promo_uses | reset_v2:1566 | — |
| subscription_events | reset_v2:1578 | — |
| articles | reset_v2:1597 | 046 (search_tsv), 051 (subcategory_id), 114 (4 audit cols), 138 (verified_by FK), 144 (hero_pick_for_date/set_by/set_at), 166 (needs_manual_review/plagiarism_status), 116 (uniq cluster_id active) |
| sources | reset_v2:1664 | 114 (block_kid_jwt) |
| timelines | reset_v2:1683 | 114 (block_kid_jwt) |
| quizzes | reset_v2:1702 | 114 (block_kid_jwt) |
| quiz_attempts | reset_v2:1727 | 132 (RLS), 136 (block), 171 (kid select fix) |
| comments | reset_v2:1745 | 138 (moderated_by FK), 161 (RLS visible), 164 (RLS quiz pass) |
| comment_votes | reset_v2:1790 | 164 (RLS) |
| bookmarks | reset_v2:1801 | 015 (cap trigger), 045 (RLS), 132 (RLS via cap) |
| reading_log | reset_v2:1815 | 096 (kid jwt), 132 (RLS), 134 (score trigger), 136 (block) |
| conversations | reset_v2:1835 | 043 (realtime), 099 (block_kid_jwt) |
| messages | reset_v2:1852 | 023 (RLS DM block), 099 (block_kid_jwt) |
| feed_clusters | reset_v2:1875 | 116 (lock cols + FKs), 122 (locked_by FK SET NULL), 126 (audience + archive/dismiss cols) |
| analytics_events | reset_v2:1893 | 136 (block_kid_jwt) |
| pipeline_costs | reset_v2:1927 | 114 (7 cols), 122 (cluster_id FK + index) |
| ad_impressions | reset_v2:1948 | — |
| ticket_messages | reset_v2:1979 | (live drop body_html via 20260419181336) |
| article_relations | reset_v2:1995 | — |
| conversation_participants | reset_v2:2007 | 038 (covering idx), 099 (block_kid_jwt) |
| message_receipts | reset_v2:2023 | 039 (RLS), 099 (block_kid_jwt) |
| support_tickets | reset_v2:2034 | 099 (block_kid_jwt), 138 (FK SET NULL) |
| feed_cluster_articles | reset_v2:2069 | — |
| bookmark_collections | reset_v2:2081 | 015 (count trigger) |
| comment_context_tags | reset_v2:2096 | — |
| category_supervisors | reset_v2:2107 | — |
| expert_queue_items | reset_v2:2124 | 174 (RLS classification) |
| family_achievements | reset_v2:2145 | 174 (RLS classification) |
| family_achievement_progress | reset_v2:2161 | — |
| weekly_recap_quizzes | reset_v2:2175 | 174 (RLS) |
| weekly_recap_questions | reset_v2:2191 | 174 (RLS) |
| weekly_recap_attempts | reset_v2:2205 | 025 (UNIQUE) |
| user_warnings | reset_v2:2220 | — |
| behavioral_anomalies | reset_v2:2238 | — |
| sponsored_quizzes | reset_v2:2255 | — |
| kid_expert_sessions | reset_v2:2280 | 063 (RLS), 099 (kid jwt extension) |
| kid_expert_questions | reset_v2:2299 | 063 (RLS), 097 (kid jwt insert), 136 (block) |
| score_events | 022_phase14_scoring.sql | 136 (block_kid_jwt) |
| error_logs | 030_phase22_error_logs.sql | 099 (block_kid_jwt) |
| user_push_tokens | 037_user_push_tokens.sql | 099 (block_kid_jwt) |
| admin_audit_log | 055_admin_audit_log.sql | 099 (block_kid_jwt) |
| kid_pair_codes | 095 | 136 (block_kid_jwt) |
| events (partitioned) | 108 | partitions auto-managed |
| verity_score_events | 109 | DROPPED in 111 |
| kids_waitlist | 112 | 174 (RLS classification) |
| ai_models | 114 | 177 (SELECT grant) |
| ai_prompt_overrides | 114 | 177 (SELECT grant) |
| kid_articles | 114 | 116 (uniq cluster_id active), 122 (cluster_id FK CASCADE), 166 (needs_manual_review), 177 (SELECT grant) |
| kid_sources | 114 | 177 (SELECT grant) |
| kid_timelines | 114 | — |
| kid_quizzes | 114 | — |
| discovery_items | 114 | 122 (cluster_id FK SET NULL), 126 (state column extended) |
| kid_discovery_items | 114 | 122, 126 |
| ai_prompt_presets | 126 | 165 (version col + history table) |
| ai_prompt_preset_versions | 165 | — |
| parental_consents | 163 | — |
| device_profile_bindings | reset_v2 (assumed; 136 references it) | 136 (block_kid_jwt) |
| kid_sessions | reset_v2 (assumed; 136 references it) | 136 (block_kid_jwt) |
| billing_events | reset_v2 (assumed; 176 references it) | — |
| iap_transactions | reset_v2:1530 | — |

Note: a handful of tables (`device_profile_bindings`, `kid_sessions`, `billing_events`) are referenced by later migrations but their CREATE TABLE doesn't show in the reset_v2 grep — they're in the parts of reset_v2 below the section markers I sampled, or were added in migrations 092/093 (which exist in the `supabase_migrations` log but not on disk).

## RPCs created (with their canonical migration)

CLAUDE.md canonical-list RPCs (verified canonical migration):
- `require_outranks(target_user_id)` — landed via migration 20260419181412 (`add_require_outranks_rpc_2026_04_19` in tracked log; on-disk file not present, so this is one of the 092/093/100 gaps).
- `caller_can_assign_role(...)` — likewise tracked in supabase_migrations log; not on disk in numbered files.
- `compute_effective_perms(uuid)` — **064_compute_effective_perms.sql**.
- `record_admin_action(...)` — **055_admin_audit_log.sql**.
- `is_kid_delegated()` — **096_kid_jwt_rls_2026_04_19.sql**.
- `bump_user_perms_version(uuid)` — declared in reset_v2:5839, hardened in **074_bump_user_perms_version_atomic_security.sql** (sec definer + admin gate). Re-declared in reset_v2:6945.
- `check_rate_limit(text, integer, integer)` — **057_rpc_lockdown.sql**.

Other notable RPCs and their canonical migrations:
- Auth/permissions: `my_permission_keys` (reset_v2 + 035 kid trial), `has_permission`, `get_my_capabilities`, `is_admin_or_above`, `is_editor_or_above`, `is_mod_or_above`, `is_expert_or_above`, `is_paid_user`, `is_premium`, `has_verified_email`, `is_banned`, `owns_kid_profile`, `user_has_role`, `bump_perms_global_version`, `my_perms_version`, `audit_perm_change`, `guard_system_permissions`, `has_permission_for`, `preview_capabilities_as`, `feature_flag_enabled_for` — all in reset_v2.
- Auth lifecycle: `handle_new_auth_user` (reset_v2; re-declared 067, 094), `handle_auth_user_updated` (reset_v2), `reject_privileged_user_updates` (reset_v2:6861; re-declared 065/082/083/084).
- Counter primitives: `increment_field/view_count/comment_count/bookmark_count/share_count/comment_vote/update_follow_counts/purge_rate_limit_events` (reset_v2; locked down in 056, 057).
- Account: `record_failed_login`, `clear_failed_login`, `get_user_lockout_by_email`, `record_failed_login_by_email`, `is_email_registered` (054), `resolve_username_to_email` (053; locked down 060), `update_own_profile` (085, 152), `get_own_login_activity` (091), `award_reading_points` (066), `start_conversation` (069/089/150), `create_support_ticket` (070), `post_message` (049/150), `get_unread_counts` (038).
- Sessions/Push: `register_push_token`, `invalidate_push_token`, `session_heartbeat`, `revoke_session`, `revoke_all_other_sessions` (reset_v2). `upsert_user_push_token`, `invalidate_user_push_token` (037). `claim_push_batch` (159).
- Billing: `user_has_dm_access`, `billing_cancel_subscription`, `billing_freeze_profile`, `billing_freeze_expired_grace`, `billing_resubscribe`, `billing_change_plan` (011; re-declared 024/148/157). `billing_uncancel_subscription` (059). `billing_unfreeze` (158).
- Quiz/Comments/Experts: `article_quiz_pool_size`, `user_article_attempts`, `user_passed_article_quiz`, `start_quiz_attempt`, `submit_quiz_attempt` (012). `can_user_see_discussion`, `_setting_int`, `post_comment` (013, re-declared 023). `toggle_vote`, `toggle_context_tag`, `soft_delete_comment`, `edit_comment` (013). `is_user_expert`, `expert_can_see_back_channel`, `is_expert_in_probation`, `submit_expert_application`, `approve_expert_application`, `reject_expert_application`, `ask_expert` (014, 034), `claim_queue_item`, `decline_queue_item`, `post_expert_answer`, `approve_expert_answer` (014, 167), `post_back_channel_message`, `mark_probation_complete` (014). `flag_expert_reverifications_due` (041). `release_stale_expert_claims` (170).
- Bookmarks/Follows: `_user_is_paid`, `enforce_bookmark_cap` trigger, `bookmark_collection_count_sync` trigger, `create_bookmark_collection`, `rename_bookmark_collection`, `delete_bookmark_collection`, `toggle_follow` (015; toggle_follow re-declared 167).
- Trust & Safety: `user_supervisor_eligible_for`, `user_is_supervisor_in`, `supervisor_opt_in`, `supervisor_opt_out`, `supervisor_flag_comment`, `_user_is_moderator`, `hide_comment`, `unhide_comment`, `apply_penalty`, `resolve_report`, `submit_appeal`, `resolve_appeal`, `grant_role`, `revoke_role` (016; re-declared 026/086).
- Family/Kids: `start_kid_trial`, `freeze_kid_trial` (017, 106), `sweep_kid_trial_expiries`, `convert_kid_trial`, `use_kid_streak_freeze`, `family_members`, `family_weekly_report`, `is_family_owner` (017). `enforce_max_kids` (reset_v2; re-declared 132). `kid_session_valid` (reset_v2). `generate_kid_pair_code`, `redeem_kid_pair_code` (095). `is_kid_delegated` (096). `get_kid_quiz_verdict` (162). `get_kid_category_rank` (154). `kid_family_leaderboard` (172).
- Ads: `_user_tier_or_anon`, `serve_ad`, `log_ad_impression`, `log_ad_click` (018; serve_ad re-declared 025/110).
- Notifications: `breaking_news_quota_check`, `create_notification`, `send_breaking_news`, `weekly_reading_report`, `submit_recap_attempt` (019; re-declared 025/026/169). `_is_in_quiet_hours` (031).
- Scoring: `_user_freeze_allowance`, `_subject_local_today`, `award_points`, `advance_streak`, `score_on_quiz_submit`, `score_on_reading_complete`, `score_on_comment_post`, `recompute_verity_score` (022; award_points re-declared 168). `tg_reading_log_score_on_complete` trigger (134). `recompute_family_achievements` (025/042). `check_user_achievements` (050; re-declared 132). `reconcile_verity_scores` (109/111). `cleanup_rate_limit_events` (170).
- Mute checks: `_user_is_comment_blocked`, `_user_is_dm_blocked` (023).
- Deletion/Export: `schedule_account_deletion`, `cancel_account_deletion`, `anonymize_user`, `sweep_expired_deletions` (027; anonymize re-declared 086/088). `export_user_data`, `claim_next_export_request` (028; export re-declared 176).
- Error/Login: `get_user_category_metrics` (051).
- Events pipeline: `pipeline_today_cost_usd` (114). `create_events_partition_for`, `drop_old_events_partitions` (108). `claim_cluster_lock`, `release_cluster_lock` (116). `persist_generated_article` (118/124). `reassign_cluster_items`, `merge_clusters`, `split_cluster`, `archive_cluster`, `dismiss_cluster`, `undismiss_cluster` (126). `tg_set_updated_at` trigger fn (114). `ai_prompt_presets_snapshot_history` trigger fn (165). `tg_reading_log_score_on_complete` trigger fn (134).
- Leaderboard: `leaderboard_period_counts` (142).
- Misc helpers: `is_category_supervisor` (reset_v2), `user_passed_quiz` (reset_v2 — superseded by `user_passed_article_quiz` in 012).

Dropped RPCs (140): `set_kid_pin`, `set_parent_pin`, `set_device_mode`, `lock_device`, `unlock_as_kid`, `unlock_as_parent`, `list_profiles_for_device`. Plus `clear_kid_lockout` (reset_v2) appears unused.

## RLS policies (per table, latest version)

Latest authoritative shapes:
- `articles`: SELECT on published; RESTRICTIVE `articles_block_kid_jwt` (114) prevents kid JWT.
- `comments`: SELECT `(status='visible' AND deleted_at IS NULL) OR user_id=auth.uid() OR is_mod_or_above()` (161). INSERT requires quiz pass + verified + not banned (164).
- `comment_votes`: INSERT requires quiz pass on parent comment's article (164).
- `bookmarks`: INSERT ownership-only (045); cap enforced by `enforce_bookmark_cap` trigger (132 reads from plans.metadata).
- `follows`: SELECT private (173); INSERT paid+verified+notbanned (047).
- `messages`: INSERT not-DM-blocked + participant (023). RESTRICTIVE block_kid_jwt (099).
- `message_receipts`: SELECT receiver OR sender (039). RESTRICTIVE block_kid_jwt (099).
- `subscriptions`: INSERT/UPDATE admin-only (059). RESTRICTIVE block_kid_jwt (099).
- `users`: SELECT public-or-self; RESTRICTIVE `users_select_block_kid_jwt` (096).
- `kid_profiles`: 3 permissive SELECTs (own/siblings/global-leaderboard) + RESTRICTIVE block_kid_jwt narrowed to those (136).
- `reading_log`: INSERT parent or kid JWT (132). RESTRICTIVE block_kid_jwt narrowed (136).
- `quiz_attempts`: INSERT parent + verified + not banned + (kid_profile_id null OR owns) OR kid_jwt with parent_user_id claim match (132). SELECT kid jwt fix (171). RESTRICTIVE block (136).
- `streaks`: INSERT parent or kid jwt (132). RESTRICTIVE block (136).
- `score_events`: SELECT user OR parent of kid (022). RESTRICTIVE block_kid_jwt (136).
- `category_scores`: SELECT kid jwt own (097). RESTRICTIVE block (136).
- `user_achievements`: SELECT kid jwt own (097). RESTRICTIVE block (136).
- `kid_category_permissions`: SELECT kid jwt own (097). RESTRICTIVE block (136).
- `kid_expert_questions`: SELECT parent/expert/mod (063), kid SELECT/INSERT (097), RESTRICTIVE block (136).
- `kid_expert_sessions`: SELECT scheduled/expert/mod (063); kid jwt extended states (099).
- `kid_pair_codes`: SELECT parent (095). RESTRICTIVE block (136).
- `kid_sessions`: RESTRICTIVE block (136).
- `kid_articles`: SELECT kid jwt+published (114). FOR ALL admin (114). RESTRICTIVE block_adult_jwt (114).
- `kid_sources`: SELECT kid jwt (114). FOR ALL admin (114). RESTRICTIVE block_adult_jwt (114).
- `kid_timelines`: SELECT kid jwt (114). FOR ALL admin (114). RESTRICTIVE block_adult_jwt (114).
- `kid_quizzes`: SELECT kid jwt + active (114). FOR ALL admin (114). RESTRICTIVE block_adult_jwt (114).
- `discovery_items`: SELECT editor (114). RESTRICTIVE block_kid_jwt (114).
- `kid_discovery_items`: SELECT editor (114). RESTRICTIVE block_adult_jwt (114).
- `notifications`: RESTRICTIVE block_kid_jwt (099).
- `user_push_tokens`: SELECT own (037). RESTRICTIVE block_kid_jwt (099).
- `support_tickets`: RESTRICTIVE block_kid_jwt (099).
- `data_requests`: RESTRICTIVE block_kid_jwt (099).
- `error_logs`: SELECT own/admin (030). RESTRICTIVE block_kid_jwt (099).
- `admin_audit_log`: SELECT admin (055). RESTRICTIVE block_kid_jwt (099).
- `user_roles`: RESTRICTIVE block_kid_jwt (099).
- `expert_applications`: RESTRICTIVE block_kid_jwt (099).
- `sponsors / ad_campaigns / ad_placements`: RESTRICTIVE block_kid_jwt (099).
- `analytics_events`: RESTRICTIVE block_kid_jwt (136).
- `device_profile_bindings`: RESTRICTIVE block_kid_jwt (136).
- `permission_set_perms / role_permission_sets / plan_permission_sets`: SELECT admin-or-above (175).
- `permission_scope_overrides`: SELECT admin OR scope='user'+self (087).
- `expert_queue_items`: SELECT asker/claimer/admin; INSERT self+verified+notbanned; UPDATE claimer/admin; DELETE admin (174).
- `family_achievements`: SELECT public; modify admin (174).
- `kids_waitlist`: INSERT anon; SELECT/modify admin (112+174).
- `perms_global_version`: SELECT public; modify denied (174).
- `weekly_recap_questions / quizzes`: SELECT authenticated; modify editor+ (174).
- `parental_consents`: SELECT parent (163). Service-role-only writes.
- `verity_score_events`: SELECT own (109). Table dropped 111.
- `events`: RLS enabled, no policies (108) — service-role only.
- `kids_waitlist`: see above.
- Storage buckets: `data-exports` (private, 028), `banners` (live; tracked migration `20260419160457`), `avatars` (160). Avatars has 4 own-folder policies (160).

## Migrations that look like duplicates / re-do prior work

- 069 + 089: `start_conversation_rpc_2026_04_18` and `..._reapply` — 089 is a deliberate idempotency reapply.
- 082 + 065: `restrict_users_table_privileged_updates` v1 (SECDEF, broken) → v2 (INVOKER). 083/084 then add INSERT branch and column-default tolerance. Four iterations on the same trigger function.
- 023, 067, 094: each re-declares `handle_new_auth_user` for incremental fixes (mute-aware not relevant; default plan; N-03 hijack guard).
- 011, 024, 148, 157: each re-declares one or more billing_* RPCs (kid trial convert; perms_version bump; idempotent on frozen).
- 050, 132, 133: `check_user_achievements` declared, fully rewritten, then rollback re-introduces broken form.
- 069, 089, 150: `start_conversation` plus `[CODE]` error prefixes — three full re-declarations.
- 049, 150: `post_message` — declared in 049, error prefixes added in 150.
- 109/111: parallel score ledger created and rolled back. Net: ledger gone, `reconcile_verity_scores` keyed on `score_events`.
- 016, 026, 086: `hide_comment`/`unhide_comment`/`apply_penalty`/`resolve_report`/`resolve_appeal`/`grant_role`/`revoke_role` re-declared three times (audit log; lockdown grants).
- 027, 086, 088: `anonymize_user` declared, hardened with self-anon guard, then refined for cron-safety.
- 034, 014: `ask_expert` widening tier.
- 019, 025, 026, 169: `submit_recap_attempt` (UPSERT, then award_points wire). `serve_ad` declared (018), targeting added (025), AdSense fields (110). `send_breaking_news` keyset paging (026).
- 064 + reset_v2 has older `compute_effective_perms` (none in reset_v2; 064 is canonical first). RPC names overlap with `compute_caps` in reset_v2 helpers.

## Orphaned/abandoned migrations (not applied or replaced)

- 109 → 111: `verity_score_events` table + `increment_verity_score` RPC + quiz-pass auto-credit trigger were applied, then explicitly rolled back when discovered to double-credit against the existing `score_events`/`award_points` system. Net effect: 109 is abandoned; only `reconcile_verity_scores` survives (re-keyed in 111).
- 100: file does not exist on disk. CLAUDE.md notes `100_backfill_admin_rank_rpcs_*.sql` as a backfill (live RPC patch, not an actual applied migration in the chain).
- 092, 093: numbered files do not exist on disk; the live migration log has entries that match the names (`092_rls_lockdown_2026_04_19`, `092b_rls_lockdown_followup_2026_04_19`, `093_rpc_actor_lockdown_2026_04_19`). Means those landed in DB via `apply_migration` MCP but were never committed as `.sql` files.
- 127: rollback of 126 has a minor bug — DELETE FROM permissions uses incorrect keys (`pipeline.manage_*` instead of `admin.pipeline.*.manage`). Rollback would leave the new perms in place but is otherwise harmless.
- 141: pure no-op rollback (NOTICE only). 140 is one-way per design — restoring the dead RPCs requires re-running reset_v2 sections.
- snapshots/snapshot-2026-04-18-pre-perms-import.sql: empty file (0 lines). Placeholder that was never populated.

## reset_and_rebuild_v2.sql analysis

- 7287 lines. Single-paste full rebuild from scratch. Begins with `SET vp.allow_destroy='yes'` GUC guard, then `DROP SCHEMA public CASCADE; CREATE SCHEMA public`. Re-grants Supabase internal roles immediately.
- Section markers (embedded in comments):
  - `001_schema.sql` — 90 base tables (lines 47..3029), CHECK constraints, FKs, indexes.
  - `002_seed.sql` — base data seeds (lines 3030..3457): roles (owner, superadmin, admin, editor, moderator, expert, educator, journalist, user), score_rules, score_tiers, plans (8 SKUs), permission_sets, permissions, plan_permission_sets, role_permission_sets, etc.
  - `003_rls_policies.sql` — base RLS helpers + policies (lines 3458..4298): `user_has_role`, `is_mod_or_above`, `is_editor_or_above`, `is_admin_or_above`, `user_passed_quiz`, `is_category_supervisor`, `is_paid_user`, `has_verified_email`, `is_banned`, `is_premium`, `owns_kid_profile`, then RLS policies on every table.
  - `004_rpc_functions.sql` — counter primitives (lines 4299..4399): `increment_field/view_count/comment_count/bookmark_count/share_count/comment_vote/update_follow_counts/purge_rate_limit_events`.
  - `007_category_scores.sql` — category-score compute helpers (lines 4400..4423).
  - `008_fix_scores.sql` — score fixes including `handle_new_auth_user`, `handle_auth_user_updated`, `is_expert_or_above`, `my_permission_keys`, `has_permission`, `get_my_capabilities` (lines 4424..5450ish).
  - Then ad-hoc sections: device-mode kid auth (5459..5651, dropped by 140), `kid_session_valid`, `my_permission_keys` overload (5673), `bump_perms_global_version`/`bump_user_perms_version`, `audit_perm_change`, `guard_system_permissions`, `has_permission_for`, `preview_capabilities_as`, `register_push_token`, `invalidate_push_token`, `feature_flag_enabled_for`, `session_heartbeat`, `revoke_session`, `revoke_all_other_sessions`.
  - End cap: handlers re-declared (`handle_new_auth_user` 6804, `reject_privileged_user_updates` 6861, `bump_user_perms_version` 6945, `update_own_profile` 6970, `start_conversation` 7030, `create_support_ticket` 7083, `get_own_login_activity` 7131, `award_reading_points` 7162, `anonymize_user` 7203). Implies the file was regenerated to include later migrations 065/067/082/083/084/085/088/091.
- Drift from numbered chain: reset_v2 reflects state through ~migration 091. Anything from 094 onward (kid JWT, F7 pipeline, newsroom, hero pick, audit fixes) is NOT in reset_v2. A DR rebuild would need to apply 094..177 sequentially after reset_v2.
- The file is a DR document, not an authoritative state. Treat numbered migrations 094..177 as the canonical state delta.

## snapshots/ contents

- One file: `snapshot-2026-04-18-pre-perms-import.sql` (0 bytes / 0 lines). Empty placeholder, never populated. Likely intended as a pre-import backup but the snapshotting flow never wrote it. No content to audit.

## Notable claims worth verifying in later waves

1. **reset_and_rebuild_v2.sql drift**: tail has handlers that match migrations 065/067/082/083/084/085/088/091 but NOT 094+. A rebuild from v2 + later migrations should produce live state — verify by running a diff against `pg_proc` and `pg_constraint` on the live DB.
2. **Missing on-disk migrations 092, 093**: live `supabase_migrations` log entries `092_rls_lockdown`, `092b_rls_lockdown_followup`, `093_rpc_actor_lockdown` exist but no SQL files. Walk live `pg_proc` for any RPCs that would have come from those migrations and either commit the missing files or document the drift.
3. **`100_backfill_admin_rank_rpcs_*.sql`** is referenced in CLAUDE.md but doesn't exist on disk. Confirm whether the backfill ever ran on the live DB or whether `require_outranks` / `caller_can_assign_role` were ever actually created — this is a P0 admin-mutation gate.
4. **RPC declared in reset_v2 but no canonical numbered migration**: `compute_effective_perms` first appears in 064 (NOT reset_v2). Live state needs the exact same body as 064. Worth running `pg_get_functiondef('public.compute_effective_perms(uuid)'::regprocedure)` and diffing against 064.
5. **Self-superseding 109/111**: 109 left a `verity_score_events` table + ledger that 111 dropped. Verify the table is gone in live DB (`SELECT 1 FROM pg_tables WHERE tablename='verity_score_events'` should return 0 rows). Also verify the cleanup UPDATE in 111 actually subtracted the right amount — depends on how many quiz_attempts.passed events fired between 109 and 111.
6. **Rollback bug in 127**: DELETE FROM permissions WHERE key IN (`pipeline.manage_clusters`, `pipeline.manage_presets`, `pipeline.manage_categories`) but 126 inserts `admin.pipeline.clusters.manage` etc. Mismatch makes rollback ineffective. Low impact (rollback rarely run) but worth flagging.
7. **superadmin role removal (105)**: code may still reference `superadmin` in role lists. Verify `_user_is_moderator`, `expert_can_see_back_channel`, `_user_is_paid` etc. that include `superadmin` in `r.name IN (...)` arrays — the role no longer exists, so `superadmin` references are dead code. Worth a sweep.
8. **`kids_summary` column drift**: 124 dropped the dead branch; 125 rollback documents that re-instating the branch without column-add is broken. Verify `kid_articles` has no `kids_summary` column live.
9. **Live `feed_clusters_locked_by_fkey` ON DELETE behavior**: 116 set NO ACTION, 122 flipped to SET NULL, 117 (rollback of 116) and 123 (rollback of 122) interact. Verify with `SELECT confdeltype FROM pg_constraint WHERE conname='feed_clusters_locked_by_fkey'`.
10. **Settings keys live**: spot-check that `comment_max_depth=2` is set (033), `kids.quiz.pass_threshold_pct=60` (162), `pipeline.daily_cost_usd_cap=10` (114), `password.min_length=8` (173).
11. **`category_supervisors` and `category_scores`** ON CONFLICT clauses use partial-index syntax `ON CONFLICT (kid_profile_id, category_id) WHERE kid_profile_id IS NOT NULL`. Verify the partial unique indexes actually exist (not all DBs ship them — there are no explicit `CREATE UNIQUE INDEX ... WHERE` statements for these in reset_v2 grep output).
12. **`device_profile_bindings`, `kid_sessions`, `billing_events`** CREATE TABLEs not visible in reset_v2 grep but referenced by 136/176. They likely live in a section of reset_v2 not surfaced or in an applied migration that didn't make it to disk (092/093 candidates).
13. **`user_passed_quiz` (reset_v2) vs `user_passed_article_quiz` (012)**: there are two functions with similar names. Live state should use the 012 version (called by `post_comment` 013, `toggle_vote` 013, `toggle_context_tag` 013, `submit_recap_attempt`, etc.). Verify `user_passed_quiz` is gone or harmlessly orphaned.
14. **Trigger duplicates**: `tg_set_updated_at` (114) vs `update_updated_at_column` (referenced by 126 trigger creation). Two trigger functions with similar purpose — verify both exist and are consistent in body.
15. **`feature_flag_enabled_for` declared in reset_v2** but call sites in routes use `isV2Live` / `feature_flags` table reads directly. Possibly orphaned RPC.
16. **`event_id` PK in events table (108)**: `(event_id, occurred_at)` PK. Application must generate event_id at event-creation time, not at send time. Worth confirming in `web/src/app/api/events/batch` route handling.
17. **Rate limit table key column**: 057 added `key` column with NULL legacy cols, but `cleanup_rate_limit_events` (170) deletes WHERE `occurred_at` — verify the column name. The table has `created_at` (per 057) and the cleanup function references `occurred_at`. Possible bug — would either fail at runtime or silently no-op depending on whether `occurred_at` exists.
18. **177 SELECT grants on F7 tables**: only ai_models / ai_prompt_overrides / kid_articles / kid_sources got grants. Verify whether `kid_timelines`, `kid_quizzes`, `kid_discovery_items`, `discovery_items`, `feed_clusters`, `pipeline_runs`, `pipeline_costs`, `feed_cluster_articles`, `ai_prompt_presets` need similar grants — same RLS pattern as the 4 fixed.
