# 11 — Paywall Rewrite

**Owner:** Wroblewski (primary — conversion-optimized UX), Weinschenk (behavioral layer), Sutherland (decision architecture).
**Depends on:** `02_PRICING_RESET.md`, `03_TRIAL_STRATEGY.md`, `08_DESIGN_TOKENS.md`.
**Affects:** every paywall surface on web + iOS. `web/src/components/LockModal.tsx`, regwall state on `web/src/app/story/[slug]/page.tsx`, `SubscriptionView.swift` (iOS), every permission lock copy string, email templates that reference subscription CTAs.

---

## Current state (verified 2026-04-21)

**Web surfaces with paywall language:**

- `web/src/components/LockModal.tsx` — permission/auth/paywall modal. Copy resolves per `lock_reason`.
- Regwall on `web/src/app/story/[slug]/page.tsx` — triggered after N free articles per session, stored in `sessionStorage`.
- Plan comparison on `web/src/app/profile/settings/billing/page.tsx`.
- `/pricing` if it exists, or the billing settings.

**iOS:**

- `SubscriptionView.swift` — StoreKit 2 plan cards. Has a silent `Loading…` failure path that can lock the UI indefinitely if product load fails.
- Permission locks raised from feature touch points throughout the app.

**Common copy patterns observed:**

- "Your plan doesn't include full article access."
- "Upgrade to unlock this feature."
- "This is a Verity Pro feature."
- "Become a paid member to continue reading."

Every single one of these is a 403 error dressed as a feature gate. Clinical. Punitive. Wrong voice for the product.

## What Weinschenk said in the panel

"Every paywall in news right now is a 403 response with branding. Rewrite every single one as an invitation. Name the reporter. Show the trial timeline. Preview the structure below the wall. Respect the reader enough to tell them what they're paying for."

Sutherland agreed: "The trial timeline — Today / Day 5 / Day 7 — is the single highest-leverage conversion change in modern consumer subscription UX. It's not about revealing the charge day. It's about signaling honesty. Readers who worry about being surprise-charged are the ones who abandon the signup. Give them the timeline and they proceed."

## The rewritten paywall voice

### Principles

1. **Invitation, not gating.** The wall is Verity saying "we'd love you to keep reading," not "you can't read this."
2. **Specific, not generic.** Name the reporter, name the piece, name the plan. Don't say "premium content" when you could say "Elena Martinez's 14-minute investigation."
3. **Transparent, not opaque.** Show the trial timeline. Show the price. Show "cancel anytime" in a place the reader will believe it.
4. **One-line refusal.** Always include a dignified "Not now" option that doesn't guilt, beg, or discount. Readers who aren't ready aren't enemies.
5. **No scarcity theater.** No "only 3 trial slots left," no countdown timers, no "24-hour offer." Verity doesn't manufacture urgency.
6. **No fear.** "Don't miss out" and "you'll regret this" are banned. The reader makes a free choice.

### The template

Every paywall surface follows this structure:

```
[ eyebrow: what Verity is offering ]

[ headline: name the specific thing ]

[ body: what they get, in terms they care about ]

[ trial timeline: Today / Day 5 (or 10) / Day 7 (or 14) ]

[ primary CTA: Start your free trial ]
[ secondary: Not now ]

[ footnote: No charge if you cancel before Day 7. Cancel anytime in settings. ]
```

### Example rewrites

**Before:** "Your plan doesn't include full article access. Upgrade to continue."

**After:**

```
Keep reading.

Finish Elena Martinez's investigation.

You're 3 paragraphs into a 14-minute reported piece. Verity unlocks the rest — plus every story from the investigations desk, ad-free reading across the site, and unlimited bookmarks.

Today      Full access starts immediately
Day 5      Reminder email — cancel anytime
Day 7      $6.99/mo begins unless cancelled

[ Start 7-day free trial ]
[ Not now ]

No charge if you cancel before Day 7. Restore purchase on any device.
```

**Before:** "Direct messaging is available on paid plans."

**After:**

```
Direct messages

Verity is building the first news app where the comments are worth reading. Direct messages are for when a conversation outgrows the thread — between journalists, experts, and readers who want to continue.

Messages are included with Verity Pro. 7-day free trial, then $12.99/mo. Cancel in one tap.

[ See what's in Verity Pro ]
[ Not now ]
```

**Before:** "Bookmark limit reached. Upgrade for unlimited bookmarks."

**After:**

```
You've saved 10 bookmarks.

That's the free tier limit. Verity Pro removes the cap — save everything, organize into collections, export for later.

7-day free trial, then $12.99/mo.

[ Start free trial ]
[ Not now ]
```

Notice what these have in common:

- Name the thing (the reporter, the feature, the specific situation).
- Explain why it's behind a wall (in Verity's voice, not as a business justification).
- Show the trial transparency.
- Provide a dignified exit.

## The hard failure path

`SubscriptionView.swift` has a silent "Loading…" state when StoreKit product load fails. This is a dark pattern by accident — the reader sees a spinner forever and doesn't know why.

Replace with explicit failure UI:

```
We can't load plans right now.

[ Try again ]
[ Contact support ]
```

This is launch-critical per the original notes from the 2026-04-19 FTC-adjacent concern. Failure UI is regulatory-safer than infinite loaders.

## The per-surface inventory

Every surface that currently shows a paywall message must be rewritten. The inventory:

### Web

| surface | current file | new copy source |
|---|---|---|
| Regwall after N free articles | `web/src/app/story/[slug]/page.tsx` + `LockModal.tsx` | `paywalls/storyRegwall.ts` (new content module) |
| Bookmark cap hit | `web/src/app/bookmarks/page.tsx` | `paywalls/bookmarkCap.ts` |
| DM permission gate | `web/src/app/messages/page.tsx` | `paywalls/messages.ts` |
| Expert Q&A gate | (expert-related routes) | `paywalls/expertQa.ts` |
| Ad-free (Verity tier has reduced_ads, pro has ad_free) | implicit in `<Ad />` component | `paywalls/adFree.ts` |
| Advanced search gate | `web/src/app/search/page.tsx` | `paywalls/advancedSearch.ts` |
| Kids profile creation (requires family plan) | `web/src/app/profile/kids/page.tsx` | `paywalls/kidsFamily.ts` |
| Plan upgrade from free to verity on profile settings | `web/src/app/profile/settings/billing/page.tsx` | `paywalls/profileUpgrade.ts` |

### iOS

| surface | current file | new copy source |
|---|---|---|
| Plan cards | `SubscriptionView.swift` | new `Paywalls.swift` localized string module |
| Lock modal (permission failures) | (permission-gated view sites) | `Paywalls.swift` |
| Subscription failure state | `SubscriptionView.swift` | `Paywalls.swift` — the explicit failure UI replacement |

Not separate files for every surface — a single `paywalls/` directory with one module per surface, consumed by the Lock component and the regwall component.

## The Lock component on web

Replace the current `LockModal.tsx` behavior:

Current: a generic modal that renders `lock_reason` copy from a permission row.

New:

- The component accepts a `surface` prop (one of `story-regwall`, `bookmark-cap`, `dm-gate`, etc.).
- Looks up the copy from the `paywalls/` modules.
- Renders the template (eyebrow, headline, body, timeline, primary, secondary, footnote).
- Triggers Stripe Checkout on primary click, dismisses on secondary.

The underlying `lock_reason` string from the DB becomes metadata only — used for internal analytics, not reader-facing copy. Reader-facing copy lives in code, not in the DB (the DB's `lock_reason` text field was mirroring a pattern that doesn't fit the new voice).

## The trial timeline component

Shared between web and iOS. Renders the three-dot timeline.

```
●—————●—————○
Today       Day 5      Day 7
Full        Reminder   $6.99/mo
access      email      begins
starts                 unless
                       cancelled
```

Different variants for monthly vs annual (Day 10 / Day 14 for annual). Data driven from `plans.trial_days` — not hardcoded.

## What this doesn't change

- **The permission matrix.** `lock_reason` text in the DB stays. New paywall copy lives in code.
- **The regwall session counting.** The logic for "you've read N free articles" is unchanged. Just the copy at the wall.
- **Stripe checkout flow.** `/api/stripe/checkout/route.js` is unchanged by this doc (the trial parameter goes in via `03_TRIAL_STRATEGY.md`).
- **Feature flag gating.** If a feature is hidden behind a launch-phase flag (per memory: launch hides are temporary), this doc doesn't remove the flag. The copy behind the flag still gets written — so unhide is a one-line flip per the memory.

## Acceptance criteria

- [ ] A `paywalls/` module directory exists on web with one file per surface.
- [ ] A `Paywalls.swift` module exists on iOS with the localized strings.
- [ ] Every paywall surface renders the new template (eyebrow, headline, body, timeline, primary, secondary, footnote).
- [ ] The trial timeline component reads from `plans.trial_days`, not hardcoded.
- [ ] `SubscriptionView.swift` has explicit failure UI (not infinite Loading…).
- [ ] `LockModal.tsx` rewritten to accept a `surface` prop.
- [ ] A grep for "upgrade to unlock", "your plan doesn't", "become a paid", "this is a verity pro feature" returns zero hits in user-facing strings.
- [ ] All paywall copy tested with at least 2 target-audience readers for voice ("does this feel pushy? does it feel respectful?").
- [ ] Conversion measurement live (see `19_MEASUREMENT.md`): trial start rate per paywall surface, trial-to-paid rate.

## Risk register

- **New voice converts worse than the old clinical version.** Unlikely — transparent/invitation paywalls have a well-documented conversion lift in SaaS and consumer subscription data. But monitor. If trial-start drops >20%, revisit.
- **Copy drift — different paywalls end up with different voices.** Mitigation: the `paywalls/` module structure forces discipline. Every surface goes through the same template.
- **Readers still dismiss en masse.** That's acceptable. Not every reader converts. The goal is to respect the reader who says no. Guilt-based paywalls that extract conversion also extract churn.
- **Translation / i18n.** Not Year 1 scope. English only. Flag for Year 2.

## What Wroblewski flagged as the sharpest miss on current

"The `SubscriptionView` silent loading state is the worst surface. A reader who taps 'Subscribe' and stares at an infinite spinner loses faith in the product. Ship the explicit failure UI first, before the voice rewrite. It's a 30-minute fix that raises the floor on trust."

Priority: that surface ships in Week 1. The rest of the voice rewrite follows in the same sprint.

## Sequencing

Ship after: `02_PRICING_RESET.md` and `03_TRIAL_STRATEGY.md` (prices and trial behavior need to be correct before paywall copy references them).
Ship before: any paid marketing push. Bad paywall voice poisons even good acquisition traffic.
Pairs with: `08_DESIGN_TOKENS.md` (paywall rendering uses the token typography + spacing).
Fixes first: the `SubscriptionView` infinite-loading silent failure (can ship standalone — don't gate on the rest of the rewrite).
