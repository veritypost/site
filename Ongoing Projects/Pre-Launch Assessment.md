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
