# Next-session handoff — F7 Phase 3 remainder + Phase 4

Paste this entire file into the first message of your next Claude Code session. It briefs the PM on where 2026-04-22 Session 1 left off, what the agents learned, how to run the flow, and what's left to build.

---

## 1. STATE OF THE WORLD (as of 2026-04-22 end-of-session)

**F7 AI Pipeline Rebuild**:

| Phase | Tasks | State |
|---|---|---|
| Phase 1 (Foundation) | 4/4 | ✅ LIVE — migration 114 applied |
| Phase 2 (Ingest) | 5/5 | ✅ LIVE |
| Phase 3 (Orchestrator) | 4/10 Tasks 10-13 | ✅ SHIPPED — STAGED pending owner apply of migrations 116 + 118 |
| Phase 3 remaining | 6/10 Tasks 14-19 | ⏳ NOT STARTED — this session's scope |
| Phase 4 (Admin UI) | 0/11 | ⏳ NOT STARTED — this session's scope if bandwidth allows |

**Latest commits on origin/main**:
- `4c61ccd` — Future Projects planning doc salvage
- `87afc0a` — kids-waitlist type cast (Vercel build unblock)
- `a1c15d8` — Session 2 artifacts + Future Projects planning (80 files)
- `c6483f4` — Session close SHIPPED blocks
- `b0ef4f0` — Task 10 generate route (1737 lines)
- `8428fc7` — Task 13 migration 118 persist RPC + wrapper
- `6fd552a` — Task 12 observability GET
- `7fef1ad` — Task 11 migration 116 + unlock + runbook

**Owner apply queue BEFORE starting new work** (Supabase SQL editor, project `fyiwulqphgmoqullmrfn`):

1. `schema/112_kids_waitlist.sql` (M6 from prior session — unblocks kids-waitlist route's DB ops + clears the type cast)
2. `schema/116_f7_cluster_locks_and_perms.sql` (Task 11 — cluster lock RPCs, perm seeds, unique partial indexes)
3. `schema/118_f7_persist_generated_article.sql` (Task 13 — persist_generated_article RPC)
4. `cd web && npm run types:gen`
5. Verify `npx tsc --noEmit` exits 0 (should — the 87afc0a cast handles it regardless)

Order between 112/116/118 doesn't matter — they're schema-independent. Do all three together.

---

## 2. READ ORDER (do NOT skip — the context is load-bearing)

1. `Reference/STATUS.md` — live narrative of what exists and what's locked
2. `Current Projects/F7-DECISIONS-LOCKED.md` — 8 owner decisions + 10 invariants + 14 pre-flight items + 16 divergences + 5 open items + 7 future obligations. **This is the contract.**
3. `Current Projects/F7-PHASE-3-RUNBOOK.md` — operational guide. Logging taxonomy (§3), failure matrix, recovery procedures (§9), things-not-to-do (§11). Note: §3a has 10-agent naming but F7-DECISIONS §Open Items #5 has the authoritative 12-step canonical list — **always use the 12-step list.**
4. `Sessions/04-22-2026/Session 1/COMPLETED_TASKS_2026-04-22.md` — full SHIPPED-block journal for every task landed this session
5. Memory file at `/Users/veritypost/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/project_session_state_2026-04-22.md` (auto-loads)
6. `web/src/lib/pipeline/*` — inventory (clean-text, cluster, story-match, scrape-article, editorial-guide, call-model, cost-tracker, errors, persist-article, logger, render-body)
7. `web/src/app/api/newsroom/ingest/run/route.ts` — Task 9 sibling; any new pipeline route copies its style
8. `web/src/app/api/admin/pipeline/generate/route.ts` — Task 10 (1737 lines); the canonical generation flow

---

## 3. THE 4-AGENT FLOW — how it actually runs

This is the PM rule established this session. Follow it exactly for any non-trivial task (single surgical edit can skip; multi-surface or architectural MUST use it).

### Pre-implementation (3-4 agents)

- **Agent 1 (investigator)** — runs in background via `run_in_background: true`. Reads all source files, runs MCP queries to verify every schema/column/perm claim, quotes snapshot code verbatim. Returns a structured report (sections A-H). Takes 3-5 min.
- **Agent 2 (investigator, parallel)** — same prompt with different emphasis (RLS, idempotency, context-window math, abort signals). Runs in parallel. Dispatch both in the SAME Agent tool message so they run concurrently.
- **Agent 3 (serial reviewer)** — consumes both reports. Resolves divergences. Produces LOCKED execution plan. **CAUTION: Agent 3 hallucinates table/column names** — spot-check every schema claim via MCP before handing to Agent 5.
- **Agent 4 (adversary)** — stress-tests Agent 3's plan. Returns RED / YELLOW / GREEN verdict. Adversary is the MVP — it's caught 6+ real bugs on Task 9 and 3 P0s + 10+ bugs on Task 10.

### Addendum cycle (when Agent 4 returns RED)

RED = 6+ issues or any P0. Do NOT proceed to Agent 5. Dispatch **Agent 3 ADDENDUM** with Agent 4's findings. Addendum is a TARGETED DIFF against the prior plan, not a rewrite. It resolves every finding with explicit spec text Agent 5 can implement verbatim. Addendum ends with "ADDENDUM LOCKED — HAND TO AGENT 5" or "ADDENDUM INCOMPLETE — <reason>".

YELLOW = 2-5 issues → lighter Agent 3 addendum.
GREEN = 0-1 minor → go to Agent 5.

### Implementation

- **Agent 5** — feeds corrected plan verbatim. Tell Agent 5 which MCP verifications to run BEFORE coding. Every Agent 5 prompt MUST include:
  - Exact file paths to write
  - Exact imports (verified against what exists on disk)
  - Exact SQL or TypeScript skeleton
  - Which MCP queries to run as pre-flight
  - Post-write verification steps (`npx tsc --noEmit` + `npx next lint --file <path>`)
  - Do NOT test end-to-end (requires live migrations + LLM keys)
  - Report shape: line counts, sha256, tsc/lint status, MCP results, any deviations with justification

### Fresh validator (user's workflow rule)

When ANY agent flags a bug or inconsistency, dispatch a fresh validator on that specific finding. Catches hallucinations. "Don't need check upon check but any bug or inconsistency gets a fresh validator so every agent is on the same page."

When investigators diverge and can't reach 4/4 consensus, dispatch 4 FRESH independent agents on the disputed point (no shared context). Their verdict decides. **Don't bring technical disputes to owner for merits-call** — that's a misuse of owner time.

### Post-implementation

- 1 post-impl verifier (was 2, reduced per user feedback). Runs same workflow: verify commit, check file contents against plan, run tsc/lint.
- Deadlock tolerance: 2-round deadlock → log it and move on. Don't infinite-loop.

---

## 4. LESSONS FROM THIS SESSION (the bads)

**MCP-verify EVERYTHING before Agent 5 ships:**

1. **`pipeline_runs.error_type` column DOES NOT EXIST.** Task 10 stashes error_type in `output_summary.error_type`. Migration 120 (Phase 3 Task 16 below) adds the column.
2. **`state='generated'` violates CHECK constraint.** `discovery_items.state` accepts only `pending|clustered|generating|published|ignored`. Use `'published'` for the terminal success state.
3. **`auth.uid()` is NULL under service role.** Lock RPCs MUST take explicit `p_locked_by uuid` parameter (we use `pipeline_runs.id`). Do NOT rely on `auth.uid()` inside a SECURITY DEFINER function called from a service client.
4. **`articles.summary` column DOES NOT EXIST.** Use `excerpt` for short summary + `metadata.summary` for long summary. Same for `kid_articles`.
5. **`sources.published_date`** (NOT `published_at`).
6. **`timelines.event_date` + `event_label`** are both NOT NULL. Must populate.
7. **`bump_user_perms_version` DOES NOT EXIST.** Use `bump_perms_global_version()` (no-arg).
8. **`permissions` NOT NULL columns**: `key`, `display_name`, `category`. 2-column INSERTs fail.
9. **`rate_limits` NOT NULL columns**: `key`, `max_requests`, `window_seconds`, `display_name`, `scope`. Seed with `scope='user'`.
10. **`settings.value_type`** uses `'string'` (default), `'boolean'`, `'number'`, `'integer'`, `'json'` — NOT `'text'`.
11. **Kids tables use `article_id` column** (NOT `kid_article_id`). Column name is identical; FK target differs (`kid_articles.id` vs `articles.id`).
12. **Tables `article_sources` / `article_timelines` / `article_quiz_questions` DO NOT EXIST.** Real tables: `sources`, `timelines`, `quizzes` (adult) + `kid_sources`, `kid_timelines`, `kid_quizzes` (kid). This was a persistent Agent 3 hallucination.
13. **Step vocabulary mismatch.** Runbook §3a uses 10-agent names; F7-DECISIONS §Open Items #5 uses 12-step canonical names. Use the 12-step list: `audience_safety_check, source_fetch, headline, summary, categorization, body, source_grounding, plagiarism_check, timeline, kid_url_sanitizer, quiz, quiz_verification`.
14. **Cost cap is TIGHT.** Per-run cap $0.50. Sonnet 4.6 6-step chain at 12K input × 6 + 3K output × 6 ≈ $0.49. ONE retry blows the cap. Budget accordingly — default to Haiku for non-body probes (safety check, grounding, url sanitizer, quiz verification).
15. **Scrape returns NULL on failure silently.** Don't assume raw_body is always populated post-scrape. Check aggregate corpus length against `settings.pipeline.scrape_fallback_char_threshold=2000`.
16. **AbortSignal propagation** — plumb `req.signal` through every `callModel()` but NOT through the `finally{}` release calls (the release needs a fresh un-aborted signal to actually run).
17. **Prompt-injection** — wrap sources in `<source_article>...</source_article>` AT PROMPT-ASSEMBLY TIME (not at ingest). Escape embedded closing tags via replace with `</source_article_>`. Same for `<user_instructions>` wrapping the admin's freeform.

---

## 5. PHASE 3 REMAINING — 6 TASKS (14-19)

These close out Phase 3. Exact scoping below; revise as you refine plan.

### Task 14: Plagiarism rewrite loop port

Snapshot `L466-L485` (`/Users/veritypost/Desktop/verity-post-pipeline-snapshot/src/app/api/ai/pipeline/route.js`) has a plagiarism-check-then-rewrite pattern using `lib/plagiarismCheck.js`. Port as:
- `web/src/lib/pipeline/plagiarism-check.ts` — deterministic n-gram overlap check (no LLM), settings-driven thresholds (`pipeline.plagiarism_ngram_size=4`, `pipeline.plagiarism_flag_pct=25`, `pipeline.plagiarism_rewrite_pct=20`).
- Wire into Task 10 generate route's plagiarism_check step: if `overlap_pct >= rewrite_pct` → LLM rewrite pass → re-check once → fail run if still above flag_pct.

Risk tier: **Surgical** (one new file + one route edit).

### Task 15: Layer-1 per-category prompt overrides

F7-DECISIONS §3.4 — admin can set per-category system-prompt overrides that prepend to Agent 3 writer's system. Table `ai_prompt_overrides` may need creating (check live DB first; if absent, add migration 121).

Shape: `{ category_id uuid, layer int (1=global, 2=per-category, 3=freeform), prompt_text text, is_active bool, updated_at }`. Generate route's `body` step system = `EDITORIAL_GUIDE + CATEGORY_PROMPTS[cat] + (layer-1 override if any) + (freeform_instructions inside user turn as layer-3)`.

Risk tier: **Multi-surface** (migration 121 + route edit + future admin UI).

### Task 16: `pipeline_runs.error_type` column migration 120

Current gap: Task 10 stashes error_type in `output_summary.error_type` jsonb because the column doesn't exist. Migration 120 adds `ALTER TABLE pipeline_runs ADD COLUMN error_type text` + populates from `output_summary->>'error_type'` on existing rows + updates Task 10 route to write the column directly (keep output_summary fallback for backward-compat one cycle).

Risk tier: **Multi-surface** (migration 120 + route edit). Also write rollback 121.

### Task 17: Retry endpoint POST /api/admin/pipeline/runs/:id/retry

Admin retries a failed run. Route:
1. Perm `admin.pipeline.runs.retry` (EXISTS — already in permissions table)
2. Load failed run by id
3. Rebuild request body from `run.input_params` (cluster_id, audience, provider, model, freeform_instructions)
4. Forward to `/api/admin/pipeline/generate` OR call its core logic directly
5. Return `{ ok, new_run_id }`

Risk tier: **Surgical** (one route, no migration).

### Task 18: Cancel endpoint POST /api/admin/pipeline/runs/:id/cancel

Admin cancels an in-flight run. Shape:
1. Perm `admin.pipeline.runs.cancel` (EXISTS)
2. Mark run `status='failed', error_type='abort', error_message='cancelled by admin'`
3. Call `release_cluster_lock(run.cluster_id, run.id)` (best-effort)
4. Reset `discovery_items.state='clustered'` for items in the cluster

Note: Can't actually interrupt a live call to the LLM — the worker finishes its current step. This endpoint is cooperative; it just tells the next step to abort. True abort requires the worker to check `run.status='failed'` between steps. Task 10's chain does NOT currently do this — either add the mid-chain status polling OR document cancel as "soft cancel; current step completes."

Risk tier: **Surgical to Multi-surface** depending on whether you add mid-chain polling.

### Task 19: Orphaned runs cleanup cron

Route: `GET /api/cron/pipeline-cleanup`. Vercel cron hits it every 5 min. Runs:
```sql
UPDATE pipeline_runs
   SET status='failed',
       completed_at=now(),
       duration_ms=EXTRACT(epoch FROM (now()-started_at))*1000,
       error_message='Orphaned run — auto-cleanup',
       error_type='abort'
 WHERE status='running'
   AND started_at < now() - interval '10 minutes';
```

Plus releases orphaned locks:
```sql
UPDATE feed_clusters
   SET locked_by=NULL, locked_at=NULL, generation_state=NULL
 WHERE locked_until IS NOT NULL AND locked_until < now();
```

Auth via `CRON_SECRET` header (pattern exists in `web/src/app/api/cron/*`). Add to `vercel.json`.

Risk tier: **Architectural** (cron + vercel.json + env secret).

---

## 6. PHASE 4 — 11 TASKS (admin UI)

These are UI-heavy. Each task should include: page skeleton → data fetch → interaction → toast/error handling → loading state → empty state. Follow the existing admin-page patterns in `web/src/app/admin/*`.

### Task 20: Newsroom home page `/admin/newsroom`
Grid of cluster cards. Per-card: title, summary, source count, lock status badge, audience chip, "Generate" button + "Unlock" button (if locked). Query feed_clusters with `is_active=true`. Paginate.

### Task 21: Per-cluster detail page `/admin/newsroom/clusters/:id`
Shows cluster's discovery_items list with raw title/url/excerpt, lets admin add/remove items (stretch), shows generation history (last_generation_run_id → details). Primary action: Generate button → POSTs to `/api/admin/pipeline/generate`.

### Task 22: Generation modal / progress UI
After clicking Generate, show progress via polling `/api/admin/pipeline/runs/:id` every 2s. Render step timings bar. On completion, redirect to article review page.

### Task 23: Article draft review page `/admin/articles/:id/review`
Shows the generated article: title, subtitle, body (with body_html preview), sources list, timeline, quiz questions + answers. Action buttons: Edit, Regenerate, Publish, Reject.

### Task 24: Article edit page `/admin/articles/:id/edit`
Rich-text editor for body. Inline editors for sources/timeline/quiz. Save via PATCH `/api/admin/articles/:id` (route not yet built — add to this task).

### Task 25: Publish flow `/admin/articles/:id/publish`
One-click: `status='published'`, `published_at=now()`, `moderation_status='approved'`. Plus option to schedule publish. Reject flow: `status='archived'`, reason field.

### Task 26: Observability dashboard `/admin/pipeline/runs`
Paginated list of recent runs. Filters: status, audience, date range. Row click → detail view consuming Task 12 endpoint.

### Task 27: Run detail view `/admin/pipeline/runs/:id`
Full pipeline_runs row + all pipeline_costs children. Step timings bar chart (use recharts or plain CSS bars). Prompt fingerprint + input/output tokens per step. Audit trail. Retry/Cancel buttons wired to Tasks 17 + 18.

### Task 28: Cost tracker dashboard `/admin/pipeline/costs`
Today's spend vs daily cap (red/yellow/green). Per-model breakdown. 30-day chart. Per-run cost outliers list.

### Task 29: Settings UI `/admin/pipeline/settings`
Toggles for kill switches (adult_generation_enabled, kid_generation_enabled, ingest_enabled). Sliders for cost caps (daily, per-run). Dropdown for default_category_id. Save → `/api/admin/settings/pipeline` (route stub exists).

### Task 30: Manual ingest button
Already exists as `/api/newsroom/ingest/run` endpoint. Wrap in admin UI button on `/admin/newsroom`.

---

## 7. SESSION SCOPING — don't bite off too much

**Recommended split**:
- **Session 2 (next)**: Phase 3 Tasks 14-19 (6 tasks). Keep it bounded. All schema + API work. Finishes Phase 3.
- **Session 3**: Phase 4 Tasks 20-25 (first 6 UI tasks — newsroom home, cluster detail, generation modal, review, edit, publish).
- **Session 4**: Phase 4 Tasks 26-30 (observability + dashboards + settings).

Don't try to ship Phase 3 + Phase 4 in one session. Task 10 alone burned significant context this session.

**Per-task 4-agent flow cost**: 5 agent dispatches × ~150K tokens each = ~750K per non-trivial task. 6 tasks = ~4.5M tokens if all non-trivial. The 1M context is effectively spent after 4-6 big tasks.

---

## 8. COMMIT + PUSH CONVENTIONS

- Format: `<area>(#<item>): <short title>` for FIX_SESSION_1 items, `feat(f7-phase-N): Task M — <summary>` for F7 tasks
- SHIPPED block in `Current Projects/FIX_SESSION_1.md` for every closed item (plus the session's `COMPLETED_TASKS_<date>.md`)
- Migrations are STAGED until owner applies via Supabase SQL editor (§3i rule)
- Push is APPROVED per-session (§3f) — user typically says "push" explicitly. Don't auto-push without confirmation unless durable CLAUDE.md instruction says otherwise
- Claude Opus 4.7 (1M context) co-author tag on every commit

---

## 9. GIT-STATE-AT-HANDOFF checks (run these first turn of new session)

```bash
git log --oneline -5                              # confirm 4c61ccd or newer is top
git status --short                                # should be clean
cd web && npx tsc --noEmit && echo "tsc: $?"      # should be exit 0
cd web && npm ls marked isomorphic-dompurify zod  # should be installed
```

Verify migrations applied:
```sql
SELECT 1 FROM pg_proc WHERE proname='persist_generated_article';   -- migration 118
SELECT 1 FROM pg_proc WHERE proname='claim_cluster_lock';          -- migration 116
SELECT 1 FROM public.permissions WHERE key='admin.pipeline.run_generate';  -- migration 116
SELECT 1 FROM information_schema.tables WHERE table_name='kids_waitlist';  -- migration 112
```

Any of those returning empty = migration not yet applied. Chase owner for apply before implementing Task 14+ (most tasks touch these primitives).

---

## 10. KNOWN DEFERRED + TECHNICAL DEBT

- `pipeline_runs.error_type` column (Task 16 closes)
- Plagiarism rewrite loop (Task 14 closes)
- Layer-1 per-category prompt overrides (Task 15 closes)
- `publishedAt` auto-set on publish action (Phase 4 Task 25 closes)
- No mid-chain abort polling in generate route (Task 18 decides)
- No admin UI for anything Phase 3-shipped (Phase 4 closes)
- Vercel hobby plan may cap at 60s not 300s — verify owner's plan. Task 10 declares `maxDuration=300`; downgrade if needed.
- Kids-waitlist type cast at `web/src/app/api/kids-waitlist/route.ts:127-144` becomes dead code once migration 112 applies + types:gen. Not urgent to remove.

---

## 11. DEADLOCKED REVIEW ITEMS (don't re-raise)

From 2026-04-22 47-item review — logged at `Sessions/04-21-2026/Session 2/REVIEW_UNRESOLVED_2026-04-21.md`:

- **M26** inline T-IDs — deadlock 2/2
- **M37** settings clarifier — deadlock 2/2
- **M39** verbatim quote-back — deadlock 2/2
- **M46** daily memory pattern — deadlock 2/2 (owner resolved: keep-and-refresh)

And 4 defer-owner items:
- **M1** family pricing (blocked on 02_PRICING_RESET ship)
- **M2** 7-day trial (blocked on 03_TRIAL_STRATEGY ship)
- **M6** kids landing "Coming soon" (replaced by inline email capture — code shipped, migration pending apply)
- **M10** file placement (resolved, VerityAdMockups.jsx moved to Current Projects/ad-mockups/)

---

## 12. HOW TO OPEN THE NEW SESSION

Paste this prompt, then say:

> "Start here. Apply migrations 112 + 116 + 118 via Supabase SQL editor first, then npm run types:gen, then run the git-state checks in §9. Once green, begin Phase 3 Task 14 (plagiarism rewrite loop port). Full 4-agent flow. Report back after each task ships."

The PM will read the referenced docs, verify state, and start the first task.

---

## 13. USER WORKFLOW PREFERENCES (from this session's memory)

- **4-agent pre-impl required for non-trivial changes**. Single-file surgical edits can skip.
- **Fresh validator per bug flag**. Don't do "check upon check" layers — one validator when a bug is flagged.
- **Divergence resolution**: 4 fresh independent agents when 4-agent flow doesn't reach 4/4 consensus. Don't bring technical disputes to owner.
- **Logging + instructions**: "make sure we log it really well and have solid instructions and what not" — every new code path gets structured JSON logging with the runbook §3 taxonomy. Every new migration has a rollback file. Every new route has a TSDoc header explaining the contract.
- **No emojis in adult surfaces** (ever — code, docs, commits, errors, UI). Kids iOS app is the only emoji-allowed surface.
- **Don't ask for owner merits-call on technical questions** — agents decide, owner adjudicates only on product direction.
- **Pushes and migration applies require explicit owner approval** (§3f + §3i rules in F7-PM-LAUNCH-PROMPT).
- **"Keep it going"** means autonomous continuation. No check-ins between tasks unless blocked.
- **"Make sure everything is up to date"** before Vercel checks = commit loose artifacts, push, verify git clean.

---

End of handoff. Good luck, next PM.
