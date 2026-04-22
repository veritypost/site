# Next-session handoff — F7 COMPLETE / freeform Phase 5

Paste this into the first message of your next Claude Code session.

---

## STATE OF THE WORLD (2026-04-22 end-of-session)

**F7 status — ALL PHASES COMPLETE (Tasks 1-30 of 30 shipped):**

| Phase | Scope | State |
|---|---|---|
| Phase 1 (Foundation) | Tasks 1-4 | ✅ LIVE |
| Phase 2 (Ingest) | Tasks 5-9 | ✅ LIVE |
| Phase 3 (Orchestrator) | Tasks 10-19 | ✅ LIVE |
| Phase 4 (Admin UI) | Tasks 20-30 | ✅ LIVE — full admin surface for the AI pipeline |

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

## PHASE 4 — ALL SHIPPED (no work remaining in F7)

| Task | What | SHA |
|---|---|---|
| 20 | `/admin/newsroom` home — cluster grid | `6938c8c` |
| 21 | `/admin/newsroom/clusters/:id` cluster detail | `2d63621` |
| 22 | Generation modal (`components/admin/GenerationModal.tsx`) | `b250695` |
| 23 | `/admin/articles/:id/review` | `1f19e42` |
| 24 | `/admin/articles/:id/edit` | `1f19e42` |
| 25 | Publish/reject (PATCH on shared endpoint) | `1f19e42` |
| 26 | `/admin/pipeline/runs` observability dashboard | `d366911` |
| 27 | `/admin/pipeline/runs/:id` run detail | `a53a260` |
| 28 | `/admin/pipeline/costs` cost tracker dashboard | `16822db` |
| 29 | `/admin/pipeline/settings` settings UI | `f5be651` |
| 30 | Manual ingest button (covered by Task 20 Refresh feeds) | n/a — already on Task 20 |

Pipeline is fully reachable end-to-end through normal admin flow:
1. Admin opens `/admin/newsroom`
2. Clicks Refresh feeds → ingest + cluster runs → cluster cards appear
3. Clicks View on a card → cluster detail page with discovery items + run history
4. Clicks Generate → modal opens with audience picker + freeform instructions → progress polled live
5. On completion → article review page → Edit / Regenerate / Publish / Reject
6. Publish → article goes to `status='published'` and lands in reader
7. Observability: `/admin/pipeline/runs` lists every run; click → detail with step timings + retry/cancel
8. Cost: `/admin/pipeline/costs` shows today vs cap + per-model + 30-day chart
9. Settings: `/admin/pipeline/settings` toggles kill switches + tunes thresholds

**Click-through verification needed (owner)** — every Phase 4 page needs a manual eyeball pass since I can't open a browser.

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

F7 is complete. Next session is freeform — read the 7 docs above, say "Ready," wait for direction. Likely candidates for Phase 5+ work:

1. **Click-through audit** of all Phase 4 admin pages (owner-led; PM provides dev-server boot + diff context)
2. **Build `web/src/lib/pipeline/redact.ts`** (E2 deferred from cleanup) — Sentry payload PII scrubber per F7-DECISIONS Phase 1 pre-flight item #6
3. **Wire Layer 1 prompt overrides into plagiarism rewrite** (F2 deferred — `web/src/lib/pipeline/plagiarism-check.ts` rewrite call doesn't yet receive overrides; minor)
4. **Phase 5 — content + reader UX** (F1/F2/F3/F4 from Future Projects — sources above headline, reading receipt, earned-chrome comments, quiet home feed)
5. **Other launch-blocker items** in `Current Projects/FIX_SESSION_1.md`
