# iOS Bug-Sweep — System Map

**Written:** (founding pass)
**Amend, don't rewrite.** Add new findings as dated notes at the end of each section. Only the cross-cutting "known fragilities" and open-question lists get appended to.

This is the reference document every investigation session reads before spawning agents.

---

## Cross-cutting architecture notes

### Supabase client patterns
- `SupabaseManager.swift` — singleton; wraps `SupabaseClient`; all queries go through it
- `SupabaseKidsClient.swift` (kids app) — separate singleton for kids; uses a different auth context (kid JWT from pairing)
- Swift Supabase uses PostgREST string-based selects — FK hint mismatches fail silently (nil / empty result, no error)

### Auth patterns
- `AuthViewModel.swift` — shared observable; holds session state; listened to across multiple views
- `Keychain.swift` — local credential storage; reads happen on app launch before session restore completes
- Session restore: Supabase Swift SDK auto-restores from keychain on init; views that read session before `.session` is populated get nil

### Permission system
- `PermissionService.swift` — fetches `my_permission_keys` RPC (same RPC as web); caches keys in memory
- Permission checks: inline `permissionService.has("key")` calls throughout views
- NOT `compute_effective_perms` — that name is dead (fixed in article-lifecycle program)

### Realtime
- `RealtimeHelpers.swift` — shared channel setup utilities
- Channels opened with `.on("postgres_changes", ...)` — must be removed in `onDisappear` or view deinit; leaked channels accumulate across navigation events and cause duplicate event handling
- Known past issue: `StoryDetailView` had `users!user_id` in realtime join (403 for non-admins) — fixed in article-lifecycle session 9

### Push notifications
- `PushRegistration.swift` — registers APNs token with `/api/push/` (web API)
- `PushPermission.swift` — permission request flow
- `PushPromptSheet.swift` — UI prompt before requesting system permission
- Deregistration on logout: must call DELETE `/api/push/` to invalidate token — if skipped, push goes to signed-out device

### Event tracking
- `EventsClient.swift` — posts to `/api/events/batch` (same endpoint as web)
- Sends: `article_read_start`, `scroll_depth`, `article_read_complete`
- Endpoint is anon-allowed (verified in site-bug-sweep slice 08) — no auth header required

### In-app purchases
- `StoreManager.swift` — StoreKit 2 wrapper; handles product fetch, purchase, restore
- Subscription state synced to Supabase via `/api/stripe/` webhooks on the web side — iOS purchases go through App Store, not Stripe

### Kids app architecture
- `KidsAppState.swift` — observable state for kid session; holds kid profile, permissions, reading progress
- `KidsAuth.swift` — handles kid JWT from parent pairing; separate from main app auth
- `PairingClient.swift` — manages the parent↔kid pairing code exchange
- `ParentalGateModal.swift` — COPPA gate; must appear before any destructive or account-modifying action
- COPPA rule: absolute — no action in the kids app that modifies data, account settings, or triggers purchases may bypass `ParentalGateModal`

---

## Slice 01: Auth & session

### Files
- `VerityPost/VerityPost/AuthViewModel.swift` — primary auth state; sign-in, sign-up, OTP verify, PKCE, logout
- `VerityPost/VerityPost/LoginView.swift` — login UI; calls AuthViewModel
- `VerityPost/VerityPost/SignupView.swift` — sign-up UI
- `VerityPost/VerityPost/VerifyEmailView.swift` — OTP entry (8-digit per auth redesign)
- `VerityPost/VerityPost/ForgotPasswordView.swift` — password reset request
- `VerityPost/VerityPost/ResetPasswordView.swift` — password reset from deep link
- `VerityPost/VerityPost/PickUsernameView.swift` — post-signup username selection
- `VerityPost/VerityPost/WelcomeView.swift` — post-signup landing / coming-soon gate
- `VerityPost/VerityPost/Keychain.swift` — local credential storage
- `VerityPost/VerityPost/VerityPostApp.swift` — app entry point; session restore on cold launch
- `VerityPost/VerityPost/Password.swift` — password validation helpers

### Supabase tables / RPCs
- `auth.users` — Supabase auth
- `users` — app-level user row
- `my_permission_keys` RPC — permission fetch on login
- `access_requests` — waitlist

### Permission checks
- Auth is the gate for everything in `PROTECTED_PREFIXES` equivalent on iOS (tab bar visibility, profile routes)
- Beta gate equivalent: `AuthViewModel` likely checks a flag on the user row or permission key

### Known fragilities
- Cold-launch Keychain race: if the app reads `PermissionService` or checks `authViewModel.session` in a view's `onAppear` before the Supabase SDK finishes restoring the session from Keychain, the check incorrectly sees nil and may redirect to login or skip permission-gated UI. Check `VerityPostApp.swift` init order.
- OTP digit count: must be 8 (auth redesign shipped). Verify `VerifyEmailView.swift` enforces exactly 8 digits.
- Logout cleanup: must deregister push token (`PushRegistration`), remove all realtime channels, and wipe local state. If any step is missing, a signed-out device continues receiving pushes or seeing stale data.
- `ForgotPasswordView` and `ResetPasswordView` async actions: likely share the same double-fire / no-loading-guard risk pattern found across the web app.

---

## Slice 02: Navigation shell & home feed

### Files
- `VerityPost/VerityPost/ContentView.swift` — tab bar shell; mounts all top-level tabs; handles deep links and badge counts
- `VerityPost/VerityPost/HomeView.swift` — Today tab; breaking strip + article cards
- `VerityPost/VerityPost/HomeFeedSlots.swift` — slot-based feed layout helpers

### Supabase tables
- `stories` — story containers (slug lives here post article-lifecycle migration)
- `articles` — individual articles with `story_id` FK
- `breaking_news` / broadcasts — breaking strip

### Permission checks
- Home is available to all authenticated users
- Breaking strip: public / all users (permission restructure pending per search-browse-categories Wave 2c)

### Known fragilities
- After the stories-as-containers migration (article-lifecycle session 9b), `articles.slug` no longer exists. Any query in `HomeView.swift` or `HomeFeedSlots.swift` that reads `article.slug` directly (rather than `story.slug`) will produce nil article links. Verify the query joins `stories(slug)` not `articles.slug`.
- Tab bar restructure (Today | Browse | Following | Profile) is part of the search-browse-categories Wave 4a and may not be implemented yet. Verify current tab structure in `ContentView.swift`.
- Badge count on Today tab for alerts: part of Wave 4b. Verify current state.
- Deep link handling: PKCE callback deep link must be routed correctly through `ContentView` to `AuthViewModel`. Check for the `/auth/callback` URL scheme handler.

---

## Slice 03: Article reading & event tracking

### Files
- `VerityPost/VerityPost/StoryDetailView.swift` — primary article reader; story + article selection; quiz mount; comment thread; timeline; sources
- `VerityPost/VerityPost/EventsClient.swift` — posts `article_read_start`, `scroll_depth`, `article_read_complete` events

### Supabase tables
- `stories` — story container
- `articles` — article body, audience tier
- `sources` — article sources
- `timelines` — story timeline (parented by `story_id` post session 9b)
- `quizzes` + `quiz_attempts` — quiz data
- `comments` — per-article comments

### Permission checks
- `article.view.body` / `article.view.sources` / `article.view.timeline` — granted to all (including anon) via `user` role → `anon` set
- Quiz: `user_passed_article_quiz` RPC
- Comments: must have passed quiz; expert blur for non-pro users

### Known fragilities
- **Realtime subscription FK hint (fixed):** `StoryDetailView` previously used `users!user_id` in realtime channel join — 403 for non-admins. Fixed in article-lifecycle session 9 with `public_profiles_v`. Verify the fix is in the current file (don't re-investigate — check it's still there).
- **`?a=<article-id>` equivalent on iOS:** The web reader uses a query param to deep-link to a specific article within a story. iOS equivalent is a navigation parameter or tab selection. Verify `StoryDetailView` handles both "open to specific article" and "open to most recent" correctly.
- **Scroll depth tracking:** Web's `ArticleTracker` had viewport-height vs article-height bug (fixed in slice 03 of site-bug-sweep). iOS `EventsClient` likely has an equivalent — verify scroll depth milestones are measured relative to the article body, not the full screen.
- **TTS player lifecycle:** `TTSPlayer.swift` — does it stop/clean up when the view disappears? A TTS session that survives navigation would play audio on the wrong screen.
- **Timeline `type='article'` entries:** Post article-lifecycle, timelines can have `type='article'` with a `linked_article_id`. Verify `StoryDetailView` handles both `type='event'` and `type='article'` (renders a link, not just text, for article-type entries).

---

## Slice 04: Discovery (Find, Leaderboard, Following)

### Files
- `VerityPost/VerityPost/FindView.swift` — search / discovery UI
- `VerityPost/VerityPost/LeaderboardView.swift` — Most Informed leaderboard
- `VerityPost/VerityPost/LeaderboardPeriod.swift` — leaderboard time period selection
- `VerityPost/VerityPost/FollowingView.swift` — Following feed (stories with reader engagement)

### Supabase tables
- `stories` + `articles` — search results
- `users` / `public_profiles_v` — leaderboard entries (must use view, not table)
- `follows` — `fk_follows_follower_id` FK hint
- `reading_log` — Following feed query (stories the user has engaged with)

### Permission checks
- Search: free users get title-only; pro users get full-text (per search-browse-categories structural question — verify current iOS gate)
- Leaderboard: public / no gate
- Following: requires auth

### Known fragilities
- Following feed query: per search-browse-categories cross-surface finding, the query needs `reading_log`, `stories`, and `story_articles` at minimum. Verify the iOS `FollowingView` query shape and that `lifecycle_status` filter is applied (show only non-Resolved stories). `lifecycle_status` column may not exist yet if Wave 3a hasn't shipped.
- Leaderboard must read from `public_profiles_v`, not `users` directly. Direct `users` reads expose private fields.
- `FindView` search results: post article-lifecycle migration, article links come from `stories.slug` not `articles.slug`. Verify result rows navigate to `/<slug>` equivalent correctly.

---

## Slice 05: Social & engagement

### Files
- `VerityPost/VerityPost/BookmarksView.swift` — saved articles
- `VerityPost/VerityPost/ExpertQueueView.swift` — expert pending assignments
- `VerityPost/VerityPost/RecapView.swift` — weekly quiz recap
- `VerityPost/VerityPost/PublicProfileView.swift` — public view of another user's profile
- `VerityPost/VerityPost/InviteFriendsView.swift` — referral / invite flow

### Supabase tables
- `bookmarks` — `user_id`, `article_id`
- `expert_sessions` — expert assignment queue
- `quiz_streaks` + `user_achievements` — recap data
- `public_profiles_v` — public profile reads (must use view)
- `follows` — follow state on public profiles

### Permission checks
- Bookmarks, expert queue, recap: require auth
- Expert queue: additional `expert` role check
- Public profiles: no auth required; must only read from `public_profiles_v`

### Known fragilities
- `ExpertQueueView`: same double-fire risk for Claim / Decline / Post answer buttons that was found on the web (fixed in slice 04 of site-bug-sweep). iOS version likely has the same pattern — look for async handlers with no `isLoading` guard.
- `BookmarksView`: post article-lifecycle migration, bookmark rows join `articles → stories(slug)`. Verify the query uses `articles(story:stories(slug))` not `articles(slug)`.
- `PublicProfileView`: must not expose private fields. Any query that reads `users` directly instead of `public_profiles_v` is a data leak.

---

## Slice 06: Messaging & realtime

### Files
- `VerityPost/VerityPost/MessagesView.swift` — DM conversation list + thread view
- `VerityPost/VerityPost/RealtimeHelpers.swift` — shared realtime channel utilities

### Supabase tables
- `messages` — body, sender, conversation reference
- `conversations` + `conversation_participants` — participant management

### Permission checks
- Messaging: requires auth; pro-only DM access gate (verify)

### Known fragilities
- Realtime channel lifecycle: `MessagesView` opens a Supabase channel for new messages. If the channel is not explicitly removed when the view disappears (or the user navigates away and returns), multiple subscriptions stack up — each new message fires N times where N = number of times the view was visited. Check `onDisappear` / `deinit` for `removeChannel()` call.
- Send message double-fire: same risk as web `messages/page.tsx` (fixed in site-bug-sweep slice 05). Look for async `sendMessage` handler with no in-flight guard.
- Pro gate on DM: if the paywall check is only in the UI (button hidden/disabled) and not enforced in the API route, a request can be crafted to bypass it. Verify the API route also checks the pro permission.
- Silent error on message send failure: `MessagesView` may have the same silent-catch pattern fixed on the web.

---

## Slice 07: Profile, settings & push

### Files
- `VerityPost/VerityPost/ProfileView.swift` — user profile; reading history, achievements, settings entry
- `VerityPost/VerityPost/SettingsView.swift` — notification prefs, account settings, logout
- `VerityPost/VerityPost/SettingsService.swift` — settings fetch/save
- `VerityPost/VerityPost/AlertsView.swift` — notification inbox / alerts tray
- `VerityPost/VerityPost/PushPermission.swift` — permission request logic
- `VerityPost/VerityPost/PushPromptSheet.swift` — pre-permission prompt UI
- `VerityPost/VerityPost/PushRegistration.swift` — APNs token registration / deregistration

### Supabase tables
- `users` — profile data (read via `public_profiles_v` for public-facing; own profile reads `users` directly via auth)
- `alert_preferences` — notification toggle rows
- `notifications` — alert inbox
- `user_achievements` — badges
- `quiz_streaks` — streak display

### Permission checks
- Profile: requires auth for own profile; public profiles must use `public_profiles_v`
- Settings: requires auth
- Push: requires APNs permission before token registration

### Known fragilities
- Push token deregistration on logout: `PushRegistration` must call DELETE on `/api/push/` when the user signs out. If missing, the device continues receiving pushes after logout.
- `SettingsService` save actions: likely async with no in-flight guard. Look for toggle/save handlers that can double-fire.
- `AlertsView` mark-as-read: same double-fire risk as `notifications/page.tsx` on web (fixed in slice 04 of site-bug-sweep).
- Notification preferences: the web `NotificationsCard` had a bug where preferences loaded incorrectly (fixed in profile-bugfix N-01). Verify `SettingsView` or `AlertsView` loads the correct preference values on first render.

---

## Slice 08: Billing & subscription

### Files
- `VerityPost/VerityPost/SubscriptionView.swift` — subscription management UI; upgrade prompts; plan display
- `VerityPost/VerityPost/StoreManager.swift` — StoreKit 2 wrapper; product fetch, purchase, restore

### Supabase tables
- `user_subscriptions` — subscription state (synced from App Store receipts via server-side validation, not Stripe)
- `plans` — plan definitions

### Permission checks
- Subscription management: requires auth
- Upgrade gate: feature checks via `PermissionService`

### Known fragilities
- StoreKit purchase flow: `StoreManager` handles `Product.purchase()` — verify the result is awaited properly and all `PurchaseResult` cases are handled (`.success`, `.userCancelled`, `.pending`). An unhandled `.pending` case (e.g. Ask to Buy) would leave the UI in a broken state.
- Purchase double-tap: if the "Subscribe" button has no in-flight guard, tapping twice can initiate two StoreKit transactions. StoreKit 2 deduplicates these server-side, but the UI may show confusing double-spinner state.
- Receipt / entitlement sync lag: after a successful purchase, the Supabase subscription row may not update immediately. Verify `StoreManager` polls or listens for the server-side confirmation before updating `PermissionService`.
- Restore purchases: `StoreManager.restorePurchases()` — verify it handles the empty-restore case (user taps Restore but has no purchases) without crashing or showing a silent empty state.

---

## Slice 09: Family & kids bridge

### Files
- `VerityPost/VerityPost/FamilyViews.swift` — parent-side family management UI; kid profiles; "Send to kids app" suggestion
- `VerityPost/VerityPost/KidsAppLauncher.swift` — launches or deep-links into the kids app from the parent app
- `VerityPost/VerityPost/PermissionService.swift` — shared permission key cache; also used for family-tier permissions

### Supabase tables
- `kid_profiles` — kid account rows (parented by adult user)
- `reading_log` — `kid_profile_id` field populated for kid reads (needed for family cross-band feature)
- `feed_clusters` — `primary_kid_article_id` for "Send to kids" suggestion (verify column exists)
- `family_suggestions` — schema for "Send to kids app" write path (may not exist yet per search-browse-categories deferred list)

### Permission checks
- Family management: requires auth; parent must own the kid profile
- ParentalGateModal: any destructive action on a kid profile (delete, modify DOB, unlink) must be gated

### Known fragilities
- `family_suggestions` table may not exist (listed as deferred in search-browse-categories program). If `FamilyViews` queries it, that's a silent nil result or runtime error. Verify whether the table exists via MCP before the session starts.
- `feed_clusters.primary_kid_article_id` column — existence unverified. Same risk.
- `KidsAppLauncher`: launching a separate app requires the URL scheme to be registered in both apps' `Info.plist`. Verify the scheme is present and the fallback (kids app not installed) is handled gracefully.

---

## Slice 10: Kids auth & pairing

### Files
- `VerityPostKids/VerityPostKids/KidsAuth.swift` — kid session management; kid JWT from parent pairing
- `VerityPostKids/VerityPostKids/PairCodeView.swift` — UI for entering the parent-generated pairing code
- `VerityPostKids/VerityPostKids/PairingClient.swift` — network client for pairing code exchange
- `VerityPostKids/VerityPostKids/KidsAppRoot.swift` — app root; routes between paired/unpaired state
- `VerityPostKids/VerityPostKids/KidsAppState.swift` — observable state; kid profile, session, reading progress

### Supabase tables
- `kid_profiles` — kid account row
- Auth: kid JWT issued by parent pairing flow; different from adult `auth.users` session

### Permission checks
- All kids app API calls use the kid JWT — the server validates the kid is paired to an active parent account
- `SupabaseKidsClient` is separate from `SupabaseManager` — keeps kid session isolated from parent session

### Known fragilities
- Pairing code expiry: if the code has a TTL and the user enters it after expiry, `PairingClient` must surface a clear error, not a silent nil response.
- Session restore on cold launch: `KidsAppRoot` must handle the case where the kid JWT has expired (parent deleted the account, subscription lapsed) and route to the pairing screen rather than crashing.
- `PairCodeView` submit: async action with likely no in-flight guard. Look for double-submit risk.

---

## Slice 11: Kids home & article reading

### Files
- `VerityPostKids/VerityPostKids/ArticleListView.swift` — kids home feed; story/article list
- `VerityPostKids/VerityPostKids/KidReaderView.swift` — kids article reader; text + images; quiz prompt
- `VerityPostKids/VerityPostKids/TabBar.swift` — kids tab bar

### Supabase tables
- `stories` + `articles` — content (kid-audience tier only)
- `reading_log` — tracks kid reads; `kid_profile_id` field

### Permission checks
- Content filtered to kid-audience tier via query filter — verify the filter is applied and cannot be bypassed

### Known fragilities
- **`KidReaderView` background→foreground stale content (confirmed already fixed):** Re-fetches on `scenePhase == .active` at lines 113–116. Do not re-investigate — verify the fix is still present.
- Post article-lifecycle: articles now have `story_id` FK; `articles.slug` removed. Verify `ArticleListView` and `KidReaderView` use the correct query shape joining `stories(slug)`.
- Audience tier filter: the query must include `.eq('audience_tier', 'kids')` or equivalent. A missing filter would expose adult content to kids.
- Reading progress tracking: `reading_log` writes with `kid_profile_id` — verify the kid profile ID is correctly set, not nil.

---

## Slice 12: Kids quiz & gamification

### Files
- `VerityPostKids/VerityPostKids/KidQuizEngineView.swift` — quiz UI; question display; answer selection; score
- `VerityPostKids/VerityPostKids/BadgeUnlockScene.swift` — achievement badge animation
- `VerityPostKids/VerityPostKids/QuizPassScene.swift` — quiz completion celebration
- `VerityPostKids/VerityPostKids/StreakScene.swift` — streak display animation
- `VerityPostKids/VerityPostKids/GreetingScene.swift` — daily greeting animation
- `VerityPostKids/VerityPostKids/CountUpText.swift` — animated score counter
- `VerityPostKids/VerityPostKids/FlameShape.swift` — streak flame visual
- `VerityPostKids/VerityPostKids/ParticleSystem.swift` — confetti / particle effects

### Supabase tables
- `quizzes` — questions (kid-audience tier only)
- `quiz_attempts` — one row per answer; `selected_answer` is option text (not index)
- `user_achievements` / `family_achievements` — badge unlocks

### Permission checks
- Quiz: kid must be paired and have a valid session
- Achievement writes: server-side; kid cannot self-award

### Known fragilities
- Quiz answer submit: `KidQuizEngineView` submits an answer to the API. Double-tap risk: a rapid second tap before the response returns could submit the same answer twice. Look for in-flight guard.
- `quiz_attempts.selected_answer` stores option text, not index (per article-lifecycle spec). Verify the iOS submission sends option text, not `0`/`1`/`2`/`3`.
- Scene animations (BadgeUnlockScene, QuizPassScene, StreakScene): these are likely `SpriteKit` or `CAAnimation` scenes. If they retain a strong reference to `KidsAppState` they could prevent it from being deallocated. Check for retain cycles.
- Achievement query shape: `family_achievements` join — verify FK hint if `!` syntax is used.

---

## Slice 13: Kids profile & parental controls

### Files
- `VerityPostKids/VerityPostKids/ProfileView.swift` — kid profile; reading record, achievements, streak
- `VerityPostKids/VerityPostKids/LeaderboardView.swift` — kids leaderboard (read-only; ranked by quiz scores)
- `VerityPostKids/VerityPostKids/ExpertSessionsView.swift` — kids expert queue (read-only or limited)
- `VerityPostKids/VerityPostKids/ParentalGateModal.swift` — COPPA gate; must appear before any destructive or account-modifying action
- `VerityPostKids/VerityPostKids/KidPrimitives.swift` — shared UI primitives (buttons, cards, typography)

### Supabase tables
- `kid_profiles` — kid profile data
- `user_achievements` — badge display
- `quiz_streaks` — streak display
- `public_profiles_v` — leaderboard entries (must use view)

### Permission checks
- **ParentalGateModal is required** before any action that modifies data, account settings, or triggers a network mutation. COPPA absolute rule — no exceptions, no wont-fix for a missing gate.
- Leaderboard: read-only; no mutation risk
- `ExpertSessionsView`: verify whether this is read-only or allows submissions; if submissions, gate required

### Known fragilities
- **ParentalGateModal coverage audit** — this is the primary goal of slice 13. Every button in `ProfileView` and `ExpertSessionsView` that performs a mutation must be traced to a `ParentalGateModal` invocation. Missing gates are P0 issues.
- `KidPrimitives` reusable buttons: if primitive buttons accept an action closure without a standard COPPA gate, individual callers are responsible — easy to miss. Verify whether the gate is in the primitive or at the call site.
- Leaderboard `public_profiles_v`: same rule as adult leaderboard — must not read from `users` directly.
