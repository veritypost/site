# DONE

Master log of shipped / closed work. **Append-only**, grouped by area so related fixes cluster together — when you want to know "what have we done to `/profile/settings` lately?", scroll to the right section.

## Auditor contract

**Before flagging an issue, grep this file first by `file:line`.**

If the fix is logged here, do NOT re-raise it unless you can prove a regression — show the commit diff and the current broken state. If the code genuinely reverted, re-flag as a new task with "REGRESSION of T-XXX" in the title.

## Entry format

```
### YYYY-MM-DD — short title (T-ID if tracked)
- Files: `path:line`, `path:line`
- Change: one-line what happened
- Session: which log/doc (for full detail)
- Verify: what was checked (tsc pass / build pass / live DB / etc)
```

Keep entries short. Full narrative belongs in session logs (e.g. `05-Working/BATCH_FIXES_2026_04_20.md`).

---

## Auth & onboarding

### 2026-04-20 — LockModal CTA routes fixed
- Files: `web/src/components/LockModal.tsx:56,63`
- Change: `/auth` → `/login`; `/plans` → `/profile/settings#billing` (both targets were 404)
- Session: Batch 1, BATCH_FIXES_2026_04_20.md
- Verify: tsc pass

### 2026-04-20 — /welcome onboarding carousel now reachable
- Files: `api/auth/callback/route.js:68,152`, `signup/pick-username/page.tsx:137,147`, `welcome/page.tsx`
- Change: extended users select w/ `onboarding_completed_at`; new users routed through `/welcome` instead of dropped on `/`; pick-username redirects to `/welcome`
- Session: Batches 2 + 5, BATCH_FIXES_2026_04_20.md
- Verify: tsc pass

### 2026-04-20 — /welcome enforces email verification
- Files: `web/src/app/welcome/page.tsx`
- Change: added `email_verified` check; unverified users redirected to `/verify-email`
- Session: Batch 5

### 2026-04-20 — /profile/milestones redirect used wrong tab
- Files: `web/src/app/profile/milestones/page.js:6`
- Change: `?tab=Categories` → `?tab=milestones` (canonical lowercase slug)
- Session: Batch 1

### 2026-04-20 — /profile/activity tab name case fix
- Files: `web/src/app/profile/activity/page.js:6`
- Change: `?tab=Activity` → `?tab=activity`
- Session: Batch 5

### 2026-04-20 — /profile/[id] dead Quizzes tab removed
- Files: `web/src/app/profile/[id]/page.tsx`
- Change: removed broken `/profile/quizzes` TABS entry (page never existed)
- Session: Batch 1

---

## Billing & Stripe

### 2026-04-20 — Post-Stripe-checkout `?success=1` now reaches settings page
- Files: `api/stripe/checkout/route.js:46`, `profile/settings/billing/page.tsx`, `profile/settings/page.tsx`
- Change: billing redirect preserves `?success=1` / `?canceled=1`; settings page reads it, fires toast + `invalidate()` perms cache + strips query; paid users no longer see stale gated UI post-checkout
- Session: Batch 2

### 2026-04-20 — Stripe webhook body size cap
- Files: `web/src/app/api/stripe/webhook/route.js:46`
- Change: `MAX_BODY_SIZE = 1 MiB`; pre-read content-length check + post-read length check → 413 on overflow
- Session: Batch 4
- Verify: Stripe webhooks still process normally

### 2026-04-20 — Stripe checkout rate-limited
- Files: `web/src/app/api/stripe/checkout/route.js`
- Change: 20/hr per user (prevents billable Stripe session spam)
- Session: Batch 10

### 2026-04-20 — /api/account/delete rate-limited
- Files: `web/src/app/api/account/delete/route.js`
- Change: 5/hr per user (prevents 30-day timer thrash)
- Session: Batch 10

---

## Permissions & RLS

### 2026-04-20 — `profile.follow` now requires verified email
- Files: Live DB `public.permissions`
- Change: `UPDATE permissions SET requires_verified=true WHERE key='profile.follow'` (was `false`; now matches `social.follow` pattern)
- Session: Batch 9
- Verify: SELECT returned row with `requires_verified=true`

### 2026-04-20 — Admin user-permissions endpoint guarded by `require_outranks`
- Files: `web/src/app/api/admin/users/[id]/permissions/route.js:80-100`
- Change: added self-skip + `require_outranks()` RPC check (sibling routes already had it; this one was missed). Closes privilege-escalation path where admin could override perms on superadmin/owner
- Session: Post-audit fix U3, BATCH_FIXES_2026_04_20.md Batch 13
- Verify: pattern matches `roles/route.js:assertActorOutranksTarget`

### 2026-04-20 — Admin hub routes MOD_ROLES in (was bouncing to /)
- Files: `web/src/app/admin/page.tsx`
- Change: editor/moderator roles no longer redirected to `/`; `restrictedRole` state tracked (JSX banner still outstanding — see T-028)
- Session: Batch 12

---

## Rate limits & Retry-After

### 2026-04-20 — Rate limits added to 6 unprotected mutation routes
- Files: `api/kids/reset-pin`, `kids/verify-pin`, `users/[id]/block`, `follows`, `bookmarks`, `appeals`
- Change: per-user `checkRateLimit` with tuned `{max, windowSec}` ceilings
- Session: Batches 3 + 10
- Verify: 429 returned on overflow; pattern mirrors `/api/kids/generate-pair-code`

### 2026-04-20 — Retry-After header on 9 rate-limited routes
- Files: 9 routes (all Batch 3/10 routes + `kids/generate-pair-code`)
- Change: 429 responses now include `Retry-After: <windowSec>` header (13 more routes still outstanding — T-025)
- Session: Batch 11

---

## Error hygiene

### 2026-04-20 — `error.message` sweep on 7 routes
- Files: `api/comments`, `follows`, `bookmarks`, `appeals`, `messages`, `conversations`, `quiz/submit`
- Change: raw `error.message` passthroughs replaced with generic user strings + `console.error('[route-tag]', err)` server logs (~108 more routes outstanding — T-013)
- Session: Batches 5 + 7

### 2026-04-20 — Story report submit shows errors in modal
- Files: `web/src/app/story/[slug]/page.tsx`
- Change: `reportError` state + render; non-OK API responses now surface to user (were silently swallowed)
- Session: Batch 4

---

## Kids iOS

### 2026-04-20 — Dynamic Type migration on 3 Kids iOS screens
- Files: `VerityPostKids/VerityPostKids/{PairCodeView,KidReaderView,ArticleListView}.swift`
- Change: 24 `.font(.system(size: N))` call sites → `.font(.system(.<textStyle>, design: .rounded, weight: W))` — now scales with Dynamic Type. (11 more Swift files outstanding — T-043)
- Session: Batch 8
- Verify: `xcodebuild ** BUILD SUCCEEDED **`

### 2026-04-20 — Kids iOS tap targets bumped to 44pt
- Files: `VerityPostKids/VerityPostKids/{KidsAppRoot,ArticleListView,KidReaderView}.swift`
- Change: close-button frames 32x32 / 36x36 → 44x44 (WCAG minimum)
- Session: Batch 9

---

## Kids API & parent UI

### 2026-04-20 — Kid DOB now requires min-age 3 years
- Files: `web/src/app/api/kids/route.js`, `api/kids/trial/route.js`
- Change: rejects DOB <3 years old (fat-finger future-date guard); matching check on both create + trial paths
- Session: Batch 9 + post-audit U4
- Verify: `POST /api/kids` with DOB 2024-12-31 returns 400

### 2026-04-20 — Kid DELETE is soft, requires `?confirm=1`
- Files: `api/kids/[id]/route.js`, `profile/kids/page.tsx:175`
- Change: server rejects DELETE without `?confirm=1` query; flips `is_active=false` instead of hard delete; client passes confirm param
- Session: Batch 12 + post-audit U1
- Verify: reading history/streaks preserved; soft-deleted kids invisible

### 2026-04-20 — Parent's kid list filters soft-deleted rows
- Files: `api/kids/route.js` (GET), `api/kids/[id]/route.js` (ownKid helper)
- Change: `.eq('is_active', true)` added; `ownKid()` rejects `is_active=false` so PATCH/DELETE can't touch soft-deleted rows
- Session: Post-audit U2a + U2b

### 2026-04-20 — /kids-app landing page rewritten
- Files: `web/src/app/kids-app/page.tsx`
- Change: 10-line "Coming soon" stub → proper landing with headline, features, CTAs to `/` and `/login`; marketing anchors no longer dead-end
- Session: Batch 6

---

## Reader (home + story)

### 2026-04-20 — Story page ghost-read defaults hardened
- Files: `web/src/app/story/[slug]/page.tsx:221-223`
- Change: `canViewBody/Sources/Timeline` defaults flipped `true → false`; anon branch explicitly sets `true`; catch block fails-open on transient error
- Session: Batch 2
- Verify: paid content no longer flashes ~200-500ms before perms resolve

### 2026-04-20 — Home feed filters null-slug articles
- Files: `web/src/app/page.tsx:878`
- Change: `.filter(s => s.slug)` before map; prevents `/story/undefined` hrefs
- Session: Batch 11

---

## Admin surfaces

### 2026-04-20 — Admin hub allows MOD_ROLES
- See Permissions & RLS section (same fix, cross-cut).

### 2026-04-20 — Admin users Linked-devices section hidden
- Files: `web/src/app/admin/users/page.tsx`
- Change: wrapped in `{false && ...}` with TODO; section always showed "No devices" because fetch was never wired
- Session: Batch 6

### 2026-04-20 — Admin users DELETE records completion audit
- Files: `web/src/app/admin/users/page.tsx:273-290`
- Change: added best-effort `record_admin_action('user.delete.completed')` RPC call after successful DELETE (full server-route migration still pending — T-005)
- Session: Batch 4

### 2026-04-20 — Admin moderation PII leak removed
- Files: `web/src/app/admin/moderation/page.tsx:55,96`
- Change: `email` removed from `AppealRow` type + appeals select (was in network response but never rendered)
- Session: Batch 5

### 2026-04-20 — Admin subscriptions Paused tab columns fixed
- Files: `web/src/app/admin/subscriptions/page.tsx:574,584`
- Change: `paused_at → pause_start`, `resumes_at → pause_end`, `pause_reason → cancel_reason` (was reading non-existent columns)
- Session: Batch 6

### 2026-04-20 — Admin analytics period selector trimmed
- Files: `web/src/app/admin/analytics/page.tsx:171-181`
- Change: 30d/90d buttons removed (fetch hardcoded 7d); only 7d rendered with TODO comment
- Session: Batch 6

### 2026-04-20 — Admin analytics "Edit question" button disabled
- Files: `web/src/app/admin/analytics/page.tsx:341`
- Change: `disabled` + tooltip "Edit quiz questions in /admin/story-manager" (was dead onClick)
- Session: Batch 11

### 2026-04-20 — Admin analytics RESOURCE_USAGE labeled as demo
- Files: `web/src/app/admin/analytics/page.tsx:352-360`
- Change: amber warn banner "[Demo data]" above fabricated bars
- Session: Batch 12

### 2026-04-20 — Admin webhooks "Retry" relabeled
- Files: `web/src/app/admin/webhooks/page.tsx:402,458-470`
- Change: "Retry webhook" → "Mark as resolved"; confirm text clarifies redispatch isn't wired
- Session: Batch 6

### 2026-04-20 — Admin expert-sessions live row clarified
- Files: `web/src/app/admin/expert-sessions/page.tsx:195-216`
- Change: dead "Moderate in Kids app" text → disabled button + tooltip
- Session: Batch 4

### 2026-04-20 — Admin pipeline mock-data label
- Files: `web/src/app/admin/pipeline/page.tsx:308-318`
- Change: warn banner flagging hardcoded STEPS/PROMPTS/COST_TIPS as placeholder (so admins don't trust it as live config)
- Session: Batch 12

---

## Middleware & infra

### 2026-04-20 — Middleware skips `auth.getUser()` on public paths
- Files: `web/src/middleware.js:178`
- Change: `auth.getUser()` now gated on `isProtected(pathname) || /kids*`; public pages (home, story, /api/*, /login) avoid GoTrue round-trip
- Session: Batch 11

### 2026-04-20 — CSP flipped from Report-Only to enforce (T-006)
- Files: `web/src/middleware.js:135,138,159,169,196`, `web/src/app/api/csp-report/route.js:2`
- Change: Renamed `Content-Security-Policy-Report-Only` → `Content-Security-Policy` at all 4 middleware emission points (task listed 3 — caught the `isProtected` redirect branch at :197 via grep); updated `csp-report/route.js` top comment; deleted the flip TODO
- Verify: `grep 'Content-Security-Policy-Report-Only' web/` returns 0 matches; `cd web && npx tsc --noEmit` exit 0

### 2026-04-20 — `isV2Live` fails closed on DB error
- Files: `web/src/lib/featureFlags.js`
- Change: default for missing/errored flag now `false` instead of `true` — master kill switch actually works during incidents
- Session: Batch 5

### 2026-04-20 — Layout meta adds `mobile-web-app-capable`
- Files: `web/src/app/layout.js`
- Change: added `other: { 'mobile-web-app-capable': 'yes' }` sibling to deprecated apple-specific meta
- Session: Batch 1

### 2026-04-20 — not-found.js rewritten without Tailwind
- Files: `web/src/app/not-found.js`
- Change: replaced Tailwind classes with inline styles (no Tailwind config existed → 404 page was unstyled)
- Session: Batch 1

### 2026-04-20 — import-permissions script path fix
- Files: `scripts/import-permissions.js:30`
- Change: `'../site'` → `'../web'` (script was fully broken — pointed at renamed folder)
- Session: Batch 1

---

## Schema & migrations

### 2026-04-19 — Migrations 095–099 applied to prod
- Files: `schema/095_kid_pair_codes_*`, `096_kid_jwt_rls_*`, `097_kid_jwt_rls_extended_*`, `098_kid_jwt_leaderboard_reads_*`, `099_rls_hardening_kid_jwt_*`
- Change: kid JWT pairing flow + RLS hardening (16 RESTRICTIVE `NOT is_kid_delegated()` policies on adult tables); reversed privilege direction for kid-held tokens
- Session: pre-this-session; verified by simulating kid JWT

### 2026-04-19 — Migration 100 (require_outranks backfill) written to disk
- Files: `schema/100_backfill_admin_rank_rpcs_2026_04_19.sql`
- Change: DDL backfilled from prod via `pg_get_functiondef`; RPCs `require_outranks` + `caller_can_assign_role` documented in schema
- Session: pre-this-session
- Note: file is a backfill-of-live-state; migration table entry is separate (see T-042)

---

*Log started 2026-04-20 with back-fill of 2026-04-20 session. Future entries added on close.*
