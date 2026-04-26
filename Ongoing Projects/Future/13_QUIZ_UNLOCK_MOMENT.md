# 13 — The Quiz Unlock: The Signature Moment

**Owner:** Weinschenk (primary — behavioral moment design), Ive (motion and restraint), Harris (implementation on the web side).
**Depends on:** `08_DESIGN_TOKENS.md`, `12_QUIZ_GATE_BRAND.md`.
**Affects:** `web/src/components/ArticleQuiz.tsx`, `web/src/components/CommentThread.tsx`, `VerityPost/VerityPost/StoryDetailView.swift`, haptic strategy doc.

---

## Why this doc exists

Of everything in Verity, one interaction is the closest to being a signature the way Apple's unlock slider or Tesla's door handle or the Tinder swipe is a signature. It is the moment a reader passes the quiz and the comment section opens.

Weinschenk named it in the panel: "That's the moment that makes the product unforgettable. Three seconds that compress the entire thesis. Invest in it like it's your logo."

Today the moment is functional and flat. Pass the quiz, see "Quiz passed!" toast, scroll to comments. That's fine for an MVP. It is not the signature the product deserves.

## The thesis

Passing the quiz isn't winning. It's *arriving*. The experience should feel like being let into a room, not like getting a checkmark on a form.

That framing drives the spec. Every choice below serves "arriving in a room":

- The score delta is incidental, not the point. Skip the fanfare.
- The comments don't appear. They *open*. The reader experiences them as a door opening, not a widget loading.
- The signal is quiet. Not a parade. A small, confident, intentional moment.

## The interaction spec

### Web

1. **Submit state.** Reader clicks "Submit answers." The quiz UI fades to a calm "Checking..." state for a beat (300–500ms — enough to signal the grading is real, not so long it feels sluggish).

2. **Result reveal.** The quiz area dissolves. Replaced by a small card:

   ```
   3 of 5.

   You're in. The conversation is below.
   ```

   (Or "4 of 5," "5 of 5" as applicable.)

   Typography: score number is `typography.display` (34pt bold). "You're in" is `typography.body_lg` (20pt). "The conversation is below" is `typography.meta`.

   No emoji. No confetti. The moment's weight comes from the calmness.

3. **Score delta (if applicable).** If the reader earned Verity Score points, they render as a muted pill below the card:

   ```
   +15 Verity Score
   ```

   One pill. No animation on the number itself — it's just there. Verity Score is a metric, not a game.

4. **The door opens.** This is the signature motion. The page below the quiz card gently scrolls into view, revealing the comment section. Not a jarring scroll — a soft motion over ~600ms. The comment header ("Every reader here passed the quiz") arrives in place first. Then the comments fade in from 0 to full opacity over ~400ms, staggered by 50ms per comment for the first five (so there's a subtle "welcoming" cascade).

5. **The cursor lands.** The comment composer is auto-focused. The reader can start typing immediately. Their first post-quiz visit to the comments is a conversation-ready state.

6. **Haptic.** On web, there is no haptic (browser APIs don't provide it). On iOS, a single soft confirm haptic (`UIImpactFeedbackGenerator(style: .soft)`) fires at step 2. That's it. One haptic. Not a chain.

Total duration from submit to composer focus: ~1600ms. Fast enough to feel responsive, slow enough to be felt as a moment.

### iOS (`StoryDetailView.swift`)

Same architecture, adapted:

1. Submit state identical.
2. Result card uses `Theme.swift` typography. Matches the web spec.
3. Score delta pill identical.
4. The comment section scrolls into view smoothly. iOS uses `withAnimation(.spring(response: 0.55, dampingFraction: 0.85))` or similar.
5. Cursor lands on the composer.
6. Haptic fires once on step 2.

The spec is deliberately portable. Same rhythm, same weight, same restraint. Web and iOS should feel like the same moment.

## Specifically what it is not

- **Not confetti.** Not a particle burst. Not a fanfare. Kids mode has all of those and they belong there. Adult Verity is quiet.
- **Not a "congratulations!" banner.** The reader didn't win a prize. They read an article and answered some questions. The tone is "welcome" not "you did it."
- **Not an "unlock" animation.** The word "unlock" has been banned elsewhere in paywall copy and shouldn't appear here either. We don't market this moment as unlocking — it's arriving.
- **Not a modal.** Nothing interstitial, nothing blocking. The moment is in-flow.
- **Not gamified.** No progress bar to "next tier." No "keep your streak." No social share prompt. (If the reader wants to share that they passed a quiz, they can — but we don't prompt.)
- **Not celebrated repeatedly.** A reader who passes 10 quizzes in a day experiences the moment 10 times and each time is the same calm sequence. No escalation, no "you're on fire." The calm is the brand.

## The fail moment

Per `12_QUIZ_GATE_BRAND.md`, the fail state already has rewritten copy. The fail moment in terms of interaction:

1. Submit state (same 300–500ms check).
2. Fail card:

   ```
   2 of 5. Close.

   Want to take another look at the article?

   [ Reread and try again ]
   [ Not right now ]
   ```

3. No haptic on fail. Zero. A haptic on fail reads as shame. We refuse that.
4. No animation. The fail state is a static card. No drama.

The asymmetry is intentional: passing is a moment, failing is a neutral state.

## Accessibility

- **Reduce Motion preference (iOS + web `prefers-reduced-motion`):** all animation is replaced with a single cross-fade (150ms). The commenter-composer still auto-focuses.
- **VoiceOver:** the result card announces "Score, 3 of 5. You are in. The conversation is below."
- **Keyboard-only:** after pass, focus moves to the comment composer via programmatic focus. The reader can tab forward into comments from there.
- **High contrast:** the card uses `text.primary` and `surface.card` — passes contrast minimums.

## What the cursor does

After the moment, the cursor is in the comment composer. But an important detail: the composer is *empty*. No pre-filled template, no "Share your thoughts..." placeholder that sounds generic. Just an empty box ready to type.

If we ever add a placeholder, it's article-specific: "What surprised you about [beat 1 reference]?" — generated by the system but editor-reviewable. Year 2 consideration, not launch.

## Why this deserves a whole doc

Most product decisions split across many docs because they're composed of multiple features. This moment is the opposite — it's one small interaction that carries disproportionate weight because it's what a reader will screenshot, what they'll remember, what journalists will write about.

Ive in the panel: "That's the interaction that makes the product. Everything else serves it. Treat it like the product's logo. Get it exactly right, then don't touch it."

The moment's power comes from restraint. It cannot be ornamented without losing its meaning. So this doc exists to hold the line against well-meaning future additions.

## Acceptance criteria

- [ ] `ArticleQuiz.tsx` renders the result card matching the spec.
- [ ] `CommentThread.tsx` appears on pass via the described scroll + fade sequence (not an instant appearance).
- [ ] Comment composer auto-focuses on pass.
- [ ] iOS `StoryDetailView.swift` matches the rhythm.
- [ ] Single haptic on iOS on pass; zero on fail.
- [ ] Reduce Motion replaces animation with a single cross-fade.
- [ ] Keyboard focus management tested: focus lands on composer and is reachable via Tab from subsequent elements.
- [ ] VoiceOver announcements tested.
- [ ] No confetti, no "unlock" copy, no gamification artifacts present.
- [ ] Timing audited: full sequence ≤ 1800ms from submit to composer focus.

## Risk register

- **Someone argues for "more celebration."** Refuse. Point them at this doc.
- **Score delta pill grows over time** (gamification creep — leaderboard points, achievements, tier progress all tempted to render here). Refuse. If it's not +N Verity Score, it doesn't belong.
- **The scroll animation conflicts with browser scroll-restoration.** Mitigation: use `scrollBehavior: smooth` + manual programmatic scroll; test in Safari + Chrome + Firefox + mobile browsers.
- **iOS haptic feels aggressive on some devices.** Mitigation: use `.soft` style, not `.medium`. If testing reveals it still feels off, move to `UINotificationFeedbackGenerator(.success)` — but try `.soft` first.

## What this doesn't affect

- The quiz content, question quality, grading logic.
- The quiz gate visibility before the attempt (that's `12_QUIZ_GATE_BRAND.md`).
- The comment thread itself, once it's visible.
- The kids quiz-pass moment — kids has its own choreographed scene (`QuizPassScene.swift`) that is appropriately celebratory. Adult is quiet. See `14_KIDS_CHOREOGRAPHY.md`.

## Sequencing

Ship after: `12_QUIZ_GATE_BRAND.md` (the gate must be visible before the unlock moment has meaning).
Ship with: `08_DESIGN_TOKENS.md` (typography for the result card uses tokens).
Pairs with: nothing else — this is a self-contained moment that stands on its own once the gate is visible.
