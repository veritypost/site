---
wave: A
group: 11 Crons + Lib
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Crons + Lib, Wave A, Agent 1/3

## CRITICAL

None found.

## HIGH

### H-1 — send-push CONCURRENCY=50 may exceed Supabase connection pool under load
**File:line:** `web/src/app/api/cron/send-push/route.js:35`
**Evidence:**
```javascript
const CONCURRENCY = 50;
```
With 50 concurrent APNs dispatch operations each holding a Supabase connection (for `push_receipts.insert` at line 282 and `rpc('invalidate_user_push_token')` at line 297), under a BATCH_SIZE=200 fan-out this saturates the default 60-connection pool on the first wave alone. A subsequent cron tick or background RPC would block. The comment on lines 19-21 states "BATCH_SIZE × concurrency are tuned so breaking-news fan-outs drain in a few minutes" but does not quantify the connection headroom.

**Impact:** Connection pool exhaustion → transient RPC timeouts on concurrent cron runs or API requests, silent transaction aborts (no error surface to the cron handler), failed push receipts recorded.

**Reproduction:** Code-reading only; run two overlapping send-push ticks with BATCH_SIZE=200 + CONCURRENCY=50 + users with 2+ devices each (pairs.length > 100).

**Suggested fix direction:** Reduce CONCURRENCY to ≤20 or pool connection count; benchmark peak connection usage under realistic fan-out load.

**Confidence:** MEDIUM — the pool default is 60, but actual pool size is deployment-specific; needs Supabase console confirmation.

## MEDIUM

### M-1 — pipeline-cleanup maxDuration=15 is insufficient headroom for 500-cluster expiry sweep
**File:line:** `web/src/app/api/cron/pipeline-cleanup/route.ts:50`
**Evidence:**
```typescript
export const maxDuration = 15;
```
The cron performs four sweeps: orphan runs, orphan items (two tables), orphan locks, and cluster expiry. Cluster expiry (lines 152-217) serially calls `archive_cluster` RPC up to 500 times (CLUSTER_EXPIRY_CAP = 500, line 148). At ~20-50ms per RPC on Vercel cold-start, a full sweep can easily exceed 10 seconds. The comment at line 2 notes "Hobby tier safety net" but does not justify the 15s limit against the 500 × RPC budget.

**Impact:** Late clusters in the expiry batch get silently skipped if the function times out; the next day's run re-scans and may archive them then. No data loss but delayed cleanup — acceptable for a daily sweep but worth noting.

**Reproduction:** Code-reading only; deploy to a Vercel hobby tier, trigger a pipeline-cleanup run against a database with 500+ eligible clusters, monitor CloudWatch logs for truncation.

**Suggested fix direction:** Increase maxDuration to 30s (stays under Hobby tier function timeout) or cap archive_cluster calls to 200/run.

**Confidence:** MEDIUM — depends on actual RPC latency in production; needs benchmarking.

### M-2 — check-user-achievements CONCURRENCY=10 lacks connection pool headroom buffer
**File:line:** `web/src/app/api/cron/check-user-achievements/route.js:52`
**Evidence:**
```javascript
const CONCURRENCY = 10;
// Comment lines 49-50: "well below the 60-connection default pool"
```
The cron maintains 10 concurrent RPC calls to `check_user_achievements`. While 10 < 60, the comment acknowledges the 60-connection default. On a Hobby tier Supabase with reduced pool size, or if other processes are holding connections, this could contend. No explicit guard against pool saturation.

**Impact:** Connection pool contention on concurrent cron runs or API spikes; slow-down or silent RPC timeout on edge of capacity.

**Reproduction:** Code-reading only; would need to reduce pool size on test Supabase and trigger concurrent admin queries.

**Suggested fix direction:** Add a pool-size aware CONCURRENCY cap or monitor Supabase connection usage in production.

**Confidence:** MEDIUM — depends on actual pool configuration; mitigation is low-risk (document pool requirement in CLAUDE.md).

### M-3 — send-emails does not call checkRateLimit before sending
**File:line:** `web/src/app/api/cron/send-emails/route.js:33-191`
**Evidence:**
```javascript
// No checkRateLimit call anywhere in the route
// Batch is processed in a for-loop (lines 127-188) with no rate-limit gate
```
Unlike auth routes (`/api/auth/login`, etc.) that call `checkRateLimit`, the send-emails cron has no per-user or per-sender rate limit. A malicious actor could trigger a DoS by creating thousands of notification rows with type `breaking_news`, forcing Resend API hammering on the next cron tick. Resend's own API has rate limits (~1000/sec) but the cron carries no circuit-breaker.

**Impact:** Resend API quota exhaustion → email delivery failures for legitimate breaking news notifications; silent skips (no error UX to the cron handler).

**Reproduction:** Manual: INSERT 50,000 notification rows with type='breaking_news', run send-emails, observe Resend rate-limit errors in logs.

**Suggested fix direction:** Add a per-domain and/or per-user rate limit check before calling sendEmail(); consult rate_limits table for email_send policy.

**Confidence:** MEDIUM — plausible attack, but requires admin INSERT or application vulnerability to create bogus notifications. Actual sending is gated by user account existence + email_verified + alert preferences (which are opt-in by default).

## LOW

### L-1 — send-push prefsRes fallback to empty map silences preference fetch errors
**File:line:** `web/src/app/api/cron/send-push/route.js:77-89`
**Evidence:**
```javascript
const [{ data: prefs }, { data: tokens }, { data: planRows }] = await Promise.all([
  service.from('alert_preferences').select(...),
  service.from('user_push_tokens').select(...),
  service.from('users').select(...),
]);
// No allSettled, so a failure here aborts the batch
```
Actually, wait — this is Promise.all, not allSettled. But lines 77-89 only extract the data field and assume the result is fulfilled. If the alert_preferences query errors, Promise.all rejects and the entire batch fails (loadErr on line 68 catches it). However, the comment on line 91 says "alert_preferences lookup failed; proceeding with empty map — the default behavior is 'send'". 

**Correction:** This is actually NOT a bug — if prefs fails, Promise.all rejects and returns 500, leaving the batch for retry. The comment is misleading but the code is safe (fail-closed).

No finding here.

## UNSURE

### U-1 — withCronLog skips logging for 401/403 auth failures
**File:line:** `web/src/lib/cronLog.js:37-40`
**Evidence:**
```javascript
// Treat 401/403 as probes — no durable record, no Sentry line.
// Let the response pass through untouched.
if (!caught && (statusCode === 401 || statusCode === 403)) {
  return response;
}
```
The wrapper intentionally does not log 401/403 responses to avoid flooding the webhook_log table with probe attempts. However, this also means a misconfigured CRON_SECRET that triggers verifyCronAuth to return 403 leaves no trace in the database — an operator investigating missing cron runs would see no evidence in webhook_log. 

**Question:** Is the absence of a webhook_log entry intentional for security (hide cron existence from logs) or an oversight? If intentional, consider documenting in CLAUDE.md that 401/403 are not logged and suggesting operators monitor Sentry or cloud function logs instead.

**Confidence:** LOW — likely intentional for security, but worth clarifying.

---

## Summary

All 10 cron routes properly enforce CRON_SECRET via `verifyCronAuth` with timing-safe constant-time comparison. Recent commits (9d04420, 8b304e7, 7a46e71, cd5b89a, 98c6662) addressed L3/L4/L5/L6/L19 focus areas:
- L3: BATCH_SIZE reduced to 200 ✓
- L4: allSettled coverage in send-emails ✓
- L5: parallelization with concurrency cap ✓
- L6: state-machine idempotency in data-exports ✓
- L19: atomic claim via RPC ✓

Dual-cache permissions (section+full) hard-clear on version bump to fail-closed on revokes ✓. Rate-limit helper fails closed in prod ✓.

No CRITICAL findings. Three HIGH/MEDIUM findings related to connection pool headroom and rate limiting that warrant operational validation or minor tuning.
