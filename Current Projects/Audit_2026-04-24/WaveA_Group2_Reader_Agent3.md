---
wave: A
group: 2 Reader surfaces
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Reader Surfaces, Wave A, Agent 3

## CRITICAL

### F-A2-3-01 — PATCH /api/bookmarks/[id] permission gate mismatch
**File:line:** `web/src/app/api/bookmarks/[id]/route.js:14`
**Evidence:**
```javascript
// Line 14
user = await requirePermission('bookmarks.note.edit');

// But endpoint is used for both notes AND collection moves:
// Line 51: if (notes !== undefined) update.notes = notes;
// Line 52: if (collection_id !== undefined) update.collection_id = collection_id || null;
```

Client-side (bookmarks/page.tsx:181-186):
```typescript
async function moveToCollection(id: string, collectionId: string | null) {
  const res = await fetch(`/api/bookmarks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ collection_id: collectionId }),
  });
}
```

**Impact:** Users with `canCollections=true` (paid tier) can call moveToCollection client-side, but the API gate requires `bookmarks.note.edit`. If note editing is a separate permission from collections, this creates a permission-mismatch scenario where collection moves fail for some paid users. Alternatively, if both should require the same permission, the gate should be more general (e.g., `bookmarks.update`). Either way, the constraint is asymmetric.

**Reproduction:** Code-reading only. Inspect permission resolver to confirm whether `bookmarks.collection.create` should also gate note/collection updates on PATCH.

**Suggested fix direction:** Unify PATCH permission gate to cover both note edits and collection moves (e.g., accept either `bookmarks.note.edit` OR separate `bookmarks.collection.move` permission).

**Confidence:** HIGH — the endpoint is dual-purpose but single-permission gate.

---

## HIGH

### F-A2-3-02 — Recap API bypasses paid-tier gate via 403 fallback
**File:line:** `web/src/app/api/recap/route.js:13`
**Evidence:**
```javascript
// Line 13
if (err.status === 403) return NextResponse.json({ recaps: [], paid: false });
```

If `requirePermission('recap.list.view')` rejects the user (status 403), the endpoint returns `{recaps: [], paid: false}` instead of propagating the 403. A free user hitting this route gets a 200 OK with empty recaps rather than a 403 Forbidden.

**Impact:** Silent permission bypass on the API surface — the client receives a 200 response instead of an auth error, masking any permission check failures. If the page (recap/page.tsx or wherever it's called) treats 200 as "no recaps available" vs 403 as "unauthorized," the distinction collapses.

**Reproduction:** Code-reading only. Send unauthenticated or free-tier request to GET /api/recap; should return 403, not {recaps: [], paid: false}.

**Suggested fix direction:** Let 403 propagate; only catch 401 (truly unauthenticated).

**Confidence:** HIGH — explicit fallback that shadows permission denial.

---

## MEDIUM

### F-A2-3-03 — Leaderboard rank calculation incomplete for paginated results
**File:line:** `web/src/app/leaderboard/page.tsx:296-304`
**Evidence:**
```typescript
// Line 296-304
useEffect(() => {
  if (!me || users.length === 0) {
    setMyRank(null);
    return;
  }
  const i = users.findIndex((u) => u.id === me.id);
  setMyRank(i >= 0 ? i + 1 : null);
}, [me, users]);
```

The rank is computed by finding the logged-in user's index in the loaded `users` array. All data-fetch paths on this page apply `.limit(50)` (line 181, 212, 288). If the user ranks #51 or below, `findIndex` returns -1, and `myRank` is set to `null` ("unranked in this view"). This is correct UI behavior — the comment at line 296 says "best-effort" — but the fallback display (line 343: "unranked in this view") doesn't distinguish between "outside the visible 50" vs "actually unranked per RLS filters." For a paid user with full visibility, seeing "unranked" after they've taken the action that qualifies them could be confusing.

**Impact:** Misleading "Your rank" display for users ranked >50. The UX doesn't signal whether they're outside the top-50 page or legitimately unranked. Low severity if the page is clearly paginated (e.g., "Top 50" label) but the current render doesn't indicate pagination.

**Reproduction:** Create a test user, rank them #60 in all-time verity_score, load leaderboard as that user → see "unranked in this view" instead of "#60".

**Suggested fix direction:** Add server-side RPC to compute true rank at load time, or clarify UI copy to "not in top 50" when beyond limit.

**Confidence:** MEDIUM — correct current behavior but incomplete signal to the user.

---

### F-A2-3-04 — Notifications GET unread_count excludes filter context
**File:line:** `web/src/app/api/notifications/route.js:49-55`
**Evidence:**
```javascript
// Line 49-55
const { count } = await service
  .from('notifications')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('is_read', false);

return NextResponse.json({ notifications: data || [], unread_count: count || 0 });
```

The `unread_count` is always the total unread notifications for the user, regardless of the `unread=1` query parameter. If the client requests `?unread=1&limit=100`, the response includes only unread notifications (line 40), but the `unread_count` is the same as if `?unread=0`. This means the UI can't distinguish "I'm showing 5 unread of 5 total unread" from "I'm showing 5 unread of 50 total unread (limited to 100 results)."

**Impact:** Client-side pagination logic can't determine if all unread notifications fit in the result set. If the count is 150 unread but only 100 returned, the UI won't know to show a "more" button. Low severity if the page doesn't paginate, but creates a false sense of "complete" data.

**Reproduction:** Create user with 150 unread notifications; request GET /api/notifications?unread=1&limit=100 → returns 100 items + unread_count=150 (correct), but if the UI treats this as "5 unread shown out of 5 total," it will omit a "load more" prompt.

**Suggested fix direction:** Return `unread_count` only when `?unread=1` is not set, or add a separate `filtered_count` field.

**Confidence:** MEDIUM — minor UX incompleteness if pagination is expected.

---

## LOW

### F-A2-3-05 — Bookmarks page missing error handling for permission changes mid-session
**File:line:** `web/src/app/bookmarks/page.tsx:156-163, 165-179, 181-193`
**Evidence:**
```typescript
// Three separate mutations (removeBookmark, saveNotes, moveToCollection)
// all call load() on error, but do not re-check permission gates.
// If user's plan downgrades mid-session (permission cache not yet refreshed),
// the DELETE or PATCH succeeds (RLS allows it), but canNote / canCollections
// stay true in state, UI remains interactive.
```

**Impact:** If a user is downgraded (e.g., subscription canceled) while the bookmarks page is open, the permission flags (`canNote`, `canCollections`) reflect the stale cache. The page allows interactions that should fail on the new plan tier. Since mutations are RLS-gated, the database rejects the writes, but the client doesn't update `canNote` / `canCollections` to match the rejection.

**Reproduction:** Open bookmarks page as paid user → cancel subscription in another tab → try to add a note on bookmarks page → API rejects (403 "paid only"), but canNote stays true, trying again shows the UI, doesn't grey out.

**Suggested fix direction:** On mutation 403 error, refresh permissions and re-check gates; toggle UI off if the permission reverted.

**Confidence:** LOW — edge case (mid-session downgrade), and RLS still protects the DB. UX degradation, not a security issue.

---

## UNSURE

None at this stage.

---

## Summary

**Critical issues:** 1 (permission gate mismatch on bookmarks PATCH)
**High issues:** 1 (recap 403 → 200 fallback)
**Medium issues:** 2 (leaderboard rank pagination, notifications unread_count context)
**Low issues:** 1 (stale permissions mid-session)

All findings require either permission-model clarification (F-A2-3-01) or API response logic review (F-A2-3-02 through F-A2-3-05). No FALLBACK_CATEGORIES hardcoding detected in home page. Category filters and empty states render correctly per spec. Skeleton loaders and pagination bounds are within normal limits (50-100 item batches).
