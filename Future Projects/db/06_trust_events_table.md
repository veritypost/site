# db/06 — Trust Events Table (DEFERRED)

**Status:** Deferred per 2026-04-21 Charter update. Not building the public "See a problem?" flow or correction event log.

---

## What changed

Earlier drafts proposed a `trust_events` table as a unified audit log for reader reports, corrections, standards changes, and charter amendments — backing a "See a problem?" button on every article plus an admin queue for editor triage.

Per Charter commitment 4 (2026-04-21 update):
- No "See a problem?" button on articles.
- No reader-facing trust-report endpoint.
- No admin trust-reports queue.
- No public-facing log of trust events.

Reader-flagged concerns route through `editors@veritypost.com` — email, not in-product forms. Editorial standards changes are captured in the `/editorial-log` page (static Markdown in repo, no DB).

## If the table already exists

If a `trust_events` table was created by a prior migration:

### Option A — Drop it (recommended if never populated)

```sql
DROP TABLE IF EXISTS trust_events;
```

### Option B — Retain for internal editorial workflow only

```sql
ALTER TABLE trust_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trust_events_public_read ON trust_events;
DROP POLICY IF EXISTS trust_events_reader_report ON trust_events;

-- Keep editor-read + editor-insert policies only. Editors can use the
-- table for internal tracking of editorial practice changes if desired.
```

## Explicit non-requirements

- No `/api/trust-reports` endpoint.
- No reader-facing form.
- No `trust_report` rate limit entry (if already seeded in `rate_limits`, leave or remove depending on ops preference — no reader-facing endpoint references it).
- No fan-out triggers from `corrections` INSERT to `trust_events`.
- No admin queue UI.

## Migration plan

If the table does not currently exist: do nothing. Don't create it.
If it exists: choose Option A or B depending on whether any rows have been logged historically.

## Dependencies

Depends on Charter commitment 4 (2026-04-21). No downstream blocks.
