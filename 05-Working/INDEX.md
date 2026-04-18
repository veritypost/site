# 05-Working Index

**Purpose:** Map of what lives in `05-Working/`. Start with `STATE.md` if you want current product state; come here if you want to know which doc serves which purpose.

**Last updated:** 2026-04-17 (Pass 99 audit-repair CLOSED + Kids Audit + Repair pass CLOSED — 7+1 chunks, 9 new files, 3 new migrations 061-063. Total migration queue now **13 pending Supabase apply** in order 051 through 063. See `REPAIR_LOG.md` + `KIDS_AUDIT_AND_REPAIR_LOG.md` for per-chunk detail and phase log for canonical narrative).

---

## Entry point

**`PM_HANDOFF.md`** — read this FIRST if you're a PM session starting up. Canonical discipline brief: what to keep doing, what prior PM missed, spot-check checklist, anti-hallucination rules. Every PM reads this before touching anything else.

**`STATE.md`** — canonical current product state. What works, what's deferred, what's blocked. Refreshed after every pass close. Start here AFTER `PM_HANDOFF.md` if you're new or coming back after time away.

---

## Active documents

| File | Role |
|---|---|
| `PM_HANDOFF.md` | **READ FIRST.** Canonical PM discipline brief. Rules against hallucination, spot-check checklist, what prior PM missed. |
| `STATE.md` | Canonical current-state snapshot. |
| `INDEX.md` | This file — navigation map. |
| `OWNER_TO_DO.md` | Owner-only launch prep checklist (Supabase migrations, Apple, Stripe, content). Owner flips checkboxes; PM refreshes structure after each pass. |
| `LIVE_TEST_BUGS.md` | Active bug intake during E2E testing. Condensed post-Pass-17 — only still-OPEN entries get detailed bodies; FIXED entries summarized. |
| `KIDS_SISTER_APP_PLAN.md` | Post-launch plan for Verity Post Kids sister app. Future work; not yet executed. |
| `Verity_Post_Phase_Log.md` | Canonical narrative history. Every pass summarized. Append-only. This is the audit trail. |
| `AUTONOMOUS_FIXES.md` | Per-task chronological receipts log. 150 entries across Passes 1–17. Append-only. |
| `z-Remaining Items.md` | Legacy outstanding list. Human-Only items mostly superseded by `OWNER_TO_DO.md`. Kept for cross-reference. |
| `stripe-sandbox-restore.sql` | Reference SQL for restoring Stripe sandbox prices if needed for future testing. |
| `DEEP_AUDIT.md` | Deep Audit report — 188 findings across 13 dimensions. Read-only input to audit-repair work. |
| `FRESH_AUDIT.md` | Fresh Audit report — 240 independent findings. Read-only input to audit-repair work. Deeper on security + correctness than Deep. |
| `DEEP_AUDIT_REVIEW.md` | Review of Deep Audit — verifies claims, adjudicates severity, escalates DA-097 to P0. |
| `DEEP_AUDIT_ACTION_PLAN.md` | Earlier one-audit action plan (119 items). Superseded by the audit-repair agent's own 13-chunk integrated plan — retained for reference; not actively worked. |
| `REPAIR_LOG.md` | Per-chunk execution log from the audit-repair agent. Appended after each chunk lands. Canonical record of what was fixed when. |
| `ROTATE_SECRETS.md` | Owner-action checklist for rotating compromised secrets (Supabase service role, Stripe secret, Stripe webhook secret, Resend, OpenAI, APNs, CRON_SECRET). Surfaced by Chunk 1 of audit-repair. |

---

## Archived (in `99-Archive/`)

### Working docs — `99-Archive/working-docs/`

Closed pass working docs (Passes 1–17) + closed tracking docs. History preserved in the phase log; these are for reference only.

- `Z - Remaining Pass 1 - Admin.md` through `Z - Remaining Pass 6 - Polish and Decisions.md` (Passes 1–6)
- `Z - Remaining Pass 8 - Comprehensive Audit.md` (Pass 8; no Pass 7)
- `Z - Pass 9 Critical Fix Prompts.md` through `Z - Pass 17 Autonomous Web Sweep.md` (Passes 9–17)
- `Z - Bug Triage.md` — 104-bug triage closed at Pass 12
- `Z - Code Quality Recommendations.md` — 35 CQ items; 16 structural items deferred post-launch
- `Z - Launch Confidence Notes.md` — 8 commitment reference
- `Z - PM Handoff Prompt.md` — original PM handoff brief

### Audit snapshots — `99-Archive/audits/`

Point-in-time audits. Their findings have been absorbed into `STATE.md` or closed via passes.

- `HEALTH_CHECK.md` — Pass 14 health check
- `FULL_AUDIT.md` — 323-item static verification through Pass 13
- `LIVE_TEST_BUGS_DIAGNOSIS.md` — diagnosis of the 39 LB entries
- `USER_JOURNEY_DISCOVERY.md` — 132-finding discovery audit
- `REMAINING_WORK.md` — post-Pass-16 backlog (superseded by `STATE.md`)

---

## Who touches what

| Role | Reads | Writes |
|---|---|---|
| **PM (strategic session)** | `STATE.md`, phase log, LIVE_TEST_BUGS, OWNER_TO_DO; archived docs only when debugging history | `STATE.md` (refresh), phase log (pass summaries), LIVE_TEST_BUGS (new intake from owner), INDEX (nav updates), OWNER_TO_DO (migrations added at pass close) |
| **Coding AI (pass executor)** | Active pass working doc when open, design decisions, `AUTONOMOUS_FIXES.md` tail for format | Active pass working doc Result blocks, `AUTONOMOUS_FIXES.md` appends, target source files |
| **Owner (human)** | `STATE.md` for where-we-are; `OWNER_TO_DO.md` for what-I-do-next; `LIVE_TEST_BUGS.md` when dishing new bugs | `OWNER_TO_DO.md` checkbox flips; plain-language bug reports → PM structures |

---

## How the phase hierarchy works

Three levels of detail, progressively deeper:

1. **`STATE.md`** — current state only. What the product IS. No history.
2. **`Verity_Post_Phase_Log.md`** — narrative history. What changed and why, per pass. Append-only canonical audit trail.
3. **`AUTONOMOUS_FIXES.md`** — per-task receipts. File:line changes per edit. 150 entries.

Plus `99-Archive/working-docs/` per-pass working docs with full Recon / Execution / Result blocks for anyone needing maximum granularity on a specific pass.

---

## Keeping this file current

PM updates `INDEX.md` when:
- A new active doc is created or retired.
- A doc moves to / from `99-Archive/`.
- The folder organization shifts.

PM does NOT update `INDEX.md` on every pass close — that's what `STATE.md`'s "Last verified" date is for.

---

## Related tracking outside `05-Working/`

- `00-Reference/Verity_Post_Design_Decisions.md` — D1–D44 canonical product rules.
- `01-Schema/` — canonical SQL + migrations 005–055.
- `02-Parity/` — cross-platform feature parity docs.
- `04-Ops/PROJECT_STATUS.md` — operational status (refreshed Pass 15).
- `04-Ops/CUTOVER.md` — deployment / go-live reference.
- `99-Archive/` — see archived sections above.
