# Verity Post — FEATURE BIBLE

**Last synced:** 2026-04-27
**Source of truth:** the running codebase + Supabase schema. This document is rebuilt against source on every meaningful change. If anything below contradicts the code, the code wins.

> How to read this. Every section is self-contained: features, the data they touch, the tiers and roles that gate them, where they live in code, and their current state. Open any section cold and walk away with a complete picture of that surface.
>
> How to keep this current. When a feature ships, gets removed, or changes behavior, the corresponding section here is updated in the same change. Sections marked **State** are the canonical operational status. The "Currently kill-switched / launch-hidden" register at the end is the single place to look up what is intentionally inert.

---

## 0. Product at a glance

Verity Post is a news platform with three end-user surfaces fed by one Supabase Postgres database:

- **Web app** — Next.js 14 App Router, TypeScript, Tailwind, deployed on Vercel. Anchor surface for reading, account management, billing, admin, and the AI content pipeline.
- **VerityPost (adult iOS)** — SwiftUI, Supabase Swift client, StoreKit 2, APNs HTTP/2. Mirror of the adult web reading + account experience.
- **VerityPostKids (kids iOS)** — SwiftUI, COPPA-constrained, paired-device auth (no kid log-in screens). Reads, quizzes, gamification, expert sessions, graduation.

The web surface is the only place admin tools, the AI pipeline, and Stripe billing live. iOS apps consume the same database with thinner UI surface area and platform-specific billing (StoreKit) and auth (Apple/Google providers + paired-device tokens for kids).

Editorial timezone is **America/New_York** for "today's edition" semantics on home and recap.

---

## 1. Marketed plan tiers

The plan catalog lives in the `plans` table; canonical client constants in `web/src/lib/plans.js`. Four marketed tiers, seven physical plan rows.

| Tier | Plan rows | Price | Buyable now? | Surfaces it sells on | Seat model |
|---|---|---|---|---|---|
| **Free** | `free` | $0 | Yes (default) | All | Single user |
| **Verity** (legacy) | `verity_monthly` / `verity_annual` | $3.99 / mo | Existing subs only — grandfathered, never offered to new buyers | n/a | Single user |
| **Verity Pro** | `verity_pro_monthly` / `verity_pro_annual` | $9.99 / mo, ~$99.99 / yr | Yes | Web (Stripe), iOS (StoreKit) | Single user |
| **Verity Family** | `verity_family_monthly` / `verity_family_annual` | $14.99 / mo, $149.99 / yr | Yes | iOS only (StoreKit). `is_visible=false` on web checkout | 1 included kid + up to 4 extra kids at $4.99/mo each, max 4 total |

**Grandfathering (T318).** Existing `verity_monthly` subscribers ($3.99) keep that price forever. New subscribers buy `verity_pro_monthly` ($9.99) which grants the *identical* permission set. The price gap is the legacy promise — the duplication is intentional, not drift. The `pro-grandfather-notify` cron migrates legacy Pro→Verity at renewal where applicable; Apple subs can't be migrated programmatically (StoreKit limitation) and use an in-app banner instead.

**Family seats (Phase 2).** Family is a Stripe quantity-based subscription: base item plus per-extra-kid add-ons keyed by `seat_role='extra_kid'` price metadata. The `verity_family_xl_*` tier was retired (T319, 2026-04-27); per-kid add-ons fully replaced it. Plan metadata exposes `included_kids=1`, `max_kids=4`, `extra_kid_price_cents=499`, `max_total_seats=6`.

**Lifecycle states.** A user is in exactly one of: `anonymous`, `free`, `active` (paid), `trial` (paid via Stripe/Apple trial window), `grace` (`plan_grace_period_ends_at` set, future), or `frozen` (`frozen_at` set; paid features revoked, `verity_score` snapshotted into `frozen_verity_score`). Resolved by `resolveUserTier()`. Grace expiry is swept hourly by `freeze-grace`. Resubscribe unfreezes (`billing_resubscribe` RPC).

State: **shipped.** Plan structure locked 2026-04-27 (Phase 2). XL retired same date.

---

## 2. Identity, sessions, and access

### 2.1 Auth providers

Supabase GoTrue handles credentials. Three primary paths:

- **Email + password** — signup at `/signup` (currently behind closed-beta invite gate, see §2.3), login at `/login`, recovery at `/forgot-password` → `/reset-password`. Email verification required before unlocking the full app surface (`needs_email_verification` state on `users`).
- **Sign in with Apple** — iOS native button via Supabase Apple provider. Identity-token exchange in `AuthViewModel`.
- **Continue with Google** — both web and iOS via Supabase Google provider.

OAuth display is hidden on web during closed beta but the routes are live. iOS exposes Apple + Google + email/password.

Account-level safeguards on `users`:
- Failed login lockout — `users.locked_until` is set after repeated failures. Threshold and window live in admin rate-limit config (current default: 5 attempts / 5 min per IP, per `/admin/system/page.tsx`). Surfaced via `/api/auth/login-precheck`.
- Ban (`is_banned`), shadow-ban (`is_shadow_banned`), mute (`is_muted` + `muted_until`), warning ladder (`warning_count`, `last_warning_at`, `mute_level`).
- Deletion grace window (`deletion_requested_at`/`deletion_scheduled_for`/`deletion_completed_at`). 30-day soft delete; the `process-deletions` cron sweeps PII, then hard-deletes the auth row.

### 2.2 Sessions

Two session models share the database:

- **`sessions`** (adult) — token-hashed, refresh-token-hashed, with device + push token + IP/UA forensics, `expires_at`, `revoke_reason`. Backs the standard Supabase session.
- **`kid_sessions`** (kids) — 12-hour TTL device-paired tokens. The kid iOS app authenticates via a custom-minted JWT carrying `is_kid_delegated=true`, `kid_profile_id`, and `parent_user_id` claims. PostgREST verifies signature; RLS policies branch on the kid claim. The kid is **not** a row in `auth.users` — only in `kid_profiles`.

The `user_sessions` table is a separate analytics/session bucketing surface (entry/exit point, device, screens viewed, bounce). Distinct from auth `sessions`.

### 2.3 Closed-beta gate

Set `NEXT_PUBLIC_BETA_GATE=1`. Middleware (`web/src/middleware.js`) bounces every anonymous request to `/login` except an allowlist (the auth surface, request-access flow, public assets, admin segment). Visitors with an invite code redeem at `/r/[slug]` (writes a `vp_ref` cookie) and are routed to `/login?mode=create`. Uninvited visitors hit `/beta-locked` with a request-access form (`/api/access-request`).

Codes live in `access_codes` (referral type only post-T317; legacy signup/invite types inert). Requests live in `access_requests`. The `sweep-beta` cron expires beta cohort comps and stamps `comped_until` / `verify_locked_at` on users.

State: **active.** Beta gate is the launch model.

### 2.4 Coming-soon mode

Independent of the beta gate. `NEXT_PUBLIC_SITE_MODE=coming_soon` redirects all public requests to `/welcome` and stamps `X-Robots-Tag: noindex, nofollow`. Owner bypass: hit `/preview?token=...` once, the bypass cookie passes for subsequent requests. Beta gate supersedes coming-soon when both are set.

### 2.5 Edge defenses

The middleware also enforces:

- **Per-request CSP nonce** with `'strict-dynamic'`; primary policy ships Report-Only by default and flips to enforce via `CSP_ENFORCE=true`. A second strict report-only header (no `'unsafe-inline'` in style-src) tracks migration progress against `/api/csp-report?policy=strict`.
- **CORS allow-list** for `/api/*` — `veritypost.com` + `www.veritypost.com` + dev localhost. iOS (no browser CORS engine) is unaffected.
- **Request-id propagation** (`x-request-id`) — minted or honored on entry, mirrored to forwarded headers and response so log aggregators correlate edge/server/client.
- **Protected prefixes** — `/profile`, `/messages`, `/bookmarks`, `/recap`, `/expert-queue`, `/billing`, `/appeal` 302 to `/login?next=…` for anonymous visitors. `/notifications` and `/leaderboard` render anon empty states inline (per the bottom-nav anon model). `/admin` returns 404 for non-staff (no disclosure).
- **Legacy redirects** — `/admin/pipeline` and `/admin/ingest` 301 to `/admin/newsroom` (F7 consolidation).
- **`/kids/*` web routes** redirect: signed-in parents to `/profile/kids`; anon to `/kids-app` marketing landing.

State: **shipped.** CSP enforce remains opt-in until `/api/csp-report` is quiet for a day.

---

## 3. Permissions and roles

### 3.1 Permission system (RBAC v2)

Source of truth is the database. Five tables:

- `permissions` — keys (e.g. `comments.post`, `bookmarks.unlimited`), display names, `category`, `ui_section`, `deny_mode` (`locked` or `hidden`), `lock_message`, `requires_verified`, optional `feature_flag_key`.
- `permission_sets` — named bundles of permissions, including kids-specific sets (`is_kids_set`).
- `permission_set_perms` — junction.
- Wirings: `role_permission_sets`, `plan_permission_sets`, `user_permission_sets` (with grant reason and expiry).
- `permission_scope_overrides` — per-(user, content) overrides scoped to `article` / `category` / `source` / `user`.

Resolution: the SECURITY DEFINER RPC `compute_effective_perms(p_user_id)` returns the full effective permission set with `granted`, `granted_via`, `source_detail`, `deny_mode`, and `lock_message` per key.

Cache: `users.perms_version` (per-user) and `perms_global_version` (singleton). Bumped by RPCs on any grant/revoke. Clients (web, iOS) poll `my_perms_version()` and refresh on mismatch. The web client (`web/src/lib/permissions.js`) hard-clears its cache on bump (fail-closed during refresh window) and the iOS `PermissionService` uses the same model. Anonymous and pre-load callers always read deny.

Two cache paths coexist during the Wave 1→2 migration:
- Legacy section cache via `get_my_capabilities(section)`.
- New full cache via `compute_effective_perms`. Wave 2 will retire the section cache.

State: **shipped.** Migration ongoing; both paths share version bumps.

### 3.2 Roles

Hierarchy lives in `roles.hierarchy_level`. Coarse client allowlists (`OWNER_ROLES`, `ADMIN_ROLES`, `EDITOR_ROLES`, `MOD_ROLES`, `EXPERT_ROLES`) are frozen Sets in `web/src/lib/roles.js` for layout-level gating. Fine-grained authorization always goes through permissions, not roles.

DB-enforced rank: `require_outranks()` and `caller_can_assign_role()` RPCs prevent lower-ranked admins from acting on higher-ranked users. The admin moderation console reads role hierarchy live from the DB (60s cache).

Role names in use: `owner`, `admin`, `editor`, `moderator`, `expert`, `journalist`, `educator`, `user`. Special-purpose flags on `users`: `is_expert`, `is_verified_public_figure`.

### 3.3 Score tiers (Verity Score progression)

Live in `score_tiers`. Six tiers as currently seeded:

| Name | min_score | Purpose |
|---|---|---|
| newcomer | 0 | Default tier |
| reader | 100 | First sustained engagement |
| informed | 300 | Habitual reader |
| analyst | 600 | High-quality contributor |
| scholar | 1000 | Top-of-room |
| luminary | 1500 | Cap |

Resolved via `web/src/lib/scoreTiers.ts`; cached 60s. **Tiers do not have distinct hues** — color-coded ranks have been explicitly rejected. Tier is a label, not a visual identity.

State: **shipped.** Live everywhere a user's tier is rendered (profile, leaderboard, public profile cards).

---

## 4. Content engine (AI pipeline)

The pipeline turns RSS-discovered items into adult, kids, or tweens articles via a 12-step orchestrated chain. Source of truth: `web/src/lib/pipeline/`, `/api/admin/pipeline/*`, and the F7 redesign documented in `Ongoing Projects/`.

### 4.1 State machine

`feeds` (RSS sources, with `audience='adult'|'kid'`, `is_auto_publish`, `is_ai_rewrite`) → `discovery_items` (state: `pending` → `clustered` → `generating` → `published` | `ignored`) → `feed_clusters` (with `audience`, `primary_article_id`, plus `primary_kid_article_id` and `primary_tween_article_id` for cross-band fan-out) → `articles`.

Clustering: greedy first-fit-best-score keyword overlap, threshold from setting `pipeline.cluster_overlap_pct` (default 0.35). Pure in-memory; the route writes results back.

### 4.2 Generation

Trigger: `POST /api/admin/pipeline/generate` with `{ cluster_id, audience: 'adult'|'kid', age_band?, provider, model, freeform_instructions?, source_urls? }`. Auth: `admin.pipeline.run_generate`. Kill switches: `ai.adult_generation_enabled`, `ai.kid_generation_enabled` (60s cache, fail-closed). Rate limit: `newsroom_generate` (20/3600s).

Cluster lock: `claim_cluster_lock(cluster_id, run_id, ttl=600s)` (FOR UPDATE SKIP LOCKED) ensures one generation per cluster at a time.

Twelve steps:

1. **Audience safety check** — Haiku internal. Refuses kid generation on adult-only clusters via `AudienceMismatchError`.
2. **Source fetch** — Jina Reader (renders JS) → Cheerio fallback. 15s timeout per URL, 200–10000 char bounds, fail-soft (returns `null`, caller continues).
3. **Headline + summary** — selectable model. JSON output. Audience-forked prompts.
4. (rolled into 3)
5. **Categorization** — selectable model. Routes to `pipeline.default_category_id` on failure.
6. **Body** — selectable model. Audience-forked: `ARTICLE_PROMPT` (adult), `KIDS_ARTICLE_PROMPT` (7–9), `TWEENS_ARTICLE_PROMPT` (10–12). Word target 175, ceiling 250, hard 300. Markdown body sanitized via `renderBodyHtml` into `articles.body_html`. Source text and freeform instructions wrapped in `<source_article>` markers; injection-resistant escapes (F-077).
7. **Source grounding** — Haiku internal. Logs supported/unsupported claims, non-blocking.
8. **Plagiarism check** — n-gram overlap against fetched sources. Settings: `pipeline.plagiarism_ngram_size` (4), `pipeline.plagiarism_flag_pct` (25%). On flag, `rewriteForPlagiarism()` runs Haiku rewrite; if rewrite is too short, article persisted with `plagiarism_status='flagged'`.
9. **Timeline** — selectable model. Output persisted as `timelines` rows.
10. **Kid URL sanitizer** — kid runs only. Haiku redacts/replaces external URLs.
11. **Quiz generation** — selectable model. Zod-validated; max one correct option per question. Persisted to `quizzes` (with correct index in metadata, never leaked in public read).
12. **Quiz verification** — Haiku double-check for answer-key errors.

Persistence: single transaction via `persist_generated_article(jsonb)` RPC (SECURITY DEFINER). Slug collision retry. Writes article + sources + timeline + quizzes atomically.

Cost tracking: every model call writes a `pipeline_costs` row (input/output tokens, cache tokens, cost in USD, latency, audience, prompt fingerprint). Pre-call `checkCostCap()` gates runaway runs. Always written, including on error (finally block).

Prompt overrides: `ai_prompt_overrides` (per `step_name`, `category_id`, `subcategory_id`, `audience`) compose additional instructions onto base prompts. Specificity scored; highest specificity per step wins. Fail-open.

Models: `ai_models` table holds active providers (`anthropic` | `openai`) and pricing per million tokens. Anthropic prompt caching enabled (5-min ephemeral) on system messages. Default: `claude-sonnet-4-6` for generation, Haiku (`claude-haiku-4-5`) for internal verification steps.

Hero pick: `articles.hero_pick_for_date` chooses the home-page hero per editorial day; set by an editor (`hero_pick_set_by`). Falls back to most-recent published if unset.

Admin observability: `/admin/pipeline/runs` (paginated, filterable list), `/admin/pipeline/runs/[id]` (run detail, future), `/admin/pipeline/costs` (today vs cap, per-model, 30-day chart, outliers), `/admin/pipeline/settings` (kill switches, cost caps, thresholds), `/admin/pipeline/cleanup` (manual sweep).

Newsroom workspace: `/admin/newsroom` is the operator surface. Cluster grid (adult/kids tabs) with "Generate" actions, prompt picker, run history.

State: **shipped.** Full F7 Phase 3 lifecycle live end-to-end (audit pass closed F1–F12 + D1–D11, 2026-04-22).

---

## 5. Reading surfaces (web + iOS)

### 5.1 Home

Web `/` and iOS `HomeView`. Server-rendered (web) with three parallel data fetches — today's hero, breaking strip, active categories, plus signed-in users' 200 most-recent reads (30-day window). Hero from `hero_pick_for_date`, supporting cards from same-day published articles. "New since last visit" tag uses the `vp_last_home_visit_at` cookie (web) / UserDefaults (iOS). Breaking banner gated by `home.breaking_banner.view`. iOS includes optional in-feed ad slot (`/api/ads/serve?placement=home_feed`) and a Recap upsell card.

### 5.2 Browse

Web `/browse`. Public category directory listing all active `categories` with featured or recent articles per category. Anonymous-readable (RLS allows). Category accent palette is slug-keyed.

### 5.3 Story

Web `/story/[slug]`, iOS `StoryDetailView` (Story / Timeline / Discussion tabs).

Components on a story page:
- Article body + `body_html` (sanitized markdown).
- Sources (`sources` table) — expandable cards.
- Timeline (`timelines`) — historical events.
- Quiz (`quizzes`) — 5–10 questions, comprehension-gates the comment composer.
- Comments thread.
- TTS player — gated by `article_reading.tts.play`.
- Reading progress ribbon (iOS).
- Reading log write to `reading_log` on completion (server uses 50% scroll, iOS uses quiz button tap).
- Bookmark toggle.
- Author byline with expert badge + title.
- Recommendations + JSON-LD `NewsArticle` schema (web).

State: **shipped.** Web and iOS in parity.

### 5.4 Search

Web `/search`, iOS `FindView`.

- `search.view` — page access.
- `search.basic` — keyword search (title-only).
- `search.advanced` — filter panel (`search.advanced.category`, `.date_range`, `.source`).

API: `POST /api/search` with `{ q, category, from, to, source }`. Server ignores filter params from non-paid callers — defense in depth.

State: **shipped.** Advanced filter UI mostly wired on web; iOS basic mode only (advanced deferred).

### 5.5 Recap

Weekly recap quizzes summarizing what readers missed.

- Tables: `weekly_recap_quizzes`, `weekly_recap_questions`, `weekly_recap_attempts` (with `articles_missed` array).
- Web `/recap`, `/recap/[id]`. iOS `RecapView`.
- Permission gate: `recap.list.view`.
- Admin curator: `/admin/recap` — create per week+category, add 4-option questions with explanations.

State: **partial.** Curator and APIs are shipped; the public list page is currently launch-hidden (`LAUNCH_HIDE_RECAP=true`, kill-switched per the launch plan; flip a flag to unhide).

### 5.6 Leaderboard

Web `/leaderboard`, iOS `LeaderboardView` ("Most Informed" tab).

- Periods: past_24h, past_7d, past_30d, all-time. Rolling-cutoff (not calendar-aligned). Shared period helper between web and iOS.
- Scopes: top verifiers (default), by category, by subcategory.
- Permissions: `leaderboard.view` (full list; free users see top 3 + sign-up overlay). `leaderboard.category.view`, `leaderboard.filter.time` (paid).
- Privacy filters always applied: `email_verified=true`, `is_banned=false`, `show_on_leaderboard=true`, `frozen_at IS NULL`.
- Aggregation queries that exceed RLS row limits (weekly, monthly counts) go through SECURITY DEFINER RPCs.

State: **shipped.** Subcategory aggregation deferred to Wave 2.

### 5.7 Profile

Web `/profile` (authed) and `/u/[username]` (public). iOS `ProfileView` and `PublicProfileView`. Tabs: Overview, Activity, Categories, Milestones.

Sources: `users` (score, streaks, follower counts, social privacy flags), `reading_log` (30-day heatmap), `quiz_attempts`, `comments`, `comment_votes`, `bookmarks`, `user_achievements` joined with `achievements`, `category_scores`.

Permission gates: `profile.activity`, `profile.categories`, `profile.achievements`, `profile.card_share`, `profile.followers.view.own`, `profile.follow.create`, `profile.score.view.other.total`, `profile.expert.badge.view`.

Public profile honors `profile_visibility='private'` (returns 404), `show_activity` (hides activity tab), `show_on_leaderboard` (separate gate).

Shareable card: `/card/[username]` — server-rendered for OG unfurl; gated by `profile.card_share`. iOS shares via `UIActivityViewController`.

State: **shipped.** Public-profile feature flag (`PUBLIC_PROFILE_ENABLED`) is currently kill-switched as a launch-hide; flip to unhide.

---

## 6. Engagement and gamification

### 6.1 Quizzes

Article-attached comprehension quizzes (`quizzes`, `quiz_attempts`). Multiple-choice; one correct option enforced at the schema layer.

Flow:
- `POST /api/quiz/start` — server returns shuffled questions for the article.
- `POST /api/quiz/submit` — server scores, writes `quiz_attempts` rows (with `kid_profile_id` set when applicable), awards points via `score_events`.

Pass threshold (kids): 60% (server-authoritative via `get_kid_quiz_verdict` RPC). Adults: full pass to unlock comments.

Permission gates: `quiz.attempt.start`, `quiz.attempt.submit`, `quiz.unlimited_attempts` (free: 3/day; paid: unlimited), `quiz.retake`.

State: **shipped.**

### 6.2 Verity Score and rules

`score_events` (`action`, `points`, scoped to `user_id` or `kid_profile_id`, with `category_id`, `article_id`, idempotency-keyed) is the audit log. `score_rules` defines actions (read, quiz_correct, comment_post, receive_upvote, etc.) with `points`, `max_per_day`, `max_per_article`, `cooldown_seconds`, `category_multiplier`, `applies_to_kids`. Daily and lifetime aggregates computed from `score_events`.

Per-category breakdown lives in `category_scores` (read count, quizzes correct, score per category, last activity). Drives the Categories tab on profile and the kids-app per-category progress pips.

State: **shipped.**

### 6.3 Streaks

`streaks` (one row per active day, `is_freeze` for streak-freeze powerups). `users.streak_current`, `users.streak_best`, `users.streak_last_active_date`, `users.streak_freeze_remaining`, `users.streak_frozen_today`. Same fields mirrored on `kid_profiles` plus `streak_freeze_week_start` (one freeze per week cap).

Kids app celebrates milestones at days 3, 7, 14, 30 with full-screen `StreakScene` (flame + ring + particle choreography; reduce-motion aware).

State: **shipped.**

### 6.4 Achievements

`achievements` (key, name, criteria jsonb, rarity, points, `is_kids_eligible`, `is_secret`). `user_achievements` records earned-by `user_id` or `kid_profile_id`. `family_achievements` + `family_achievement_progress` track family-aggregate milestones (parent + kids).

Crons: `check-user-achievements` (daily) sweeps users with recent activity and calls `check_user_achievements(user_id)` RPC. `recompute-family-achievements` sweeps active family owners.

Kids app has one badge wired (Bias Detection L3 at 5 spotted) with a celebration scene framework (`BadgeUnlockScene`). Other badge keys are seeded in DB but not yet client-eligible.

State: **shipped (framework); content backlog.**

### 6.5 Bookmarks

`bookmarks` + `bookmark_collections`. Free: 10-bookmark cap, flat list. Paid: unlimited + collections + per-bookmark notes.

Permission gates: `bookmarks.list.view`, `article.bookmark.add`, `article.bookmark.remove`, `bookmarks.collection.create`, `bookmarks.collection.rename`, `bookmarks.export`, `bookmarks.unlimited`. Cap value pulled live from `plan_features.bookmarks.limit_value` (defaults baked in code with DB override).

Routes: `/api/bookmarks`, `/api/bookmarks/[id]`, `/api/bookmark-collections/*`, `/api/bookmarks/export`.

State: **shipped.**

### 6.6 Follows, blocks, mutes

- `follows` (with `notify` flag). Drives leaderboard ordering and follow-notification fan-out. Permission: `profile.follow.create`. Web/iOS follow button on public profiles.
- `blocked_users` — bidirectional; if either side blocks, both directions hide. Drives comment client-side filter, DM `[DM_BLOCKED]` 403, public profile gating. iOS has a singleton `BlockService` that refreshes on login + after every block change (Apple Guideline 1.2 compliance). Optimistic updates on web.
- Mutes — `users.is_muted`, `muted_until`. Mute level escalates per warning ladder.

State: **shipped.**

---

## 7. Discussion (comments)

### 7.1 Schema

`comments` is the spine: `article_id`, `user_id`, `parent_id`/`root_id`/`thread_depth`, `body`, `body_html`, AI metadata (`ai_tag`, `ai_sentiment`, `ai_toxicity_score`), vote counts, `mentions` jsonb, `is_pinned`, `is_context_pinned` + `context_tag_count` + `context_pinned_at`, expert-question fields, moderation fields, `status` (`visible` / `deleted` / `hidden`), `deleted_at`. Plus `comment_votes` and `comment_context_tags` junctions.

### 7.2 Posting

`POST /api/comments` — signed-in, requires `comments.post`, rate-limited 10/min, body capped at `comment_max_length` setting (default 4000).

Quiz gate: `user_passed_article_quiz(user_id, article_id)` RPC blocks comment posting on articles whose quiz the user hasn't passed. Failed gate returns 403 with explicit guidance to take the quiz (literal copy in `web/src/app/api/comments/route.js`).

Mentions: `@username` regex `[a-zA-Z0-9_]{2,30}`, resolved client-side via `/api/auth/resolve-username` to user IDs before submit. `comments.mention.insert` permission gates the feature (paid only); unresolved mentions silently dropped on free tier (D21).

State on save: insert through `post_comment` RPC. Awards `score_events` for the author. Real-time fan-out: Supabase Realtime postgres_changes drives the article thread.

### 7.3 Voting

`POST /api/comments/[id]/vote` with `{ type: 'upvote'|'downvote'|'clear' }`. 30/min rate limit. Idempotency: re-affirming a vote is a no-op; switching direction or clearing updates `comment_votes` and recomputes counts. Fresh upvote awards `score_events` (`receive_upvote`) to the comment author.

Permission gates: `comments.upvote`, `comments.downvote`, `comments.vote.clear`.

### 7.4 Context pinning (AI tagging)

Users with `comments.context_tag` permission can apply article-context tags to comments. Threshold-based auto-pin: when `context_tag_count` crosses a configurable threshold, `is_context_pinned=true` and `context_pinned_at` stamped. Pinned comments sort to top.

### 7.5 Expert Q&A

A comment can be an expert question (`is_expert_question`, target type/id, status). Routed into `expert_queue_items` for an expert with the right category (`target_category_id`) or specifically-tagged expert (`target_expert_id`).

Expert can claim, decline, answer, or back-channel. Answer is a comment (`answer_comment_id`) marked `is_expert_reply`. Non-paid readers see expert replies blurred (CSS filter); `article.expert_responses.read` unblurs.

Expert-only inbox: web `/expert-queue` and iOS `ExpertQueueView`. Permission: `expert.queue.view`.

State: **shipped.** Back-channel (between experts) may be partial.

### 7.6 Reporting and supervisors

Per-comment report: `POST /api/comments/[id]/report`. Reporter must be email-verified. Rate limits: 10/hour per reporter, 3/day per target.

**Urgent categories** (`csam`, `child_exploitation`, `grooming`) bypass the per-target cap, set `is_escalated=true`, emit error-level observability, and attempt **NCMEC CyberTipline** submission via `web/src/lib/ncmec.ts`. The CyberTipline call is currently stubbed — awaiting ESP registration with NCMEC. Internal `reports` row is always created.

Supervisor flag: `POST /api/comments/[id]/flag` — for users opted in as `category_supervisors` (community moderators with elevated `verity_score`). Routes to admin moderation queue.

Reports queue: `/admin/reports` — moderator triage with supervisor-flag fast lane. Resolution writes `reports.status`, `resolution`, `resolution_notes`, `resolved_by`.

Moderator hide: `POST /api/admin/moderation/comments/[id]/hide`. Audited.

State: **shipped (NCMEC stubbed).**

---

## 8. Direct messages (DMs)

### 8.1 Schema

`conversations` (type `direct` / group), `conversation_participants` (`role`, `is_muted`, `last_read_at`, `joined_at`/`left_at`), `messages` (`conversation_id`, `sender_id`, `body`, `attachment_url`, `reply_to_id`, `is_edited`, `status`, `moderation_status`, `deleted_at`), `message_receipts` (per-recipient `delivered_at`, `read_at`).

### 8.2 Behavior

- **Permission gate.** `messages.dm.compose` (Verity+). Free tier cannot start a conversation or send a message. Kids cannot DM at all (no permission seed in any kids set).
- **Account state locks.** Banned, muted (`mute_level >= 1`), frozen, or in grace prevents send. Banner replaces composer.
- **Block enforcement.** `post_message` RPC checks `blocked_users` bidirectionally; rejects with `[DM_BLOCKED]` 403. Errors are uniform (403 for all gate failures; 429 rate; 400 input) so block/ban state is not leaked.
- **Read receipts.** Per-user `dm_read_receipts_enabled` toggle on `users`.

Routes: `/api/conversations`, `/api/messages`, `/api/messages/search` (full-text). Web `/messages`, iOS `MessagesView`.

State: **shipped.**

---

## 9. Notifications

Three channels — in-app, push, email — orchestrated through the `notifications` table and gated per-user via `alert_preferences`.

### 9.1 Notifications table

`notifications` (one row per addressable notification): `user_id`, `type`, `title`, `body`, `action_url`, `action_type`, `action_id`, `sender_id`, `channel`, `priority`, `is_read`/`read_at`, `is_seen`/`seen_at`, `push_sent`/`push_sent_at`/`push_receipt`/`push_claimed_at`, `email_sent`/`email_sent_at`, `campaign_id`, `expires_at`.

Types in production: `breaking_news`, `comment_reply`, `mention`, `expert_answer_posted`, `kid_trial_day6`, `kid_trial_expired`, `data_export_ready`, `expert_reverification_due`, plus follow / verification / achievement classes.

### 9.2 Alert preferences

`alert_preferences` (per-user, per-`alert_type`): `channel_push` / `channel_email` / `channel_in_app` / `channel_sms` toggles, `is_enabled`, `quiet_hours_start` / `quiet_hours_end`, `frequency` (digest control).

Per-field permission gates (H7): `notifications.prefs.toggle_push`, `.toggle_email`, `.toggle_in_app`, `.toggle_sms`, `.edit`. PATCH drops fields the caller can't toggle and returns them in `ignored_fields`.

### 9.3 In-app inbox

`GET /api/notifications` (200-id PATCH cap, NO_STORE caching). Web `/notifications`, iOS `AlertsView`. Anonymous: page renders inline sign-in CTA (no middleware redirect). Permission: `notifications.inbox.view`.

iOS polls unread count every 60s while the app is foregrounded.

### 9.4 Push (APNs)

`web/src/lib/apns.js` — direct HTTP/2 to APNs with no external dependencies. ES256 JWT signing (`APNS_KEY_ID` + `APNS_TEAM_ID` + `APNS_AUTH_KEY`). Token cache 50min, refreshed at 60s remaining. Topic from `APNS_TOPIC` env (default `com.veritypost.app`). Environment per token (`sandbox` or `production`).

Device registration: `user_push_tokens` (per `provider`, `push_token`, `environment`, OS/app version, `last_registered_at`, `invalidated_at`). iOS `PushRegistration` calls `upsert_user_push_token` RPC after the system permission grant. Pre-prompt sheet (`PushPromptSheet`) shows a 7-day decline cooldown before re-asking.

Send pipeline (`/api/cron/send-push`, every minute):
1. Claim batch via `claim_push_batch(p_limit=200)` (FOR UPDATE SKIP LOCKED, stale > 5 min reclaimable).
2. Load `alert_preferences` (skip if `channel_push=false`), `user_push_tokens` (skip invalidated), `users` (timezone + plan).
3. Quiet-hours check (server-UTC at create AND caller-TZ at dispatch).
4. Free-tier daily cap on `breaking_news` push (`plan_features.breaking_alerts.limit_value`, D14).
5. Dispatch with concurrency 20 (down from 50 — at 50, pinned ~83% of Supabase 60-conn pool).
6. Insert `push_receipts` (status, provider_message_id, error_code, `token_invalidated`).
7. Mark `notifications.push_sent=true`. Heartbeat.

Dead-token detection: APNs 410 or rejection codes (`BadDeviceToken`, `Unregistered`, `DeviceTokenNotForTopic`, `TopicDisallowed`) → mark `user_push_tokens.invalidated_at` via RPC.

Admin test: `POST /api/push/send` (gated by `admin.push.send_test`).

### 9.5 Email

**Email is security-only.** Production triggers: password reset, email verification, billing receipts, deletion notices, data-export ready, expert reverification due. UI must not promise replies/follows/digest emails.

`web/src/lib/email.js` wraps Resend API. Template rendering via `renderTemplate(tpl, variables)`, HTML-escaped by default. RFC 8058 one-click unsubscribe headers. Fallback unsubscribe URL: `/profile/settings#emails`.

Cron: `/api/cron/send-emails` (daily) sweeps `notifications.email_sent=false` rows in batches of 50, respecting `alert_preferences.channel_email` opt-out and rendering against `email_templates` (versioned, with `from_name`/`from_email`/`reply_to`).

State: **shipped.**

---

## 10. Family system (parent + kids)

### 10.1 Schema

- `kid_profiles` — owned by `parent_user_id`. `display_name`, `avatar_color`/`avatar_preset`/`avatar_url`, `date_of_birth`, `pin_hash`/`pin_salt`/`pin_hash_algo` (PBKDF2-SHA256, 100K iterations; legacy SHA-256 transparently rehashed), `coppa_consent_given`/`coppa_consent_at`, `verity_score`, streak fields, `pin_attempts`/`pin_locked_until`, `paused_at`, `global_leaderboard_opt_in`, `reading_band` (`kids` | `tweens` | `graduated`), `band_changed_at`, `band_history` jsonb, `birthday_prompt_at`.
- `parental_consents` — audit row per consent (`consent_method`, IP, UA, version).
- `kid_pair_codes` — single-use, expires_at-bounded codes (typical 15-min TTL) for paired-device flow.
- `kid_sessions` — 12-hour kid JWTs.
- `kid_category_permissions` — per-kid allow/deny per category.
- `kid_dob_correction_requests` — parent-submitted DOB corrections with cooldown, fraud flags, and admin review.
- `kid_dob_history` — immutable audit trail of DOB changes.
- `kid_expert_sessions`, `kid_expert_questions` — scheduled live expert Q&A.
- `kids_waitlist` — anonymous parent email signups (kids app pre-launch).
- `graduation_tokens` — terminal handoff: kid → adult web account.
- `add_kid_idempotency` — primary-keyed `(user_id, idempotency_key)` for atomic seat + profile creation.

### 10.2 COPPA consent

Version-stamped (`COPPA_CONSENT_VERSION = '2026-04-15-v1'`). Consent text in `web/src/lib/coppaConsent.js`. Validation requires parent name ≥ 2 chars, ack flag, version match. Stored in `kid_profiles.metadata.coppa_consent` plus `parental_consents` row with IP/UA forensics.

### 10.3 Pairing flow

1. Parent goes to `/profile/kids` (web) or `FamilyDashboardView` (iOS), creates a kid profile.
2. Parent generates an 8-character pair code (`POST /api/kids/generate-pair-code`, single-use, expires).
3. On the kids iPad/iPhone, kid types code into `PairCodeView`. `POST /api/kids/pair` (public endpoint, double-rate-limited 10/min per IP and per device) calls `redeem_kid_pair_code` RPC (atomic mark-used). Server mints a 24-hour custom JWT with `is_kid_delegated=true`, `kid_profile_id`, `parent_user_id` claims. Parental-consent row written with IP/UA (C15).
4. iOS persists token in Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`) plus device UUID (Ext-W.1: install-freshness check; uninstall on shared iPad invalidates).
5. App refresh: on every foreground, `PairingClient.refreshIfNeeded()` checks <24h TTL and calls `/api/kids/refresh`. On 401, probes `kid_profiles` directly with the still-valid JWT to disambiguate "graduated" from "expired".

### 10.4 Parental gate

Apple Kids Category requires parental verification before any sensitive action. Implementation: `ParentalGateModal` shows a math challenge (12–49 × 2–9; Ext-W9 upgrade — kids 9+ can solve, 5–8 struggle). Three attempts then 5-minute lockout (UserDefaults persisted).

Gated actions: unpair, expert sessions tab (session-sticky gate, C16), privacy/terms links, help email, account-level settings. On the web, parental gate is the same model for high-stakes actions on kid profiles.

### 10.5 Kid trial

Paid-family parents can enroll kids in a 7-day trial via `/api/kids/trial`. `users.kid_trial_used`, `kid_trial_started_at`, `kid_trial_ends_at` track state. Cron `sweep-kid-trials` (daily) calls `sweep_kid_trial_expiries()` to freeze expired trials.

### 10.6 DOB corrections

Parent submits via `POST /api/kids/[id]/dob-correction` with reason (10–280 chars), optional documentation URL. Direction (`younger` / `older` / `same`) computed from current vs requested. Younger-band corrections after cooldown can auto-approve via `dob-correction-cooldown` cron (with fraud signals: recent profile, paid upgrade, correction history, multiple kids, age shift > 2y). Older-band corrections require admin review at `/admin/kids-dob-corrections`. All decisions write `kid_dob_history` immutably.

### 10.7 Birthday band check

`birthday-band-check` cron computes age from DOB daily and stamps `birthday_prompt_at` when crossing band boundaries (10, 13). No auto-advance — parent must confirm in the dashboard.

### 10.8 Graduation

When a kid turns 13, parent triggers `graduate_kid_profile`. Effects:
- `kid_profiles.is_active=false` and `reading_band='graduated'`.
- A `graduation_tokens` row mints with `intended_email`, expiry, and parent stamp.
- Kids app detects on next refresh (or immediate via `KidsAppState.loadKidRow`), clears credentials, and routes to `GraduationHandoffView` (terminal screen — open email, or "I already claimed it" → web login).
- Parent email contains the claim link to the web `/welcome?graduation_token=…` flow.
- Web `POST /api/auth/graduate-kid/claim` consumes the token, attaches kid history (reading log, achievements, score) to a new adult account.

### 10.9 Family seats and add-kid

See §13.3. Atomic Stripe + profile creation via `/api/family/add-kid-with-seat` (idempotent, dry-run safe, rolls back charge on insert failure).

### 10.10 Family hub

Endpoints: `/api/family/config` (public-ish, 60s cache: max kids per tier, included kids, COPPA consent version, reading levels, extra kid price), `/api/family/seats` (manage paid seat count, Stripe-only), `/api/family/achievements`, `/api/family/leaderboard`, `/api/family/weekly-report`, `/api/family/add-kid-with-seat`.

State: **shipped end-to-end.**

---

## 11. Adult iOS app (VerityPost)

41 Swift files at `VerityPost/VerityPost/`. Platform-specific surface that mirrors the web reading experience and adds StoreKit IAP.

### 11.1 Navigation

`VerityPostApp` → `ContentView` (splash + auth gate) → `MainTabView` (Home / Notifications / Most Informed / Profile, text-only translucent tab bar). Splash animates 600ms, auth runs in background, 10s timeout falls back to manual retry.

### 11.2 Tabs

- **Home** — `HomeView` with `HomeFeedSlots` for recap upsell + in-feed ad.
- **Find** — `FindView` for keyword search (basic mode).
- **Most Informed** — `LeaderboardView` (anon-friendly).
- **Notifications** — `AlertsView` (inbox + alert preferences + push prompt).
- **Profile** — `ProfileView` with hero + 4 sub-tabs (Overview, Activity, Categories, Milestones).

### 11.3 Reading

`StoryDetailView` (Story / Timeline / Discussion tabs) with TTS, comments, quiz, sources, scroll-progress ribbon, mention autocomplete, bookmark toggle. `RecapView` for weekly recaps. `BookmarksView`, `MessagesView`, `PublicProfileView`.

### 11.4 Family / kids parent surface

`FamilyViews.swift` exposes the parent dashboard: list of kid profiles with stats, "Open Kids App" deep link (via `KidsAppLauncher` — falls back to `/kids-app` web until the kids app is published), pair-code generation, PIN set/reset, kid removal, family leaderboard, weekly report.

### 11.5 Services

- **`SupabaseManager`** — singleton client. URL/key from `Info.plist` (production) or env (DEBUG only).
- **`AuthViewModel`** — session state machine (loading, splash-timed-out, needs-email-verification, needs-onboarding, recovery, expired). Apple/Google/email auth. Deep-link handling for password recovery.
- **`PermissionService` + `PermissionStore`** — actor-based cache + SwiftUI-observable mirror. RPC `compute_effective_perms`. Refreshes on foreground, post-auth, post-subscription, post-login.
- **`StoreManager`** — StoreKit 2. SKUs: Verity Pro monthly/annual; Verity Family base + per-kid add-ons (1/2/3/4 kids monthly + annual). Legacy Pro SKUs kept for grandfather detection. Posts purchases to `/api/ios/subscriptions/sync`. Listens for transactions in background tasks. Plan priority: Family > Pro > Verity > Free.
- **`PushPermission` + `PushRegistration` + `PushPromptSheet`** — pre-prompt sheet (7-day decline cooldown), then OS dialog, then RPC token register.
- **`BlockService`** — singleton with cached block set. Refreshes on login + after every block change. Optimistic UI updates.
- **`EventsClient`** — analytics batching (20 events or ~32 KB triggers flush; force-flush on background). Posts to `/api/events/batch`. Anon-friendly.
- **`KidsAppLauncher`** — opens kids app by URL scheme, falls back to `/kids-app` marketing.
- **`TTSPlayer`** — audio playback for article TTS.

### 11.6 Auth views

`LoginView`, `SignupView`, `WelcomeView` (onboarding), `VerifyEmailView`, `ForgotPasswordView`, `ResetPasswordView`. Apple sign-in uses `CryptoKit` nonce.

### 11.7 Settings

`SettingsView` with sub-pages: Account (display name, bio, avatar, email, password, MFA), Preferences (newsletter, DM read receipts, show activity), Privacy & Safety (visibility, blocks, report history), Billing, Expert (apply, status), About (legal), Danger Zone (delete account, full logout).

### 11.8 Quality status

`REVIEW.md` (2026-04-19) audit identified ~20 hours of accessibility/UX polish work (P0: missing accessibility labels on 11 icon-only buttons, 13 sub-44pt touch targets; P1: hardcoded safe-area; P2/P3: token consolidation, haptics, reduce-motion checks, Dynamic Type). Tracked, not all closed.

State: **shipped (production-ready core); polish backlog open.**

---

## 12. Kids iOS app (VerityPostKids)

26 Swift files at `VerityPostKids/VerityPostKids/`. COPPA-constrained app for ages 5–12. Zero parent credentials on the device. Paired-device JWT only.

### 12.1 Auth and state

- **`PairCodeView`** — 8-slot code input. "Need help?" gated behind parental gate.
- **`KidsAuth`** — holds `kid: { id, name }` or `graduatedDisplayName` for terminal handoff. `restore()` on launch, `adoptPair()` after success, `signOut()` parental-gated, `signalGraduation()` on detection.
- **`PairingClient`** — Keychain persistence, `refreshIfNeeded()` rotates JWT at <24h TTL, install-freshness via device UUID (Ext-W.1), graduation probe on 401 (K2 — direct PostgREST call with valid JWT before clearing).
- **`SupabaseKidsClient`** — Supabase client with kid JWT injected as Authorization header. Exposes `restBaseURL` and `anonKeyForProbe` for the graduation probe path.
- **`KidsAppState`** — observable state. `kidId`, `kidName`, `readingBand` (`kids` | `tweens` | `graduated`), `visibleBands` (computed defense-in-depth filter), category tiles, streak/score/quizzes, `graduationDetected` publisher.
- **`GraduationHandoffView`** — terminal screen on graduation. No back button. Email + web-login affordances.

### 12.2 Reading and quiz

- **`ArticleListView`** — category feed. Server RLS + client-side `is_kids_safe=true` and `age_band IN visibleBands` (defense-in-depth). Max 30 per page.
- **`KidReaderView`** — paragraph-block render of `body` or `kids_summary`. Reading log inserted on quiz button tap (T-018: retry once). On second fail, `readingLogFailed=true` propagates to celebration scenes which soften copy.
- **`KidQuizEngineView`** — 5–10 question quiz, multi-choice, server-authoritative verdict via `get_kid_quiz_verdict` RPC at 60% threshold (C14). Per-answer write retried once; `writeFailures` count carried to scenes (K4).

### 12.3 Profile, leaderboard, experts

- **`ProfileView`** — name, avatar orb, stats grid, badge grid (gold/purple/teal/coral by rarity), unpair (parental-gated), privacy/terms (parental-gated). No settings, no email change, no preferences edit.
- **`LeaderboardView`** — three scopes: Family (`kid_family_leaderboard` SECURITY DEFINER RPC since base RLS hides siblings), Global (only `global_leaderboard_opt_in=true` profiles), Category (`get_kid_category_rank` RPC for real rank + opt-in pool size; replaces previous bug where RLS-narrowed query made everyone "rank 1"). Category pill selector for kids-safe categories (K13).
- **`ExpertSessionsView`** — scheduled expert sessions list. **Session-sticky parental gate** (C16) — must unlock once per cold-start; network call suppressed until unlock. Tap-to-expand session detail sheet.

### 12.4 Gamification scenes

- **`StreakScene`** — milestone (3/7/14/30 days) celebration. ~2-second choreography: flame scale → count-up → glow → expanding rings → 70-particle burst → milestone card. Reduce-motion aware.
- **`BadgeUnlockScene`** — full-screen badge reveal with shimmer sweep + pulse rings + 50-particle burst. Currently one badge wired (Bias Detection L3).
- **`GreetingScene`** — home screen with time-of-day greeting, typewriter kid-name, streak card, category grid with 5-pip progress per category. K6 task-based choreography with cancellation; K7 grapheme-cluster safe (handles emoji names).
- **`QuizPassScene`**, supporting primitives `KidPrimitives`, `FlameShape`, `ParticleSystem`, `CountUpText`.

### 12.5 Visual identity

`KidsTheme.swift` palette: Teal #2DD4BF / Coral #FB7185 / Gold #FBBF24 / Sky / Mint / Purple. Three spring presets (overshoot, snap, soft). T-029 `Font.scaledSystem` respects `UIFontMetrics` for accessibility. Color hex parser with sentinel fallback.

### 12.6 COPPA / Apple Kids Category boundaries

| Boundary | Implementation |
|---|---|
| No DMs / messaging | Removed from feature set entirely. |
| No comments | Removed; articles are read-only. |
| No external links without parental gate | Privacy, Terms, Help-email all gated. |
| Expert sessions discovery gated | Session-sticky parental gate (C16) before any network call. |
| Unpair gated | Math challenge before `signOut()`. |
| Global leaderboard opt-in only | Filter: `global_leaderboard_opt_in=true`. |
| Family leaderboard always available | SECURITY DEFINER RPC scoped to parent. |
| Age-appropriate content | `is_kids_safe` + `age_band` defense-in-depth (server RLS + client filter). |
| Graduation at 13 | Parent-triggered. Credentials cleared. Terminal handoff screen. |
| Accessibility | Reduce-motion skips choreography; Dynamic Type via `UIFontMetrics`; 44pt touch targets. |

State: **shipped end-to-end.** Wave 4 graduation flow complete.

---

## 13. Billing and subscriptions

### 13.1 Plans surface

See §1. Web buyers see Free + Verity Pro. iOS buyers see Free + Verity Pro + Verity Family (StoreKit only on web is `is_visible=false`).

### 13.2 Stripe (web + iOS Pro)

- **Checkout.** `POST /api/billing/checkout` (`billing.upgrade.checkout`). Day-bucket idempotency (`checkout:${userId}:${planName}:${YYYY-MM-DD}`). Refuses invisible plans and beta-comp users mid-comp window. Returns hosted Checkout URL.
- **Portal.** `POST /api/stripe/portal` (`billing.portal.open`). NO_STORE responses (URLs are single-use).
- **Plan change.** `POST /api/billing/change-plan`. Updates Stripe price-item (proration), then `billing_change_plan` RPC.
- **Cancel.** `POST /api/billing/cancel`. Stripe-first (`cancelSubscriptionAtPeriodEnd`), then `billing_cancel_subscription` RPC. Sets D40 grace window.
- **Resubscribe.** `POST /api/billing/resubscribe`. Resumes a canceled sub or routes to checkout, then unfreezes.

**Webhook** (`POST /api/stripe/webhook`):
- HMAC signature verified (fail-closed 400). 1 MiB size cap. Per-event-id replay rate-limit (5/300s).
- Atomic idempotency via `webhook_log.event_id` UNIQUE constraint with state machine (`received` → `processing` → `processed` | `failed`). Stale `processing` rows reclaimed after 5 min.
- Handlers (full list documented in `web/src/app/api/stripe/webhook`): `checkout.session.completed`, `customer.subscription.updated/.deleted`, `invoice.payment_succeeded/.payment_failed/.upcoming`, `customer.deleted`, `charge.refunded/.refund.updated/.dispute.created/.dispute.closed`.
- F-016 defenses on checkout.session.completed: shape-validate `client_reference_id` (UUID), prefer existing `stripe_customer_id` mapping, never overwrite different customer, require both `client_reference_id` AND `metadata.user_id` (T205) and they must match.
- Kid-seat reconciliation on subscription.updated: scan items for `seat_role='extra_kid'`, sum quantities, set `subscriptions.kid_seats_paid = min(4, 1 + extras)`.
- T-011 refund auto-freeze gate: `billing.refund_auto_freeze` setting (default false) — full refund either auto-freezes or routes to admin pending review.

### 13.3 Apple StoreKit 2

- **Receipt verification.** `web/src/lib/appleReceipt.js` parses JWS, verifies cert chain to Apple Root CA G3, ES256 signature. Clock skew: ±5min for S2S notifications, ±24h for first-pair sync.
- **Subscription sync.** `POST /api/ios/subscriptions/sync`. Defenses: B3 layer 1 (`appAccountToken` must match bearer's userId), B3 layer 2 (existing `apple_original_transaction_id` must match user). Resolves plan via `resolvePlanByAppleProductId`, calls `billing_change_plan` or `billing_resubscribe`, upserts `subscriptions` row.
- **App Store Notifications V2.** `POST /api/ios/appstore/notifications`. Apple JWS verified, idempotent via `webhook_log.event_id = apple_notif:${notificationUUID}`, 256 KiB cap. Handlers: SUBSCRIBED / DID_RENEW / DID_CHANGE_RENEWAL_PREF / OFFER_REDEEMED / REFUND_REVERSED → activate. EXPIRED / GRACE_PERIOD_EXPIRED / REVOKE / REFUND → freeze. Unknown types kept at `processing_status='received'` (B16) so a future handler can backfill.
- **Orphan fallback (B9).** If no subscriptions row exists for `originalTransactionId`, try `appAccountToken` → users lookup; mint a `pending` row.

### 13.4 Family seats (Phase 2 model)

`subscriptions.kid_seats_paid` (CHECK 0–4) tracks paid extra-kid count. Plan metadata exposes pricing. The `/api/family/seats` GET returns seat state; POST adjusts seat count (Stripe-only via web, refuses Apple/Google with 409). Decrease below active kid count is refused (orphan check).

`POST /api/family/add-kid-with-seat` is the atomic creator: idempotency-key required (header), `add_kid_idempotency` table backs replays. Flow: idempotency lock → state load → capacity check (≤ 4) → Stripe seat bump (existing item quantity++ or add new item; idempotency key `add_kid_seat:${user.id}:${idemKey}`) → `kid_profiles` insert → `subscriptions.kid_seats_paid` update → finalize idempotency. Failure paths: card declined (402), Stripe unreachable (502), insert failure rolls back the seat bump. Dry-run when `STRIPE_SECRET_KEY` or family-extra-kid price ID missing.

### 13.5 Lifecycle reconciliation

- **`subscription-reconcile-stripe`** (daily, 200 subs/run, 10 parallel Stripe calls). Drift-checks `kid_seats_paid` against live Stripe items.
- **`freeze-grace`** (hourly). Calls `billing_freeze_expired_grace()` to flip users past `plan_grace_period_ends_at` to `frozen`.
- **`pro-grandfather-notify`** (daily). Notifies legacy Pro subs ~30 days before renewal; ≤24h before, swaps Stripe price to Verity. Read-only dry-run if env vars missing. Apple subs use in-app banner.
- **`sweep-kid-trials`** (daily). Freezes expired 7-day trials.

### 13.6 Promos and access codes

- `promo_codes` (percent or amount discount, applies-to-plans, duration: once/repeating/forever, per-user uses, Stripe coupon ID linkage).
- `promo_uses` (audit per redemption).
- `POST /api/promo/redeem` (`billing.promo.redeem`).
- Admin: `/admin/promo`.

State: **shipped end-to-end.**

---

## 14. Ads, sponsors, monetization

### 14.1 Schema

- `ad_campaigns` — type (display/video/native/sponsored/affiliate), pricing model (CPM/CPC/CPA/flat), budget caps, dates, status, cumulative metrics.
- `ad_placements` — slot definitions: `placement_type`, `platform` (web/iOS/all), `page`, `position`, `width`/`height`, `max_ads_per_page`, `refresh_interval_seconds`, `min_content_before`, `is_kids_safe`, plus `hidden_for_tiers` (default `{verity_pro,verity_family,verity_family_xl}`) and `reduced_for_tiers` (default `{verity}`).
- `ad_units` — creatives. `ad_network`, `ad_format`, creative URL/HTML, click URL, alt text/CTA, targeting (categories, plans, cohorts, countries, platforms), frequency caps, `weight`, `is_nsfw`, approval workflow.
- `ad_impressions` — per-render row with viewability, click, fraud (`is_bot`, `fraud_reason`), revenue, ad network, IP/UA.
- `ad_daily_stats` — pre-aggregated per (date, ad_unit, placement, campaign, platform).
- `sponsors` — sponsor accounts with contact, contract dates, total spend.

### 14.2 Behavior

- Tier-based suppression: paid tiers have ads `hidden_for_tiers`. Free shows full; Verity (legacy) shows reduced inventory.
- Kids ads must be `is_kids_safe=true`; the kids app does not currently surface ads.
- Anonymous-friendly ad endpoints: `GET /api/ads/serve?placement=...`, `POST /api/ads/impression`, `POST /api/ads/click`. Rate-limited per IP. `is_bot` filter via `web/src/lib/botDetect.ts`.
- Admin: `/admin/ad-campaigns`, `/admin/ad-placements`, `/admin/sponsors`. Campaign CRUD with status toggles, creative approval, bulk via individual toggles.

State: **shipped (web infrastructure live).** AdSense slot integration is wired but tied to launch readiness (AdSense approval is a launch gate).

---

## 15. Admin tools (web)

50+ admin pages under `/admin/*`. Hub at `/admin` (page.tsx) with directory across 8 sections. Layout (`/admin/layout.tsx`) gates on `MOD_ROLES`; non-staff get 404 (no disclosure). Hub redirects mods to `/` if they lack `ADMIN_ROLES`.

Design system in `components/admin/`: Page, PageSection, DataTable, Toolbar, Button, Badge, Drawer, Modal, Spinner, Toast, DestructiveActionConfirm, ConfirmDialog, TextInput/Textarea/NumberInput/Select/Checkbox/Switch/DatePicker, StatCard, EmptyState, Field. Two palettes (`ADMIN_C` dark-bordered, `ADMIN_C_LIGHT` light-bordered for editorial). Spacing scale `S` (4px base), font scale `F`.

`adminMutation.ts` provides `requireAdminOutranks(targetUserId, actorId)` (RPC rank gate), `recordAdminAction(action, targetTable, targetId, oldValue, newValue, reason)` (best-effort audit via SECURITY DEFINER RPC), `permissionError()` (safe error envelope).

**Click-driven only — no keyboard shortcuts in admin.**

### 15.1 Content

- `/admin/stories` — global article list. Publish/unpublish/delete with audit. 500 articles cap per view.
- `/admin/breaking` — broadcast breaking-news alerts. Configurable char limit, throttle, daily max. Preview reach by tier, then send.
- `/admin/recap` — weekly recap curator.
- `/admin/story-manager` — adult editorial workspace. Title/slug/category/subcategory/breaking/developing/hero, timeline entries with quizzes per entry, sources, AI generation buttons.
- `/admin/kids-story-manager` — same UX, `is_kids_safe=true` filter.
- `/admin/tweens-story-manager` — partial; shares story-manager infrastructure.
- `/admin/reader` — reader-experience tuning (theme, typography, reading thresholds, registration wall, accessibility).
- `/admin/feeds` — RSS feed CRUD with health filters.
- `/admin/pipeline` (sub: `/runs`, `/runs/[id]`, `/costs`, `/settings`, `/cleanup`) — pipeline observability + control.
- `/admin/newsroom` — F7 cluster-first operator workspace.
- `/admin/categories` — taxonomy editor (tree view, parent/child, kids-safe, premium, soft-delete).
- `/admin/prompt-presets` — AI prompt preset CRUD.
- `/admin/words` — blocked-word list.

### 15.2 People / Community

- `/admin/users` — user list, role/plan filters, drawer with detail (devices, ban/unban, role/plan modals, permission console link, delete).
- `/admin/permissions` — five tabs: Registry / Sets / Role grants / Plan grants / User grants.
- `/admin/moderation` — penalty stack (warn/24h mute/7d mute/ban) with rank enforcement, role grants/revokes, appeal review.
- `/admin/reports` — moderator triage queue with supervisor-flag fast lane.
- `/admin/verification` — expert/educator/journalist application review with probation workflow.
- `/admin/data-requests` — GDPR/CCPA queue.
- `/admin/access` — access codes CRUD (referral type only post-T317).
- `/admin/access-requests` — beta access request approval (deprecating now that signup is open under invite gate).
- `/admin/referrals` — referral program (light surface; experimental).
- `/admin/cohorts` — user cohorts and targeting.
- `/admin/comments` — discussion platform config (quiz gate, AI tags, sorting, role badges, threading, health score).
- `/admin/kids-dob-corrections` — DOB correction queue.
- `/admin/expert-sessions` — schedule live kid Q&A windows.
- `/admin/support` — ticket inbox (categorized, drawer thread, chat-widget config).

### 15.3 Money

- `/admin/plans` — feature matrix editor.
- `/admin/subscriptions` — seven tabs: Cancel / Overview / Revenue / Grace / Paused / Refunds / Events.
- `/admin/ad-campaigns`, `/admin/ad-placements`, `/admin/sponsors`, `/admin/promo`.

### 15.4 Communications

- `/admin/notifications` — push + email config + log + compose panel.
- `/admin/email-templates` — versioned templates.

### 15.5 Ops

- `/admin/analytics` — overview / stories / quizzes (failure rates with thresholds) / resources (Supabase + Vercel usage).
- `/admin/system` — transparency settings, monitoring config, rate-limits configurator, audit log.
- `/admin/settings` — KV settings editor with confirm modal (T-127).
- `/admin/features` — feature flag observability.
- `/admin/streaks` — streak/gamification config.
- `/admin/webhooks` — overview health + log with filters + retry per row.

### 15.6 Audit

`admin_audit_log` (with `actor_user_id`, `action`, `target_table`, `target_id`, `old_value`, `new_value`, `reason`, `ip`, `user_agent`) is written by the RPC layer. Admin pages surface it in Settings and System.

State: **shipped.** Tweens story-manager is the main partial. Remaining experimental: detailed referrals, some sponsor flows.

---

## 16. Background jobs (cron)

Seventeen registered cron jobs (19 handlers in `api/cron/`; 2 unregistered: `cleanup-data-exports`, `rate-limit-cleanup`) in `/api/cron/*`, declared in `web/vercel.json`. All use `verifyCronAuth()` (Vercel `x-vercel-cron` header is sufficient proof; CRON_SECRET bearer accepted as fallback for manual triggers). All wrapped in `withCronLog` for `webhook_log` rows + Sentry on >30s. Heartbeats via `cronHeartbeat.js` write start/end/error markers.

| Job | Schedule (UTC) | Purpose |
|---|---|---|
| sweep-kid-trials | 03:00 | Freeze expired 7-day kid trials. |
| recompute-family-achievements | 03:30 | Sweep active family owners; recompute family achievements. |
| anonymize-audit-log-pii | 03:30 | NULL PII fields on `audit_log` rows older than 90 days. |
| purge-audit-log | 03:35 | Hard-delete `audit_log` rows older than 365 days. |
| check-user-achievements | 03:45 | Award time-based achievement unlocks. |
| process-deletions | 04:00 | Anonymize then `auth.admin.deleteUser` rows past 30-day grace. |
| purge-webhook-log | 04:00 | Hard-delete `webhook_log` rows older than 30 days. |
| freeze-grace | 04:15 | Freeze users past `plan_grace_period_ends_at`. |
| flag-expert-reverifications | 04:30 (Mon) | Flag experts whose credentials expire within 30 days. |
| process-data-exports | 04:30 | Generate + upload user data exports (GDPR), notify user. |
| send-emails | 04:45 | Batch dispatch queued email notifications via Resend. |
| send-push | 05:00 | Batch dispatch queued APNs pushes. |
| sweep-beta | 05:30 | Manage beta cohort comp window per `beta_active` setting. |
| pipeline-cleanup | 06:00 | Four-sweep safety net for pipeline state (orphan runs, items, locks, expired clusters). |
| birthday-band-check | 06:15 | Stamp `birthday_prompt_at` on kid profiles crossing band age boundaries. |
| dob-correction-cooldown | 06:30 | Auto-approve younger-band DOB corrections after cooldown (with fraud signals). |
| subscription-reconcile-stripe | 06:45 | Drift-check `kid_seats_paid` against Stripe (200 subs/run, 10 parallel). |
| pro-grandfather-notify | 07:00 | Notify legacy Pro subs; migrate Stripe price ≤24h before renewal. |

State: **shipped end-to-end.** Pipeline cleanup depends on migrations 116/120/126 applied (sweeps no-op until then).

---

## 17. Observability and operations

- **Audit logs.** `admin_audit_log` (actor + action + target + before/after + IP/UA) for staff actions. `audit_log` is the broader system audit trail (also captures cron, RPC, and user-state changes).
- **Webhook log.** `webhook_log` is the unified ingest log for Stripe, Apple S2S, and cron heartbeats. UNIQUE constraint on `event_id` is the idempotency primitive. 30-day retention via `purge-webhook-log` cron.
- **Error log.** `error_logs` rows from web/iOS via `/api/errors`. Sentry integration via `instrumentation.ts` + `sentry.client.config.js`.
- **Events / analytics.** Two systems: `analytics_events` (legacy, per-user/kid/session, screen+element) and partitioned `events` (new, daily partitions e.g. `events_20260427`, `events_default`; richer fields including consent flags, experiment bucket, hashed UA/IP). Posted via `/api/events/batch`.
- **Reading log.** `reading_log` (per-user/kid, article, percentage, time, source, points). Used for streaks, home "read" dimming, weekly recap "missed" lists.
- **Pipeline runs / costs.** `pipeline_runs` and `pipeline_costs` covered in §4.
- **Health.** `GET /api/health` (anonymous).
- **Rate limits.** `rate_limits` (configurable policies, plan-tier scoping), `rate_limit_events` (rolling counters).
- **CSP reports.** `POST /api/csp-report` collects violations against the strict report-only policy; informs the migration to drop `'unsafe-inline'`.
- **Sessions / device sessions.** `sessions` (auth) and `user_sessions` (analytics) cover device + entry/exit.

Sentry is wired but deferred pre-launch (paid tool — revisit when monetization or paging pain is real).

State: **shipped.**

---

## 18. Security and abuse defense

| Defense | Where |
|---|---|
| **CSP with per-request nonce + `strict-dynamic`** | `middleware.js`. Primary policy + strict report-only for migration tracking. |
| **CORS allow-list (no env trust)** | Middleware. iOS unaffected (no browser CORS engine). |
| **CSRF protection** | All mutating POST routes require Authorization bearer (not cookies-only). Origin allow-list on browser callers. |
| **Webhook idempotency** | `webhook_log.event_id` UNIQUE; atomic claim via INSERT-or-conditional-UPDATE state machine. |
| **F-016 customer binding** | Stripe webhook validates `client_reference_id` shape, prefers existing customer mapping, requires `metadata.user_id` parity (T205). |
| **B3 Apple receipt binding** | `appAccountToken` must match bearer (layer 1) AND `(apple_original_transaction_id, user_id)` row match on upsert (layer 2). |
| **F-077 prompt injection defense** | Source text + freeform instructions wrapped in `<source_article>` markers; injection directive substrings stripped. |
| **F-078 upstream error redaction** | Pipeline LLM error bodies stored server-side only; never echoed to clients. |
| **Atomic seat + profile** | `add-kid-with-seat` idempotency-key + table; rolls back charge on insert failure. |
| **Rank enforcement** | `require_outranks()` RPC prevents lower-ranked admins from acting on higher-ranked users. |
| **Login lockout** | 5 fails / 15 min. |
| **Rate limiting** | Per-route, per-user, per-IP. `rate_limits` table policy-driven. |
| **Bot detection** | `botDetect.ts` for ad endpoints; `is_bot` flag on `analytics_events` and `events`. |
| **Blocked-word screening** | `blocked_words` (severity, action: flag/block/replace, applies-to surfaces) screens comments, messages, usernames, bios. |
| **CSAM scanning** | `articles.csam_scanned`, `media_assets.csam_scanned` flags. NCMEC CyberTipline integration for urgent reports (`csam`, `child_exploitation`, `grooming`) — currently stubbed pending ESP registration. |
| **Kid JWT signature** | Custom-minted, never via GoTrue (kid is not in `auth.users`). PostgREST verifies signature; RLS branches on `is_kid_delegated` claim. |
| **Install freshness (kids)** | Device UUID paired with Keychain token; uninstall on shared iPad invalidates. |
| **Parental gate (math challenge)** | Kids app: 12–49 × 2–9, 3 attempts → 5-min lockout (UserDefaults). |
| **Refund auto-freeze gate (T-011)** | Setting-controlled: full refund → freeze or admin pending review. |

State: **shipped.** NCMEC stubbed.

---

## 19. Compliance

### 19.1 COPPA (Children's Online Privacy Protection Act)

- Verifiable parental consent collected, version-stamped (`COPPA_CONSENT_VERSION`), stored in `parental_consents` with IP/UA.
- Kid PIN gating on app access (PBKDF2-SHA256, 100K iter, 16-byte salt).
- Pairing token single-use, ~15-min TTL.
- No DMs, no comments, no UGC from kid surface.
- Global leaderboard opt-in only.
- DOB correction system with admin review for older-band changes.
- Graduation flow at 13 (terminal handoff, kids credentials cleared).
- COPPA-eligible permissions explicitly seeded in `is_kids_set=true` permission sets.

### 19.2 Apple Kids Category

- Parental gate before any external link, account action, or expert-contact discovery (session-sticky on expert sessions).
- 44pt minimum touch targets (REVIEW.md tracks remaining gaps).
- No third-party analytics, no behavioral advertising, no in-app purchases without parental gate.
- COPPA-aligned data handling.
- Reduce-motion respect on all animated scenes.
- No links out without parental approval.

### 19.3 GDPR / CCPA

- `data_requests` (type: export | delete, regulation, identity verification, deadline, legal hold).
- `POST /api/account/data-export` triggers async export (queue → cron → signed URL → notification).
- `POST /api/account/delete` triggers 30-day grace then anonymize+hard-delete.
- Audit log PII anonymized at 90 days; hard-deleted at 365 (`anonymize-audit-log-pii` + `purge-audit-log`).

### 19.4 DMCA

`/dmca` page with takedown procedure. `reports.target_type='copyright'` accepted.

### 19.5 Apple App Store policies

- 5.1.1.v deletion: hard-delete via `auth.admin.deleteUser` after grace.
- 1.2 UGC moderation: block + report on every UGC surface; bidirectional block.
- 3.1.2 subscription disclosure: `SubscriptionView` shows period, price, renewal terms, cancellation steps, T+P links.

### 19.6 Accessibility

- WCAG AA color contrast (primary copy `--text` against `--bg`; `--dim` recalculated to `#5a5a5a` for AA).
- Skip-to-main link.
- Reduced-motion baseline (all CSS animations collapse to 0.01ms when OS prefers).
- Form focus outlines (2px solid).
- iOS notch safe-area handling (`viewport-fit=cover`, `env(safe-area-inset-*)`).
- `/accessibility` page documents WCAG, keyboard, screen-reader, focus management.
- iOS REVIEW.md tracks remaining gaps (icon labels, touch targets, Dynamic Type).

State: **shipped (NCMEC stubbed; A11y backlog).**

---

## 20. Database surface (table inventory)

A condensed map. Full schema is the source of truth (`currentschema`).

**Identity & access:** `users`, `auth_providers`, `sessions`, `user_sessions`, `auth_providers`, `roles`, `user_roles`, `permissions`, `permission_sets`, `permission_set_perms`, `role_permission_sets`, `plan_permission_sets`, `user_permission_sets`, `permission_scope_overrides`, `perms_global_version`, `reserved_usernames`.

**Plans & billing:** `plans`, `plan_features`, `subscriptions`, `subscription_events`, `invoices`, `iap_transactions`, `promo_codes`, `promo_uses`, `webhook_log`.

**Content:** `articles`, `article_relations`, `categories`, `feeds`, `discovery_items`, `feed_clusters`, `feed_cluster_articles`, `pipeline_runs`, `pipeline_costs`, `ai_models`, `ai_prompt_presets`, `ai_prompt_preset_versions`, `ai_prompt_overrides`, `sources`, `timelines`, `quizzes`, `quiz_attempts`, `weekly_recap_quizzes`, `weekly_recap_questions`, `weekly_recap_attempts`, `media_assets`, `sponsors`.

**Engagement:** `reading_log`, `score_events`, `score_rules`, `score_tiers`, `category_scores`, `streaks`, `achievements`, `user_achievements`, `family_achievements`, `family_achievement_progress`, `bookmarks`, `bookmark_collections`, `follows`, `user_preferred_categories`.

**Discussion:** `comments`, `comment_votes`, `comment_context_tags`, `expert_applications`, `expert_application_categories`, `expert_discussions`, `expert_queue_items`, `category_supervisors`, `kid_expert_sessions`, `kid_expert_questions`.

**Direct messages:** `conversations`, `conversation_participants`, `messages`, `message_receipts`.

**Notifications:** `notifications`, `alert_preferences`, `push_receipts`, `user_push_tokens`, `email_templates`, `campaigns`.

**Family / kids:** `kid_profiles`, `kid_sessions`, `kid_pair_codes`, `kid_category_permissions`, `parental_consents`, `kid_dob_correction_requests`, `kid_dob_history`, `add_kid_idempotency`, `graduation_tokens`, `kids_waitlist`.

**Moderation & abuse:** `blocked_users`, `blocked_words`, `reports`, `user_warnings`.

**Ads:** `ad_campaigns`, `ad_units`, `ad_placements`, `ad_impressions`, `ad_daily_stats`.

**Ops:** `admin_audit_log`, `audit_log`, `error_logs`, `events` (+ daily partitions `events_YYYYMMDD`, `events_default`), `analytics_events`, `feature_flags`, `app_config`, `cohorts`, `deep_links`, `data_requests`, `support_tickets`, `ticket_messages`, `rate_limits`, `rate_limit_events`, `search_history`, `settings`.

---

## 21. Engagement-friction inventory — what users see

This is the abandonment-fighting reference. Earlier sections describe what the system **does**; this section catalogs every gate, banner, modal, paywall, lockout, cooldown, empty state, and interstitial that a user **sees**. Use it to find every moment a user can drop off, and exactly what's shown at that moment.

**A note on copy.** This section describes **behavior** (trigger condition, recovery action, code path), not user-facing copy strings. Quoted text appears only where the literal string was confirmed in source — and the few places it does appear are flagged with a file path. Do NOT lift "the copy" from this document into a UX review; go to the cited source file for the authoritative wording. If you change a banner string in code, update the matching row here only if you also confirm the literal.

Conventions:
- **Trigger** — the state or action that surfaces the friction.
- **Behavior** — what's shown abstractly (banner, modal, inline error, silent skip), plus the recovery action offered.
- **Where** — the relevant code path or component.

### 21.1 Auth & onboarding friction

| Surface | Trigger | Behavior + recovery | Where |
|---|---|---|---|
| Splash + session-check timeout (iOS) | App cold start; session check exceeds the configured timeout. | Branded splash animates while the session check runs; on timeout, fallback view offers retry and a path to continue without signing in. | `VerityPost/VerityPost/ContentView.swift`, `AuthViewModel.retrySession()` |
| Login lockout countdown | `users.locked_until > now()` after repeated sign-in failures. | Banner indicates account is temporarily locked; recovery is "Reset password" (separate rate limit) or wait. Admin override exists. | `users.locked_until`; threshold in `web/src/app/admin/system/page.tsx` rate-limit config; surfaced via `/api/auth/login-precheck`. Admin override: `/admin/auth-recovery`. |
| Reset-password rate limit | Repeated reset-password calls. | Inline form error; uniform copy (no enumeration). | Rate limit policy in DB `rate_limits` table. |
| "Check your email" (no enumeration) | `/forgot-password` submit, regardless of account existence. | Same affirmative response in either case; resend cooldown enforced. Provider deep-link buttons. | `/forgot-password/page.tsx` |
| Email-verification gate | Signup or post-email-change. | Page surfaces several states: waiting (resend), success, expired, rate-limited. Inputs masked. | `/verify-email/page.tsx`; iOS `VerifyEmailView.swift` |
| Email-unverified soft state | Signed in but `email_verified=false`. | Profile activity hidden; report-comment flow refuses verification check; some admin features blocked. No global blocking banner currently. | Multiple call sites; check `users.email_verified` before action. |
| Welcome onboarding carousel | First sign-in (`onboarding_completed_at` null) or post-graduation token. | Multi-screen carousel with Next/Prev; final step routes to `?next=` or home (`resolveNext()` validates). Skippable. Stamp failure surfaces an inline retry. | `web/src/app/welcome/page.tsx` |
| Anonymous bottom-nav slots | Anon visitor on web. | Same 4-slot bottom nav for anon and signed-in. `/notifications` and `/leaderboard` render anon CTA in-page (NOT middleware redirect — owner directive 2026-04-26). | `web/src/middleware.js`; per-page anon empty states. |
| Story registration wall | Anon visitor opens N+1 story (configurable via `registration_wall` setting). | `Interstitial` modal with sign-up CTA; dismiss defers wall for current session only. Article body remains readable below the limit. | `Interstitial.tsx`; setting `registration_wall.free_article_limit`. |
| Public profile sign-in CTA | Anon hits `/u/[username]`. | Profile renders read-only with a sign-in overlay. Returns 404 if `profile_visibility='private'`. | `/u/[username]/page.js`; gated by `PUBLIC_PROFILE_ENABLED` flag. |
| Session-expired banner | Token refresh fails. | Top banner offers re-sign-in. Dismissible. | `web/src/middleware.js`, iOS `ContentView.swift`. |
| Account-deletion grace banner | `deletion_scheduled_for` set (30-day window). | Banner with cancel-deletion CTA on every page. Login during grace can also cancel. | `AccountStateBanner.tsx`; cron `process-deletions`. |

### 21.2 Beta + coming-soon walls

| Surface | Trigger | Behavior + recovery | Where |
|---|---|---|---|
| `/beta-locked` landing | Anon visitor without a valid invite cookie. Six `?reason=` codes drive copy: `no_cookie`, `invalid_cookie`, `code_not_found`, `code_disabled`, `code_expired`, `code_exhausted`. | Reason-specific message; CTAs to request access and to existing-account login. | `/beta-locked/page.tsx` |
| `/welcome` coming-soon card | `NEXT_PUBLIC_SITE_MODE=coming_soon`. All routes redirect except `/api/*`, `/admin/*`, `/preview`, `/welcome`, `/_next/*`, `/ideas/*`, robots/sitemap/favicon. | Brand card with email signup; writes to `access_requests`. `X-Robots-Tag: noindex, nofollow`. Owner bypass: `/preview?token=…` → `vp_preview=ok` cookie. | `web/src/middleware.js`; `web/src/app/welcome/page.tsx`. |
| Beta gate redirect | `NEXT_PUBLIC_BETA_GATE=1` AND anon, AND not on allowlist. | 302 → `/login?next=…`. | `web/src/middleware.js`. |
| Invite redeem `/r/[slug]` | Visitor with invite link. | Code validation; on success writes `vp_ref` cookie + redirects to `/login?mode=create`. On invalid → `/beta-locked?reason=…`. | `/r/[slug]/page.tsx`. |

### 21.3 Permission denial rendering

The DB defines two deny modes per permission key (`permissions.deny_mode`):

- **`locked`** — element renders, **disabled**, with `LockModal` or `LockedFeatureCTA` showing the permission's `lock_message` (sourced from DB) and a CTA. User sees the feature exists.
- **`hidden`** — element does not render. Direct URL navigation returns 404. User does not learn the feature exists.

| Surface | Trigger | Behavior | Where |
|---|---|---|---|
| `LockedFeatureCTA` | Any `locked` deny on a paid feature. | Faded pill/button with lock icon and inline upgrade copy (from DB `lock_message`). Tap opens `LockModal`. | `web/src/components/LockedFeatureCTA.tsx`. |
| `LockModal` | Locked button tapped, or paid feature interaction blocked. | Modal renders DB-sourced `lock_message`; CTA routes to upgrade surface. | `web/src/components/LockModal.tsx`. |
| `PermissionGate` | Wrapper component. | Renders children only if granted; renders denied fallback (lock/hide) per `deny_mode`. | `web/src/components/PermissionGate.tsx`. |
| Notifications inbox denied hero (iOS) | `notifications.inbox.view` denied. | Empty hero card explaining feature. | `VerityPost/VerityPost/AlertsView.swift`. |
| Expert queue empty (iOS) | `expert.queue.view` denied. | Empty state with link to apply. | `VerityPost/VerityPost/ExpertQueueView.swift`. |
| Expert sessions parental gate (kids) | First tap of "Experts" tab post-cold-start (C16 session-sticky). | Placeholder card asks for parent verification; **network call suppressed until gate passes** (no data egress). Persists until cold-start. | `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`. |
| `UnderConstruction.tsx` | Pre-launch surface intentionally inert. | Card explaining feature is not yet live (no user-facing timelines per project policy). | `web/src/components/UnderConstruction.tsx`. |

### 21.4 Account-state banners

`AccountStateBanner` (web) and equivalent iOS banners surface several account states. Severity (red/amber) and CTA differ per state. **Literal copy strings vary across web routes (`web/src/components/AccountStateBanner.tsx` vs `web/src/app/profile/page.tsx` vs `web/src/app/redesign/_components/AccountStateBanner.tsx`); read the component for the authoritative wording.**

| State | Trigger | Behavior + recovery |
|---|---|---|
| **Banned** | `is_banned=true`. | Banner reports suspended state. Reason rendered only if a moderator stamped one in `user_warnings`. CTA: Appeal → `/appeal`. |
| **Shadow-banned** | `is_shadow_banned=true`. | **No banner. Invisible to user.** Comments insert with status `visible` but never render to other readers. By design. |
| **Muted** | `is_muted=true` and `muted_until > now()`. | Banner with countdown to `muted_until`; comment + DM composers replaced inline. The literal mute-banner string adds the qualifier "You can read and react but not post comments" — confirmed in `AccountStateBanner.tsx` and `CommentComposer.tsx`. CTA: Appeal. |
| **Frozen** | `frozen_at` set (post-grace expiry, refund auto-freeze, or webhook freeze). | Banner indicates score is frozen; `frozen_verity_score` rendered as a held value. CTA: Resubscribe → `/billing`. iOS profile shows red frozen banner. |
| **Grace period** | `plan_grace_period_ends_at > now()` (cancellation window or failed renewal). | Banner with day countdown. User retains paid perms during grace. CTA: Resume billing → `/billing`. Cron `freeze-grace` flips to frozen at expiry. |
| **Locked (login)** | `users.locked_until > now()`. | See §21.1 login lockout. CTA: Reset password / wait. |
| **Deletion scheduled** | `deletion_scheduled_for` set. | Banner with calendar date and cancel-deletion CTA. |
| **Payment failed (pre-grace)** | Stripe `invoice.payment_failed` webhook. | Soft notification with update-card CTA → `/stripe/portal`. No immediate freeze; Stripe retries per its schedule. |

### 21.5 Paywalls and upgrade walls

Every place a paid feature meets a non-paid user.

| Feature | Free behavior | Paywall surface |
|---|---|---|
| **Bookmarks** | Cap enforced by DB trigger `enforce_bookmark_cap` (free default 10, sourced from `plan_features.bookmarks.limit_value`). Hard 422 on the cap-blowing save. UI cap counter and warning escalation present (see `web/src/app/bookmarks/page.tsx` and `BookmarksView.swift` for current thresholds and copy). | Inline upgrade CTA on `/bookmarks` and on the story-page bookmark button. iOS `BookmarksView` mirrors. |
| **Bookmark collections + notes + export** | Unavailable on free. | Locked CTA on collection-create button per DB `lock_message`. |
| **Search advanced filters** | Filter panel renders; filters silently ignored server-side for non-paid callers (defense in depth). | Inline upgrade hint on disabled filters. iOS basic mode only. |
| **DM compose** | Cannot start a conversation. | Compose button locked (DB `lock_message`). Recipient never sees an attempt. |
| **Mention autocomplete in comments** | Pre-submit hint when `@` appears in draft; on submit, `mentions[]` silently dropped server-side (D21). Comment posts as plain text. | Hint in composer; no modal. |
| **Expert response unblur** | Expert reply rendered with CSS blur and an overlay; tap on a blurred expert reply → `LockModal`. | Upgrade CTA → `/profile/settings#billing`. |
| **Profile card share** | Share button rendered disabled. `/card/[username]` itself returns 200 to all visitors. | LockModal on tap. |
| **Followers / following counts** | Hidden on free (`profile.followers.view.own`). | Inline tile. |
| **Leaderboard category + period filters** | Pills render. Free clicking a paid pill: API silently returns empty — UI shows `EmptyState`. Time-period: only past_24h returned for free. | Indirect — empty state. No explicit upgrade CTA on leaderboard yet. |
| **Leaderboard top-N anon** | Top rows visible; remainder under sign-up overlay. | "Sign up" CTA. |
| **TTS player** | `article_reading.tts.play` denied → button hidden (iOS) or `LockedFeatureCTA` (web). | `LockModal`. |
| **Quiz unlimited attempts** | Daily attempt cap on free (sourced from `plan_features.quiz_attempts.limit_value`); after exhaustion the retry CTA flips to upgrade. | `LockModal`. |
| **Recap list** | `recap.list.view` denied (and currently launch-hidden via `LAUNCH_HIDE_RECAP=true`). | Landing card explaining feature. |
| **Breaking-news push (free daily cap)** | `plan_features.breaking_alerts.limit_value` per day (D14). Push is **silently skipped** beyond cap. Cap resets daily. | None — silent. (Trade-off: limits noise, hides paywall.) |

### 21.6 Quiz wall and comment quiz gate

| State | Behavior |
|---|---|
| Quiz not yet attempted | `ArticleQuiz` component renders above the comment composer. Comment composer collapsed. |
| Quiz attempt in progress | Multi-choice questions; per-question feedback on submit; explanation rendered. Question count varies per `quizzes` rows for the article. |
| Quiz failed (free, attempts remain) | Result card with score percentage; retry button. |
| Quiz failed (free, attempts exhausted) | Retry button replaced with upgrade CTA → `/profile/settings#billing`. |
| Quiz passed | Composer unlocks. iOS surfaces a celebration toast; score event awarded. |
| Comment-post attempt without pass | `POST /api/comments` returns 403 with explicit guidance to pass the quiz (gate via `user_passed_article_quiz` RPC). Composer disabled inline. |
| Vote without pass | Same 403 (except clearing votes is always allowed, by design). |

### 21.7 Comment composer states

| Trigger | Behavior |
|---|---|
| Anon | Composer replaced with sign-up CTA inline. |
| Quiz not passed | Inline guidance with quiz scroll-to. |
| Banned | Composer replaced with red banner; appeal link. Reason exposed only if a moderator stamped one in `user_warnings`. |
| Muted | Banner with `muted_until` countdown and read-and-react qualifier (literal in `CommentComposer.tsx`); appeal link. |
| Shadow-banned | Composer functions normally; comments insert with status `visible` but never render to other readers. **No indication.** By design. |
| Frozen / grace | Composer replaced with banner; recovery CTA points to billing. |
| Recipient blocks sender (DM) | DM `post_message` returns uniform 403; sender sees Toast (block status not leaked). |
| Mention as free user | Pre-submit hint; mentions silently dropped on submit. |
| Hidden comment (moderator action) | Body replaced with a placeholder. Reasoning shown if moderator added it. Reply count + votes zeroed. |
| Deleted comment (author) | Body replaced with a placeholder. |

### 21.8 Push notifications friction

| Surface | Trigger | Behavior |
|---|---|---|
| Pre-prompt sheet (`PushPromptSheet`) | First time eligible; not previously declined; not already authorized. | Sheet asks before the OS dialog (so a decline doesn't burn the OS-level prompt). | `VerityPost/VerityPost/PushPromptSheet.swift` |
| Decline cooldown | "Not now" tapped. | `markPrePromptDeclined()` stamps a cooldown in UserDefaults; sheet does not re-open within the window. | `PushPromptSheet.swift` / `PushPermission.swift` for the literal duration. |
| Previously denied (OS-level) | User declined the OS dialog earlier. | Sheet replaced with an "Open Settings" deeplink CTA. |
| OS dialog | Sheet "Turn on" tap → `requestAuthorization`. | System dialog. Result event fires `push_prompt_result` analytics. |
| Quiet hours suppression | `alert_preferences.quiet_hours_start..end` for the user, evaluated in caller's TZ. | **Silent** — push not sent. No in-app indicator. |
| Channel disabled per type | Per-type `channel_push=false`. | **Silent** skip. |
| Token invalidated | APNs returned `BadDeviceToken` / `Unregistered` etc. | `user_push_tokens.invalidated_at` set. User is not notified; they re-register on next foreground. |

### 21.9 Billing friction

| Surface | Behavior + recovery | Where |
|---|---|---|
| Stripe checkout cancel return | User lands back at originator with a flash banner; no state change. | `web/src/app/billing/page.tsx`, `/api/stripe/checkout`. |
| Card declined on add-kid | `/api/family/add-kid-with-seat` → 402. Inline error, no kid created. | `/api/family/add-kid-with-seat/route.ts`. |
| Stripe unreachable | 502 with idempotency-key-preserved retry. | Same route. |
| Family at-cap | `kid_profiles` count = `plans` `max_kids`. Add-kid button disabled with banner; CTA to manage subscription. | `FamilyViews.swift`, `/profile/kids/page.tsx`. |
| Decrease seats below active kids | `POST /api/family/seats` refuses with 409 + orphan-check error. UI inline error. | `/api/family/seats/route.ts`. |
| Apple/Google sub trying to manage seats on web | 409 + code `platform_apple` / `platform_google`. UI redirects to App Store. | Same route. |
| Comped beta user attempting checkout | 409 + `comped_until` date (T304). UI explains the comp window. | `/api/billing/checkout/route.js`. |
| Plan not purchasable | Web checkout refuses Family plans (`is_visible=false`); routes user to iOS subscription. | Same route. |
| Refund auto-freeze (T-011 setting `true`) | Full refund → immediate freeze + AccountStateBanner. | Stripe webhook handler. |
| Refund pending review (T-011 setting `false`, default) | User notification stamped; admin queue handles freeze decision. | Stripe webhook handler; admin `/admin/subscriptions` Refunds tab. The literal user notification text lives in `web/src/app/api/stripe/webhook/route.js`. |
| Dispute opened | Notification flagged for review; subscription continues. | Stripe webhook handler. |
| Promo code invalid / expired / per-user limit | Inline error in promo input (literal copy varies by failure mode). | `/api/promo/redeem/route.ts`. |
| Trial about to end | `invoice.upcoming` (~7 days out) → user notification with renewal date and amount. | Stripe webhook handler. |
| Subscription change preview | `/billing/change-plan` shows proration estimate before commit. | `/billing/change-plan/page.tsx`. |

### 21.10 Kids friction

| Surface | Trigger | Behavior | Where |
|---|---|---|---|
| Pair-code entry — wrong code | `POST /api/kids/pair` returns 400. | Inline error indicating code didn't validate. Code field clears. The literal client error message is "That code isn't valid. Ask for a fresh one." | `VerityPostKids/VerityPostKids/PairingClient.swift:41`. |
| Pair-code entry — expired code | Code TTL elapsed. | Same surface (uniform error to avoid leaking validity). Parent regenerates. | Server-side enforcement in pair-code RPC. |
| Pair-code rate-limit cooldown | Rate limit on `/api/kids/pair`. | Cooldown countdown timer on the entry view. | `PairCodeView.swift`; rate policy in DB `rate_limits`. |
| Parental gate math challenge | Kid taps a parental-gated action (unpair, expert sessions first time, Privacy/Terms/Help links). | Modal asks a simple multiplication challenge with number-pad input. | `VerityPostKids/VerityPostKids/ParentalGateModal.swift` for parameters (range, attempts, lockout). |
| Wrong answer | Wrong number entered. | New random question; kid-friendly error wording. | Same file. |
| Repeated wrong answers | Failure threshold met. | Lockout countdown; persisted in UserDefaults (survives app restart). Literal threshold and lockout duration live in `ParentalGateModal.swift`. | Same file. |
| Kid quiz fail | Server verdict below threshold. | Retry path; no streak bump; no celebration. | `KidQuizEngineView.swift`; `get_kid_quiz_verdict` RPC. |
| Kid quiz pass — clean | Verdict pass; reading log + all writes succeeded. | `QuizPassScene` celebration → `StreakScene` (if streak bumped) → `BadgeUnlockScene` (if a badge unlocked). | `KidQuizEngineView.swift` orchestrator. |
| Kid quiz pass — write failures | Same verdict, but `writeFailures > 0` or `readingLogFailed = true` carried into result. | Celebration scenes soften (less choreography). User isn't told writes failed; experience is calmer. | `KidQuizResult` propagation to scenes. |
| Streak +1 (non-milestone) | Day count went up but not a milestone day. | Quiet streak indicator update on home. | `StreakScene.swift`. |
| Streak milestone | Hit a marker day (literal milestone list lives in `StreakScene.swift`). | Full `StreakScene` choreography with milestone card. Reduce-motion → snap to final state. | `StreakScene.swift`. |
| Badge unlock | Criterion met (Bias Detection L3 currently the only client-eligible trigger). | `BadgeUnlockScene`. Reduce-motion → instant reveal. | `BadgeUnlockScene.swift`. |
| Graduation handoff | Server-side `kid_profiles.is_active=false` OR `reading_band='graduated'`, detected by `KidsAppState.loadKidRow` or `PairingClient.refreshIfNeeded()` 401-then-probe. | `GraduationHandoffView` — terminal screen, no back. Greets by name. Two affordances: open email + web login. Credentials cleared. Token TTL per `graduation_tokens.expires_at`. | `GraduationHandoffView.swift`. |
| PIN attempts ladder | `kid_profiles.pin_attempts` increments on wrong PIN. | Eventually `pin_locked_until` set; lockout countdown. Unblocks at expiry. | DB columns + iOS PIN view. |
| Expert sessions session-sticky gate | First tap of Experts tab post-cold-start. | Placeholder card; **no session data fetched until gate passes**. Post-gate: tap-to-expand sheet on cards. | `ExpertSessionsView.swift`. |
| Privacy / Terms / Help-email taps | Kid taps any external-link surface. | Parental gate triggered before navigation. Post-gate: link follows. | Profile + settings paths. |
| Empty leaderboard scopes | Family with one kid; new account; opted-out global. | Empty state. | `LeaderboardView.swift`. |
| Article list — band filtered out | Kid age vs `age_band` mismatch (defense-in-depth client filter). | Article never appears. No error. | `ArticleListView.swift`. |
| Reading-log retry softening | Reading log POST failed once + retried once. Second fail. | `readingLogFailed=true` propagates to scenes (see "Kid quiz pass — write failures"). | `KidReaderView.swift`. |
| Install-freshness wipe | Device UUID mismatch on launch (uninstall on shared iPad). | Token cleared silently → returns to `PairCodeView`. Prevents sibling credential leak. | `PairingClient.swift`. |

### 21.11 Reporting, blocking, moderation visibility

| Surface | Behavior | Where |
|---|---|---|
| Report a comment (web/iOS) | Modal with reason enum + optional description. On submit: confirmation feedback. Reporter must be email-verified. | `/api/comments/[id]/report/route.ts`; component `CommentRow.tsx`. |
| Urgent category (CSAM / child_exploitation / grooming) | Per-target rate-limit bypassed; `is_escalated=true`; NCMEC stub fires. Reporter UX is identical to a normal report (no special "urgent" indicator). | `web/src/lib/ncmec.ts` (stubbed); `web/src/lib/reportReasons.js`. |
| Reporter rate limit | Caps per reporter and per target. Hit → user-facing notification of cap. | DB `rate_limits`. |
| Block a user | Confirmation feedback; comments from blocked author filter out client-side immediately (optimistic). | `web/src/app/api/users/[id]/block/route.ts`; iOS `BlockService.swift`. |
| Blocked by someone else | **Invisible.** Sender of a DM gets uniform 403; comment-thread filtering hides the blocker's content. | `post_message` RPC; comment filter. |
| Comment hidden by moderator | Body replaced with a placeholder. Reasoning shown if mod added it. Reply count + votes zeroed. | `comments.status='hidden'`. |
| Comment deleted by author | Body replaced with a placeholder. | `comments.deleted_at IS NOT NULL`. |
| Warning issued | AccountStateBanner with reason and appeal CTA. | `user_warnings`. |
| Mute applied | Banner with countdown + appeal CTA. | `users.is_muted` + `muted_until`. |
| Ban applied | Banner with reason (if mod added one) + appeal CTA. | `users.is_banned` + `ban_reason`. |
| `/appeal` page | Lists active `user_warnings`; per-row text area to compose appeal. POSTs to `/api/admin/appeals/[id]/resolve`. Empty state if no active penalties. | `/appeal/page.tsx`. |

### 21.12 Rate limit feedback

Rate-limit thresholds live in the `rate_limits` DB table (configurable via `/admin/system`). The table below maps each surface to **how the failure is communicated** (Toast vs inline error vs silent backoff). For the live thresholds, query `rate_limits` or read `/admin/system/page.tsx`.

| Action | Surface on hit |
|---|---|
| Comment post | Toast / inline error. |
| Comment vote | Silent retry (client backs off). |
| Comment report | Toast / inline error with cap-specific copy. |
| DM send | Toast. |
| Signup | 429 surfaced as form error. |
| Login | Pre-flight via `/api/auth/login-precheck`; banner with countdown. |
| Billing checkout / change-plan / cancel / resubscribe | Toast + form lock. |
| Family seats / add-kid | Toast. |
| Pair-code generate / pair / refresh | Toast with countdown timer. |
| Reset password / resend verification | Inline form error. |
| Search | Silent backoff. |
| Ads (impression / click / serve) | Silent; offending IPs hit `is_bot=true`. |

### 21.13 Empty states and load failures

`EmptyState.tsx` (web) / iOS equivalents render with an icon, headline, sub-copy, and (where it exists) a recovery CTA. The accessibility audit at `VerityPost/VerityPost/REVIEW.md` identifies a backlog of empty states missing CTAs (count and list live in REVIEW.md — read the file for the canonical figure).

| Surface | Empty state purpose | Where |
|---|---|---|
| `/bookmarks` | "Nothing saved" + browse CTA. | `web/src/app/bookmarks/page.tsx`. |
| `/search` | No-matches state + clear button. | `web/src/app/search/page.tsx`. |
| `/notifications` | All-caught-up state. | `web/src/app/notifications/page.tsx`. |
| `/messages` | No-conversations state + find-people CTA (paid only). | `web/src/app/messages/page.tsx`. |
| `/leaderboard` | No-users-in-category empty (rare; only inside a category filter). | `web/src/app/leaderboard/page.tsx`. |
| `/profile` Activity tab | No-activity state + start-reading CTA. | `web/src/app/profile/page.tsx`. |
| `/profile` Categories tab | No-progress state. | Same. |
| `/profile/kids` | No-kids state + add-first-kid CTA. | `web/src/app/profile/kids/page.tsx`. |
| `/expert-queue` (non-expert) | Not-an-expert state + apply link. | `web/src/app/expert-queue/page.tsx`. |
| `/recap` (when unhidden) | No-recap-yet state. | `web/src/app/recap/page.tsx`. |
| Kids leaderboard scopes | Empty state. | `VerityPostKids/VerityPostKids/LeaderboardView.swift`. |
| Kids expert sessions (post-gate, no sessions) | No-sessions state. | `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`. |

### 21.14 Error pages

| Surface | Behavior | Where |
|---|---|---|
| `/not-found.js` (404) | Recovery CTAs: home + browse (avoids `/search` which is anon-gated). | `web/src/app/not-found.js`. |
| `/error.js` | Classifies by message (network / 5xx / unknown) and surfaces a retry path. POSTs to `/api/errors`. | `web/src/app/error.js`. |
| `/global-error.js` | Root layout-level throw. Bare `<html>`. Reload button; POSTs digest. | `web/src/app/global-error.js`. |
| iOS error states | Most views show inline retry. RecapView load failure currently fails silently — backlog. | various iOS `*View.swift`; `VerityPost/VerityPost/REVIEW.md`. |

### 21.15 Toast feedback patterns

Toast wiring is per-screen and not fully consistent. The table below names the action; for the literal copy, read the call site.

| Action | Surface |
|---|---|
| Bookmark add/remove | Brief Toast (some surfaces rely on icon flip alone). |
| Block / unblock | Toast confirming the action. |
| Comment posted | Toast confirming. |
| Comment edit failed | Toast surfacing the failure. |
| Vote applied | Silent (UI updates count). |
| Vote rate-limited | Silent backoff. |
| Follow / unfollow | Toast confirming. |
| Push registered | Silent. |
| Push permission OS-denied | Toast (where wired) directing the user to Settings. |
| Promo redeemed | Toast confirming discount applied. |
| Subscription updated | Toast confirming. |
| StoreKit transaction sync failed | `.vpSubscriptionSyncFailed` notification → Toast wiring is per-screen and inconsistent. |

### 21.16 Modals, dialogs, sheets

| Component | Use | Where |
|---|---|---|
| `LockModal` | Paid feature gate. | `web/src/components/LockModal.tsx`. |
| `LockedFeatureCTA` | Inline upgrade pill. | `web/src/components/LockedFeatureCTA.tsx`. |
| `ConfirmDialog` | Destructive confirms. | `web/src/components/ConfirmDialog.tsx`. |
| `Interstitial` | Registration wall, beta-locked detail, mid-flow blocking messages. | `web/src/components/Interstitial.tsx`. |
| `Toast` / `ToastProvider` | Ephemeral feedback. | `web/src/components/Toast.tsx`. |
| `DestructiveActionConfirm` (admin) | Reason-required confirms on admin destructive actions. | `web/src/components/admin/`. |
| `ParentalGateModal` (kids) | Math challenge for parental-gated actions. | `VerityPostKids/VerityPostKids/ParentalGateModal.swift`. |
| `PushPromptSheet` (iOS) | Pre-prompt before OS dialog. | `VerityPost/VerityPost/PushPromptSheet.swift`. |
| Report dialog | Reason selector + optional description. | `CommentRow.tsx`. |
| Block dialog | Confirm + Toast. | Profile / public-profile views. |
| Share sheet (iOS) | `UIActivityViewController` for profile/article share. | iOS share affordances. |
| Avatar edit sheet (iOS) | Color + preset selector. | iOS profile. |

### 21.17 Accessibility friction (open backlog)

The canonical audit lives in `VerityPost/VerityPost/REVIEW.md` (2026-04-19). Counts and rows are subject to drift; **read REVIEW.md for the authoritative figures**. Categories tracked there:

- **P0** — icon-only buttons missing `accessibilityLabel` (VoiceOver invisible).
- **P1** — interactive elements below 44×44pt minimum touch target.
- **P1** — terminology inconsistency ("Log In" vs "Sign in"; the project standard is "Sign in").
- **P1** — empty states missing recovery CTAs.
- **P2** — hardcoded safe-area in kid greeting bands (Dynamic Island breakage).
- **P2** — token consolidation needed for corner radius and padding (multiple distinct values; canonical counts in REVIEW.md).
- **P2** — error copy uses passive voice; the recommended replacement pattern is documented in REVIEW.md.
- **P3** — no haptics at celebration moments; some animations don't honor reduce-motion; no `@ScaledMetric` for Dynamic Type; color hardcoding outside `KidsTheme.swift`.

State: **open backlog.** REVIEW.md tracks the running estimate.

### 21.18 Where this will fail without us knowing

Surfaces that are **silent** by design (no user-visible feedback) — high-leverage targets if abandonment shows up here:

- Free-tier breaking-news daily push cap (silent skip).
- Quiet-hours push suppression (silent skip).
- Shadow ban (silent — by design).
- Mention dropping for free users (silent — D21).
- Search advanced filters from non-paid callers (silent server-side strip).
- Vote rate-limit (silent backoff).
- Block-recipient DM 403 (uniform error; sender doesn't know).
- Token invalidation on push (no in-app indication; user re-registers organically).
- iOS RecapView load failure (no feedback — backlog item).
- iOS StoreKit sync failure (broadcasts `.vpSubscriptionSyncFailed`; Toast wiring is per-screen and inconsistent).

Each is a deliberate trade-off. Listed here so we revisit when retention data tells us a silent path is hurting.

---

## 22. Universal welcome — making the platform feel for everyone

§21 catalogs what pushes users away. This section catalogs what brings them in — and exposes where the system silently fails people we want to reach. It's an audit of six "welcome" dimensions, with what's shipped, what's wired-but-hidden, and what's a real gap. Each dimension ends with **what to watch out for** — the code-change patterns that should trigger an update here.

### 22.1 Localization & language reach

**What ships today:**
- `web/src/lib/copy.ts` is a centralized copy catalog structured for future i18n migration (becomes the translation source when a library lands).
- Schema-level columns: `users.locale` (default `en`), `articles.language` (default `en`), `categories.language`, `email_templates.language`, `plans.currency` (default `USD`), `subscriptions.currency`. The plumbing exists.
- Browser-native TTS via `TTSButton.tsx` (`SpeechSynthesis`) works in any language the user's OS supports — it's not a server-rendered audio file.

**Wired but not surfaced:**
- `users.locale` is stored, never read. No conditional render branches on it.
- `articles.language` is populated as `en`, never filtered or displayed in the reader.
- `plans.currency` always renders as USD; no FX, no per-region pricing.
- Editorial timezone hardcoded America/New_York (`web/src/app/page.tsx` `editorialToday()`).

**Real gaps:**
- No i18n library wired (`next-intl`, `react-intl`, `i18next` all absent from `package.json`).
- No language selector in settings or anywhere else.
- No RTL support — no `dir=` attribute injection, no logical-property CSS, no Arabic/Hebrew/Persian testing.
- AI pipeline prompts are English-only; no localized headline/body/quiz prompts.
- Date/number formatting is hardcoded en-US.

**Highest-impact next move:** Wire `next-intl`, expose `users.locale` in `/profile/settings`, hydrate `copy.ts` strings from a translation catalog at build time. One language at a time (Spanish first is the obvious lever for North American reach).

**Watch out for:**
- Anyone adding hardcoded strings outside `copy.ts` — flag and route through the catalog.
- Anyone adding `new Date().toLocaleString()` without passing a locale.
- Currency/price formatting that hardcodes `$` or `USD` instead of reading `plans.currency`.
- Any branch on locale must update §22.1 (move from "wired but not surfaced" to "shipped").

### 22.2 Accessibility beyond compliance

**What ships today:**
- Typography controls in `/admin/reader`: font-size adjustable (14–24px), line-height adjustable, letter-spacing, column width.
- `prefers-reduced-motion` honored globally (`globals.css` collapses CSS animations to 0.01ms).
- Skip-to-main link on every page.
- Form focus outlines (2px solid).
- ARIA labels on key surfaces (`/page.tsx`, `/messages/page.tsx`).
- Browser-native TTS via `TTSButton.tsx`; auto-start gated by `users.metadata.a11y.ttsDefault`.
- iOS notch safe-area handling.
- `/accessibility` page documents WCAG 2.1 AA target.

**Wired but not surfaced:**
- **OpenDyslexic toggle** — declared as `reader_config_open_dyslexic` setting in `/admin/reader/page.tsx`, default on, **but the actual font-face CSS is not yet wired to the public reader.** Admin can toggle it; readers see no change. (This contradicts an earlier read — flagged.)
- **High-contrast mode** — declared in admin, marked "(Coming soon — the reader will honor this setting once it's wired up)" on `/accessibility/page.tsx`.
- TTS has no transcript/captions surface; the audio is ephemeral.

**Real gaps:**
- No color-blind audit. No documented testing for deuteranopia / protanopia / tritanopia. The palette uses standard #22c55e green and #ef4444 red without confirmed safe contrast.
- No focus-trap library on modals; focus management is informal.
- No video/audio captions (`media_assets.mime_type` exists but no captions table or VTT generation).
- iOS REVIEW.md backlog (§21.17): 11 unlabeled icon buttons, 13 sub-44pt touch targets, no Dynamic Type, hardcoded safe-area in kid bands.
- Keyboard-only nav not tested end-to-end.

**Highest-impact next move:** Actually wire the OpenDyslexic and high-contrast CSS to the reader (the toggles already exist), then commission a color-blind palette audit. Two changes shipped in a day would move accessibility from "documented goal" to "user-visible win."

**Watch out for:**
- New colors added outside `globals.css` / `KidsTheme.swift` palette tokens — must pass color-blind contrast.
- New modal/dialog without focus-trap consideration.
- New icon-only button without `aria-label` (web) or `accessibilityLabel` (iOS) — auto-fail in REVIEW.md.
- Any reader-config toggle landing — update §22.2 to move it from "wired but not surfaced" to "shipped".
- Any video or audio asset added — captions/transcript becomes mandatory.

### 22.3 Onboarding for the unfamiliar

**What ships today:**
- `/welcome` carousel explicitly explains quiz-gating (literal copy in `web/src/app/welcome/page.tsx`). Fires post-signup or post-graduation-token. The carousel screen count and step copy are subject to drift; read the page for the authoritative version.
- `/how-it-works` public 4-step explainer: Read → Quiz → Discuss → Earn. Discoverable from main nav.
- Admin-side onboarding step config (`/admin/reader`) declares 7 steps: welcome, topics, quiz_intro, verity_score, profile, notifications, first_story. Skip-allowed toggle exists.

**Wired but not surfaced:**
- The 7-step admin flow is config-only. The actual user-facing flow is the 3-screen carousel — the other 4 steps (quiz_intro, verity_score, profile prompt, notifications, first_story) are not rendered.
- No `first_*_at` columns on `users` to track first-action milestones (no `first_quiz_at`, `first_comment_at`, `first_verity_point_at`).
- Empty home feed for first-time signed-in users renders the normal feed — no first-time welcome state.

**Real gaps:**
- No coachmarks. No tooltips on the quiz, comment composer, or scoring UI.
- No re-onboarding for users who skipped or missed it.
- No celebration on first quiz pass / first comment / first verity point.
- No "What is a quiz?" inline explainer when a user encounters one for the first time.
- `/how-it-works` is reachable but not auto-shown to new users.

**Highest-impact next move:** Add `first_quiz_at`, `first_comment_at`, `first_verity_point_at` to `users`, then fire a one-time celebratory toast/modal on first completion of each. Cheap to ship; concrete signal to the user that they've crossed a threshold; gives us a measurable funnel metric.

**Watch out for:**
- Anyone shortening the welcome carousel — preserve the quiz-gating explanation; that's the contract that justifies the friction in §21.6.
- Adding `first_*_at` columns to `users` should immediately produce a UI surface here, otherwise the column is stranded.
- New user-facing feature without an explainer path for first-encounter users.
- `/how-it-works` content drift away from actual product behavior — the explainer is a contract.

### 22.4 Trust signals & transparency

**What ships today:**
- AI-disclosure pill on the story page when `articles.is_ai_generated && show_ai_label` (admin master switch). Defaults on per EU AI Act / CA AB 2655 alignment.
- Sources rendered as expandable pills below the article body; sourced from `sources` table.
- `/accessibility` page (compliance-themed transparency).
- Schema captures verification, retraction, plagiarism, AI provenance, confidence, manual-review state on every article.

**Wired but not surfaced:**
- **AI model + provider + confidence score** — `articles.ai_model`, `articles.ai_provider`, `articles.ai_confidence_score` are captured but the public AI-disclosure pill only renders the `is_ai_generated` boolean. The model identity and confidence value are admin-only.
- **Verification** — `is_verified`, `verified_by` columns populated, never rendered. No verifier-attribution badge on the public story.
- **Retractions / unpublished** — `retraction_reason`, `unpublished_at` exist; no public retraction log or per-article correction history.
- **Plagiarism status** — column exists, never rendered. Editor-only.
- **Per-source credibility / publisher reputation** — sources table has a `metadata` jsonb that could carry a trust score; nothing populated, nothing rendered.

**Real gaps:**
- No `/editorial-standards` or `/methodology` page. The "why" behind quiz-gating, AI use, source selection, and corrections lives only in `/how-it-works` (the mechanics) and is not consolidated as an editorial-philosophy doc.
- No public correction log.
- No per-source explanation affordance — sources are listed but there's no way for a reader to ask why a given source was chosen or surface its track record.
- No public expert biography surface — `expert_applications` carries credentials, bio, expertise areas, portfolio URLs, but the public view shows only the badge.
- No transparency report (cost of editorial AI, sources by domain, retraction rate).

**Highest-impact next move:** Ship `/editorial-standards` (one page covering AI policy, quiz-gating rationale, source selection, correction process, expert verification) and add the AI model + version to the disclosure pill. Together, these turn "we use AI responsibly" from a claim into evidence.

**Watch out for:**
- New AI model added to `ai_models` — surface it on the disclosure pill or the editorial-standards page.
- Article retraction or unpublish action shipping — the moment we have a non-zero count, a public correction log becomes ethically urgent.
- New trust column on `articles` (e.g., `fact_check_status`) — must have a render path on the story page or it sits dead.
- Expert verification UI changes — update both the public-facing surface and the admin verification flow.
- Any change to source-fetch / clustering / generation that affects what readers see — update §22.4 + §4.

### 22.5 Performance & reach for low-end conditions

**What ships today:**
- `next.config.js` enables image optimization (AVIF/WebP fallback, Supabase + CDN whitelisted).
- Bundle baseline (`web/bundle-size-baseline.txt`): 258 kB First Load JS shared, largest page 352 kB total (`/profile/settings`), middleware 141 kB, 212 pages built.
- `manifest.js` declares the web app PWA-installable (display: standalone, theme color, start URL).
- `prefers-reduced-motion` honored.
- Server-rendered home + story (LCP-critical paths don't depend on client hydration).

**Wired but not surfaced:**
- PWA manifest is declared but **icons are missing** ("Icons omitted until owner drops PNGs"). Install prompt won't fire on most platforms without icons.
- Bundle baseline is recorded but no enforcement / budget gate in CI.

**Real gaps:**
- **No service worker** — no offline reading, no cache-first article history, no background sync. (`sw.js`, `service-worker`, `workbox`, `next-pwa` all absent.)
- **No `prefers-reduced-data` / `Save-Data` handling** — low-bandwidth users get the full payload.
- **No `connection.effectiveType` detection** for serving smaller images on slow connections.
- **Story body images use raw `<img>` tags**, not `next/image`; no responsive `srcset`, no lazy-loading attributes.
- External cover images (article hero) are embedded as raw URLs without `sizes` or `srcset`.
- No documented LCP / CLS / FID targets; no 3G throttle measurement.
- No AMP / lite variant.

**Highest-impact next move:** Migrate cover and body images to `next/image` with responsive sizing and lazy-loading, drop PWA icons in `/public/`, then measure LCP on a 3G throttle and set a < 3s target. Three steps, all cheap, none controversial.

**Watch out for:**
- New large dependency added to `package.json` — re-baseline `bundle-size-baseline.txt` and update §22.5.
- New image-heavy page or component — must use `next/image`, not raw `<img>`.
- Anything that increases home-page server fetch count — re-evaluate LCP.
- Service worker landing — major update to §22.5 + new offline section in §21 (offline error surface).
- PWA icons added — flip §22.5 line.

### 22.6 Community welcome paths

**What ships today:**
- `expert.ask` exists end-to-end: `/api/expert/ask`, `/expert-queue`, expert reply blur for non-paid (§7.5).
- Score tier hierarchy with newcomer at 0 (`score_tiers`), surfaces as a label on profile.
- Quiz pass unlocks comment thread (§7.2).
- `articles.kids_summary` populated on adult articles flagged `is_kids_safe` — content exists for an "explain like I'm new" surface.

**Wired but not surfaced:**
- **`articles.difficulty_level`** populated by the pipeline, never rendered to readers. No reading-level pill.
- **`articles.reading_time_minutes`** populated, never rendered to readers (admin uses it for analytics).
- **`articles.kids_summary`** rendered only in the kids app. Adults reading a complex topic don't see the simpler version.
- **Newcomer tier** has no special mentor treatment — it's just a label.

**Real gaps:**
- No "first comment" welcome message or quiet greeting.
- No assigned mentor and no inline expert-ask prompt for new users on article surfaces.
- No expert-authored callout on articles (a verified expert wrote / fact-checked this).
- No newcomer notification email or week-1 nudge.
- No "explain like I'm new" toggle on adult articles (the data — `kids_summary` — exists; the surface doesn't).
- Empty comment thread on a fresh article shows nothing — no first-commenter prompt, no expert-prompt seed.

**Highest-impact next move:** Add a reading-time + difficulty pill below every article headline (data already exists — pure UI work) and surface `kids_summary` as a "simpler version" toggle on adult articles where it's populated. Both changes leverage data that's already being generated and immediately widen who feels invited in.

**Watch out for:**
- New article-level field that affects reader judgment (e.g., `bias_score`, `expertise_required`) — needs a public render decision (surface or kill-switch) before it lands.
- Any change to comment thread empty state — update §22.6 + §21.13.
- Score-tier renames — coordinate with `scoreTiers.ts` and §3.3.
- Expert verification UI shipping — update §22.4 + §22.6 simultaneously (bio surface + community visibility).
- `kids_summary` becoming routinely populated for adult articles — that's the trigger to ship a simpler-version toggle.

State summary for §22: nothing in this section is **shipped end-to-end**; about half is wired-but-not-surfaced (the easiest wins), about half is gap. None of it is launch-blocking, but every dimension is a measurable lever on first-time retention — which is why §22 lives in the bible alongside the system architecture.

---

## 23. Currently kill-switched / launch-hidden

The launch model is reviewer-approval gates (Apple, AdSense). Some surfaces are intentionally inert until those land. Launch-hides preserve the schema, queries, types, and routes — flipping them back on is a one-line gate change.

| Surface | Hide mechanism | How to unhide |
|---|---|---|
| Closed beta entire site | `NEXT_PUBLIC_BETA_GATE=1` | Unset env var. |
| Coming-soon redirect | `NEXT_PUBLIC_SITE_MODE=coming_soon` | Unset env var. |
| `/recap` public list | `LAUNCH_HIDE_RECAP=true` flag in page | Flip the flag. |
| Public profiles `/u/[username]` | `PUBLIC_PROFILE_ENABLED=false` flag | Flip the flag. |
| OAuth on web `/login` | UI gate (routes live) | Show buttons. |
| AdSense slots | Pre-approval; `AdSenseSlot.tsx` reads gate | Approval + flag flip. |
| Verity Family on web checkout | `plans.is_visible=false` | Set true in DB row; pricing page picks up. |
| Verity Pro legacy SKUs | `is_active=false, is_visible=false` | Re-enable the legacy SKU rows in `plans`. |
| `verity_family_xl_*` | Retired (T319, 2026-04-27); rows deleted | Not unhidable — replaced by per-kid add-on. |
| NCMEC CyberTipline | `web/src/lib/ncmec.ts` stubbed | ESP registration with NCMEC, then enable. |
| Sentry alerting | Tool present, paging deferred | Enable pre-revenue / pre-traffic. |
| OpenDyslexic font (admin-toggled, reader-CSS not wired) | Admin setting on; reader CSS not yet implementing | Wire font-face CSS to the public reader. |
| High-contrast mode (admin-toggled, reader-CSS not wired) | Admin setting on; reader stub | Wire palette swap to the public reader. |

Pre-launch parked work (kill-switched, do not re-surface as "next up" until launch is live): see `Ongoing Projects/Reference/STATUS.md` for the canonical KILL_SWITCH_INVENTORY.

---

## 24. Operational state — what's shipped vs partial

**Fully shipped:** auth (email + OAuth + recovery), beta gate, COPPA + parental gate, kids pairing + graduation, kids quiz with server verdict, kids gamification scenes, leaderboard with privacy filters, family seats with idempotent atomic creation, Stripe checkout / portal / webhook with idempotency, Apple StoreKit sync + S2S notifications, AI pipeline (12-step end-to-end, F7 Phase 3), admin tools across content / people / money / comms / ops, push (APNs HTTP/2), email (security-only via Resend), comments + voting + context-pinning + reporting, DMs with block enforcement, blocks (bidirectional), bookmarks (with paid collections), achievements framework (one kids badge wired), all 17 registered cron jobs, audit/webhook/error log, CSP nonce + report-only strict, request-id propagation, rate limiting, deletion grace + anonymization, data exports.

**Partial / experimental:**
- **Tweens story-manager** — UI is a stub sharing kids-story-manager paths; tween-specific fields are wired in DB but UI tweaks deferred.
- **Subcategory leaderboard aggregation** — Wave 2 work; current view aggregates top-level only.
- **Advanced search filters on iOS** — basic mode shipped; filter UI deferred.
- **Achievement content backlog** — DB seeded with badge keys; only Bias Detection L3 fires from kids client.
- **Legacy section-cache permissions path** — deprecated; Wave 2 will remove section cache once all callers migrate to `compute_effective_perms`.
- **Adult iOS REVIEW.md polish backlog** — ~20 hours of accessibility + design-system work tracked.

**Stubbed (intentional pending external dependency):** NCMEC CyberTipline submission (awaiting ESP registration), AdSense slot rendering (awaiting approval).

**Retired:** `verity_family_xl_*` plans (T319), `@admin-verified` marker (2026-04-23, replaced by 6-agent ship pattern), several legacy admin shells consolidated to `/admin/newsroom`.

---

## 25. Glossary

- **Audience.** `adult` | `kid` | `both`. On feeds, clusters, articles, prompts, costs.
- **Reading band.** `kids` (5–9), `tweens` (10–12), `graduated` (13+). On `kid_profiles`. Drives content age-gating.
- **Tier.** Marketed plan: `free` / `verity` (legacy) / `verity_pro` / `verity_family`. Distinct from `plan_id` row.
- **Plan row.** Specific (tier, billing-period) SKU like `verity_pro_monthly`.
- **Permission key.** Dotted string like `comments.post`, `bookmarks.unlimited`. Resolved via `compute_effective_perms`.
- **Kill switch.** A flag (env var, DB setting, code constant) that disables a feature without removing it. Distinct from a feature flag (which is a controlled rollout).
- **Coming-soon mode.** Pre-launch holding page. Independent of beta gate.
- **Beta gate.** Closed-beta invite-only signup. Currently the active launch model.
- **Hero pick.** The article shown as the home-page hero on a given editorial day; chosen by editor.
- **Editorial timezone.** America/New_York. All "today" semantics use it.
- **F7 / Phase 3 / Phase 6.** Internal milestones for the AI pipeline restructure and family-billing rewrite. Tracked in `Ongoing Projects/`.
- **Verity Score.** Per-user gamification score, with tiers from `score_tiers`.
- **Frozen.** Account state where paid features are revoked and Verity Score is frozen at last value (`frozen_at`, `frozen_verity_score`).
- **Grace.** Plan-cancellation soft window (`plan_grace_period_ends_at`); user keeps perms until expiry, then `freeze-grace` cron freezes.
- **Comped.** Beta cohort user given paid perms for free during cohort window (`comped_until`).
- **Idempotency.** All side-effecting POSTs (signup, billing, kid creation, webhooks) use idempotency keys + DB UNIQUE constraints to make retries safe.

---

## 26. How this document is maintained

This is the living feature index. The rule is simple:

1. When code changes, this document is updated in the same change. If a feature ships, gets removed, or behaves differently, the corresponding section is rewritten — not appended to. The file always describes the present state of the system.
2. **State** values (`shipped`, `partial`, `experimental`, `stubbed`, `kill-switched`, `retired`) reflect operational reality, not aspiration. Half-finished work is `partial`, not `shipped`.
3. The **Engagement-friction inventory** at §21 is the abandonment-fighting reference. When a new gate, banner, modal, paywall, or empty state ships — or when a copy or trigger condition changes — update §21 in the same change. New friction surfaces ALWAYS land in §21, even if they also touch a system section.
4. The **Universal welcome** audit at §22 is the inclusion-and-reach reference. When a wired-but-not-surfaced item lands a real surface, move it from "wired but not surfaced" to "ships today" in the matching subsection. New gaps go into "Real gaps" with the next-move sentence updated.
5. The **Currently kill-switched / launch-hidden** register at §23 is the single place to look up what is intentionally inert. Add to it when a feature is hidden; remove when it's flipped back.
6. The schema section at §20 lists tables only. The full DDL lives in `currentschema`; this document does not duplicate column lists.
7. When a feature spans multiple sections (e.g., kids touches identity, content, gamification, billing, friction, welcome), each section gets a focused slice with cross-references rather than duplicating the full picture.
8. New sections only when they describe an actual product surface or system. No sections for "future plans," "decisions," or "debates" — those belong in `Ongoing Projects/`.

If a section is wrong or outdated, fix it in place. The document is not historical record; the git log is.

### 26.1 Update triggers — what to watch for

This is the navigation map FROM code change TO bible section. Any agent or contributor making a change should scan this table and update every section listed for the matching trigger. If a change matches multiple rows, update all of them. If a change matches no row, the bible probably has a structural gap — propose a new row or section.

| If you change… | Update these sections |
|---|---|
| **Schema** — any `CREATE TABLE`, column add/drop/rename, or constraint change. | §20 (table inventory). Also the domain section that owns the table (e.g., new `comments`-touching column → §7). If the new column is reader-visible, also §22 (welcome) or §21 (friction). Re-export `currentschema`. |
| **`plans` table** — new SKU, price change, tier rename, visibility toggle. | §1 (plan tiers), §13 (billing). If the SKU changes what users see, §21.5 (paywalls). |
| **`permissions` / `permission_sets` / wirings** — new key, new set, role/plan grant change. | §3.1. If the new permission gates a user-visible feature, §21.3 (deny rendering) and the feature's domain section. |
| **`score_tiers`** rows or thresholds. | §3.3. If a tier rename, also §11–§12 (iOS profile/leaderboard) and `scoreTiers.ts` cache invalidation. |
| **AI pipeline** — new step, new prompt preset, new model in `ai_models`, new safety gate. | §4 (content engine). If reader-visible (e.g., AI-disclosure pill model display), §22.4 (trust signals). |
| **Cron job** — added, removed, schedule changed. | §16 (background jobs). Cross-check `web/vercel.json`. |
| **Cron purpose change** — what a job sweeps/sends differs. | §16 + the domain it serves (e.g., notification cron change → §9). |
| **New API route under `/api/*`** | The domain section (§5–§14). If the route is rate-limited, §21.12. |
| **Rate limit policy** added or threshold changed. | §21.12 (feedback table). If user-visible, also the affected feature section. |
| **Middleware** — new gate, new redirect, CSP/CORS change. | §2.5 (edge defenses). If the gate is user-visible (e.g., new beta-locked reason), §21.2. |
| **New page route on web** under `/<route>` (not `/admin`, not `/api`). | §5 (reading surfaces) or the matching domain section. If anon-accessible with anon CTA, §21.1. |
| **New `/admin/*` page** | §15 (admin tools). |
| **iOS view added or removed** (adult or kids). | §11 or §12. If the view contains a friction surface, §21. |
| **Push (APNs) integration changes** — environment, batching, prompt sheet, dead-token handling. | §9.4 + §21.8. |
| **Email template added or `email.js` changes.** | §9.5. Confirm scope still matches "security only" rule. If a new template implies non-security email, that's a product-policy change — flag to owner. |
| **Comment system** — new feature on comments (e.g., reactions), new moderation flow. | §7. If reader-visible, §21.7 (composer states) and §21.11 (moderation visibility). |
| **DM system** — new permission, new block path, new conversation type. | §8 + §21.7 (composer banners). |
| **Billing** — Stripe webhook handler added/changed, Apple S2S handler, family-seat logic. | §13. If user-visible error or banner, §21.4 (account-state) or §21.9 (billing friction). |
| **`subscriptions.kid_seats_paid` logic change** | §13.4 + §10.9 (family seats). |
| **Kids — pair flow, parental gate, graduation, age-band, COPPA copy.** | §10 + §12. If kid-facing UX changes, §21.10. |
| **Reading band thresholds (kids/tweens/graduated)** — DOB-correction logic, birthday-band cron. | §10.6 / §10.7 + §16. |
| **Friction surface added or copy changed** — any gate, banner, modal, paywall, lockout, cooldown, empty state, interstitial. | §21 (mandatory). Plus the feature's domain section. |
| **A "silent by design" path created or removed** (no user feedback on a denial). | §21.18 (the explicit silent register). |
| **Localization or language reach** — i18n library added, locale read, RTL, currency, timezone. | §22.1. |
| **Accessibility surface** — color-blind palette, high-contrast wired, dyslexia font wired, keyboard-trap, captions. | §22.2 + §19.6. If iOS, also REVIEW.md sync. |
| **Onboarding** — welcome carousel, first-action celebration, coachmarks, `first_*_at` columns. | §22.3. |
| **Trust signals** — AI disclosure pill content, source pill content, retraction surface, editorial-standards page, expert bio. | §22.4. |
| **Performance** — bundle baseline change, image strategy, service worker, PWA icons, `prefers-reduced-data`. | §22.5. Re-record `bundle-size-baseline.txt` if dependencies changed. |
| **Community welcome** — reading-level pill, "explain like I'm new" toggle, expert visibility on articles, newcomer treatment. | §22.6. |
| **Kill switch / launch-hide added or flipped.** | §23 (mandatory). Plus the feature section. |
| **Feature flag in `feature_flags` table** — created or rollout changed. | If user-visible, the feature's domain section + §22 or §21 as applicable. Always cite the `key` here. |
| **`settings` row** — new kv with reader-visible effect. | The affected feature section. If reader-visible, §22 or §21. |
| **NCMEC integration / CSAM scanning**. | §18 (security) + §19.4 + §21.11. |
| **Compliance — COPPA consent version, GDPR, Apple App Store policy.** | §19 + the affected user-facing surface. |
| **Editorial timezone change** (currently America/New_York). | §0 + §22.1 + every place using `editorialToday()`. Owner decision. |
| **CLAUDE.md memory update affecting product policy** (e.g., a new "no X" rule). | The feature section affected. The bible reflects code, but product-policy memories signal what code is *expected* to honor. |
| **Migration applied** in `Ongoing Projects/migrations/`. | Every section the migration touches. Confirm `currentschema` is regenerated. |
| **Retirement** — feature deleted, plan retired, page removed. | §24 (operational state — "Retired") + the feature's section (rewrite or remove). Do NOT leave dead references; clean them up. |

### 26.2 Watch-for signals when reading the codebase

Beyond the trigger table, these patterns signal the bible probably needs a touch-up:

- **A `TODO` / `FIXME` / `HACK` comment near a user-facing surface** — likely either a §21 friction we haven't documented or a §22 wired-but-not-surfaced item.
- **A feature flag check that's been `true` (or `false`) for >30 days** — probably should move from "kill-switched" to "shipped" or be removed.
- **A column populated by a write path but never read** — exactly the §22 "wired but not surfaced" pattern; flag it explicitly.
- **A permission key in `permissions` that's not granted to any set** — orphan; either drop or surface.
- **A copy string that contains a date, deadline, or "soon"** — violates the "no user-facing timelines" rule (CLAUDE.md memory). Flag.
- **A rate limit added without Toast vs silent decision** — must land in §21.12.
- **A new error class without a recovery CTA** — must land in §21.14 or §22.x.
- **A migration that adds a `metadata` jsonb field** — figure out what's going in it, document the keys.

### 26.3 How to verify the bible is fresh

A 5-minute self-check before shipping any non-trivial change:

1. `grep -n` for the file/route/table you changed in `FEATURE_BIBLE.md`. If it doesn't appear and it should, add it.
2. Look at every section listed in your trigger-row above. Skim it. If reality drifted, fix it.
3. If you added a user-visible gate or paywall, search §21 for the feature name. If absent, add a row.
4. If you populated a column that ends up on screen, search §22 to confirm it moved out of "wired but not surfaced."
5. If you flipped a kill switch, update §23 — if removed, delete the row; if added, add it.

The bible should never be more than one commit behind reality. If it is, that's a bug.
