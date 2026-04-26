# FACTS — Phase 3 Task 15 (Layer 1 per-category prompt overrides)

Generated 2026-04-22 by PM pre-flight. All schema rows verified via MCP `information_schema.columns` / `pg_constraint` / `pg_indexes` / `pg_policy` against project `fyiwulqphgmoqullmrfn`. Every code reference re-read this session.

**Handoff §5 Task 15 was WRONG on three points** (corrected here):
1. Said "may need creating migration 121" — table already exists in migration 114 (LIVE).
2. Said schema has a `layer int` column — actual schema scopes via `(category_id, subcategory_id, step_name, audience)`.
3. Said "freeform_instructions inside user turn as layer-3" — per F7-DECISIONS §3.4, freeform is **Layer 2** (not 3) and it goes in **system** per stacking order, but for v1 it's in user turn (existing implementation, out of scope to move).

---

## 1. F7-DECISIONS §3.4 (LOCKED — re-read 2026-04-22)

| Layer | Purpose | Editable? | Storage |
|---|---|---|---|
| 0 | Default baseline (`editorial-guide.ts`) | No | code |
| 1 | Per-(category, subcategory?, step, audience) persistent overrides | Admin | `ai_prompt_overrides` table |
| 2 | Per-run freeform "Extra instructions" | Per-click | `pipeline_runs.freeform_instructions` |
| 3 | Reusable named templates | OUT OF SCOPE for launch | — |

**Stacking order per §3.4:** `[Layer 0 default] + [Layer 1 if matched] + [Layer 2 freeform if provided] + [user message with source text]`.

**Scope-layering rule (verbatim):** "most specific match wins; ties concatenate."

**Task 15 scope = Layer 1 only.** Layers 0 and 2 already wired. Layer 3 deferred indefinitely.

---

## 2. Live schema — `ai_prompt_overrides` (migration 114, LIVE)

| col | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| category_id | uuid | YES | NULL — FK `categories(id) ON DELETE CASCADE` |
| subcategory_id | uuid | YES | NULL (no FK in MCP results — verify in §6) |
| step_name | text | NO | — CHECK ∈ 12-step canonical list |
| audience | text | NO | — CHECK ∈ {'adult','kid','both'} |
| additional_instructions | text | NO | — CHECK length ≤ 8000 |
| is_active | boolean | NO | true |
| created_at | timestamptz | NO | `now()` |
| updated_at | timestamptz | NO | `now()` |

CHECK on `step_name`: `'audience_safety_check' | 'source_fetch' | 'headline' | 'body' | 'summary' | 'timeline' | 'categorization' | 'kid_url_sanitizer' | 'source_grounding' | 'plagiarism_check' | 'quiz' | 'quiz_verification'`.

**Indexes:**
- `ai_prompt_overrides_pkey` (id)
- `ai_prompt_overrides_lookup_idx` (step_name, audience, is_active) — perfect for fetch path
- `ai_prompt_overrides_scope_uniq` UNIQUE on `(coalesce(category_id, '00...0'), coalesce(subcategory_id, '00...0'), step_name, audience) WHERE is_active` — **prevents same-tuple ties**

**RLS:** SELECT only via `admin.system.view` perm. NO admin INSERT/UPDATE/DELETE policies. Phase 4 admin UI must use service role for writes.

**Service role read in generate route bypasses RLS** (uses `createServiceClient`).

---

## 3. Specificity scoring (LOCKED for Task 15)

§3.4 says "most specific match wins; ties concatenate." With unique index preventing ties at the maximum specificity level, "ties concatenate" only fires when multiple rows share specificity score below max.

Specificity score for a row given a run's `(cluster_category_id, cluster_subcategory_id, run_audience)`:

```
score =
  (category_id matched and IS NOT NULL ? 2 : 0)
+ (subcategory_id matched and IS NOT NULL ? 2 : 0)
+ (audience != 'both' ? 1 : 0)
```

Per (step_name) bucket: take all rows at MAX specificity score, concatenate `additional_instructions` joined by `\n\n`. (Ties at MAX impossible per unique index — code defends against future schema drift.)

---

## 4. Route call sites that need Layer 1 prepended

10 LLM-calling steps in `web/src/app/api/admin/pipeline/generate/route.ts` (verified via `grep -n "callModel({" route.ts`):

| Step | Line | Current system prompt source |
|---|---|---|
| audience_safety_check | 708 | `AUDIENCE_PROMPT` (editorial-guide) |
| headline | 908 | `HEADLINE_PROMPT` |
| summary | 919 | inline literal (re-uses headline shape) |
| categorization | 930 | inline `CATEGORIZATION_PROMPT` (built at L868) |
| body | 997 | `EDITORIAL_GUIDE + CATEGORY_PROMPTS[catName]` (composed in route) |
| source_grounding | 1049 | inline grounding system |
| timeline | 1164 | `TIMELINE_PROMPT` or `KID_TIMELINE_PROMPT` |
| kid_url_sanitizer | 1207 | inline sanitizer system |
| quiz | 1250 | `QUIZ_PROMPT` or `KID_QUIZ_PROMPT` |
| quiz_verification | 1308 | inline quiz_verification system |

**11th LLM call** lives in `web/src/lib/pipeline/plagiarism-check.ts` (Task 14) at the rewrite path — `step_name='plagiarism_check'`. **DEFERRED for Task 15** (would require breaking the helper signature; flag as Phase 3 follow-up, low value because rewrite is rare path).

---

## 5. Category-id timing inside the run

| When | Variable | Source | Used by |
|---|---|---|---|
| Top of run | `clusterRow.category_id` | DB row `feed_clusters` (may be NULL) | Layer 1 fetch (FACTS §6) |
| After categorization step (~L972-973) | `catParsed.category_id` | LLM writer output | category prompt selection for body |
| After validation chain (~L1334-1342) | `resolvedCategoryId` | writer → cluster → settings.default_category_id | persist payload only |

**Layer 1 fetch uses `clusterRow.category_id`**, NOT the writer's `catParsed.category_id`. Reasons:
1. Admin keys overrides to the cluster's tagged category (predictable surface).
2. All 4 pre-categorization LLM steps (safety_check, headline, summary, categorization itself) already need overrides resolved BEFORE categorization runs — only `clusterRow.category_id` is available at that point.
3. Writer-reassignment is a rare audit case; per §3.4 "most specific wins" cluster-tagged is more specific than the writer's hint anyway.

`subcategory_id` is NOT yet derived in route. Treat as NULL for v1 fetch. Phase 4 enhancement.

---

## 6. Verification gaps to confirm during investigator pass

- Does `ai_prompt_overrides.subcategory_id` have a FK to `subcategories(id)`? MCP returned NO matching FK in pg_constraint. May be intentional (subcategory_id stays loose for future schema). Investigator confirms via `pg_constraint`.
- Are there any seed rows in `ai_prompt_overrides` already (would change empty-table assumption)? Investigator runs `SELECT count(*) FROM ai_prompt_overrides`.
- `categories.id` type — assumed uuid; investigator confirms `information_schema.columns`.

---

## 7. Task 15 contract (LOCKED — implementer follows verbatim) — ADDENDUM 2026-04-22 after adversary YELLOW

1. **NEW** `web/src/lib/pipeline/prompt-overrides.ts`:
   - Export `type StepName = 'audience_safety_check' | 'source_fetch' | 'headline' | 'body' | 'summary' | 'timeline' | 'categorization' | 'kid_url_sanitizer' | 'source_grounding' | 'plagiarism_check' | 'quiz' | 'quiz_verification'` (mirrors DB CHECK constraint listed in §2; document the mirror in a code comment).
   - Export `type PromptOverride = { step_name: StepName; category_id: string | null; subcategory_id: string | null; audience: 'adult' | 'kid' | 'both'; additional_instructions: string }`.
   - Export `type PromptOverrideMap = Map<StepName, string>` — narrowed key type prevents typo at call site (P1 fix from adversary).
   - Export `async function fetchPromptOverrides(supabase: SupabaseClient<Database>, clusterCategoryId: string | null, clusterSubcategoryId: string | null, audience: 'adult' | 'kid'): Promise<PromptOverrideMap>`.
   - Export `function composeSystemPrompt(baseSystem: string, override: string | undefined): string`.
   - **Internal `assertUuid(s: string): void` helper** — regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. Used inside fetcher BEFORE interpolating `clusterCategoryId` into the `.or()` filter string (PostgREST filter strings are NOT parameterized — adversary P1 fix). On invalid UUID, log warn + treat as null + continue (do not throw).
   - File header: `/** Prompt-override fetch + system-prompt composer — F7 Phase 3 Task 15 (Layer 1). */`
   - JSDoc on `fetchPromptOverrides`: "Re-runs at Task 17 retry time; admin edits between original run and retry produce different prompts (expected)." (P2)
   - Comment on subcat-defensive-filter in C.2: "v1: clusterSubcategoryId always null; rows with non-null subcategory_id filtered out. Phase 4 derives subcat from cluster." (P2)

2. **EDIT** `web/src/app/api/admin/pipeline/generate/route.ts`:
   - Add ONE import line after L50 plagiarism-check import: `import { fetchPromptOverrides, composeSystemPrompt } from '@/lib/pipeline/prompt-overrides';`. Do NOT reorder existing imports.
   - At top of run handler, INSIDE the existing `try {` block (after `started_at` write, before the L708 audience_safety_check call): `const promptOverrides = await fetchPromptOverrides(service, clusterRow.category_id ?? null, null, audience); pipelineLog.info('newsroom.generate.prompt_overrides', { run_id: runId, cluster_id, audience, override_count: promptOverrides.size, override_steps: Array.from(promptOverrides.keys()) });` — adversary P1: log goes INSIDE try, not before. Find the actual line (investigator said B2 was before-try; correct it to inside-try at the equivalent flow point).
   - For each of the 10 callModel sites (B3-B12 in investigator plan): replace `system: <X>` → `system: composeSystemPrompt(<X>, promptOverrides.get('<step_name>'))`. Keep all other fields.
   - **DROP investigator's local-const extraction step for summary (L922) and body (L1000)** — both already use const-bound identifiers. Investigator + adversary both verified. FACTS §7 sub-bullet was over-prescribed and is RETIRED.

3. **DO NOT** edit `plagiarism-check.ts` (Task 14 just shipped; rewrite-step override is a follow-up — flag in commit body as known deferred).

4. **DO NOT** add a new migration. Table exists.

5. **DO NOT** add new permissions. Read uses service client; admin UI write perms ship with Phase 4.

6. **DO NOT** add caching. One DB query per run is acceptable (~5ms; lookup index covers it). Caching layer can be added if Phase 4 observability shows hot read.

7. **AbortSignal**: helper is a single non-LLM SELECT. No signal plumbing needed.

8. **Logging**: add ONE `pipelineLog.info('newsroom.generate.prompt_overrides', { run_id, cluster_id, audience, override_count, override_steps })` after fetch. Do NOT log the override text itself (could be long; PII-safe by exclusion).

9. **Empty-table behavior**: `fetchPromptOverrides` returns empty Map → all `composeSystemPrompt` calls return base unchanged → behavior identical to pre-Task-15 → backward compatible.

10. **Error behavior**: if the SELECT throws, fail-OPEN (return empty map + log warn). Layer 1 is a customization layer, not a safety gate — losing it should not fail the run.

---

## 8. MUST-NOT-TOUCH fence

- `web/src/lib/pipeline/plagiarism-check.ts` — just shipped, do not retouch
- `web/src/lib/pipeline/editorial-guide.ts` — Layer 0 baseline, do not edit
- `web/src/lib/pipeline/call-model.ts`, `errors.ts`, `clean-text.ts`, `cost-tracker.ts`, `logger.ts`, `persist-article.ts`, `render-body.ts`, `scrape-article.ts`, `cluster.ts`, `story-match.ts` — out of scope
- `classifyError` at route.ts:438-452 — no edits
- All migrations — no new file, no edits to existing
- Permissions table — no seeds added
- Settings table — no new keys
- The freeform_instructions positioning (currently user turn, per §3.4 should be system) — NOT this task; flag as Phase 4 cleanup
- The 10 callModel sites' OTHER fields (model, max_tokens, signal, etc.) — only the `system` field is touched
- The retry/cancel/cron task surfaces (16-19) — out of scope
- F7-DECISIONS-LOCKED.md — no edits (we're following it, not amending it)

---

## 9. Cost / abort summary

- **Cost impact**: zero. Layer 1 adds bytes to system prompts (max 8000 chars per row × ~10 steps × possibly 2-3 rows = ~240KB upper bound, but realistic <50KB). With Anthropic prompt caching, override text caches across same-cat runs in 5-min TTL.
- **Abort impact**: zero net change. The DB SELECT is fast and not in the LLM call path; if the run is cancelled mid-fetch, the existing cancellation path catches.

---

End of FACTS sheet.
