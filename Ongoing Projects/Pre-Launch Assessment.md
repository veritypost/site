# Pre-Launch Assessment

Work for the **beta → full-launch transition**. Full launch happens simultaneously with iOS app submission to Apple. Scope is narrow:

1. **Sentry** coverage decisions
2. **Apple App Review requirements** — what Apple demands at submission (compliance gates only, not iOS UI bugs / parity work — those stay in `TODO.md`)

Companion files: `TODO.md` (beta-launch work + general iOS UI), `CHANGELOG.md` (work history), `SYSTEM_NOTES.md` (architecture reference).

---

## SENTRY

### S1 — Confirm `SENTRY_DSN` env state in Vercel
Sentry SDK is wired (`web/src/instrumentation.ts`, `web/sentry.client.config.js`, `web/sentry.shared.js`) and `@sentry/nextjs` is in deps. Memory says "deferred until monetization + traffic" — but the wiring being present and the wiring being **active** are different things. Owner check on whether DSN is set in Vercel prod env.

- **If DSN is live** → memory is stale, Sentry is already a paid line item, decision already made.
- **If DSN is unset** → SDK is dormant in prod. Decide before launch whether to flip on (S2).

### S2 — Decide Sentry scope at launch

| Option | What ships | Cost shape |
|---|---|---|
| **A** | Off entirely → uninstall `@sentry/nextjs`, delete config files | $0, no signal |
| **B** | Errors-only (no perf, no replay) | Free tier covers most; small monthly bill at scale |
| **C** | Errors + 10% perf sampling | Moderate; real signal on slow routes |
| **D** | Full suite (errors + perf + replay) | Significant; justified post-monetization |

**Recommendation: B at launch, revisit at first paying customer.** Errors-only catches real bugs without burning quota on traffic that isn't paying yet.

### S3 — PII scrubber rules
Already partially wired in `web/sentry.shared.js`. Before flipping DSN on (if S2 lands B/C/D), confirm scrubbing covers:
- Email addresses
- IP addresses
- Comment bodies (free-text user content)
- Expert questions / answers
- Direct message contents

GDPR exposure if any of those leak to Sentry's servers unscrubbed.

### S4 — `observability.captureException` doesn't scrub PII from extras
**File:** `web/src/lib/observability.js:45-53`. Context object passed to Sentry as-is via `scope.setExtra(k, v)`. Routes that call `captureException(err, { email, user_id, payment_id })` send those raw to Sentry. Sentry has data deletion policies but raw PII in error context is a compliance red flag.
**Fix:** Filter context keys before `setExtra`; redact emails / IBANs / payment tokens. Pair with S3 — same scrubber pattern, different code path.
**Severity:** MEDIUM (GDPR/compliance risk).

### S5 — Sentry instrumentation TypeScript hygiene
**File:** `web/src/instrumentation.ts:22,31`. `scrubPII: (e: unknown) => unknown` and `beforeSend: scrubPII as (event: unknown, hint: unknown) => unknown` use `unknown` + type assertions instead of proper Sentry type definitions.
**Fix:** Import `BeforeSendCallback` from `@sentry/types` and type `scrubPII: BeforeSendCallback`. Done concurrently with S3 / S4 since the scrubber surface is the same.
**Severity:** LOW (TS hygiene; not a runtime issue).

### S6 — Sentry project IP allowlist / authentication posture
**File:** `web/.env.example:115-116` (`NEXT_PUBLIC_SENTRY_DSN` ships to client; visible in all browser error reports).
**Why this matters:** If the Sentry project lacks API authentication or IP allowlist, an attacker who notices the public DSN can query the Sentry API for error reports (potentially containing PII) or send forged events to pollute the dataset.
**Fix:** Before flipping DSN on (S1/S2 = B/C/D), verify Sentry project has API tokens enabled + IP allowlist configured. Use a separate scoped DSN for browser (read-only, rate-limited) vs server.
**Severity:** LOW (depends on Sentry-side config posture).

### S7 — Sentry sourcemap upload + release tagging unverified
**File:** `web/next.config.js:78-85` (`automaticVercelMonitors: false`). Production crash stacks may surface minified in Sentry if sourcemaps aren't uploaded during Vercel builds; cron functions aren't auto-instrumented.
**Why this matters:** Minified stacks make incident triage 5-10× slower. Without release tagging, you can't tell which deploy introduced a regression.
**Fix:** (1) Verify `SENTRY_AUTH_TOKEN` is set in Vercel prod env. (2) Confirm `next.config.js` Sentry wrapper runs sourcemap upload during build (`silent: false` in dev to confirm). (3) Add Sentry Release integration tagging every function deployment with commit SHA.
**Severity:** MEDIUM (incident-response readiness).

---

## APPLE APP REVIEW — ADULT APP

### A1 — Push permission pre-prompt _(was TODO T1)_
**File:** `VerityPost/VerityPost/PushRegistration.swift:27-34` (verified — `.notDetermined` branch calls `requestAuthorization` directly).
**Apple HIG** explicitly warns against cold-fire system dialogs. Two-line fix: remove the `.notDetermined` branch from `registerIfPermitted()`. System push dialog only fires through `PushPromptSheet` → `PushPermission.requestIfNeeded()`.

### A2 — In-app account deletion (Guideline 5.1.1(v))
Apple requires the ability to **initiate account deletion from inside the app**, not just on web. Verity has `/api/account/delete` and a web flow (`profile/settings/page.tsx:5093-5162`). Confirm iOS settings exposes the same action and lands in the right place. Pairs with `TODO T43` (iOS pending-deletion visibility) — both must work for review.

### A3 — App Store Connect submission gates (checklist)
- [ ] App icon (1024×1024)
- [ ] Screenshots: iPhone 6.7", 6.5", 5.5" (iPad if supporting)
- [ ] App name, subtitle, description, keywords
- [ ] Support URL, marketing URL, **privacy policy URL** (mandatory)
- [ ] Age rating questionnaire
- [ ] Privacy "nutrition label" declarations — data types collected, whether linked to user, whether used for tracking
- [ ] App Tracking Transparency framework declaration (if any cross-app tracking — likely "no" for Verity)
- [ ] Export compliance (encryption use; standard answer for Verity = "uses standard encryption only" → ITSAppUsesNonExemptEncryption=NO)
- [ ] **Demo account credentials for App Review.** Under magic-link auth, this means pre-provisioning a reviewer email + leaving the magic-link active for the review window. Document in App Review notes.
- [ ] App Review notes — explain anything non-obvious (Verity's quiz-gated commenting, expert verification, kids-pairing flow)

### A4 — StoreKit / IAP gates
- [ ] Subscription products configured: Verity, Verity Pro, Family, Family XL
- [ ] Monthly + annual variants for each
- [ ] Subscription group setup with proper hierarchy (downgrades/upgrades between Verity ↔ Pro)
- [ ] Family Sharing eligibility flagged on family tiers
- [ ] In-app purchase only for digital goods (Apple 30% — already correct per `web/src/app/api/stripe/checkout/route.js:48-60` which routes Family to StoreKit)
- [ ] Receipt validation server-side via existing `web/src/lib/appleReceipt.js`

### A5 — Bundle ID + capabilities
Pending Apple Developer console walkthrough (A8). Items the walkthrough covers:
- Bundle identifier locked in App Store Connect
- Push notifications entitlement (APNs cert lives in `web/src/lib/certs/`)
- ~~Sign in with Apple entitlement~~ N/A under magic-link auth direction (no third-party social, so guideline 4.8 doesn't apply)
- Associated domains entitlement for universal-link deep linking — magic-link click lands in iOS app via this path

### A6 — TestFlight pipeline
- [ ] Internal testers added
- [ ] External beta (optional) before App Store submission
- [ ] Build upload + Apple review cycle (typically 24-48 hours for first review iteration)

### A7 — Magic-link reviewer test path
Under the locked auth direction (magic-link only, no password), App Reviewer cannot just type a password to log in. Two options:
- **Pre-provisioned reviewer account** — create `apple-reviewer@veritypost.com`, leave a long-lived bypass (e.g., `?token=<reviewer-token>` on `/auth/callback`) documented in App Review notes
- **Live magic-link** — give reviewer email access (mailbox they control), explain in notes that reviewer types email + clicks link

Pick one before submission. Pre-provisioned token is simpler for review iteration.

### A9 — Split age-of-13+ confirmation from Terms/Privacy agreement _(was TODO T87)_
**File:** `VerityPost/VerityPost/SignupView.swift:235-266` (single `agreed` boolean gates submit; copy reads "I'm 13 or older and agree to the Terms and Privacy Policy"). Web has the same pattern at `web/src/app/signup/page.tsx:666-677`.
**Why this is Apple-required:** App Store review + COPPA expect explicit, separate age confirmation distinct from policy agreement. Combined-checkbox patterns are flagged in review.
**Fix:** Two separate checkboxes — "I am 13 or older" + "I agree to the Terms and Privacy Policy" — both required for submit. Apply on web for parity.

### A10 — Trial terms inline on plan cards _(was TODO T93, Apple 3.1.2)_
**File:** `VerityPost/VerityPost/SubscriptionView.swift:51-100` (legal copy under fold); plan cards lines 64-84 show price only.
**Why this is Apple-required:** Guideline 3.1.2 requires trial offers + terms be disclosed prominently with the offer, not in fine print.
**Fix:** Inline trial banner per plan card: "7-day free trial, then $X/mo. Cancel anytime."

### A11 — "Delete Account" promoted out of "Danger zone" _(was TODO T94, Apple 1.4.1)_
**File:** `VerityPost/VerityPost/SettingsView.swift:790` (Danger zone section header).
**Why this is Apple-required:** Guideline 1.4.1 requires account deletion be readily discoverable. "Danger zone" is a Stripe/GitHub idiom unfamiliar in iOS App Store context.
**Fix:** Promote to a top-level Settings row labeled "Delete Account" with the destructive confirmation flow chained from there. Pairs with A2 (in-app deletion path) — both must work for review.

### A12 — `UIDevice.current.name` stored as PII _(was TODO T183)_
**File:** `VerityPost/VerityPost/PushRegistration.swift:70`. Persists user-customized device name (often contains real name) via `user_devices` upsert.
**Why this is Apple-required:** Apple Privacy Guidelines (App Store 5.1.1) + privacy nutrition label require disclosure of any user-identifying data collected. Device name is user-customized and frequently contains real names.
**Fix:** Filter to generic device type ("iPhone"/"iPad") + OS version, OR drop the field entirely if the server doesn't act on it. If kept, declare in privacy nutrition label.

### A13 — Article-view tracking gated behind analytics consent _(was TODO T191)_
**File:** `VerityPost/VerityPost/HomeView.swift:532-545`. Writes article IDs to UserDefaults pre-consent.
**Why this is Apple-required:** App Tracking Transparency framework + privacy nutrition label require that any tracking-shaped data collection is gated by user consent. Read-history is tracking-shaped under Apple's definition.
**Fix:** Gate the write behind a consent flag (e.g., `SettingsService.shared.isEnabled("analytics_consent")`). If consent isn't requested, default to off + don't track.

### A8 — Apple Developer console walkthrough _(was TODO T78)_
Owner has the dev account; bundle ID + capabilities + provisioning profile setup deferred to owner's "now" signal per memory. Items to cover when scheduled:
- Bundle ID for both apps
- Provisioning profiles (dev, distribution)
- APNs cert generation / renewal cadence
- TestFlight setup
- App Store Connect record creation for both apps

---

## APPLE APP REVIEW — KIDS APP (Kids Category)

The **Kids Category has stricter gates** than the adult app. Apple reviewers are noticeably more thorough on these.

### K1 — Server-grade kids quiz _(was TODO T8)_
**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:277,283,300,326,405` (verified — `opt.isCorrect` referenced throughout; client computes `correctCount`, writes `is_correct` to DB).
Currently sends the full answer key to the device. Apple Kids Category requires server-side validation for any quiz/assessment that affects user state. Build `/api/kids/quiz/start` (questions only, strip `is_correct`) and `/api/kids/quiz/submit` (server grades, returns verdict). The `get_kid_quiz_verdict` RPC already exists for the verdict path; the gap is on the *fetch* side.
**This is the single biggest kids-app submission blocker.**

### K2 — Kids-specific privacy policy
Apple requires a privacy policy that specifically addresses kids' data handling under COPPA. Either a separate URL (`/privacy/kids`) or a clearly-labeled kids section in the main policy. Must explicitly cover:
- Data collected from children (`kid_profiles` table, reading log, quiz attempts)
- Parental consent mechanism (already implemented — pair flow + `coppaConsent` consent record)
- Data retention + deletion path
- No third-party data sharing

### K3 — Zero third-party analytics + advertising
Apple Kids Category prohibits third-party tracking. Confirm against current build:
- No GA4 / Google Analytics scripts in kids app
- No Sentry session replay in kids app (errors OK if anonymized; user-behavior replay not OK)
- No third-party ad SDKs
- No Apple's own ATT-tracked frameworks

### K4 — Parental gate on external links + sensitive actions
Already implemented (`ParentalGateModal.swift` math challenge — verified in scan). Confirm gate is on:
- External web links (privacy policy, contact-us page)
- Unpair / sign-out
- Any settings that change parental control state
- Expert sessions discovery (verified in scan as gated)

### K5 — In-app contact / support
Kids Category requires a way for parents to reach support without leaving the app. Confirm a contact-us / feedback path exists in kids settings (likely needs to route to adult app or web), gated behind ParentalGate.

### K6 — Kid account deletion (Guideline 5.1.1(v))
Same in-app deletion requirement applies. Confirm:
- Parent can delete a kid profile from inside the **adult app's** family management (likely the right home for this)
- OR delete-self path inside the kids app, parental-gated
- Server-side cleanup includes: `kid_profiles` row, `reading_log` rows, `quiz_attempts` rows, COPPA consent record, pair tokens

### K9 — Parental gate math difficulty calibration _(was TODO T95)_
**File:** `VerityPostKids/VerityPostKids/ParentalGateModal.swift:31-32` (random in 12...49 × 2...9 — two-digit × single-digit math).
**Why this is Apple-required:** Apple Kids Category review checks parental gates for both too-easy (kids can solve them) and too-hard (legitimate parents get locked out). Two-digit × single-digit is borderline-too-hard for the 5-8 segment of the 5-12 audience.
**Fix:** Replace primary gate with a "type the word in this picture" challenge or 3-letter pattern recognition. Keep math option for older kids if desired but don't make it the only path. Bundles with COPPA review pass.

### K10 — Kids deep-link handler implementation _(was TODO T96)_
**File:** `VerityPostKids/VerityPostKids/VerityPostKidsApp.swift:13-27` (`onOpenURL` logs URL + returns; no routing).
**Why this is Apple-required:** Kids submission readiness — broken share-from-parent → kids-app flow looks like incomplete app behavior in review. Universal-link / custom-scheme handlers must actually navigate or be removed.
**Fix:** Wire `onOpenURL` to parse `veritypostkids://story/<slug>` and `https://kids.veritypost.com/...` patterns; navigate to ArticleDetailView via NavigationStack programmatic push. Bundle with adult deep-link routing (TODO T118) — same pattern, different surface.

### K11 — Kids-specific privacy policy URL _(was COPPA C2 + Attorney L10 + Walkthrough)_
**Files:** `web/src/app/privacy/page.tsx:157-172` (only generic COPPA section); `VerityPostKids/VerityPostKids/ProfileView.swift:73-74` (links to apex `/privacy`).
**Why this is required:** COPPA 16 CFR § 312.4(c)+(d) + Apple Kids Category K2 require a distinct kids privacy notice linkable from inside the kids app, parent-pairing screen, and every collection point. Generic policy doesn't enumerate `date_of_birth`, `display_name`, `parent_user_id` binding, retention, or third-party disclosure.
**Fix:** Create `/privacy/kids` page enumerating every field collected from kids + parental consent mechanism + retention policy + zero third-party sharing claim. Link from kids app (gated by parental gate per K4), parent-pairing screen, and both signup flows.

### K12 — Pair-code flow is not COPPA-valid Verifiable Parental Consent (VPC) _(was COPPA C1)_ — **CRITICAL**
**File:** `web/src/app/api/kids/pair/route.js:85-125`; `web/src/app/api/kids/generate-pair-code/route.js:16-86`. `parental_consents` records `consent_method='pair_code_redeem_v1'`.
**Why this is required:** COPPA 16 CFR § 312.2(b) requires VPC via one of: signed consent, credit card transaction, government ID, video conference, or knowledge-based authentication (KBA). A logged-in parent generating a pair code is **not** identity verification — an attacker with stolen parent credentials can pair kids unimpeded. Apple Kids Category K2 enforcement also rejects unsubstantiated VPC.
**Fix:** Add identity-verification step before code generation: KBA quiz (3-of-5 secret questions set at parent signup), credit-card metadata re-verification (use existing Stripe customer-on-file), or government-ID upload via approved vendor. Log chosen method to `parental_consents.consent_method` with FTC-recognized identifier. Update privacy policy to disclose method.

### K13 — Kid soft-delete doesn't hard-purge personal data _(was COPPA C5)_ — **HIGH**
**File:** `web/src/app/api/kids/[id]/route.js:88-98` flips `is_active=false` only. No cron purges `kid_profiles`, `reading_log`, `quiz_attempts`, `user_achievements`, `parental_consents` after the grace window.
**Why this is required:** COPPA 16 CFR § 312.6(a) requires deletion of collected child data; FTC guidance specifies deletion within 30 days of parental request.
**Fix:** Document 30-day grace in privacy policy. Daily cron: hard-DELETE all rows associated with `kid_profile_id` where soft-delete is older than 30 days. Audit deletions to a locked `_audit_purged` table for compliance proof.

### K14 — Parent has no data-export or granular review/delete UI _(was COPPA C6)_ — **HIGH**
**File:** `web/src/app/profile/kids/page.tsx` shows KPI summary only; no `/api/kids/[id]/data-export` endpoint.
**Why this is required:** COPPA 16 CFR § 312.5 requires parents be able to review collected data and refuse further collection. Current state offers only all-or-nothing pause/delete.
**Fix:** (1) Add `/api/kids/[id]/data-export` returning `{reading_log, quiz_attempts, user_achievements, parental_consents}` JSON. (2) Add "View & export data" button in `profile/kids/page.tsx` per kid; modal shows filterable reading log + "Download as JSON". (3) Add granular toggles: "Collect reading history" / "Participate in leaderboards" / "Store quiz attempts." Default ON; opt-outs respected at write-time. (4) Update privacy policy section 7 to point at the in-app surface.

### K7 — No social features (verify)
Kids app has no DMs, no comments, no follows per scan. Just confirm no surfaces are accidentally exposed before submission. Apple reviewers will explicitly probe this.

### K8 — Kids App Store Connect metadata
Same checklist as A3, plus:
- [ ] Kids age band declaration (5-8 / 9-11 / 6-8 are the Apple buckets; pick based on your content)
- [ ] Made-for-Kids designation
- [ ] Kid-specific screenshots (showing kid UI, not adult UI)

---

## STATUS BOARD

| ID | Item | Status |
|---|---|---|
| **S1** | Sentry DSN env check | Pending owner |
| **S2** | Sentry scope decision | Pending owner |
| **S3** | PII scrubber audit | Pending S2 = B/C/D |
| **S4** | `observability.captureException` extras scrubbing | Pending S2 = B/C/D |
| **S5** | Sentry TS types (`@sentry/types`) | Pending S2 = B/C/D |
| **S6** | Sentry project IP allowlist / API auth posture | Pending S2 = B/C/D |
| **S7** | Sourcemap upload + release tagging in Vercel build | Pending S2 = B/C/D |
| **A1** | Push pre-prompt fix | Pending implementation |
| **A2** | iOS in-app account deletion | Pending verification |
| **A3** | App Store Connect metadata | Pending submission prep |
| **A4** | StoreKit IAP setup | Pending Apple console walkthrough |
| **A5** | Bundle ID + entitlements | Pending Apple console walkthrough |
| **A6** | TestFlight pipeline | Pending submission prep |
| **A7** | Magic-link reviewer test path | Pending implementation |
| **A8** | Apple Developer console walkthrough | Pending owner "now" signal |
| **A9** | Split age-of-13+ from Terms/Privacy checkbox | Pending implementation |
| **A10** | Trial terms inline on plan cards (Apple 3.1.2) | Pending implementation |
| **A11** | Delete Account promoted out of "Danger zone" | Pending implementation |
| **A12** | `UIDevice.current.name` PII sanitization | Pending implementation |
| **A13** | Article-view tracking consent gate | Pending implementation |
| **K1** | Server-grade kids quiz | Pending implementation |
| **K2** | Kids privacy policy | Pending copy + legal review |
| **K3** | Zero third-party analytics audit | Pending verification |
| **K4** | Parental gate coverage audit | Pending verification |
| **K5** | In-app support path | Pending verification |
| **K6** | Kid account deletion path | Pending verification |
| **K7** | No-social-surfaces audit | Pending verification |
| **K8** | Kids App Store Connect metadata | Pending submission prep |
| **K9** | Parental gate difficulty calibration | Pending implementation |
| **K10** | Kids deep-link handler implementation | Pending implementation |
| **K11** | Kids-specific privacy policy URL | Pending implementation |
| **K12** | COPPA-valid VPC (replace pair-code-only) | Pending implementation — CRITICAL |
| **K13** | 30-day hard-purge cron for soft-deleted kids | Pending implementation |
| **K14** | Parental data-export + granular review/delete UI | Pending implementation |

---

_Generated 2026-04-26. Items A1, A8, K1, S1, S2 originated in `TODO.md` as T1, T78, T8, T86 — moved here per owner direction "TODO is for beta launch, Pre-Launch Assessment is for the beta→full-launch transition." Verify before acting on anything more than two weeks old._


---

## IOS SESSION CLUSTER (moved from TODO.md 2026-04-27)

These items target `VerityPost/` or `VerityPostKids/` Swift code and need an iOS build session to verify. Filtered out of `TODO.md` so the autonomous-execution surface focuses on web-actionable work. Sort: T-id ascending.

### T12 — iOS comment threading missing — **HIGH**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:2371` (TODO comment: "parent_id is omitted here — iOS UI doesn't expose threaded reply yet"); `parent_id` IS fetched at lines 1921, 2077.
**Fix:** Surface a Reply button per comment. Indent replies (left border). Pass `parent_id` on submit.
**Recommendation:** Web has it; data is already there. One-session task. **DB plumbing already done.**


### T18 — iOS email change bypasses hardened server flow — **HIGH** (re-scoped: under magic-link, "change email" sends a confirm-link to the new address; no password to verify)
**File:** `VerityPost/VerityPost/SettingsView.swift:1391-1452` (calls `client.auth.update(user: UserAttributes(email:))` directly).
**Problem:** Skips `/api/auth/email-change` rate limit, audit, and the `users.email_verified = false` flip. iOS profile gating reads `email_verified` — user can change email and stay treated as verified.
**Fix:** Route iOS email changes through `/api/auth/email-change`, then reload the user record on success.
**Recommendation:** Same pattern as T5 (route through hardened server endpoint). **One canonical server-owned path** for any auth-state mutation.


### T25 — No topic/category alerts (publish-time fan-out) — **HIGH** (return-visit driver)
**File:** `alert_preferences` table exists, `breaking_news` is a global blast; `AlertsView.swift:300` has `manageSubscriptionsEnabled = false` (UI built but flagged off). No `subscription_topics` table; no API route.
**Fix:** Add `subscription_topics(user_id, category_id, created_at)` table. Add `/api/alerts/subscriptions` GET/POST. Flip the iOS flag to true. Wire publish-time trigger that fans out to subscribers.
**Recommendation:** **Topic alerts are the second-strongest return-visit lever** (after reply notifications T26). Same publish-time pipeline as breaking-news, just filtered by category subscription.


### T29 — Empty alerts inbox tells iOS users to use disabled Manage tab — **HIGH** (dead-end CTA)
**File:** `VerityPost/VerityPost/AlertsView.swift:223-234,291-321` ("Subscribe to categories in Manage to get alerts" copy + `manageSubscriptionsEnabled = false`).
**Fix:** Update empty-state copy until Manage actually works (paired with **T25**), or just remove the instruction.
**Recommendation:** Lands with T25 — same flip.


### T66 — iOS bookmarks empty-state CTA is a dead button — **LOW**
**File:** `VerityPost/VerityPost/BookmarksView.swift:212-228` (verified — button action is just `// Would navigate back to home; tab bar handles the actual swap.`).
**Fix:** Wire the button to switch tabs to Home/Find, OR replace with static guidance.


### T72 — iOS Browse-tab commit/code drift — **DEBT** (investigate)
**Files:** Commits `79fd8ae` + `0826728` claim Browse swap; `ContentView.swift:182,194` still has `case .mostInformed`. No `BrowseView.swift`.
**Fix:** Read full `ContentView.swift` + `git log -p ContentView.swift` to determine whether the swap landed under a different name, was reverted, or was never applied.


### T81 — iOS TTS-per-article toggle — **DEFERRED**
**Scope:** Web saves `users.metadata.tts_per_article`; iOS has no row to toggle whether the listen button appears.
**Fix:** Add Article-audio toggle to iOS Preferences. Gate on `settings.a11y.tts_per_article` perm. Read/write `users.metadata.tts_per_article` via `update_own_profile`. Bundle with TTS player QA.


#### T88 — iOS onboarding stamp failure blocks app entry — **HIGH**
**File:** `VerityPost/VerityPost/WelcomeView.swift:67-73` (`stampError` shows "Couldn't finish onboarding. Please try again." with no bypass).
**Problem:** Backend hiccup on `/api/account/onboarding` POST = user is stuck on WelcomeView forever. Onboarding is a metric, not a gate, but the code treats it as a gate.
**Fix:** Allow "Continue anyway" after one failed retry. Stamp can be re-attempted next session via existing `onboarding_completed_at IS NULL` check.
**Recommendation:** Telemetry should never block app entry. Two-line change.


#### T89 — iOS unverified user gets entire profile gated — **HIGH**
**File:** `VerityPost/VerityPost/ProfileView.swift:143-149` (when `user.emailVerified == false`, hero/stats/streak grid hidden behind `verifyEmailGate`).
**Problem:** Reading still works; only the profile surface is gated. Inconsistent — web doesn't gate profile this hard.
**Fix:** Show profile with a non-blocking "verify your email to comment and save" banner. Keep hard gates only on actions that require verification (commenting, save).
**Recommendation:** Becomes moot post-AUTH-MIGRATION (every signed-in user is inherently verified under magic-link). Decide whether to ship now or wait.


#### T126 — iOS onboarding "Skip" on every screen — **LOW**
**File:** `VerityPost/VerityPost/WelcomeView.swift:35` (Skip button visible on all 3 screens unconditionally).
**Problem:** User can skip from screen 0 immediately, bypassing the Read/Quiz/Discuss preview, landing on Home with no orientation.
**Fix:** Hide Skip on screens 0 and 1; show only on the final screen (matches typical iOS onboarding pattern).
**Recommendation:** Get the value across before allowing skip.


#### T137 — iOS email input lacks client-side format validation — **LOW** (UX)
**File:** `VerityPost/VerityPost/SettingsView.swift:1391-1452`. Server-side only; user submits invalid → server rejection.
**Fix:** Inline regex check in `onChange`, gray ✓ / red "Invalid email" hint.


#### T185 — Hardcoded user-facing strings throughout iOS (no localization) — **LOW** (i18n future-proofing)
**File:** `HomeView.swift` and across most `*View.swift`. Verification: 0 uses of `String(localized:)` confirmed. **Severity downgraded** — English-first product is intentional; this is future-proofing only. Don't ship pre-launch.
**Fix:** When multi-language is roadmapped, wrap in `String(localized: ...)` + add `.xcstrings` catalog. Not now.


#### T187 — `setCurrentUser` doesn't validate UUID format — **LOW** (defense)
**File:** `VerityPost/VerityPost/PushRegistration.swift:20-22,46`. Malformed userId → server upsert fails silently (`Log.d`).
**Fix:** UUID validation; fail loudly in DEBUG builds.


#### T190 — `Task.detached` analytics flush has no cancellation handle — **LOW** (data loss)
**File:** `VerityPost/VerityPost/EventsClient.swift:101-115`. Backgrounding mid-flush may abandon up to ~20 events silently.
**Fix:** Store Task handle; await synchronously in `handleBackground`.


#### T194 — `KidsAppState.loadUser` surfaces raw error strings — **LOW** (UX)
**File:** `VerityPostKids/VerityPostKids/KidsAppState.swift:78-93`. "Couldn't load streak: error.localizedDescription" is hostile copy.
**Fix:** Map to friendly strings; offer retry button.


#### T195 — Kids quiz server-verdict has no timeout fallback — **LOW** (resilience)
**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:68-69,145-148`. `verdictPending` may hang indefinitely.
**Fix:** 5s timeout; fall back to local computation with warning log.


#### T197 — `LoginView.canSubmit` recomputes every body render — **LOW** (perf micro)
**File:** `VerityPost/VerityPost/LoginView.swift:228-230`.
**Fix:** Cache as `@State`; update via `.onChange(of:)`.


#### T198 — `VerityPostApp` only handles `.active` scenePhase, not `.background` — **LOW** (data loss)
**File:** `VerityPost/VerityPost/VerityPostApp.swift:28-32`. Force-close mid-StoreKit-restore abandons pending work.
**Fix:** `.background` handler to flush pending writes.


#### T200 — Signup username retry loop wastes 300ms on permanent errors — **LOW** (UX)
**File:** `VerityPost/VerityPost/AuthViewModel.swift:312-331`. Verification: early-break logic exists (`guard msg.contains("p0002") || msg.contains("not found") else { break }`), so non-transient errors break after first attempt. Remaining waste is 300ms on the first attempt before the break — minor. Pre-AUTH-MIGRATION concern only; magic-link reshapes the signup flow.
**Fix:** Skip the initial 300ms sleep entirely on permanent errors; match error message for "reserved"/"taken" pre-RPC.


#### T206 — Deep-link `setSession()` not validated against Supabase issuer/audience — **HIGH**
**File:** `VerityPost/VerityPost/AuthViewModel.swift:377-407`. `verity://` URL scheme is registered; attacker can craft a deep-link with fake `access_token`/`refresh_token` and the app calls `setSession()` blindly.
**Fix:** After `setSession()`, immediately call `auth.getUser()` to validate; reject + clear session on failure. Validate `aud`/`iss` claims if available.


#### T214 — Keychain `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` for tokens — **LOW** (acceptable, monitor)
**File:** `VerityPost/VerityPost/Keychain.swift:20`. Correct level, but document acceptance + revisit if Apple changes guidance.

### Performance (T215-T223)


#### T253 — TTSPlayer doesn't release buffer on memory warning — **LOW**
**File:** `StoryDetailView.swift:125`. No `UIApplication.didReceiveMemoryWarningNotification` observer.
**Fix:** Stop + release TTS buffers in observer.


#### T254 — `sessionExpired` banner stays sticky after dismissal — **LOW**
**File:** `AuthViewModel.swift:114-158`. No auto-dismiss; user navigating in cached views sees stale banner.
**Fix:** Auto-dismiss after 5s OR add "Sign in again" CTA that calls `checkSession()`.

### iOS Implementation Manager (T255-T263)


#### T261 — Deployment target `iOS 17.0` excludes ~10-15% of users on iOS 16 — **LOW**
**File:** project.pbxproj `IPHONEOS_DEPLOYMENT_TARGET = 17.0`. Audit code for iOS 17-only APIs; if none required, lower to 16.
**Fix:** Test build at 16; lower if no API gates.


### T20 — iOS verification application underspecified vs web — **HIGH** (silent failure)
**File:** `VerityPost/VerityPost/SettingsView.swift:1013-1021,2148-2324` (sends `application_type`, `full_name`, `organization`, `title`, `bio`, `social_links`, `portfolio_urls`); web sends those + `expertise_areas`, `credentials`, `category_ids`, 3 `sample_responses`.
**Problem:** iOS creates incomplete applications editors can't review properly, OR the RPC rejects and iOS only logs the non-200 with no user signal.
**Fix:** Match the web contract. Also surface failure inline — keep the form open with an error banner, don't dismiss silently.
**Recommendation:** Single `expert_application_payload` schema in `web/src/types/database.ts` should be the source of truth — both surfaces validate against it.


### T23 — iOS sign-in skips server lockout/audit/daily-login bookkeeping — **HIGH** (security telemetry)
**File:** `VerityPost/VerityPost/AuthViewModel.swift:162-188,562-667` (calls `client.auth.signIn(...)` directly + best-effort `last_login_at`); web `login/page.tsx:156-239` runs `/api/auth/login-precheck` → reports failures via `/api/auth/login-failed` → POSTs `/api/auth/login` for the bookkeeping pass.
**Fix:** Mirror the web auth contract on iOS: resolve usernames, honor lockout precheck, report failures, call the server bookkeeping path on success.
**Recommendation:** **Single auth contract across surfaces.** Without server bookkeeping, lockout is iOS-bypassable, audit log is incomplete, and `daily_login` streak/score events are inconsistent.


### T28 — iOS exposes Back-channel queue tab that's a placeholder — **HIGH** (parity)
**File:** `VerityPost/VerityPost/ExpertQueueView.swift:20-24,79-112,188-199` (tab listed, body shows "Coming soon"); web `expert-queue/page.tsx:153-231` has the real flow.
**Fix:** Hide the iOS Back-channel tab until parity exists, OR implement load/post against the same API web uses.
**Recommendation:** **Hide first** (one-line conditional). Build parity in a dedicated session.


### T37 — iOS browse is a subset of web browse — **MEDIUM**
**File:** `VerityPost/VerityPost/HomeView.swift:577-657` (plain category list); web shows counts + top-3 trending + filter + Latest strip.
**Fix:** Add article count + 1-2 article previews per category row on iOS.


### T38 — iOS search has no advanced filters — **MEDIUM**
**File:** `VerityPost/VerityPost/FindView.swift:8` (MVP deferral comment).
**Fix:** Add category filter + date range picker for paid tiers, gated on the same web permission keys.


### T41 — iOS notification taps ignore non-story `action_url` — **MEDIUM**
**File:** `VerityPost/VerityPost/AlertsView.swift:247-252,790-795` (only routes `/story/<slug>`). Backend emits `/profile/settings/billing`, `/signup`, signed download URLs — iOS taps mark-as-read but don't navigate.
**Fix:** Route generic internal `action_url`s on iOS, or suppress tap affordance for unsupported actions.


### T42 — iOS data export uses old direct-insert path + forgets pending requests — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:2446-2482,2538-2546` (direct `data_requests.insert()`); web routes through `/api/account/data-export` for permission/rate-limit/audit/dedupe.
**Fix:** Route iOS through `/api/account/data-export`. Load existing rows so pending state survives relaunch.


### T43 — iOS can't see/cancel pending deletion while signed in — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:2446-2565`; `AuthViewModel.swift:181-185,521-530,690-705`; `Models.swift:5-46`.
**Fix:** Add `deletion_scheduled_for` to iOS user model. Surface countdown in Settings. Add cancel action via `/api/account/delete`.


### T44 — Multiple iOS settings pages fail silently on save — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:1958-2040,2090-2142,2393-2436` (Alerts, Feed, Expert all `Log.d` errors with no UI signal).
**Fix:** Add success/error banners matching the profile editor pattern.


### T45 — iOS settings pages render fallbacks as "loaded" on fetch failure — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:1592-1601,1996-2014,2103-2116,2406-2416,2513-2522` (`try?` swallow → render defaults).
**Fix:** Distinct load-error state with retry. Disable save until successful initial fetch.


### T46 — iOS "Sign-in activity" isn't real session management — **MEDIUM**
**File:** `VerityPost/VerityPost/SettingsView.swift:1519-1598` (renders audit rows from `get_own_login_activity`); web reads `user_sessions` with revoke action.
**Fix:** Back the iOS screen with `user_sessions`. Show active vs ended. Add "Sign out other sessions."


### T48 — iOS auth deep-link failures are silent — **MEDIUM**
**File:** `VerityPost/VerityPost/VerityPostApp.swift:15-17`; `AuthViewModel.swift:377-409`; `ContentView.swift:99-105`.
**Fix:** Surface invalid/expired link state with recovery CTA (resend verification / new reset link).


### T49 — iOS Username field is editable, web says it's immutable — **MEDIUM** (contract mismatch)
**File:** `VerityPost/VerityPost/SettingsView.swift:1283-1287,1320-1375` (editable); `web/src/app/profile/settings/page.tsx:1716-1720` ("Usernames cannot be changed.").
**Fix:** Decide the contract. If immutable, disable iOS field. If changeable, document and message it consistently.


### T50 — iOS DM creation/send failures largely silent — **MEDIUM**
**File:** `VerityPost/VerityPost/MessagesView.swift:600-658,1041-1107`
**Fix:** Keep compose/search surface open on failure. Show error state mapping common HTTP failures to actionable copy.


### T52 — Trust header missing on iOS comments — **MEDIUM**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:1093-1151`. Web has "Every reader here passed the quiz." (`CommentThread.tsx`); iOS jumps straight to composer.
**Fix:** Add the trust header on iOS, conditional on `visible.length > 0`.
**Recommendation:** Core-value-prop surface — iOS shouldn't be missing it.


### T58 — iOS Find rows missing category + date — **MEDIUM**
**File:** `VerityPost/VerityPost/FindView.swift` — search-result rows. Web search rows show category + date; iOS Find doesn't.
**Fix:** Add category name + relative date to each `FindView` story row.


### T60 — iOS Expert settings save to nowhere — **MEDIUM** (likely dead UI)
**File:** `VerityPost/VerityPost/SettingsView.swift:2330-2436` writes `users.metadata.expert`. Web expert queue / back-channel only consult permissions/categories — no consumer for `metadata.expert` outside this settings page.
**Fix:** Wire queue routing / expert notifications to `metadata.expert`, OR remove the screen.
**Recommendation:** Verify any backend RPC reads it before deleting. If not, **delete** — fake-functional settings are worse than missing settings.


#### T102 — iOS splash 10s timeout has no slow-network grace — **MEDIUM**
**File:** `VerityPost/VerityPost/AuthViewModel.swift:80` (hard 10-second timeout).
**Problem:** 3G or weak-signal sessions hit the failure screen even though a 12s wait would have succeeded.
**Fix:** Two-stage: at 5s show "Connecting...", at 15-20s show fallback. Total budget extended to 20s.
**Recommendation:** Match real-world cellular latency, not the typical wifi case.


#### T103 — iOS session-expired banner is generic — **MEDIUM**
**File:** `VerityPost/VerityPost/ContentView.swift:229` ("Your session expired. Please sign in again.").
**Problem:** Could be token-refresh fail, remote signout, account ban, password change. User can't tell whether to retry or contact support.
**Fix:** Pass cause through `auth.sessionExpiredReason`; banner branches on cause: "Signed out from another device" / "Session expired — please sign in" / "Account changes detected — please sign in again."
**Recommendation:** Three causes max. AuthViewModel already knows the cause; surface it.


#### T104 — iOS bottom-nav 4th tab label flips between "Sign up" and "Profile" — **MEDIUM**
**File:** `VerityPost/VerityPost/ContentView.swift:282` (`Item(id: .profile, label: isLoggedIn ? "Profile" : "Sign up")`).
**Problem:** Same icon, label flips on auth state. Visual continuity broken; "Sign up" doesn't belong as a tab.
**Fix:** Keep Profile icon + label; gate behind a sign-up prompt screen if user is anon (matches existing Notifications anon-gate pattern).
**Recommendation:** "Sign up" should be a CTA inside the Profile screen the tab opens, not a tab itself.


#### T105 — iOS quiz teaser dismiss is per-article only — **MEDIUM**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:1689,1798` (`quizTeaserDismissed` is local state).
**Problem:** Dismiss on article 1, open article 2, teaser fires again at 50% scroll. Feels like a nag.
**Fix:** Persist dismiss as a per-session @AppStorage. Optionally rate-limit to once per N articles.
**Recommendation:** Combine with T11 / T37 (move teaser to article end, not 50% scroll).


#### T106 — iOS quiz submission failure leaves user stuck — **MEDIUM**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:2360+` (error sets `quizError` string but no retry button at the failure point).
**Problem:** Network blip mid-submit → quiz state shows error text. User must navigate away and reopen the article to retry.
**Fix:** Add "Try again" button next to `quizError` text when state is `.submitting` failure.
**Recommendation:** Consistent with T44 / T45 retry-state requests.


#### T116 — iOS comment rate-limit shows "Wait" without countdown — **MEDIUM**
**File:** `VerityPost/VerityPost/StoryDetailView.swift:2404-2420` (rate-limit flag flips, no duration shown).
**Problem:** User taps Send, gets "Wait", retries, gets "Wait" again. Same friction as kids pair-code lockout.
**Fix:** Track `comment_rate_sec` server response and render "Try again in Xs" countdown.
**Recommendation:** Apply the same UX pattern across the app — every rate-limited action gets a visible countdown.


#### T118 — Adult iOS deep-link handler has no article routing — **MEDIUM**
**File:** `VerityPost/VerityPost/VerityPostApp.swift:15-17` (`auth.handleDeepLink(url)` only handles auth deep links; no article navigation).
**Problem:** Shared `veritypost://story/<slug>` URL opens the app but doesn't navigate to the article.
**Fix:** Branch on URL host: auth deep-links → existing `auth.handleDeepLink`; story deep-links → push StoryDetailView via NavigationStack programmatic push.
**Recommendation:** Bundle with T96 (kids deep-link routing).


#### T121 — iOS push 7-day cooldown after "Not now" too long — **MEDIUM**
**File:** `VerityPost/VerityPost/PushPermission.swift:32` (`prePromptCooldown = 7 * 24 * 60 * 60`).
**Problem:** User dismisses to clear the sheet, changes mind in minutes, can't re-trigger for a week.
**Fix:** Two-tier cooldown: 24h after "Not now", but also re-prompt at the next high-value moment (first comment posted, first save) regardless of cooldown.
**Recommendation:** Pair with T1 (push pre-prompt fix).


#### T122 — iOS push status not auto-refreshed on foreground — **MEDIUM**
**File:** `VerityPost/VerityPost/PushPermission.swift:63-69` (`refresh()` not called on app foreground).
**Problem:** User denies, manually enables in iOS Settings, returns to app — UI still shows "denied" until next manual refresh call or full app restart.
**Fix:** Call `refresh()` in a `UIApplication.didBecomeActiveNotification` observer.
**Recommendation:** Standard iOS lifecycle pattern.

### LOW — opportunistic


#### T131 — iOS comment vote buttons missing visual disabled-when-active state — **MEDIUM** (UX)
**File:** `VerityPost/VerityPost/StoryDetailView.swift:~1800-1860`. `active: Bool` parameter passed but no visual differentiation.
**Fix:** Apply `.disabled(already_voted)` or opacity/color when `active`.


#### T139 — Audit error handling pattern across iOS Settings subpages — **MEDIUM** (UX consistency)
**File:** `VerityPost/VerityPost/SettingsView.swift:1958-2040, 2090-2142, 2393-2436`. Multiple subpages use `try?` + `Log.d` swallow pattern. (Partially overlaps T44/T45 but broader.)
**Fix:** Standardize on the profile-editor red-banner pattern across all settings subpages.

### Engagement / Retention (T140-T154)


#### T148 — iOS Alerts shows Manage tab to anon, lands on disabled state — **MEDIUM** (UX)
**File:** `VerityPost/VerityPost/AlertsView.swift:137-150,29-32`. Two tabs visible; Manage tab is disabled placeholder.
**Fix:** Hide Manage for anon. On signed-in first visit, jump to Manage to onboard category selection.


#### T182 — `EventsClient.shared` observer never removed — **MEDIUM** (anti-pattern)
**File:** `VerityPost/VerityPost/EventsClient.swift:18-23`. Singleton OK today, but `[weak self]` + deinit hygiene lacking.
**Fix:** Block-based observer with `[weak self]`; explicit deinit removal.


#### T189 — `AuthViewModel.checkSession` swallows network vs no-session distinction — **MEDIUM** (UX correctness)
**File:** `VerityPost/VerityPost/AuthViewModel.swift:91-96`. Both paths set `isLoggedIn = false`.
**Fix:** Surface error type; offer retry on transient network failure.


#### T193 — SupabaseClient initialized without timeout config — **MEDIUM** (UX on flaky networks)
**File:** `VerityPost/VerityPost/SupabaseManager.swift:53-55`. Uses OS default 60s.
**Fix:** Set `URLSessionConfiguration.timeoutIntervalForRequest = 15` and `waitsForConnectivity = true`.


#### T244 — Pull-to-refresh stacks parallel network calls — **MEDIUM**
**File:** `HomeView.swift:180`, `ProfileView.swift:173`, `SettingsView.swift:652`. `.refreshable` doesn't cancel prior in-flight load.
**Fix:** Store `loadTask` handle; cancel before re-firing.


#### T245 — Quiz auto-submit double-fire on rapid network recovery — **MEDIUM**
**File:** `StoryDetailView.swift:1137-1145`. 350ms `asyncAfter` fires regardless of network state.
**Fix:** Cancel timer task before retry-path `submitQuiz()`; gate on `quizStage != .submitting`.


#### T246 — Comment post 200 with body `{ "error": "..." }` clears UI without error feedback — **MEDIUM**
**File:** `StoryDetailView.swift:2355-2425`. Decode fails on shape mismatch; UI clears composer; user loses draft silently.
**Fix:** Check JSON for `error` field before decode; preserve composer + show error.


#### T247 — Splash 10s timeout doesn't retry on transient network — **MEDIUM**
**File:** `AuthViewModel.swift:75-101`. 8s success → still un-flips `splashTimedOut=true` later; relaunch shows duplicate splash.
**Fix:** Wrap auth call in Task with proper timeout enforcement; cancel timer on success.


#### T248 — Vote buttons silently fail when session expired — **MEDIUM**
**File:** `StoryDetailView.swift:2430-2456`. `try? await client.auth.session` returns nil; vote bails; UI shows optimistic update.
**Fix:** Throw on session-fetch failure; surface "Please sign in again."


#### T249 — `EventsClient.flush` Task.detached uncancellable; events lost on background-then-kill — **MEDIUM**
**File:** `EventsClient.swift:92-115`. Buffer cleared before HTTP enqueued; process kill drops events.
**Fix:** Persist buffer to disk on background; await flush completion.


#### T250 — APNs token arrives before `setCurrentUser()`; no retry — **MEDIUM**
**File:** `PushRegistration.swift:44-80`. Token-before-login → silent ignore; subsequent logins don't re-register.
**Fix:** Persist token; retry RPC registration on `setCurrentUser()`.


#### T251 — Kids quiz writes pending when app backgrounded; "success" celebration on stale state — **MEDIUM**
**File:** `KidQuizEngineView.swift:62-68`, `KidsAppState.swift:187-200`. `pendingWrites` Tasks cancelled; counter not persisted.
**Fix:** Wait for all pending writes (with timeout) before showing result; "Couldn't save" path on timeout.


#### T252 — Username availability race vs `auth.signUp` — **MEDIUM**
**File:** `AuthViewModel.swift:249-278`. Available at check-time → taken between check and signup → signup row has NULL username; trigger seeds NULL.
**Fix:** Surface "username unavailable" + rollback auth row on race detect.


#### T263 — `PrivacyInfo.xcprivacy` privacy manifest unverified — **MEDIUM** (iOS 17+ requirement)
**File:** Both apps. Apple requires `PrivacyInfo.xcprivacy` declaring API usage + tracking domains for any SDK touching sensitive APIs.
**Fix:** Add `PrivacyInfo.xcprivacy` for both apps; declare APIs used (file timestamp, system boot time, disk space, etc.) and tracking domains (none, ideally).

### Attorney / Legal (T264-T273)




---

## LAUNCH BLOCKERS (moved from TODO.md 2026-04-27)

These items are launch-gate-class: ship/decide them before AdSense or Apple-review submission. Owner-driven; not autonomous.

### T2 — Cookie consent banner missing — AdSense approval blocker — **CRITICAL** (owner decided: Funding Choices)
**Decision (2026-04-27):** Owner picked **Funding Choices** (option A — free, Google-supported, single-script integration). Implementation deferred until AdSense console access is set up by owner.
**File:** `web/src/app/layout.js` (verified — only mention of consent is a TODO comment at line 166 about a "consent-gated loader once the CMP is installed"; no `CookieBanner`/`ConsentBanner` component exists anywhere in `web/src/`).
**Problem:** GA4 + AdSense load unconditionally. AdSense approval is at risk; EU traffic is legally exposed.
**Fix when ready:** (1) Owner enables Funding Choices in the Google AdSense / Funding Choices console + selects EEA/UK/CH coverage. (2) Owner provides the publisher ID + script tag from the console. (3) Code adds the script to `web/src/app/layout.js` above the existing `ga4-loader` / `ga4-init` / `GAListener` / AdSense script tags, gated so those scripts only load on accepted consent (Google's Funding Choices supplies the standard consent-state API — `googlefc.callbackQueue.push(...)` or the IAB TCF `__tcfapi`). (4) Persist consent state via the CMP's own cookie (no extra localStorage needed). Reject keeps scripts off. (5) Update `web/src/app/cookies/page.tsx` copy to reflect the live banner (T288 already softened it; replace with truthful "first-visit banner via Funding Choices" once shipped).
**What I need from owner to ship this:** the publisher ID + the consent-callback shape from the Funding Choices console (different accounts get slightly different snippets). 30-min implementation window once those land.


#### T271 — Missing choice-of-law clause — **LOW** (contract enforceability)
**File:** `terms/page.tsx`. No "Governing Law" section.
**Fix:** Add: "Governed by laws of [Delaware/California], exclusive jurisdiction in [county/state]."


