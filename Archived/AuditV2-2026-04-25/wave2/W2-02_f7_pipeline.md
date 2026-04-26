# W2-02: F7 AI Pipeline Coherence

## Q1: Canonical doc determination — F7-DECISIONS-LOCKED is canonical

mtimes:
- `F7-pipeline-restructure.md` — 2026-04-21 09:32 (oldest, original strawman)
- `F7-PM-LAUNCH-PROMPT.md` — 2026-04-22 10:27
- `F7-PHASE-3-RUNBOOK.md` — 2026-04-22 17:15
- `F7-DECISIONS-LOCKED.md` — 2026-04-22 20:22 (most recent — locks decisions)

**Verdict (per Z02):** F7-DECISIONS-LOCKED supersedes F7-pipeline-restructure on every disputed point (kids data model, model provider, ingest cadence, cost cap, discovery tables). F7-pipeline-restructure is historical strawman — should be **archived**.

For each disputed point, code/schema verdict (Z02 + Z11):
- **Kids data model:** kid_articles + kid_quizzes + kid_sources + kid_timelines tables exist (verified via list_tables). DECISIONS-LOCKED's split-table model wins.
- **Model provider:** `ai_models` table has 4 rows (verified). Code uses `web/src/lib/pipeline/call-model.ts` which reads from DB. Whatever DECISIONS-LOCKED specifies is what the table contains — Wave 3 should query `ai_models`.
- **Ingest cadence:** F7-PHASE-3-RUNBOOK governs current state.
- **Cost cap:** `pipeline_costs` table exists (0 rows), `lib/pipeline/cost-tracker.ts` enforces. Code-driven, not in DB settings.
- **Discovery tables:** `discovery_items` table has 1521 rows (verified live). F7 discovery is active.

## Q2: /api/ai/generate vs /api/admin/pipeline/generate — BOTH LIVE (W2-10 Q9)

Refer to W2-10 Q9. The "orphan" finding was wrong — `admin/story-manager` and `admin/kids-story-manager` both still call `/api/ai/generate`. They are the legacy admin surfaces; F7 newsroom is the new flow.

## Q3: story-manager vs F7 articles/[id]/{review,edit} — DUPLICATION

Per Z14: story-manager (1229 lines) and kids-story-manager (1037 lines) coexist with newer F7 articles/[id]/{review,edit} pair. All routable, all gated by similar admin perms.

**Decision needed:** is the legacy admin surface deprecated? If yes, mark in code + redirect; if no, document why both exist. **Owner-decision item, not auto-resolvable.**

## Q4: Schema 127 rollback bug — CONFIRMED in W2-10 Q6

Forward 126 inserts `admin.pipeline.{clusters,presets,categories}.manage`. Rollback 127 deletes legacy underscore form `pipeline.manage_{clusters,presets,categories}`. Mismatch. **Real footgun.** See W2-10 for fix plan.

## Q5: 24_AI_PIPELINE_PROMPTS.md path drift — Z06 finding

Doc says `web/src/lib/editorial-guide.js`. Actual path is `web/src/lib/pipeline/editorial-guide.ts` (verified — file lists shows it). Update doc OR archive 24_AI_PIPELINE_PROMPTS into Future Projects/_retired/.

## Q6: F7-PM-LAUNCH-PROMPT relevance

mtime 2026-04-22 10:27, before DECISIONS-LOCKED. Likely captures launch-day PM session. Per Z02, decisions captured here may have moved into F7-DECISIONS-LOCKED. **Wave 3:** read both side-by-side to confirm.

## Q7: F7 tables ↔ API ↔ RLS state

Live F7-era tables (verified via list_tables):
- `articles` (16 rows, RLS on)
- `pipeline_runs` (3 rows, RLS on)
- `pipeline_costs` (0 rows, RLS on)
- `feeds` (229 rows, RLS on)
- `feed_clusters` (192 rows, RLS on)
- `feed_cluster_articles` (0 rows, RLS on)
- `discovery_items` (1521 rows, RLS on)
- `ai_models` (4 rows, RLS on)
- `ai_prompt_overrides` (0 rows, RLS on)
- `ai_prompt_presets` (0 rows, RLS on)
- `ai_prompt_preset_versions` (0 rows, RLS on)
- Kid versions: `kid_articles`, `kid_sources`, `kid_timelines`, `kid_quizzes`, `kid_discovery_items`

All have RLS enabled (good).

**177_grant_ai_models_select.sql** issue (Z11 said only 4 of ~10 F7 tables got SELECT grant): Wave 3 should run `SELECT table_name, has_table_privilege('authenticated', schemaname||'.'||tablename, 'SELECT') FROM pg_tables WHERE tablename IN ('articles','pipeline_runs','pipeline_costs','feeds','feed_clusters','feed_cluster_articles','discovery_items','ai_models','ai_prompt_overrides','ai_prompt_presets')` to identify which lack the grant.

## Q8: Cost-cap reality check

Code: `lib/pipeline/cost-tracker.ts` (Z12). Cost cap value source needs investigation — may be hardcoded in cost-tracker.ts OR read from `settings`.

`settings` table (verified): only has `comment_max_depth=2` and `comment_max_length=4000`. **No cost-cap setting.**

So cost-cap is hardcoded in cost-tracker.ts. **Move to DB per "DB is default" rule.** Wave 3 fix.

## Confirmed duplicates
- `admin/story-manager` ↔ `admin/articles/[id]/{review,edit}` (also see W2-03 Q8 for kids-story-manager)
- F7-pipeline-restructure ↔ F7-DECISIONS-LOCKED (latter supersedes)
- `Future Projects/24_AI_PIPELINE_PROMPTS.md` outdated paths

## Confirmed stale
- `F7-pipeline-restructure.md` — superseded by DECISIONS-LOCKED on all disputed points
- `24_AI_PIPELINE_PROMPTS.md` — refers to old `editorial-guide.js` path
- F7-PM-LAUNCH-PROMPT — likely partially superseded; Wave 3 confirms

## Confirmed conflicts
- Z15's "/api/ai/generate orphan" was wrong (W2-10 Q9)
- 127 rollback perm-key bug (W2-10 Q6)
- Cost-cap hardcoded (should be DB setting)

## Unresolved (Wave 3)
- ai_models table contents (provider+name)
- Which of the 10 F7 tables got SELECT grant from 177
- F7-PM-LAUNCH-PROMPT diff vs DECISIONS-LOCKED

## Recommended actions
1. **P1:** Archive `F7-pipeline-restructure.md` → `Archived/2026-04-22-f7-strawman/` with note that DECISIONS-LOCKED supersedes
2. **P1:** Archive or update `24_AI_PIPELINE_PROMPTS.md` (correct lib path)
3. **P1:** Decide story-manager fate (deprecate or document parallel admin surface)
4. **P1:** Move cost-cap to `settings` table + update cost-tracker.ts
5. **P2:** Audit which F7 tables need SELECT grant for `authenticated` role
6. **P3:** Reconcile F7-PM-LAUNCH-PROMPT against DECISIONS-LOCKED
