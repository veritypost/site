# Zone Z17: VerityPost/ (adult iOS)

## Summary

Adult iOS app (SwiftUI, iOS 17.0+, Swift 5.9). 41 Swift sources (~19,800 lines), one xcuserdata schemes plist, Info.plist, VerityPost.entitlements (Apple Sign-In only), Assets.xcassets, PrivacyInfo.xcprivacy, plus an in-repo `possibleChanges/` folder of HTML/JSX design mockups that are wired into the target's PBXResourcesBuildPhase. Architecture is clean: a small services layer (SupabaseManager, AuthViewModel, PermissionService+PermissionStore, SettingsService, StoreManager, PushPermission, PushRegistration, BlockService, ReportService, EventsClient, KidsAPI, TTSPlayer, Keychain, Log) feeds 25+ SwiftUI views. Every mutation path either calls a SECDEF Postgres RPC via the Supabase SDK or POSTs to a `/api/...` Next.js route with a bearer token. Permission gating is wired uniformly through `PermissionService.shared.has("...")` driven by the live `compute_effective_perms` RPC, with `my_perms_version` polling for stale invalidation. iOS-specific moderation (Apple Guideline 1.2 Report/Block on comments, articles, profiles, DM threads) is implemented and routed through web API endpoints. Bundle id `com.veritypost.app`, URL scheme `verity://`, queries `veritypostkids://`. No Apple Pay / no Stripe in iOS — billing flows StoreKit only via `/api/ios/subscriptions/sync`.

**File count: 41 Swift files (40 in app target + 1 UI test) + Info.plist + VerityPost.entitlements + Assets.xcassets + PrivacyInfo.xcprivacy + 7 dev-only HTML/JSX/MD mockups in possibleChanges/.**

## Files

### VerityPost/VerityPostApp.swift  (37 lines)
- Purpose: `@main` entry. SwiftUI App scene. Bridges `VPAppDelegate` for APNs deviceToken.
- Services: `AuthViewModel` (StateObject), `StoreManager.shared.checkEntitlements()` + `PermissionService.shared.refreshIfStale()` on scene-active.
- URLs called: none directly.
- TODO/FIXME: none.
- Concerns: clean. `@UIApplicationDelegateAdaptor` correctly wires APNs callbacks into the SwiftUI lifecycle.

### VerityPost/ContentView.swift  (341 lines)
- Purpose: root router — splash, splash-timeout fallback, email-verify gate, onboarding (WelcomeView), main tab bar.
- View hierarchy: `ContentView` → branched on auth state → `MainTabView` → `TextTabBar` (Home/Notifications/Most Informed/Profile|Sign in) → `SignInGate` for anon-blocked tabs.
- Services: `AuthViewModel`, `PushRegistration.shared.setCurrentUser`, `BlockService.shared.refresh`.
- URLs: none.
- TODO: none.
- Concerns: tab bar ignores the iOS 26 floating glass nav by using a custom `safeAreaInset` translucent bar; deliberate.

### VerityPost/AuthViewModel.swift  (688 lines)
- Purpose: GoTrue session manager — login, signup, SIWA (native + web fallback), Google OAuth, email verify, password reset, deep-link handler, logout, signup rollback.
- Services: `SupabaseManager.client.auth`, `PermissionService` (invalidate + reload on session change/StoreKit notif), `Log`.
- URLs called: `POST api/auth/check-username` (rate-limited username check), `POST api/auth/signup-rollback`, `POST api/account/login-cancel-deletion`, `client.rpc("update_own_profile")` (last_login_at).
- TODO: none.
- Concerns: 10s splash timeout fallback is correct. Username normalisation strips non-ASCII to defeat homoglyph spoof — matches web. SIWA nonce is hashed (SHA256) into request and raw value sent to Supabase signInWithIdToken — correct flow. `currentNonce` retained on `self` between onRequest/onCompletion (necessary). Friendly error mapper deliberately swallows raw SDK strings. `attemptSignupRollback` deletes orphan `auth.users` rows when `public.users` upsert fails.

### VerityPost/SupabaseManager.swift  (69 lines)
- Purpose: singleton Supabase client + `siteURL` resolver. Reads `SUPABASE_URL`/`SUPABASE_KEY`/`VP_SITE_URL` from Info.plist; debug builds also accept env vars.
- URLs: defaults `siteURL` to `https://veritypost.com`.
- TODO: none.
- Concerns: `fatalError` on missing SUPABASE_URL/KEY in any build (incl. release). Defensive but means a misconfigured release crashes on first read. The two `URL(string: …)!` force-unwraps are on literal strings (proven safe by inspection); not crutches.

### VerityPost/Models.swift  (520 lines)
- Purpose: `VPUser`, `Story`, `VPCategory`, `VPSubcategory`, `Quiz`, `QuizQuestion`, `QuizAttempt`, `ReadingLogItem`, `VPComment`, `KidProfile`, `SourceLink`, `TimelineEvent`, `Achievement`, `UserAchievement`, `ActivityItem`, `QuizDisplay`, `CategoryStats`.
- Services: none (pure value types).
- URLs: none.
- Concerns: `VPCategory.displayName` strip-the-"Kids" regex handles `(kids)`/`(kid)`/trailing `kids`/leading `kids`. KidProfile.ageLabel groups under 13 / 13–15 / 16+. Models are clean — no force unwraps.

### VerityPost/Theme.swift  (263 lines)
- Purpose: VP design tokens (colors, hex initialiser, AvatarView, VerifiedBadgeView, StatRowView, PillButton, `timeAgo()`).
- Services: none.
- URLs: none.
- Concerns: `Color(hex:)` swallows Scanner errors silently — invalid hex returns black. Acceptable: every call site passes a literal. `VP.danger = #b91c1c` (AA-compliant per code comment).

### VerityPost/PermissionService.swift  (185 lines) — **mirror of web `lib/permissions`**
- Purpose: actor-isolated cache of `compute_effective_perms(p_user_id)` RPC results, with `my_perms_version` poll for stale invalidation. `PermissionStore` (MainActor ObservableObject) publishes a `changeToken` so SwiftUI views observe via `@StateObject`/`@ObservedObject` and refresh-on-token.
- Services: `SupabaseManager.client.rpc(compute_effective_perms / my_perms_version)`, `client.auth.session`.
- URLs: none.
- TODO: none.
- Concerns: ✓ This file is **the parity layer**. Web has `web/src/lib/permissions.js` with `hasPermission` + `invalidate` + `refreshAllPermissions`; iOS has `has(_:)` + `invalidate()` + `loadAll()` + `refreshIfStale()`. Both call the same SECDEF RPC. Matches the CLAUDE.md claim "PermissionService.swift mirrors web lib/permissions" — verified.

### VerityPost/SettingsService.swift  (130 lines)
- Purpose: 60s-cached read of public.settings + comment_settings.
- Services: `SupabaseManager.client.from("settings")`.
- URLs: none.
- Concerns: comment-settings reader peels a single row's columns into a flat dict. Loose typing because PostgREST `jsonb` returns vary; resolved via type-coerce helpers. `commentSettings = [:]` if RLS denies — fail-open default; matches web.

### VerityPost/Log.swift  (13 lines)
- Purpose: DEBUG-only `print()`; release no-op.
- Concerns: clean.

### VerityPost/Keychain.swift  (55 lines)
- Purpose: thin Keychain wrapper. `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- Concerns: clean. Currently has no callers — was used for kid PIN storage during the unified-app era; now PINs are server-stored. Could be dead code (worth flagging).

### VerityPost/Password.swift  (65 lines)
- Purpose: mirror of `web/src/lib/password.js`. PasswordPolicy (min 8, require upper, require number; symbol off).
- Concerns: clean.

### VerityPost/EventsClient.swift  (152 lines)
- Purpose: analytics emitter — POST `/api/events/batch` with `surface: "ios_adult"`. Buffer of 20 events / 32 KB / force-flush on background.
- URLs: `POST api/events/batch`.
- Concerns: anonymous `device_id` UUID stored in UserDefaults — works without auth. Per-event 4 KB cap. `AnyCodable` private impl handles heterogeneous payloads.

### VerityPost/PushPermission.swift  (119 lines)
- Purpose: UNUserNotificationCenter wrapper. `requestIfNeeded()` shows iOS dialog; tracks `vp_push_prompted` + `vp_push_preprompt_declined_at` (7d cooldown).
- URLs: none.
- Concerns: clean. Emits `push_prompt_result` event with granted bool.

### VerityPost/PushPromptSheet.swift  (85 lines)
- Purpose: pre-prompt sheet to gate the OS dialog (so a "Not now" doesn't burn the one-shot system permission).
- Concerns: clean.

### VerityPost/PushRegistration.swift  (107 lines)
- Purpose: APNs registration. `handleDeviceToken` calls `client.rpc("upsert_user_push_token")`. `VPAppDelegate` shim catches APNs callbacks.
- Services: `client.rpc("upsert_user_push_token")`.
- Concerns: only registers once a `currentUser` is set. DEBUG=sandbox / RELEASE=production environment string. Show banner+sound+badge when foregrounded — App Store guidance.

### VerityPost/LeaderboardPeriod.swift  (28 lines)
- Purpose: shared canonical 3-case enum (week/month/all-time) with rolling cutoffs (-7d / -30d). Mirrors `web/src/lib/leaderboardPeriod.ts`.
- Concerns: clean.

### VerityPost/BlockService.swift  (196 lines)
- Purpose: ObservableObject cache of `blocked_users` rows (bidirectional). Apple Guideline 1.2 plumbing. Also defines `ReportService` (POST `/api/reports`) and `ReportTargetType`/`ReportReason` enums.
- URLs: `POST/DELETE api/users/:id/block`, `POST api/reports`.
- Concerns: optimistic block/unblock with revert on HTTP failure. `isBlocked(_:)` is sync — every comment/DM filter consults it.

### VerityPost/HomeFeedSlots.swift  (204 lines)
- Purpose: `HomeRecapCard` + `HomeAdSlot` (currently unused on the new HomeView). HomeRecapCard self-hides if perm is missing or no recap; HomeAdSlot self-hides on any failure. AdPayload model.
- URLs: `/api/recap`, `/api/ads/serve?placement=home_feed`, `/api/ads/impression`, `/api/ads/click`.
- Concerns: not currently mounted in `HomeView` (the 2026-04-23 rebuild stripped `HomeAdSlot` + `HomeRecapCard` out — comment says "moved to in-article only"). This file is now unused — likely candidate for deletion or relocation into StoryDetailView. **Flag: orphan code.**

### VerityPost/HomeView.swift  (712 lines)
- Purpose: 1-hero + 7-supporting hand-curated front page. Editorial timezone = America/New_York. Rebuilt 2026-04-23.
- View hierarchy: `HomeView` → masthead → hero/supporting cards → BrowseLanding → CategoryDetailView. Plus breaking strip + registration-wall overlay.
- Services: `client.from("articles" / "categories")`, `SettingsService`, `PermissionService` (`home.breaking_banner.view`, `home.breaking_banner.view.paid`).
- URLs: none.
- Concerns: registration-wall counts views in UserDefaults `vp_articles_viewed_ids`/`vp_articles_viewed`. Free article limit pulled from settings (`free_article_limit`, default 3). All filtered queries scope to `published` and to "today" in editorial TZ. Breaking-strip sourced from a separate query so breaking always surfaces above masthead.

### VerityPost/LoginView.swift  (233 lines)
- Purpose: SIWA + Google + email login. Shows email/username field, password with show/hide.
- Services: `AuthViewModel`.
- URLs: none direct (delegates to AuthViewModel).
- Concerns: clean.

### VerityPost/SignupView.swift  (431 lines)
- Purpose: SIWA + Google + email signup with username, password strength meter, age+terms checkbox.
- Services: `AuthViewModel`.
- Concerns: combined age+ToS single-button. Password meter mirrors web. UIImpactFeedbackGenerator on critical taps.

### VerityPost/ForgotPasswordView.swift  (209 lines)
- Purpose: email-collect → reset link sent. 30s resend cooldown. UJ-515 same-success regardless of account existence (anti-enumeration).
- Concerns: clean.

### VerityPost/ResetPasswordView.swift  (253 lines)
- Purpose: presented as full-screen cover after recovery deep-link lands. Strength bars + checklist + match.
- Concerns: cancel button calls `auth.logout()` to drop the recovery scoped session — correct.

### VerityPost/VerifyEmailView.swift  (122 lines)
- Purpose: post-signup waiting state. 30s resend cooldown. Background -> active flips the view automatically when the deep link fires.
- Concerns: clean.

### VerityPost/WelcomeView.swift  (290 lines)
- Purpose: 3-page onboarding carousel. Stamps `onboarding_completed_at` via `POST api/account/onboarding`.
- URLs: `POST api/account/onboarding`.
- Concerns: skip + finish both stamp.

### VerityPost/AlertsView.swift  (890 lines)
- Purpose: notifications inbox + (placeholder) subscription manager.
- Services: `client.from("notifications")`, `PushPermission`, `PermissionService` (6 keys), `SubscriptionView` sheet.
- URLs: `PATCH api/notifications` (mark read / mark all read).
- TODO: explicit `manageSubscriptionsEnabled = false` — see `// Round 11 P1 …` comment. The Round-7+ subscription-manage UI is preserved verbatim under a flag flip; current build shows a placeholder. The `alert_preferences` table has no per-topic columns yet.
- Concerns: when `manageSubscriptionsEnabled == false`, `loadManageData` still runs and queries `categories` (the `subs` direct query is `#if false`'d). The visible "Coming soon" placeholder is the right call. Push pre-prompt fires once on first subscribe with the 7-day cooldown.

### VerityPost/BookmarksView.swift  (356 lines)
- Purpose: bookmarks list. Free=10 cap, Verity+=unlimited+collections+notes.
- Services: `client.from("bookmarks")`, `PermissionService` (`bookmarks.unlimited`, `bookmarks.collection.create`).
- URLs: `DELETE api/bookmarks/:id`.
- Concerns: optimistic delete with revert. Strip-the-"Kids" regex on category names for parity.

### VerityPost/ExpertQueueView.swift  (426 lines)
- Purpose: expert inbox (Pending / Claimed / Answered / Back-channel placeholder).
- Services: `PermissionService` (`expert.queue.view`).
- URLs: `GET api/expert/queue?status=...`, `POST api/expert/queue/:id/claim|decline|answer`.
- Concerns: Round A note (092b RLS lockdown) — direct `expert_queue_items` reads were revoked, queue now reads via API. Answer body returns `""` placeholder (API doesn't return body — only id/status). Back-channel intentionally a stub.

### VerityPost/FamilyViews.swift  (1357 lines)
- Purpose: parent-side kid management — list/add/remove kids, generate pair code, set/reset PIN, kid-dashboard, family leaderboard, family achievements. `KidsAPI` enum centralises every `/api/kids/*` route.
- View hierarchy: `FamilyDashboardView` → `kidRow`/`kidCard` → menu → AddKidSheet, PairCodeSheet, SetPinSheet, ResetPinSheet → `KidDashboardView` (per-kid) → `FamilyLeaderboardView` + `FamilyAchievementsView`.
- Services: `PermissionService` (`settings.family.view`, `family.add_kid`, `family.remove_kid`, `kids.pin.set`, `kids.pin.reset`), `SupabaseManager.client` (only inside `KidDashboardView.load` for `reading_log` / `quiz_attempts` aggregation).
- URLs: `GET/POST api/kids`, `DELETE api/kids/:id?confirm=1`, `GET api/family/config`, `POST api/kids/generate-pair-code`, `POST api/kids/set-pin`, `POST api/kids/reset-pin`, `GET api/family/leaderboard`, `GET api/family/achievements`.
- TODO: none.
- Concerns: 4-digit numeric PIN with secure entry. COPPA consent text is ~8 lines, version `2026-04-15-v1`. `familyConfigMaxKids` hardcoded fallback (`verity_family: 2`, `verity_family_xl: 4`) but DB-fetched at runtime via `/api/family/config` — Ext-J.4 fix already applied. Quiz-pass count uses `correct >= 3` threshold (not %) — matches server.

### VerityPost/KidsAppLauncher.swift  (61 lines)
- Purpose: opens `veritypostkids://` scheme; falls back to `https://veritypost.com/kids-app` on failure.
- TODO/comment: "Apple-block: swap to the real App Store listing the same session the kids app is approved." — confirms the Apple-block dependency in CLAUDE.md.
- Concerns: `URL(string: "https://veritypost.com")!` is a defensive fallback inside an `if let url = URL(...)` guard — the comment correctly flags the force-unwrap as a "test-only assumption." Not a crutch.

### VerityPost/LeaderboardView.swift  (599 lines)
- Purpose: leaderboard (Top Verifiers / Top Readers / Rising Stars / Weekly + period filter + category filter). Anon caps at 3 rows; unverified blurs 4+.
- Services: `client.from("users" / "categories" / "category_scores")`, `client.rpc("leaderboard_period_counts")`, `PermissionService` (3 keys).
- Privacy filter chain: `email_verified=true AND is_banned=false AND show_on_leaderboard=true AND frozen_at IS NULL` — extracted into `usersQueryBase()` helper to avoid drift across 5 loaders.
- URLs: none.
- Concerns: Round B 2026-04-23 rebuild. Subcategory pills hidden because `category_scores` has no `subcategory_id` — comment flags Wave 2. PostgREST anon GRANT list documented in `USER_COLUMNS`. Weekly/monthly via SECDEF RPC `leaderboard_period_counts` (schema/142).

### VerityPost/MessagesView.swift  (1082 lines)
- Purpose: DM conversation list + thread view, search/compose with role filter, realtime updates, read receipts, Apple 1.2 Report/Block.
- View hierarchy: `MessagesView` → `conversationListView` or `DMThreadView` (sub-struct) + searchSheet + SubscriptionView.
- Services: `PermissionService` (`messages.dm.compose`), `BlockService`, `ReportService`, `client.from("conversations" / "conversation_participants" / "messages" / "users" / "user_roles" / "message_receipts")`, `client.channel(...)` for realtime, `client.rpc("get_unread_counts")`.
- URLs: `POST api/conversations`, `POST api/messages`, `POST api/reports`.
- Concerns: realtime uses 3 channels (conversation updates, new participants, cross-convo message inserts). DM thread re-uses ScrollViewReader for auto-scroll. Read-receipts have a per-user opt-out (`dm_read_receipts_enabled`). Blocked users filtered client-side from `loadConversations` since RLS doesn't filter on viewer's blocks. POST `/api/messages` route enforces paid/mute/ban/rate-limit/length server-side. ISO date parser tolerantly tries fractional then non-fractional formats.

### VerityPost/ProfileView.swift  (2149 lines)
- Purpose: own-profile hub. Hero (tier ring + score + progress), 30-day streak grid, stat row (5 stats), social row, quick-action row (Bookmarks/Messages/Share/Kids), recent-activity preview, achievements preview, 4-tab content (Overview/Activity/Categories/Milestones), AvatarQuickEditSheet.
- Services: `PermissionService` (12 keys), `SettingsService`, `BlockService`, `client.from("score_tiers" / "reading_log" / "quiz_attempts" / "comments" / "bookmarks" / "categories" / "comment_votes" / "user_achievements" / "achievements" / "articles")`, `client.rpc("update_own_profile")`.
- URLs: none direct.
- Concerns: tabs differentiated by `task(id: tab)`. Reveal animations gated to first appear (spring). Tier ring driven by score_tiers DB rows. Hides hero/stats on unverified email. `frozenAccountBanner` shown when `users.frozen_at` is set. Avatar quick-edit writes JSON to `users.metadata.avatar` via `update_own_profile`. Several `.is("kid_profile_id", value: nil)` filters on adult queries — correct (excludes kid reading logs from adult totals).

### VerityPost/PublicProfileView.swift  (420 lines)
- Purpose: `/u/<username>` viewer. Anon → in-page sign-up CTA (no profile read). Authed → profile body + follow + share-card + Report/Block.
- Services: `PermissionService` (`profile.score.view.other.total`, `profile.follow`, `profile.card.share_link`), `BlockService`, `ReportService`.
- URLs: `POST api/follows`.
- Concerns: anon short-circuits before any users-table read — correct privacy default. Follows toggle routes through `/api/follows` (the route's `toggle_follow` RPC handles frozen_at + grace gates that direct insert misses). Column-narrowed `select` lists 092b-safe fields only.

### VerityPost/RecapView.swift  (425 lines)
- Purpose: `RecapSummary`/`RecapQuizView`/`UpgradePromptInline`. The list/landing was removed Round 8.
- Services: `client.from("articles")`.
- URLs: `GET api/recap/:id`, `POST api/recap/:id/submit`.
- Concerns: D36 anti-cheat — no per-question reveal; correct answers only in `/submit` response. Auto-advance after answer with 350ms delay.

### VerityPost/SettingsView.swift  (2873 lines, **largest file**)
- Purpose: settings hub (Account / Preferences / Privacy & Safety / Billing / Expert / About / Danger zone) plus 15+ subpages: profile edit, email change, password change, MFA enroll/unenroll, login activity, feed preferences, notifications, blocked accounts, data privacy, expert application, support/feedback, account delete.
- Services: `client.from("users" / "data_requests" / "expert_applications")`, `client.rpc("update_own_profile")`, `client.auth.update`, `client.auth.mfa.{listFactors, enroll, challenge, verify, unenroll}`, `PushPermission`, `BlockService`, `StoreManager`, `PermissionService` (16+ keys).
- URLs: `POST api/expert/apply`, `POST api/account/delete`, `POST api/support`, `GET api/users/blocked`.
- Concerns: hub uses tinted-icon section headers; subpages use compact all-caps. MFA flow uses Supabase GoTrue. Restore Purchases routes through StoreManager. Each subpage independently calls `PermissionService.refreshIfStale` on mount. Single `client.from("users").select("dm_read_receipts_enabled")` direct read in MessagesView is referenced from settings toggle.

### VerityPost/StoreManager.swift  (427 lines)
- Purpose: StoreKit 2 manager. 8 product IDs (4 plans × monthly+annual). C18 — only `transaction.finish()` after server-confirmed sync. T-021 — emit `vpSubscriptionSyncFailed` notification on non-2xx.
- Services: `client.auth.session`.
- URLs: `POST api/ios/subscriptions/sync`.
- Concerns: `Product.PurchaseOption.appAccountToken(uuid)` stamps the user UUID onto the JWS so App Store Server Notifications can correlate without the iOS sync round-trip. Listener task on `Transaction.updates` rediscovers un-finished transactions on next launch. `hasAccess(to:)` is a *local-only* heuristic — comments warn it is NOT a feature gate (use PermissionService).

### VerityPost/StoryDetailView.swift  (2561 lines)
- Purpose: article reader + 3-tab Article/Timeline/Discussion + quiz player + comments + Apple 1.2 Report/Block.
- Services: `PermissionService` (10+ keys), `SettingsService`, `BlockService`, `ReportService`, `TTSPlayer`, `client.from("articles" / "timeline_events" / "source_links" / "comments" / "comment_votes" / "users" / "bookmarks")`, `client.channel(...)` realtime comments, `client.auth.session`.
- URLs: `POST api/quiz/start`, `POST api/quiz/submit`, `POST api/comments`, `POST api/comments/:id/vote`, `GET/POST/DELETE api/bookmarks`, `POST api/stories/read`, `POST api/reports`.
- TODO: line 1908: `// TODO(round9-expert-qa-shape): expert_discussions uses title/body/parent_id/is_expert_question tree, not question/answer/question_id cols. Redesign needed to reconstruct Q+A pairs via parent_id + is_expert_question + expert_question_status.` — gated under `#if false`. Expert Q&A panel not currently shown.
- Concerns: D6/D8/D41 — quiz is server-graded; correct answers never come back until `/api/quiz/submit` response. Reading-progress ribbon + half-scroll teaser + pass-burst animation. Comment realtime sorts by `is_context_pinned DESC, upvote_count DESC` so new zero-upvote comments don't lift above pinned. `@mention` autocomplete gated. `loadMuteState` polls user's ban/mute fields pre-submit. Report-article in nav overflow; report-comment in per-comment confirmation dialog. The TTS controls are gated on `article.tts.play`.

### VerityPost/SubscriptionView.swift  (546 lines)
- Purpose: paywall — 5 plan cards, billing-cycle toggle, promo redemption, Restore Purchases, Manage Subscription deep-link, Apple 3.1.2 legal disclosures.
- Services: `StoreManager`, `client.auth.session`.
- URLs: `POST api/promo/redeem`.
- Concerns: pricing strings hardcoded ($3.99–$199.99). The hardcoded copies are presentational-only — actual pricing comes from `Product.price` at purchase time (StoreManager). Two `URL(string:)!` force-unwraps on `https://veritypost.com/terms` and `/privacy` are on string literals; not crutches but could be guarded.

### VerityPost/TTSPlayer.swift  (115 lines)
- Purpose: AVSpeechSynthesizer wrapper, en-US voice. Audio session `.playback / .spokenAudio`.
- Concerns: clean.

### VerityPostUITests/SmokeTests.swift  (123 lines)
- Purpose: 5 smoke tests — app launch, cold-launch tab bar, sign-in surface reachable, browse categories interactive, sign-in form has inputs.
- Concerns: clean. No accessibility-id usage yet — matches by visible text.

## Verification checklist

- **Kid-mode removal (CLAUDE.md claim "kid mode removed 2026-04-19")**: VERIFIED. No `isKidMode`/`kidMode`/`kid_mode`/`inKidMode` flag anywhere. All kid references are: (a) parent-side family management in FamilyViews.swift / KidDashboardView, (b) `KidProfile` model in Models.swift, (c) `KidsAppLauncher` deep-link out, (d) `is_kids_safe = false` filter on adult-side categories queries (correct — excludes kids categories from adult surfaces), (e) `.is("kid_profile_id", value: nil)` filter on adult-side reading_log/quiz_attempts queries (correct — excludes kid rows from adult stats), (f) `kid_profile_id: nil` on quiz/read POST bodies (correct — adult sessions never carry kid context). The "kid mode" UI mode (a single app switching to a kid-safe shell) is gone. The kids app is now the separate VerityPostKids target only.

- **KidsAppLauncher fallback URL**: VERIFIED. `KidsAppLauncher.fallbackURL = https://veritypost.com/kids-app`. Comment line 12-14 confirms: "Apple-block: swap to the real App Store listing the same session the kids app is approved." Matches the CLAUDE.md tracker entry. The line-22 `URL(string: "https://veritypost.com")!` is a defensive secondary fallback inside a guard-let; it is not a crutch. **Apple-block ready** as written.

- **PermissionService parity with web**: VERIFIED. iOS `PermissionService.shared.has(key)` uses the same `compute_effective_perms(p_user_id)` SECDEF RPC the web `lib/permissions.js` calls; iOS `refreshIfStale` polls `my_perms_version` exactly like the web client; `invalidate()` + `loadAll()` mirror the web `refreshAllPermissions`. Both have the dual cache (full set, no section split on iOS — flagged as a parity asymmetry to investigate). The change-token bump pattern (`PermissionStore.changeToken`) is the SwiftUI-idiomatic cousin of the web's React refetch.

- **Emojis in adult strings**: NONE FOUND. Scanned every Swift file for emoji codepoints (U+1F300+ etc.) — clean. The `→` arrow on HomeView line 285/318 ("Browse all categories →") and WelcomeView lines 170/172 (Read → Quiz → Comment) are typographic Unicode arrows, not emojis. CLAUDE.md says no emojis on adult surfaces; arrows are not emojis. If owner wants the arrows removed too, that's a separate brand call.

- **Force-unwrap crutches**: 4 force-unwraps total, all on `URL(string:)` against compile-time literals: SupabaseManager.swift:65 (siteURL fallback `https://veritypost.com`), KidsAppLauncher.swift:22 (defensive secondary fallback), SubscriptionView.swift:99 (`https://veritypost.com/terms`) and :103 (`https://veritypost.com/privacy`). All are on URL literals that have been hand-verified to parse. Two of these (SubscriptionView terms/privacy) could be tightened to guard-let for hygiene, but none are crutches. SupabaseManager.swift lines 38/41/47 use `fatalError` for missing INFOPLIST keys — defensive but the SupabaseManager.swift file fataling is the right call here (no client without creds; misconfigured release crashes loudly rather than silently failing every request). One `try!`-equivalent: Models.swift, Theme.swift use `try?` consistently. AuthViewModel uses `precondition` on the SecRandomCopyBytes nonce result — appropriate for a CSPRNG that should never fail. **Verdict: no force-unwrap crutches.**

## pbxproj target inventory

**Files in target VerityPost (PBXSourcesBuildPhase, 40 Swift):**
AlertsView.swift, AuthViewModel.swift, BlockService.swift, BookmarksView.swift, ContentView.swift, EventsClient.swift, ExpertQueueView.swift, FamilyViews.swift, ForgotPasswordView.swift, HomeFeedSlots.swift, HomeView.swift, Keychain.swift, KidsAppLauncher.swift, LeaderboardPeriod.swift, LeaderboardView.swift, Log.swift, LoginView.swift, MessagesView.swift, Models.swift, Password.swift, PermissionService.swift, ProfileView.swift, PublicProfileView.swift, PushPermission.swift, PushPromptSheet.swift, PushRegistration.swift, RecapView.swift, ResetPasswordView.swift, SettingsService.swift, SettingsView.swift, SignupView.swift, StoreManager.swift, StoryDetailView.swift, SubscriptionView.swift, SupabaseManager.swift, Theme.swift, TTSPlayer.swift, VerifyEmailView.swift, VerityPostApp.swift, WelcomeView.swift.

**Files in target VerityPostUITests (PBXSourcesBuildPhase, 1 Swift):**
SmokeTests.swift.

**Resources in target VerityPost (PBXResourcesBuildPhase, 10 entries):**
- AdultHomeFeed.html, KidModeDelight.jsx, KidModePixar.html, KidModeV3.html, PaywallRewrites.html, TypographyTokens.html, index.html — all from `possibleChanges/` group, all are HTML/JSX dev mockups.
- Assets.xcassets (empty AppIcon.appiconset — no actual 1024×1024 image present), PrivacyInfo.xcprivacy, REVIEW.md.

**Files on disk inside `VerityPost/VerityPost/` (group root) but referenced as ungrouped target file refs:**
The 7 `possibleChanges/` HTML/JSX files have correct path `possibleChanges/...` in the group definition. `index.html` is referenced with `path = index.html` (no folder prefix) but actually lives at `VerityPost/VerityPost/possibleChanges/index.html`. **Possible PBX path mismatch — would need xcodebuild to confirm** (the group is `possibleChanges` so Xcode resolves relative to the group). Path resolution likely works at build time because the children inherit the group's path; flagging for explicit verification.

**Files in target but should NOT be:**
The 7 HTML/JSX mockups + REVIEW.md ship in the .app bundle as resources. These are dev-only design artifacts and should be **removed from the Resources build phase before App Store submission** — they bloat the IPA and leak internal design files. Flag as a pre-launch cleanup item.

**Files on disk but not in target:**
- `VerityPost/VerityPost.xcodeproj/xcuserdata/.../xcschememanagement.plist` — user-specific, expected.
- `VerityPost/build/` — build artifacts directory, not in source.
- `VerityPost/project.yml` — present at the wrapper root (likely XcodeGen config); not visible in the pbxproj. Could imply the pbxproj is generated from `project.yml`; if so, edits to pbxproj will be overwritten. Worth inspecting (out of zone scope, but flagging).

**Build settings of note (Release config):**
- IPHONEOS_DEPLOYMENT_TARGET = 17.0
- SWIFT_VERSION = 5.9
- TARGETED_DEVICE_FAMILY = "1,2" (iPhone + iPad)
- PRODUCT_BUNDLE_IDENTIFIER = `com.veritypost.app`
- CODE_SIGN_ENTITLEMENTS = `VerityPost/VerityPost.entitlements` (only `com.apple.developer.applesignin = ["Default"]`)
- INFOPLIST_KEY_SUPABASE_URL = `https://fyiwulqphgmoqullmrfn.supabase.co`
- INFOPLIST_KEY_SUPABASE_KEY = `sb_publishable_cghQhP7iWFHIPAWnhsH3tw_COmnxYJG` (publishable anon key, safe in client)
- INFOPLIST_KEY_VP_SITE_URL = `https://veritypost.com`
- MARKETING_VERSION = 1.0, CURRENT_PROJECT_VERSION = 1
- ProvisioningStyle = Automatic. **No APNs entitlement** in VerityPost.entitlements — the file declares only Sign in with Apple. Push capability is therefore not yet in the entitlement file even though `PushRegistration` calls `registerForRemoteNotifications()`. Apple-block: developer must add `aps-environment` entitlement when an Apple Dev account exists. Flag for owner-side checklist.

## Within-zone duplicates / overlap

- **HomeFeedSlots.swift is orphaned** — `HomeRecapCard` + `HomeAdSlot` + `AdPayload` are no longer mounted anywhere (the 2026-04-23 HomeView rebuild stripped them). The file should be deleted or relocated into StoryDetailView (where comments suggest ads are now embedded), or kept and revived if the owner wants the recap card back on the home feed.
- **Keychain.swift may be orphaned** — no callers found in current sources. Was used during the unified-app era for kid PIN storage; PINs now server-side. Verify before deleting (could be re-used for a future MFA backup-code cache).
- **`UpgradePromptInline` lives in RecapView.swift** but is reused from FamilyViews.swift (`canViewFamily=false` branch). Cross-file coupling acceptable; just flagging the shared component lives in an unexpected file.
- **`timeAgo()` global function** in Theme.swift is shadowed by a private `timeAgo` in MessagesView (line 714). MessagesView's local one is fewer-buckets ("3d" vs "3d ago"). Worth consolidating but not a bug.
- **Multiple ISO8601DateFormatter constructions** scattered across StoryDetailView, MessagesView, DMThreadView, RecapView, AlertsView, etc. The `ISO8601DateFormatter.kidsAPI` extension (FamilyViews.swift:1352) is the canonical fractional-seconds variant; other call sites recreate the same formatter inline. Drift candidate.
- **`fetchStoryBySlug(_:)` is reimplemented** in HomeView (private), AlertsView (private), BookmarksView (private), ProfileView (private), MessagesView (none, but shape similar). 4 copies of the same `client.from("articles").select().eq("slug",…).limit(1).execute().value` query. Low-risk consolidation candidate.

## Notable claims worth verifying in later waves

1. **SmokeTests reach the LoginView via two-step nav** — relies on the bottom-nav "Sign in" tab being identified by accessibility label "Sign in." If the tab bar copy changes to "Profile" once logged-in, anon flow still works. But the test matches identifiers strictly. Worth running in Wave-2 to confirm no recent UI drift broke the smoke.
2. **`/api/kids` GET listing** — `KidsAPI.listKids` decodes `{ kids: [KidProfile] }`. Wave 2 should verify the route's response shape matches (the web side may have moved to a flat array).
3. **`leaderboard_period_counts` RPC** — Wave 2 should verify this RPC still exists in Supabase + has SECURITY DEFINER and exec-grants for `authenticated` (092b RLS lockdown could have revoked it).
4. **`compute_effective_perms` RPC** — same; this is the root of the entire iOS permission gate. Should be on the "every-wave smoke check" list.
5. **`update_own_profile` RPC accepts `{ p_fields: { last_login_at: ISO } }`** — used by `AuthViewModel.login`. If the RPC schema has been tightened to whitelist columns, last_login_at may silently no-op. Worth checking.
6. **AppIcon.appiconset has no actual 1024×1024 PNG** — Contents.json declares the slot but no image file is present. **Will fail App Store submission.** Pre-launch blocker. Owner-side asset ingest.
7. **`possibleChanges/` HTML/JSX/MD shipped as resources** — pre-launch removal blocker. Will be visible in `Bundle.main` output and bloat the IPA.
8. **APNs entitlement missing** — `aps-environment` not in `VerityPost.entitlements`. Will fail to register for remote notifications until added. Apple-block alongside the developer account.
9. **Subcategory leaderboard pills hidden** — LeaderboardView header note "category_scores has no subcategory_id column." Either backfill the column or aggregate from reading_log live. Wave-2 schema check.
10. **Round 9 expert-Q&A panel dead-coded under `#if false`** — expert_discussions table shape changed; iOS reader's expert-answer panel is shipped non-functional. Either resurrect the API or delete the dead block + remove the empty `expertAnswers` state from StoryDetailView.
11. **`alert_preferences` table has no per-topic columns** — the entire AlertsView Manage subscription tab is gated off behind `manageSubscriptionsEnabled = false`. Tracker says "Round 7 redesign needed."
12. **`project.yml` exists at `VerityPost/project.yml`** — implies pbxproj may be generated from it (XcodeGen). Wave-2 should confirm whether pbxproj edits get clobbered on regeneration.
13. **`CFBundleVersion` is "1"** — never bumped across releases. Will collide on App Store Connect upload after the first build. Pre-launch checklist item.
