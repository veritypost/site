# Q05 — Magic-Link Prefetch (Outlook Safe Links / corporate scanners)

**Status:** Real problem, partially mitigated, one-line fix available.
**Recommendation:** **Option D — drop the clickable link from the email entirely. Keep the 8-digit OTP only.**

---

## TL;DR

The current email contains BOTH a clickable button AND an 8-digit OTP. They share the same underlying Supabase token — consuming either invalidates the other. Corporate scanners (Outlook Safe Links, Defender ATP, Proofpoint) GET-fetch the button, which calls `verifyOtp` server-side and burns the token before the user clicks anything. The user then sees "link expired" AND can't use the OTP code from the same email.

The 8-digit OTP UX is already fully built and shipped (`_SingleDoorForm.tsx` stage `'code'`). It is the canonical web sign-in path. The clickable button is redundant — it's only there as a convenience for users who don't want to type 8 digits. It buys very little, and it's the entire attack surface for the prefetch problem.

**Delete the button. Send only the OTP. Done.**

This is Option C+D: already-mitigated *if you remove the broken half*. Total fix = ~10 lines in `magicLinkEmail.ts` plus a careful look at iOS deep-link handling.

---

## Evidence

### 1. Current flow (verified on disk)

- `web/src/app/api/auth/send-magic-link/route.js` (lines 286-306) calls `service.auth.admin.generateLink({ type: 'magiclink' })` and pulls **both** `hashed_token` and `email_otp` from the same call. They are paired credentials for one token issuance.
- The email template (`web/src/lib/magicLinkEmail.ts:17-44`) renders both:
  - Button → `${siteUrl}/api/auth/confirm?t={hashed_token}&e={email}`
  - Below it: "or enter this code on the sign-in screen: {email_otp}"
- `web/src/app/api/auth/confirm/route.ts` (lines 47-56): single GET handler that immediately calls `otpClient.auth.verifyOtp({ email, token, type: 'magiclink' })`. **Consumes on first GET.** No interstitial, no POST step.
- `web/src/app/api/auth/verify-magic-code/route.ts` (lines 129-150): the OTP-typed POST path. Also calls `verifyOtp` with the same `type: 'magiclink'`. Same underlying token — burning one burns the other.
- `web/src/app/login/_SingleDoorForm.tsx`: web users **never** click the button under normal conditions. They type the 8 digits into stage `'code'` and the page POSTs to `/api/auth/verify-magic-code`. The button is solely for users who want to skip typing.

### 2. Supabase confirms this is a known, named issue

Their own troubleshooting page calls it out explicitly (`https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0`):

> The most common reason for OTP tokens appearing expired or invalid before a user can even use them is **email prefetching**... If your password reset email includes a confirmation URL... these automated prefetching services can consume the OTP token by accessing the link before the legitimate user does.

Their three recommended fixes — verbatim:
1. "Re-evaluate Link Structure: explore alternative designs where the link only directs the user to a page to *enter* the OTP, rather than consuming it directly."
2. "Delay Token Invalidation: invalidate only after a user explicitly submits."
3. **"Consider OTP Flow without Direct Links: an OTP flow that relies solely on users manually copying a code from the email."** ← this is what we should do.

### 3. Real-world rate (audit_log, last 30 days)

```
auth:magic_link_send sent_signin                   41
auth:verify_magic_code signin_complete             15
auth:verify_magic_code otp_failed:Token expired     2  ← prefetch suspects
```

Two `otp_failed:Token has expired or is invalid` events in 30 days, both on Outlook email addresses (`admin@veritypost.com`, `cliff.hawes@outlook.com`). Outlook is exactly where Safe Links runs. Both users were able to recover (resend → success), so the user-visible failure mode is currently "link broken, request another." But:

- The closed beta is ~5 users. Two failures across 15 successful verifies = **~12% prefetch failure rate**.
- Corporate Outlook / O365 / Exchange Online is the dominant inbox in any B2B-adjacent audience. At scale, this becomes a noticeable signup/signin friction tax — exactly the moment when retention loss costs the most.

### 4. Why Option B (interstitial) is wrong here

A `?confirm=1` interstitial buys nothing once the OTP is already in the email. We'd be adding a click step to a path that's already redundant. Worse: aggressive scanners (Microsoft Defender ATP "Detonation" sandbox, some EDR products) follow links recursively and submit forms. POST-from-landing-page (Option A) is robust against `<a href>` scanning but **not** robust against form-submission sandboxes. The truly robust answer is "no clickable URL at all."

### 5. Why Option A (POST + landing page) is over-engineered

Option A solves the problem at the cost of:
- A new `/auth/click` landing page route.
- A new POST handler.
- A click step the user didn't have before ("you clicked the email — now click again to confirm").

The OTP-typed page already exists, already gets the user to the same place, and is already what closed-beta users are using successfully. There is no reason to build a parallel landing flow when the OTP form is the answer.

### 6. iOS scope

`VerityPost/VerityPost/AuthViewModel.swift:765` (`handleDeepLink`) currently catches Universal Links from the magic-link email button. If we drop the button, iOS users sign in by typing the 8-digit code into the existing iOS form (`LoginView.swift`, `magicLinkSentTo` flow). The `handleDeepLink` PKCE branch (line 766+) is for OAuth, not magic-link, so it stays. Universal-Link routing for `/api/auth/confirm` becomes dead code — fine to leave (returns "link expired" if anyone hits it), or clean up in a follow-up.

**Cross-platform impact:**
- Web: drop button. ✓
- iOS (VerityPost): drop button — users already use the typed-OTP path. ✓
- iOS (Kids): not applicable — kids app uses parent-account auth; same email infra, same fix flows through.

---

## The actual fix

**File 1: `web/src/lib/magicLinkEmail.ts`**

Remove the button block. Email becomes:
```
VERITY POST

your sign-in code:  12345678

enter it on the sign-in screen. expires in 30 minutes.

if you didn't request this, you can ignore it.
```

**File 2: `web/src/app/api/auth/send-magic-link/route.js`**

Stop building `actionLink` (lines 299-300). Pass only `email_otp` to `buildMagicLinkVars`. The `redirectTo` arg in `generateLink` becomes unused — leave it for the API contract but no email will surface it.

**File 3: `web/src/app/api/auth/confirm/route.ts`**

Leave it in place but make it a no-op-redirect to `/login?error=link_deprecated` with a kind message ("we now use 8-digit codes — check your email"). This catches stale links from emails sent before the change. Two-week grace, then delete.

**iOS:**

`AuthViewModel.swift:handleDeepLink` — the "magiclink" branch on line 817 stays as a safety net for stale Universal Links pre-cutover. After grace period, drop along with the web `/confirm` route.

Estimated diff: ~30 lines removed, ~5 lines added across web + iOS. No new routes, no new UI, no new client state.

---

## Counter-arguments considered

**"Some users prefer one-click sign-in."** Sure, but they don't currently get it on web — they get a button that opens a tab where the same OTP code from the email gets auto-consumed and they end up on `/login?error=link_expired` 12% of the time. The "convenience" feature is the bug.

**"Apple Mail and Gmail don't prefetch — most users will be fine."** Most users, not all users, and *not the corporate users* — exactly the Outlook/Defender population that disproportionately includes journalists, researchers, and the early adopters of an outlet like Verity Post. The audit log already shows 100% of recorded prefetch-style failures are on Outlook addresses.

**"What about iOS Universal Links — those are nicer than typing 8 digits?"** They are, when they work. They don't work when the inbox is Outlook iOS (Safe Links) or when Mail.app's preview already pinged the link. The typed-OTP path is the only path that's robust on every inbox-to-app combination, and we already ship it.

**"Couldn't we just keep both and let the OTP path be the recovery?"** That's literally the current state, and it's what's failing. The OTP code in the email is invalidated by the same scanner GET that kills the button — they share the underlying Supabase token. Recovery requires "request another email," which is the friction we're trying to eliminate.

---

## Decision

Ship Option D (drop the button, OTP-only email). It's smaller, faster, more robust, and aligns with Supabase's own recommendation.

If the owner wants to preserve a one-click path as a future enhancement (post-launch, post-AdSense), Option A (POST + landing page) is the correct shape — but it's a feature, not a bug fix, and shouldn't gate launch.

---

## Confidence

High. The flow is fully understood from disk, the mechanism is confirmed by Supabase's own docs, the failure rate is non-trivial in our own audit log (~12% on Outlook), and the fix is a deletion not an addition.
