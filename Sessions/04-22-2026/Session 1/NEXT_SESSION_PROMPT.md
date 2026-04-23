# Next-session handoff — Newsroom redesign SHIPPED, click-through verification + xlsx reconcile pending

Paste this into the first message of your next Claude Code session.

---

## STATE OF THE WORLD (2026-04-22 end-of-session)

**F7 status — ALL PHASES COMPLETE (Tasks 1-30 of 30 shipped) + Phase 5 Newsroom redesign LIVE:**

| Phase | Scope | State |
|---|---|---|
| Phase 1 (Foundation) | Tasks 1-4 | LIVE |
| Phase 2 (Ingest) | Tasks 5-9 | LIVE |
| Phase 3 (Orchestrator) | Tasks 10-19 | LIVE |
| Phase 4 (Admin UI) | Tasks 20-30 | LIVE |
| Phase 5 (Newsroom redesign) | b269e17 | LIVE — single-page operator workspace, audience tabs, dynamic taxonomy, prompt presets, cluster mutations, 14d auto-archive |

**Migrations — all applied live in `fyiwulqphgmoqullmrfn`:**
- 112 (kids_waitlist), 114 (F7 foundation), 116 (cluster locks + perms), 118 (persist_generated_article RPC), 120 (pipeline_runs.error_type), 122 (cluster_id FKs + asymmetric ON DELETE fix), 124 (kids_summary RPC branch drop), **126 (Newsroom redesign — feed_clusters audience + archive/dismiss + ai_prompt_presets table + 6 cluster mutation RPCs + 3 perms wired to owner/admin/editor sets)**

**types:gen ran post-126.** `web/src/types/database.ts` reflects full live schema including `ai_prompt_presets`, all new RPCs, all new feed_clusters columns.

---

## THE NEW NEWSROOM (read this — it's the operator surface)

`/admin/newsroom` is now a **single-page operator workspace**. The owner asked for "a better version of the original verity-post-pipeline-snapshot" — collapsed across 4 prior pages into one. Everything related to running the AI pipeline lives here:

**Top to bottom:**
1. **Audience tab toggle** — Adult / Kid (URL-persisted via `?audience=...`)
2. **Glance bar** — today's spend / runs 24h / kill switch state (toggle inline) / feed health, with deep-links to `/admin/pipeline/{costs,runs,settings}` + `/admin/feeds`
3. **Filter row** — dynamic category dropdown + subcategory (filtered by `categories.parent_id`) + outlet + 6h/24h/72h/7d/all time + debounced search
4. **Prompt picker** — Default editorial / Preset (DB-driven via `ai_prompt_presets`) / Custom textarea
5. **Provider/model picker** — existing `PipelineRunPicker` retained
6. **Refresh feeds button** — audience-scoped POST to `/api/newsroom/ingest/run`
7. **Cluster cards** — title + summary + each source article inline (outlet + headline + lede + scraped time + URL link) + per-source Move-out/Move-to controls + predicted cost preview + **two inline Generate buttons** (Generate {audience} primary + cross-audience hatch "Generate kids version" only on adult tab) + Merge dropdown / Split / Dismiss inline + "Show dismissed" toggle
8. **Recent runs strip** at bottom — last 10 with retry + view-all link

**Edit affordances on cards** (per owner: "auto-generate clusters, but if I notice articles can be moved or groups combined I should have the ability"):
- Move discovery item out of cluster, or to a different cluster (audience-symmetric)
- Merge two clusters (target dropdown — soft-archives source via `archived_reason='merged_into:<uuid>'`)
- Split cluster into a new sibling (multi-select source rows + Split button)
- Dismiss (soft hide via `dismissed_at`; "Show dismissed" toggle restores view)

**Cross-audience hatch** is one-way: adult cluster → kid run via `source_urls` override (kid pipeline reuses adult source URLs, runs through kid prompt scaffolding + `audience_safety_check`). Backend rejects 422 if attempted in any other shape.

---

## NEW ADMIN PAGES

| Path | Purpose |
|---|---|
| `/admin/newsroom` | Operator workspace (rewritten — see above) |
| `/admin/categories` | Tree editor — dynamic taxonomy CRUD with parent reparent + cycle prevention + soft-delete + restore |
| `/admin/prompt-presets` | Prompt library editor — All/Adult/Kid/Both tabs, name+body+audience+category_id+sort_order, archive→restore via PATCH |
| `/admin/pipeline/cleanup` | Cron sweep history (`webhook_log` source) + "Run cleanup now" manual trigger (rate-limited 6/3600s) |

**Story Manager + Kids Story Manager pages REMOVED from admin hub.** Stage 0 recon verdict: snapshot-era 1258-line pages, REWRITE >400 LOC needed for F7 schema. F7-native `/admin/articles/[id]/{review,edit}` is the canonical editor — accessed via `/admin/articles` list.

---

## NEW PERMISSIONS (canonical naming)

Following established `admin.pipeline.<noun>.<verb>` convention:
- `admin.pipeline.clusters.manage` (move/merge/split/archive/dismiss)
- `admin.pipeline.presets.manage` (CRUD prompt presets)
- `admin.pipeline.categories.manage` (CRUD taxonomy)

All wired into `owner` + `admin` + `editor` permission_sets via migration 126 step 11. **xlsx reconcile pending** — owner must add these 3 keys to `/Users/veritypost/Desktop/verity post/permissions.xlsx` before next `scripts/import-permissions.js --apply` runs (otherwise sync would drop the new wirings).

---

## READ ORDER (do not skip)

1. `Reference/STATUS.md` — live narrative
2. `Current Projects/F7-DECISIONS-LOCKED.md` — the 8 locked decisions + invariants
3. `Sessions/04-22-2026/Session 1/COMPLETED_TASKS_2026-04-22.md` — per-commit SHIPPED blocks (b269e17 is at top — Newsroom redesign)
4. `Sessions/04-22-2026/Session 1/F7_SMOKE_TEST_RUNBOOK.md` — original F7 smoke test (still valid for the pipeline core)
5. `Current Projects/F7-PHASE-3-RUNBOOK.md` — 12-step canonical vocab + observability

---

## OPEN FOLLOW-UPS

**Owner action items (cannot be done by agents):**
1. **Click-through smoke test** of new Newsroom workspace + 3 new admin pages on Vercel deploy. Verify:
   - Adult/Kid tab toggle persists in URL + filters cluster list correctly
   - Refresh feeds button (per-audience) actually polls only that audience's feeds
   - Generate adult / Generate kids buttons open modal with audience already decided
   - Generate kids version on adult cluster card forwards source URLs (cross-audience hatch)
   - Move/Merge/Split/Dismiss inline controls work + record audit log
   - `/admin/categories` add/edit/move/archive cycle prevention works
   - `/admin/prompt-presets` create + select preset in Newsroom prompt picker
   - `/admin/pipeline/cleanup` shows recent cron runs + manual trigger works
2. **xlsx reconcile** — add the 3 new permission keys to `permissions.xlsx`. Without this, the next `import-permissions.js --apply` would drop the migration 126 step-11 wirings.
3. **Vercel Pro upgrade** — restore per-minute cron schedule in `web/vercel.json` for prompt orphan recovery (currently daily at 6 AM UTC due to Hobby tier limit).

**Code follow-ups (open, low priority):**
- `/admin/feeds` — audience editing post-create not supported (PATCH `/api/admin/feeds/[id]/route.ts` doesn't accept `audience`); flagged by Stream 5. If owner mis-tags a feed, today they delete + re-add. Cheap to add when owner asks.
- Existing `/admin/feeds/page.tsx` `react-hooks/exhaustive-deps` lint warning predates this session; not a blocker.
- Per-sweep cron counters (orphan_runs/items/locks/clusters_archived) only persist via `webhook_log` cron metadata + per-trigger response; `Sessions/...COMPLETED_TASKS_2026-04-22.md b269e17` notes a possible `cleanup_runs` table if durable per-sweep history matters.
- RPC concurrency comment: `merge_clusters` + `split_cluster` lock the source cluster row but NOT the discovery_items being moved; concurrent ingest writes could theoretically race for off-by-N counts. Low real risk; flagged in adversary report for documentation only.
- Snapshot's `add-to-timeline` mini-pipeline (running stories — `timeline_entries` as first-class content units) is **deliberately NOT ported**. F7 builds flat articles per generate run. If owner wants running stories, that's a separate Phase 6 architectural task. Surfaced 2026-04-22 from snapshot inspection.
- Legacy `/admin/pipeline/page.tsx` shells were deleted in commit `081c483` (last session).

---

## THE PARALLEL-AGENT PATTERN (validated this session)

**6-stream parallel build:** Streams 1-6 dispatched simultaneously against locked migration 126 spec — clustering writes audience, categories editor, presets editor, 5 cluster mutation routes, feeds tabs, Newsroom rewrite. Streams 7-8 ran in second wave (cron sweep + cleanup view; source_urls plumbing + cluster detail redirect). Final independent adversary verdict: 8/10 GREEN, 2 YELLOW with applied fixes.

**Migration paste cycle bugs caught + fixed:**
- `r.slug` → `r.name` (RLS join)
- `label`/`category_key` → `display_name`/`category` (permissions table column names)
- `pipeline.manage_*` → `admin.pipeline.<noun>.<verb>` (canonical key prefix)
- `touch_updated_at` → `update_updated_at_column` (live trigger function)
- `permission_sets.name` → `.key` (live column name)

These are the kind of bugs the agents can't catch from spec alone — only live MCP verification finds them. **Always MCP-verify schema before pasting any DDL.**

---

## START

Newsroom redesign is complete + verified + pushed. Next session is freeform — read the docs above, say "Ready," wait for direction. Likely candidates:

1. **Click-through smoke test** of Newsroom + 3 new admin pages (owner-only — agents can't open browser)
2. **xlsx reconcile** + run `scripts/import-permissions.js --dry-run` to verify 3 new keys before `--apply`
3. **Phase 6 — running stories architecture** (snapshot's `timeline_entries` + `add-to-timeline` mini-pipeline) — biggest open product question. Substantial new work. Owner picks priority.
4. **Phase 6 — reader UX cluster** (F1/F2/F3/F4 from Future Projects)
5. **Pre-launch blockers** in `Current Projects/FIX_SESSION_1.md` (Apple Developer account, AdSense + ads.txt, Stripe live audit, Sentry activation, CSP enforce flip, HIBP, quiz content)
6. **Vercel Pro upgrade** — restore per-minute cron schedule
