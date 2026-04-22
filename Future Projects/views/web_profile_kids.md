# Web — Parent Kids Management

**Files:** `web/src/app/profile/kids/page.tsx`, `web/src/app/profile/kids/[id]/page.tsx`
**Owner:** Zhuo (parent ↔ kid lifecycle), Ali (kids ops).
**Depends on:** `07_KIDS_DECISION.md`, `14_KIDS_CHOREOGRAPHY.md`, `11_PAYWALL_REWRITE.md`.
**DB touchpoints:** `kid_profiles`, `user_achievements`, `reading_log`, `quiz_attempts`, `kid_expert_sessions`.

---

## Current state

`/profile/kids` — parent kid-profile manager. Family-plan gated. Permissions: `kids.parent.view`, `family.add_kid`, `family.remove_kid`, `kids.trial.start`, `kids.parent.household_kpis`. API calls to `/api/kids/*`.

`/profile/kids/[id]` — individual kid dashboard. Activity, stats, upcoming expert sessions, streak freeze, leaderboard opt-in.

Per recon: structurally solid. Pair flow uses `/api/kids/pair` and `/api/kids/generate-pair-code`.

## What changes

### Family-plan paywall surface

If parent tries to visit `/profile/kids` without a family plan, show the `kidsFamily` paywall (per `11_PAYWALL_REWRITE.md`):

```
Set up kids profiles.
The Verity family plan adds up to [N] kid profiles to your subscription — each with their own kid-safe reading experience on the iOS app.

[ Trial timeline ]

[ Start 7-day free trial ]
[ Not now ]
```

### Add kid flow

Pair code generation → clear parent-facing copy:

```
Set up [kid name]'s Verity app.

1. On your kid's iPad or iPhone, download "Verity Post for Kids" from the App Store.
2. Open the app and enter this code: [XXXX-XXXX]
3. The code works for 30 minutes and can only be used once.

[ Show QR code instead ]
[ Cancel ]
```

Include a QR code option — scanning with the kid's device camera opens the kids app with the code pre-filled. Requires a small deep-link from the kids app (likely already present per `KidsAppLauncher.swift` inverse).

### Kid dashboard enhancements

`/profile/kids/[id]`:

- Reading activity timeline (last 30 days).
- Quiz pass rate.
- Streak current + longest.
- Recent achievements.
- Expert sessions booked.
- Parent actions: pause account, delete (with 30-day grace), edit theme color, reset PIN (if implemented), change display name.

### Remove keyboard shortcuts

If any exist in kids pages, remove.

## Files

- `web/src/app/profile/kids/page.tsx` — family-plan paywall + pair flow polish.
- `web/src/app/profile/kids/[id]/page.tsx` — dashboard polish.
- `web/src/components/KidPairCodeDisplay.tsx` — new, with QR option.

## Acceptance criteria

- [ ] Non-family-plan parents see the invitation-voice paywall.
- [ ] Pair code displays with QR option.
- [ ] Kid dashboard shows activity timeline, achievements, streak, expert sessions.
- [ ] Parent actions (pause, delete, edit) work with clear confirmations.
- [ ] No keyboard shortcuts.
- [ ] Token pass applied.

## Dependencies

Ship after `07_KIDS_DECISION.md`, `11_PAYWALL_REWRITE.md`, `14_KIDS_CHOREOGRAPHY.md` (kids app polish is the thing being sold here).
