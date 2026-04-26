# db/ — Schema Changes

Each MD in this folder documents one DB change — a new table, a column addition, or a data migration. Format:

- **Purpose** — what this change enables.
- **Current state** — what's in Supabase today (verified 2026-04-21 via MCP).
- **The change** — full SQL or migration intent.
- **RLS policies** — who can read, who can write, plus any RPC wrappers.
- **Backfill** — how existing data is migrated (if applicable).
- **Callers** — which routes, views, RPCs will read/write this.
- **Migration filename** — `schema/NNN_<name>_2026_XX_XX.sql`.
- **Acceptance criteria**.

## Migration numbering

Current last applied migration: `20260420020544 rls_hardening_kid_jwt_2026_04_19` (per supabase recon 2026-04-21). New migrations from this folder should use the next available sequential numbers.

## Coverage

### Active

- `01_trials_add_to_plans.md` — set `trial_days` on paid plans.
- `02_ad_free_reconciliation.md` — flip verity tier's `ad_free` flag.
- `04_editorial_charter_table.md` — `editorial_charter`, `editor_shifts`, `front_page_state` tables (editor system).
- `05_defection_links_table.md` — table for peer / primary-source links.
- `08_feature_flags_expansion.md` — per-feature killswitches (currently only `v2_live`).
- `10_summary_format_schema.md` — adds `article_type`, `kicker_next_event_date` to `articles`; adds `type` to `quiz_questions`; drops `reading_time_minutes`.

### Deferred (cut from launch scope, 2026-04-21)

- `03_corrections_table.md` — public corrections feed cut. If the table exists, lock to editor-only or drop.
- `06_trust_events_table.md` — "See a problem?" flow cut. If the table exists, lock or drop.
- `09_design_tokens_table.md` — considered, rejected. Tokens in code.

### Removed (deleted with the doc)

- `07_standards_doc_table.md` — standards page cut from scope. Doc deleted.

## What's not in this folder

- **Admin lockdown migrations.** Admin is `@admin-verified` — any changes require explicit owner approval.
- **Pipeline migrations.** AI-generation pipeline has its own schema; not touched by this plan.
- **RLS hardening.** Recent migrations (20260419–20260420 batch) already hardened RLS.
- **Performance-only migrations** (indexes, materialized views). Per `15_PERFORMANCE_BUDGET.md`: revisit at scale.

## How to use

1. Read the MD for the change.
2. Write the SQL migration following `schema/` conventions.
3. Apply via `mcp__supabase__apply_migration`.
4. Verify via `mcp__supabase__list_tables` or `execute_sql`.
5. Regenerate `web/src/types/database.ts` via `mcp__supabase__generate_typescript_types`.
6. Update callers.
7. Log shipment in `Current Projects/FIX_SESSION_1.md` per CLAUDE.md (inline `SHIPPED <date>` block).

## Ordering

Phase 1 (Weeks 1–4):
1. `01_trials_add_to_plans.md` + `02_ad_free_reconciliation.md` — Week 2.
2. `08_feature_flags_expansion.md` — Week 2.
3. `04_editorial_charter_table.md` — Week 3.
4. `10_summary_format_schema.md` — Week 4.
5. `05_defection_links_table.md` — Week 4.
6. `03_corrections_table.md` + `06_trust_events_table.md` — Week 4 (decide drop vs lock).

Phase 2+: no new migrations in this folder; surface work consumes the schema.
