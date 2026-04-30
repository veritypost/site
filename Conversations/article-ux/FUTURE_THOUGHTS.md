# Article UX — Future Thoughts

Things noticed across this program that weren't in scope, were explicitly deferred,
or surfaced during implementation and are worth addressing later. Not ordered by priority.

---

## Explicitly deferred during this program

### OG image per article
The article route has no `opengraph-image.tsx`. Social previews show the generic site
image. When addressed: create `web/src/app/[slug]/opengraph-image.tsx` using Next.js
`ImageResponse`; render story headline + category on a brand-consistent card.
Named in Slice 06 as F6, deferred post-launch.

### Home feed model
The current home feed is filtered to today's articles only. Owner hasn't decided whether
the product moves to a finite curated list or a paginating rolling feed. This decision
gates the empty feed state (F9 from Slice 01) and any "load more" implementation.
Hold until owner call.

### Empty feed state (F9)
If the home feed returns zero articles, the page renders only the masthead.
`_HomeFetchFailed.tsx` documents this explicitly as a known gap. Unlikely once the
feed model moves off the today-only filter, but needs a designed state regardless.
Depends on the feed model decision above.

### Interstitial ad timing
The T30 delay before the discussion zone appears after quiz pass was accepted as-is
during Slice 03. Noted as a potential redesign if retention data shows drop-off at that
point. Revisit when monetization analytics are live.

### `stories` table missing `subtitle` and `description` columns
The article-lifecycle program's Slice 05 spec included these columns but the migration
didn't create them. Affects admin deferred-UI items. Needs a separate migration session.

---

## Pre-existing gaps noted but not in scope

### `currentUserTier` prop not passed to ArticleEngagementZone
`ArticleEngagementZone` declares `currentUserTier` in its interface but `[slug]/page.tsx`
doesn't pass it. The prop is unused downstream in the current code so it's not a visible
bug, but the interface is wrong. Check whether the tier is used anywhere in AEZ before
deciding whether to pass it or remove it from the interface.

### Bookmark button shows no pre-existing state on load
`BookmarkButton` initializes `bookmarked = false` always. If a user bookmarked an article
in a previous session and returns, the button shows "Bookmark" again. A fetch to
`/api/bookmarks?article_id=X` (or equivalent) on mount is needed to hydrate the initial
state. The toggle-off direction (removing a bookmark) is also unimplemented — once
bookmarked, it's permanent until deleted from the DB.

### No initial bookmark status query in article page fetch
Related to the above: the article page's `Promise.all` could include an initial
bookmark check for signed-in users (similar to the `user_passed_article_quiz` RPC check
already in the array). This avoids a second round-trip after hydration.

### `ShareButton` silent failure on non-clipboard environments
`navigator.clipboard.writeText` fails silently in non-HTTPS contexts and in some older
browser configurations. The catch block currently logs to console and does nothing.
A fallback (e.g. select-and-copy via `document.execCommand`, or showing the URL in a
prompt) would make sharing work on those edge cases. Not critical pre-launch.

### `brand.ts` Title Case vs. lowercase wordmark
`web/src/lib/brand.ts:21` exports `BRAND_NAME = 'Verity Post'` (Title Case). The memory
rule says the UI wordmark should be lowercase "verity post." These two sources of truth
are now in conflict — the publication credit in ArticleSurface uses a hardcoded string
rather than the constant to follow the memory rule. Should either update `brand.ts` to
match the UI rule or document the distinction (BRAND_NAME for structural contexts,
hardcoded lowercase for editorial/wordmark contexts).

### `/category/[id]` route named `[id]` but accepts slugs
`NextStoryFooter` links to `/category/${category.slug}`. The dynamic segment is named
`[id]` and the handler tries `.eq('id', id)` first, then falls back to `.eq('slug', id)`.
This works but the parameter name is misleading. The route should either be renamed to
`[slug]` or the handler should be documented to clarify the dual-mode resolution.

---

## Observations from implementation sessions

### `is_breaking` boolean on articles is a migration artifact
Locked in Slice 01: `stories.lifecycle_status` is canonical; `articles.is_breaking` is
a migration artifact. The boolean column should be dropped from the schema in a future
migration once all callers have been updated. Not done in this program — schema cleanup
deferred.

### `/following` URL doesn't match the new label
The page is now labelled "Active Stories" in the nav and H1, but the route is still
`/following`. This is intentional (we preserved the URL to avoid breaking deep links)
but if there's ever a URL cleanup pass, `/active-stories` would be more accurate.

### `ArticleActions` renders for COPPA articles
`ShareButton` is shown to all users including on kids/tweens articles (it sits inside
`ArticleActions`, which is inside the `!isCoppa` block — wait, actually re-check:
`ArticleActions` IS inside the `!isCoppa && article.status === 'published'` conditional
in `[slug]/page.tsx`. So this is already correct. But `NextStoryFooter` is outside
that block and renders for COPPA articles. The footer only has navigation links (no
engagement content), so this is acceptable — but worth confirming if Apple review
flags any COPPA surface questions.

### `NearbyRow` type defined inline in page.tsx
The type used to decode the nearby stories join result is defined inline with a `type`
declaration inside the function body. Fine for now, but if the type is ever reused or
the decode logic grows, it should be pulled to the top of the file or into a shared
types file.

### No skeleton/loading state during article page hydration
The article page (`force-dynamic`) renders fully server-side, so there's no client
hydration flicker on the article body itself. However, `BookmarkButton` and
`ArticleEngagementZone` have client-side permission checks that cause a brief null
render before the button/zone appears. If this is visually jarring once the page is
live with real users, placeholder shimmer states on those components would help.

---

## Things not investigated in this program (noticed incidentally)

### Reading time estimate
No reading time or word count is shown on article cards or the article page. Common
in news products. Would need a word-count field or a client-side estimate from `body`.

### Related articles by tag/topic
The "More in [Category]" footer is category-scoped. There's no tag or topic layer for
cross-category related content. If the product adds tags to articles, a more precise
"related" section could replace or complement the category-scoped one.

### Article share count / bookmark count
The `ArticleActions` row shows Share and Bookmark but neither displays a count.
If engagement metrics are important to readers or editors, a count badge on each
could be added — but this requires a public counter (like `view_count`) for each action.

### Keyboard/accessibility pass not done
This program was focused on UX and reading experience. A dedicated accessibility pass
(WCAG AA compliance, focus order, screen reader semantics) wasn't in scope. The
`role="doc-subtitle"` fix in Slice 02 is the only accessibility-targeted change.
The article page's main nav, quiz modal, comment composer, and expert dialog all
warrant a focused a11y review.
