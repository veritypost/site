# Article UX Audit — Index

**Last updated:** 2026-04-30 (session 8 — slice 06 full arc: investigation, Q&A, adversarial review, lock)
**Phase:** 7 — all 6 slices locked; program complete
**Next session should pick up:** Implementation sessions — all slices have locked fix plans ready to execute

---

## Slice status

| # | Slice | Status | Last touched | Slice doc |
|---|---|---|---|---|
| 01 | Home card layout | **locked** | 2026-04-30 | `slices/01-home-cards.md` |
| 02 | Story page & article reading | **locked** | 2026-04-30 | `slices/02-story-reading.md` |
| 03 | Quiz experience | **locked** | 2026-04-30 | `slices/03-quiz.md` |
| 04 | Discussion & comments | **locked** | 2026-04-30 | `slices/04-discussion.md` |
| 05 | Ask-an-expert | **locked** | 2026-04-30 | `slices/05-ask-an-expert.md` |
| 06 | Post-read engagement | **locked** | 2026-04-30 | `slices/06-post-read.md` |

**Default ordering** is 01 → 02 → 03 → 04 → 05 → 06. Owner can redirect at any time.

---

## Foundation status

| Doc | Status |
|---|---|
| `README.md` | ✓ written 2026-04-30 |
| `00-system-map.md` | ✓ written 2026-04-30 — stale note on `_HomeFooter` `page_view` to be removed |
| `SESSION_LOG.md` | ✓ through session 5 |

---

## Cross-surface findings

Findings that surface in one slice investigation but touch a different slice. Deferred to the slice that should decide it — listed here to stay visible at program level.

| Finding | Defer to | Notes |
|---|---|---|
| ~~Post-read navigation (end of article — no "next story" / "back to front page")~~ | 06 (Post-read engagement) — **resolved** | F1 in Slice 06: "More in [Category]" + "Back to edition" footer after ArticleEngagementZone |
| Quiz-to-comment unlock affordance (F6 in Slice 02) | 03 (Quiz experience) — **resolved** | Addressed as F2 in Slice 03: framing line above quiz + "Complete the quiz above to comment." in locked composer |

---

## Design decisions locked

Decisions made during this program that are now final. Listed here so future sessions don't re-open them.

| Decision | Slice | Notes |
|---|---|---|
| Home feed closing copy: drop both closing sentences | 01 | "That's today's front page." and "That's today's edition." removed; no rolling feed narrates its own end |
| Breaking strip: server-render immediately, gate timestamp only | 01 | Remove `if (!permsReady) return null`; timestamp appears additively post-hydration |
| Breaking state: `lifecycle_status` on stories is canonical | 01 | `is_breaking` boolean on articles is a migration artifact; one source of truth |
| First-login overlay: keep, extend to 2.5s, fix fallback copy | 01 | "you made it." → "welcome to verity post."; other variants unchanged |
| Category pills: make links to `/category/${slug}` | 01 | Same visual style; underline on hover; both hero and supporting cards |
| `is_breaking`/`is_developing`: remove from SELECT_COLS and HomeStory type | 01 | DB columns stay until F3 migration; filter query unaffected |
| Home cards: text-only is correct, won't-fix | 01 | Deliberate editorial aesthetic; hero dark-band treatment is correct |
| Home `page_view` tracking: global listener covers it, won't-fix | 01 | `PageViewTrackListener` in NavWrapper fires on every route |
| AI disclosure: won't-fix — TC/PP only | 02 | Owner decision; no user-facing AI disclosure anywhere on the site |
| Gamification language replaced — quiz copy | 03 | "Unlock the discussion" / "bar" / "unlock" removed; replaced with editorial register |
| Connecting language: framing line above quiz + composer spatial cue | 03 | "Answer a few questions..." above quiz; "Complete the quiz above to comment." |
| No-quiz article composer bug: `false` → `true` at AEZ:56 | 03 | Signed-in users on no-quiz articles had locked composer; one-character fix |
| Returning visitor card: suppress for `initialPassed && !justPassedThisSession` | 03 | Card shown on every return visit; suppressed so returners land directly in thread |
| Pass copy: "You're in." only — drop directional sentence | 03 | "The conversation is below." removed; ad timing accepted as-is |
| Rate limit disclosure: warn on attempt 2, exhaustion message on attempt 3 | 03 | 3/10min limit was invisible; now surfaced progressively |
| Pool exhaustion guard: `onPoolExhausted` callback + error message | 03 | Empty questions array was a silent dead-end; now graceful degradation |
| Anon CTA: block above open thread, copy varies by hasQuiz | 02 | "Join the conversation. Create a free account to take the knowledge quiz and unlock comments." (no quiz mention when hasQuiz=false) |
| Empty thread state: 3 branches by user state | 04 | Anon: "No comments yet." / not-passed: "Take the knowledge check above to unlock comments." / passed: "No comments yet. Start the discussion." |
| Realtime new-comment indicator: bottom-sticky bar | 04 | "N new comment(s) — click to load"; pending queue; no auto-scroll; flush on click |
| Reply context strip in composer | 04 | `parentAuthorUsername` + `parentBodyExcerpt` (120 chars) above textarea; left-border quote block |
| Max depth affordance: non-interactive span | 04 | "Max reply depth reached." at dim color; depth limit remains admin-configurable |
| Muted/banned composer copy: inline, self-contained | 04 | Banned: "Your account is banned. Posting is disabled." / muted+expiry: "You are muted until [datetime]…" / muted no expiry: "You are muted. Posting is disabled." |
| Optimistic vote counts with rollback | 04 | Optimistic update in CommentThread.handleVote before await; revert on error |
| comments.story_id FK: SET NULL migration required | 04 | Must apply before Slice 04 implementation session; clean migration (no cascade chain) |
| Expert submit: flash "Your question has been received…" (4s) | 05 | flashMessage state at CT:410-415 already exists; additive only |
| Expert question injection: follow-up fetch by comment_id | 05 | ask_expert RPC returns `{ comment_id, queue_item_id }` only; fetch full row before setComments |
| Expert question label: separate div above flex row | 05 | "Question for an expert" / "Your question for an expert" (isOwner); neutral left border; matches Pinned pattern |
| Expert dialog copy: "Ask an Expert" / "Submit question" / "Submitting…" | 05 | Remove "routes to the category queue" annotation; editorial register |
| Expert recruitment line: below thread when expert replies visible + signed-in | 05 | "Are you an expert in this area? Apply to answer reader questions." → /profile/settings/expert; gated on !!currentUserId only |
| Expert textarea: maxLength=1000, counter from 800+, red at 950+ | 05 | Server already enforces 1000-char limit; client needs matching enforcement |
| Expert dialog: neutral styling — var(--card), var(--border), var(--accent) | 05 | Replace #fffbeb / #fde68a yellow with theme tokens |
| Expert dialog: useFocusTrap with onEscape | 05 | Matches report modal pattern at CT:536; focus trap completely absent currently |
| Post-read navigation: "More in [Category]" + "Back to edition" | 06 | `NextStoryFooter` after AEZ in `[slug]/page.tsx`; server-fetches up to 3 stories in same category; fallback to back-link only if category null |
| Share button: copy-URL only at launch | 06 | `ShareButton` in new `ArticleActions` row between ArticleSurface and AEZ; clipboard.writeText; visible to all including anon |
| Bookmark button: icon toggle, signed-in only | 06 | `BookmarkButton` in `ArticleActions` row; FollowButton permission-check pattern; returns null for anon |
| Author attribution: static "verity post" credit | 06 | Below subtitle in ArticleSurface, before body; no DB join, no link; var(--dim) color |
| `/following` rename to "Active Stories" | 06 | H1 + metadata + NavWrapper label; route stays `/following`; no logic changes |
| Home anon CTA copy: "Create a free account to take the quiz and join the discussion." | 06 | Applied to `_HomeFooter.tsx` anon CTA; was deferred from Slice 01 |
| Section break: hairline rule + context-sensitive `<h2>` | 02 | "Test Your Knowledge" (quiz pending) / "Discussion" (all other states) |
| Active picker tab: `<span tabIndex={0}>` not `<Link>` | 02 | `aria-current="page"` preserved; keyboard tab order preserved |
| Source links: persistent underline at rest | 02 | `textDecoration: underline; textUnderlineOffset: 3px` on LINK_STYLE in SourcesSection |
| Subtitle semantic: `role="doc-subtitle"` on existing `<p>` | 02 | DPUB-ARIA; not `<h2>` — deck copy is not a section heading |
| Invalid `?a=` silent redirect: won't-fix | 02 | Graceful degradation; articles use soft-delete so stale params are rare |

---

## Known implementation gaps (from article-lifecycle program)

These were identified post-program by the article-lifecycle INDEX.md review. They are not UX findings in the classic sense, but each has UX surface impact. The relevant slice should evaluate them:

| Gap | Slice | Notes |
|---|---|---|
| `stories` table missing `subtitle` and `description` columns | 02 (story reading) | Slice 05 D5 spec included them; migration didn't create them. Deferred admin UI item can't ship without another migration. |
| ~~`comments.story_id` FK uses `ON DELETE CASCADE` (should be `SET NULL`)~~ | 04 (discussion) | **Resolved** — locked as F7 in Slice 04; migration to SET NULL required before implementation session. |
| ~~`quiz-regenerate` rejects on any verification disagreement instead of applying fixes~~ | 03 (quiz) | **Resolved** — `5a4669c` (2026-04-30); route now applies verification fixes automatically. Do not re-investigate. |
| ~~`score-comments` cron uses old Haiku model string~~ | 04 (discussion) | **Deferred to site-bug-sweep** — F8 in Slice 04; `process.env.SCORE_MODEL` env var. Not a UX design decision. |

**Already resolved (do not re-investigate):**
- `ArticleTracker` viewport-height sentinel bug — fixed in site-bug-sweep slice 03 session 6, commit `9afd119`

---

## Deferred decisions (named, carry forward)

These are design decisions from Slice 01 that are explicitly unresolved and must be addressed in a later session.

| Decision | Depends on | When to address |
|---|---|---|
| Home feed model: finite curated list vs. paginating rolling feed | Owner call | Before feed implementation session |
| ~~Home anon CTA copy~~ | **Resolved** — Slice 06 session | "Create a free account to take the quiz and join the discussion." → `_HomeFooter.tsx` |
| Empty feed state (F9) | Feed model decision | When feed model is implemented |

---

## Open owner-actions

_(none — all Slice 01 items are decided or explicitly deferred with named reasons)_

---

## Deferred items (named, intentional)

| Item | Named reason |
|---|---|
| Slice 01 anon CTA copy | Depends on what ask-an-expert and comments actually offer; revisit after slices 04/05 |
| Slice 01 feed pagination model | Owner hasn't decided finite vs. rolling; decision gates implementation |
| Slice 01 F9 empty feed state | Becomes near-impossible once feed model moves off today-only filter |
