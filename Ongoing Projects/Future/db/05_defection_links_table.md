# db/05 — Defection Links Table

**Owner:** Thompson (defection path concept), Bell (trust infrastructure tie-in).
**Purpose:** `06_DEFECTION_PATH.md` — per-article "see also" links to peers or primary sources.
**Migration filename:** `schema/<next>_defection_links_2026_XX_XX.sql`

---

## Current state

No `defection_links` table exists.

## The change

```sql
CREATE TABLE defection_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  slot integer NOT NULL CHECK (slot IN (1, 2)),
  outlet_name text NOT NULL,
  url text NOT NULL CHECK (url ~ '^https?://'),
  link_type text NOT NULL CHECK (link_type IN ('peer', 'primary_source', 'background')),
  curated_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, slot)
);

CREATE INDEX idx_defection_links_article ON defection_links(article_id);

ALTER TABLE defection_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY defection_links_public_read ON defection_links
  FOR SELECT USING (true);

CREATE POLICY defection_links_editor_write ON defection_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY defection_links_editor_update ON defection_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY defection_links_editor_delete ON defection_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('owner', 'admin', 'editor')
    )
  );
```

## Constraint: at least one defection link before publish

Enforced in application code, not DB, because "published" is a status that can move through multiple states.

In the story-manager publish flow: if `articles.status` moves to `published` and no `defection_links` rows exist for that article_id, block the publish with a clear error:

> This article needs at least one "See also" link before publish. Add a peer outlet or primary source, or mark this as a Verity-exclusive piece with a primary source.

Verity-exclusive override: a boolean flag on `articles` — `is_exclusive` — allows publish with only slot 2 (primary source) filled. If neither slot is filled and `is_exclusive=true`, still require at least one to keep the habit strong.

## Callers

- `/api/admin/articles/save/route.ts` — enforces the publish-time validation.
- `web/src/app/admin/story-manager/page.tsx` — UI for adding/editing defection links per article.
- `web/src/app/story/[slug]/page.tsx` — reads defection links and renders below sources.
- `VerityPost/VerityPost/StoryDetailView.swift` — same on iOS.
- `web/src/lib/api/defectionLinks.ts` — shared fetcher.
- `web/src/app/api/events/batch/route.ts` — `defection.click` event shape.

## Acceptance criteria

- [ ] Table exists.
- [ ] RLS: public read; editor-role write.
- [ ] Publish validation enforced.
- [ ] `is_exclusive` flag added to `articles` (requires separate small migration or ALTER TABLE in same migration).
- [ ] Story-manager UI allows 2 link slots per article.
- [ ] Reader-facing defection line renders.
- [ ] `defection.click` event fires on external-link tap.

## Dependencies

Ship after `04_TRUST_INFRASTRUCTURE.md` tables. Blocks per-article display surface (see `views/web_story_detail.md`).
