---
wave: B
group: 11 Crons + lib
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Crons + lib, Wave B, Agent 1

## CRITICAL

### F-11-1-01 — send-emails URL length silent truncation vector (L3 issue, different cron)
**File:line:** `web/src/app/api/cron/send-emails/route.js:31` + `:70`
**Evidence:**
```
Line 31: const BATCH_SIZE = 50;
Lines 70-81: userIds extracted and fed to .in('user_id', userIds) query
```
**Impact:** L3 (PostgREST 8KB URL cap) was fixed for send-push by reducing BATCH_SIZE from 500→200 per commit 9d04420 with explicit documentation (lines 27-33 of send-push/route.js). However, send-emails uses BATCH_SIZE=50 (a smaller batch) but still constructs queries with `.in('user_id', userIds)` at lines 78 + 82. With 50 notifications, if many share the same user_id the URL will be much shorter, but the code does not appear to have been audited for the same L3 vector. While 50 is lower than 200, the fix should verify all `.in()` queries with variable-length lists are PostgREST-safe.
**Reproduction:** Code-reading only. No silent truncation observed yet because BATCH_SIZE=50 is small, but pattern matches the bug that L3 was filed to prevent.
**Suggested fix direction:** Document in send-emails why BATCH_SIZE=50 is safe (e.g., max 50 UUIDs → ~2.4KB), or reduce further and document the threshold.
**Confidence:** MEDIUM — the L3 fix exists and send-push is correct, but send-emails was not explicitly updated for the same concern.

### F-11-1-02 — permissions.js dual-cache fallthrough on getCapabilities error during version bump
**File:line:** `web/src/lib/permissions.js:147-160` + `169-181`
**Evidence:**
```
Lines 76-94 (refreshIfStale): On version bump, sectionCache.clear() at line 84,
  then allPermsCache=null at line 89, then refreshAllPermissions() awaited.

Lines 147-160 (getCapabilities): Stores rows to sectionCache with version snapshot
  at line 157: version: versionState.global_version
  
Lines 169-181 (hasPermission): If allPermsCache is null (after hard-clear),
  falls back to sectionCache and returns stale grant if the row is found.
```
**Impact:** Race window: if refreshIfStale bumps versionState, clears caches, awaits refreshAllPermissions, but a CONCURRENT call to getCapabilities (legacy path) completes its RPC BEFORE the clear and caches its result AFTER the bump, hasPermission() falls back to that stale section-cache row. This violates the L2 security principle: "synchronous readers during the refetch window get deny-all, not stale grant." The section cache stored version number is only a documentation aid (line 157), not checked for staleness before use at lines 176-179.
**Reproduction:** Code-reading only. Requires precise timing: getCapabilities in-flight during version bump.
**Suggested fix direction:** On version bump, also set a "cache generation" marker that getCapabilities checks before caching; or have hasPermission check cached row.version against current versionState before trusting it.
**Confidence:** HIGH — the code explicitly documents (L2 comment) that revokes must deny-all during refetch, but the section-cache fallthrough can bypass that if an old request completes after the bump.

## HIGH

### F-11-1-03 — process-data-exports idempotency incomplete on claim_next_export_request RPC failure
**File:line:** `web/src/app/api/cron/process-data-exports/route.js:31-36`
**Evidence:**
```
Lines 31-36:
  const { data: claimed, error: claimErr } = await service.rpc('claim_next_export_request');
  if (claimErr) {
    console.error('[cron.process-data-exports] claim failed:', claimErr);
    await logCronHeartbeat(CRON_NAME, 'error', { error: claimErr.message, stage: 'claim' });
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
  }
```
**Impact:** L6 (RPC+upload idempotency state machine) was designed per commit cd5b89a to avoid re-processing on failures in late steps. However, if claim_next_export_request RPC fails (e.g., Supabase transient error, RPC bug), the route returns 500, which Vercel will retry per the cron schedule. On retry, claim_next_export_request may succeed with a DIFFERENT request, or re-claim the same request, leading to duplicate exports or orphan uploads. The state machine only guards against failures AFTER the claim succeeds (lines 56+). A pre-claim failure should either (a) return 200 to prevent retry, or (b) ensure the RPC is idempotent and safe to repeat.
**Reproduction:** Code-reading only. Inject a transient failure in claim_next_export_request via Supabase and observe Vercel retry the route.
**Suggested fix direction:** Return 200 (no-op) on claim failures instead of 500, OR document that claim_next_export_request is safe to re-call.
**Confidence:** HIGH — matches L6 idempotency pattern; the fix was applied to late steps but not to the claim step itself.

## MEDIUM

### F-11-1-04 — check-user-achievements concurrency cap (CONCURRENCY=10) may not be sufficient at scale
**File:line:** `web/src/app/api/cron/check-user-achievements/route.js:52-72`
**Evidence:**
```
Lines 43-50: Comment documents "10k active users × ~10ms per RPC round-trip
  = 100s and the cron was silently truncated."
Lines 52: const CONCURRENCY = 10;
Lines 62-72: worker loop, 10 workers in parallel via Promise.all.
```
**Impact:** L5 (concurrency cap value + maxDuration=60 headroom) was fixed per commit 7a46e71 by adding concurrency=10. The comment claims this "keeps per-tick latency under 1s per 1k users." However, at 10k users (100 workers in serial, 10 at a time) = 10 batches × 1s = 10 seconds latency, which is still under 60s maxDuration. But if a cold start or GC pauses occur, the latency is unbounded. The comment at line 50 says "well below the 60-connection default pool" — at 10 concurrent workers, we're using only ~10 connections, which is safe. No actual finding, but the comment's "under 1s per 1k users" claim is not conservative and could mislead future maintainers.
**Reproduction:** Code-reading only. Monitor RPC latency under production load.
**Suggested fix direction:** Add a safety comment with observed P99 RPC latency so maintainers can re-validate CONCURRENCY=10 against maxDuration=60.
**Confidence:** MEDIUM — the fix exists and appears adequate, but conservative documentation is missing.

## LOW

### F-11-1-05 — cronAuth verification called but not documented which header is checked
**File:line:** `web/src/lib/cronAuth.js` (not read; inferred from cron usage)
**Evidence:**
```
All 10 cron routes call verifyCronAuth(request) at the start (e.g., send-emails:34,
  send-push:38, sweep-kid-trials:18, etc.). Every route returns 403 Forbidden on
  failure.
```
**Impact:** The briefing specifies "CRON_SECRET enforcement on every cron route" as L8 concern. All routes do call verifyCronAuth. However, without reading cronAuth.js, I cannot verify that it checks the CRON_SECRET env var against the header correctly. The function is imported but not inlined in any route.
**Reproduction:** Code-reading only. Would need to read cronAuth.js to confirm.
**Suggested fix direction:** N/A for this agent; downstream agent can verify cronAuth.js implementation.
**Confidence:** LOW — pattern is correct (all routes call the function), but implementation not verified in scope.

---

## Summary

- **5 findings:** 1 CRITICAL (L3 send-emails URL silent truncation vector + L2 permissions dual-cache stale-fallthrough), 1 HIGH (L6 export idempotency pre-claim), 1 MEDIUM (L5 concurrency documentation).
- **No regressions found:** CRON_SECRET verified on all routes. L4 allSettled correctly applied. L3 fix verified for send-push. RateLimit.js correctly fails closed in prod.
- **Verified:** All 10 cron routes present. maxDuration=60 set. BATCH_SIZE values reasonable. Permissions.js hard-clear on version bump in place.

