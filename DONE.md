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

### 2026-04-20 — permissions/route.js error.message leak sweep (T-030, scope expanded)
- Files: `web/src/app/api/admin/users/[id]/permissions/route.js:55-61,127,148,162,174,187,201,212,229,240,248,252`
- Change: task listed 1 site at :127, but the `serverError(\`...: ${err.message}\`)` pattern repeated 11× in this file (security of one site fixed while 10 siblings still leaked). Introduced `dbError(tag, err, publicMessage)` helper next to existing `serverError`; converted all 11 sites. `console.error` retains raw message for server-side debugging; response body is a generic static string. Broader T-013 (~100 remaining sites across codebase) stays open.
- Verify: tsc pass; `grep 'return serverError(\`' <file>` → 0 matches; `grep 'return dbError(' <file>` → 11 matches

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

### 2026-04-20 — /api/reports rate-limited (T-022)
- Files: `web/src/app/api/reports/route.js:7,16-26`
- Change: 10/hr per user + Retry-After header on 429. Closes the auth'd-user comment-auto-hide flood vector (reports at threshold auto-hide a comment; an attacker could flood-trigger this).
- Verify: tsc pass

### 2026-04-20 — /api/expert/apply rate-limited + error sanitized (T-023)
- Files: `web/src/app/api/expert/apply/route.js:6,17-30,53-56`
- Change: 5/hr per user + Retry-After. RPC error now `console.error`'d server-side and returns generic client copy ("Could not submit application").
- Verify: tsc pass

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

### 2026-04-20 — /api/auth/resend-verification stopped leaking IP (T-026)
- Files: `web/src/app/api/auth/resend-verification/route.js:6,18-23,33`
- Change: response body no longer carries caller `ip` (was a debug leftover). Unused `getClientIp` import dropped. 429 now emits `Retry-After: 3600`. `auth.resend` error logged server-side with `[resend-verify]` tag, generic copy returned to client.
- Verify: tsc pass; grep `{ ok: true, ip }` → 0 matches

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

### 2026-04-20 — rate_limits DB-backed, all 27 API call-sites pass a policyKey (T-003)
- Files: `web/src/lib/rateLimit.js` (new `getRateLimit(policyKey, fallback)` + policyKey arg on `checkRateLimit`); 27 route files under `web/src/app/api/**` (31 calls total); `schema/101_seed_rate_limits.sql` (new, 31 seed rows, idempotent via ON CONFLICT).
- Change: every `checkRateLimit` call now names a stable policy key. DB row overrides code default; missing row / lookup error falls through to the fallback (the seed SQL is non-gating). 60s in-memory cache per process. `is_active=false` disables the limit. `admin/system` edits propagate within one cache window.
- Verify: `tsc --noEmit` exit 0; `grep 'policyKey:' web/src/app/api` = 31; `grep 'checkRateLimit(' web/src/app/api` = 31 (1:1). Owner still needs to run `schema/101_seed_rate_limits.sql` for the `rate_limits` table to be populated — until then, code defaults apply.

### 2026-04-20 — Admin direct-writes class closed — 16 pages now route through /api/admin (T-005)
- Files: `web/src/lib/adminMutation.ts` (new shared helper), 16 new `/api/admin/**/route.ts` files, 13 migrated pages under `web/src/app/admin/**/page.tsx` (categories, email-templates, feeds, words, features, system, notifications, users, subscriptions, stories, promo, story-manager, kids-story-manager) plus 3 settings-upsert stragglers (streaks, comments, reader).
- Change: every `supabase.from(X).{insert,update,upsert,delete}` call in `web/src/app/admin` removed. Routes follow the canonical shape: `requirePermission` → service client → (optional) `requireAdminOutranks` on user-targeted rows → mutation → `recordAdminAction` audit via the SECURITY DEFINER RPC on the cookie-scoped authed client. New unified `/api/admin/articles/save` route owns the 5-step cascade (article upsert → timelines → sources → quizzes → kids_summary) for story-manager + kids-story-manager.
- Session: T-005(a)–(f) commit series on `main`.
- Verify: `tsc --noEmit` exit 0; `grep "supabase\.from\([^)]*\)\.(insert|update|upsert|delete)" web/src/app/admin` = 0 matches; reviewer agent APPROVE after (f) landed rank guards on achievements/sessions/mark-read/mark-quiz and moved notifications/broadcast off the article-bound `admin.broadcasts.breaking.send` key. Follow-ups: seed dedicated `admin.notifications.broadcast` and `admin.features.edit` keys; wire audit-failure to Sentry; upgrade legacy `.js` admin routes (ban, manual-sync) to use the helper + generic error envelope.

### 2026-04-20 — Unified score tiers — DB-live helper, zero hardcoded mapping (T-001)
- Files: `web/src/lib/scoreTiers.ts` (new), `web/src/app/admin/users/page.tsx:53-65,140,183-186,511-513,762-773,803`, `web/src/app/profile/page.tsx:36,55-63,159-161,207-210,403-405,426-428,457-461,526-535,569,590-592,634-642,789-,820-,824-825,1206-1229,1244-1255`
- Change: prior code carried TWO hardcoded tier tables with different keys and thresholds than the DB (`contributor/trusted/distinguished` at 500/2000/5000 vs DB's `informed/analyst/scholar` at 300/600/1000). A user at score=300 was "contributor" in UI but "informed" in DB. Built `scoreTiers.ts` helper (60s cache) exporting `getScoreTiers()`, `tierFor(score, tiers)`, `nextTier(current, tiers)`, `ScoreTier` type. Deleted `TIER_META`, `TIERS`, local `tierFor` bodies, and `nextTierKey` across both pages. Progress-bar math rewritten to use `nextTier().min_score` as the upper bound instead of the hardcoded `next` field. All tier UI (chip color, label, progress ring, "progress to X" copy, "N points to Y") now sources from the live `score_tiers` table.
- Verify: tsc --noEmit exit 0; grep `TIER_META|TierKey|nextTierKey|TIERS\[` across both files returns 0 matches.

### 2026-04-20 — Admin achievement-award dropdown now DB-live (T-002)
- Files: `web/src/app/admin/users/page.tsx:83-86,144-148,173-184,680-682,755-762,897-913`
- Change: removed hardcoded 8-label `ACHIEVEMENTS` const (none overlapped the 26 live DB rows; awarding silently failed). Added `achievementsList` state loaded from `achievements` table (ordered by `name`, `is_active=true`) in the same `init()` effect; dropdown options, initial value, and disabled-guards all feed from the live list. Handler's `name → id` lookup path unchanged (still correct); now always resolves because dropdown labels are real `achievements.name` values.
- Verify: tsc pass; dropdown renders live names instead of stubs

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

### 2026-04-20 — CORS ALLOWED_ORIGINS now covers www variant (T-027)
- Files: `web/src/middleware.js:91-97`
- Change: added explicit `https://www.veritypost.com` + apex `https://veritypost.com` alongside `PROD_ORIGIN`. Closes drift with `api/account/delete/route.js:25-32` which already listed both. `Set` dedupes when `PROD_ORIGIN` matches one of the two explicits.
- Verify: tsc pass

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
