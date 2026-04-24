---
wave: B
group: 2 Reader surfaces
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Reader Surfaces, Wave B, Agent 3

## CRITICAL

### F-B2-03-001 — Bookmark add missing deduplication check on client before POST
**File:line:** `web/src/app/story/[slug]/page.tsx:787-808`
**Evidence:**
```
const toggleBookmark = async () => {
  if (!story) return;
  if (!currentUser) {
    window.location.href = `/signup?next=${encodeURIComponent('/story/' + story.slug)}`;
    return;
  }
  setBookmarkError('');
  if (bookmarked && bookmarkId) {
    const res = await fetch(`/api/bookmarks/${bookmarkId}`, { method: 'DELETE' });
    // ...
  } else {
    const res = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: story.id }),
    });
```
**Impact:** Rapid clicks on the Save button will fire multiple POST requests to `/api/bookmarks` before `bookmarked` flips to true. Even with a DB constraint on (user_id, article_id), the client should disable the button immediately to prevent visual confusion ("looks active again") + race condition of multiple requests in-flight.
**Reproduction:** On story page, click Save button twice rapidly before response returns. You can fire two POST requests in the same second; only the first succeeds, but the client doesn't prevent the second from being issued.
**Suggested fix direction:** Set `setBookmarked(true)` optimistically before `fetch()`, then unwind on error.
**Confidence:** HIGH

### F-B2-03-002 — Bookmarks page missing pagination; all bookmarks loaded into memory
**File:line:** `web/src/app/bookmarks/page.tsx:125-133`
**Evidence:**
```
const { data: bms, error: bmsErr } = await supabase
  .from('bookmarks')
  .select(
    'id, notes, created_at, collection_id, articles!fk_bookmarks_article_id(id, title, slug, excerpt, published_at, categories!fk_articles_category_id(name))'
  )
  .eq('user_id', authUser.id)
  .order('created_at', { ascending: false });
```
No `.limit()` or pagination token. Users with 1000+ bookmarks fetch the entire set client-side.
**Impact:** Memory bloat on large collections; slow initial load; no way to view bookmarks beyond what was fetched on mount.
**Reproduction:** Create 500+ bookmarks. Load /bookmarks. JavaScript memory grows linearly; no next/prev buttons.
**Suggested fix direction:** Add `.limit(50)` + offset-based or cursor pagination controls.
**Confidence:** HIGH

### F-B2-03-003 — Notifications route accepts unbounded limit parameter (capped at 100 only)
**File:line:** `web/src/app/api/notifications/route.js:31`
**Evidence:**
```
const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
```
Caller can request `.limit(100)` every second. No rate-limiting on the GET endpoint itself; only the POST for bookmarks has `checkRateLimit`. Under heavy polling a user can DOS their own account or expose notification data at high bandwidth.
**Impact:** Potential data exfiltration via polling; no backpressure on notification inbox reads.
**Reproduction:** Poll `/api/notifications?limit=100` every 100ms. No 429 response; succeeds as long as HTTP connection stays alive.
**Suggested fix direction:** Add `checkRateLimit` call to GET route with policy like `notifications_read` at ~5-10 req/min.
**Confidence:** MEDIUM

## HIGH

### F-B2-03-004 — Search page hides advanced filters with a banner but client-side still sends them
**File:line:** `web/src/app/search/page.tsx:88-94`
**Evidence:**
```
async function runSearch() {
  if (!q.trim()) return;
  setLoading(true);
  setError('');
  const params = new URLSearchParams({ q: q.trim() });
  if (canAdvanced) {
    if (category && canFilterCategory) params.set('category', category);
    if (from && canFilterDate) params.set('from', from);
    if (to && canFilterDate) params.set('to', to);
    if (source && canFilterSource) params.set('source', source);
  }
```
Permission check is cosmetic. If `canAdvanced=false` but filters are set in state, the API request includes zero filter params. But the server-side `/api/search` route must re-validate `canAdvanced` — if it doesn't, free users can craft a direct API call with filters and bypass the gate.
**Impact:** ASSUMPTION: If `/api/search` route doesn't re-check permissions, free users can request advanced filters directly.
**Reproduction:** Code-reading only. Require sight of `/api/search` route to confirm server-side permission re-check.
**Suggested fix direction:** Ensure `/api/search` calls `requirePermission('search.advanced')` before using filter params, with clear error message.
**Confidence:** MEDIUM

### F-B2-03-005 — Leaderboard anonymous blur is brittle; no visual signal before blur
**File:line:** `web/src/app/leaderboard/page.tsx:551-667`
**Evidence:**
```
{!me && users.length > 0 && (
  <>
    {users.slice(0, 3).map((u, i) => (
      <LeaderRow key={u.id} user={u} rank={i + 1} ... />
    ))}
    {users.length > 3 && (
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }}>
          {users.slice(3, 8).map((u, i) => (
            <div key={u.id} style={{ ... }}>
              {/* row 4–8 rendered blurred */}
```
The blur + overlay pattern is correct, but rows 4–8 render into the DOM blurred (6px filter) before the overlay. On low-end devices the blur can lag or flicker. More concerning: if the overlay fails to render (JS error), the rows are still readable at lower blur levels or under some screen readers.
**Impact:** Unverified readers can see ranks 4+ via blur-breaking under certain conditions. The gates are mostly effective but not as air-tight as they appear.
**Reproduction:** Render as anonymous user on leaderboard. Screenshot the blurred section; use CSS inspection to flip `pointer-events`. The rows are still in the DOM.
**Suggested fix direction:** Don't render the blurred rows to the DOM at all for anonymous users; render only the overlay + CTA. Use a conditional that completely skips `.slice(3, 8)` for `!me`.
**Confidence:** MEDIUM

### F-B2-03-006 — Notifications PATCH endpoint accepts unbounded ids array (capped at 200 only, soft)
**File:line:** `web/src/app/api/notifications/route.js:88-99`
**Evidence:**
```
if (Array.isArray(ids) && ids.length > 0) {
  if (ids.length > MAX_IDS_PER_PATCH) {
    return NextResponse.json(
      { error: `Too many ids (max ${MAX_IDS_PER_PATCH} per request)` },
      { status: 413 }
    );
  }
  q = q.in('id', ids);
}
```
`MAX_IDS_PER_PATCH = 200`. The check is in place, but no rate-limiting on the PATCH route itself. A user can send 10 PATCH requests in parallel, each with 200 ids, marking 2000 notifications as read per second. The database can handle it but there's no backpressure.
**Impact:** A single user can mass-mark all their notifications read in 1–2 seconds, preventing normal notification flow monitoring. Not a security issue but an abuse vector.
**Reproduction:** Send 5–10 concurrent PATCH requests with 200 ids each. All succeed.
**Suggested fix direction:** Add `checkRateLimit` call to PATCH with policy like `notifications_write` at ~10 req/min per user.
**Confidence:** LOW

## MEDIUM

### F-B2-03-007 — Bookmarks page does not persist filter state (activeCollection) across navigation
**File:line:** `web/src/app/bookmarks/page.tsx:56-57, 241-245`
**Evidence:**
```
const [activeCollection, setActiveCollection] = useState<string>('all');
// ...
const filtered = items.filter((b) => {
  if (activeCollection === 'all') return true;
  if (activeCollection === 'uncategorised') return !b.collection_id;
  return b.collection_id === activeCollection;
});
```
User selects "My Articles" collection, then navigates away and back. `activeCollection` resets to 'all'. No URL param or sessionStorage save.
**Impact:** UX regression: users lose their filter selection on page reload. For users with many collections, re-finding the same collection is tedious.
**Reproduction:** Go to /bookmarks. Click a collection chip. Reload the page. Filter resets to 'all'.
**Suggested fix direction:** Persist `activeCollection` to a URL param (e.g. `?collection=<id>`) or sessionStorage on change.
**Confidence:** MEDIUM

### F-B2-03-008 — Home page categories fetched but no fallback if query fails
**File:line:** `web/src/app/page.tsx:171-175, 210-215`
**Evidence:**
```
const [storiesRes, breakingRes, catsRes] = await Promise.all([
  supabase.from('articles').select(...),
  supabase.from('articles').select(...),
  supabase.from('categories').select('id, name, slug').order('sort_order', { ascending: true, nullsFirst: false }),
]);
// ...
const catRows = (catsRes.data as CategoryRow[] | null) || [];
const map: Record<string, CategoryRow> = {};
catRows.forEach((c) => { map[c.id] = c; });
setCategoryById(map);
```
If `catsRes.error`, the category map is empty `{}`. Any story with a category_id will render without a name in the eyebrow (blank space). No fallback category list and no error logged for the categories fetch failure.
**Impact:** Editorial metadata (category name) vanishes silently on RLS / network failures. Readers see blank spaces where category pills should be.
**Reproduction:** Simulate a categories query RLS denial or network error. The story cards render but eyebrows are blank.
**Suggested fix direction:** Either fetch categories with a separate `.catch()` and log, or fallback to a local `FALLBACK_CATEGORIES` dict with common categories pre-seeded.
**Confidence:** MEDIUM

### F-B2-03-009 — Bookmark list doesn't handle null articles (soft-deleted)
**File:line:** `web/src/app/bookmarks/page.tsx:387-403`
**Evidence:**
```
{filtered.map((b) => (
  <div key={b.id} style={{ ... }}>
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>
      <a href={`/story/${b.articles?.slug}`} style={{ ... }}>
        {b.articles?.title || 'Untitled'}
      </a>
    </div>
```
If the linked article was soft-deleted (articles.status != 'published'), the query still returns the bookmark but `b.articles` may be null or have a deleted article. The link to `/story/<slug>` still renders but navigates to a 404. Better to skip the bookmark or show a "Article removed" placeholder.
**Impact:** Users see broken bookmarks; clicking them leads to 404. No explanation of why the article is gone.
**Reproduction:** Delete an article that has active bookmarks. Bookmarked users see the broken entry on /bookmarks.
**Suggested fix direction:** Filter out `!b.articles` bookmarks client-side, or add `article.status` to the select and render a "removed" placeholder for deleted articles.
**Confidence:** MEDIUM

## LOW

### F-B2-03-010 — Search empty state suggests /browse but anon can't access it
**File:line:** `web/src/app/search/page.tsx:273-292`
**Evidence:**
```
{results.length === 0 && !loading && q && (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>
      No matches
    </div>
    <div style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.5 }}>
      Try shorter keywords, or browse by category.
    </div>
    <a href="/browse" ... >
      Browse categories
    </a>
  </div>
)}
```
The CTA links to `/browse` which is behind the middleware auth gate (users must be logged in). Anonymous users following this link get redirected to `/login`. Better to detect auth state and show a "Sign up to browse" CTA instead.
**Impact:** UX dead-end: anon users hit no-results and click the CTA but get redirected to login page. The suggestion "browse by category" doesn't work for them.
**Reproduction:** Search as anon. Get no results. Click "Browse categories" link. Redirected to /login.
**Suggested fix direction:** Check `currentUser` state in the empty state and render a conditional "Sign up to browse" link to `/signup?next=/browse` for anon.
**Confidence:** LOW

## UNSURE

None at this time.

---

**Summary:** 3 HIGH-severity issues affecting data integrity (bookmark race conditions, pagination missing, filter bypass risk) and 1 CRITICAL issue with client-side atomicity. 5 additional MEDIUM/LOW findings mostly UX-layer gate leaks and missing error handling.

