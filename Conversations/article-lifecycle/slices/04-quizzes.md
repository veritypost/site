# Slice 04 — Quizzes

**Status:** locked
**Locked:** 2026-04-29
**Session:** 5 (investigation + Q&A + adversarial review)

---

## What this slice covers

The full quiz lifecycle: questions generated at article time, taken by readers on web and iOS, scored, and used as the gate for the Discussion section. Covers the web quiz component wiring, the iOS adult and kids quiz flows, the admin mark-quiz tool, data model correctness (`selected_answer` format, soft-delete), and the simplified retry model. Does not cover weekly recap quizzes (a separate live feature), quiz content generation (slice 01), or the comment composer itself (slice 06).

---

## How quizzes work today

**Generation.** The pipeline generates 5 questions per article in step 8 (`quiz`) and verifies them in step 9 (`quiz_verification`). `persist_generated_article` RPC inserts them into the `quizzes` table (one row per question) in the same transaction as the article. Questions carry `is_correct` per option in a metadata field — the answer key is stored server-side and never sent to clients as-is.

**Web take-the-quiz.** `ArticleQuiz.tsx` is a fully built component with its own state machine: `idle → loading-start → answering → loading-submit → result → passed`. It calls `/api/quiz/start` (which calls `start_quiz_attempt` RPC, rate-limited 3 per 600s per user+article), steps the user through one question at a time with 350ms advance delay, then calls `/api/quiz/submit` (which calls `submit_quiz_attempt` RPC, rate-limited 30 per 60s per user). On pass, it fires an `onPass(newAchievements[])` callback. The component is **currently unmounted** — it exists but is never rendered anywhere in the article reader.

**Web article reader.** `/[slug]/page.tsx` renders `<ArticleSurface>` which shows article title, subtitle, and body only. There is no quiz section and no comment section on the reader page today. Both are dead surfaces on web.

**iOS adult.** `StoryDetailView.swift:70-82` has an `APIQuizQuestion` struct and a `quizAnswers: [String: Int]` map. Answers are currently submitted as 0-based integer indices. The Discussion tab is gated by quiz pass (schema/013).

**iOS kids.** `KidQuizEngineView.swift` is the full kids quiz engine. State machine: `loading → blockedNotKidsSafe → loadError → emptyState → questionView → revealed → showResult/awaitingDrain → verdictPending → resolved`. Answers are disk-backed via `PendingQuizWrite` struct to `quiz_pending.json` in Application Support — survives app kills and parental interrupts. Three retries with exponential backoff; epoch guard against stale callbacks. Verdict is fetched from `get_kid_quiz_verdict` RPC, which validates the caller is the kid or their parent, counts distinct correct answers, and applies a configurable threshold (default 60%). Streak advance happens server-side inside `get_kid_quiz_verdict` on pass — the iOS app does not call `advance_streak` separately.

**Admin mark-quiz.** `/api/admin/users/[id]/mark-quiz/route.ts` writes a single `quiz_attempts` row (only the first question in the pool, `pool![0].id`) with `selected_answer: 'admin_manual:score/total'`. Does not fire `score_on_quiz_submit`, `advance_streak`, or `check_user_achievements`. Audited via `recordAdminAction`.

**Data model.** `quizzes` (one row per question): `article_id`, `question_text`, `question_type`, `options` (jsonb), `explanation`, `difficulty`, `points`, `sort_order`, `is_active`, `deleted_at`, `metadata` (carries `correct_index`). `quiz_attempts` (one row per answer): `quiz_id`, `user_id`, `kid_profile_id`, `article_id`, `attempt_number`, `is_correct`, `selected_answer` (string in DB), `points_earned`, `questions_served`, `time_taken_seconds`.

**Scoring.** `submit_quiz_attempt` RPC grades answers and returns `{passed, correct, total, percentile, attempts_remaining, results, attempt_number}`. The route then calls `scoreQuizSubmit()` → `score_on_quiz_submit` RPC (points, category_scores, streak roll-over) and `check_user_achievements`. `percentile` is real — computed from historical `quiz_attempts` and displayed as "Better than X% of readers on this article."

**Pool/retry history.** The system was built around a `pool_group` column that would allow different question subsets per retry attempt, so users couldn't memorize answers. `pool_group` was never actually used (all values were 0) and has been dropped (`2026-04-29_drop_quiz_pool_group.sql`). Vestigial pool-exhaustion machinery remains in `ArticleQuiz.tsx` and in the start/submit RPCs' attempt-tracking fields.

**Weekly recap quizzes.** A live separate feature — admin-curated weekly bundles of questions drawn from the week's articles, at `/admin/recap`, `/recap`, and `/recap/[id]`. Three dedicated tables (`weekly_recap_quizzes`, `weekly_recap_attempts`, `weekly_recap_questions`). Nothing to do with the per-article Discussion gate. No changes in this slice.

---

## Critical finding: web quiz and comments are completely unwired

The biggest gap in this slice: `ArticleQuiz.tsx` is a fully implemented component but is never mounted in the article reader. The reader page currently renders article body only — no quiz, no comment section. Web readers have no Discussion access path at all today. Both features exist as code but are dead on the public reader.

---

## Decisions

### D1 — Wire the web quiz and comment section into the article reader

The article reader page needs a new "engagement zone" below the article body containing the quiz and the comment thread. Implementation:

- Create a new `'use client'` component (e.g., `ArticleEngagementZone`) that renders `<ArticleQuiz>` above `<CommentThread>`. Mount it in `[slug]/page.tsx` below `<ArticleSurface>`.
- The server component checks whether the current user has already passed the quiz (`quiz_attempts` where `user_id = auth.uid()` and `article_id = article.id` and `is_correct = true` count ≥ threshold). Pass `initialPassed={true}` to `ArticleQuiz` if so — the page starts with the composer visible for returning passers.
- `ArticleQuiz` fires `onPass(newAchievements[])` when the user passes during the session. `ArticleEngagementZone` listens to this to flip a local `hasPassed` state, which is passed down as a prop to `CommentThread` to unlock the composer.
- If the article has no quiz questions (`quizzes` count = 0 for this article), skip the quiz zone and render the comment thread in a locked-but-visible state (cannot compose, explanatory copy: "Complete the quiz to join the discussion").
- Anonymous readers (not logged in): show neither quiz nor composer. Comment thread visible (read-only) without quiz gate.

**Adversarial note absorbed:** Implementation surface is larger than initially scoped — it's adding both quiz and comments to the reader, not just quiz. The page currently has neither.

### D2 — `selected_answer` stores option text (not 0-based index)

`quiz_attempts.selected_answer` is a `string` in the DB but three different semantics currently write into it: web sends a number-as-string (index), iOS kids sends option text, admin mark-quiz sends `'admin_manual:score/total'`. Lock the canonical format as **option text** for all real quiz submissions. The admin sentinel stays as its own distinct format.

Changes required:

- **Web submit route** (`/api/quiz/submit/route.js:34`): Remove the `typeof a.selected_answer !== 'number'` validation. Accept string. The error message at line 36 should change to "each answer needs {quiz_id, selected_answer: string (option text)}".
- **`ArticleQuiz.tsx`**: Change `answers: Record<string, number>` to `Record<string, string>`. Change `selectOption(q, oi)` to store `q.options[oi].text` (option text) instead of `oi` (index). Update result rendering accordingly — `r.selected_answer` is already text in the response, so the display side may be unchanged.
- **iOS adult** (`StoryDetailView.swift:2810`): Change `quizAnswers: [String: Int]` to `[String: String]` and store option text when user selects. Submit sends the text string rather than the index.
- **iOS kids**: Already sends option text. No change.
- **Admin mark-quiz**: `'admin_manual:score/total'` sentinel stays — it's intentionally not an option text.

### D3 — Admin mark-quiz: thin stamp, one row per question

Admin mark-quiz is a support tool that unlocks Discussion for a user without making them take the quiz. It should not fire scoring, streak, or achievement RPCs (those are for organic engagement). Keep it as a thin stamp.

Fix the current bug: it inserts only `pool![0].id` (the first question). Change to loop over all active questions and insert one `quiz_attempts` row per question, so the resulting record looks like a complete attempt.

Each row: `user_id`, `article_id`, `quiz_id` (from loop), `is_correct: score >= ceil(total * 0.6)`, `selected_answer: 'admin_manual:score/total'` (sentinel, unchanged), `attempt_number: 1`, `points_earned: score`. Audit via `recordAdminAction` with one entry for the whole operation (not one per question).

### D4 — Simplified quiz model: fixed questions, unlimited same-question retries

The `pool_group` column is gone. The quiz model is: N fixed questions per article, user can retry as many times as they want (rate-limited to 3 starts per 600s as anti-abuse), always sees the same questions.

Remove from `ArticleQuiz.tsx`:
- Pool exhaustion state (`poolExhausted`, lines 95-121)
- Pool exhaustion UI (lines 293-307)
- Attempts-used display (lines 353-357)
- `outOfAttempts` flag (line 429)
- Out-of-attempts/out-of-plan affordance (lines 585-625)
- All references to `max_attempts`, `attempts_used`, `attempts_remaining` in the component

The `start_quiz_attempt` RPC may still return these fields — the client simply stops reading them. No RPC migration required.

**Adversarial note absorbed:** The removal scope is larger than the two line ranges initially cited. Audit all references to `max_attempts`, `attempts_used`, `attempts_remaining`, `outOfAttempts`, `poolExhausted` before marking done.

### D5 — Weekly recap quizzes: live separate feature, no changes

Weekly recap (`/admin/recap`, `/recap`, `/recap/[id]`) is a live feature. Three tables, admin management, user pages, `RecapCard` component. Completely separate from the per-article Discussion gate. No changes in this slice.

### D6 — Admin quiz edits soft-delete rather than hard-delete

Today admin save hard-deletes all quiz questions for an article and reinserts. If readers have answered questions before an edit, their `quiz_attempts` rows reference `quiz_id` values that no longer exist (dangling FK). Soft-delete preserves the historical record.

Changes:
- **`/api/admin/articles/[id]/route.ts` (PATCH)** and **`/api/admin/articles/save/route.ts`**: Change quiz delete from `DELETE FROM quizzes WHERE article_id = ...` to `UPDATE quizzes SET deleted_at = now() WHERE article_id = ... AND deleted_at IS NULL`. Then insert new question rows as before.
- **All quiz query paths** that don't already filter `deleted_at IS NULL` must add the filter. The kids quiz endpoint already does this correctly. The web quiz start/submit routes call RPCs — verify `start_quiz_attempt` and `submit_quiz_attempt` RPCs filter `deleted_at IS NULL` in their question counts and selections; add if missing.
- **Admin article GET** (`/api/admin/articles/[id]/route.ts:149`): The quiz select already filters `is_active = true` — add `deleted_at IS NULL` to the admin read path as well so editors see only live questions.

**Adversarial note clarified:** The FK cascade concern does not apply to soft-delete. `UPDATE` doesn't fire `ON DELETE` actions. Existing `quiz_attempts.quiz_id` values remain valid (the question row is still there, just marked deleted). No FK risk.

---

## Absorbed implementation notes (not decisions)

- **D1 server-side pass check**: Query `quiz_attempts` where `article_id = id` and `user_id = currentUser.id` and `is_correct = true`. If the count meets the threshold, `initialPassed = true`. Use the same 60% threshold the RPC uses (configurable via `settings.kids.quiz.pass_threshold_pct` or its adult equivalent).
- **D2 result display**: `ArticleQuiz.tsx` already renders `r.selected_answer` as text in the per-question breakdown. After D2, this will be option text — the display is already correct.
- **D4 rate limit preserved**: 3 starts / 600s per user+article stays as anti-abuse. Do not remove.
- **D6 new question UUIDs**: On each edit, old questions get `deleted_at` set, new questions are inserted with fresh UUIDs. Editors editing quizzes repeatedly will accumulate soft-deleted rows; a periodic cleanup cron (or the existing `pipeline-cleanup` cron) can hard-delete rows older than N days with `deleted_at IS NOT NULL`.
