# F7 Phase 3 — Orchestrator Runbook

Operational guide for the Verity Post AI pipeline orchestrator. Read this BEFORE debugging a failed run or onboarding a new agent to Phase 3 code.

Scope: Tasks 10-19 (full Phase 3) shipped 2026-04-22; Task 20 (Phase 4) home page also shipped. Tasks 21+ (cluster detail, run detail UI, surrounding flows) ship next session and will be appended to this runbook.

---

## 1. The pipeline in one paragraph

Admin clicks "Generate" on a cluster card in the newsroom UI. The server acquires a cluster lock (10 min), checks kill switch (`ai.ingest_enabled`) and per-day cost cap (`pipeline.daily_cost_usd_cap`, default $10), scrapes each article in the cluster via Jina Reader (with cheerio fallback), runs the 10-prompt editorial-guide chain (Agent 1+2 research → Agent 3 writer → Agent 4 editor), persists the result into `articles` (or `kid_articles`) + `sources` + `timelines` + `quizzes`, and marks the `discovery_items` rows in the cluster as `state='generated'`. The whole thing is instrumented end-to-end via `pipeline_runs` + `pipeline_costs`.

---

## 2. Entry points

| Who triggers | Endpoint | Method | Perm |
| --- | --- | --- | --- |
| Admin newsroom UI | `/api/newsroom/generate` | POST | `admin.pipeline.run_generate` |
| Admin refresh-feeds button | `/api/newsroom/ingest/run` | POST | `admin.pipeline.run_ingest` (shipped Task 9) |
| Admin observability pane | `/api/admin/pipeline/runs/:id` | GET | `admin.pipeline.view` (Task 12) |
| Admin cluster lock release | `/api/newsroom/clusters/:id/unlock` | POST | `admin.pipeline.run_generate` (Task 11) |

Crons and scheduled jobs are out of scope until Tasks 20+ (next session).

---

## 3. Logging taxonomy

Every log line from Phase 3 code uses a structured tag prefix:

```
[newsroom.<area>.<step>]
```

Reserved areas: `generate`, `ingest`, `admin`, `clusters`, `persist`, `cost_tracker`, `scrape`, `prompt`.

Each log line should carry this shape via `console.log(JSON.stringify({ ... }))`:

```json
{
  "tag": "newsroom.generate.prompt:body",
  "run_id": "...",
  "cluster_id": "...",
  "audience": "adult" | "kid",
  "step": "body",
  "duration_ms": 8421,
  "tokens_in": 12800,
  "tokens_out": 3200,
  "cost_usd": 0.042,
  "cache_read_input_tokens": 9600,
  "cache_creation_input_tokens": 0,
  "retry_count": 0,
  "error_type": null,
  "error_message": null
}
```

Info logs include `error_type: null` and `error_message: null` for grep-consistency. Errors populate both.

### 3a. Step vocabulary (use these literal strings)

Canonical 12-step prompt chain from `web/src/app/api/admin/pipeline/generate/route.ts` (`Step` union + `ALL_STEPS` array):

`audience_safety_check` · `source_fetch` · `headline` · `summary` · `categorization` · `body` · `source_grounding` · `plagiarism_check` · `timeline` · `kid_url_sanitizer` · `quiz` · `quiz_verification`

`persist` is the terminal non-LLM step. Operational logs additionally use: `kill_switch_check` · `cost_cap_check` · `cluster_lock` · `cluster_lock_contested` · `cluster_unlock` · `json_parse` · `schema_validation` · `run_complete` · `run_failed`. Mirror the same step strings in `prompt-overrides.ts` (`StepName` literal union) — typos there silently disable an override.

### 3b. error_type vocabulary (use these literal strings)

`rate_limit` · `timeout` · `cost_cap_exceeded` · `kill_switch` · `cluster_locked` · `provider_error` · `json_parse` · `schema_validation` · `persist_conflict` · `permission_denied` · `feed_unreachable` · `scrape_empty` · `abort` · `unknown`

Anything not matching this list → `unknown` + full `error_message`.

### 3c. step_timings_ms map on pipeline_runs

Each completed run writes a cumulative map onto `pipeline_runs.step_timings_ms`:

```json
{
  "cluster_lock": 12,
  "source_fetch": 2340,
  "headline": 4100,
  "summary": 3800,
  "categorization": 3200,
  "body": 14500,
  "source_grounding": 6100,
  "plagiarism_check": 1800,
  "timeline": 5400,
  "quiz": 4200,
  "quiz_verification": 2100,
  "persist": 180,
  "total": 47732
}
```

Admin UI (Phase 4) plots this as a horizontal bar per-step. Missing keys = step didn't run (adult audience skips `audience_safety_check` + `kid_url_sanitizer`; kid audience runs the full 12).

### 3d. pipeline_costs rows

One row per LLM call (written by `call-model.ts` finally-block, already shipped). Task 10 adds three NON-LLM row types:

- `step='source_fetch'`: `cost_usd=0`, `latency_ms=actual`, `success=t/f`, `metadata={ bytes, scrape_mode: 'jina'|'cheerio' }`
- `step='cluster_lock'`: `cost_usd=0`, `latency_ms=actual`, `metadata={ acquired: true|false }`
- `step='persist'`: `cost_usd=0`, `latency_ms=actual`, `metadata={ articles: 1, sources: 4, timelines: 6, quizzes: 5 }`

Every row carries `pipeline_run_id` (FK), `audience`, `cluster_id` (when applicable), `article_id` (when applicable).

### 3e. Sentry breadcrumbs vs captures

- Breadcrumb per step entry (`Sentry.addBreadcrumb({ category: 'pipeline.step', message: step, level: 'info', data: { run_id, duration_ms } })`).
- Capture ONLY on terminal failure (try/catch at route boundary). Breadcrumbs attach automatically.
- DO NOT capture on every retry — the retry envelope in `call-model.ts` handles that silently unless exhausted.

---

## 4. Acquiring + releasing the cluster lock

`feed_clusters` does NOT have a `locked_by`/`locked_until` column in migration 114. **Task 11 adds migration 116** with:

```sql
alter table public.feed_clusters
  add column locked_by uuid references public.users(id) on delete set null,
  add column locked_until timestamptz,
  add column last_generation_run_id uuid references public.pipeline_runs(id) on delete set null;

create index feed_clusters_locked_until_idx on public.feed_clusters (locked_until) where locked_until is not null;

create or replace function public.claim_cluster_lock(p_cluster_id uuid, p_minutes integer default 10)
returns table(acquired boolean, locked_by uuid, locked_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_existing_until timestamptz;
  v_existing_by uuid;
begin
  select fc.locked_until, fc.locked_by
    into v_existing_until, v_existing_by
    from public.feed_clusters fc
   where fc.id = p_cluster_id
     for update;

  if v_existing_until is not null and v_existing_until > v_now then
    return query select false, v_existing_by, v_existing_until;
    return;
  end if;

  update public.feed_clusters
     set locked_by   = auth.uid(),
         locked_until = v_now + make_interval(mins => p_minutes),
         updated_at   = v_now
   where id = p_cluster_id;

  return query
    select true, auth.uid(), v_now + make_interval(mins => p_minutes);
end;
$$;

create or replace function public.release_cluster_lock(p_cluster_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feed_clusters
     set locked_by    = null,
         locked_until = null,
         updated_at   = now()
   where id = p_cluster_id
     and (locked_by = auth.uid() or auth.uid() in (select id from public.users where role in ('owner','admin')));
end;
$$;
```

(Final RPC spec locked during Task 11 planning; this is the draft.)

Route flow:
1. Call `claim_cluster_lock(cluster_id, 10)` via service client set to auth.uid() of caller (use `rpc('claim_cluster_lock', { p_cluster_id, p_minutes: 10 })` on the authed cookie-client).
2. If `acquired=false`, return 409 with `{ error: 'Cluster is being generated by another admin', locked_by, locked_until }`.
3. On success, proceed. ALWAYS call `release_cluster_lock(cluster_id)` in `finally` — even on failure. If the process dies mid-run (Vercel timeout), the 10-min TTL will auto-expire it.
4. Re-acquire across retries: Task 10 does NOT retry lock acquisition inside the route; admin gets 409 and can re-click.

---

## 5. Cost cap enforcement

Two caps enforced at separate layers:

| Cap | Setting key | Enforced where | Default |
| --- | --- | --- | --- |
| Per-run | `pipeline.per_run_cost_usd_cap` | inside `call-model.ts` finally-block cumulative | $0.50 |
| Per-day UTC | `pipeline.daily_cost_usd_cap` | checked once at route start via `pipeline_today_cost_usd()` RPC | $10.00 |

Soft alert: `pipeline.daily_cost_soft_alert_pct=50` — log a `WARN` (not an error) when daily running total crosses this %. Admin observability pane shows red/yellow/green.

**On cap exceeded mid-run:** the LLM call throws `CostCapExceededError` (from `web/src/lib/pipeline/errors.ts`). Route catch-block marks the run `status='failed'`, `error_type='cost_cap_exceeded'`, `error_message='Per-run cap exceeded at $X.XX'`, releases cluster lock, returns 402 Payment Required with `{ error: 'Pipeline cost cap exceeded', run_id, total_cost_usd }`.

**On daily cap exceeded at route start:** return 402 before doing any work. Rate-limit does not count this against the admin.

---

## 6. Kill switch handling

`settings.ai.ingest_enabled` (boolean text 'true'/'false') is the ingest switch. Phase 3 adds `settings.ai.generate_enabled` in migration 116 for generation. Separate switch because owner may want to pause generation without blocking ingestion.

**At route entry:** 60s-cached read. If `false`, return 503 `{ error: 'Generation disabled' }`. No lock acquired, no run row created.

**Mid-run kill (operator hits kill during active generation):** NOT enforced in Phase 3. The in-flight run completes naturally. Owner can abandon via `release_cluster_lock` and ignore the output. Task 20+ may add a run-level abort signal.

---

## 7. Scrape → generate flow inside Task 10

```
1. requirePermission('admin.pipeline.run_generate') → actor
2. Parse body: { cluster_id, audience: 'adult'|'kid', freeform_instructions?: string, provider?: 'anthropic'|'openai', model?: string }
3. Kill switch check → 503 on off
4. Daily cost cap check → 402 on exceeded
5. Rate limit check ('newsroom_generate' policy, 20/3600s) → 429 on limited
6. Load cluster + cluster discovery_items
   - feed_clusters row + its cluster_discovery_items list
   - audience must match cluster discovery_items audience (all adult OR all kid; mixed = 400)
7. Acquire cluster lock → 409 on contested
8. Create pipeline_runs row (status=running, pipeline_type='generate', cluster_id, audience, provider, model, freeform_instructions, triggered_by='manual', triggered_by_user=actor.id)
9. try {
     9a. For each discovery_item with raw_body IS NULL: invoke scrape-article; store into discovery_items.raw_body + metadata.scrape_mode
     9b. Build corpus: concatenate all raw_body with <source_article>…</source_article> wraps (THIS is where the wrap happens, not at ingest)
     9c. Run editorial-guide chain (canonical 12-step):
         - audience_safety_check (kid audience only — gate)
         - source_fetch (scrape any discovery_items missing raw_body)
         - parallel: headline, summary, categorization
         - body (consumes headline + summary + categorization + corpus)
         - source_grounding (consumes body + corpus for source attribution)
         - plagiarism_check (n-gram scan; rewrite via Haiku iff overlap >= rewrite_pct)
         - timeline (consumes body + corpus)
         - kid_url_sanitizer (kid audience only — strips/rewrites unsafe URLs in body)
         - quiz (consumes body)
         - quiz_verification (consumes quiz + body — re-asks model to confirm correctness)
     9d. Schema-validate each prompt's JSON output (Zod). On validation fail → throw SchemaValidationError.
     9e. Persist to articles/kid_articles + sources/kid_sources + timelines/kid_timelines + quizzes/kid_quizzes (Task 13)
     9f. Update discovery_items.state='generated' + discovery_items.article_id for all items in cluster
     9g. Update feed_clusters.primary_article_id + last_generation_run_id
   } catch (err) {
     mark run failed (error_type, error_message, error_stack, completed_at, duration_ms)
     Sentry.captureException(err) with breadcrumbs attached
   } finally {
     release_cluster_lock(cluster_id)
     update pipeline_runs (status='completed'|'failed', completed_at, duration_ms, total_cost_usd, items_processed, items_created, step_timings_ms, output_summary)
     record_admin_action({ action: 'newsroom.generate.run', targetTable: 'pipeline_runs', targetId: runId, newValue: { cluster_id, audience, article_id, total_cost_usd } })
   }
10. return NextResponse.json({ ok: true, run_id, article_id, total_cost_usd, duration_ms })
```

---

## 8. Prompt chain invariants (from editorial-guide.ts)

- Adult chain: 10 LLM calls (audience_safety_check + kid_url_sanitizer skipped).
- Kid chain: 12 LLM calls (audience_safety_check gate + kid_url_sanitizer post-body); shares the rest of the 12-step vocabulary; downstream persistence routes to `kid_articles` / `kid_sources` / `kid_timelines` / `kid_quizzes`.
- Each prompt has a sha256 baked into editorial-guide.ts TSDoc (tamper-evidence — Phase 1 Task 1).
- `prompt_fingerprint` on `pipeline_runs` and `pipeline_costs` = sha256 of the concatenated rendered prompts in this run (deterministic given the inputs). Enables cache invalidation reasoning.
- Schema-validate every output via Zod. Partial output (text that doesn't parse as JSON) → throw `SchemaValidationError` with the first 500 chars of output quoted.
- `<source_article>…</source_article>` tag wrap: applied at prompt-assembly in Task 10 (NOT at ingest). Escape closing tag in raw_body by replacing `</source_article>` with `</source_article_>` before wrapping.

---

## 9. Recovery procedures

### 9a. Stuck cluster lock

Symptom: Admin clicks "Generate" on cluster X, gets 409 "being generated by another admin", but you know no other admin is running. Lock was orphaned by a crashed run.

Fix: The lock auto-expires 10 min after acquisition. Wait, OR have an owner/admin call `POST /api/newsroom/clusters/:id/unlock` (Task 11) which calls `release_cluster_lock(cluster_id)`. Requires owner or admin role.

### 9b. Cost cap tripped mid-day

Symptom: Admin gets 402 "Pipeline cost cap exceeded" on any generate.

Fix: Owner bumps `pipeline.daily_cost_usd_cap` via admin settings UI. Cache TTL is 60s so change takes effect within a minute. (No UI yet — owner edits Supabase row directly until Phase 4.)

### 9c. Kill switch stuck on

Symptom: Admin gets 503 "Generation disabled" after owner thought they re-enabled it.

Fix: Check `settings.ai.generate_enabled` value via Supabase SQL editor. If it's 'false', update to 'true'. Cache clears in 60s, or admin can hit a nonexistent cache-bust endpoint (not yet built) to force.

### 9d. Orphaned pipeline_runs row

Symptom: `pipeline_runs` has `status='running'` but `started_at` is > 10 min ago.

Fix: Run this SQL manually:
```sql
update public.pipeline_runs
   set status='failed',
       completed_at=now(),
       duration_ms=extract(epoch from (now() - started_at))*1000,
       error_message='Orphaned run — manual cleanup',
       error_type='abort'
 where status='running'
   and started_at < now() - interval '10 minutes';
```

Automation cron for this ships in Tasks 20+.

### 9e. Partial persistence (article saved but quizzes failed)

Symptom: `articles` row exists, `quizzes` rows don't, `pipeline_runs.status='failed'`.

Fix: All persistence happens in a single DB transaction (Task 13). If ANY insert fails, all inserts rollback. A half-persisted article should NOT be possible. If you see one, file it as a P0 bug — transaction wrapping broke.

### 9f. Schema validation failure (LLM returned malformed JSON)

Symptom: `pipeline_runs.status='failed'`, `error_type='schema_validation'`, `error_message` contains the first 500 chars of the raw LLM output.

Fix: Re-click Generate. The retry envelope in call-model.ts handles transient JSON errors internally (3 retries with backoff `[1000, 4000, 15000]ms ± 20% jitter`). If it failed AFTER retries, the model consistently returned bad JSON — either change provider/model in the generate request, or fix the prompt in editorial-guide.ts.

---

## 10. Admin operational checklist (what good looks like)

- `pipeline_runs`: most recent row status=`completed`, `duration_ms < 60000` for a typical 3-article cluster.
- `pipeline_costs`: rows linked to the run, each LLM step has `success=true`, total `cost_usd < 0.50` per run.
- `feed_clusters.locked_until`: `null` on all clusters unless one is actively generating.
- `discovery_items.state`: `pending` for fresh, `generated` for consumed, `skipped` for admin-dismissed (manual action, not orchestrator).
- `settings.ai.generate_enabled`: `true` in normal operation.
- `settings.pipeline.daily_cost_usd_cap`: $10 or higher. Observed spend via `pipeline_today_cost_usd()` RPC.

---

## 11. Things NOT to do

- Don't log the raw LLM response body at INFO level. It can be 15KB per call × 10 calls × 100 runs/day = 15MB of log noise. WARN/ERROR only.
- Don't pass user-provided `freeform_instructions` unsanitized into the system prompt — ALWAYS wrap in `<user_instructions>…</user_instructions>` with the closing-tag escape, same as source articles.
- Don't bypass the cluster lock for "emergency" regenerations. Use `release_cluster_lock` then try again.
- Don't retry a schema_validation failure automatically more than 3 times — infinite retry loops on malformed JSON = runaway cost.
- Don't insert a `kid_articles` row with an `adult_articles.id` FK anywhere — kid tables are completely parallel, no cross-foreign-keys.
- Don't forget to update `discovery_items.state='generated'` after successful persistence — otherwise the cluster appears fresh on the next refresh.
- Don't write generated HTML to `articles.body_html` without sanitization. The LLM can emit arbitrary HTML via markdown fenced blocks. Use the existing `sanitizeHtml` utility.

---

## 12. Versioning this runbook

Each Phase 3 task that changes operational behavior appends a changelog entry at the bottom of this file:

```
### <YYYY-MM-DD> — Task N (<commit sha>)
- <change summary>
```

Start of changelog:

### 2026-04-22 — Task 10 planning
- Runbook created. Initial draft pre-Task-10 Agent 1+2 dispatch.

### 2026-04-22 — Task 11 (`7fef1ad`)
- Migration 116 cluster locks shipped: `feed_clusters.locked_by/locked_at/last_generation_run_id/generation_state` columns + `claim_cluster_lock(cluster_id, locked_by, ttl_sec=600)` + `release_cluster_lock(cluster_id, locked_by)` RPCs (explicit `p_locked_by` since `auth.uid()` is NULL under service role). Perms `admin.pipeline.run_generate` + `admin.pipeline.release_cluster_lock` seeded; rate-limit `newsroom_cluster_unlock` (10/60s) seeded; setting `pipeline.default_category_id` seeded. Unique partial indexes on `articles(cluster_id)` and `kid_articles(cluster_id)` (belt-and-suspenders vs lock).
- `POST /api/admin/newsroom/clusters/:id/unlock` shipped — admin override via `release_cluster_lock(id, NULL)` + `record_admin_action` audit.

### 2026-04-22 — Task 16 (`7ed6b2c`)
- Migration 120 adds `pipeline_runs.error_type text NULL` column + backfills from legacy `output_summary->>'error_type'` and `->>'final_error_type'` keys. Generate route now dual-writes the real column AND keeps the legacy `output_summary.final_error_type` stash for one cycle (Task 16 follow-up will remove the stash). Critical deploy ordering: migration 120 MUST apply BEFORE the generate route ships, otherwise supabase-js silently no-ops on column-not-found and `pipeline_runs` rows stick at `status='running'`.

### 2026-04-22 — Task 17 (`0361d16`)
- `POST /api/admin/pipeline/runs/:id/retry` shipped. SELECTs failed run, gates on `pipeline_type='generate'` + `status='failed'` + cluster_id/audience present, internal same-origin fetch to `/api/admin/pipeline/generate` with `cookie` pass-through (generate re-auths via `requirePermission` + `cookies()`), fetch wrapped in try/catch (Sentry + 500 'Retry dispatch failed' on dispatch failure). Audit via `record_admin_action({action:'pipeline_retry', newValue:{new_run_id, original_error_type}})` only when generate returns ok + new_run_id. `originalErrorType` extracted from migration 120's first-class column with legacy `output_summary` fallback.

### 2026-04-22 — Task 18 (`31275c6`)
- `POST /api/admin/pipeline/runs/:id/cancel` shipped. SOFT cancel design: marks `pipeline_runs.status='failed', error_type='abort', error_message='Cancelled by admin'` with `.eq('status','running')` re-check to avoid stomping a finally that beat us. Best-effort `release_cluster_lock(p_cluster_id, p_locked_by=run_id)` (idempotent per migration 116) + best-effort discovery items reset from `state='generating'` → `'clustered'`. `output_summary` writes `{cancelled_by_admin:true, error_type:'abort'}` (distinctive marker for log review). **Cancel does NOT write `total_cost_usd`** — the running lambda's finally is the sole writer of that column; cancel-after-finally is a no-op (re-check filters 0 rows), cancel-before-finally gets overwritten by the lambda's own non-status-gated finally update. Mid-step worker abort is out of scope. Audit via `record_admin_action({action:'pipeline_cancel', newValue:{cluster_id, audience, soft_cancel:true, was_status, was_started_at}})`.

### 2026-04-22 — Task 19 (`9b9a32e`)
- `GET /api/cron/pipeline-cleanup` shipped (10th vercel.json cron, `*/5 * * * *`). Three idempotent best-effort sweeps: (1) orphan **runs** — `pipeline_runs.status='running' AND started_at < now()-10min` → `status='failed', error_type='abort', error_message='Orphaned run — auto-cleanup'`; (2) orphan **discovery items** — `discovery_items` + `kid_discovery_items` rows in `state='generating' AND updated_at < now()-10min` → `state='clustered'` so the next ingest can re-queue (without this sweep, items stay stuck forever when generate's lambda dies before its finally runs); (3) orphan **locks** — `feed_clusters` rows with `locked_until < now()` → `locked_by/locked_at/generation_state` NULL (double-insurance against `release_cluster_lock` failures). All three sweeps wrapped in independent try/catch; response always 200 with per-sweep generic error codes (Vercel cron must not retry on 5xx).
