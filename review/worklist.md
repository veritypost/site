# Page Review Worklist
Generated: 2026-05-02

---

## 1. Summary

| Metric | Count |
|--------|-------|
| **Total pages** | **121** |
| Flagship | 9 |
| Important | 26 |
| Secondary | 22 |
| Admin | 51 |
| Static | 13 |

| Platform | Count |
|----------|-------|
| Web | 74 |
| iOS Adult | 21 |
| iOS Kids | 7 |
| (redirect/route only, not reviewed) | 4 |

> Pages that are pure server-side redirects with no rendered UI (e.g. `/billing`, `/signup`, `/methodology`, `/story/[slug]`) are noted but not counted as full review targets.

---

## 2. Flagship Pages

### F-01 Home Feed (Web)
Platform: web
Route or entry point: `/`
Primary files:
  - `web/src/app/page.tsx`
  - `web/src/app/_HomeBreakingStrip.tsx`
  - `web/src/app/_HomeFooter.tsx`
  - `web/src/app/_HomeFetchFailed.tsx`
  - `web/src/app/_HomeFirstLoginMoment.tsx`
  - `web/src/app/_HomeVisitTimestamp.tsx`
  - `web/src/app/_homeShared.ts`
Calls these API routes: Supabase direct (articles, categories, top_stories), no Next.js API routes on server render; `_HomeBreakingStrip` reads permissions client-side
Tier: flagship
Estimated complexity: large (11+)
Discovery flags: none

---

### F-02 Article Reader (Web)
Platform: web
Route or entry point: `/<slug>` (dynamic catch-all)
Primary files:
  - `web/src/app/[slug]/page.tsx`
  - `web/src/app/[slug]/_ArticleFetchFailed.tsx`
  - `web/src/components/article/ArticleSurface.tsx`
  - `web/src/components/ArticleEngagementZone.tsx`
  - `web/src/components/ArticleActions.tsx`
  - `web/src/components/article/ArticleTracker.tsx`
  - `web/src/components/article/StoryArticlePicker.tsx`
  - `web/src/components/NextStoryFooter.tsx`
Calls these API routes: `/api/stories/read` (view count), `/api/quiz/start`, `/api/quiz/submit`, `/api/comments`, `/api/expert/ask`; Supabase direct on server for story/article fetch
Tier: flagship
Estimated complexity: large (11+)
Discovery flags: none

---

### F-03 Login / OTP Entry (Web)
Platform: web
Route or entry point: `/login`
Primary files:
  - `web/src/app/login/page.tsx`
  - `web/src/app/login/_SingleDoorForm.tsx`
  - `web/src/app/login/_WaitlistForm.tsx`
  - `web/src/app/login/_RequestAccessForm.tsx`
Calls these API routes: `/api/auth/send-magic-link`, `/api/auth/verify-magic-code`, `/api/auth/signup`, `/api/access-redeem`
Tier: flagship
Estimated complexity: medium (4–10)
Discovery flags: kill-switched (intentional, see CLAUDE.md) — OAuth Google/Apple buttons present in `_SingleDoorForm.tsx` but gated by `OAUTH_ENABLED = false`

---

### F-04 Home Feed (iOS Adult)
Platform: ios-adult
Route or entry point: `HomeView.swift`
Primary files:
  - `VerityPost/VerityPost/HomeView.swift`
  - `VerityPost/VerityPost/ContentView.swift` (shell/router)
Calls these API routes: Supabase direct (articles, top_stories, categories); `/api/stories/read`
Tier: flagship
Estimated complexity: medium (4–10)
Discovery flags: none

---

### F-05 Article Reader (iOS Adult)
Platform: ios-adult
Route or entry point: `StoryDetailView.swift`
Primary files:
  - `VerityPost/VerityPost/StoryDetailView.swift`
Calls these API routes: Supabase direct (articles, quiz_questions); `/api/quiz/start`, `/api/quiz/submit`, `/api/stories/read`, `/api/expert/ask`, `/api/comments`
Tier: flagship
Estimated complexity: large (11+)
Discovery flags: none

---

### F-06 Article List / Home (iOS Kids)
Platform: ios-kids
Route or entry point: `ArticleListView.swift`
Primary files:
  - `VerityPostKids/VerityPostKids/ArticleListView.swift`
  - `VerityPostKids/VerityPostKids/KidReaderView.swift`
  - `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
Calls these API routes: Supabase direct (articles, categories); `/api/kids/quiz`, `/api/stories/read`
Tier: flagship
Estimated complexity: large (11+)
Discovery flags: none

---

### F-07 Kids Pair / Sign-in (iOS Kids)
Platform: ios-kids
Route or entry point: `PairCodeView.swift`
Primary files:
  - `VerityPostKids/VerityPostKids/PairCodeView.swift`
Calls these API routes: `/api/kids/pair` (via kids JWT); `/api/kids/verify-pin`
Tier: flagship
Estimated complexity: small (1–3)
Discovery flags: none

---

### F-08 Kid Reader (iOS Kids)
Platform: ios-kids
Route or entry point: `KidReaderView.swift`
Primary files:
  - `VerityPostKids/VerityPostKids/KidReaderView.swift`
  - `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
Calls these API routes: Supabase direct (articles); `/api/kids/quiz`, `/api/kids/quiz/[id]`
Tier: flagship
Estimated complexity: medium (4–10)
Discovery flags: none

---

### F-09 Sign-up (iOS Adult)
Platform: ios-adult
Route or entry point: `SignupView.swift` + `LoginView.swift`
Primary files:
  - `VerityPost/VerityPost/SignupView.swift`
  - `VerityPost/VerityPost/LoginView.swift`
  - `VerityPost/VerityPost/PickUsernameView.swift`
  - `VerityPost/VerityPost/WelcomeView.swift`
Calls these API routes: `/api/auth/signup`, `/api/auth/send-magic-link`, `/api/auth/verify-magic-code`, `/api/auth/check-username`, `/api/auth/save-username`
Tier: flagship
Estimated complexity: medium (4–10)
Discovery flags: kill-switched (intentional, see CLAUDE.md) — OAuth buttons in `SignupView` and `LoginView` gated by `VPOAuthEnabled = false`

---

## 3. Important Pages

### I-01 Profile / Settings Hub (Web)
Platform: web
Route or entry point: `/profile` (also `/profile/settings` alias)
Primary files:
  - `web/src/app/profile/page.tsx`
  - `web/src/app/profile/settings/page.tsx`
  - `web/src/app/profile/_components/ProfileApp.tsx`
  - `web/src/app/profile/_components/AppShell.tsx`
  - `web/src/app/profile/_components/PermsBoundary.tsx`
  - `web/src/app/profile/_sections/YouSection.tsx`
  - `web/src/app/profile/_sections/IdentitySection.tsx`
  - `web/src/app/profile/_sections/SecuritySection.tsx`
  - `web/src/app/profile/_sections/PlanSection.tsx`
  - `web/src/app/profile/_sections/NotificationsSection.tsx`
  - `web/src/app/profile/_sections/BookmarksSection.tsx`
  - `web/src/app/profile/_sections/MessagesSection.tsx`
  - `web/src/app/profile/_sections/ActivitySection.tsx`
  - `web/src/app/profile/_sections/MilestonesSection.tsx`
  - `web/src/app/profile/_sections/CategoriesSection.tsx`
  - `web/src/app/profile/_sections/AppearanceSection.tsx`
  - `web/src/app/profile/_sections/DataSection.tsx`
  - `web/src/app/profile/_sections/ExpertProfileSection.tsx`
  - `web/src/app/profile/_sections/ExpertQueueSection.tsx`
  - `web/src/app/profile/_sections/LinkOutSection.tsx`
  - `web/src/app/profile/_sections/PrivacySection.tsx`
  - `web/src/app/profile/_sections/SessionsSection.tsx`
  - `web/src/app/profile/_sections/BlockedSection.tsx`
  - `web/src/app/profile/_sections/SignOutSection.tsx`
  - `web/src/app/profile/_sections/PublicProfileSection.tsx`
Calls these API routes: `/api/profile`, `/api/account/*`, `/api/billing/*`, `/api/expert/apply`, `/api/users/blocked`, `/api/notifications/preferences`, `/api/bookmarks`, `/api/comments`, `/api/account/sessions`, `/api/account/login-activity`, Supabase direct for reads
Tier: important
Estimated complexity: large (11+)
Discovery flags: kill-switched (intentional, see CLAUDE.md) — share link in `PublicProfileSection.tsx:192` disabled pending `PUBLIC_PROFILE_ENABLED` flip

---

### I-02 Notifications Inbox (Web)
Platform: web
Route or entry point: `/notifications`
Primary files:
  - `web/src/app/notifications/page.tsx`
Calls these API routes: `/api/notifications`, `/api/notifications/[id]/read`, `/api/notifications/preferences`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-03 Search (Web)
Platform: web
Route or entry point: `/search`
Primary files:
  - `web/src/app/search/page.tsx`
Calls these API routes: `/api/search`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-04 Browse (Web)
Platform: web
Route or entry point: `/browse`
Primary files:
  - `web/src/app/browse/page.tsx`
Calls these API routes: Supabase direct (stories, articles, categories)
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-05 Bookmarks (Web)
Platform: web
Route or entry point: `/bookmarks`
Primary files:
  - `web/src/app/bookmarks/page.tsx`
Calls these API routes: `/api/bookmarks`, `/api/bookmarks/[id]`, `/api/bookmark-collections`, `/api/bookmarks/export`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-06 Messages / DMs (Web)
Platform: web
Route or entry point: `/messages`
Primary files:
  - `web/src/app/messages/page.tsx`
Calls these API routes: `/api/messages`, `/api/messages/search`, `/api/conversations`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-07 Leaderboard (Web)
Platform: web
Route or entry point: `/leaderboard`
Primary files:
  - `web/src/app/leaderboard/page.tsx`
Calls these API routes: Supabase direct (users leaderboard RPC, leaderboard_period_counts RPC)
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-08 Following / Followed Stories (Web)
Platform: web
Route or entry point: `/following`
Primary files:
  - `web/src/app/following/page.tsx`
Calls these API routes: Supabase direct (story_follows, stories, reading_log)
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-09 Pricing (Web)
Platform: web
Route or entry point: `/pricing`
Primary files:
  - `web/src/app/pricing/page.tsx`
  - `web/src/app/pricing/_CheckoutButton.tsx` (inferred from import)
Calls these API routes: `/api/stripe/checkout`
Tier: important
Estimated complexity: small (1–3)
Discovery flags: none

---

### I-10 Recap List + Quiz Player (Web)
Platform: web
Route or entry point: `/recap` and `/recap/[id]`
Primary files:
  - `web/src/app/recap/page.tsx`
  - `web/src/app/recap/[id]/page.tsx`
Calls these API routes: `/api/recap`, `/api/recap/[id]`, `/api/recap/[id]/submit`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-11 Kids Management — Family Hub (Web)
Platform: web
Route or entry point: `/profile/family`
Primary files:
  - `web/src/app/profile/family/page.tsx`
Calls these API routes: `/api/family/leaderboard`, `/api/family/weekly-report`, `/api/family/achievements`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-12 Kids Management — Kids List (Web)
Platform: web
Route or entry point: `/profile/kids`
Primary files:
  - `web/src/app/profile/kids/page.tsx`
Calls these API routes: `/api/kids`, `/api/kids/generate-pair-code`, `/api/kids/set-pin`, `/api/kids/reset-pin`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-13 Kid Detail Page (Web)
Platform: web
Route or entry point: `/profile/kids/[id]`
Primary files:
  - `web/src/app/profile/kids/[id]/page.tsx`
Calls these API routes: `/api/kids/[id]`, `/api/kids/[id]/dob-correction`, `/api/kids/[id]/advance-band`, `/api/kids/[id]/streak-freeze`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-14 Expert Apply (Web)
Platform: web
Route or entry point: `/profile/settings/expert`
Primary files:
  - `web/src/app/profile/settings/expert/page.tsx`
Calls these API routes: `/api/expert/apply`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-15 Subscription / Billing Settings (Web)
Platform: web
Route or entry point: `/profile/settings/billing` (redirects to `/profile?section=plan`)
Primary files:
  - `web/src/app/profile/settings/billing/page.tsx`
Calls these API routes: redirect only — `/api/stripe/checkout`, `/api/billing/cancel`, `/api/billing/change-plan` called from ProfileApp
Tier: important
Estimated complexity: small (1–3)
Discovery flags: Pure redirect shim; actual billing UI lives inside ProfileApp's PlanSection

---

### I-16 Public Profile by Username (Web)
Platform: web
Route or entry point: `/u/[username]`
Primary files:
  - `web/src/app/u/[username]/page.tsx`
Calls these API routes: Supabase direct (public_profiles_v); `/api/follows`, `/api/users/[id]/block`, `/api/reports`, `/api/messages`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: kill-switched (intentional, see CLAUDE.md) — `PUBLIC_PROFILE_ENABLED = true` at line 22 (note: this was flipped to true in the code, but CLAUDE.md still lists as kill-switched; verify current state)

---

### I-17 Profile (iOS Adult)
Platform: ios-adult
Route or entry point: `ProfileView.swift`
Primary files:
  - `VerityPost/VerityPost/ProfileView.swift`
Calls these API routes: Supabase direct (users, reading_log, user_achievements, category_scores); `/api/follows`, `/api/bookmarks`, `/api/messages`
Tier: important
Estimated complexity: large (11+)
Discovery flags: none

---

### I-18 Settings (iOS Adult)
Platform: ios-adult
Route or entry point: `SettingsView.swift`
Primary files:
  - `VerityPost/VerityPost/SettingsView.swift`
Calls these API routes: `/api/expert/apply`, `/api/account/delete`, `/api/support`, `/api/users/blocked`, Supabase GoTrue (email/password/MFA), `/api/referrals/me`, StoreKit restore
Tier: important
Estimated complexity: large (11+)
Discovery flags: none

---

### I-19 Alerts / Notifications (iOS Adult)
Platform: ios-adult
Route or entry point: `AlertsView.swift`
Primary files:
  - `VerityPost/VerityPost/AlertsView.swift`
Calls these API routes: `/api/notifications`, `/api/notifications/[id]/read`, `/api/alerts/subscriptions`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: kill-switched (intentional, see CLAUDE.md) — "Manage subscriptions" section gated by `manageSubscriptionsEnabled = false` at line 305

---

### I-20 Find / Search (iOS Adult)
Platform: ios-adult
Route or entry point: `FindView.swift`
Primary files:
  - `VerityPost/VerityPost/FindView.swift`
Calls these API routes: `/api/search`
Tier: important
Estimated complexity: small (1–3)
Discovery flags: none

---

### I-21 Bookmarks (iOS Adult)
Platform: ios-adult
Route or entry point: `BookmarksView.swift`
Primary files:
  - `VerityPost/VerityPost/BookmarksView.swift`
Calls these API routes: `/api/bookmarks`, `/api/bookmarks/[id]`, `/api/bookmark-collections`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-22 Messages / DMs (iOS Adult)
Platform: ios-adult
Route or entry point: `MessagesView.swift`
Primary files:
  - `VerityPost/VerityPost/MessagesView.swift`
Calls these API routes: Supabase direct (conversations, messages, conversation_participants); `/api/messages`, `/api/messages/search`
Tier: important
Estimated complexity: large (11+)
Discovery flags: none

---

### I-23 Subscription / In-App Purchase (iOS Adult)
Platform: ios-adult
Route or entry point: `SubscriptionView.swift`
Primary files:
  - `VerityPost/VerityPost/SubscriptionView.swift`
Calls these API routes: StoreKit (Apple); `/api/ios/subscriptions/sync`, `/api/promo/redeem`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-24 Family Dashboard (iOS Adult)
Platform: ios-adult
Route or entry point: `FamilyViews.swift` (FamilyDashboardView)
Primary files:
  - `VerityPost/VerityPost/FamilyViews.swift`
Calls these API routes: `/api/kids`, `/api/kids/generate-pair-code`, `/api/kids/set-pin`, `/api/kids/reset-pin`, `/api/family/leaderboard`, `/api/family/weekly-report`, `/api/family/achievements`
Tier: important
Estimated complexity: large (11+)
Discovery flags: none

---

### I-25 Kids Profile (iOS Kids)
Platform: ios-kids
Route or entry point: `ProfileView.swift`
Primary files:
  - `VerityPostKids/VerityPostKids/ProfileView.swift`
Calls these API routes: Supabase direct (kid_profiles, user_achievements); `/api/supervisor/opt-out`
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

### I-26 Kids Leaderboard (iOS Kids)
Platform: ios-kids
Route or entry point: `LeaderboardView.swift`
Primary files:
  - `VerityPostKids/VerityPostKids/LeaderboardView.swift`
Calls these API routes: `/api/kids/global-leaderboard`, `/api/family/leaderboard`, Supabase direct
Tier: important
Estimated complexity: medium (4–10)
Discovery flags: none

---

## 4. Secondary Pages

### S-01 Expert Queue (Web)
Platform: web
Route or entry point: `/expert-queue`
Primary files:
  - `web/src/app/expert-queue/page.tsx`
Calls these API routes: `/api/expert/queue`, `/api/expert/queue/[id]/claim`, `/api/expert/queue/[id]/answer`, `/api/expert/queue/[id]/decline`, `/api/expert/back-channel`, `/api/expert/vacation`
Tier: secondary
Estimated complexity: large (11+)
Discovery flags: none

---

### S-02 Recap (iOS Adult)
Platform: ios-adult
Route or entry point: `RecapView.swift` (RecapListView + RecapQuizView)
Primary files:
  - `VerityPost/VerityPost/RecapView.swift`
Calls these API routes: `/api/recap`, `/api/recap/[id]`, `/api/recap/[id]/submit`
Tier: secondary
Estimated complexity: medium (4–10)
Discovery flags: none

---

### S-03 Leaderboard (iOS Adult)
Platform: ios-adult
Route or entry point: `LeaderboardView.swift`
Primary files:
  - `VerityPost/VerityPost/LeaderboardView.swift`
Calls these API routes: Supabase direct (users, leaderboard_period_counts RPC)
Tier: secondary
Estimated complexity: medium (4–10)
Discovery flags: none

---

### S-04 Following / Followed Stories (iOS Adult)
Platform: ios-adult
Route or entry point: `FollowingView.swift`
Primary files:
  - `VerityPost/VerityPost/FollowingView.swift`
Calls these API routes: Supabase direct (story_follows, stories, reading_log)
Tier: secondary
Estimated complexity: medium (4–10)
Discovery flags: none

---

### S-05 Public Profile View (iOS Adult)
Platform: ios-adult
Route or entry point: `PublicProfileView.swift`
Primary files:
  - `VerityPost/VerityPost/PublicProfileView.swift`
Calls these API routes: Supabase direct (public_profiles_v); `/api/follows`, `/api/users/[id]/block`
Tier: secondary
Estimated complexity: medium (4–10)
Discovery flags: none

---

### S-06 Expert Queue (iOS Adult)
Platform: ios-adult
Route or entry point: `ExpertQueueView.swift`
Primary files:
  - `VerityPost/VerityPost/ExpertQueueView.swift`
Calls these API routes: Supabase direct (expert_discussions); `/api/expert/queue/[id]/claim`, `/api/expert/queue/[id]/answer`, `/api/expert/queue/[id]/decline`
Tier: secondary
Estimated complexity: medium (4–10)
Discovery flags: none

---

### S-07 Invite Friends (iOS Adult)
Platform: ios-adult
Route or entry point: `InviteFriendsView.swift`
Primary files:
  - `VerityPost/VerityPost/InviteFriendsView.swift`
Calls these API routes: `/api/referrals/me`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-08 Email Verification (iOS Adult)
Platform: ios-adult
Route or entry point: `VerifyEmailView.swift`
Primary files:
  - `VerityPost/VerityPost/VerifyEmailView.swift`
Calls these API routes: `/api/auth/resend-verification`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-09 Onboarding / Welcome (iOS Adult)
Platform: ios-adult
Route or entry point: `WelcomeView.swift`
Primary files:
  - `VerityPost/VerityPost/WelcomeView.swift`
Calls these API routes: Supabase GoTrue (update_user metadata); `/api/account/onboarding`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-10 Pick Username (iOS Adult)
Platform: ios-adult
Route or entry point: `PickUsernameView.swift`
Primary files:
  - `VerityPost/VerityPost/PickUsernameView.swift`
Calls these API routes: `/api/auth/check-username`, `/api/auth/save-username`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-11 Forgot Password (iOS Adult)
Platform: ios-adult
Route or entry point: `ForgotPasswordView.swift`
Primary files:
  - `VerityPost/VerityPost/ForgotPasswordView.swift`
Calls these API routes: Supabase GoTrue (resetPasswordForEmail)
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-12 Reset Password (iOS Adult)
Platform: ios-adult
Route or entry point: `ResetPasswordView.swift`
Primary files:
  - `VerityPost/VerityPost/ResetPasswordView.swift`
Calls these API routes: Supabase GoTrue (updatePassword)
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-13 Kids Expert Sessions (iOS Kids)
Platform: ios-kids
Route or entry point: `ExpertSessionsView.swift`
Primary files:
  - `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
Calls these API routes: Supabase direct (kid_expert_sessions)
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-14 Category Page (Web)
Platform: web
Route or entry point: `/category/[id]`
Primary files:
  - `web/src/app/category/[id]/page.js`
Calls these API routes: Supabase direct (categories, stories, articles, subcategories)
Tier: secondary
Estimated complexity: medium (4–10)
Discovery flags: none

---

### S-15 Appeal (Web)
Platform: web
Route or entry point: `/appeal`
Primary files:
  - `web/src/app/appeal/page.tsx`
Calls these API routes: Supabase direct (user_warnings); `/api/appeals`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-16 Public Profile by Numeric ID (Web)
Platform: web
Route or entry point: `/profile/[id]`
Primary files:
  - `web/src/app/profile/[id]/page.tsx`
Calls these API routes: Supabase direct (public_profiles_v); redirects to `/u/[username]`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: kill-switched (intentional, see CLAUDE.md) — `PUBLIC_PROFILE_ENABLED` gate; currently acts as a redirect shim to `/u/[username]`

---

### S-17 Profile Card (Web)
Platform: web
Route or entry point: `/card/[username]`
Primary files:
  - `web/src/app/card/[username]/page.js`
Calls these API routes: Supabase direct (public_profiles_v, users)
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-18 My Card (Web)
Platform: web
Route or entry point: `/profile/card`
Primary files:
  - `web/src/app/profile/card/page.js`
Calls these API routes: Supabase direct; paid-tier gate client-side
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-19 Profile — Category Drill-in (Web)
Platform: web
Route or entry point: `/profile/category/[id]`
Primary files:
  - `web/src/app/profile/category/[id]/page.js`
Calls these API routes: Supabase direct (reading_log, quiz_attempts, comments, categories)
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-20 Profile Contact / Support (Web)
Platform: web
Route or entry point: `/profile/contact`
Primary files:
  - `web/src/app/profile/contact/page.js`
Calls these API routes: `/api/support`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

### S-21 Welcome / Kids Graduation Claim (Web)
Platform: web
Route or entry point: `/welcome`
Primary files:
  - `web/src/app/welcome/page.tsx`
Calls these API routes: `/api/auth/graduate-kid/claim`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: Onboarding carousel retired; page now exists only as graduation-token deep-link handler. Non-token visits redirect to `/`. Verify the graduation claim flow end-to-end.

---

### S-22 Kids App Marketing Landing (Web)
Platform: web
Route or entry point: `/kids-app`
Primary files:
  - `web/src/app/kids-app/page.tsx`
Calls these API routes: `/api/kids-waitlist`
Tier: secondary
Estimated complexity: small (1–3)
Discovery flags: none

---

## 5. Admin Pages

### A-01 Admin Hub / Dashboard
Platform: web
Route or entry point: `/admin`
Primary files:
  - `web/src/app/admin/page.tsx`
Calls these API routes: Supabase direct (client-side role check)
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: none

---

### A-02 Admin — Newsroom (Discovery + Articles)
Platform: web
Route or entry point: `/admin/newsroom`
Primary files:
  - `web/src/app/admin/newsroom/page.tsx`
  - `web/src/app/admin/newsroom/_components/ArticlesTable.tsx`
  - `web/src/app/admin/newsroom/_components/StoryCard.tsx`
  - `web/src/app/admin/newsroom/_components/SourcesBlock.tsx`
  - `web/src/app/admin/newsroom/_components/AudienceCard.tsx`
  - `web/src/app/admin/newsroom/_subpages/Runs.tsx`
  - `web/src/app/admin/newsroom/_subpages/Costs.tsx`
  - `web/src/app/admin/newsroom/_subpages/Cleanup.tsx`
Calls these API routes: `/api/admin/newsroom/clusters/*`, `/api/admin/articles/*`, `/api/admin/pipeline/generate`, `/api/admin/pipeline/runs`, `/api/admin/pipeline/cleanup`, `/api/admin/pipeline/costs`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-03 Admin — Newsroom Cluster Detail (redirect)
Platform: web
Route or entry point: `/admin/newsroom/clusters/[id]`
Primary files:
  - `web/src/app/admin/newsroom/clusters/[id]/page.tsx`
Calls these API routes: none (redirect to `/admin/newsroom?cluster=:id`)
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: Redirect stub — the detail UI was merged into the Newsroom workspace. No standalone cluster detail page exists.

---

### A-04 Admin — Pipeline Config (Kill Switches, Prompts, Categories, Thresholds)
Platform: web
Route or entry point: `/admin/pipeline-config`
Primary files:
  - `web/src/app/admin/pipeline-config/page.tsx`
  - `web/src/app/admin/pipeline-config/_tabs/KillSwitchesTab.tsx`
  - `web/src/app/admin/pipeline-config/_tabs/PromptsTab.tsx`
  - `web/src/app/admin/pipeline-config/_tabs/CategoriesTab.tsx`
  - `web/src/app/admin/pipeline-config/_tabs/ThresholdsTab.tsx`
Calls these API routes: `/api/admin/settings/*`, `/api/admin/prompt-presets/*`, `/api/admin/categories/*`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: Consolidates three legacy pages (`/admin/pipeline/settings`, `/admin/prompt-presets`, `/admin/categories`); those legacy routes may redirect here

---

### A-05 Admin — Pipeline Runs List
Platform: web
Route or entry point: `/admin/pipeline/runs`
Primary files:
  - `web/src/app/admin/pipeline/runs/page.tsx`
Calls these API routes: Supabase direct (pipeline_runs)
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-06 Admin — Pipeline Run Detail
Platform: web
Route or entry point: `/admin/pipeline/runs/[id]`
Primary files:
  - `web/src/app/admin/pipeline/runs/[id]/page.tsx`
Calls these API routes: `/api/admin/pipeline/runs/[id]`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-07 Admin — Pipeline Costs
Platform: web
Route or entry point: `/admin/pipeline/costs`
Primary files:
  - `web/src/app/admin/pipeline/costs/page.tsx`
Calls these API routes: Supabase direct (pipeline_costs, pipeline_runs, pipeline_today_cost_usd RPC)
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-08 Admin — Pipeline Cleanup
Platform: web
Route or entry point: `/admin/pipeline/cleanup`
Primary files:
  - `web/src/app/admin/pipeline/cleanup/page.tsx`
Calls these API routes: `/api/admin/pipeline/cleanup`
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: none

---

### A-09 Admin — Pipeline Settings (legacy tab — may redirect)
Platform: web
Route or entry point: `/admin/pipeline/settings`
Primary files:
  - `web/src/app/admin/pipeline/settings/page.tsx`
Calls these API routes: `/api/admin/settings/*`, Supabase direct (categories)
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: Appears to be partially superseded by `/admin/pipeline-config`; both exist and may overlap

---

### A-10 Admin — Users List
Platform: web
Route or entry point: `/admin/users`
Primary files:
  - `web/src/app/admin/users/page.tsx`
Calls these API routes: Supabase direct (users), `/api/admin/users/[id]/ban`, `/api/admin/users/[id]/role-set`, `/api/admin/users/[id]/plan`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-11 Admin — User Detail (Dossier)
Platform: web
Route or entry point: `/admin/users/[id]`
Primary files:
  - `web/src/app/admin/users/[id]/page.tsx`
  - `web/src/app/admin/users/[id]/_sections/TrialOverrideCard.tsx`
Calls these API routes: Supabase direct (users, kid_profiles, user_push_tokens, admin_audit_log, user_warnings); `/api/admin/users/[id]/*`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-12 Admin — User Permissions Console
Platform: web
Route or entry point: `/admin/users/[id]/permissions`
Primary files:
  - `web/src/app/admin/users/[id]/permissions/page.tsx`
Calls these API routes: `compute_effective_perms` RPC, `/api/admin/users/[id]/permissions`, `/api/admin/permission-sets`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-13 Admin — Permissions Registry (Sets, Role/Plan Wiring)
Platform: web
Route or entry point: `/admin/permissions`
Primary files:
  - `web/src/app/admin/permissions/page.tsx`
Calls these API routes: Supabase direct (permissions, permission_sets, permission_set_perms, role_permission_sets, plan_permission_sets, user_permission_sets); `/api/admin/permissions/*`, `/api/admin/permission-sets/*`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-14 Admin — Moderation (Comments, Reports, Users)
Platform: web
Route or entry point: `/admin/moderation`
Primary files:
  - `web/src/app/admin/moderation/page.tsx`
Calls these API routes: `/api/admin/moderation/comments/*`, `/api/admin/moderation/reports/*`, `/api/admin/moderation/users/*`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-15 Admin — Story Manager (adult articles)
Platform: web
Route or entry point: `/admin/story-manager`
Primary files:
  - `web/src/app/admin/story-manager/page.tsx`
  - `web/src/components/article/StoryEditor.tsx`
Calls these API routes: `/api/admin/articles/*`, `/api/admin/articles/save`, `/api/admin/articles/new-draft`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-16 Admin — Kids Story Manager
Platform: web
Route or entry point: `/admin/kids-story-manager`
Primary files:
  - `web/src/app/admin/kids-story-manager/page.tsx`
  - `web/src/components/article/KidsStoryEditor.tsx`
Calls these API routes: `/api/admin/articles/*`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-17 Admin — Analytics
Platform: web
Route or entry point: `/admin/analytics`
Primary files:
  - `web/src/app/admin/analytics/page.tsx`
Calls these API routes: Supabase direct (articles, reading_log, quiz_attempts, users)
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-18 Admin — Subscriptions
Platform: web
Route or entry point: `/admin/subscriptions`
Primary files:
  - `web/src/app/admin/subscriptions/page.tsx`
Calls these API routes: Supabase direct (subscriptions, users); `/api/admin/subscriptions/[id]/*`, `/api/admin/billing/*`
Tier: admin
Estimated complexity: large (11+)
Discovery flags: none

---

### A-19 Admin — Plans + Plan Features
Platform: web
Route or entry point: `/admin/plans`
Primary files:
  - `web/src/app/admin/plans/page.tsx`
Calls these API routes: Supabase direct (plans, plan_features); `/api/admin/plans/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-20 Admin — Reader Settings
Platform: web
Route or entry point: `/admin/reader`
Primary files:
  - `web/src/app/admin/reader/page.tsx`
Calls these API routes: `/api/admin/settings/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-21 Admin — Recap Manager
Platform: web
Route or entry point: `/admin/recap`
Primary files:
  - `web/src/app/admin/recap/page.tsx`
Calls these API routes: Supabase direct (weekly_recap_quizzes); `/api/admin/recap/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-22 Admin — Expert Sessions
Platform: web
Route or entry point: `/admin/expert-sessions`
Primary files:
  - `web/src/app/admin/expert-sessions/page.tsx`
Calls these API routes: Supabase direct (kid_expert_sessions); `/api/admin/expert-sessions/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-23 Admin — Verification Queue (Expert Applications)
Platform: web
Route or entry point: `/admin/verification`
Primary files:
  - `web/src/app/admin/verification/page.tsx`
Calls these API routes: Supabase direct (expert_applications); `/api/admin/expert/applications/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-24 Admin — Comments Management
Platform: web
Route or entry point: `/admin/comments`
Primary files:
  - `web/src/app/admin/comments/page.tsx`
Calls these API routes: Supabase direct (comments); `/api/admin/moderation/comments/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-25 Admin — Reports Queue
Platform: web
Route or entry point: `/admin/reports`
Primary files:
  - `web/src/app/admin/reports/page.tsx`
Calls these API routes: Supabase direct (moderation_reports); `/api/admin/moderation/reports/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-26 Admin — Breaking News Management
Platform: web
Route or entry point: `/admin/breaking`
Primary files:
  - `web/src/app/admin/breaking/page.tsx`
Calls these API routes: Supabase direct (articles); `/api/admin/broadcasts/breaking`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-27 Admin — Top Stories Pinning
Platform: web
Route or entry point: `/admin/top-stories`
Primary files:
  - `web/src/app/admin/top-stories/page.tsx`
Calls these API routes: Supabase direct (top_stories, articles)
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: none

---

### A-28 Admin — Access Codes + Request Queue
Platform: web
Route or entry point: `/admin/access`
Primary files:
  - `web/src/app/admin/access/page.tsx`
Calls these API routes: Supabase direct (access_codes); `/api/admin/access-requests/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-29 Admin — Access Requests (bulk queue)
Platform: web
Route or entry point: `/admin/access-requests`
Primary files:
  - `web/src/app/admin/access-requests/page.tsx`
Calls these API routes: `/api/admin/access-requests`, `/api/admin/access-requests/bulk-approve`, `/api/admin/access-requests/[id]/approve`, `/api/admin/access-requests/[id]/reject`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-30 Admin — Feeds (RSS Sources)
Platform: web
Route or entry point: `/admin/feeds`
Primary files:
  - `web/src/app/admin/feeds/page.tsx`
Calls these API routes: Supabase direct (feeds); `/api/admin/feeds/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-31 Admin — Promo Codes
Platform: web
Route or entry point: `/admin/promo`
Primary files:
  - `web/src/app/admin/promo/page.tsx`
Calls these API routes: Supabase direct (promo_codes); `/api/admin/promo/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-32 Admin — Referrals
Platform: web
Route or entry point: `/admin/referrals`
Primary files:
  - `web/src/app/admin/referrals/page.tsx`
Calls these API routes: Supabase direct (access_codes, referral_events); `/api/admin/referrals/mint`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-33 Admin — Notifications Broadcast
Platform: web
Route or entry point: `/admin/notifications`
Primary files:
  - `web/src/app/admin/notifications/page.tsx`
Calls these API routes: `/api/admin/notifications/broadcast`, `/api/admin/broadcasts/alert`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-34 Admin — Cohorts
Platform: web
Route or entry point: `/admin/cohorts`
Primary files:
  - `web/src/app/admin/cohorts/page.tsx`
Calls these API routes: Supabase direct (cohorts, cohort_members)
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-35 Admin — Streaks Config
Platform: web
Route or entry point: `/admin/streaks`
Primary files:
  - `web/src/app/admin/streaks/page.tsx`
Calls these API routes: `/api/admin/settings/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-36 Admin — Word Lists (Reserved Usernames, Blocked Words)
Platform: web
Route or entry point: `/admin/words`
Primary files:
  - `web/src/app/admin/words/page.tsx`
Calls these API routes: Supabase direct (reserved_usernames, blocked_words)
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: none

---

### A-37 Admin — Webhooks
Platform: web
Route or entry point: `/admin/webhooks`
Primary files:
  - `web/src/app/admin/webhooks/page.tsx`
Calls these API routes: Supabase direct (webhook_log, webhooks)
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: none

---

### A-38 Admin — System (Settings)
Platform: web
Route or entry point: `/admin/settings`
Primary files:
  - `web/src/app/admin/settings/page.tsx`
Calls these API routes: `/api/admin/settings/upsert`, `/api/admin/settings/invalidate`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-39 Admin — Auth Recovery
Platform: web
Route or entry point: `/admin/auth-recovery`
Primary files:
  - `web/src/app/admin/auth-recovery/page.tsx`
Calls these API routes: `/api/admin/auth-recovery/[user_id]`
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: none

---

### A-40 Admin — Email Templates
Platform: web
Route or entry point: `/admin/email-templates`
Primary files:
  - `web/src/app/admin/email-templates/page.tsx`
Calls these API routes: Supabase direct (email_templates); `/api/admin/email-templates/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-41 Admin — Support Queue
Platform: web
Route or entry point: `/admin/support`
Primary files:
  - `web/src/app/admin/support/page.tsx`
Calls these API routes: Supabase direct (support_tickets, messages); `/api/admin` (support sub-routes)
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-42 Admin — Data Requests (GDPR/CCPA)
Platform: web
Route or entry point: `/admin/data-requests`
Primary files:
  - `web/src/app/admin/data-requests/page.tsx`
Calls these API routes: Supabase direct (data_requests); `/api/admin/data-requests/[id]/approve`, `/api/admin/data-requests/[id]/reject`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-43 Admin — Ad Campaigns
Platform: web
Route or entry point: `/admin/ad-campaigns`
Primary files:
  - `web/src/app/admin/ad-campaigns/page.tsx`
Calls these API routes: Supabase direct (ad_campaigns); `/api/admin/ad-campaigns/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-44 Admin — Ad Placements
Platform: web
Route or entry point: `/admin/ad-placements`
Primary files:
  - `web/src/app/admin/ad-placements/page.tsx`
Calls these API routes: Supabase direct (ad_placements); `/api/admin/ad-placements/*`, `/api/admin/ad-units/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-45 Admin — Sponsors
Platform: web
Route or entry point: `/admin/sponsors`
Primary files:
  - `web/src/app/admin/sponsors/page.tsx`
Calls these API routes: Supabase direct (sponsors); `/api/admin/sponsors/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-46 Admin — Features (Feature Flags)
Platform: web
Route or entry point: `/admin/features`
Primary files:
  - `web/src/app/admin/features/page.tsx`
Calls these API routes: Supabase direct (feature_flags); `/api/admin/features/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

### A-47 Admin — Kids DOB Corrections Queue
Platform: web
Route or entry point: `/admin/kids-dob-corrections`
Primary files:
  - `web/src/app/admin/kids-dob-corrections/page.tsx`
Calls these API routes: `/api/admin/kids-dob-corrections`
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: none

---

### A-48 Admin — Kids DOB Correction Detail
Platform: web
Route or entry point: `/admin/kids-dob-corrections/[id]`
Primary files:
  - `web/src/app/admin/kids-dob-corrections/[id]/page.tsx`
Calls these API routes: `/api/admin/kids-dob-corrections/[id]`
Tier: admin
Estimated complexity: small (1–3)
Discovery flags: none

---

### A-49 Admin — Prompt Presets
Platform: web
Route or entry point: `/admin/prompt-presets`
Primary files:
  - `web/src/app/admin/prompt-presets/page.tsx`
Calls these API routes: `/api/admin/prompt-presets/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: Partially superseded by `/admin/pipeline-config?tab=prompts`; check whether this legacy page redirects or still renders independently

---

### A-50 Admin — Categories Tree
Platform: web
Route or entry point: `/admin/categories`
Primary files:
  - `web/src/app/admin/categories/page.tsx`
Calls these API routes: Supabase direct (categories); `/api/admin/categories/*`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: Partially superseded by `/admin/pipeline-config?tab=categories`; check whether this legacy page redirects or still renders independently

---

### A-51 Admin — System Info / Health
Platform: web
Route or entry point: `/admin/system`
Primary files:
  - `web/src/app/admin/system/page.tsx`
Calls these API routes: Supabase direct (system health tables); `/api/admin/rate-limits`
Tier: admin
Estimated complexity: medium (4–10)
Discovery flags: none

---

## 6. Static Pages

### ST-01 About
Platform: web
Route or entry point: `/about`
Primary files:
  - `web/src/app/about/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-02 Privacy Policy
Platform: web
Route or entry point: `/privacy`
Primary files:
  - `web/src/app/privacy/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-03 Kids Privacy Notice
Platform: web
Route or entry point: `/privacy/kids`
Primary files:
  - `web/src/app/privacy/kids/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-04 Terms of Service
Platform: web
Route or entry point: `/terms`
Primary files:
  - `web/src/app/terms/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-05 Editorial Standards
Platform: web
Route or entry point: `/editorial-standards`
Primary files:
  - `web/src/app/editorial-standards/page.tsx`
Calls these API routes: none (static editorial copy)
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-06 Corrections Register
Platform: web
Route or entry point: `/corrections`
Primary files:
  - `web/src/app/corrections/page.tsx`
Calls these API routes: Supabase service client (articles with retraction fields) — server-rendered
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-07 Contact (public, no auth)
Platform: web
Route or entry point: `/contact`
Primary files:
  - `web/src/app/contact/page.tsx`
Calls these API routes: `/api/support/public`
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-08 Help / Support URL
Platform: web
Route or entry point: `/help`
Primary files:
  - `web/src/app/help/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-09 How It Works
Platform: web
Route or entry point: `/how-it-works`
Primary files:
  - `web/src/app/how-it-works/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-10 Accessibility
Platform: web
Route or entry point: `/accessibility`
Primary files:
  - `web/src/app/accessibility/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-11 Cookie Policy
Platform: web
Route or entry point: `/cookies`
Primary files:
  - `web/src/app/cookies/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

### ST-12 DMCA Policy
Platform: web
Route or entry point: `/dmca`
Primary files:
  - `web/src/app/dmca/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: DMCA designated agent registration pending (TODO comment in file)

---

### ST-13 Beta Locked (Closed Beta Holding)
Platform: web
Route or entry point: `/beta-locked`
Primary files:
  - `web/src/app/beta-locked/page.tsx`
Calls these API routes: none
Tier: static
Estimated complexity: small (1–3)
Discovery flags: none

---

## Redirect / Route-only Entries (not full review targets)

The following routes render no UI of their own — they are pure server-side redirects or route handlers. They are listed here for completeness but should not consume a full 6-agent review slot.

| Route | Destination / Purpose |
|-------|-----------------------|
| `/billing` | → `/profile/settings#billing` |
| `/signup` | → `/login` |
| `/story/[slug]` | → `/<slug>` (legacy permalink compat) |
| `/request-access` | → `/login?mode=request` |
| `/methodology` | → `/editorial-standards#methodology` |
| `/r/[slug]` | Referral cookie setter → `/login?mode=create` (API route, not a page) |
| `/preview` | Preview bypass token setter (API route) |
| `/logout` | Client-side sign-out redirect |
| `/admin/newsroom/clusters/[id]` | → `/admin/newsroom?cluster=:id` |
| `/profile/settings/billing` | → `/profile?section=plan` |

---

## 7. Discovery Flags Summary

Every page entry that has a Discovery flag:

| Page | Flag |
|------|------|
| **F-03** `/login` | kill-switched (intentional, see CLAUDE.md) — OAuth buttons gated by `OAUTH_ENABLED = false` in `_SingleDoorForm.tsx:9` |
| **F-09** iOS Adult login/signup | kill-switched (intentional, see CLAUDE.md) — OAuth buttons gated by `VPOAuthEnabled = false` in `SignupView.swift` and `LoginView.swift` |
| **I-01** `/profile` | kill-switched (intentional, see CLAUDE.md) — share link in `PublicProfileSection.tsx:192` disabled; re-enables with `PUBLIC_PROFILE_ENABLED` flip |
| **I-16** `/u/[username]` | `PUBLIC_PROFILE_ENABLED = true` at line 22 — page is currently live (kill-switch has been flipped on); CLAUDE.md entry predates this flip. Verify no regression in `notFound()` branch for `profile_visibility = private` |
| **I-19** iOS AlertsView | kill-switched (intentional, see CLAUDE.md) — "Manage subscriptions" tab gated by `manageSubscriptionsEnabled = false` at `AlertsView.swift:305` |
| **S-16** `/profile/[id]` | kill-switched (intentional, see CLAUDE.md) — redirect shim to `/u/[username]`; no UI of its own until `PUBLIC_PROFILE_ENABLED` flips |
| **S-21** `/welcome` | Onboarding carousel retired; page exists only for graduation-token deep-links; non-token visitors are bounced to `/` — confirm graduation claim flow end-to-end |
| **A-03** `/admin/newsroom/clusters/[id]` | Stub redirect — cluster detail merged into Newsroom workspace; no standalone detail page |
| **A-04** `/admin/pipeline-config` | Consolidation page supersedes `/admin/pipeline/settings`, `/admin/prompt-presets`, `/admin/categories`; legacy routes may overlap |
| **A-09** `/admin/pipeline/settings` | Appears partially superseded by `/admin/pipeline-config`; check for redirect or overlap |
| **A-49** `/admin/prompt-presets` | Partially superseded by `/admin/pipeline-config?tab=prompts`; check redirect vs independent render |
| **A-50** `/admin/categories` | Partially superseded by `/admin/pipeline-config?tab=categories`; check redirect vs independent render |
| **All /ideas/* routes** | kill-switched (intentional, see CLAUDE.md) — NOTE: middleware currently passes through `/ideas/*` without enforcing an admin gate (`ideas/page.tsx` comment: "Until S3 lands the matcher, anyone with the URL still reaches these pages"); the admin gate described in CLAUDE.md is not yet implemented in middleware; routes are accessible to anyone with the URL |
| **`/mockup-explore`** | Has `page.tsx` (confirmed); appears to be an internal design mockup surface (uses inline sample data, same pattern as `/ideas`); not linked from any nav; no middleware gate found — effectively public if someone has the URL; not included in the main worklist as it is a design scratch surface |
| **`/beta-locked`** | Closed-beta holding page; still active during beta; review chrome only |
