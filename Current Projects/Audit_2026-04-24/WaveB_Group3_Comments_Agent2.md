---
wave: B
group: 3 Comments + Quiz
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave B, Group 3, Agent 2

## CRITICAL

### F-G3-2-01 — Quiz-gate RPC enforces pass check but returns minimal object; refetch nullable

**File:line:** `web/src/app/api/comments/route.js:52-80`

**Evidence:**
```javascript
const { data, error } = await service.rpc('post_comment', {
  p_user_id: user.id,
  p_article_id: article_id,
  p_body: body,
  p_parent_id: parent_id || null,
  p_mentions: Array.isArray(mentions) ? mentions : [],
});
if (error) {
  console.error('[comments.POST]', error);
  return NextResponse.json({ error: 'Could not post comment' }, { status: 400 });
}

// Re-fetch the row so the client gets the full shape (counts etc.).
const { data: full } = await service
  .from('comments')
  .select(
    '*, users!user_id(id, username, avatar_color, avatar_url, is_verified_public_figure, is_expert, plans(tier))'
  )
  .eq('id', data.id)
  .maybeSingle();

return NextResponse.json({
  comment: full || { id: data.id },
  scoring: scoring?.error ? null : scoring,
});
```

**Impact:** If the re-fetch query fails (RLS deny, realtime lag, or connection blip), the API returns a fallback `{ id: data.id }` with no `body`, `user_id`, or related data. The client's `CommentComposer` passes this stub to `handlePosted()`, which adds an incomplete comment to state. On page refresh or when realtime subscriptions sync, the full comment appears — creating "ghost" partial comments or appearing-then-disappearing behavior. User perception: "comment disappeared."

**Reproduction:** Code-reading only. The RPC enforces the quiz gate correctly (line 103-105 of schema/013_phase5_comments_helpers.sql), but the fallback response at line 78 is a potential render-time bomb.

**Suggested fix direction:** Remove the fallback `|| { id: data.id }` and instead return 500 or retry the re-fetch if it fails, forcing the client to see a clear error rather than silently rendering a stub.

**Confidence:** HIGH

---

## HIGH

### F-G3-2-02 — POST /api/comments missing rate-limit error context on 429

**File:line:** `web/src/app/api/comments/route.js:45-50`

**Evidence:**
```javascript
const rate = await checkRateLimit(service, {
  key: `comments:${user.id}`,
  policyKey: 'comments_post',
  max: 10,
  windowSec: 60,
});
if (rate.limited) {
  return NextResponse.json(
    { error: 'Posting too quickly. Wait a moment and try again.' },
    { status: 429, headers: { 'Retry-After': '60' } }
  );
}
```

**Impact:** The 429 response is correct, but the `Retry-After` header is hardcoded to `'60'` rather than using the actual window remaining from `checkRateLimit`. If the user passes the quiz and immediately fires 5 comments, then waits 45 seconds and tries a 6th, they get "Posting too quickly ... Retry-After: 60" — told to wait another 60 seconds when only 15 remain. Client UX shows stale countdown. Per briefing focus #5 (Error UX), this is a silent-fail variant: the user gets copy but no actionable wait time.

**Reproduction:** Pass quiz, fire 10 comments in <60s, then try one more before the window closes.

**Suggested fix direction:** Return dynamic `Retry-After` from `checkRateLimit` (e.g., `Math.ceil(rate.resetAtMs - Date.now()) / 1000`).

**Confidence:** MEDIUM

---

### F-G3-2-03 — CommentThread canSubscribe permission gates realtime, not initial load

**File:line:** `web/src/components/CommentThread.tsx:79-90, 183-186, 188-261`

**Evidence:**
```typescript
const canSubscribe = permsLoaded ? hasPermission('comments.realtime.subscribe') : false;

useEffect(() => {
  (async () => {
    await refreshAllPermissions();
    await refreshIfStale();
    setPermsLoaded(true);
  })();
}, []);

const loadAll = useCallback(async () => {
  // ... line 92-181
}, [articleId, articleCategoryId, currentUserId, canViewScore, supabase]);

useEffect(() => {
  if (!permsLoaded) return;
  loadAll();
}, [loadAll, permsLoaded]);

useEffect(() => {
  if (!articleId || !canSubscribe) return;
  // ... realtime subscribe logic (lines 188-261)
}, [articleId, canSubscribe, supabase]);
```

**Impact:** If a user lacks `comments.realtime.subscribe` permission (e.g., free tier, or permission not yet hydrated), the realtime subscription never starts (line 189). The initial `loadAll()` (line 183) still fetches all comments, so the reader sees comments posted before they opened the page. However, new comments posted by other users while they are viewing the page will NOT appear until they manually refresh or the session syncs. For paid users or those with realtime permission, this is not an issue; for free/basic users, it's a silent sync gap. Per briefing focus #5 (Error UX), no banner warns the user "New comments will not auto-update" — they just don't see them.

**Reproduction:** Free-tier user loads article after quiz pass → no realtime perms → opens discussion → sees initial comments. Another user posts. Free-tier user sees nothing until refresh.

**Suggested fix direction:** Either grant `comments.realtime.subscribe` to all quiz-passed users (schema, plan_features), or surface a banner when realtime is unavailable.

**Confidence:** MEDIUM

---

## MEDIUM

### F-G3-2-04 — CommentComposer permission checks fire async but block render synchronously

**File:line:** `web/src/components/CommentComposer.tsx:43-73, 127-128`

**Evidence:**
```typescript
useEffect(() => {
  (async () => {
    await refreshAllPermissions();
    await refreshIfStale();
    setCanPost(hasPermission(parentId ? 'comments.reply' : 'comments.post'));
    setCanMention(hasPermission('comments.mention.insert'));
    setPermsLoaded(true);
    // ... fetch mute state
  })();
}, [parentId]);

if (!permsLoaded) return null;
if (!canPost) return null;
```

**Impact:** On mount, the composer renders `null` (line 127) until permissions finish loading. If the user just passed the quiz and the story page immediately renders CommentThread → CommentComposer, the composer is hidden for 50-200ms (depends on permission hydration speed). If permissions resolve and the user has `comments.post`, the composer appears — but if the permission check returns false (rare, but possible if a permission cache is stale or a role check fails), the composer silently disappears with no error toast, no "upgrade" upsell copy, just nothing. Per briefing focus #5 (Error UX) and #3 (per-permission visibility), this is a missing visibility state.

**Reproduction:** Manually remove `comments.post` from user's permission set in the permission cache → composer disappears with no explanation.

**Suggested fix direction:** Return a "locked" version of the composer with copy like "Commenting unavailable on your plan" rather than `null`, so the user knows why they can't post (not just "composer didn't load").

**Confidence:** LOW

---

### F-G3-2-05 — Comment re-fetch query includes plans(tier) but comment type doesn't model it

**File:line:** `web/src/app/api/comments/route.js:72, web/src/types/database.ts (CommentDb definition)`

**Evidence:**
```javascript
// route.js line 72:
.select(
  '*, users!user_id(id, username, avatar_color, avatar_url, is_verified_public_figure, is_expert, plans(tier))'
)

// web/src/components/CommentThread.tsx line 21-32:
type CommentWithAuthor = CommentDb & {
  users?: {
    id?: string;
    username?: string;
    avatar_url?: string | null;
    avatar_color?: string | null;
    is_verified_public_figure?: boolean;
    is_expert?: boolean;
  };
};
```

**Impact:** The API re-fetch includes `plans(tier)` in the `users` nested query, but the TypeScript type `CommentWithAuthor` does not model `users.plans`. If the client code ever tries to access the tier (e.g., for a future "verified expert" badge that shows tier), it will be `undefined` due to the type gap, and the value will silently fail at runtime if logic depends on it. This is not a data loss bug, but a type-safety regression waiting for a feature that uses it.

**Reproduction:** Code-reading only. The data is fetched but not consumed yet.

**Suggested fix direction:** Update `CommentWithAuthor.users` type to include optional `plans?: { tier?: string }` or remove the `plans(tier)` from the re-fetch if it's not used.

**Confidence:** LOW

---

## Observations (not yet reportable findings)

1. **Quiz gate RPC enforcement works correctly** (schema/013_phase5_comments_helpers.sql line 103-105). No bypass found.

2. **Client state hydration looks correct** — `handlePosted` callback on CommentComposer passes response to CommentThread, which adds to state via `setComments()`. The wiring is sound.

3. **RLS policies not audited** — the focus was on the API route and client logic. The database RLS on `comments` table was not inspected. If an RLS policy accidentally filters the user's own posted comment, that would cause the reported "not saving" symptom. Recommend Agent 3 check.

4. **Anon users cannot comment** — confirmed by story page (lines 987-1014): anon readers see a lock panel; CommentComposer only renders if `currentUserId` is set (not checked in this file but implicit in parent). This is correct per product design.

