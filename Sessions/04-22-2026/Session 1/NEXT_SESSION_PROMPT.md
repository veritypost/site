# Next-session handoff — Phase 4 Tasks 21-30 (admin UI remainder)

Paste this into the first message of your next Claude Code session.

---

## STATE OF THE WORLD (2026-04-22 end-of-session)

**F7 status:**

| Phase | Scope | State |
|---|---|---|
| Phase 1 (Foundation) | Tasks 1-4 | ✅ LIVE |
| Phase 2 (Ingest) | Tasks 5-9 | ✅ LIVE |
| Phase 3 (Orchestrator) | Tasks 10-19 | ✅ LIVE |
| Phase 4 (Admin UI) | Task 20 | ✅ LIVE — Newsroom home page |
| Phase 4 remaining | Tasks 21-30 | ⏳ NEXT |

**Migrations — all applied live in `fyiwulqphgmoqullmrfn`:**
- 112 (kids_waitlist), 114 (F7 foundation), 116 (cluster locks + perms), 118 (persist_generated_article RPC), 120 (pipeline_runs.error_type), 122 (cluster_id FKs + asymmetric ON DELETE fix), 124 (kids_summary RPC branch drop)

**types:gen ran** post-apply. `web/src/types/database.ts` reflects full live schema.

**Clustering now wired end-to-end** (commit `238045b`) — ingest calls `preCluster` + `findBestMatch` per audience, writes `feed_clusters` rows + sets `discovery_items.cluster_id` + transitions `state='clustered'`. Pipeline reachable through normal flow.

---

## READ ORDER (do not skip)

1. `Reference/STATUS.md` — live narrative
2. `Current Projects/F7-DECISIONS-LOCKED.md` — the 8 locked decisions + invariants (every agent reads this)
3. `Sessions/04-22-2026/Session 1/MASTER_CLEANUP_PLAN.md` — what shipped this session + known follow-ups
4. `Sessions/04-22-2026/Session 1/COMPLETED_TASKS_2026-04-22.md` — per-task SHIPPED blocks
5. `Current Projects/F7-PHASE-3-RUNBOOK.md` — 12-step canonical vocab + observability
6. `Sessions/04-22-2026/Session 1/_superseded/` — archived prior-session prompts (reference only)
7. `Sessions/04-22-2026/Session 1/_facts-archive/` — PM FACTS sheets for Tasks 14-20 (reference only)

---

## PHASE 4 REMAINING — 9 TASKS

Per the Phase 4 handoff originally in the superseded prompt. Brief sketches:

- **Task 21** — `/admin/newsroom/clusters/:id` cluster detail page. Shows cluster's discovery_items list with add/remove, generation history, Generate button → POST `/api/admin/pipeline/generate`.
- **Task 22** — generation modal. Progress via polling `/api/admin/pipeline/runs/:id` every 2s. Step timings bar. Redirect to article review on completion. Replaces Task 20's inline Generate buttons.
- **Task 23** — article draft review page `/admin/articles/:id/review`. Shows title, subtitle, body_html preview, sources, timeline, quiz. Edit / Regenerate / Publish / Reject.
- **Task 24** — article edit page `/admin/articles/:id/edit`. Rich-text body editor. Inline sources/timeline/quiz editors. Save via new PATCH `/api/admin/articles/:id` route.
- **Task 25** — publish flow. `status='published', moderation_status='approved', published_at=now()`. Schedule-publish option. Reject: `status='archived'` + reason.
- **Task 26** — observability dashboard `/admin/pipeline/runs`. Paginated list, filters (status, audience, date range). Row-click → detail.
- **Task 27** — run detail view `/admin/pipeline/runs/:id`. Full pipeline_runs row + pipeline_costs children. Step timings chart. Prompt fingerprint. Retry/Cancel buttons.
- **Task 28** — cost tracker dashboard `/admin/pipeline/costs`. Today vs daily cap. Per-model breakdown. 30-day chart. Per-run outliers.
- **Task 29** — settings UI `/admin/pipeline/settings`. Kill-switch toggles + cost cap sliders + default_category_id dropdown. Save → PATCH `/api/admin/settings/pipeline`.
- **Task 30** — manual ingest button. Already on Task 20 header; verify.

**Recommended session split:**
- Session 2: Tasks 21-25 (per-cluster flow)
- Session 3: Tasks 26-30 (observability + settings)

---

## KNOWN FOLLOW-UPS (open)

- **F2 follow-up** — in `web/src/lib/pipeline/plagiarism-check.ts`, the rewrite LLM call doesn't yet receive Layer 1 prompt overrides. Minor; wire when touching the file for another reason.
- **E2** — `web/src/lib/pipeline/redact.ts` (Phase 1 pre-flight item #6) not yet built. Wrap `Sentry.captureException` payloads with a PII scrubber. Add as a Phase 4 task.
- **View/Generate nav targets** in Task 20 newsroom page point at `/admin/newsroom/clusters/:id` and `/admin/pipeline/runs/:id`. Both currently 404. Task 21 + Task 27 resolve them.
- Untracked `Future Projects/verity-living-edition.html` in the working tree — unrelated to F7, not committed.

---

## THE 3-AGENT FLOW (established this session)

For every non-trivial Phase 4 task:
1. **PM builds FACTS_taskN.md** up front via MCP queries + file reads. Ground truth sheet. Do NOT skip.
2. **Investigator agent** — structured claim table, every row cited file:line or MCP query. No prose.
3. **Adversary agent** — fixed rubric (auth bypass, race, error-type routing, downstream mutation, idempotency, edge cases, FACTS drift, scope creep). RED/YELLOW/GREEN verdict.
4. **Implementer agent** — feeds corrected spec verbatim + MUST-NOT-TOUCH fence.
5. **PM self-verifies** deterministically — tsc, lint, diff read, grep banned strings.

Dead casts + types: after every migration apply, `cd web && npm run types:gen` and remove any now-obsolete `as never` / `as unknown as` casts.

---

## START

Read the 7 docs above. Say "Ready." Wait for direction.

When user says start → pick the next task from the Phase 4 list + run the 3-agent flow.
