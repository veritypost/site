# TODO — Pre-Launch

Genuine pre-launch / launch-gate work only: AdSense approval requirements, Apple App Review requirements (adult + kids), Sentry-launch decisions, COPPA compliance gates. Each entry is freshly verified against current code at write time.

---

## CRITICAL — blocks Apple Kids submission

## K12 — Pair-code flow is not COPPA-valid Verifiable Parental Consent — CRITICAL

**Verified:** 2026-04-27 against `web/src/app/api/kids/generate-pair-code/route.js`, `web/src/app/api/kids/pair/route.js`, `web/src/app/privacy/kids/page.tsx`.
**Gate:** COPPA + Apple Kids Category K2.
**Owner action needed:** Pick a VPC mechanism (KBA / payment metadata re-verify / government-ID vendor) before submission. This is the only blocker the kids team can't ship around — the rest of K1-K14 is mechanically completable.
**Current state in code:**
- Parent (logged in to web/iOS adult app) generates a pair code at `web/src/app/api/kids/generate-pair-code/route.js:1-87`. The code is 6-16 chars alphanumeric, TTL is 24h (T301 follow-up shipped).
- Kid types code into kids app; `web/src/app/api/kids/pair/route.js:34-175` validates the code against `parental_consents`, mints kid JWT, logs consent with timestamp + parent_user_id + IP + UA.
- `parental_consents.consent_method` is currently stamped `'pair_code_redeem_v1'`.
- `/privacy/kids` page (lines 106-122) describes the mechanism and acknowledges it's being upgraded.
**What's missing:** Knowledge-based-auth, payment-metadata re-verify, or vendor-issued ID check before the code mints. Without it, anyone with parent's password (or in same household, or with a screenshot of the code) can pair an unrelated kid device.
**Fix:** Pick mechanism →
- (A) **KBA** — 3-of-5 secret questions set at parent signup, replayed at code-generate time. Lowest cost; modest fraud resistance.
- (B) **Stripe payment metadata re-verify** — re-prompt the saved card on file (e.g., $0.01 auth) when a parent generates a code. Strong identity binding for paying users; no path for free-tier parents.
- (C) **Government-ID vendor** (Jumio / Persona / Stripe Identity) — strongest, highest cost + privacy-policy implications.

After owner picks: stamp the chosen identifier in `parental_consents.consent_method`, update `/privacy/kids` to disclose the method, run a sample audit row through FTC's accepted-methods list before submission.

---

## K8 — Kids App Store Connect metadata + listing — CRITICAL

**Verified:** 2026-04-27 against `web/src/app/profile/kids/page.tsx:662` (placeholder `KIDS_APP_STORE_URL = null`).
**Gate:** Apple Kids submission.
**Owner action needed:** Submit kids app to App Store Connect with the required metadata: title, description, age-band declaration (5-8 / 9-11 — pick), Made-for-Kids designation, kid-specific screenshots, age rating COPPA acknowledgment, privacy policy URL pointing at `/privacy/kids`, contact info for parents.
**Current state in code:** Code references a constant that flips to the live App Store link once Apple approves. Everything else (Info.plist, deep links, parental gate, server quiz, kid-specific privacy notice) is in place.
**What's missing:** Owner-driven submission flow + Apple review cycle.
**Fix:** When owner is ready to submit, walk the App Store Connect form. Once approved, flip `KIDS_APP_STORE_URL` to the live link.

---

## CRITICAL — blocks AdSense approval

## T2 — Cookie consent banner missing — CRITICAL

**Verified:** 2026-04-27 against `web/src/app/layout.js:137-175`, `web/src/app/cookies/page.tsx:130-131`.
**Gate:** AdSense approval + EU/UK/CH legal exposure.
**Owner action needed:** Provide Google Funding Choices publisher ID + the consent-script snippet from the Funding Choices console (different accounts get slightly different snippets).
**Current state in code:** GA4 (`afterInteractive`) loads unconditionally at lines 145-158. AdSense script loads only when `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` is set (currently unset). No cookie consent banner component exists. Cookies policy page explicitly says "An in-app cookie consent banner is coming."
**What's missing:** The Funding Choices script + consent gate around GA4 + AdSense.
**Fix:** Once owner provides publisher ID:
- Add Funding Choices `<script>` to `web/src/app/layout.js` above the existing GA4 / AdSense tags.
- Wrap GA4 + AdSense script tags in a consent-state check (`googlefc.callbackQueue` or IAB TCF `__tcfapi`).
- Update `web/src/app/cookies/page.tsx` to remove the "coming soon" line and describe the live banner.
- Persist consent via the CMP's own cookie — no extra localStorage layer.
~30 min implementation once snippet lands.

---

## CRITICAL — blocks legal enforceability

## T271 — Missing choice-of-law (Maine) clause in Terms of Service — HIGH

**Verified:** 2026-04-27 against `web/src/app/terms/page.tsx` (read end-to-end — 9 sections, none mention governing law / Maine).
**Gate:** Contract enforceability + Apple submission "support / privacy / TOS URL" requirement.
**Owner action needed:** Owner-drafted clause language + insertion. Maine direction is locked.
**Current state in code:** No "Governing Law", "Choice of Law", "Jurisdiction", or "Venue" section anywhere. No mention of Maine.
**What's missing:** A new section.
**Fix:** Add section 10 "Governing Law & Jurisdiction": _"This Agreement is governed by the laws of the State of Maine, without regard to conflicts-of-law principles. Any dispute arising under this Agreement shall be resolved exclusively in the state or federal courts located in [pick county] County, Maine, and the parties consent to the personal jurisdiction of those courts."_ Update version date in footer.

---

## HIGH — Apple Adult App Review

## T1.1 — APNs entitlement is `development` in production — CRITICAL

**Verified:** 2026-04-27 against `VerityPost/VerityPost/VerityPost.entitlements:9-10`.
**Gate:** Apple App Review + post-launch push delivery.
**Owner action needed:** Confirm APNs production cert/key are configured server-side; then iOS dev flips the entitlement.
**Current state in code:** `aps-environment` value is `development`. TestFlight masks this; on production App Store release, **100% of production users get zero push notifications**. Breaking news, reply alerts, expert answers — all silent.
**What's missing:** Flip `<string>development</string>` → `<string>production</string>`.
**Fix:** 5-minute iOS edit. TestFlight build with the flipped entitlement; send a real push from the staging server to a real device; verify delivery before App Store submit.
**Risk:** None if the production cert is in place server-side.

## T1.2 — Sign in with Apple buttons are dead — CRITICAL (Apple Review reject vector)

**Verified:** 2026-04-27 against `VerityPost/VerityPost/LoginView.swift:40` + `SignupView.swift:96` (both render `SignInWithAppleButton`); `VerityPost.entitlements:13-18` confirms SIWA entitlement was deliberately removed.
**Gate:** Apple Guideline 4.8 (third-party logins requiring functional native SIWA).
**Owner decision:** **LOCKED 2026-04-27 — delete the buttons.** SIWA is v1.1; not launch-day necessary. 30-min cleanup, not a 4-5h restoration distraction.
**Current state in code:** Both buttons render. Tapping falls back to web OAuth which returns no session. App Store reviewer **will** reject.
**Fix:** Delete `SignInWithAppleButton` from both `LoginView.swift:40` and `SignupView.swift:96`. Drop any `AuthenticationServices` imports that become unused. Remove `AuthViewModel.completeAppleSignIn` if it exists. Drop the `fallbackToWebSignInWithApple` path in `AuthViewModel.swift`. Also drop the matching Google button + `signInWithGoogle` paths since they share the same web-fallback mechanism (verify they exist before removing).
**Note:** This supersedes the prior A5 reference to "SignInWithApple is still in the iOS code; AUTH-MIGRATION will remove it." T1.2 is the explicit removal action.

## T1.3 — APNs token never deleted on logout — CRITICAL (cross-account leak)

**Verified:** 2026-04-27 against `VerityPost/VerityPost/PushRegistration.swift:20-22`.
**Gate:** Apple App Review (privacy / cross-account) + COPPA-adjacent (kid device re-pair).
**Owner action needed:** None — pure iOS + small server RPC migration, but billing-cohort relevance flag.
**Current state in code:** `setCurrentUser(nil)` (logout) only clears an in-memory variable. The `user_devices` row inserted by `upsert_user_push_token` is never deleted on logout, account-switch, or app uninstall. User A logs out on a shared device → User B logs in → push for "User A's reply" routes to that device.
**What's missing:** A `delete_user_push_token` RPC + iOS calls on `AuthViewModel.logout()` (before clearing session) AND on `setCurrentUser(newId)` if `newId != previousId`.
**Fix:** Migration draft for the RPC; iOS `logout()` calls it before nil'ing the session; iOS `setCurrentUser(newId)` calls it when switching accounts. Smoke: logout → verify `user_devices` row gone for that token; login as different user → push routes correctly.
**Cross-link:** Related to T250 (APNs token arrives before `setCurrentUser()` — registration race) — both touch the same `user_devices` lifecycle. Ship together.

## A1 — Push permission cold-fire branch — HIGH

**Verified:** 2026-04-27 against `VerityPost/VerityPost/PushRegistration.swift:27-40`.
**Gate:** Apple HIG ("App Review may flag this in subjective review").
**Owner action needed:** None — pure iOS code fix in any iOS session.
**Current state in code:** `.notDetermined` branch at lines 31-34 still calls `UNUserNotificationCenter.current().requestAuthorization(...)` directly. Cold-fire system dialog.
**What's missing:** That branch needs to be removed so the only path to the system dialog is via `PushPromptSheet` → `PushPermission.requestIfNeeded()`.
**Fix:** Delete lines 31-34. Verify that nothing else in the codebase relies on `registerIfPermitted()` minting the system dialog for `.notDetermined` users.

---

## A7 — Magic-link reviewer test path — HIGH

**Verified:** 2026-04-27 against repo grep for `apple-reviewer`, `?token=`, reviewer-bypass — zero hits.
**Gate:** Apple App Review (reviewer can't sign in without a path).
**Owner action needed:** Pick mechanism + provision the account.
**Current state in code:** Magic-link is the only signin path on iOS once AUTH-MIGRATION ships. No reviewer-bypass token, no pre-provisioned reviewer email.
**What's missing:** Pre-provisioned reviewer account (e.g., `apple-reviewer@veritypost.com`) accessible to a reviewer in App Review notes — either via long-lived magic-link bypass token, or owner-controlled inbox.
**Fix:** (A) Pre-provisioned token — simpler for review iteration: mint a long-lived reviewer token in code, put it in App Review notes, scope it to one bypass account. (B) Live magic-link to a real inbox the reviewer can access — owner provides the address + check inbox during review window.

---

## A9 — Split age-of-13+ from Terms/Privacy on iOS signup — HIGH

**Verified:** 2026-04-27 against `VerityPost/VerityPost/SignupView.swift:235-266`.
**Gate:** Apple App Review + COPPA-style explicit age confirmation.
**Owner action needed:** None — iOS code fix.
**Current state in code:** Single `agreed` boolean at line 26 gates submit. Combined-checkbox copy: _"I'm 13 or older and agree to the Terms and Privacy Policy."_
**What's missing:** Two separate checkboxes.
**Fix:** Add `@State agreedAge: Bool = false` and `@State agreedTerms: Bool = false`. Two checkbox rows with copy: _"I am 13 or older"_ and _"I agree to the [Terms](veritypost.com/terms) and [Privacy Policy](veritypost.com/privacy)"_. Submit gate on `agreedAge && agreedTerms`. Note: web `/signup` is now a redirect stub under AUTH-MIGRATION → web parity is N/A.

---

## A10 — Trial terms inline on plan cards — HIGH

**Verified:** 2026-04-27 against `VerityPost/VerityPost/SubscriptionView.swift:194-248` (plan cards), 55-113 (legal copy collapsed).
**Gate:** Apple Guideline 3.1.2.
**Owner action needed:** None — iOS code.
**Current state in code:** Plan cards show title + price + feature list. Legal disclosures consolidated below the fold in a collapsed section. No per-plan trial banner.
**What's missing:** Per-plan inline trial copy.
**Fix:** After the price text on each paid plan card, add `_"7-day free trial, then $X/[period]. Cancel anytime."_` — uses StoreKit's introductory offer if present, else the configured trial duration.

---

## A11 — "Delete Account" out of "Danger zone" — HIGH

**Verified:** 2026-04-27 against `VerityPost/VerityPost/SettingsView.swift:789-796` (Danger zone header) + 984-993 (delete-account row in privacyRows section).
**Gate:** Apple Guideline 1.4.1 (account deletion must be readily discoverable).
**Owner action needed:** None — iOS code.
**Current state in code:** "Delete Account" is already in privacyRows (not danger). The Danger zone section still exists but only contains "Sign out" — overlabeled.
**What's missing:** Either rename the section header to something soft ("Session" / "Sign out") or remove the section entirely so signout is a top-level row.
**Fix:** Rename "Danger zone" → "Sign out" with no destructive tone. Remove the `tone: .danger`. Verify "Delete Account" is on screen above the fold of the privacy section.

---

## A12 — `UIDevice.current.name` PII upsert — HIGH

**Verified:** 2026-04-27 against `VerityPost/VerityPost/PushRegistration.swift:70`.
**Gate:** Apple Privacy Guidelines 5.1.1 + privacy nutrition label disclosure.
**Owner action needed:** None — iOS code.
**Current state in code:** Line 70 persists `UIDevice.current.name` (commonly customized to include real names like "Alice's iPhone") into the `user_devices` table.
**What's missing:** Replace with a generic device-type string.
**Fix:** Replace `UIDevice.current.name` with a constant or a derived generic — pick one of (a) `UIDevice.current.model` (returns "iPhone" / "iPad" / "iPod touch" — minimal, no PII); (b) static `"iOS Device"`; (c) drop the field entirely if the server doesn't act on it (search `user_devices.device_name` for any consumer first). The field is used at `web/src/app/api/users/[id]/devices` etc. — quick caller audit before the swap.

---

## OWNER-driven Apple submission gates (no code work)

## A3 — App Store Connect submission metadata — OWNER

**Verified:** 2026-04-27 — `VerityPost/VerityPost/Info.plist` is well-formed; URL deep-link scheme `verity://` present; site URL referenced via `$(VP_SITE_URL)` env var.
**Owner action needed:** Walk the App Store Connect submission form: app icon (1024×1024); screenshots (iPhone 6.7", 6.5", 5.5"; iPad if supporting); app name + subtitle + description + keywords; support URL + marketing URL + **privacy policy URL** (mandatory — `/privacy`); age rating questionnaire; privacy nutrition label declarations; ATT framework declaration ("no" — Verity isn't tracking); export-compliance answer (`ITSAppUsesNonExemptEncryption=NO`); demo account credentials for App Reviewer (see A7); App Review notes explaining quiz-gating, expert verification, kids pairing.

## A4 — StoreKit / IAP gates — DONE in code, OWNER-VERIFY

**Verified:** 2026-04-27 — `VerityPost/VerityPost/StoreManager.swift:59-95` (product IDs configured for verity.monthly/annual, family.1kid–4kids monthly/annual); `web/src/app/api/stripe/checkout/route.js:48-61` (Family routes to StoreKit only); `web/src/lib/appleReceipt.js:1-266` (full StoreKit 2 JWS verification with x5c chain validation against Apple Root CA-G3).
**Owner action needed:** Verify in App Store Connect: subscription products configured matching the iOS product IDs; monthly + annual variants; subscription group with proper Verity↔Pro upgrade hierarchy; Family Sharing eligibility flagged on family tiers.

## A6 — TestFlight pipeline — OWNER

**Owner action needed:** Add internal testers; optional external beta; submit build for App Store review.

## A8 — Apple Developer console walkthrough — OWNER

**Owner action needed:** When ready, walk the dev console: Bundle IDs (com.veritypost.app + kids); provisioning profiles (dev + distribution); APNs cert renewal cadence; TestFlight setup; App Store Connect record creation for both apps.

## T3.4 — Universal Links not configured on iOS — HIGH

**Verified:** 2026-04-27 — no `com.apple.developer.associated-domains` entitlement in either iOS app.
**Gate:** Apple deep-link share UX + graduation flow + kids-app handoff.
**Owner action needed:** Configure Associated Domains in Apple Developer console; provide AASA (apple-app-site-association) JSON to publish at `https://veritypost.com/.well-known/apple-app-site-association`. Then iOS dev adds the entitlement + `userActivityHandler`.
**Current state in code:** Article share links open Safari. Graduation deep-link impossible (the iOS-first family loop breaks). Kids-app handoff to articles opens web.
**What's missing:** Apple Dev console step + AASA JSON publish + iOS entitlement + deep-link handler.
**Fix:** Standard Universal Links setup. Publish AASA at `/.well-known/apple-app-site-association` covering: `/story/<slug>`, `/u/<username>` (when public profile flips), `/welcome?graduation_token=<token>` (T3.2-bundled). iOS `userActivityHandler` for `https://veritypost.com/...` paths routes via NavigationStack programmatic push.
**Bundles:** With T3.2 in TODO-OWNER (graduation deep-link decision). If owner picks Phase 5.6 bundle, T3.4 is a hard dependency.

---

## OWNER-driven Sentry-launch decisions

## S1 — Confirm `SENTRY_DSN` is set in Vercel prod — OWNER

**Verified:** 2026-04-27 — SDK plumbing intact: `web/src/instrumentation.ts:15-24`, `web/sentry.client.config.js:10-34`, `@sentry/nextjs ^8.40.0` in deps. Code is DSN-guarded — missing DSN = silent no-op.
**Owner action needed:** Check Vercel project settings → Environment Variables. Confirm `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client) are set in production scope. Result tells us whether memory's "Sentry deferred" note is current or stale.

## S2 — Sentry scope at launch — DONE in code, OWNER-LOCK

**Verified:** 2026-04-27 — `web/sentry.client.config.js:24-26` + `web/src/instrumentation.ts:29` set `tracesSampleRate: 0`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`. Errors-only mode wired and deliberate.
**Owner action needed:** Re-confirm errors-only is the launch scope. (Memory says "deferred" — if owner is not flipping the DSN at all, plan stays no-op.) If flipping ON: errors-only is the right floor. Revisit at first paying customer for perf sampling.

## S3 — PII scrubber audit — OWNER

**Verified:** 2026-04-27 against `web/sentry.shared.js:11-88`. Coverage: emails (regex), Authorization/token headers, password / token / api_key / secret request body keys, user.ip_address + user.email context.
**Owner action needed:** Confirm whether unstructured user-generated content (comment bodies, expert Q&A free text, DM contents) is in-scope for redaction. Today's scrubber catches that content only when it happens to match an email or token pattern. Decision: do we add a content-key blocklist (e.g., `body`, `comment`, `message`, `dm`) to the scrubber, or live with the current behavior (low risk if only error context is captured, not request bodies)?

## S6 — Sentry project IP allowlist / API auth posture — OWNER

**Verified:** 2026-04-27 — code-side env is correct (`web/.env.example` shows DSN, ORG, PROJECT, AUTH_TOKEN). Project-console settings are owner-side.
**Owner action needed:** In the Sentry project console verify (a) IP allowlist is empty OR includes Vercel's egress range; (b) `SENTRY_AUTH_TOKEN` (used for sourcemap upload at build time) is scoped down to release uploads only, not full project-admin; (c) browser DSN is rate-limited (avoid attacker flood).

---

## NOT_DONE Sentry items — pre-launch only (do not migrate to TODO-AUTONOMOUS)

**Owner directive 2026-04-27:** All Sentry items are gated on the Sentry-launch decision (paid tool; deferred until revenue / paging pain per `feedback_sentry_deferred`). Engineering shape is autonomous, but the tool cost is what blocks — keep these here even if the fix itself looks pickable.

## S4 — `observability.captureException` extras leak PII — MEDIUM

**Verified:** 2026-04-27 against `web/src/lib/observability.js:46-53`.
**Gate:** GDPR/compliance — same risk class as S3.
**Current state in code:** `captureException(err, context)` passes `context` keys directly to `scope.setExtra(k, v)`. Sentry's `beforeSend` scrubber processes `event.request / user / message / exception / breadcrumbs` only — `extras` aren't touched.
**What's missing:** Filter context keys before `setExtra`.
**Fix:** Reuse the `REDACT_BODY_KEYS` regex/list from `web/sentry.shared.js`. Either (a) iterate `context` and skip + redact matching keys in `observability.js`, or (b) add a small `extras` walk to the existing `beforeSend` scrubber so it covers the ingest path too. (b) is more durable — the scrubber stays the single source of truth for redaction.
**Pre-launch:** Yes — flip-on-DSN should not happen until this is sealed.

## S5 — Sentry instrumentation TypeScript hygiene — LOW

**Verified:** 2026-04-27 against `web/src/instrumentation.ts:21-22, 31-32`.
**Gate:** none (pure type hygiene). Listed pre-launch only because it's same-edit as S4.
**Current state in code:** `scrubPII: (e: unknown) => unknown` and `beforeSend: scrubPII as (event: unknown, hint: unknown) => unknown` use unknown + assertions instead of `BeforeSendCallback`.
**What's missing:** Proper `@sentry/types` import.
**Fix:** Import `BeforeSendCallback` from `@sentry/types` and type `scrubPII: BeforeSendCallback`. Done concurrently with S4 since the surface is the same file.

## S7 — Sentry sourcemap upload + release tagging — DONE

**Verified:** 2026-04-27 against `web/next.config.js:53-85`. `withSentryConfig` wraps Next.js with `silent: true`, `org`, `project`, `authToken`. Sourcemap upload implicitly enabled. Release tagging via `process.env.VERCEL_GIT_COMMIT_SHA`.
**No action needed.**

---

## Web push (browser notifications) — pre-launch decision

**Owner directive 2026-04-27:** moved from `TODO-AUTONOMOUS.md` to here — engineering shape is autonomous, but it's a real product feature (not a cleanup item) that needs launch sequencing, owner-side VAPID key handling, and a service-worker operational risk decision before shipping. Treat as pre-launch only; do not migrate back to autonomous.

## T92 — No web push at all — HIGH (return-visit lever)

**Verified:** 2026-04-27 — `web/public/` has no service-worker.js / sw.js. Code grep: zero VAPID, pushManager, /api/push/subscribe references. Settings page comment at `profile/settings/page.tsx` explicitly notes web has no service worker / VAPID / PushSubscription wiring.

**What's missing:** Web has zero ambient notification channel. iOS APNs ships breaking news + reply alerts; web users (~80% of base) get nothing — no OS-level toast when a comment they wrote gets a reply, no breaking-news ping when their browser is closed. Major engagement lever absent on the primary surface.

**What "shipping it" means:** Real OS-level desktop / mobile-browser notifications (Chrome / Edge / Firefox on Mac/Win/Linux/Android; Safari on macOS 13+; Safari on iOS 16.4+ via add-to-home-screen). Toast slides into the OS notification center even when the browser tab is closed. Click → opens the relevant Verity Post page.

**Fix shape (8-12 hour focused build):**
1. Generate VAPID keypair → store private key in env, public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. **Owner generates the keypair.**
2. Service worker `web/public/sw.js` — handle `push` events + `notificationclick`. Operational-risk territory: a bad SW caches assets and can break the site for users; ship behind a kill-switch flag.
3. `/api/push/subscribe` POST — store subscription in a new `push_subscriptions` table with RLS (auth.uid() owns rows). **Owner applies migration.**
4. `/api/push/unsubscribe` POST — soft-delete on revoke.
5. Wire delivery into the existing `notification_deliveries` cron (which already targets APNs) — fan out to web subscriptions in parallel via `web-push` library.
6. Opt-in pre-prompt at value moments (first comment posted, first article saved) — never cold-fire on landing. Cold-fire kills acceptance rate forever; the pre-prompt is the most consequential UX decision in the whole feature.

**Tier:** T4 (cross-surface, security-sensitive — service worker scope, VAPID key handling, RLS on subscriptions table, opt-in prompt timing).

**Pre-launch gate:** none strictly — site can launch without it. But web users churning silent post-launch is the single biggest engagement-floor risk for a content product. **Recommend: ship before AdSense traffic ramps.** Owner decides whether to launch with or without; this entry stays here as the canonical home until shipped.

**Bundling:** standalone session. Do not fold into any other batch run.

---

## NOT_DONE Apple Kids — autonomous fixes inside iOS / kids server session

## K13 — Kid soft-delete doesn't hard-purge after grace — HIGH

**Verified:** 2026-04-27 against `web/src/app/api/kids/[id]/route.js:99-104` (`is_active=false` flip), `web/src/app/api/cron/process-deletions/route.js:1-116` (sweeps adult deletions only — kid tables not enumerated), `web/src/app/api/cron/sweep-kid-trials/route.js:1-45` (trial freeze — no purge), `web/vercel.json` (no kid-purge schedule).
**Gate:** COPPA 16 CFR § 312.6(a) — 30-day deletion of collected child data.
**Current state in code:** Soft-delete flips the active flag. No daily cron hard-deletes child rows after the grace window. `/privacy/kids` already disclaims a 30-day grace, so the contract is published — the cron is what's missing.
**What's missing:** Daily cron route + Vercel schedule.
**Fix:** New route at `web/src/app/api/cron/purge-soft-deleted-kids/route.js`. Calls a SECURITY DEFINER RPC `purge_soft_deleted_kids()` that hard-DELETEs from `kid_profiles`, `reading_log`, `quiz_attempts`, `user_achievements`, `parental_consents` where `kid_profiles.is_active=false AND kid_profiles.updated_at < now() - interval '30 days'`. Audit the deletion to a locked `_audit_purged` table for compliance proof. Register the cron in `web/vercel.json` (daily, low-traffic hour).
**Schema layer:** Yes — RPC is a T5 schema item. Draft migration file under `Ongoing Projects/migrations/`, queue for owner apply.

## K15 — Kids iOS app push payload PII review — HIGH (COPPA gate before submission)

**Verified:** 2026-04-27 — kids iOS app currently has no push registration code (see TODO-AUTONOMOUS T3.10 for the build half).
**Gate:** Apple Kids Category (push payload review under COPPA).
**Owner action needed:** Once T3.10 (kids iOS push registration) lands and a kid device receives a real push, **review the actual payload** before Apple Kids submission. Any PII in the payload (kid display name, parent email, etc.) is a COPPA risk.
**What's missing:** A review pass after T3.10 ships. Acceptable payload content: opaque IDs (article_id, comment_id), tier-neutral copy ("New article from your family's expert"). Unacceptable: kid name, kid age band, parent email, any free-text user content from comments/messages.
**Fix:** When T3.10 is ready for staging tests, send 3-5 sample push payloads to a test kid device. Capture the JSON via Console.app or device logs. Walk through every field; redact any PII at the server-side payload-build step.
**Bundles:** Ships in the same Apple Kids submission window as K12 + K8.

## K14 — Parent has no in-app data-export or granular review — MEDIUM

**Verified:** 2026-04-27 against `web/src/app/profile/kids/page.tsx` (KPI summary + binary delete only) + grep for `/api/kids/[id]/data-export` (zero results) + `/privacy/kids` section 4 ("export available on request via legal@ — currently email-only").
**Gate:** COPPA 16 CFR § 312.5 — parents must be able to review collected data + refuse further collection.
**Current state in code:** Email-only export ("contact legal@…") is documented in the privacy notice. No in-app export endpoint, no per-kid data review UI, no granular collection-toggle (e.g., "stop collecting reading history for this kid").
**Owner action needed:** Pick scope — (A) In-app self-service export endpoint + downloadable JSON, OR (B) keep email-only and document clearly. (B) may pass review if explicitly disclosed; (A) is the strongest posture.
**Fix path A:** New route `web/src/app/api/kids/[id]/data-export/route.js` returning `{kid_profile, reading_log, quiz_attempts, user_achievements, parental_consents}`. New "View & export data" button per kid card in `profile/kids/page.tsx`. Modal with filterable reading log + "Download as JSON" button. Add granular toggles ("Collect reading history" / "Participate in leaderboards" / "Store quiz attempts"). Update `/privacy/kids` section 7 to point at the in-app surface instead of email.

---

## DONE — kids items confirmed complete

K1 (server quiz verdict via `get_kid_quiz_verdict` RPC), K2 (kids privacy notice live at `/privacy/kids`), K3 (zero third-party analytics in kids app), K4 (parental gate wired to unpair / external links / expert sessions / contact), K5 (in-app `support@` mailto), K6 (parent-gated delete UI + DELETE handler — but K13 is the still-open hard-purge half), K7 (no social features in kids app), K9 (parental gate math 12-49 × 2-9 — intentional), K10 (kids deep-link `onOpenURL` is logged-then-no-op stub — Apple-acceptable per their guidance), K11 (kids privacy URL distinct + linked from kids app + parent dashboards).

## DONE — adult Apple items confirmed complete

A2 (in-app deletion path on iOS via DataPrivacyView → `/api/account/delete`), A4 (StoreKit configured + receipt validation), A5 (deep-link `verity://` + magic-link callback wired in `VerityPostApp.swift:15-17` — _SignInWithApple is still in the iOS code; T1.2 above is the explicit removal action_), A13 (article-view tracking gated behind `ss.isEnabled("registration_wall")` + anon-only check at `HomeView.swift:527-545`).

## DONE — Sentry items confirmed complete

S1 plumbing (need owner Vercel verify), S2 (errors-only intentional), S3 (covers structured PII; unstructured content owner-decides), S6 plumbing (need owner console verify), S7 (sourcemaps + release tagging configured).

## DONE — Privacy manifest

T263 (`PrivacyInfo.xcprivacy` exists for both adult + kids apps).

---

## Pre-launch SEQUENCING NOTES

- **Before flipping Sentry DSN ON:** ship S4 (extras scrubber) first.
- **Before AUTH-MIGRATION first traffic:** flip Supabase Auth → "Confirm email" project setting **ON** (currently OFF per owner 2026-04-27). This is logged as part of T345 sequencing in TODO-OWNER.
- **Before submitting kids app to Apple:** K12 VPC mechanism must ship; K8 metadata submission is the moment K12 must already be live; K15 push payload review must happen after T3.10 (kids push registration in TODO-AUTONOMOUS) lands.
- **Before App Store Connect submit (adult):** T1.1 entitlement flipped, T1.2 SIWA buttons removed, T1.3 token-cleanup-on-logout shipped, A1 / A9 / A10 / A11 / A12 done. Demo reviewer test path (A7) provisioned. Apple Dev console walkthrough (A8) complete.
- **Before AdSense submission:** T2 cookie banner must ship + `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` must be set.
- **Before AdSense traffic ramps (post-approval):** ship T92 (web push). Silent web users churn faster than notified ones; web is ~80% of the user base, no ambient notification channel today. Not a strict launch-gate but the highest-leverage engagement lever sitting unbuilt.
- **Before TOS goes to legal review:** T271 governing-law clause inserted.

---

## OWNER LAUNCH PLAYBOOK — Manual QA + TestFlight

This is the gate work that happens AFTER all CRITICAL + HIGH items above ship. Owner-only — agents can't run a real device, real card, or App Store submission.

### 1. Manual click-through on staging (~6h)

- [ ] Sign up via magic-link → verify email → complete onboarding.
- [ ] Buy Verity monthly + annual; cancel; re-subscribe.
- [ ] Buy Family monthly; add 1, 2, 3 kids; remove kids; verify Stripe seat math (line-item count + price) matches.
- [ ] Pair kid iOS app to a parent account; trigger graduation; complete claim flow (T3.2 dependency).
- [ ] Submit DOB correction in younger direction; admin approves + rejects (verifies T0.9 rejection UI is live).
- [ ] Cross-platform test: web sub active → iOS attempt → blocks with platform-conflict error (T2.1 paired-test).
- [ ] Comment + reply (verifies T0.2 fix is live); report a comment; admin hides + unhides (T3.7).
- [ ] Free user → buy paid → comment unlocks (verifies billing perms refresh path).
- [ ] Push notification end-to-end on a real device (verifies T1.1 production entitlement + T1.3 logout cleanup).

### 2. TestFlight build (~3h)

- [ ] Build the release configuration with production entitlements.
- [ ] Real device, real APNs delivery, real StoreKit sandbox purchase (then production purchase on owner's own card).
- [ ] Verify Universal Links open the app for shared article URLs (T3.4).
- [ ] Verify magic-link reviewer test path (A7) works end-to-end.

### 3. Watch logs for 48-72h staging traffic (passive)

- [ ] `pipeline_runs.error_type` daily count — should be flat or trending down.
- [ ] `webhook_log` — zero failures during the watch window.
- [ ] Frozen / grace state lifecycle on a representative cohort.
- [ ] `audit_log` anomalies — admin actions match expected actor + target.

### 4. Run typecheck + tests + Lighthouse + security headers (~2h)

- [ ] `cd web && npm run typecheck` — must be clean. T4.8 redesign cluster TS errors must be resolved (covered in TODO-AUTONOMOUS).
- [ ] `cd web && npm test` — anything red is launch-blocking.
- [ ] Run Lighthouse on home / story / pricing / signup pages — performance + accessibility scores.
- [ ] Verify security headers (CSP, HSTS, Referrer-Policy, X-Frame-Options) match production-target config.

### 5. Apple Review submission (1+ cycle expected)

- [ ] Submit adult app → expect 24-48h first-pass review.
- [ ] Address any Apple feedback; resubmit if needed.
- [ ] Submit kids app — likely needs separate review cycle. K12 (VPC) + K8 (metadata) + K15 (payload review) all must be in place.
- [ ] After approval: flip `KIDS_APP_STORE_URL` constant in `web/src/app/profile/kids/page.tsx:662` to the live link.

---

## Operating constraints (locked 2026-04-27)

**Stripe is LIVE in production. No sandbox.** Every billing-touching fix:
- Cannot be tested against fake cards.
- Owner-tests on a real card (with own known-recoverable account); refund flow ready.
- DB changes affecting billing state staged + dry-run-queryable BEFORE applied; verified against live Stripe Dashboard after.
- Where possible, ship behind a feature flag so rollback is one toggle, not a deploy.

Items most affected (paired AUTONOMOUS code + OWNER test): T0.4 (add-kid-with-seat rollback — riskiest, pair-review required), T2.1 (cross-platform guard), T2.7 (billing RPC idempotency).

**Most launch-blockers don't touch billing.** T0.1, T0.2, T0.3, T0.5, T0.6, T0.7, T0.9 are all billing-independent and ship safely.

**Kids product = iOS only.** Per memory + owner re-confirmation 2026-04-27. Kids web is redirect-only, not active development. All kids-app push / VPC / data-export work targets `VerityPostKids/` and `web/src/app/api/kids/*`. Adult web + adult iOS both stay in scope for parent-side surfaces.

---
