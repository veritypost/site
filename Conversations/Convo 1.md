# Convo 1 — Login & Access System Redesign

**Date:** 2026-04-29
**Status at end of convo:** Plan locked. No code written yet. Implementation pending greenlight.

---

## Why this conversation happened

The owner reported that login on the site felt broken in real use. The specific pain: he uses a desktop browser, but his email arrives on his phone. Magic-link sign-in mailed him a link, the link opened on his phone (different browser, different device), and the desktop session never established. He was stuck.

The deeper question wasn't just "fix the magic link." It was: walk through every single piece of the auth surface, figure out what's actually broken, what's brittle, what's contradictory, what's dead, and design something that actually works for real people — including him on his desktop, but also a stranger arriving from a tweet, a friend forwarding an invite, a user who lost access to their old email, and so on.

So this convo did three things in order: a deep code-only investigation across the entire auth surface, a question-by-question discussion of how to redesign it, and a locked plan that someone could now go build from. No implementation happened. The whole thing is upstream of code changes.

---

## What the investigation found

Three parallel deep reads ran across the web app, the iOS apps, and the Supabase schema. They were instructed to read code only — no reading session docs, past conversations, README files, or git history. Just source.

### The headline brokenness

The biggest single issue is that **the login page only supports magic links — and it only supports the link path of magic links, not the 6-digit code path.** Supabase's OTP API actually returns both a clickable link and a 6-digit code in the same email, but our app never wired up a path to consume the code. Combined with the fact that magic links use PKCE (which stores a verifier in the *originating* browser's cookies), opening the link on a different device than where you started fails or creates a session bound to the wrong device. The cross-device problem is structural, not a bug.

There's also no password sign-in form *anywhere* in the UI — even though the backend has half a password system built. Users who managed to set a password through some path have no way to use it. That's just half-finished infrastructure sitting around confusing the picture.

The login page itself uses a three-tab structure ("Sign in" / "Have a code" / "Request access") that confuses returning users. They show up to sign in and see three options that all look like they might apply.

When the beta gate is on and a stranger types their email, the system silently sends nothing but the UI says "Check your inbox." The user waits forever for an email that's not coming. The current behavior is intentional anti-enumeration, but the cost is real users dead-ending with no signal.

A handful of smaller issues: a permission cache flicker on sign-in (perms load asynchronously so components flash from "no access" to "granted" for half a second), session expiry that silently dumps you to login with no explanation, fire-and-forget bookkeeping in the auth callback that leaves stale flags for ~60 seconds if any of the post-login RPCs fail, and a few dead routes (`/api/access-request/confirm`, `/request-access/confirmed`) left over from a removed two-step intake flow.

### What's actually solid

The Supabase schema and the code that calls it are tightly aligned. No drift. Recent migrations (cluster locks, audience state, cost reservations, the permission alias bridge) are all wired correctly with current TypeScript types. The iOS apps are clean — no dead views, COPPA gates intact, no force-unwrap crutches. The tier system (anon / unverified / free / pro / family) is fully wired at the permission layer; pro vs free has real, enforced feature differences. The admin queue for access requests is mostly built and polished — needed extension, not a rewrite.

### The gap that affects the trial model

There's no `pro_until` field and no auto-downgrade-on-expiry job. Today, plan changes happen via Stripe webhooks when real subscriptions expire. There's no equivalent for our beta-trial scenario where users get pro for 30 days then expire to free. Fortunately a field that fits already exists — `comped_until`, which the beta cron sweep already touches — so this is additive, not a new field.

---

## The new shape of login

### One door, not three

Today: three peer tabs forcing the user to figure out which one applies to them.

After: a single page that asks one question — "what's your email?" — and figures out the rest based on state. Returning users land on the same page as new users. Strangers land on the same page too. The page transforms based on what's true after they submit, instead of forcing them to pre-classify themselves.

This matters because the user doesn't know which state they're in until they try. A returning user sees "Sign in" and "Request access" as two options and has to read both. A new user with an invite code sees three options and isn't sure if their code goes in tab 2 or tab 1. The single-door approach removes that whole class of confusion.

The page itself is intentionally quiet:

```
[lowercase "verity post" wordmark]

sign in
we'll email you a 6-digit code.

[email field]
[continue button]

new here? we're invite-only during beta. request access →
```

A small "what is verity post?" line sits on the page so strangers who arrived from a link know where they are. The lowercase wordmark is intentional — owner's preference, sets a tone of small-and-deliberate vs corporate. Same page works in beta and post-launch; only the footer line changes ("we're invite-only during beta" → "sign up").

### Token-only, not magic links

The cross-device problem is solved by switching from magic-links-as-links to magic-links-as-codes. The same email goes out, but instead of clicking a link the user reads a 6-digit code off their phone and types it into the same browser they started in. No PKCE verifier required — the code itself is the proof.

This required deciding between three options: keep passwords, switch to OTP codes, or do both. The owner picked OTP-only. The reasoning: every login requires an email round-trip, but that's an acceptable cost (most modern products work this way), the security posture is arguably better than passwords (no leaked credentials, no password-reuse attacks), and there's no "did I set a password? what was it?" mental tax. The unverified-email infrastructure stays in the data model so passwords can be turned back on later if needed, but there's no UI for them right now.

To make this work, the Supabase email template needs `{{ .Token }}` added in the dashboard so the code shows up in the email body. That's a one-time setting change. The OTP lifetime also needs to be reduced from Supabase's 60-minute default to 30 minutes, which is a tighter window without being annoying — long enough to handle "I got pulled away" scenarios but short enough that a leaked code isn't useful for an hour.

### The privacy posture

A meta-rule was locked that governs every public-facing failure case: **never reveal account-existence, invite-state, or email-state to the public surface. Same gentle response in all cases. Real reason logged server-side for admin only.**

This applies everywhere. Wrong email? Same response as right email. Expired invite link? Same response as a fake link. Already-used code? Same response as a wrong code. Banned account? Same response as an unrecognized one. The user always sees one calm version of "this didn't work, here's what to do." The owner sees the actual reason in admin logs.

The reason it matters: an attacker probing the system can't enumerate accounts ("this email exists, that one doesn't"), can't probe invite-link history ("this code was used, that one wasn't"), can't fingerprint banned users. But real users still get a path forward — there's always a "request access" link or equivalent visible, regardless of whether they'd actually be told why their attempt failed. The principle is: visible escape, invisible diagnosis.

### First sign-in: home with a welcome modal

After a new user verifies their code for the first time, they land on the home page. Overlaid on it is a welcome modal: a short warm message ("you're in. welcome to verity post. pick a handle — this is what shows up next to your comments and on leaderboards."), a username input field with live availability checking, and a save button. The modal can't be dismissed without saving. There's no skip, no X close.

The reasoning: the schema requires every user to have a unique handle, so the choice is forced eventually. Forcing it at the moment they land on home is the right place — they're already excited that they got in, the action is about identity (which they care about), and it's the natural moment to make that decision. Forcing it on a separate `/welcome` page before home felt cold and bureaucratic; deferring it forever leaves you with a leaderboard full of `reader-7842` placeholders.

The modal copy is roughed in and will be polished later. The owner explicitly said "we may change it" — which led to a meta-decision that all copy gets roughed in during build and polished in a final sweep before launch. Don't bikeshed wording during implementation.

Returning users (anyone past their first sign-in) skip the modal and go to wherever they were trying to reach (`?next=` if present, else home).

---

## The new shape of access control

### Beta is a velvet rope, not a separate product

Earlier in the convo, the owner clarified that beta mode isn't a different product or a feature flag — it's just access control. "I'm limiting access, that's it." Whoever's in gets the full product. The 30-day pro grant is the bonus for being early.

This reframing simplified a lot. There's no "beta UI" vs "real UI" — same site either way. There's no "beta features" vs "launch features" — same features. The only thing that flips is who can create accounts and whether new accounts auto-grant pro.

So the model is:

**During beta:** site is invite-only for new accounts. Existing users (anyone with an account already) sign in normally regardless. A successful new account during beta gets 30 days of pro automatically, starting from the moment of first sign-in.

**After beta:** anyone can create an account through the normal flow. New accounts default to free. Existing beta users keep their remaining pro time until `comped_until` runs out. The invite system stays alive but loses its pro-grant power — invites become pure tracking.

The owner is explicitly allowlisted (`admin@veritypost.com`) as a recovery safety net, so even if his account row got nuked he could re-create it through any state of the gate. Costs nothing, prevents a "locked out of own site" failure mode.

### Invites: personal, persistent, simple

Each user gets one personal invite link from the moment their account exists: `/r/<username>`. It's discoverable in their profile, with a counter showing "X of N invites left." Default cap during beta is 2 invites per user, with per-user override available in admin (so the owner can give specific people more — a journalist with a big network, a friend who's been bringing in active users). When the cap is hit, the link gracefully degrades.

The link is the same URL forever. No "generate a new link" button, no UUIDs to manage, no expiry juggling. Easier to share verbally ("go to verityp.st/r/cliff"), works in DMs, works on a t-shirt. When a friend redeems it, the counter ticks down; the link keeps working until the cap hits.

When a friend redeems an invite, the inviter doesn't get a notification or a banner — the counter is informative, not promotional. Quiet, in keeping with the no-popups energy the owner wanted throughout.

If a signed-in user happens to click someone else's invite link (friend forwards a link by accident, recipient already has an account), nothing happens. They go home, the invite stays available for someone else, their cohort doesn't update (their cohort was set at signup; changing it later would corrupt analytics).

If an invite link is broken — expired, used up, disabled, fake — the user sees the same gentle "this doesn't work, request access here" message as the public-facing privacy posture demands. Server-side, the admin can see the actual reason in logs.

### Cohort tracking: free-form source + medium

The owner explicitly wants to monitor where users come from so he can watch which cohorts are bringing in actively engaged people vs. vanity signups. The locked design uses two free-form fields per invite: source and medium, UTM-style.

User-shared links auto-tag themselves: source=`referral`, medium=`user-{username}`. Owner-minted links get source/medium typed at creation time ("twitter", "post" — or "press-day", "direct" — whatever the owner wants). Approved-from-request signups get source/medium set in admin at the moment of approval, alongside the approve action.

A `referred_by` foreign key on each user records the full referral graph. Combined with engagement data already flowing through existing tables (sign-ins, comments, bookmarks, reads), this gives the owner everything needed to answer questions like "how many people did @cliff refer, and how many are still active a month in?" — without needing the analytics UI built yet.

The analytics view itself is explicitly out of scope for this work. Building the data capture is cheap and uncontroversial. Building the reporting UI is its own feature with its own questions ("what counts as active?" "what reward do top referrers get?"), and there's no point designing it before there's real data to look at. So the data hooks ship now, the dashboard ships later.

### Request-access for strangers

Strangers without an invite see a "request access" link below the login form. It opens a conversational form, not a corporate one:

```
verity post

we're invite-only right now. tell us a bit
and we'll get back to you.

what's your email?
[                                ]

what should we call you?
[                                ]

what brought you here?
[ saw it on twitter, friend sent it,        ]
[ curious about the citations thing...      ]

                              [ send it → ]
```

Three fields: email, name, "what brought you here?" — with placeholder text on the reason field that doubles as examples so people know it's casual. Button verb is "send it," not "submit."

The reason field exists because it's the smallest amount of signal that lets the owner triage real prospective readers vs. spam vs. randos. Without it, the queue is just a list of emails to gut-check; with it, the owner has something to work with. After they send the request, they see a confirmation screen with matching tone ("got it. we'll take a look and email you when you're in. usually within a day or two.").

When the owner approves a request, an email goes to the requester. The locked spec is short, personal, uses their name, lightly nods to their reason, signed off as the owner. The exact copy is roughed in during build and tightened later. The point is that the first email from the product feels like a real human said yes, not a system.

---

## The pro/free trial model

### How the 30-day clock actually works

Every account created during beta auto-gets `comped_until = now() + 30 days` written to the user row at first sign-in. (Field reuses the existing beta-comping column rather than inventing a new one.) The clock starts at first sign-in, not at invite click — meaning a user who delays signup doesn't burn days. They get the full 30 days of *being a user*, which is what actually correlates with measuring engagement.

A new daily cron sweeps users where `comped_until < now()` and `plan_id = verity_pro`, drops them to free, and fires the in-app notifications. The cron is small — a single SQL query plus an update plus a notification insert. It piggybacks on the existing beta-sweep cron infrastructure.

When beta turns off, two things happen automatically: new account creation stops auto-granting pro (new signups default to free), and existing beta users keep their remaining time until their individual `comped_until` runs out and the cron sweeps them. No mass-expiry event, no announcement — they just expire on their natural timer.

The duration is configurable globally by a single admin setting ("new beta signups get N days"). The owner can also override per-user from admin: extend, shorten, set to lifetime, revoke. Same pattern as invite caps — global default, per-user override.

### What "expires to free" actually means

This was a real concern raised mid-convo: if free tier doesn't have meaningful gating, dropping someone to free is symbolic and the trial framing falls apart.

Investigation showed the gating is real. Pro-only features that are actively enforced today: comment mentions, profile card sharing, leaderboard category drill-down (free sees top-3 only), ad-free reading, family dashboard and kid profiles (family-tier specifically), streak freeze, weekly family activity reports. So when a beta user expires to free, they actually lose visible features and start seeing ads. The trial expiry is a real downgrade event, not a no-op.

### Notifications: gentle, in-app only

The owner was clear: no popups, no emails (per the existing security-only email scope), just little in-app messages users can dismiss.

Two warnings, by top-of-page banner:
- Day 23 (one week before expiry).
- Day 29 (day before expiry).

Banners are dismissible and persist until dismissed. The bell-only notification placement was considered and rejected as too quiet for a trial-ending event. Three or four warnings was rejected as naggy. One warning was rejected as not enough heads-up.

When the owner extends a user's trial from admin, the user gets a small notification ("your trial was extended"). Same gentle pattern.

### Email change under token-only

A token-only world makes email change interesting. The owner can't ask the user to "click a link in the new email" without re-introducing link-flow infrastructure we're tearing out. But just sending a code to the new address doesn't prove ownership of the *old* address — meaning a session-hijacker could change someone's email and lock them out.

The locked solution: send a 6-digit code to the new email (proves new-address ownership) AND require an in-app "you sure?" confirmation in the live session (the live session itself is implicit proof of old-address ownership). One code, plus a confirm click in-product. Standard balance for a news site — not paranoid, not careless.

For users who lost access to their old email entirely (e.g., they signed up with a work email they no longer have), there's a support contact path. Manual recovery via owner identity verification. The login page surfaces this with a "having trouble signing in?" link.

---

## Security knobs

### Token lifetime and attempts

A balanced posture was locked, leaning consumer-product-standard rather than bank-grade or naive-default:

- 30-minute code lifetime (down from Supabase's 60-min default).
- 5 attempts per code before invalidation.
- 3 codes per email per hour (the existing rate limit).
- 10 failures in 24 hours per account → 1-hour lockout.

The reasoning: 10 minutes is too tight for users who get pulled away mid-flow ("oh, the kid needs something, be right back"). 60 minutes is too generous for a credential. 30 hits the sweet spot. 5 attempts handles fat-fingering without creating a brute-force window. Account lockout protects against credential-stuffing at the cost of small UX friction for users who mistype their codes badly.

### The login page as a security surface

The privacy posture (same response in all failure cases, real reason logged server-side) closes the most common enumeration attacks. Combined with rate limits and token expiry, the login page becomes a hardened surface that doesn't leak account existence, invite status, or email validity to anyone testing it from the outside.

What's *not* in scope: passkeys / WebAuthn (Supabase supports it, right call once token-only is shipping; not now), CAPTCHA on login (rate limits handle the realistic threat), SMS as a fallback channel (we're security-only on email per existing scope).

---

## What's already built that we keep

The investigation surfaced that a lot of supporting infrastructure already exists and works. We're not building from scratch.

The admin queue at `/admin/access-requests` is polished and functional. It already has status-tab filtering, a data table with full intake metadata, click-to-detail drawer, single-click approve (which mints a 7-day owner-tier invite, sends the approval email via Resend, marks the row, writes audit log), single-click reject with optional reason, permission gating, and rate limiting. What needs adding: a multi-select column with bulk-approve (so the owner can clear a backlog efficiently) and a small source/medium input pair in the approve drawer (so cohort tagging happens at the moment of approval, the whole reason cohort tracking exists).

The Supabase schema is current and aligned with code. No migration thrash needed for the core tier system.

The iOS apps are clean. No surface-level changes needed there for this work.

The permission system, the rate-limit system, the audit logging, the rare service-role usage — all coherent. The auth callback handler can be refactored to share its post-exchange logic with a new code-verify route rather than duplicating the bookkeeping in two places.

---

## Implementation plan

### Order of work

The plan is to ship in a sequence of small PRs rather than one big bang.

**Three small Phase-1 PRs first.** These are pure quality fixes that don't change UX but set the stage:
1. Permission flicker fix on sign-in (render a thin loading state during the brief perm-fetch window so components don't flash from "no access" to "granted").
2. `?toast=session_expired` emission (when middleware bounces a user to login because of expired session, append the param so the existing display code at `login/page.tsx:108` actually shows).
3. Callback-handler await fixes (await the fast post-login RPCs instead of fire-and-forget; only the slow daily-scoring stays async).

These ship as three independent reviewable PRs because they're unrelated to each other and unrelated to the bigger redesign. They could be reverted individually if any caused problems.

**Then the main auth-redesign PR** (or split into two if it's too big). This is the heart of the work:
- The single-door login page.
- The new code-verify route that shares post-exchange logic with the existing callback handler.
- Removal of password infrastructure (UI was never built; backend routes get deleted).
- Removal of the dead beta-confirmation routes.
- The welcome modal on first sign-in.
- Email change flow rebuilt for token-only.

**Then the access/invite/cohort PR.**
- Personal `/r/<username>` link on every user.
- Profile UI with counter.
- Beta-state-aware cap enforcement (2 during beta, unlimited after).
- Cohort source/medium fields on invites.
- `referred_by` foreign key on users.
- Admin queue extensions: bulk-approve, source/medium inputs at approval.

**Then the trial-mechanics PR.**
- Auto-grant 30-day pro on new beta signups.
- Daily cron for `comped_until` expiry sweep.
- Day-23 / day-29 banner notifications.
- Per-user trial overrides in admin.
- Global trial-duration knob.

**Then the /signup landing-page PR.**
- The three-layer page (manifesto, sample article, access flow).
- Server-side article fetch for the sample.
- Admin control for picking the featured article (or a sensible default rotation).
- Cross-links to and from /login.

**Final polish PR.**
- Copy sweep across all user-facing surfaces.
- Support-contact link placement on login.
- Anything that surfaced during build that wants tightening.

### What this doesn't include

The owner explicitly deferred a few things:
- Referral analytics dashboard (data captured now, UI later when there's data).
- Top-referrer rewards system ("special something" — TBD when there's data).
- Passwords as a UI surface (infra parked, not removed; can be turned back on).
- The `verity` middle tier in the data model — vestigial, not actively gated. Owner can decide to rip or leave when convenient.

---

## The three small open questions, now closed

### Verity middle tier — rip

The `verity` middle tier was referenced in the `plans` table but no feature gates checked for it specifically. It's a relic from an earlier tier scheme. Locked: rip it. The model simplifies cleanly to free / pro / family. A small migration drops the row plus any orphan code references; existing gates use plan-level permission checks rather than tier-string equality, so nothing user-facing breaks.

### Pro-duration knob — in /admin/settings

Investigation showed the admin already has a polished settings page at `/admin/settings` that renders rows from a `settings` DB table by category, with audit log and confirmation modal already built. The existing `beta_active` toggle lives there. Adding the new beta-trial-duration knob is just inserting one row:

- `key: beta_trial_duration`
- `category: beta` (new category, also houses `beta_active`)
- `value_type: number`
- `value: 30`
- `display_name: Beta Trial Duration (Days)`

The signup-cohort RPC reads this value at account creation. Owner changes it anytime in admin, applies to new signups going forward. No new admin page, no new infrastructure — additive change against existing plumbing.

### /signup — becomes the public-facing landing page

The most interesting of the three. `/signup` was a near-clone of `/login` doing nothing distinct. Rather than redirect or delete, it becomes the page that actually represents the journey of joining verity post — the front door for context, while `/login` stays the door for action.

The split:

- Anyone hitting `/login` already knows they're signing in. The page is minimal: the single-door form, nothing else.
- Anyone hitting `/signup` is closer to "tell me what this is and how I get in." That's a different need and deserves a different page.

The page has three layers, each doing distinct work.

**Top: the manifesto.** Short positioning — "news you can verify. every story has citations and every writer has a record." Three lines, centered, generous whitespace, larger than body text. The point is to communicate why this product exists in the time it takes to read three lines. Anyone who doesn't connect with that message at the top isn't going to convert no matter what's below it, so it has to land first.

**Middle: a real article.** Not a screenshot, not a mockup — an actual article rendered through the live article system. Headline, byline, writer's tier badge, the first two paragraphs, inline citation markers visible in the text, the first few citations rendered below the snippet, a "more sources" hint. Fetched server-side at page load (most recent high-citation piece, or a hand-picked rotation chosen in admin).

The reason: the manifesto makes a claim, the sample proves it. People who say "yeah right" to "every story has citations" stop saying that when they see citations. Showing the product is more persuasive than describing it.

**Bottom: the access flow + CTAs.** A short visual sequence of how someone joins — request → reviewed → invite → sign in (or invited → sign in if they have an invite). Honest about timing ("usually 1-2 days" for review). Honest about what they get when they're in ("30 days of pro on us during beta"). Below that, two clear CTAs side by side: "I have an invite, sign in →" and "Request access →".

The reason: by this point a visitor knows what verity post is and has read a real piece. The access flow is the bridge from "I want this" to "here's how I get it." Without it, they bounce because they don't know what to do next. With it, the next step is obvious.

This makes `/signup` a real piece of marketing real estate, not a forwarding rule. It deserves a proper design pass — copy, layout, the article-rendering — and could ship as its own small project after the auth-redesign PRs land. The interaction with `/login` is clean: footer link on `/login` ("new here? read about us →") points here, footer CTA on `/signup` ("I have an invite") points back.

---

## Files affected (impact awareness)

This isn't an exhaustive impact list — real call-graph mapping should happen per file before changes land — but it gives the rough shape of where the work touches.

**Backend / API**

The `/api/auth/send-magic-link` route stays but works alongside a new `/api/auth/verify-magic-code` route that consumes the OTP. The existing callback handler at `/api/auth/callback` gets refactored so its post-exchange bookkeeping (user creation, audit log, last-login update, email-verification flip) becomes a shared helper that both link-callback and code-verify call. The password-related routes (`/api/auth/signup`, `/api/auth/verify-password`) get deleted. The dead `/api/access-request/confirm` route gets deleted. A new daily cron route handles `comped_until` expiry. The admin approve route gets a small extension to accept source/medium params, and a new bulk-approve route gets added.

**Frontend**

The `/login` page gets a full rewrite — the three-tab structure goes away, replaced by the single-door layout. The existing `_MagicLinkForm` component gets replaced by a single-door form component that handles email submit, code entry, and state-dependent footer text. The `/signup` directory gets either deleted or repurposed as a redirect. The dead `/request-access/confirmed` page gets deleted. A new welcome-modal component gets mounted on the home page, triggered by a first-sign-in flag. The `PermissionsProvider` gets the flicker fix. Middleware gets the session-expired toast emission. Profile gets a new section for the personal invite link and counter. A new trial-warning banner component gets mounted on day 23 / day 29. The admin access-requests page gets the multi-select column + bulk-approve button + source/medium inputs in the approve drawer. Settings gets the new email-change flow with code-to-new-email plus in-session "you sure?" confirm.

**Schema / Supabase**

A small migration for any field changes needed by the welcome-modal handle picker (depending on how account creation is timed — username may need to be temporarily nullable to allow the public.users row to exist before handle selection). A migration for `referred_by` on users (verify whether it's already there). Anything needed for the expiry-sweep cron. In the Supabase dashboard itself: change OTP lifetime to 30 minutes, edit the magic-link email template to include `{{ .Token }}` so the 6-digit code shows up.

**Lib**

`betaGate.ts` simplifies as the dual-path (cookie OR approval) collapses into something cleaner. `permissions.js` gets the flicker fix. `referralCookie.ts` stays since invites stay. The approval email template at `betaApprovalEmail.ts` gets new copy in the final polish pass.

**Tests**

New tests for the verify-magic-code route, the bulk-approve route, the expiry-sweep cron. Modified tests for the existing magic-link route to cover token-path emission, and for the callback handler to cover the awaited bookkeeping. The privacy-posture rule (same response in all failure cases) deserves explicit test coverage so future regressions don't quietly leak account-existence.

---

## Owner principles surfaced or reaffirmed in this convo

A few patterns came through that are worth naming because they govern small decisions everywhere downstream.

**Privacy-first on public surfaces.** Everything user-facing is gentle and ambiguous; real signal lives in admin only. Same response across success, failure, and gated states.

**Lowercase typography for the wordmark.** "verity post," not "Verity Post" or "VERITY POST," at least on the login page. Sets a small-and-deliberate tone vs corporate.

**Conversational tone over corporate boilerplate.** "What brought you here?" beats "Reason for request *". "Send it" beats "Submit." "Got it" beats "Thank you for your submission." Applies to forms, confirmations, emails, error messages.

**No popups for non-critical events.** Counters and dismissible banners only. Modals are reserved for forced moments (the welcome-modal handle picker is the one example we have).

**No emails for in-app events.** Security and transactional only — confirmed against the existing email scope memory. A friend redeems your invite? Counter ticks. No email.

**Per-user admin overrides for any global setting.** Pro duration is global by default but per-user editable. Invite cap is global by default but per-user editable. Same pattern.

**Genuine fixes over patches.** When ripping out password infrastructure, rip it cleanly. Don't leave half a system behind to confuse future readers. Same applies to dead beta-confirmation routes.

**Polish over ship-now where the product compounds.** This work falls into the bucket where craft pays off — login is the first impression for every user, and a confused or broken login leaks users before they ever see the product.

---

## What an adversarial review pass surfaced

After the main plan was locked, a fresh reviewer was asked to read the plan and the actual code looking for what was missed. It found 24 gaps. Most were absorbed into the plan as clarifications without changing the locked design. A few were real decisions that needed answers; those are folded in below.

### Clarifications absorbed into the plan

These are details the implementation has to handle correctly, but they don't change anything we already decided.

**Pre-launch dashboard checklist.** The Supabase dashboard needs `{{ .Token }}` added to the magic-link email template body and the OTP lifetime changed from 60 to 30 minutes. Both are owner-driven manual steps, not visible to git. The implementation plan will include a checklist item plus a staging smoke-test that confirms the email body actually contains the token before the auth-redesign PR is merged. If forgotten, day-one is silently broken.

**`apply_signup_cohort` RPC audit.** The Supabase-side stored procedure that handles signup cohort assignment lives in a migration we haven't read line-by-line. Before the auth-redesign PR ships, this RPC has to be confirmed (or updated) to read the new `beta_trial_duration` setting, set `comped_until` from it, and set `referred_by` correctly on new user rows. Explicit step in the PR description.

**Migration for the new setting row.** A trivial INSERT for `beta_trial_duration` (key, category=`beta`, value_type=`number`, value=`30`, display_name=`Beta Trial Duration (Days)`) ships in the same migration that wires the auto-grant logic. Without it, the settings page won't render the row and the RPC reads NULL.

**Middleware allowlist cleanup.** When `/forgot-password`, `/reset-password`, `/verify-email`, and `/signup/pick-username` get deleted, their entries in the middleware beta-gate allowlist get deleted in the same PR.

**Bulk-approve specifics.** New endpoint at `/api/admin/access-requests/bulk-approve` accepts an array of request IDs plus optional source/medium values, runs the existing approve flow per-row, returns aggregate success/failure. UI gets a checkbox column on the data table plus a bulk-action bar at the top with a single "approve selected" button.

**`?next=` preservation through welcome modal.** Welcome modal reads searchParams on mount, holds the `?next=` value, redirects to it after username save (or falls through to home if absent). Doesn't lose the redirect target.

**Privacy posture in verify-magic-code.** New verify route mirrors send-magic-link's ban/lock/banned-account handling — same generic response for code-wrong, code-expired, banned account, locked account. Tested explicitly so future regressions don't quietly leak signal.

**Rate-limit policies defined before route built.** New constants (`AUTH_MAGIC_CODE_FAILURES_PER_ACCOUNT`, `AUTH_MAGIC_CODE_PER_EMAIL_HOURLY`) added to `lib/rateLimits.ts` and the corresponding policy rows added to the rate-limit DB table in the same migration that creates the verify route.

**Callback await spec.** In `/api/auth/callback`: `last_login_at` update, `cancel_account_deletion`, and `complete_email_verification` all get awaited (fast, idempotent, important to be correct before redirect). `scoreDailyLogin` stays fire-and-forget (slowest, least critical, recoverable on next login).

**Permission flicker fix location.** `PermissionsProvider` doesn't set `loaded=true` until the first perms fetch resolves. Children render a thin loading state until then. Fix lives at the provider level, not per-component, so all permission-gated UI inherits it consistently.

**Session-expired toast detection.** Middleware distinguishes expired-session bounces from anon-user bounces by checking for the auth cookie's presence even when `getUser()` returns null. Only the former gets `?toast=session_expired` appended.

**Dead routes (full list).** UI pages getting deleted: `/forgot-password/`, `/reset-password/`, `/verify-email/`, `/signup/pick-username/`, `/request-access/confirmed/`. API routes getting deleted: `/api/auth/signup`, `/api/auth/verify-password`, `/api/access-request/confirm`. All in one cleanup PR with corresponding middleware allowlist updates.

**Logout clears `vp_ref`.** Logout route gets a one-line addition to clear the invite cookie in the same response that calls Supabase signOut. Prevents a stale invite cookie persisting across sessions.

**iOS verification checkpoint.** Before deleting password routes, explicit grep across `VerityPost/` and `VerityPostKids/` for any reference. The earlier scan showed iOS uses Supabase OTP auth and doesn't call our password API routes — but locking it with a literal verification step in the PR description.

**Email change uses Supabase's link confirmation.** The plan's "code to new email" copy was actually slightly imprecise — Supabase's `auth.updateUser({ email })` flow handles the new-email confirmation through its own link-based mechanism, not our custom OTP flow. The user clicks the link in the new email, Supabase verifies and flips `email_verified=true`, no custom code needed. The "you sure?" in-session confirmation is the only thing we build. This means `/verify-email` actually does need to keep one narrow handler for Supabase's email-change callback, even though it goes away as a UI page.

**vp_ref cookie format unchanged through deploy.** The cookie structure (`{ c: code_id, t, h }`) stays the same so in-flight cookies survive the deploy. Verified by manually testing a pre-deploy cookie post-deploy as part of the rollout checklist.

### The three decisions that came out of the review

**OAuth code stays in place but disabled.** The login page has Google/Apple sign-in code gated behind `OAUTH_ENABLED = false`. Locked: leave it. Removing it means rebuilding later if we want to flip it on; the cost of leaving a disabled flag is essentially zero and the optionality is real. The flag is documented in the plan so future reviewers don't think it's accidentally dead code.

**Trial-warning banners reuse the existing state-banner infrastructure.** The site already has an `AccountStateBanner` component that derives display from user states in `profile/_lib/states.ts` (e.g., "your account is comped until X"). Locked: extend `deriveAccountStates()` to emit `trial-ending-week` (when `comped_until - now() < 7 days`) and `trial-ending-day` (when `< 24 hours`). The existing banner renders them with appropriate copy. No new notifications-table infrastructure, no separate cron for surfacing the banners. The cron job's only role is doing the actual plan downgrade at expiry — the warning banners are derived live from `comped_until` itself.

**Beta-mode public surface: `/signup` is the only public face.** Earlier, the plan said strangers hitting `veritypost.com` get bounced to `/login`. Locked correction: strangers without a session get bounced to `/signup` — the new manifesto-and-sample landing page. They land on something that explains the product and the access flow, not a bare login form. Logged-in users keep using the site normally; we never force logout. Only sign-out by user choice or session expiry ever ends a session.

That clarifies how the access surface looks in beta:
- Stranger types `veritypost.com` (or anything else) → middleware bounces to `/signup` (was `/login`).
- Stranger explicitly types `/login` → they get the bare login page (as before — owner can still go straight there if they want).
- Stranger lands on `/signup` from a marketing link or word-of-mouth → they see the page intentionally designed for first impression.
- Logged-in user → goes wherever they wanted, no interception, no toast, no prompt.

This is a one-line change in the middleware redirect target plus a corresponding update to the beta-gate allowlist (which was allowing `/login` and now needs to allow both `/login` and `/signup` since both are public-by-design). The single-door login form on `/login` still exists; it just isn't the default destination for anonymous arrivals anymore.

## Where the next session picks up

A new session opening this file should be able to start cold. The recommended path:

1. Read this document.
2. Confirm the implementation order: three small Phase-1 PRs first (flicker / toast / awaits), then the main auth-redesign PR, then access/invite/cohort, then trial mechanics, then the /signup landing page, then final polish.
3. Owner greenlights, work begins.

Every UX moment has a locked decision behind it. Every backend change has a clear motivation. The remaining ambiguity is in the smaller copy and placement details, which the owner has explicitly said get polished in a final sweep rather than negotiated up front. There are no remaining decisions blocking implementation — every "what should we do here" question has an answer.
