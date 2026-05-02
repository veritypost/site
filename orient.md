# Verity Post — Session Orientation

Read this first. It covers the facts that burn the most tokens when a session starts cold.

---

## Repo layout

```
web/          Next.js 14 app (App Router, deployed to Vercel → veritypost-site)
VerityPost/   iOS adult app (Swift / SwiftUI)
VerityPostKids/  iOS kids app (Swift / SwiftUI)
supabase/     Migrations + edge functions
```

- Route → file map: see `tree.md`
- Kill-switch inventory: see `CLAUDE.md` (top of file)
- Full per-page review findings: `review/page-*.md`

---

## Auth — web

| Need | Use |
|------|-----|
| Server component / API route — get session | `requireAuth(client)` from `web/src/lib/auth.js:198` |
| Client component — check if signed in | `useAuth()` from `web/src/app/NavWrapper.tsx` |
| Gate a whole page to signed-in users | Wrap in `<PermsBoundary>` from `web/src/app/profile/_components/PermsBoundary.tsx` |
| Gate a page but allow anonymous | `<PermsBoundary optional>` |

`requireAuth` throws `{ status: 401 }` for anonymous, `{ status: 403 }` for insufficient role. API routes catch and return the matching HTTP status.

---

## Permissions — web

Single source: `web/src/lib/permissions.js`

```js
import { hasPermission, refreshIfStale } from '@/lib/permissions';

// In a useEffect / on mount:
await refreshIfStale();          // fetches from DB only when stale (version sentinel -1 on first load)
hasPermission('some.key')        // sync boolean after load
```

- **Never call `refreshAllPermissions()` before `refreshIfStale()`** — `refreshIfStale` calls it internally on first load; the pre-call is pure redundant overhead.
- `hasPermissionViaRpc` — for one-off server-side checks in API routes.
- `hasPermissionFor(key, scopeType, scopeId)` — scoped (e.g. per-article).

---

## Permissions — iOS

`VerityPost/VerityPost/PermissionService.swift`

```swift
PermissionStore.shared          // @MainActor ObservableObject
perms.changeToken               // Int — bumps on every reload; use as .task(id:) trigger
perms.isLoaded                  // Bool — false until first fetch completes
PermissionService.shared.has("some.key")  // async Bool
```

Pre-warm on app start: `VerityPostApp.init()` touches `PermissionStore.shared` to kick off the background fetch.

---

## Supabase clients — web

| Client | File | Use when |
|--------|------|----------|
| `createClient()` | `web/src/lib/supabase/server.ts:26` | Server components, API routes — respects RLS with the user's session |
| `createServiceClient()` | `web/src/lib/supabase/server.ts:136` | API routes that need to bypass RLS (admin actions, write-behind operations) |
| `createClient()` (browser) | `web/src/lib/supabase/client.ts` | Client components only |
| `createClientFromToken(token)` | `web/src/lib/supabase/server.ts:98` | When you have a raw bearer token (e.g. iOS API calls) |

---

## FK join hints

When writing Supabase `.select()` with embedded relations, the hint must match the `foreignKeyName` in `web/src/types/database.ts`. Convention is `_fkey` suffix, **not** `fk_` prefix.

```ts
// Correct:
.select('*, stories!articles_story_id_fkey(title)')
// Wrong:
.select('*, stories!fk_articles_story_id(title)')
```

Always verify against `database.ts` before shipping a query with a `!hint`.

---

## CSS tokens

Defined in `web/src/app/globals.css`. Use these everywhere — no hardcoded hex.

| Token | Role |
|-------|------|
| `--bg` | Page background |
| `--card` | Card / surface background |
| `--border` | Dividers, input borders |
| `--text` / `--text-primary` | Body text |
| `--dim` | Secondary / muted text |
| `--accent` | Brand accent (buttons, links) |
| `--success` / `--danger` / `--warn` | Semantic states |
| `--vp-top-bar-h` | Height of global nav bar (set by NavWrapper); use in `paddingTop` calculations |

**Dark mode:** tokens flip automatically via `@media (prefers-color-scheme: dark)` on `:root` at `globals.css:118`. No `data-theme` attribute needed yet — system preference only.

**Palette tokens** (`--p-*`) are the newer design system tokens. Use these for new work; legacy `--bg`/`--card` etc. are being migrated to `--p-*` progressively.

---

## Z-index scale

`web/src/lib/zIndex.ts` — import `Z` and use named constants.

```ts
Z.OVERLAY  = 1000   // soft gates, paywalls
Z.MODAL    = 2000   // ConfirmDialog, standard modals
Z.TOAST    = 3000   // Toast notifications
Z.TOOLTIP  = 4000   // (reserved)
Z.CRITICAL = 9000   // global nav, admin banner, drawers that must cover everything
```

For local stacking within a positioned parent, use raw integers.

---

## Key shared components

| Component | Path | What it does |
|-----------|------|-------------|
| `Avatar` | `web/src/components/Avatar.tsx` | User avatar with fallback initials |
| `FollowButton` | `web/src/components/FollowButton.tsx` | Self-gates on `profile.follow` permission |
| `BookmarkButton` | `web/src/components/BookmarkButton.tsx` | Bookmark toggle, self-gates |
| `ConfirmDialog` | `web/src/components/ConfirmDialog.tsx` | Two-button confirmation modal |
| `Toast` / `useToast` | `web/src/components/Toast.tsx` | Transient notification system |
| `UnderConstruction` | `web/src/components/UnderConstruction.tsx` | Kill-switch placeholder page |
| `VerifiedBadge` | `web/src/components/VerifiedBadge.tsx` | Expert verification badge |
| `PermsBoundary` | `web/src/app/profile/_components/PermsBoundary.tsx` | Auth gate wrapper |

---

## Animation

Global keyframe: `vpSpin` (camelCase) in `globals.css:195`. Use `animation: 'vpSpin 0.75s linear infinite'`. Do **not** define inline `vp-spin` copies — they are a different identifier and won't resolve.

Skeleton shimmer: add class `vp-skeleton` which uses the `vpShimmer` keyframe. Background should be `var(--card)` or `var(--border)`.

---

## Kill switches (current state)

| # | Feature | State |
|---|---------|-------|
| 1 | `/u/[username]` public profile | **ON** — `PUBLIC_PROFILE_ENABLED = true` |
| 2 | `/profile/[id]` redirect | **ON** — redirects to `/u/[username]` |
| 3 | Public profile share link in `/profile` | Still commented out — re-enable when needed |
| 4 | OAuth (Google/Apple) login | **OFF** — `OAUTH_ENABLED = false` |
| 5 | iOS "Manage subscriptions" tab | **ON** — `manageSubscriptionsEnabled = true` |
| 6 | `/ideas/*` preview routes | Admin-only middleware gate — leave it |
| 7 | Sitewide holding mode | Off — `NEXT_PUBLIC_SITE_MODE` not set to `coming_soon` |
| 8–10 | RSS ingest + adult + kids generation | **ON** — all `true` in `settings` table |

---

## Commit rules (every session)

1. **Push after every commit** — Vercel only deploys what's pushed; committing without pushing = nothing changes on prod.
2. **Cross-platform scope** — every fix covers web + iOS adult + iOS Kids. If one platform is exempt, state "not applicable" explicitly.
3. **6-agent ship pattern** for non-trivial changes: investigator → planner → big-picture reviewer → adversary → implement → post-impl adversary. All 4 pre-impl agents must agree before code is written.
4. **Genuine fixes only** — no parallel paths, no TODOs, no force-unwraps as crutches. Kill the thing being replaced.
5. **Verify FK hints** against `database.ts` before shipping any query with a `!hint`.
6. **No hardcoded hex** — use CSS tokens. No color-per-tier.
7. **No keyboard shortcuts** in admin flows.
8. **Kill-switched surfaces** are prelaunch-parked — don't surface them in "what's next" lists.
