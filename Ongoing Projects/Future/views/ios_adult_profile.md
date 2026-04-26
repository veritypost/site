# iOS Adult — Profile

**Files:** `VerityPost/VerityPost/ProfileView.swift`, `VerityPost/VerityPost/ProfileSubViews.swift`, `VerityPost/VerityPost/SettingsView.swift` (and settings sub-views), `VerityPost/VerityPost/PublicProfileView.swift`.
**Owner:** Zhuo, Wroblewski.
**Depends on:** `08_DESIGN_TOKENS.md`, `16_ACCESSIBILITY.md`, `11_PAYWALL_REWRITE.md`.

---

## Current state

Per recon: 6 sub-tabs in ProfileView (Overview, Activity, Quizzes, Milestones, Achievements, Kids). Stats grid. Navigation to SettingsView via gear. SettingsView is a `Form` with many sections.

Issues:
- 6 sub-tabs in horizontal scroll → Kids tab easy to miss.
- Category thresholds hardcoded (reads 20, quizzes 20, etc.) — not DB-driven.
- Settings data-heavy views (login activity, feed prefs) may need pagination.

## What changes

### Streak card moves here from HomeView

Per `views/ios_adult_home.md`: streak belongs on Profile, not Home. Display it at the top of Overview with the existing flame-based design.

### Tab architecture

Collapse from 6 sub-tabs to 4:
- Overview (stats + streak + recent activity summary)
- Activity (reads + quizzes + comments, filterable)
- Achievements (milestones + badges)
- Kids (if family plan; otherwise hidden)

Four tabs fit without horizontal scroll on most device widths. Kids tab discoverability improves.

### Category thresholds

Read from `score_rules` and `category_scores` via existing hooks. Remove hardcoded 20/20/10/10 values.

### Billing/subscription in settings

Ties to `views/ios_adult_subscription.md` (the subscription management sub-view).

### Token pass + Dynamic Type

`Theme.swift` tokens + `Font.scaledSystem` throughout.

## Files

- `VerityPost/VerityPost/ProfileView.swift` — tab collapse, streak move, hardcoded-threshold removal.
- `VerityPost/VerityPost/ProfileSubViews.swift` — token pass.
- `VerityPost/VerityPost/SettingsView.swift` — trust-surface link additions (see below).
- `VerityPost/VerityPost/PublicProfileView.swift` — token pass.

### Settings additions (per `04_TRUST_INFRASTRUCTURE.md`)

Add a "How Verity works" section:
- "Our standards" → opens `/standards` in Safari VC.
- "Corrections" → `/corrections`.
- "What we refuse" → `/refusals`.
- "Editorial log" → `/editorial-log`.

This surfaces the trust infrastructure from within the iOS app.

## Acceptance criteria

- [ ] 4 tabs instead of 6; horizontal scroll not needed on standard widths.
- [ ] Streak card on Overview tab.
- [ ] Category thresholds DB-driven.
- [ ] Settings has "How Verity works" section linking to public trust pages.
- [ ] Token pass applied.
- [ ] Dynamic Type scales.
- [ ] No keyboard shortcuts.
- [ ] Kids tab hidden for non-family-plan users.

## Dependencies

Ship after `08_DESIGN_TOKENS.md`, `16_ACCESSIBILITY.md` (Dynamic Type in Theme.swift), `04_TRUST_INFRASTRUCTURE.md` (trust pages exist to link to).
