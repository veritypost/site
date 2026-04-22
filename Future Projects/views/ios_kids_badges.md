# iOS Kids — Badge Unlock Scene

**File:** `VerityPostKids/VerityPostKids/BadgeUnlockScene.swift`
**Owner:** Ive (motion causality), Weinschenk (moment earning).
**Depends on:** `14_KIDS_CHOREOGRAPHY.md`.

---

## Current state

Per recon: dim overlay + badge scale-in from center + shimmer sweep + 2 pulse rings + 50-particle burst + text fades up. Luxurious but bolted-on. Motion at center reads as decorative, not causal.

## What changes

Per earlier panel feedback (`14_KIDS_CHOREOGRAPHY.md` item 7): rework to feel earned.

### Badge arrives from top-right corner

Not center. The top-right is where achievements live on the Profile tab. Motion with origin reads as causal: "this badge came from my achievements."

- Badge starts at top-right, scale 0.2, opacity 0.
- Animates along slight arc trajectory to center.
- Lands at final position, scale 1.0, with springOvershoot.

### Shimmer after landing

Shimmer sweep happens after the badge settles, not during travel. Emphasizes arrival, not flight.

### Pulse rings after shimmer

Sequence:
1. Badge arrives (600ms, springOvershoot from top-right).
2. Brief 100ms settle.
3. Shimmer sweeps (1000ms, linear).
4. Pulse rings emit (600ms, stagger 150ms).
5. 50-particle burst at ring peak.
6. Text fades up.
7. Buttons fade up.

Total duration: ~2500ms. Feels earned and arriving.

### Haptic layering

- Badge landing: `.soft` impact.
- Particle burst: `.success` notification haptic on top.

### Dim overlay stays

Overlay still frames the moment. Required for focus.

### Share card privacy

Same as streak: share card should NOT include kid's name. Badge + achievement name is fine.

## Files

- `VerityPostKids/VerityPostKids/BadgeUnlockScene.swift` — rework motion origin + sequence.

## Acceptance criteria

- [ ] Badge arrives from top-right, not center.
- [ ] Shimmer fires after landing.
- [ ] Pulse rings sequence after shimmer.
- [ ] Haptic layering (soft + success).
- [ ] Share card does not include kid name.
- [ ] Reduce Motion path (static badge appears, no particles, no shimmer).
- [ ] VoiceOver announces badge earned.

## Dependencies

None beyond `14_KIDS_CHOREOGRAPHY.md`.
