# iOS Bug-Sweep — Session Log

Append-only chronological log. Most recent at the bottom. Each entry: date, session, what happened, what got locked, what's blocked, what next session should pick up.

---

## Session 0 — (not yet run) — Founding

**Phase entering:** 0 (no artifacts).
**Phase leaving:** 0 (program founded; no slice started).

**What happened.** Program structure created based on:
- Full Swift file listing for `VerityPost/` (44 files) and `VerityPostKids/` (23 files, excluding build artifacts)
- Known issues and fixed regressions from `Conversations/site-bug-sweep/` and `Conversations/article-lifecycle/`
- Same discipline as `site-bug-sweep`: investigation-first, FK hint rule, 6-agent ship pattern, adversarial review per slice, push at end of every session

**Slice design.** 13 slices across two apps:

Main iOS (9 slices):
1. Auth & session — LoginView, SignupView, VerifyEmailView, ForgotPasswordView, ResetPasswordView, PickUsernameView, WelcomeView, AuthViewModel, Keychain, VerityPostApp lifecycle
2. Navigation shell & home feed — ContentView (tab bar), HomeView, HomeFeedSlots
3. Article reading & event tracking — StoryDetailView (primary surface), EventsClient, TTSPlayer
4. Discovery — FindView, LeaderboardView, FollowingView, LeaderboardPeriod
5. Social & engagement — BookmarksView, ExpertQueueView, RecapView, PublicProfileView, InviteFriendsView
6. Messaging & realtime — MessagesView, RealtimeHelpers
7. Profile, settings & push — ProfileView, SettingsView, SettingsService, AlertsView, PushPermission, PushPromptSheet, PushRegistration
8. Billing & subscription — SubscriptionView, StoreManager
9. Family & kids bridge — FamilyViews, KidsAppLauncher, PermissionService

Kids iOS (4 slices):
10. Kids auth & pairing — KidsAuth, PairCodeView, PairingClient, KidsAppRoot, KidsAppState
11. Kids home & article reading — ArticleListView, KidReaderView, TabBar
12. Kids quiz & gamification — KidQuizEngineView, BadgeUnlockScene, QuizPassScene, StreakScene, GreetingScene, CountUpText, FlameShape, ParticleSystem
13. Kids profile & parental controls — ProfileView (kids), LeaderboardView (kids), ExpertSessionsView, ParentalGateModal, KidPrimitives

**Rationale for ordering:** Main app before kids. Within main app, auth first (gates everything), then primary content surfaces (home, article reading), then secondary surfaces, then infrastructure (billing, family bridge). Kids last because it depends on parent-app pairing being understood first.

**No bug investigations or code changes made.** Session 0 is mapping only.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 01 — Auth & session. Read `AuthViewModel.swift`, `LoginView.swift`, `SignupView.swift`, `VerifyEmailView.swift`, `ForgotPasswordView.swift`, `ResetPasswordView.swift`, `PickUsernameView.swift`, `WelcomeView.swift`, `Keychain.swift`, `VerityPostApp.swift`. Cover: cold-launch session restore, OTP flow (8-digit), PKCE callback, Keychain race conditions, logout cleanup (push token deregistration, state wipe), error states on every async auth action.
