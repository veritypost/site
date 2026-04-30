# Site Bug-Sweep — System Map

**Written:** 2026-04-30 (session 0)
**Amend, don't rewrite.** Add new findings as dated notes at the end of each section. Only the cross-cutting "known fragilities" lists and open-question lists get appended to.

This is the reference document every investigation session reads before spawning agents. Be specific — file paths, not just descriptions.

---

## Slice 01: Auth & account gates

### Page routes
- `web/src/app/login/` — primary login page
- `web/src/app/signup/` — new account creation
- `web/src/app/forgot-password/` — password reset request
- `web/src/app/reset-password/` — password reset link handler
- `web/src/app/verify-email/` — email verification flow
- `web/src/app/welcome/` — coming-soon holding page and post-signup landing
- `web/src/app/beta-locked/` — closed-beta gate rejection page
- `web/src/app/request-access/` — beta waitlist signup
- `web/src/app/preview/` — sets `vp_preview=ok` bypass cookie
- `web/src/app/logout/` — session teardown

### API routes
- `web/src/app/api/auth/` — auth callbacks, PKCE exchange
- `web/src/app/api/access-request/` — waitlist/beta request submission
- `web/src/app/api/access-redeem/` — invite code redemption

### Key components / utilities
- `web/src/middleware.js` — PROTECTED_PREFIXES, beta gate, kid-reject, coming-soon mode, /kids redirect
- `web/src/lib/auth.js` (or similar) — `requireAuth()`, permission check wrappers
- `web/src/lib/supabase/` — server/client wrappers

### Supabase tables
- `auth.users` — Supabase auth
- `users` — app-level user row (created on signup)
- `access_requests` — waitlist / beta signups
- `user_permissions` (or via permission sets) — effective permission keys

### Permission checks
- Middleware: `PROTECTED_PREFIXES` redirect, beta gate (`NEXT_PUBLIC_BETA_GATE=1`), kid-reject (checks `app_metadata.is_kid_delegated` + `kid_profile_id`), coming-soon mode (`NEXT_PUBLIC_SITE_MODE=coming_soon`)
- Post-login: admin layout does its own role check (admin tree not in PROTECTED_PREFIXES, returns 404 for non-staff)
- `/notifications` and `/leaderboard` are intentionally not gated — they render anon CTAs in-place (comment in middleware L9-13)

### Known fragilities
- PKCE cross-device fix shipped (auth redesign, Convo 1). Verify the callback route handles the `code` exchange correctly and the `?next=` bounce-back fires after sign-in.
- Beta gate bypasses: `/browse` is in `betaGateAllowed` — intentional per middleware comment. All `/r/` paths are also allowed (referral links).
- Kid-reject only fires on paths where `needsUser=true`. Public pages skip the user fetch and rely on route handlers to re-check.
- OTP is 8 digits (auth redesign decision). Confirm digit count in the verify-email + login-with-email flows.

---

## Slice 02: Navigation & discovery

### Page routes
- `web/src/app/page.tsx` — home feed (breaking strip + article cards)
- `web/src/app/browse/` — browse by category / trending / featured
- `web/src/app/search/` — full-text search
- `web/src/app/leaderboard/` — Most Informed leaderboard
- `web/src/app/category/` — per-category article list (if it exists as a route; otherwise inline on browse)
- `web/src/app/r/` — referral link handler (redirects to signup with code)
- `web/src/app/about/`, `web/src/app/how-it-works/`, `web/src/app/methodology/` — static info pages
- `web/src/app/ideas/` — standalone preview (no DB, no auth; middleware short-circuits)

### API routes
- `web/src/app/api/search/` — full-text search endpoint
- `web/src/app/api/stories/` — story list / feed queries
- `web/src/app/api/ads/` — ad serving
- `web/src/app/api/referrals/` — referral code tracking

### Key components
- `web/src/app/NavWrapper.tsx` — top-level nav shell (recently modified per git status)
- `web/src/app/_HomeBreakingStrip.tsx` — breaking news banner
- `web/src/app/_HomeFooter.tsx` — footer
- `web/src/app/_HomeFirstLoginMoment.tsx` — post-signup onboarding prompt
- `web/src/app/_HomeVisitTimestamp.tsx` — last-visit marker
- `web/src/app/_homeShared.ts` — shared types (`HomeStory`, `SELECT_COLS`) — updated for stories-as-containers

### Supabase tables
- `stories` — containers (slug lives here after article-lifecycle migration)
- `articles` — individual articles (now have `story_id` FK)
- `categories` — category taxonomy
- `breaking_news` / broadcasts — breaking strip data
- `ads` / `ad_placements` — ad inventory

### Permission checks
- Home is public for anon; signed-in users may see additional content
- Leaderboard: intentionally not middleware-gated (renders anon CTA in-place)
- Breaking strip: no gate — public
- Beta gate: `/browse` is explicitly allowed when beta gate is active

### Known fragilities
- `_homeShared.ts` was updated in the article-lifecycle session 9b to join `stories(slug)` instead of reading `articles.slug` directly. Verify all callers in `page.tsx` and `_HomeBreakingStrip.tsx` use `stories?.slug` not `slug`.
- The `/story/` route directory exists under `web/src/app/story/` — unclear if this is a live route or a legacy artifact. Must check before slice 02 investigation.
- Search (`app/search/page.tsx` + `app/api/search/route.js`) was updated to join `stories(slug)`. Verify the `ArticleHit` type and result rendering use the new shape.
- NavWrapper.tsx has uncommitted changes (visible in git status). Read the current state before making any claims.

---

## Slice 03: Article reading

This slice covers everything the reader sees after navigating to a story. It is the primary verification target for the article-lifecycle implementation (sessions 8–10, 2026-04-29).

### Page routes
- `web/src/app/[slug]/` — story page (resolves `stories.slug`; `?a=<article-id>` for deep-link to specific article within story)

### API routes
- `web/src/app/api/events/batch` — event tracking (article_read_start, scroll_depth, article_read_complete)
- `web/src/app/api/quiz/` — quiz start, submit, scoring
- `web/src/app/api/comments/` — comment list, post, realtime
- `web/src/app/api/stories/` — story + article data fetch
- `web/src/app/api/articles/` — individual article data

### Key components
- `web/src/app/[slug]/page.tsx` — story page server component; fetches story + articles + sources + timeline in parallel; increments view count; mounts ArticleTracker + ArticleEngagementZone
- `web/src/components/article/ArticleSurface.tsx` — article body + SourcesSection + TimelineSection
- `web/src/components/article/ArticleTracker.tsx` — IntersectionObserver; fires `article_read_start` / `scroll_depth` / `article_read_complete` via sendBeacon on tab-hide
- `web/src/components/article/SourcesSection.tsx` — sources list
- `web/src/components/article/TimelineSection.tsx` — spine-style timeline rendering
- `web/src/components/article/ArticleEngagementZone.tsx` — mounts ArticleQuiz + CommentThread; locked composer before quiz pass
- `web/src/components/article/ArticleQuiz.tsx` — quiz UI; fixed pool model (no pool exhaustion); answer as option text
- `web/src/components/comment/CommentThread.tsx` — comment list with realtime; expert filter toggle; uses `public_profiles_v` for user data
- `web/src/components/comment/CommentComposer.tsx` — locked state ("Pass the quiz to join the discussion.") when `quizPassed=false`
- `web/src/components/comment/CommentRow.tsx` — expert badge + blur paywall for non-pro

### Supabase tables
- `stories` — slug, `published_at`
- `articles` — body, `story_id`, audience tier
- `sources` — article sources (joined by `article_id`)
- `timelines` — timeline events (now parented by `story_id`, not `article_id`; `type` column: 'event'|'article')
- `quizzes` — questions (soft-deleted via `deleted_at`)
- `quiz_attempts` — one row per answer; `selected_answer` is option text (not index)
- `comments` — per-article; `story_id` FK as convenience; `is_expert_reply` flag
- `article_events` — read events from tracker
- `moderation_actions` — per-comment moderation history

### Permission checks
- `my_permission_keys` RPC (NOT `compute_effective_perms` — the old broken name) via `web/src/lib/permissions.js`
- `article.view.body` / `article.view.sources` / `article.view.timeline` — all granted to all users (including anon) via `user` role → `anon` set
- Quiz composer lock: `user_passed_article_quiz` RPC (takes `article_id` UUID)
- Expert comment blur: pro-only paywall via billing guard

### Known fragilities (from article-lifecycle post-program review)
1. **ArticleTracker sentinels use `vh` units** (`${pct}vh` from `document.body`), not article-relative depth. Scroll depth milestones fire at wrong points for short/long articles. `web/src/components/article/ArticleTracker.tsx:41`.
2. **`score-comments` cron uses old Haiku model string** (`'claude-haiku-4-5-20251001'` at `web/src/app/api/cron/score-comments/route.ts:60`).
3. **`quiz-regenerate` rejects on any verification disagreement** instead of applying the fix. `web/src/app/api/admin/pipeline/quiz-regenerate/route.ts:249–256`.
4. **T300 realtime fix** — confirmed live per session 9, but both `CommentThread.tsx:260–310` and `StoryDetailView.swift:2568,2599` had embedding `users!user_id(...)` which 403s for non-admins. Verify the fix used `public_profiles_v` for all realtime paths, not just initial loads.
5. Story page uses `?a=<article-id>` for article deep-linking. Verify the page correctly handles the query param and defaults to the most recent article when absent.

---

## Slice 04: Reader engagement & social

### Page routes
- `web/src/app/bookmarks/` — saved articles
- `web/src/app/following/` — following feed (articles from followed topics/users)
- `web/src/app/notifications/` — notification list (anon renders CTA in-place; not middleware-gated)
- `web/src/app/u/[username]/` — public user profile
- `web/src/app/leaderboard/` — Most Informed leaderboard (shared with nav/discovery)
- `web/src/app/expert-queue/` — expert pending assignments
- `web/src/app/recap/` — weekly quiz recap

### API routes
- `web/src/app/api/bookmarks/` — create, delete, list; `[id]` and `export` sub-routes
- `web/src/app/api/follows/` — follow/unfollow
- `web/src/app/api/notifications/` — list + `[id]` mark-read + `preferences/` toggle
- `web/src/app/api/users/[id]/` — user data; `blocked/` sub-route
- `web/src/app/api/expert/` — expert queue management
- `web/src/app/api/expert-sessions/` — expert session assignment
- `web/src/app/api/recap/` — weekly recap data

### Key components
- `web/src/app/bookmarks/page.tsx`
- `web/src/app/following/page.tsx`
- `web/src/app/notifications/page.tsx`
- `web/src/app/u/[username]/page.tsx` — public profile (read-only view of another user)
- `web/src/app/leaderboard/page.tsx`
- `web/src/app/expert-queue/page.tsx`
- `web/src/app/recap/page.tsx`
- `web/src/components/profile/NotificationsCard.tsx` — notification prefs (fixed in profile-bugfix N-01; verify load now shows real values)

### Supabase tables
- `bookmarks` — `user_id`, `article_id`
- `bookmark_collections` — grouping (if used)
- `follows` — `follower_id` (FK hint: `fk_follows_follower_id`), `followed_id`
- `notifications` — `user_id`, `alert_type`, read state
- `alert_preferences` — per-user notification toggle rows
- `public_profiles_v` — view over `users`; safe for non-admin reads
- `user_achievements` — milestone badges
- `quiz_streaks` — per-user streak data
- `expert_sessions` — expert assignment queue

### Permission checks
- Bookmarks, following, expert-queue, recap: middleware-gated (in `PROTECTED_PREFIXES`)
- Notifications: NOT middleware-gated — page renders anon CTA in-place
- Public profiles (`/u/[username]`): publicly accessible; must not leak private data
- Expert queue: additional permission check for `expert` role

### Known fragilities
- `NotificationsCard` was fixed (N-01, `09fdb4f`) to aggregate `preferences` array. Verify the GET route now returns the correct shape and the load correctly reflects saved values.
- `/following` page — what is the query shape? Depends on whether following is topic-based, user-based, or both. System map does not have full detail — investigation agents must read the component.
- `BookmarksSection` null slug (P-08, `a548c9a`) was fixed in profile. Check the standalone `/bookmarks` page for the same `b.articles?.stories?.slug` pattern post-stories migration.

---

## Slice 05: Messaging

### Page routes
- `web/src/app/messages/` — conversation list + message thread view

### API routes
- `web/src/app/api/messages/` — send message; `route.js` + `search/`
- `web/src/app/api/conversations/` — conversation list and management

### Key components
- `web/src/app/messages/page.tsx`
- Message thread component (name unknown until investigation)
- Conversation list component (name unknown until investigation)

### Supabase tables
- `messages` — body, sender, conversation reference
- `conversations` — participant list
- `conversation_participants` (likely) — many-to-many

### Permission checks
- Middleware-gated (`/messages` is in `PROTECTED_PREFIXES`)
- Pro-only DM access: unknown — agents must verify

### Known fragilities
- `MessagesSection.tsx` (in profile) had a silent catch block (P-09, `a548c9a`). The standalone `/messages` page may have the same pattern.
- Realtime subscription for new messages: unknown state — agents must read.

---

## Slice 06: Billing & subscription

### Page routes
- `web/src/app/billing/` — billing management (middleware-gated)
- `web/src/app/pricing/` — pricing page (public)
- `web/src/app/appeal/` — billing appeal / account reinstatement (middleware-gated)

### API routes
- `web/src/app/api/billing/` — billing state fetch; `cancel/`, `change-plan/`, `resubscribe/` sub-routes
- `web/src/app/api/stripe/checkout` — Stripe checkout session creation
- `web/src/app/api/stripe/portal` — Stripe customer portal session
- `web/src/app/api/stripe/webhook` — Stripe webhook handler
- `web/src/app/api/plans/` — plan list
- `web/src/app/api/subscriptions/` — subscription state
- `web/src/app/api/promo/` — promotional code handling

### Key components
- `web/src/app/billing/page.tsx` — billing management page
- `web/src/app/pricing/page.tsx` — pricing display
- `web/src/components/profile/BillingCard.tsx` — billing in profile (fixed B-03 in profile-bugfix — `openPortal` null URL guard)

### Supabase tables
- `user_subscriptions` — plan, status, Stripe IDs
- `plans` — plan definitions
- `stripe_customers` — Stripe customer reference
- `promo_codes` — promotional codes

### Permission checks
- `/billing` and `/appeal` are middleware-gated
- Plan gates throughout: `requirePermission()` + billing guard pattern
- Webhook: Stripe signature verification (security-critical)

### Known fragilities
- `BillingCard.openPortal` null URL guard (B-03) was fixed in profile. Check `/billing/page.tsx` for the same pattern if it has its own portal-open button.
- Stripe webhook: signature verification and idempotency handling — agents must verify.
- Plan downgrade: what happens to features gated on higher plan when user downgrades? Unclear from surface mapping.

---

## Slice 07: Admin surfaces

### Page routes (under `web/src/app/admin/`)
- `newsroom/` — article management hub
- `moderation/` — comment + report moderation
- `users/` — user management
- `reports/` — AI-flagged + reported content (three-tab: user-reports, AI-flagged, history)
- `pipeline/` — article generation pipeline
- `pipeline-config/` — pipeline settings
- `analytics/` — site analytics
- `breaking/` — breaking news dispatch
- `categories/` — category management
- `comments/` — admin comment view
- `settings/` — system settings
- `permissions/` — permission set management
- `plans/` — plan management
- `subscriptions/` — subscription management
- `features/` — feature flag management
- `stories/` + `story-manager/` + `kids-story-manager/` — story tooling
- `expert-sessions/` — expert session management
- `cohorts/` — user cohort management
- `feeds/` — feed configuration
- `notifications/` — push notification management
- `recap/` — recap management
- `sponsors/` + `ad-campaigns/` + `ad-placements/` — ad management
- `referrals/` + `promo/` — referral and promo management
- `access/` + `access-requests/` — invite/waitlist management
- `verification/` — expert verification queue
- `words/` — editorial word list
- `prompt-presets/` — LLM prompt preset management
- `support/` + `data-requests/` + `appeals/` + `auth-recovery/` — support tooling
- `streaks/` — streak management
- `top-stories/` — editorial curation
- `reader/` — reader analytics
- `system/` — system health / kill switches
- `webhooks/` — webhook management
- `kids-dob-corrections/` — kids DOB correction workflow

### API routes (under `web/src/app/api/admin/`)
All admin mutations go through routes under `/api/admin/`. Key ones:
- `articles/` — article CRUD, status transitions
- `newsroom/` — newsroom feed
- `pipeline/` — generation pipeline triggers
- `users/[id]/` — user management + mark-quiz, mark-read
- `moderation/` — comment moderation (hide/unhide/remove)
- `notifications/` — admin push
- `categories/` — category CRUD
- `settings/` — system settings CRUD
- `permission-sets/` + `permissions/` — permission management
- `billing/` — billing admin
- `feeds/` — feed config
- `sponsors/` + `ad-campaigns/` + `ad-placements/` + `ad-units/` — ad management
- `referrals/` + `promo/` — referral + promo admin
- `access-requests/` + `appeals/` + `data-requests/` + `auth-recovery/` + `kids-dob-corrections/` — support admin
- `expert/` + `words/` + `recap/` + `email-templates/` + `prompt-presets/` + `rate-limits/` + `subscriptions/` + `plans/` + `broadcasts/` — operational tooling

### Key components
- `web/src/app/admin/layout.tsx` — auth + role check (returns 404 for anon / non-staff; `admin` route NOT in middleware PROTECTED_PREFIXES)
- `web/src/app/admin/page.tsx` — admin dashboard
- `web/src/app/admin/reports/page.tsx` — three-tab moderation (user reports, AI-flagged, history) — updated in article-lifecycle session 8

### Supabase tables
All tables via service client (`createServiceClient()`). Admin routes bypass RLS.

### Permission checks
- `admin/layout.tsx` owns auth + role verification for all admin sub-routes
- Individual routes check granular permission keys (e.g. `admin.pipeline.run_generate`, `admin.users.manage`)
- Service client: bypasses RLS — security-critical to verify routes check permission before executing

### Known fragilities
- `quiz-regenerate` endpoint (`/api/admin/pipeline/quiz-regenerate/route.ts:249–256`) rejects on any verification disagreement instead of applying fixes (article-lifecycle known gap #5).
- Admin reports page was rewritten in article-lifecycle session 8 — AI-flagged tab uses `moderation_actions` rows with `action='ai_flagged'`. Verify the tab query and the per-comment moderation history UI are correct.
- `v2_live` kill switch has no admin UI (flagged in article-lifecycle INDEX.md as program-level deferred item). Owner can only toggle it DB-direct. Track here as a known gap.

---

## Slice 08: API routes cross-cut

### Routes
- `web/src/app/api/cron/score-comments/route.ts` — AI comment scoring (Haiku); runs every 15 min; writes `moderation_actions` on flagged comments
- `web/src/app/api/cron/send-push/` — push notification dispatch
- `web/src/app/api/cron/pipeline-cleanup/` — expired cluster cleanup
- `web/src/app/api/cron/check-user-achievements/` — achievement computation
- `web/src/app/api/cron/sweep-beta/`, `sweep-kid-trials/`, `sweep-trial-expiry/` — subscription state sweeps
- `web/src/app/api/cron/subscription-reconcile-stripe/` — Stripe reconciliation
- `web/src/app/api/cron/send-emails/` — transactional email dispatch
- `web/src/app/api/cron/process-deletions/`, `cleanup-data-exports/`, `process-data-exports/` — data lifecycle
- `web/src/app/api/cron/purge-audit-log/`, `purge-webhook-log/`, `rate-limit-cleanup/` — log hygiene
- `web/src/app/api/cron/freeze-grace/`, `dob-correction-cooldown/`, `flag-expert-reverifications/`, `recompute-family-achievements/`, `anonymize-audit-log-pii/`, `birthday-band-check/` — lifecycle operations
- `web/src/app/api/events/batch` — client-side event ingestion (article tracking)
- `web/src/app/api/csp-report/` — CSP violation reports (rate-limited, 30/min per instance — fixed in profile-bugfix C-02)
- `web/src/app/api/health/` — health check
- `web/src/app/api/errors/` — client error collection
- `web/src/app/api/push/` — push token registration / management
- `web/src/app/api/ios/` — iOS-specific API surface
- `web/src/app/api/kids/` — kids iOS API surface

### Supabase tables
Varies per cron job. Key ones:
- `comments` + `moderation_actions` — score-comments cron
- `notifications` — push dispatch
- `article_clusters` — pipeline cleanup
- `user_achievements` + `family_achievements` — achievement crons
- `user_subscriptions` — subscription sweep crons
- `audit_log` + `webhook_log` — purge crons
- `data_export_requests` — data lifecycle crons

### Permission checks
- Cron jobs: protected by `CRON_SECRET` environment variable (Vercel cron auth)
- `/api/events/batch`: authenticated or anon? Agents must verify
- `/api/csp-report`: public (no auth); rate-limited at 30/min
- `/api/health`: public (no auth)
- `/api/ios/*` + `/api/kids/*`: protected by iOS app auth; kid routes require kid JWT

### Known fragilities
- **score-comments cron uses old Haiku model string** `'claude-haiku-4-5-20251001'` at `route.ts:60` (article-lifecycle known gap #1). One-line fix.
- Vercel cron schedule is in `vercel.json`. score-comments runs every 15 min (`*/15 * * * *`). Verify all cron routes match their intended schedule.
- `/api/events/batch` is the ingestion endpoint for `ArticleTracker`. If it has an auth requirement that's incompatible with `sendBeacon` (which can't set auth headers on page-hide), events will silently drop.

---

## Cross-cutting architecture notes

### Supabase client patterns
- `createServiceClient()` — bypasses RLS; used in admin routes and server-side fetches that need elevated access
- `createServerClient()` — uses session cookie; subject to RLS; used in user-facing server components and API routes
- `createBrowserClient()` — client-side; used in realtime subscriptions and client components

### Permission system
- `my_permission_keys` RPC — returns effective permission keys for the current session (NOT `compute_effective_perms`, which was a dead function name; fixed in article-lifecycle)
- `requirePermission(key)` — server-side check in API routes; throws 403 if missing
- `requireAuth()` — presence check; throws 401 if not authenticated
- Permission sets: managed in admin UI; granted via roles

### Kill switches
- `v2_live` — global kill switch; no admin UI (DB-direct only); affects all slices
- Individual feature kill switches exist (see admin/features route)

### Slug resolution (post article-lifecycle)
After the stories-as-containers migration (session 9b, 2026-04-29):
- Slugs live on the `stories` table, not `articles`
- `/[slug]/page.tsx` resolves `stories.slug`
- All article-related queries join `stories(slug)` to get the slug
- `articles.slug` column no longer exists
- Any query that still references `articles.slug` directly is broken
