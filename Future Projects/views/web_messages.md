# Web — Messages

**File:** `web/src/app/messages/page.tsx`
**Owner:** Wroblewski (IA), Zhuo (conversation UX).
**Depends on:** `08_DESIGN_TOKENS.md`, `11_PAYWALL_REWRITE.md`.
**DB touchpoints:** `conversations`, `conversation_participants`, `messages`, `message_receipts`.

---

## Current state

Direct messages inbox. Permission gate: `messages.inbox.view`. Per web-recon: may not be fully functional per launch-phase notes. Real-time subscriptions to Supabase Realtime.

## What changes

### Paid-tier paywall surface

DMs are paid-only per current permission matrix. Non-paid reader hits a paywall:

```
Direct messages

Verity is building the first news app where the comments are worth reading. Direct messages are for when a conversation outgrows the thread — between journalists, experts, and readers who want to continue.

Messages are included with Verity Pro.

[ Trial timeline ]

[ See what's in Verity Pro ]
[ Not now ]
```

Uses `LockModal` with `surface="messages"`.

### Launch-phase decision

Per launch-phase memory: "hide via gates/flags, keep state alive so unhide is a one-line flip." Messages may be hidden at launch if it's not yet production-ready. Verify current state: is DM feature shipping at launch or post-launch?

If post-launch hide: `feature_flags` row like `messages_enabled` controls visibility. Hide behind the flag — don't delete — per the memory.

### Token pass

Standard.

### Moderation hooks

Messages carry `user_warnings` and `reports` integration. Ensure these remain functional.

## Files

- `web/src/app/messages/page.tsx` — paywall surface swap, token pass.

## Acceptance criteria

- [ ] Paywall uses invitation voice.
- [ ] Launch-phase state decided: live or hidden-with-flag.
- [ ] If hidden, unhide is a flag flip.
- [ ] Token pass.
- [ ] Moderation report flow works.

## Dependencies

Ship after `11_PAYWALL_REWRITE.md`.
