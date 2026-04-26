# iOS Kids — Pair Code View

**Files:** `VerityPostKids/VerityPostKids/PairCodeView.swift`, `VerityPostKids/VerityPostKids/PairingClient.swift`, `VerityPostKids/VerityPostKids/KidsAuth.swift`.
**Owner:** Zhuo (the first 30 seconds), Ive (micro-feedback), Ali (pair-through rate).
**Depends on:** `14_KIDS_CHOREOGRAPHY.md`, `07_KIDS_DECISION.md`.

---

## Current state

Per kids-iOS-recon:
- 8-char code input, 60s lockout on 3 wrong attempts.
- Pair button disabled while pairing.
- Error messaging visible.
- Functional but flat — teal border on focus, no keystroke sparkle, no bounce.

Pairing flow: enter code → POST `/api/kids/pair` → receive JWT → store in Keychain → hydrate KidsAuth. Works. Not warm.

## What changes

This view is the highest-leverage kids screen per `07_KIDS_DECISION.md` (pair-through rate is the metric that determines whether family plan converts). Polish per `14_KIDS_CHOREOGRAPHY.md`.

### Input micro-feedback

Per keystroke:
- Active character position bounces (springSnap).
- Teal-to-bg brief cross-fade.
- 2–3 sparkle particles emit at cursor position.

### Button press

Apply `KidPressStyle` (new, per `14_KIDS_CHOREOGRAPHY.md`):
- Press: 0.96 scale with springSnap.
- Release: bounce to 1.00 with springOvershoot.
- Haptic `.soft` on release.

### Pairing state

Replace spinner with breathing teal border pulse on the code field. Copy: "Checking..." beneath the field, lightly animated (calm, not anxious).

### Fail state

- Horizontal shake (4 cycles, 8pt amplitude, 200ms).
- Haptic `.rigid`.
- Error copy appears calmly below field: "That code didn't work. Try again or ask a grown-up."
- No red. Color stays teal. Fail is a state, not a crisis.

### Lockout state

After 3 fails → 60s lockout. Copy:

```
Come back in [60] seconds.

You've tried 3 times. Take a little break.
```

Animated countdown (live number, no spinner). When lockout ends, field resumes editable with a single gentle pulse.

### Success state

- Field dissolves into a ~30-particle burst.
- Kid's theme color washes over screen (as set by parent at profile creation).
- Welcome scene loads: "Welcome in, [Name]!"
- Haptic `.success`.
- Hero card appears (staged reveal: name, time icon, streak card if returning kid).

### First-launch detection

No splash screen, no onboarding. First launch → directly to PairCodeView. No feature explainers.

## Files

- `VerityPostKids/VerityPostKids/PairCodeView.swift` — major polish.
- `VerityPostKids/VerityPostKids/KidsTheme.swift` — add `KidPressStyle`.
- `VerityPostKids/VerityPostKids/WelcomeScene.swift` — new, for the post-pair success transition.

## Acceptance criteria

- [ ] Keystroke micro-feedback (bounce, cross-fade, sparkle).
- [ ] Pair button uses KidPressStyle.
- [ ] Pairing state is a breathing pulse, not a spinner.
- [ ] Fail state: shake + `.rigid` haptic + calm copy, no red.
- [ ] Lockout state: countdown + warm copy.
- [ ] Success state: particle burst + theme wash + welcome scene + `.success` haptic.
- [ ] First-launch detection: direct to pair, no onboarding interstitials.
- [ ] Reduce Motion path: animations replaced with opacity fades.
- [ ] VoiceOver announces pairing state, failure reason, lockout timing.

## Dependencies

Ship after `14_KIDS_CHOREOGRAPHY.md` (KidPressStyle is defined there).
