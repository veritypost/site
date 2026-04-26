---
wave: B
group: 11 Crons + lib
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Crons + lib, Wave B, Agent 3

## CRITICAL

### F-B11-3-01 — Permissions dual-cache miss after all revokes (stale-fallthrough recovery risk)

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/lib/permissions.js:169-181`

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
    if (row) return !!row.granted;
  }
  return false;
}
```
When `allPermsCache = null` (post-revoke hard-clear at line 89) and `sectionCache` is also empty, hasPermission returns false correctly. However, the two-cache design during the Wave 1→2 migration creates a transient window: if refreshAllPermissions() throws before swapping in the new map (line 120 returns `allPermsCache` when it's still null from the bump), then hasPermission falls back to searching sectionCache. If sectionCache was populated before the revoke via the old path (getCapabilities), it will still contain the revoked grant. The invalidate() call clears both caches (line 44-48), but callers that only await refreshIfStale (not invalidate) may retain stale section entries across a revoke bump until the section cache TTL or next explicit invalidate.

**Impact:** A user whose permissions are revoked while they have a browser tab open could retain a grant for ~seconds (until version poll) or indefinitely (if they never trigger a section fetch). The new full-cache path (allPermsCache) correctly fails closed, but stale section-cache entries create a leak during the migration.

**Reproduction:** 
1. Admin revokes editor_articles from a user while user has browser session with cached getCapabilities('articles').
2. Version bump fires, refreshIfStale hard-clears allPermsCache (good).
3. refreshAllPermissions() fetches compute_effective_perms and overwrites allPermsCache with no revoked entries.
4. But if a route checks hasPermission('editor_articles') before hitting Step 3's await, and sectionCache still has the old entry from getCapabilities, hasPermission returns true (leak).

**Suggested fix direction:** Before awaiting refreshAllPermissions on a version bump, also clear sectionCache in refreshIfStale (already done at line 84), and ensure every hasPermission call favors the full-perms path by initializing allPermsCache to an empty Map rather than null on app load (so the section fallback is only for legacy getCapabilities callers).

**Confidence:** MEDIUM — The actual impact depends on whether sectionCache entries are still live after an edit; the code clears inflight on error, so double-checks could also populate sectionCache during the migration, but this is a latent timing hazard.

---

## HIGH

### F-B11-3-02 — Rate-limit fall-open gate in development is auth-code-only, not operator-auditable

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/lib/rateLimit.js:40-47`

**Evidence:**
```javascript
const IS_PROD =
  process.env.VERCEL_ENV === 'production' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.NODE_ENV === 'production';
const DEV_FAIL_OPEN =
  !IS_PROD &&
  process.env.NODE_ENV === 'development' &&
  process.env.RATE_LIMIT_ALLOW_FAIL_OPEN === '1';
```
The RATE_LIMIT_ALLOW_FAIL_OPEN=1 guard is correct for local dev, but the gate is enforced only at runtime. If a developer forgets the env var or someone misconfigures staging, there is no audit trail in code or config that shows "this deploy now has loose rate limits." Any `.env.local` or CI var misconfiguration silently downgrades auth brute-force protection without a code review.

**Impact:** Staging or preview builds with NODE_ENV=development but no RATE_LIMIT_ALLOW_FAIL_OPEN=1 fail closed (good), but a misconfigured CI/CD or fork that set RATE_LIMIT_ALLOW_FAIL_OPEN=1 would open the gate silently. The check_rate_limit RPC error path at line 135-142 would then return { limited: false } without a loud console.error.

**Reproduction:** Set RATE_LIMIT_ALLOW_FAIL_OPEN=1 in a staging build with NODE_ENV=development + manually trigger the RPC error path (kill Supabase); login attempt silently fails-open.

**Suggested fix direction:** Add a startup-time console.error (not warn) that logs when DEV_FAIL_OPEN is true, so every deploy that enables it is visible in log dumps; consider making this a throwError in non-dev to catch config mistakes earlier.

**Confidence:** MEDIUM — This is a potential config-slip risk, not a code bug. The logic is correct but under-instrumented.

---

## MEDIUM

### F-B11-3-03 — send-emails batch doesn't re-check maxDuration capacity for prefs/template fetches

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/send-emails/route.js:70-88`

**Evidence:**
```javascript
const userIds = [...new Set(queued.map((n) => n.user_id))];
const [usersRes, prefsRes, templatesRes] = await Promise.allSettled([
  service.from('users').select('id, email, username, email_verified').in('id', userIds),
  service.from('alert_preferences').select(...).in('user_id', userIds),
  service.from('email_templates').select('*').in('key', Object.values(TYPE_TO_TEMPLATE)).eq('is_active', true),
]);
```
The route declares maxDuration=60 (line 19) but doesn't check how many users are in the batch. With BATCH_SIZE=50, a typical run is <5s. However, if alert_preferences or users tables have > N million rows and the query planner picks a poor index, the in('user_id', userIds) scan could approach 60s on cold starts. The allSettled pattern is good (L4 coverage), but there's no early-exit guard if the setup fetch takes > 50s (leaving only 10s for sending). A stalled setup fetch would cause the cron to emit a successful 500 response and re-queue the entire batch.

**Impact:** Large batches + slow DB query → timeout silently (cron marks as error via heartbeat, but the row is left as email_sent=false). Next tick re-fetches the same batch and repeats. No user-visible impact (email always eventually sends), but adds harmless retries.

**Reproduction:** On a slow Supabase, manually set BATCH_SIZE=500 and trigger the cron; if setup fetch takes >50s (due to a table scan), see the 500 response and the same 500 queued rows re-appear on next tick.

**Suggested fix direction:** Measure setup-fetch elapsed time and early-exit with error if it exceeds (maxDuration - 20) before entering the send loop.

**Confidence:** LOW — The actual risk is near-zero on Supabase's managed infra, and maxDuration=60 with BATCH_SIZE=50 has ample margin. This is a defensive hardening, not a current bug.

---

### F-B11-3-04 — check-user-achievements cursor increment is racy under concurrent worker restarts

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/check-user-achievements/route.js:57-72`

**Evidence:**
```javascript
let cursor = 0;
async function worker() {
  while (true) {
    const idx = cursor++;
    if (idx >= userIds.length) return;
    try {
      const { data } = await service.rpc('check_user_achievements', {
        p_user_id: userIds[idx],
      });
```
The `cursor++` is not protected; if one worker increments and crashes before the RPC completes, another worker still sees `idx` but the increment was already applied. Under concurrent Promise.all workers, a race can skip a user (one worker gets idx N, crashes before RPC, cursor already incremented, next worker gets idx N+1). With CONCURRENCY=10, the chance is low, but at scale (10k users) a skipped user is possible.

**Impact:** An achievement event that fires only on the 48h sweep (e.g., a streak milestone) might not trigger for a user if their worker crashed or timed out after incrementing the cursor. The next 48h window catches them, so the SLA is 48h recovery, not permanent loss.

**Reproduction:** Set CONCURRENCY=100, run check-achievements on 1k+ users, inject a throw in the RPC line; count completed RPCs vs userIds.length.

**Suggested fix direction:** Use a shared, awaited queue or atomically claim a batch (similar to claim_push_batch) instead of an unprotected counter.

**Confidence:** LOW — The race condition window is tiny; CONCURRENCY=10 makes it unlikely on current infra. This is a latent multi-worker hazard.

---

### F-B11-3-05 — process-data-exports orphan cleanup not awaited on pre-completion error

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/process-data-exports/route.js:146-151`

**Evidence:**
```javascript
if (uploadedPath) {
  await service.storage
    .from(BUCKET)
    .remove([uploadedPath])
    .catch((e) => console.warn('[cron.process-data-exports] orphan cleanup on error:', e));
}
```
The orphan cleanup is awaited (good, L6 state-machine awareness), but if `service.storage.remove()` itself throws (not just returns an error in the catch), the throw is not caught. If Supabase storage is transiently down, the cleanup fails and the exception propagates. The error handler at line 161-165 then logs and returns a 500, which is correct, but the orphan blob remains in the bucket forever (no second chance to delete it).

**Impact:** Transient storage outage during a data export → orphan JSON blob in data-exports bucket → space accumulates. The impact is small (7-day retention + eventual GC), but each failed export leaves a leak.

**Reproduction:** Mock service.storage.remove() to throw; trigger process-data-exports on a request with a large export.

**Suggested fix direction:** Wrap the remove call in a try/catch and ignore the exception (best-effort cleanup is fine; the row is already in 'pending' so next tick retries the whole export anyway).

**Confidence:** LOW — Storage failures are rare on managed Supabase, and the blob is just temporary data.

---

## LOW

### F-B11-3-06 — cronAuth timing-safe compare gate accepts invalid CRON_SECRET length silently

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/lib/cronAuth.js:35-42`

**Evidence:**
```javascript
const a = Buffer.from(sent);
const b = Buffer.from(expectedHeader);
let match = false;
try {
  match = a.length === b.length && crypto.timingSafeEqual(a, b);
} catch {
  match = false;
}
```
When expectedHeader is much longer than sent (e.g., sent is empty, expectedHeader is 100+ chars), the length check at line 39 short-circuits the timingSafeEqual and returns false. This is correct. However, if process.env.CRON_SECRET is undefined (line 25), expectedHeader becomes `"Bearer undefined"` (16 chars). A caller with an empty Authorization header (sent = "") will fail the length check (8 vs 16) and return { ok: false, reason: 'bad_secret' }, which is correct. But there's no startup-time validation that CRON_SECRET is set to a real, non-empty value. A misconfigured production deploy without CRON_SECRET would silently treat all external cron calls as bad_secret (correct behavior) but without a console.error at startup.

**Impact:** If CRON_SECRET is missing from a production deploy's env, all cron routes return 403. Operators would see 403s in Vercel's cron logs but might not realize why (no error message on startup). Vercel's built-in x-vercel-cron header still passes (because of line 22), so scheduled crons work, but manual backfills fail silently.

**Reproduction:** Deploy with CRON_SECRET unset; try to manually trigger a cron via curl; see 403.

**Suggested fix direction:** Add a startup-time check in the server initialization that logs an error if CRON_SECRET is not set (when NODE_ENV !== development), similar to the APNS_AUTH_KEY check at line 50-53 of send-push.

**Confidence:** LOW — This is a config-validation gap, not a security hole. The logic is correct.

---

## UNSURE

### F-B11-3-07 — claim_push_batch RPC stale-claim TTL is not documented in route comments

**File:line:** `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/send-push/route.js:57-62`

**Evidence:**
```javascript
// L19: atomic claim via claim_push_batch RPC (FOR UPDATE SKIP LOCKED so
// overlapping cron invocations see disjoint rows). Replaces the prior
// SELECT-then-mark pattern, which let two concurrent runs pick up the
// same 200 notifications and dispatch each one twice. Stale claims
// (>5 min old) are reclaimable inside the RPC so a crashed prior run
// doesn't permanently lock notifications.
```
The comment says stale claims (>5 min old) are reclaimable, but there's no reference to the migration or RPC definition that hardcodes this TTL. If an operator later reviews the code and wonders "how does the TTL work?", they have to search migrations or the RPC definition. If the RPC's TTL changes in a future migration, the comment becomes outdated.

**Impact:** No immediate impact; this is documentation debt. An operator might be confused about how long a crashed cron holds a notification hostage.

**Reproduction:** Try to find the 5-minute TTL in the route code alone (without reading the RPC).

**Suggested fix direction:** Add a comment in the route linking to the RPC or migration (e.g., "See migration 159: claim_push_batch RPC for the 5-min TTL logic"), or hardcode the TTL as a constant and reference it from the route.

**Confidence:** LOW — This is a documentation quality issue, not a bug.

---

## Summary

All scope items (send-emails, send-push, sweep-kid-trials, check-user-achievements, pipeline-cleanup, process-data-exports, process-deletions, and lib auth/permissions/rateLimit/roles/plans/featureFlags/supabase/adminPalette/appleReceipt/apiErrors) have CRON_SECRET enforcement via verifyCronAuth. L3 (BATCH_SIZE=200 under 8KB), L4 (allSettled), L5 (concurrency cap), L6 (state machine) are all implemented correctly. L8 (rate-limit fail-closed in prod) is correct. L19 (claim_push_batch atomicity) verified. The main finding is a dual-cache stale-fallthrough risk during the Wave 1→2 permissions migration (MEDIUM confidence, LOW actual impact on modern code paths). Rate-limit dev gate lacks audit logging. Minor hazards in concurrent worker cursor and orphan cleanup exception handling.
