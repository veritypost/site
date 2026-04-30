# Slice 06 — Comments

**Status:** locked
**Locked:** 2026-04-29
**Session:** 7 (investigation + Q&A + adversarial review)

---

## What this slice covers

The full comment lifecycle on web and iOS adult: composer, thread, realtime delivery, quiz-pass gate, expert inline rendering, AI moderation scanning, admin hide/unhide with a dedicated per-comment audit trail, and the urgent-report pipeline. Does not cover iOS kids (no comment surface), the NCMEC wire-up (deferred to post-launch per D2), or weekly recap quizzes (separate live feature).

---

## How comments work today

**Structure.** `comments` table: `article_id` FK (primary routing key), `parent_id` + `root_id` (threading — root_id unused in render, used for analytics), `status` ∈ {visible, hidden, removed, hidden_by_user, deleted}, `deleted_at` (soft-delete). Counters: `upvote_count`, `downvote_count`, `reply_count`, `edit_count`. Pins: `is_context_pinned` (community-curated via threshold RPC), `is_pinned` (editorial/admin, not currently rendered). Expert: `is_expert_question`, `is_expert_reply`, `expert_question_target_id`, `expert_question_status`. AI moderation: `ai_toxicity_score`, `ai_sentiment`, `ai_tag`, `ai_tag_confidence` — schema present, never written.

**Quiz gate.** `user_passed_article_quiz(p_user_id uuid, p_article_id uuid)` RPC checks `quiz_attempts` for ≥ threshold correct answers in any attempt group. Server enforces on POST /api/comments. Gate takes `article_id` UUID — unaffected by Slice 05's slug-to-stories migration (slug was never the gate key).

**Web.** `CommentThread.tsx`, `CommentComposer.tsx`, `CommentRow.tsx` are fully built but **completely unmounted** — not imported or rendered anywhere in the article reader. The reader page (`/[slug]/page.tsx`) renders only `<ArticleSurface>`. Comments are dead code on web today. Slice 04 locked `ArticleEngagementZone` (quiz + comments below the article body); that component does not exist in code yet — it is built as part of this slice.

**iOS adult.** Comments are live in `StoryDetailView.swift`. Quiz-pass gate enforced client-side (lines 987–988). Composer shows for logged-in, quiz-passed, non-muted users. Actions: reply, upvote, downvote, report, block user, edit own (10-min window). No user-facing delete UI. Realtime subscription: `channel("comments-story-{story.id}")` filtering on `article_id`. Currently uses `users!user_id(...)` embed in realtime refetch — broken in production since T300 RLS tightened `users` to self + admin reads only.

**Realtime RLS (T300 live).** Confirmed: `users` table SELECT RLS has only `users_self_read` (`id = auth.uid()`) and `users_admin_read` (`is_admin_or_above()`). Any `users!user_id(...)` embed in realtime refetches 403s for non-admins. Web initial load already uses `public_profiles_v` (correct). Web realtime handlers (CommentThread.tsx:260–310) and iOS realtime handlers (StoryDetailView.swift:2568, 2599) still use the broken embed — new comments don't appear in real time without a page refresh.

**`public_profiles_v`** confirmed live with: `id`, `username`, `display_name`, `bio`, `avatar_url`, `avatar_color`, `banner_url`, `verity_score`, `streak_current`, `is_expert`, `expert_title`, `expert_organization`, `is_verified_public_figure`, `articles_read_count`, `quizzes_completed_count`, `comment_count`, `followers_count`, `following_count`, `show_activity`, `show_on_leaderboard`, `profile_visibility`, `email_verified`, `created_at`, `is_frozen`, `is_pro`.

**Expert system.** Expert answers are stored as regular comments with `is_expert_reply=true` and `expert_question_target_id` pointing to the originating question comment. "Ask an Expert" button in CommentThread.tsx (lines 671–741) calls `/api/expert/ask`. Expert answers currently render in a separate section above the thread on web; on iOS `isExpertReply` is fetched but never rendered.

**Admin moderation.** Hide: `POST /api/admin/moderation/comments/[id]/hide` (permission: `admin.moderation.comment.remove`) → `hide_comment` RPC → `recordAdminAction` → `admin_audit_log`. Supports redact mode (T279) that overwrites body to `[redacted by moderator]`. Unhide: symmetric. Reports triage at `/admin/reports` (not `/admin/moderation`). `moderation_actions` table per T287 — not yet created.

**NCMEC.** Urgent report reasons: `csam`, `child_exploitation`, `grooming`. Route inserts with `is_escalated=true`, captures to Sentry error-level, attempts NCMEC submission only if `NCMEC_ESP_ID` + `NCMEC_API_TOKEN` are set. Stub throws unconditionally — reports reach admin queue and Sentry, nothing reaches NCMEC.

---

## Critical finding: web comments and engagement zone are completely unwired

Same pattern as the web quiz in Slice 04: fully built components (`CommentThread`, `CommentComposer`, `CommentRow`) that are never mounted anywhere. The article reader has no comment section. `ArticleEngagementZone` (locked in Slice 04 D1) does not yet exist in code — building it is this slice's primary web implementation task. The comment section is a direct dependent of that component.

---

## Decisions

### D1 — Comments, quiz, and discussion are all per-headline (article)

A story (slug) is a container for many headlines. Each headline (article) has its own quiz and its own discussion thread. `ArticleEngagementZone` mounts per the selected article and swaps — with fresh state — when the headline changes. `comments.story_id` (added as nullable FK in the Slice 05 migration) is a convenience column for story-level admin queries only, not a separate discussion routing key. No story-level discussion zone is built.

**Implementation note:** `ArticleEngagementZone` must unmount/remount (or receive a key change) when `articleId` changes on the story page, so quiz progress and comment thread don't bleed across headlines. Pass `key={articleId}` to the component at the mount site.

### D2 — NCMEC submission stays stubbed at launch

Urgent reports (`csam`, `child_exploitation`, `grooming`) surface in the admin queue with `is_escalated=true` and trigger a Sentry error-level capture. Nothing goes to NCMEC until the owner completes ESP registration and sets `NCMEC_ESP_ID` + `NCMEC_API_TOKEN`. This is acceptable at launch scale. The stub is data-complete — wiring it post-launch is a one-function swap in `ncmec.ts`.

**No code changes needed for D2.** The pipeline is already correct.

### D3 — AI moderation columns get wired via background cron

`ai_toxicity_score`, `ai_sentiment`, `ai_tag`, `ai_tag_confidence` are real schema that get populated. A background cron scores recent unscored comments and flags high-risk ones for manual admin review. Zero user-facing exposure — scores never leave the admin surface.

**What the cron does:**
- Runs on a schedule (e.g., every 15 minutes or hourly — owner-tunable via `settings`).
- Selects comments where `ai_toxicity_score IS NULL` AND `status = 'visible'` AND `created_at > now() - interval '24 hours'` (recent window, configurable).
- Batches them to the AI provider (Anthropic, reusing the existing `ANTHROPIC_API_KEY`) with a prompt asking for toxicity score (0.0–1.0), sentiment (`positive`|`neutral`|`negative`), and a short tag (`spam`|`harassment`|`misinformation`|`graphic`|`clean`).
- UPDATEs the comment rows with results.
- Any comment where `ai_toxicity_score >= 0.7` gets flagged: inserts a `moderation_actions` row with `action='ai_flagged'` and surfaces in the admin review queue.

**Admin queue surface:** The existing reports triage at `/admin/reports` gets a new filter tab "AI-flagged" alongside the existing "Pending reports" view. Flagged comments appear there for manual review.

**Threshold:** 0.7 as the default, stored in `settings` as `ai_comment_toxicity_flag_threshold` so it's tunable without a deploy.

### D4 — Build `moderation_actions` table (T287)

Every admin hide, unhide, remove, or AI-flag writes a row to `moderation_actions`. The per-comment history is surfaced inline in the admin comment view. `admin_audit_log` continues as the general trail; `moderation_actions` is the per-comment moderation record — this is how large-scale content moderation platforms track accountability.

**Schema:**
```sql
CREATE TABLE public.moderation_actions (
  id           bigserial PRIMARY KEY,
  comment_id   uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  moderator_id uuid REFERENCES public.users(id),  -- null for ai_flagged
  action       text NOT NULL CHECK (action IN ('hide', 'unhide', 'remove', 'redact', 'ai_flagged')),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_comment_idx ON public.moderation_actions (comment_id, created_at DESC);
```

**Write points:**
- `hide/route.js`: after `hide_comment` RPC succeeds, INSERT a `moderation_actions` row (action='hide' or 'redact').
- `unhide/route.js`: after `unhide_comment` RPC succeeds, INSERT a `moderation_actions` row (action='unhide').
- AI cron: when flagging, INSERT a row (action='ai_flagged', moderator_id=null).

**Admin comment view surface:** The admin reports page (`/admin/reports`) loads the latest `moderation_actions` row for any comment it displays. Renders as a one-line annotation beneath the comment body: "Hidden by @username on Apr 29 — reason: harassment." If multiple actions exist, show a "see history" expander.

### D5 — Expert replies inline in thread, directly under the question

Expert answers (`is_expert_reply=true`) are already stored as regular comments with `expert_question_target_id` pointing to the question comment's `id`. Since expert answers use `parent_id = question_comment_id`, they naturally appear in the reply thread beneath the question in the existing parent_id threading model.

**Web changes:**
- `CommentRow.tsx`: render expert replies with a distinct visual treatment — highlighted background, "Expert" badge with the author's `expert_title` if set. The blur/paywall logic for `is_expert_reply` (CommentRow.tsx:151, 313, 322–330) stays — non-paid users see expert replies blurred with an upgrade prompt.
- `CommentThread.tsx`: add an "Expert" filter button above the thread. When active, filter to comments where `is_expert_question=true` or `is_expert_reply=true` — shows the question + paired answer, hides everything else. Filter state is local UI only.
- Remove the separate expert section above the thread (wherever it currently mounts). Expert content lives only in the thread.

**iOS adult changes:**
- `StoryDetailView.swift`: render `isExpertReply=true` comments with a visual badge and highlight treatment (matching the web). The `expertInsights` section above the thread is removed; expert answers appear only in the thread.
- `isExpertReply` is already fetched (line 2358, 2568, 2599) — this is a rendering-only change.

### D6 — Fix realtime RLS bug on both platforms (already broken in production)

T300 is live. The `users` table SELECT RLS (`users_self_read`: `id = auth.uid()`) means any `users!user_id(...)` embed in a realtime refetch 403s for non-admins. New comments stop appearing in real time without a page refresh.

**Web fix (`CommentThread.tsx:260–310`):** Replace the realtime INSERT and UPDATE refetch selects. Instead of:
```ts
.select('*, users!user_id(id, username, ...)')
.eq('id', payload.new.id)
```
Do a two-step: fetch the comment row alone, then batch-fetch the author from `public_profiles_v` by user_id — matching the initial load pattern at lines 156–165. Merge into the existing `authorById` map.

**iOS fix (`StoryDetailView.swift:2568, 2599`):** Replace the inline `users!user_id(...)` embed in the INSERT and UPDATE realtime refetch selects with a separate PostgREST call to `public_profiles_v` filtered by `id`. Merge author data into the displayed comment.

### D7 — Composer shows locked state before quiz pass

The comment composer is visible but locked (not hidden) when the user hasn't passed the quiz. Copy: "Pass the quiz to join the discussion." Unlocks in-place the moment the quiz pass fires — no navigation, no refresh.

**Implementation:** `ArticleEngagementZone` owns quiz-pass state (already needed for Slice 04 D1). It passes `quizPassed: boolean` to `CommentThread`, which passes it to `CommentComposer`. `CommentComposer` renders the textarea and submit button as `disabled` + muted styling when `quizPassed=false`, with the locked copy above. On `quizPassed=true` (either from `initialPassed` prop or from `onPass` callback), the composer re-renders in active state with no remount.

Anonymous (logged-out) readers: composer not shown at all (existing behavior). Muted/banned users: existing mute-state banner replaces composer (existing behavior). Both of these take precedence over the quiz-lock state.

---

## DB migrations

### Migration A — `moderation_actions` table

```sql
-- supabase/migrations/2026-05-XX_moderation_actions.sql
CREATE TABLE public.moderation_actions (
  id           bigserial PRIMARY KEY,
  comment_id   uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  moderator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action       text NOT NULL CHECK (action IN ('hide', 'unhide', 'remove', 'redact', 'ai_flagged')),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_actions_comment_idx
  ON public.moderation_actions (comment_id, created_at DESC);

-- RLS: admins read/write; no user access
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY moderation_actions_admin_all ON public.moderation_actions
  FOR ALL TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());
```

### Migration B — `comments.story_id` convenience FK

```sql
-- supabase/migrations/2026-05-XX_comments_story_id.sql
-- Depends on: Slice 05 stories table existing in production.
-- Apply AFTER Slice 05 migrations are merged.
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS story_id uuid REFERENCES public.stories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS comments_story_id_idx ON public.comments (story_id)
  WHERE story_id IS NOT NULL;
```

### Migration C — Settings rows for AI moderation

```sql
-- supabase/migrations/2026-05-XX_ai_comment_moderation_settings.sql
INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES
  ('ai_comment_toxicity_flag_threshold', '0.7', 'number', 'moderation',
   'AI Toxicity Flag Threshold',
   'Comments scoring at or above this toxicity score (0.0–1.0) are auto-flagged for manual review.',
   false, false),
  ('ai_comment_score_window_hours', '24', 'number', 'moderation',
   'AI Comment Score Window (hours)',
   'How far back the comment scoring cron looks for unscored comments.',
   false, false)
ON CONFLICT (key) DO NOTHING;
```

---

## Files to ADD

**1. `web/src/components/ArticleEngagementZone.tsx` (new client component)**

The mount point for quiz + comments below the article body. Accepts `articleId`, `storyId`, `initialPassed` (boolean — server pre-checks quiz state). Manages `hasPassed` state. Renders `<ArticleQuiz>` (from Slice 04) above `<CommentThread>`. Passes `quizPassed` down to both. On `ArticleQuiz.onPass`, flips `hasPassed`. Must be mounted with `key={articleId}` at the call site so state resets on headline change.

**2. `web/src/app/api/cron/score-comments/route.ts` (new)**

Cron route (verify auth via `verifyCronAuth`, same as other cron routes). Fetches up to 100 unscored visible recent comments. Batches to Anthropic with a structured output prompt. Updates rows. Flags above threshold via `moderation_actions` insert. Returns `{ scored: number, flagged: number }`.

Add to `web/vercel.json` cron config: every 15 minutes (`*/15 * * * *`).

---

## Files to MODIFY

**1. `web/src/app/[slug]/page.tsx`**

Mount `<ArticleEngagementZone key={article.id} articleId={article.id} storyId={article.story_id} initialPassed={initialPassed} />` below `<ArticleSurface>`. Server-check `initialPassed` via a Supabase service call to `user_passed_article_quiz` (only if `user` is present — skip for anon).

**2. `web/src/components/CommentThread.tsx`**

- Accept `quizPassed: boolean` prop. Pass to `CommentComposer`.
- Lines 260–310 (realtime INSERT/UPDATE handlers): replace `users!user_id(...)` embed with two-step fetch — comment row alone, then `public_profiles_v` batch by user_id. Merge into `authorById`.
- Add "Expert" filter button above thread. Local filter state — when active, only show comments where `is_expert_question || is_expert_reply`.
- Remove the separate expert section above the thread (if it mounts here — grep for `expertInsights` or `expertDialogOpen` in the render tree and excise).

**3. `web/src/components/CommentComposer.tsx`**

- Accept `quizPassed: boolean` prop.
- When `quizPassed=false`: render textarea + button as `disabled`, muted styling, copy "Pass the quiz to join the discussion" above the field.
- When `quizPassed=true`: existing active state.

**4. `web/src/components/CommentRow.tsx`**

- Expert reply visual treatment: highlighted background, "Expert" badge. Include `expert_title` from the author's profile if set (already available via `public_profiles_v` fields fetched in the thread). Paywall blur stays (`is_expert_reply && !canReadExpert`).

**5. `web/src/app/api/admin/moderation/comments/[id]/hide/route.js`**

After the `hide_comment` RPC call succeeds, INSERT into `moderation_actions`:
```js
await service.from('moderation_actions').insert({
  comment_id: params.id,
  moderator_id: user.id,
  action: mode === 'redact' ? 'redact' : 'hide',
  reason: reason || null,
});
```

**6. `web/src/app/api/admin/moderation/comments/[id]/unhide/route.js`**

Same pattern — INSERT `action='unhide'` row after `unhide_comment` RPC succeeds.

**7. `web/src/app/admin/reports/page.tsx`**

- Add "AI-flagged" filter tab alongside existing pending/resolved tabs.
- For each displayed comment, fetch the latest `moderation_actions` row and render inline: "Hidden by @username on [date] — [reason]" with a "see history" expander for multiple entries.

**8. `VerityPost/VerityPost/StoryDetailView.swift`**

- Lines 2568, 2599 (realtime refetch selects): replace `users!user_id(...)` embed with a separate PostgREST call to `public_profiles_v` by `id = payload.new.user_id`. Merge into displayed comment.
- Expert reply rendering: add badge + highlight treatment when `isExpertReply=true`. Remove the separate `expertInsights` section above the thread (it renders from line ~1962–1997 per the investigation — excise this block and the supporting state/fetches).
- Expert filter: add a filter toggle in the Discussion tab header that filters the in-memory `comments` array to `is_expert_question || is_expert_reply`.

---

## Files to DELETE

None in this slice. The separated expert section is removed via modifications to the files above, not as standalone file deletions.

---

## Cross-slice dependencies

- **Slice 04 (Quizzes):** `ArticleQuiz` component and `onPass` callback must exist before `ArticleEngagementZone` can be built. Slice 04's implementation is a prerequisite for this slice's web work.
- **Slice 05 (Timelines):** Migration B (`comments.story_id` FK) requires the `stories` table to exist. Apply Migration B only after Slice 05 migrations are applied. All other comment work is independent of Slice 05.
- **T300 RLS fix (D6):** Already broken in production. This is the highest-priority fix in the slice and can ship independently ahead of the rest as a standalone PR.

---

## Implementer verification checklist

- [ ] Web: reader page shows quiz + locked composer for a logged-in user who hasn't passed.
- [ ] Web: pass the quiz → composer unlocks in-place, no navigation.
- [ ] Web: anon reader sees article only — no quiz, no composer.
- [ ] Web: muted user sees mute banner, not the quiz-locked state.
- [ ] Web: post a comment → it appears via realtime without a page refresh (T300 fix verified).
- [ ] Web: post a comment as a second browser session → first session sees it appear without refresh.
- [ ] Web: expert reply renders with badge + highlight inline under the question.
- [ ] Web: Expert filter button shows only expert questions + answers.
- [ ] Web: non-paid user sees expert reply blurred with upgrade prompt.
- [ ] Web: switch headlines on a story page → `ArticleEngagementZone` resets (quiz progress and comments clear).
- [ ] Admin: hide a comment → `moderation_actions` row created, visible in reports page annotation.
- [ ] Admin: unhide a comment → `moderation_actions` row created (action='unhide').
- [ ] Admin: "AI-flagged" tab shows comments scored ≥ threshold by cron.
- [ ] Cron: run score-comments → unscored recent comments get `ai_toxicity_score` populated.
- [ ] Cron: comment above threshold → `moderation_actions` row with `action='ai_flagged'` and `moderator_id=null`.
- [ ] iOS: new comment from another user appears via realtime without app refresh (T300 fix verified).
- [ ] iOS: expert reply renders with badge + highlight.
- [ ] iOS: expert filter toggle shows only expert content.
- [ ] iOS: the former expert section above the thread is gone.
- [ ] `comments.story_id` FK applied and populated on insert (after Slice 05 is merged).
- [ ] Privacy posture preserved: comment 403s (quiz not passed, rate limited, banned) return same generic shape; real reason to audit log only.
- [ ] No keyboard shortcuts added.
- [ ] No color-per-tier added.
- [ ] No user-facing exposure of ai_toxicity_score or any moderation metadata.

---

## Open questions for owner

None. All seven decisions locked.
