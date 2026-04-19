# LIVE TEST BUGS — empirical bug intake during owner-side testing

**Last updated:** 2026-04-17 (post-Q&A breakout — all prior OPEN entries triaged).
**Purpose:** Capture every broken, wrong, or weird thing the owner hits during E2E testing. PM structures each intake into a numbered LB-NNN entry. Coding AI fixes in scoped passes.

**Format:** Only still-OPEN entries get detailed bodies below. FIXED, deferred, and WONTFIX entries are collapsed to one-line references — history is in `Verity_Post_Phase_Log.md` and `99-Archive/`.

---

## Severity ladder

- **P0 — blocks test.** App crashes, critical surface 500s, can't sign up, data loss, security. Hotfix candidate.
- **P1 — core flow broken.** E2E can proceed by going around it, but a primary user path fails.
- **P2 — edge / state issue.** Works for the golden path, breaks under a specific condition.
- **P3 — polish.** Wrong copy, wrong color, minor visual glitch, dev-console warning.

---

## Status markers

- **[OPEN]** — reported but not yet addressed.
- **[OWNER-BLOCKED]** — can't scope the fix without an owner clarification.
- **[FIXED]** — landed in a pass.
- **[DEFERRED]** — scoped out of pre-launch (UI redesign, feature scope, post-launch CQ).
- **[WONTFIX]** — design-correct per Design Decisions. No fix needed.

---

## How to dish a new bug (owner-facing)

Just tell the PM in plain language: what you were trying to do, what happened, any error text, role/tier at the time. PM handles the structure. You don't need to format anything or know the codebase.

---

## OPEN — scoped for a future pass

All entries below have owner specifics from the 2026-04-17 Q&A. No more blocks pending clarification.

### LB-006 — Notifications page loads empty on web
**Status:** [OPEN] · **Severity:** P1 · **Surface:** web

Owner hit `/notifications` (web, via bell icon) and the page loaded but showed an empty list. Owner has unread notifications in the database (replies, upvotes, etc.).

**Fix spec:** Audit the `/notifications` page query — likely an RLS scoping bug, a wrong `user_id` filter, or a `kid_profile_id IS NULL` filter missing. Confirm against Supabase logs first, then patch the query. Render a non-empty state.

**Verification:** Seed a notification, load `/notifications`, confirm it renders.

---

### LB-010 — Apply-to-expert post-submit strands the user
**Status:** [OPEN] · **Severity:** P2 · **Surface:** web

After submitting the apply-to-expert form, owner could not navigate back to settings or profile — no header, no back link on the confirmation state.

**Fix spec:** Post-submit state must preserve the global header (so the avatar dropdown still works) and add an explicit "Back to profile" / "Back to settings" link in the confirmation copy.

**Verification:** Submit form, confirm header still visible, click back link, land on `/profile/settings` or `/profile`.

---

### LB-013 — Stripe checkout redirects off-site (owner decision: swap to Embedded Checkout)
**Status:** [OPEN] · **Severity:** P1 · **Surface:** web

Today's flow sends users to `checkout.stripe.com` — they leave the site. Owner doesn't want to lose sessions off-site.

**Fix spec:** Swap Stripe Checkout redirect flow for **Embedded Checkout** (`ui_mode: 'embedded'` on session create, mount with `@stripe/react-stripe-js` `EmbeddedCheckoutProvider` + `EmbeddedCheckout`). Keeps PCI scope at SAQ A, retains 3DS / SCA / Apple Pay / Google Pay / Link automatically, user never leaves the site. Replace the server-side session create to pass `ui_mode: 'embedded'` and a `return_url` for post-payment landing. Replace the checkout page to mount the embedded component instead of redirecting.

**Verification:** Click upgrade → embedded form renders on Verity Post domain → complete test payment → redirected to `return_url` (payment success page).

---

### LB-016 — Feed card renders without headline
**Status:** [OPEN] · **Severity:** P2 · **Surface:** web

On the feed, owner saw an article card with no title. Cards with missing title produce a blank clickable rectangle.

**Fix spec:** Two parts:
1. **Data audit:** Query `articles` for rows with NULL or empty `title`. Either fill them from source or soft-delete them.
2. **Render guard:** In the feed card component, if `title` is falsy, either drop the card from the list or render a fallback ("Untitled — flagged for review"). Drop is the cleaner call.

**Verification:** Seed a title-less article, load feed, confirm it doesn't render.

---

### LB-034 — Sessions dropping unexpectedly
**Status:** [OPEN] · **Severity:** P1 · **Surface:** web

Owner kept getting logged out; no reproducible trigger.

**Fix spec:** Instrument before diagnosing — add session-lifecycle telemetry:
- Log every `supabase.auth.onAuthStateChange` event (type, timestamp, user_id)
- Log every middleware cookie clear / redirect to login
- Log token refresh attempts (success + failure with reason)
- Surface in Sentry with a breadcrumb category

Once a session drop happens in the wild with telemetry on, the root cause becomes visible (token refresh failure, cookie domain mismatch, middleware clearing on a specific route, etc.).

**Verification:** Trigger a session drop (clear cookie manually), confirm telemetry captures it.

---

## Retest pending (owner confirms Pass 17 fix landed)

### LB-001 — "Start Reading" onboarding stuck
Pass 16 effect-churn + unwrapped silent `.catch()`. Pass 17 additional auth-middleware hardening.

**2026-04-17 Q&A decision:** Owner opted for PM-drafted retest checklist (passive retest). I'll write a structured end-to-end walkthrough (signup → email verify → onboarding → first quiz → first comment → settings) with pass/fail checkboxes per step. Owner executes when ready, reports back failures.

### LB-023 — Mobile home feed oscillates between error and loaded
Pass 16 defensive memoization on `createClient()`. If still oscillating, root cause is auth-state flicker rather than effect churn. Owner retest when convenient.

---

## Closed from 2026-04-17 Q&A

### LB-019 — Ad placement visibility (converted to feature)
Closed as a bug; reopened as product feature **Admin Ad Manager** — configurable placement (which pages, which slots) + targeting (category / subcategory) + D23 tier gate (free only). No priority tag per owner direction (owner sequences features). Feature entry tracked in `STATE.md` backlog.

### LB-036 — OAuth broken (config task, not code bug)
Error was `"Unsupported provider: provider is not enabled"` from Supabase Auth — providers haven't been enabled in the Supabase dashboard. Not a code bug.
- **Google:** Owner task. GCP OAuth credentials → Supabase Auth → Providers → Google → paste client ID/secret → register callback URLs. Added to `OWNER_TO_DO.md`.
- **Apple:** DUNS-gated (needs Apple Developer account). Queued with iOS work.

### LB-038 — Weekly recap weirdness (not reproducible)
Owner could not recall specifics. Closing; reopen with detail if it recurs.

### LB-039 — Anonymous quiz CTA missing (not reproducible)
Owner could not recall specifics. Closing; reopen with detail if it recurs.

---

## Deferred — iOS / DUNS-gated

Answered in Q&A Q1: "native app" context for all five. Queued until DUNS clears and iOS TestFlight build exists.

| LB | Description |
|---|---|
| LB-028 | Mobile nav parity (admin surfaces hidden on mobile viewport) — iOS |
| LB-031 | Content cut off on scroll — iOS |
| LB-032 | Excess top whitespace — iOS |
| LB-033 | Grey strip below nav — iOS |
| LB-037 | Mobile signup UX — iOS |

---

## Deferred (out of pre-launch scope)

| LB | Disposition |
|---|---|
| LB-015c | AI quiz generation — own feature project, post-launch |
| LB-018 | Date pickers platform-wide — fold into UI redesign |
| LB-020 | Ad placements rebuild (UX + schema + serving) — separate scope, subsumed by Admin Ad Manager feature above |
| LB-022 | Mobile profile submenus + settings redesign — fold into UI redesign |

---

## WONTFIX (design-correct per Design Decisions)

| LB | Reason |
|---|---|
| LB-010 (expert-apply visibility for admin) | D3/D8 — admin ≠ expert role; visibility is correct. Only the back-nav was a real bug. |
| LB-021 (leaderboard category tabs for admin) | D30 — admin role ≠ paid tier. Admin upgrades own plan via LB-014 fix to test paid UX. |

---

## FIXED in Pass 16 (21 entries) + Pass 17 (pattern-based closures)

**Pass 16 closed 21 entries** via 17 tasks (121–137). Full narrative in `Verity_Post_Phase_Log.md` `## Pass 16`. Per-task receipts in `AUTONOMOUS_FIXES.md` Tasks 121–137.

Condensed summary:

- **LB-001** (effect-churn + silent catch — retest pending, see above)
- **LB-002** (admin auth gate) → middleware sweep
- **LB-003** (notifications auth) → middleware sweep
- **LB-004** (adult feed filters kid categories) → slug-prefix filter
- **LB-005** (admin banner nav consistency) → banner scoped to `/admin/*`
- **LB-007** (profile card redirect) → hidden for free users
- **LB-008** (profile categories typo) → column name `display_order` → `sort_order`
- **LB-009** (achievement lowercase) → title-case
- **LB-011** (contact button contrast) → hardcoded contrast-safe
- **LB-012** (settings username blank) → hydrate from DB on mount
- **LB-014** (admin plan change "Plan not found") → expanded PLAN_OPTIONS to 9 canonical names
- **LB-015a** (inline quiz editor) → new `QuizPoolEditor.jsx` component
- **LB-015b** (T/F question type) → type selector in quiz editor
- **LB-017** (admin stories Edit/View stubs) → real router.push + window.open
- **LB-023** (mobile feed oscillation — defensive, retest pending)
- **LB-024** (profile auth gate) → middleware sweep
- **LB-025** (profile card blank on mobile) → same fix as LB-007
- **LB-026** (profile category drill-in) → new `/profile/category/[id]/page.js`
- **LB-027** (4-metric per category) → `get_user_category_metrics` RPC (migration 051)
- **LB-029** (subscription page loading) → try/finally on billing loadAll
- **LB-030** (manage-kids tier-gate) → VERIFIED-AS-NOOP, schema already enforces
- **LB-035** (login via username) → resolve-username RPC + API route (migration 053)

**Pass 17 closed no LBs directly** (scope was UJ-NNN entries), but the middleware + kid-mode + content-filter patterns reinforce fixes for LB-002/003/004/024/025.

---

## Entry template (for new PM intake)

```
### LB-NNN — one-line summary

**Status:** [OPEN]
**Severity:** P0 / P1 / P2 / P3
**Surface:** web / iOS / admin / shared / API
**Reported:** YYYY-MM-DD by owner

**What owner did:**

**What happened:**

**What should have happened:**

**Suspected root cause:**

**Fix spec:** (when triaged)

**Verification:** (how we confirm fixed)
```
