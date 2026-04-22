# FACTS — Phase 3 Task 14 (plagiarism rewrite loop)

Generated 2026-04-22 by PM pre-flight. Every row verified via MCP SQL or direct file read. Agents MUST use this as ground truth; any claim outside this sheet requires fresh verification with cited source.

---

## 1. DB schema — verified via `information_schema.columns`

### `pipeline_runs` (25 cols)
| col | type | nullable |
|---|---|---|
| id | uuid | NO |
| pipeline_type | varchar | NO |
| feed_id | uuid | YES |
| status | varchar | NO |
| started_at | timestamptz | NO |
| completed_at | timestamptz | YES |
| duration_ms | integer | YES |
| items_processed | integer | NO |
| items_created | integer | NO |
| items_failed | integer | NO |
| error_message | text | YES |
| error_stack | text | YES |
| input_params | jsonb | NO |
| output_summary | jsonb | NO |
| triggered_by | varchar | YES |
| triggered_by_user | uuid | YES |
| created_at | timestamptz | NO |
| cluster_id | uuid | YES |
| audience | text | YES |
| total_cost_usd | numeric | NO |
| step_timings_ms | jsonb | NO |
| provider | text | YES |
| model | text | YES |
| freeform_instructions | text | YES |
| prompt_fingerprint | text | YES |

**NO `error_type` column.** Migration 120 (Task 16) will add it. For Task 14: keep error_type stashed in `output_summary.error_type` same as existing pattern at route.ts:1551-1566.

### `pipeline_costs` (22 cols)
| col | type | nullable |
|---|---|---|
| id | uuid | NO |
| pipeline_run_id | uuid | NO |
| article_id | uuid | YES |
| model | varchar | NO |
| provider | varchar | NO |
| input_tokens | integer | NO |
| output_tokens | integer | NO |
| total_tokens | integer | NO |
| cost_usd | numeric | NO |
| **step** | varchar | NO |
| latency_ms | integer | YES |
| success | boolean | NO |
| error_message | text | YES |
| metadata | jsonb | YES |
| created_at | timestamptz | NO |
| cache_read_input_tokens | integer | NO |
| cache_creation_input_tokens | integer | NO |
| cluster_id | uuid | YES |
| **error_type** | text | YES |
| retry_count | integer | NO |
| audience | text | NO |
| prompt_fingerprint | text | YES |

**DB column is `step`, NOT `step_name`.** TypeScript uses `step_name` on the `CallModelParams` interface; `writePipelineCost` at `web/src/lib/pipeline/call-model.ts:304` maps it to the `step` column. Agents must not write `step_name` in SQL or table INSERTs.

**`pipeline_costs.error_type` column DOES exist** (handoff §4 lesson #1 was WRONG — it conflated the two tables). However `call-model.ts:300-320` currently stuffs it inside `metadata.error_type` jsonb and leaves the real column NULL. This is latent drift, out of scope for Task 14.

### Indexes / constraints
- **No unique constraint on `pipeline_costs(pipeline_run_id, step)`** — verified via `pg_indexes`. Safe to write TWO rows for `step='plagiarism_check'` in one run (the rewrite LLM call).
- CHECK: `pipeline_costs.audience` ∈ {'adult', 'kid'} — NOT NULL. `'both'` would violate.
- CHECK: `pipeline_runs.audience` ∈ {'adult', 'kid'} OR NULL. Same constraint shape.

### `settings` keys (verified present with correct values)
| key | value | value_type |
|---|---|---|
| pipeline.plagiarism_flag_pct | 25 | number |
| pipeline.plagiarism_ngram_size | 4 | number |
| pipeline.plagiarism_rewrite_pct | 20 | number |

---

## 2. RPC / permission state — migrations NOT yet applied by owner

| name | present? | source |
|---|---|---|
| `persist_generated_article` RPC | NO | migration 118 pending |
| `claim_cluster_lock` RPC | NO | migration 116 pending |
| `release_cluster_lock` RPC | NO | migration 116 pending |
| perm `admin.pipeline.run_generate` | NO | migration 116 pending |
| perm `admin.pipeline.runs.retry` | YES | pre-existing |
| perm `admin.pipeline.runs.cancel` | YES | pre-existing |

Task 14 does NOT depend on any of these. Noted for Tasks 15-19 and 10's runtime correctness.

---

## 3. File layout — verified by `ls` and `grep`

### `web/src/lib/pipeline/` (11 files, no plagiarism.ts yet)
- `call-model.ts` — `callModel` exported at L334, writes `pipeline_costs` via `writePipelineCost` at L283. Maps `params.step_name` → DB column `step` at L304.
- `clean-text.ts` — exports `cleanText`. Imported by route at L49.
- `cluster.ts`, `cost-tracker.ts`, `editorial-guide.ts`, `errors.ts`, `logger.ts`, `persist-article.ts`, `render-body.ts`, `scrape-article.ts`, `story-match.ts`
- **`plagiarism-check.ts` does NOT exist** (Task 14 will create it).

### `web/src/app/api/admin/pipeline/generate/route.ts` (1727 lines)
| what | lines |
|---|---|
| Imports block | 32-72 |
| `Step` union (12 members incl. `plagiarism_check`) | 103-115 |
| `PipelineSettings` interface | 188-201 |
| Settings fetch incl. 3 plagiarism keys | 207-239 |
| Inline `getNgrams` helper | 367-378 |
| Inline `checkPlagiarism` helper | 380-406 |
| `classifyError` helper (maps Error → error_type string) | 438-448 |
| `sourceTexts` array built | 889-897 |
| `finalBodyMarkdown` declared (`let`) | 1054 |
| `body` step mutates finalBodyMarkdown via `bodyParsed.body` | 1054 |
| `source_grounding` step (reads finalBodyMarkdown) | 1086-1126 |
| **Plagiarism step (flag-only, TODO at L1155)** | **1129-1159** |
| `timeline` step (reads finalBodyMarkdown) | 1164-1200 |
| `kid_url_sanitizer` (mutates finalBodyMarkdown at L1236) | 1205-1248 |
| `quiz` step (reads finalBodyMarkdown) | 1263-1300 |
| `quiz_verification` step | 1321-1360 |
| Success path runs persist + renderBodyHtml | 1365-1489 |
| catch → finalStatus='failed' + classifyError | 1490-1511 |
| finally block (state reset, lock release, pipeline_runs update) | 1512-1580 |
| `pipeline_runs.update` stashes error_type in output_summary | 1551-1566 |

### `HAIKU_MODEL` constant
- Declared: `route.ts:131` as `const HAIKU_MODEL = 'claude-haiku-4-5'`.
- Used as probe model for: source_fetch (L754), source_grounding (L1095), kid_url_sanitizer (L1224), quiz_verification (L1325).
- NOT exported. Task 14 rewrite step should use this same constant; if helper lives in lib, either pass model as param or accept that helper is called ONLY from route.ts where constant is in scope.

### Snapshot reference
- `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/src/utils/plagiarismCheck.js` — original n-gram helper (47 lines).
- `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/src/app/api/ai/pipeline/route.js:460-485` — original rewrite loop logic.

Key snapshot behavior to port:
1. If `flagged`, find outlets with `similarity > 20` and name them in rewrite system prompt.
2. `max_tokens: 3000`, system prompt demands "100% original, same facts, no copied phrase > 3 words".
3. On return: if `rewritten.length > 100` AND second check's `maxOverlap < first check's maxOverlap`, accept rewrite.
4. On rewrite failure: catch, push to `errors` array, continue with original body.
5. **Snapshot does NOT fail the run if 2nd-check still flagged.** It keeps the better of the two and moves on.

---

## 4. Error-type vocabulary — CORRECTED 2026-04-22 after adversary caught drift

`classifyError` at route.ts:438-452 (re-read verbatim):
- `'abort'` ← `AbortedError`
- `'cost_cap_exceeded'` ← `CostCapExceededError`
- `'provider_error'` ← `ModelNotSupportedError` OR `ProviderAPIError` OR `RetryExhaustedError` (three classes fold into one string)
- `'schema_validation'` ← `AudienceMismatchError` OR `ZodError`
- `'persist_conflict'` ← `PersistArticleError`
- `'json_parse'` ← regex match `/malformed json/i` on message
- `'scrape_empty'` ← regex match `/scrape_empty/i`
- `'timeout'` ← regex match `/timeout/i`
- `'unknown'` ← fallback

No `'plagiarism'` entry. Task 14 does NOT add one (rewrite failure is non-fatal per §6 item 4).

**Fail-closed invariant** (F7-DECISIONS invariant #3): `CostCapExceededError` and `AbortedError` MUST NOT be swallowed anywhere. They propagate to the outer catch at L1490.

---

## 5. Cost math (per-run cap $0.50)

Haiku 4.5 pricing lookup lives in DB `model_pricing` table; confirmed `HAIKU_MODEL='claude-haiku-4-5'` resolves via `getModelPricing()` in call-model.ts.

Rough: Haiku at ~$1/MTok input + $5/MTok output. Rewrite call with ~3K input (body) + 3K output = ~$0.018. One rewrite blow-up negligible vs $0.50 cap.

Sonnet 4.6 body step already consumed ~$0.10-$0.20 before plagiarism step runs, so rewrite must stay on Haiku to stay within cap.

---

## 6. Task 14 contract (LOCKED — agents implement this, do not re-decide)

1. **Extract** `getNgrams` + `checkPlagiarism` from `route.ts:367-406` into new `web/src/lib/pipeline/plagiarism-check.ts`. Export both.
2. **Add** `rewriteForPlagiarism(params)` to same file. Takes current body, source texts, flagged outlets, model, run_id, cluster_id, signal; returns `{ body, cost_usd, latency_ms, rewritten: boolean }`. Calls `callModel` internally with `step_name='plagiarism_check'`, `model=HAIKU_MODEL`, signal plumbed. System prompt per snapshot.
3. **Catch contract inside `rewriteForPlagiarism`** (ADDENDUM — adversary P0 fix):
   - `CostCapExceededError` — RETHROW (fail-closed invariant #3)
   - `AbortedError` — RETHROW (user-initiated cancel must propagate)
   - `ProviderAPIError`, `RetryExhaustedError`, `ModelNotSupportedError`, `ZodError`, any other — catch, log `pipelineLog.warn` with `error_type` + message, return original body unchanged with `rewritten: false, cost_usd: 0`.
4. **Post-rewrite guards** (ADDENDUM — adversary P1):
   - Apply `cleanText` to LLM output.
   - If `cleaned.length < 100` → discard rewrite, return original.
   - If `cleaned === originalBody` → return original with `rewritten: false` (same-text case).
5. **Flagged outlets fallback** (ADDENDUM — adversary P1): compute `flaggedOutlets = plagResult.results.filter(r => r.similarity >= settings.plagiarism_rewrite_pct).map(r => r.outlet)`. If empty (edge case where maxOverlap crossed threshold via some other path), default to `['source articles']`. Use `>=` to match the trigger condition.
6. **Wire** into `route.ts:1129-1159` plag step: run initial check. If `maxOverlap >= rewrite_pct` (20) → call rewrite helper → re-check once. Keep rewritten body ONLY if second check's `maxOverlap < first check's maxOverlap` (strict). Update `finalBodyMarkdown` in place (it's a `let` at L1054).
7. **Do NOT fail the run** if 2nd check still above flag_pct. Match snapshot: log WARN with both overlap percentages, persist anyway. Human review (Phase 4 Task 23) gates publish.
8. **Do NOT modify** `classifyError` (rewrite failure is non-fatal; the two rethrown classes already have entries).
9. **Keep `HAIKU_MODEL`** in route.ts and pass to helper as param. Do NOT export from call-model.ts.
10. **AbortSignal**: plumb `req.signal` into `rewriteForPlagiarism` → callModel. Do NOT plumb through any cleanup / finally release.
11. **Cost write**: handled automatically by callModel; no manual pipeline_costs insert needed. Second `pipeline_costs` row with `step='plagiarism_check'` is safe (no unique constraint).
12. **Cost accumulation**: `totalCostUsd += rewriteRes.cost_usd` ONLY if rewrite happened (not when helper returned zero-cost no-op). Helper returns `cost_usd: 0` on swallowed errors so blind `+=` is also safe.

---

## 7. MUST-NOT-TOUCH fence for Agent 5

- `classifyError` at L438-448 — do not edit.
- Any migration files — Task 14 is code-only.
- `editorial-guide.ts` — do not edit.
- `call-model.ts` — do not edit (HAIKU_MODEL stays in route).
- Imports block at L32-72 — add ONE new import line, do not reorder existing.
- Any step outside plagiarism_check (body, grounding, timeline, sanitizer, quiz, quiz_verification) — do not touch.
- `pipeline_runs.update` in finally — do not touch.
- Lock release / discovery item state — do not touch.
- The `sourceTexts.map(...)` at L1142 — preserve exact shape `{ outlet, text }` even as signature evolves.

---

End of FACTS sheet.
