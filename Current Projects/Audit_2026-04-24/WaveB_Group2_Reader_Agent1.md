---
wave: B
group: 2 Reader Surfaces
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Reader Surfaces, Wave B, Agent 1

## CRITICAL

### F-B2-1-01 — Bookmarks PATCH permission gate mismatch: `bookmarks.note.edit` required but UI sends requests with only `collection_id`

**File:line:** `web/src/app/api/bookmarks/[id]/route.js:14` (API gate) and `web/src/app/bookmarks/page.tsx:100,181-193` (UI dispatch)

**Evidence:**
```javascript
// API route — requires bookmarks.note.edit for ALL PATCH requests (line 14)
export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requirePermission('bookmarks.note.edit');  // Blocks here
  } catch (err) {
    return NextResponse.json({ error: 'Forbidden' }, { status: err.status });
  }
  // ... later, lines 40-48 check isPaid before accepting collection_id
  if (notes !== undefined || collection_id !== undefined) {
    const { data: isPaid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
    if (!isPaid) {
      return NextResponse.json({ error: 'Collections and notes are available on paid plans' }, { status: 403 });
    }
  }
```

```typescript
// UI page — sets canCollections based on bookmarks.collection.create (line 100)
const collectionsOk = hasPermission('bookmarks.collection.create');
setCanCollections(collectionsOk);

// Calls PATCH with collection_id only (lines 181-193)
async function moveToCollection(id: string, collectionId: string | null) {
  const res = await fetch(`/api/bookmarks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection_id: collectionId }),  // Only collection_id
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    setError(d?.error || 'Move failed');  // Silent error — user sees "Move failed"
    return;
  }
  await load();
}
```

**Impact:** Any user with `bookmarks.collection.create` permission (paid tier, can create collections) cannot move bookmarks between collections. The PATCH endpoint requires `bookmarks.note.edit`, which is a different permission. The user sees "Move failed" error with no indication that the backend rejected the whole request due to a missing permission gate. The collection selector renders (line 426), responds to changes, but always fails.

**Reproduction:** 
1. Log in as paid user with `bookmarks.collection.create` permission
2. Create 2+ collections (visible at line 287-292)
3. Bookmark an article
4. Click the collection dropdown on the bookmark
5. Select a different collection → "Move failed" error

**Suggested fix direction:** Split PATCH into two handlers (or check operation type): one requiring `bookmarks.collection.move` for collection_id only, one requiring `bookmarks.note.edit` for notes. Alternatively, gate collections + notes under a single unified permission like `bookmarks.update`.

**Confidence:** HIGH

---

## HIGH

### F-B2-1-02 — Bookmarks page displays collection UI and buttons when `canCollections=true`, but PATCH to move collections will fail with 403 "Forbidden" for users without `bookmarks.note.edit`

**File:line:** `web/src/app/bookmarks/page.tsx:100,333-383` (render gate) and `web/src/app/api/bookmarks/[id]/route.js:14,40-48` (server-side enforcement)

**Evidence:**
The UI renders collection pills and dropdowns if `canCollections=true` (line 333-383), but the server-side check in PATCH (line 14 of route.js) blocks the request before the paid-user verification in lines 40-48 can run.

**Impact:** Users with `bookmarks.collection.create` see the full collection UI, attempt to organize their bookmarks, and receive a cryptic "Move failed" error. No feedback that they lack a separate permission. Collections feature appears broken for paid users instead of gated correctly.

**Reproduction:** Same steps as F-B2-1-01.

**Suggested fix direction:** Modify PATCH to check permission conditionally: if only `collection_id` in payload, allow free users (or require a separate `bookmarks.collection.move` permission); if `notes` in payload, require `bookmarks.note.edit`.

**Confidence:** HIGH

---

## MEDIUM

### F-B2-1-03 — Bookmarks POST endpoint references "Bookmark limit reached (max N on your plan)" in error comment but endpoint delegates cap enforcement to database trigger

**File:line:** `web/src/app/api/bookmarks/route.js:54-64`

**Evidence:**
```javascript
// Line 55: POST inserts without client-side cap check
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
if (error) {
  // Lines 56-59: comment says error comes from trigger
  // P0001 from `enforce_bookmark_cap` carries the actual cap message
  return safeErrorResponse(NextResponse, error, {
    route: 'bookmarks.POST',
    fallbackStatus: 400,
    fallbackMessage: 'Could not save bookmark',
  });
}
```

**Impact:** The endpoint relies on a database trigger (`enforce_bookmark_cap`) to reject inserts over cap. If the trigger is missing, disabled, or fires after a cap increase, users could exceed their quota. The client-side cap check on the bookmarks page (line 81: `atCap = !canUnlimited && items.length >= bookmarkCap`) is decorative; it doesn't block POST, only hides the button. A direct API caller can still exceed cap.

**Assumption:** The trigger exists and is correctly configured (high confidence based on comment references).

**Suggested fix direction:** Add a server-side cap check in POST before insert, or document the trigger name and verify it's never disabled.

**Confidence:** MEDIUM

---

## LOW

### F-B2-1-04 — Bookmarks PATCH endpoint at line 55 does not include `user_id` in WHERE clause on update, relying on RLS

**File:line:** `web/src/app/api/bookmarks/[id]/route.js:55`

**Evidence:**
```javascript
// Verified ownership at lines 31-38
const { data: bm } = await service
  .from('bookmarks')
  .select('id, user_id')
  .eq('id', params.id)
  .maybeSingle();
if (!bm || bm.user_id !== user.id) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// But UPDATE at line 55 omits user_id in WHERE
const { error } = await service.from('bookmarks').update(update).eq('id', params.id);
```

**Impact:** LOW. The code verifies ownership first, then updates by ID only. RLS should prevent cross-user updates if enabled. However, the absence of `.eq('user_id', user.id)` in the UPDATE means RLS is the only defense. If RLS is ever disabled, disabled for this role, or there's a policy gap, an attacker could update other users' bookmarks.

**Suggested fix direction:** Add `.eq('user_id', user.id)` to the UPDATE query for defense-in-depth (matches the DELETE endpoint at line 82 which does include it).

**Confidence:** LOW (RLS should be present; DELETE shows the pattern; but defensive practice is missing here)

---

## UNSURE

None at this time. All findings have sufficient first-hand evidence from code inspection.

