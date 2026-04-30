# Slice 02 — Browse

**Status:** locked
**Session:** 2026-04-29 (Session 3)
**Adversarial review:** complete

---

## What browse is

Browse is category discovery — readers pick a topic, then go deep. It is not an article-ranking surface. Every decision this session flows from that: features that sorted or ranked articles at the browse level were dropped; the category grid is the whole product.

---

## Locked decisions

### 1. Featured strip — dropped entirely

The browse page had a top strip showing 3 articles ordered by `is_featured DESC, published_at DESC`, labeled "Latest stories" (was previously "Featured by editors" before S7-A107). `is_featured` has no admin write path — only settable via direct DB access. Featured articles rendered identically to non-featured ones. The entire top strip is dropped. Browse opens directly into the category grid.

In execution: remove the featured articles query (`browse/page.tsx:130–136`), the `featured` and `hasEditorPick` state variables, the `is_featured` field from both select statements, and the top strip render block (`browse/page.tsx:305–406`). The `FeaturedCard` type and the `featured` state variable go too.

### 2. Filter pills — dropped permanently

Most Recent / Most Verified / Trending pills were built and then fully removed (state and JSX both gone, T111). "Most Verified" has no defined signal. Trending requires `view_count` which is not in the browse query. Decision: do not build them. Browse does not sort or filter articles — the category page handles that once a reader has committed to a topic.

### 3. iOS kids/adult exclusion — both directions

Web browse already excludes `kids-*` slug categories in the DB query (`browse/page.tsx:120`). iOS adult browse (`HomeView.swift BrowseLanding:751–756`) has no such filter — adults see kids categories in the grid. Fix: add `.not("slug", operator: .like, value: "kids-%")` to the BrowseLanding categories query.

Kids surface exclusion: `VerityPostKids` already filters to `kids-*` categories in `KidsAppState.loadCategories()`. Verify the kids browse surface uses that same filtered list and does not have a separate unfiltered category query.

### 4. Category page articles filtered by visibility

The web category page (`/category/[id]/page.js:58–62`) fetches all published articles with no visibility filter. A multi-band story has adult + kids articles in the same category, both with `status = 'published'`. Adults would see kids articles; kids would see adult articles.

Fix for web: add `.eq('visibility', 'public')` to the articles query on the adult category page. Kids category pages (if they exist on web — currently kids web is redirect-only per product scope) are not in scope.

Fix for iOS: `CategoryDetailView` already includes `.eq("visibility", value: "public")` (`HomeView.swift:910`). No change needed on iOS adult. Verify kids app category view filters to `is_kids_safe = true`.

### 5. Category page article links — broken post-migration (obvious bug)

The category page fetches articles with `.select('*')` and links to `/story/${story.slug}` using `articles.slug`. After the stories-as-containers migration, canonical URLs route through `stories.slug`. The `/story/[slug]/` route redirects to `/<slug>` which looks up by `stories.slug`, not `articles.slug`.

Fix: change the category page articles query to `.select('*, stories(slug)')` and update the href to use `story.stories?.slug` instead of `story.slug`. Articles without a stories row get `href="#"` (same fallback as before, but now correct for articles that do have one).

### 6. "Top Contributors" sidebar — dropped

The category page has a 200px sidebar with hardcoded "No contributors yet." Dead placeholder. Remove the entire sidebar column (`/category/[id]/page.js:507–520`) and let the article list take full width.

---

## What browse is after execution

**Web `/browse`:** Category grid only. Text filter by category name. Each category card shows name, article count, and 2–3 recent article titles (existing client-side enrichment from the 500-article bulk fetch). No featured strip. No filter pills. Category cards link to `/category/<slug>` which resolves correctly via the existing `[id]` dynamic route.

**Web `/category/[id]`:** Category header (name, description, first-letter icon, back-to-browse link). Sort controls (Latest / Trending — Trending uses `view_count` client-side, the only place in the discovery surface where `view_count` drives ranking). Article cards with bookmarking. Load more (+3 per click from initial 5). Visibility filtered to `public`. Article links through `stories.slug`.

**iOS adult BrowseLanding:** Category grid, kids-slug categories excluded. N+1 parallel queries (count + 2-article preview per category) — unchanged, already works. No filter controls.

**iOS CategoryDetailView:** Article list, 50 articles, `published_at DESC`, no pagination — unchanged. Visibility already filtered to `public`.

---

## What was corrected from Session 1

Session 1 identified "web category pages don't exist" as the biggest user-visible gap. This was wrong — the page exists at `web/src/app/category/[id]/page.js` and handles both UUID and slug lookups. The Session 1 Explore agent searched for `[slug]` patterns and `.tsx` extensions and missed it. Browse links to `/category/<slug>` do work. The gap is narrower than stated: the page exists but has the article link bug, visibility gap, and dead sidebar documented above.

The system map (`00-system-map.md`) will be updated to reflect this correction.

---

## Deferred / out of scope

- **Subcategory display in browse** — `categories.parent_id` hierarchy exists in schema, not surfaced anywhere. Deferred to Slice 03 (Categories) which decides the subcategory model.
- **Pagination on web browse** — 500-article cap is fine at current volume. Revisit when category article counts approach that limit.
- **iOS N+1 query pattern** — parallel TaskGroup queries work correctly. Not worth rearchitecting to match web's bulk fetch at this scale.
- **`categories.article_count` column** — computed field, never used by browse (browse derives counts from the 500-article bulk fetch). Slice 03 should decide whether to use or drop it.
- **`view_count` as browse-level signal** — no ranking at browse level. `view_count` is used for Trending sort within the category page; that's enough.

---

## Cross-slice notes for INDEX.md

- **Structural Q1 (category FK) — resolved for browse.** Category lives on articles; no schema change needed. The visibility filter handles multi-band story leakage. Slice 03 (Categories) should confirm whether the category page needs to surface story-level grouping (e.g., showing one entry per story rather than one per article when a story has multiple articles in the same category).
- **Search as primary "get more info" path.** Owner noted the home magnifying glass → search is the primary deep-discovery tool. Category pages are entry points into a topic; search is where readers go when they know what they want. Slice 04 (Search) should treat search as a first-class discovery surface, not just a utility.
- **`is_featured` is now fully dead.** After browse drops the featured strip, `is_featured` has no consumer anywhere in the product. Slice 03 should decide whether to drop the column or repurpose it for category-page pinning.
