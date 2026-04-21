# Verity Post — Permissions Audit

Generated 2026-04-18 from a read-only scan of the current codebase (no edits performed).

## Section 1: Method

Used Grep + Read across the following surfaces:

- **Web server gates:** `site/src/app/api/**/route.js` (128 route files) — grepped for `requireRole`, `requireAuth`, `requireVerifiedEmail`, `requireNotBanned`, `assertPlanFeature`, and service-client RPC calls that internally gate. Found 228 direct gate calls across 98 files.
- **Web client gates:** `site/src/app/**/*.js` and `site/src/components/**/*.jsx` — grepped for `hasPermission`, `getCapabilities`, `user.roles.includes(...)`, `roles?.name`, `isPaidTier`, hard-coded role arrays like `['owner','admin']`. The dot-namespaced permissions client (`/lib/permissions.js`) is wired up and fetches via `get_my_capabilities` RPC but **`hasPermission(key)` is never actually called outside the library file and RLS error handler** — every adult UI gate currently branches on `isPaidTier(tier)`, role arrays, or bare `role === 'x'`.
- **SQL RLS + helpers + RPCs:** `01-Schema/reset_and_rebuild_v2.sql` (main, 6734 lines) + 57 migration files (`005_*` through `063_*`). Grepped for `user_has_role`, `is_mod_or_above`, `is_editor_or_above`, `is_admin_or_above`, `is_expert_or_above`, `has_verified_email`, `is_banned`, `is_premium`, `is_paid_user`, `_user_is_paid`, `_user_tier_or_anon`, `owns_kid_profile`, `is_category_supervisor`, `user_passed_quiz`, `kid_session_valid`. ~300+ occurrences across 16 files; over 150 CREATE POLICY statements in the main schema. Also read RPC bodies in `011_phase3_billing_helpers.sql`, `014_phase6_expert_helpers.sql`, `015_phase7_helpers.sql`, `016_phase8_trust_safety.sql`, `017_phase9_family.sql`, `018_phase10_ads.sql`.
- **iOS:** `VerityPost/VerityPost/*.swift` — grepped for role/plan checks via AuthViewModel or direct Supabase queries (ExpertQueueView, HomeFeedSlots, ProfileView, RecapView, StoryDetailView, BookmarksView, PublicProfileView).
- **Stale xlsx:** extracted the 304 permission_key rows from `00-Reference/permissions_matrix.xlsx` via unzip+regex and diffed against `site/src/lib/permissionKeys.js` (63 keys declared) and SQL-seeded `permissions` table.

**Skipped:** the Excel schema guide (`Verity_Post_Schema_Guide.xlsx`), the legacy v1 blueprint DOCX, and the `beta ui ux kids/` scratch directory. Test files under `test-data/` and the `02-Parity`, `03-Build-History` folders were skipped because they're historical. I did not attempt to run the dev server; every observation is static.

One ambiguity worth flagging up front: **the code has TWO parallel permission systems coexisting**. One is the dot-namespaced capability resolver (`permissions.key` table, `permission_sets`, `get_my_capabilities`, `my_perms_version`, client `hasPermission`). The other is the legacy role/plan hierarchy (`is_mod_or_above`, `is_paid_user`, `requireRole('admin')`, `isPaidTier`, `_user_is_paid`). Every route currently enforces via the **second** system; the first is loaded but inert.

---

## Section 2: Fresh permission matrix

Each row represents a distinct capability. Gate locations cite the primary enforcement site (with +N other sites if the same gate repeats). Sorted by surface, then suggested_permission_key.

| surface | feature | suggested_permission_key | current_gate | gate_location | who_should_have_access | D-ref | discrepancy |
|---|---|---|---|---|---|---|---|
| account | Request full account deletion (30-day grace) | `account.delete` | `requireAuth()` (uses RPC `request_account_deletion`) | `site/src/app/api/account/delete/route.js` | Authenticated self | — | — |
| account | Cancel pending deletion on re-login | `account.deletion.cancel` | session/service; no role gate | `site/src/app/api/account/login-cancel-deletion/route.js` | Authenticated self within grace | — | — |
| account | Complete onboarding (category picks, COPPA consent) | `account.onboarding.complete` | `requireAuth()` | `site/src/app/api/account/onboarding/route.js:9` | Authenticated | — | — |
| admin_panel | Enter any /admin/* page | `admin.panel.enter` | server layout: `MOD_ROLES` (owner/superadmin/admin/editor/moderator) | `site/src/app/admin/layout.js:38` | Staff (moderator+) | D30 | — |
| admin_panel | View access codes + uses | `admin.access_codes.manage` | client-gated: `['admin','superadmin','owner']` | `site/src/app/admin/access/page.js:52` | Admin+ | — | server-side RLS on `access_codes` is `public.is_admin_or_above()` so it matches |
| admin_panel | View/manage access requests | `admin.access_requests.review` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4241` | Admin+ | — | — |
| admin_panel | View /admin/analytics | `admin.analytics.view` | client-gated: `['owner','admin']` | `site/src/app/admin/analytics/page.js:55` | Admin+ | — | no server layer besides admin layout (editor/moderator allowed in) |
| admin_panel | View aggregate audit log | `admin.audit_log.view` | RLS `is_admin_or_above()` | `01-Schema/055_admin_audit_log.sql` | Admin+ | — | — |
| admin_panel | Manage cohorts + members | `admin.cohorts.manage` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4269-4274` | Admin+ | — | — |
| admin_panel | Send marketing campaign | `admin.campaigns.send` | RLS `is_admin_or_above()` on campaigns | `01-Schema/reset_and_rebuild_v2.sql:4276-4278` | Admin+ | — | — |
| admin_panel | Manage categories catalog | `admin.categories.manage` | RLS `is_admin_or_above()` on categories | `01-Schema/reset_and_rebuild_v2.sql:3670-3674` | Admin+ | — | — |
| admin_panel | View/edit email templates | `admin.email_templates.edit` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4190-4192` | Admin+ | — | — |
| admin_panel | Send transactional email by hand | `admin.email.send_manual` | `requireRole('admin')` | `site/src/app/api/admin/send-email/route.js:56` | Admin+ | — | — |
| admin_panel | Toggle feature flags | `admin.feature_flags.toggle` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4187-4188` | Admin+ | — | — |
| admin_panel | Manage RSS feeds / pipeline feeds | `admin.feeds.manage` | RLS `is_editor_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4247-4249` | Editor+ | — | — |
| admin_panel | View own + system deep links | `admin.deep_links.manage` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4316-4318` | Admin+ | — | — |
| admin_panel | Manage plans + plan_features | `admin.plans.edit` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4122-4128` | Admin+ | — | — |
| admin_panel | View/edit permissions catalog | `admin.permissions.manage` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4936-4940` | Admin+ | — | — |
| admin_panel | View /admin/pipeline (runs, costs) | `admin.pipeline.view` | client-gated roles; RLS `is_editor_or_above()` on pipeline_runs | `site/src/app/admin/pipeline/page.js:85` + `01-Schema/reset_and_rebuild_v2.sql:4258-4260` | Editor+ | — | — |
| admin_panel | Invalidate cached app settings | `admin.settings.invalidate` | `requireRole('admin')` | `site/src/app/api/admin/settings/invalidate/route.js:7` | Admin+ | — | — |
| admin_panel | Read app settings (public ones plus private) | `admin.settings.view` | `requireRole('admin')` | `site/src/app/api/admin/settings/route.js:11` | Admin+ | — | RLS says `is_public OR is_admin_or_above` so public ones are readable to anon |
| admin_panel | Update app setting | `admin.settings.edit` | `requireRole('admin')` | `site/src/app/api/admin/settings/route.js:27` | Admin+ | — | — |
| admin_panel | View own + system audit (webhook log) | `admin.webhook_log.view` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4303` | Admin+ | — | — |
| admin_panel | Configure rate limits | `admin.rate_limits.configure` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4296-4298` | Admin+ | — | — |
| admin_panel | Manage translations | `admin.translations.manage` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4199-4200` | Admin+ | — | — |
| ads | Serve ad (tier-aware impression decision) | `ads.serve` | RPC `serve_ad()` — checks `_user_tier_or_anon` against `hidden_for_tiers`/`reduced_for_tiers` | `01-Schema/018_phase10_ads.sql:43` | Anon gets most, Free fewer, Verity few, Pro/Family none | D23 | — |
| ads | Log ad impression | `ads.impression` | RPC `log_ad_impression()` granted to anon/authenticated/service | `01-Schema/018_phase10_ads.sql:125` | All non-ad-free tiers | D23 | — |
| ads | Log ad click | `ads.click` | RPC `log_ad_click()` granted to anon/authenticated/service | `01-Schema/018_phase10_ads.sql:165` | Same as impression | D23 | — |
| ads_admin | Create/edit ad_placements | `admin.ads.placements_manage` | `requireRole('admin')` +RLS `is_admin_or_above()` | `site/src/app/api/admin/ad-placements/route.js:6` +4 sites, `01-Schema/reset_and_rebuild_v2.sql:4348-4349` | Admin+ | — | — |
| ads_admin | Create/edit ad_units | `admin.ads.units_manage` | `requireRole('admin')` | `site/src/app/api/admin/ad-units/route.js:6` +3 sites | Admin+ | — | — |
| ads_admin | Create/edit ad_campaigns | `admin.ads.campaigns_manage` | `requireRole('admin')` | `site/src/app/api/admin/ad-campaigns/route.js:6` +3 sites | Admin+ | — | — |
| ads_admin | Manage sponsors catalog | `admin.ads.sponsors_manage` | `requireRole('admin')` | `site/src/app/api/admin/sponsors/route.js:6` +3 sites | Admin+ | — | — |
| ads_admin | View ad impression + daily stats | `admin.ads.view_stats` | RLS `is_admin_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:4359-4363` | Admin+ | — | — |
| ai | Generate AI article draft | `admin.ai.generate` | `requireRole('editor')` | `site/src/app/api/ai/generate/route.js:12` | Editor+ | — | — |
| appeals | File appeal on a warning | `appeals.submit` | `requireAuth()` (RPC `submit_appeal` own-warning-only) | `site/src/app/api/appeals/route.js:9` + `01-Schema/016_phase8_trust_safety.sql:377` | Authenticated owner of warning | — | — |
| appeals_admin | Resolve appeal | `mod.appeals.resolve` | `requireRole('moderator')` (RPC `resolve_appeal` requires moderator+) | `site/src/app/api/admin/appeals/[id]/resolve/route.js:9` + `01-Schema/016_phase8_trust_safety.sql:425` | Moderator+ | D30 | — |
| article | View any published article | `article.view` | RLS `status='published' AND deleted_at IS NULL OR author OR editor+` | `01-Schema/reset_and_rebuild_v2.sql:3650` | Everyone (anon + authed) | — | — |
| article | View article sources list | `article.view_sources` | RLS `sources_select` = true | `01-Schema/reset_and_rebuild_v2.sql:3678` | Everyone | D27 | — |
| article | View article timeline (related events) | `article.view_timeline` | RLS `timelines_select` = true | `01-Schema/reset_and_rebuild_v2.sql:3687` | Everyone | D37 | D37 says anon links to ad-free pages must gate — no code enforcement found |
| article | Bookmark an article (toggle) | `article.bookmark_toggle` | RLS `bookmarks_insert` requires `public.is_premium()` | `01-Schema/reset_and_rebuild_v2.sql:3912-3913` | Authenticated paid | D13 | **D13 says Free gets 10 bookmarks** — current SQL blocks free users entirely at insert. Trigger `enforce_bookmark_cap` would allow 10 free but the INSERT policy short-circuits first. Free flow is broken. |
| article | Retrieve bookmark count for article | `article.bookmark_count` | server fetch (unauthed OK) | `site/src/app/api/bookmarks/route.js:11` | Everyone | — | — |
| article | Mark article as read | `article.read.log` | `stories/read` route + RLS `reading_log_insert` user_id = auth.uid() | `site/src/app/api/stories/read/route.js` + `01-Schema/reset_and_rebuild_v2.sql:3926` | Authenticated self | — | — |
| article | Listen via TTS | `article.listen_tts` | client gate `isPaidTier(userTier)` | `site/src/app/story/[slug]/page.js` + `VerityPost/VerityPost/StoryDetailView.swift:249` | Verity+ | D17 | — |
| article | See other users' Verity Scores | `article.view_other_scores` | client gate `isPaidTier(currentUserTier)` in CommentRow | `site/src/components/CommentRow.jsx:85` | Paid only | D5,D7 | — |
| article | Report this article | `article.report_article` | `requireVerifiedEmail` + `requireNotBanned` | `site/src/app/api/reports/route.js:9` | Verified, not banned | D39 | — |
| article | View expert responses (unblurred) | `article.view_expert_responses` | client `isPaidTier(tier)` | `site/src/app/story/[slug]/page.js` | Verity+ | D20 | "2 experts answered" visible to free; body blur is client-only — ambiguous |
| article | Share article externally | `article.share_external` | no gate | n/a | Everyone | — | — |
| article | Copy article link | `article.copy_link` | no gate | n/a | Everyone | — | — |
| bookmark_collections | Create named collection | `bookmarks.create_collection` | RPC `create_bookmark_collection` requires `_user_is_paid` | `01-Schema/015_phase7_helpers.sql:100` + `site/src/app/api/bookmark-collections/route.js:9` | Verity+ | D13 | — |
| bookmark_collections | Rename collection | `bookmarks.rename_collection` | RPC `rename_bookmark_collection` owner-only | `01-Schema/015_phase7_helpers.sql:131` | Authenticated owner (paid) | D13 | — |
| bookmark_collections | Delete collection | `bookmarks.delete_collection` | RPC `delete_bookmark_collection` owner-only | `01-Schema/015_phase7_helpers.sql:161` | Authenticated owner (paid) | D13 | — |
| bookmarks | Add bookmark | `bookmarks.add` | RLS `is_premium()` (but see discrepancy) | `01-Schema/reset_and_rebuild_v2.sql:3912-3913` | Free (10) + Verity+ unlimited | D13 | **RLS blocks free; trigger in `015_phase7_helpers.sql:32` caps free at 10 but never runs because INSERT RLS denies first.** |
| bookmarks | Remove bookmark | `bookmarks.remove` | RLS owner-only | `01-Schema/reset_and_rebuild_v2.sql:3918` | Authenticated self | — | — |
| bookmarks | Update bookmark (note / collection) | `bookmarks.edit` | PATCH route `requireAuth()` + ownership + `_user_is_paid` for note | `site/src/app/api/bookmarks/[id]/route.js:10-26` | Verity+ for notes | D13 | — |
| bookmarks | Export bookmarks | `bookmarks.export` | `requireAuth()` + `_user_is_paid` | `site/src/app/api/bookmarks/export/route.js:8-12` | Verity+ | D13 | — |
| bookmarks | View own bookmarks list | `bookmarks.view_list` | RLS `user_id = auth.uid()` | `01-Schema/reset_and_rebuild_v2.sql:3909` | Authenticated self | — | — |
| comments | View a comment thread | `comments.view` | RLS `status='published' AND deleted_at IS NULL OR owner OR mod+` | `01-Schema/reset_and_rebuild_v2.sql:3873` | Everyone (published); D6 says quiz gate should apply | D6 | **D6 requires quiz pass to see comments at all.** RLS allows public SELECT. No code enforcement. |
| comments | Post a top-level comment | `comments.post` | `requireAuth()` + RPC `post_comment` (checks quiz pass + not banned + verified) | `site/src/app/api/comments/route.js:15` + RLS `has_verified_email AND NOT is_banned` | Verified, not banned, quiz passed | D1,D6,D8 | — |
| comments | Reply to a comment | `comments.reply` | same as comments.post | `site/src/app/api/comments/route.js:15` | Same | D1 | — |
| comments | Edit own comment | `comments.edit_own` | `requireAuth()` + RLS owner-only | `site/src/app/api/comments/[id]/route.js:8` | Authenticated owner | — | — |
| comments | Delete own comment | `comments.delete_own` | `requireAuth()` + RLS owner-or-mod | `site/src/app/api/comments/[id]/route.js:28` + RLS 3884 | Authenticated owner; mods can force | D30 | — |
| comments | Upvote a comment | `comments.upvote` | `requireAuth()` + RLS `has_verified_email AND NOT is_banned` | `site/src/app/api/comments/[id]/vote/route.js:12` + RLS 3890 | Verified, not banned (quiz-passers per D29) | D29 | quiz-pass check is enforced inside `vote_on_comment` RPC — ambiguous without reading RPC |
| comments | Downvote a comment | `comments.downvote` | same as upvote | `site/src/app/api/comments/[id]/vote/route.js:12` | Same | D29 | — |
| comments | Remove own vote | `comments.remove_vote` | RLS `comment_votes_delete` user_id = auth.uid() | `01-Schema/reset_and_rebuild_v2.sql:3893` | Authenticated self | D29 | — |
| comments | Report a comment | `comments.report` | `requireAuth()` | `site/src/app/api/comments/[id]/report/route.js:12` | Verified, not banned | D39 | — |
| comments | Mention another user (@user) | `comments.mention_user` | RPC `post_comment` strips mentions for free users | server RPC body (not read) + `site/src/app/api/comments/route.js:10-11` comment | Paid (Verity+) | D21 | — |
| comments | Tag comment as Article Context (autopin) | `comments.context_tag` | `requireAuth()` | `site/src/app/api/comments/[id]/context-tag/route.js:13` | Quiz-passers on that article | D15,D16 | no server-side quiz-pass assertion found in route |
| comments | Flag comment (supervisor fast-lane) | `comments.flag_supervisor` | `requireAuth()` → RPC `supervisor_flag_comment` (asserts `user_is_supervisor_in`) | `site/src/app/api/comments/[id]/flag/route.js:9` + `01-Schema/016_phase8_trust_safety.sql:143` | Category Supervisors | D22 | — |
| comments | Block a user from your feed | `comments.block_user` | `requireAuth()` + RLS `blocker_id = auth.uid() AND has_verified_email` | `site/src/app/api/users/[id]/block/route.js:9` + RLS 4109 | Verified | D39 | — |
| comments | Unblock a user | `comments.unblock_user` | RLS `blocker_id = auth.uid()` | `01-Schema/reset_and_rebuild_v2.sql:4112` | Verified self | D39 | — |
| comments | Pin own (expert) answer | `expert.article.pin_own_answer` | RPC internal (post_expert_answer threads as reply) | `01-Schema/014_phase6_expert_helpers.sql:427` | Expert/Educator/Journalist | — | no dedicated pin endpoint — ambiguous |
| community_notes | Submit community note | `community_notes.submit` | RLS `author_id = auth.uid() AND has_verified_email AND NOT is_banned` | `01-Schema/reset_and_rebuild_v2.sql:3946` | Verified, not banned | D15 | D15 says community notes are REPLACED by organic comment tagging — dead schema |
| community_notes | Vote on community note | `community_notes.vote` | RLS `has_verified_email` | `01-Schema/reset_and_rebuild_v2.sql:3955` | Verified | D15 | dead per D15 |
| community_notes | View approved community notes | `community_notes.view` | RLS `status='approved' OR author OR mod+` | `01-Schema/reset_and_rebuild_v2.sql:3943` | Everyone | D15 | dead per D15 |
| content_admin | Create article (draft) | `admin.articles.create` | `requireRole('editor')` + RLS `is_editor_or_above` | `site/src/app/api/admin/stories/route.js:8` | Editor+ | — | — |
| content_admin | Update article | `admin.articles.edit_any` | `requireRole('editor')` + RLS | `site/src/app/api/admin/stories/route.js:52` | Editor+ | — | — |
| content_admin | Publish article | `admin.articles.publish` | `requireRole('editor')` | `site/src/app/api/admin/stories/route.js` | Editor+ | D30 | — |
| content_admin | Delete article | `admin.articles.delete` | `requireRole('admin')` + RLS `is_admin_or_above` | `site/src/app/api/admin/stories/route.js:91` + RLS 3661 | Admin+ | D30 | — |
| content_admin | Manage article_relations | `admin.articles.manage_relations` | RLS `is_editor_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:3717` | Editor+ | — | — |
| content_admin | Manage timelines | `admin.timelines.manage` | RLS `is_editor_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:3688-3691` | Editor+ | — | — |
| content_admin | Manage sources | `admin.sources.manage` | RLS `is_editor_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:3679-3682` | Editor+ | — | — |
| content_admin | Manage media assets | `admin.media.manage` | RLS `is_editor_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:3723-3726` | Editor+ | — | — |
| content_admin | Manage quizzes | `admin.quizzes.manage` | RLS `is_editor_or_above()` | `01-Schema/reset_and_rebuild_v2.sql:3700-3703` | Editor+ | — | — |
| content_admin | Send breaking-news broadcast | `admin.broadcasts.breaking` | `requireRole('editor')` | `site/src/app/api/admin/broadcasts/breaking/route.js:10` | Editor+ | D14 | — |
| content_admin | Create/edit recap quizzes | `admin.recap.manage` | `requireRole('editor')` | `site/src/app/api/admin/recap/route.js:8` + 7 sites | Editor+ | D36 | — |
| cron | Run scheduled freeze-grace sweep | `cron.freeze_grace` | `verifyCronAuth()` (Bearer CRON_SECRET) | `site/src/app/api/cron/freeze-grace/route.js` | System cron | D40 | — |
| cron | Run kid-trial expiry sweeper | `cron.sweep_kid_trials` | `verifyCronAuth()` | `site/src/app/api/cron/sweep-kid-trials/route.js` | System cron | D44 | — |
| cron | Process data-export requests | `cron.data_exports` | `verifyCronAuth()` | `site/src/app/api/cron/process-data-exports/route.js` | System cron | — | — |
| cron | Process queued deletions | `cron.process_deletions` | `verifyCronAuth()` | `site/src/app/api/cron/process-deletions/route.js` | System cron | — | — |
| cron | Send queued transactional emails | `cron.send_emails` | `verifyCronAuth()` | `site/src/app/api/cron/send-emails/route.js` | System cron | D25 | — |
| cron | Send queued push | `cron.send_push` | `verifyCronAuth()` | `site/src/app/api/cron/send-push/route.js` | System cron | — | — |
| cron | Check achievement unlocks | `cron.check_achievements` | `verifyCronAuth()` | `site/src/app/api/cron/check-user-achievements/route.js` | System cron | — | — |
| cron | Flag expert re-verification | `cron.flag_expert_reverifications` | `verifyCronAuth()` | `site/src/app/api/cron/flag-expert-reverifications/route.js` | System cron | D3 | — |
| cron | Recompute family achievements | `cron.recompute_family_achievements` | `verifyCronAuth()` | `site/src/app/api/cron/recompute-family-achievements/route.js` | System cron | D24 | — |
| billing | Open Stripe checkout session | `billing.checkout` | `requireAuth()` | `site/src/app/api/stripe/checkout/route.js:9` | Authenticated | D42 | — |
| billing | Open Stripe customer portal | `billing.portal` | `requireAuth()` | `site/src/app/api/stripe/portal/route.js:8` | Authenticated with stripe_customer_id | — | — |
| billing | Handle Stripe webhook | `billing.webhook.stripe` | signature verification (no role) | `site/src/app/api/stripe/webhook/route.js` | Stripe | — | — |
| billing | Cancel own subscription | `billing.cancel` | `requireAuth()` → RPC `billing_cancel_subscription` | `site/src/app/api/billing/cancel/route.js:11` | Authenticated paid owner | D40 | — |
| billing | Change plan tier | `billing.change_plan` | `requireAuth()` → RPC `billing_change_plan` | `site/src/app/api/billing/change-plan/route.js:10` | Authenticated paid owner | D42 | — |
| billing | Resubscribe after cancel/freeze | `billing.resubscribe` | `requireAuth()` → RPC `billing_resubscribe` | `site/src/app/api/billing/resubscribe/route.js:10` | Authenticated frozen/grace user | D40 | — |
| billing | Redeem promo code | `billing.redeem_promo` | `requireAuth()` → RPC `redeem_promo_code` | `site/src/app/api/promo/redeem/route.js:14` | Authenticated | D43 | — |
| billing | View own subscription + invoices | `billing.view_subscription` | RLS owner + `is_admin_or_above` | `01-Schema/reset_and_rebuild_v2.sql:4131-4145` | Authenticated self | — | — |
| billing | View own IAP transactions | `billing.view_iap` | RLS owner + admin | `01-Schema/reset_and_rebuild_v2.sql:4148-4154` | Authenticated self | — | — |
| billing_admin | Force-freeze a user account | `admin.billing.freeze` | `requireRole('admin')` | `site/src/app/api/admin/billing/freeze/route.js:13` | Admin+ | D40 | — |
| billing_admin | Force-cancel subscription | `admin.billing.cancel` | `requireRole('admin')` | `site/src/app/api/admin/billing/cancel/route.js:15` | Admin+ | — | — |
| billing_admin | Run grace-period sweep | `admin.billing.sweep_grace` | `requireRole('admin')` | `site/src/app/api/admin/billing/sweep-grace/route.js:10` | Admin+ | D40 | — |
| expert | Apply to become expert | `expert.application.apply` | `requireAuth()` → RPC `submit_expert_application` | `site/src/app/api/expert/apply/route.js:11` | Authenticated verified | D3 | — |
| expert | View own application status | `expert.application.view_own` | RLS owner | `01-Schema/reset_and_rebuild_v2.sql:3964` | Authenticated self | — | — |
| expert | View expert queue (inbound questions) | `expert.queue.view` | `requireAuth()` | `site/src/app/api/expert/queue/route.js:10` | Authenticated (filtered server-side by role) | D33 | — |
| expert | Claim a queue item | `expert.queue.claim` | `requireAuth()` → RPC `claim_queue_item` (asserts `is_user_expert`) | `site/src/app/api/expert/queue/[id]/claim/route.js:7` | Expert/Educator/Journalist | D33 | — |
| expert | Decline a queue item | `expert.queue.decline` | `requireAuth()` → RPC `decline_queue_item` | `site/src/app/api/expert/queue/[id]/decline/route.js:7` | Expert (claimer) | — | — |
| expert | Post expert answer | `expert.queue.answer` | `requireAuth()` → RPC `post_expert_answer` (asserts expert + probation handling) | `site/src/app/api/expert/queue/[id]/answer/route.js:9` | Expert/Educator/Journalist | D3,D20 | — |
| expert | Ask an expert (paid user action) | `expert.ask` | `requireAuth()` → RPC `ask_expert` (asserts Verity Pro+ AND quiz passed) | `site/src/app/api/expert/ask/route.js:11` + `01-Schema/014_phase6_expert_helpers.sql:262` | **Verity Pro, Family, Family XL** | D20 | **D20 says "Paid users (Verity, Verity Pro, Family)"** but RPC only allows verity_pro+. Bug `034_bugfix_ask_expert_tier.sql` exists — need to re-check current RPC body |
| expert | Read expert back-channel messages | `expert.back_channel.read` | `requireAuth()` → RPC `expert_can_see_back_channel()` | `site/src/app/api/expert/back-channel/route.js:13` | Expert/Editor/Admin/Super/Owner | D33 | — |
| expert | Post back-channel message | `expert.back_channel.post` | `requireAuth()` → RPC `post_back_channel_message` (asserts back-channel role) | `site/src/app/api/expert/back-channel/route.js:37` | Same | D33 | — |
| expert_admin | Approve expert answer (lift probation) | `admin.expert.answers.approve` | `requireRole('editor')` + RPC `approve_expert_answer` (requires editor+) | `site/src/app/api/expert/answers/[id]/approve/route.js:9` + `01-Schema/014_phase6_expert_helpers.sql:503` | Editor+ | D3 | — |
| expert_admin | View expert applications list | `admin.expert_applications.view` | `requireRole('editor')` | `site/src/app/api/admin/expert/applications/route.js:7` | Editor+ | D3 | — |
| expert_admin | Approve expert application | `admin.expert_applications.approve` | `requireRole('editor')` → RPC `approve_expert_application` | `site/src/app/api/admin/expert/applications/[id]/approve/route.js:7` | Editor+ | D3 | — |
| expert_admin | Reject expert application | `admin.expert_applications.reject` | `requireRole('editor')` | `site/src/app/api/admin/expert/applications/[id]/reject/route.js:7` | Editor+ | D3 | — |
| expert_admin | Clear background check (journalist) | `admin.expert_applications.clear_bg` | `requireRole('admin')` | `site/src/app/api/admin/expert/applications/[id]/clear-background/route.js:10` | Admin+ | D3 | — |
| expert_admin | Mark probation complete (override) | `admin.expert_applications.mark_probation_complete` | `requireRole('admin')` | `site/src/app/api/admin/expert/applications/[id]/mark-probation-complete/route.js:9` | Admin+ | D3 | — |
| expert_session | Create scheduled expert session (kid-facing) | `admin.expert_sessions.create` | `requireRole('editor')` | `site/src/app/api/expert-sessions/route.js:29` | Editor+ | D9 | — |
| expert_session | List expert sessions | `expert_session.list` | `requireAuth()` | `site/src/app/api/expert-sessions/route.js:10` | Authenticated | D9 | — |
| expert_session | Ask kid question in session | `expert_session.ask` | `requireAuth()` (POST `[id]/questions`) | `site/src/app/api/expert-sessions/[id]/questions/route.js:12` | Authenticated (kid or family) | D9 | no explicit kid-session-valid check at route — relies on RPC |
| expert_session | Answer kid question | `expert_session.answer` | `requireAuth()` + `getUserRoles` (expert roles checked server-side) | `site/src/app/api/expert-sessions/questions/[id]/answer/route.js:19` | Expert/Educator/Journalist | D9 | — |
| family | Get family leaderboard | `family.leaderboard.view` | `requireAuth()` | `site/src/app/api/family/leaderboard/route.js:9` | Family plan members | D24 | no explicit tier check in route — ambiguous |
| family | Get family weekly report | `family.weekly_report` | `requireAuth()` | `site/src/app/api/family/weekly-report/route.js:9` | Family plan | D24 | no explicit tier check |
| family | Get family shared achievements | `family.achievements` | `requireAuth()` | `site/src/app/api/family/achievements/route.js:10` | Family plan | D24 | no explicit tier check |
| home | View default home feed | `home.view_feed` | none — public | n/a | Everyone | — | — |
| home | Basic keyword search | `home.search_basic` | `requireAuth()` in search route | `site/src/app/api/search/route.js` | Verified | D26 | — |
| home | Advanced search filters (date/source/cat) | `home.search_advanced` | route checks `_user_is_paid` | `site/src/app/api/search/route.js:25` | Verity+ | D26 | — |
| home | Browse subcategories drilldown | `home.subcategories` | public SELECT on categories | RLS 3666 | Everyone | — | — |
| iap | Sync App Store subscription | `iap.sync` | `requireAuth()` + receipt validation | `site/src/app/api/ios/subscriptions/sync/route.js` | Authenticated iOS | — | — |
| iap | Handle App Store Server Notification | `iap.webhook.apple` | Apple signed JWT (no role) | `site/src/app/api/ios/appstore/notifications/route.js` | Apple | — | — |
| kids | Create kid profile | `kids.profile.create` | `requireAuth()` + `enforce_max_kids` trigger | `site/src/app/api/kids/route.js:30` + `01-Schema/reset_and_rebuild_v2.sql:5484` | Verity Family (2) / Family XL (4) / 1 trial for any verified | D34,D44 | — |
| kids | Start 1-week kid trial | `kids.trial.start` | `requireAuth()` → RPC `start_kid_trial` (one-per-account) | `site/src/app/api/kids/trial/route.js:25` + `01-Schema/017_phase9_family.sql:25` | Any verified (once) | D44 | — |
| kids | Convert kid trial to Family | `kids.trial.convert` | RPC `convert_kid_trial` called by billing hooks | `01-Schema/017_phase9_family.sql:135` | System/service | D44 | — |
| kids | Update kid profile | `kids.profile.update` | `requireAuth()` + RLS `owns_kid_profile` | `site/src/app/api/kids/[id]/route.js:12` + RLS 3779 | Parent only | D12 | — |
| kids | Delete kid profile | `kids.profile.delete` | `requireAuth()` + RLS | `site/src/app/api/kids/[id]/route.js:43` | Parent only | D12 | — |
| kids | Set kid PIN | `kids.pin.set` | `requireAuth()` → RPC `set_kid_pin` | `site/src/app/api/kids/set-pin/route.js:15` + `01-Schema/reset_and_rebuild_v2.sql:5572` | Parent | D34 | — |
| kids | Reset kid PIN (parent action) | `kids.pin.reset` | `requireAuth()` | `site/src/app/api/kids/reset-pin/route.js:9` | Parent | D34 | — |
| kids | Verify kid PIN to unlock | `kids.pin.verify` | `requireAuth()` → RPC `unlock_as_kid(pin, device)` | `site/src/app/api/kids/verify-pin/route.js:22` + `01-Schema/reset_and_rebuild_v2.sql:5613` | Parent on bound device | D34 | — |
| kids | Use streak freeze | `kids.streak_freeze.use` | `requireAuth()` → RPC `use_kid_streak_freeze` (cap 2/week) | `site/src/app/api/kids/[id]/streak-freeze/route.js:8` + `01-Schema/017_phase9_family.sql:167` | Kid (via parent) | D19 | — |
| kids | View household KPIs | `kids.household_kpis` | `requireAuth()` (RPC verifies parent) | `site/src/app/api/kids/household-kpis/route.js:18` | Parent | D24 | — |
| kids | View kids global leaderboard | `kids.leaderboard.global` | `requireAuth()` | `site/src/app/api/kids/global-leaderboard/route.js:17` | Kid profiles only | D12 | discussion in D12 says adults should never see — no explicit kid-mode-only check at route |
| kids_expert | Kid expert session RLS read | `kids_expert.session.read` | RLS `authenticated OR kid_session_valid` | `01-Schema/063_kid_expert_session_rls.sql` | Kid (via session token) or adult expert | D9,D33 | — |
| leaderboard | View global top-10 (anon) | `leaderboard.view_top_10` | public (RLS on users with profile_visibility='public') | RLS 3735 | Anonymous | D31 | — |
| leaderboard | View full global leaderboard | `leaderboard.view_global_full` | server page fetch, no explicit gate | `site/src/app/leaderboard/page.js` | Free Verified+ | D31 | client-only toggle; no server cap — ambiguous |
| leaderboard | View category leaderboard | `leaderboard.view_category` | client gate `isPaidTier` | `site/src/app/leaderboard/page.js` | Paid only | D31 | — |
| leaderboard | View subcategory leaderboard | `leaderboard.view_subcategory` | client gate `isPaidTier` | `site/src/app/leaderboard/page.js` | Paid only | D31 | — |
| messages | Create DM conversation | `messages.create_conversation` | RLS `created_by = auth.uid() AND public.is_premium()` | `01-Schema/reset_and_rebuild_v2.sql:4006` | Paid (not frozen, not in grace for DMs) | D11,D40 | `is_premium()` = has plan_id + active; D40 says DMs must go away immediately on cancel. Need to verify `user_has_dm_access` is actually used — currently only `is_premium` checked |
| messages | Send a message | `messages.send_message` | RLS `is_premium() AND NOT is_banned() AND participant` | `01-Schema/reset_and_rebuild_v2.sql:4035` | Paid participant | D11,D40 | same DM-grace issue |
| messages | View conversations list | `messages.view_conversations` | RLS participant-or-admin | RLS 4002 | Participants | — | — |
| messages | Mark conversation read | `messages.mark_read` | RLS `user_id = auth.uid()` on receipts | RLS 4044-4050 | Participants | — | — |
| messages | Edit own message | `messages.edit_own_message` | RLS `sender_id = auth.uid()` | RLS 4039 | Sender | — | — |
| messages | Search across conversations | `messages.search` | `requireAuth()` + `_user_is_paid` | `site/src/app/api/messages/search/route.js:20` | Paid | D11 | — |
| moderation | View reports queue | `mod.reports.view_queue` | `requireRole('moderator')` | `site/src/app/api/admin/moderation/reports/route.js:7` | Moderator+ | D30 | — |
| moderation | Resolve report | `mod.reports.resolve` | `requireRole('moderator')` → RPC `resolve_report` | `site/src/app/api/admin/moderation/reports/[id]/resolve/route.js:9` + `01-Schema/016_phase8_trust_safety.sql:346` | Moderator+ | D30 | — |
| moderation | Hide comment | `mod.comments.hide` | `requireRole('moderator')` → RPC `hide_comment` | `site/src/app/api/admin/moderation/comments/[id]/hide/route.js:7` + `01-Schema/016_phase8_trust_safety.sql:201` | Moderator+ | D30 | — |
| moderation | Unhide comment | `mod.comments.unhide` | `requireRole('moderator')` → RPC `unhide_comment` | `site/src/app/api/admin/moderation/comments/[id]/unhide/route.js:7` | Moderator+ | D30 | — |
| moderation | Apply penalty (warn/mute/ban) | `mod.users.penalty` | `requireRole('moderator')` → RPC `apply_penalty` | `site/src/app/api/admin/moderation/users/[id]/penalty/route.js:19` + `01-Schema/016_phase8_trust_safety.sql:261` | Moderator+ (actor-outranks target F-035) | D30 | — |
| moderation | Manage blocked_words | `mod.blocked_words.manage` | RLS `is_admin_or_above()` (not mod!) | `01-Schema/reset_and_rebuild_v2.sql:4095-4098` | Admin+ | D30 | xlsx says mod can manage — schema says admin-only. Drift. |
| moderation | Manage reserved_usernames | `mod.reserved_usernames.manage` | RLS `is_admin_or_above()` | RLS 4101-4103 | Admin+ | — | xlsx lists as mod; schema says admin |
| moderation | Grant/revoke role | `admin.users.edit_role` | `requireRole('moderator')` (+ RPC grant_role requires admin) | `site/src/app/api/admin/users/[id]/roles/route.js:28` + `01-Schema/016_phase8_trust_safety.sql:470` | Inconsistent: route allows mod, RPC requires admin | D30 | **Mismatch — route gate is 'moderator' but the RPC rejects non-admin. Route is too-permissive by name, RPC blocks the real action.** |
| notifications | List own notifications | `notifications.view_inbox` | `requireAuth()` + RLS user_id | `site/src/app/api/notifications/route.js:13` + RLS 4055 | Authenticated self | — | — |
| notifications | Mark read / dismiss | `notifications.mark_read` | `requireAuth()` | `site/src/app/api/notifications/route.js:39` | Authenticated self | — | — |
| notifications | Update alert preferences | `notifications.toggle_channels` | `requireAuth()` + RLS user_id | `site/src/app/api/notifications/preferences/route.js:11` | Authenticated self | — | — |
| notifications | Receive breaking-news alerts | `notifications.breaking_alerts` | RPC `dispatch_breaking_broadcast` checks `_user_is_paid` for unlimited | `01-Schema/019_phase11_notifications.sql:97` | Free: 1/day, Verity+: unlimited | D14 | — |
| notifications | Category email alerts | `notifications.category_alerts` | none | n/a | None (cut) | D25 | xlsx has the key; D25 cut this |
| notifications | Email digest toggle | `notifications.email_digest` | none | n/a | None (cut) | D25 | D25 cut email digests |
| permissions | Get my permission version | `permissions.version.get` | RPC `my_perms_version()` | `01-Schema/reset_and_rebuild_v2.sql:5944` | Authenticated + anon | — | — |
| permissions | Get my capabilities for a section | `permissions.capabilities.get` | RPC `get_my_capabilities(section)` | `01-Schema/reset_and_rebuild_v2.sql:5864` | Anyone (kid-token optional) | — | — |
| permissions | Has permission (single key) | `permissions.check` | RPC `has_permission(key)` | `01-Schema/reset_and_rebuild_v2.sql:5840` | Anyone | — | — |
| permissions | Preview capabilities as another user | `permissions.preview_as` | RPC `preview_capabilities_as(user_id, section)` — SECURITY DEFINER, no explicit admin check in body read | `01-Schema/reset_and_rebuild_v2.sql:6212` | Admin+ | — | **Ambiguous — didn't confirm admin gate inside RPC; if missing, this leaks others' capabilities** |
| permissions_admin | Assign permission set to plan | `admin.permissions.assign_to_plan` | RLS `is_admin_or_above()` on `plan_permission_sets_write` | RLS 4939 | Admin+ | — | — |
| permissions_admin | Assign permission set to role | `admin.permissions.assign_to_role` | RLS `is_admin_or_above()` on `role_permission_sets_write` | RLS 4938 | Admin+ | — | — |
| permissions_admin | Override permission for a single user | `admin.permissions.assign_to_user` | RLS `is_admin_or_above()` on `user_permission_sets_write` | RLS 4940 | Admin+ | — | — |
| permissions_admin | Edit permission set contents | `admin.permissions.set.edit` | RLS `is_admin_or_above()` on `permission_set_perms_write` | RLS 4937 | Admin+ | — | — |
| permissions_admin | Scope override (per-article/category deny) | `admin.permissions.scope_override` | RLS `is_admin_or_above()` on `pso_write` | RLS 6074 | Admin+ | — | — |
| pipeline | View pipeline runs | `admin.pipeline.runs.view` | RLS `is_editor_or_above()` | RLS 4258 | Editor+ | — | — |
| pipeline | Start pipeline run | `admin.pipeline.runs.start` | RLS `is_editor_or_above()` (insert) + client /admin/pipeline UI | RLS 4259 | Editor+ | — | — |
| pipeline | View pipeline costs | `admin.pipeline.costs.view` | RLS `is_admin_or_above()` | RLS 4262-4263 | Admin+ | — | — |
| profile | View own profile | `profile.view_own` | RLS `id = auth.uid() OR public` | RLS 3735 | Authenticated self | — | — |
| profile | Edit own avatar/bio/username | `profile.edit_own` | RLS owner | RLS 3743 | Authenticated self | — | — |
| profile | Toggle profile visibility (public/private) | `settings.privacy.profile_visibility` | client + RLS | RLS 3743 | Authenticated self | D32 | — |
| profile | Toggle show on leaderboard | `settings.privacy.show_on_leaderboard` | client | `site/src/app/profile/settings/...` | Authenticated self | D32 | — |
| profile | Upload banner image | `profile.banner.upload` | client `isPaidTier(userTier)` | `site/src/app/profile/settings/profile/page.js` | Verity+ | D32 | — |
| profile | Public profile card page | `profile.card.view` | public page + `isPaidTier(target.plans?.tier)` gate | `site/src/app/card/[username]/page.js:42` | Viewer public; target must be paid for card to exist | D32 | — |
| profile | Public profile view (by username) | `profile.view_public` | RLS `profile_visibility = 'public'` | RLS 3735 | Everyone (if target public) | — | — |
| profile | Delete own account (30-day soft) | `profile.delete_account` | `requireAuth()` → RPC `request_account_deletion` | `site/src/app/api/account/delete/route.js` | Authenticated self | — | — |
| profile | Export own data | `profile.data.export` | `requireAuth()` | `site/src/app/api/reports/weekly-reading-report/route.js` for weekly, `_user_is_paid` for monthly | Paid (weekly report) | D25 | — |
| push | Register push token (APNS/FCM) | `push.register_token` | RPC `register_push_token` | `01-Schema/reset_and_rebuild_v2.sql:6355` | Authenticated | — | — |
| push | Invalidate own push token | `push.invalidate_token` | RPC `invalidate_push_token` | `01-Schema/reset_and_rebuild_v2.sql:6383` | Authenticated | — | — |
| push | Send push manually (test) | `admin.push.send` | `requireRole('admin')` | `site/src/app/api/push/send/route.js:18` | Admin+ | — | — |
| quiz | Start a quiz attempt | `quiz.start` | `requireAuth()` → RPC `start_quiz_attempt` (asserts retake limits per D1) | `site/src/app/api/quiz/start/route.js:15` | Verified (2 free attempts / unlimited paid) | D1 | — |
| quiz | Submit quiz answer | `quiz.submit` | `requireAuth()` | `site/src/app/api/quiz/submit/route.js:20` + RLS 3711 | Verified, not banned | D1,D8 | — |
| quiz | Retake quiz (paid unlimited) | `quiz.retake` | enforced inside RPC body | same RPC | Verity+ unlimited, Free 2 | D1 | — |
| quiz | View quiz explanations | `quiz.review_answers` | no gate in SQL | n/a | Everyone after attempt | D41 | — |
| quiz | Sponsored quiz bonus | `quiz.sponsored.bonus` | no explicit gate; RPC writes bonus points | n/a | All tiers | D35 | — |
| recap | View weekly recap quiz | `recap.view` | `requireAuth()` + `_user_is_paid` | `site/src/app/api/recap/route.js:14` | Verity+ | D36 | — |
| recap | Take recap quiz | `recap.submit` | `requireAuth()` + `_user_is_paid` | `site/src/app/api/recap/[id]/submit/route.js:20` | Verity+ | D36 | — |
| recap | Get single recap | `recap.view_one` | `requireAuth()` + `_user_is_paid` | `site/src/app/api/recap/[id]/route.js:13` | Verity+ | D36 | — |
| reports | View own reports | `reports.view_own` | RLS `reporter_id = auth.uid() OR mod+` | RLS 4084 | Authenticated self | D39 | — |
| reports | Create report on content | `reports.create` | `requireVerifiedEmail` + `requireNotBanned` | `site/src/app/api/reports/route.js:9-10` | Verified, not banned | D39 | — |
| reports | View weekly reading report (self) | `reports.weekly_reading` | `requireAuth()` + `_user_is_paid` | `site/src/app/api/reports/weekly-reading-report/route.js:13` | Paid | D25 | — |
| search | Basic search | `search.basic` | `requireAuth()` | `site/src/app/api/search/route.js` | Verified | D26 | — |
| search | Advanced search (filters) | `search.advanced` | route checks `_user_is_paid` | `site/src/app/api/search/route.js:25` | Verity+ | D26 | — |
| search | View / clear search history | `search.history.manage` | RLS `user_id = auth.uid()` | RLS 4331-4337 | Authenticated self | — | — |
| settings | View data-request status | `settings.data.view_consent` | RLS owner + admin | RLS 4306 | Authenticated self | — | — |
| settings | Request data export | `settings.data.export` | RLS `user_id = auth.uid()` insert | RLS 4309 | Authenticated self | — | — |
| settings | Request account deletion | `settings.data.request_deletion` | same | same | Authenticated self | — | — |
| settings | Change email | `settings.account.edit_email` | `requireAuth()` | `site/src/app/api/auth/email-change/route.js:15` | Authenticated self | — | — |
| settings | Resend verification email | `settings.account.resend_verification` | `requireAuth()` | `site/src/app/api/auth/resend-verification/route.js:11` | Authenticated self | — | — |
| sessions | Heartbeat current session | `sessions.heartbeat` | RPC `session_heartbeat` | `01-Schema/reset_and_rebuild_v2.sql:6467` | Authenticated | — | — |
| sessions | Revoke one session | `sessions.revoke` | RPC `revoke_session` | `01-Schema/reset_and_rebuild_v2.sql:6485` | Authenticated self | — | — |
| sessions | Revoke all other sessions | `sessions.revoke_all_other` | RPC `revoke_all_other_sessions` | `01-Schema/reset_and_rebuild_v2.sql:6494` | Authenticated self | — | — |
| social | Follow/unfollow user (toggle) | `social.follow` | RPC `toggle_follow` requires `_user_is_paid` | `site/src/app/api/follows/route.js:9` + `01-Schema/015_phase7_helpers.sql:183` | Paid | D28 | — |
| social | View profile's follower list | `social.follow.list_followers` | RLS `follows_select` true (globally visible) | RLS 3898 | Everyone | — | RLS allows `true` as fallback — public by default, which contradicts a privacy expectation. Ambiguous vs D32. |
| social | View profile's following list | `social.follow.list_following` | same | same | Everyone | — | — |
| stories | Log story read | `stories.read.log` | route POST; RLS | `site/src/app/api/stories/read/route.js` | Authenticated | — | — |
| support | Create support ticket | `support.create_ticket` | `requireAuth()` | `site/src/app/api/support/route.js:7` + RLS 4373 | Authenticated | — | — |
| support | List own tickets | `support.view_own_tickets` | `requireAuth()` + RLS | `site/src/app/api/support/route.js:40` | Authenticated self | — | — |
| support | Reply on own ticket | `support.reply_to_ticket` | `requireAuth()` + RLS participant | `site/src/app/api/support/[id]/messages/route.js:7` | Authenticated self or assigned staff | — | — |
| support_admin | View all tickets | `admin.support_tickets.view_all` | RLS `is_admin_or_above()` | RLS 4370 | Admin+ | — | — |
| supervisor | Opt into category supervisor role | `supervisor.opt_in` | `requireAuth()` → RPC `supervisor_opt_in` (asserts score threshold) | `site/src/app/api/supervisor/opt-in/route.js:7` + `01-Schema/016_phase8_trust_safety.sql:72` | Score ≥ threshold (default 500) | D22 | — |
| supervisor | Opt out of supervisor role | `supervisor.opt_out` | `requireAuth()` → RPC `supervisor_opt_out` | `site/src/app/api/supervisor/opt-out/route.js:7` | Authenticated opted-in | D22 | — |
| users_admin | View all users | `admin.users.view` | client role gate + RLS `is_admin_or_above` for full SELECT of non-public | `site/src/app/admin/users/page.js:103` | Admin+ | — | — |
| users_admin | Set user's plan manually | `admin.users.set_plan` | client role gate + service-client UPDATE | `site/src/app/admin/users/page.js:298-304` | Admin+ | — | — |
| users_admin | Grant/revoke role (UI) | `admin.users.edit_role` | `requireRole('moderator')` in route (RPC enforces admin) | `site/src/app/api/admin/users/[id]/roles/route.js:28` | Admin+ (effective) | D30 | see moderation row — route vs RPC mismatch |
| users_admin | Impersonate user | `admin.users.impersonate` | not implemented | n/a | n/a | — | spec'd-not-built (xlsx only) |

**Row count:** 175 rows above.

---

## Section 3: Gate inventory summary

Raw counts (derived from Grep output captured during the scan):

| gate type | count |
|---|---|
| `requireAuth()` calls in API routes | 148 |
| `requireRole('admin')` | 36 |
| `requireRole('editor')` | 24 |
| `requireRole('moderator')` | 14 |
| `requireVerifiedEmail` | 2 |
| `requireNotBanned` | 2 |
| `verifyCronAuth` (Bearer CRON_SECRET) | 9 |
| SQL RLS policies using `is_admin_or_above()` | ~62 |
| SQL RLS policies using `is_mod_or_above()` | ~8 |
| SQL RLS policies using `is_editor_or_above()` | ~14 |
| SQL policies using `has_verified_email()` in WITH CHECK | ~12 |
| SQL policies using `is_banned()` in WITH CHECK | ~8 |
| SQL policies using `is_premium()` / `_user_is_paid` | ~6 (messages, conversations, bookmarks.insert, follows via trigger, toggle_follow RPC, recap routes) |
| RPCs that internally assert role (`_user_is_moderator`, inline role checks) | 15+ (hide_comment, apply_penalty, grant_role, revoke_role, resolve_report, resolve_appeal, approve_expert_application, reject_expert_application, mark_probation_complete, approve_expert_answer, supervisor_flag_comment, ask_expert tier, post_back_channel_message, claim_queue_item, post_expert_answer) |
| iOS direct role queries (via `user_roles` join from Swift) | 3 files (ExpertQueueView, MessagesView, HomeFeedSlots) |
| iOS tier checks (`plan == "free"`, `isPaidTier`) | 6 files (BookmarksView, RecapView, ProfileView, StoryDetailView, PublicProfileView, HomeView, StoreManager) |
| `hasPermission(key)` client-side (adult UI) | **0 outside lib/permissions.js itself** |

### Top 10 most-used gates (by call count)

1. `requireAuth()` — 148
2. RLS `is_admin_or_above()` — ~62
3. `requireRole('admin')` — 36
4. `requireRole('editor')` — 24
5. RLS `user_id = auth.uid()` / owner-only — ~40+ policies
6. Client-side `isPaidTier(tier)` — used in 13+ pages/components
7. `requireRole('moderator')` — 14
8. RLS `is_editor_or_above()` — ~14
9. Route-level RPC call `_user_is_paid` — 6 routes
10. RLS `has_verified_email() AND NOT is_banned()` — ~12

### Roles referenced in code vs. `roles` table

Seeded roles (reset_and_rebuild_v2.sql:3110-3119): `owner, superadmin, admin, editor, moderator, expert, educator, journalist, user`. **All roles referenced in code exist in the table.** The in-code hierarchy map (`lib/auth.js:75`, `lib/roles.js:19`) matches the DB seed levels.

- No ghost roles. No roles seeded but never checked. `user` is rarely checked directly (default behavior).

### Permission keys in code with no xlsx counterpart

From `site/src/lib/permissionKeys.js`, **every key is present in the xlsx** (xlsx is the superset — see Section 4). The in-code constants are a ~63-key subset.

---

## Section 4: Stale xlsx drift

### Permission keys in xlsx but no code enforcement found (spec'd-not-built)

- `admin.owner.billing_account`
- `admin.owner.transfer_ownership`
- `admin.owner.delete_tenant`
- `admin.superadmin.bypass_rls`
- `admin.superadmin.sql_runner`
- `admin.superadmin.force_impersonate`
- `admin.users.impersonate`
- `admin.users.view_pii`
- `admin.kids.override`
- `article.react`
- `article.view_reactions`
- `article.read_offline`
- `article.ad_free_view`
- `auth.add_connected_account`
- `auth.remove_connected_account`
- `auth.enable_2fa`
- `auth.disable_2fa`
- `auth.view_login_history`
- `auth.list_devices`
- `auth.unbind_device`
- `community_notes.*` (D15 cut)
- `feeds.view_builtin`
- `feeds.create_custom`
- `feeds.edit_custom`
- `feeds.delete_custom`
- `feeds.subscribe_feed`
- `follows.view_suggested`
- `follows.hide_from_followers`
- `home.save_search`
- `home.view_saved_searches`
- `home.personalized_feed`
- `kids.profile.view_streak`
- `kids.profile.view_achievements`
- `leaderboard.view_friend_ranks`
- `leaderboard.view_historical`
- `leaderboard.filter_by_streak`
- `messages.add_participant`
- `messages.view_read_receipts` (partially wired — only `dm_read_receipts_enabled` setting exists)
- `messages.attach_media`
- `messages.group_conversation`
- `mod.comments.set_reason`
- `mod.comments.view_ip`
- `mod.comments.view_user_agent`
- `mod.comments.view_ai_signals`
- `mod.comments.view_hidden`
- `mod.reports.mark_duplicate`
- `mod.reports.escalate`
- `mod.users.view_flags`
- `mod.users.view_report_history`
- `notifications.toggle_in_app`
- `notifications.category_alerts` (D25 cut)
- `notifications.email_digest` (D25 cut)
- `onboarding.skip`
- `quiz.share_result`
- `quiz.per_article_leaderboard`
- `reading_log.clear_history`
- `reading_log.mark_read`
- `reading_log.export`
- `settings.accessibility.set`
- `settings.appearance.font_size`
- `settings.appearance.set_theme`
- `settings.language.set`
- `settings.privacy.hide_from_search`
- `settings.privacy.show_verity_score`

### Permission keys in code with no xlsx counterpart (built-not-spec'd)

The xlsx is a superset of `lib/permissionKeys.js`. However, the xlsx **does not cover** these effective capabilities that the code actively enforces:

- `billing.change_plan` (route exists, no xlsx row for plan-switching)
- `billing.resubscribe` (route exists)
- `billing.webhook.stripe` (no xlsx entry)
- `cron.*` (all 9 cron routes — xlsx has no cron surface)
- `expert.queue.claim`, `expert.queue.decline`, `expert.queue.answer` (xlsx has queue.view, queue.view_history, queue.claim, queue.answer, queue.decline — all present, matches)
- `iap.sync`, `iap.webhook.apple` (xlsx has billing.* but no IAP-specific rows)
- `kids.trial.start`, `kids.trial.convert` (D44 added after xlsx)
- `kids.leaderboard.global` (D12 2026-04-16 clarification — xlsx predates)
- `permissions.preview_as`
- `permissions.version.get`
- `permissions.capabilities.get`
- `permissions.check`
- `supervisor.opt_in`, `supervisor.opt_out` (xlsx has no supervisor surface at all)
- `supervisor.flag_comment` (D22 flag fast-lane)
- `sessions.heartbeat`, `sessions.revoke`, `sessions.revoke_all_other`
- `push.register_token`, `push.invalidate_token`
- `appeals.submit`, `mod.appeals.resolve` (no xlsx keys for appeals)

---

## Section 5: Design-decision coverage

One line per D-number. "No code enforcement found" means I could not locate a gate; it does not mean the decision is un-implemented (UI-only features may exist) — but flag any such row for re-check.

- **D1** — Quiz gates comment access. Enforced inside `post_comment` RPC (quiz pass check) and RLS `comments_insert` requires verified + not banned.
- **D2** — Verity Score = knowledge map, no tier labels. Not a gate; UI-only design. No enforcement needed.
- **D3** — Expert badges are only public authority signal. Enforced via `is_expert_in_probation`, `approve_expert_application`, `reject_expert_application`, `mark_probation_complete`, `approve_expert_answer` + cron `flag-expert-reverifications` + migration `041_expert_reverification.sql`.
- **D4** — Category/subcategory scores drive engagement. Not a gate; behavior-only.
- **D5** — Paid tiers see others' scores. Enforced client-side via `isPaidTier(currentUserTier)` in CommentRow.jsx; iOS PublicProfileView. No server SELECT gate on `verity_score` column — **leak risk if column is in a SELECT issued by free-user client**. Ambiguous.
- **D6** — Comment section fully hidden until quiz passed. **RLS does not enforce this.** Comments are publicly SELECT-able when status='published'. Client must hide them; a direct API call would return data. **Gap.**
- **D7** — Comment score display shows Verity Score not quiz score. Client-only (CommentRow.jsx).
- **D8** — No quiz bypass for any role. Enforced via `user_passed_quiz` helper and `post_comment`/`ask_expert` RPC bodies. Correct.
- **D9** — Kids have no discussion section; expert sessions instead. Enforced via `expert-sessions/*` routes + RLS in `063_kid_expert_session_rls.sql`. Kids routes never write to `comments`.
- **D10** — Brand tier names. Plans seeded `verity / verity_pro / verity_family / verity_family_xl` — correct in `lib/tiers.js`.
- **D11** — DMs paid-only, permanently. Enforced via RLS `messages_insert` requires `is_premium()` and `conversations_insert` requires `is_premium()`. Also `user_has_dm_access` helper exists in `011_phase3_billing_helpers.sql` but **not actually invoked in RLS** — that function adds grace/frozen checks for D40 that `is_premium()` misses. **Partial drift.**
- **D12** — Kid profiles undiscoverable. Enforced: search routes don't query kid_profiles; kid_profiles RLS is parent-only. Adult leaderboard query doesn't join kids. **Kids global leaderboard** route (`api/kids/global-leaderboard/route.js`) only requires authentication — no check that caller is in kid mode. **Minor gap.**
- **D13** — Bookmarks free (10) / unlimited Verity+. **Broken** — RLS `bookmarks_insert` requires `is_premium()`, which blocks free users entirely. Trigger `enforce_bookmark_cap` never runs because RLS denies first. Needs fix before re-seed.
- **D14** — Breaking-news alerts 1/day free, unlimited paid. Enforced in `dispatch_breaking_broadcast` RPC via `_user_is_paid` check (`019_phase11_notifications.sql:97`).
- **D15** — No community notes; organic context pinning. Comments endpoint `context-tag` exists. Community_notes tables still exist with RLS but are unused. Dead schema.
- **D16** — Quiz-passers can context-tag. Route `api/comments/[id]/context-tag` asserts requireAuth, but **no server-side quiz-pass assertion**. Ambiguous.
- **D17** — TTS at Verity+. Enforced client-side (`isPaidTier` in StoryDetailView and iOS). No server gate (TTS is CSR audio synthesis).
- **D18** — Offline reading cut. No code path for offline downloads. Correctly omitted.
- **D19** — Streak freezes Pro+2/week, Kids+2/week. Kids enforced via `use_kid_streak_freeze` RPC. **Adult Verity Pro streak freeze path not found** in routes — may be unimplemented or UI-only.
- **D20** — Ask an Expert: Verity Pro+, blurred for free. Enforced via `ask_expert` RPC requires `verity_pro+`. **But D20 text says "Paid users (Verity, Verity Pro, Family)"** — discrepancy between design text and RPC. Migration `034_bugfix_ask_expert_tier.sql` exists — likely loosens.
- **D21** — Mentions paid-only. Enforced inside `post_comment` RPC (comment says "strips for free-tier") — RPC body not read, ambiguous. Verify.
- **D22** — Category Supervisor opt-in + flag/report only. Enforced via `supervisor_opt_in`, `supervisor_flag_comment` RPCs; `category_supervisors` table; score threshold `supervisor_eligibility_score` setting.
- **D23** — Tier-aware ad strategy. Enforced via `serve_ad` RPC using `_user_tier_or_anon` + `hidden_for_tiers` / `reduced_for_tiers` placement config.
- **D24** — Family-specific engagement features. Routes exist (`family/leaderboard`, `family/weekly-report`, `family/achievements`) but **no tier check in route** — relies on data being present only if household exists. Ambiguous.
- **D25** — No email digest / category email alerts. Emails limited to account essentials + weekly reports. `email_templates` RLS admin-only. No digest endpoint found. Correctly omitted.
- **D26** — Search: basic free / advanced paid. Enforced at `api/search` route via `_user_is_paid`.
- **D27** — No credibility ratings on sources/articles. No such columns in `sources` or `articles` tables. Correctly omitted.
- **D28** — Follow is paid-only. Enforced via `toggle_follow` RPC + RLS `follows_insert` has `has_verified_email AND NOT is_banned` but **not `is_premium()`** — RPC is the gate, RLS alone is too permissive. Migration `047_follows_paid_only.sql` exists — verify policy actually tightens.
- **D29** — No article reactions; comment up/down only. `reactions` table RLS exists but `articles` has no reaction columns; `comment_votes` has up/down. Correct.
- **D30** — Role hierarchy: Supervisors flag → Mods act → Editors publish → Admins manage. Enforced via `requireRole('moderator')` for hide/unhide/penalty/resolve_report/resolve_appeal; `requireRole('editor')` for stories/recap/expert_approve; `requireRole('admin')` for settings/ads/billing.
- **D31** — Leaderboard access by tier. Client-gated only. Server has no cap — a free user hitting the SQL directly can filter by category. **Gap.**
- **D32** — Privacy free, customization paid. Privacy toggles: free. Banner/card: `isPaidTier` client-gated.
- **D33** — Expert queue + back-channel. Enforced via `expert_can_see_back_channel`, `post_back_channel_message`, RLS `expert_discussions_select = auth.role()='authenticated'` (**too permissive — any authed user can SELECT expert_discussions today**). Insert is role-gated. **Select gap.**
- **D34** — Family flat tiers, max-kids. Enforced via `enforce_max_kids()` trigger.
- **D35** — Sponsored quizzes all tiers. `sponsors` table + `quizzes.sponsored_by` wiring — no gate needed.
- **D36** — Weekly recap paid only. Enforced at 3 routes via `_user_is_paid`.
- **D37** — Timelines universal, revenue-aware link clicks. Timelines RLS = public. Link access tier check **not found** — anonymous users can navigate to any article slug directly. Gap.
- **D38** — No cosmetics/unlockables tied to score. No such table. Correctly omitted.
- **D39** — Reporting + blocking for all verified. Enforced via `requireVerifiedEmail + requireNotBanned` on reports, RLS `has_verified_email` on blocked_users.
- **D40** — Cancellation: DMs immediate, 7-day grace, then freeze. Enforced via `billing_cancel_subscription`, `billing_freeze_profile`, `billing_freeze_expired_grace` RPCs + `cron/freeze-grace`. **But** `user_has_dm_access` (which checks grace + frozen) is defined but not referenced from the `messages_insert` RLS policy — policy uses `is_premium()` which allows DMs during grace.
- **D41** — Quiz explanations all tiers after every attempt. No gate; UI-only.
- **D42** — Annual pricing ~17% discount. Plans seeded with both monthly/annual rows. No gate needed.
- **D43** — No free trial. No trial-period code path. Promo codes handle comp access.
- **D44** — 1-week kid trial. Enforced via `start_kid_trial` (once-per-account) + `sweep_kid_trial_expiries` cron + `freeze_kid_trial` + `convert_kid_trial`.

**D's with no code enforcement or gap:** D6, D13 (broken), D16, D19 (adult), D24 (tier check missing), D31 (server), D33 (SELECT too wide), D37 (anon link gate), D40 (RLS uses is_premium not user_has_dm_access).

---

## Section 6: Recommendations

1. **Decide the permissions-system strategy before re-seeding.** The dot-namespaced `permissions` + `permission_sets` + `get_my_capabilities` system is wired end-to-end (DB + client library) but **zero production call sites use `hasPermission(key)` today**. Either (a) retire it and standardize on role/plan gates everywhere, or (b) do one surface (e.g. `comments.*`) end-to-end as the reference implementation and stop adding role-hardcoded gates. Right now both systems are accumulating drift.

2. **Fix the bookmarks free-tier break (D13).** RLS `bookmarks_insert` requires `is_premium()`, which contradicts the design "Free: 10 bookmarks". Either drop the `is_premium()` check on INSERT and let the `enforce_bookmark_cap` trigger do its job, or move the cap check into RLS with an `OR` clause.

3. **Close the D6 comment-visibility gap.** Comments are publicly SELECT-able at the RLS layer; only the client hides them pre-quiz-pass. A direct query returns everything. Add `comments_select` predicate: `user_passed_quiz(auth.uid(), (SELECT article_id FROM ... WHERE id = comments.id)) OR user_id = auth.uid() OR is_mod_or_above()`.

4. **Wire `user_has_dm_access` into messages RLS (D40).** The helper exists and encodes the correct grace/frozen semantics; `messages_insert` and `conversations_insert` still use `is_premium()` which lets users DM during the 7-day grace window.

5. **Fix the `requireRole('moderator')` on the role-grant route.** `api/admin/users/[id]/roles/route.js` gates at moderator but the underlying `grant_role` RPC requires admin. The route should match the RPC (fail fast at the edge), or the RPC should loosen — currently a moderator gets a 500 with a confusing "admin required" error.

6. **Tighten `expert_discussions_select`.** Policy is currently `auth.role() = 'authenticated'` — any logged-in user can read the expert back-channel in raw form. Should be `expert_can_see_back_channel(auth.uid())`. (D33)

7. **Add server-side tier gates to the family/* and /kids/global-leaderboard routes.** Routes currently only require `requireAuth()`; tier enforcement is either implicit (empty household → empty result) or client-only. Explicit checks would catch direct API probes.

8. **Decide what to do with dead community_notes schema (D15).** Tables + RLS + CRUD policies still exist and are exposed via PostgREST. Either repurpose or drop before re-seed so the surface area stops lying about what's supported.

9. **Reconcile the stale xlsx (304 rows) before re-seeding.** Delete the ~40 spec'd-not-built keys that are genuinely cut (community_notes, email_digest, reactions, offline, 2FA, etc.). Add the ~25 built-not-spec'd keys (supervisor, sessions, permissions meta, cron, iap, appeals). Rename `expert.profile.expert_badge` etc. to match what code enforces.

10. **Audit RPCs for missing admin gates.** `preview_capabilities_as(user_id, section)` is SECURITY DEFINER and the body was not fully read — if it doesn't assert admin, it leaks capability grids of arbitrary users. Same for any RPC that returns data filtered by `p_user_id`.
