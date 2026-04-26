# MASTER CLEANUP PLAN — F7 post-audit

**Generated:** 2026-04-22 end-of-session
**Source:** synthesis of 5 audit agents + 4 independent verifiers + 2 planner agents
**Scope:** Phase 1 + Phase 2 + Phase 3 + Phase 4 Task 20 + all docs

This plan is split into two halves:
- **Part A — PM work** (everything I can do solo with agent-driven verification, optimally sequenced)
- **Part B — Owner work** (questions, decisions, migration applies, click-throughs — all collected at the end)

---

## CONFIRMED FINDINGS — what's actually wrong

### Critical (P0/P1) — blocking pipeline correctness

| ID | Bug | Verified by | Severity |
|---|---|---|---|
| F1 | **Clustering unwired** — ingest writes `state='pending', cluster_id=NULL`; cluster.ts + story-match.ts have ZERO callers; generate's filter `WHERE cluster_id = $1` never matches → entire pipeline unreachable through normal flow | Verifier 1 | P0 |
| F2 | **5 missing FK constraints** on `cluster_id` columns (discovery_items, kid_discovery_items, pipeline_runs, pipeline_costs, kid_articles) + asymmetric ON DELETE on `feed_clusters.locked_by` | Verifier 2 | P0 (schema hygiene) |
| F3 | **Audience peek silently skipped** at `generate/route.ts:596` when `feedIds` is empty after null-filter — adult-tagged cluster could pass through `audience='kid'` generation with no warning | Verifier 3 | P0 (fail-closed violation) |
| F4 | **kids_summary latent footgun** — `kid_articles.kids_summary` column doesn't exist; RPC + payload type advertise it; today's caller doesn't populate so guard short-circuits, but any future caller triggers full transaction rollback | Verifier 4 | P1 (latent) |
| F5 | **3 dead `statusForError` branches** (permission_denied, rate_limit, kill_switch) — unreachable via pipeline_runs writes | Verifier 3 | P2 |

### Code quality (P1/P2) — observability + correctness gaps

| ID | Bug | File:line | Severity |
|---|---|---|---|
| F6 | **Quiz multi-correct silently picks first** — if LLM returns `is_correct:true` on multiple options, normalization picks index 0; no validation | `generate/route.ts:1287-1298` | P1 (could publish quiz with 2 right answers) |
| F7 | **Cache token columns left at 0 forever** — call-model writes cache_read/cache_creation tokens to metadata jsonb only; dedicated NOT NULL columns from migration 114 sit at default 0 | `lib/pipeline/call-model.ts:300-320` | P1 (observability — kid vs adult cost attribution + cache hit ratio dashboards broken) |
| F8 | **Generate finally has no status guard** — late-arriving lambda overwrites cancel/cron state | `generate/route.ts:1559-1583` | P2 (audit clutter, no data corruption) |
| F9 | **Plagiarism rewrite skips Layer 1 overrides** — 11th LLM call doesn't get the customization the other 10 do | `lib/pipeline/plagiarism-check.ts` | P2 |
| F10 | **Bare console.log in call-model** — should use pipelineLog per runbook §3 taxonomy | `lib/pipeline/call-model.ts:406` | P2 |
| F11 | **Hardcoded rate-limit fallbacks in ingest** — `max:5, windowSec:600` should track DB seed + Retry-After should derive from `rl.windowSec` | `app/api/newsroom/ingest/run/route.ts:121-130` | P2 |
| F12 | **Unnecessary Json casts** — `step_timings_ms` + `output_summary` already typed | `generate/route.ts:1568-1569` | P3 |

### Dead code post-types:gen (single sweep)

| ID | File | Lines | What |
|---|---|---|---|
| D1 | `generate/route.ts` | 621-627 | dead `service.rpc as unknown as` for `claim_cluster_lock` |
| D2 | `generate/route.ts` | 1483-1489 | dead reshape cast for `feed_clusters.update` |
| D3 | `generate/route.ts` | 1536-1540 | dead `service.rpc as unknown as` for `release_cluster_lock` |
| D4 | `generate/route.ts` | 1582, 1671 | dead `as never` on pipeline_runs UPDATE |
| D5 | `runs/[id]/cancel/route.ts` | 94, 106-110 | dead `as never` + `as unknown as Json` |
| D6 | `cron/pipeline-cleanup/route.ts` | 61, 83, 109 | dead `as never` (3x) on UPDATEs |
| D7 | `kids-waitlist/route.ts` | 125-144 | dead reshape cast on kids_waitlist upsert |
| D8 | `admin/newsroom/page.tsx` | 159-179 | dead `as unknown as {data,error}` on lock-select |
| D9 | `admin/newsroom/page.tsx` | 16-24, 50-53 | stale TSDoc / comment claims |
| D10 | `lib/pipeline/persist-article.ts` | 133-146 | dead `service.rpc as unknown as` for persist RPC |
| D11 | `lib/pipeline/call-model.ts` | 38-45 | dead error-class re-exports |

### Documentation drift

| ID | File | Issue |
|---|---|---|
| DOC1 | `Reference/STATUS.md:5` | references retired `TODO.md` |
| DOC2 | `Reference/CLAUDE.md:~102` | tree missing `web/src/lib/pipeline/` (13 files) |
| DOC3 | `Current Projects/F7-DECISIONS-LOCKED.md` | duplicate Task 3 PENDING stub at L442; Task 4 still PENDING; SHIPPED log only goes to Phase 1 Task 3 |
| DOC4 | `Current Projects/F7-PHASE-3-RUNBOOK.md` | scope says Tasks 14-19 next session (shipped); §3a uses 10-agent naming vs canonical 12-step; changelog missing Tasks 11/16/17/18/19; Task 18 cancel `total_cost_usd` claim wrong |
| DOC5 | `Sessions/04-22-2026/Session 1/SESSION_LOG_2026-04-22.md` | log ends at 11am Task 1 (16 commits + 2 phases since) |
| DOC6 | `Sessions/04-22-2026/Session 1/COMPLETED_TASKS_2026-04-22.md` | minor — staged section already corrected |

---

## DEPENDENCY GRAPH — what blocks what

```
                  ┌──────────────────────────────────┐
                  │  schema/122 (FK constraints)     │
                  │  OWNER APPLY                     │
                  └──────────┬───────────────────────┘
                             │
                             ▼
                  ┌──────────────────────────────────┐
                  │  schema/124 (kids_summary drop)  │
                  │  OWNER APPLY                     │
                  └──────────┬───────────────────────┘
                             │
                             ▼ (types regen unaffected — DDL drops behavior, not surface)
                  ┌──────────────────────────────────┐
                  │  PM verifies migrations LIVE     │
                  └──────────┬───────────────────────┘
                             │
                             ├─────────────────────┬────────────────┬───────────────┐
                             ▼                     ▼                ▼               ▼
                  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐  ┌──────────────┐
                  │ Clustering       │  │ Code-only fixes  │  │ Dead     │  │ Docs sync    │
                  │ wiring (F1)      │  │ (F3, F5, F6, F7, │  │ casts    │  │ (DOC1-DOC6)  │
                  │ Task-sized       │  │  F8, F9, F10,    │  │ sweep    │  │              │
                  │ 3-agent flow     │  │  F11, F12, F4*)  │  │ (D1-D11) │  │              │
                  └──────────────────┘  └──────────────────┘  └──────────┘  └──────────────┘
                             │                     │                │               │
                             └─────────────────────┴────────────────┴───────────────┘
                                                   │
                                                   ▼
                                       ┌──────────────────────┐
                                       │  push to origin/main │
                                       │  OWNER APPROVAL      │
                                       └──────────┬───────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │  Resume Phase 4      │
                                       │  Tasks 21-30         │
                                       └──────────────────────┘

* F4 (kids_summary code-side) blocks until schema/124 applied
```

**Critical-path edges:**
- Clustering (F1) is the longest chain — 2-4 hrs
- Everything else can run in parallel if I split them across batches
- Migrations 122 + 124 must apply BEFORE any code that depends on the new schema state

---

## PART A — PM WORK (agent-driven, parallelized)

### The agent check plan — how I optimize this

Rather than serially executing 11+ fixes, dispatch 4 agent **streams** that run concurrently after migrations land. Each stream produces a single commit. Streams converge into a final cross-verifier before push.

#### Stream 1 — Clustering orchestration (the heavy task)
The biggest, riskiest piece of work. Full 3-agent flow per the existing pattern:
- **Pre-flight agent**: re-verify the planner's design against current code state (clustering planner already produced the plan; this agent confirms nothing has shifted since)
- **Investigator**: structured claim table for the wiring (file paths, function signatures, audience-routing logic, story-match candidate fetch shape, error envelope, output_summary keys)
- **Adversary**: rubric pass — does the inline-in-ingest design break the existing rate-limit math? Does it stomp the existing `pipeline_runs` row's output_summary? Does the 6-hour pending window race against the retention purge? What if a kid item's `feed_id` is NULL?
- **Implementer**: writes per the addendum-corrected spec
- **Cross-check verifier**: independent agent re-traces the audience invariant + the new state machine end-to-end

Ships a single feature commit.

#### Stream 2 — Surgical code fixes batch
Fixes that touch 1-2 lines each, all independent of clustering. Group into ONE commit because they're all "post-types:gen tightening." Items: F3 (audience peek fail-closed), F5 (statusForError dead branches), F6 (quiz multi-correct validation), F8 (generate finally status guard), F12 (Json casts).

Agent flow:
- **Single investigator** produces a unified diff covering all 5 fixes (each fix is small enough)
- **Single adversary** scores all 5 against the rubric (cost-cap / abort / error-routing / downstream / idempotency)
- **Single implementer** lands the diff

Ships one bundled commit "code hygiene + fail-closed fixes."

#### Stream 3 — Dead-cast + observability sweep
Fixes that depend on types:gen output (which already ran). Items: D1-D11 + F7 (cache token columns) + F10 (console.log → pipelineLog) + F11 (rate-limit fallback comment) + F4-code-side (drop kids_summary from PersistArticlePayload).

Agent flow:
- **Investigator** produces the full file-by-file diff. Critical: order matters — F4 code edit must come AFTER schema/124 applies.
- **Adversary** scores: any cast removal that would now hide a *real* type error? Any imports made dead by removal that need to be dropped too?
- **Implementer** lands the bundled diff.
- **Self-verify** runs full repo tsc + lint + grep for `as never` / `as unknown as` count regression.

Ships one bundled commit "dead casts + observability cleanup."

#### Stream 4 — Documentation sync
All DOC1-DOC6 in one pass. Independent of code work. Can land in parallel with Streams 1-3.

Agent flow:
- **Investigator** produces the diff (every doc edit cited file:line)
- **Adversary** verifies no doc claim conflicts with another (e.g., F7-DECISIONS SHIPPED log vs COMPLETED_TASKS shouldn't disagree on a SHA)
- **Implementer** lands.

Ships one bundled commit "docs sync — Phase 3 + 4 complete."

#### Stream-convergence cross-verifier
After all 4 streams ship, dispatch ONE final agent that:
- Repo-wide tsc clean
- Repo-wide next lint clean (no NEW warnings beyond the 3 pre-existing)
- Greps for any remaining `locked_until` refs (the bug pattern)
- Greps for any remaining `kids_summary` refs in code/types
- MCP-confirms migrations 122 + 124 applied + schema state matches what code expects
- `git log --oneline` shows 4 expected commits + cross-check commit if any

Ships ONLY if all gates pass; otherwise reports specific failure for human decision.

---

### Stream timeline + parallelization

```
t=0          ┌─ Stream 1 dispatch (clustering, ~2-4 hrs)
             │
t=0          ├─ Stream 2 dispatch (surgical fixes, ~30 min)
             │
t=0          ├─ Stream 3 dispatch (dead casts + obs, ~45 min)
             │  [F4-code-side gates on Stream 1's pre-flight that confirms schema/124 applied]
             │
t=0          └─ Stream 4 dispatch (docs sync, ~30 min)

t=30 min     Streams 2 + 4 likely landed first (small surface)
t=45 min     Stream 3 lands
t=2-4 hrs    Stream 1 lands

t=Σ          Cross-verifier dispatched. Reports green or specific gate failure.
```

PM clock time: ~2-4 hours wall, ~6-9 agent-hours total compute. Parallelism cuts wall time roughly in half vs serial execution.

---

### Per-stream details — files, fixes, expected commits

#### Stream 1 commit
- New: ~200 LOC in `web/src/app/api/newsroom/ingest/run/route.ts` (clustering phase)
- New: ~20 LOC in `web/src/lib/pipeline/story-match.ts` (`loadKidStoryMatchCandidates` helper)
- Updated: TSDoc headers in both files
- Commit: `feat(f7-phase-2): wire clustering orchestration into ingest (F1 fix)`

#### Stream 2 commit
- `generate/route.ts` — audience-peek fail-closed at L596; remove dead statusForError branches at L1683-88; add quiz multi-correct validation in QuizOptionSchema; add `.eq('status','running')` to finally UPDATE
- Commit: `fix(f7-phase-3): tighten fail-closed paths + quiz validation + finally race`

#### Stream 3 commit
- 11 file edits removing dead casts (D1-D11)
- `lib/pipeline/call-model.ts` — populate dedicated cache_*/cluster_id/error_type/retry_count/audience columns + replace bare console.log with pipelineLog
- `lib/pipeline/persist-article.ts` — drop `kids_summary` from PersistArticlePayload (depends on schema/124)
- `app/api/newsroom/ingest/run/route.ts` — comment fallback rate-limit defaults
- Commit: `chore(f7): dead-cast sweep + observability column writes + rate-limit doc`

#### Stream 4 commit
- 6 doc edits (DOC1-DOC6)
- Commit: `docs(f7): sync state docs with Phase 3 complete + Phase 4 Task 20 shipped`

#### Cross-verifier commit (if needed)
- Only if cross-verifier finds something. Otherwise no commit.

---

### Verification gates — must pass before push

After all streams land:
1. ✅ `npx tsc --noEmit` exit 0 repo-wide
2. ✅ `npx next lint` no NEW warnings (3 pre-existing on Toast.jsx, permissions.js, track.ts are baseline)
3. ✅ `grep -rn "locked_until" web/src/ | grep -v users` returns only doc comments (no live runtime refs to feed_clusters.locked_until)
4. ✅ `grep -rn "kids_summary" web/src/ | grep -v articles` returns only doc comments (no kid_articles.kids_summary refs)
5. ✅ MCP: `claim_cluster_lock`, `release_cluster_lock`, `persist_generated_article` all live; `pipeline_runs.error_type` + 5 new FKs present
6. ✅ `git status --short` clean (except known untracked `Future Projects/verity-living-edition.html`)
7. ✅ Cross-verifier agent returned GREEN

If any gate fails: pause, report, do NOT push. Diagnose specific failure.

---

### What I will NOT do solo

- Apply migrations 122 + 124 (owner action)
- Push commits (owner approval per §3f)
- Click-through `/admin/newsroom` in browser (need owner)
- Resolve owner decisions E1-E6 (Part B)
- Refactor any file in MUST-NOT-TOUCH fence
- Build Phase 4 Tasks 21-30 (resumes after this cleanup ships)

---

### Risk register for the PM work

| Risk | Mitigation |
|---|---|
| Stream 1 (clustering) adversary returns RED with architectural objection | Pause Stream 1, report adversary findings to owner for adjudication. Streams 2-4 continue. |
| Stream 3 cast removal exposes a real type error tsc was hiding | Implementer reverts the offending cast removal, leaves it as-is, flags for follow-up. Other casts still cleaned. |
| F4 code edit lands before schema/124 applies | Stream 3 implementer verifies migration 124 LIVE via MCP as a pre-flight check; refuses to drop `kids_summary` from PersistArticlePayload until confirmed. |
| Cross-verifier finds an inconsistency between streams | Cross-verifier reports specific failure; PM dispatches a targeted fix agent before push. |
| Owner can't apply migrations during PM work window | Streams 1, 2, 4 continue; Stream 3 partial-ships (everything except F4 code edit). F4 deferred until owner unblocks. |

---

## PART B — OWNER WORK (everything that needs you)

This is the END-OF-PLAN section per request. PM cannot proceed on these without input.

### B.1 — Migrations to apply (Supabase SQL editor)

| Migration | What | When |
|---|---|---|
| `schema/122_f7_cluster_id_fks.sql` | 5 missing FK constraints + asymmetric ON DELETE fix on `feed_clusters.locked_by` | BEFORE PM starts cleanup streams |
| `schema/124_f7_drop_kids_summary_from_rpc.sql` | Drops the buggy `kids_summary` UPDATE branch from `persist_generated_article` RPC | BEFORE Stream 3's F4-code-side edit |

PM writes both files first (they don't exist yet). Owner copies SQL, pastes into editor, clicks Run. ~3 min each. Idempotent + rollback files included.

### B.2 — Decisions PM cannot make alone

| ID | Question | Default if owner says "default" |
|---|---|---|
| E1 | **F7-DECISIONS §8 quiz_verification: throws or patches?** Spec says "patches wrong correct_index"; code at `generate/route.ts:1338-1343` throws on ANY fix. | Update F7-DECISIONS to match code (spec follows reality) |
| E2 | **`web/src/lib/pipeline/redact.ts` Phase 1 pre-flight item #6** — deferred or skipped? Currently `Sentry.captureException` called directly without redact helper. Payload is cluster_id + error_type + run_id (no PII), so not urgent but discipline isn't wired. | Build redact.ts as a Phase 4 task; not blocking |
| E3 | **FIX_SESSION_1.md F7 entry (L1127-1162) is wildly stale** — describes Phase 0 state. Gut and stub-link to F7-DECISIONS-LOCKED.md as canonical tracker, OR maintain both? | Gut + stub link (single source of truth) |
| E4 | **Vercel tier confirmation** — `*/5 * * * *` cron requires Pro (not Hobby). 9 existing daily crons suggest Pro, but please confirm in Vercel dashboard. | Proceed assuming Pro |
| E5 | **Clustering planner produced architecture choice** — recommended Option A (inline in ingest) per planner output above. Ratify or override? | Ratify Option A |
| E6 | **Retry route uses internal HTTP fetch** to call generate (Task 17 known shortcut). Keep or extract generate's 1700-line core into `lib/pipeline/generate.ts`? | Keep internal fetch; extract if Task 22 modal adds 3rd caller |

### B.3 — Click-through verifications (after PM ships everything)

| Surface | What to verify |
|---|---|
| `/admin/newsroom` | Cluster cards render after Refresh feeds; Generate buttons fire to existing run; Unlock button only shows when locked; View link 404s gracefully (Task 21 not built yet — acceptable) |
| Refresh feeds button | First click ingests + clusters; subsequent click within 2 min returns "Refreshing too fast" toast (rate-limit) |
| Generate adult button on a cluster | Returns successfully, navigates to `/admin/pipeline/runs/<id>` (which 404s — Task 27 not built yet) |
| Cancel button (manual: Task 18 endpoint via curl with admin cookies) | Marks run failed, releases lock, resets discovery items |
| Cron `/api/cron/pipeline-cleanup` | Vercel cron fires every 5 min; check Vercel logs for orphan_runs_cleaned counts |

### B.4 — Approval gates

| Gate | Trigger | Owner action |
|---|---|---|
| Push approval | After all 4 streams + cross-verifier green | Say "push" |
| Apply migrations | When PM pings with paste-ready SQL | Run in Supabase SQL editor + reply "done" |
| E1-E6 answers | Owner reads B.2 above | Reply with answers (or "default" for any to defer) |
| Phase 4 resumption | After cleanup commits pushed | Say "resume Phase 4" |

### B.5 — Untracked file decision

`Future Projects/verity-living-edition.html` is untracked, pre-session, not from PM work. Owner picks: commit it, delete it, or add to `.gitignore`.

---

## SUMMARY — THE ONE-PAGE VERSION

**12 confirmed bugs across Phases 1-4** (5 critical, 7 quality), **11 dead-code refs** (all from types:gen aftermath), **6 doc drift items**.

**PM ships 4 commits in parallel streams** with agent-driven verification at every stage:
1. Clustering orchestration (Stream 1, biggest)
2. Surgical fail-closed fixes (Stream 2, smallest)
3. Dead-cast + observability sweep (Stream 3)
4. Docs sync (Stream 4)

**Owner provides:** 2 migration applies + 6 decisions + 1 push approval + 1 click-through pass.

**End state:** F7 pipeline reachable through normal flow, schema integrity restored, types pulling weight, docs match reality, ready to resume Phase 4 Tasks 21-30.

---

End of plan.
