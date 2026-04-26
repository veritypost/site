# Feature Completion Ledger — Verity Post Migration

**Last updated:** 2026-04-18
**Purpose:** per-feature rollup of what's sealed, what's left, and why. Parallel to the admin LOCK (`@admin-verified`) but softer — `@feature-verified <name> 2026-04-18` is the authoritative seal per file; this doc rolls it up so the owner can see at-a-glance coverage and follow-ups per feature.

**How to read severity tags on follow-ups:**
- **Must-fix** — functional bug, feature is partially broken in production.
- **Should-fix** — non-blocking bug, defense-in-depth, or known drift.
- **Nice-to-fix** — cleanup, polish, doc drift.
- **Product-decision** — requires owner sign-off before code can move.
- **Defense-in-depth** — not currently exploitable but should be hardened before prod scale-up.

---

## bookmarks

**Status:** complete
**Marker:** `// @feature-verified bookmarks 2026-04-18`
**Files:** 1 web page + 5 API routes + 1 iOS view = 7 total

### What's covered
- Web: `site/src/app/bookmarks/page.tsx` (list + filters, self-gated)
- API: `bookmarks/route.js`, `bookmarks/[id]/route.js`, `bookmarks/export/route.js`, `bookmark-collections/route.js`, `bookmark-collections/[id]/route.js`
- iOS: `VerityPost/VerityPost/BookmarksView.swift`

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `article.bookmark.add|remove`, `bookmarks.list.view`, `bookmarks.unlimited`, `bookmarks.collection.create|rename|delete`, `bookmarks.note.add|edit`, `bookmarks.export`, `bookmarks.filter_by_category`, `bookmarks.quota.view`, `bookmarks.search`
- Tables: `bookmarks`, `bookmark_collections`

---

## expert_queue

**Status:** complete
**Marker:** `// @feature-verified expert_queue 2026-04-18`
**Files:** 1 web page + 4 API routes + 1 iOS view = 6 total

### What's covered
- Web: `site/src/app/expert-queue/page.tsx` (claim/answer/decline workflow)
- API: `expert/queue/route.js`, `expert/queue/[id]/claim/route.js`, `expert/queue/[id]/answer/route.js`, `expert/queue/[id]/decline/route.js`
- iOS: `VerityPost/VerityPost/ExpertQueueView.swift`

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `expert.queue.view`, `expert.queue.claim|decline`, `expert.answer.submit`, `expert.queue.oversight_all_categories` (moderator/editor fallback backfilled by hygiene sweep)
- Tables: `expert_queue`, `expert_answers`

---

## messaging

**Status:** complete
**Marker:** `// @feature-verified messaging 2026-04-18`
**Files:** 1 web page + 2 API routes + 1 iOS view = 4 total

### What's covered
- Web: `site/src/app/messages/page.tsx`
- API: `messages/route.js`, `messages/search/route.js`
- iOS: `VerityPost/VerityPost/MessagesView.swift`

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `messages.dm.compose`, `messages.search`, `messages.inbox.view`
- Tables: `messages`, `message_threads`

---

## follow

**Status:** complete
**Marker:** `// @feature-verified follow 2026-04-18`
**Files:** 2 web pages + 1 API route + 1 component + 1 iOS view = 5 total

### What's covered
- Web: `site/src/app/profile/[id]/page.tsx`, `site/src/app/u/[username]/page.tsx`
- API: `follows/route.js`
- Component: `site/src/components/FollowButton.tsx` (self-gates on `profile.follow`, returns null when denied)
- iOS: `VerityPost/VerityPost/PublicProfileView.swift`

### Known follow-ups
- **Nice-to-fix:** stale `viewerTier` prose comment block in `u/[username]/page.tsx` lines 14-26 (cleaned up in Track O, but prep doc noted FollowButton prop was dropped — confirm no residue).

### Related DB state
- Keys in use: `profile.follow`, `profile.followers.view.*`, `profile.following.view.*`
- Tables: `follows`

---

## tts

**Status:** complete
**Marker:** `// @feature-verified tts 2026-04-18`
**Files:** 1 web page + 1 component + 2 iOS views = 4 total

### What's covered
- Web: `site/src/app/story/[slug]/page.tsx`, `site/src/components/TTSButton.tsx`
- iOS: `VerityPost/VerityPost/StoryDetailView.swift`, `VerityPost/VerityPost/TTSPlayer.swift`

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `article.tts.play`, `article.listen_tts`, `settings.a11y.tts_per_article` (pro+)

---

## recap

**Status:** complete
**Marker:** `// @feature-verified recap 2026-04-18`
**Files:** 2 web pages + 3 API routes + 1 component + 1 iOS view = 7 total

### What's covered
- Web: `site/src/app/recap/page.tsx`, `site/src/app/recap/[id]/page.tsx`
- API: `recap/route.js`, `recap/[id]/route.js`, `recap/[id]/submit/route.js`
- Component: `site/src/components/RecapCard.tsx` (self-gates on `recap.list.view`)
- iOS: `VerityPost/VerityPost/RecapView.swift`

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `recap.view`, `recap.list.view`, `recap.submit`, admin surface keys `admin.recap.create|edit|delete|questions_manage`

---

## comments

**Status:** complete
**Marker:** `// @feature-verified comments 2026-04-18`
**Files:** 6 API routes + 3 components = 9 total

### What's covered
- API: `comments/route.js`, `comments/[id]/{route,vote,flag,report,context-tag}/route.js`
- Components: `CommentComposer.tsx`, `CommentRow.tsx`, `CommentThread.tsx`

### Known follow-ups
- **Defense-in-depth:** admin `error_logs` / comment-viewer surfaces should get a one-shot XSS grep audit (flagged in cross-feature section; not in this feature's scope).

### Related DB state
- Keys in use: `comments.post|edit.own|delete.own|upvote|downvote|reply|context_tag|report|mention.insert|mention.autocomplete|block.add|view|section.view|realtime.subscribe|score.view_subcategory|supervisor_flag`
- `comments.view` orphan fixed (explicit `anon` binding) in hygiene sweep
- Tables: `comments`, `comment_votes`, `comment_reports`

---

## quiz

**Status:** complete
**Marker:** `// @feature-verified quiz 2026-04-18`
**Files:** 2 API routes + 1 component + 1 iOS view = 4 total

### What's covered
- API: `quiz/start/route.js`, `quiz/submit/route.js`
- Component: `site/src/components/ArticleQuiz.tsx` (self-gates on `quiz.attempt.start`, retake on `quiz.retake`)
- iOS: `VerityPost/VerityPost/StoryDetailView.swift` (shares file with article_reading/tts)

### Known follow-ups
- **Nice-to-fix:** `QuizPoolEditor.tsx` was deleted in Track O (orphan). `/admin/story-manager` has inline quiz editor — no consumer needs the legacy file.

### Related DB state
- Keys in use: `quiz.attempt.start|submit`, `quiz.retake`, `quiz.retake.after_fail`, admin keys `admin.quizzes.{create_questions,edit_question,delete_question,preview}` (editor binding added in Track H)
- Tables: `quizzes`, `quiz_attempts`

---

## kids

**Status:** complete
**Marker:** `// @feature-verified kids 2026-04-18`
**Files:** 7 web pages + 9 API routes + 5 components + 2 iOS views = 23 total

### What's covered
- Web pages: `kids/layout.tsx`, `kids/page.tsx`, `kids/story/[slug]/page.tsx`, `kids/leaderboard/page.tsx`, `kids/expert-sessions/page.tsx`, `kids/expert-sessions/[id]/page.tsx`, `kids/profile/page.tsx`
- API: `kids/route.js`, `kids/[id]/route.js`, `kids/trial/route.js`, `kids/set-pin|verify-pin|reset-pin/route.js`, `kids/household-kpis/route.js`, `kids/global-leaderboard/route.js`, `kids/[id]/streak-freeze/route.js`
- Components: `kids/AskAGrownUp.tsx`, `kids/Badge.tsx`, `kids/EmptyState.tsx`, `kids/KidTopChrome.tsx`, `kids/StreakRibbon.tsx`
- iOS: `VerityPost/VerityPost/KidViews.swift`, `VerityPost/VerityPost/FamilyViews.swift`

### Known follow-ups
- **Should-fix:** `kid_profiles.display_name` is nullable in generated types; `KidTopChrome` passes with `|| ''` fallback. Consider schema tightening (all shipped kids have a display_name today).
- **Nice-to-fix:** fixed schema mismatch `achievements.display_name` → `.name` carried through kids pages.

### Related DB state
- Keys in use: `kids.home.view`, `kids.article.view`, `kids.leaderboard.family`, `kids.leaderboard.global.view`, `kids.expert.list_sessions|join_live|ask_question`, `kids.profile.create|update|delete`, `kids.pin.set|verify|reset`, `kids.parent.view`, `kids.parent.household_kpis`, `kids.parent.weekly_report.view`, `kids.streak.freeze.use`, `kids.trial.start`, `kids.achievements.view`, `kids.parent.global_leaderboard_opt_in`
- Tables: `kid_profiles`, `kid_achievements`, `kid_trial_states`

---

## family_admin

**Status:** complete
**Marker:** `// @feature-verified family_admin 2026-04-18`
**Files:** 3 web pages + 2 API routes + 1 iOS view = 6 total

### What's covered
- Web: `profile/kids/page.tsx`, `profile/kids/[id]/page.tsx`, `profile/family/page.tsx`
- API: `family/leaderboard/route.js`, `family/weekly-report/route.js`
- iOS: `FamilyViews.swift` (shares file with kids)

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `family.add_kid`, `family.remove_kid`, `family.view_leaderboard` (reactivated in DB and bound to `family` set), `family.shared_achievements`
- `settings.supervisor.*` keys pending family-plan scoping decision (see cross-feature section)

---

## article_reading

**Status:** complete
**Marker:** `// @feature-verified article_reading 2026-04-18`
**Files:** 3 web (story page + 2 shells) + 1 API + 2 components + 1 iOS view = 7 total

### What's covered
- Web: `story/[slug]/page.tsx`, `story/[slug]/layout.js`, `story/[slug]/opengraph-image.js`
- API: `stories/read/route.js` (logs reading completion)
- Components: `Ad.jsx` (server-side `serve_ad` RPC drives suppression), `Interstitial.tsx`
- iOS: `StoryDetailView.swift`

### Known follow-ups
- **Defense-in-depth:** `Ad.jsx` intentionally does NOT client-side check `article.view.ad_free` — authoritative decision is the server `serve_ad` RPC. Don't regress by adding a client gate.

### Related DB state
- Keys in use: `article.view.body|sources|timeline|ad_free`, `article.read.log`, `article.share.copy_link|external`, `article.expert_responses.read`, `article.ad_slot.view.paid` (removed from anon — no more leak), `article.experts_answered.see_count`, `article.editorial_cost.view`, `article.other_scores.view`, `article.media.expand`, `article.timeline.follow_link`
- Tables: `reading_log`, `score_events`
- New RPC (Round 4 Track U): `award_reading_points(p_article_id uuid)` SECURITY DEFINER wrapper

---

## home_feed

**Status:** complete
**Marker:** `// @feature-verified home_feed 2026-04-18`
**Files:** 3 web pages + 3 iOS views = 6 total

### What's covered
- Web: `app/page.tsx` (home), `leaderboard/page.tsx`, `category/[id]/page.js`
- iOS: `HomeView.swift`, `HomeFeedSlots.swift`, `LeaderboardView.swift`

### Known follow-ups
- **Nice-to-fix:** `LeaderboardView.swift` and `ProfileView.swift` were marker-synced under `home_feed` / `profile_settings` respectively because web counterparts lacked categories at Round 3. If taxonomy later splits out `leaderboard` or `profile_card`, iOS markers need re-sync (flagged in Round 3 Track R).

### Related DB state
- Keys in use: `home.feed.view`, `home.breaking_banner.view`, `home.breaking_banner.view.paid` (removed from anon, bound to paid tiers), `home.search`, `home.subcategories`, `leaderboard.view`, `leaderboard.view.categories`, `leaderboard.privacy.toggle`
- `leaderboard.global.view` + `leaderboard.global.full.view` deactivated in Round 4 Track W (duplicates)

---

## notifications

**Status:** complete
**Marker:** `// @feature-verified notifications 2026-04-18`
**Files:** 1 web page + 3 API routes + 5 iOS views = 9 total

### What's covered
- Web: `notifications/page.tsx` (full inbox page — self-gates on `notifications.inbox.view`). Unread badge on the nav rendered inline in `NavWrapper.tsx` via its own `/api/notifications?unread=1` poll.
- API: `notifications/route.js` (GET list, PATCH mark-read), `notifications/preferences/route.js`, `push/send/route.js`
- iOS: `AlertsView.swift`, `SettingsView.swift` (NotificationsSettingsView), `PushRegistration.swift`, `PushPermission.swift`, `PushPromptSheet.swift`

### Known follow-ups
- None — clean close. (`NotificationBell.tsx` deleted Round 5 Item 3 — see PERMISSION_MIGRATION note. Unread surface is fully delivered by NavWrapper's inline badge on the `/notifications` nav item; the bell dropdown was a dead duplicate with zero importers.)

### Related DB state
- Keys in use: `notifications.inbox.view`, `notifications.mark_read`, `notifications.mark_all_read`, `notifications.dismiss`, `notifications.prefs.view|toggle_push|toggle_in_app|quiet_hours`, `notifications.subscription.category|subcategory|keyword|unsubscribe`, `admin.push.send_test`
- Track A DB fix: core inbox/prefs keys were admin/owner-only — backfilled to all signed-in tiers.
- Track V fix: `AlertsView.markAsRead/markAllRead` was writing non-existent `read` column → now PATCHes the server route instead. Silent-failure path closed.

---

## search

**Status:** complete
**Marker:** `// @feature-verified search 2026-04-18`
**Files:** 1 web page + 1 API route + 1 iOS view = 3 total

### What's covered
- Web: `app/search/page.tsx` (self-gates; strips query params when perms missing)
- API: `search/route.js` (per-filter gates for category/subcategory/date_range/source)
- iOS: `HomeView.swift` (toolbar search affordance)

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `search.view`, `search.basic`, `search.articles.free`, `search.advanced`, `search.advanced.category|subcategory|date_range|source`, `search.articles.fts_advanced`, `search.bookmarks`, `search.categories`, `search.comments`, `search.expert_answers`, `search.messages`, `search.saved.create|list`, `search.timeline_events`, `search.unified`, `search.users`, `search.history.view|clear`
- Track fix: `search.basic`/`search.view` backfilled to pro+family sets; full advanced binding filled in on family set.

---

## profile_settings

**Status:** complete-with-followups
**Marker:** `// @feature-verified profile_settings 2026-04-18`
**Files:** 13 web pages + 9 API routes + 3 iOS views = ~26 total (includes 12 redirect shells)

### What's covered
- Web: consolidated `profile/settings/page.tsx` (3,728-line long-scroll) + 12 thin redirect shells (password/emails/feed/alerts/data/blocked/supervisor/login-activity/billing/expert/profile) + `profile/settings/expert/page.tsx` (full application form) + `app/profile/page.tsx`
- API: `account/delete/route.js`, `account/login-cancel-deletion/route.js`, `account/onboarding/route.js`, `appeals/route.js`, `billing/cancel|change-plan|resubscribe/route.js`, `support/route.js`, `support/[id]/messages/route.js`, `users/[id]/block/route.js`
- iOS: `SettingsView.swift`, `ProfileView.swift`, `ProfileSubViews.swift`

### Known follow-ups
- ~~**Must-fix (iOS, flagged by Track I/V):** `SettingsView` and `SubscriptionView` had/have direct `users.update` paths that the Round 4 users-table trigger will now reject. Promo path already fixed in Track V. Any remaining `users.update` from iOS client needs to move to an RPC or API route.~~ **RESOLVED in Round 5 Item 2 (2026-04-19).** All 7 iOS self-profile writes (6 in `SettingsView.swift` + 1 in `AuthViewModel.swift`) and all 7 web self-profile writes (in `site/src/app/profile/settings/page.tsx`) now go through the `public.update_own_profile(p_fields jsonb)` SECDEF RPC. Also closes the silent `location`/`website`/`avatar`/`preferences` phantom-column typos by routing them into `metadata` sub-keys. See `05-Working/PERMISSION_MIGRATION.md` "Round 5 — Item 2" section.
- **Should-fix:** iOS `SubscriptionView` — previously bypassed `/api/promo/redeem` and the permission gate; fixed in Track V. Historical note retained.
- **Product-decision:** `settings.supervisor.view`, `supervisor.categories.view`, `supervisor.eligibility.view` pending family-plan scoping (see cross-feature).

### Related DB state
- 38 user-facing settings keys backfilled in `fix_settings_leak_bindings` migration (previously admin/owner-only).
- `settings.appeals.open` + `settings.account.2fa.*` + `settings.account.oauth.*` bindings extended to all tiers.
- Round 5 Item 2 RPC: `public.update_own_profile(p_fields jsonb)` — SECURITY DEFINER, 20-column allowlist, server-side metadata deep-merge. Grants: `EXECUTE` to `authenticated` only; `REVOKE ALL` from `PUBLIC`/`anon`.
- Tables: `users`, `user_sessions`, `data_requests`, `support_tickets`, `appeals`

---

## subscription

**Status:** complete-with-followups
**Marker:** `// @feature-verified subscription 2026-04-18`
**Files:** 6 API routes + 2 iOS = 8 total

### What's covered
- API: `stripe/checkout/route.js`, `stripe/portal/route.js`, `promo/redeem/route.js`, `billing/cancel|change-plan|resubscribe/route.js`
- iOS: `SubscriptionView.swift`, `StoreManager.swift`
- No dedicated `/subscribe`, `/pricing`, `/upgrade`, `/billing`, `/checkout` page tree exists — all subscription UX lives inside `profile/settings#billing`.

### Known follow-ups
- ~~**Must-fix:** `/api/promo/redeem/route.js:88` reads `promo.applicable_plans?.[0]` — real DB column is `applies_to_plans`.~~ **RESOLVED in Round 5 Item 1 (2026-04-19).** Column references renamed at 3 sites; plan lookup corrected from `.eq('name', ...)` to `.eq('id', ...)` since `applies_to_plans` stores UUIDs.
- ~~**Must-fix (new — flagged by Round 5 Item 1 Reviewer):** `/api/promo/redeem/route.js` lines 69-73 — `promo_uses` insert writes `redeemed_at: now()` but canonical column is `created_at`; also omits required `discount_applied_cents NOT NULL`.~~ **RESOLVED in Round 5 Item 1B (2026-04-19).** Plan lookup hoisted above the insert; insert shape corrected to `{promo_code_id, user_id, discount_applied_cents}`; real insert failures now 500 instead of being masked as "already used."
- **Nice-to-fix (Item 1C, deferred):** For partial-discount promos (`discount_type='percent'` with `discount_value<100`), `promo_uses` receives `discount_applied_cents=0` since checkout hasn't run yet. Semantic nit — the stored row represents intent, not applied discount. Two options when partial-discount promos become a real product: (a) skip `promo_uses` insert for non-100% codes and let the checkout/webhook path write the first row, OR (b) update the existing row with the real value post-checkout. Current behavior is harmless (no partial-discount promos are surfaced in admin UI today) but will corrupt `SUM(discount_applied_cents)` analytics the moment they ship.
- **Product-decision:** `billing.stripe.portal` (admin/owner/pro only) vs `billing.portal.open` (universal). `/api/stripe/portal` gates on the narrower key, excluding family/expert paid users. Needs owner call: widen the binding, switch the route to the broader key, or confirm intentional.
- **Nice-to-fix:** 2 duplicate billing keys already deactivated (`billing.cancel`, `billing.invoices.view`) in Phase 5 Track P.

### Related DB state
- Canonical keys: `billing.cancel.own`, `billing.resubscribe`, `billing.change_plan`, `billing.upgrade.checkout`, `billing.stripe.checkout`, `billing.portal.open`, `billing.stripe.portal`, `billing.invoices.view_own`, `billing.promo.redeem`, `billing.payment.change_method`, `billing.plans.view`, `billing.period.annual|monthly`, `billing.switch_cycle`, `billing.grace.request_extension`, `billing.subscription.view_own`, `billing.invoices.download`
- 8 deactivated/collapsed aliases (7 stale spec names + 2 legacy duplicates).

---

## system_auth

**Status:** complete
**Marker:** `// @feature-verified system_auth 2026-04-18`
**Files:** 9 web pages + 22 API routes (11 auth + 9 cron + 2 webhook-ish) + 9 iOS views = 43 total

### What's covered
- Pre-auth pages: `login`, `signup`, `signup/expert`, `signup/pick-username`, `forgot-password`, `reset-password`, `welcome`, `verify-email`, `logout`
- Auth API routes: `auth/callback|check-email|email-change|login|login-failed|login-precheck|logout|resend-verification|reset-password|resolve-username|signup/route.js`
- Cron API routes: `cron/{freeze-grace,process-deletions,recompute-family-achievements,sweep-kid-trials,flag-expert-reverifications,check-user-achievements,send-push,send-emails,process-data-exports}/route.js` (cron-secret auth, timing-safe, fail-closed)
- Webhook/sync: `stripe/webhook/route.js` (Stripe HMAC, idempotent via `webhook_log.event_id`), `ios/appstore/notifications/route.js` (Apple JWS), `ios/subscriptions/sync/route.js` (dual auth)
- Ops: `errors/route.js`, `health/route.js` (env-var leak closed in Round 4 Track W)
- iOS: `AuthViewModel.swift`, `ContentView.swift`, `Login|Signup|VerifyEmail|WelcomeView.swift`, `ForgotPasswordView.swift`, `ResetPasswordView.swift`, `SettingsService.swift`

### Known follow-ups
- ~~**Defense-in-depth:** `grant_role`/`revoke_role` RPC `auth.uid()` callsite tightening pending (see cross-feature).~~ **RESOLVED Round 6 SECURITY (2026-04-19).** `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role` applied via `lock_down_admin_rpcs_2026_04_19`. Rewriting to `auth.uid()` was rejected because every legitimate caller uses service_role (where `auth.uid()` is NULL) — REVOKE alone closes the attack.
- **Defense-in-depth:** `support_tickets` anon rate-limit (cross-feature).

### Related DB state
- New trigger (Round 4 Track U): `trg_users_reject_privileged_updates` BEFORE INSERT OR UPDATE on `public.users` (post-audit extended to INSERT to close race).
- Extended trigger function `handle_new_auth_user` (Round 4 Track V): seeds `plan_id`, `plan_status='active'`, and default `user` role (or `owner` for user #1).
- `/api/health` now requires `x-health-token` header matching `HEALTH_CHECK_SECRET` for env-probe block.

---

## ads

**Status:** complete
**Marker:** `// @feature-verified ads 2026-04-18`
**Files:** 3 API routes = 3 total

### What's covered
- API: `ads/click/route.js`, `ads/impression/route.js`, `ads/serve/route.js`
- Client `Ad.jsx` component covered under article_reading.

### Known follow-ups
- None — clean close.

### Related DB state
- Tables: `ad_units`, `ad_campaigns`, `ad_placements`, `ad_impressions`, `ad_clicks`, `sponsors`
- `serve_ad` RPC is the authoritative tier-aware ad-suppression decision.

---

## shared_components

**Status:** complete-with-followups
**Marker:** `// @feature-verified shared_components 2026-04-18`
**Files:** 9 components + 6 pages (card/layout/contact/opengraph) = 15 total

### What's covered
- UI primitives: `Toast.tsx`, `ConfirmDialog.tsx`, `StatRow.tsx`, `AccountStateBanner.tsx`, `LockModal.tsx`
- Permission infra: `PermissionGate.tsx`, `PermissionsProvider.tsx`, `ObservabilityInit.tsx`
- Admin shared: `admin/DestructiveActionConfirm.tsx` (relocated from root in Track J)
- Pages: `app/layout.js`, `card/[username]/{layout|opengraph-image|page}.js`, `profile/card/page.js`, `profile/contact/page.js`

### Known follow-ups
- **Defense-in-depth:** `DestructiveActionConfirm` now lives under `components/admin/` but keeps `@feature-verified shared_components` marker rather than `@admin-verified`. The sole `@feature-verified` in the admin DS lane.
- **Nice-to-fix:** `AccountStateBanner.tsx` column-name fix (`deletion_scheduled_at` → `deletion_scheduled_for`) carried through `NavWrapper.js`. No residual shim.

### Related DB state
- Keys in use: `profile.card.view`, `profile.card.share_link`, `profile.card_share`
- `LockModal` reads `lock_reason` from the resolver (BANNED / EMAIL_UNVERIFIED / ROLE_REQUIRED / NOT_GRANTED / PLAN_REQUIRED).

---

## shared_pages

**Status:** complete
**Marker:** `// @feature-verified shared_pages 2026-04-18`
**Files:** 9 pages = 9 total

### What's covered
- Legal/marketing: `accessibility`, `appeal`, `browse`, `cookies`, `dmca`, `how-it-works`, `privacy`, `status`, `terms`

### Known follow-ups
- **Nice-to-fix:** `shared_pages` is a new category introduced in Round 4 Track X to distinguish legal/marketing top-level routes from React components. Owner can consolidate into `shared_components` in a follow-up sweep if preferred.

### Related DB state
- Static content; no gates.

---

## profile_card

**Status:** complete
**Marker:** `// @feature-verified profile_card 2026-04-18`
**Files:** 2 components + 4 pages = 6 total

### What's covered
- Components: `Avatar.tsx`, `VerifiedBadge.tsx`
- Pages: `u/[username]/layout.js`, `profile/activity/page.js`, `profile/category/[id]/page.js`, `profile/milestones/page.js`

### Known follow-ups
- **Should-fix (pre-existing, fixed by Track J):** `VerifiedBadge` was reading nonexistent columns (`users.role`, `users.identity_verified`). Rewrote to read `is_verified_public_figure` (primary) with `is_expert` fallback. All 5 call-sites updated. Pre-Track-J the badge silently never rendered.
- **Nice-to-fix:** `card/[username]/page.js` TODO remains open — per-user feature resolution (e.g. `has_permission_for('profile.card.exists', 'user', id)`) for viewer-vs-target semantic drift.

### Related DB state
- New key (Round 4 Track W): `profile.expert.badge.view` (bound to anon through owner — 9 sets). Referenced at `u/[username]/page.tsx:92` and `profile/[id]/page.tsx:141`. Pre-creation, both call-sites silently returned DENY on the unknown key.

---

## admin_api

**Status:** complete-with-followups
**Marker:** `// @feature-verified admin_api 2026-04-18`
**Files:** 38 admin API routes + `NavWrapper.tsx` = 39 total

### What's covered
- All 37 routes under `site/src/app/api/admin/**`
- `site/src/app/api/expert/answers/[id]/approve/route.js`
- `site/src/app/NavWrapper.tsx` (converted to TSX in Track Q, gates on `admin.dashboard.view`)

### Known follow-ups
- **Product-decision (flagged by Round 3 Track S):** 34 of 37 admin API routes are NOT locked with `@admin-verified` (only the 3 §12 drift files are: `subscriptions/[id]/manual-sync`, `users/[id]/permissions`, `users/[id]/roles`). Owner decision: extend LOCK to all 34 remaining admin API files, or explicitly document the UI-is-frozen/API-is-evolving asymmetry.
- **Must-fix (flagged by Track M):** 10 `admin.*` keys needed `editor` permission_set bindings to preserve editor access that `requireRole('editor')` used to grant. `fix_editor_access_regression_2026_04_18` applied — editors can now create/edit articles, approve expert applications + answers, process data requests, send breaking broadcasts.
- ~~**Defense-in-depth:** `grant_role`/`revoke_role` RPC `auth.uid()` tightening (cross-feature).~~ **RESOLVED Round 6 SECURITY (2026-04-19)** — REVOKE-from-PUBLIC lockdown applied to the whole 14-RPC admin surface.

### Related DB state
- 54 `requireRole` call-sites migrated to `requirePermission` in Phase 5 Track M.
- `requireRole` helper removed from `site/src/lib/auth.js`; `role_permissions` table DROPped.
- Hierarchy map `lib/roles.js` retained for 5 actor-vs-target rank guards (F-034/F-035/F-036) — removal deferred.

---

## admin (UI — LOCKED)

**Status:** complete (LOCKED — do not touch without explicit owner approval)
**Marker:** `// @admin-verified 2026-04-18`
**Files:** 39 admin UI pages + 27 admin DS primitives + 3 admin-API drift files = 69 total

### What's covered
- 39 `site/src/app/admin/**/*.tsx` pages (pre-Round-4)
- 27 `site/src/components/admin/*.jsx` DS primitives (Round 4 Track X extended LOCK)
- 3 admin API routes with §12 drift fix

### Known follow-ups
- **Nice-to-fix:** `REFERENCE.md` §4 still says "39 files" — actual LOCK set post-Round-4 is 66 (39 + 27); flagged but not actioned in Track X.
- **Product-decision:** admin API LOCK asymmetry (see `admin_api` feature).

### Related DB state
- All 37 admin API routes carry `@migrated-to-permissions` + `@feature-verified admin_api`.
- 27 DS primitives are pure UI; no permission gates.

---

## expert_sessions

**Status:** complete
**Marker:** `// @feature-verified expert_sessions 2026-04-18`
**Files:** 3 API routes = 3 total

### What's covered
- API: `expert-sessions/route.js`, `expert-sessions/[id]/questions/route.js`, `expert-sessions/questions/[id]/answer/route.js`
- Kids-facing UI under the `kids` feature (`kids/expert-sessions/*`).

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `kids_expert.sessions.list.view`, `kids_expert.question.ask|answer`, `expert.session.questions.view`, `admin.expert_sessions.create`
- Tables: `expert_sessions`, `expert_session_questions`

---

## expert

**Status:** complete
**Marker:** `// @feature-verified expert 2026-04-18`
**Files:** 3 API routes = 3 total

### What's covered
- API: `expert/apply/route.js`, `expert/ask/route.js`, `expert/back-channel/route.js`

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `expert.application.apply`, `expert.ask`, `expert.back_channel.read|post`
- RPC: `expert_can_see_back_channel`

---

## family

**Status:** complete
**Marker:** `// @feature-verified family 2026-04-18`
**Files:** 1 API route = 1 total

### What's covered
- API: `family/achievements/route.js` (uses `kids.achievements.view` as closest match — `kids.family.shared_achievements.view` does not exist in DB).

### Known follow-ups
- **Nice-to-fix:** single-file category; could merge into `family_admin` in a future consolidation pass.

### Related DB state
- Keys in use: `kids.achievements.view`

---

## reports

**Status:** complete
**Marker:** `// @feature-verified reports 2026-04-18`
**Files:** 2 API routes = 2 total

### What's covered
- API: `reports/route.js` (article.report), `reports/weekly-reading-report/route.js` (kids.parent.weekly_report.view)

### Known follow-ups
- None — clean close.

### Related DB state
- Keys in use: `article.report`, `kids.parent.weekly_report.view`
- Tables: `reports`, `weekly_reading_reports`

---

## supervisor

**Status:** partial — product-decision pending
**Marker:** `// @feature-verified supervisor 2026-04-18`
**Files:** 2 API routes = 2 total

### What's covered
- API: `supervisor/opt-in/route.js`, `supervisor/opt-out/route.js`

### Known follow-ups
- **Product-decision:** 3 `supervisor.*` DB keys (`settings.supervisor.view`, `supervisor.categories.view`, `supervisor.eligibility.view`) pending family-plan scoping. Binding to `family` set alone would miss users who need the UI before buying a family plan. Flagged in hygiene sweep, not fixed.

### Related DB state
- Keys deferred: `settings.supervisor.view`, `supervisor.categories.view`, `supervisor.eligibility.view`

---

## ai

**Status:** complete
**Marker:** `// @feature-verified ai 2026-04-18`
**Files:** 1 API route = 1 total

### What's covered
- API: `ai/generate/route.js`

### Known follow-ups
- None — clean close.

### Related DB state
- (Gate binding pre-existed; marker added in Round 4 Track X.)

---

# Cross-cutting sections

## DB hygiene state

- **Active permission count:** `928` (as of 2026-04-19, post-Round-4 Track W)
- **Inactive permission count:** `64` (deactivated duplicates + legacy keys)
- **Permission sets:** `10` functional (`anon`, `unverified`, `free`, `pro`, `family`, `expert`, `moderator`, `editor`, `admin`, `owner`). 21 rows in `permission_sets` including deprecated/test entries.
- **`perms_global_version`:** `4409` (as of query at ledger compile time)

### Key migrations applied in Rounds 1–4 (2026-04-18 / 2026-04-19)

Permission-binding / hygiene migrations:
- `fix_article_reading_bindings`
- `fix_anon_leak_bindings`
- `fix_home_breaking_banner_paid`
- `bump_user_perms_version_atomic_security` (Gap 1 fix — TOCTOU)
- `fix_notifications_core_bindings`
- `fix_settings_leak_bindings`
- `fix_permission_set_hygiene_2026_04_18` (56 backfills + 3 collapses)
- `fix_billing_bindings_2026_04_18`
- `drop_role_permissions_table_2026_04_18`
- `fix_editor_access_regression_2026_04_18` (10 admin.* keys editor-access restored)
- `deactivate_duplicate_billing_keys_2026_04_18`
- `fix_round4_hygiene_2026_04_19` (1 key created: `profile.expert.badge.view`; 5 dupes deactivated)

Security / server-scoring migrations (Round 4):
- `restrict_users_table_privileged_updates_2026_04_19` (+ `v2` refinement)
- `restrict_users_table_privileged_inserts_2026_04_19` + `v2` (post-audit INSERT close-race fix)
- `add_award_reading_points_rpc_2026_04_19`
- `add_post_signup_user_roles_trigger_2026_04_19`

### Triggers and RPCs added / modified

- `reject_privileged_user_updates()` — BEFORE INSERT OR UPDATE trigger function on `public.users`; SECURITY INVOKER; rejects 22-column privileged mutations unless caller is admin/service-role/internal.
- `trg_users_reject_privileged_updates` — the trigger itself.
- `award_reading_points(p_article_id uuid)` — SECURITY DEFINER wrapper around `score_on_reading_complete`; writes `reading_log` row if missing.
- `bump_user_perms_version(uuid)` — hardened SECURITY DEFINER with admin/service-role gate; atomic `SET perms_version = perms_version + 1`.
- `handle_new_auth_user()` — extended to seed `plan_id`, `plan_status='active'`, and default `user_roles.role='user'` (or `owner` for user #1).

## Cross-feature open items (owner decisions)

- **Admin-API LOCK asymmetry:** 34 of 37 admin API routes are NOT `@admin-verified`. Decision: extend LOCK or document asymmetry. (Product-decision)
- **`billing.stripe.portal` vs `billing.portal.open`:** `/api/stripe/portal` gates on narrower key excluding family/expert paid users. Widen binding, switch route, or confirm intentional. (Product-decision)
- ~~**`/api/promo/redeem:88` column-name bug**~~ **RESOLVED Round 5 Item 1 (2026-04-19).** Replaced by new `promo_uses` insert bug (see `subscription` section) — full redemption flow still broken until that lands.
- **4 unused `ios.*` keys:** `ios.article.share_sheet`, `ios.bookmarks.view`, `ios.iap.manage_subscription`, `ios.profile.view.public` — no matches in `VerityPost/*.swift`. Deactivate or wire. (Nice-to-fix / product-decision)
- **3 `supervisor.*` keys pending family-plan scoping:** see `supervisor` feature section. (Product-decision)
- **Hierarchy map `site/src/lib/roles.js` retention:** 5 consumers use `getMaxRoleLevel` for F-034/F-035/F-036 actor-vs-target rank guards. Candidate replacement: `require_outranks(target_user_id)` server RPC. (Product-decision / defense-in-depth)
- **Admin error_logs / comment viewer XSS grep:** Round 4 / Round 5 recommendation — run a one-shot XSS grep across admin log/comment-viewer surfaces (no current exploit, hardening). (Defense-in-depth)
- ~~**`grant_role` / `revoke_role` `auth.uid()` tightening:** Round 4 security review flagged these RPCs as candidates for harder caller identity binding. (Defense-in-depth)~~ **RESOLVED Round 6 SECURITY (2026-04-19).** Applied as part of a 14-RPC lockdown (`lock_down_admin_rpcs_2026_04_19`): `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role` on `grant_role`, `revoke_role`, `apply_penalty`, `resolve_appeal`, `approve_expert_application`, `reject_expert_application`, `send_breaking_news`, `anonymize_user`, `schedule_account_deletion`, `cancel_account_deletion`, `hide_comment`, `unhide_comment`, `resolve_report`, `mark_probation_complete`. Also added defensive self-anonymize guard to `anonymize_user` (cron-safe via follow-up `anonymize_user_guard_cron_safe_2026_04_19`). `permission_scope_overrides.pso_select` RLS tightened from `USING (true)` to admin-or-self via `tighten_pso_select_rls_2026_04_19`.
- **`support_tickets` anon rate-limit:** no current abuse; prod scale-up should add a rate limit. (Defense-in-depth)
- **iOS `SettingsView` `users.update` RPC move:** any remaining direct-write paths now reject under Track U trigger. Audit + move to RPC / API routes. (Must-fix at prod scale)
- **723 DB keys unreferenced in code (spec ahead of impl):** active permission catalog larger than consumer surface; acceptable during migration, prune decision deferred. (Nice-to-fix)
- ~~**`NotificationBell.tsx` — 0 importers:**~~ **RESOLVED Round 5 Item 3 (2026-04-18).** Deleted. NavWrapper's `/notifications` nav item already renders an unread badge (red dot via its own `/api/notifications?unread=1` poll) — the bell's dropdown was a dead duplicate with no natural home in the 4-tab bottom nav. Gate keys (`notifications.inbox.view`, `notifications.mark_read`) remain in use by `/notifications/page.tsx` and `/api/notifications/route.js`.

## How to use this ledger

This is the **per-feature status rollup**. For the full file-level tracker, open `05-Working/PERMISSION_MIGRATION.md`. For the admin LOCK list, see `05-Working/ADMIN_STATUS.md`. For round-by-round prep/execution context, see `05-Working/_round{2,3,4}_prep*.md`.

Items tagged **Product-decision** need owner sign-off before any code moves. Items tagged **Defense-in-depth** are not currently exploitable but should be hardened before prod scale-up. Items tagged **Must-fix** are functional bugs and should be scheduled before launch.

When a feature is marked `complete` here, the authoritative disk-level marker is still `@feature-verified <name> 2026-04-18` on every constituent file — grep to verify. When a feature is marked `complete-with-followups`, each follow-up is listed in that feature's "Known follow-ups" section with a severity tag the owner can sequence.
