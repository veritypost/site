# Q10 — iOS Account-State Banner Port (PM-6 / PM-10)

**Question.** Web has 16 account-state banners (`web/src/app/profile/_components/AccountStateBanner.tsx` driven by `web/src/app/profile/_lib/states.ts:deriveAccountStates`); iOS-adult has 1 (`ProfileView.swift:362 frozenAccountBanner`). Users in `muted` / `plan_grace` / `deletion_scheduled` / `verify_locked` / `comped` / `trial-ending-*` get unexplained denials on iOS. Full port is a lot of work — pick the 3-5 highest-impact states.

**Recommendation (one sentence).** Port `verify_locked`, `unverified_email`, `muted`, `plan_grace`, `deletion_scheduled` to iOS — these five are the only states where the user is actively trying to *do* something the app silently blocks, and where a banner unlocks a one-tap recovery action.

---

## 1. Source of truth — the full 16-state catalog

`web/src/app/profile/_lib/states.ts` defines the union; `web/src/app/profile/_components/AccountStateBanner.tsx` renders it. (The older `web/src/components/AccountStateBanner.tsx` only handles 6 of these — the 16-state file is the canonical one referenced by PM-10 #1942.)

| # | State | Trigger column(s) | Web copy (title) | Web CTA | Severity |
|---|---|---|---|---|---|
| 1 | `banned` | `is_banned = true` | "Account suspended" | Contact support | high |
| 2 | `locked_login` | `locked_until > now()` | "Account temporarily locked" | Sign in again | high |
| 3 | `verify_locked` | `verify_locked_at IS NOT NULL` | "Verify your email to continue" | Resend verification email | high |
| 4 | `unverified_email` | `email_verified = false` | "Confirm your email" | Resend link | high |
| 5 | `deletion_scheduled` | `deletion_scheduled_for IS NOT NULL` | "Account deletion is scheduled" | Cancel deletion | high |
| 6 | `frozen` | `frozen_at IS NOT NULL` | "Verity Score is paused" | Resubscribe | high |
| 7 | `muted` | `is_muted = true OR muted_until > now()` | "Posting is paused" | (none — read-only state with timer) | high |
| 8 | `shadow_banned` | `is_shadow_banned = true` | (renders nothing, by design) | — | — |
| 9 | `expert_rejected` | `expert_applications.status='rejected'` | "Expert application not approved" | Re-apply | high |
| 10 | `plan_grace` | `plan_grace_period_ends_at > now()` | "Payment issue — please update" | Update payment | high |
| 11 | `expert_pending` | `expert_applications.status='pending'` | "Expert application under review" | Edit application | low |
| 12 | `trial-ending-day` | `coalesce(trial_extension_until, comped_until) < 24h` | "Your trial ends today" | Subscribe now | low |
| 13 | `comped` | `comped_until > now()` (and >7d out) | "You have complimentary access" | (none) | low |
| 14 | `trial-ending-week` | `coalesce(...) < 7 days` | "Your trial ends in less than a week" | See plans | low |
| 15 | `trial_extended` | `trial_extension_until > now() AND trial_extended_seen_at IS NULL` | "Your trial was extended" | Got it (dismiss) | low |
| 16 | `beta_cohort_welcome` | `cohort = 'beta'` + first-session flag | "Welcome to the Verity Post beta" | Send feedback | low |

iOS-adult currently surfaces only **#6 frozen** (`ProfileView.swift:148-150`). All other 15 fall through silently.

---

## 2. Database snapshot — pre-launch

Pre-launch the `users` table holds 7 rows; **zero** sit in any of the 16 non-`ok` states today, so the count axis can't decide rank. `expert_applications` is empty. Ranking has to come from the *projected* axes: action frequency × recovery value × Apple-review exposure.

```
banned: 0   locked_login: 0   verify_locked: 0   unverified_email: 0
deletion_scheduled: 0   frozen: 0   muted: 0   shadow_banned: 0
plan_grace: 0   comped_active: 0   trial_extension_active: 0   beta: 0
total_users: 7
```

(Verified 2026-05-03 via `mcp__supabase__execute_sql` against production `users` + `expert_applications`.)

---

## 3. Confusion-cost map — what does the iOS user actually hit?

The denials a state produces fall into three categories:

| Category | What the user sees on iOS today | Recovery without a banner |
|---|---|---|
| **A. Active blocker on a frequent action** (comment, react, message) | Generic toast, e.g. `"You're not able to post comments right now."` (`StoryDetailView.swift:3489`) | None — no in-app explanation, no timer, no link |
| **B. Login / sign-in path blocker** | Auth flow returns the error message; user can't get into the app to see a banner anyway | Banner-irrelevant — must surface in the auth UI itself |
| **C. Passive informational** (trial ending, comped, beta welcome) | Nothing (no upsell, no urgency surface) | Lost revenue, but no user *confusion* — they just don't know to act |

**Category A is where banner-absence creates real bug-report-to-support flows.** `comments.post`, `messages.dm.compose`, `reactions.cast`, `bookmarks.create`, `posts.create` are the most-attempted user actions on the app. Any state that strips one of those permissions but produces only a generic 403 is a confusion bomb.

### State-by-state action-impact assessment

| State | What gets denied | Frequency on iOS | Confusion if no banner | Recovery action that needs a button |
|---|---|---|---|---|
| `banned` | All write paths + login itself | Rare-but-permanent | Low — punitive, expected | Contact support (web URL) |
| `locked_login` | Login | One-shot at sign-in | **Already handled in auth UI** (LoginView toast says "too many attempts") | None on signed-in surface |
| `verify_locked` | Login + post-login full app | One-shot at sign-in | High — user thinks app is broken | **Resend verification email** (action) |
| `unverified_email` | Some write paths (per `requires_verified` permission flag) | Persistent until acted on | High — user comments, gets denied, has no idea email is the cause | **Resend link** (action) |
| `deletion_scheduled` | Soft state — no writes denied; user can still act | 30-day grace window | Critical — if user forgot, account vanishes | **Cancel deletion** (action) |
| `frozen` | Score doesn't tick up | Persistent post-cancel | Medium — already handled (#6 lives) | Resubscribe (sheet) |
| `muted` | comment, message, react, post | Acute (24h-7d typical) | **Highest** — user repeatedly hits the wall on the most-used action | None (timer only) |
| `shadow_banned` | (nothing user-visible — by design) | — | None (intentional silence) | — |
| `expert_rejected` | None — informational | One-shot per cycle | Low — email already notifies | Re-apply (deep link) |
| `plan_grace` | Premium features turn off when grace ends | 7-14 day window | High — user sees premium working *now*, has no idea card needs updating | **Update payment** (deep link) |
| `expert_pending` | None — informational | Persistent for ~5 business days | Low — user knows they applied | Edit application |
| `trial-ending-day` | Nothing yet — converts to free in <24h | One-shot | Medium — revenue loss, not confusion | Subscribe now (sheet) |
| `comped` | Nothing — informational | Persistent | None — pleasant surprise | — |
| `trial-ending-week` | Nothing yet | One-shot per week | Low — soft nudge | See plans |
| `trial_extended` | Nothing — informational, dismissible | One-shot | None | Got it (dismiss) |
| `beta_cohort_welcome` | Nothing — informational | One-shot | None | Send feedback |

---

## 4. Top-5 ranking — what to port

Rank by: **frequency of user-attempted action that gets denied** × **recovery-action criticality** × **Apple Review risk**.

### #1 — `muted` (HIGHEST — port first)

- Denies the four most-attempted iOS write paths (comment, react, message, post-create) all at once.
- Has the longest tail (default mute durations are 24h to 7d, and the cron at `web/src/app/api/cron/expire-mutes/route.ts` is the only thing that lifts indefinite mutes).
- Today: iOS user keeps hitting "You're not able to post comments right now." with no timer, no reason, no path — pure confusion bomb.
- Banner gives them: "you can read but can't post — lifts at $TIME."
- **Apple Review risk:** if a reviewer trips moderation heuristics (auto-mute exists in the moderation pipeline), they hit a black-box deny and reject the app for unclear UX.

### #2 — `verify_locked` + `unverified_email` (port together — they're the same flow)

- Treat as a single banner with two trigger conditions; web does this already.
- `verify_locked_at` is the hard-gate variant (security-driven) — the *full app* is locked until the user clicks the email link.
- `unverified_email` is the soft variant — user is in for now but write paths gated by `requires_verified` permission flag fail.
- Today: iOS shows the `verifyEmailGate` (`ProfileView.swift:140-146`) on Profile only — every other tab still loads, write paths fail with generic "Forbidden" / "Unauthenticated."
- Banner needs a working **Resend verification email** action — `auth.resendVerificationEmail()` already exists at `ProfileView.swift:341`, just needs to be exposed on the chrome.
- **Apple Review risk:** if a reviewer creates an account in their automated harness without verifying, every write fails opaquely.

### #3 — `plan_grace`

- The user's card just failed but premium features still work for 7-14 days. Without the banner, they only learn when access cuts off — which happens to be the same UX as `frozen`, but `frozen` users have no recovery path while `plan_grace` users have a one-tap fix.
- Lost revenue path: the entire purpose of the grace window is to give the user a chance to fix the card *before* the dunning sequence ends. iOS users today get *zero* of those nudges.
- Banner needs **Update payment** action that deep-links to Apple subscription management for Apple-platform subs (`StoreKit.AppStore.showManageSubscriptions`) and the Stripe customer portal for Stripe subs. Branch on `plan_provider`.
- **Note:** for Apple subs the grace handling is typically App-Store-managed; verify the column actually fires for Apple-source subscriptions before promising the recovery path. If it only fires for Stripe subs, the iOS banner only renders for cross-platform users (Apple device, Stripe sub via web checkout).

### #4 — `deletion_scheduled`

- Highest *recoverability* value: an unattended `deletion_scheduled_for` becomes irreversible when the cron fires. Web has Cancel deletion; iOS has nothing.
- Today: a user who scheduled deletion on web, then opens iOS, gets no signal at all that their account is on a 30-day countdown to permanent deletion.
- Banner needs **Cancel deletion** action — calls `/api/account/delete` DELETE-cancel variant or equivalent RPC.
- Lower frequency than the top three (rare action), but the cost-of-miss is permanent data loss. Worth porting on severity alone.

### #5 — Tie between `banned` (severity) and `trial-ending-day` (revenue)

Pick one based on which axis the owner cares about more this week:

- **`banned`** if the priority is bulletproofing Apple Review against the "moderation states are user-hostile" concern. A banned user on iOS today gets the same generic "Forbidden" everywhere — at minimum they should see *why* and a Contact support link.
- **`trial-ending-day`** if the priority is conversion from trial-to-paid. iOS has the lowest conversion visibility today — a 24h-out banner is the highest-ROI nudge in the whole list.

**Default pick: `banned`.** Owner-stated quality bar is craft over revenue; banned-without-explanation is the lower-floor outcome.

---

## 5. What to **defer**

| State | Why deferred |
|---|---|
| `locked_login` | Already handled in `LoginView` auth flow — adding a banner duplicates copy and doesn't help (user is signed out anyway) |
| `frozen` | Already shipped on iOS (`ProfileView.swift:362`); migrate it into the new component as part of the unification cleanup |
| `shadow_banned` | Renders nothing on web by design; no port needed |
| `expert_rejected` / `expert_pending` | Email already notifies; iOS expert flow is small surface area; defer to expert-tools polish pass |
| `comped` / `trial_extended` / `beta_cohort_welcome` / `trial-ending-week` | Pleasant-surprise informational; no confusion cost; nice-to-have for revenue but not bug-class |

These 7 + the 4-5 Top-5 = 11-12 of the 16 covered. Remaining 4-5 are **truly informational** and can ride a follow-up pass with no user-facing harm.

---

## 6. Implementation shape — extend, don't rebuild

The existing `frozenAccountBanner` is a private computed `some View` — extending it to multi-state is the wrong shape. Build a new `AccountStateBannerView` SwiftUI component that mirrors the web `visual()` switch, keep `frozenAccountBanner` as a one-line forwarder during transition, then delete it.

### Required Swift-side changes

1. **`Models.swift` — extend `VPUser`** with the 9 missing columns:
   - `is_banned: Bool?`, `ban_reason: String?`
   - `is_muted: Bool?`, `muted_until: Date?` (already maps if added)
   - `verify_locked_at: Date?`
   - `deletion_scheduled_for: Date?`
   - `plan_grace_period_ends_at: Date?`
   - `locked_until: Date?` (for completeness even if banner is deferred)
   - `comped_until: Date?` (for the v5 tie-break path)

2. **`AuthViewModel.swift:1336-1338` — extend the `loadUser` `select(...)` string** to include the new columns. Today it's an explicit allowlist (good practice — don't switch to `select("*")`).

3. **New file: `VerityPost/VerityPost/AccountState.swift`**
   - Port `deriveAccountStates(user:)` returning `[AccountState]`, sorted by severity.
   - Tagged enum `AccountState` mirroring `web/src/app/profile/_lib/states.ts`.

4. **New file: `VerityPost/VerityPost/AccountStateBannerView.swift`**
   - SwiftUI component with the same severity-color → glyph → title → body → CTA shape as `web/src/app/profile/_components/AccountStateBanner.tsx`.
   - CTA targets:
     - `verify_locked` / `unverified_email` → call `auth.resendVerificationEmail()`
     - `plan_grace` → branch on plan_provider; Apple → `StoreKit.AppStore.showManageSubscriptions`; Stripe → open Stripe portal in `SFSafariViewController`
     - `deletion_scheduled` → call new account-undelete endpoint
     - `banned` → open `https://veritypost.com/contact` in `SFSafariViewController`
     - `muted` → no CTA (timer only)

5. **`ContentView.swift:245-254` — insert the banner stack** above `adultTabView`, sibling to `sessionExpiredBanner` and `deepLinkErrorBanner`. This puts it on every tab the way web's chrome does, not just Profile.

6. **`ProfileView.swift:148-150` — remove the inline `if user.frozenAt != nil { frozenAccountBanner }`** once the chrome-level banner ships (the `frozen` case will surface there). Delete the private `frozenAccountBanner` computed view once nothing else references it.

7. **iOS-kids: not applicable.** Per PM-10 #1965, the kids app has no adult account states (no muting, no plans, no email verify gate, no deletion). Skip.

### Out of scope for this slice

- Web push parity (separate PM-10 P1).
- The 4 `expert_*` / `trial_extended` / `comped` / `beta_cohort_welcome` info banners (deferred per §5).
- Refactoring `web/src/components/AccountStateBanner.tsx` (the older 6-state legacy banner) — that's web-side cleanup, not a parity port.

---

## 7. Acceptance criteria

A muted iOS user who taps Comment sees a banner above the tab bar that says "Posting is paused — you can read but can't comment, message, or post until $TIME" *before* they hit the composer wall. A `plan_grace` user sees "Payment issue — please update" with a working **Update payment** button that opens Apple's Manage Subscriptions sheet. A `deletion_scheduled` user can cancel the deletion from inside the iOS app without going to web. The five banner states render with copy + glyph + severity color matching `web/src/app/profile/_components/AccountStateBanner.tsx`. The legacy `frozenAccountBanner` is deleted; the chrome-level banner is the sole renderer.

---

## 8. Files (absolute paths)

**Read references:**
- `/Users/veritypost/Desktop/verity-post/web/src/app/profile/_components/AccountStateBanner.tsx` (canonical 16-state visual)
- `/Users/veritypost/Desktop/verity-post/web/src/app/profile/_lib/states.ts` (canonical derivation)
- `/Users/veritypost/Desktop/verity-post/web/src/components/AccountStateBanner.tsx` (legacy 6-state — not the source of truth)
- `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` lines 1942-1965 (PM-10 finding)
- `/Users/veritypost/Desktop/verity-post/REVIEW_SESSIONS/SESSION_05_PIPELINE_POLISH.md` lines 32, 41

**Edit:**
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/Models.swift` (extend `VPUser`)
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AuthViewModel.swift:1336-1338` (extend select)
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/ContentView.swift:245-254` (insert chrome banner)
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/ProfileView.swift:148-150,357-394` (remove legacy frozen banner)

**Create:**
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AccountState.swift`
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AccountStateBannerView.swift`
