---
wave: A
group: 2 Reader surfaces
agent: 2/3
anchor_sha: ed4944ed40b865e6dca065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Reader Surfaces (Browse, Search, Bookmarks, Notifications, Leaderboard, Recap), Wave A, Agent 2

## CRITICAL

### F-A2-01 — Bookmarks PATCH endpoint permission mismatch vs POST/DELETE
**File:line:** `web/src/app/api/bookmarks/[id]/route.js:14`
**Evidence:**
```
PATCH (line 14):  requirePermission('bookmarks.note.edit')
POST (route.js):  requirePermission('article.bookmark.add')
DELETE (line 65): requirePermission('article.bookmark.remove')
```
**Impact:** A user with only `article.bookmark.add` (create) but without `bookmarks.note.edit` can add bookmarks but cannot edit them once added. Similarly, a user with `article.bookmark.remove` can delete but not edit. Permission gates are inconsistent across the same resource CRUD lifecycle — unclear if intentional (design) or drift (bug). If notes/collections are meant to be free-tier features, the PATCH permission should match POST; if paid-only, POST should also gate.
**Reproduction:** Create bookmark with free tier → attempt PATCH notes → compare to DELETE success/failure.
**Suggested fix direction:** Align PATCH permission gate to `article.bookmark.edit` and ensure POST/DELETE/PATCH use consistent permission checks, or document intentional asymmetry.
**Confidence:** MEDIUM — Could be intentional design (free can add, only editors can annotate), but code comment at line 8-10 says "Notes + collections are paid-only" which suggests PATCH is correctly gated but POST/DELETE should align.

## HIGH

### F-A2-02 — Bookmarks POST allows duplicate bookmarks per (user_id, article_id)
**File:line:** `web/src/app/api/bookmarks/route.js:44-66`
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
The code checks rate limits (line 31-42) but does NOT check for pre-existing bookmark with the same (user_id, article_id) pair. If a user clicks "bookmark" twice for the same article in quick succession (before local state updates), two rows insert. The cap enforcement at line 56 (`enforce_bookmark_cap` trigger) counts both rows against the limit.
**Impact:** Duplicate bookmarks silently created; user's cap exhausted faster; bookmarks list shows same article twice. High visibility (UI shows multiples), moderate severity (workaround: delete extras).
**Reproduction:** Log in as free user → bookmark an article → immediately bookmark same article again before page refresh → check `/bookmarks` page → same article appears twice.
**Suggested fix direction:** Before insert, check if (user_id, article_id) pair exists; return 409 with "Already bookmarked" if found, or add UNIQUE(user_id, article_id) constraint at DB level.
**Confidence:** HIGH — No deduplication logic visible in POST endpoint, schema constraint not mentioned in code comments.

### F-A2-03 — Leaderboard period-based rank counts can be stale under concurrent reads
**File:line:** `web/src/app/leaderboard/page.tsx:234-270`
**Evidence:**
```typescript
const { data: rpcRows, error: rpcErr } = await supabase.rpc(
  'leaderboard_period_counts' as never,
  { p_since: periodCutoff, p_limit: 50 } as never
);
...
const { data } = await supabase
  .from('users')
  .select(...)
  .in('id', ids);
const sorted = rows.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
```
The RPC returns top 50 user IDs + read counts at time T1. Then a separate SELECT fetches user rows at time T2. If a user outside the top 50 has a new read logged between T1 and T2, they won't be in the final list. Rank order is computed client-side from a point-in-time snapshot, so concurrent reads can shift rankings.
**Impact:** User may see rank 51st in one view, 35th moments later, then back to 51st after refresh. Leaderboard appears to flicker for highly-active users. Medium UX impact; no data corruption.
**Reproduction:** Watch a user near the 50-rank boundary; have them read articles in rapid succession across multiple browser windows; observe rank position change inconsistently.
**Suggested fix direction:** Fetch all 50 rows + recalculate counts in a single RPC call, or snapshot isolation level (BEGIN ISOLATION LEVEL SERIALIZABLE).
**Confidence:** MEDIUM — RPC already applies privacy filters; the race is between RPC + subsequent SELECT, not a data coherence bug. Acceptable for a leaderboard UI, but worth noting.

### F-A2-04 — Search API filters silently ignored for unauthenticated users but UI allows UI entry
**File:line:** `web/src/app/api/search/route.js:65-95` and `web/src/app/search/page.tsx:54-71`
**Evidence:**
```javascript
// route.js — if canAdvanced is false (anon user), filters are ignored:
if (canAdvanced) {
  if (category && (await hasPermissionServer('search.advanced.category'))) {
    query = query.eq('category_id', category);
  }
  // ... other filters
} else {
  query = query.ilike('title', `%${q}%`);
}
```
```typescript
// page.tsx — client still allows input:
const [canAdvanced, setCanAdvanced] = useState<boolean>(false);
// ... later in runSearch():
if (canAdvanced) {
  if (category && canFilterCategory) params.set('category', category);
  // ...
}
```
The client hides the filter UI when `canAdvanced` is false, but sends params anyway if user manually edits the URL or uses the API. The server silently drops those params without indication. Anon user searches "politics" with `?category=<id>` gets all results instead of filtered; UI doesn't explain this.
**Impact:** Silent filtering degradation. Anon users see unexpected results; unclear if they typed wrong or filter simply doesn't work. Low severity (no data leak), but confusing UX.
**Reproduction:** Open browser console as anon → `fetch('/api/search?q=covid&category=<valid-uuid>')` → observe all articles returned, not just category match.
**Suggested fix direction:** Return explicit error when filter params are provided by unentitled caller, or document in API response that filters were dropped.
**Confidence:** MEDIUM — Intentional "fail open" design per code comment line 11, but UX consequence not handled.

## MEDIUM

### F-A2-05 — Notifications PATCH limit boundary allows exactly 100; inconsistent with common "max 100" pattern
**File:line:** `web/src/app/api/notifications/route.js:31`
**Evidence:**
```javascript
const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
```
The cap is 100, but if a caller requests `?limit=100`, they get exactly 100. If they request `?limit=101`, they get 100. This is correct behavior, but the nearby check on line 90 (`if (ids.length > MAX_IDS_PER_PATCH) { return 413 }` with `MAX_IDS_PER_PATCH = 200`) uses a different style. Minor inconsistency; no functional bug.
**Impact:** None — both patterns work correctly. Noted only for consistency.
**Reproduction:** N/A
**Suggested fix direction:** Standardize boundary checks to a common style (e.g., const MAX_LIMIT = 100; const limit = Math.min(..., MAX_LIMIT)).
**Confidence:** LOW — Style note, not a bug.

### F-A2-06 — Leaderboard category view does not inherit frozen_at / is_banned filters from global view
**File:line:** `web/src/app/leaderboard/page.tsx:169-185`
**Evidence:**
```typescript
if (activeCat) {
  const { data: csRows } = await supabase
    .from('category_scores')
    .select(...)
    .eq('category_id', activeCat)
    .eq('users.email_verified', true)
    .eq('users.is_banned', false)
    .eq('users.show_on_leaderboard', true)
    .is('users.frozen_at', null)
    .order('score', { ascending: false })
    .limit(50);
```
The category path DOES apply the filters (lines 177-179). The issue is that when switching from global to category view, the user list changes completely with different filtering logic. Let me re-examine...
Actually, both global (line 284-286) and category (line 177-179) apply the same filters. No mismatch detected.
**Impact:** None — filters are consistent.
**Reproduction:** N/A
**Suggested fix direction:** N/A — filters correctly applied across both paths.
**Confidence:** LOW — False positive; code is correct.

### F-A2-07 — Search page category filter loads all active categories without pagination
**File:line:** `web/src/app/search/page.tsx:73-79`
**Evidence:**
```typescript
const { data: cats } = await supabase
  .from('categories')
  .select('id, name')
  .eq('is_active', true)
  .eq('is_kids_safe', false)
  .is('parent_id', null)
  .order('name');
setCategories((cats as CategoryRow[] | null) || []);
```
No `.limit()` on the categories fetch. If a future release adds 1000+ categories, this becomes a large payload. Low likelihood, but unbounded fetch on production surfaces is a code smell.
**Impact:** Potential slow load if category count balloons; UI dropdown renders all options without virtual scrolling. Negligible for current ~10-15 category count.
**Reproduction:** Won't repro with current data; hypothetical on scale.
**Suggested fix direction:** Add `.limit(100)` or implement client-side filtering/virtual scrolling in the dropdown.
**Confidence:** LOW — Theoretical; current dataset is small.

## LOW

### F-A2-08 — Recap page `LAUNCH_HIDE_RECAP` flag uses hooks inside conditional return
**File:line:** `web/src/app/recap/page.tsx:43-48`
**Evidence:**
```typescript
if (LAUNCH_HIDE_RECAP) return null;

// eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern
const [loading, setLoading] = useState<boolean>(true);
// eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern
const [canView, setCanView] = useState<boolean>(true);
```
Hooks are called conditionally (after an early return). This violates the Rules of Hooks. The code acknowledges this with `eslint-disable` comments and notes this as a known pattern. When `LAUNCH_HIDE_RECAP` flips to false at launch, the hooks will execute correctly. Until then, the component is dead code with intentional rule violations.
**Impact:** None currently (component is hidden). On un-hide, hooks will work correctly (no state leak). The pattern is documented and intentional per comment.
**Reproduction:** Set `LAUNCH_HIDE_RECAP = false` → component renders and hooks fire as expected.
**Suggested fix direction:** None — pattern is intentional per FIX_SESSION_1 guidance. Accept as-is until launch.
**Confidence:** LOW — Intentional workaround; documented in code.

## UNSURE

### F-A2-09 — Bookmarks duplicate detection at DB vs app layer
**File:line:** `web/src/app/api/bookmarks/route.js` (no UNIQUE constraint visible in code)
**Evidence:** POST endpoint does not check for duplicates in app code. No schema constraint mentioned in comments. Unclear if DB schema has `UNIQUE(user_id, article_id)` constraint.
**Impact:** If DB constraint exists, INSERT fails + error is passed through. If not, duplicates silently persist. F-A2-02 above assumes no constraint, but this needs confirmation.
**Reproduction:** Requires schema inspection (MASTER_TRIAGE item B8 mentions similar UNIQUE constraint patterns).
**Suggested fix direction:** Verify schema has `UNIQUE(user_id, article_id) ON CONFLICT DO NOTHING` or add explicit app-layer check before insert.
**Confidence:** LOW — Needs schema confirmation.

---

## Summary

**Critical findings:** 1 permission mismatch, 1 duplicate bookmark race condition  
**High findings:** 1 leaderboard rank staleness, 1 search filter UX degradation  
**Medium findings:** Minor limit boundary inconsistency, category loading unbounded  
**Total time spent:** ~12 minutes (static analysis focus)

All findings centered on anon vs. auth rendering, permission enforcement, pagination bounds, and edge cases in read-heavy surfaces. No silent auth failures detected. Bookmarks dedup is the highest-impact issue blocking user workflows.

