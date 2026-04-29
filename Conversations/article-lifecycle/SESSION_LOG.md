# Article Lifecycle Redesign — Session Log

Append-only chronological log. Most recent at the bottom. Each entry: date, phase, what happened, what got locked, what's blocked, what next session picks up.

---

## Session 1 — 2026-04-29 — Foundation

**Phase entering:** 0 (no artifacts).
**Phase leaving:** 1 (foundation locked, no slice yet started).

**What happened.** The program started cold — no `Conversations/article-lifecycle/` directory existed. Convo 1 (auth/login redesign) was the format reference; read it to anchor on narrative-with-reasoning shape and lock its outputs as upstream context.

Spawned seven parallel Explore agents, one per slice plus one cross-cutting infrastructure pass. Each was instructed to read code only — `web/src/`, `VerityPost/`, `VerityPostKids/`, `supabase/migrations/`, cron, edge functions — and return a structured report with `file:line` citations. Reports came back covering:

- Generation pipeline (12-step LLM chain, persist RPC, audience-state machine, lock + cost reservation infrastructure).
- Publishing flow (PATCH route as the publish action, ALLOWED_TRANSITIONS, side-effects, the phantom `scheduled` enum value with no cron behind it).
- Viewing surfaces (web `/[slug]`, iOS adult `StoryDetailView`, iOS kids `KidReaderView` reading only `kids_summary`, AdSense wiring, paywall posture differences between web and iOS adult).
- Quizzes (start/submit RPCs, `quiz_attempts` schema with one row per answer, kids disk-backed pending writes, T287 missing kill-switch UI).
- Timelines (admin authoring is fully built, LLM auto-generates them, iOS adult renders gated by a permission key that may not exist in seed data, **web reader has no timeline rendering at all**).
- Comments (web + iOS, no kids surface, pro-only mentions, NCMEC stub for urgent reports, comment hide/unhide is **unaudited**).
- Cross-cutting (cron schedule, rate limit catalog, audit log retention, no Supabase edge functions, iOS parity story).

Synthesized all seven reports into `00-system-map.md` — the foundation reference. Wrote `README.md` (program rules, slice-status vocabulary, start/end protocols), `INDEX.md` (live dashboard with all six slices marked not-started and a 15-item cross-slice findings list), and this log.

**What got locked.**

- The four foundation artifacts: `README.md`, `INDEX.md`, `SESSION_LOG.md`, `00-system-map.md`.
- The slice ordering default (generation → publishing → viewing → quizzes → timelines → comments). Owner can redirect.
- The slice-status vocabulary (`not-started → investigating → questions-open → adversarial-review → locked`).
- The discipline rules (code only, plan only, one question at a time, adversarial review per slice, memory rules apply every session).

**No design decisions were made.** Phase 0 is understanding only.

**What's blocked.** Nothing. All slices are unblocked. The cross-slice findings in `INDEX.md` will be decided as their respective slice sessions run.

**Surfaced for owner attention** (not for this session, but the slice sessions will bring these forward):

- The biggest finding is that **AI is writing the entire article body autonomously** in the current generation pipeline. This is structural drift from the owner's locked principle that AI is meant to assist a human author, not write full bodies. Slice 01 (generation) will redesign around this.
- **Web reader has no timeline rendering and no citation rendering surface.** For a product positioned as "every story has citations," this is a real gap. Slices 03 (viewing) and 05 (timelines) need to decide scope.
- **Comment moderation hide/unhide has no audit trail** (TODO T287, table never created). Slice 06 has to decide when this gets built.
- **NCMEC submission is a stub** — urgent CSAM/grooming reports are detected and queued but not actually submitted to NCMEC. Compliance question for slice 06.
- **`scheduled` article state is a phantom feature.** Enum exists, UI shows a badge, but no cron promotes scheduled articles. Slice 02 has to decide build-or-rip.

**What next session should pick up.** Slice 01 — generation. Re-read the system map's generation section + cross-surface seams. Spawn parallel Explore agents to deepen investigation specifically for generation (with focus on the AI-as-author drift, the cost-cap contention, the lenient-date fallback, and the standalone-cluster cleanup gap). Surface findings to the owner. Run question-by-question Q&A. Adversarial review. Lock slice doc at `slices/01-generation.md`. Update `INDEX.md`. Append next entry to this log.

The system map is the load-bearing artifact. Read it every session before slice work, and amend (not rewrite) it as new findings surface.

---

## Session 2 — 2026-04-29 — Slice 01: Generation

**Phase entering:** 1 (foundation locked, no slice started).
**Phase leaving:** 2 (slice 01 locked).

**What happened.** Spawned four parallel deep-dive Explore agents targeting the generation pipeline, editorial guide, admin newsroom UI, and cost/cleanup infrastructure. Agents returned `file:line` findings across all areas.

Key new findings beyond the system map:
- Source grounding claims are computed and discarded — never persisted anywhere.
- `scheduled` badge in admin fires on `created_at < now()` (timestamp bug), not on `status='scheduled'`. Cross-slice item, deferred to Slice 02.
- Daily cost cap reads from `settings.pipeline.daily_cost_usd_cap` — settable live, not hardcoded.
- Standalone clusters (`keywords=['standalone']`) accumulate permanently — no dedicated cleanup path.
- `needs_manual_review` plagiarism flag has no admin filter to surface flagged articles.
- Body word count conflict: route prompt says 80–400 words; editorial guide says 175/250/300. Two sources of truth.
- Quiz questions grounded in AI body — stale if editor rewrites body before publishing.
- Haiku model `claude-haiku-4-5-20251001` hardcoded at one constant; no fallback.
- Manual new-draft path already exists (`/api/admin/articles/new-draft`, `mode='manual'`).

Before Q&A: owner clarified that AI-generated full article bodies are the intended behavior — editor reviews and publishes. The 2026-04-27 memory "AI role intent — never meant to be the writer" was incorrect. Deleted the memory, cleaned the cross-slice finding from INDEX.md and the system map.

**Q&A pass (7 questions, all locked):**
1. Plagiarism flag queue — not needed; editors rewrite anyway.
2. Source grounding claims — stay discarded; sources list sufficient.
3. Standalone cluster cleanup — include in existing 14-day+no-articles cron, no special handling.
4. Haiku model string — update to `claude-haiku-4-5`.
5. Regenerate quiz button — yes; manual trigger in StoryEditor; new endpoint required.
6. Body word count — 250–400 words.
7. Summary — 40–60 words, substantive (who/what/where), up to 3 sentences.
8. Kids/tweens word count — same as adult: 250–400 words.

**Adversarial review findings, absorbed:**
- Standalone cleanup: existing skip-if-has-articles guard handles the cascade concern automatically. Just remove the keyword exemption.
- Haiku: only one constant to update (`route.ts:178`), not five separate sites.
- Quiz regen: no partial-run support in main pipeline — new endpoint `/api/admin/pipeline/quiz-regenerate` required.
- Summary: current prompt says "max 40 words" — update to "40–60 words, up to 3 sentences."
- Body schema: add `.min(250).max(400)` to `BodySchema.word_count` so constraint is enforced, not just advisory.
- Kids/tweens word counts (80–120 / 120–180) updated to match adult 250–400 per owner decision.

**What got locked.** Slice doc at `slices/01-generation.md`. Seven decisions sealed. INDEX.md updated, cross-slice list renumbered (removed AI-as-author item + cost-cap contention item — cost cap is settable live, no action needed).

**What's blocked.** Nothing.

**What next session should pick up.** Slice 02 — publishing. Re-read the system map's publishing section. Key questions already visible: `scheduled` phantom feature (build cron or rip enum?), non-transactional cascade on article PATCH (T5 RPC — when to build?), no explicit RLS on `articles`, push notification on regular publish (intentional or gap?). Spawn deep-dive agents before surfacing to owner.

---

## Session 3 — 2026-04-29 — Slice 02: Publishing

**Phase entering:** 2 (slice 01 locked).
**Phase leaving:** 3 (slice 02 locked).

**What happened.** Spawned four parallel deep-dive Explore agents: publishing PATCH route + side-effects, `scheduled` phantom feature, articles RLS + permission model, and non-transactional cascade + push notification gap. All four returned with file:line findings.

Key new findings beyond the system map:
- `scheduled` is even more phantom than the system map described — no code path ever writes `status='scheduled'`. The feature is completely inert. The stories-page badge logic (`timeAgo()`) computes "scheduled" from a timestamp comparison, not the status field. Six places need changing plus a migration to drop `publish_at`.
- Articles RLS: confirmed no policies exist. All fetches (admin and public page) use `createServiceClient()`. The only draft-leak protection is a code-level `notFound()` check in two places. Both iOS apps use the anon key and would be subject to RLS — but all iOS article reads originate from published-article lists, so a `status='published'` policy is safe.
- Non-transactional cascade: confirmed with exact line citations. `TODO(T5)` at `route.ts:461` is undisputably not implemented. Audit begin/commit markers exist and are correctly wired.
- Regular publish fires no push notification: confirmed. Nothing inserts a `notifications` row on standard publish. Breaking news is the only push-wired path.
- Breaking news route (`/api/admin/broadcasts/alert`) directly INSERTs at `status='published'`, bypassing `ALLOWED_TRANSITIONS`. Best-effort push fan-out — article stays published if push fails.

**Q&A pass (4 questions, all locked):**
1. `scheduled` status — rip it.
2. RLS on `articles` — add it (protect drafts at DB layer).
3. Regular publish push notification — breaking-news-only is intentional, no change.
4. T5 transactional RPC — defer further.

**Adversarial review findings, absorbed:**
- Decision A (rip scheduled): scope is 8 changes, not 3 — Zod enum, ALLOWED_TRANSITIONS, stories filter type + dropdown + statusVariant + timeAgo(), migration to drop `publish_at`, TypeScript type regeneration after migration. No blockers.
- Decision B (RLS): iOS anon-key usage confirmed. KidsAppState and KidReaderView lack explicit status filters but read IDs from published-article lists — RLS will agree with existing data. Verify both queries during implementation.
- Decisions C and D: no regressions found.

**What got locked.** Slice doc at `slices/02-publishing.md`. Four decisions sealed. INDEX.md updated (cross-slice items 1, 9, 13 resolved). This log entry appended.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 03 — viewing. Re-read the system map's viewing section. Key questions: where (if anywhere) do citations render to readers on web and iOS; should web get a timeline tab; iOS kids stale-content (A91); web event tracking implementation. Spawn deep-dive agents before surfacing to owner. Re-read the system map's publishing section. Key questions already visible: `scheduled` phantom feature (build cron or rip enum?), non-transactional cascade on article PATCH (T5 RPC — when to build?), no explicit RLS on `articles`, push notification on regular publish (intentional or gap?). Spawn deep-dive agents before surfacing to owner.

---

## Session 4 — 2026-04-29 — Slice 03: Viewing

**Phase entering:** 3 (slices 01–02 locked).
**Phase leaving:** 4 (slice 03 locked).

**What happened.** Spawned four parallel deep-dive Explore agents: web reader surface, iOS adult `StoryDetailView`, iOS kids `KidReaderView` + A91, and web event tracking. Agents returned file:line findings across all surfaces. Ran DB queries via MCP to verify permission keys and the permission function catalog.

Key new findings beyond the system map:
- **Critical bug:** Both iOS (`PermissionService.swift:107`) and web (`permissions.js:115`) call `compute_effective_perms`, which does not exist as a DB function. Every iOS permission check fails on cold start — `canViewBody`, `canViewSources`, `canViewTimeline` all return false, so every iOS adult user sees a paywall and cannot read articles. The actual resolver is `my_permission_keys`. Verified via `information_schema.routines`.
- `article.view.body`, `.sources`, `.timeline` are all granted to all users (via `user` role → `anon` set). Once the RPC is fixed, the paywall clears for everyone — correct per current data model.
- Web reader has no sources section, no timeline, no share UI, no event tracking, no paywall.
- A91 (iOS kids stale content): already fixed — `KidReaderView.swift:113-116` re-fetches on `scenePhase == .active`. Cross-slice item 11 closed without any action needed.
- Web event pipeline fully built (`track.ts`, `trackServer.ts`, `/api/events/batch`) but nothing wired to the article reader. `article_read_start`, `article_read_complete`, `scroll_depth` defined in `types.ts`, never fired. `increment_view_count` RPC exists, never called (deferred to "Phase B").
- iOS "Up Next" sheet (3 related articles at 95% scroll, same category) is fully built — no action needed.

**Q&A pass (4 questions, all locked):**
1. Broken `compute_effective_perms` RPC — fix it (rename + update response parsing on both iOS and web).
2. Sources on web reader — yes, add a sources section.
3. Timeline on web reader — yes, add a timeline section, graceful no-op when empty.
4. Web event tracking — yes, wire `article_read_start`, `article_read_complete`, `scroll_depth`, and `increment_view_count` to the reader now.

No adversarial review this session — owner clarified that the session is decisions + documentation only, no code execution. Slice doc records the implementation checklist for the execution session.

**What got locked.** Slice doc at `slices/03-viewing.md`. Four decisions sealed (D1–D4). INDEX.md updated (cross-slice items 2, 3, 11, 12 resolved). System map amended (citations, paywall, tracking, A91 sections updated). This log entry appended.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 04 — quizzes. Re-read the system map's quizzes section before spawning agents. Key questions already visible from the foundation pass: `quiz_attempts` schema (one row per answer vs one per attempt), kids disk-backed pending writes (T251 — already implemented per agents), T287 missing kill-switch UI for quizzes, quiz regeneration (D6 from slice 01 — new endpoint needed). Spawn parallel deep-dive agents (start/submit RPCs, schema, iOS adult flow, iOS kids flow) before surfacing to owner.

---

## Session 5 — 2026-04-29 — Slice 04: Quizzes

**Phase entering:** 4 (slices 01–03 locked).
**Phase leaving:** 5 (slice 04 locked).

**What happened.** Spawned four parallel deep-dive Explore agents: quiz start/submit/scoring RPCs, web quiz UI (`ArticleQuiz.tsx`), iOS kids quiz engine, and DB schema + migrations. Agents returned file:line findings across all surfaces.

Key new findings beyond the system map:
- **Biggest finding: web quiz is completely dead.** `ArticleQuiz.tsx` is a fully built component but is never mounted anywhere in the article reader. The reader page (`[slug]/page.tsx`) renders article body only — no quiz, no comment section. Web readers have no Discussion access path at all.
- `pool_group` column was already dropped in the `2026-04-29_drop_quiz_pool_group.sql` migration (already in working tree, not yet applied). All values were 0 and no consumer ever read it. Pool-exhaustion machinery remains in `ArticleQuiz.tsx` as dead code.
- `selected_answer` in DB is typed `string` but web submit route validates it must be a `number`; iOS adult also sends an index. iOS kids already sends option text. Three different semantics in one column.
- `percentile` is real — computed by `submit_quiz_attempt` RPC from historical attempts. Displayed correctly.
- `get_kid_quiz_verdict` RPC (`2026-04-29_kid_quiz_verdict_advance_streak.sql`) now fires `advance_streak` server-side on pass. Kids streak is fully DB-authoritative. Disk-backed pending writes (three retries, epoch guard, atomic file write) are solid.
- Admin mark-quiz inserts only one row (first question in pool) via `pool![0].id` force-unwrap. Does not fire scoring/streak/achievements. A thin support stamp, not a real simulation.
- Weekly recap quizzes confirmed live and separate. No changes needed here.
- `deleted_at` exists on `quizzes` but admin save hard-deletes rather than soft-deletes. Most query paths don't filter on it; only kids endpoint filters correctly.

**Q&A pass (6 questions, all locked):**
1. Wire web quiz into article reader — yes.
2. `selected_answer` canonical format — option text (not index).
3. Admin mark-quiz — thin stamp, loop to insert one row per question, no scoring fired.
4. Pool/retry model — simplify to fixed questions per article, unlimited same-question retries, remove pool-exhaustion UI.
5. Weekly recap — live separate feature, no changes this slice.
6. Admin quiz edits — soft-delete (`deleted_at = now()`) rather than hard-delete.

**Adversarial review findings, absorbed:**
- D1 scope is larger than initially stated: the reader page has no comment section either. Implementation creates a new `ArticleEngagementZone` client component (quiz + comments) mounted below `ArticleSurface`.
- D2 scope includes iOS adult (`StoryDetailView.swift:2810`, `quizAnswers: [String: Int]`) — must change to send option text, not index.
- D4 removal scope is wider than cited lines: also remove `outOfAttempts` (line 429), attempts-used display (lines 353-357), out-of-plan affordance (lines 585-625).
- D6 FK concern was a false alarm — soft-delete does not fire ON DELETE actions; existing `quiz_attempts.quiz_id` references stay valid.

**What got locked.** Slice doc at `slices/04-quizzes.md`. Six decisions sealed (D1–D6). INDEX.md updated (slice 04 status → locked). This log entry appended.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 05 — timelines. Re-read the system map's timelines section. Key questions already visible: does `article.view.timeline` permission exist in seed data (already answered in slice 03 — yes, granted to all via `user` role → `anon` set, iOS paywall clears once D1 RPC fix is applied); `type`/`content` UI fields that get silently dropped (schema gap or dead UI?); lenient date parse fallback to `now()` silently corrupting event_date; web timeline rendering (locked in slice 03 D3 — add a timeline section). Spawn parallel deep-dive agents (iOS adult timeline tab, admin timeline authoring, web rendering gap, `parse_timeline_event_date` migration) before surfacing to owner.

---

## Session 6 — 2026-04-29 — Slice 05: Timelines

**Phase entering:** 5 (slices 01–04 locked).
**Phase leaving:** 6 (slice 05 locked).

**What happened.** Spawned four parallel deep-dive Explore agents: admin timeline authoring + save paths, DB schema + migrations, iOS adult rendering, and web timeline gap + legacy AI generate route. Agents returned file:line findings across all areas.

Key new findings beyond the system map:
- `type`/`content` are UI-state-only. StoryEditor deliberately omits them on save. KidsStoryEditor sends them but DB ignores them. DB has `title`/`description` (almost always NULL in practice) but no `type`/`content`/`is_current`.
- `is_current` ("NOW" marker) is fully client-side — computed property always returns `nil`; last event in sorted array gets the badge by fallback logic.
- "Enrich timeline" button silently broken: sends `{storyId, type}`, route expects `{article_id, action}` — every click returns 400. Already marked T69 for deletion.
- `sort_order` ignored on iOS — sorts by `event_date ASC` only. Web will match.
- No RLS on `timelines` table confirmed.
- `coalesce(parse_timeline_event_date(...), now())` corruption confirmed at RPC layer.

**The structural finding — Q&A session.** During Q&A the owner revealed that the product needs a stories-as-containers model: a story has multiple articles, all accessible through a timeline spine under one slug. This is the biggest architectural change in the program.

**Q&A pass (7 questions, all locked):**
1. Lenient date fallback — skip the row (WHERE guard, not `now()` fallback).
2. Enrich timeline button — rip it from both editors.
3. RLS on timelines — yes, add it.
4. Type/content UI state — `type` is now meaningful and persisted (`'event'|'article'`); UI `'story'` maps to DB `'article'`.
5. Stories as top-level container — new `stories` table, articles get `story_id` FK, `articles.slug` removed, `timelines` parent FK changes to `story_id`.
6. Generation creates story + article atomically; admin can re-link to existing story.
7. Web reader becomes story page (`/[slug]` resolves `stories.slug`); defaults to most recent article; `?a=<article-id>` query param for deep-linking; two discussion zones; iOS timeline fetch updates from `article_id` to `story_id`, article-type entries become tappable.

**Adversarial review findings, absorbed:**
- `articles.slug` removal touches 7 web routes — enumerated as implementation checklist, no new owner decisions.
- Dual RPC definitions (two migrations both contain `persist_generated_article`) — implementation migration supersedes both.
- iOS changes are surgical (fetch by `story_id`, tap behavior on article entries), not a full redesign. Owner confirmed parity expected.
- `comments.story_id` nullable column added in slice 05 migration; full comment schema for story-level discussion deferred to slice 06.
- RLS policy expression fully specifiable from locked schema — no further owner input needed.

**What got locked.** Slice doc at `slices/05-timelines.md`. Seven decisions sealed (D1–D7). INDEX.md updated (slice 05 status → locked, cross-slice items 8 + 10 resolved, item 14 added for stories structural impacts). This log entry appended.

**What's blocked.** Nothing. Cross-slice impacts from D5–D7 (stories model) are noted in INDEX.md item 14 and will inform each affected slice's implementation.

**What next session should pick up.** Slice 06 — comments. Re-read the system map's comments section. Key questions already visible: `moderation_actions` table never created (TODO T287 — comment hide/unhide unaudited); NCMEC submission is a stub; `ai_toxicity_score`/`ai_sentiment`/`ai_tag` columns exist but no caller writes them; story-level discussion requires `comments.story_id` (column added in slice 05 migration, full routing + schema deferred here). Spawn parallel deep-dive agents (comment composer + thread web, iOS adult comments, admin moderation, NCMEC + report path) before surfacing to owner.

---

## Session 7 — 2026-04-29 — Slice 06: Comments

**Phase entering:** 6 (slices 01–05 locked).
**Phase leaving:** 7 (slice 06 locked — all slices complete).

**What happened.** Spawned four parallel deep-dive Explore agents: web comment composer + thread, iOS adult comments, admin comment moderation + T287 audit gap, and NCMEC + report path + AI moderation columns. MCP queries verified `users` RLS policies (T300 confirmed live), `public_profiles_v` columns, and `user_passed_article_quiz` RPC signature.

Key new findings beyond the system map:
- `CommentThread` / `CommentComposer` / `CommentRow` are fully built but **completely unmounted** on web — same dead-code pattern as the quiz in Slice 04. `ArticleEngagementZone` (locked in Slice 04 D1) does not yet exist in code.
- T300 is live in production. Both web (`CommentThread.tsx:260–310`) and iOS (`StoryDetailView.swift:2568, 2599`) realtime handlers embed `users!user_id(...)` which 403s for non-admins — new comments don't appear in real time without a page refresh. Initial loads already use `public_profiles_v` (correct).
- `public_profiles_v` confirmed live with all required fields.
- `user_passed_article_quiz` RPC takes `article_id` UUID — unaffected by Slice 05's slug migration.
- Comment hide/unhide IS audited to `admin_audit_log` via `recordAdminAction`. The T287 gap is specifically the absence of a dedicated `moderation_actions` table with per-comment history UI.
- Expert answers are already stored as comments with `is_expert_reply=true` + `parent_id` pointing to the question — inline rendering uses existing threading model, no separate table join.
- AI moderation columns (`ai_toxicity_score`, `ai_sentiment`, `ai_tag`, `ai_tag_confidence`) confirmed dead schema — nothing writes them anywhere.

**Q&A pass (7 questions, all locked):**
1. Two discussion zones — per-headline (article) only. Story is a container. No story-level discussion zone. `comments.story_id` is a convenience FK for admin queries.
2. NCMEC — launch as stub (option C). Wire post-launch after ESP registration.
3. AI moderation columns — wire a background cron (Anthropic), scores write to columns, flags ≥0.7 for admin review, zero user-facing exposure.
4. `moderation_actions` table — build it. Large platforms maintain per-content moderation trail. Admin comment view surfaces history inline.
5. Expert system — inline in thread, directly under the question they answer, visually highlighted. Filter toggle for expert-only view. Separate expert section above thread removed.
6. T300 realtime fix — check DB, confirmed live. Fix both platforms as part of this slice.
7. Quiz-fail UX — locked composer (not hidden) before quiz pass. "Pass the quiz to join the discussion." Unlocks in-place on pass.

**Adversarial review findings, absorbed:**
- `ArticleEngagementZone` doesn't exist yet — expected implementation task, not a decision gap. Slice 04 locked what to build; this slice builds it.
- Slice 05 schema (stories table) not yet applied to DB — `comments.story_id` FK (Migration B) must wait until Slice 05 migrations merge. Noted as dependency in slice doc.
- `user_passed_article_quiz` stable: confirmed takes UUID `article_id`, unaffected by slug removal.
- Expert answers as inline comments: confirmed via earlier agent report — already stored with `parent_id` FK, no separate table needed.
- `public_profiles_v` confirmed live via MCP query.
- Quiz-fail silent 403 UX gap: surfaced as Q7, locked as D7.

**What got locked.** Slice doc at `slices/06-comments.md`. Seven decisions sealed (D1–D7). INDEX.md updated (slice 06 status → locked, cross-slice items 4, 5, 7 resolved). This log entry appended.

**What's blocked.** Nothing. All six slices are locked.

**What next session should pick up.** Implementation. Recommended order:
1. **T300 realtime fix first** — already broken in production, ships as a standalone PR touching `CommentThread.tsx` and `StoryDetailView.swift`. No other slice dependency.
2. **Slice 04 + 06 web implementation** — build `ArticleEngagementZone`, mount quiz + locked composer in `[slug]/page.tsx`, wire `CommentThread`. Slice 04's quiz wiring is a prerequisite.
3. **Slice 06 remaining** — `moderation_actions` migration + API write points, AI cron, expert inline rendering, iOS expert rendering + expert section removal.
4. **Slice 01–03 and 05 implementation** — generation fixes, RLS, `compute_effective_perms` rename, stories-as-containers schema.

---

## Session 8 — 2026-04-29 — Implementation: Slices 01, 02, 03, 04 (D2/D3/D6), 06 (D6)

**Phase entering:** 7 (all six slices locked, implementation not started).
**Phase leaving:** 8 (slices 01–04 and 06 partially implemented; slice 05 deferred as a separate session due to structural scope).

**Commit:** `110b57e` — `feat(article-lifecycle): Slices 01-04 + 06 implementation`

**What happened.**

Implemented all locked decisions that don't depend on the slice 05 stories-as-containers schema migration.

**Slice 01 — Generation hardening**
- Word count raised to 250–400 across all audience tiers (was 80–300); prompt and JSON schema updated in `generate/route.ts` and `editorial-guide.ts` for adults, kids, and tweens.
- Summary prompt updated: 40–60 words, 3 sentences max, who/what/where lead.
- Standalone cluster cleanup (D5) confirmed a no-op: the existing pipeline-cleanup cron already expires all clusters at 14 days with no keyword exemption.

**Slice 02 — Publishing model**
- `scheduled` status fully removed: Zod schema, `ALLOWED_TRANSITIONS`, stories filter UI, `timeAgo()`, and `statusVariant()` helpers all scrubbed.
- Migration `2026-04-29_slice02_scheduled_rip_articles_rls.sql` applied to DB: drops `publish_at`, enables RLS on `articles`, adds `public_can_read_published` policy.
- Quiz delete flipped to soft-delete (`deleted_at` stamp) in both `save` route and `[id]` article PATCH route.

**Slice 03 — Web article reader**
- `permissions.js` and iOS `PermissionService.swift` both migrated from `compute_effective_perms` (non-existent RPC) to `my_permission_keys`. Cache changed from Map/Dictionary to Set.
- `[slug]/page.tsx`: parallel fetches for `sources` + `timeline`; `incrementViewCount` on load; `ArticleTracker` mounted for non-COPPA published articles.
- New components: `ArticleTracker.tsx` (IntersectionObserver scroll milestones, fires `article_read_start` / `scroll_depth` / `article_read_complete`), `SourcesSection.tsx`, `TimelineSection.tsx` (spine-style layout).
- `ArticleSurface.tsx` updated to render both sections.

**Slice 04 — Quiz integrity (D2/D3/D6)**
- iOS `StoryDetailView.swift`: quiz answer map changed from `[String: Int]` (option index) to `[String: String]` (option text); `selected_answer` field follows.
- `mark-quiz` endpoint: previously inserted one attempt for `pool[0]`; now inserts a row for every question in the pool.
- `[id]/route.ts` (quiz-regenerate, D1): **not yet built** — deferred within this session because the full `/api/admin/pipeline/quiz-regenerate` endpoint + "Regenerate quiz" button in StoryEditor requires reading the saved article body, re-running quiz + quiz_verification steps, and delete-and-reinsert. Blocked by none but not urgent enough to pull in this wave.

**Slice 06 — AI-flagged tab + moderation history (D6)**
- `moderation_actions` table migration applied to DB (was in a prior commit's migration file but never applied).
- `database.ts` manually updated: `moderation_actions` table type added with all columns + relationships; `publish_at` references removed.
- `admin/reports/page.tsx`: third tab "AI-flagged" loads `moderation_actions` rows where `action='ai_flagged'`; detail panel shows per-comment moderation history with username resolution via `public_profiles_v`; "see history" expander for multi-action history.

**TypeScript** passes `npx tsc --noEmit` with no errors after all changes.

**What's blocked or deferred.**
- **Slice 04 D1** (`quiz-regenerate` endpoint + StoryEditor button): standalone, no blockers.
- **Slice 05 (Stories schema)**: structural migration — new `stories` table, `articles.story_id` FK, `articles.slug` removal, `timelines` parent FK to `story_id`, web reader becomes story page, iOS timeline fetch update. Intentionally deferred as its own session due to scope. Cross-slice impacts documented in INDEX.md item 14.
- **Slice 06 D1** (ArticleEngagementZone + CommentThread mounting on web): depends on `ArticleEngagementZone` component which doesn't exist yet. Needs slice 05 reader architecture before the correct mounting point is clear.

**What next session should pick up.**
1. Slice 04 D1 — `quiz-regenerate` endpoint + StoryEditor button (small, self-contained).
2. Slice 05 — full stories schema migration (large session, own commit chain).
3. Post-slice-05: Slice 06 D1 — `ArticleEngagementZone` + `CommentThread` mounting in the new story reader.

---

## Session 9 — 2026-04-29 — Slice 04 D1: quiz-regenerate endpoint

**Phase entering:** 8 (slices 01–04 partial, slice 05 deferred, slice 06 partial).
**Phase leaving:** 9 (slice 04 fully implemented).

**What happened.** Implemented the one remaining Slice 04 item: the manual quiz-regenerate admin action.

- Verified T300 realtime fix was already live (both `CommentThread.tsx` and `StoryDetailView.swift` already use `public_profiles_v` — no action needed).
- Created `web/src/app/api/admin/pipeline/quiz-regenerate/route.ts`: POST endpoint gated by `admin.pipeline.run_generate`. Fetches article body + audience from DB, runs quiz generation (Sonnet 4.6) and quiz_verification (Haiku 4.5) via Anthropic SDK directly (no `pipeline_runs` FK needed — this is an admin action, not a full pipeline run), soft-deletes existing quiz rows (`deleted_at` stamp), inserts fresh questions with `is_correct` in options (same format as admin save route), records admin action.
- Updated `StoryEditor.tsx`: added `regenQuizLoading` state, `regenQuiz(articleId)` function (calls endpoint → reloads quizzes from DB on success), and "Regenerate quiz" ghost button in the quiz section header alongside "+ Add question". Button disabled when no article is loaded or regen is in progress.
- TypeScript passes clean with no errors.

**What got locked.** Slice 04 D1 implemented. All six slice decisions are now fully implemented except Slice 05 (stories schema) and Slice 06 D1 (ArticleEngagementZone — blocked on Slice 05).

**What's blocked or deferred.**
- Slice 05 (Stories schema): full structural migration — new `stories` table, `articles.story_id` FK, `articles.slug` removal, `timelines` parent FK to `story_id`, web reader becomes story page (`/[slug]` resolves `stories.slug`), iOS timeline fetch updates. Large session, own commit chain.
- Slice 06 D1 (ArticleEngagementZone + CommentThread): blocked on Slice 05 reader architecture.

**What next session should pick up.** Slice 05 — the stories-as-containers structural migration. This is the largest remaining item. Read `slices/05-timelines.md` decisions D5–D7 and INDEX.md item 14 before starting.

---

## Session 9 — 2026-04-29 — Slice 05 caller sweep (slug migration complete)

**Phase entering:** 9 (Slice 05 migration applied, TypeScript types regenerated; remaining callers still reference `articles.slug` which no longer exists).
**Phase leaving:** 10 (Slice 05 fully implemented across all web + iOS callers; TypeScript passes clean; Slice 06 D1 unblocked).

**What happened.** Completed the Slice 05 caller sweep — fixed every file that still referenced `articles.slug` directly after the schema migration applied in session 8.

Web callers fixed:
- `app/search/page.tsx` + `app/api/search/route.js`: `ArticleHit` type and select updated to `stories(slug)` join.
- `app/welcome/page.tsx`: dead `WelcomePageOnboarding` code (inactive, skip redirect owns the export) updated for compilation.
- `app/_homeShared.ts`: `HomeStory` type updated; `slug` dropped from Pick, `stories: { slug } | null` added.
- `app/page.tsx` (home): `SELECT_COLS` updated; both story links switched from `/story/${slug}` to `/${stories.slug}`.
- `app/_HomeBreakingStrip.tsx`: breaking strip link updated.
- `app/browse/page.tsx`: `ArticleRow` type, two selects, trending + featured slug accessors all updated.
- `app/api/admin/users/[id]/mark-quiz/route.ts` + `mark-read/route.ts`: slug lookups now query `stories` table first, then articles by `story_id`.
- `app/profile/kids/[id]/page.tsx`: `ReadingRow` — dropped `slug` from articles join (not rendered in any href).
- `components/article/StoryEditor.tsx` + `KidsStoryEditor.tsx`: `ArticleRow` type gets `stories: { slug } | null`; select adds `stories(slug)`; `cast.slug` → `cast.stories?.slug`; timeline query `article_id` → `story_id` + `type='event'` filter.
- `lib/pipeline/story-match.ts`: select + row mapping updated.
- `app/api/admin/broadcasts/alert/route.ts`: alert creation now inserts `stories` row first (with `slug + published_at`), then `articles` with `story_id`.

iOS callers fixed:
- `Models.swift`: Added `StorySlugRef` struct; `Story` drops stored `slug`, adds `storyId`/`stories` props, `slug` becomes a computed property via `stories?.slug`; `TimelineEvent` switches `articleId` → `storyId` + adds `type`/`linkedArticleId`; `QuizAttempt.StoryRef` same computed-slug pattern.
- `BookmarksView.swift`: `BookmarkStory` same computed-slug pattern; both selects updated to `articles(... stories(slug) ...)`.
- `ProfileView.swift`: all four activity selects updated; `BookmarkJoined.ArticleJoin` updated; `fetchStoryBySlug` now queries `stories` table by slug then `articles` by `story_id`.
- `StoryDetailView.swift`: article select adds `story_id, stories(slug)`; timeline query switches to `story_id` + `type='event'`.
- `HomeView.swift`: all three article selects updated to `select("*, stories(slug)")`.
- `AlertsView.swift`, `ContentView.swift`: `fetchStoryBySlug` updated (two-step: stories → articles).
- `RecapView.swift`: article select updated to include `story_id, stories(slug)`.

**What got locked.** Slice 05 fully complete. All 20+ callers updated. TypeScript zero errors.

**What's blocked or deferred.** None blocking Slice 06 D1.

**What next session should pick up.** Slice 06 D1 — mount `ArticleEngagementZone` in the web reader (`/[slug]/page.tsx`). The component exists (`web/src/components/article/ArticleEngagementZone.tsx`); the story-page architecture is now stable.
