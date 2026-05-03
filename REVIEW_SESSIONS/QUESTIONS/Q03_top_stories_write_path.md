# Q03 — `top_stories` write path: server route vs RLS-only?

## Finding being addressed

PM-3 / F-1 in `REVIEW_REPORT.md` (P0):

> `top_stories` table is writable by ANY authenticated user (RLS bypass on
> front-page hero). The `top_stories_write_authenticated` RLS policy is
> `USING (auth.role() = 'authenticated')` for ALL operations
> (insert/update/delete). The migration explicitly says "the admin UI
> will enforce role checks at the application layer" — but
> `/admin/top-stories/page.tsx` enforces only client-side via
> `ADMIN_ROLES.has(r)`, and the page issues
> `supabase.from('top_stories').upsert(...)` and `.delete()` directly
> through the cookie-scoped browser client. Any logged-in non-admin can
> `curl -X DELETE` to clear or replace the front-page hero pin.

Current pin/remove code (`web/src/app/admin/top-stories/page.tsx:107-136`)
runs through the browser client, no server route exists at
`web/src/app/api/admin/top-stories/`, and no audit row is recorded.

## The two options

- **Option A** — New server route `/api/admin/top-stories/*` using
  `requirePermission('admin.top_stories.manage')` +
  `recordAdminAction()` + `checkRateLimit()`. Page calls the route via
  `fetch`. RLS tightens to deny direct authenticated writes (service
  role + `is_admin_or_above()` only).

- **Option B** — Keep `supabase.from('top_stories').upsert/delete` on
  the browser client. Tighten RLS so the write predicate is
  `is_admin_or_above()` instead of `auth.role() = 'authenticated'`.
  No server route. No audit log row.

## Recommendation: **Option A**

This is the documented house style. `web/src/lib/adminMutation.ts:1-88`
is the canonical "copy-paste skeleton for new routes" — it spells out
the exact 8-step order
(`requirePermission → service client → checkRateLimit → parse/validate →
outranks if cross-user → mutate → recordAdminAction → respond`)
and explicitly says:

> Every admin POST/PATCH/DELETE under /api/admin/** must run these in
> this order. Drift here was the entire MED-sweep audit-sweep B-C
> 2026-04-23.

`top_stories` is exactly that surface (POST = pin, DELETE = clear), so
it goes through the same skeleton.

PM-3's own summary (`REVIEW_REPORT.md:314`) confirms the prevailing
pattern is already universal across the rest of the admin surface:

> The other admin API surfaces are tightly gated through
> `requirePermission` + `requireAdminOutranks` + `recordAdminAction`
> and are clean.

The two flags singled out for not following it (`F-1 top_stories`,
`F-2 admin/access`) are P0 RBAC bypasses precisely *because* they
diverged. The fix is to bring `top_stories` onto the canonical path,
not to invent a third pattern (RLS-only client-write) that no other
admin surface uses.

## Quote: prevailing pattern from a comparable admin route

`web/src/app/api/admin/feeds/route.ts:1-105` — comparable shape (admin
list mutation, one row per action, no cross-user rank guard needed):

```ts
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.feeds.create:${actor.id}`,
    policyKey: 'admin.feeds.create',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // ...validate body...

  const { data, error } = await service.from('feeds').insert(row).select('*').single();
  if (error || !data) {
    console.error('[admin.feeds.create]', error?.message || 'no row');
    return NextResponse.json({ error: 'Could not create feed' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'feed.create',
    targetTable: 'feeds',
    targetId: data.id,
    newValue: { name: data.name, url: data.url, feed_type: data.feed_type },
  });

  return NextResponse.json({ ok: true, row: data });
}
```

`web/src/app/api/admin/categories/route.ts` and
`/api/admin/categories/[id]/route.ts` follow the same skeleton with
PATCH and DELETE for the per-row handlers — the same shape `top_stories`
needs.

## RLS shape that pairs with Option A

Match `muted_outlets` from
`supabase/migrations/20260503000002_feeds_priority_topic.sql:56-71`:

```sql
ALTER TABLE public.top_stories ENABLE ROW LEVEL SECURITY;

-- public select keeps the home feed query working unauthenticated
CREATE POLICY "top_stories_select_public"
  ON public.top_stories FOR SELECT
  USING (true);

-- service_role full access (admin route writes through createServiceClient)
CREATE POLICY top_stories_service_role_all
  ON public.top_stories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DROP the open authenticated-write policy.
-- No authenticated-write policy at all — writes only through service role.
DROP POLICY IF EXISTS "top_stories_write_authenticated" ON public.top_stories;
```

Defense in depth: even if the route handler has a bug, RLS denies
direct writes from any non-service caller. This matches `muted_outlets`
exactly — owner-installed pattern, three days old (2026-05-03).

## Why Option B is a regression

1. **No audit trail.** `admin_audit_log` only gets rows from
   `recordAdminAction()`, which only fires inside a server route.
   Browser-client writes leave zero trace of who pinned/unpinned the
   hero. Owner can't reconstruct "who replaced position 1 yesterday"
   even after the fact.
2. **No rate limit.** `checkRateLimit()` is a route-handler helper.
   A compromised admin session can rewrite all five slots in a tight
   loop unbounded.
3. **No input validation server-side.** Today's schema CHECKs cover
   `position 1..5`, but any future field (caption override, scheduled
   pin window, etc.) would have to be validated in two places — RLS
   `WITH CHECK` clauses are awkward for non-trivial validation.
4. **Diverges from 100+ admin routes.** Owner memory
   `feedback_genuine_fixes_not_patches.md` rules out parallel paths
   when a canonical path exists. This is the textbook case.
5. **Permission key vocabulary mismatch.** The rest of the admin
   surface checks via `admin.<surface>.<action>` permission keys
   (`admin.feeds.manage`, `admin.pipeline.categories.manage`, etc.)
   resolved through `compute_effective_perms` / `my_permission_keys`.
   `is_admin_or_above()` in RLS is a coarser DB-side role check that
   doesn't go through the same resolver. Mixing the two on one surface
   means revoking "top stories" from a single editor (without revoking
   the whole admin tier) is impossible without a code change.

## Implementation plan (for the eventual fix slice)

1. **New permission key** — add `admin.top_stories.manage` to the
   `permissions` table via migration. Grant to existing admin role(s).
2. **New routes**:
   - `web/src/app/api/admin/top-stories/route.ts` — POST (pin /
     replace at a position) and DELETE (clear all? optional, the page
     today only clears one slot).
   - `web/src/app/api/admin/top-stories/[position]/route.ts` — DELETE
     (clear single slot). Position is the natural key (UNIQUE in the
     schema), so `[position]` is the right path param, not `[id]`.
   Each route runs the canonical 8-step skeleton from
   `web/src/lib/adminMutation.ts:1-88`.
3. **Page refactor** — replace the two `supabase.from('top_stories')`
   calls in `web/src/app/admin/top-stories/page.tsx:110-128` with
   `fetch('/api/admin/top-stories', {method:'POST', ...})` and
   `fetch('/api/admin/top-stories/' + position, {method:'DELETE'})`.
   Drop `pinned_by: userId` from the client body — the route fills it
   from `actor.id`.
4. **RLS migration** — drop `top_stories_write_authenticated`, add
   `top_stories_service_role_all` (matches `muted_outlets` exactly).
   Keep `top_stories_select_public` unchanged.
5. **Audit `actions`** — `top_stories.pin` and `top_stories.clear`
   labels passed to `recordAdminAction`.
6. **Rate-limit policy** — `admin.top_stories.mutate`, max 30,
   window 60s (matches `admin.feeds.create` / `admin_categories_mutate`).

Cross-platform applicability per
`feedback_cross_platform_consistency.md`: web only. iOS and kids iOS
do not curate front-page hero pins — that is a web-admin-only surface.
**Not applicable to iOS / kids iOS.**

## Decision

**Option A. Match the canonical admin-mutation skeleton in
`web/src/lib/adminMutation.ts`.** Option B leaves the audit, rate-limit,
and validation gaps that the rest of the admin surface explicitly
closed in the MED-sweep audit-sweep B-C 2026-04-23.
