# Zone Z13: web/src/app/ (pages, no api, no admin)

## Summary

Read every file in `web/src/app/` outside the `api/` and `admin/` subtrees — 95 files total. Zone covers the full reader/profile/auth/billing-redirect surface plus marketing, legal, and developer-preview pages. Major load-bearing files: `layout.js` (fonts, Permissions/Toast providers, GA4, AdSense loader, JSON-LD, skip-link), `NavWrapper.tsx` (auth context + chrome gates + admin banner), `page.tsx` (curated home feed via `articles.hero_pick_for_date`), `story/[slug]/page.tsx` (~1750-line article reader with quiz gate, regwall, bookmarks, reports, anon interstitial, reading-progress ribbon), and `profile/settings/page.tsx` (5247-line unified settings with 16 cards). Permission migration is largely complete — every section reads through `hasPermission(...)` and refreshes via `refreshAllPermissions()`/`refreshIfStale()`. Significant chrome of `.js` legacy files remains (28 of 95): mostly redirect shims, layouts/error/loading boundaries, `manifest.js`, `sitemap.js`, `robots.js`. Three legacy profile sub-pages (`activity`, `card`, `category/[id]`, `contact`, `milestones`) still ship as full `.js` files. All 12 `profile/settings/*` sub-pages exist as one-line redirect shims to anchors on the unified page (one — `expert/page.tsx` — is a fully-implemented standalone form, drift). Two surfaces are kill-switched: `/profile/[id]` (UnderConstruction) and `/u/[username]` (PUBLIC_PROFILE_ENABLED=false). Two surfaces are launch-hidden via early-return: `/recap`, `/recap/[id]`. Anon registration-wall + signup interstitial on `/story/[slug]` is also launch-hidden. Coming-soon mode logic lives in `/welcome` (`HoldingCard` early-return when `NEXT_PUBLIC_SITE_MODE=coming_soon`). `/preview` route owns the cookie-bypass for that holding mode. **No FALLBACK_CATEGORIES hardcode remains in `page.tsx`** (CLAUDE.md tracker entry is stale — current home reads `categories` from DB; only visual `CAT_STYLE` palette in `/browse` is hardcoded, which is a styling map, not data).

## File index

### Root
- **`layout.js` (.js)** — Root layout. Mounts `PermissionsProvider`, `ToastProvider`, `ObservabilityInit`, `GAListener`, `NavWrapper`, JSON-LD (Organization+WebSite). Self-hosts Inter + Source_Serif_4 via `next/font/google`. Coming-soon-mode metadata (title/desc reduced to domain, robots `max-snippet:0`, `max-image-preview:none`, OG/Twitter stripped). GA4 ID falls back to `G-NE37VG1FP6` literal. AdSense pubID hardcoded `ca-pub-3486969662269929` in `other` meta + env-gated loader. Skip-link to `#main-content`. apple-web-app meta. Lib helpers: `getSiteUrl`. No DB, no perm gate.
- **`NavWrapper.tsx`** — Auth context provider (loggedIn/user/userTier/tenureDays). Reads `users` row + joined `plans.tier`, hydrates permissions, sets `canSeeAdmin` (`admin.dashboard.view`) and `canSearch` (`search.basic`). Notifications poll every 60s via `/api/notifications?unread=1&limit=1`. Top bar + bottom nav + footer + admin banner gated by `AUTH_HIDE` list, `isAdmin`, `isIdeasPreview`, `isStory`, and home-anon rule. Hard-coded launch gates `SHOW_TOP_BAR=true`, `SHOW_BOTTOM_NAV=true`, `SHOW_FOOTER=true`. Footer link to `/help` commented out (Apple Store URL, kept reachable directly).
- **`page.tsx`** — Curated home feed (today's hero + 7 supporting). Reads `articles` filtered to today (ETZ-aware) + breaking + active categories. Gate keys: `home.breaking_banner.view`, `home.breaking_banner.view.paid`. `EDITORIAL_TZ='America/New_York'` constant. Lib: `createClient`, `usePageViewTrack`, `hasPermission`, `refreshAllPermissions`, `refreshIfStale`. Loaders distinguish loading vs FetchFailed vs EmptyDay. **No FALLBACK_CATEGORIES hardcode** present — that tracker entry appears stale.
- **`error.js` (.js)** — Route error boundary. Classifies network/server/unknown, POSTs to `/api/errors`, shows Try again / Home / Contact support.
- **`global-error.js` (.js)** — Root error fallback (renders own `<html>`/`<body>`). POSTs to `/api/errors`, fallback email `admin@veritypost.com`.
- **`not-found.js` (.js)** — Custom 404 with anon-safe Today's Front Page / Browse categories CTAs.
- **`globals.css`** — Reduced-motion baseline, light palette CSS vars (`--bg`, `--card`, `--border`, `--text-primary`, `--accent`, `--danger #b91c1c`, `--breaking`), AA-tightened `--dim` `#5a5a5a`.
- **`manifest.js` (.js)** — Web App Manifest. `name/short_name='veritypost.com'`, icons array empty (PNGs not yet dropped into `web/public/`). Coming-soon-friendly.
- **`robots.js` (.js)** — robots.txt. Disallows `/admin`, `/api/`, `/bookmarks`, `/forgot-password`, `/logout`, `/messages`, `/notifications`, `/preview`, `/profile/settings`, `/reset-password`, `/verify-email`, `/welcome`. Sitemap link via `getSiteUrl()`.
- **`sitemap.js` (.js)** — Chunked sitemap (5K rows/chunk) via `generateSitemaps()`. Coming-soon mode emits root URL only. Static chunk lists `/`, `/browse`, `/contact`, `/privacy`, `/terms`, `/cookies`, `/dmca`, `/accessibility` + categories. Article chunks reverse-chronological by `published_at`. Filters `slug LIKE 'kids-%'` out.
- **`preview/route.ts`** — `GET /preview?token=...` validates against `PREVIEW_BYPASS_TOKEN`, sets 30-day `vp_preview=ok` cookie, redirects to `/`. On bad token → `/welcome`.

### Auth/onboarding
- **`/login` `page.tsx`** — Email-or-username sign-in. Calls `/api/auth/resolve-username` for username path, `/api/auth/login-precheck` for lockout guard, `/api/auth/login-failed` to record failed attempts (now sends password so server can verify failure is genuine, F-012), then GoTrue `signInWithPassword`, then `/api/auth/login` for server bookkeeping. OAuth: Apple + Google, both surface OAuth error if provider unconfigured. Post-login routes to `/welcome` if `email_verified && !onboarding_completed_at`, else respects `?next=` (validated via `resolveNext`). Toast inbound from reset-password (`reset_invalid`, `password_updated`). Suspense-wrapped for `useSearchParams`. Lib: `resolveNext`, `usePageViewTrack`. Lang: TS.
- **`/login/layout.js` (.js)** — Metadata only.
- **`/signup` `page.tsx`** — Email signup with debounced `/api/auth/check-email` availability probe, password strength via `lib/password`. POSTs to `/api/auth/signup` (single combined ageConfirmed+agreedToTerms), then routes to `/verify-email` or `/signup/pick-username` with `?next=` preserved. OAuth Apple/Google + auth-state listener forwards to pick-username. Defensive `signInWithOAuth` error surface. Tracks `signup_complete`. Lib: `passwordStrength`, `PASSWORD_REQS`. Lang: TS.
- **`/signup/layout.js` (.js)** — Metadata only.
- **`/signup/pick-username/page.tsx`** — 3-letter min, 20-char max, `[a-z0-9_]+` only. Debounced 300ms availability check (`users` + `reserved_usernames`), 3 suggestions seeded from email/displayName, `update_own_profile` RPC write. Skip falls through to `reader_<hex>` auto-handle (5 retries on collision). `?next=` forwarded to `/welcome`. Existing username short-circuits straight to `/welcome`. Lang: TS.
- **`/signup/expert/page.tsx`** — Expert/educator/journalist application. Q8: detects auth and skips step-1; pre-fills `email`/`fullName`. Step 2 collects expertise areas, role, credentials text, portfolio, professional email, LinkedIn, 3 sample responses, terms checkbox. POST `/api/expert/apply`. Hardcoded `EXPERTISE_FIELDS` array. Lang: TS.
- **`/forgot-password/page.tsx`** — Reset-link request. POSTs `/api/auth/reset-password` with redirectTo origin/reset-password. Always-success path (UJ-515) prevents email enumeration. 30s resend cooldown. `maskEmail` helper. Lang: TS.
- **`/reset-password/page.tsx`** — Recovery-token completion. Verifies hash contains `type=recovery` or active session; otherwise renders Link Expired. Calls `auth.updateUser({password})` then `auth.signOut({scope:'others'})`. Auto-redirect to `/` after 1.8s on success. Password reqs from `lib/password`. Lang: TS.
- **`/verify-email/page.tsx`** — 5 status states (loading/waiting/success/expired/rate_limited). Reads `users.email_verified` (canonical, not `auth.users.email_confirmed_at`). Resend via `/api/auth/resend-verification` with 60s cooldown + dedicated `rate_limited` view (H1 — separate from `expired` to break retry loop). Email-change form posts `/api/auth/email-change`. Anon URL-poke shows Sign in / Create account fork instead of stranded resend button. Continue routes to `/signup/pick-username` (if usernameMissing) or `/welcome`, `?next=` preserved. Lang: TS.
- **`/welcome/page.tsx`** — Coming-soon `HoldingCard` early-return when `NEXT_PUBLIC_SITE_MODE=coming_soon`. Otherwise 3-screen onboarding carousel. Reads `users.onboarding_completed_at`, redirects to `/login`/`/verify-email`/`/signup/pick-username` if missing prereqs. POSTs `/api/account/onboarding`. Tracks `page_view content_type:welcome` + `onboarding_complete`. Heavy launch-hide via `eslint-disable react-hooks/rules-of-hooks` comments. Lang: TS.
- **`/logout/page.js` (.js)** — POSTs `/api/auth/logout`, falls back to client `auth.signOut({scope:'local'})`. Reads localStorage `vp_recent_reads` for "Your recent reads" panel. Status: signing_out / done / error with retry. Lang: JS.

### Reader / story
- **`/story/[slug]/page.tsx`** — Article reader (1750+ lines). Permissions: `article.bookmark.add`, `article.listen_tts`, `article.view.body`, `article.view.sources`, `article.view.timeline`, `article.view.ad_free`. Anon flow: regwall on Nth open (`free_article_limit` setting), 2nd-article signup interstitial (LAUNCH_HIDE_ANON_INTERSTITIAL=true, dead-launch-hide). Uses `bumpArticleViewCount` from `lib/session`. Quiz gate via `user_passed_article_quiz` RPC; comment thread mounts only when passed (D6). Bookmarks via `/api/bookmarks` (POST/DELETE `/[id]`), cap from `getPlanLimitValue(supabase, planId, 'bookmarks', 10)` (T-016 DB-driven). Reports POST `/api/reports`. TTS via `<TTSButton>`. Sources rendered as cards (replaces single-row pills). Reading-progress ribbon via scroll listener. Read-complete signal: 30s dwell with `visibilityState` gate OR scroll>=80%. JSON-LD (NewsArticle). Storage event listener clears regwall dismissed flag on cross-tab auth. Focus-trap on regwall + report modal. Anon click on Save → `/signup?next=...`. **Mobile tab bar + Timeline (mobile + desktop) wrapped in `false &&` launch-hide**. Type cast `as never` for migration-142 RPC. Lang: TS.
- **`/story/[slug]/layout.js` (.js)** — `generateMetadata` reads article + builds OG/Twitter from `cover_image_url` or `/opengraph-image` route.
- **`/story/[slug]/loading.js` (.js)** — Plain "Loading article..." stub.
- **`/story/[slug]/error.js` (.js)** — POSTs to `/api/errors` with `boundary:'story'`, Try-again button.
- **`/story/[slug]/opengraph-image.js` (.js)** — Dark 1200×630 fallback OG (title + excerpt + brand plate). Server-rendered.
- **`/recap/page.tsx`** — Weekly recap list. **Hard-coded `LAUNCH_HIDE_RECAP = true` returns `null`**. Reads `recap.list.view`. GETs `/api/recap`. 9× `eslint-disable react-hooks/rules-of-hooks` for launch-hide pattern. Lang: TS.
- **`/recap/[id]/page.tsx`** — Recap player (5-question quiz with explanations + missed-articles surface). **`LAUNCH_HIDE_RECAP = true` returns `null`**. POSTs `/api/recap/[id]/submit`. Lang: TS.

### Browse / category / search
- **`/browse/page.tsx`** — Public category directory. Reads `categories` (filters `slug NOT LIKE 'kids-%'`), `articles` (last 500 published). Hardcoded **`CAT_STYLE` map** keyed by slug (visual icon/color/accent for politics/technology/science/health/world/business/entertainment/sports/environment/education) + `DEFAULT_STYLE` fallback + `FEATURED_COLORS` cycle. RLS handles anon access — no `hasPermission`. Lib: `usePageViewTrack`. Tracks page_view. Featured tile section renamed from "Trending Now" → "Latest" because data was not actually trending. Lang: TS.
- **`/browse/loading.js` (.js)** — Plain stub.
- **`/category/[id]/page.js` (.js)** — Category detail. Tries `eq('id')` first, falls back to `eq('slug')`. Filters `kids-*` slug → category not found. SORT_OPTIONS = `Latest|Trending`. Lib: bookmarks via `/api/bookmarks`. Lang: JS.
- **`/category/[id]/layout.js` (.js)** — Static metadata.
- **`/search/page.tsx`** — Permission-gated. `search.view`/`search.basic`/`search.articles.free` for page; `search.advanced`, `search.advanced.category`, `search.advanced.date_range`, `search.advanced.source` for filter panel. POSTs `/api/search?...`. Free tier sees collapsed advanced panel with upgrade nudge. Tracks `page_view`. Lang: TS.

### Profile + sub-pages
- **`/profile/page.tsx`** — Tabbed unified profile (overview/activity/categories/milestones). URL-synced `?tab=`. Suspense-wrapped. Reads users row + score_tiers via `lib/scoreTiers`. Permissions: `profile.header_stats`, `profile.activity`, `profile.categories`, `profile.achievements`, `profile.card_share`, `messages.inbox.view`, `bookmarks.list.view`, `settings.family.view`. Reads category drilldown via paginated lazy fetch. Lib: `Avatar`, admin component kit (`Page`, `Button`, `Badge`, `StatCard`, etc.). On `SIGNED_OUT` reroutes; on `TOKEN_REFRESHED` reloads. Lang: TS.
- **`/profile/layout.js` (.js)** — Static metadata.
- **`/profile/loading.js` (.js)** — Plain stub.
- **`/profile/error.js` (.js)** — Try-again error boundary.
- **`/profile/[id]/page.tsx`** — **Kill-switched** (`UnderConstruction surface="public profile"`). Original was a redirect-to-`/u/[username]` shim. Lang: TS.
- **`/profile/activity/page.js` (.js)** — Server redirect → `/profile?tab=activity`.
- **`/profile/card/page.js` (.js)** — Permission-gated `profile.card_share` shareable-card redirect to `/card/<username>`. Three states (locked/no_username/redirect). Lang: JS.
- **`/profile/category/[id]/page.js` (.js)** — Subcategory drill via `get_user_category_metrics` RPC. Hardcoded `SUB_THRESHOLDS = {reads:25, quizzes:15, comments:10, upvotes:25}`. Lang: JS.
- **`/profile/contact/page.js` (.js)** — Authed contact form. POSTs `/api/support`. Hardcoded `TOPICS` array (11 entries: account/billing/bug/content/feature/kids/expert/feedback/accessibility/appeal/other). **Duplicates `/contact/page.tsx`** (anon variant). Lang: JS.
- **`/profile/milestones/page.js` (.js)** — Server redirect → `/profile?tab=milestones`.
- **`/profile/family/page.tsx`** — Family dashboard (most-informed, weekly report, shared achievements). Permissions: `family.view_leaderboard`, `family.shared_achievements` OR `kids.achievements.view`, `kids.parent.weekly_report.view`. POSTs to `/api/family/leaderboard`, `/api/family/achievements`, `/api/family/weekly-report`. Lang: TS.
- **`/profile/kids/page.tsx`** — Parent kid management. Permissions: `kids.parent.view`, `family.add_kid`, `family.remove_kid`, `kids.trial.start`, `kids.parent.household_kpis`. Trial state (active/expired/used). KPI row (articles/minutes/quizzes/longest_streak) via `/api/kids/household-kpis`. CreateKidForm with COPPA consent (parent_name + ack + version), `isUnder13` validation, PIN with `isPinWeak` from `lib/kidPinValidation`. PATCH `/api/kids/[id]` for pause; DELETE for remove. POST `/api/kids/trial` vs `/api/kids` for trial vs full. Lang: TS.
- **`/profile/kids/[id]/page.tsx`** — Kid dashboard. Permissions: `kids.parent.view`, `kids.streak.freeze.use`, `kids.parent.global_leaderboard_opt_in`. Reads `quiz_attempts`, `user_achievements`, `reading_log`, `kid_expert_questions`, `kid_expert_sessions`. Timeline merges 4 event kinds. POST `/api/kids/[id]/streak-freeze`. PATCH `/api/kids/[id]` for pause + leaderboard opt-in. Lib: `Badge`, `PairDeviceButton`, `OpenKidsAppButton`. Lang: TS.

### Settings + sub-pages
- **`/profile/settings/page.tsx`** — **5247-line unified settings**. 16 cards: Profile/Emails/Password/LoginActivity/Feed/Alerts/Accessibility/Blocked/DataExport/Supervisor/BillingBundle (Plan+Payment+Invoices+Promo)/ExpertProfile/ExpertVacation/ExpertWatchlist/DeleteAccount/SignOut/SignOutEverywhere. Sidebar nav (sticky desktop / accordion mobile). Search filter via `useDebouncedValue`. Dirty-tracking + beforeunload. Anchor scroll with retry-up-to-5 helper (`H-17 stop-gap`). Stripe success/canceled toasts on mount, then strips query. Massive `PERM` constant block for all keys. **Hardcoded `PERM` map flags 2 spec-only keys (`settings.profile.edit.own`, `settings.expert.edit`) as not present in DB**. **Hardcoded `AVATAR_COLORS` palette of 13 hex values**, **hardcoded `TEXT_SIZES` array**. **`metadata.avatar`, `metadata.notification_prefs`, `metadata.feed`, `metadata.a11y`, `metadata.expertVacation`, `metadata.expertWatchlist` all live in `users.metadata` JSONB** (TODO comments flag promotion to first-class columns). All writes via `update_own_profile` RPC with subtree-delta pattern. C2 fix: send only delta, server merges with `||` so concurrent saves don't clobber. Web push toggle no-op (TODO drop hint when web Push pipeline ships). Bookmark count via `getPlanLimitValue`. Mobile breakpoint at 768px via `useIsMobile`. Email change disabled (`Change` button always disabled — secondary email backend not built). Avatar SVG upload rejected (XSS). `safeCssBackgroundImage` validates https-only for avatar/banner CSS injection (CSP `unsafe-inline` not a backstop, hint at TODO DB CHECK constraints). Plan picker filters DB-visible tiers via `is_active && is_visible`. Subscription source detection (stripe/apple/google) drives portal vs App Store vs Play Store CTA. Lang: TS.
- **`/profile/settings/alerts/page.tsx`** — Redirect → `#alerts`. Lang: TS (but trivial 14-line hash redirect).
- **`/profile/settings/billing/page.tsx`** — Server-side redirect → `/profile/settings#billing`. Preserves `?success=` and `?canceled=` query params. Lang: TS.
- **`/profile/settings/blocked/page.tsx`** — Redirect → `#blocked`.
- **`/profile/settings/data/page.tsx`** — Redirect → `#data`.
- **`/profile/settings/emails/page.tsx`** — Redirect → `#emails`.
- **`/profile/settings/expert/page.tsx`** — **Drift**: full 547-line standalone form, NOT a redirect. Hardcoded `application_type` enum, hardcoded `Twitter/LinkedIn` social fields. POSTs `/api/expert/apply`. Permissions: `settings.expert.view`, `expert.application.apply`. Should likely be deleted in favor of inline Settings ExpertProfileCard + the Settings page's `Start application` CTA → `/signup/expert`. Lang: TS.
- **`/profile/settings/feed/page.tsx`** — Redirect → `#feed`.
- **`/profile/settings/login-activity/page.tsx`** — Redirect → `#login-activity`.
- **`/profile/settings/password/page.tsx`** — Redirect → `#password`.
- **`/profile/settings/profile/page.tsx`** — Redirect → `#profile`.
- **`/profile/settings/supervisor/page.tsx`** — Redirect → `#supervisor`.

### Public profile / card / leaderboard
- **`/u/[username]/page.tsx`** — **Kill-switched** (`PUBLIC_PROFILE_ENABLED=false` → `UnderConstruction surface="public profile"`). Hooks below the kill-switch are dead but preserved (eslint-disable rules-of-hooks). When unhidden: anon visitor CTA (Sign up + Sign in with `?next=` preserved), `profile_visibility='private'` → `notFound()`, banner_url validated http(s) only, tier pill, FollowButton, DM link gated by `messages.dm.compose`, Block (POST/DELETE `/api/users/[id]/block`), Report inline picker. Lang: TS.
- **`/u/[username]/layout.js` (.js)** — `generateMetadata`. `private` users → `noindex,nofollow`. OG image via `/card/<username>/opengraph-image`.
- **`/card/[username]/page.js` (.js)** — Public profile card. No viewer permission check (Q1 — public share surface). `private` profile_visibility short-circuits. `category_scores` top-5 + role badges. Auth-aware "View full profile" link. Lang: JS.
- **`/card/[username]/layout.js` (.js)** — `generateMetadata`. **Always `noindex,nofollow`** for cards (not canonical content). Lang: JS.
- **`/card/[username]/opengraph-image.js` (.js)** — 1200×630 OG. Public, no viewer auth. Brand plate fallback. Lang: JS.
- **`/leaderboard/page.tsx`** — Most Informed. Tabs: Top Verifiers / Top Readers / Rising Stars / Weekly. Permissions: `leaderboard.view`, `leaderboard.category.view`. Period filter via `lib/leaderboardPeriod`. Calls `leaderboard_period_counts` RPC (typecast `as never` pending types regen post-migration 142). Anon: top 3 visible + blurred 4-8 with sign-up CTA. Unverified: same blur with verify-email CTA. `stripKidsTag` helper. `usePageViewTrack`. Lang: TS.
- **`/leaderboard/layout.js` (.js)** — Static metadata.

### Other reader surfaces
- **`/bookmarks/page.tsx`** — Permissions: `bookmarks.unlimited`, `bookmarks.collection.create`, `bookmarks.note.add`, `bookmarks.export`. Cursor pagination (`PAGE_SIZE=50`, `lt('created_at', last.created_at)`). Cap from `getPlanLimitValue` (T-016, fallback 10). Collection chips + per-bookmark collection select. Notes inline editor. Export → `/api/bookmarks/export`. Filter at-cap detected via `!unlimited && items.length >= cap`. Lang: TS.
- **`/bookmarks/layout.js` (.js)** — Static metadata.
- **`/messages/page.tsx`** — Suspense-wrapped. Permissions: `messages.dm.compose`. Account-state lock detection (banned/muted/frozen/grace) bypasses paywall. `?to=<id>` deep-link support (replaces phantom `/messages/new`). 4 realtime channels: messages-in-current, message_receipts INSERT, messages INSERT across all, conversations UPDATE/INSERT. Receipt management via `message_receipts` table. iMessage-style "Read" caption shown only below last own-msg with receipt. Block/Unblock + Report (DM Apple Guideline 1.2 split). H-09 paywall overlay (no auto-redirect; render shell + dialog). `useFocusTrap` on search modal. Lang: TS.
- **`/notifications/page.tsx`** — Permission: `notifications.inbox.view`. R13-T3 anon CTA (no middleware redirect). `[!]` glyph framed avatar. Filter all/unread. Mark-one + mark-all-read via PATCH `/api/notifications`. Preferences link to `/profile/settings#alerts`. Lang: TS.
- **`/expert-queue/page.tsx`** — Permission: `expert.queue.view` + fallback `expert.queue.oversight_all_categories` for moderator+/admin without an expert application. Tabs: pending/claimed/answered/back-channel. POSTs `/api/expert/queue/[id]/claim|decline|answer`, `/api/expert/back-channel`. Lang: TS.
- **`/appeal/page.tsx`** — Reads `user_warnings` + active-penalty check (`is_banned` || muted+!muted_until past). Hardcoded `ACTION_LABEL` map (warn/comment_mute_24h/mute_7d/ban). POSTs `/api/appeals`. Lang: TS.

### Static / legal / marketing
- **`/about/page.tsx`** — Static. Verity Post LLC company info, support emails. TS.
- **`/help/page.tsx`** — Server-rendered. Hardcoded FAQ list + DB-driven plan prices via `lib/plans` `formatCents` (verity_monthly/verity_pro_monthly/verity_family_monthly). Public Support URL for App Store. Lang: TS.
- **`/contact/page.tsx`** — Anon-friendly contact form. POSTs `/api/support/public`. Round D H-11. Hardcoded `TOPICS` array (same as `/profile/contact/page.js`). **Duplicates** `/profile/contact/page.js`. Lang: TS.
- **`/cookies/page.tsx`** — Static legal. Last updated April 1, 2026. TS.
- **`/dmca/page.tsx`** — Static legal. TS.
- **`/privacy/page.tsx`** — Static legal. References Verity Post LLC as data controller. TS.
- **`/terms/page.tsx`** — Static legal. TS.
- **`/accessibility/page.tsx`** — Static legal. WCAG 2.1 AA commitment. TS.
- **`/how-it-works/page.tsx`** — Static. Hardcoded 4-step Read/Quiz/Discuss/Earn array with hex colors. TS.
- **`/billing/page.tsx`** — Server-side redirect → `/profile/settings#billing`. TS.
- **`/kids-app/page.tsx`** — Marketing landing for `/kids/*` middleware redirect. Inline `/api/kids-waitlist` form with honeypot + min-time anti-bot guards. UTM/source param capture. Lang: TS.

### Ideas (preview / proposed-design mockups, hidden from nav + crawlers)
- **`/ideas/page.tsx`** — Index of 5 mockup ideas. TS.
- **`/ideas/sources/page.tsx`** — Sources-above-headline mockup. TS.
- **`/ideas/receipt/page.tsx`** — Reading-receipt mockup. TS.
- **`/ideas/quiet/page.tsx`** — Quiet headline-only home feed mockup. TS.
- **`/ideas/earned/page.tsx`** — Quiz-pass reveal interactive mockup. TS.
- **`/ideas/sampleData.ts`** — Static SAMPLE article + HEADLINES + TYPOGRAPHY exports. TS.
- **`/ideas/feed/page.tsx`** — Feed paradigms index (Edition/Index/Ranked/Spread/Briefing). TS.
- **`/ideas/feed/sharedData.ts`** — STORIES sample, EDITION_DATE/TIME constants, T (typography). TS.
- **`/ideas/feed/PhoneFrame.tsx`** — iPhone 14/15 viewport (390×844) frame component. TS.
- **`/ideas/feed/edition/page.tsx`** — Edition paradigm. TS.
- **`/ideas/feed/index/page.tsx`** — Magazine TOC paradigm. TS.
- **`/ideas/feed/ranked/page.tsx`** — Ranked-rows paradigm. TS.
- **`/ideas/feed/spread/page.tsx`** — Small-multiples spread. TS.
- **`/ideas/feed/briefing/page.tsx`** — Email-tray briefing. TS.

## Notable hardcoded values (categories, tiers, role lists)

- `web/src/app/layout.js:18` — GA4 fallback ID `G-NE37VG1FP6`.
- `web/src/app/layout.js:95` — AdSense publisher ID hardcoded in meta `'ca-pub-3486969662269929'`.
- `web/src/app/page.tsx:34` — `EDITORIAL_TZ='America/New_York'` (single source of truth, used in masthead + SQL filter).
- `web/src/app/browse/page.tsx:33-44` — `CAT_STYLE` map keyed by category slug (politics/technology/science/health/world/business/entertainment/sports/environment/education) — visual palette only, not data, but slugs are hardcoded.
- `web/src/app/browse/page.tsx:49` — `FEATURED_COLORS` cycle palette.
- `web/src/app/browse/page.tsx:52` — `FILTERS` const lists `Most Recent / Most Verified / Trending` (UI-only, filter wiring removed pending Phase B).
- `web/src/app/profile/category/[id]/page.js:16` — `SUB_THRESHOLDS = {reads:25, quizzes:15, comments:10, upvotes:25}` — magic numbers per subcategory drill.
- `web/src/app/profile/contact/page.js:7-18` and `web/src/app/contact/page.tsx:20-32` — duplicated `TOPICS` array (account/billing/bug/content/feature/kids/expert/feedback/accessibility/appeal/other).
- `web/src/app/profile/settings/page.tsx:1379-1393` — `AVATAR_COLORS` palette of 13 hex values (used for ring + inner fill).
- `web/src/app/profile/settings/page.tsx:276-281` — `TEXT_SIZES` 4-tuple (sm/md/lg/xl).
- `web/src/app/profile/settings/page.tsx:250-262` — `ALERT_ROWS` 7 alert types hardcoded with copy (`breaking_news`/`reply_to_me`/`mention`/`expert_answered_me`/`weekly_reading_report`/`kid_trial_ending`/`appeal_outcome`).
- `web/src/app/profile/settings/page.tsx:270-274` — `ALERT_CHANNELS` (in_app/push/email).
- `web/src/app/profile/settings/page.tsx:74-109` — `PERM` constant — every settings permission key. Two of them (`settings.profile.edit.own`, `settings.expert.edit`) noted as **not present in DB** (gated on auth instead).
- `web/src/app/profile/settings/page.tsx:131` — `FALLBACK_BOOKMARK_CAP=10` mirrors `web/src/app/bookmarks/page.tsx:15` and `web/src/app/story/[slug]/page.tsx:331`.
- `web/src/app/profile/kids/page.tsx:12` — `COLOR_OPTIONS` 7-color palette for kid avatars.
- `web/src/app/signup/expert/page.tsx:27-40` — `EXPERTISE_FIELDS` array of 12 expert categories, hardcoded.
- `web/src/app/appeal/page.tsx:17-22` — `ACTION_LABEL` map (warn/comment_mute_24h/mute_7d/ban) — naming for 4 penalty types.
- `web/src/app/leaderboard/page.tsx:26` — `TABS` const (Top Verifiers / Top Readers / Rising Stars / Weekly).
- `web/src/app/help/page.tsx:33-50` — Plan price fallbacks `verityMonthly='$3.99'` / `proMonthly='$9.99'` / `familyMonthly='$14.99'` if DB query fails (T-056 — DB-driven prefer).
- `web/src/app/profile/page.tsx:42-50` — `TAB_IDS` + `TAB_LABELS` (overview/activity/categories/milestones).

## .js/.jsx files still present (drift from TS rule)

CLAUDE.md says new `.js`/`.jsx` is forbidden in `web/src/`. 28 `.js` files remain in scope:

- **Root**: `layout.js`, `error.js`, `global-error.js`, `not-found.js`, `manifest.js`, `robots.js`, `sitemap.js`.
- **Story**: `story/[slug]/layout.js`, `story/[slug]/loading.js`, `story/[slug]/error.js`, `story/[slug]/opengraph-image.js`.
- **Profile**: `profile/layout.js`, `profile/loading.js`, `profile/error.js`, `profile/activity/page.js`, `profile/card/page.js`, `profile/category/[id]/page.js`, `profile/contact/page.js`, `profile/milestones/page.js`.
- **Auth**: `login/layout.js`, `signup/layout.js`, `logout/page.js`.
- **Other**: `bookmarks/layout.js`, `browse/loading.js`, `category/[id]/page.js`, `category/[id]/layout.js`, `card/[username]/page.js`, `card/[username]/layout.js`, `card/[username]/opengraph-image.js`, `leaderboard/layout.js`, `u/[username]/layout.js`.

The trivial `layout.js` metadata-only stubs and OG image generators may not be migration-priority, but these are still drift:
- `profile/contact/page.js` — full 277-line client page, has TS twin at `/contact/page.tsx`.
- `profile/category/[id]/page.js` — full client page with stat math.
- `profile/card/page.js` — full client page with permission gates.
- `category/[id]/page.js` — 524-line client page, the largest legacy `.js` file.
- `card/[username]/page.js` — 326-line client page with category_scores read.
- `logout/page.js` — 247-line client page with retry logic.

## Pages with duplicate-looking purpose

1. **`/profile/contact/page.js` vs `/contact/page.tsx`** — Both contact forms with identical `TOPICS` array. Profile version posts to authed `/api/support`; root version posts to anon `/api/support/public`. The profile version could be a redirect-with-prefill; topics array should be a single shared constant.
2. **`/profile/settings/expert/page.tsx` vs ExpertProfileCard inside `/profile/settings/page.tsx`** — Standalone expert form drifts from the unified-page convention; every other settings sub-page is a one-line redirect. Standalone form posts to same `/api/expert/apply` and overlaps significantly. Owner directive in unified page: "expert apply" CTA routes to `/signup/expert` (which auto-detects authed users) — this standalone is dead code.
3. **`/billing/page.tsx` and `/profile/settings/billing/page.tsx`** — Both redirect to `/profile/settings#billing`. The latter preserves `?success=`/`?canceled=`. Two redirect entrypoints is fine; just noting the parallel surfaces.
4. **`/profile/[id]/page.tsx` and `/u/[username]/page.tsx`** — Both kill-switched right now. `/profile/[id]` was historically a redirect-to-`/u/[username]` shim; `/u/[username]` is the real public-profile route. When both unhide, the redirect should remain (single canonical URL).
5. **`/recap/page.tsx` and `/recap/[id]/page.tsx`** — Both `LAUNCH_HIDE_RECAP` returning `null`. Together they're paired (list + player), not duplicated, but both surfaces are launch-hidden.

## Notable claims worth verifying in later waves

1. **CLAUDE.md says `page.tsx` has FALLBACK_CATEGORIES hardcode tracked in MASTER_TRIAGE.** Current home page reads `categories` from DB and has no FALLBACK_CATEGORIES constant. Tracker entry appears stale — verify against MASTER_TRIAGE_2026-04-23.md.
2. **`/profile/settings/expert/page.tsx`** is a fully-implemented standalone form while every other settings sub-page is a redirect shim. Verify the unified ExpertProfileCard (in `page.tsx`) is the canonical surface and the standalone is dead code that can be deleted.
3. **`/recap` + `/recap/[id]` ship as `null`-returning components with `LAUNCH_HIDE_RECAP=true`**. Verify the launch-hide is intentional and tracked, since the entire recap product is invisible.
4. **`PUBLIC_PROFILE_ENABLED=false` in `/u/[username]/page.tsx`** kill-switches the canonical public-profile route. Verify if this is still in flight — many routes (FollowButton, /card/, leaderboard) link to `/u/<username>`, which currently renders UnderConstruction.
5. **Kids-related web routes** (CLAUDE.md: `/kids/*` redirects, no kid-facing web routes): the `/kids-app/page.tsx` is the anon redirect target (marketing landing). `/profile/kids` and `/profile/kids/[id]` are PARENT management pages, not kid-facing. All consistent with policy.
6. **Permission keys flagged as missing in DB** by Settings PERM block (`settings.profile.edit.own`, `settings.expert.edit`) — verify actual seed via the permissions matrix import script.
7. **`/profile/settings/page.tsx` line 5247** — almost the entire settings surface in one file. Per CLAUDE.md "if a change requires touching ten files, the abstraction is wrong" — but this is the inverse: one file with 16 cards. If a future audit considers splitting, the redirect shims at `/profile/settings/<sub>/page.tsx` are already in place to act as anchors; cards could be split into `web/src/app/profile/settings/_cards/<name>.tsx` without changing user-visible URLs.
8. **F-012 password leak in login-failed** — `/login/page.tsx:218` POSTs `{email, password}` to `/api/auth/login-failed` so the server can verify before recording lockout. Verify the API handles this securely (Z15).
9. **Avatar/Banner CSS injection** — `safeCssBackgroundImage` enforces https-only at `profile/settings/page.tsx:1653-1665`. TODO comment flags adding DB CHECK constraints. Same risk applies to `/u/[username]/page.tsx:325` (`bannerHref` https regex) — duplicated logic, candidate for shared helper in `lib/`.
10. **Migration 142 RPC casts** — both `/leaderboard/page.tsx` and `/profile/settings/page.tsx` use `as never` / `as unknown as` casts pending types regen. Verify post-migration types include `leaderboard_period_counts`, `update_own_profile`, etc.
11. **Bookmark cap (`FALLBACK_BOOKMARK_CAP=10`)** repeated in 3 files — should resolve via `lib/plans.getPlanLimitValue` only; the literal could move to a shared constant or DB read.
12. **Suspense boundaries** required for `useSearchParams` in `/login`, `/profile`, `/messages` — three pages wrap their inner component. Pattern is consistent.
13. **Coming-soon mode** (`NEXT_PUBLIC_SITE_MODE=coming_soon`) checked in `welcome/page.tsx`, `manifest.js`, `sitemap.js`, `layout.js` (metadata). Multi-surface flag — verify they all flip together.
14. **Kill-switch pattern** appears in 3 files (`/profile/[id]`, `/u/[username]`, `/recap/page.tsx`, `/recap/[id]/page.tsx`) — `react-hooks/rules-of-hooks` disabled with comment "launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)". Confirm this is consistent with CLAUDE.md "kill-switched work = prelaunch-parked".
15. **`LAUNCH_HIDE_ANON_INTERSTITIAL=true`** in `/story/[slug]/page.tsx:80` mutes the 2nd-article anon signup interstitial entirely. Verify intentional.
16. **Mobile tab bar + Timeline** wrapped in `false &&` at `/story/[slug]/page.tsx:1182` and `1552`/`1572` — the Timeline feature surface is dead-launch-hidden. Confirm scope of timeline hide.
17. **`/profile/contact/page.js` 277-line legacy `.js`** with hardcoded TOPICS list duplicated from `/contact/page.tsx`. Worth migrating to TS + shared TOPICS constant.
18. **`category/[id]/page.js` 524-line legacy `.js`** — biggest legacy `.js` page in the zone.
19. **`/profile/settings/data/page.tsx` (DataExportCard inline)** — server route `/api/account/data-export` is referenced (C4 — replaces direct insert). Verify endpoint exists in Z15.
20. **`/profile/settings/page.tsx:5126` `enforce_bookmark_cap`** trigger (P0001 → 422) referenced in story page bookmark error path — confirm DB trigger exists.

File count: 95 files read (61 TS/TSX + 28 JS + 4 CSS/MD/JSON-equivalents).
