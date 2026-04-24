---
wave: B
group: 2 Reader surfaces
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Reader surfaces (Wave B, Group 2), Agent 2

## CRITICAL

### F-B2-01 — Bookmark POST does not check for existing bookmark before insert; allows silent duplicates

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/bookmarks/route.js:44-52`

**Evidence:**
```javascript
const { data, error } = await service
  .from('bookmarks')
  .insert({
    user_id: user.id,
    article_id,
    collection_id: collection_id || null,
    notes: notes || null,
  })
  .select('id')
  .single();
```

The route calls `.insert()` directly without first checking if a bookmark for this article already exists for the user. If a user clicks the bookmark button twice (network delay, accidental double-tap), the second request will create a duplicate row. The UI toggleBookmark logic (story/[slug]/page.tsx:778-807) checks `bookmarked` state before calling POST, but if two requests race or if the user navigates away and back within the same session before state refreshes, duplicates persist.

**Impact:** Corrupted bookmark list; user sees the same article multiple times in /bookmarks. Not RLS-gated (client controls article_id + user_id is from auth), so the trigger may reject on a unique constraint, but that returns a silent error rather than user feedback.

**Reproduction:** POST /api/bookmarks twice with the same { article_id } in rapid succession, or navigate away before the first response arrives, then return to /story/[slug].

**Suggested fix direction:** Query for existing bookmark (user_id + article_id) before insert; if found, return the existing ID; if not found, insert. upsert() pattern via RPC or manual check + conditional insert.

**Confidence:** HIGH

## HIGH

### F-B2-02 — Search API exposes subcategory filter but client never sends subcategory param; dead code path

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/search/route.js:76` + `/Users/veritypost/Desktop/verity-post/web/src/app/search/page.tsx:40-79`

**Evidence:**
```javascript
// route.js line 76
if (subcategory && (await hasPermissionServer('search.advanced.subcategory'))) {
  query = query.eq('subcategory_id', subcategory);
}
```

The search/page.tsx client UI only renders `canFilterCategory` dropdown (line 176-188) and never surfaces category drilling or subcategory selection. The state var `subcategory` is never declared or set. Meanwhile, the API route accepts `subcategory` param and applies permission-checked filtering, but the permission `search.advanced.subcategory` is never exercised.

**Impact:** Inconsistency in feature readiness. Subcategory filtering is half-implemented (server-side ready, client-side absent). If a future UI adds subcategory drilling, it will work, but the current state suggests incomplete rollout or accidental code-drift.

**Reproduction:** Note: Query param `subcategory=<id>` accepted by API but never sent by the client. Check the fetch URL construction in search/page.tsx:88-94 — subcategory is not included in params.

**Suggested fix direction:** Either remove subcategory handling from the server route (prune dead code) or complete the client UI (add category drill-down and subcategory picker). Current hybrid state is confusing.

**Confidence:** HIGH

## MEDIUM

### F-B2-03 — Bookmark pagination unbounded; result set can exceed memory on large lists

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/bookmarks/page.tsx:125-133`

**Evidence:**
```typescript
const { data: bms, error: bmsErr } = await supabase
  .from('bookmarks')
  .select(
    'id, notes, created_at, collection_id, articles!fk_bookmarks_article_id(...)'
  )
  .eq('user_id', authUser.id)
  .order('created_at', { ascending: false });
```

The query has no `.limit()`. A user with thousands of bookmarks (paid/unlimited tier) will fetch the entire result set in a single round-trip. The page loads all into React state (`items`), so a user with 50k bookmarks on a slower connection will block the UI during hydration and serialize/deserialize gigabytes of nested article data.

**Impact:** Performance degradation for power users. Potential OOM on mobile. Collections view (line 135-142) also loads unbounded, doubling the problem.

**Reproduction:** Create a user with many paid bookmarks (or inject test data). Load /bookmarks. Observe no pagination controls, no infinite scroll, no lazy-load strategy.

**Suggested fix direction:** Add `.limit(100)` to the initial query, implement a "Load more" button or infinite scroll, and paginate collections separately. Match the leaderboard's `.limit(50)` pattern.

**Confidence:** MEDIUM

### F-B2-04 — Story page passes all permissions to CommentThread but doesn't validate article access for paid content

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/story/[slug]/page.tsx:976-986` + `522-540`

**Evidence:**
```typescript
// Line 524-531: permissions set based on article.view.body etc
setCanViewBody(hasPermission('article.view.body'));
setCanViewSources(hasPermission('article.view.sources'));
setCanViewTimeline(hasPermission('article.view.timeline'));

// Line 978-986: CommentThread renders freely once quiz is passed
<CommentThread
  articleId={story.id}
  articleCategoryId={story.category_id}
  currentUserId={currentUser?.id}
  currentUserTier={userTier}
  justRevealed={justRevealedThisSession}
/>
```

The story page checks `canViewBody` (etc.) for article content gating, but the quiz gate + comment rendering don't re-verify the article's accessibility. If permissions change mid-session (e.g., subscription lapses), CommentThread still renders. The comment list itself will fail to fetch (server will RLS deny), but the UI structure flickers visible.

**Impact:** UX flaw (UI structure flashes before API denies access). Not a security hole (RLS gates the actual data), but user-visible glitch per "no silent failures" audit directive.

**Reproduction:** User is authed and passed quiz. Manually revoke `article.view.body` permission. Refresh the page. Comment thread renders but fails to load comments (server 403).

**Suggested fix direction:** Pass `canViewBody` (or a combined access flag) to CommentThread so it can conditionally render an "upgrade required" stub instead of the thread itself.

**Confidence:** MEDIUM

### F-B2-05 — Notifications page shows skeleton loader but never updates if permission fetch returns false

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/notifications/page.tsx:47-99`

**Evidence:**
```typescript
if (!permsReady || loading) {
  return (
    <div>
      <div style={{ height: 28, ... }} />
      {[0, 1, 2, 3].map((i) => (...))}
    </div>
  );
}
if (isAnon) {
  // render sign-up CTA
}
if (!canView) {
  // Falls here if authed but permissions deny
}
```

The skeleton loader appears while `permsReady && loading` both false. However, if `permsReady` flips true but `canView` is false (denied permission), the page jumps to the "Access denied" state without an intermediate loading skeleton. It's a minor UX inconsistency: anon users get a branded sign-up CTA, but denied authed users get a blank access-denied screen (line 173-178 is not shown in the excerpt but inferred from the flow).

**Impact:** Minor UX inconsistency. User briefly sees skeleton, then access-denied copy with no explanation. The briefing notes "no silent fails" — a "Contact support" link or explanation would be helpful here.

**Reproduction:** Authed user with revoked `notifications.inbox.view` permission. Load /notifications. Observe brief skeleton, then blank or minimal denied message.

**Suggested fix direction:** Add a friendlier "access denied" card (parallel to the anon sign-up CTA) that explains why and offers a support link.

**Confidence:** MEDIUM

## LOW

### F-B2-06 — Bookmark cap uses fallback (10) if plan_features query fails silently

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/bookmarks/page.tsx:108-122`

**Evidence:**
```typescript
if (!unlimited) {
  const { data: profile } = await supabase
    .from('users')
    .select('plan_id')
    .eq('id', authUser.id)
    .maybeSingle();
  const cap = await getPlanLimitValue(
    supabase,
    profile?.plan_id ?? null,
    'bookmarks',
    FALLBACK_BOOKMARK_CAP
  );
  if (typeof cap === 'number') setBookmarkCap(cap);
}
```

If `getPlanLimitValue` returns null or fails, the cap stays at `FALLBACK_BOOKMARK_CAP = 10`. A user on a plan with a 20-bookmark limit would be artificially constrained to 10 if the plan_features row is missing. The fallback is intentional per the comment, but there's no console.error or user-facing warning that the plan wasn't resolved.

**Impact:** User is under-served (stricter limit than entitled). Low probability (plan_features should be seeded for all plans), but silent degradation if it occurs.

**Reproduction:** Manually delete the plan_features row for a user's plan. Load /bookmarks. Observe cap is 10 (fallback) instead of the correct value.

**Suggested fix direction:** Log a warning if cap resolution fails; optionally surface an in-app banner to users hitting the fallback cap, explaining it may be incorrect.

**Confidence:** LOW

## UNSURE

### F-B2-07 — Search source filter returns up to 500 sources but frontend only shows 50 articles

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/search/route.js:84-92`

**Evidence:**
```javascript
const { data: srcArticleIds } = await service
  .from('sources')
  .select('article_id')
  .ilike('publisher', `%${source}%`)
  .limit(500);  // <-- fetch up to 500 article IDs
const ids = (srcArticleIds || []).map((r) => r.article_id);
if (ids.length === 0) return NextResponse.json({ articles: [], applied: { source } });
query = query.in('id', ids);  // then search articles, capped at 50 (line 52)
```

The source filter fetches 500 source rows, extracts article IDs, and passes them to the article query which has `.limit(50)` hardcoded. So the user sees at most 50 articles, but the sources query could have mapped 500 articles. The mismatch is unclear: is it intentional (limit to top 50 by publish date), or a bug (lose 450 results)?

**Impact:** Silent truncation of search results. A user filtering by a popular source (e.g., "Reuters") sees only 50 results and no "more results available" indicator.

**Reproduction:** Search for a keyword, filter by a popular source publisher. Manually query the sources table to confirm > 50 articles match that source + keyword. Observe only top 50 returned.

**Suggested fix direction:** Either increase the source query limit to match the article limit (to ensure parity), or add pagination + "show more" button. Clarify the intent in a comment (is the 50-article cap intentional rate-limiting?).

**Confidence:** LOW — could be intentional product choice, but worth confirming with the design team.

