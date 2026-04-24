---
wave: A
group: 7 Admin Moderation + Content
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Admin Moderation + Content, Wave A, Agent 3

## CRITICAL

### F-G7-3-01 — Client-side HIERARCHY constant drifts from DB hierarchy_level
**File:line:** `web/src/app/admin/moderation/page.tsx:28-37, 341`

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
// ...
const outOfScope = (HIERARCHY[r] ?? 0) > actorMaxLevel;  // line 341
```

The code loads `actorMaxLevel` from DB at lines 120-123:
```
const maxLevel = Math.max(
  0,
  ...roleRows.map((r) => r.hierarchy_level ?? (r.name ? HIERARCHY[r.name] : 0) ?? 0),
);
```

This creates a two-tier fallback that masks drift: the actor's maxLevel is computed from live DB `hierarchy_level`, but button visibility (outOfScope check) uses the hardcoded HIERARCHY map. If a role's hierarchy_level changes in the DB without updating line 28-37, the UI will show/hide role-grant buttons incorrectly.

**Impact:** Inconsistent button visibility. User sees "moderator" button enabled (HIERARCHY[moderator]=60 < actorMaxLevel), but the API call fails because actual DB hierarchy differs. Or vice versa—button disabled but API accepts it.

**Reproduction:** Code-reading only. (Would require DB hierarchy change + UI load without code redeploy to observe.)

**Suggested fix direction:** Replace hardcoded HIERARCHY with a dynamic load from `roles` table on component mount, or pass hierarchy_level alongside role name in the ROLES constant.

**Confidence:** HIGH

---

## HIGH

### F-G7-3-02 — Report resolution accepts arbitrary resolution values, no state machine at API level
**File:line:** `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:40-47`

**Evidence:**
```javascript
const { resolution, notes } = await request.json().catch(() => ({}));
if (!resolution) return NextResponse.json({ error: 'resolution required' }, { status: 400 });

const { error } = await service.rpc('resolve_report', {
  p_mod_id: user.id,
  p_report_id: params.id,
  p_resolution: resolution,
  p_notes: notes || null,
});
```

No whitelist of allowed resolution values. The RPC accepts any string. The schema `reports.resolution` is `varchar(30)`, not an enum, with no CHECK constraint. The UI (web/src/app/admin/reports/page.tsx:153) hard-codes resolutions (`'actioned' | 'dismissed' | 'duplicate'`), but the API does not validate them.

**Impact:** Moderator UI can only resolve to three states, but if a buggy client or direct API caller sends `resolution='invalid_state'`, it persists unchecked. The report lifecycle becomes opaque—query tools may encounter unexpected values.

**Reproduction:** Direct API call: `POST /api/admin/moderation/reports/{id}/resolve` with `{ resolution: 'typo_in_name', notes: null }` succeeds.

**Suggested fix direction:** Add a whitelist check in the route handler before RPC, or add a CHECK constraint to the `reports.resolution` column and validate in the RPC.

**Confidence:** HIGH

---

## MEDIUM

### F-G7-3-03 — Rate limit asymmetry: appeals resolve (30/60s) vs user ban (10/60s)
**File:line:** `web/src/app/api/admin/appeals/[id]/resolve/route.js:27-31`, `web/src/app/api/admin/moderation/users/[id]/penalty/route.js:51-55`

**Evidence:**

Appeals resolve:
```javascript
const rate = await checkRateLimit(service, {
  key: `admin.appeals.resolve:${user.id}`,
  policyKey: 'admin.appeals.resolve',
  max: 30,
  windowSec: 60,
});
```

User penalty (ban):
```javascript
const rate = await checkRateLimit(service, {
  key: `admin.moderation.users.penalty:${user.id}`,
  policyKey: 'admin.moderation.users.penalty',
  max: 10,
  windowSec: 60,
});
```

Appeals resolution can reverse bans (schema 026_phase18_sql.sql: `if p_outcome = 'approved'` restores banned user). But a moderator can invoke unban 30 times/min via appeals but only ban 10 times/min. This creates an asymmetry where appeals queue can drain faster than bans accumulate.

**Impact:** Minor operational friction. A moderator bulk-resolving appeals to unban users hits the 30/min ceiling; meanwhile the penalty route allows only 10 bans/min. Not a security issue (both are rate-limited), but the asymmetry invites usability questions.

**Reproduction:** Code-reading only. Would require bulk appeal approvals to hit the disparity.

**Suggested fix direction:** Align rate limits or document the intentional asymmetry (unban should be higher rate-limit than ban if the product wants to prioritize appeal resolution).

**Confidence:** MEDIUM

---

### F-G7-3-04 — Category hierarchy update: cycle prevention robust but multi-query pattern
**File:line:** `web/src/app/api/admin/categories/[id]/route.ts:215-289`

**Evidence:**

The PATCH route validates parent_id changes by:
1. Loading the target parent (line 231-235)
2. Checking target is not deleted and is top-level (line 240-245)
3. **Walking the parent chain** (line 251-269) to detect cycles
4. Checking self has no children (line 273-284)

Cycle-check loop:
```typescript
let cursorId: string | null = nextParent;
const seen = new Set<string>();
while (cursorId) {
  if (cursorId === id) {
    return badRequest('Move would create a cycle');
  }
  if (seen.has(cursorId)) break;
  seen.add(cursorId);
  const { data: ancestor, error: ancErr } = await service
    .from('categories')
    .select('parent_id')
    .eq('id', cursorId)
    .maybeSingle();
  // ...
  cursorId = (ancestor?.parent_id as string | null | undefined) ?? null;
}
```

This is **correct and defensive** — it walks the hierarchy explicitly despite the depth-2 cap. However, it generates 2-3 sequential DB round-trips per parent_id change (one for the target lookup, up to depth rounds for the walk, one for child count). No transactional guard; if a sibling deletes the target parent between the lookup and the update, a TOCTOU window exists.

**Impact:** Negligible in practice (requires concurrent edits + race). The cycle prevention is sound and the depth-2 cap makes cycles impossible even without the walk. The multi-query pattern is defensive but adds latency.

**Reproduction:** Would require concurrent updates during the validation window — low likelihood in production.

**Suggested fix direction:** Minor: Consider a single `WITH RECURSIVE` SQL query to validate the entire parent chain in one round-trip, or document the TOCTOU window and mark as acceptable risk.

**Confidence:** MEDIUM

---

## LOW

### F-G7-3-05 — Article PATCH does not validate status transition order for kid_articles
**File:line:** `web/src/app/api/admin/articles/[id]/route.ts:195-200, 318-325`

**Evidence:**

The PATCH route defines:
```typescript
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['published', 'archived'],
  scheduled: ['published', 'archived', 'draft'],
  published: ['archived'],
  archived: ['draft'],
};
```

This is applied uniformly to both `articles` (adult) and `kid_articles` (kid) tables (line 318). The comment at lines 2-10 notes both tables share identical column shapes *for the fields we edit here*, but does not note whether the business rules differ between adult and kid content pipelines.

**Impact:** If kid articles have different lifecycle rules (e.g., kids content cannot be unarchived), the hardcoded ALLOWED_TRANSITIONS would enforce the wrong rule. Low impact because the kids pipeline is currently draft-only per the PM punchlist (L8 context: kids are not in full production).

**Reproduction:** Code-reading only. No kid_articles lifecycle currently exercised in production.

**Suggested fix direction:** Document whether adult and kid article status machines are identical. If they differ in the future, split ALLOWED_TRANSITIONS into audience-specific maps.

**Confidence:** LOW

---

## UNSURE

### F-G7-3-06 — Audit log coverage: app lifecycle (admin_audit_log vs audit_log split)
**File:line:** `web/src/lib/adminMutation.ts:60-62`, `schema/026_phase18_sql.sql`

The code distinguishes two audit tables:
- `admin_audit_log` — for admin mutations (recordAdminAction via SECURITY DEFINER RPC)
- `audit_log` — for system events (auth, stripe, promo)

The RPCs in schema 026 emit directly to `audit_log`:
```sql
INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
VALUES (p_mod_id, 'user', 'comment.hide', 'comment', p_comment_id, ...);
```

But the routes also call `recordAdminAction`, which targets `admin_audit_log`. This creates dual-log writes on the same event. **Question:** Is this intentional (two separate audit trails), or a drift where the RPC was updated (schema 026) but the client-side recordAdminAction fallback was not removed?

**Suggested investigation:** Check recent commits to schema 026 and recordAdminAction to confirm both are intended or if one is redundant.

**Confidence:** UNSURE (requires schema change history review)

---

## Summary

**Critical:** 1 (HIERARCHY drift)
**High:** 1 (resolution validation gap)
**Medium:** 2 (rate asymmetry, cycle walk latency)
**Low:** 1 (kid_articles rules)
**Unsure:** 1 (audit log split intent)

All other surfaces (appeal resolution completeness, category hierarchy mutations, story lifecycle states, bulk action gating) are correctly implemented with proper permission checks, rate limiting, and audit logging per schema 026.

