# Round 7 — Bearer bypass on pre-bound routes: FIX PLAN

## Scope-critical finding (read first)

The Round 6 helper `resolveAuthedClient(client)` short-circuits to the
passed-in client if provided, so any route that does
`const supabase = await createClient(); await requirePermission(k, supabase);`
bypasses the bearer-header branch and 401s iOS.

**BUT THERE IS A SECOND LAYER.** Even if we fix the auth check, those
routes also use the same `supabase` variable AFTER the auth call for
RLS-scoped queries (inserts, updates, reads). That client is cookie-
bound; an iOS bearer caller has no cookie, so `auth.uid()` resolves
to NULL inside Postgres and RLS-protected statements fail.

Consequence: for iOS-reachable routes, fixing the auth gate is NOT
enough — the route must also use a bearer-aware client for its
post-auth queries. Option A (strip the pre-bound arg) alone fixes
the 401 but swaps it for RLS failures. Option B alone fixes the 401
but leaves the same RLS failures.

The correct fix for iOS-reachable routes is a **route-local bearer
resolver** (same pattern `/api/account/delete` and
`/api/account/login-cancel-deletion` already use). For routes that
are NOT iOS-reachable, Option A is sufficient.

## Affected routes (exhaustive)

Pattern searched: helper calls of the form
`requirePermission('k', supabase)` / `hasPermissionServer('k', supabase)`
where `supabase` is a pre-bound cookie client.

Comprehensive grep confirms NO routes pass a pre-bound client to
`getUser`, `requireAuth`, `requireVerifiedEmail`, or `requireNotBanned`
— so the problem surface is exactly these two helpers.

| # | Route path | Helper called | Pre-bound var | iOS-reachable? | Post-auth uses `supabase` for RLS writes/reads? |
|---|------------|---------------|---------------|----------------|-------------------------------------------------|
| 1 | `/api/stories/read` (POST) | `requirePermission('article.read.log', supabase)` | `supabase` | **YES** — `VerityPost/StoryDetailView.swift:1461` | YES (reading_log insert/update, articles read, assertKidOwnership) |
| 2 | `/api/reports` (POST) | `requirePermission('article.report', supabase)` | `supabase` | NO | YES (reports insert, getSettings, comments update) |
| 3 | `/api/kids/set-pin` (POST) | `requirePermission('kids.pin.set', supabase)` | `supabase` | NO | YES (assertKidOwnership, kid_profiles update) |
| 4 | `/api/kids/reset-pin` (POST) | `requirePermission('kids.pin.reset', supabase)` | `supabase` | NO | YES (signInWithPassword, assertKidOwnership, kid_profiles update) |
| 5 | `/api/admin/stories` (POST) | `requirePermission('admin.articles.create', supabase)` | `supabase` | NO | YES (articles insert) |
| 6 | `/api/admin/stories` (PUT) | `requirePermission('admin.articles.edit.any', supabase)` | `supabase` | NO | YES (articles update) |
| 7 | `/api/admin/stories` (DELETE) | `requirePermission('admin.articles.delete', supabase)` | `supabase` | NO | YES (articles soft-delete) |
| 8 | `/api/search` (GET) | `hasPermissionServer(...) x5` | `supabase` | NO | No — main reads use `createServiceClient()`; `supabase` is ONLY for the gate |
| 9 | `/api/account/delete` (POST/DELETE) | `hasPermissionServer(..., authClient)` | `authClient` | YES (SettingsView.swift) | Already has route-local bearer path; `authClient` is bearer-bound when bearer present — ALREADY CORRECT, no fix needed |

### Notes on the Auditor's original list

- `/api/support` — FALSE POSITIVE. `site/src/app/api/support/route.js`
  and `site/src/app/api/support/[id]/messages/route.js` call
  `requireAuth()` with NO argument, which correctly routes through
  the bearer-aware path. Not affected.
- `/api/account/delete` — Already has route-local bearer handling
  via `resolveAuth(request)` (lines 40–57). When bearer is present it
  builds `authClient = createClientFromToken(bearer)` and passes
  THAT (already bearer-bound) into `hasPermissionServer`. The
  short-circuit is fine because the argument IS bearer-resolved.
  No fix needed.

### Final "must fix" set: 8 routes (counted as file edits: 7 files)
1–7 above. `/api/admin/stories` is one file with three handlers.
`/api/search` is included because although not iOS-reachable today,
it is a public endpoint that could be called from iOS later and the
existing semantics quietly return `mode: 'basic'` for bearer callers
(wrong tier).

- **iOS-reachable subset: 1 route (`/api/stories/read`)** — this is
  the acute user-facing bug.

## Decision — HYBRID (recommendation)

Not pure A, not pure B. Two tiers:

**Tier 1 (iOS-reachable) — `/api/stories/read`:**
Use a route-local bearer resolver so BOTH the auth check AND the
downstream RLS queries run under the bearer-bound client. This
matches the `/api/account/delete` precedent.

**Tier 2 (web-only) — routes 2–8:**
Option A: drop the second argument to `requirePermission` /
`hasPermissionServer`. Web callers have the cookie; helper's
cookie fallback path runs; everything works exactly as today. The
`supabase` variable stays because it's still needed for post-auth
queries — only the argument to the helper is removed.

**Rejection of pure Option B:**
Changing `resolveAuthedClient` to prefer bearer over the passed-in
client would silently swap the client identity mid-route. In
`kids/reset-pin` specifically the route calls
`supabase.auth.signInWithPassword({...})` after the auth check; that
`supabase` is the CALLER'S `supabase` var (not the resolver's
internal), so Option B only affects the auth check, not the rest.
That means Option B alone cannot fix iOS-reachable stories/read
(post-auth queries still cookie-bound) and creates an asymmetry
(auth sees bearer identity; downstream sees cookie identity).
Reject.

## Exact edits

### Edit 1 — `/api/stories/read/route.js` (iOS-reachable, route-local bearer)

Add bearer detection to mint a bearer-bound client BEFORE the auth
call, then use that single client for auth AND post-auth work.

**Old (lines 3–16):**
```js
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { scoreReadingComplete, checkAchievements } from '@/lib/scoring';
import { assertKidOwnership } from '@/lib/kids';
import { incrementField } from '@/lib/counters';
import { v2LiveGuard } from '@/lib/featureFlags';

export async function POST(request) {
  try {
    const blocked = await v2LiveGuard(); if (blocked) return blocked;
    const supabase = await createClient();

    const user = await requirePermission('article.read.log', supabase);
```

**New:**
```js
import { createClient, createClientFromToken, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { scoreReadingComplete, checkAchievements } from '@/lib/scoring';
import { assertKidOwnership } from '@/lib/kids';
import { incrementField } from '@/lib/counters';
import { v2LiveGuard } from '@/lib/featureFlags';

// Round 7 — iOS bearer callers reach this route (StoryDetailView.swift).
// Bind `supabase` to the bearer token when one is present so both the
// auth gate (requirePermission) AND the downstream reading_log
// insert/update (which is RLS-scoped on auth.uid() = user_id) resolve
// against the iOS session. Cookie callers keep the existing path.
function bearerToken(request) {
  const h = request.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

export async function POST(request) {
  try {
    const blocked = await v2LiveGuard(); if (blocked) return blocked;
    const token = bearerToken(request);
    const supabase = token ? createClientFromToken(token) : await createClient();

    const user = await requirePermission('article.read.log', supabase);
```

Rest of file unchanged. The `requirePermission(k, supabase)` call stays
because `supabase` is now CORRECTLY resolved (bearer OR cookie) by the
route itself, and the helper's short-circuit is the desired behaviour.

### Edit 2 — `/api/reports/route.js` (web-only, Option A)

**Old (lines 10–11):**
```js
    const supabase = await createClient();
    const user = await requirePermission('article.report', supabase);
```

**New:**
```js
    const supabase = await createClient();
    const user = await requirePermission('article.report');
```

### Edit 3 — `/api/kids/set-pin/route.js` (web-only, Option A)

**Old (lines 16–18):**
```js
    const supabase = await createClient();
    let user;
    try { user = await requirePermission('kids.pin.set', supabase); }
```

**New:**
```js
    const supabase = await createClient();
    let user;
    try { user = await requirePermission('kids.pin.set'); }
```

### Edit 4 — `/api/kids/reset-pin/route.js` (web-only, Option A)

**Old (lines 10–12):**
```js
    const supabase = await createClient();
    let user;
    try { user = await requirePermission('kids.pin.reset', supabase); }
```

**New:**
```js
    const supabase = await createClient();
    let user;
    try { user = await requirePermission('kids.pin.reset'); }
```

### Edit 5 — `/api/admin/stories/route.js` (web-only, Option A, 3 handlers)

**Old (line 10):**
```js
    const user = await requirePermission('admin.articles.create', supabase);
```
**New:**
```js
    const user = await requirePermission('admin.articles.create');
```

**Old (line 54):**
```js
    await requirePermission('admin.articles.edit.any', supabase);
```
**New:**
```js
    await requirePermission('admin.articles.edit.any');
```

**Old (line 93):**
```js
    await requirePermission('admin.articles.delete', supabase);
```
**New:**
```js
    await requirePermission('admin.articles.delete');
```

### Edit 6 — `/api/search/route.js` (web-only, Option A, 5 call-sites)

**Old (line 33):**
```js
  const canAdvanced = await hasPermissionServer('search.advanced', supabase);
```
**New:**
```js
  const canAdvanced = await hasPermissionServer('search.advanced');
```

**Old (line 68):**
```js
    if (category && await hasPermissionServer('search.advanced.category', supabase)) {
```
**New:**
```js
    if (category && await hasPermissionServer('search.advanced.category')) {
```

**Old (line 71):**
```js
    if (subcategory && await hasPermissionServer('search.advanced.subcategory', supabase)) {
```
**New:**
```js
    if (subcategory && await hasPermissionServer('search.advanced.subcategory')) {
```

**Old (line 74):**
```js
    if ((from || to) && await hasPermissionServer('search.advanced.date_range', supabase)) {
```
**New:**
```js
    if ((from || to) && await hasPermissionServer('search.advanced.date_range')) {
```

**Old (line 78):**
```js
    if (source && await hasPermissionServer('search.advanced.source', supabase)) {
```
**New:**
```js
    if (source && await hasPermissionServer('search.advanced.source')) {
```

Also: after the edits, `search/route.js`'s `const supabase = await createClient();`
(line 32) becomes unused. Delete it. Verify with `tsc` / lint.

**Old (line 32):**
```js
  const supabase = await createClient();
  const canAdvanced = await hasPermissionServer('search.advanced');
```
**New:**
```js
  const canAdvanced = await hasPermissionServer('search.advanced');
```
(line 32 removal only — `canAdvanced` line already edited above).

Also remove `createClient` from the top-of-file import if no longer used
after this change:

**Old (line 4):**
```js
import { createClient, createServiceClient } from '@/lib/supabase/server';
```
**New:**
```js
import { createServiceClient } from '@/lib/supabase/server';
```

### Edit 7 — `/api/account/delete/route.js`

No change. Already correct: `authClient` is bearer-bound when bearer
is present (line 45), otherwise cookie-bound (line 54). The short-
circuit in `hasPermissionServer` receives an already-correct client.

## Verification

1. **Type-check**: `cd site && npx tsc --noEmit` EXIT=0
2. **Re-grep must return 0 hits** after the edits:
   ```
   grep -rn "requirePermission\s*(\s*['\"][^'\"]*['\"]\s*,\s*\w" site/src/app/api
   grep -rn "hasPermissionServer\s*(\s*['\"][^'\"]*['\"]\s*,\s*\w" site/src/app/api
   ```
   Exception: `/api/account/delete` WILL still match (`authClient` is
   intentional and correct because it is route-local bearer-resolved).
3. **Unused-var lint**: confirm `search/route.js` no longer imports
   `createClient`; the `supabase` local is gone.
4. **Cookie path sanity** (web): pick 2 routes from the edited set —
   e.g. `/api/reports`, `/api/admin/stories` POST — and hit them from
   a logged-in web session. Must return 200/201 same as before.
5. **iOS path (acute fix)**: hit `/api/stories/read` with
   `Authorization: Bearer <access_token>` from StoryDetailView. Must
   return 200 (previously 401). Verify a `reading_log` row exists for
   the bearer user's `user_id` (this is the RLS-scoped check that
   Option-A-alone would have broken).
6. **Spot-check Round 6 canaries**: `/api/messages`, `/api/follows`,
   `/api/bookmarks/*` — these do NOT pass a pre-bound client today
   (they call `requirePermission('k')` with one arg), so they stay
   green. Re-run the Round 6 iOS bearer smoke against them to confirm
   no regression from this round.

## What NOT to change

- `resolveAuthedClient` helper — leave the short-circuit as is. The
  semantics "use the client the caller gave me" are load-bearing for
  the Edit-1 pattern (`stories/read` explicitly wants the route-
  resolved bearer client to flow through the helper).
- Helper return value shape / error codes — no change.
- Route auth gates — same permission keys, same statuses, same error
  bodies. Only HOW auth is resolved changes, never WHAT is required.
- `/api/support`, `/api/account/delete`, `/api/account/login-cancel-deletion`
  — already correct, do not touch.
- Any route outside the 7-file list above.

## Flags / risks

- **`/api/search` unused-var cleanup** (Edit 6): removing
  `createClient` + `supabase` local is a trivial dead-code removal
  once the helper arg is dropped. If the Implementer hits an ESLint
  no-unused-vars rule, this is why. Kept in the plan to avoid a
  second PR.
- **`stories/read` route-local bearer pattern** diverges from the
  other 6 edits by design. The Implementer must not mechanically
  strip the helper arg in `stories/read` — that would reintroduce
  the RLS failure for iOS callers. The route-local bearer resolver
  is load-bearing.
- **`kids/reset-pin` `signInWithPassword`**: Unaffected by this plan
  (the route is web-only today per iOS grep). If a future iOS
  pin-reset flow appears, this route will need the same Edit-1
  treatment as `stories/read`. Flagged for future.
