# FACTS — Phase 4 Task 20 (Newsroom home page `/admin/newsroom`)

Generated 2026-04-22. Live DB + codebase verified.

---

## 1. Live state

- `/admin/newsroom/` directory does NOT exist — new path.
- `/admin/pipeline/page.tsx` EXISTS as a separate shell (Tasks 27-29 may eventually consolidate or replace it; per fence we don't touch it this task).
- `feed_clusters` row count = **0** (live). Page must handle empty state as the default render.
- `feed_clusters` schema (live): `id, title, summary, primary_article_id, category_id, keywords, similarity_threshold, is_active, is_breaking, created_at, updated_at, expires_at`. **Migration 116 STAGED columns** (`locked_by, locked_at, locked_until, generation_state, last_generation_run_id`) NOT live yet.
- `feed_clusters` has NO `audience` column. Audience attaches to discovery_items / kid_discovery_items, not to the cluster itself.
- Permissions live: `admin.pipeline.view` (entry to admin pipeline area). `admin.pipeline.run_generate` + `admin.pipeline.release_cluster_lock` are STAGED (migration 116). `admin.pipeline.manual_ingest` (used by Task 9 ingest) — confirm membership before button enables ingest.

## 2. Auth pattern (verified — `web/src/app/admin/settings/page.tsx:55-67`)

Existing admin pages use client-side role gate:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) { router.push('/'); return; }
const { data: roleRows } = await supabase
  .from('user_roles')
  .select('roles(name)')
  .eq('user_id', user.id);
const names = ((roleRows || []) as Array<{ roles: { name: string } | null }>)
  .map((r) => r.roles?.name).filter(Boolean) as string[];
if (!names.some((n) => ADMIN_ROLES.has(n))) {
  router.push('/'); return;
}
```

`ADMIN_ROLES` is the canonical set in `@/lib/roles`. Use it.

For Task 20, additionally check membership of `admin.pipeline.view` perm (page-specific gate). Existing pages either use ADMIN_ROLES alone OR call permissions endpoint — settings uses ADMIN_ROLES only. Match settings simplicity for v1; Phase 4 may layer permission checks later.

## 3. Component kit (verified — `web/src/components/admin/`)

Use:
- `Page` + `PageHeader` (page chrome)
- `PageSection` (block grouping)
- `Button` (Primary/Secondary actions)
- `Badge` (is_breaking flag, lock status)
- `EmptyState` (0 clusters)
- `Spinner` (loading)
- `ToastProvider` + `useToast` (action feedback)
- `Modal` (optional, deferred to Task 22 generation modal)

Skip: `DataTable` (cards are not tabular).

Style tokens: `ADMIN_C, F, S` from `@/lib/adminPalette`.

## 4. Page structure (LOCKED)

Two files:

### File 1: `web/src/app/admin/newsroom/page.tsx`

Server component shell — gates the route via the existing role pattern (will be a client component to match siblings; pure server gate would diverge from established admin convention). Wraps the inner client component in `<ToastProvider>`.

### File 2: same file (single file is fine — match settings page pattern)

Just one file: `'use client'` directive + role gate + data fetch + render.

## 5. Data fetch (LOCKED)

```ts
// 1. Active clusters
const { data: clusters, error } = await supabase
  .from('feed_clusters')
  .select('id, title, summary, is_breaking, created_at, updated_at')
  .eq('is_active', true)
  .order('updated_at', { ascending: false })
  .range(offset, offset + 19);  // 20 per page

// 2. Lock state — try-select locked_* cols (migration 116 STAGED)
//    On column-not-found error, gracefully degrade: no lock badges, no unlock buttons.
const { data: lockData } = await supabase
  .from('feed_clusters')
  .select('id, locked_by, locked_until')
  .in('id', clusterIds);
// If lockData null/error: render without lock UI (pre-migration state).
```

Pagination v1: simple offset-based with "Load more" button. 20 per page. Defer cursor-based pagination to Phase 4 cleanup.

## 6. Per-card render (LOCKED)

```
┌─────────────────────────────────────────────────┐
│ [BREAKING] Cluster title                        │
│                                                  │
│ Summary text truncated to ~200 chars...         │
│                                                  │
│ Updated 3h ago                                   │
│                                                  │
│ [Generate adult] [Generate kid] [Unlock?] [View]│
└─────────────────────────────────────────────────┘
```

Per card data:
- `title` (or fallback "Untitled cluster")
- `summary` (truncated to 200 chars + ellipsis)
- `is_breaking` → red Badge
- `updated_at` → relative time string
- "Generate adult" → POST `/api/admin/pipeline/generate { cluster_id, audience: 'adult' }`. Disabled if locked. On success: navigate to `/admin/pipeline/runs/${run_id}` (Task 27 — not built yet; URL is correct shape per Task 12 GET endpoint pattern). On error: Toast.
- "Generate kid" → same shape with `audience: 'kid'`
- "Unlock" → only render if `cluster.locked_by !== null`. POST `/api/admin/newsroom/clusters/[id]/unlock` (Task 11 endpoint, STAGED until 116 applies). On success: refresh list.
- "View" → navigate to `/admin/newsroom/clusters/${id}` (Task 21 — not built yet).

## 7. Page header

```
Newsroom
[Refresh feeds]   [Pipeline runs →]
```

- "Refresh feeds" → POST `/api/newsroom/ingest/run` (Task 9, LIVE). On success: refetch clusters, Toast "Feeds refreshed".
- "Pipeline runs →" → navigate to `/admin/pipeline` (existing shell — Task 26 will eventually replace).

## 8. Empty / loading / error states

- **Loading**: `<Spinner />` centered while initial fetch runs.
- **Empty**: `<EmptyState title="No active clusters" description="Click Refresh feeds to ingest. New clusters appear here as they form." />` when `clusters.length === 0` after load. **CORRECTED — prop is `description`, not `body` (verified `EmptyState.jsx:20`).**
- **Error**: Toast on fetch fail, render the empty state with description "Could not load clusters."

## 9. Generate-button audience picker

Handoff §6 says "Generate" button. FACTS §6 chose to render TWO inline buttons (adult / kid) per card to avoid a modal in the v1 list view. Pros: simpler, clearer intent. Cons: 2 buttons clutter card. Acceptable for v1; Task 22 modal is the canonical multi-step flow.

Both buttons fire even if cluster has no items for that audience — backend returns 422 "insufficient items" in that case (per Task 10 422 mapping). UI surfaces toast.

## 10. Generate button disabled state

If `cluster.locked_by !== null` (cluster is being generated by another run), disable both Generate buttons. Show Unlock button as the alternative. Tooltip: "Cluster is locked; another run is in progress."

If `locked_by` data isn't available (pre-migration 116), buttons stay enabled (graceful degrade).

## 11. STAGED dependencies

| Resource | State | Effect on Task 20 |
|---|---|---|
| Migration 116 — `feed_clusters.locked_*` cols | STAGED | Lock UI gracefully degrades; buttons enabled |
| Migration 116 — `admin.pipeline.run_generate` perm | STAGED | Generate POST returns 403 until applied |
| Migration 118 — `persist_generated_article` RPC | STAGED | Generate POST returns 500 mid-chain until applied |
| Migration 120 — `pipeline_runs.error_type` | STAGED | Generate POST returns 500 on cleanup until applied |
| Task 22 generation modal | NOT BUILT | Generate buttons fire directly to API; Task 22 will replace with modal |
| Task 21 cluster detail | NOT BUILT | "View" button navigates to a 404 page until Task 21 ships |

Document all of these in the page's TSDoc comment + commit body. Page is safe to ship as scaffolding — all backend wires up post-migration.

## 12. MUST-NOT-TOUCH fence

- `/admin/pipeline/page.tsx` — existing shell, do NOT edit (Task 26-29 will consolidate later)
- `/api/admin/pipeline/generate` route — read-only consumer
- `/api/newsroom/ingest/run` route — read-only consumer
- `/api/admin/newsroom/clusters/[id]/unlock` route — read-only consumer
- Migrations / permissions / settings — none touched
- Existing admin layout + sidebar — no edits (page registers itself via Next.js routing)
- `web/src/components/admin/*` — read-only consumer

## 13. Imports

```ts
'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';
```

`Tables<'feed_clusters'>` for type. Note: types file is `database-helpers` here, not `database`. (Verified via existing imports.)

## 13a. ADDENDUM 2026-04-22 — adversary YELLOW fixes

- **P1-1 (must land)**: `load(true)` MUST set `offset = 0` before fetch. Refresh feeds button calls `load(true)`. Otherwise stale offset after ingest yields empty range.
- **P1-2 (must land)**: the `as unknown as {data, error}` cast for the lock-select is applied **post-await on the destructured result**, NOT mid-chain:
  ```ts
  const lockRes = await supabase.from('feed_clusters').select('id, locked_by, locked_until').in('id', ids);
  const { data: lockData, error: lockErr } = lockRes as unknown as { data: Array<...> | null; error: { code?: string } | null };
  ```
  NOT `const { data, error } = await (supabase.from(...) as unknown as ...)`.
- **P1-3 (must land)**: Refresh feeds 429 → toast `'Refreshing too fast. Try again in a moment.'` (NOT identical to the 500 generic toast). Read `Retry-After` header if present; if absent, use the generic copy.
- **P2-1**: Generate failure toast, when `json.run_id` present, include id: `` `Could not start generation (run ${json.run_id.slice(0,8)})`. ``
- **P2-2**: Drop `useMemo` and `useCallback` imports from §13 unless implementer actually uses them. React complains about unused imports.
- **P2-3 (verify before writing)**: Implementer checks `web/package.json` for `date-fns` before importing. If absent, write a 10-line `relativeTime(iso: string): string` helper inline (hours/days ago).

Confirmed no-changes:
- Unlock endpoint `/api/admin/newsroom/clusters/[id]/unlock` exists (Task 11)
- Generate Zod accepts `{cluster_id, audience}` alone; other fields have defaults
- Same-origin cookie auth via bare `fetch(...)` matches feeds/settings pattern
- Button variants `primary|secondary|ghost|danger` confirmed
- Toast variants include `danger|success|neutral|warn|info`
- View → 404 acceptable (Task 21 next)

## 14. Cost / abort summary

- **Cost**: 1-2 SELECTs on page load (clusters + optional locks), 1 POST per button click. No LLM, no migration, zero new infra.
- **Abort**: standard React fetch abort handled by useEffect cleanup. No special handling.
- **Idempotency**: load = idempotent. Refresh = piggybacks Task 9 ingest's own rate limit. Generate clicks = backend rate-limit handles double-click.

---

End of FACTS sheet.
