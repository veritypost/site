# Article UX Audit — System Map

**Written:** 2026-04-30
**Amend, don't rewrite.** Add findings and cross-cutting notes at the bottom of each slice section as sessions proceed.

---

## How to use this document

Each slice has a section below. Read your slice's section at session start before spawning any Explore agents. The map describes what's built, what routes and components are involved, which user states matter, what Supabase tables are in play, and what the article-lifecycle program surfaced as known gaps. It is a starting model, not ground truth — verify everything with code reads before forming a finding.

---

## Slice 01 — Home card layout

### Routes and components

| File | Role |
|---|---|
| `web/src/app/page.tsx` | Server component; fetches stories, categories, breaking row; renders hero + up to 11 supporting cards |
| `web/src/app/_homeShared.ts` | Shared types, constants (`HOME_COLORS`, `HOME_SERIF_STACK`, `HOME_EDITORIAL_TZ`, `HomeStory`), time formatter |
| `web/src/app/_HomeBreakingStrip.tsx` | Client island; gates breaking news strip behind `home.breaking_banner.view` + `.paid` permissions |
| `web/src/app/_HomeFooter.tsx` | Client island; auth-aware end-of-page CTA; fires `page_view` track event on mount |
| `web/src/app/_HomeFetchFailed.tsx` | Client island; `router.refresh()` retry button, shown when server fetch errored |
| `web/src/app/_HomeVisitTimestamp.tsx` | Client island; records visit timestamp |
| `web/src/app/_HomeFirstLoginMoment.tsx` | Client island; first-login overlay/moment logic (fetch errors caught but previously silent — fixed in site-bug-sweep 02-02) |

### Key user states

- **Anon** — sees the edition cards (hero + supporting); no personalization; footer shows sign-up CTA; breaking strip gated.
- **Free signed-in** — same card layout; breaking strip depends on permissions; `HomeVisitTimestamp` writes a read log entry.
- **Pro signed-in** — same layout; breaking strip likely visible; additional permission grants possible.
- **Admin** — same public layout (admin chrome appears in nav, not on home cards).
- **All** — "That's today's edition." end-state is universal once all 12 cards are shown; no infinite scroll.

### Supabase data

- `stories` — `id, slug, title, published_at`; filtered to today's edition (editorial TZ: `America/New_York`); ordered by `published_at DESC`; max 12.
- `categories` — `id, name, slug, color_hex`; used for category pill labels on cards.
- Read log / visit timestamp — writes to some session/activity table via `HomeVisitTimestamp`.
- Breaking news — fetched by `_HomeBreakingStrip`; likely from a `breaking_news` or `stories` flag; exact table TBD by investigation.

### Implementation state (from article-lifecycle)

- Stories-as-containers migration landed (slice 05 D5–D7): `stories` is now the canonical table; `articles` hang off `stories` via `story_id`; slugs moved to `stories`. Home feed queries `stories`, not `articles` directly.
- Home feed rebuilt (T215): server-rendered, cookie-aware, three client islands, no algorithmic feed, finite edition.
- bug-sweep slice 02 fixed:
  - `Promise.all` at `page.tsx:156–218` now wrapped in try/catch; `HomeFetchFailed` shown on any thrown exception (`2ce74ae`).
  - Article links in browse, category, following pages changed from `/story/<slug>` to `/<slug>` (`4523058`).
  - `_HomeFirstLoginMoment.tsx` two silent catch blocks now log to console (`dc6659d`).

### Known gaps for this slice

- No specific article-lifecycle implementation gaps apply to the home cards surface. UX investigation is clean-slate.

---

## Slice 02 — Story page & article reading

### Routes and components

| File | Role |
|---|---|
| `web/src/app/[slug]/page.tsx` | Server component; resolves slug → story → articles; handles `?a=<article-id>` multi-article switching; fetches quiz state, sources, timeline, permissions |
| `web/src/app/[slug]/_ArticleFetchFailed.tsx` | Client island; retry button for page-level fetch failure |
| `web/src/app/[slug]/error.tsx` | Next.js error boundary for the `[slug]` segment; added in bug-sweep |
| `web/src/app/[slug]/loading.tsx` | Loading state for the segment |
| `web/src/app/[slug]/not-found.tsx` | 404 state |
| `web/src/components/article/ArticleSurface.tsx` | Client island; switches between read-only and editor mode based on `canEdit`; renders body HTML, `SourcesSection`, `TimelineSection`; has `data-article-body` attribute |
| `web/src/components/article/ArticleTracker.tsx` | Client island; places scroll sentinels relative to `[data-article-body]` element; fires `scroll_depth` and `article_read_complete` events via `sendBeacon` |
| `web/src/components/article/StoryArticlePicker.tsx` | Client island; renders article tabs for multi-article stories (66 lines); URL param navigation via `?a=` |
| `web/src/components/article/SourcesSection.tsx` | Renders sources list (83 lines); graceful no-op when empty |
| `web/src/components/article/TimelineSection.tsx` | Renders timeline (144 lines); handles `type='event'` and `type='article'`; article-type entries link to `/<storySlug>?a=<linked_article_id>` |
| `web/src/components/ArticleEngagementZone.tsx` | Client island mounted below `ArticleSurface`; composes `ArticleQuiz` + `CommentThread` |

### Key user states

- **Anon** — can read the article; sees sources and timeline; `ArticleEngagementZone` renders read-only `CommentThread` only (no quiz).
- **Free signed-in** — full reader; quiz and comments visible; `initialPassed` server-computed via `user_passed_article_quiz` RPC.
- **Pro signed-in** — same as free from a reading perspective; may have additional permission keys.
- **Admin / editor** — `ArticleSurface` renders `ArticleEditor` in-place when `canEdit=true`; publish controls available when `canPublish=true`.
- **COPPA band (kids/tweens / `is_kids_safe`)** — page metadata sets `robots: noindex,nofollow`; no other special rendering.
- **Multi-article story** — `StoryArticlePicker` visible when `articles.length > 1`; `?a=<id>` selects the article; invalid `?a=` redirects to `/<slug>` (fixed in bug-sweep).

### Supabase data

- `stories` — resolved by `slug`; `id, slug, title, published_at`.
- `articles` — all articles for the story, ordered `published_at DESC, created_at DESC`; `id, story_id, title, subtitle, body, body_html, excerpt, status, age_band, is_kids_safe, is_ai_generated, ai_model, ai_provider, published_at, updated_at, deleted_at`.
- `quizzes` — `count` only, filtered `is_active=true, deleted_at=null` for `article.id`; determines `hasQuiz`.
- `quiz_attempts` / RPC `user_passed_article_quiz` — determines `initialPassed`.
- `sources` — `title, url, publisher, sort_order` for `article.id`.
- `timelines` — `id, event_date, event_label, event_body, type, linked_article_id` for `story.id`.

### Implementation state (from article-lifecycle)

- Slice 03 (Viewing): stories-as-containers structural change — `/[slug]` became a story page; `?a=` param for multi-article navigation. `ArticleSurface`, `ArticleTracker`, `SourcesSection`, `TimelineSection` all added.
- Slice 05 (Timelines): `type` and `linked_article_id` columns added to `timelines`; `TimelineSection` renders both event and article-link types.
- bug-sweep slice 03 fixed all six issues: try/catch on page fetch, `error.tsx` added, FK hint on comments, ArticleTracker sentinel placement (element-relative), timeline type filter removed, view count logging, `?a=` invalid redirect.

### Known gaps for this slice

- **`stories` table missing `subtitle` and `description` columns.** Slice 05 D5 spec included `subtitle text` and `description text`; actual migration didn't create them. `ArticleSurface` props include `subtitle: string | null` from `articles.subtitle`, not from `stories`. The story-level subtitle/description UI can't be built without a migration. (article-lifecycle gap #3)

---

## Slice 03 — Quiz experience

### Routes and components

| File | Role |
|---|---|
| `web/src/components/ArticleQuiz.tsx` | Quiz state machine (546 lines); pre-start, question flow, answer submission, pass/fail results, achievement display; calls `/api/quiz/attempt`, `/api/quiz/submit` |
| `web/src/components/ArticleEngagementZone.tsx` | Mounts `ArticleQuiz` for logged-in users when `hasQuiz=true`; passes `initialPassed`; receives `onPass` callback; state bridges quiz pass to `CommentThread.quizPassed` |
| `web/src/app/[slug]/page.tsx` | Server side: `hasQuiz` computed from `quizzes.count`, `initialPassed` from `user_passed_article_quiz` RPC |

### Key user states

- **Anon** — quiz not rendered (see `ArticleEngagementZone` anon branch); comment thread is read-only. No quiz CTA shown.
- **Free / pro, no-quiz article** — `ArticleEngagementZone` renders only `CommentThread` with `quizPassed=false`; `CommentComposer.quizPassed` defaults true when `hasQuiz=false`.
- **Free / pro, quiz not yet taken** — quiz in pre-start state; question count shown; start prompt.
- **Free / pro, quiz in progress** — question display, option selection, submit per question or all-at-once (TBD by investigation).
- **Quiz failed** — failure state shown; retry option (attempt_number increments via RPC).
- **Quiz passed** — pass achievement display (`QuizPassAchievement`); `hasPassed` state flips; `CommentThread` receives `justRevealed=true` to animate the unlock.
- **Quiz passed, returning** — `initialPassed=true` from server; quiz is skipped; comment thread is directly open.

### Supabase data

- `quizzes` — `is_active=true, deleted_at=null`, filtered by `article_id`.
- `quiz_questions` — questions and options for a quiz.
- `quiz_attempts` — records each attempt; `attempt_number` via `user_passed_article_quiz` RPC or similar.
- `quiz_results` — per-question results: `quiz_id, question_text, selected_answer, correct_answer, is_correct, options`.
- RPC `user_passed_article_quiz` — returns whether the logged-in user has passed for the given `article_id`.
- `/api/quiz/` — attempt and submit routes (exact paths to verify in investigation).

### Implementation state (from article-lifecycle)

- Slice 04 (Quizzes): pool exhaustion stripped; `selected_answer` stored as option text (not index); RPC takes `article_id` UUID; quiz shown within story page for selected article.
- `ArticleEngagementZone.tsx`: `justPassedThisSession` tracks within-session pass to animate the comment thread unlock.
- article-lifecycle gap #5: `quiz-regenerate` admin endpoint rejects (422) on any verification disagreement — **resolved in commit `5a4669c` (2026-04-30)**. Route now iterates over Claude's correction fixes and patches `correct_index` before the insert; 422 no longer thrown on disagreement. Do not re-investigate.

### Known gaps for this slice

- ~~**`quiz-regenerate` 422 on disagreement**~~ — **resolved** (`5a4669c`, 2026-04-30). Route now applies verification fixes automatically instead of rejecting.

---

## Slice 04 — Discussion & comments

### Routes and components

| File | Role |
|---|---|
| `web/src/components/CommentThread.tsx` | Main thread component (1,149 lines); loads comments via Supabase client, realtime subscription via `T300` pattern using `public_profiles_v`; handles lock/unlock, report modal, reply depth |
| `web/src/components/CommentComposer.tsx` | Composer (345 lines); locked state when `quizPassed=false` and article has quiz; `@mention` support via `can-mention` API; calls `POST /api/comments/` |
| `web/src/components/CommentRow.tsx` | Single comment row (590 lines); vote controls, reply trigger, moderator actions (hide/unhide/remove), expert badge inline rendering, report flow |
| `web/src/components/ArticleEngagementZone.tsx` | Bridges quiz state to `CommentThread`; passes `currentUserId`, `currentUserTier`, `quizPassed`, `justRevealed` |
| `web/src/app/api/comments/route.js` | GET (load thread), POST (create comment); FK join `users!fk_comments_user_id` (corrected in bug-sweep) |
| `web/src/app/api/comments/[id]/route.js` | PATCH (edit/hide/unhide/remove/vote), DELETE |
| `web/src/app/api/comments/can-mention/` | Checks whether a username is mentionable |

### Key user states

- **Anon** — read-only thread; `CommentComposer` not rendered; can see existing comments including expert comments.
- **Free / pro, quiz not passed** — thread visible; `CommentComposer` renders a locked state (shows the quiz gate); no compose access.
- **Free / pro, quiz passed** — full `CommentComposer` access; can post, reply, upvote, downvote.
- **Free / pro, no-quiz article** — `quizPassed` treated as true when `hasQuiz=false`; full composer immediately.
- **Muted user** — `CommentComposer` renders muted state (mute expiry shown if applicable).
- **Banned user** — `CommentComposer` renders banned state.
- **Expert** — comments rendered with expert badge inline (via `users.is_expert`, `expert_title`); no special thread behavior beyond the badge.
- **Moderator / admin** — `CommentRow` shows hide/unhide/remove controls; each action writes to `moderation_actions`.

### Supabase data

- `comments` — `body, created_at, parent_id, story_id, article_id, user_id, is_hidden, is_removed`; joined via `users!fk_comments_user_id`.
- `public_profiles_v` — joined for realtime inserts (T300 fix); `username, avatar_url, avatar_color, is_verified_public_figure, is_expert, expert_title`.
- `moderation_actions` — written on hide/unhide/remove; surfaced in admin reports page per comment.
- `reports` — created on user report; urgent NCMEC path for 18 U.S.C. § 2258A categories.
- `comment_votes` — upvote/downvote per user per comment.

### Implementation state (from article-lifecycle)

- Slice 06 (Comments): hide/unhide/remove all write to `moderation_actions`; AI scoring cron (`score-comments`) flags high-toxicity for admin review; NCMEC submission is a stub; comment lock/unlock in-place.
- bug-sweep slice 03: FK hint corrected (`users!fk_comments_user_id`); T300 realtime fix already in place.

### Known gaps for this slice

- **`comments.story_id` FK uses `ON DELETE CASCADE` (spec says `SET NULL`)** — deleting a story hard-deletes all comment history. For a moderation-sensitive surface this is almost certainly wrong. (article-lifecycle gap #4)
- **`score-comments` cron uses old Haiku model string** — `web/src/app/api/cron/score-comments/route.ts:60` hardcodes `'claude-haiku-4-5-20251001'`; affects AI moderation quality. (article-lifecycle gap #1)

---

## Slice 05 — Ask-an-expert

### Routes and components

| File | Role |
|---|---|
| `web/src/app/expert-queue/page.tsx` | Expert queue UI; 4 tabs (pending, claimed, answered, back-channel); Claim, Decline, Post answer, Post back-channel actions; client-only, gates via `expert.queue.view` permission |
| `web/src/app/api/expert/ask/route.js` | `POST /api/expert/ask` — reader submits a question; requires `expert.ask` permission; rate-limited (5/min); `v2LiveGuard` kill switch |
| `web/src/app/api/expert/answers/[id]/route.js` | Answer management for a specific question |
| `web/src/app/api/expert/queue/route.js` | Queue list fetch |
| `web/src/app/api/expert/queue/[id]/route.js` | Per-question queue actions (claim, decline, etc.) |
| `web/src/app/api/expert/back-channel/route.js` | Back-channel message creation |
| `web/src/app/api/expert/apply/route.js` | Expert application submission |

### Key user states

- **Anon** — cannot ask questions (requires `expert.ask` permission, which requires being signed in).
- **Free / pro** — can ask a question if `expert.ask` permission is granted; question targets an `article_id`, `target_type`, and optional `target_id` (e.g. specific comment); rate-limited.
- **Expert** — sees pending questions in their categories (or directed at them) via the expert queue; can claim, decline, post answer, post back-channel message.
- **Admin / oversight** — sees all categories via `expert.queue.oversight_all_categories` fallback; can review all questions regardless of category assignment.

### Where the ask flow lives for readers

The `POST /api/expert/ask` endpoint exists, but the reader-facing UI surface for submitting a question is not in a standalone route. Based on the route structure, it likely lives inside `CommentThread` or `CommentRow` as a "ask an expert" affordance on specific comments, or within `ArticleEngagementZone`. **This must be confirmed in the investigation** — the exact entry point for a reader asking a question is not immediately visible from the route tree.

### How an answer surfaces to the reader

Expert answers (`/api/expert/answers/[id]/`) presumably create a record that gets displayed somewhere in the reading experience. The exact mechanism — whether it surfaces in `CommentThread`, as a special comment row, as an inline article annotation, or as a notification — must be traced in the investigation. The `CommentRow` component has `is_expert` and `expert_title` fields, suggesting expert answers may render as differentiated comment rows.

### Supabase data

- `expert_questions` (or `expert_asks`) — the question record; `article_id, target_type, target_id, body, asker_id, status`.
- `expert_answers` — the answer record; linked to the question.
- `expert_back_channel` — back-channel messages between expert and asker.
- `categories` — for expert-to-category assignment and queue filtering.
- Expert application state — `expert_applications` or similar.

### Implementation state (from article-lifecycle)

- Slice 06 D33: expert queue gate swapped from `is_user_expert` RPC to `expert.queue.view` permission; oversight fallback with `expert.queue.oversight_all_categories`.
- bug-sweep slice 04 locked: expert queue action buttons (Claim, Decline, Post answer, Post back-channel) have double-fire risk; `btn()` CSS helper unconditional `cursor:pointer`; these are in the implementation queue for slice 04.

### Known gaps for this slice

- The reader-facing ask affordance is not mapped. Location in the UI is unknown from route listing alone — must be traced in investigation.
- How expert answers surface back to the reader (in-thread, notification, annotation) is not confirmed.

---

## Slice 06 — Post-read engagement

### Routes and components

| File | Role |
|---|---|
| `web/src/app/bookmarks/page.tsx` | Dedicated bookmarks page; remove-with-undo pattern; own route, not inline |
| `web/src/app/api/bookmarks/route.js` | Bookmark GET/POST/DELETE API |
| `web/src/app/api/bookmarks/export/` | Bookmark export |
| `web/src/components/FollowButton.tsx` | Follow/unfollow button; currently only used in `web/src/app/u/[username]/page.tsx` (public profile page) — **not on the story page** |
| `web/src/app/notifications/page.tsx` | Notifications list; markAllRead |
| `web/src/app/api/notifications/` | Notifications API |

### Key user states

- **Anon** — no engagement affordances shown; footer CTA prompts sign-up.
- **Free / pro** — can theoretically bookmark and follow, but:
  - **No bookmark button on the story page.** `BookmarkButton` component does not appear in `ArticleSurface` or `ArticleEngagementZone`. Bookmarks require navigating to a separate `/bookmarks` page.
  - **No follow button on the story page.** `FollowButton` only appears on `/u/[username]` (public profile). Following an article author requires leaving the reading experience.
  - Share affordance status — needs investigation; no share component found in quick scan.
  - Next-article navigation — no next-article or "read more" CTA found in quick scan on the story page.

### Supabase data

- `bookmarks` — `user_id, story_id` (or article_id); exact schema TBD.
- `follows` — `follower_id, followed_id`; FK `fk_follows_follower_id` (corrected in profile-bugfix).
- `notifications` — unread count, notification type, linked entity.

### Implementation state

- This slice is almost entirely **not yet built** at the story-page level. The infrastructure exists (API routes, dedicated pages), but the in-context engagement hooks (bookmark from article, follow author from article, share, next article) are not wired into the reading surface.
- bug-sweep slice 04 locked: bookmarks remove button double-fire, notifications markAllRead double-fire, following page error state, recap error state — these are bugs in the standalone pages, not in the story-page hooks.

### Known gaps for this slice

- No `BookmarkButton` on the story page — bookmark requires navigation away to `/bookmarks`.
- No `FollowButton` on the story page — following an author requires navigation to `/u/[username]`.
- No share affordance confirmed on the story page.
- No "read more" / next-article navigation confirmed on the story page.
- Investigation should determine whether these are intentional omissions (kill-switched for launch) or genuine gaps.

---

## Cross-cutting architecture notes

### Permission model

Every protected action uses the `hasPermission` / `requirePermission` pattern backed by the `my_permission_keys` RPC (old name `compute_effective_perms`, fixed in bug-sweep slice 01). No action in the reading experience should ever call a raw role check or the old RPC name.

### Stories-as-containers

`articles` → `stories` via `story_id`. Canonical URL is `/<slug>` on `stories.slug`. Multi-article stories use `?a=<article-id>`. This structural change (article-lifecycle slice 05 D5–D7) is fully implemented; all home, browse, search, leaderboard, and category pages confirmed clean in bug-sweep.

### Event tracking pipeline

`web/src/lib/track.ts` + `trackServer.ts` + `/api/events/batch`. Article reading fires: `article_read_start`, `article_read_complete`, `scroll_depth`, `increment_view_count`. Uses `sendBeacon` on tab-hide. All confirmed working in bug-sweep slice 03. Scroll sentinels now element-relative (fixed in `9afd119`).

### Kill-switch: `v2_live`

`v2LiveGuard()` is imported in at least `expert/ask/route.js`. Most expert and engagement routes may carry this guard. Investigation sessions should check for it — a gated route looks like it 404s to an anon user even if the permission is otherwise granted.

### FK hints

All FK hint names use `fk_` prefix (e.g. `fk_comments_user_id`, `fk_follows_follower_id`). Never use the auto-generated `_fkey` suffix form. Cross-check any `!hint` syntax against `web/src/types/database.ts` `foreignKeyName` entries before declaring a query structurally sound.
