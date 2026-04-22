# F7 Smoke Test Runbook

**Purpose:** end-to-end click-through verification of the F7 AI pipeline once the Vercel deploy lands green. Run as owner; PM cannot click-through browsers.

**Pre-condition:** Vercel deploy of commit ≥ `1cdbadd` is Ready in production.

---

## Phase 0 — Sanity (5 min)

1. Open https://www.veritypost.com/admin
2. Confirm "Content Pipeline" section now shows 4 NEW links: **Newsroom**, **Pipeline Runs**, **Pipeline Costs**, **Pipeline Settings** (alongside the relabeled "(legacy)" entries)
3. If you don't see them → Vercel didn't actually deploy current main; see "Deploy not landed" troubleshooting below

---

## Phase 1 — Wire production prerequisites (10 min)

### 1a. Verify env vars in Vercel

Project Settings → Environment Variables. Confirm Production scope has:

| Variable | Required for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All admin pages |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All admin pages |
| `SUPABASE_SERVICE_ROLE_KEY` | All API routes (service writes) |
| `ANTHROPIC_API_KEY` | Generate route (LLM calls) |
| `OPENAI_API_KEY` | Generate route IF picking OpenAI in modal |
| `CRON_SECRET` | Cron route (auth) |
| `SENTRY_DSN` + `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` | Build + error reporting |

If any missing → add → redeploy.

### 1b. Flip kill switches ON

Navigate `/admin/pipeline/settings`. Toggle ON:
- `ai.ingest_enabled` → **true**
- `ai.adult_generation_enabled` → **true**
- `ai.kid_generation_enabled` → **true** (only if testing kid path)

Click Save on each row.

### 1c. Verify daily cost cap is reasonable

Same page, Cost Caps section. Confirm:
- `pipeline.daily_cost_usd_cap` ≥ $10 (default)
- `pipeline.per_run_cost_usd_cap` ≥ $0.50 (default)

### 1d. Confirm at least 1 active feed

Navigate `/admin/feeds`. Confirm at least 1 row has:
- `is_active=true`
- `audience='adult'` (or `'kid'`)
- A real RSS URL Vercel can reach

---

## Phase 2 — End-to-end pipeline test (15-20 min)

### 2a. Trigger ingest + clustering

Navigate `/admin/newsroom`. Click **"Refresh feeds"**.

**Expected:** within 60-90 sec, cluster cards appear on the page. Each card has title + summary + Generate / Unlock / View buttons.

**If "No active clusters" stays:**
- Open `/admin/pipeline/runs` — look at the most recent ingest run. Status should be Completed; click into detail to see `output_summary.clusteringAdult`. If `clustersCreated: 0`, items are likely singletons (only 1 outlet covered each story) — wait for more feed activity OR click Refresh again later.
- If status is Failed → check `error_type`; common: rate limit (429 — wait 10 min), kill switch off (503 — Phase 1b), DB error (500 — check Vercel logs).

### 2b. Generate an article

Click **"Generate"** on any cluster card. The modal opens.

- Pick audience (adult or kid)
- Skip freeform instructions for first run
- Click **"Start generation"**

**Expected:** modal stays open, shows live progress through 12 steps:
1. audience_safety_check (Haiku)
2. source_fetch (URL scrape)
3. headline + summary + categorization (Sonnet, parallel)
4. body (Sonnet — the long write)
5. source_grounding (Haiku)
6. plagiarism_check (n-gram, may rewrite via Haiku)
7. timeline (Sonnet)
8. kid_url_sanitizer (kid only, Haiku)
9. quiz (Sonnet)
10. quiz_verification (Haiku)
11. persist (DB write)

Total time: 2-4 min. Cost: ~$0.15-0.40 per run.

**On completion:** modal redirects to `/admin/articles/:id/review`.

**If modal hangs or shows error:**
- 503 "Generation disabled" → Phase 1b kill switch
- 502 "provider error" → API key missing/invalid
- 402 "cost cap" → bump cap in settings
- 409 "cluster locked" → another run in progress; wait or Unlock
- Modal shows error mid-stream → check `/admin/pipeline/runs/:id` for the run row + which step failed

### 2c. Review draft

On `/admin/articles/:id/review` you should see:
- Title + subtitle + body_html preview (rendered HTML, not markdown)
- Sources list with outlets + URLs
- Timeline events (date + label + body)
- Quiz with 5 questions; correct answer highlighted (admin-only view)
- Action buttons: **Edit / Regenerate / Publish / Reject**

Click **"Edit"** to fix anything (textarea for body markdown, repeatable inline editors for sources/timeline/quiz). Save with the button at the bottom.

### 2d. Publish

Click **"Publish"** on the review page. Sets `status='published', moderation_status='approved', published_at=now()`.

**Verify in reader:** open `/` (home feed) — the new article should appear at the top. Click into it; quiz should work; comments should be quiz-gated.

---

## Phase 3 — Observability + cost (5 min)

### 3a. Run detail

Navigate `/admin/pipeline/runs`. Find the run you just kicked off — should be at top. Click row → `/admin/pipeline/runs/:id`.

**Expected:** full breakdown — header with status/audience/model badges, totals (cost, tokens, cache hit ratio), CSS step-timings bar chart, per-step detail table (model, tokens, cost, latency, success). Input params + output summary + freeform instructions + prompt fingerprint blocks.

If `status='failed'` AND `pipeline_type='generate'`: Retry button visible. If `status='running'`: Cancel button visible.

### 3b. Cost dashboard

Navigate `/admin/pipeline/costs`.

**Expected:** today-vs-cap green/yellow/red indicator + per-model breakdown (24h/7d/30d) + 30-day daily spend bar chart + top-10 cost outliers + read-only settings preview.

After your test run, today's spend should show ~$0.15-0.40.

---

## Phase 4 — Cancel + retry (5 min)

### 4a. Trigger cancel

Click Generate on another cluster. While the modal is showing live progress (in the body or timeline step), click **"Cancel run"**.

**Expected:**
- Modal shows "Cancelled by admin"
- `/admin/pipeline/runs` shows the run as `status='failed', error_type='abort'`
- Cluster on `/admin/newsroom` is unlocked again (no Locked badge)

Note the worker may complete the current LLM step before exiting — soft cancel design.

### 4b. Retry

On the failed run's detail page, click **"Retry"**.

**Expected:** new run kicks off. Navigates to the new run's detail page. Polls live.

---

## Phase 5 — Cron + cleanup (background, no manual action)

The orphan-cleanup cron runs daily at 6 AM UTC (`/api/cron/pipeline-cleanup`). It does 3 sweeps:
1. Mark `pipeline_runs` stuck in `running` >10 min as failed
2. Reset `discovery_items` stuck in `generating` >10 min back to `clustered`
3. Clear `feed_clusters` locks older than 15 min

You should see the run logged in Vercel cron logs each morning. Output JSON shows `orphan_runs_cleaned`, `orphan_items_cleaned`, `orphan_locks_cleaned` counters.

If you upgrade to Vercel Pro, change the schedule in `web/vercel.json` from `0 6 * * *` to `*/5 * * * *` to get prompt orphan recovery.

---

## Deploy not landed troubleshooting

If `/admin/newsroom` 404s OR admin hub doesn't show new links:

1. Check Vercel Deployments tab — what's the SHA of the current Ready deploy?
2. If SHA < `1cdbadd` (e.g., `271e3d7`): the auto-deploy is broken; manually redeploy current main from the dashboard
3. If SHA shows Building: wait 2-4 min for build to complete
4. If SHA shows Error: paste the build log; PM diagnoses

---

## Smoke test pass criteria

- ✅ `/admin/newsroom` renders without error
- ✅ Refresh feeds produces at least 1 cluster card
- ✅ Generate completes without error within 4 min
- ✅ Review page renders the generated article cleanly
- ✅ Publish action succeeds + article appears in `/`
- ✅ Run detail shows step timings + cost breakdown
- ✅ Cost dashboard shows today's spend
- ✅ Cancel + Retry both succeed
- ✅ Cron logs the next morning show 0 orphans (or correct counters if any)

---

## After smoke test passes

PM follow-ups become priority:
- Phase 5 product direction (running stories vs flat articles)
- Reader UX cluster (F1-F4 from Future Projects)
- Pre-launch list cleanup in `Current Projects/FIX_SESSION_1.md`

---

End of runbook.
