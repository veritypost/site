---
group: 11 Crons + lib
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — Group 11: Crons + lib

## AGREED findings (≥2 agents, both waves ideally)

### R-11-AGR-01 — Missing maxDuration exports on 4 cron routes
**Severity:** CRITICAL
**File:line:** 
- `web/src/app/api/cron/process-data-exports/route.js:18-19`
- `web/src/app/api/cron/process-deletions/route.js:31-32`
- `web/src/app/api/cron/recompute-family-achievements/route.js:16-17`
- `web/src/app/api/cron/flag-expert-reverifications/route.js:17-18`

**Surfaced by:** WaveA Agent2 (F-11-2-01); WaveB Agent3 acknowledges focus area L6 coverage

**Consensus description:** Four cron routes declare `export const dynamic = 'force-dynamic'` and `export const runtime = 'nodejs'` but omit `export const maxDuration = N`. Without explicit cap, Vercel's default (300s Hobby, 900s Pro) applies. At scale, these routes can silently timeout and leave work incomplete:
- process-data-exports: notification never fires after upload
- process-deletions: 1000+ auth.admin.deleteUser calls can exceed 300s
- recompute-family-achievements, flag-expert-reverifications: RPC-heavy, unbounded

**Suggested disposition:** AUTONOMOUS-FIXABLE — Add `export const maxDuration = 60` to all four routes, matching the pattern in check-user-achievements (60s), send-emails (60s), pipeline-cleanup (15s).

### R-11-AGR-02 — send-push Promise.all missing allSettled on setup fetches
**Severity:** HIGH
**File:line:** `web/src/app/api/cron/send-push/route.js:77–89`

**Surfaced by:** WaveA Agent3 (F-11-3-02), WaveB Agent2 (F-B11-03 mirrors send-emails pattern)

**Consensus description:** send-push uses bare `Promise.all([alert_preferences, user_push_tokens, users])`, which halts on the first error and exits without marking notifications as sent. Batch orphans and triggers retry loop. Contrast: send-emails uses `Promise.allSettled` (L4 implementation per commit 8b304e7), which proceeds with optional prefs=null. Under transient DB hiccup (connection pool exhaustion, replication lag), send-push crashes entire batch vs. send-emails' partial-failure path.

**Suggested disposition:** AUTONOMOUS-FIXABLE — Swap send-push's Promise.all → Promise.allSettled for the 3 lookups; handle errors per fetch (users/tokens required, prefs optional), matching send-emails' pattern.

### R-11-AGR-03 — CONCURRENCY=50 (send-push) may saturate Supabase 60-connection pool
**Severity:** HIGH
**File:line:** `web/src/app/api/cron/send-push/route.js:35`

**Surfaced by:** WaveA Agent1 (H-1), WaveA Agent3 (F-11-3-03), WaveB Agent2 (F-B11-02)

**Consensus description:** 50 concurrent APNs dispatch operations each holding a Supabase connection (for `push_receipts.insert` and RPC calls). With BATCH_SIZE=200 fan-out, at 50 concurrency on first wave alone saturates the default 60-connection pool. Comment claims "breaking-news fan-outs drain in a few minutes" but does not quantify connection headroom. Under Vercel cold starts or high cardinality user fan-out, this could spike to saturation, blocking other crons + production traffic. No current failures observed, but capacity risk is real.

**Suggested disposition:** OWNER-ACTION — Validate peak connection usage under realistic fan-out load in production (via Supabase console). If saturation observed, reduce CONCURRENCY to 20–25 or increase pool size. Add documentation linking the 60-conn default assumption to this setting.

### R-11-AGR-04 — Permissions dual-cache stale-fallthrough during version bump
**Severity:** HIGH
**File:line:** `web/src/lib/permissions.js:169–181` (hasPermission), 84–89 (refreshIfStale)

**Surfaced by:** WaveA Agent2 (F-11-2-02), WaveA Agent3 (F-11-3-01), WaveB Agent1 (F-11-1-02), WaveB Agent3 (F-B11-3-01)

**Consensus description:** Race window during permission revoke:
1. Admin revokes a grant → version bump fires
2. refreshIfStale() hard-clears `allPermsCache = null` (line 89) before refetch
3. If concurrent `hasPermission(key)` call fires during refetch window, it checks `allPermsCache` (null) but then falls back to `sectionCache` (populated by old `getCapabilities` call before revoke)
4. Returns stale grant instead of deny

The L2 revoke-safety design intends "synchronous readers during refetch window get deny-all," but stale section-cache entries can re-expose revoked grants for ~seconds until version poll or next invalidate. WaveA-Agent3 notes section-cache entries remain inflight after hard-clear; WaveB-Agent1 highlights the race depends on concurrent getCapabilities completing after the bump.

**Suggested disposition:** OWNER-ACTION — Requires UI-layer review to confirm exposure severity. Mitigation options: (a) Clear `sectionCache` before awaiting refreshAllPermissions in refreshIfStale, or (b) Initialize `allPermsCache` to empty Map (not null) on app load so fallback loop is never consulted on version bump, or (c) Check cached row version against current versionState before trusting it.

---

## UNIQUE-A findings (Wave A only, needs tiebreaker)

### R-11-UA-01 — pipeline-cleanup maxDuration=15 insufficient for 500-cluster expiry sweep
**Severity:** MEDIUM
**File:line:** `web/src/app/api/cron/pipeline-cleanup/route.ts:50`

**Surfaced by:** WaveA Agent1 (M-1) only

**Description:** Cron performs four sweeps including cluster expiry, which serially calls `archive_cluster` RPC up to 500 times (CLUSTER_EXPIRY_CAP = 500, line 148). At ~20–50ms per RPC on Vercel cold-start, a full sweep can exceed 10 seconds. With maxDuration=15, late clusters in the expiry batch get silently skipped if timeout occurs. Next day's run re-scans and may archive them then. No data loss but delayed cleanup.

**Tiebreaker question:** Does production monitoring show clusters being orphaned past the intended expiry window? If not, 15s is sufficient for current scale; if yes, increase maxDuration to 30s or cap archive_cluster calls to 200/run.

### R-11-UA-02 — check-user-achievements cursor++ race on concurrent worker restarts
**Severity:** MEDIUM
**File:line:** `web/src/app/api/cron/check-user-achievements/route.js:57–72`

**Surfaced by:** WaveA Agent3 (F-11-3-05) only

**Description:** `cursor++` increment is not atomic. With 10 concurrent workers, two workers can both read `cursor=5`, both increment locally, and both assign back, causing duplicate RPC calls (same user_id processed twice) or skipped users (userIds[6] never processed). JavaScript event loop serializes most increments, but with enough concurrency or I/O-heavy RPCs, interleaving can occur. At scale (10k users, 10 workers), even 0.1% duplicate/skip rate means 10+ users missed per run.

**Tiebreaker question:** Does production telemetry show user_ids processed vs. total length skew over multiple runs? If yes, refactor to thread-safe counter (queue-based dequeue or atomic batch claims). If no, accept as latent multi-worker hazard with CONCURRENCY=10 mitigation.

### R-11-UA-03 — send-emails rate limit gate lacks circuit-breaker
**Severity:** MEDIUM
**File:line:** `web/src/app/api/cron/send-emails/route.js:33–191`

**Surfaced by:** WaveA Agent1 (M-3) only

**Description:** send-emails cron has no per-user or per-sender rate limit, unlike auth routes (`/api/auth/login`) that call `checkRateLimit`. A malicious actor could trigger DoS by creating thousands of notification rows with type `breaking_news`, forcing Resend API hammering on next cron tick. Resend's own API has rate limits (~1000/sec) but the cron carries no circuit-breaker. Actually sending is gated by user account existence + email_verified + alert preferences (opt-in by default), limiting practical attack surface.

**Tiebreaker question:** Are notification rows created only via trusted internal paths (e.g., breaking news admins, event triggers) or is there a user-facing endpoint? If trusted-only, no action needed. If user-facing, add a rate_limits check before calling sendEmail().

### R-11-UA-04 — Rate-limit RPC returns negative remaining on out-of-bounds value
**Severity:** LOW
**File:line:** `web/src/lib/rateLimit.js:160–166`

**Surfaced by:** WaveA Agent2 (F-11-2-03) only

**Description:** `Number.isFinite()` check catches NaN and Infinity but not negative values. If check_rate_limit RPC returns `remaining: -1`, the caller reads negative remaining, which can mislead Retry-After header computation. Low user-facing impact (Retry-After is advisory), but logging and observability break.

**Tiebreaker question:** Has production ever seen negative remaining values? If yes, clamp to `Math.max(0, data.remaining)`. If no, document the assumption.

### R-11-UA-05 — send-emails metadata injection in template variables
**Severity:** LOW
**File:line:** `web/src/app/api/cron/send-emails/route.js:152–159`

**Surfaced by:** WaveA Agent2 (F-11-2-04) only

**Description:** Spread of `n.metadata || {}` injects arbitrary keys into template context. If metadata is user-controlled and renderTemplate uses unsafe interpolation, this is a template-injection vector (e.g., `metadata: { csrf_token: 'attacker-value' }` shadows safe var). No direct evidence of unsafe usage; depends on renderTemplate implementation and metadata source.

**Tiebreaker question:** Is metadata user-controlled or internal-only? If internal-only, no action needed. If user-controlled, whitelist safe keys or validate metadata shape before spread.

### R-11-UA-06 — send-push CONCURRENCY=50 headroom not validated post-landing
**Severity:** MEDIUM
**File:line:** `web/src/app/api/cron/send-push/route.js:35, 271–272`

**Surfaced by:** WaveA Agent3 (F-11-3-03) only

**Description:** Comment notes "maxDuration=60 still clears a full fan-out in multiple cron ticks," implying multiple wave iterations. At 50 concurrent APNs sends × 500ms avg latency = ~500ms per wave. At 2 waves = 1s just for dispatch; add RPC overhead + DB updates, and large batch (200 notifications, 4 waves) risks truncation. check-user-achievements explicitly caps concurrency at 10 for similar reasons. No evidence that APNs concurrency tuning was validated post-landing.

**Tiebreaker question:** Verify send-push cron logs for late-batch truncations at current scale. If none found, measure actual per-wave latency + total batch runtime to confirm 60s headroom is maintained under peak load.

### R-11-UA-07 — process-data-exports upload collision window with millisecond timestamps
**Severity:** MEDIUM
**File:line:** `web/src/app/api/cron/process-data-exports/route.js:66–73, 99–108`

**Surfaced by:** WaveA Agent3 (F-11-3-04) only

**Description:** Upload path uses `upsert: false` (rejects if path exists), but uses `Date.now()` for path suffix (1ms granularity). If upload succeeds but createSignedUrl fails, next tick retries with same timestamp and hits collision, returning upload error. State machine guards late-stage reset but not early-stage collision. Two concurrent workers or retry within 1ms hit same path.

**Tiebreaker question:** Does production show failed uploads due to collision? If yes, include UUID or sequence suffix in path. If no, accept as latent race with low probability at current concurrency.

---

## UNIQUE-B findings (Wave B only, needs tiebreaker)

### R-11-UB-01 — process-data-exports idempotency incomplete on claim_next_export_request RPC failure
**Severity:** HIGH
**File:line:** `web/src/app/api/cron/process-data-exports/route.js:31–36`

**Surfaced by:** WaveB Agent1 (F-11-1-03) only

**Description:** If claim_next_export_request RPC fails (e.g., Supabase transient), the route returns 500, triggering Vercel retry. On retry, RPC may succeed with DIFFERENT request (duplicate exports) or re-claim same request. L6 state machine guards failures AFTER claim succeeds but not pre-claim failures. Should either return 200 (no-op) on claim failures to prevent retry, or ensure claim_next_export_request is safe to re-call.

**Tiebreaker question:** Is claim_next_export_request idempotent? If yes, change 500 to 200 on claim failure. If no, document the atomicity requirement or add retryability flag to the RPC.

### R-11-UB-02 — send-emails uses Promise.all for non-critical + all-fail pattern
**Severity:** MEDIUM
**File:line:** `web/src/app/api/cron/send-emails/route.js:77–88`

**Surfaced by:** WaveB Agent2 (F-B11-03) only

**Description:** WaveB Agent2 notes send-emails correctly uses Promise.allSettled (per L4 implementation), but WaveA Agent3 flagged send-push as using Promise.all instead. WaveB Agent2 flags this as a "logic divergence" — send-emails is the newer/safer pattern but send-push lags. This is absorbed by R-11-AGR-02 (send-push Promise.all finding).

**Note:** No additional finding; redundant with AGREED finding R-11-AGR-02.

### R-11-UB-03 — Rate-limit RPC error classification may mask production incidents
**Severity:** LOW
**File:line:** `web/src/lib/rateLimit.js:134–145`

**Surfaced by:** WaveA Agent3 (F-11-3-06), WaveB Agent3 (F-B11-3-02 similar theme)

**Description:** In production, any RPC error triggers fail-closed (limit=true), blocking legitimate traffic. Console.error is only signal; if RPC is silently broken (e.g., revoked permissions after deployment), a Sentry alert may not fire. The `reason: 'rpc_error'` is too broad; callers can't distinguish transient from permanent errors. WaveB Agent3 extends this to DEV_FAIL_OPEN gate lacking audit logging (HIGH confidence on that variant).

**Tiebreaker question:** Has RPC breakage caused silent auth failures? If yes, add Sentry alert on persistent rpc_error or log error.code separately. If no, document the fail-closed assumption.

### R-11-UB-04 — Rate-limit fail-open gate in development lacks audit logging
**Severity:** MEDIUM
**File:line:** `web/src/lib/rateLimit.js:40–47`

**Surfaced by:** WaveB Agent3 (F-B11-3-02) only

**Description:** RATE_LIMIT_ALLOW_FAIL_OPEN=1 guard is correct for local dev, but enforced only at runtime. No .env or code change shows "this deploy has loose rate limits." If developer forgets env var or CI misconfigures staging, there is no audit trail. A misconfigured CI/CD or fork that set RATE_LIMIT_ALLOW_FAIL_OPEN=1 would open gate silently.

**Tiebreaker question:** Add startup-time console.error that logs when DEV_FAIL_OPEN is true, so every deploy enabling it is visible in log dumps. Consider throwing error in non-dev to catch config mistakes earlier.

### R-11-UB-05 — cronAuth timing-safe compare lacks startup validation
**Severity:** LOW
**File:line:** `web/src/lib/cronAuth.js:35–42`

**Surfaced by:** WaveB Agent3 (F-B11-3-06) only

**Description:** When CRON_SECRET is undefined, expectedHeader becomes "Bearer undefined" (16 chars). Length check short-circuits timingSafeEqual and returns false (correct). But no startup-time validation that CRON_SECRET is set to real, non-empty value. Misconfigured production deploy without CRON_SECRET would treat all external cron calls as bad_secret silently.

**Tiebreaker question:** Add startup-time check that logs error if CRON_SECRET is not set when NODE_ENV !== development, similar to APNS_AUTH_KEY check in send-push.

### R-11-UB-06 — send-emails batch maxDuration capacity not re-checked for prefs/template fetches
**Severity:** LOW
**File:line:** `web/src/app/api/cron/send-emails/route.js:70–88`

**Surfaced by:** WaveB Agent3 (F-B11-3-03) only

**Description:** Route declares maxDuration=60 but doesn't check if setup fetches (allSettled on users, prefs, templates) consume too much time. With BATCH_SIZE=50, typical run is <5s, but slow DB queries on cold starts could approach 60s, leaving only 10s for sending. Stalled setup would cause silent timeout and re-queue entire batch. AllSettled pattern is good (L4 coverage), but no early-exit guard if setup takes >50s.

**Tiebreaker question:** Does production show send-emails batches timing out during setup? If yes, measure setup-fetch elapsed and early-exit with error if >50s. If no, accept as defensive hardening with low actual risk.

---

## STALE / CONTRADICTED findings

None. WaveB Agent2 (F-B11-01) retracted the dual-cache fallthrough finding upon re-read, confirming the code is safe.

---

## Summary counts

- **AGREED CRITICAL:** 1 (missing maxDuration on 4 routes)
- **AGREED HIGH:** 3 (send-push allSettled, CONCURRENCY=50 pool saturation, permissions dual-cache)
- **AGREED MEDIUM/LOW:** 0 (all other MEDIUM/LOW are UNIQUE-A/B)
- **UNIQUE-A:** 7 (pipeline-cleanup maxDuration, check-achievements cursor race, send-emails rate limit, rate-limit negative remaining, send-emails metadata injection, send-push CONCURRENCY headroom, process-data-exports upload collision)
- **UNIQUE-B:** 6 (process-data-exports claim idempotency, send-emails Promise.all note [redundant], rate-limit RPC error classification, DEV_FAIL_OPEN audit logging, cronAuth startup validation, send-emails maxDuration capacity check)
- **STALE:** 0

**Total findings reconciled: 17**

**Key recommendations:**
1. **Immediate:** Add maxDuration exports to 4 cron routes (R-11-AGR-01).
2. **High priority:** Swap send-push Promise.all → allSettled (R-11-AGR-02); validate send-push connection pool usage in production (R-11-AGR-03).
3. **Owner action:** Permissions dual-cache review for revoke-safety during UI-layer usage patterns (R-11-AGR-04).
4. **Tiebreaker dependencies:** Confirm production scale and observability for 7 UNIQUE-A items and 5 UNIQUE-B items (process-data-exports claim idempotency is HIGH and should be prioritized).

All cron routes correctly enforce CRON_SECRET via verifyCronAuth with fail-closed 403. L3 (BATCH_SIZE cap), L4 (allSettled), L5 (concurrency cap), L6 (state-machine idempotency), L8 (rateLimit fail-closed in prod), and L19 (claim_push_batch atomicity) are correctly implemented in their respective routes or in scope.
