---
wave: A
group: 11 — Crons + lib
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Crons + lib, Wave A, Agent 3

## CRITICAL

### F-11-3-01 — Dual-cache stale-fallthrough in hasPermission
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/lib/permissions.js:169–181`
**Evidence:**
```javascript
export function hasPermission(key) {
  if (allPermsCache) {
    const row = allPermsCache.get(key);
    if (row) return !!row.granted;
    // Cache loaded but key not present — treat as deny (NOT_IN_RESOLVED_SET).
    return false;
  }
  for (const { rows } of sectionCache.values()) {
    const row = rows.find((r) => r.permission_key === key);
    if (row) return !!row.granted;
  }
  return false;
}
```
**Impact:** When `allPermsCache` is set (even to empty Map), the function returns deny for keys not in full cache. However, if the full-cache refetch is slow or fails after a hard-clear (lines 84–89), synchronous reads that hit the fallback loop (lines 176–179) will return stale grants from sectionCache. Worse: `refreshIfStale()` hard-clears `allPermsCache = null` before the refetch (line 89), but a concurrent synchronous `hasPermission()` call racing the refetch window hits the fallback and re-exposes a revoked grant from sectionCache until the new map swaps in. This defeats the L2 revoke-safety design.
**Reproduction:** Code-reading only. The race exists in a component lifecycle where `refreshIfStale()` is awaited but not blocking all synchronous permission checks—e.g., render → check perms → await refetch. A permission revoke can briefly pass checks during the await window.
**Suggested fix direction:** Make sectionCache clear conditional on full-cache load success, or gate the fallback loop on `allPermsCache !== null && allPermsCache.size > 0` to ensure stale section entries are not returned when the full cache was intentionally cleared.
**Confidence:** MEDIUM — the risk exists, but depends on the component structure using these APIs; needs UI-layer review to confirm exposure.

## HIGH

### F-11-3-02 — Missing allSettled on send-push setup fetches
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/send-push/route.js:77–89`
**Evidence:**
```javascript
const [{ data: prefs }, { data: tokens }, { data: planRows }] = await Promise.all([
  service
    .from('alert_preferences')
    .select('user_id, alert_type, channel_push, is_enabled, quiet_hours_start, quiet_hours_end')
    .in('user_id', userIds),
  service
    .from('user_push_tokens')
    .select('id, user_id, push_token, environment')
    .in('user_id', userIds)
    .eq('provider', 'apns')
    .is('invalidated_at', null),
  service.from('users').select('id, timezone, plans(tier)').in('id', userIds),
]);
```
**Impact:** Mirrors the same multi-fetch pattern as send-emails, but send-emails (route.js:77) explicitly uses `Promise.allSettled` with error handling for partial failures. send-push uses bare `Promise.all`, which halts on the first error and exits without marking any of the claimed notifications as sent, leaving them stuck in the queue. A transient database hiccup (connection pool exhaustion, replication lag) on the users lookup will orphan the entire batch and trigger a retry loop until the error clears.
**Reproduction:** Temporarily break the users query in send-push (e.g., invalid column), invoke the cron, observe batch marked unsent and next tick retries. Compare to send-emails, which proceeds with an empty prefs map.
**Suggested fix direction:** Wrap the three queries in `Promise.allSettled`, handle errors per fetch like send-emails does (users/tokens required, prefs optional), and mark notifications sent even if prefs lookup fails.
**Confidence:** HIGH

### F-11-3-03 — send-push CONCURRENCY=50 lacks headroom verification for 60s maxDuration
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/send-push/route.js:35, 271–272`
**Evidence:**
```javascript
const CONCURRENCY = 50;
// ...
while (i < pairs.length) {
  const wave = pairs.slice(i, i + CONCURRENCY);
  i += CONCURRENCY;
  await Promise.all(
    wave.map(async ({ n, token: t }) => {
      const r = await send(t.push_token, { ... });
      // ... APNs dispatch + push_receipts.insert ...
    })
  );
}
```
**Impact:** The send-push route sets `maxDuration = 60` and dispatches `CONCURRENCY=50` APNs calls in parallel per wave. APNs latency is network-dependent; comment on L3 (line 32) notes "maxDuration=60 still clears a full fan-out in multiple cron ticks," implying multiple wave iterations are expected. At 50 concurrent APNs sends × 500ms average latency, each wave takes ~500ms. At 2 waves, we hit 1s latency just for dispatch; add RPC overhead + DB updates + quota claims, and a large batch (200 notifications, 4 waves) risks truncation. The comment does not justify why 50 is safe; check-user-achievements (L5, line 52) explicitly caps concurrency at 10 for similar reasons (connection pool exhaustion). No evidence that APNs concurrency tuning was validated post-landing.
**Reproduction:** Code-reading only. Verify send-push cron logs for late-batch truncations at current scale; if missing, measure actual per-wave latency + total batch runtime.
**Suggested fix direction:** Reduce CONCURRENCY to 25–30 or add instrumentation (start/end per wave, total ms) to confirm 60s headroom is maintained.
**Confidence:** MEDIUM

## MEDIUM

### F-11-3-04 — process-data-exports upload path idempotency depends on upsert=false
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/process-data-exports/route.js:66–73`
**Evidence:**
```javascript
const json = JSON.stringify(snapshot, null, 2);
const size = new TextEncoder().encode(json).byteLength;
const stamp = Date.now();
const path = `${claimed.user_id}/${stamp}.json`;

const { error: uploadErr } = await service.storage.from(BUCKET).upload(path, json, {
  contentType: 'application/json',
  upsert: false,
});
```
**Impact:** The upload uses `upsert: false`, which rejects if the path already exists. This is correct for idempotency (prevents overwrites), but line 56 comment says "L6: state-machine the run so a failure in a late step doesn't reset a row." If the upload succeeds but the subsequent `createSignedUrl` (line 75) fails, the next tick will retry with the same `claimed.id` and hit the same `timestamp.json` path, which will now collide and return an upload error. The state machine only guards against late-stage reset (lines 99–108); early-stage collision is not handled. The `timestamp` resolution to `Date.now()` provides only 1ms granularity; two concurrent workers or a retry within 1ms hit the same path.
**Reproduction:** Manually trigger process-data-exports, observe claim, succeed upload, inject a failure in createSignedUrl (e.g., network error), wait <1s, invoke cron again. The second invocation will fail upload and reset the row despite the first upload succeeding.
**Suggested fix direction:** Include a UUID or sequence suffix in the path (e.g., `${claimed.user_id}/${stamp}-${uuid}.json`), or check if the path exists before upload and reuse the existing blob if `claimed.id` matches.
**Confidence:** MEDIUM

### F-11-3-05 — check-user-achievements worker loop shares cursor without mutex
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/check-user-achievements/route.js:57–72`
**Evidence:**
```javascript
let cursor = 0;
async function worker() {
  while (true) {
    const idx = cursor++;  // Non-atomic read-modify-write
    if (idx >= userIds.length) return;
    try {
      const { data } = await service.rpc('check_user_achievements', {
        p_user_id: userIds[idx],
      });
      awarded += (data || []).length;
    } catch (err) {
      failed += 1;
      console.error('[cron.check-achievements] user rpc failed:', userIds[idx], err);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
```
**Impact:** The `cursor++` increment is not atomic in JavaScript. With 10 concurrent workers, two workers can both read `cursor=5`, both increment locally, and both assign back, causing one to overwrite the other's increment. This results in duplicate RPC calls (same user_id processed by two workers simultaneously) or skipped users (userIds[6] never processed). In JavaScript async, this is less likely than true threading (event loop serializes the increment), but with enough concurrency or I/O-heavy RPCs, interleaving can occur. The `awarded` and `failed` counters have the same race. At scale (10k users, 10 workers), even a 0.1% duplicate/skip rate means 10+ users missed.
**Reproduction:** Run the cron at scale with 10k users, observe the sum of (processed users reported vs. actual length of userIds) over multiple runs; cumulative skew indicates races.
**Suggested fix direction:** Use a thread-safe counter pattern (e.g., `const processed = await Promise.all(workers.map(...)); const total = processed.reduce((a, b) => a + b, 0))`) or a queue-based pattern where workers dequeue safely.
**Confidence:** MEDIUM

## LOW

### F-11-3-06 — rate-limit RPC error classification may mask production incidents
**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/lib/rateLimit.js:134–145`
**Evidence:**
```javascript
if (error) {
  if (DEV_FAIL_OPEN) {
    console.warn('[rateLimit] RPC error in dev, failing open:', error.message);
    return {
      limited: false,
      remaining: effectiveMax,
      windowSec: effectiveWindow,
      reason: 'dev_fail_open',
    };
  }
  console.error('[rateLimit] RPC error, failing closed:', error.message);
  return { limited: true, remaining: 0, windowSec: effectiveWindow, reason: 'rpc_error' };
}
```
**Impact:** In production, any RPC error (network timeout, permission denied, RPC not deployed) triggers fail-closed (limit=true), blocking legitimate traffic. The `console.error` log is the only signal; if the RPC is silently broken (e.g., revoked permissions after a deployment), a Sentry alert may not fire, and the logs are noise at scale. The `reason: 'rpc_error'` is too broad; callers can't distinguish between transient errors (retry helpful) and permanent ones (escalate). Depending on Sentry rules and team velocity, a persistent RPC breakage could block all auth for minutes undetected.
**Reproduction:** Revoke execute permission on the check_rate_limit RPC in the Supabase database, invoke /api/auth/signin, observe 403 errors with no actionable context in the logs.
**Suggested fix direction:** Log the error code (e.g., `error.code`, `error.status`) separately, or fire a high-severity alert (e.g., Sentry with tags) on persistent rpc_error conditions.
**Confidence:** LOW

---

## Summary

**CRITICAL (1):** Dual-cache fallthrough in permissions during version bumps can re-expose revoked grants via section-cache fallback. Requires UI-layer verification of exposure.

**HIGH (1):** send-push missing allSettled on setup fetches leaves batches stuck on transient errors, unlike send-emails which handles partial failures.

**MEDIUM (3):** send-push concurrency lacks validated headroom; data-exports upload collision window; check-achievements race on cursor/counters.

**LOW (1):** Rate-limit RPC errors lack granular classification, risking silent production incidents.

All cron routes correctly enforce `verifyCronAuth` with fail-closed 403. BATCH_SIZE reductions (L3) and allSettled (L4), concurrency caps (L5), state-machine guards (L6), and atomic claim (L19) are correctly implemented in their respective routes.
