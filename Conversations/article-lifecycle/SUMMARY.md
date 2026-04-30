# Article Lifecycle Redesign — Implementation Roadmap

**Date:** 2026-04-29
**Status:** Plan-complete. All six slices locked. This is the order in which the work ships.

This document is the bridge between planning (this program) and execution (a separate program). Every line below traces back to a locked slice decision; nothing new is decided here.

---

## Ship sequence (the headline)

1. **T300 realtime fix** — standalone PR.
2. **`ArticleEngagementZone`** — quiz + locked composer wired into the web reader (slice 04 D1 + slice 06 D7).
3. **Slice 06 web comments + moderation** — `CommentThread` mount, `moderation_actions` table, AI moderation cron, expert inline rendering.
4. **Slice 01–03 + 05 remaining work** — generation polish, publishing RLS + `scheduled` rip, viewing tracking + sources/timeline render, stories-as-containers schema.

The first two items unblock the third. The fourth is largely independent and can run in parallel once the first three land.

---

## PR 1 — T300 realtime fix (standalone, highest priority)

**Why first.** Already broken in production. Affects every comment thread on every platform. No dependency on any other slice.

**Scope.**
- `web/src/components/CommentThread.tsx:260–310` — replace embedded `users!user_id(...)` select with `public_profiles_v` join in the realtime handler.
- `VerityPost/VerityPost/StoryDetailView.swift:2568, 2599` — same fix on iOS.

**Greenlight checkpoint.** Verify with two browser sessions on staging that a new comment from session A appears in session B without refresh.

**Slice anchor.** Slice 06 D6.

---

## PR 2 — ArticleEngagementZone (quiz + locked composer on web reader)

**Why second.** Web reader has neither quiz nor comments wired today (both slices' biggest finding). Until this lands, slice 06 web work has nothing to mount into.

**Scope.**
- New `ArticleEngagementZone` client component at `web/src/components/article/ArticleEngagementZone.tsx`. Mounts `ArticleQuiz` + locked-or-unlocked `CommentComposer` based on quiz pass state.
- Mount under `ArticleSurface` in `web/src/app/[slug]/page.tsx`.
- Quiz wiring (slice 04 D1):
  - Pull existing `ArticleQuiz.tsx` in.
  - Strip pool-exhaustion machinery — `outOfAttempts` (line 429), attempts-used display (lines 353–357), out-of-plan affordance (lines 585–625). Per slice 04 D4.
  - Update `selected_answer` to send option text, not index. Same change on `VerityPost/StoryDetailView.swift:2810` for iOS adult parity. Per slice 04 D2.
- Locked-composer state (slice 06 D7):
  - Composer renders disabled with copy "pass the quiz to join the discussion" before quiz pass.
  - Unlocks in place on pass — no remount, no flicker.

**Cross-slice dependencies.**
- T300 fix should land first so the realtime path is healthy.
- Slice 06 D1 (per-article discussion, no story-level zone) shapes how the composer is keyed: by `article_id`, not `story_id`.

**Greenlight checkpoint.** Web reader shows quiz on load, locked composer below; passing the quiz unlocks the composer in place; new comments appear via realtime.

**Slice anchors.** Slice 04 D1, D2, D4. Slice 06 D7.

---

## PR 3 — Slice 06 remaining (moderation + AI cron + expert inline)

**Scope.**
- `moderation_actions` migration — table with `comment_id`, `actor_id`, `action` (`hide|unhide|remove|ai_flagged`), `reason`, `metadata`, `created_at`. RLS: admin-only SELECT.
- API write points — every existing hide/unhide/remove route writes a `moderation_actions` row alongside its current `admin_audit_log` write.
- Admin reports page (`/admin/moderation/reports`) — surface per-comment moderation history inline.
- AI moderation cron — new route at `web/src/app/api/cron/ai-moderate-comments/route.ts`. Anthropic-backed; scores recent unscored comments, writes `ai_toxicity_score` / `ai_sentiment` / `ai_tag` / `ai_tag_confidence`, flags ≥0.7 toxicity into `moderation_actions` with `action='ai_flagged'`. Zero user-facing exposure.
- Expert inline rendering — both web `CommentThread.tsx` and iOS `StoryDetailView.swift` render expert replies inline under their question with visual highlighting; filter toggle for expert-only view; remove the separate expert section above the thread.

**Slice anchors.** Slice 06 D3, D4, D5.

**Deferred.** NCMEC wiring stays a stub for launch (slice 06 D2). Wire post-launch after ESP registration. Admin queue + Sentry covers urgent reports until then.

---

## PR 4 — Publishing hardening (slice 02)

**Scope.**
- Rip `scheduled` — Zod enum, `ALLOWED_TRANSITIONS`, stories-page filter type + dropdown + `statusVariant` + `timeAgo()`, migration to drop `articles.publish_at`, regenerate TS types. 8 changes total.
- Add RLS to `articles` — anon + authenticated SELECT only `status='published'`. Verify both iOS apps still resolve their published-article lists correctly post-policy.
- T5 transactional RPC — defer further. Audit-log markers stay as detection.
- Regular publish push notification — no change. Breaking-news-only is intentional.

**Slice anchors.** Slice 02 D1, D2, D3, D4.

---

## PR 5 — Viewing wiring (slice 03)

**Scope.**
- `compute_effective_perms` → `my_permission_keys` rename + response parsing on both web (`permissions.js:115`) and iOS (`PermissionService.swift:107`). This single fix unblocks every iOS adult paywall (canViewBody, canViewSources, canViewTimeline). Per slice 03 D1.
- Sources section on web reader — fetch `sources` by `article_id`, render under article body. Graceful no-op when empty. Per slice 03 D2.
- Timeline section on web reader — fetch `timelines` by parent FK, render with the same shape as iOS. Graceful no-op when empty. Per slice 03 D3.
- Web event tracking on the reader — wire `article_read_start`, `article_read_complete`, `scroll_depth`, `increment_view_count`. Use `sendBeacon` on tab-hide so events survive navigation. Per slice 03 D4.

**Cross-slice dependency.** D3 timeline section uses the post-stories schema (parent FK changes from `article_id` to `story_id` per slice 05 D5–D7). Land slice 05 first or land both behind a feature flag — execution session decides.

**Slice anchors.** Slice 03 D1, D2, D3, D4.

---

## PR 6 — Stories-as-containers (slice 05, the structural change)

**Why later.** Architectural; touches every slice. Easier to land after engagement-zone work is stable.

**Scope.**
- New `stories` table — `id`, `slug` (the public URL key), `title`, `published_at`, `created_at`.
- `articles` — add `story_id` FK; remove `articles.slug` (slug lives on `stories`).
- `timelines` — change parent FK from `article_id` to `story_id`. New `timelines.type` column (`'event' | 'article'`). New `linked_article_id` FK for article-type entries. Editor maps UI `'story'` → DB `'article'` on save.
- `comments.story_id` — already added as nullable in slice 05 migration. Per slice 06 D1, this stays a convenience FK only.
- `parse_timeline_event_date` — RPC gains a `WHERE` guard so unparseable dates skip the row entirely instead of falling back to `now()`.
- RLS on `timelines` — author-and-admin write, public read of timelines whose `story.published_at IS NOT NULL`.
- Rip the legacy "Enrich timeline" route (T69).
- Web reader at `/[slug]` resolves `stories.slug`, defaults to most recent article, supports `?a=<article-id>` deep-linking.
- iOS timeline fetch updates from `article_id` to `story_id`; article-type entries become tappable.
- 7 web routes touched by `articles.slug` removal — enumerated in slice 05 doc as implementation checklist.
- `persist_generated_article` RPC updated to insert `stories` row + `type='article'` timeline entry alongside the article (slice 01 implication of slice 05 D5–D7).

**Slice anchors.** Slice 05 D1–D7.

---

## PR 7 — Generation polish (slice 01)

**Why last.** None of these decisions are gating. Polish ships after the structural pieces.

**Scope.**
- Standalone-cluster cleanup — remove the `keywords=['standalone']` exemption from the existing 14-day no-articles cron.
- Haiku model string — update single constant at `route.ts:178` from `claude-haiku-4-5-20251001` to `claude-haiku-4-5`.
- New endpoint `/api/admin/pipeline/quiz-regenerate` — manual trigger, button surfaces in StoryEditor.
- Body schema — `BodySchema.word_count` gains `.min(250).max(400)`. Editorial guide updated for adult, kids, and tweens (all 250–400 per locked decision).
- Summary prompt — update to "40–60 words, up to 3 sentences."

**Slice anchors.** Slice 01 D1–D8.

---

## Cross-slice dependencies (resolved here for clarity)

| Dependency | Resolution |
|---|---|
| Slice 04 D1 (mount quiz on web) blocks Slice 06 web work | PR 2 builds `ArticleEngagementZone` for both. |
| Slice 06 D7 (locked composer) needs Slice 04's quiz state | Same component owns both. |
| Slice 03 D3 (timeline on web) uses Slice 05 schema | Land Slice 05 first or feature-flag the timeline render. |
| Slice 06 D1 (per-article discussion) needs Slice 05's `comments.story_id` | Column added in Slice 05 migration; D1 keeps it as a convenience FK only. |
| Slice 03 D1 (`compute_effective_perms` rename) unblocks every iOS adult paywall | Standalone fix; can land any time after T300. |
| Slice 02 RLS on `articles` requires verifying iOS anon-key reads | Verified during slice 02 adversarial review; proceed. |

---

## Owner decision-points still open

None at the program level. Every slice closed with all questions locked. The execution program may surface implementation-level questions (exact copy, exact pixel placement) — those are deferred to the final polish sweep per the program's discipline rules.

---

## Deferred items (named, intentional)

- **NCMEC wiring** — post-launch after ESP registration. Slice 06 D2.
- **`v2_live` admin UI** — operations-grade kill-switch surface. Foundation deferred item.
- **T5 transactional RPC** for article PATCH cascade — slice 02 D4.

---

## Greenlight checkpoints (per PR)

Each PR ships behind these explicit verification gates:

- **PR 1 (T300):** Two-session realtime test on staging.
- **PR 2 (ArticleEngagementZone):** Quiz pass unlocks composer in place; new comments arrive via realtime.
- **PR 3 (moderation + AI cron + expert inline):** `moderation_actions` rows visible per comment in admin; AI cron writes scores on a sample batch; expert reply renders inline with highlight.
- **PR 4 (publishing):** No `scheduled` strings remain in code; anon SELECT on `articles` returns only published rows.
- **PR 5 (viewing):** iOS adult paywall clears for a free-tier user; sources and timeline render on web; events land in `events` table.
- **PR 6 (stories):** `/[slug]` resolves to a story; `?a=<article-id>` deep-links; iOS timeline tap navigates between articles.
- **PR 7 (generation polish):** Word-count enforcement on persist; quiz regenerate button works end-to-end; standalone clusters age out of the cleanup cron.

---

## What this program did not produce

- Code changes. By design — every session was plan-only.
- Final copy. By design — copy gets a polish sweep before launch, not negotiated up front.
- Implementation timelines or owner-facing dates. Per memory: never give users timelines.

---

## Where execution picks up

A new conversation should read `README.md`, `INDEX.md`, this `SUMMARY.md`, and the relevant slice doc(s) in order — then start PR 1. The execution program is a separate effort from this planning program; it operates under its own rules and is not bound by the plan-only discipline that governed sessions 1–7.
