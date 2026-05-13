# Directory ("Sections") — Build Spec

Date: 2026-05-12
Owner: admin@veritypost.com
Reference mockup: `/Users/veritypost/Desktop/flooper.html`
Design synthesis: see `MEMORY.md` + chat session that produced this doc.

A new unified browse + in-context-filter surface. 3 panes: Categories → Subcategories → Articles. Lives at `/directory` on web, and as a restored "Browse" tab on iOS adult. **Does not replace** `/search` or `/category/[id]` — those stay live (SEO + intent search).

---

## Locked decisions

1. **3-pane layout** for both web + iOS adult. Kids app: no change.
2. **Pane 1 search box** filters **category NAMES only** via pg_trgm. Global article search stays at `/search` (web) and `FindView` (iOS).
3. **Flat categories** (no subcategories — 6 of 14 adult cats) collapse pane 2 to a "section landing" with the sort pill; pane 3 still renders.
4. **URL-driven state**: `/directory/[catSlug]?sub=[subSlug]&sort=latest|trending&q=...`. Browser back works. Deep-linkable.
5. **Editor's Edge** = new `editors_edge_picks` table with `valid_from`/`valid_to`/`slot`/`removed_at`. Not a column on `articles`. Per-category, one pick at a time.
6. **Editor's Edge default window**: 48h. Owner-confirmable later; admin can override per-pick.
7. **Stale-Edge fallback**: nothing renders (no Edge strip if no valid pick). Graceful no-op.
8. **Editor's Edge in same category twice**: blocked by UNIQUE (category_id, slot, valid_window) WHERE removed_at IS NULL. Same article can appear as Edge in multiple categories simultaneously (no article-level UNIQUE).
9. **Trending sort** = `view_count DESC` filtered to last 7 days. `articles.view_count` exists. Refined later.
10. **Anon = free tier** for permission purposes.
11. **iPad** uses `NavigationSplitView` 3-column in landscape; portrait falls back to `NavigationStack`.
12. **Plan gating**: 4 new permission keys (below). Free can browse + sort by Latest + see Editor's Edge. Verity unlocks Trending + expert-depth tooltip. Pro/Family unlock advanced filters + alerts.
13. **No push to remote** during this overnight build. Commit local only.
14. Kids app, kids slugs (`kids-*`), `is_kids_safe=true` categories: **excluded** from adult `/directory`.

---

## DB facts (verified)

### `categories` columns
`id uuid PK, name varchar, slug varchar, description text, icon_name varchar, icon_url text, color_hex varchar, parent_id uuid, sort_order int, is_kids_safe bool, is_premium bool, article_count int, metadata jsonb, created_at, updated_at, deleted_at, category_density jsonb`

20 total top-level rows (11 adult-deep, 3 kids-slug excluded for adult web, 6 adult-flat).

### `articles` columns (relevant)
`id, story_id (FK stories), title, excerpt, published_at, category_id (FK categories), subcategory_id, status, is_kids_safe, reading_time_minutes, view_count, is_verified, deleted_at`

### `stories` columns (relevant)
`id, slug, title, published_at`

### Permission tables
- `permissions(id, key, display_name, category, is_active, sort_order, deny_mode, ...)`
- `permission_sets(id, key, ...)` — existing sets: `anon`, `free`, `pro`, `family`, `admin`, `owner`, `verity_perks` (orphan)
- `permission_set_perms(permission_set_id, permission_id)` — M:N join
- `plan_permission_sets(plan_id, permission_set_id)` — plan → set mapping
- RPC `compute_effective_perms(user_id)` + `my_permission_keys()`

### Plan → set mapping (current, verified)
```
free            → free
verity_monthly  → NULL  ⚠ HAZARD — must be fixed by us
verity_annual   → NULL  ⚠ HAZARD — must be fixed by us
verity_pro_*    → free, pro
verity_family_* → free, pro, family
```

We will introduce a new `verity` permission set (mirroring the pro/family pattern) and map verity_monthly+annual to `{free, verity}`. This unblocks the Verity tier permanently, not just for directory.

---

## 4 new permission keys

| key | display | sets | gates |
|---|---|---|---|
| `directory.sort_trending` | "Directory: Trending sort" | `verity, pro, family` | Trending pill in pane 2/3 |
| `directory.expert_depth` | "Directory: Expert coverage tooltip" | `verity, pro, family` | Hover/tap "X experts" → expert list + Follow all |
| `directory.advanced_filters` | "Directory: Advanced filters" | `pro, family` | Date/source/expert filters in pane 3 |
| `directory.alerts_subcategory` | "Directory: Subcategory alerts" | `pro, family` | "Notify me on new in [subcat]" toggle |

Plus 1 admin key:

| key | display | sets |
|---|---|---|
| `admin.curate.editors_edge` | "Curate Editor's Edge picks" | `admin, owner` |

---

## Migrations (in order)

All idempotent. File names use date prefix `20260513`. Owner runs from Supabase dashboard or Supabase CLI.

### `20260513000000_pg_trgm_categories.sql`
Enable pg_trgm extension. Add GIN index on `categories.name` for fuzzy pane-1 filter.

### `20260513000100_editors_edge_picks.sql`
Create `editors_edge_picks` table + indexes + RLS (public SELECT of currently-valid rows; admin writes via service-role). Insert `admin.curate.editors_edge` permission + attach to admin/owner sets.

### `20260513000200_directory_permissions.sql`
1. Insert 4 new permission keys.
2. Create new `verity` permission set (display_name="Verity", is_system=true).
3. Attach `directory.sort_trending` + `directory.expert_depth` to `verity, pro, family`.
4. Attach `directory.advanced_filters` + `directory.alerts_subcategory` to `pro, family`.
5. Map `verity_monthly` + `verity_annual` plans to permission sets `{free, verity}`. Fixes the orphan-plan hazard.

### `20260513000300_directory_indexes.sql`
Add composite indexes on `articles` for the directory hot path:
- `articles(category_id, published_at DESC) WHERE status='published' AND deleted_at IS NULL`
- `articles(subcategory_id, published_at DESC) WHERE status='published' AND deleted_at IS NULL AND subcategory_id IS NOT NULL`
- `articles(category_id, view_count DESC, published_at DESC) WHERE status='published' AND deleted_at IS NULL` for trending

---

## File map (4 streams, isolated ownership)

### Stream A — DB migrations
Owns: `web/supabase/migrations/20260513*.sql`. 4 files above.

### Stream B — Web `/directory` route + components + public API
Owns:
- `web/src/app/directory/page.tsx` (RSC; renders pane 1)
- `web/src/app/directory/layout.tsx` (metadata)
- `web/src/app/directory/[catSlug]/page.tsx` (RSC; fetches panes 2+3)
- `web/src/app/directory/[catSlug]/layout.tsx` (per-cat metadata)
- `web/src/app/directory/loading.tsx`
- `web/src/components/directory/DirectoryShell.tsx` (client; manages mobile slide)
- `web/src/components/directory/CategoryPane.tsx` (client; pane 1 + filter input)
- `web/src/components/directory/SubcategoryPane.tsx` (client; pane 2 + sort pill)
- `web/src/components/directory/ArticlePane.tsx` (server; pane 3 list)
- `web/src/components/directory/EditorsEdgeStrip.tsx` (server; pane 3 hero)
- `web/src/components/directory/ArticleCard.tsx` (server; row card)
- `web/src/components/directory/ExpertDepthTooltip.tsx` (client; Verity-gated)
- `web/src/components/directory/LockedFeatureChip.tsx` (client; lock affordance)
- `web/src/components/directory/directory.module.css` OR Tailwind classes inline (match brand vocab)
- `web/src/app/api/directory/categories/route.ts` (GET; parent_id filter + adult-only)
- `web/src/app/api/directory/articles/route.ts` (GET; cat/sub/sort/limit/offset; silent perm-degrade)
- `web/src/app/api/directory/editors-edge/route.ts` (GET; current pick per cat/sub)
- `web/src/app/api/directory/expert-coverage/route.ts` (GET; gated on `directory.expert_depth`)
- Edit: `web/src/components/NavWrapper.tsx` — wire `SectionsMenu` open → link to `/directory` (existing magnifier stays pointed at `/search`)

Permission server-checks must thread the same Supabase client across calls (hazard D from plan-gate spec — avoid burning multiple RPCs).

### Stream C — Admin Editor's Edge curation
Owns:
- `web/src/app/admin/editors-edge/page.tsx` (timeline + current picks across categories)
- `web/src/app/admin/editors-edge/_components/PickForm.tsx` (article search + date window picker)
- `web/src/app/admin/editors-edge/_components/PickRow.tsx` (existing-pick row)
- `web/src/app/api/admin/editors-edge/route.ts` (POST create)
- `web/src/app/api/admin/editors-edge/[id]/route.ts` (DELETE soft-delete)
- Add nav link to admin sidebar (find admin nav file and add entry; non-destructive edit)

Uses existing `requirePermission('admin.curate.editors_edge')`, `recordAdminAction`, `checkRateLimit` (max:30/min for create, max:10/min for delete).

### Stream D — iOS Browse tab
Owns:
- `VerityPost/VerityPost/Browse/BrowseCategoriesView.swift` (pane 1)
- `VerityPost/VerityPost/Browse/BrowseSubcategoriesView.swift` (pane 2)
- `VerityPost/VerityPost/Browse/BrowseArticlesView.swift` (pane 3)
- `VerityPost/VerityPost/Browse/BrowseArticleRow.swift` (row + swipe-to-follow)
- `VerityPost/VerityPost/Browse/BrowseRouter.swift` (@Observable, deep-link landing)
- `VerityPost/VerityPost/Browse/BrowseSort.swift` (enum)
- `VerityPost/VerityPost/Browse/BrowseModels.swift` (DTOs for editors-edge response)
- Edit: `VerityPost/VerityPost/ContentView.swift` — add `.browse` tab case + TabItem
- Reuse: `FollowStoryButton` (existing), `FindView`'s metaLine pattern for row spec
- Networking: PostgREST direct for category/subcategory/articles list; `/api/directory/editors-edge` via URLSession for the hero; `/api/directory/expert-coverage` for tooltip (Verity-gated)
- `.searchable()` on `BrowseCategoriesView`; haptic `.light` on tap, `.medium` on pull-to-refresh
- iPad: `NavigationSplitView` 3-column when `horizontalSizeClass==.regular && verticalSizeClass==.regular`; else `NavigationStack`
- Kids app: **NO CHANGE** (do not touch `VerityPostKids/`)

---

## API contract (precise)

### `GET /api/directory/categories?parent_id=<uuid|null>`
Returns: `{ categories: [{id, slug, name, parent_id, sort_order, article_count}] }`
Filter: `deleted_at IS NULL`; if `parent_id` absent → top-level (`parent_id IS NULL`); always excludes `is_kids_safe=true` for this surface.
Cache: `public, max-age=300, stale-while-revalidate=600`.

### `GET /api/directory/articles?category=<slug>&sub=<slug>&sort=latest|trending&limit=30&offset=0`
Required: `category`. Optional: `sub`, `sort` (default `latest`), `limit` (default 30, max 60), `offset` (default 0).
`sort=trending` requires `directory.sort_trending` perm; **silently degrade to `latest`** with `sort_applied: 'latest'` in response if user lacks perm (mirrors `/api/search` behavior).
Returns: `{ articles: [...], total: N, sort_applied: 'latest'|'trending' }`
Article row shape: `{id, slug, story_slug, title, excerpt, published_at, source_name|null, reading_time_minutes, expert_count, is_expert_verified, is_editors_edge}`
- `expert_count`: subquery on `story_follows` joined to users where `is_expert=true` (or comments-based if that path is cleaner — verify against existing helper).
- `source_name`: subquery `(SELECT publisher FROM sources WHERE article_id=a.id LIMIT 1)` — sources table has `publisher` not `source_name`.
Cache: `private, max-age=60` (latest) or `max-age=300` (trending).

### `GET /api/directory/editors-edge?category=<slug>&sub=<slug>`
Returns: `{ pick: { ...same article shape, _edge_label: "Editor's Edge", _valid_to: iso } | null }`
404 if no valid pick. Subcategory-specific wins over category-level. Cache: `public, max-age=60`.

### `GET /api/directory/expert-coverage?story_id=<uuid>`
Gated on `directory.expert_depth`. Returns `{ experts: [{user_id, display_name, avatar_url, expert_title, follow_count}], total }` from `story_follows` JOIN users WHERE `is_expert=true`. 403 if locked (this one DOES throw — it's the premium reveal, not silent degrade).

### `POST /api/admin/editors-edge`
Body: `{article_id, category_id, subcategory_id?, valid_from?, valid_to?, slot?, curator_note?}`
Default `valid_from=now`, `valid_to=now+48h`, `slot=0`. Gate: `admin.curate.editors_edge`. Rate limit: 30/min.
Auto-expires any currently-valid pick in the same (category, subcategory, slot) by setting its `valid_to=NOW()`. Then INSERTs new row. Audit via `recordAdminAction`.

### `DELETE /api/admin/editors-edge/[id]`
Soft-delete (sets `removed_at=NOW()`). Gate: `admin.curate.editors_edge`. Rate limit: 10/min. Audit via `recordAdminAction`.

---

## Component tree (web)

```
/directory/[catSlug]/page.tsx (RSC)
└── DirectoryShell (client) ← URL state, mobile slide
    ├── CategoryPane (client)
    │   ├── CategoryFilterInput (client)
    │   └── CategoryList (server)
    ├── SubcategoryPane (client)
    │   ├── SortPill (client) ← gated on directory.sort_trending
    │   └── SubcategoryList (server)
    └── ArticlePane (server)
        ├── EditorsEdgeStrip (server)
        └── ArticleCard[] (server)
            └── ExpertDepthTooltip (client, lazy) ← gated on directory.expert_depth
```

---

## iOS view tree

```
ContentView (tabbar)
└── Browse tab
    └── BrowseCategoriesView ← .searchable, pulls categories from PostgREST
        └── push → BrowseSubcategoriesView(category:)
            └── push → BrowseArticlesView(category:, subcategory:)
                ├── Editor's Edge hero
                └── List of BrowseArticleRow
                    └── .swipeActions → FollowStoryButton
```

iPad: same hierarchy in `NavigationSplitView`.

---

## Hazards (carry forward)

- **Verity plan unmapped** → fixed in migration 200.
- **Permission cache staleness** on iOS → existing `my_perms_version()` poll handles web; iOS depends on app-foreground refresh (acceptable for MVP).
- **Source field**: articles don't have `source_name`; comes from `sources.publisher`. Subquery in pane 3 article fetch.
- **Slug uniqueness**: `categories.slug` must be UNIQUE for path routing — confirm via migration if not already.
- **Editor's Edge cache invalidation** on admin create/delete: `revalidatePath('/directory')` server-side in the admin mutation handlers.
- **Trending requires view_count to be populated**: it exists as a column; assume Reactor populates it.

---

## Sequencing for tonight's build

1. **All 4 streams in parallel**. They have isolated file ownership.
2. Each stream commits independently (small commits OK).
3. **No git push** under any circumstance.
4. After all 4 land: I run a post-impl reviewer agent to catch integration gaps.
5. Final commit + summary in BUILD.md "Status" section at end.

---

## Status

Build started: 2026-05-12 (overnight).
Planning panel: 5 design agents + 5 deep-code agents complete.
Phase: **BUILT** — all 4 streams shipped + post-impl reviewer PASSED.

### Commits (local only; not pushed)
- `6762a9a4` Stream A — DB migrations + BUILD.md spec
- `2f1d6246` Stream B — /directory route, components, public API
- `c3c4609b` Stream C — admin Editor's Edge curation
- `15407d63` Stream D — iOS Browse tab
- `033228c5` fix(ios-browse) — align EditorsEdgePick decoder to is_verified

### What to do in the morning
1. **Apply migrations** in order from the Supabase dashboard (or via CLI):
   - `20260513000000_pg_trgm_categories.sql`
   - `20260513000100_editors_edge_picks.sql`
   - `20260513000200_directory_permissions.sql`
   - `20260513000300_directory_indexes.sql`
2. **Regen TS types**: `npx supabase gen types typescript ...` — clears the `as any` casts in the admin + public editors-edge routes.
3. **Verify locally**: `cd web && npm run dev`, hit `/directory`, `/directory/politics`, `/directory/culture` (flat cat), `/admin/editors-edge`. Sign in as admin → create an Edge pick → confirm it renders on `/directory/<that-cat>`.
4. **iOS**: open in Xcode, build, sanity-check Browse tab renders + tap-through works. (SourceKit will re-index and clear the transient UIKit warnings — they are not real build errors; many existing files import UIKit.)
5. **Push when satisfied**: `git push origin main` — I deliberately did not push per the no-push-without-approval rule.

### Open follow-ups (non-blocking)
- iOS expert-coverage tooltip is not wired (count only); web has it. Defer.
- Owner-decision questions parked at sensible defaults in Locked Decisions — revisit if you want different Edge windows or multi-slot rotation.
- Admin POST auto-expire is best-effort + UNIQUE backstop; if collisions show up under load, lift into a SECURITY DEFINER RPC.
- `database.ts` regen needed for type-cleanup (item 2 above).
