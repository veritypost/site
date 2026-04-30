# Slice 03 — Quiz experience

**Status:** locked
**Last touched:** 2026-04-30 (Session 5 — full arc: investigation, findings, Q&A, adversarial review, lock)
**Adversarial review:** complete
**Implementation session:** not yet scheduled

---

## Scope

Files investigated:
- `web/src/components/ArticleQuiz.tsx` (546 lines — full quiz state machine)
- `web/src/components/ArticleEngagementZone.tsx` (61 lines — quiz + comment thread mount logic)
- `web/src/app/[slug]/page.tsx` (server-side `hasQuiz` / `initialPassed` computation)
- `web/src/app/api/quiz/start/route.js` (quiz start: question fetch, rate limit)
- `web/src/app/api/quiz/submit/route.js` (quiz submit: grading, achievements, scoring)
- `web/src/components/CommentComposer.tsx` (locked state at lines 221–236)

User states walked: anon, free signed-in (quiz not yet taken), quiz in progress, quiz passed (just passed this session), quiz failed, returning visitor (initialPassed=true), no-quiz article, kids profile.

FK hint check: no `!foreign_key_name` disambiguation hints in any Slice 03 file. All quiz data fetching goes through API routes, not Supabase client. Rule satisfied.

Known gap resolved: `quiz-regenerate` 422 on verification disagreement — fixed in `5a4669c` (2026-04-30). Not re-investigated.

**Carry-over from Slice 02 (F6):** quiz-to-comment-unlock affordance — confirmed missing. Design direction from Slice 02 expert panel: "Answer a few questions about this article to join the discussion" above quiz, "Complete the quiz above to comment" in locked composer. Addressed here as F2.

---

## Findings

### F1 — Gamification language throughout quiz copy
**Status:** decided
**Priority:** HIGH

**Reader experience.** A reader who hasn't taken the quiz sees the headline "Unlock the discussion" and body "Answer 5 questions about this article. 3 correct unlocks the comment section." After failing, they read "The bar is 3 to unlock the discussion." with a retry CTA "Take another look and try again." Every touchpoint uses unlock/bar/threshold language — an achievement frame that conflicts with the editorial identity of a respectable news publication.

**Root cause.** `ArticleQuiz.tsx:269` (pre-start headline), `:272` (pre-start body), `:277–289` (button text), `:477` (fail state score line), `:524` (retry CTA).

**Decision.** Replace all gamification vocabulary. Drop the internal card headline entirely — the `<h2>` "Test Your Knowledge" above the quiz zone (Slice 02 F3 fix) and the framing line above the card (F2 fix below) already do that work. Make the body factual: question count + threshold, no gate language.

**Fix plan.**

| Location | File:line | Current | Replace with |
|---|---|---|---|
| Pre-start headline | ArticleQuiz.tsx:269 | "Unlock the discussion" | DROP entire div (lines 268–270) |
| Pre-start body | ArticleQuiz.tsx:272 | "Answer 5 questions about this article. 3 correct unlocks the comment section." | "5 questions — aim for 3 correct." |
| Pre-start button | ArticleQuiz.tsx:280 (approx) | "Take the quiz" | "Begin" |
| Fail score line | ArticleQuiz.tsx:477 | "{correct} of {total}. The bar is 3 to unlock the discussion." | "{correct} of {total}. You need 3 to continue." |
| Fail retry CTA | ArticleQuiz.tsx:524 | "Take another look and try again" | "Review the article and try again" |

Implementation notes:
- Remove the entire headline div block (lines 268–270), not just the text. Check `marginBottom` on the body text below it — may need adjustment after removal.
- The updated pre-start copy ("5 questions — aim for 3 correct.") removes the reference to "the comment section," which also improves the kids code path (where there is no comment section). No separate kids variant needed for pre-start or fail copy.
- The button text is inside the loading-aware button element (lines 277–289). Change only the "idle" label; the "Loading…" text remains.

---

### F2 — No connecting language above quiz; locked composer lacks spatial cue
**Status:** decided
**Priority:** HIGH

**Reader experience.** A reader arriving at the bottom of an article sees the quiz card appear with no framing from the surrounding page — no sentence explaining why the quiz is there or what it connects to. Below the quiz, the locked comment composer says "Pass the quiz to join the discussion." with no spatial anchor; on mobile, the quiz card may be hundreds of pixels above the viewport, making "the quiz" a floating reference.

This is the Slice 02 F6 carry-over, now confirmed with exact code locations.

**Root cause.** `ArticleEngagementZone.tsx:45` — nothing renders between the `<h2>` heading and `<ArticleQuiz>`; no framing text exists on the page outside the quiz card itself. `CommentComposer.tsx:233` — "Pass the quiz to join the discussion." has no spatial anchor.

**Decision.** Exactly as Slice 02 expert panel direction. Two line changes, no structural changes.

**Fix plan.**
- `ArticleEngagementZone.tsx:45`: insert a `<p>` immediately above the `<ArticleQuiz>` render. Text: "Answer a few questions about this article to join the discussion." Style: `{ fontSize: 13, color: 'var(--dim, #888)', marginBottom: 12, lineHeight: 1.5 }`. Renders only within the `{hasQuiz && ...}` block — already the correct condition (signed-in, quiz not suppressed by F4 logic).
- `CommentComposer.tsx:233`: "Pass the quiz to join the discussion." → "Complete the quiz above to comment."

No new props needed. Both changes are isolated text changes in existing render paths.

---

### F3 — Code bug: signed-in users on no-quiz articles see a locked composer
**Status:** decided
**Priority:** HIGH

**Reader experience.** A signed-in reader on an article without an active quiz sees "Complete the quiz above to comment." (after F2 fix, currently "Pass the quiz to join the discussion.") with no quiz present anywhere on the page. They cannot comply and have no path to comment.

**Root cause.** `ArticleEngagementZone.tsx:56`: `quizPassed={hasQuiz ? hasPassed : false}`. When `hasQuiz=false`, the explicit `false` overrides `CommentThread`'s own default param (`quizPassed = true` at `CommentThread.tsx:92`). `CommentComposer` receives `quizPassed=false` and locks at line 221.

**Decision.** One-character fix: `false` → `true`.

**Fix plan.**
- File: `web/src/components/ArticleEngagementZone.tsx:56`
- `quizPassed={hasQuiz ? hasPassed : false}` → `quizPassed={hasQuiz ? hasPassed : true}`
- When `hasQuiz=false`, composer is unconditionally open for eligible signed-in users (mute/ban states in `CommentComposer` still apply independently).
- Edge case: if `initialPassed=true` but `hasQuiz=false` (quiz was deactivated after a user passed), the composer is still open — correct, since there's no longer a quiz to gate on.
- No other changes. Anon branch (lines 30–39) explicitly passes `quizPassed={false}` — that is correct and unaffected.
- Requires 6-agent ship pattern in implementation session.

---

### F4 — Returning visitor card shows on every return visit
**Status:** decided
**Priority:** MEDIUM

**Reader experience.** When a reader returns to an article they've already passed, `ArticleQuiz` opens in `stage='passed'` (set at mount when `initialPassed=true`) and renders a green "Discussion unlocked" card: "You've passed the quiz on this article. The discussion is below." with "Jump to discussion" and "Browse for your next article" links. This appears on every return visit. After the Slice 02 F3 fix, the section heading above reads "Discussion" — so returning readers see: "Discussion" heading → green "Discussion unlocked" card → "Jump to discussion" link → thread. Most engaged readers (returners) take an unnecessary click to reach the thread they came back for.

**Root cause.** `ArticleQuiz.tsx:80` — `useState` initialises `stage='passed'` when `initialPassed=true`. `ArticleQuiz.tsx:208–254` — `stage === 'passed'` always renders the card. No distinction between first-pass and return-visit.

**Decision.** Suppress the quiz section entirely for returning visitors. `justPassedThisSession` is already tracked in `ArticleEngagementZone` (line 22) — use it to distinguish first-pass from return. 4/5 experts: suppress card entirely; the "Discussion" heading + open composer communicate the state.

**Fix plan.**
- File: `web/src/components/ArticleEngagementZone.tsx:45`
- Change the quiz render condition from `{hasQuiz && (...)}` to `{hasQuiz && (!initialPassed || justPassedThisSession) && (...)}`.
- Logic: show quiz when there's a quiz AND (reader hasn't passed yet OR reader just passed in this session). Hide when reader is a returning visitor (already passed on a prior visit, not just now).
- On first pass this session: `justPassedThisSession` flips to `true` via `handlePass` → `ArticleQuiz` stays rendered, showing the RESULT state (`stage='result'`, lines 388–454). RESULT state is unaffected — it's a different code path from PASSED state.
- On return visit: `initialPassed=true`, `justPassedThisSession=false` → quiz not rendered. Thread renders immediately below "Discussion" heading.
- The `initialPassed` prop is already available in `ArticleEngagementZone` (line 17). No new props needed.
- `ArticleQuiz.tsx` PASSED state (lines 208–254) can remain as-is; the parent condition prevents it from ever rendering on return visits.

---

### F5 — Pass copy: "The conversation is below" then interstitial ad 1.5s later
**Status:** decided
**Priority:** MEDIUM

**Reader experience.** After passing, the RESULT state shows "You're in. The conversation is below." (`ArticleQuiz.tsx:433–434`). For non-ad-free users on every 3rd quiz attempt site-wide, an interstitial modal fires 1500ms later (`ArticleQuiz.tsx:170–180`, rendered at `:212`). The copy makes a directional promise ("below") the flow doesn't immediately keep — highest-motivation moment in the funnel, then a full-screen modal interrupts.

**Root cause.** `ArticleQuiz.tsx:433–434` — directional copy. Interstitial timing is intentional (T30 comment at lines 172–177 explains the reasoning).

**Decision.** Change the pass copy to remove the directional sentence. "You're in." is sufficient — the thread is visible below once the modal closes, and the "Discussion" heading marks the section. Interstitial ad placement accepted as-is (T30 timing is intentional; potential redesign deferred to a monetization session if needed). Vocabulary: "discussion" not "conversation" — consistent with section heading.

**Fix plan.**
- File: `web/src/components/ArticleQuiz.tsx:433–434`
- "You're in. The conversation is below." → "You're in."
- One-line change. No structural change to the RESULT state.
- The PASSED state card (line 228) says "The discussion is below." — change to "The discussion is ready." (removes directional claim; consistent with same concern) only if this state ever renders after F4 fix. Since F4 suppresses the PASSED state card for all returning visitors, this line is effectively dead code — leave as-is.

---

### F6 — Rate limit invisible: "Try again" with no warning; 4th attempt errors silently
**Status:** decided
**Priority:** MEDIUM

**Reader experience.** The quiz start route enforces 3 attempts per 600 seconds (`api/quiz/start/route.js:42–52`). The fail state shows "Review the article and try again" (after F1 fix) with no disclosure. On the 4th attempt within the window, the component shows a generic error above the start button (`ArticleQuiz.tsx:274`) — no explanation of when the reader can try again.

**Root cause.** `ArticleQuiz.tsx:524–539` — retry button has no attempt-limit disclosure. `ArticleQuiz.tsx:104–109` (start function) — 429 status not specifically detected; falls through to generic error at line 274.

**Decision.** Surface rate limit progressively: warn before the wall (on the last allowed attempt), explain clearly after hitting it.

**Fix plan.**
- File: `web/src/components/ArticleQuiz.tsx`

**Part A — warning in fail state:**
- `attemptMeta?.attempt_number` (from start response, stored at line 113) tells which attempt just completed.
- Rate limit: 3 per 600s. After attempt 2 fails: 1 remaining. After attempt 3 fails: 0 remaining.
- In the fail state render (lines 457–542), below the retry button:
  - `attempt_number === 2`: add subdued line — "You have one more attempt right now." (`fontSize: 12, color: 'var(--dim, #888)', marginTop: 8`)
  - `attempt_number >= 3`: hide the retry button entirely; show — "You've used your available attempts. Try again in a few minutes." Same dim style.

**Part B — 429 detection in start function:**
- In the start function error path (around line 107), add: `if (!res.ok && res.status === 429)` → set a specific error message — "You've reached the attempt limit. Try again in a few minutes." — rather than the generic `data.error`.
- Same applies if submit returns 429 (around line 149, same pattern).

Implementation note: the generic error at line 274 renders above the start button in the `idle` state. The 429-specific message should use the same render location but different text.

---

### F7 — Pool exhaustion: empty questions array → blank question card
**Status:** decided
**Priority:** LOW

**Reader experience.** If the start RPC returns 0 questions (active quiz with no question records — a misconfiguration), the component transitions to `stage='answering'` with `questions[0]` undefined. The question card renders with a blank text block, empty progress bar, and disabled answer buttons. No error, no path forward.

**Root cause.** `ArticleQuiz.tsx:295–386` — no guard for `questions.length === 0` before entering the answering render.

**Decision.** Graceful degradation: detect empty questions, show brief error message, open the discussion.

**Fix plan.**
- File: `web/src/components/ArticleQuiz.tsx`
- Add `onPoolExhausted` optional callback prop to `ArticleQuiz` interface (same pattern as `onPass`).
- In `ArticleEngagementZone.tsx`, pass `onPoolExhausted={handlePass}` alongside `onPass={handlePass}` — pool exhaustion is treated as a pass for session purposes (composer opens). This does not persist to the database.
- In the start function (around line 118), after receiving questions: if `questions.length === 0`, call `onPoolExhausted?.()` and render an error state instead of transitioning to 'answering'. Add a `'pool-exhausted'` stage value, or reuse `'idle'` with an error message.
- Pool-exhausted render: "Questions aren't available for this article right now. You can join the discussion below." — dim text, no card chrome. Below it, no button (the composer is now open via the callback).
- Log pool exhaustion server-side (or instrument as a client-side error event) for admin triage.

---

## Design decisions

| Finding | Decision | Date |
|---|---|---|
| F1 — Gamification language | Drop internal headline; copy: "5 questions — aim for 3 correct."; button: "Begin"; fail: "You need 3 to continue." | 2026-04-30 |
| F2 — Connecting language | Framing line above quiz; "Complete the quiz above to comment." in locked composer | 2026-04-30 |
| F3 — No-quiz article bug | `false` → `true` at ArticleEngagementZone.tsx:56; 6-agent ship pattern | 2026-04-30 |
| F4 — Returning visitor card | Suppress quiz section entirely when `initialPassed && !justPassedThisSession` | 2026-04-30 |
| F5 — Pass copy | "You're in. The conversation is below." → "You're in."; ad timing accepted as-is | 2026-04-30 |
| F6 — Rate limit disclosure | Warn on attempt 2 fail; hide retry + show exhaustion on attempt 3 fail; detect 429 in start | 2026-04-30 |
| F7 — Pool exhaustion | `onPoolExhausted` callback → open composer; render error message; no blank card | 2026-04-30 |

---

## Cross-surface findings

None new. The Slice 02 → 03 carry-over (F6 in Slice 02, connecting language) is addressed here as F2. Slice 04 (Discussion) owns `comments.story_id` FK cascade issue — listed in INDEX.md.

---

## Adversarial review (Session 5)

Adversarial agent read `ArticleQuiz.tsx`, `ArticleEngagementZone.tsx`, and `CommentComposer.tsx`. All findings absorbed as clarifications; no new owner decisions required.

Key clarifications absorbed into fix plans above:
1. F1: Remove entire headline div (lines 268–270), not just text. Updated pre-start copy removes "comment section" reference — correct for kids path too.
2. F3: Anon branch `quizPassed={false}` at lines 35–36 is correct and unaffected by F3 fix.
3. F5: Change applies to RESULT state (lines 433–434), not PASSED state (lines 208–254). PASSED state body is effectively dead code after F4 suppression.
4. F6: Use `attemptMeta?.attempt_number` from start response (line 113). Add `res.status === 429` specific check before generic error path. When `attempt_number >= 3`: hide retry button entirely rather than showing a warning.
5. F7: Pool exhaustion needs `onPoolExhausted` callback to open composer — `ArticleQuiz` cannot modify parent state directly. Pattern mirrors `onPass`.
6. F4 × F6 interaction: `justPassedThisSession` state name is accurate; retry flow on return visits shows the quiz again (intentional — the reader chose to retry).

Three adversarial "decisions still needed" resolved as implementer judgment:
- F6 API: `attemptMeta.attempt_number` from start response is sufficient — no submit API change needed.
- F7 architecture: `onPoolExhausted` callback pattern is the correct mechanism — implementer judgment.
- F4 asymmetry: quiz stays if returning visitor retries and fails — correct, intentional behavior.

---

## Implementation notes

**Files to change (4 total):**

| File | Findings | Changes |
|---|---|---|
| `web/src/components/ArticleQuiz.tsx` | F1, F5, F6, F7 | Copy changes (pre-start, fail, pass); rate-limit warning + 429 detection; pool-exhaustion guard + callback |
| `web/src/components/ArticleEngagementZone.tsx` | F2, F3, F4, F7 | Framing line; false→true; quiz suppress condition; onPoolExhausted prop |
| `web/src/components/CommentComposer.tsx` | F2 | Locked state copy: "Complete the quiz above to comment." |

**Note on F7 scope:** `ArticleQuiz.tsx` interface gains `onPoolExhausted?: () => void` prop. `ArticleEngagementZone.tsx` passes `onPoolExhausted={handlePass}`. No new files needed.

**Implementation ordering:**
1. F3 first (critical bug — may be deployed standalone before other changes)
2. F2 + F4 together (both in ArticleEngagementZone, one pass)
3. F1 + F5 + F6 + F7 together (all in ArticleQuiz, one pass)
4. CommentComposer (isolated, one line)
