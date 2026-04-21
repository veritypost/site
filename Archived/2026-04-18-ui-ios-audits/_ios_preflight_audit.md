# iOS Pre-flight Audit

Audit date: 2026-04-18. Target: `VerityPost/VerityPost.xcodeproj` (com.veritypost.app, v1.0 build 1, iOS 17).

## App Store blockers (will reject during review)

- **Missing `NSUserNotificationsUsageDescription`** — `PushRegistration.swift:32-33` calls `UNUserNotificationCenter.current().requestAuthorization`, but `Info.plist` has no usage string. Strictly, iOS doesn't require a purpose string for UN notifications (unlike camera/photos) but the absence of a push-rationale pre-prompt is an App Review soft-risk. Actual hard blocker: **no `aps-environment` entitlement** — app has no `.entitlements` file at all (confirmed by `find` and `grep CODE_SIGN_ENTITLEMENTS` on `project.pbxproj` returning zero matches). Remote push will silently fail at `registerForRemoteNotifications`, and the app will be rejected during Push review if the Push Notifications capability is declared in App Store Connect but not in the build. — Fix: add `VerityPost.entitlements` with `aps-environment=production` and link via `CODE_SIGN_ENTITLEMENTS` in both configs.

- **Sign in with Apple is offered but no Apple entitlement** — `AuthViewModel.swift:422-438` exposes `signInWithApple()`. Guideline 4.8 requires SIWA when any third-party login is offered (Google is also offered at `:442-456`). The `com.apple.developer.applesignin` entitlement is missing → review will reject. — Fix: add `com.apple.developer.applesignin = [Default]` to entitlements.

- **No Associated Domains for universal links** — App generates `https://veritypost.com/card/...` and `https://veritypost.com/story/...` URLs (`ProfileView.swift:73`, `PublicProfileView.swift:124`, `StoryDetailView.swift:153`) for sharing, but there is no `applinks:veritypost.com` entry. Deep links back into the app from those shared URLs will open Safari, not the app. Soft-blocker (not a reject), but user-facing brokenness. — Fix: add `com.apple.developer.associated-domains = ["applinks:veritypost.com","applinks:www.veritypost.com"]` and publish `/.well-known/apple-app-site-association`.

- **In-App Purchase capability not declared in project** — `StoreManager.swift` uses StoreKit 2 throughout, but the IAP capability is usually implicit. Flag to verify it is enabled in App Store Connect for the app record.

## Runtime risks (app works but silently wrong in production)

- **No `.storekit` configuration file** — `find` returned zero. Local StoreKit testing requires one; without it, `Product.products(for:)` returns empty on the simulator/TestFlight sandbox until App Store Connect has all 8 products approved. `StoreManager.loadProducts` swallows the empty list into `products = []` with only `Log.d` (DEBUG-only). Paywall will render blank in prod if any product ID is mis-typed in App Store Connect. — Fix: add `VerityPost/VerityPost/Verity.storekit` with the 8 IDs for CI/simulator testing.

- **TTS audio stops on app background** — `TTSPlayer.swift:70` sets `.playback / .spokenAudio` but `UIBackgroundModes` is NOT in `Info.plist`. If the user backgrounds the app mid-read, iOS will kill the audio session. Acceptable if TTS is foreground-only by design; flag so PM confirms intent.

- **Supabase auth callbacks in Supabase Dashboard must match `verity://login` and `verity://reset-password`** — `AuthViewModel.swift:427, 447, 468` use these schemes, which match `CFBundleURLSchemes = [verity]` in `Info.plist:26`. Verify Supabase project → Auth → URL Configuration has both URLs whitelisted, or OAuth and password-reset deep links will fail with `redirect_uri_mismatch`.

- **10-second splash timeout silently drops user to anon mode** — `AuthViewModel.swift:75-84`. If Supabase is unreachable on launch, returning user falls into "not logged in" state rather than showing an error. Intended behavior, but worth documenting on support page.

## Dev leaks (work in TestFlight, problematic on release build)

- **7 raw `print()` calls in `ProfileView.swift`** (lines 1007, 1038, 1094, 1105, 1114, 1147, 1149) bypass the DEBUG-guarded `Log.d` shim and will appear in device console in Release builds. Non-sensitive strings (error prefixes only), but inconsistent with the `Log.swift` policy. — Fix: replace all 7 with `Log.d`.

- **No Sentry, Firebase, Segment, Amplitude wired** — zero matches. No crash reporting. iOS crashes will only surface via Apple's native crash logs in App Store Connect; no breadcrumbs, no user-id tagging. — Recommend adding Sentry iOS SDK post-launch with DSN read from Info.plist (same pattern as SUPABASE_KEY).

- **No test-mode / dev-flag leaks** — zero matches for `isTestMode`, `kUseTestAccounts`, `enableDevTools`, `SKIP_PAY`, etc. Clean.

- **TODO count: 1** (`StoryDetailView.swift:1280`, expert-QA shape refactor, non-blocking).

## Privacy-label dependencies (need listing in App Store Connect)

- **Email address** — collected at signup (`AuthViewModel.signup`). Linked to user: yes. Tracking: no. Purpose: App Functionality (Account).
- **Username** — collected at signup. Linked: yes. Tracking: no. Purpose: App Functionality.
- **Purchase history** — StoreKit receipts posted to `/api/ios/subscriptions/sync`. Linked: yes. Tracking: no. Purpose: App Functionality (Purchases).
- **Device ID / push token** — APNs token upserted via `upsert_user_push_token` with device name, OS version, app version (`PushRegistration.swift:44-81`). Linked: yes. Tracking: no. Purpose: App Functionality (push).
- **User Content** — bookmarks, comments, stories read. Linked: yes. Tracking: no. Purpose: App Functionality.
- **Usage Data** — reading activity tracked via StoryDetailView trackReading. Linked: yes. Tracking: no. Purpose: Analytics.
- **Sensitive Info: none**, **Location: none**, **Contacts: none**, **Photos/Camera: none**, **Health: none**, **Financial Info: none** (payments flow through Apple, app never sees card data).

## Store-readiness checklist state

### Identity
- Bundle ID: `com.veritypost.app` (correct, owner domain)
- Display name: inherits `$(PRODUCT_NAME)` → `VerityPost` (consider user-facing `Verity Post` via `CFBundleDisplayName`)
- Version (CFBundleShortVersionString): `1.0`
- Build (CFBundleVersion): `1`
- Min iOS: `17.0` (exceeds baseline)
- Swift: `5.9`
- Development team: `4226SR4G5D`

### Capabilities
- Push Notifications: **MISSING** (no entitlements file)
- Associated Domains: **MISSING**
- Sign in with Apple: **MISSING** (code uses it)
- IAP: StoreKit code present; confirm App Store Connect capability
- App Groups: not used
- Background Modes: none declared

### IAP product IDs (all 8 v2 tiers)
- `com.veritypost.verity.monthly`, `.annual`
- `com.veritypost.verity_pro.monthly`, `.annual`
- `com.veritypost.verity_family.monthly`, `.annual`
- `com.veritypost.verity_family_xl.monthly`, `.annual`
- **Alignment with DB**: CLEAN — all 8 present in `plans.apple_product_id` with `is_active=true` and matching `tier` + `billing_period` (verified via live query against project `fyiwulqphgmoqullmrfn`).

### URL schemes / deep links
- `verity://` scheme: registered (`Info.plist:26`)
- Used for: `verity://login` (Apple/Google OAuth callback), `verity://reset-password` (password recovery)
- Universal links (`https://veritypost.com/...`): **NOT** registered (Associated Domains missing) — story/card share URLs will open Safari.

### Privacy usage strings (Info.plist)
- `NSUserNotificationsUsageDescription`: not needed (iOS doesn't require for UN)
- `NSPhotoLibraryUsageDescription`: not needed (no photo picker in code)
- `NSCameraUsageDescription`: not needed
- `NSMicrophoneUsageDescription`: not needed (AVSpeechSynthesizer is TTS-only, output)
- `NSFaceIDUsageDescription`: not needed (no LAContext)
- `NSUserTrackingUsageDescription`: not needed (no ATT / IDFA use)
- `NSLocationWhenInUseUsageDescription`: not needed
- `NSContactsUsageDescription`: not needed
- `ITSAppUsesNonExemptEncryption=false`: PRESENT (good)

### ATS
- `NSAllowsArbitraryLoads=false` — clean.

### Sentry / analytics
- None wired. Recommend Sentry post-launch.

### Hardcoded URLs
- All outbound URLs are `https://veritypost.com`, `https://fyiwulqphgmoqullmrfn.supabase.co`, or `https://apps.apple.com`. No staging, no localhost, no http://. Clean.

### Supabase publishable key
- `sb_publishable_cghQhP7iWFHIPAWnhsH3tw_COmnxYJG` hardcoded in `project.yml:66` and `project.pbxproj:356, 445`. This is the publishable/anon key — safe to ship. Confirmed prefix is the modern publishable variant (not service_role).

## OVERALL: CHANGES REQUESTED

Four entitlement-level items must land before App Store submission:
1. Create `VerityPost/VerityPost/VerityPost.entitlements` with `aps-environment`, `com.apple.developer.applesignin`, `com.apple.developer.associated-domains`.
2. Wire `CODE_SIGN_ENTITLEMENTS = VerityPost/VerityPost.entitlements` into both Debug and Release configs of `project.pbxproj` (and `project.yml` under `settings.base`).
3. Add `Verity.storekit` config file mirroring the 8 product IDs for simulator testing.
4. Replace 7 raw `print()` calls in `ProfileView.swift` with `Log.d`.

Everything else (product-ID alignment, ATS, scheme registration, bundle identity, no dev leaks, no tracking) is clean.
