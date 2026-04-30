# Slice 06 — Post-read engagement

**Status:** locked
**Investigated:** 2026-04-30 (session 8)
**Files in scope:** `web/src/app/[slug]/page.tsx`, `web/src/components/article/ArticleSurface.tsx`, `web/src/components/ArticleEngagementZone.tsx`, `web/src/components/FollowButton.tsx`, `web/src/app/following/page.tsx`, `web/src/app/api/bookmarks/route.js`, `web/src/app/bookmarks/page.tsx`

---

## Summary

The post-read infrastructure exists (bookmarks API, FollowButton, notifications) but nothing is wired into the story page. `BookmarkButton` does not exist as a component. Social share doesn't exist anywhere in the codebase. The article page ends at `CommentThread.tsx:1116` with no forward navigation. All six findings confirmed in code; all fix plans sealed. Adversarial review raised 11 clarifications, all absorbed below.

---

## FK hint check

`fk_bookmarks_article_id`, `fk_bookmarks_collection_id`, `fk_articles_category_id`, `fk_follows_follower_id`, `fk_follows_following_id` — all confirmed in `web/src/types/database.ts`. No broken hints.

---

## Findings

### F1 — Dead end: no forward navigation after article end
**Status:** decided
**Severity:** HIGH

**Reader experience:** After finishing an article and scrolling through the discussion, there is nothing pulling the reader to the next story. The page terminates at `CommentThread.tsx:1116`. No "next story," "back to front page," or category-contextual link exists anywhere in `[slug]/page.tsx`, `ArticleSurface.tsx`, or `ArticleEngagementZone.tsx`.

**Retention impact:** Directly ends sessions at the most engaged moment (post-discussion). Primary cause of drop-off.

**Root cause:** Infrastructure gap — no component was built for this at the story page level.

**Fix plan:**
- Create a new `NextStoryFooter` server component rendered in `[slug]/page.tsx` after `<ArticleEngagementZone>`.
- In `[slug]/page.tsx`, add `category_id` to `ARTICLE_SELECT` (currently at line 54). Add two parallel fetches in the `Promise.all`: (a) `categories` row for `article.category_id` (fetches `name, slug`); (b) up to 3 recent `stories` with matching `category_id`, excluding the current `story.id`, ordered `published_at DESC`.
- Pass `{ categoryName, categorySlug, nearbyStories }` as props to `NextStoryFooter`.
- Render: section heading "More in [Category]" (links to `/category/[categorySlug]`) + up to 3 story title links + "Back to edition" text link to `/`.
- Graceful fallback: if `category_id` is null, render only "Back to edition."
- Copy: "More in [Category]" · "Back to edition"

**Adversarial clarification absorbed:** Category data is not currently in the story page fetch. `ARTICLE_SELECT` must be extended; two additional server-side queries needed.

---

### F2 — No social share affordance
**Status:** decided
**Severity:** HIGH

**Reader experience:** No way to share an article from within the product. No share button, no Web Share API, no copy-link, no Twitter/X intent. The scraper at `web/src/lib/pipeline/scrape-article.ts:101` even strips `.social-share` elements from ingested content. The article has `NewsArticle` JSON-LD and OG metadata (layout-level defaults), but no reader-facing share path.

**Growth impact:** Sharing is the primary organic growth driver for a news product. Total absence removes viral/referral pathway entirely.

**Root cause:** Never built — no share component exists anywhere in the codebase.

**Fix plan:**
- Create a new `ShareButton` client component.
- Create a new `ArticleActions` client wrapper component rendered in `[slug]/page.tsx` between `<ArticleSurface>` and `<ArticleEngagementZone>` (not inside AEZ — see adversarial note below).
- `ArticleActions` receives `articleId: string`, `storySlug: string`, `currentUserId: string | null` from the server component.
- `ShareButton` receives `storySlug` and builds the URL: `${siteUrl}/${storySlug}`. `getSiteUrlOrNull()` is already used in `[slug]/page.tsx:207`.
- Implementation: `navigator.clipboard.writeText(url)`. Label: "Copy link" → "Copied" (1.8s reset, `setTimeout`).
- **Visible to all users including anon** — copy-URL is read-only, no auth required.
- Styling: minimal text button or icon + label, consistent with the rest of the article surface.

**Adversarial clarification absorbed:** Cannot live inside the `if (!currentUserId)` anon branch of `ArticleEngagementZone` (AEZ returns early for anon at line 30–39, before any header row). `ArticleActions` lives in `[slug]/page.tsx` above AEZ. Story slug is the route param and is already available at page level.

---

### F3 — No bookmark affordance on the story page
**Status:** decided
**Severity:** HIGH

**Reader experience:** Saving an article while reading requires navigating away to `/bookmarks`. `BookmarkButton` does not exist as a component. The bookmarks API (`web/src/app/api/bookmarks/route.js`) is fully built, gated by `v2LiveGuard` + `article.bookmark.add` permission, and the `/bookmarks` management page works with undo, collections, and export.

**Retention impact:** Bookmarking-in-context is a primary return driver. Without it, readers cannot build a reading list during the natural reading moment.

**Root cause:** API built; UI connector never created.

**Fix plan:**
- Create `BookmarkButton` client component, co-located with `ShareButton` in the `ArticleActions` row.
- `ArticleActions` passes `articleId` and `currentUserId` to `BookmarkButton`.
- On mount, if `currentUserId` is set: call `refreshAllPermissions()` (same pattern as `FollowButton.tsx:31–38`), then check `hasPermission('article.bookmark.add')`. If permission absent or anon: return null.
- Toggle state: icon-only (outlined → filled); calls `POST /api/bookmarks` with `{ article_id: articleId }`. The API is idempotent (returns existing ID on duplicate, `23505` guard in route.js).
- No removal from this button — removal is on `/bookmarks` page. Toggle is add-only on first interaction; subsequent clicks do nothing (already bookmarked state).
- Anon: `BookmarkButton` returns null. No sign-in prompt from the button itself (the article-level anon CTA from Slice 02 F2 handles conversion).

**Adversarial clarification absorbed:** Same placement issue as F2 — must be in `ArticleActions` above AEZ, not inside AEZ's anon branch. FollowButton pattern for permission check is the right model.

---

### F4 — No author attribution on the story page
**Status:** decided
**Severity:** MEDIUM

**Reader experience:** Articles render no author name anywhere in `ArticleSurface.tsx`. The owner confirmed content is primarily AI-generated, and the Slice 02 decision was no user-facing AI disclosure (TC/PP only). A traditional "By [Name]" byline would misrepresent the content's origin.

**Engagement impact:** Attribution builds brand recognition on every article read; a publication credit reinforces the editorial identity without misrepresenting authorship.

**Root cause:** No author field rendered in `ArticleSurface`; AI-generated content means no human byline applies.

**Decision:** Add a static "verity post" publication credit — not a human byline, not a link. This is standard practice for wire-service and publication-branded content.

**Fix plan:**
- In `ArticleSurface.tsx`, between the subtitle `<p>` (line ~90) and the `<div data-article-body>` wrapper:
  ```tsx
  <p style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16, letterSpacing: '0.03em' }}>
    verity post
  </p>
  ```
- No DB join. No link. No prop required — static string.
- Visible to all users in read mode including admin/editor (canEdit mode can keep it too; it's a brand label, not an edit control).
- Position: after subtitle, before body — confirmed clean insertion point at `ArticleSurface.tsx:90`.

**Adversarial clarification absorbed:** Exact position confirmed — after subtitle `<p>` and before `data-article-body` div. Use `var(--dim)` for consistency with existing muted text styling in ArticleSurface.

---

### F5 — `/following` page delivers wrong value for its name
**Status:** decided
**Severity:** MEDIUM

**Reader experience:** The `/following` page is named "following" but shows stories in `breaking/developing` status that the user has previously read — a content-status filter over their own reading history (`following/page.tsx:64–94`). A reader who follows a writer expects that writer's new articles; instead they get their own reading history filtered by active status.

**Engagement impact:** Misalignment between label and content erodes trust and undercuts the value of the feature.

**Root cause:** The page was built with the right logic for "active stories I've been reading" but named for a social follow feature that doesn't yet exist at this level.

**Fix plan:**
- Update H1 in `following/page.tsx:131–133` from "Following" to "Active Stories".
- Add or update page metadata export: `export const metadata = { title: 'Active Stories · verity post' }`.
- Add subtitle copy below H1: "Stories you've been reading that are still developing."
- Update `NavWrapper.tsx` nav label from "Following" to "Active Stories" — confirmed in `NavWrapper.tsx` (exact line to be verified at implementation time).
- No logic changes. Route stays `/following`.

**Adversarial clarification absorbed:** NavWrapper nav label is also "Following" and must be updated for consistency. Metadata export is missing from the page and needs to be added.

---

### F6 — No per-story OG image override
**Status:** deferred
**Named reason:** Low priority. No `[slug]/opengraph-image.tsx` exists in the route directory. Implementation requires a new file + potential `stories` table data fetch. Social preview quality is a secondary concern vs. F1–F5; defer post-launch. When addressed: create `web/src/app/[slug]/opengraph-image.tsx` following Next.js App Router `ImageResponse` pattern; render story headline + category on a brand-consistent card.

---

## Deferred decision — now resolved: Home anon CTA copy

**Was deferred in Slice 01** pending slices 04 + 05 being locked. Both are now locked.

**Decision:** Home footer sign-up CTA for signed-out visitors:

> "Create a free account to take the quiz and join the discussion."

**Applies to:** `_HomeFooter.tsx` — the single anon-state CTA remaining after the Slice 01 F1 fix removes closing sentences and Browse link. This copy replaces whatever placeholder exists. It names the core differentiator (quiz → discussion) in editorial register.

---

## Fix plan summary

| Finding | New files | Files to edit | Status |
|---|---|---|---|
| F1 — Forward navigation | `ArticleNavigationFooter.tsx` (or `NextStoryFooter.tsx`) | `[slug]/page.tsx` (ARTICLE_SELECT + Promise.all + render) | decided |
| F2 — Share button | `ShareButton.tsx`, `ArticleActions.tsx` | `[slug]/page.tsx` (render ArticleActions between AS and AEZ) | decided |
| F3 — Bookmark button | `BookmarkButton.tsx` | `ArticleActions.tsx` (compose with ShareButton) | decided |
| F4 — Publication credit | — | `ArticleSurface.tsx` (2-line addition after subtitle) | decided |
| F5 — /following rename | — | `following/page.tsx`, `NavWrapper.tsx` | decided |
| F6 — OG image | deferred | — | deferred |
| Home CTA | — | `_HomeFooter.tsx` | decided |

**Implementation dependencies:**
- F2 and F3 must ship together (same `ArticleActions` component).
- F1 requires extending `ARTICLE_SELECT` — verify this doesn't regress any existing type checks against `HomeStory` or article-level TypeScript types.
- F4 is standalone; smallest change in the program (2 lines in ArticleSurface).
- F5 is standalone; NavWrapper label must be updated in the same commit as the page H1.

**Pre-existing gap noted (not in scope):** `currentUserTier` prop is declared in `ArticleEngagementZone`'s interface but not passed from `[slug]/page.tsx:259`. Not a regression risk for this slice's changes; flag for a future audit pass.
