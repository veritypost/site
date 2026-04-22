# 14 — Kids Choreography

**Owner:** Ive (motion and craft), Zhuo (lifecycle UX across adult → kid handoff), the kids editorial lead (TBD).
**Depends on:** `00_CHARTER.md`, `07_KIDS_DECISION.md` (the kids product is a sidecar with a polish pass, not a rewrite), `08_DESIGN_TOKENS.md`.
**Affects:** `VerityPostKids/VerityPostKids/` — specifically `KidsTheme.swift`, `KidPrimitives.swift`, `GreetingScene.swift`, `StreakScene.swift`, `QuizPassScene.swift`, `BadgeUnlockScene.swift`, `KidReaderView.swift`, `KidQuizEngineView.swift`, `PairCodeView.swift`, `ParentalGateModal.swift`.

---

## Starting point (from 2026-04-21 kids iOS recon)

What's alive:

- `StreakScene` — flame breathing, number roll via `AnimatedCountUp`, expanding rings, 70-particle burst, milestone card on days 7/14/30. Strongest interaction in the app.
- `GreetingScene` — staged reveal with band drop (200ms), shimmer sweep, time-of-day icon spin, label fade, typewriter name with per-keystroke sparkles, streak card, staggered category grid. Warm and intimate.
- `QuizPassScene` — correct-chip highlight, radial teal sweep, question fade, result sheet slide-up, `AnimatedCountUp` on the score, 84% ring animation, 80-particle confetti. Polished.
- `BadgeUnlockScene` — dim overlay, badge scale-in, shimmer sweep, pulse rings, 50-particle burst, text and buttons fade up. Luxurious but feels bolted-on.

What's flat:

- `PairCodeView` — input field lacks micro-feedback; pair button doesn't spring; 60s lockout is static.
- `KidReaderView` — text-first, no progress bar, no scroll affordance, no page-turn. Functional but strip-mined of warmth.
- `KidQuizEngineView` — options lack press feedback; no per-question timer or accumulator; correct/incorrect colors are clear but tactile response is missing.
- `LeaderboardView` — static pill selection; no animated rank changes; visually quiet.
- `ParentalGateModal` — fully built, zero callers.
- **No custom `KidPressStyle` button style exists.** Buttons are plain-styled with manual highlight/disabled state handling.

Panel framing: the kids app nails *moment design* but coasts on *interaction design*. Every scene is alive; every press is dead. The gap is the press.

## The commitment

Every interactive element in the kids app has a tactile, choreographed response. Every tap, drag, and release communicates that the product is a made thing. The bar is "a Pixar designer would recognize this as a kids product."

This is not "more animation." It is the right animation, on the right trigger, at the right moment.

## The fix, in order of shipping priority

### 1. `KidPressStyle` — the foundational button style

Introduce a `KidPressStyle: ButtonStyle` applied to every button in the app. Behaviors:

- Press-down: 0.96 scale, springSnap (response 0.35, damping 0.75).
- Release: bounce back to 1.00 with a mild overshoot (dampingFraction 0.7).
- Haptic on release: `UIImpactFeedbackGenerator(.soft)` — but only if the button is an affirmative action (submit, confirm, start). Destructive or cancel actions fire no haptic.
- Disabled: opacity 0.4, no press response.

Retrofit to every button in `PairCodeView`, `KidReaderView`, `KidQuizEngineView`, nav, profile, etc. Global application. This is the single highest-impact change — every tap becomes tactile in one sweep.

### 2. Quiz option cards get press feedback

In `KidQuizEngineView.swift`, option cards currently register taps without tactile response. Adjust:

- On tap-down: scale 0.97, springSnap.
- On tap-up: spring-back with a small tint shift toward the selected color.
- After answer reveal (correct/wrong shown), the selected card does a brief 2-bounce celebration (if correct) or a gentle shake (if wrong). Neither is long — 300ms total.
- Haptic: `.soft` on correct, `.rigid` on wrong (rigid is Apple's "mild negative" haptic — not a jab, a signal).

### 3. Pair code input micro-feedback

In `PairCodeView.swift`, the code field is the first interaction in the product. It needs to feel alive:

- Each keystroke bounces the active-character position with a springSnap.
- Each character gets a subtle teal-to-bg cross-fade when entered.
- A tiny sparkle particle (2–3 particles, not 70) emits at the cursor position per keystroke.
- On submit, the entire field has a single-beat "checking..." state with a breathing pulse on the teal border (not a spinner).
- On fail (wrong code), the field does a gentle horizontal shake (4 cycles, 8pt amplitude, 200ms) and haptic `.rigid`. Error text appears calmly below — no yelling.
- On success, the field dissolves into a particle burst (~30 particles) and the welcome scene loads.

### 4. Reader progress

`KidReaderView.swift` currently has no reading progress indicator. Add:

- A thin progress bar at the top of the scroll view, 2pt tall, tracks scroll position in the article.
- Color fills with the per-kid theme color.
- At 80% scroll (which triggers the reading_log write), a small confetti burst (~15 particles) fires above the progress bar. No sound. No modal. Just a moment of "you did it" embedded in the read.
- At article end, the "Take the quiz" button appears with a spring-in animation (not a sudden fade).

### 5. Streak scene — keep strong, small refinements

Already alive. Small tightening:

- Add haptic at the moment the count-up number lands on its final value: a single `.soft` impact. Currently silent.
- Add a very subtle screen-shake (<2pt amplitude) at the particle burst peak. Not rumble — a barely-perceptible satisfying emphasis.
- Milestone card (days 7/14/30) should include the kid's name: "Maya, 7 days in a row!" Personal.

### 6. Quiz pass scene — keep strong, small refinements

Already polished. Refinements:

- Add a single haptic at the moment the question area fades (signal: transition to reward).
- Score ring fills to percentage-specific value — 3/5 fills to 60%, 4/5 to 80%, 5/5 to 100%. Currently shows 84% which is a magic number. Use actual math.
- Score delta pill below the ring: "+50 Verity Score" with a short count-up.

### 7. Badge unlock scene — rework to feel earned

Currently the badge arrives from center. Per the Weinschenk feedback in the earlier review: motion with origin reads as causal. Motion at center reads as decorative.

- Badge arrives from the top-right corner of the screen (where achievements live on the profile tab). Slight arc trajectory.
- Lands in place with springOvershoot.
- Shimmer sweeps after landing (not during).
- Pulse rings after shimmer.
- Text fades up after rings.

The sequence stays about the same duration. The *feeling* changes — the badge comes from somewhere, lands, and settles. Rather than spawning centrally.

### 8. Category tile progress trails

In the greeting scene's category grid: currently each category shows a progress value but it's flat. Add:

- Five pill nodes at the bottom edge of each tile, representing progress in that category (0–5 articles read).
- Nodes fill from left as the kid reads.
- Re-entering the category: the leading icon bounces (springOvershoot) and the most-recent node briefly glows.
- On the home greeting scene's staggered grid reveal, the nodes fill in a left-to-right cascade across all tiles (100ms stagger per tile, 50ms stagger per node within tile). Feels like the app is remembering where they left off.

### 9. Parental gate — wire it up and warm it up

`ParentalGateModal.swift` is built with zero callers. Wire it to:

- Every upgrade prompt (if any surface a kid to an upgrade flow).
- External link taps (e.g., defection links — not applicable on kids app since kids articles shouldn't have defection links, but other external link scenarios).
- Email changes (if the kid can change parent email, which they shouldn't be able to — gate anyway as safety net).
- "Forgot PIN" recovery.

Warm the copy:

- Header: "Grown-up check" (already correct).
- Body: "Ask a grown-up to help with this." (casual, not legal-scary)
- Math challenge: keep as-is (7 + 3 style, kid-incompressible).
- Wrong answer: calm shake + `.rigid` haptic. No red flash.
- Lockout copy: "Come back in [5 min] for another try." No punitive tone.

### 10. Leaderboard animation

The family-scoped leaderboard (Year 1 kids scope — see `07_KIDS_DECISION.md`) shouldn't be static. When a kid's rank changes:

- The row slides to its new position with a spring animation.
- Rank numbers update with `AnimatedCountUp` logic.
- The top 3 rows get a subtle gradient border (gold/silver/bronze) that shimmers on rank change.

Not constant animation — only on actual rank change. Static most of the time.

## The motion budget

Kids app can have motion. Adult cannot (per `13_QUIZ_UNLOCK_MOMENT.md`). But even kids has a budget:

- Spring animations: allowed everywhere, always.
- Particle bursts: reserved for celebratory moments (streak milestone, quiz pass, badge unlock, pair success, read-80% reached). ≤ 5 moments per session is the bar. If every interaction fires particles, nothing feels special.
- Screen-shake: reserved for streak milestone and major badge unlock. Max 2 per session.
- Haptics: every affirmative tap fires `.soft`. Wrong answers fire `.rigid`. Celebrations layer a `.success` notification haptic on top of the impact.
- Sound: not in Year 1. Sound design is a separate investment. Skip for now.

## Accessibility (reduce motion)

Respect `@Environment(\.accessibilityReduceMotion)` everywhere:

- Particle bursts become single-frame opacity fades.
- Scene transitions become simple cross-fades.
- Scale bounces become opacity transitions.
- Haptics remain (haptics are accessibility-positive for visually-impaired users).
- Audio cues (when we add them in Year 2) must be toggle-able.

A kid with a reduce-motion preference gets a polished but quiet version of the app. Still warm, no spinning. Functionality identical.

## The pair-through UX

The weakest link in the kids product is the pair flow — the moment a kid first opens the app. Per `07_KIDS_DECISION.md` metrics: pair-through rate is what determines whether family-plan investment converts into actual kids using the product. Polish that flow with:

- First-launch detection → direct to pair screen without ceremony.
- Code entry micro-feedback (spec above).
- On success: a specifically warm welcome scene — "Welcome in, Maya!" — with the kid's name populated from the pair response, the kid's chosen theme color washing over the screen, a gentle hero card reveal.
- First article auto-suggested based on the kid's reading level (configured by parent at profile creation) and trending kids content.
- Zero onboarding wall of feature explainers. Kids learn by doing. Reduce friction.

## What this doesn't change

- The kids app's overall architecture.
- The Supabase data layer.
- The pair-code flow mechanics.
- The quiz grading logic.
- The parent-side management UI on adult web/iOS.
- The KidsAppState ↔ DB dual-source-of-truth risk (that's a separate doc for the kids data integrity work).

## Acceptance criteria

- [ ] `KidPressStyle` exists and is applied to every button in the kids app.
- [ ] Pair code input has micro-feedback, bounce, particle on keystroke, shake on fail.
- [ ] Quiz options have press feedback, celebration on correct, shake on wrong.
- [ ] Reader has progress bar, end-of-article confetti at 80%, spring-in quiz CTA.
- [ ] Streak scene: haptic on count land, name in milestone card.
- [ ] Quiz pass scene: haptic on question fade, score ring to actual percentage.
- [ ] Badge unlock scene: badge arrives from top-right, landed-then-shimmered sequence.
- [ ] Category tiles: progress trails fill on read, glow on re-entry.
- [ ] Parental gate wired to at least 3 real callers with warm copy.
- [ ] Leaderboard animates rank changes.
- [ ] Reduce Motion path implemented across every scene.
- [ ] Motion budget observed (no interaction over-fires particles).

## Risk register

- **Scope creeps — every animation gets "one more moment."** Mitigation: the motion budget in this doc is the law. If a new animation is proposed, something else gets cut.
- **Kids app feels overstimulated.** Mitigation: test with actual kids (4 kids of the target 6–12 age range) before shipping the polish pass. If they say "wow" once, good. If every screen is "wow," something's wrong.
- **Parents feel it's "too much motion."** Mitigation: reduce-motion path is tested and polished. Parent-configurable motion-level isn't necessary if reduce-motion does its job.
- **Performance regressions on older devices.** Mitigation: profile on iPhone SE 2020 (lowest target). Particle count may need to scale based on device tier. ParticleSystem should accept a quality hint.

## What the panel was firm on

Zhuo: "The pair flow is the moment a family decides whether the kid app is worth it. Nail that. Everything else is decoration around the first 30 seconds."

Ive: "The press style alone takes this from good to expensive-feeling. Ship that first."

Ali: "Don't over-invest. This is still a sidecar in Year 1. Polish what's shipped; don't build new scenes."

## Sequencing

Ship incrementally. `KidPressStyle` first (small, high-leverage, can ship in a week). Then press feedback on quiz and pair. Then the reader progress + end-of-article moment. Then per-scene refinements. Then parental gate wire-up. Then leaderboard animations.

Ship parallel to adult launch. Don't block adult launch on kids polish — the sidecar principle.
