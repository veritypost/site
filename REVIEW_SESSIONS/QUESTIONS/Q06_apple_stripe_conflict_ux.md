# Q06 — Cross-platform billing conflict: Apple sub on web checkout (and vice versa)

## Question

A user with an active Apple subscription tries to checkout on web (or vice
versa). What does the system do?

Mirror question: an iOS user with an active Stripe sub taps Subscribe in
StoreKit. What does the system do?

## Context

PM-5 P0 finding (`REVIEW_REPORT.md:433-440`):

> All three web billing routes pre-flight-check `comped_until` and
> `trial_extension_until` on `users`, but NONE checks for an active
> Apple-side subscription on the same user. […] A user with a live Apple
> subscription […] who lands on `/pricing` and clicks Subscribe gets a
> Stripe checkout session minted, completes payment, and
> `handleCheckoutCompleted` runs `billing_change_plan` against `users`.
> The user is now charged by both Stripe AND Apple. […] Symmetric
> exposure: `ios/subscriptions/sync` calls
> `billing_change_plan`/`billing_resubscribe` without checking for an
> active Stripe sub either.

PM-5 also flagged the cancel route (`REVIEW_REPORT.md:542`):

> A user with an active iOS Family receipt who calls `/api/billing/cancel`
> from web is not platform-checked — the route attempts to cancel via
> Stripe (no-op since no Stripe sub), then runs
> `billing_cancel_subscription` RPC locally. Effect: local plan state
> cancelled while Apple keeps charging.

Schema verified via `mcp__supabase__execute_sql` against
`information_schema.columns` for `public.subscriptions`:

- `platform text NOT NULL DEFAULT 'stripe'` — every row carries platform.
- `apple_original_transaction_id varchar` (nullable) — Apple key.
- `stripe_subscription_id varchar` (nullable) — Stripe key.
- `status varchar NOT NULL` — `'active' | 'trialing' | 'past_due' | …`.
- `auto_renew boolean NOT NULL DEFAULT true`.

So "active Apple sub for user X" is a one-row query: `subscriptions WHERE
user_id = X AND platform = 'apple' AND status IN ('active','trialing','past_due')`.
The data needed for the precheck already exists per-row.

Existing precedent in the codebase
(`web/src/app/api/family/add-kid-with-seat/route.ts:372-389`) — the
seat-add route already does exactly this kind of platform check and
returns a 409 with a `code: 'platform_apple'` discriminator and a
human-readable error string. PM-5's recommended shape (line 439) matches
the existing T304 comp 409 shape used by the four routes already.

## Options

- **Option A — Hard-block 409.** Web routes 409 on active Apple sub with a
  structured reason + deep-link to `https://apps.apple.com/account/subscriptions`.
  iOS sync 409s on active Stripe sub with a deep-link to web billing
  settings. UI surfaces an explanatory card with the deep-link CTA.

- **Option B — Instructional intermediary page.** Same detection, but
  instead of an inline 409 the web pricing flow routes the user to
  `/pricing/already-subscribed-on-ios` (and the iOS path opens a
  full-screen modal explaining "you must cancel on web first") with
  written steps and links to Apple's instructions.

- **Option C — Soft-warn + allow.** This is the current broken state.
  Listed for completeness only — it produces silent double-billing and
  must not ship.

## Recommendation: **Option A — hard-block 409 with deep-link**

Match the prevailing pattern that's already shipped on the four
existing 409 sites (`beta_comp_active`, `active_trial_extension`,
`comp_or_trial_active`, `platform_apple` on the family seat route).
Don't introduce a new instructional route or pattern when the codebase
already has a well-defined "structured 409 + redirect URL" idiom that
billing surfaces handle uniformly.

Specifically:

### Web side — applies to all four routes

`stripe/checkout`, `billing/change-plan`, `billing/resubscribe`,
`billing/cancel` all run a single shared precheck before any state
mutation. Extract a helper at `web/src/lib/billingPlatformGuard.ts`:

```ts
// Returns the active cross-platform sub if one exists, else null.
// Caller turns a non-null return into a 409.
export async function getActiveCrossPlatformSub(
  service: SupabaseClient,
  userId: string,
  expectedPlatform: 'stripe' | 'apple'
): Promise<{ platform: string; current_period_end: string | null } | null> {
  const { data } = await service
    .from('subscriptions')
    .select('platform, current_period_end, status')
    .eq('user_id', userId)
    .neq('platform', expectedPlatform)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
```

Each web route, immediately after the comp/trial gates, calls:

```ts
const conflict = await getActiveCrossPlatformSub(service, user.id, 'stripe');
if (conflict?.platform === 'apple') {
  return NextResponse.json(
    {
      error: 'apple_sub_active',
      code: 'apple_sub_active',
      manage_url: 'https://apps.apple.com/account/subscriptions',
      current_period_end: conflict.current_period_end,
      message:
        "You're subscribed through the App Store. " +
        "To change or cancel, open Settings on your iPhone or iPad — " +
        "Apple ID > Subscriptions > Verity Post.",
    },
    { status: 409 }
  );
}
```

The cancel route uses the same precheck but the message swaps to:

> "Your subscription is billed through the App Store. Cancel it in
> Settings on your iPhone or iPad — Apple ID > Subscriptions > Verity
> Post — and we'll mirror the cancellation when Apple notifies us."

### iOS side — sync route

`web/src/app/api/ios/subscriptions/sync/route.js` runs the inverse
precheck before calling `billing_change_plan` /
`billing_resubscribe`:

```js
const conflict = await getActiveCrossPlatformSub(service, userId, 'apple');
if (conflict?.platform === 'stripe') {
  return NextResponse.json(
    {
      error: 'stripe_sub_active',
      code: 'stripe_sub_active',
      manage_url: 'https://veritypost.com/profile/settings?section=plan',
      current_period_end: conflict.current_period_end,
      message:
        "You're already subscribed on the web. To switch to App Store " +
        "billing, cancel your web subscription first at " +
        "veritypost.com → Settings → Plan.",
    },
    { status: 409 }
  );
}
```

iOS handles this with two side effects:

1. Do **not** call `transaction.finish()` — leave the StoreKit
   transaction un-finished so the user isn't charged a second time by
   Apple. (StoreManager.swift's existing C18 gate already does this on
   any non-2xx sync; the 409 falls into that gate naturally.)
2. Surface a sheet via `SubscriptionView.swift` (new
   `@State var stripeConflictSheet: Bool`) with the explanatory copy
   and a button "Open Verity Post billing" that launches
   `https://veritypost.com/profile/settings?section=plan` in
   SafariViewController. The user cancels Stripe on web, returns to
   iOS, taps Restore Purchases or retries Subscribe.

Critically, StoreKit may still have processed the purchase intent
locally — Apple's purchase flow doesn't know our server's reason for
rejecting. The C18 gate's existing behaviour (don't finish, re-deliver
on next launch) is wrong for this specific case because we want to
**refund** rather than retry. Add a one-shot path: when `error ===
'stripe_sub_active'`, call `transaction.finish()` AND prompt the user
to refund through Apple's standard refund flow ("Report a problem"),
since we cannot refund Apple-side ourselves. This is the cleanest
honest message — "your card was charged by Apple, our records still
show your web subscription, here's how to undo it." Apple will
process the refund routinely for unfulfilled-content cases.

### Web UI changes

`_CheckoutButton.tsx` — replace the bare `setError(data.error || ...)`
with a switch on `data.code === 'apple_sub_active'` that renders an
inline notice instead of a red-text error:

```tsx
{conflict ? (
  <div role="alert" style={{...}}>
    <strong>You're subscribed through the App Store.</strong>
    <p>To change or cancel, open Settings on your iPhone or iPad:</p>
    <p>Apple ID &gt; Subscriptions &gt; Verity Post.</p>
    <a href="https://apps.apple.com/account/subscriptions"
       target="_blank" rel="noopener">
      Manage on Apple →
    </a>
  </div>
) : null}
```

`BillingCard.tsx` — already platform-branches on `sub.platform === 'apple'`
(line 415), so users on an Apple sub see the manage-on-iOS hint instead
of cancel/resume buttons. **No additional change needed there** — that
branch was already shipped. The only gap is on `/pricing` where the
checkout button doesn't surface conflict before mint; the fix above
closes it.

`pricing/page.tsx` — server component already personalizes the Free
CTA based on auth. Extend the same `supabase.auth.getUser()` block to
also fetch `subscriptions WHERE platform='apple' AND status active` and,
if found, replace the Verity / Family card CTAs with a plain
"Manage on App Store" link instead of the CheckoutButton. This is
the soft, pre-flight version of the precheck — the hard 409 stays as
the backstop for direct API hits.

## Reasoning

1. **The codebase already speaks 409-with-redirect.** Four billing
   routes return `{ error, redirectTo }` 409s today
   (`comp_or_trial_active` etc.). The `add-kid-with-seat` route uses
   the exact `platform_apple` 409 pattern (`/web/src/app/api/family/add-kid-with-seat/route.ts:372-389`).
   Adding a fifth use is one helper plus five call sites — no new
   architectural pattern, no new route to design, no new copy
   surface. Option B (instructional page) would invent a sixth
   pattern just for this one conflict; Option A reuses what's
   already there.

2. **The data supports the precheck cheaply.** `subscriptions.platform`
   is a single text column, NOT NULL, with the existing
   `(user_id, platform)` composite already filterable. The query
   PM-5 specifies (`platform != expected AND status IN active set`)
   is a simple existence check that returns at most one row. There's
   no schema change required — that work was done in an earlier
   migration.

3. **Apple deep-link is canonical and stable.**
   `https://apps.apple.com/account/subscriptions` is what every
   mature iOS app uses (Apple Music, Netflix, Spotify, NYTimes all
   route here). It opens the System Settings subscription panel on
   iOS via universal link, and the App Store website on Mac/web. The
   iOS app already uses this exact URL twice
   (`SettingsView.swift:1987`, `SubscriptionView.swift:415`), so we're
   matching the in-product canonical reference.

4. **Option B (instructional page) is busy-work.** A dedicated
   `/pricing/already-subscribed-on-ios` page would re-explain what a
   single sentence + a link conveys. The user already knows they're
   subscribed on iOS — they bought it. Telling them so on a separate
   page rather than inline is an extra click for no information gain.

5. **Option C (current state) ships double-billing.** Out of scope
   per the question prompt, but worth restating: silent
   double-billing is a hard-stop refund + churn risk. Users notice
   on the second cycle when both charges land. Apple is unlikely to
   refund the Apple side ("you authorised it"); Stripe is unlikely
   to refund the Stripe side ("you initiated the checkout"). The
   user blames us for both.

6. **Mature-product reference points.**
   - **Netflix** — if you have an active iOS sub and try to upgrade
     on the web, they 409-equivalent and tell you "your subscription
     is billed through Apple; manage it in your iOS Settings."
   - **Apple Music** — converse not applicable (Apple owns both
     paths) but the same deep-link is what Apple itself uses.
   - **Spotify** — historically refused web upgrades for iOS-billed
     accounts entirely; now they 409 with a similar Apple deep-link
     flow.
   - **Apple's App Store Review Guidelines 3.1.3(b)** — "reader" apps
     can mention external billing; **3.1.1** requires that all
     digital goods sold inside the iOS app go through StoreKit. We're
     not a reader app, but the symmetric inversion (cancel-on-web for
     an iOS sub) is uncontroversial — Apple actively expects apps to
     point users to Settings → Subscriptions, which is what their own
     URL scheme is for.

## Files

Web routes (precheck added):

- `/Users/veritypost/Desktop/verity-post/web/src/app/api/stripe/checkout/route.js`
  (after line 109, before the origin/createCheckoutSession block)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/billing/change-plan/route.js`
  (after line 100, before the listCustomerSubscriptions call)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/billing/resubscribe/route.js`
  (after line 96, before the listCustomerSubscriptions call)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/billing/cancel/route.js`
  (after the user-load block at lines 69-84, before the Stripe
  cancel attempt at line 86)

iOS sync (inverse precheck added):

- `/Users/veritypost/Desktop/verity-post/web/src/app/api/ios/subscriptions/sync/route.js`
  (after the user-row load at line 199-204, before the
  billing_change_plan / billing_resubscribe RPC at line 206)

New shared helper:

- `/Users/veritypost/Desktop/verity-post/web/src/lib/billingPlatformGuard.ts`
  (new file, ~30 lines, exports `getActiveCrossPlatformSub`)

Web UI (conflict messaging on entry surfaces):

- `/Users/veritypost/Desktop/verity-post/web/src/app/pricing/page.tsx`
  (server-side prefetch + alternate CTA when Apple sub active)
- `/Users/veritypost/Desktop/verity-post/web/src/app/pricing/_CheckoutButton.tsx`
  (handle 409 `apple_sub_active` with structured render, not bare
  error string)
- `/Users/veritypost/Desktop/verity-post/web/src/app/profile/settings/_cards/BillingCard.tsx`
  (no change — already platform-branches on `sub.platform === 'apple'`
  at line 415)

iOS UI (conflict sheet for stripe_sub_active):

- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/StoreManager.swift`
  (parse 409 body, post a new `.vpSubscriptionConflictWeb` notification
  with manage_url; do NOT finish transaction; treat as user-facing
  failure rather than the existing un-finished retry-on-launch path —
  user must cancel web first, then restore)
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/SubscriptionView.swift`
  (subscribe to the new notification, present a sheet with the
  explanatory copy and the manage_url SafariViewController button)

Cross-platform consistency (per `feedback_cross_platform_consistency.md`):
web (4 files), iOS adult (2 files), iOS kids (**not applicable** — kids
app has no StoreKit, parents subscribe Family on the adult app and
seats are managed via `add-kid-with-seat` route which already returns
the platform_apple 409).

## Risks

- **StoreKit refund coordination.** Apple charges happen the moment
  StoreKit completes the purchase, before our server sees the receipt.
  If a user is web-subscribed and taps Subscribe in iOS, Apple charges
  them, we 409 the sync, and they're stuck holding two charges until
  Apple processes a "Report a problem" refund. Mitigation: the iOS
  conflict sheet's primary CTA is "Request refund from Apple" with a
  link to `https://reportaproblem.apple.com`. We cannot refund
  Apple-side; we can route them. Acceptable per `feedback_genuine_fixes_not_patches.md`
  — the alternative ("don't 409, accept double-billing") is worse.

- **Race between cancel and re-mint.** A user who cancels on Apple
  Settings then immediately tries web checkout may still see a 409
  for ~10s until Apple's S2S `DID_FAIL_TO_RENEW` /
  `EXPIRED_VOLUNTARY` notification arrives and our `subscriptions`
  row flips to `expired`. Mitigation: the 409 message includes
  "if you just cancelled, give it a minute and try again" — copy
  edit. Same race exists for Stripe → iOS direction post-cancel.

- **`past_due` is included in the active set.** A user with a Stripe
  sub in `past_due` (Stripe is retrying the card) blocks iOS
  checkout. This is intentional: the sub is still real and Apple-side
  re-billing during a Stripe retry would still produce overlap. If
  Stripe's retry fails out of `past_due` to `unpaid`/`canceled`, the
  webhook flips status and the precheck stops triggering.

- **Cancel route 409 is a behaviour change.** Today
  `/api/billing/cancel` against an Apple-billed user runs the local
  RPC and silently flips local plan state. Adding a 409 means web
  users who try to cancel from `/profile/settings/billing` (which
  shouldn't happen because BillingCard branches off the iOS-sub case)
  but who hit the API directly get a clear error rather than a fake
  success. Net positive — the prior fake-success was the bug.

- **Helper bug becomes a billing 500.** Centralizing the precheck in
  one helper means a regression breaks five surfaces at once. Mitigate
  by failing **closed** — if the helper throws, the route logs and
  returns 500 rather than proceeding to mint. Match
  `web/src/app/api/billing/change-plan/route.js:77-83` pattern. The
  alternative (proceed-on-helper-error) reintroduces the original bug.

- **`subscriptions` rows for inactive prior subs.** A user could have
  a stale Apple sub row with `status='cancelled'` from years ago and a
  fresh Stripe checkout. The status filter (`IN ('active','trialing','past_due')`)
  excludes those. Verified by reading the schema; not a hypothetical.

## Owner decision

- [ ] **Option A — hard-block 409 with deep-link** (recommended)
- [ ] Option B — instructional intermediary page
- [ ] Option C — soft-warn + allow (current broken state, do not pick)

Sub-decisions if A:

- [ ] Add the `pricing/page.tsx` server-side prefetch to swap CTAs
      pre-flight (gentler UX), in addition to the 409 backstop
- [ ] Skip the prefetch — let the 409 do all the work (simpler, one
      extra round-trip for the rare conflict case)
- [ ] iOS conflict sheet primary CTA is "Open Verity Post billing"
      (web cancel) **+** secondary "Request refund from Apple"
- [ ] iOS conflict sheet primary CTA is "Request refund from Apple"
      **+** secondary "Open Verity Post billing"

Default if no sub-decisions: include the prefetch on `/pricing`,
primary CTA "Open Verity Post billing" (the cancel-then-retry path is
the user's stated intent), refund link as secondary.
