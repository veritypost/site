# Unit 8 — Marketing bundle (`/pricing`, `/how-it-works`, `/about`, `/contact`, `/kids-app`)

**Surface(s):** `web/src/app/pricing/page.tsx` (262 lines), `web/src/app/how-it-works/page.tsx` (164 lines), `web/src/app/about/page.tsx` (142 lines), `web/src/app/contact/page.tsx` (366 lines), `web/src/app/kids-app/page.tsx` (268 lines), `web/src/app/pricing/_CheckoutButton.tsx` (71 lines)
**Status:** in-review
**Date:** 2026-05-03
**Anchor:** findings pass complete (main session + 3 independent reviewers). Panels dispatched for Q1 (Family plan web) and Q2 (annual pricing). Auto-locking clear PRINCIPLE violations. Owner adjudication pending.

---

## Findings

### Critical — Functional / Security

**F01** [crit] `contact/page.tsx:191` — Contact form uses a `<div>` with `onClick` button, not a `<form>` element. Pressing Enter in any text field does nothing. No form landmark for assistive technology. No native validation. Fix: wrap form contents in `<form onSubmit={handleSubmit}>`, change submit button to `type="submit"`.

**F02** [crit] `contact/page.tsx:194` — No `htmlFor`/`id` pairing on any of the 4 label+input pairs (Topic, Email, Subject, Message). Screen readers cannot associate labels with controls (WCAG 1.3.1). Fix: add matching `htmlFor` on each `<label>` and `id` on each input/textarea.

**F03** [crit] `contact/page.tsx:259` — Input/textarea elements set `outline: 'none'` with no compensating focus style. Keyboard focus is invisible (WCAG 2.4.7). Fix: remove `outline: none` and rely on the global `focus-visible` style, or add a `box-shadow` ring using `var(--accent)`.

**F04** [crit] `how-it-works/page.tsx:82` — Step circle badge colors (#34d399 green, #f59e0b amber, #f472b6 pink) with white text achieve ~1.9:1, ~2.1:1, and ~2.6:1 contrast — all fail WCAG 1.4.3 AA (4.5:1 required for small text). Fix: darken fill to a passing shade or use dark text on a lighter tint.

**F05** [crit] `pricing/page.tsx:187` — "Start Family" `<CheckoutButton planName="verity_family_monthly">` POSTs to `/api/stripe/checkout` which returns 404 because `verity_family_monthly` has `is_visible=false` (iOS StoreKit only). The button shows a generic "Something went wrong" error with no indication the plan is unavailable on web. **Pending DECISION (Q1).**

**F06** [crit] `pricing/_CheckoutButton.tsx:32` — The checkout API can return `409 { error: 'beta_comp_active', message: '…', comped_until: '…' }`. The button renders the raw key `"beta_comp_active"` as the user-facing error message. Fix: map this case to a human-readable message, e.g. "Your beta access is active until [comped_until]. No payment needed."

### Copy / Accuracy (clearly wrong — no panel needed)

**F07** [polish] `how-it-works/page.tsx:19` — "Every article includes a Verity Score and source transparency data." The `verity_score` column is a user profile metric, not per-article. No article-level Verity Score exists anywhere in the product. Fix: change to "Build your Verity Score by reading, quizzing, and discussing articles."

**F08** [polish] `pricing/page.tsx:142` — Free plan bullet reads "Daily article cap (~5/mo)". The actual mechanism is a rolling 7-day cookie window (`maxAge: 7 * 24 * 60 * 60`), not a daily cap, and not a calendar-month cap. Fix: "Read up to 5 articles per week" (or whatever the actual limit is per the cookie logic).

**F09** [polish] `kids-app/page.tsx:130` — Waitlist success state reads "We'll email you when Verity Post Kids is live in the App Store." Form label: "Email me when Verity Post Kids is in the App Store." Both use future-delivery framing (PRINCIPLE §5.1). Fix: success → "You're on the list! We'll be in touch." Form label → "Join the Verity Post Kids waitlist."

**F10** [polish] `about/page.tsx:95` — "Press inquiries" lists `support@veritypost.com` — identical to "General support" above it. If intentional (small team), the duplicate label still confuses visitors. Fix: if no dedicated press email exists, merge into one entry: "Support & press: support@veritypost.com". If a `press@` alias exists, use it.

### A11y / Semantic HTML

**F11** [polish] `contact/page.tsx:207` — Topic selection buttons have no `aria-pressed` attribute. Selected/unselected state is color-only (invisible to AT, WCAG 4.1.2). Fix: add `aria-pressed={topic === t}` to each topic button.

**F12** [polish] `contact/page.tsx:194` — Topic label + button group has no `<fieldset>`/`<legend>` or `role="group"` with `aria-label`. Screen readers announce the buttons with no group context. Fix: wrap topic buttons in `<fieldset><legend>Topic</legend>...</fieldset>` and remove the orphaned `<label>`.

**F13** [polish] `how-it-works/page.tsx:95` — `">"` step-separator spans have no `aria-hidden="true"`. VoiceOver/NVDA will announce "greater than" between each step label. Fix: add `aria-hidden="true"` to each separator.

**F14** [polish] `pricing/page.tsx:66` — Plan card titles ("Free", "Verity", "Verity Family") are `<div>` elements. Heading hierarchy jumps from `<h1>Pricing</h1>` to `<h2>How Family pricing scales</h2>` with no plan headings. Fix: change plan title divs to `<h2>` or `<h3>` depending on hierarchy.

**F15** [polish] `pricing/page.tsx:215` — Pricing comparison `<table>` `<th>` elements have no `scope="col"`. AT cannot reliably associate headers with data cells. Fix: add `scope="col"` to each `<th>`.

**F16** [polish] `contact/page.tsx:27` — All `<button>` elements in the contact form omit explicit `type` attribute. HTML default is `type="submit"` which causes unintended form submission if a form element is added. Fix: add `type="button"` to topic buttons, `type="submit"` to the submit button.

### Dark Mode / Tokens

**F17** [parity] All 5 marketing pages hardcode `background: '#ffffff'` (or equivalent) as inline styles. In dark mode, all page shells and cards remain white on a dark background (PRINCIPLE §1.1). Fix: replace with `var(--card)` or `var(--bg)` as appropriate. First sighting at `how-it-works/page.tsx:46` — repeated across all 5 files.

**F18** [polish] `contact/page.tsx:336` — Error text uses hardcoded `color: '#dc2626'` while the global `--danger` token is `#b91c1c`. Token drift. Also: dark-mode has no override for `--danger-bg`/`--danger-border` variables, so the pale-red error box persists on dark backgrounds. Fix: use `var(--danger)` for text; add dark-mode overrides for the bg/border tokens.

**F19** [polish] `pricing/_CheckoutButton.tsx:65` — Error color also hardcoded `'#dc2626'` instead of `var(--danger)`. Fix: same token replacement.

**F20** [parity] `how-it-works/page.tsx:82,111` — Step circle and border accent colors are hardcoded hex that also fail non-text WCAG contrast (3:1) against their `#f7f7f7` card background: green border ~1.7:1, amber ~1.95:1, pink ~2.42:1. Fix: darken accent or use higher-contrast tints; switch to `var(--*)` tokens.

### SEO / Metadata

**F21** [polish] `how-it-works/page.tsx:1`, `contact/page.tsx:3`, `kids-app/page.tsx:5` — Three `'use client'` pages export no `metadata`. All three fall back to the root-layout default title/description. Fix: add sibling `layout.tsx` files with `metadata` exports for each route.

**F22** [polish] `pricing/page.tsx:14`, `about/page.tsx:6` — These pages export `metadata.title` as a plain string (e.g., `'Pricing — Verity Post'`) but the root layout applies a template suffix, producing "Pricing — Verity Post · Verity Post". Fix: use `title: { absolute: 'Pricing — Verity Post' }` to override the template.

### UX / Interaction

**F23** [polish] `pricing/page.tsx:148` — Free plan CTA label is "Sign up free" but `ctaHref="/login"`. An authenticated free-tier user clicking it lands on the login form. Fix: change `ctaHref` to `/signup` (the canonical new-user entry point). For already-authenticated users, detect auth state and replace with "You're on Free" or a plan-upgrade CTA.

**F24** [polish] `pricing/page.tsx:169` — Annual pricing ($79.99/yr, $149.99/yr) is displayed in plan card footers with no checkout path. Users who prefer annual billing have no way to purchase it. **Pending DECISION (Q2).**

**F25** [polish] `contact/page.tsx:39` — `loggedIn` initializes to `false` (not `null`). Authenticated users see the form without the "contact from your account" banner during the async auth check round-trip (~100ms). Fix: initialize to `null`; render a skeleton or nothing in the auth-status area until resolved.

**F26** [polish] `contact/page.tsx:99` — "Back to home" uses bare `<a href="/">` causing full-page navigation. Fix: use `<Link href="/">` from `next/link`.

**F27** [polish] `how-it-works/page.tsx:95` — Step-separator row uses `flexWrap: 'wrap'` without wrapping each `step + separator` as an atomic unit. On narrow viewports, `>` can appear as the last element on a wrapped row, implying a dead-end step. Fix: wrap each `step + separator` pair in a flex item, or use `overflow: hidden` with a horizontal scroll.

**F28** [polish] `pricing/page.tsx:96` — `PlanCard` types `ctaHref?: string` (optional) then uses `href={ctaHref!}` with a non-null assertion. Future callers that omit `ctaHref` silently produce `href="undefined"`. Fix: guard with `ctaHref && <a href={ctaHref}>` or require the prop.

**F29** [parity] `pricing/page.tsx:175` — Family plan shows a checkout button on web with no indication it requires iOS. iOS users buy via StoreKit; web checkout is intentionally disabled. The pricing page gives no hint of this, so a web visitor gets a confusing error. **Folded into DECISION Q1.**

---

## Owner-decision questions (panels dispatched)

- **Q1** — Family plan on web: how to handle broken checkout (F05 + F29)
- **Q2** — Annual pricing: keep informational mention or remove until implemented (F24)

## Auto-locked decisions

- **F07, F08, F09, F10** — clear copy accuracy / PRINCIPLE violations, no panel needed.
- **F17, F18, F19, F20** — dark-mode token drift, per PRINCIPLE §1.1.
- **F11–F16, F21–F28** — a11y, semantic HTML, SEO gaps with obvious fixes.

---

## Summary

| Severity | Count |
|----------|-------|
| [crit] | 6 (F01–F06) |
| [polish] | 21 (F07–F28) |
| [parity] | 2 (F17, F20, F29 folded into Q1) |
| **Total** | **29** |
