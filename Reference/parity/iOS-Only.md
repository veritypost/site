# iOS-Only — iOS-Exclusive Files

These files only exist in the iOS app (no web equivalent). Open them in Xcode under `VerityPost/VerityPost/` — that's the source of truth for live Swift.

## App entry and routing

| File | Purpose |
|------|---------|
| VerityPostApp.swift | App entry (WindowGroup). Bridges UIApplicationDelegate for APNs. |
| ContentView.swift | Root view — splash, auth-state routing, main tab container, kid-mode switch. |

## Services

| File | Purpose |
|------|---------|
| AuthViewModel.swift | Auth state + session management + kid-mode active-child tracking. |
| SupabaseManager.swift | Supabase client singleton + `siteURL` resolution. |
| SettingsService.swift | In-app app-settings cache (60-second TTL). |
| StoreManager.swift | StoreKit 2 purchase handling (8 subscription product IDs per D42). |
| Keychain.swift | Secure credential storage. |
| Models.swift | Core data structs: VPUser, Story, Quiz, KidProfile, etc. |
| Theme.swift | Color palette + shared SwiftUI components (AvatarView, VerifiedBadgeView, StatRowView). |
| Log.swift | DEBUG-only logging macro. |

## Push notifications

| File | Purpose |
|------|---------|
| PushPermission.swift | Push notification permission state management. |
| PushPromptSheet.swift | Permission-prompt UI sheet. |
| PushRegistration.swift | APNs device-token registration. Upserts to `user_push_tokens` via `upsert_user_push_token` RPC. |

## Internal view helpers

| File | Purpose |
|------|---------|
| HomeFeedSlots.swift | HomeRecapCard + HomeAdSlot widgets composed into HomeView. |
| ProfileSubViews.swift | ProfileView sub-components. |
| TTSPlayer.swift | AVSpeechSynthesizer wrapper for D17 paid-tier article TTS (used inside StoryDetailView). |
