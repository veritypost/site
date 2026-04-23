# Orphan Table Triage — 2026-04-23

Stream 3 of 4-stream parallel cleanup. **Read-only triage** — no tables were
dropped this stream. Owner decides per-row.

## Method

For each candidate table:
- Row count via Supabase MCP `SELECT count(*) FROM <table>` (live DB).
- Repo grep across `web/src/`, `VerityPost/`, `VerityPostKids/`, `Future Projects/`,
  `Current Projects/`, `Reference/`, `Sessions/`, `Archived/`, `Completed Projects/`,
  `Unconfirmed Projects/`, `supabase/`, `scripts/`.
- FK incoming/outgoing inspection via `pg_constraint`.

`web/src/types/database.ts` references are **excluded** from "code refs" — that
file is auto-generated from schema and contains every public table by definition.

## Summary

- **DROP-CANDIDATE**: 9
- **KEEP-DEFERRED**: 1 (`search_history` — referenced in `Future Projects/views/web_search.md`)

All 10 tables have **0 rows**. No application code (web, adult iOS, kids iOS) reads
or writes any of them. None are referenced by any other table's FK constraints
(all FKs on these tables are outbound — they reference parents like `users`,
`articles`, `kid_profiles`).

## Per-table

### `access_code_uses` — DROP-CANDIDATE
- Rows: 0
- Code refs: none (only `database.ts`)
- Doc refs: none
- FKs: outbound to `access_codes`, `users`. No incoming.
- Notes: belongs to a scrapped access-code feature. Parent `access_codes` is
  almost certainly also dead but is out of scope this stream.

### `behavioral_anomalies` — DROP-CANDIDATE
- Rows: 0
- Code refs: none
- Doc refs: none
- FKs: outbound to `users` (user_id, reviewed_by). No incoming.
- Notes: was an anti-fraud table; never wired.

### `campaign_recipients` — DROP-CANDIDATE
- Rows: 0
- Code refs: none
- Doc refs: none
- FKs: outbound to `campaigns`, `users`. No incoming.
- Notes: parent `campaigns` table likely also dead — flag for follow-up sweep.

### `cohort_members` — DROP-CANDIDATE
- Rows: 0
- Code refs: none
- Doc refs: none
- FKs: outbound to `cohorts`, `users`. No incoming.
- Notes: parent `cohorts` likely also dead.

### `consent_records` — DROP-CANDIDATE
- Rows: 0
- Code refs: none
- Doc refs: none
- FKs: outbound to `users`. No incoming.
- Notes: COPPA-style consent tracking that was superseded by the kid pair-code
  flow. The kids surface uses `kid_profiles` + parent grants, not a separate
  consent ledger.

### `device_profile_bindings` — DROP-CANDIDATE
- Rows: 0
- Code refs: none
- Doc refs: none
- FKs: outbound to `users` (parent_user_id), `kid_profiles` (bound_kid_profile_id).
  No incoming.
- Notes: this is the table the **7 dead RPCs dropped in `schema/140_drop_dead_rpcs.sql`**
  were designed to write into. Removing the RPCs and this table together is the
  full cleanup of the device-mode design. Confirms safe to drop.

### `search_history` — **KEEP-DEFERRED**
- Rows: 0
- Code refs: none in app code
- Doc refs: `Future Projects/views/web_search.md` line 6 — `**DB touchpoints:** articles, search_history.`
- FKs: outbound to `users`, `user_sessions`. No incoming.
- Notes: referenced by an active future-project plan. Keep until that project
  either ships or is itself deferred/scrapped.

### `translations` — DROP-CANDIDATE
- Rows: 0
- Code refs: none
- Doc refs: none in `Future Projects/`, `Current Projects/`, `Reference/`
- FKs: outbound to `users` (reviewed_by). No incoming.
- Notes: i18n was never started; if it does start, schema would likely be
  redesigned anyway.

### `sponsored_quizzes` — DROP-CANDIDATE
- Rows: 0
- Code refs: none
- Doc refs: none
- FKs: outbound to `sponsors`, `articles`, `categories`, `users` (approved_by).
  No incoming.
- Notes: sponsored-content concept dropped. Parent `sponsors` likely also dead.

### `expert_discussion_votes` — DROP-CANDIDATE
- Rows: 0
- Code refs: none
- Doc refs: none
- FKs: outbound to `expert_discussions`, `users`. No incoming.
- Notes: voting on expert discussions never built. Parent `expert_discussions`
  may or may not be live — separate inspection needed.

## Suggested follow-ups (NOT in scope this stream)

The DROP-CANDIDATE list points at several "parent" tables that are likely also
dead but were not audited this stream: `access_codes`, `campaigns`, `cohorts`,
`sponsors`, `expert_discussions`. Worth a Stream-3-style sweep next session.

## Owner action

For each DROP-CANDIDATE row above, owner can:
1. Greenlight a follow-up migration `schema/142_drop_dead_tables.sql` (and
   companion rollback) that drops the 9 cleared tables.
2. Or defer specific rows back to KEEP-DEFERRED with a one-line "why".

`device_profile_bindings` is the strongest drop-now candidate — it pairs
directly with the 7-RPC cleanup already shipped in migration 140.
