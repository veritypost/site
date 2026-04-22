# db/03 — Corrections Table (DEFERRED / EDITOR-ONLY)

**Status:** Deferred per 2026-04-21 Charter update. Not building the public corrections feed. If a `corrections` table exists from prior migrations, it is editor-only.

---

## What changed

Earlier drafts proposed a `corrections` table backing a public `/corrections` feed, diffable before/after columns, amber banners on articles, and "Corrections: N" links under the byline.

Per Charter commitment 4 (2026-04-21 update), all of that is cut. The reader surface has:
- No "Corrections: N" link.
- No amber banner.
- No public `/corrections` feed.
- No diff rendering.

## If the table already exists

If a `corrections` table was created by a prior migration, do one of:

### Option A — Drop it (recommended if never populated)

```sql
DROP TABLE IF EXISTS corrections;
```

### Option B — Retain for editor-only internal tracking

```sql
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corrections_public_read ON corrections;

CREATE POLICY corrections_editor_read ON corrections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('owner', 'admin', 'editor')
    )
  );
```

Internal-only table usage is for editorial audit. Not surfaced to readers.

## Explicit non-requirements

- No `diff_before` / `diff_after` columns.
- No public route.
- No RLS public-read policy.
- No admin UI for a public-facing correction composer.
- No automatic trust_events fan-out on correction INSERT.

## If a correction is needed on a published article

Editor updates the article prose in place via the existing story-manager. The refusal list item "No stealth edits" is editorial culture: we don't hide revisions in practice. It does not mean we render diffs to readers. A reader who emails `editors@veritypost.com` about a factual concern gets a human reply; there is no public ticket queue, no public log.

## Migration plan

If the table does not currently exist: do nothing. Don't create it.
If it exists: choose Option A or B above depending on whether any corrections have been logged historically.

## Dependencies

Depends on Charter commitment 4 (2026-04-21). No downstream blocks.
