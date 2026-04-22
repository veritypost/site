# iOS Adult — Family / Parent Kid Management

**File:** `VerityPost/VerityPost/FamilyViews.swift` (contains FamilyDashboardView, KidDashboardView, FamilyLeaderboardView, FamilyAchievementsView)
**Owner:** Zhuo (parent ↔ kid lifecycle), Ali (kids ops), Wroblewski (onboarding).
**Depends on:** `07_KIDS_DECISION.md`, `14_KIDS_CHOREOGRAPHY.md`, `11_PAYWALL_REWRITE.md`, `08_DESIGN_TOKENS.md`.

---

## Current state

Per recon: family-tier gated. Dashboard with kids list, family leaderboard, shared achievements. `KidsAppLauncherButton` deep-links to the kids app. Each kid has a dashboard with stats, reading history.

## What changes

### Non-family gate

If parent taps Family from Profile and isn't on family plan:

```
Set up kids profiles.

The Verity Family plan adds up to 2 kid profiles to your subscription — each with their own kid-safe reading experience on the Verity Post for Kids app.

[ Trial timeline ]

[ Start 7-day free trial ]
[ Not now ]
```

Uses `LockModal` / equivalent SwiftUI component with `surface="kidsFamily"`.

### Add kid flow

Mirrors web per `views/web_profile_kids.md`. Generate pair code → display 8-char code + QR code option. Copy:

```
Set up [kid name]'s Verity app.

1. On your kid's device, download "Verity Post for Kids" from the App Store.
2. Open the app and enter this code: [XXXX-XXXX]
3. Valid for 30 minutes, one use.

[ Show QR code ]
[ Copy code ]
[ Cancel ]
```

### Kid dashboard

Stats: reading activity, streak, quiz pass rate, recent achievements, expert sessions booked.

Actions: pause, delete (30-day grace), edit theme color, reset PIN, change display name.

### Family leaderboard

Family-scoped only. Per `07_KIDS_DECISION.md`: kids' ranks within the family, not globally. Animations on rank changes per `14_KIDS_CHOREOGRAPHY.md` (though that doc is primarily for the kids app — consistency good).

### Shared achievements

Joint family milestones (everyone hit a streak together, etc.) — stays if implemented; keep as is.

### Token pass + Dynamic Type

Standard.

## Files

- `VerityPost/VerityPost/FamilyViews.swift` — paywall gate, pair-code flow, token pass.
- `VerityPost/VerityPost/Views/KidPairCodeSheet.swift` — new.

## Acceptance criteria

- [ ] Non-family-plan parent sees invitation-voice paywall.
- [ ] Pair code flow shows code + QR.
- [ ] Kid dashboard accurate (reads real data).
- [ ] Parent actions work (pause, delete with grace, edit, reset PIN).
- [ ] Family leaderboard family-scoped only.
- [ ] Deep-link to kids app works (veritypostkids://open?kid=<id>).
- [ ] Fallback to `https://veritypost.com/kids-app` if app not installed.
- [ ] Token pass.
- [ ] Dynamic Type.

## Dependencies

Ship after `07_KIDS_DECISION.md` (the sidecar decision), `11_PAYWALL_REWRITE.md`, `14_KIDS_CHOREOGRAPHY.md` (the kids app polish that justifies the family-plan pitch).
