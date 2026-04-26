# LiveProgressSheet — T-013 — Strip raw error.message leaks from settings and other surfaces
Started: 2026-04-26

## User Intent

Strip all client-visible raw `error.message` / `err.message` leaks from the web surface. These are OWASP information disclosure defects: Postgres error messages expose DB schema, column names, RPC names, and constraint names to clients. Hard rule: internal errors never reach the client. Log server-side, return generic string to client.

The fix helper already exists: `web/src/lib/apiErrors.js` exports `safeErrorResponse(NextResponse, err, options)`. For the settings page (client-side component), the pattern is a generic string literal — `safeErrorResponse` is server-only.

Scope confirmed from live code:
- `web/src/app/profile/settings/page.tsx` — 19 raw leaks in toast/error handlers
- `web/src/app/api/health/route.js` — 2 leaks in the public (unauthenticated) health check response (highest severity)
- `web/src/app/api/cron/rate-limit-cleanup/route.ts` — 1 leak returned to cron caller
- Admin pages — 12 additional leaks across 7 files (all admin-authenticated surfaces)

**Classified as NOT client-visible (safe as-is):**
- `comments/route.js:90` — `.toLowerCase()` check only; client gets hardcoded string
- `messages/route.js:38` — internal `[CODE]` prefix parsing; client gets `userMsg`
- `conversations/route.js:61` — same pattern as messages
- `kids/pair/route.js:91` — `.toLowerCase()` check; falls through to hardcoded strings
- `kids-waitlist/route.ts:137` — `console.error` only; client gets generic 503
- `admin/pipeline/generate/route.ts:442,539,1635` — stored in `pipeline_runs.error_message`; client gets `safeErrorMessage(finalErrorType)`
- `admin/prompt-presets/[id]/route.ts:67` — thrown inside helper; caller returns `'Could not load preset'`
- `admin/categories/[id]/route.ts:82` — same pattern
- `newsroom/ingest/run/route.ts:425,469,474,554` — internal propagation; client gets `'Ingest run failed'`
- `ios/appstore/notifications/route.js:393` — stored in `webhook_log.processing_error`; client gets `'Internal server error'`
- `ios/subscriptions/sync/route.js:267` — same
- `stripe/webhook/route.js:236` — stored in `audit_log.metadata`; client gets `'Webhook processing failed'`
- Cron routes using `logCronHeartbeat` — heartbeat goes to internal DB; responses use `safeErrorResponse`

## Live Code State

### settings/page.tsx — 19 client-visible leaks (client component)

| Line  | Context                             | Source type |
|-------|-------------------------------------|-------------|
| 589   | Profile load query error            | PostgrestError |
| 1539  | `update_own_profile` RPC save       | PostgrestError |
| 1601  | Avatar upload else-branch fallback  | StorageError |
| 1625  | Banner upload else-branch fallback  | StorageError |
| 2172  | Notification prefs save             | PostgrestError |
| 2508  | Sessions query load error           | PostgrestError |
| 2522  | `signOut` (sessions section)        | AuthError |
| 2761  | Feed prefs save                     | PostgrestError |
| 3225  | Accessibility save                  | PostgrestError |
| 3314  | Blocked users load                  | PostgrestError |
| 3434  | Data requests load                  | PostgrestError |
| 3914  | Checkout catch (err from throw new Error(data?.error \|\| 'Checkout failed')) | constructed |
| 4017  | Cancel catch (same pattern)         | constructed |
| 4699  | Expert profile save                 | PostgrestError |
| 4854  | Vacation mode save                  | PostgrestError |
| 4968  | Expert watchlist save               | PostgrestError |
| 5215  | `signOut` (sign-out-everywhere)     | AuthError |

Lines 3914 and 4017 construct `new Error(data?.error || 'fallback')` from the API response, then use `err.message` in the toast. Since the APIs return only generic strings, the actual leak is bounded — but the pattern is still wrong and must be fixed by restructuring to not throw.

### API — 3 client-visible leaks

1. `web/src/app/api/health/route.js:23` — `out.checks.db = error ? \`err: ${error.message}\` : 'ok'` — PUBLIC endpoint (no auth). HIGHEST severity.
2. `web/src/app/api/health/route.js:26` — `out.checks.db = \`err: ${err.message}\`` — same.
3. `web/src/app/api/cron/rate-limit-cleanup/route.ts:50` — `return NextResponse.json({ ok: false, deleted: 0, error: errMsg })` where errMsg = raw DB error.

### Admin pages — 12 additional client-visible leaks

| File | Line | Context |
|------|------|---------|
| `admin/stories/page.tsx` | 102 | `toast.push({ message: \`Failed to load articles: ${storiesRes.error.message}\`, variant: 'danger' })` |
| `admin/users/[id]/permissions/page.tsx` | 187 | `setPermsError(error.message)` — rendered in UI at line 661 |
| `admin/users/[id]/permissions/page.tsx` | 166 | `setUserLoadError(error.message)` — set in state but NOT rendered (only 'not_found' branch renders) — borderline, but fix anyway |
| `admin/notifications/page.tsx` | 167 | `push({ message: \`Save failed: ${err.message}\`, variant: 'danger' })` |
| `admin/notifications/page.tsx` | 178 | `push({ message: \`Save failed: ${err.message}\`, variant: 'danger' })` |
| `admin/subscriptions/page.tsx` | 294 | `setLookupError(err instanceof Error ? err.message : 'Freeze failed')` |
| `admin/subscriptions/page.tsx` | 307 | `const msg = err instanceof Error ? err.message : 'Sweep failed'` (used in toast + setSweepInfo) |
| `admin/subscriptions/page.tsx` | 736 | `setLookupError((err instanceof Error && err.message) \|\| 'Action failed')` |
| `admin/ad-placements/page.tsx` | 488 | `push({ message: (err instanceof Error && err.message) \|\| 'Action failed', variant: 'danger' })` |
| `admin/recap/page.tsx` | 426 | `push({ message: (err instanceof Error && err.message) \|\| 'Action failed', variant: 'danger' })` |
| `admin/ad-campaigns/page.tsx` | 312 | `push({ message: (err instanceof Error && err.message) \|\| 'Action failed', variant: 'danger' })` |
| `admin/sponsors/page.tsx` | 272 | `push({ message: (err instanceof Error && err.message) \|\| 'Action failed', variant: 'danger' })` |
| `admin/promo/page.tsx` | 479 | `push({ message: (err instanceof Error && err.message) \|\| 'Action failed', variant: 'danger' })` |

## Contradictions
None found — pre-verified counts match live code. Admin pages were not explicitly pre-verified but ARE within the task scope definition ("remaining admin surfaces not swept in the 2026-04-24 session").

## Agent Votes
- Planner: APPROVE (see PLANNER PLAN FINAL below)
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## PLANNER PLAN FINAL

### Summary
- Files: 10 files total (1 large settings page, 2 small API files, 7 admin pages)
- No DB changes. No iOS changes. No migration needed.
- Risk tier: surgical (single-layer client string replacement; no logic changes)
- Total changes: 34 lines (19 settings + 3 API + 12 admin)

### Order of operations
1. `web/src/app/api/health/route.js` — smallest, highest severity, no TypeScript
2. `web/src/app/api/cron/rate-limit-cleanup/route.ts` — 1 line TypeScript
3. `web/src/app/profile/settings/page.tsx` — 19 changes, large file, careful edits
4. `web/src/app/admin/stories/page.tsx` — 1 change
5. `web/src/app/admin/users/[id]/permissions/page.tsx` — 2 changes
6. `web/src/app/admin/notifications/page.tsx` — 2 changes
7. `web/src/app/admin/subscriptions/page.tsx` — 3 changes
8. `web/src/app/admin/ad-placements/page.tsx` — 1 change
9. `web/src/app/admin/recap/page.tsx` — 1 change
10. `web/src/app/admin/ad-campaigns/page.tsx` — 1 change
11. `web/src/app/admin/sponsors/page.tsx` — 1 change
12. `web/src/app/admin/promo/page.tsx` — 1 change

### Exact changes

#### health/route.js (lines 23, 26)
- Line 23: `out.checks.db = error ? \`err: ${error.message}\` : 'ok';`
  → `out.checks.db = error ? 'db_error' : 'ok';` (add `console.error('[health] db ping failed:', error);` before)
- Line 26: `out.checks.db = \`err: ${err.message}\`;`
  → `out.checks.db = 'db_error';` (add `console.error('[health] db ping threw:', err);` before)

#### rate-limit-cleanup/route.ts (line 50)
- `return NextResponse.json({ ok: false, deleted: 0, error: errMsg });`
  → `return NextResponse.json({ ok: false, deleted: 0, error: 'Cleanup failed' });`
  (errMsg already logged at line 48 and sent to logCronHeartbeat at line 49 — server visibility preserved)

#### settings/page.tsx
- Line 589: `pushToast({ message: error.message, variant: 'danger' });`
  → `pushToast({ message: 'Could not load your profile. Please try again.', variant: 'danger' });`
- Line 1539: `pushToast({ message: error.message, variant: 'danger' });`
  → `pushToast({ message: 'Could not save profile. Please try again.', variant: 'danger' });`
- Lines 1599-1601 (avatar upload else-branch):
  `: error.message;`
  → `: 'Avatar upload failed. Please try again.';`
- Lines 1623-1625 (banner upload else-branch):
  `: error.message;`
  → `: 'Banner upload failed. Please try again.';`
- Line 2172: `pushToast({ message: error.message, variant: 'danger' });`
  → `pushToast({ message: 'Could not save notification settings. Please try again.', variant: 'danger' });`
- Line 2508: `if (error) pushToast({ message: error.message, variant: 'danger' });`
  → `if (error) pushToast({ message: 'Could not load sessions. Please try again.', variant: 'danger' });`
- Line 2522: `if (error) pushToast({ message: error.message, variant: 'danger' });`
  → `if (error) pushToast({ message: 'Could not sign out of other sessions. Please try again.', variant: 'danger' });`
- Line 2761: `pushToast({ message: error.message, variant: 'danger' });`
  → `pushToast({ message: 'Could not save feed preferences. Please try again.', variant: 'danger' });`
- Line 3225: `pushToast({ message: error.message, variant: 'danger' });`
  → `pushToast({ message: 'Could not save accessibility settings. Please try again.', variant: 'danger' });`
- Line 3314: `if (error) pushToast({ message: error.message, variant: 'danger' });`
  → `if (error) pushToast({ message: 'Could not load blocked users. Please try again.', variant: 'danger' });`
- Line 3434: `if (error) pushToast({ message: error.message, variant: 'danger' });`
  → `if (error) pushToast({ message: 'Could not load data requests. Please try again.', variant: 'danger' });`
- Lines 3910-3918 (checkout — restructure throw-and-catch):
  ```
  // Before:
  if (!res.ok) throw new Error(data?.error || 'Checkout failed');
  if (data?.url) window.location.href = data.url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Checkout failed';
    pushToast({ message: msg, variant: 'danger' });
  }
  // After:
  if (!res.ok) {
    pushToast({ message: 'Checkout failed. Please try again.', variant: 'danger' });
    return;
  }
  if (data?.url) window.location.href = data.url;
  } catch {
    pushToast({ message: 'Checkout failed. Please try again.', variant: 'danger' });
  }
  ```
- Lines 4006-4018 (cancel — restructure throw-and-catch):
  ```
  // Before:
  if (!res.ok) throw new Error(data?.error || 'Cancel failed');
  ... success path ...
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cancel failed';
    pushToast({ message: msg, variant: 'danger' });
  }
  // After:
  if (!res.ok) {
    pushToast({ message: 'Could not cancel subscription. Please try again.', variant: 'danger' });
    return;
  }
  ... success path unchanged ...
  } catch {
    pushToast({ message: 'Could not cancel subscription. Please try again.', variant: 'danger' });
  }
  ```
- Line 4699: `pushToast({ message: error.message, variant: 'danger' });`
  → `pushToast({ message: 'Could not save expert profile. Please try again.', variant: 'danger' });`
- Line 4854: `pushToast({ message: error.message, variant: 'danger' });`
  → `pushToast({ message: 'Could not update vacation mode. Please try again.', variant: 'danger' });`
- Line 4968: `pushToast({ message: error.message, variant: 'danger' });`
  → `pushToast({ message: 'Could not update watchlist. Please try again.', variant: 'danger' });`
- Line 5215: `if (error) pushToast({ message: error.message, variant: 'danger' });`
  → `if (error) pushToast({ message: 'Could not sign out of other sessions. Please try again.', variant: 'danger' });`

#### admin/stories/page.tsx (line 102)
- `toast.push({ message: \`Failed to load articles: ${storiesRes.error.message}\`, variant: 'danger' });`
  → `toast.push({ message: 'Could not load articles. Please try again.', variant: 'danger' });`

#### admin/users/[id]/permissions/page.tsx (lines 166, 187)
- Line 166: `if (error) { setUserLoadError(error.message); return; }`
  → `if (error) { setUserLoadError('load_error'); return; }` (state only, never rendered but fix pattern)
  Note: the render at line 355 only handles 'not_found'. We need to add a render case for 'load_error' as well OR just use a generic string that renders in an error component. Simplest: keep `setUserLoadError('Could not load user.')` and add a render branch.
  Actually — checking line 355 again, `if (userLoadError === 'not_found')` handles the specific case. Any other truthy value would fall through without being rendered. The safest approach: set to `'Could not load user. Please try again.'` and add a render branch for non-'not_found' errors.
- Line 187: `setPermsError(error.message);`
  → `setPermsError('Could not load effective permissions. Please try again.');`

#### admin/notifications/page.tsx (lines 167, 178)
- Line 167: `push({ message: \`Save failed: ${err.message}\`, variant: 'danger' });`
  → `push({ message: 'Could not save setting. Please try again.', variant: 'danger' });`
- Line 178: same → same

#### admin/subscriptions/page.tsx (lines 294, 307-309, 736)
- Line 294: `setLookupError(err instanceof Error ? err.message : 'Freeze failed');`
  → `setLookupError('Could not freeze account. Please try again.');`
- Lines 307-309:
  ```
  // Before:
  const msg = err instanceof Error ? err.message : 'Sweep failed';
  setSweepInfo(`Error: ${msg}`);
  push({ message: msg, variant: 'danger' });
  // After:
  setSweepInfo('Sweep failed. Please try again.');
  push({ message: 'Sweep failed. Please try again.', variant: 'danger' });
  ```
- Line 736: `setLookupError((err instanceof Error && err.message) || 'Action failed');`
  → `setLookupError('Action failed. Please try again.');`

#### admin/ad-placements/page.tsx (line 488)
- `push({ message: (err instanceof Error && err.message) || 'Action failed', variant: 'danger' })`
  → `push({ message: 'Action failed. Please try again.', variant: 'danger' })`

#### admin/recap/page.tsx (line 426)
- same pattern → `push({ message: 'Action failed. Please try again.', variant: 'danger' })`

#### admin/ad-campaigns/page.tsx (line 312)
- same pattern → `push({ message: 'Action failed. Please try again.', variant: 'danger' })`

#### admin/sponsors/page.tsx (line 272)
- same pattern → `push({ message: 'Action failed. Please try again.', variant: 'danger' })`

#### admin/promo/page.tsx (line 479)
- same pattern → `push({ message: 'Action failed. Please try again.', variant: 'danger' })`

### Verification
```bash
cd /Users/veritypost/Desktop/verity-post/web && npx tsc --noEmit
grep -rn "pushToast.*error\.message\|push.*error\.message\|setError.*error\.message" web/src/app/
grep -rn "error\.message\|err\.message" web/src/app/api/health/route.js
grep -n "error: errMsg" web/src/app/api/cron/rate-limit-cleanup/route.ts
```
All should return zero results.

### CLAUDE.md compliance
- No admin mutation routes touched (all changes are UI client-side catch blocks and 2 small server files)
- Route mutation pattern unchanged — only error display strings modified
- Admin pages touched are client components — 6-agent pattern applies and is being followed via this review process

### Commit
`security(#T-013): strip client-visible error.message leaks from settings, health, cron, and admin pages`

## 4th Agent (if needed)
Not needed — 3/3 APPROVE.

## Implementation Progress
[filled during execution]

## Completed
[SHIPPED block written here when done]
