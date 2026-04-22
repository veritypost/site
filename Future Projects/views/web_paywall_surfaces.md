# Web — Paywall Surfaces

**Files:** `web/src/components/LockModal.tsx`, multiple surface-specific routes.
**Owner:** Wroblewski, Weinschenk, Sutherland.
**Depends on:** `11_PAYWALL_REWRITE.md`, `02_PRICING_RESET.md`, `03_TRIAL_STRATEGY.md`.
**DB touchpoints:** `plans` (new trial_days, new prices), `subscriptions` (trial state).

---

## Current state

`LockModal.tsx` renders a generic modal with copy pulled from `lock_reason`. Voice is clinical ("Your plan doesn't include...", "Upgrade to unlock..."). Paywall surfaces scattered across the codebase:

- Regwall on `/story/[slug]` after N free articles.
- Bookmark cap hit on `/bookmarks`.
- DM permission gate on `/messages`.
- Expert Q&A gate.
- Ad-free gate (currently just renders `<Ad />` — not a paywall per se).
- Advanced search gate on `/search`.
- Kids profile creation gate on `/profile/kids`.
- Plan upgrade on `/profile/settings/billing`.

## What changes

Per `11_PAYWALL_REWRITE.md`: every paywall surface speaks invitation voice, shows trial timeline, provides dignified "Not now."

### Template

```
[ eyebrow ]
[ headline — name the specific thing ]
[ body — what they get ]
[ trial timeline ]
[ primary CTA ]
[ secondary: Not now ]
[ footnote — cancel anytime ]
```

### Refactor `LockModal.tsx`

New prop signature: `<LockModal surface={...} onDismiss={...} />`.

Copy lives in `paywalls/` modules, one per surface. `LockModal` imports the copy module by `surface` key.

### `paywalls/` modules

Each module exports typed copy:

```ts
// web/src/lib/paywalls/storyRegwall.ts
export const storyRegwall = {
  eyebrow: "Keep reading",
  headline: (reporterName: string) => `Finish ${reporterName}'s investigation.`,
  body: (paragraphsRead: number, totalReadMin: number) =>
    `You're ${paragraphsRead} paragraphs into a ${totalReadMin}-minute reported piece. Verity unlocks the rest — plus every story from the investigations desk, ad-free reading across the site, and unlimited bookmarks.`,
  primaryCta: "Start 7-day free trial",
  secondary: "Not now",
  footnote: "No charge if you cancel before Day 7. Restore purchase on any device.",
};
```

Repeat for each surface: `bookmarkCap`, `messages`, `expertQa`, `advancedSearch`, `kidsFamily`, `profileUpgrade`.

### Trial timeline component

`<TrialTimeline days={7} price="$6.99/mo" />` — reads from `plans.trial_days`. Renders three dots:

- Today — Full access starts immediately
- Day 5 — Reminder email — cancel anytime
- Day 7 — $6.99/mo begins unless cancelled

Annual variant (Day 10 / Day 14). Data-driven from plan period.

### Copy to grep-and-remove

Zero hits after cutover on:
- "upgrade to unlock"
- "your plan doesn't"
- "become a paid"
- "this is a verity pro feature"
- "upgrade your plan"
- "premium feature"

## Files

- `web/src/components/LockModal.tsx` — refactor to accept `surface` prop.
- `web/src/components/TrialTimeline.tsx` — new.
- `web/src/lib/paywalls/` — new directory, one file per surface.
- `web/src/lib/paywalls/index.ts` — exports surface-to-copy map.
- Every caller of `LockModal` — audit to pass `surface` prop.

## Acceptance criteria

- [ ] `paywalls/` directory exists with one module per surface.
- [ ] `LockModal` accepts `surface` prop and looks up copy.
- [ ] `TrialTimeline` reads from `plans.trial_days` (not hardcoded).
- [ ] Grep confirms no hits on banned phrases.
- [ ] Every paywall surface renders the template shape.
- [ ] `SubscriptionView.swift` failure UI shipped (addressed in `views/ios_adult_subscription.md`).
- [ ] Copy reviewed with 2 target-audience readers for voice.

## Dependencies

Ship after `02_PRICING_RESET.md` and `03_TRIAL_STRATEGY.md` (prices and trial behavior must be configured in DB first).
