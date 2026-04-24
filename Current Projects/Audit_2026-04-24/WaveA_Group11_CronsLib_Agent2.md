---
wave: A
group: 11 Crons + lib
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24T13:20:00Z
---

# Findings — Crons + lib, Wave A, Agent 2/3

## CRITICAL

### F-11-2-01 — Missing maxDuration export in 4 cron routes
**File:line:** 
- `/web/src/app/api/cron/process-data-exports/route.js:18-19`
- `/web/src/app/api/cron/process-deletions/route.js:31-32`
- `/web/src/app/api/cron/recompute-family-achievements/route.js:16-17`
- `/web/src/app/api/cron/flag-expert-reverifications/route.js:17-18`

**Evidence:**
All four routes declare `export const dynamic = 'force-dynamic'` and `export const runtime = 'nodejs'` but omit `export const maxDuration = N`. Routes with maxDuration set (check-user-achievements, send-emails, send-push, sweep-kid-trials, pipeline-cleanup) range from 15–60 seconds. Without an explicit cap, Vercel's default maxDuration (300s for Hobby, 900s for Pro) applies; at scale these routes can silently timeout and leave work incomplete.

**Impact:** 
- process-data-exports: upload completes but notification never fires → user sees no completion signal
- process-deletions: auth.admin.deleteUser loop on 1000 candidates × ~100ms RPC can exceed 300s → rows re-queued indefinitely
- recompute-family-achievements + flag-expert-reverifications: RPC-heavy, unbounded at scale

**Reproduction:** Code-reading only. No observable symptom if queues are small; risk surfaces at scale (e.g., 100k users, 10k pending exports).

**Suggested fix direction:** Set `export const maxDuration = 60` (or project-appropriate value) on all four routes; document rationale as per other routes.

**Confidence:** HIGH

---

## HIGH

### F-11-2-02 — Permissions dual-cache fallthrough during version bump (stale-read risk)
**File:line:** `/web/src/lib/permissions.js:169-181`

**Evidence:**
```javascript
export function hasPermission(key) {
  if (allPermsCache) {
    const row = allPermsCache.get(key);
    if (row) return !!row.granted;
    return false;
  }
  for (const { rows } of sectionCache.values()) {
    const row = rows.find((r) => r.permission_key === key);
    if (row) return !!row.granted;  // <-- FALLBACK to stale section-cache
  }
  return false;
}
```

During `refreshIfStale()` line 84–89, on a version bump the code hard-clears `sectionCache` and `allPermsCache = null`. However, if `refreshAllPermissions()` fails (error on line 111), `allPermsCache` stays null but any in-flight section-cache entries (from legacy `getCapabilities()` calls) remain populated. A synchronous `hasPermission()` call during the failure window reads from the stale section cache instead of denying — re-exposing a permission that the version bump was trying to revoke.

**Impact:** Revoked admin role, downgraded plan, or lifted permission briefly re-grants access if `compute_effective_perms` RPC fails and a section-cache fetch is in flight. Depends on call ordering (legacy callers filling sectionCache), so impact is inconsistent.

**Reproduction:** 
1. Trigger version bump (role change, plan downgrade).
2. Simultaneously call legacy `getCapabilities(section)` and `hasPermission(key)`.
3. Inject RPC failure on `compute_effective_perms`.
4. Observe stale grant from section cache.

**Suggested fix direction:** On `refreshIfStale()` version bump, also clear `inflight` map (line 39) and invalidate in-flight section-cache promises to prevent fallback reads.

**Confidence:** MEDIUM (depends on race condition; mitigation already in place for new path per L2 comments, but legacy path is incompletely guarded)

---

## MEDIUM

### F-11-2-03 — Rate-limit RPC truncates remaining field on out-of-bounds value
**File:line:** `/web/src/lib/rateLimit.js:160-166`

**Evidence:**
```javascript
return {
  limited: Boolean(data.limited),
  remaining: Number.isFinite(data.remaining) ? data.remaining : 0,
  windowSec: effectiveWindow,
};
```

The check `Number.isFinite()` catches NaN and Infinity but not negative values. If the check_rate_limit RPC returns `remaining: -1` (by bug or edge case), the caller reads a negative remaining field, which can mislead Retry-After header computation or client-side UI.

**Impact:** Incorrect Retry-After calculation if a rate-limit caller derives it from remaining; user gets nonsensical backoff instruction. Low user-facing impact (Retry-After is advisory), but logging and observability break.

**Reproduction:** Manually set check_rate_limit to return remaining=-1; call checkRateLimit; observe output.

**Suggested fix direction:** Clamp remaining to `Math.max(0, data.remaining)` instead of ternary on isFinite.

**Confidence:** LOW

---

## LOW

### F-11-2-04 — ASSUMPTION: send-emails template variable injection context
**File:line:** `/web/src/app/api/cron/send-emails/route.js:152-159`

**Evidence:**
```javascript
const variables = {
  username: u.username || 'there',
  title: n.title,
  body: n.body,
  action_url: n.action_url ? absoluteUrl(n.action_url) : '',
  ...(n.metadata || {}),  // <-- UNTRUSTED METADATA SPREAD
};
const rendered = renderTemplate(tpl, variables);
```

The spread of `n.metadata || {}` injects arbitrary keys into the template context. If metadata is user-controlled (e.g., set via a user-facing API endpoint that creates notifications), an attacker could inject a variable that shadows a template safe var (e.g., `metadata: { csrf_token: 'attacker-value' }`). The renderTemplate function is not examined here, but if it does naive variable substitution without escaping or validation, this is a template-injection vector.

**Impact:** Template variable shadowing or injection if renderTemplate uses unsafe interpolation and metadata comes from untrusted input.

**Reproduction:** Code-reading only; requires inspection of create_notification and renderTemplate implementations.

**Suggested fix direction:** Whitelist safe metadata keys or validate metadata shape before spread.

**Confidence:** LOW (depends on renderTemplate implementation and metadata source — no direct evidence of unsafe usage)

---

## UNSURE

### F-11-2-05 — Dual-cache invalidation semantics during concurrent refreshes
**File:line:** `/web/src/lib/permissions.js:37, 98, 133`

Concurrent calls to `refreshAllPermissions()` dedupe via `allPermsInflight` (line 98), but the section-cache path does the same via `inflight` Map (line 39). If a caller starts a legacy section fetch (inflight[section] = promise) and then calls refreshIfStale(), the section promise remains inflight and can populate sectionCache even after hard-clear. Question: is `inflight` cleared during refreshIfStale()? Review shows it is not (line 84–89 only clear sectionCache, not inflight). If a stale inflight promise resolves after the clear, it re-populates the cache.

**Information to resolve:** Does the inflight Map promise resolve after refreshIfStale() hard-clear? If so, does the resolved value (old permission rows) get cached despite the clear? Requires execution trace under concurrent load.

**Confidence:** LOW (static analysis; behavior depends on Promise race)

