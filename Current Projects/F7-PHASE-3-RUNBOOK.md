# F7 Phase 3 — Orchestrator Runbook

Operational guide for the Verity Post AI pipeline orchestrator. Read this BEFORE debugging a failed run or onboarding a new agent to Phase 3 code.

Scope: Task 10 (`/api/newsroom/generate`) through Task 13 (persistence helper). Tasks 14-19 (publish, review, surrounding flows) ship next session and will be appended to this runbook.

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
  "tag": "newsroom.generate.prompt:agent_3_writer",
  "run_id": "...",
  "cluster_id": "...",
  "audience": "adult" | "kid",
  "step": "agent_3_writer",
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

`cluster_lock` · `cluster_lock_contested` · `kill_switch_check` · `cost_cap_check` · `scrape` · `scrape_fallback` · `agent_1_research` · `agent_2_research` · `agent_3_writer` · `agent_4_editor` · `agent_5_sources` · `agent_6_timeline` · `agent_7_quiz` · `agent_8_headline` · `agent_9_kids_summary` · `agent_10_fact_check` · `json_parse` · `schema_validation` · `persist:articles` · `persist:sources` · `persist:timelines` · `persist:quizzes` · `persist:cluster_link` · `cluster_unlock` · `run_complete` · `run_failed`

(Final list reconciled against editorial-guide.ts Task 1 exports during Task 10 planning.)

### 3b. error_type vocabulary (use these literal strings)

`rate_limit` · `timeout` · `cost_cap_exceeded` · `kill_switch` · `cluster_locked` · `provider_error` · `json_parse` · `schema_validation` · `persist_conflict` · `permission_denied` · `feed_unreachable` · `scrape_empty` · `abort` · `unknown`

Anything not matching this list → `unknown` + full `error_message`.

### 3c. step_timings_ms map on pipeline_runs

Each completed run writes a cumulative map onto `pipeline_runs.step_timings_ms`:

```json
{
  "cluster_lock": 12,
  "scrape": 2340,
  "agent_1_research": 8400,
  "agent_2_research": 8210,
  "agent_3_writer": 14500,
  "agent_4_editor": 6100,
  "persist": 180,
  "total": 39742
}
```

Admin UI (Phase 4) plots this as a horizontal bar per-step. Missing keys = step didn't run (kid audience skips `agent_9_kids_summary`? No — kid audience runs a DIFFERENT prompt chain; step names still apply).

### 3d. pipeline_costs rows

One row per LLM call (written by `call-model.ts` finally-block, already shipped). Task 10 adds three NON-LLM row types:

- `step='scrape'`: `cost_usd=0`, `latency_ms=actual`, `success=t/f`, `metadata={ bytes, scrape_mode: 'jina'|'cheerio' }`
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
     9c. Run editorial-guide chain:
         - Agent 1 research (Anthropic or OpenAI by model param)
         - Agent 2 research (parallel via Promise.all if model supports, else serial)
         - Agent 3 writer (consumes Agent 1+2 outputs)
         - Agent 4 editor (consumes Agent 3 output)
         - Agent 5 sources (consumes Agent 4 output + corpus for source attribution)
         - Agent 6 timeline (consumes Agent 4 output + corpus)
         - Agent 7 quiz (consumes Agent 4 output)
         - Agent 8 headline (consumes Agent 4 output)
         - Agent 9 kids summary — SKIPPED for kid audience (kid prompt chain uses a different Agent 9 that rewrites for grade level)
         - Agent 10 fact check (consumes Agent 4 output + corpus)
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

- Adult chain: 10 prompts total (agent_1 through agent_10).
- Kid chain: 10 prompts total but agent_9 uses the kids-summary variant; everything else is shared.
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
