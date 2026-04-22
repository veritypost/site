# iOS Kids — Streak Scene

**File:** `VerityPostKids/VerityPostKids/StreakScene.swift`
**Owner:** Ive (motion), Weinschenk (celebration calibration).
**Depends on:** `14_KIDS_CHOREOGRAPHY.md`.

---

## Current state

Per recon: strongest interaction in the kids app. Flame breathing, number roll-up via `AnimatedCountUp`, radial glow, 3 expanding rings, 70-particle burst, milestone card on days 7/14/30. 300ms–2000ms timeline. Immersive.

Missing:
- No haptic at the moment the number lands.
- No screen-shake at particle burst peak.
- Milestone card doesn't include kid's name.

## What changes

Small refinements per `14_KIDS_CHOREOGRAPHY.md`. Don't rebuild.

### Haptic at count-up completion

When the `AnimatedCountUp` finishes its interpolation (~550ms into the scene), fire a single `.soft` haptic. Currently silent.

### Subtle screen-shake at particle peak

At 700–850ms (particle burst peak), a very subtle screen-shake (<2pt amplitude, 200ms duration). Barely perceptible but adds tactile satisfaction.

Respect Reduce Motion: shake disabled.

### Milestone card: add kid name

Currently: "7 days in a row!"
New: "Maya, 7 days in a row!"

Reads from `KidsAppState.kidName`. Personal touch.

### Share card (already exists)

Current implementation has a Share button. Ensure the share image includes the streak count + the kid's name + the Verity Post for Kids mark. Parents share this on social — it's a word-of-mouth vector.

Actually, refine: the share card should NOT include the kid's name by default (COPPA-adjacent — don't auto-publicize children's names). Make the share card anonymous ("7 days in a row on Verity Post for Kids"). Parent can share knowingly, and the absence of the kid's name is a privacy feature, not an oversight.

### Confirm particle behavior

Gravity currently pulls particles downward quickly. Consider tuning to let some linger longer (reduce drag on a subset). Small visual change, adds liveness.

## Files

- `VerityPostKids/VerityPostKids/StreakScene.swift` — haptic, screen-shake, name in milestone card, share card privacy fix.

## Acceptance criteria

- [ ] Haptic fires at count-up land.
- [ ] Subtle screen-shake at particle peak.
- [ ] Milestone card includes kid's name.
- [ ] Share card does NOT include kid's name (privacy).
- [ ] Particle gravity/drag tuned for better visual lingering.
- [ ] Reduce Motion path (no shake, no particle burst, opacity fade).
- [ ] VoiceOver announces streak milestone.

## Dependencies

None beyond `14_KIDS_CHOREOGRAPHY.md`.
