# Web — Profile Settings

**Files:** `web/src/app/profile/settings/*`
**Owner:** Wroblewski (forms), Zhuo (IA), Bell (data-privacy surfaces).
**Depends on:** `08_DESIGN_TOKENS.md`, `02_PRICING_RESET.md`, `11_PAYWALL_REWRITE.md`, `04_TRUST_INFRASTRUCTURE.md`, `16_ACCESSIBILITY.md`.

---

## Current state

Settings hub + subpages:
- `/profile/settings` — hub nav.
- `/profile/settings/profile` — name, bio, username, avatar, links.
- `/profile/settings/feed` — category preferences.
- `/profile/settings/emails` — email addresses.
- `/profile/settings/password` — change password.
- `/profile/settings/alerts` — notification settings.
- `/profile/settings/billing` — plan management, upgrade, cancel.
- `/profile/settings/login-activity` — sessions.
- `/profile/settings/data` — GDPR export/delete.
- `/profile/settings/blocked` — blocked users.
- `/profile/settings/expert` — expert settings.
- `/profile/settings/supervisor` — parental controls (likely redirects).

Permissions: `settings.*` family.

## What changes

### `/profile/settings/billing` — pricing display update

Reads from `plans` table. Per `02_PRICING_RESET.md`: updated prices ($6.99, $12.99, $19.99, $29.99). Trial timeline component renders when user has an active trial.

Shows:
- Current plan + period (monthly/annual)
- Renewal date
- Cancel button (web → cancels at period end; iOS users see "Manage in Apple Subscriptions" with deep-link)
- Upgrade/downgrade tiles with trial timeline for ineligible plans
- Invoice history

### `/profile/settings/alerts` — push toggle

The current view has toggles for email/push alerts. Ensure it reflects the actual `alert_preferences` table state and correctly respects `notifications.subscription.*` permission.

### `/profile/settings/data` — GDPR/CCPA

Per `04_TRUST_INFRASTRUCTURE.md` trust posture: this page is part of the reader-facing trust surface. Polish the copy:

- "Request a copy of your data" — straightforward, no drama.
- "Delete your account" — 30-day grace window. Clear communication of what gets deleted.
- "See our standards" link to `/standards`.
- "See our refusal list" link to `/refusals`.

### Remove keyboard shortcuts

If any exist in settings subpages, remove.

### Typography + token pass

Every settings page inherits the token typography. Form controls use shared `components/Field`, `components/TextInput`, etc.

## Files

- `web/src/app/profile/settings/billing/page.tsx` — new price display.
- `web/src/app/profile/settings/data/page.tsx` — copy polish + trust links.
- All other settings subpages — token pass only.

## Acceptance criteria

- [ ] Billing page shows current prices matching `plans` table.
- [ ] Trial timeline renders when active trial.
- [ ] Cancel flow web → Stripe cancel at period end; iOS → Apple deep-link.
- [ ] Data privacy page links to `/standards` and `/refusals`.
- [ ] No keyboard shortcuts.
- [ ] Form fields accessible (labels, ARIA, keyboard).

## Dependencies

Ship after `02_PRICING_RESET.md`, `03_TRIAL_STRATEGY.md`, `04_TRUST_INFRASTRUCTURE.md`.
