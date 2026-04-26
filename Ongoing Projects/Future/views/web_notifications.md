# Web — Notifications

**File:** `web/src/app/notifications/page.tsx`
**Owner:** Wroblewski (list UX).
**Depends on:** `08_DESIGN_TOKENS.md`, `17_REFUSAL_LIST.md`.
**DB touchpoints:** `notifications`, `user_notifications`.

---

## Current state

Notification center. Permission gate: `notifications.inbox.view`. Renders email + push delivery history, mark-all-read, subscription preferences.

## What changes

### Refusal-list alignment

Per `17_REFUSAL_LIST.md` item: "No push notifications optimized for re-engagement. Breaking news only."

This view shouldn't show "here's what we could push to re-engage you" surfaces. It's strictly: what notifications did you get, can you mark read, and can you manage category subscriptions.

### Subscription management

Readers can subscribe to:
- Categories (Politics, Economy, etc.)
- Subcategories if enabled
- Keywords (Verity Pro feature)

Per `11_PAYWALL_REWRITE.md`: keyword subscriptions behind Pro tier, shown with invitation voice gate if non-paid.

### Token pass + accessibility

Standard.

### Empty state

"No notifications yet. Verity only sends breaking news alerts — nothing else."

This copy reinforces the refusal. No gamification nudge, no "you haven't been here in a while."

## Files

- `web/src/app/notifications/page.tsx` — copy polish, paywall surface on keyword sub, token pass.

## Acceptance criteria

- [ ] No re-engagement notification copy.
- [ ] Empty state reinforces refusal posture.
- [ ] Keyword subscription uses paywall for non-paid.
- [ ] Token pass.

## Dependencies

Ship after `11_PAYWALL_REWRITE.md`, `17_REFUSAL_LIST.md`.
