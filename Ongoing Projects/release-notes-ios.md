# iOS Release Notes & Submission Runbook

## Submission targets

### Adult app (`VerityPost.xcodeproj`)
- **Submission target:** `com.veritypost.app` (production app target).
- **Test targets** `com.veritypost.app.uitests` and `com.veritypost.app.tests` exist for local testing only — never submit them.
- Verify in Xcode → Product → Scheme → "VerityPost" (not a UITests/Tests scheme) before archiving for App Store Connect.

### Kids app (`VerityPostKids.xcodeproj`)
- **Submission target:** `com.veritypost.kids` (production app target).
- **Test target** `com.veritypost.kids.uitests` exists for local testing only — never submit it.
- Verify in Xcode → Product → Scheme → "VerityPostKids" before archiving.

## Pre-submission checklist

### Entitlements
- **Adult** (`VerityPost/VerityPost.entitlements`): flip `aps-environment` from `development` to `production` for App Store builds (or split into a dedicated `Release.entitlements` selected by the Release configuration).
- **Kids** (`VerityPostKids/VerityPostKids.entitlements`): same — flip `aps-environment` to `production`.
- **Adult**: Sign-in-with-Apple entitlement (`com.apple.developer.applesignin`) was removed 2026-04-26 to align with magic-link-only auth. The SIWA button still renders in `SignupView.swift:95-119` and `LoginView.swift:36-82`; the SDK will reject auth without the entitlement. Strip the Swift UI in a follow-up Swift-build pass before launch.

### Version & build numbers
- Both Info.plists now reference `$(MARKETING_VERSION)` and `$(CURRENT_PROJECT_VERSION)` build settings (T258, 2026-04-26).
- Increment `CURRENT_PROJECT_VERSION` in the Xcode project (or via `agvtool next-version -all`) for every App Store submission — Apple rejects duplicate build numbers.
- Bump `MARKETING_VERSION` only on user-visible release versions.

### Background modes
- Adult declares `UIBackgroundModes = [audio]` to support TTS playback continuing when the app backgrounds (`TTSPlayer.swift` configures `.playback` / `.spokenAudio` audio session). Keep this declaration — App Review will see the matching code path.

### Associated domains
- Adult: associated-domains entitlement is **not** declared. If universal links from `veritypost.com` are required, add `com.apple.developer.associated-domains` with `applinks:veritypost.com` before submission.
- Kids: declares both `applinks:veritypost.com` and `applinks:kids.veritypost.com`. The `veritypost.com` entry on the kids app is suspect — kids should only intercept the kids subdomain. Confirm with the apple-app-site-association files on each domain before submission, then prune as needed.

### App Transport Security
- Both Info.plists declare `NSAppTransportSecurity.NSAllowsArbitraryLoads = false` (kids added 2026-04-26 per T257). All network calls must be HTTPS.
