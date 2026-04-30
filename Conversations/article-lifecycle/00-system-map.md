# 00 — System Map

**Date:** 2026-04-29
**Status:** Foundation reference. Read on every session before slice work.
**Source:** Code-only investigation across web, iOS adult, iOS kids, Supabase migrations. No design decisions in this document — only what exists today.

---

## What an article is, in one breath

An article is a row in `articles` (`web/src/types/database.ts:1513-1810`) with a `status` (draft|scheduled|published|archived), an `age_band` (adult|tweens|kids), an optional `cluster_id` linking it back to the discovery pipeline that produced it, and a constellation of child rows: `sources`, `timelines`, `quizzes`, `comments`, `bookmarks`, `reading_log` entries, `quiz_attempts`. It moves through six lifecycles: **generation** (LLM produces it), **publishing** (admin promotes draft to live), **viewing** (readers consume it), **quizzes** (readers take the attached quiz), **timelines** (the dated events that scaffold it), **comments** (discussion under it).

The schema is canonical for both web and iOS. Both clients hit the same Supabase project, decode rows with the same column names, and call the same RPCs. There are **no Supabase edge functions** — all serverless logic runs as Next.js route handlers on Vercel. Cron is `vercel.json` schedules calling `/api/cron/*` routes.

---

## Lifecycle in one diagram (state, not time)

```
            ┌─────────────────────────────────────────────────────┐
            │  DISCOVERY (out of scope — the upstream pipeline)   │
            │  feeds → discovery_items → feed_clusters            │
            └───────────────────┬─────────────────────────────────┘
                                │
                                ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  GENERATION                                                        │
   │  POST /api/admin/pipeline/generate (route.ts:475-1950+)            │
   │  12-step LLM chain → persist_generated_article RPC                 │
   │  Writes: articles (status='draft'), sources, timelines, quizzes    │
   │  State per audience: feed_cluster_audience_state.state             │
   │     pending → generating → generated/skipped/failed                │
   │  Lock: claim_cluster_lock_v2 per (cluster, audience_band)          │
   │  Cost: reserve_cost_or_fail / reconcile_cost_reservation           │
   └───────────────────┬────────────────────────────────────────────────┘
                       │  articles.status='draft', is_ai_generated=true
                       ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  PUBLISHING                                                        │
   │  PATCH /api/admin/articles/[id] (route.ts:249-433)                 │
   │  ALLOWED_TRANSITIONS: draft↔archived, scheduled→{published,…},     │
   │     published→archived, archived→draft                             │
   │  Sets: published_at, unpublished_at, moderation_status              │
   │  Side-effects: audit_log row; sitemap.xml lazy regen               │
   │  Breaking news: /api/admin/broadcasts/alert → send_breaking_news    │
   └───────────────────┬────────────────────────────────────────────────┘
                       │  articles.status='published'
                       ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  VIEWING                          QUIZZES         COMMENTS         │
   │  Web /[slug]                      /api/quiz/start  /api/comments    │
   │  iOS StoryDetailView              /api/quiz/submit POST/PATCH/DELETE│
   │  iOS KidReaderView                score_on_quiz_   v2LiveGuard      │
   │     (reads only kids_summary)        submit RPC    + quiz-passed    │
   │  AdSense slots                    advance_streak    gate (013)      │
   │  Bookmarks (D13 cap)              user_achievements                 │
   │  reading_log (kids logs on quiz   leaderboards                      │
   │     entry; web on bookmark add)                                     │
   │                                                                    │
   │  TIMELINES                                                         │
   │  Web reader: NOT RENDERED (gap)                                    │
   │  iOS reader: gated by article.view.timeline permission (key may    │
   │     not exist in code — see Open Question)                         │
   │  Admin authors fully via StoryEditor / KidsStoryEditor             │
   └────────────────────────────────────────────────────────────────────┘
```

---

## Slice 1 — GENERATION

**Entry point.** `POST /api/admin/pipeline/generate` at `web/src/app/api/admin/pipeline/generate/route.ts:475`. Admin clicks "Generate" on a Newsroom AudienceCard (`web/src/app/admin/newsroom/_components/AudienceCard.tsx:177`); UI polls the run row at `/api/admin/pipeline/runs/[id]` every 2s.

**The 12-step LLM chain** (`generate/route.ts:142-172`):

1. `audience_safety_check` (kid-only) — Haiku classifies cluster as kid-safe; mismatch aborts via `AudienceMismatchError`.
2. `source_fetch` — scrapes `raw_body` for discovery_items missing content.
3. `headline` / `summary` / `categorization` — parallel batch.
4. `body` — main article body. The LLM produces the **entire body** (175-250 words per `editorial-guide.ts:28-350`). Output: `{title, body, word_count, reading_time_minutes}`.
5. `source_grounding` — extract supported/unsupported claims per source.
6. `plagiarism_check` (`lib/pipeline/plagiarism-check.ts`) — n-gram match; soft-degrade or rewrite.
7. `kid_url_sanitizer` (kid-only) — child-safe link rewrites.
8. `quiz` — generate quiz questions.
9. `quiz_verification` — Haiku verifies quiz answers.
10. `timeline` — 4-10 dated events. Prompt explicitly forbids inventing specific dates (`editorial-guide.ts:729-731`).
11. `persist` — `persist_generated_article` RPC writes `articles` + `sources` + `timelines` + `quizzes` in a single transaction. Slug collision auto-retried with `-2/-3` suffix.

**State machines.**

- `articles.status` — `draft` on persist; admin manually promotes to `published` later.
- `discovery_items.state` — `pending|clustered → generating → published` (adult success) or `→ ignored` (audience mismatch) or `→ clustered` (failure). Guard `.eq('state','generating')` at `route.ts:1941` prevents clobbering by concurrent cancel.
- `feed_cluster_audience_state.state` — `pending → generating → generated/skipped/failed` per `(cluster_id, audience_band)`. Migration `supabase/migrations/2026-04-28_audience_state.sql:11-21`.
- `pipeline_runs.status` — `running → completed/failed/cancelled`.

**Locks & cost.** `claim_cluster_lock_v2` per `(cluster_id, audience_band)`, TTL 600s. `reserve_cost_or_fail` checks daily cap before spend; `reconcile_cost_reservation` settles in `finally`. **Advisory lock contention risk:** all cost checks serialize on `pg_advisory_xact_lock(hashtext('pipeline:cost-cap'))` — single hash, scales poorly under concurrency (`supabase/migrations/2026-04-28_pipeline_cost_reservations.sql:46-87`).

**Models.** Provider/model picked at request time (default `anthropic` / `claude-sonnet-4-6`). Haiku hardcoded for safety/verify steps as `claude-haiku-4-5-20251001` (`route.ts:178`) — no fallback if deprecated.

**Recent migrations that matter.**

- `2026-04-28_audience_state.sql` — per-audience generation state.
- `2026-04-28_per_audience_cluster_lock.sql` — lock per `(cluster, audience_band)`.
- `2026-04-28_persist_timeline_lenient_date.sql` — `parse_timeline_event_date()` coerces partial dates ("2013", "2013-05") to timestamptz, falls back to NULL/now() if unparseable.
- `2026-04-28_claim_cluster_lock_v2_ambiguity_fix.sql` — qualified `l.locked_at` to fix ambiguous OUT-param reference.
- `2026-04-28_pipeline_cost_reservations.sql` — atomic cost cap.

**Open questions for the generation slice.**

- Where do `source_grounding` claim → source_id mappings go? They're computed but not visibly persisted; appear discarded after `plagiarism_check`.
- `parse_timeline_event_date` falls back to `now()` if NULL — corrupts event_date semantics silently. Better: reject + retry, or store nullable.
- Standalone-cluster cleanup: `INSERT INTO feed_clusters (..., keywords=['standalone'])` at `route.ts:524`; no cron prunes them.
- Hardcoded Haiku model with no fallback path.

---

## Slice 2 — PUBLISHING

**Entry point.** `PATCH /api/admin/articles/[id]` at `web/src/app/api/admin/articles/[id]/route.ts:249`. UI surfaces: `/admin/stories` (status filter, publish action) and `/admin/newsroom` (cluster-driven flow). Breaking-news fast path: `/api/admin/broadcasts/alert` inserts a row with `status='published'` directly.

**State machine.** `ALLOWED_TRANSITIONS` at `route.ts:185-189`:

```
draft       → published, archived
scheduled   → published, archived, draft
published   → archived
archived    → draft
```

**On publish:** `published_at = now()`, `moderation_status = 'approved'` (`route.ts:423-427`).
**On archive:** `unpublished_at = now()`, `moderation_status = 'rejected'` (`route.ts:429-433`).
**On revert to draft:** `moderation_status = 'pending'` (`route.ts:435`).

**Permissions** (`route.ts:284-285`):
- `admin.articles.publish` — required to enter `published`.
- `admin.articles.unpublish` — required to leave `published`.

**The phantom `scheduled` state.** The enum accepts `scheduled`, `ALLOWED_TRANSITIONS` permits it, the admin UI renders a "scheduled" badge based on `published_at < now()` (`/admin/stories/page.tsx:43-51`). But **no cron sweep promotes scheduled articles at their scheduled time**. The `articles.publish_at` column exists in schema (`database.ts:1557`) and is never read by any code. Either the field should be wired to a cron, or the `scheduled` enum value should be removed. Slice session needs to lock intent.

**Audience / visibility.**
- "Live to public" = `status='published'`. Reader fetch (`/api/articles/by-slug/[slug]/route.ts:55`) returns 404 if `status != published` and caller can't edit.
- Sitemap (`/sitemap.xml`) filters to `status='published' AND age_band='adult'` only — kids/tweens articles are intentionally invisible to search engines (COPPA, Decision 22).
- No explicit RLS on `articles` itself shown in code; visibility enforced at app/middleware layer.

**Side effects on publish.**
- `audit_log` row written via `recordAdminAction()`.
- T235 transactional observability: `article.edit.begin` / `article.edit.commit` audit markers detect non-transactional child-mutation failure (sources/timelines/quizzes are deleted-and-reinserted on PATCH **outside any DB transaction**).
- Sitemap lazy-regenerates per request.
- **No push notification on regular publish.** `articles.push_sent` column exists; no code sets it.
- **Breaking news only:** `send_breaking_news` RPC fires async-best-effort (`broadcasts/alert/route.ts:170-174`). Failure doesn't roll back the insert.
- **No RSS, no email digest, no analytics event** on publish.

**Known fragility.**
- Non-transactional cascade — article UPDATE + delete/insert of children isn't wrapped in a DB transaction. T5 (deferred) plans an RPC `update_admin_article_with_children`. Today, partial failure leaves DB inconsistent; audit-log markers are the only detection.
- `scheduled` enum is a ghost feature.
- `archived → draft` is allowed; restoring a published article that someone else then republishes with a new slug breaks the old URL — intentional (Decision 3) but worth knowing.
- Slug collision is a 409 with no slug-history / redirect-chain.

**Open questions for publishing.**
- Is `scheduled` meant to be a real feature (build the cron) or removed (drop from enum + UI badge logic)?
- Should regular publish trigger push to subscribers, or is breaking-news the only push path on purpose?
- Should reader/home pages filter by `status` only, or also by `published_at <= now()` (which would change behavior the moment scheduling is wired)?

---

## Slice 3 — VIEWING

**Surfaces.**
- **Web public + logged-in:** `/[slug]` server component at `web/src/app/[slug]/page.tsx:85`. Uses service client to fetch (RLS-bypassed); enforces `status='published'` in code (`page.tsx:104`). Renders via `ArticleSurface` (read-only) or `ArticleEditor` (editor, code-split).
- **Legacy redirect:** `/story/[slug] → /<slug>` (`web/src/app/story/[slug]/page.tsx:16`).
- **iOS adult:** `VerityPost/StoryDetailView.swift:28`. Tabs: Story / Timeline / Discussion (Discussion gated by quiz pass, schema/013).
- **iOS kids:** `VerityPostKids/KidReaderView.swift:8`. Reads **only `kids_summary`**, refuses adult `body` (`KidReaderView.swift:262-268`). Belt-and-suspenders `is_kids_safe=true` filter on top of RLS.

**Render pipeline.**
- Web: server fetches markdown body, `renderBodyHtml()` (`lib/pipeline/render-body.ts:62-68`) sanitizes via `marked` + `sanitize-html` Node-native (no jsdom). Allowlist: semantic tags + safe schemes for href/img.
- iOS adult: plain-text body, split on `\n\n` paragraph breaks (`StoryDetailView.swift:656-673`).
- iOS kids: same, but consumes `kids_summary` not `body` (`KidReaderView.swift:58-69`).

**Citations / Sources.** Sources stored in `sources` table (per article). iOS adult renders a collapsible `sourcePillsSection` (`StoryDetailView.swift:830`) showing publisher, headline, URL. Web reader previously showed nothing — **slice 03 decision D2 adds a sources section to the web reader**. No inline citation chips on either surface.

**Timeline reader surface.** iOS adult renders `timelineContent` tab (`StoryDetailView.swift:916`), gated by `article.view.timeline`. Web reader previously had no timeline rendering — **slice 03 decision D3 adds a timeline section to the web reader**. Graceful no-op when no events.

**Permission RPC bug (fixed in slice 03 D1).** Both iOS (`PermissionService.swift:107`) and web (`permissions.js:115`) previously called `compute_effective_perms`, which does not exist in the DB. Actual resolver: `my_permission_keys` (returns `TABLE(permission_key varchar)`). Fix: rename RPC call + update response parsing (presence of key = granted). All three keys (`article.view.body`, `.sources`, `.timeline`) are granted to all users via `user` role → `anon` set — paywall UI remains as forward-looking infrastructure.

**Paywall / tier gates.**
- Web reader: **no paywall on the article body itself**. Status-gate (`status='published'`) only.
- iOS adult: paywall gate — `canViewBody` permission check (`StoryDetailView.swift:654-696`). After D1 fix, `canViewBody = true` for all users (body is in the `anon` set). Upgrade CTA remains in code for future paid tiers.
- iOS kids: no paywall (paid kids are paired); editorial gate fires when `kids_summary` is empty (`KidReaderView.swift:43-52`).

**Ads.**
- AdSense publisher ID `ca-pub-3486969662269929` (`layout.js:91`, `ads/serve/route.js:8`). `ads.txt` recently fixed.
- Ad insertion: `Ad.jsx` client-side fetcher hits `/api/ads/serve` (centralized via `serve_ad` RPC). Pro users suppressed at RPC level. Network adapters dispatch to `AdSenseSlot` (Google) or sandboxed iframe (direct/house).
- iOS: no ads in reader.

**Engagement / tracking.**
- Web: `/api/events/batch` (`events/batch/route.ts`) accepts events from clients; UA + IP hashed via `EVENT_HASH_SALT` before storage; bot UA flagged but stored. Client pipeline: `lib/track.ts` (buffered, sendBeacon on tab-hide), `lib/trackServer.ts` (server-side writes). **Slice 03 D4** wires `article_read_start`, `article_read_complete`, `scroll_depth` milestones, and `increment_view_count` to the web reader via a thin `ArticleTracker` client component + `IntersectionObserver` sentinels.
- iOS adult: `EventsClient.swift:38-285` buffers (20 events or 32KB), persists to disk (`events_pending.json`), drains on background (3s timeout), rehydrates on cold start. `trackReading()` fires on `loadData()` via `/api/stories/read`.
- iOS kids: explicit `logReading()` on quiz entry (`KidReaderView.swift:278-299`); `reading_log` row with `read_percentage=1.0`, `completed=true`. Single retry then throw (K4).
- Web bookmark add fires `bookmark_add` event (`bookmarks/route.js:96-100`).

**Known fragility / divergence.**
- ~~iOS kids re-fetch on background/foreground was deferred (A91)~~ — **fixed**: `KidReaderView.swift:113-116` re-fetches on `scenePhase == .active`.
- Web share UI absent from reader (out of scope for slice 03).
- `EVENT_HASH_SALT` throws at module load if `NODE_ENV=production` and unset (correct fail-closed).

**Open questions for viewing.**
- Where (or whether) reader-side citations render on web. Owner positioning ("every story has citations") is a marketing claim; gap if readers can't see them.
- Web reading-progress / scroll-percentage tracking — admin reader page references `read_scroll_pct` / `read_min_sec` settings (`admin/reader/page.tsx:40`) but no implementation found in the slice.
- "Up Next" / related articles: iOS has it (`upNextSheet`), web slice didn't surface an equivalent.
- iOS kids stale-content fix.
- Last-read / resume-from-where-you-left-off: no `last_read` table found.

---

## Slice 4 — QUIZZES

**Surfaces.**
- **Admin authoring:** `StoryEditor.tsx:224` and `KidsStoryEditor.tsx` — admin edits quiz questions per article. Saved via `/api/admin/articles/save` (delete-all-then-reinsert).
- **Web take-the-quiz:** `ArticleQuiz.tsx:1-632` on the article page. States: `idle → loading-start → answering → loading-submit → result`.
- **iOS adult:** `StoryDetailView.swift:70-82`. `APIQuizQuestion` struct at `:3109-3135`.
- **iOS kids:** `KidQuizEngineView.swift:1-250`. Disk-backed `PendingQuizWrite` queue (T251) survives parental interrupts and crashes.
- **Admin manual mark:** `/api/admin/users/[id]/mark-quiz` (T-005) — admin can flag a quiz as completed; only stamps the first quiz_id from the pool (`route.ts:65-72`).

**State machine — attempt lifecycle.**
1. `POST /api/quiz/start` → `start_quiz_attempt` RPC returns `{questions, attempt_number, attempts_used, max_attempts}`. Rate-limited 3 starts / 600s.
2. `POST /api/quiz/submit` with answers → `submit_quiz_attempt` RPC grades. Rate-limited 30 submits / 60s.
3. Server side runs `score_on_quiz_submit` (points, category_scores, streak). If passed, `check_user_achievements`.
4. UI transitions to `result` → if passed, "Discussion unlocked" (gates comment composer).

**Schema highlights.**
- `quizzes` (`database.ts:8007-8073`) — one row per question. Correct answer in `metadata.correct_index` (per migration 2026-04-28_persist_timeline_lenient_date.sql:199), but `is_correct` per-option is what gets stripped before sending to iOS (`api/kids/quiz/[id]/route.ts:217-230`). Pool logic uses `pool_group`.
- `quiz_attempts` (`database.ts:7919-8006`) — **one row per answer**, not per attempt. `attempt_number` groups them. Includes `kid_profile_id` for kids.
- Aggregates land in `users.quizzes_completed_count`, `users.streak_current`, `category_scores.score`.

**Kids / COPPA.**
- Kids quiz endpoint `/api/kids/quiz/[id]` requires Bearer kid-JWT, strips `is_correct` from options (security gate S10-A6).
- `is_kids_safe=true AND status='published'` enforced (`route.ts:165-190`).
- Disk-backed pending writes rehydrate on launch (`KidQuizEngineView.swift:153-200`) — quiz data-loss vector mitigated.
- Leaderboard: kids only appear globally if `kid_profiles.global_leaderboard_opt_in=true` (per COPPA).

**Streaks / leaderboards.**
- `advance_streak` RPC fires on quiz pass; idempotent per day.
- Cron `check-user-achievements` (03:45 UTC, `web/src/app/api/cron/check-user-achievements/route.js`) catches time-based milestones.
- Leaderboard pages drive off `category_scores`, `users.verity_score`, `users.streak_current`.

**Kill switch.** `v2LiveGuard()` (system-wide). No per-quiz flag. T287 — admin UI for kill switches doesn't exist; flag toggles require direct DB write.

**Known fragility.**
- `selected_answer` typed as `number` in TS client but `string` in DB schema (`database.ts:7932`); admin mark-quiz writes a literal string `admin_manual:{score}/{total}` (`mark-quiz/route.ts:70`) — semantics inconsistent.
- `quizzes.deleted_at` exists but most queries don't filter on it. Only `/api/kids/quiz/[id]/route.ts:199` explicitly checks `.is('deleted_at', null)`.
- Admin save deletes all quizzes and reinserts; doesn't soft-delete.
- `/api/admin/users/[id]/mark-quiz` only inserts the first quiz_id and force-unwraps `pool![0].id`; doesn't simulate full quiz.
- Pool exhaustion: T149 — when user has answered every pool question, UI shows a recovery state (`ArticleQuiz.tsx:300-306`).

**Open questions for quizzes.**
- Where in the LLM pipeline are quiz questions actually generated? `prompt-overrides.ts:20-21` references the step but the implementation wasn't fully surfaced.
- `pool_group` semantics — per-article or per-timeline-entry?
- `percentile` returned by submit endpoint — how computed? No percentile logic surfaced in `submit/route.js` or `lib/scoring.js`.
- `weekly_recap_quizzes` / `weekly_recap_attempts` tables exist (`database.ts:10789-10828`) — separate feature or ghost?
- Kids quiz JWT (`is_kid_delegated=true`, `kid_profile_id` claim): where issued? Not in slice reviewed.
- Are quiz pass-state and "Discussion unlocked" the right gate, or should commenting also be tier-gated?

---

## Slice 5 — TIMELINES

**What "timeline" means here.** Editorial chronological event sequences embedded **per article**: 4-10 dated events that scaffold the news ("how we got here"). Defined by the `timelines` table with one-to-many to articles. (The word "timeline" also colloquially refers to a user's profile activity feed and a kid's reading log — those aren't this slice.)

**Surfaces.**
- **Admin authoring:** `StoryEditor.tsx:862-913` and `KidsStoryEditor.tsx:701-752`. Vertical preview, "now" marker, two entry types (`event` and `story` — though see fragility).
- **iOS adult reader:** Timeline tab in `StoryDetailView.swift:296-297`, gated by `article.view.timeline` permission (`:478`).
- **Web reader:** **none.** `/[slug]` and `ArticleSurface.tsx` have no timeline render and no fetch. This is a gap, not a kill-switch.

**Schema** (`database.ts:9624-9679`).
- `id`, `article_id` (FK), `event_date` (timestamptz, NOT NULL), `event_label` (text, NOT NULL), `event_body`, `event_image_url`, `source_url`, `sort_order`, `metadata`.
- Columns `title`, `description` exist but are **never populated** by current code paths.
- No `ON DELETE CASCADE` on the FK — deleting an article orphans timeline rows.

**Authoring paths.**
1. **AI pipeline auto-generate** (preferred) — step 9 of generation chain, `TIMELINE_PROMPT` / `TWEENS_TIMELINE_PROMPT` / `KIDS_TIMELINE_PROMPT` in `editorial-guide.ts`. Inserted via `persist_generated_article`.
2. **Manual admin entry** — `StoryEditor` "Add event" → `/api/admin/articles/save` (entry-by-entry upsert) or `/api/admin/articles/[id]` PATCH (delete-all-then-reinsert).
3. **Legacy "Enrich timeline" button** — `/api/ai/generate` route (T69, marked for deletion). Two callers remain: `StoryEditor.tsx:963-974` and `KidsStoryEditor.tsx:795-802`.

**Rendering.**
- Admin: vertical column with circles, dates, labels (`StoryEditor.tsx:870-890`).
- iOS adult: same shape (`StoryDetailView.swift:916-983`). Sort `event_date ASC`.
- Web reader: nothing.

**Known fragility.**
- **Type/content silently dropped.** Admin UI captures `entry.type` ('event'|'story') and `entry.content`; save endpoints pass these to the DB; the DB has no such columns. Supabase ignores the extras silently — no error, no warning. Either the schema is missing columns or the UI is dead.
- **`article.view.timeline` permission.** iOS hardcodes the check. The permission key is **not visibly defined** in the web codebase (no row in permission migrations, no `compute_effective_perms` reference). If the key was never granted, the iOS timeline tab is permanently locked.
- **Lenient date fallback to `now()`** corrupts event_date (a 2013 event becomes a 2026 event silently).
- **Web reader has no timeline rendering at all** — the most-trafficked surface drops the feature.
- `parse_timeline_event_date` has no test coverage shown.

**Open questions for timelines.**
- Does `article.view.timeline` exist in permission seed data? If yes, who has it? If no, iOS timeline is dead UI.
- Are `type`/`content` UI fields a planned story-type feature that was abandoned, or a bug to remove?
- Should web readers see timelines too, or is iOS-only intentional?
- `is_current` boolean appears in UI logic — is it derived from `event_date` proximity, persisted, or ephemeral?

---

## Slice 6 — COMMENTS

**Surfaces.**
- **Web:** `CommentComposer.tsx:74-323`, `CommentThread.tsx:80-1070`, `CommentRow.tsx:56-81`. Quiz-pass gates Discussion (schema/013, `route.js:112-124`).
- **iOS adult:** comment composer + thread in `StoryDetailView.swift`. `VPComment` model decodes mentions array, deleted_at, status, isEdited, contextTagCount.
- **iOS kids:** **no comment surface.** Confirmed.
- **Admin moderation:** `/admin/moderation` (user penalties), `/admin/comments` (separate page, not fully surfaced), `/admin/moderation/reports` (triage queue).

**State machine.** `comments.status` ∈ {`visible` (default), `hidden`, `removed`, `hidden_by_user`, `deleted`}. Plus `deleted_at` for soft-delete.
- `hide_comment` RPC: `status='hidden'`, body preserved for appeals.
- `redact` mode: overwrites body, closes subpoena exposure.
- `soft_delete_comment` RPC: `deleted_at=now()`, `body='[deleted]'`, `mentions='[]'`.
- Edit window: 10 minutes from `created_at`, owner-only (`/api/comments/[id]/route.js:138`).

**Schema** (`database.ts:2811-3000`). Columns of note: `parent_id` + `root_id` (threading), `mentions` (jsonb of `{user_id, username}`), `upvote_count` / `downvote_count` / `reply_count` / `edit_count`, `is_pinned` / `is_context_pinned` / `context_tag_count`, `is_expert_question` / `is_expert_reply`, `ai_toxicity_score` / `ai_sentiment` / `ai_tag` / `ai_tag_confidence`, `moderated_at` / `moderated_by` / `moderation_reason`.

**Mentions (pro-only).**
- Regex `/@([a-zA-Z0-9_]{2,30})/g` (`lib/mentions.js:1`). Server resolves against `users.username`; unresolved drops.
- Pro gate: UI checks `comments.mention.insert` permission; pre-submit `/api/comments/can-mention` blocks free-tier; RPC re-validates on insert.
- Hyperlinked to `/card/{username}` in render. **No notification fires** (per "no emails for in-app events" + no in-app notification path either).

**Moderation.**
- Reports: `/api/comments/[id]/report` (rate-limited 10/h per user, 3/d per target — urgent reasons bypass per-target). Reasons enum includes `csam`, `child_exploitation`, `grooming` (URGENT). Urgent path: NCMEC stub submission with 18 U.S.C. § 2258A fields (`ncmec.ts` — stub returns early until operator configures).
- Queue: `GET /api/admin/moderation/reports` sorts by `is_supervisor_flag DESC, created_at DESC`. Resolution enum: `actioned|dismissed|duplicate`.
- Hide: `POST /api/admin/moderation/comments/[id]/hide` audited via `recordAdminAction` to `audit_log`.

**Rate limits** (`lib/rateLimits.ts:78-79` + inline literals):
- POST 10/min/user, PATCH 5/min/user, vote 30/min/user, can-mention 60/min/user, report 10/h/user + 3/d/target.

**Notifications.** Per owner principle, **no email or push** for replies / mentions / votes. In-app realtime via Postgres Changes channel.

**Kill switch.** `v2LiveGuard()` system-wide. No per-comment flag. T287 admin UI absent.

**Known fragility.**
- **`moderation_actions` table never created.** TODO at `/admin/moderation/page.tsx:26-42`. Comment hide/unhide has **no audit trail** (only user-level penalties audit). Critical gap for any moderation accountability story.
- **NCMEC submission is a stub** — urgent reports go to logs, not actually submitted, until operator configures credentials. Compliance risk if launched as-is.
- `ai_toxicity_score` / `ai_sentiment` / `ai_tag` columns exist but **no caller writes them visibly.** Auto-moderation is undocumented in the slice.
- `CommentThread.tsx:265` selects `users.*` on realtime INSERT, which post-T300 RLS on `users` blocks; works around via `public_profiles_v` for initial fetch, but the realtime path may fail RLS silently.
- iOS edit window state isn't synced with server's 10-min cap — UI may show Edit button after the server starts rejecting.
- `CommentThread.tsx:145` casts `resolvedRows as never-flagged` — work-around for missing schema post-migration.

**Open questions for comments.**
- Where (and whether) AI moderation runs. Edge function? Trigger? Cron? External API?
- Profanity filter — none visible; intentional?
- Shadow-ban / suppress-from-others without hiding — not present; needed?
- Expert-question routing — flow exists in UI (`CommentThread.tsx:525-549`), downstream unclear.
- Comment search and indexing — none found.
- GDPR data export inclusion of comments — not confirmed.

---

## Cross-cutting infrastructure (the bones)

### Permissions

`compute_effective_perms(p_user_id)` RPC (`lib/permissions.js:101-142`) returns `{permission_key, granted, granted_via, deny_mode, lock_message, source_detail}`. Granted via plan / role / direct. Cache invalidated by `my_perms_version()` bump; revokes hard-clear (fail-closed); grants tolerate ~200ms deny window.

**Lifecycle-relevant keys** (`supabase/migrations/2026-04-28_newsroom_permission_keys.sql:10-51`): `newsroom.run_feed`, `newsroom.generate`, `newsroom.skip`, `articles.edit`, `articles.publish`. Plus comment / quiz / view keys (e.g. `comments.mention.insert`, `quiz.attempt.start`, `article.view.body`, `article.view.timeline`, `article.view.sources`, `article.view.ad_free`).

`users_protect_columns()` trigger blocks self-update of cohort, comped_until, plan_id, plan_status, is_banned, email_verified, is_expert. Bypassed by `app.auth_sync='true'` GUC inside auth-sync trigger only (`supabase/migrations/2026-04-28_auth_sync_guc_bypass.sql:45-159`).

### Cron

All under `web/src/app/api/cron/*`, scheduled in `web/vercel.json`. Every cron verifies `CRON_SECRET` bearer (`lib/cronAuth.js`); fail-closed.

Article-lifecycle relevant:
- `pipeline-cleanup` (06:00 UTC) — orphan runs >10min, items stuck in 'generating' >10min, locks >15min, clusters >14d w/ no articles (500/run cap).
- `check-user-achievements` (03:45 UTC) — quiz/reading/comment-driven achievement awards.
- `recompute-family-achievements` (03:30 UTC).
- `send-emails` / `send-push` (every 5 min) — drain notification queue. Email is transactional-only post-T-EMAIL-PRUNE (data_export_ready, kid_trial_expired, expert_reverification_due).
- Audit-log retention: `anonymize-audit-log-pii` (>30d nulls PII), `purge-audit-log` (>180d hard delete).

Adjacent (not lifecycle but co-located): `sweep-kid-trials`, `freeze-grace`, `process-deletions`, `process-data-exports`, `birthday-band-check`, `subscription-reconcile-stripe`, `dob-correction-cooldown`, `flag-expert-reverifications`, `cleanup-data-exports`, `purge-webhook-log`, `rate-limit-cleanup`.

### No edge functions

`supabase/functions/` does not exist. All serverless logic = Vercel route handlers.

### Rate limits

Catalog in `lib/rateLimits.ts:41-80`; DB override in `rate_limits` table (`is_active` toggle); RPC `check_rate_limit(key, max, window)` atomic via advisory lock. Fail-closed in prod; dev fail-open requires both `NODE_ENV=development` AND `RATE_LIMIT_ALLOW_FAIL_OPEN=1`.

### Audit log

`audit_log` table (`database.ts:1838-1923`). `recordAdminAction()` writes lifecycle events (`article.publish`, `article.unpublish`, `comment.report.resolve`, etc.). PII anonymized after 30d, hard-purged after 180d. **Comment hide/unhide audit gap** noted above.

### Notifications

`notifications` table with channels `in_app|email|push`. Drained every 5 min. Push via APNs; quiet-hours respected via `_is_in_quiet_hours` RPC. Article publish does **not** create notifications outside breaking-news.

### iOS parity

Adult app and Kids app both hit the same Supabase project with the same client. Adult `Story` decoder maps directly to `articles` columns. Kids reader scopes to `kids_summary` only and adds `is_kids_safe=true` belt-and-suspenders. Permission system is shared — `compute_effective_perms` works identically. Drift risks: age-band enforcement is app-side on iOS (no RLS shown), iOS quiz engine vs web quiz UI may interpret `difficulty`/`points` differently, kids app has `ParentalGateModal` with no web equivalent (kids app is mobile-only by design — per memory).

### Kill switches

- `v2_live` feature flag (`lib/featureFlags.js:49-80`) — system-wide gate enforced on quiz routes and comment routes. T287 admin UI absent.
- `permissions.is_active=false` — runtime disable per permission.
- `rate_limits.is_active=false` — runtime disable per policy.
- Env vars: `APNS_AUTH_KEY` (push cron 503 if missing), `RESEND_API_KEY` (email cron 503 if missing), `EVENT_HASH_SALT` (events ingest module-load-throw if missing in prod).

---

## Cross-surface seams (the joins between slices)

| From → To | Field / Event | Notes |
|---|---|---|
| Generation → Publishing | `articles.status='draft'`, `is_ai_generated=true`, `feed_cluster_audience_state.state='generated'` | Admin still has to manually promote draft→published. No auto-publish path. |
| Publishing → Viewing | `articles.status='published'`, `published_at`, `moderation_status='approved'` | Reader API 404s otherwise. Sitemap re-renders on next request. |
| Publishing → Quizzes | `articles.status='published'` | Kids quiz endpoint enforces this (`api/kids/quiz/[id]/route.ts:184`). Web quiz route trusts caller. |
| Viewing → Quizzes | (nothing required) | Quiz can start without article being read. Quiz-pass DOES gate Discussion. |
| Viewing → Comments | quiz-pass | Comment composer disabled until quiz passed (schema/013). |
| Quizzes → Streaks/Leaderboards | `score_on_quiz_submit` writes `category_scores`, `users.streak_current`, `users.quizzes_completed_count` | Cron `check-user-achievements` awards milestones. |
| Generation → Timelines | `persist_generated_article` writes `timelines` rows with parsed event_date | Lenient parse fallback to NULL/now() — silent corruption. |
| Generation → Quizzes | persist also writes `quizzes` rows | `is_correct` per option flagged in metadata.correct_index. |
| Comments → Audit | only user penalties + report.resolve audited | **Comment hide/unhide is unaudited** — TODO T287. |
| All slices → audit_log | `recordAdminAction` | PII anonymized 30d, purged 180d. |
| All slices → events | client buffers → `/api/events/batch` | Web batching mechanism not surfaced; iOS has explicit EventsClient. |

---

## Cross-slice patterns and fragilities (not slice-specific)

1. **`scheduled` is a phantom feature** — enum value, transition rules, UI badge — but no cron promotes scheduled articles. Either build it or remove the enum value.

3. **Web reader has no timeline rendering and no citation rendering.** Two of the product's narrative scaffolding features are visible only in admin (timelines) or stored but invisible (citations). For a product positioned as "every story has citations," the web reader gap is striking. Surface in viewing slice.

4. **Comment moderation has no audit trail for hide/unhide.** TODO T287. For a moderation system with NCMEC paths, the lack of audit on "admin hid this user's comment" is a compliance and accountability gap.

5. **NCMEC submission is a stub.** Urgent CSAM/grooming reports are detected, escalated in the queue, but **not submitted** to NCMEC until operator configures credentials. Owner needs to lock when this gets wired and what happens to backlog.

6. **System-wide kill switch (`v2_live`) but no admin UI** to toggle. T287. Operations risk: pulling the brake requires direct DB access.

7. **AI moderation columns exist but no caller writes them.** `ai_toxicity_score`, `ai_sentiment`, `ai_tag`, `ai_tag_confidence` on comments are populated by an unknown source — possibly a planned feature, possibly dead schema.

8. **`article.view.timeline` permission may not exist in permission seed.** iOS hardcodes the check; web codebase doesn't define the key. Verify in slice 5.

9. **Type/content silently dropped on timeline insert.** Admin UI tracks fields the schema doesn't have. Either UI is dead or schema is missing columns.

10. **Non-transactional cascade on article PATCH.** T235 audit-log markers are detection, not prevention. T5 (RPC `update_admin_article_with_children`) is the fix, deferred.

11. **Cost-cap advisory lock contention.** Single hash serializes all generate concurrency. Scales poorly.

12. **Lenient date parse falls back to `now()` silently.** Timeline event_date corruption when the LLM returns unparseable dates.

13. **iOS kids stale-content on background→foreground.** A91 deferred; kids see hours-old content after long backgrounding.

14. **Web event tracking implementation unsurfaced.** iOS has explicit EventsClient with persistence, retry, rehydrate. Web equivalent not visible in slice. If web silently drops events on tab close, analytics are unreliable.

15. **Articles RLS not visible.** No explicit RLS policies on `articles` shown in code. Visibility relies on application-layer checks. A middleware bug could leak drafts.

---

## Owner-questions for slice sessions to surface

These are not for this session. They're tagged to the slices that should ask them.

- **Slice 1 (Generation):** Source grounding claims are computed and discarded — should they be surfaced to the editor as a quality signal? Plagiarism `needs_manual_review` flag exists but there's no admin filter to find flagged articles. Standalone clusters are never cleaned up.
- **Slice 2 (Publishing):** Build `scheduled` cron or rip the enum value? Should regular publish push notify, or is breaking-news-only intentional?
- **Slice 3 (Viewing):** Where do citations render to readers (web + iOS)? Should web get a timeline tab or is iOS-only intentional? Stale-content fix priority for iOS kids?
- **Slice 4 (Quizzes):** `pool_group` semantics, `percentile` calculation, weekly_recap_quizzes lifecycle, kids JWT issuance path.
- **Slice 5 (Timelines):** Verify `article.view.timeline` permission seed. Decide on type/content UI fields. Decide reader-side rendering scope.
- **Slice 6 (Comments):** When does NCMEC get wired? When does `moderation_actions` audit trail get built? Who writes `ai_toxicity_score`?

---

## Files referenced (stable anchors)

- Generation: `web/src/app/api/admin/pipeline/generate/route.ts`, `web/src/lib/pipeline/persist-article.ts`, `web/src/lib/pipeline/editorial-guide.ts`, `web/src/lib/pipeline/call-model.ts`, `web/src/lib/pipeline/plagiarism-check.ts`
- Publishing: `web/src/app/api/admin/articles/[id]/route.ts`, `web/src/app/api/admin/articles/save/route.ts`, `web/src/app/api/admin/articles/new-draft/route.ts`, `web/src/app/api/admin/broadcasts/alert/route.ts`, `web/src/app/sitemap.js`
- Viewing: `web/src/app/[slug]/page.tsx`, `web/src/components/article/ArticleSurface.tsx`, `web/src/components/Ad.jsx`, `web/src/components/AdSenseSlot.tsx`, `web/src/app/api/ads/serve/route.js`, `VerityPost/VerityPost/StoryDetailView.swift`, `VerityPostKids/VerityPostKids/KidReaderView.swift`
- Quizzes: `web/src/components/ArticleQuiz.tsx`, `web/src/app/api/quiz/start/route.js`, `web/src/app/api/quiz/submit/route.js`, `web/src/app/api/kids/quiz/[id]/route.ts`, `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- Timelines: `web/src/components/article/StoryEditor.tsx:862-913`, `web/src/components/article/KidsStoryEditor.tsx:701-752`, `VerityPost/VerityPost/StoryDetailView.swift:296-297`, `web/src/lib/pipeline/editorial-guide.ts:696-799`, `supabase/migrations/2026-04-28_persist_timeline_lenient_date.sql`
- Comments: `web/src/components/CommentComposer.tsx`, `web/src/components/CommentThread.tsx`, `web/src/components/CommentRow.tsx`, `web/src/app/api/comments/route.js`, `web/src/app/api/comments/[id]/route.js`, `web/src/app/api/comments/[id]/report/route.js`, `web/src/app/api/admin/moderation/comments/[id]/hide/route.js`, `VerityPost/VerityPost/Models.swift:297-378`
- Cross-cutting: `web/src/lib/permissions.js`, `web/src/lib/rateLimit.js`, `web/src/lib/rateLimits.ts`, `web/src/lib/cronAuth.js`, `web/src/lib/featureFlags.js`, `web/vercel.json`, `web/src/types/database.ts`, all `supabase/migrations/2026-04-28_*.sql`

---

This map will get amended (not rewritten) as slice sessions surface new findings. Sessions write their slice doc to `slices/<NN>-<name>.md`; only the cross-cutting "known fragility" and "open questions" lists update here as new ones emerge.
