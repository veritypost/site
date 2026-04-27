# System Notes

Running record of how the codebase actually works — DB schema, data flows, component wiring, permission mechanics, etc. Built up as tasks are diagnosed. Referenced before any change is made.

**IMPORTANT:** This file is a starting point, not ground truth. Code changes task to task. Always verify any note here against the actual current file before acting on it. If something has changed, update the note.

---

## Permissions system

- Two cache paths in `web/src/lib/permissions.js`:
  - Legacy: `get_my_capabilities(section)` — section-scoped, used by most existing callers
  - New: `compute_effective_perms()` — full resolver, `hasPermission(key)` reads from this
- Version polling via `my_perms_version()` RPC invalidates both caches on bump (60s poll)
- Fail-closed: cache clear → all `hasPermission()` return false until refresh completes
- iOS mirrors via `PermissionService.swift` — calls same DB RPCs, same key strings
- Canonical keys are short-form: `profile.activity`, `profile.categories`, `profile.achievements` (no `.view.own` suffix — those are a rolled-back migration artifact)

## Plans system

- 5 marketed tiers: `free`, `verity`, `verity_pro`, `verity_family`, `verity_family_xl`
- 9 DB rows (monthly + annual for each paid tier)
- `family` and `family_xl` are iOS/StoreKit-only — not shown in web billing UI
- Per-plan feature limits live in `plan_features` table, queried via `getPlanLimit()` in `web/src/lib/plans.js`
- 60s cache on both plans list and feature limits

## Roles system

- DB-live in `public.roles.hierarchy_level`, 60s cache via `getRoles()` in `web/src/lib/roles.js`
- Frozen JS Sets (`OWNER_ROLES`, `ADMIN_ROLES`, etc.) for coarse layout-level gates only (no DB call)
- Hierarchy enforcement via `require_outranks()` and `caller_can_assign_role()` RPCs — not client-side

## Auth / middleware

- Middleware (`web/src/middleware.js`) handles presence only — not permissions
- Protected prefixes: `/profile`, `/messages`, `/bookmarks`, `/notifications`, `/leaderboard`, `/recap`, `/expert-queue`, `/billing`, `/appeal`
- Anon allowed: home, story, browse, search, category, about, legal, marketing
- `/admin` NOT in middleware list — its own layout returns 404 for anon (hides existence)
- `/notifications` NOT protected — page renders its own anon CTA in-place

## Quiz architecture

- Adult web + adult iOS: server-graded. `/api/quiz/start` returns questions only (no correct answers). `/api/quiz/submit` grades server-side.
- Kids iOS: **client-graded** — direct Supabase query fetches full answer key including `isCorrect`. Full security issue flagged in OwnersAudit Kids Task 9. Do not ship.
- Adult iOS note at `StoryDetailView.swift:62`: "No correct-answer data ever lives on the client until /submit response"

## Settings architecture

- `web/src/app/profile/settings/page.tsx` — 5,299-line monolith (pre-T-073)
- 11 sub-route stubs already exist as directories: `alerts/`, `billing/`, `blocked/`, `data/`, `emails/`, `expert/`, `feed/`, `login-activity/`, `password/`, `profile/`, `supervisor/`
- T-073 = the split; all anchor-link dependents (T-076/077/078/079/080) must land in same deploy

## Skeleton component

- `web/src/components/Skeleton.tsx` — exists, ready to use
- Shimmer animation in `globals.css` (`.vp-skeleton` / `@keyframes vpShimmer`)
- `prefers-reduced-motion` handled globally in `globals.css` — collapses to static grey, no code needed in Skeleton itself

## Kids iOS auth

- Entirely separate from adult auth — JWT-based, `KidsAuth.swift` + `PairingClient.swift` + `SupabaseKidsClient.swift`
- Pair code flow: parent generates code in adult app or web `/profile/kids`, kid enters in kids app
- `ParentalGateModal.swift` — math challenge COPPA gate; active callers: `ExpertSessionsView:85`, `PairCodeView:143`

## Admin surface

- 44 sub-pages, web-only
- `layout.tsx` = auth gate only, no persistent nav
- Shared primitives: `web/src/components/admin/` — Button, DataTable, Drawer, Modal, Page, PageHeader, Toast, etc.
- `Button.jsx` SIZES: sm=26px, md=32px minHeight — both below 44px (flagged Admin Task 1)
- No keyboard shortcuts — product rule, never build them

## AI pipeline

- `web/src/lib/pipeline/` — scrape → clean → cluster → render → persist
- Uses both `@anthropic-ai/sdk` and `openai` (OpenAI for embeddings/clustering, Anthropic for generation)
- Prompt overrides via `prompt-overrides.ts`, cost tracking via `cost-tracker.ts`

## Supabase

- No local migrations directory — all schema applied direct via MCP `apply_migration`
- Never trust `supabase_migrations` log — verify via `information_schema` / `pg_proc` / `pg_constraint` directly
- No local `supabase/functions/` either — edge functions deployed via MCP `deploy_edge_function`, not version-controlled

## Web app — surface map (2026-04-26 scan)

- App Router under `web/src/app/`
- ~200 API endpoints under `web/src/app/api/**` grouped roughly: auth (~13), admin (~80, F7 + moderation + billing), comments, bookmarks, expert, expert-sessions, conversations/messages, quiz, billing/stripe, ios subscriptions, kids (pair/PIN/streak/leaderboard), account (onboarding/data-export/delete), notifications, search, cron (~10 jobs), ads, support, errors/csp-report, healthcheck
- Middleware at `web/src/middleware.js` (note: `.js`, not `.ts`) — request ID, CSP nonce + Report-Only enforcement, CORS allow-list, anon redirect to `/login?next=`, kids `/kids/*` → `/kids-app` for anon or `/profile/kids` logged in, coming-soon mode (`NEXT_PUBLIC_SITE_MODE=coming_soon` → all → `/welcome` except `/api/*` `/admin` `/ideas` `/preview`)
- Owner bypass for coming-soon: `/preview?token=PREVIEW_BYPASS_TOKEN` → sets `vp_preview=ok` cookie
- Sentry actively wired via `web/src/instrumentation.ts` + `web/sentry.client.config.js` + `web/sentry.shared.js` (memory says deferred — verify DSN env)
- `web/src/lib/pipeline/` is the F7 AI pipeline (14 files) — superseded older `/api/ai/generate/route.js` which still exists and writes raw output to `body_html` unsanitized
- `web/src/lib/permissions.js` carries both Wave 1 (`get_my_capabilities(section)`) and Wave 2 (`compute_effective_perms()`) — both live, hasPermission reads Wave 2

## iOS adult app — surface map (2026-04-26 scan)

- Entry: `VerityPostApp.swift` → splash → `MainTabView` (4 tabs)
- Tab enum cases: `.home`, `.notifications`, `.mostInformed`, `.profile` (live in `ContentView.swift:182,194` despite recent commits referencing a Browse swap — see AuditReview #1)
- Auth: `AuthViewModel.swift` owns session state; `SupabaseManager.swift` reads `SUPABASE_URL`/`SUPABASE_KEY` from Info.plist (xcconfig-injected)
- Permission service: `PermissionService.swift` actor + `PermissionStore.swift` MainActor observable
- Push: APNs cert-based via `web/src/lib/apns.js` server-side; iOS-side handled by UIApplicationDelegateAdaptor in `VerityPostApp.swift`
- Bearer-token auth fallback for iOS-on-server requests — server routes accept `Authorization: Bearer <access_token>`

## iOS kids app — surface map (2026-04-26 scan)

- Entry: `VerityPostKidsApp.swift` → `KidsAppRoot` → 4-tab bar (Home / Ranks / Experts / Me)
- Pair-only auth: 8-char pair code → `POST /api/kids/pair` → custom kid JWT (sub = `kid_profile_id`, NOT an `auth.users` row) → stored in Keychain
- Bearer token injected via `SupabaseKidsClient.setBearerToken()` — bypasses GoTrue entirely
- Device safety: install UUID in Keychain pairs with token; mismatch on read clears token (defends shared-iPad sibling reuse)
- COPPA gating: math `ParentalGateModal` (multiplication only, 3 strikes, 5-min lockout) blocks unpair, external links, expert sessions discovery
- Quiz: server-authoritative via `get_kid_quiz_verdict` RPC; local fallback only on RPC failure mid-session
- Zero imports from `VerityPost/` — fully separate module sharing only the Supabase project (RLS isolation)

## Repo top-level layout (2026-04-26 verified)

- `CLAUDE.md` (root)
- `Ongoing Projects/` — live MD files at root: `CHANGELOG.md`, `TODO.md`, `SYSTEM_NOTES.md`, `Pre-Launch Assessment.md`. Plus `migrations/` directory and `AI + Plan Change Implementation/` working dir.
- `web/`, `VerityPost/`, `VerityPostKids/`, `supabase/` (only `.temp/` inside)
- `currentschema` (untracked) at root
- `.claude/settings.local.json` — Supabase MCP enabled, no project-level `settings.json`

---

_Updated as tasks are diagnosed. Add findings here before touching code._
