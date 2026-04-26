# db/04 — Editorial Charter, Shifts, Front Page State

**Owner:** Bezos (editor-as-team-not-person), Thompson (editorial ops).
**Purpose:** `05_EDITOR_SYSTEM.md`. Three related tables grouped in one doc because they ship together.
**Migration filename:** `schema/<next>_editorial_system_2026_XX_XX.sql`

---

## Current state

No `editorial_charter`, `editor_shifts`, or `front_page_state` tables exist (verified 2026-04-21).

## The change

### `editorial_charter` — versioned ruleset

```sql
CREATE TABLE editorial_charter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  effective_start timestamptz NOT NULL,
  effective_end timestamptz,  -- null = current version
  content jsonb NOT NULL,     -- structured charter: slot_count, hero_criteria, breaking_criteria, etc.
  amended_by_user_id uuid NOT NULL REFERENCES users(id),
  amendment_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_editorial_charter_version ON editorial_charter(version);
CREATE INDEX idx_editorial_charter_current ON editorial_charter(effective_end) WHERE effective_end IS NULL;

-- RLS
ALTER TABLE editorial_charter ENABLE ROW LEVEL SECURITY;

CREATE POLICY editorial_charter_public_read ON editorial_charter
  FOR SELECT USING (true);

CREATE POLICY editorial_charter_senior_write ON editorial_charter
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('owner', 'admin') -- Senior Editor level
    )
  );
```

### `editor_shifts` — who's on when

```sql
CREATE TABLE editor_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  editor_user_id uuid NOT NULL REFERENCES users(id),
  shift_start_at timestamptz NOT NULL,
  shift_end_at timestamptz NOT NULL,
  handoff_notes jsonb,              -- filled by outgoing editor
  handoff_submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (shift_end_at > shift_start_at)
);

CREATE INDEX idx_editor_shifts_start ON editor_shifts(shift_start_at);
CREATE INDEX idx_editor_shifts_active ON editor_shifts(shift_start_at, shift_end_at);
CREATE INDEX idx_editor_shifts_editor ON editor_shifts(editor_user_id, shift_start_at DESC);

-- RLS
ALTER TABLE editor_shifts ENABLE ROW LEVEL SECURITY;

-- Public read (shift of record is the reader-facing byline)
CREATE POLICY editor_shifts_public_read ON editor_shifts
  FOR SELECT USING (true);

CREATE POLICY editor_shifts_editor_write ON editor_shifts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY editor_shifts_editor_update_own ON editor_shifts
  FOR UPDATE USING (editor_user_id = auth.uid());
```

### `front_page_state` — current 8 slots

```sql
CREATE TABLE front_page_state (
  slot_index integer PRIMARY KEY CHECK (slot_index BETWEEN 0 AND 7),
  article_id uuid REFERENCES articles(id),     -- nullable: slot can be empty
  placed_by_user_id uuid REFERENCES users(id),
  placed_at timestamptz,
  notes text                                    -- editor's internal note
);

-- Seed 8 empty slots
INSERT INTO front_page_state (slot_index) VALUES (0), (1), (2), (3), (4), (5), (6), (7);

-- RLS
ALTER TABLE front_page_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY front_page_state_public_read ON front_page_state
  FOR SELECT USING (true);

CREATE POLICY front_page_state_editor_update ON front_page_state
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('owner', 'admin', 'editor')
    )
  );
```

### Archived front pages

```sql
CREATE TABLE front_page_archive (
  archived_date date PRIMARY KEY,
  snapshot jsonb NOT NULL,   -- {slot_0: article_id, slot_1: ..., editor_name: ..., date: ...}
  archived_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE front_page_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY front_page_archive_public_read ON front_page_archive
  FOR SELECT USING (true);
```

Archive is written once per day (cron at midnight) capturing the end-of-day state.

## New RPCs

```sql
-- Get current on-shift editor
CREATE OR REPLACE FUNCTION get_on_shift_editor()
  RETURNS TABLE (editor_user_id uuid, name text, shift_start_at timestamptz, shift_end_at timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT es.editor_user_id, u.display_name, es.shift_start_at, es.shift_end_at
  FROM editor_shifts es
  JOIN users u ON u.id = es.editor_user_id
  WHERE es.shift_start_at <= now() AND es.shift_end_at > now()
  ORDER BY es.shift_start_at DESC
  LIMIT 1;
$$;

-- Get current front page (denormalized for fast read)
CREATE OR REPLACE FUNCTION get_front_page()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Returns denormalized front page: 8 slots with article details + on-shift editor
  SELECT jsonb_build_object(
    'date', current_date,
    'editor', (SELECT jsonb_agg(row_to_json(e)) FROM get_on_shift_editor() e LIMIT 1),
    'slots', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slot_index', fps.slot_index,
          'article', CASE WHEN a.id IS NULL THEN NULL ELSE row_to_json(a) END,
          'placed_by', fps.placed_by_user_id,
          'placed_at', fps.placed_at,
          'corrections_count', (SELECT COUNT(*) FROM corrections c WHERE c.article_id = a.id)
        ) ORDER BY fps.slot_index
      )
      FROM front_page_state fps
      LEFT JOIN articles a ON a.id = fps.article_id
    )
  ) INTO result;
  RETURN result;
END;
$$;
```

## New permissions

Add to `permissions` table:
- `editorial.frontpage.curate`
- `editorial.frontpage.hero_assign`
- `editorial.shift.claim`
- `editorial.handoff.submit`
- `editorial.charter.amend` (Senior Editor only)
- `editorial.breaking.send` (Senior Editor only)
- `editorial.defection.edit` (from `06_DEFECTION_PATH.md`)

Create `editor` role in the `roles` table if not exists. Grant the editorial permissions above to `owner`, `admin`, and `editor` roles.

## Callers

- `/api/front-page/route.ts` (new) — public read endpoint, calls `get_front_page()`.
- `/api/front-page/version/route.ts` (new) — returns hash of current state.
- `/admin/editorial/curate/page.tsx` — editor UI.
- `/admin/editorial/shift/page.tsx` — shift dashboard.
- `/admin/editorial/handoff/page.tsx` — handoff submission.
- `/admin/editorial/charter/page.tsx` — Senior Editor amendment.
- `/api/admin/editorial/frontpage/route.ts` — admin mutation endpoints.
- `/api/admin/editorial/shifts/route.ts` — shift management.
- `/masthead/page.tsx` — reads `get_on_shift_editor()`.
- `/archive/[date]/page.tsx` — reads `front_page_archive`.
- Daily cron (new): archive end-of-day front page state.

## Acceptance criteria

- [ ] Three tables exist with correct schema.
- [ ] RLS policies work (public read; editor-role write; senior-editor amend).
- [ ] Seed: 8 empty slots in `front_page_state`.
- [ ] RPCs `get_on_shift_editor()`, `get_front_page()` exist and return correct data.
- [ ] New permissions seeded; `editor` role created.
- [ ] Editor admin UI can update a front-page slot.
- [ ] `/api/front-page` returns the front page.
- [ ] Daily archive cron snapshots to `front_page_archive`.
- [ ] `mcp__supabase__generate_typescript_types` regenerated; `web/src/types/database.ts` updated.

## Dependencies

Ship as part of `05_EDITOR_SYSTEM.md`. Blocks `09_HOME_FEED_REBUILD.md`.
