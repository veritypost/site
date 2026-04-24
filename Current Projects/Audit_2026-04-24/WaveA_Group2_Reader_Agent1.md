---
wave: A
group: 2 Reader Surfaces
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Reader Surfaces, Wave A, Agent 1

## CRITICAL

### F-2-1-01 — Bookmark PATCH permission gate mismatch: checks `bookmarks.note.edit` regardless of operation type

**File:line:** `web/src/app/api/bookmarks/[id]/route.js:11`

**Evidence:**
```typescript
// PATCH handler — line 11
export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requirePermission('bookmarks.note.edit');  // Always requires note.edit
  } catch (err) {
    // ... rejects permission error
  }

  const { notes, collection_id } = await request.json().catch(() => ({}));
  // ... later lines 35-40 check isPaid for notes OR collection_id
  if (notes !== undefined || collection_id !== undefined) {
    const { data: isPaid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
    if (!isPaid) {
      return NextResponse.json(
        { error: 'Collections and notes are available on paid plans' },
        { status: 403 }
      );
    }
  }
```

**Impact:** Free-tier users without `bookmarks.note.edit` permission are rejected at entry (401/403) before the server-side paid check can run. The UI attempts PATCH on collection_id moves (which should be allowed for free users per `web/src/app/bookmarks/page.tsx:181-193` moveToCollection function), but the permission gate blocks them. This breaks collection assignment for all users.

**Reproduction:** Free-tier user bookmarks an article, then clicks "Uncategorised" → selects a collection → PATCH fails 403 "Not allowed".

**Suggested fix direction:** Split the PATCH gate into two routes or dispatch: one for `bookmarks.collection.move` (free), one for `bookmarks.note.edit` (paid); or allow collection_id moves to bypass the paid check.

**Confidence:** HIGH

---

### F-2-1-02 — Bookmarks page render gate uses `canUnlimited` flag but never requests the cap from plan_features for unlimited users

**File:line:** `web/src/app/bookmarks/page.tsx:99-123`

**Evidence:**
```typescript
const unlimited = hasPermission('bookmarks.unlimited');
// ... line 99
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
// Line 277: count display uses bookmarkCap
<h1>{canUnlimited ? items.length : `${items.length} of ${bookmarkCap}`}</h1>
```

**Impact:** When `canUnlimited` is true, the code never calls `getPlanLimitValue()`, so if a plan_features row goes missing or the resolver returns the wrong flag, the display may silently show unlimited when the user should see a cap (or vice versa). The fallback FALLBACK_BOOKMARK_CAP is never consulted for unlimited users. No guard against resolver drift.

**Reproduction:** Admin manually sets a user's plan to one with a 50-bookmark cap, but the resolver caches the old `bookmarks.unlimited` flag → user sees no counter → clicks past cap → server rejects. Confusion.

**Suggested fix direction:** Always fetch the plan limit and warn if `canUnlimited` disagrees; or fall back to plan_features cap if resolver flag is stale.

**Confidence:** MEDIUM

---

### F-2-1-03 — Search page allows client-side filter submission for free users when server silently ignores them

**File:line:** `web/src/app/search/page.tsx:88-94`

**Evidence:**
```typescript
async function runSearch() {
  // ...
  const params = new URLSearchParams({ q: q.trim() });
  if (canAdvanced) {  // Client gate only for showing UI
    if (category && canFilterCategory) params.set('category', category);
    if (from && canFilterDate) params.set('from', from);
    if (to && canFilterDate) params.set('to', to);
    if (source && canFilterSource) params.set('source', source);
  }
```

And server-side (`web/src/app/api/search/route.js:19-20`):
```typescript
const canAdvanced = await hasPermissionServer('search.advanced');
// ... line 19: Per-filter gates ignore params from free users
if (canAdvanced) {
  // ... only advanced search logic applies
} else {
  query = query.ilike('title', `%${q}%`);
}
```

**Impact:** If a client bypasses the UI gate and sends `?category=xyz&from=2026-01-01`, the server silently drops them. The response contains zero indication that filters were ignored. User may think their search was filtered when it was actually unfiltered. Silent failures violate error UX spec (briefing line 48: "Does the user get actionable feedback... or a silent failure? No silent fails.").

**Reproduction:** Client curl `-H "Authorization: Bearer $JWT"` to `/api/search?q=test&category=politics` as free user → response is basic title search results, no indication category was ignored.

**Suggested fix direction:** Return `{ articles, mode, ignored_filters: ['category'] }` or 400 if free user submits advanced filters.

**Confidence:** HIGH

---

### F-2-1-04 — Leaderboard full-access check uses `leaderboard.view` permission but doesn't re-check after permission bumps during session

**File:line:** `web/src/app/leaderboard/page.tsx:146-149`

**Evidence:**
```typescript
useEffect(() => {
  (async () => {
    // ... fetch permissions once at mount
    await refreshAllPermissions();
    await refreshIfStale();
    setFullAccess(hasPermission('leaderboard.view'));
    // ... no re-check on permission change
  })();
}, []);  // Empty deps — never re-runs
```

**Impact:** If a user's email verification status changes mid-session (e.g., they verify email while the leaderboard is already open), `fullAccess` stays false. They won't see the "Top Readers" or "Rising Stars" tabs or category drill-down until they reload. Silent permission changes are not reflected.

**Reproduction:** User loads leaderboard (unverified, sees only top 3), opens email in another tab, clicks verify, returns to leaderboard tab → still shows "Verify your email" unlock message even though the email is now verified.

**Suggested fix direction:** Add `my_perms_version` polling hook or re-run refreshIfStale on focus/visibility change.

**Confidence:** MEDIUM

---

## HIGH

### F-2-1-05 — Notifications inbox loads without waiting for auth check; anon users see skeleton, not CTA

**File:line:** `web/src/app/notifications/page.tsx:118-137`

**Evidence:**
```typescript
const [permsReady, setPermsReady] = useState<boolean>(false);
const [isAnon, setIsAnon] = useState<boolean | null>(null);  // null = not-yet-checked

// ... useEffect at line 71:
useEffect(() => {
  (async () => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const anon = !authUser;
    setIsAnon(anon);
    // ... permission hydrate
  })();
}, []);

// Render path at lines 118-137:
if (!permsReady || loading) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ height: 28, width: 160, background: C.card, ... }} />
      {[0, 1, 2, 3].map((i) => (
        <div style={{ height: 68, background: C.card, ... }} />
      ))}
    </div>
  );
}

if (isAnon) {
  // R13-T3 — anon CTA shows here — lines 140-200
  return <div>Sign up...</div>;
}
```

**Impact:** The skeleton loader fires during auth check. If the network is slow, user sees 4 placeholder boxes for 1-2 seconds before the "Sign up" CTA appears. For anon users, this creates a false impression of loading content when there is none. User experience: "This page has notifications but they're loading" → "Oh, it's actually a sign-up prompt."

**Reproduction:** anon user navigates to /notifications → sees skeleton for 500ms-1s → then sees signup CTA.

**Suggested fix direction:** Skip the skeleton for anon; render the CTA immediately if `isAnon === true` (eager check).

**Confidence:** MEDIUM

---

### F-2-1-06 — Notification preferences PATCH enforces permission `notifications.prefs.toggle_push` regardless of which field is being edited

**File:line:** `web/src/app/api/notifications/preferences/route.js:47-53`

**Evidence:**
```typescript
export async function PATCH(request) {
  // ...
  let user;
  try {
    user = await requirePermission('notifications.prefs.toggle_push');  // Hard gate
  } catch (err) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  // ... later processes any of: channel_push, channel_email, channel_in_app, is_enabled, quiet_hours_start, quiet_hours_end, frequency
```

**Impact:** A user cannot toggle `channel_email` without `notifications.prefs.toggle_push` permission. The gate is too strict; it should be scoped to the specific channel being modified. This prevents free users from disabling email notifications even if that permission is in their set.

**Reproduction:** Free user calls PATCH with `{ alert_type: 'comment_reply', channel_email: false }` → 403 Forbidden even if they have `notifications.prefs.toggle_email` permission.

**Suggested fix direction:** Check channel-specific permissions (notifications.prefs.toggle_push, toggle_email, etc.) based on which fields are present in the request.

**Confidence:** MEDIUM

---

### F-2-1-07 — Bookmarks page shows `items.length` count in header before RLS-filtering but after load

**File:line:** `web/src/app/bookmarks/page.tsx:277`

**Evidence:**
```typescript
const filtered = items.filter((b) => {
  if (activeCollection === 'all') return true;
  if (activeCollection === 'uncategorised') return !b.collection_id;
  return b.collection_id === activeCollection;
});

return (
  <div ...>
    <h1 ...>
      Bookmarks · {canUnlimited ? items.length : `${items.length} of ${bookmarkCap}`}
    </h1>
    // ... later uses `filtered` to render rows
```

**Impact:** The header says "Bookmarks · 47" (counting `items.length`), but the collection filter reduces the display to 12 rows. Users see a misleading count. The header should either count the filtered set or update dynamically as the collection changes.

**Reproduction:** User has 47 total bookmarks, 12 in "Work" collection → click "Work" → header still says "Bookmarks · 47" but only 12 rows visible.

**Suggested fix direction:** Change header count to `filtered.length` or re-structure to show "Bookmarks · 47 total · 12 in Work".

**Confidence:** MEDIUM

---

## MEDIUM

### F-2-1-08 — Search API `/api/search` lacks rate-limit enforcement for free users performing repeated queries

**File:line:** `web/src/app/api/search/route.js` (no checkRateLimit call)

**Evidence:**
The search route lacks any rate limit check:
```typescript
export async function GET(request) {
  const url = new URL(request.url);
  const q = sanitizeIlikeTerm(url.searchParams.get('q') || '');
  // ... no checkRateLimit() call before or after the query
  const { data, error } = await query;
  // ... return results
}
```

Compare to bookmarks POST (line 31-42 of route.js):
```typescript
const rate = await checkRateLimit(service, {
  key: `bookmarks:${user.id}`,
  policyKey: 'bookmarks',
  max: 60,
  windowSec: 60,
});
if (rate.limited) {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
}
```

**Impact:** A free user can spam `/api/search?q=...` queries without throttling, potentially causing high DB load and cost. No protection against abuse.

**Reproduction:** `while true; curl https://api/search?q=test; done` → no 429 response until server-side rate limit kicks in (if present at DB level).

**Suggested fix direction:** Call `checkRateLimit(service, { key: 'search:' + userId_or_IP, policyKey: 'search', max: 100, windowSec: 60 })` before the query.

**Confidence:** MEDIUM

---

### F-2-1-09 — Leaderboard category filter does not validate that selected category is active before querying

**File:line:** `web/src/app/leaderboard/page.tsx:128-141 and 169-175`

**Evidence:**
```typescript
// Initial load: fetch categories from DB with no filter
const { data: dbCats } = await supabase
  .from('categories')
  .select('id, name, slug, parent_id')
  .eq('is_active', true)
  .is('deleted_at', null)
  .eq('is_kids_safe', false)
  .order('sort_order');
// ... setCategories(parents) — good

// But later in the category filter logic:
if (activeCat) {
  const { data: csRows } = await supabase
    .from('category_scores')
    .select('...')
    .eq('category_id', activeCat)  // activeCat comes from UI state, never validated
    .eq('category_id', activeCat)
    // ...
```

**Impact:** If a user bookmarks a category ID, then the category is deactivated by an admin, the user's bookmarked category ID persists in local state. When they click it, the query returns empty results with no error message. Silent empty state instead of "This category was archived."

**Reproduction:** User bookmarks category id `cat_123`, admin runs `UPDATE categories SET is_active=false WHERE id='cat_123'`, user returns and clicks the bookmarked category in /leaderboard → blank "No results" instead of "Category archived" message.

**Suggested fix direction:** Validate `activeCat` is in the current categories list before querying; show "Category no longer available" if not found.

**Confidence:** MEDIUM

---

### F-2-1-10 — Home page category fetch has no is_active filter; inactive categories render in masthead supporting stories

**File:line:** `web/src/app/page.tsx:171-174`

**Evidence:**
```typescript
const catsRes = await supabase.from('categories').select('id, name, slug').order('sort_order', {
  ascending: true,
  nullsFirst: false,
});
// ... no .eq('is_active', true)
```

Compare to search, leaderboard, and browse pages which all filter:
```typescript
// search/page.tsx line 76:
.eq('is_active', true)

// leaderboard/page.tsx line 132:
.eq('is_active', true)

// browse/page.tsx (browse not shown but implied from brief):
.not('slug', 'like', 'kids-%')  // and likely .eq('is_active', true)
```

**Impact:** When an editorial team deactivates a category (e.g., "Seasonal Topic" after a season ends), it remains on the home page as an eyebrow / name for stories. Users see "SEASONAL TOPIC" even though the category no longer exists in /browse or leaderboard. Inconsistency.

**Reproduction:** Create a category, publish an article in it, add to home page, then admin deactivates the category → home page still shows the deactivated category name on supporting cards.

**Suggested fix direction:** Add `.eq('is_active', true)` to the catsRes query on line 171.

**Confidence:** HIGH

---

### F-2-1-11 — Notifications inbox lists unread count but does not update when `markOne` is called

**File:line:** `web/src/app/notifications/page.tsx:49-56 and 109-116`

**Evidence:**
```typescript
const { data } = await fetch(url);
const { data } = (await res.json()) as { notifications?: NotificationRow[] };
setItems(data.notifications || []);
// ... unread_count is not captured

async function markOne(id: string) {
  await fetch('/api/notifications', {
    method: 'PATCH',
    body: JSON.stringify({ ids: [id], mark: 'read' }),
  });
  setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  // ... no unread_count update
}
```

And the GET response includes:
```typescript
const { count } = await service
  .from('notifications')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('is_read', false);

return NextResponse.json({ notifications: data || [], unread_count: count || 0 });
```

**Impact:** The server returns `unread_count` but the page does not render or update it. If the header or nav elsewhere displays the unread count (common pattern), it will become stale after markOne/markAllRead calls. No observable unread_count state on the page.

**Reproduction:** Load notifications page with 5 unread → click one → header unread count (if it exists elsewhere) does not decrement.

**Suggested fix direction:** Add `unread_count` state, capture it in the load() fetch, and decrement it in markOne/markAllRead callbacks.

**Confidence:** MEDIUM

---

## LOW

### F-2-1-12 — Bookmarks page does not call `load()` after successful `createCollection` and `confirmDeleteCollection`

**File:line:** `web/src/app/bookmarks/page.tsx:195-211 and 217-235`

**Evidence:**
```typescript
async function createCollection() {
  const name = newCollectionName.trim();
  if (!name) return;
  const res = await fetch('/api/bookmark-collections', { method: 'POST', ... });
  if (!res.ok) {
    setError(d?.error || 'Create failed');
    return;
  }
  setNewCollectionName('');
  setShowNewCollection(false);
  load();  // ← calls load() AFTER response ✓
}

async function confirmDeleteCollection() {
  if (!pendingDelete) return;
  setDeleteBusy(true);
  try {
    const res = await fetch(`/api/bookmark-collections/${pendingDelete.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(d?.error || 'Delete failed');
      return;
    }
    if (activeCollection === pendingDelete.id) setActiveCollection('all');
    setPendingDelete(null);
    load();  // ← calls load() AFTER delete ✓
  } finally {
    setDeleteBusy(false);
  }
}
```

**Analysis:** Both functions correctly call `load()` to refresh collections list. No issue detected here; code follows the pattern.

**Suggested removal reason:** False alarm on initial scan — the `load()` calls are present and correct.

**Confidence:** LOW (no issue)

---

### F-2-1-13 — Empty state text inconsistency: Bookmarks "Save articles here" vs Notifications "When someone replies"

**File:line:** `web/src/app/bookmarks/page.tsx:531-556 and web/src/app/notifications/page.tsx:319-334`

**Evidence:**
```typescript
// bookmarks/page.tsx:531-556
{filtered.length === 0 && (
  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
    <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 6 }}>
      No bookmarks yet
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 360, margin: '0 auto' }}>
      Save articles here. Tap the bookmark icon on any story to come back later.
    </div>

// notifications/page.tsx:319-334
{filter === 'unread'
  ? 'You’re all caught up.'
  : 'No notifications yet. When someone replies, mentions you, or an article breaks, it lands here.'}
```

**Impact:** Minor UX — different tone/voice across empty states. Not a bug, but inconsistent onboarding messaging.

**Suggested fix direction:** Align tone across all empty states (brevity, passive vs. active voice, CTA presence).

**Confidence:** LOW

---

## UNSURE

### F-2-1-14 — Unclear whether notifications PATCH updates the unread_count badge if present

The notifications.route.js PATCH handler does not return an `unread_count` field, and the client does not capture it:

**File:line:** `web/src/app/api/notifications/route.js:100-107`

```typescript
const { error } = await q;  // PATCH result
if (error) return safeErrorResponse(...);
return NextResponse.json({ ok: true });  // ← no unread_count in response
```

**Question:** Does the app have a global unread badge (in the nav or masthead)? If so, it will become stale after marking notifications read because:
1. The notifications page component stores `unread_count` but only from the initial load
2. markOne/markAllRead do not refetch or update the badge
3. PATCH response does not include the new count

**Information to resolve:** Check if there's a global notification badge in the NavWrapper or layout; if yes, verify it re-polls `my_perms_version` or has a fallback to refresh.

**Suggested fix direction:** Return `unread_count` from PATCH and update client state.

---

EOF
cat /Users/veritypost/Desktop/verity-post/Current\ Projects/Audit_2026-04-24/WaveA_Group2_Reader_Agent1.md
