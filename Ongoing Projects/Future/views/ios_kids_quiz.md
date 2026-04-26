# iOS Kids — Quiz Engine

**Files:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`, `VerityPostKids/VerityPostKids/QuizPassScene.swift`.
**Owner:** Weinschenk (quiz feedback), Ive (tactile interaction).
**Depends on:** `14_KIDS_CHOREOGRAPHY.md`.

---

## Current state

Per recon:
- Progress dots + question + 4 options + explanation + Next/Result button.
- Option click reveals answer with springSnap.
- Pass flow → `QuizPassScene` (two-layer reveal, ring animation, 80-particle confetti).
- Fail flow → "Try again" card inline.

Issues:
- Options lack press feedback (no scale effect on tap).
- No per-question timer or accumulator.
- Fail state functional but joyless.

## What changes

### Option press feedback

Apply `KidPressStyle`:
- On tap-down: scale 0.97, springSnap.
- On tap-up: spring-back with small color tint shift.
- After reveal: correct card does 2-bounce celebration (300ms), wrong card does gentle shake (200ms).
- Haptic: `.soft` on correct, `.rigid` on wrong.

### Per-question score accumulator

Small "N of 5 correct" pill at top-right during quiz. Updates after each reveal. Number rolls up via `AnimatedCountUp`.

### Reveal animation

Keep existing springSnap on selection. Add:
- Brief tint wash on the selected card toward the semantic color (correct = teal, wrong = coral).
- Explanation text slides in from below (200ms easeOut).

### Quiz pass scene

Per `14_KIDS_CHOREOGRAPHY.md`:
- Add haptic at the moment the question fades (transition signal).
- Score ring fills to actual percentage (3/5 = 60%, 4/5 = 80%, 5/5 = 100%). Currently hardcoded 84%.
- Score delta pill "+50 Verity Score" with count-up.
- Share button opens iOS share sheet with a branded share card.

### Quiz fail scene

Replace the "Try again" inline card with a proper fail scene (but quiet, not celebratory):

```
[icon: gentle teal checkmark with ~]

2 of 5.

Close. Want to read it again?

[ Go back ]
[ Not right now ]
```

Haptic on fail: none (don't punish).

### Cool-down

After 3 fails, a 6-hour cool-down. Warm copy:

```
Let's come back to this one tomorrow.

You can read other articles now.

[ Back to home ]
```

### Kids can see the right answer after passing

Nice-to-have: after pass, the kid can tap any question to see what they got wrong and why. Builds on the "arrive to learn" framing.

## Files

- `VerityPostKids/VerityPostKids/KidQuizEngineView.swift` — press feedback, accumulator, fail scene.
- `VerityPostKids/VerityPostKids/QuizPassScene.swift` — haptic + ring percentage fix.
- `VerityPostKids/VerityPostKids/QuizFailScene.swift` — new, warm fail.

## Acceptance criteria

- [ ] Options use KidPressStyle.
- [ ] Correct answer celebrates briefly (2-bounce). Wrong shakes gently.
- [ ] Per-question accumulator pill visible.
- [ ] Pass scene: haptic on fade, ring at actual percentage, score delta pill with count-up.
- [ ] Fail scene: warm, no haptic, reread option.
- [ ] Cool-down copy warm.
- [ ] Post-pass review of missed questions available.
- [ ] Reduce Motion path.
- [ ] VoiceOver announces score + result state.

## Dependencies

Ship after `14_KIDS_CHOREOGRAPHY.md` (KidPressStyle).
