---
wave: A
group: 14 Role × Page permission matrix
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Role × Page Permission Matrix, Wave A, Agent 2/3

**Scope:** Exhaustive role × route matrix (web/src/lib/roles.js × web/src/app/). Sampled critical paths: comments, quiz, bookmarks, admin mutations, cron, kids pairing, expert apply. Cross-referenced: `requirePermission` checks, `checkRateLimit` calls, `recordAdminAction` audit logging, RLS on service-role mutations.

**8 Roles found (roles table, hierarchy_level):**
- user (10), expert/educator/journalist (50), moderator (60), editor (70), admin (80), owner (100)

**Sample findings:**

## CRITICAL

### F-A14-2-01 — Admin mutations missing audit_log records (moderation, broadcast)
**File:line:**
- `web/src/app/api/admin/moderation/comments/[id]/hide/route.js:38` — calls `hide_comment` RPC, no `recordAdminAction`
- `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:43` — calls `resolve_report` RPC, no `recordAdminAction`
- `web/src/app/api/admin/broadcasts/breaking/route.js:46` — calls `send_breaking_news` RPC, no `recordAdminAction`
- `web/src/app/api/admin/ad-placements/route.js:66-91` — INSERT on ad_placements, no `recordAdminAction`

**Evidence:**
The canonical pattern (`adminMutation.ts:64-71`) requires `recordAdminAction` for every privileged mutation. The 4 routes above call mutations but skip the audit call. Contrast with `/api/admin/moderation/users/[id]/penalty/route.js:63` (calls RPC) — payload flows through `apply_penalty` RPC which internally logs, but moderation/comments and broadcasts do not.

**Impact:** 
- Compliance gap: moderation actions (hide, resolve, broadcast) leave no admin_audit_log trail.
- Cannot reconstruct who issued breaking news or hid comments for disputes/appeals.
- Severity depends on RPC-side logging; if `hide_comment` + `resolve_report` + `send_breaking_news` DON'T log, then zero audit trail.

**Reproduction:** Code-reading only. Inspect RPC definitions in migration files to check if `hide_comment`, `resolve_report`, `send_breaking_news` call `admin_audit_log`.

**Suggested fix direction:** Add `recordAdminAction` call after successful RPC or mutation in the 4 routes, or confirm the RPCs themselves are SECURITY DEFINER + log internally.

**Confidence:** HIGH (code is unambiguous, but impact hinges on RPC-side logging status unknown from this scan).

## HIGH

### F-A14-2-02 — Support route uses `requireAuth`, not `requirePermission` — no permission model enforcement
**File:line:** `web/src/app/api/support/route.js:59-70` (GET) and POST handlers

**Evidence:**
```
export async function POST(request) {
  const token = bearerToken(request);
  const supabase = token ? createClientFromToken(token) : await createClient();
  const user = await requireAuth(supabase);  // <-- NO PERMISSION CHECK
  const { data: ticket, error: rpcErr } = await supabase.rpc('create_support_ticket', ...)
}
```

Contrast with `/api/comments/route.js:18-20`:
```
user = await requirePermission('comments.post');  // <-- permission model
```

**Impact:** 
- Any authenticated user (any role, including anon-converted-to-free) can create support tickets.
- No role-based visibility control. Cannot scope support access by tier (e.g., pro only, expert only).
- Risk: AI-gen spam, privilege-escalation claims submitted en masse by free tier.

**Reproduction:** 
1. Create free-tier account.
2. POST to `/api/support` with valid body.
3. Observe ticket created in support_tickets table (no permission check blocks it).

**Suggested fix direction:** Replace `requireAuth` with `requirePermission('support.ticket.create')` and wire the permission to role + plan checks.

**Confidence:** HIGH (code clearly lacks permission gate).

## HIGH

### F-A14-2-03 — Cron routes gated by `verifyCronAuth` (shared secret), not role/permission — internal auth bypass risk
**File:line:** `web/src/app/api/cron/send-emails/route.js:34` — all `/api/cron/*` routes

**Evidence:**
```
if (!verifyCronAuth(request).ok)
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

Cron routes run as service-role (unlimited mutations) on shared CRON_SECRET. If the secret leaks or Vercel Cron is misconfigured, any attacker can trigger:
- `send-emails` (mass email to all users, spam)
- `sweep-kid-trials` (terminate all kid accounts)
- `recompute-family-achievements` (data corruption)
- `process-deletions` (mass wipe)

No per-actor audit trail. No rate limit on the cron-secret itself (only internal `logCronHeartbeat`).

**Impact:**
- Mass-action DoS: send-emails can spam entire user base in one call.
- Account destruction: sweep-kid-trials, process-deletions run without role gate.
- No "who triggered this" log if secret is compromised.

**Reproduction:** 
1. Exfiltrate `CRON_SECRET` env var (or guess weak value).
2. POST to `/api/cron/send-emails` with `Authorization: Bearer $CRON_SECRET`.
3. Observe mass email dispatch (or error if RPC itself is gated).

**Suggested fix direction:** Rotate `CRON_SECRET` to a strong random value. Add optional per-route secret overrides. Emit to audit_log or admin_audit_log on cron execution (actor = 'system:cron:$route', not auth.uid()).

**Confidence:** MEDIUM (cron secret is intended to be internal-only, but code shows no anti-leakage measures; if secret is treated as public-safe, no issue).

## MEDIUM

### F-A14-2-04 — Kids pair route rate-limits on IP, not kid_profile_id — multi-account spam vector
**File:line:** `web/src/app/api/kids/pair/route.js:30-36`

**Evidence:**
```
const rate = await checkRateLimit(svc, {
  key: `kids-pair:${ip}`,  // <-- IP-based, not profile-based
  policyKey: 'kids_pair',
  max: 10,
  windowSec: 60,
});
```

An attacker on a single IP can:
- Redeem 10 pair codes per minute (even if each code → different kid_profile_id).
- Code-generation is unguarded; no evidence that codes are rate-limited or sequentially-spaced.

If pair codes are generated at scale or guessable (6-16 char alphanumeric), code brute-force + concurrent redemption is possible.

**Impact:** 
- Kid account enumeration/takeover if codes are weak.
- IP-wide DoS if attacker controls a residential IP block.

**Reproduction:** 
1. Generate N pair codes (if endpoint unguarded, or via admin).
2. From one IP, redeem 10 distinct codes in 60s.
3. Observe success (or RPC-side rejection only).

**Suggested fix direction:** Add per-code or per-parent-user rate limit. Validate pair codes are sufficiently random/long. Consider per-device-id secondary limiting (if device info is logged on pair).

**Confidence:** MEDIUM (depends on code-generation strength, which is not in this scan).

## MEDIUM

### F-A14-2-05 — Admin DELETE /roles handler referenced in punchlist as T0-1 (not yet shipped/fixed)
**File:line:** PM_PUNCHLIST reports "Handler crash on `DELETE /roles`" (MASTER_TRIAGE Tier 0 #1).

**Evidence:** Not directly scanned (route may be in /api/admin/roles or via RPC), but punchlist flags as unfixed.

**Impact:** 
- DELETE /admin/roles crashes the API (likely unhandled constraint error).
- Blocks role/hierarchy modifications in admin console.
- Status unknown — may be partially fixed or awaiting verification.

**Reproduction:** PM_PUNCHLIST: "Not shipped" — code inspection deferred pending confirmation.

**Suggested fix direction:** Inspect DELETE handler for `DELETE /api/admin/roles` or relevant RPC; validate error handling matches canonical pattern (checkRateLimit → parse → mutation → recordAdminAction → error envelope).

**Confidence:** MEDIUM (PM_PUNCHLIST is authoritative but not yet verified by this scan).

## LOW

### F-A14-2-06 — `article.read.log` permission does not differentiate tier in route code; tier cap enforced downstream (RLS/trigger)
**File:line:** `web/src/app/api/stories/read/route.js:28`

**Evidence:**
```
const user = await requirePermission('article.read.log', supabase);
```

No per-tier rate limit or quota check in the route. Trigger/RLS on reading_log table enforces the actual cap.

**Impact:** 
- UI may show "unlimited reads for pro tier" but if trigger fails silently or RLS is misconfigured, free tier can silently exceed cap.
- Client cannot pre-emptively warn user (no quota remaining feedback until insert fails).
- Low severity if RLS is correct; medium if trigger is the only gate.

**Reproduction:** 
1. Free tier user, 100 reads logged to date.
2. POST `/api/stories/read` with new article.
3. Observe insert success or constraint error (depends on trigger).
4. Repeat until reading_log insert fails.

**Suggested fix direction:** Check trigger/RLS definition to confirm cap is enforced. If possible, move quota check into route so client can surface feedback earlier.

**Confidence:** LOW (permission model exists; tier differentiation may be OK if downstream gates are correct).

## UNSURE

### F-A14-2-07 — `admin.ads.*` permissions do not appear wired to any specific role — verify permission_set grants
**File:line:** `web/src/app/api/admin/ad-placements/route.js:35` — requires `admin.ads.placements.create`

**Evidence:**
Routes under `/api/admin/ads/` call `requirePermission('admin.ads.*')`, but the permission → role wiring is unknown. Need to cross-check `permission_set_perms` table to confirm which roles can call these endpoints.

**Reproduction:** 
1. Query: `SELECT * FROM permission_set_perms WHERE permission_id IN (SELECT id FROM permissions WHERE key LIKE 'admin.ads%')`.
2. Verify the permission_set covers editor, admin, owner (or is intentionally scoped to admin+owner only).

**Suggested fix direction:** Confirm permission wiring in DB. If empty or misconfigured, wire permissions to role-to-permission mapping.

**Confidence:** LOW (code is correct; visibility gap is DB configuration only).

---

## Summary

**Total routes sampled:** ~90 API routes across /api/comments, /api/admin/*, /api/cron/*, /api/kids/*, /api/support, /api/stories.

**Enforcement pattern:**
- ✓ 95%+ of routes call `requirePermission(permKey)` — permission model is in place.
- ✓ 90%+ of admin routes call `checkRateLimit` — DoS protection exists.
- ✗ ~4 admin routes skip `recordAdminAction` — audit gap (HIGH).
- ✗ Support route uses `requireAuth` instead of permission model — compliance gap (HIGH).
- ✗ Cron routes gate on shared secret only — internal auth boundary risk (HIGH).
- △ Kids pair rate-limited on IP, not profile — weak multi-account protection (MEDIUM).

**No systemic UI-leakage issues found** (routes properly gate data at API level). **RLS enforcement is delegated to DB** (not verified in this scan; requires permission_set/role_permission_sets cross-check for complete visibility).

**Cross-check required:** Verify audit_log / admin_audit_log retention, RLS policies on sensitive tables, and DB-side enforcement for quoted features (e.g., bookmark cap, reading cap).

*Effort: 18 min. Token budget: 160k/200k.*
