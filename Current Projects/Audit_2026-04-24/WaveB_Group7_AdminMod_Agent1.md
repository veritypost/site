---
wave: B
group: 7 (Admin Moderation + Content)
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24T13:03:54Z
---

# Findings — Admin Moderation + Content, Wave B, Agent 1

## CRITICAL

### F-B7-1-001 — Moderation console uses stale in-code role hierarchy for UI gating
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:28–37`
**Evidence:**
```
const HIERARCHY: Record<string, number> = {
  owner: 100,
  admin: 80,
  editor: 70,
  moderator: 60,
  expert: 50,
  educator: 50,
  journalist: 50,
  user: 10,
};
```
Then used at line 122 to compute `actorMaxLevel` and at line 341 to disable out-of-scope role buttons.

**Impact:** If the database schema (roles.hierarchy_level) is updated (e.g., a new role added, hierarchy level changed), this hardcoded map drifts. The moderation console's role-grant/revoke buttons will show/hide incorrectly, allowing UX that suggests the actor can grant roles they actually cannot (permission denied at API), or vice versa. **Per briefing F-116 / Q6:** "the in-code ROLE_HIERARCHY map was removed" from roles.js and "canonical hierarchy lives in public.roles.hierarchy_level". This moderation page did not get the memo.

**Reproduction:** Update roles.hierarchy_level in Supabase, e.g., change `moderator` from 60 to 55. Load moderation console; role buttons still compute against stale 60. Server-side `requireAdminOutranks()` RPC enforces correctly, so the API call fails, but the UI is misleading.

**Suggested fix direction:** Load roles hierarchy from `/api/admin/users/{id}/roles` response metadata or call `getRoleNames() / rolesAtLeast()` client-side to compute `actorMaxLevel` dynamically, matching the pattern in categories/page.tsx.

**Confidence:** HIGH

---

## HIGH

### F-B7-1-002 — Article DELETE endpoint lacks rate limiting
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/articles/[id]/route.ts:578–618`
**Evidence:**
```
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  // ...
  let actor;
  try {
    actor = await requirePermission('admin.articles.delete');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  // NO checkRateLimit call here
  // ...
  if (prior.author_id) {
    const rankErr = await requireAdminOutranks(prior.author_id, actor.id);
    // ...
  }
  // ...audit log call, then immediate delete
  const { error } = await service.from('articles').delete().eq('id', id);
```

The PATCH endpoint (line 358–369) calls `checkRateLimit(service, { key: 'admin_article_edit:user:...', max: 30, windowSec: 60 })`. The POST /articles/save route (line 68–79) calls it. DELETE does not.

**Impact:** An actor with `admin.articles.delete` can rapidly delete articles without throttling, e.g., a 10-req/second loop against 500 articles. The briefing §4 mandates "Rate limits. Every mutation — is checkRateLimit called?"

**Reproduction:** Authenticated as editor+delete-perm, craft a shell loop: `for i in {1..100}; do curl -X DELETE /api/admin/articles/ID-$i; done`. Should 429 after ~30 attempts; currently succeeds for all.

**Suggested fix direction:** Add `checkRateLimit(service, { key: 'admin_article_delete:user:${actor.id}', policyKey: 'admin_article_delete', max: 10, windowSec: 60 })` before the `requireAdminOutranks` check.

**Confidence:** HIGH

---

### F-B7-1-003 — Moderation console appeals load at page init, but UI actions don't force refresh on role changes
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:92–104, 127`
**Evidence:**
```
const loadAppeals = useCallback(async () => {
  const { data, error } = await supabase
    .from('user_warnings')
    .select('*, users:users!fk_user_warnings_user_id(username)')
    .eq('appeal_status', 'pending')
    .order('created_at', { ascending: false });
  // ...
  setAppeals((data as unknown as AppealRow[]) || []);
}, [supabase, toast]);

useEffect(() => {
  // ... init + await loadAppeals() once
}, []);
```

Then after `grantRole()` / `revokeRole()`, the code calls `search()` (line 191, 205), which reloads the single target user, but **does not call `loadAppeals()`**. The appeals list on the page is stale. If another moderator approves/denies an appeal while the user is on the page, the UI doesn't refresh.

**Impact:** User sees a pending appeal for a user they just granted moderator role to; the appeal is already resolved elsewhere but the page hasn't fetched the latest. Low user-visible impact (refresh F5 fixes it), but violates audit-trail completeness: the appeal status machine may transition without the UI reflecting it.

**Reproduction:** Load moderation console. Open appeals list in two browser windows. In window 1, approve an appeal. Window 2's appeals list still shows it as pending.

**Suggested fix direction:** After role mutations (grant/revoke), also call `await loadAppeals()` or set up a polling interval / subscription to refresh appeals.

**Confidence:** MEDIUM

---

## MEDIUM

### F-B7-1-004 — Moderation console penalty action UI doesn't validate actor hierarchy against target during modal render
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:208–243`
**Evidence:**
```
function penalty(level: number) {
  if (!target) return;
  setDestructive({
    // ... builds a modal
    run: async ({ reason }) => {
      // ... inside the async run, POST to /api/admin/moderation/users/{target.id}/penalty
      // The API endpoint (route.js:47) calls requireAdminOutranks(params.id, user.id)
      // and returns 403 if actor does not outrank target.
    },
  });
}
```

The moderation page does **not** pre-check whether the actor can penalize the target. The buttons are always shown (unless busy), and the rejection only happens server-side. While the API is correctly gated, the UX is poor: user clicks "Ban", sees a confirmation modal, submits, then gets "Forbidden" async.

**Impact:** Per briefing §5 "Error UX. Does the user get actionable feedback (toast, banner, redirect, empty state), or a silent failure?" The user does see the error toast (line 231), but a coarse early rejection ("you cannot penalize this user") would be clearer.

**Reproduction:** Log in as moderator. Look up an admin user. Click "Ban". Confirm. Receive "Forbidden" toast.

**Suggested fix direction:** In the `search()` function after fetching the target user, call a hypothetical `/api/admin/moderation/check-can-penalize/{targetId}` (or compute locally with the actor's hierarchy fetched at load time) to disable penalty buttons for out-of-scope targets before render.

**Confidence:** MEDIUM

---

### F-B7-1-005 — Categories create/update/delete endpoints record audit but don't emit on soft-delete restore
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/categories/[id]/route.ts:308–316`
**Evidence:**
```
const action = 'deleted_at' in update ? 'category.restore' : 'category.update';
await recordAdminAction({
  action,
  targetTable: 'categories',
  targetId: id,
  oldValue: existing,
  newValue: update,
});
```

This is correct: restore gets its own action label. However, the **delete endpoint** (line 365–372) calls `recordAdminAction` **after** the soft-delete is committed:
```
const nowIso = new Date().toISOString();
const { error: upErr } = await service
  .from('categories')
  .update({ deleted_at: nowIso, is_active: false })
  .eq('id', id);

// 5. Audit (post-mutation: caller-scoped client so auth.uid() resolves).
await recordAdminAction({
  action: 'category.archive',
  targetTable: 'categories',
  targetId: id,
  oldValue: existing,
  newValue: { deleted_at: nowIso, is_active: false },
});
```

The audit write is **best-effort** (fire-and-forget after the mutation commits). If `recordAdminAction` fails silently (e.g., RPC timeout), the category is deleted but the audit log is incomplete.

**Impact:** Archive/restore is correctness-critical for editorial workflows. An incomplete audit trail means the owner cannot trace who deleted what and when. Briefing §3: "DB write-back. Every mutation — does it actually persist? ... Does it emit audit_log when it should?"

**Reproduction:** Soft-delete a category. Check that `admin_logs` has an entry. Now force `recordAdminAction` RPC to timeout (network condition or DB under load). On retry, the category is still deleted, but the audit row may not have been inserted.

**Suggested fix direction:** Move audit logging **before** the UPDATE, or use a transactional RPC that bundles the update + audit in one atomic call. At minimum, log the error and return 500 if the audit write fails.

**Confidence:** MEDIUM

---

## LOW

### F-B7-1-006 — Reports page does not filter supervisor flags when loading resolved reports
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/admin/reports/page.tsx:95–115`
**Evidence:**
```
const load = useCallback(async (status: string, supOnly: boolean) => {
  const params = new URLSearchParams({ status });
  if (supOnly) params.set('supervisor', 'true');
  const res = await fetch(`/api/admin/moderation/reports?${params}`);
  // ...
  let list: ReportItem[] = data.reports || [];
  if (supOnly) {
    // Reorder by urgency (flag count DESC, then created_at DESC).
    list = [...list].sort((a, b) => { ... });
  }
  setReports(list);
}, [toast]);
```

When `supervisorOnly` is true, the client re-sorts the results by `flag_count` descending. However, the API route (`/api/admin/moderation/reports/route.js`) does not validate the `supervisor=true` query param; it simply adds `.eq('is_supervisor_flag', true)` **regardless of the `status` param**:
```
let q = service
  .from('reports')
  .select('...')
  .eq('status', status)
  .order('is_supervisor_flag', { ascending: false })
  .order('created_at', { ascending: false });
if (supervisorOnly) q = q.eq('is_supervisor_flag', true);
```

This is correct. The supervisor-only filter applies to both pending and resolved. No bug here.

**Impact:** None. This is a false alarm.

**Reproduction:** Not applicable; code is working as intended.

**Suggested fix direction:** No fix needed. Close as "working as designed."

**Confidence:** LOW

---

## UNSURE

### F-B7-1-007 — Appeal resolution permission key mismatch?
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/appeals/[id]/resolve/route.js:14`
**Evidence:**
```
user = await requirePermission('admin.moderation.appeal.approve');
```

But in the moderation.page, the appeal resolution (line 247, 250) posts to `/api/admin/appeals/{id}/resolve` with `outcome: 'approved' | 'denied'`. The endpoint gate is `admin.moderation.appeal.approve`, but it accepts both approve **and** deny outcomes. A moderator with only `admin.moderation.appeal.deny` permission (if that exists) cannot use this endpoint even to deny.

**Impact:** Uncertain. This could be intentional (only one permission key for both outcomes) or a granularity gap (approve and deny should be separate perms). Needs clarification on permission design philosophy.

**Reproduction:** Create a test user with `admin.moderation.appeal.deny` but NOT `admin.moderation.appeal.approve`. Try to deny an appeal via the moderation console. Check whether it's blocked.

**Suggested fix direction:** Investigate whether `admin.moderation.appeal.deny` exists in the permissions table and whether the intent is to gate deny separately. If both outcomes should use the same permission, update the key to `admin.moderation.appeal.resolve` for clarity.

**Confidence:** LOW (needs tiebreaker)

