# iOS Adult — Alerts / Notifications

**File:** `VerityPost/VerityPost/AlertsView.swift`
**Owner:** Wroblewski (list UX), Zhuo (push permission flow).
**Depends on:** `08_DESIGN_TOKENS.md`, `17_REFUSAL_LIST.md`, `16_ACCESSIBILITY.md`.

---

## Current state

Per recon: two tabs (Alerts, Manage). Manage tab is feature-flagged off (`manageSubscriptionsEnabled = false`) because subscription-topics table doesn't ship yet. Empty state says "Subscribe in Manage" but Manage is locked — confusing.

Pre-prompt push permission sheet exists; flows to system dialog.

## What changes

### Empty state copy

Update to match refusal posture:

```
You're all caught up.

Verity only sends breaking news alerts — nothing else. We refuse re-engagement push notifications.
```

This normalizes "there's nothing here" as intentional, not missing.

### Manage tab

Option A (recommended): hide the Manage tab entirely until subscription-topics table ships. Per launch-hide memory.

Option B: keep the tab but make the disabled state warmer:

```
Subscribe to categories

We'll let you know when Verity publishes breaking news in categories you follow. This feature is coming in a later update.

[ Get notified when it's ready ]
```

Launch-phase flag controls visibility.

### Push permission pre-prompt

Current pre-prompt sheet. Keep. Polish copy per invitation voice:

```
Turn on notifications?

Verity only pushes breaking news. No daily digests, no "we miss you," no recommendations. You'll hear from us when something material actually happens.

[ Turn on ]
[ Not now ]
```

### Notification row UX

Each notification row shows: category eyebrow, headline, time since, read indicator. Tap → StoryDetailView.

### Token pass + Dynamic Type

Standard.

## Files

- `VerityPost/VerityPost/AlertsView.swift` — copy polish, Manage tab decision.
- `VerityPost/VerityPost/PushPromptSheet.swift` — copy polish.

## Acceptance criteria

- [ ] Empty state copy rewritten to reinforce refusal posture.
- [ ] Manage tab decision implemented (hidden or warmer disabled state).
- [ ] Push pre-prompt copy rewritten.
- [ ] Notification row tap works → story detail.
- [ ] Token pass.
- [ ] Dynamic Type.

## Dependencies

Ship after `17_REFUSAL_LIST.md` (copy aligns with refusals).
