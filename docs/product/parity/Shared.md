# Shared — Pages on Both App & Site

These screens exist in both VP App (iOS) and VP Site (web). For the live Swift source, open files under `VerityPost/VerityPost/` directly in Xcode — this directory no longer keeps local copies.

## Page Mapping

| Screen | Site URL (localhost:3333) | App Swift File |
|--------|--------------------------|----------------|
| Home / Feed | [/](http://localhost:3333/) | HomeView.swift |
| Welcome / Onboarding | [/welcome](http://localhost:3333/welcome) | WelcomeView.swift |
| Login | [/login](http://localhost:3333/login) | LoginView.swift |
| Sign Up | [/signup](http://localhost:3333/signup) | SignupView.swift |
| Forgot Password | [/forgot-password](http://localhost:3333/forgot-password) | ForgotPasswordView.swift |
| Reset Password | [/reset-password](http://localhost:3333/reset-password) | ResetPasswordView.swift |
| Verify Email | [/verify-email](http://localhost:3333/verify-email) | VerifyEmailView.swift |
| Article Detail | [/story/{slug}](http://localhost:3333/story/example) | StoryDetailView.swift |
| Leaderboard | [/leaderboard](http://localhost:3333/leaderboard) | LeaderboardView.swift |
| Profile (self) | [/profile](http://localhost:3333/profile) | ProfileView.swift |
| Public Profile | [/u/{username}](http://localhost:3333/u/example) | PublicProfileView.swift |
| Bookmarks | [/bookmarks](http://localhost:3333/bookmarks) | BookmarksView.swift |
| Messages (DM) | [/messages](http://localhost:3333/messages) | MessagesView.swift |
| Alerts / Notifications | [/notifications](http://localhost:3333/notifications) | AlertsView.swift |
| Settings | [/profile/settings](http://localhost:3333/profile/settings) | SettingsView.swift |
| Subscription | [/profile/settings/billing](http://localhost:3333/profile/settings/billing) | SubscriptionView.swift |
| Weekly Recap | [/recap](http://localhost:3333/recap) | RecapView.swift |
| Expert Queue | [/expert-queue](http://localhost:3333/expert-queue) | ExpertQueueView.swift |
| Kids Mode (Home) | [/kids](http://localhost:3333/kids) | KidViews.swift |
| Family Dashboard | [/profile/family](http://localhost:3333/profile/family) | FamilyViews.swift |
| Per-Kid Dashboard | [/profile/kids/{id}](http://localhost:3333/profile/kids/1) | FamilyViews.swift |

## Notes

- The iOS kid mode uses a 3-tab bar (Home / Leaderboard / Profile) inside `KidViews.swift`. On web those tabs are three separate routes: `/kids`, `/kids/leaderboard`, `/kids/profile`. Behaviourally identical; listed under Site Only for route-inventory purposes.
- Swift source of truth lives at `VerityPost/VerityPost/`. Earlier versions of this README shipped a `Shared/app/` folder with local copies of the SwiftUI files — that folder has been removed to prevent drift. Review the real Swift files in Xcode instead.
