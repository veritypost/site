# Slice 03 — Viewing

**Status:** locked
**Locked:** 2026-04-29
**Session:** 4 (investigation + Q&A)

---

## What this slice covers

How readers consume published articles: the web reader page, iOS adult `StoryDetailView`, and iOS kids `KidReaderView`. Covers citation and timeline rendering to readers, the broken permission RPC that locks iOS article access for all users, and web event tracking. Does not cover the admin authoring side of timelines or sources (generation handles that), quiz-taking mechanics (slice 04), or comment threads (slice 06).

---

## How viewing works today

**Web reader.** `/[slug]` is a server-component at `web/src/app/[slug]/page.tsx:85`. The server fetches the article via service client (RLS-bypassed), enforces `status='published'` in code with a `notFound()` guard (`page.tsx:104`), renders the body through `renderBodyHtml()` (`lib/pipeline/render-body.ts:62`) which runs `marked` + `sanitize-html`, then passes the result to `ArticleSurface`. All DB access is server-side — zero browser Supabase calls in the reader path. No sources section, no timeline section, no event tracking, no share UI, no paywall on body access.

**iOS adult.** `StoryDetailView.swift:28` receives a pre-fetched `Story` object and calls `loadData()` async to fetch timelines, sources, comments, bookmarks, quiz attempts, and comment votes in parallel. Three tabs: Story / Timeline / Discussion. Sources render via `sourcePillsSection` (`StoryDetailView.swift:830`), timeline via `timelineContent` (`StoryDetailView.swift:916`). Both are gated by permission checks — but see the critical finding below. "Up Next" sheet triggers at 95% scroll, fetching 3 published articles from the same category. `EventsClient` batches events to disk and drains them on background.

**iOS kids.** `KidReaderView.swift:8` fetches only `kids_summary` (`KidReaderView.swift:264`) with an explicit `is_kids_safe=true` filter. Paragraph-split text rendering, no sources, no timeline, no citations — intentional per the A7 comment in the file. Parental gate (math challenge, 3 attempts, 5-minute lockout via `ParentalGateModal.swift`) applies to sensitive actions, not article reading. Quiz is fully wired via `KidQuizEngineView`, entered from the "Take the quiz" button; reading log written on quiz entry with `read_percentage=1.0, completed=true`. Disk-backed pending writes survive app kill (T251).

---

## Critical finding: broken permission RPC locks all iOS article access

Both iOS (`PermissionService.swift:107`) and web (`permissions.js:115`) call an RPC named `compute_effective_perms`. That function **does not exist in the database**. The full function list was verified via `information_schema.routines` — no `compute_effective_perms`.

The actual working resolver is `my_permission_keys` (`public.my_permission_keys`), which returns `TABLE(permission_key character varying)`. It resolves grants through role sets (including the implicit `user` role every signed-in user carries), plan sets, and user-level overrides.

**Blast radius.** iOS `PermissionService.swift` error path (line 120): "Leave prior cache intact on error." On cold start the cache is empty, so after the failed RPC every `PermissionService.shared.has()` call returns `false`. This means `canViewBody = false` for all iOS adult users — everyone sees the "Upgrade to read this article" paywall and cannot read anything. `canViewSources` and `canViewTimeline` are also false, so those tabs are locked too.

The web client-side `hasPermission()` is also broken (same cause), but the web reader does not gate body access on client-side permissions — it gates only on `status='published'` — so web reading is unaffected.

**Grant structure.** `article.view.body`, `article.view.sources`, and `article.view.timeline` are all `is_active=true`, `is_public=false`. They are granted to the `anon` permission set. The implicit `user` role (every signed-in user) maps to the `anon`, `free`, and `unverified` sets. So via `my_permission_keys` every signed-in user already has all three keys. Once the RPC call is fixed, every iOS user passes the body/sources/timeline gates — the "Upgrade to read" paywall disappears for all current users. This is correct per the data model: body access is not a paid gate right now.

---

## Decisions

### D1 — Fix the broken RPC name (iOS + web)

Rename the RPC call from `compute_effective_perms` to `my_permission_keys` in:
- `VerityPost/VerityPost/PermissionService.swift:107` — change the `.rpc("compute_effective_perms", params: ComputeArgs(...))` call. Also update `ComputeArgs` — `my_permission_keys` takes no `p_user_id` argument; it uses `auth.uid()` internally. Remove the struct or leave it unused.
- `web/src/lib/permissions.js:115` — change `supabase.rpc('compute_effective_perms', { p_user_id: userId })` to `supabase.rpc('my_permission_keys')`. Also remove the `p_user_id` arg (not needed — `my_permission_keys` reads `auth.uid()` directly).

**Response parsing must also change.** `my_permission_keys` returns rows of `{ permission_key: string }` — just the key, no `granted` / `granted_via` / `deny_mode` / `lock_message` fields.

- iOS: `PermissionRow` struct currently requires `granted: Bool`. With `my_permission_keys`, presence in the result set means granted. Options: (a) synthesize `granted=true` for every returned key; (b) decode as a simpler struct `{ permission_key: String }` and store keys in a `Set<String>`, then `has(_ key)` returns `cache.contains(key)`. Option (b) is cleaner — drop `PermissionRow` entirely, replace `cache: [String: PermissionRow]` with `cache: Set<String>`, update `has()` and `get()` accordingly. `get()` callers that read `granted_via` / `lock_message` exist in the codebase but none are on the critical article-reading path; they can return `nil` / a stub until the DB function grows those fields later.
- Web: `hasPermission(key)` currently does `!!row.granted`. With `my_permission_keys` the row has no `granted` field — `!!undefined = false` — so even a successful call would deny everything. Fix: store keys in a `Set` (`next.add(row.permission_key)`) and `hasPermission(key)` returns `allPermsCache.has(key)`. `getPermission(key)` callers that read structured fields will get `null` (acceptable — no callers on the article reading path depend on it).

**No DB change needed.** `my_permission_keys` already exists and is correctly populated.

### D2 — Add sources section to the web reader

The web reader should render a collapsible sources section, matching the iOS adult model. The server component already fetches the article — add a `sources` query (same server-side fetch, join or second query on `sources WHERE article_id = ...`). Pass to `ArticleSurface`. Render publisher name, headline, and URL. No permission gate — sources are available to all readers (same as iOS after D1 fix). Graceful no-op when the article has zero sources.

Implementation scope: one additional query in `[slug]/page.tsx`, one new `SourcesSection` component, wired into `ArticleSurface`.

### D3 — Add timeline section to the web reader

The web reader should render a timeline section when the article has timeline events. Server component fetches timeline rows ordered by `event_date` (same server-side pattern as D2). Render as a dated list — date, title, description. No permission gate (same reasoning as D2). Graceful no-op when no timeline events exist.

Implementation scope: one additional query in `[slug]/page.tsx`, one new `TimelineSection` component, wired into `ArticleSurface`.

Note: the Slice 05 (timelines) session will cover the data and admin authoring side. D3 here is only about rendering existing data to web readers.

### D4 — Wire article read events and view count on the web reader

The custom events pipeline is built and idle on the reader. Wire the following:

- `article_read_start` — fire from `ArticleSurface` on mount (client component, or a thin client wrapper around the RSC).
- `article_read_complete` — fire when the reader scrolls past the 90% depth threshold.
- `scroll_depth` — fire at 25%, 50%, 75%, 100% milestones. Use `IntersectionObserver` against sentinel elements placed at those depths, not a scroll listener, to avoid performance issues.
- `increment_view_count` — call from the server component on page render (server-side, service client, fire-and-forget). This is the "Phase B" deferred item from `browse/page.tsx:53` — wire it now.

The `track.ts` client already handles buffering, `sendBeacon` on tab-hide, and the `/api/events/batch` endpoint. Scroll events need a lightweight client wrapper — the reader page RSC becomes the outer shell; a small `'use client'` `ArticleTracker` component handles the `IntersectionObserver` and `useTrack` calls without pulling the entire article into client-side rendering.

---

## Findings not requiring a decision

**A91 (iOS kids stale content) — already fixed.** `KidReaderView.swift:113-116` re-fetches the article body on `scenePhase == .active`. Cross-slice item 11 closed.

**iOS "Up Next."** The same-category related articles sheet (`StoryDetailView.swift:2148-2223`, triggering at 95% scroll) is fully built and wired. No changes needed.

**iOS body paywall UI.** After D1 is implemented, `canViewBody` will be `true` for all signed-in users and the "Upgrade to read" prompt will never fire. The paywall UI code can stay — it's forward-looking infrastructure for future paid tiers. No need to remove it.

**Web reader has no share UI.** `article.share.copy_link` and `article.share.external` permission keys exist and are active, but no share buttons exist on the web reader. Out of scope for this slice.

**Web reader has no reading progress indicator.** Out of scope for this slice.

---

**Adversarial review note.** This session skipped the adversarial review step. It was the session with the most critical finding in the program (D1 — broken iOS RPC). A post-implementation review found one consequence: the `ArticleTracker` implementation places sentinels at `${pct}vh` (viewport height units) from `document.body`, not at proportional positions within the article element. This means scroll depth milestones fire relative to viewport height, not article depth — a long article fires 25% almost immediately; a short article's milestones cluster at the same point. The spec said "IntersectionObserver sentinels at 25/50/75/100% of article body" but the implementation approximated with viewport percentages. Analytics are unreliable as a result.

---

## Implementation checklist (for the execution session)

- [ ] `PermissionService.swift` — rename RPC, drop `ComputeArgs`, change `cache` to `Set<String>`, update `has()` / `get()`
- [ ] `permissions.js` — rename RPC, remove `p_user_id` arg, change `allPermsCache` to `Set`, update `hasPermission()` / `getPermission()`
- [ ] `[slug]/page.tsx` — add sources query + timeline query, pass to `ArticleSurface`
- [ ] New `SourcesSection` component
- [ ] New `TimelineSection` component
- [ ] Wire both into `ArticleSurface`
- [ ] `increment_view_count` call in `[slug]/page.tsx` server component (fire-and-forget)
- [ ] New `ArticleTracker` client component — `IntersectionObserver` sentinels placed at proportional positions **within the article body element**, not at viewport-height percentages. `useTrack` for `article_read_start` / `article_read_complete` / `scroll_depth`
- [ ] Wire `ArticleTracker` into the reader page
