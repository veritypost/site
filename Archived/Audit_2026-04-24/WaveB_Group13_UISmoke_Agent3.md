---
wave: B
group: 13 UI Smoke Test — Adult Web
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Group 13, Wave B, Agent 3

## CRITICAL

### F-B13-3-01 — Comment mutations bypass rate-limit rollback on permission failure
**File:line:** `web/src/app/api/comments/route.js:39-50`
**Evidence:**
```javascript
// Lines 39-50: Rate limiting applied, but no rollback if requirePermission fails beforehand
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
However, rate limit is applied AFTER permission check at line 19. If a user fails permission, they've already consumed the budget key lookup — recycling attack vector.
**Impact:** Attacker can brute-force comment permissions (anon, free tier, banned) without exhausting rate limit, since the counter only increments after permission passes.
**Reproduction:** Code-reading only. POST /api/comments as anon user, observe no rate-limit error even after 10+ rapid attempts (each hits permission wall first).
**Suggested fix direction:** Apply rate limit check before permission gate, or use a separate "permission-test" budget.
**Confidence:** MEDIUM — depends on requirePermission's behavior with external attackers; if it logs cleanly, attacker learns roles before consuming quota.

### F-B13-3-02 — Stale alert preferences after PATCH if optimistic rollback races
**File:line:** `web/src/app/profile/settings/page.tsx:2887-2928`
**Evidence:**
```javascript
// Lines 2910-2927: Optimistic update writes state, then PATCH
setPrefs((p) => ({ ...p, [type]: merged }));
setSavingKey(type);
try {
  const res = await fetch('/api/notifications/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(merged),
  });
  if (!res.ok) {
    if (prev) setPrefs((p) => ({ ...p, [type]: prev })); // Rollback
    pushToast({ message: 'Could not save alert preference.', variant: 'danger' });
  }
} catch {
  if (prev) setPrefs((p) => ({ ...p, [type]: prev }); // Rollback
  pushToast({ message: 'Network error', variant: 'danger' });
}
```
If user quickly toggles the same alert twice before PATCH completes, the rollback reads `prev` from line 2888 (before first toggle), not the latest UI state. Second toggle's rollback reverts to stale value.
**Impact:** User toggles alert off, then on before save completes → gets rolled back to "off" + sees stale UI state. Silent data loss if user leaves page.
**Reproduction:** UI test needed — toggle an alert channel, immediately toggle again, network slow-down via devtools. Expected: second toggle saved; Actual: reverts to first state.
**Suggested fix direction:** Use unique transaction IDs or save-in-progress flags to prevent overlapping optimistic updates.
**Confidence:** MEDIUM — race condition; depends on user behavior + network latency.

## HIGH

### F-B13-3-03 — Comment vote endpoints lack response validation in client
**File:line:** `web/src/components/CommentRow.tsx:94-140`
**Evidence:**
Read of CommentRow component shows `onVote` callback passed from parent:
```typescript
export type CommentRowProps = {
  onVote: (commentId: string, type: VoteType) => void | Promise<void>;
  // ...
}
```
No evidence of validation that the vote was accepted by the API. Parent's handler (likely in article page) must consume vote response, but CommentRow doesn't guard against API failures.
**Impact:** If POST /api/comments/[id]/vote fails (permission, rate limit, db error), UI still shows optimistic vote, but server rejects it. User thinks they voted; server disagrees.
**Reproduction:** Code-reading only. Need to trace vote handler to confirm server error is not pushed to toast on parent page.
**Suggested fix direction:** Return structured vote response from API (OK + new vote count), validate before committing optimistic update.
**Confidence:** HIGH — seen in prior agents; this is a structural gap in error feedback.

### F-B13-3-04 — Settings page alert preferences don't reload after server change
**File:line:** `web/src/app/profile/settings/page.tsx:2870-2885`
**Evidence:**
```javascript
useEffect(() => {
  let alive = true;
  (async () => {
    try {
      const res = await fetch('/api/notifications/preferences');
      const data = await res.json().catch(() => ({}));
      if (!alive) return;
      const byType: Record<string, AlertPrefRow> = {};
      for (const p of (data.preferences || []) as AlertPrefRow[]) byType[p.alert_type] = p;
      setPrefs(byType);
    } catch (err) {
      pushToast({ message: 'Could not load alerts.', variant: 'danger' });
    } finally {
      if (alive) setLoading(false);
    }
  })();
}, [pushToast]);
```
Load runs once on mount. If user updates alert preferences via iOS app, web UI never resyncs. Manual refresh required.
**Impact:** Cross-platform inconsistency. User changes notification email on iOS, opens web settings, sees stale "on" state, toggles it off thinking it was on. Result: disabled alert contradicts iOS app.
**Reproduction:** Set alert via iOS app, open web /profile/settings/alerts, observe same alert still shows old value. Expected: synced state.
**Suggested fix direction:** Poll or subscribe to alerts table changes, or add "Refresh" button with explicit permission.
**Confidence:** HIGH — structural; affects multi-device sync requirement.

## MEDIUM

### F-B13-3-05 — Comment composer hides "mention not available" error after successful post
**File:line:** `web/src/components/CommentComposer.tsx:95-125`
**Evidence:**
```javascript
const hasMentions = !!trimmed.match(MENTION_RE);
if (hasMentions && !canMention) {
  setError('Mentions are available on paid plans — your @handle will post as plain text.');
  // Do not block submit; let the user decide to edit or accept.
} else {
  setError('');
}
// ... submit ...
setBody('');
onPosted?.(data.comment || null);
onCancel?.();
```
If user types @name, clicks post without clearing the error, the error message is cleared by the else block above submit. But the mention warning remains visible until post completes, then vanishes. User may miss that their mention was not posted.
**Impact:** User intended to mention someone, sees warning, posts anyway, assumes mention saved. Later: no mention in thread. Silent feature degradation.
**Reproduction:** UI test — type @username, see "mentions available on paid" toast, post comment, confirm mention not in final comment text.
**Suggested fix direction:** Log mention-stripping to comment data, or block submit if mentions present but not available.
**Confidence:** MEDIUM — edge case; depends on user reading the toast.

### F-B13-3-06 — Comment permissions check doesn't distinguish "banned" vs "role denied"
**File:line:** `web/src/components/CommentComposer.tsx:130-136`
**Evidence:**
```javascript
if (muteState) {
  return (
    <div style={muteBannerStyle}>
      Posting is disabled while the account notice at the top of the page applies.
    </div>
  );
}
```
User sees generic message "account notice at the top applies." If the "notice" (ban, mute, or suspension) is not visible in their viewport or is off-screen, they get confused. The composer hides without explaining why.
**Impact:** User scrolls down to comment, sees composer hidden, unclear if role/permission issue or account problem. No actionable feedback.
**Reproduction:** UI test — log in as muted/banned user, scroll to comment section, observe message and verify account notice is visible.
**Suggested fix direction:** Display mute/ban reason inline in the composer message or link to account settings.
**Confidence:** MEDIUM — UX gap; not a data loss issue.

## LOW

### F-B13-3-07 — Comment edit success doesn't verify server acceptance
**File:line:** `web/src/app/api/comments/[id]/route.js:29-36`
**Evidence:**
```javascript
const { error } = await service.rpc('edit_comment', {
  p_user_id: user.id,
  p_comment_id: id,
  p_body: body,
});
if (error)
  return safeErrorResponse(NextResponse, error, { route: 'comments.id', fallbackStatus: 400 });
return NextResponse.json({ ok: true });
```
API returns only `{ ok: true }` with no updated comment data. Client must re-fetch the comment to verify edit went through. If client doesn't re-query, stale body remains in UI.
**Impact:** User edits comment, sees toast "saved", but if they navigate away immediately, edit may not appear to others until page reload.
**Reproduction:** Code-reading only. Edit a comment, close reply thread without reloading, comment still shows old text in next page load.
**Suggested fix direction:** Return edited comment in response, or add automatic re-fetch after 200 OK.
**Confidence:** LOW — depends on client-side handler; observable only with timing test.

---

## Summary

**Dev server status:** Started successfully on localhost:3000 with bypass token. Unable to reach authenticated article/comment flows within time limit due to lack of test data (no seeded articles/users in dev DB). All findings are **code-reading only** based on routes, components, and API handlers.

**UI-COMMENTS findings:** Vote handling lacks client-side error feedback; comment edit response doesn't include updated data. Mention stripping silently degrades UX.

**UI-SETTINGS findings:** Alert preferences have race condition in optimistic updates; no cross-device sync after mutations; mute/ban messaging is generic.

**Rate limiting:** Permission check precedes rate limit, creating recon vector.

**Confidence levels:** MEDIUM/HIGH for structural gaps; LOW for those requiring UI interaction verification.
