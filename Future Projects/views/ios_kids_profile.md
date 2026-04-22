# iOS Kids — Profile

**File:** `VerityPostKids/VerityPostKids/ProfileView.swift`
**Owner:** Zhuo, Ive.
**Depends on:** `14_KIDS_CHOREOGRAPHY.md`, `08_DESIGN_TOKENS.md`.

---

## Current state

Per recon: header (avatar + name), stats grid, badges section. Unpair button (gated).

## What changes

### Tokens + Kid press style

Apply `KidPressStyle` to all interactive elements (unpair button, badge tiles, stat taps).

### Badge tile interaction

Tap a badge → show its unlock story (when earned, why, a small re-play of the badge's gradient). Small moment, not full scene. Provides kid with something to return to.

### Unpair button — warm gate

"Unpair" is a sensitive action (removes kid from device). Currently permission-gated. Wrap with `ParentalGateModal`:

```
Want to remove Verity Post for Kids from this device?

A grown-up will need to help.

[ Ask a grown-up ]
[ Cancel ]
```

Tap "Ask a grown-up" triggers `ParentalGateModal`. Passing the gate proceeds to the confirmation.

### Stats grid

Current: streak, score, quizzes passed, biased headlines spotted. Replace "biased headlines spotted" — that metric assumes bias-detection which isn't part of our Charter. Replace with "Articles read" or similar.

Token pass for typography and spacing.

### Theme color

Profile uses the kid's own theme color prominently. Makes the tab feel personal.

## Files

- `VerityPostKids/VerityPostKids/ProfileView.swift` — press style, unpair gate, stats update, token pass.

## Acceptance criteria

- [ ] KidPressStyle applied to interactive elements.
- [ ] Badge tap shows unlock story.
- [ ] Unpair button wrapped with ParentalGateModal.
- [ ] "Biased headlines" stat replaced with content-aligned metric.
- [ ] Theme color prominent in profile.
- [ ] Token pass.
- [ ] Reduce Motion path.

## Dependencies

Ship after `14_KIDS_CHOREOGRAPHY.md` (KidPressStyle + parental gate wire-up).
