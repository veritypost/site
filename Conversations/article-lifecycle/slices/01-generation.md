# Slice 01 — Generation

**Status:** locked
**Locked:** 2026-04-29
**Session:** 2 (investigation + Q&A + adversarial review)

---

## What this slice covers

The generation pipeline: the 13-step LLM chain that runs when an admin clicks "Generate" in the Newsroom, the state machines it drives, the cost and lock infrastructure, and the admin editor surface that receives the output. This slice does not touch publishing, viewing, quizzes as a reader feature, timelines as a reader feature, or comments.

---

## How generation works today

One admin click on an AudienceCard (`web/src/app/admin/newsroom/_components/AudienceCard.tsx:172`) POSTs to `/api/admin/pipeline/generate`. The route runs 13 steps — some serial, some parallel — and on success calls the `persist_generated_article` RPC, which writes the article, sources, timelines, and quizzes in a single DB transaction as `status='draft'`. The admin then opens the draft in StoryEditor, rewrites as needed, and publishes.

**The 13 steps** (`route.ts:158-172`):

1. `audience_safety_check` — kid runs only; Haiku classifies cluster as kid-safe or aborts.
2. `source_fetch` — scrapes `raw_body` for discovery items missing content.
3. `headline` / `summary` / `categorization` — parallel batch.
4. `body` — main article body via LLM.
5. `source_grounding` — maps claims to sources; non-fatal, result discarded after logging.
6. `plagiarism_check` — n-gram overlap; attempts Haiku rewrite if over threshold; flags `needs_manual_review` if rewrite doesn't improve it.
7. `kid_url_sanitizer` — kid runs only.
8. `quiz` — generates 5 questions based on the article body.
9. `quiz_verification` — Haiku verifies quiz answers.
10. `timeline` — 4–10 dated events.
11. `persist` — single-transaction RPC writes everything.

**State machines driven:**
- `articles.status` → `'draft'` on persist.
- `feed_cluster_audience_state.state` → `pending → generating → generated/failed/skipped`.
- `pipeline_runs.status` → `running → completed/failed/cancelled`.
- `discovery_items.state` → `generating → published` (adult) or `→ ignored` (mismatch) or `→ clustered` (failure).

**Cost and locking:** `reserve_cost_or_fail` checks the daily cap (settable via `/admin/pipeline/settings`, key `pipeline.daily_cost_usd_cap`, default $10) before any LLM work. `claim_cluster_lock_v2` prevents concurrent generation per `(cluster_id, audience_band)`, TTL 600s. Both reconcile/release in the `finally` block.

---

## Locked decisions

### 1. Body word count — 250–400 words, all audiences

**Current state:** Adult prompt says 80–400 words (`route.ts:1314`); editorial guide says 175 target / 250 ceiling / 300 hard limit (`editorial-guide.ts:44-66`). Kids prompt says 80–120 words (`editorial-guide.ts:923`). Tweens prompt says 120–180 words (`editorial-guide.ts:952`).

**Locked:** All three audiences target **250–400 words**. Update the inline body prompt in `route.ts` and all three audience prompts in `editorial-guide.ts`. Delete the old targets entirely — no parallel constraints.

**Implementation note:** Add `.min(250).max(400)` validation to the `word_count` field in `BodySchema` (`route.ts:350-365`) so the pipeline rejects a body under 250 words rather than silently accepting it. The prompt instructs; the schema enforces.

---

### 2. Summary — 40–60 words, substantive

**Current state:** Summary step prompt says "max 40 words, 2-sentence summary" (`route.ts:1193`). Output is a teaser-style excerpt.

**Locked:** Update to **40–60 words, up to 3 sentences.** The summary must capture the actual who/what/where of the story — a reader who reads only the summary should know what happened, not just that something happened. Not a hook, not a tease.

**Implementation note:** Update the inline `summaryUser` string at `route.ts:1193`. Remove the "2 sentences maximum" constraint and replace with "up to 3 sentences." Keep the "must not restate the headline" and "must contain different facts" rules.

---

### 3. Haiku model string — update to `claude-haiku-4-5`

**Current state:** `const HAIKU_MODEL = 'claude-haiku-4-5-20251001'` at `route.ts:178`. Used via the constant at five callModel sites (audience_safety_check, source_grounding, plagiarism rewrite, kid_url_sanitizer, quiz_verification). No fallback if the specific version string is deprecated.

**Locked:** Change line 178 to `const HAIKU_MODEL = 'claude-haiku-4-5'`. One change; all five sites inherit it via the constant.

---

### 4. Regenerate quiz button in StoryEditor

**Current state:** No quiz regeneration path exists. Quiz questions are generated from the AI body at generation time. If an editor rewrites the body significantly, quiz questions may reference facts, numbers, or framings that are no longer in the article. The existing "Enrich timeline" button (`StoryEditor.tsx:963`) calls the legacy `/api/ai/generate` route; there is no equivalent for quizzes.

**Locked:** Add a **"Regenerate quiz" button** in StoryEditor alongside the existing AI controls. Manual trigger only — no auto-fire on body edits. On click, calls a new endpoint `/api/admin/pipeline/quiz-regenerate` (POST, takes `article_id`). The endpoint reads the current saved body from the DB, re-runs the `quiz` + `quiz_verification` steps only, and persists the new quiz questions (delete-and-reinsert, same pattern as the save route). Returns the new questions to the editor.

**Implementation notes:**
- The main `/api/admin/pipeline/generate` route does not support partial re-runs. New endpoint required.
- The endpoint should require `admin.articles.edit` permission (same gate as the PATCH route).
- The editor should show a loading state during regen and update the quiz fields inline on success.
- Rate-limit to prevent abuse: mirror the existing quiz start rate limit (3/600s is fine as a ceiling).

---

### 5. Standalone cluster cleanup

**Current state:** When an admin generates from manually-entered URLs (`mode='standalone'`), the pipeline inserts a throwaway `feed_clusters` row with `keywords=['standalone']` (`route.ts:526`). The pipeline-cleanup cron (`pipeline-cleanup/route.ts:247-341`) already handles a 14-day expiry for clusters with no articles attached, but standalone clusters that produced an article are never cleaned up — they accumulate permanently.

**Locked:** Include standalone clusters in the existing 14-day+no-articles cleanup. No special treatment, no "delete regardless of articles" behavior. A standalone cluster that produced an article stays alive as long as the article references it (existing skip-if-has-articles logic already handles this correctly). A standalone cluster that produced nothing gets cleaned up on the same 14-day schedule as any other empty cluster.

**Implementation note:** The existing cleanup logic at `pipeline-cleanup/route.ts:275-276` skips clusters that have any article in any status. Standalone clusters with articles will be skipped by this guard automatically. The only change needed is to stop exempting standalone clusters from the cleanup query entirely — confirm whether the query currently filters them out by keyword and remove that filter if so.

---

### 6. Source grounding claims — stay discarded

**Current state:** The `source_grounding` step computes supported/unsupported claim mappings against sources, logs a warning if unsupported claims exceed 3, and discards the result. Nothing is persisted.

**Locked:** No change. The persisted sources list is sufficient. Claim mappings stay discarded. The step runs for pipeline-level observability (the warning log) but does not need to surface anything to the editor.

---

### 7. Plagiarism flag — no dedicated review queue

**Current state:** Articles that fail the plagiarism rewrite get `needs_manual_review = true` on the article row. No admin filter surfaces these.

**Locked:** No change. Editors rewrite articles before publishing anyway. The flag exists as a data point but does not need a dedicated queue or UI treatment.

---

## Implementation order

These are independent of each other with one exception: the quiz regen button (Decision 4) depends on the new endpoint existing before the UI ships.

1. `editorial-guide.ts` — word count updates (Decisions 1 + 2). No DB changes, no route changes.
2. `route.ts` — Haiku model string (Decision 3), inline body/summary prompt updates (Decisions 1 + 2), BodySchema min/max validation (Decision 1 implementation note).
3. New endpoint `/api/admin/pipeline/quiz-regenerate` (Decision 4).
4. StoryEditor — "Regenerate quiz" button (Decision 4), wired to the new endpoint.
5. `pipeline-cleanup/route.ts` — standalone cluster filter removal (Decision 5).

PRs can be: one for editorial-guide + route prompt updates, one for the quiz regen endpoint + editor button, one for the cleanup cron tweak.

---

## What this slice does NOT include

- **Publishing flow changes** — how drafts get promoted to live is Slice 02.
- **Editor UI improvements beyond quiz regen** — the StoryEditor body textarea, source display, and timeline UI are out of scope here. This slice adds one button; it doesn't redesign the editing surface.
- **Pipeline quality metrics or analytics** — cost per run, step latency, model performance dashboards. Not in scope.
- **Model provider switching** — the admin-selectable provider/model at request time is already built. This slice only fixes the Haiku constant.
- **`scheduled` phantom feature** — enum value, no cron. Deferred to Slice 02.

---

## Cross-slice notes

- The `quiz` step generates questions from the AI body (`route.ts:1656`). After this slice, the body target is 250–400 words for all audiences. Quiz questions are grounded against whatever body text exists at generation time. The "Regenerate quiz" button covers the case where an editor changes the body substantially.
- The `timeline` step is unaffected by this slice. Timeline prompt word targets are not body text and are not changed here.
- Kids/tweens body word count change (250–400 for all audiences) affects `KidReaderView.swift` only in that kids will read longer bodies. No iOS code changes required — the reader already renders whatever `articles.body` contains.
