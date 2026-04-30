# Article UX Audit — Session Log

Append-only chronological log. Most recent at the bottom. Each entry: date, session, what happened, what was decided, what's blocked, what next session should pick up.

---

## Session 0 — 2026-04-30 — Founding

**Phase entering:** 0 (no artifacts).
**Phase leaving:** 0 (program founded; no slice started).

**What happened.** The program started cold. Read format references from `site-bug-sweep/README.md` (session protocols, slice-status vocabulary, end-of-session rules, FK hint rule, adversarial review discipline) and `site-bug-sweep/INDEX.md` (slice dashboard format). Read `article-lifecycle/INDEX.md` in full, noting all six slices (Generation, Publishing, Viewing, Quizzes, Timelines, Comments) as implemented, plus the post-program "Known implementation gaps" section — five items, one already resolved by the bug-sweep. Read full auto-memory.

**Surface-mapping pass.** Read top-level listings and file structures for:
- `web/src/app/page.tsx` — home feed server component; hero + 11 supporting cards; `_HomeBreakingStrip`, `_HomeFooter`, `_HomeFetchFailed`, `_HomeVisitTimestamp`, `_HomeFirstLoginMoment` client islands.
- `web/src/app/[slug]/` — story page; `page.tsx`, `_ArticleFetchFailed.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`.
- `web/src/components/article/` — `ArticleSurface.tsx`, `ArticleTracker.tsx`, `ArticleEditor.tsx`, `KidsStoryEditor.tsx`, `SourcesSection.tsx`, `StoryArticlePicker.tsx`, `StoryEditor.tsx`, `TimelineSection.tsx`.
- Comment components — `CommentThread.tsx`, `CommentComposer.tsx`, `CommentRow.tsx` (all in `web/src/components/`; no `comment/` subdirectory).
- `web/src/components/ArticleEngagementZone.tsx` — client island that composes `ArticleQuiz` + `CommentThread`; renders anon read-only path and logged-in quiz+discussion path.
- `web/src/components/ArticleQuiz.tsx` — quiz state machine; pool exhaustion, question flow, pass/fail.
- `web/src/app/expert-queue/page.tsx` — expert queue; claim, decline, post answer, post back-channel.
- `web/src/app/api/expert/` — five sub-routes: `answers/[id]/`, `apply/`, `ask/`, `back-channel/`, `queue/[id]/`.

**Slice design.** Grouped the reading journey into 6 slices:
1. Home card layout — `page.tsx`, `_HomeBreakingStrip`, `_HomeFooter`, `_HomeFetchFailed`, `_HomeVisitTimestamp`, `_HomeFirstLoginMoment`; anon + signed-in card rendering; hero vs. supporting card hierarchy; breaking strip; end-of-edition state.
2. Story page & article reading — `/[slug]/page.tsx`, `ArticleSurface`, `ArticleTracker`, `StoryArticlePicker`, `SourcesSection`, `TimelineSection`; single-article and multi-article story; `?a=` param navigation.
3. Quiz experience — `ArticleQuiz`, `ArticleEngagementZone` quiz branch; pre-start, question flow, pass, fail, locked-composer gate, locked state for anon.
4. Discussion & comments — `CommentThread`, `CommentComposer`, `CommentRow`, `ArticleEngagementZone` comment branch; thread display, reply depth, expert inline rendering, locked vs. unlocked composer.
5. Ask-an-expert — `/api/expert/ask/`, `/api/expert/answers/`, `/api/expert/queue/`, `/api/expert/back-channel/`, `expert-queue/page.tsx`; reader question → expert sees it → expert answers → answer surfaces in reader's view.
6. Post-read engagement — `BookmarkButton`, `FollowButton`, social share affordances, next-article navigation, notification triggers; what a reader can do after reaching the end.

**Ordering rationale.** 01 first because the home card is the entry point and first impression — highest breadth of impact, and the most likely surface to be leaking retention before a reader even reaches an article. 02 next as the core product. 03 and 04 are paired (quiz gates discussion); quiz first because the pass/fail state drives the discussion experience. 05 is a deeper expert-specific flow. 06 is the post-read layer that depends on everything before it being solid.

**What got locked.**
- The four foundation artifacts.
- The six slices and their ordering.
- The slice-status vocabulary (adapts bug-sweep vocabulary for UX: adds "decided" status; replaces "found/planned" with "found/decided").
- Memory rules anchored in README (no color-per-tier, no timelines, lowercase wordmark, security-only emails, no keyboard shortcuts, kids = iOS only, kill-switch don't delete).
- Known implementation gaps from article-lifecycle cross-referenced into INDEX.md.

**No investigations or code changes were made.** Session 0 is mapping only.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 01 — Home card layout. Re-read the system map's home-cards section. Walk the page as anon, free, and pro user — what does the hero card show? What do supporting cards show? What does the breaking strip show? What does the end-of-edition state feel like? Spawn parallel Explore agents to map `page.tsx`, `_homeShared.ts`, the five client islands, and the breaking strip permission logic. Surface ≤8 findings. FK hint rule applies to any `.select()` with `!` syntax.

---

## Session 1 — 2026-04-30 — Slice 01 investigation

**Phase entering:** 1 (slice 01 not-started).
**Phase leaving:** 1 (slice 01 findings-open; Q&A and adversarial review pending).

**What happened.** Spawned four parallel Explore agents covering all seven home-page files: `page.tsx`, `_homeShared.ts`, `_HomeBreakingStrip.tsx`, `_HomeFooter.tsx`, `_HomeFirstLoginMoment.tsx`, `_HomeVisitTimestamp.tsx`, `_HomeFetchFailed.tsx`. Walked reader states anon / free / pro through each component. Synthesized 8 findings. Wrote `slices/01-home-cards.md`. Updated INDEX.md.

**FK hint check.** No `!foreign_key_name` hints in home queries. `stories(slug, lifecycle_status)` is a column projection, not a disambiguation hint. Rule satisfied.

**Findings surfaced (all status: found).**
- F1 (HIGH) — Double closing + sandwiched anon conversion CTA at bottom of page
- F2 (HIGH) — Breaking strip pops in for signed-in users (full suppression until permission RPC resolves)
- F3 (MEDIUM) — `is_breaking` (article) vs. `lifecycle_status` (story) two sources of truth for breaking state
- F4 (MEDIUM) — First-login moment: 1.6s auto-dismiss, no user control, copy too thin
- F5 (MEDIUM) — Category pill: unclear if clickable link (needs one code verification read before Q&A)
- F6 (LOW) — `is_breaking`/`is_developing` booleans appear redundant with `lifecycle_status`
- F7 (LOW) — System map says footer fires `page_view` event; no such event in current code
- F8 (LOW) — No image on any card; confirm permanent intent vs. deferral

**Design decisions made.** None — Q&A not yet run.

**What's blocked.** F5 needs one code read (find `Eyebrow` component definition, confirm link vs. label) before its Q&A question can be formed.

**What next session should pick up.** Slice 01 — findings-open → locked.
1. Verify F5: read `Eyebrow` component, confirm link or label.
2. Run design Q&A on F1, F2, F3, F4, F5 (once verified), F7, F8. One question at a time, owner decides.
3. Run adversarial review (fresh Explore agent reads confirmed finding list + actual code).
4. Write fix plans for decided findings.
5. Update slice doc status to locked; update INDEX.md.

---

## Session 2 — 2026-04-30 — Slice 01 Q&A, adversarial review, lock

**Phase entering:** 1 (slice 01 findings-open).
**Phase leaving:** 1 (slice 01 locked; slice 02 next).

**What happened.**

F5 verified first: `Eyebrow` at `page.tsx:480–495` renders `<span>` — confirmed static label, not a link. Hero card uses a separate inline `<span>` at `page.tsx:566–579`, not `Eyebrow`.

Design Q&A: Owner directed away from one-question-at-a-time format. Instead, dispatched 5 parallel expert agents (news media product designer, growth/conversion strategist, frontend performance engineer, information architect, brand & editorial voice strategist) to independently assess all 8 findings and give recommendations. Each agent received full site brief, exact code context, and all 8 findings.

Key owner input during Q&A: don't limit stories to "today's edition" — the home feed should be like Drudge Report (top stories, as they happen, no artificial daily cap). This changed the shape of F1 significantly.

Key expert panel consensus across all 5 agents:
- F1: Drop both closing sentences entirely. Drop "Browse past editions →". Single footer zone, one action per auth state. "Today's edition" framing is wrong for the product.
- F2: Server-render the strip immediately; gate only the timestamp client-side (additive, no height change).
- F3: `lifecycle_status` on stories is canonical. One source of truth.
- F4: Keep overlay, extend to 2.5s, fix fallback copy to "welcome to verity post."
- F5: Category pills → links to `/category/${slug}`; same visual style.
- F6: Remove from SELECT_COLS and HomeStory type.
- F7: Already covered by global `PageViewTrackListener` in NavWrapper — confirmed in code.
- F8: Text-only is correct — unanimous won't-fix.

Owner deferred: CTA copy (depends on slices 04/05), feed pagination model (finite curated list vs. rolling paginating).

Adversarial review surfaced 6 clarifications absorbed into fix plans:
- F1: Clarified which elements to remove vs. keep in `_HomeFooter`
- F2: Add null slug guard before strip renders; existing href fallback already handles it
- F4: Specified exact timer values (outTimer 1400→2200, doneTimer 1600→2500)
- F5: Hero uses separate inline span, not Eyebrow — both need independent fixes; `/category/${slug}` confirmed as correct destination (route handles both UUID and slug)
- F6: `is_breaking` used as filter in breaking query separately from SELECT_COLS — removing from SELECT_COLS is safe, filter unaffected
- New F9 (deferred): Empty feed state shows only masthead — explicitly documented gap in `_HomeFetchFailed.tsx:10–12`; becomes near-impossible once feed moves off today-only filter

**Design decisions made.**

| Finding | Decision |
|---|---|
| F1 (partial) | Drop both closing sentences; drop Browse past editions link; single footer per auth state |
| F2 | Server-render strip; gate timestamp only |
| F3 | `lifecycle_status` canonical; migration session |
| F4 | Extend to 2.5s; "welcome to verity post." fallback |
| F5 | Links to `/category/${slug}`; same style; both hero + supporting |
| F6 | Remove from SELECT_COLS + HomeStory type; keep DB columns |
| F7 | Won't-fix; global listener confirmed |
| F8 | Won't-fix; text-only is correct |

**What's blocked.** Nothing blocking the 5 ready fix plans. Two items explicitly deferred with named reasons (CTA copy post-04/05, feed model owner decision).

**What next session should pick up.** Slice 02 — Story page & article reading. Re-read `00-system-map.md` Slice 02 section. Walk anon / free / pro through `[slug]/page.tsx`, `ArticleSurface`, `ArticleTracker`, `StoryArticlePicker`, `SourcesSection`, `TimelineSection`. Known gaps from article-lifecycle INDEX: `stories` table missing `subtitle` and `description` columns. Spawn parallel Explore agents. Surface ≤8 findings.

---

## Session 3 — 2026-04-30 — Slice 02 investigation

**Phase entering:** 2 (slice 02 not-started).
**Phase leaving:** 2 (slice 02 findings-open; Q&A and adversarial review pending).

**What happened.** Spawned 4 parallel Explore agents covering all Slice 02 files: `[slug]/page.tsx` + error/loading/not-found states; `ArticleSurface.tsx` + `ArticleTracker.tsx`; `StoryArticlePicker.tsx` + `SourcesSection.tsx` + `TimelineSection.tsx`; `ArticleEngagementZone.tsx` (boundary with slices 03/04). Walked reader states anon / free / pro through each file. Synthesized 8 findings. Wrote `slices/02-story-reading.md`. Updated INDEX.md.

**FK hint check.** No `!foreign_key_name` hints in any Slice 02 file. Rule satisfied.

**Findings surfaced (all status: found).**
- F1 (HIGH) — AI-generated articles not disclosed: `is_ai_generated`/`ai_model`/`ai_provider` fetched from DB but never passed to ArticleSurface props
- F2 (HIGH) — Anon reader: zero CTA or explanation below article; read-only comment thread with no sign-up hook
- F3 (MEDIUM) — No visual or textual section break at engagement zone (40px margin only)
- F4 (MEDIUM) — Single-article picker potentially shows; active tab re-navigates instead of no-op
- F5 (MEDIUM) — Source links have no visual affordance (no color, no underline at rest)
- F6 (MEDIUM) — Quiz-to-comment unlock has no affordance (boundary finding — defer to Slice 03)
- F7 (LOW) — Subtitle renders as `<p>` not `<h2>` (semantic/accessibility)
- F8 (LOW) — Invalid `?a=` param silently redirects with no explanation

**Cross-surface findings added to INDEX.md.**
- Post-read navigation → Slice 06
- Quiz-to-comment unlock affordance → Slice 03

**Known gap from article-lifecycle confirmed.** `stories` table missing `subtitle` and `description` columns; `ArticleSurface` uses `articles.subtitle` which exists and renders cleanly — not a current UX gap.

**Design decisions made.** None — Q&A not yet run.

**What's blocked.** F4 needs one code verification: does the `[slug]/page.tsx` actually render `StoryArticlePicker` for single-article stories, or is the `articles.length > 1` guard correct? Check before forming the F4 Q&A question.

**What next session should pick up.** Slice 02 — findings-open → locked.
1. Verify F4: check `[slug]/page.tsx` render condition for `StoryArticlePicker`.
2. Run design Q&A on F1–F8 using multi-expert dispatch (same format as Slice 01).
3. Run adversarial review.
4. Write fix plans for decided findings.
5. Update slice doc to locked; update INDEX.md.

---

## Session 4 — 2026-04-30 — Slice 02 Q&A, adversarial review, lock

**Phase entering:** 2 (slice 02 findings-open).
**Phase leaving:** 3 (slice 02 locked; slice 03 next).

**What happened.**

F4 verified first: `page.tsx:221` — `{articles.length > 1 && <StoryArticlePicker>}` — single-article guard is correct. F4 narrowed to active-tab re-navigation only (part (a) was a false alarm). Full `StoryArticlePicker.tsx` read confirmed: every tab, including the active one, is a `<Link>` with no no-op fallback.

Owner decision on F1: no user-facing AI disclosure anywhere. TC/PP handles it at the policy level. F1 → won't-fix.

Multi-expert parallel Q&A dispatched: 5 agents (news media product designer, growth & conversion strategist, frontend performance & UX engineer, information architect & navigation designer, brand & editorial voice strategist). Each received full site brief, all 8 findings with exact code context, and their domain lens. All 5 returned.

Adversarial review: read `ArticleEngagementZone.tsx`, `StoryArticlePicker.tsx`, `SourcesSection.tsx`, `ArticleSurface.tsx`. Two clarifications absorbed (F2 copy varies by hasQuiz; F4 span needs tabIndex={0}). Two flagged items ruled non-issues (editor path is signed-in branch, not anon; COPPA/unpublished articles don't render the engagement zone).

**Design decisions made.**

| Finding | Decision |
|---|---|
| F1 — AI disclosure | Won't-fix — owner decision; TC/PP only |
| F2 — Anon CTA | CTA block above open thread; copy varies by hasQuiz; [Sign in] [Create account] |
| F3 — Section break | Hairline rule + context-sensitive `<h2>` — "Test Your Knowledge" / "Discussion" |
| F4 — Active tab | `<span tabIndex={0} aria-current="page">` for active tab; `<Link>` for inactive |
| F5 — Source links | `textDecoration: 'underline'; textUnderlineOffset: '3px'` on LINK_STYLE |
| F6 — Quiz unlock | Deferred to Slice 03 with framing direction from expert panel |
| F7 — Subtitle semantic | Add `role="doc-subtitle"` to existing `<p>` at ArticleSurface.tsx:90 |
| F8 — Silent redirect | Won't-fix — graceful degradation |

**Expert panel highlights.**
- F2: All 5 agreed on open thread + CTA above (no blur, no hide). Conversion argument: visible discussion is the hook.
- F7: 4/5 agreed on `role="doc-subtitle"` (not `<h2>`). DPUB-ARIA spec; standfirst is not a structural heading.
- F8: 4/5 agreed won't-fix. Silent redirect is correct for stale params.

**Files with locked fix plans (4 files):**
- `web/src/components/ArticleEngagementZone.tsx` — F2 + F3
- `web/src/components/article/StoryArticlePicker.tsx` — F4
- `web/src/components/article/SourcesSection.tsx` — F5
- `web/src/components/article/ArticleSurface.tsx` — F7

**What's blocked.** Nothing.

**What next session should pick up.** Slice 03 — Quiz experience (not-started → investigation).
1. Re-read `00-system-map.md` Slice 03 section.
2. Walk user states through `ArticleQuiz.tsx`, `ArticleEngagementZone.tsx` quiz branch, `[slug]/page.tsx` (hasQuiz/initialPassed server logic).
3. Carry in the F6 Slice 03 note: quiz-to-comment-unlock affordance has no connecting language — expert panel recommended "Answer a few questions about this article to join the discussion" above quiz and "Complete the quiz above to comment" below.
4. Known gap from article-lifecycle: `quiz-regenerate` admin endpoint rejects 422 on any verification disagreement — assess UX impact.
5. Surface ≤8 findings. FK hint rule applies.

---

## Session 5 — 2026-04-30 — Slice 03 full arc (investigation → lock)

**Phase entering:** 3 (slice 03 not-started).
**Phase leaving:** 4 (slice 03 locked; slice 04 next).

**What happened.**

Spawned 3 parallel Explore agents covering: `ArticleQuiz.tsx` (full 546-line state machine — all user states); `ArticleEngagementZone.tsx` + `[slug]/page.tsx` quiz logic + `CommentComposer.tsx` locked state; quiz API routes (`/api/quiz/start` and `/api/quiz/submit`). One direct file read to verify a suspected no-quiz article bug (AEZ:56) and one targeted grep on `CommentThread` to confirm it. One additional read of AEZ:155–180 to verify interstitial ad timing.

**Code verification finds.**
- `ArticleEngagementZone.tsx:56`: `quizPassed={hasQuiz ? hasPassed : false}` — confirmed bug. When hasQuiz=false, explicit `false` overrides `CommentThread`'s default (`quizPassed = true` at line 92). Signed-in users on no-quiz articles get a locked composer with no quiz present.
- `ArticleQuiz.tsx:208–254`: returning visitor PASSED state renders on every return (`initialPassed=true` → `stage='passed'` on mount). `justPassedThisSession` is already tracked in `ArticleEngagementZone` (line 22) — available to gate this.
- `ArticleQuiz.tsx:170–180`: interstitial ad fires 1500ms after pass (not on every pass — on every 3rd quiz attempt site-wide, for non-ad-free users). Ad is a modal; passes copy "The conversation is below." then modal covers page.
- `/api/quiz/start/route.js:42–52`: 3-attempt-per-600-second rate limit confirmed; 429 response with Retry-After header. `attemptMeta.attempt_number` from start response (AEZ:113) is the mechanism for computing remaining attempts.

**FK hint check.** No `!foreign_key_name` hints in any Slice 03 file. Quiz data goes through API routes only. Rule satisfied.

**Findings surfaced (7 total).**
- F1 (HIGH) — Gamification language throughout: "Unlock the discussion," "The bar is 3 to unlock," "Take another look and try again"
- F2 (HIGH) — No connecting language above quiz; locked composer lacks spatial cue (Slice 02 F6 carry-over, confirmed)
- F3 (HIGH) — Code bug: no-quiz articles have locked composer (AEZ:56, one-character fix)
- F4 (MEDIUM) — Returning visitor card shows on every return visit (ArticleQuiz.tsx:208–254)
- F5 (MEDIUM) — Pass copy "The conversation is below." then interstitial ad fires 1.5s later
- F6 (MEDIUM) — Rate limit (3/10min) invisible; fail state retry button has no warning
- F7 (LOW) — Pool exhaustion: 0 questions → blank question card, no fallback

**Design Q&A — multi-expert parallel dispatch.**
5 agents (news media product designer, growth & conversion strategist, frontend performance & UX engineer, information architect & navigation designer, brand & editorial voice strategist) evaluated all 7 findings simultaneously. Full brief including exact code context provided to each.

**Key owner decisions made.**
- D1 (F1): Drop internal quiz card headline entirely (h2 above + framing line cover it). Copy: "5 questions — aim for 3 correct." / button: "Begin" / fail: "You need 3 to continue."
- D2 (F4): Suppress returning-visitor card entirely (4/5 expert consensus). `{hasQuiz && (!initialPassed || justPassedThisSession) && ...}` condition.
- D3 (F5): "You're in." — drop directional sentence. Interstitial ad timing accepted as-is.

F2 and F6 design directions confirmed from Slice 02 carry-over and expert panel consensus respectively — no new owner Q&A needed.

**Adversarial review.** Fresh Explore agent read all three main files. 12 clarifications absorbed into fix plans; 3 flagged "decisions still needed" resolved as implementer judgment (attempt_number available from start response; `onPoolExhausted` callback pattern; F4 retry asymmetry is intentional). No new owner decisions required.

**Design decisions made (all 7 findings).**

| Finding | Decision |
|---|---|
| F1 — Gamification language | Drop headline; editorial copy throughout |
| F2 — Connecting language | Framing line above quiz; "Complete the quiz above to comment." |
| F3 — No-quiz bug | `false` → `true` at AEZ:56; 6-agent ship pattern |
| F4 — Returning visitor card | Suppress when `initialPassed && !justPassedThisSession` |
| F5 — Pass copy | "You're in." only; drop directional sentence |
| F6 — Rate limit | Progressive disclosure: warn at attempt 2, exhaustion at attempt 3, 429 detection |
| F7 — Pool exhaustion | `onPoolExhausted` callback → open composer; graceful error message |

**Files with locked fix plans (3 files):**
- `web/src/components/ArticleQuiz.tsx` — F1, F5, F6, F7
- `web/src/components/ArticleEngagementZone.tsx` — F2, F3, F4, F7
- `web/src/components/CommentComposer.tsx` — F2

**What's blocked.** Nothing.

**What next session should pick up.** Slice 04 — Discussion & comments (not-started → investigation).
1. Re-read `00-system-map.md` Slice 04 section.
2. Walk user states (anon, free/pro quiz-passed, free/pro quiz-not-passed, no-quiz article, muted, banned, expert, moderator/admin) through `CommentThread.tsx`, `CommentComposer.tsx`, `CommentRow.tsx`, `ArticleEngagementZone.tsx` comment branch.
3. Known gaps from article-lifecycle INDEX: `comments.story_id` FK uses ON DELETE CASCADE (should be SET NULL); `score-comments` cron uses old Haiku model string.
4. CommentComposer.tsx locked state copy is changing in Slice 03 implementation — investigate assuming the F2 fix is in place (or note it as a carry-in dependency).
5. FK hint rule applies — `comments` API uses `users!fk_comments_user_id` (fixed in bug-sweep). Verify no other hints in Slice 04 files.

---

## Session 6 — 2026-04-30 — Slice 04 full arc (investigation → lock)

**Phase entering:** 4 (slice 04 not-started).
**Phase leaving:** 5 (slice 04 locked; slice 05 next).

**What happened.**

Spawned 4 parallel Explore agents covering: `CommentThread.tsx` (thread load, realtime, lock/unlock animation, reply depth, empty state, report modal); `CommentComposer.tsx` (locked, muted, banned, open states, post flow, @mention); `CommentRow.tsx` (vote controls, reply trigger, expert badge, moderator actions, hidden/removed state, depth rendering); API routes + `ArticleEngagementZone.tsx` comment bridge + score-comments cron + FK hint check.

Two direct code checks: CASCADE FK on `comments.story_id` confirmed in migration; `AccountStateBanner.tsx` confirmed in `NavWrapper.tsx:428` (muted copy shows expiry, not phantom).

**Code verification finds.**
- `CommentThread.tsx:1073`: single hardcoded empty-state string — false for anon and quiz-not-passed users.
- `CommentThread.tsx:258–290`: T300 realtime INSERT handler silent-appends with no indicator.
- `CommentComposer.tsx:253`: reply composer has no parent context (no username, no excerpt).
- `CommentRow.tsx:390`: reply button silently disappears at max depth (default 2, admin-configurable via `/api/settings/public`).
- `CommentComposer.tsx:216`: muted/banned copy cross-references off-screen `AccountStateBanner`; data to fix is already in `muteState` at line 44.
- `CommentRow.tsx:357/365`: vote counts read directly from props — no optimistic update.
- `supabase/migrations/2026-04-29_slice05_stories_as_containers.sql`: `comments.story_id` confirmed `ON DELETE CASCADE`; spec required `SET NULL`.
- `web/src/app/api/cron/score-comments/route.ts:60`: `claude-haiku-4-5-20251001` hardcoded literal.

**FK hint check.** `CommentThread.tsx` GET: `select('*')` + separate `public_profiles_v` query — no `!fk` hints. `POST /api/comments/` re-fetch: `users!fk_comments_user_id` — correct `fk_` prefix. Rule satisfied.

**Findings surfaced (8 total).**
- F1 (HIGH) — Empty thread state copy wrong for anon and quiz-not-passed users
- F2 (MEDIUM) — No visual indicator when new comments arrive via realtime
- F3 (MEDIUM) — Reply composer shows no reply context
- F4 (MEDIUM) — Reply button disappears silently at max depth
- F5 (LOW) — Muted/banned composer copy cross-references off-screen banner
- F6 (LOW) — Vote counts not optimistic
- F7 (HIGH, compliance risk) — `comments.story_id` FK uses ON DELETE CASCADE
- F8 (code fix) — score-comments cron hardcodes model string; deferred to site-bug-sweep

**Design Q&A — multi-expert parallel dispatch.**
5 agents (news media product designer, growth & conversion strategist, frontend performance & UX engineer, information architect & navigation designer, brand & editorial voice strategist) evaluated all 8 findings simultaneously. Three apparent open decisions resolved by direct code reads (no owner Q&A needed):
- D1 (anon CTA button): No — Slice 02 F2 CTA block above thread already handles conversion; empty-state copy alone is sufficient.
- D2 (max depth 2 or 3): Admin-configurable setting; no code change required; owner can adjust in admin settings.
- D3 (banned copy register): Match `AccountStateBanner.tsx:47–50` exactly — "Your account is banned. Posting is disabled."

**Adversarial review.** Fresh Explore agent read all 4 main files. Key clarifications absorbed:
- F1 + Slice 02 F2 ordering dependency: F1 and Slice 02 F2 must ship together or Slice 02 F2 first.
- F2 stagger-safe: pending-queue approach keeps justRevealed stagger targets stable; flushed comments don't get stagger.
- F4 settings over-fetch: `commentMaxDepth` must be lifted from per-row fetch to shared context/prop (50 comments = 50 requests).
- F5 date format: `muted_until` is raw ISO string; format with `toLocaleString()` before display.
- F6 vote ownership: optimistic update lives in `CommentThread.handleVote`, not CommentRow.
- F7 cascade chain: `reports` table is polymorphic (no FK to comments); `moderation_actions.comment_id` references `comments.id` not `story_id` — migration is clean.

No new owner decisions required from adversarial pass.

**Design decisions made (all 8 findings).**

| Finding | Decision |
|---|---|
| F1 — Empty state copy | 3 branches: anon "No comments yet." / not-passed "Take the knowledge check above to unlock comments." / passed "No comments yet. Start the discussion." |
| F2 — Realtime indicator | Pending queue + bottom-sticky "N new comment(s) — click to load" bar |
| F3 — Reply context | `parentAuthorUsername` + `parentBodyExcerpt` (120 chars) above textarea; left-border quote block |
| F4 — Max depth affordance | Non-interactive `<span>` "Max reply depth reached."; lift settings fetch to shared context |
| F5 — Muted/banned copy | Inline state-specific copy with formatted expiry; no cross-reference |
| F6 — Optimistic votes | Optimistic update in `CommentThread.handleVote` before await; rollback on error |
| F7 — CASCADE FK | ALTER TABLE migration to `ON DELETE SET NULL`; apply before implementation session |
| F8 — Model string | Deferred to site-bug-sweep; `process.env.SCORE_MODEL ?? 'claude-haiku-4-5-20251001'` |

**Files with locked fix plans (4 files + 1 migration):**
- `web/src/components/CommentThread.tsx` — F1, F2, F6
- `web/src/components/CommentComposer.tsx` — F3 (new props), F5
- `web/src/components/CommentRow.tsx` — F3 (pass props), F4
- `supabase/migrations/` — F7 (SET NULL migration)

**What's blocked.** Nothing.

**What next session should pick up.** Slice 05 — Ask-an-expert (not-started → investigation).
1. Re-read `00-system-map.md` Slice 05 section.
2. Trace the reader-facing ask affordance — exact entry point is unconfirmed; may be inside `CommentThread`, `CommentRow`, or `ArticleEngagementZone`. Must be found in code.
3. Trace how expert answers surface back to the reader (in-thread, notification, annotation, or special comment row).
4. Walk user states: anon (cannot ask), free/pro (can ask if `expert.ask` permission), expert (sees queue), admin/oversight (sees all categories).
5. Bug-sweep slice 04 context: expert queue action buttons (Claim, Decline, Post answer, Post back-channel) have double-fire risk — note as known gap if confirmed in reader-facing surface too.
6. FK hint rule applies to all `.select()` calls in expert API routes.

---

## Session 7 — 2026-04-30 — Slice 05 full arc (investigation → lock)

**Phase entering:** 5 (slice 05 not-started).
**Phase leaving:** 6 (slice 05 locked; slice 06 next).

**What happened.**

Spawned 4 parallel Explore agents covering: `CommentThread.tsx` expert dialog + submit handler + `canAskExpert` permission gate + `expertFilter` logic; `CommentRow.tsx` expert badge + reply styling + `is_expert_question` / `is_expert_reply` flag handling; `web/src/app/api/expert/ask/route.js` + `web/src/app/api/expert/answers/[id]/route.js` + `web/src/app/expert-queue/page.tsx`; `web/src/components/ExpertApplyForm.tsx` + `web/src/types/database.ts` + FK hint check.

Two post-adversarial code verifications: `ask_expert` RPC return shape confirmed from migration SQL (`{ comment_id, queue_item_id }` — not full comment; follow-up fetch required for F2); "Pinned as Article Context" label pattern confirmed at `CommentRow.tsx:205–210` (separate `<div>` above flex row — correct model for F3).

**Code verification finds.**
- `CommentThread.tsx:719–722`: `+ Ask an Expert` button gated on `currentUserId && canAskExpert && !expertDialogOpen`. Anon users and users without `expert.ask` permission never see it.
- `CommentThread.tsx:540–574`: `submitExpertQuestion` success path (lines 567–568) calls `setExpertDialogOpen(false)` only — no flash, no inject.
- `CommentThread.tsx:725–789`: expert dialog — header "Ask an Expert — routes to the category queue", button "Send to queue", background `#fffbeb`, border `#fde68a`. No `maxLength` on textarea. No `useFocusTrap`.
- `CommentRow.tsx:195–256`: `is_expert_reply` has green background + "Expert" badge. `is_expert_question` has no label.
- `web/src/app/api/expert/ask/route.js:59–68`: calls `ask_expert` RPC; returns `NextResponse.json(data)` — data is `{ comment_id, queue_item_id }`.
- `ask_expert` RPC definition: `RETURNS jsonb` → `RETURN jsonb_build_object('comment_id', v_comment_id, 'queue_item_id', v_queue_id)`.

**FK hint check.** `POST /api/expert/ask` calls RPC — no `.select()` with `!fk` hints. F2 follow-up fetch plan uses `users!fk_comments_user_id` — correct `fk_` prefix. Rule satisfied.

**Findings surfaced (8 total).**
- F1 (HIGH) — No feedback after submitting expert question (dialog closes silently)
- F2 (HIGH) — Expert question not injected into thread after submission
- F3 (MEDIUM) — Expert question comments have no visual label (`is_expert_question` unrendered)
- F4 (MEDIUM) — Expert dialog header + button copy uses internal jargon ("routes to the category queue", "Send to queue")
- F5 (LOW) — No expert recruitment prompt when expert replies are visible
- F6 (MEDIUM) — Expert textarea has no character limit or counter (server enforces 1000 chars; client has nothing)
- F7 (LOW) — Expert dialog uses yellow styling (#fffbeb/#fde68a)
- F8 (MEDIUM) — Expert dialog missing focus trap (keyboard users can tab out; Escape does not close)

**Design Q&A — multi-expert parallel dispatch.**
5 agents (news media product designer, growth & conversion strategist, frontend performance & UX engineer, information architect & navigation designer, brand & editorial voice strategist) evaluated all 8 findings simultaneously. No owner Q&A required — all decisions either resolved by code reads or had unanimous expert consensus.

**Adversarial review.** Fresh Explore agent read `CommentThread.tsx` (expert dialog + submit + flashMessage zone), `CommentRow.tsx` (expert reply styling + isOwner), `web/src/app/api/expert/ask/route.js`, `supabase/database.ts`. Key clarifications absorbed:
- F2: RPC return shape confirmed `{ comment_id, queue_item_id }` only — follow-up fetch by `comment_id` required. FK hint `users!fk_comments_user_id` is correct.
- F3: Label position resolved to separate `<div>` above flex row (Pinned pattern). `isOwner` at line 149 already in scope.
- F5: Expert status unavailable in CommentThread — gate on `!!currentUserId` only.
- F8: Focus trap completely absent; report modal at line 536 is exact pattern.

No new owner decisions required from adversarial pass.

**Design decisions made (all 8 findings).**

| Finding | Decision |
|---|---|
| F1 — No submit feedback | Flash "Your question has been received. An expert in this area will answer in the thread." — 4s |
| F2 — No thread injection | Follow-up fetch by comment_id; inject into setComments; button stays visible |
| F3 — No question label | Separate `<div>` above flex row; "Question for an expert" / "Your question for an expert" (isOwner); neutral left border |
| F4 — Jargon copy | Header → "Ask an Expert"; button → "Submit question"; loading → "Submitting…" |
| F5 — No recruitment line | "Are you an expert in this area? Apply to answer reader questions." below thread; gated on `visible.some(c => c.is_expert_reply) && !!currentUserId` |
| F6 — No char limit | maxLength={1000}; counter from 800+; red at 950+ |
| F7 — Yellow styling | var(--card, #fff) / var(--border, #e5e5e5) / var(--accent, #111) |
| F8 — No focus trap | useFocusTrap({ onEscape: () => setExpertDialogOpen(false) }); matches report modal at CT:536 |

**Files with locked fix plans (2 files):**
- `web/src/components/CommentThread.tsx` — F1, F2, F4, F5, F6, F7, F8
- `web/src/components/CommentRow.tsx` — F3

**What's blocked.** Nothing.

**What next session should pick up.** Slice 06 — Post-read engagement (not-started → investigation).
1. Re-read `00-system-map.md` Slice 06 section.
2. Walk user states (anon, free, pro, expert) through post-article affordances: `BookmarkButton`, `FollowButton`, social share, next-article navigation, notification triggers.
3. Cross-surface finding from INDEX: "Post-read navigation" — no next story / back to front page affordance at end of `ArticleSurface`. Slice 06 owns this.
4. Deferred items to check: home anon CTA copy (depends on slices 04 + 05 now both locked — ready to decide).
5. FK hint rule applies to any `.select()` with `!` syntax.
6. When investigation complete: run design Q&A (multi-expert dispatch), adversarial review, lock, update all three state artifacts.

---

## Session 8 — 2026-04-30 — Slice 06 full arc (investigation → lock) + home CTA decision

**Phase entering:** 6 (slice 06 not-started).
**Phase leaving:** 7 (slice 06 locked; all 6 slices locked; program investigation complete).

**What happened.**

Spawned 4 parallel Explore agents covering: `BookmarkButton` and bookmarks infrastructure; `FollowButton` and follows infrastructure; end-of-article rendering in `ArticleSurface`, `ArticleEngagementZone`, and `[slug]/page.tsx`; social share search, notifications, v2LiveGuard coverage, and related-articles scan.

FK hint check: all 5 hints in bookmarks and follows infrastructure (`fk_bookmarks_article_id`, `fk_bookmarks_collection_id`, `fk_articles_category_id`, `fk_follows_follower_id`, `fk_follows_following_id`) confirmed in `database.ts`. Rule satisfied.

**Key code finds:**
- `BookmarkButton` component does not exist; bookmarks API fully built (v2LiveGuard + `article.bookmark.add` permission + idempotency on 23505).
- `FollowButton.tsx` exists but only used on `/u/[username]/page.tsx`, which is kill-switched (`PUBLIC_PROFILE_ENABLED = false`).
- Article page terminates at `CommentThread.tsx:1116` — nothing follows in AEZ, ArticleSurface, or page.tsx.
- No social share component exists anywhere in the codebase; scraper strips `.social-share` from ingested content.
- `/following/page.tsx:64–94` shows reading-history active stories, not followed-author content.
- Notifications exist (COMMENT_REPLY, COMMENT_MENTION, BREAKING_NEWS, EXPERT_ANSWER) and link back to articles via `action_url` — working re-engagement mechanism; no findings.
- `article_relations` table exists in schema but no UI consumes it — noted, not a finding.
- `[slug]/page.tsx` has no `[slug]/opengraph-image.tsx` — story pages use site-level OG defaults.

**Findings surfaced (6 total).**
- F1 (HIGH) — Dead end: article terminates at comment thread with no forward navigation
- F2 (HIGH) — No social share affordance anywhere in the product
- F3 (HIGH) — No bookmark affordance on the story page (API exists, no component)
- F4 (MEDIUM) — No author attribution or follow-author hook on the story page
- F5 (MEDIUM) — `/following` page misnamed; delivers reading-history, not followed-author content
- F6 (LOW) — Story pages have no per-story OG image override

**Design Q&A — multi-expert parallel dispatch.**
5 agents (news media product designer, growth & conversion strategist, frontend performance & UX engineer, information architect & navigation designer, brand & editorial voice strategist) evaluated all 6 findings simultaneously plus the unblocked home anon CTA decision.

Expert consensus resolved F1 (category navigation + back-link), F3 (bookmark button), F5 (rename), F6 (defer). Owner Q&A needed for F2 (share: ship at launch?), F4 (AI-generated articles — byline approach?), and home CTA copy.

**Owner decisions:**
- F2: "share at launch" → copy-URL button
- F4: Owner confirmed no editorial background, content is AI-generated → "verity post" publication credit (not a person byline)
- Home CTA: "Create a free account to take the quiz and join the discussion." (confirmed)

**Adversarial review.** Fresh Explore agent read AEZ, ArticleSurface, `[slug]/page.tsx`, FollowButton, following/page.tsx, bookmarks API. 11 clarifications absorbed:
- Critical: ShareButton and BookmarkButton cannot live inside AEZ's anon branch (AEZ returns early for anon at lines 30–39). Fix: create `ArticleActions` client wrapper in `[slug]/page.tsx` between ArticleSurface and AEZ.
- Critical: `category_id` is not in `ARTICLE_SELECT` — must be added for F1's "More in [Category]" fetch.
- Critical: Story slug must be passed to `ArticleActions` (not currently a prop to AEZ) for ShareButton URL construction.
- F5: NavWrapper nav label also says "Following" — must be updated in the same commit.
- Pre-existing gap noted: `currentUserTier` prop declared in AEZ interface but not passed from `[slug]/page.tsx:259`; not in scope for this slice.

No new owner decisions required from adversarial pass.

**Design decisions made (all 6 findings + home CTA).**

| Finding | Decision |
|---|---|
| F1 — Forward navigation | "More in [Category]" (up to 3 server-fetched stories) + "Back to edition" link; `NextStoryFooter` after AEZ in `[slug]/page.tsx` |
| F2 — Share | Copy-URL button in `ArticleActions` row between ArticleSurface and AEZ; visible to anon; "Copy link" → "Copied" |
| F3 — Bookmark | `BookmarkButton` in `ArticleActions` row; FollowButton permission-check pattern; returns null for anon |
| F4 — Attribution | Static "verity post" credit in ArticleSurface below subtitle; var(--dim); no link |
| F5 — /following rename | H1 + metadata + NavWrapper: "Active Stories"; route stays `/following` |
| F6 — OG image | Deferred post-launch |
| Home CTA | "Create a free account to take the quiz and join the discussion." → `_HomeFooter.tsx` |

**Files with locked fix plans:**
- `web/src/app/[slug]/page.tsx` — F1 (ARTICLE_SELECT + category fetch + NextStoryFooter render), F2/F3 (ArticleActions render)
- `web/src/components/article/ArticleSurface.tsx` — F4 (publication credit)
- New: `web/src/components/ArticleActions.tsx` — F2/F3 wrapper
- New: `web/src/components/ShareButton.tsx` — F2
- New: `web/src/components/BookmarkButton.tsx` — F3
- New: `web/src/components/NextStoryFooter.tsx` (or similar) — F1
- `web/src/app/following/page.tsx` — F5 (H1 + metadata)
- `web/src/app/NavWrapper.tsx` — F5 (nav label)
- `web/src/app/_HomeFooter.tsx` — home CTA copy

**What's blocked.** Nothing — all 6 slices locked. Program investigation phase complete.

**What next session should pick up.** Implementation sessions — each locked slice has a sealed fix plan. Recommended order:
1. Slice 06 post-read (F4 is a 2-line change; F2/F3/F5 are contained; F1 is the most involved)
2. Slice 01 home cards (F1–F6 fix plans sealed)
3. Slices 02–05 in dependency order (Slice 02 F2 anon CTA and Slice 04 F1 empty state must ship together or Slice 02 first)

Each implementation session requires the full 6-agent ship pattern (4 pre-impl + 2 post-impl).
