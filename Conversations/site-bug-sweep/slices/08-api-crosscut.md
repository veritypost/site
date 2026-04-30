# Slice 08: API Routes Cross-Cut

**Status:** shipped
**Session:** 12 (2026-04-30)
**Investigator:** 4 parallel Explore agents + 1 adversarial reviewer

---

## Investigation summary

Surfaces covered:
- `web/src/app/api/cron/score-comments/route.ts` — AI comment scoring
- `web/src/app/api/cron/` (all 22 routes) — cron auth pattern
- `web/vercel.json` — cron schedule verification
- `web/src/app/api/events/batch/route.ts` — event ingestion + sendBeacon compatibility
- `web/src/app/api/csp-report/route.js` — CSP violation report
- `web/src/app/api/health/route.js` — health check
- `web/src/app/api/push/send/route.js` + `push/status/route.js` — push management
- `web/src/app/api/errors/route.js` — client error collection
- `web/src/lib/cronAuth.js` — shared cron auth helper

## Clean surfaces

- **score-comments model string**: `route.ts:60` uses `claude-haiku-4-5-20251001` — correct current Haiku 4.5 model ID. System-map "known fragility" was a false positive.
- **events/batch auth vs sendBeacon**: endpoint is anon-allowed by design (line 194 comment). `authedUserId` resolved from session cookie for attribution but never gates access. sendBeacon on page-hide sends no auth header but none is required. Events will not drop.
- **CRON_SECRET pattern**: all 22 cron routes import `verifyCronAuth` from `web/src/lib/cronAuth.js` and call it as first guard. Helper uses constant-time comparison and accepts both `x-vercel-cron: 1` and `Authorization: Bearer`. No publicly triggerable crons.
- **vercel.json schedules**: 21 entries, all valid 5-field cron syntax, all route paths exist. score-comments is `*/15 * * * *` as expected.
- **CSP report**: rate-limited (30/min), logs body raw — standard behavior for CSP endpoints. No user-visible data.
- **Health route**: public returns only `{ ok, checks: { db }, latency_ms, ts }`. Detailed mode (env var presence) gated behind `HEALTH_CHECK_SECRET` with constant-time compare. No credential leak.
- **Push routes**: `/send` requires `admin.push.send_test` permission; `/status` requires auth + rate limit (30/min). Both handle null/empty token arrays correctly. No silent errors.
- **Errors route**: anon, rate-limited (60/min, IP). Truncates fields (message/2000, stack/8000, route/200). Silent catch on DB insert intentional (logging the log failure would be circular — documented in code).
- **FK hints**: none found in any sampled route. Clean.

---

## Issues

### 08-01 (P3) — score-comments: silent JSON parse failure with no logging

**Status:** shipped — `8b5f604`

**File:** `web/src/app/api/cron/score-comments/route.ts:75–79`

**Current code:**
```typescript
try {
  parsed = JSON.parse(text);
} catch {
  continue;
}
```

**Problem:** When Claude returns non-JSON (malformed response, rate-limit message, empty string), the comment is silently skipped. The outer catch at lines 117–119 logs Anthropic API/DB errors, but this inner catch discards the parse error without a trace. The final `scored` count is lower than expected with no indication of which comments were dropped.

**Fix:** Add `console.error` inside the catch before `continue`:
```typescript
} catch (err) {
  console.error('[score-comments] json-parse failed on comment', comment.id, err);
  continue;
}
```

**Commit:** `8b5f604`

---

## Wont-fix

None.

## Deferred

None.
