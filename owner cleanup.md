# Owner Cleanup

Working doc. Owner drives — describes what they're seeing and what should change. Claude reviews the actual code on each item before proposing anything.

## Working rules
- Owner posts items; Claude does not pre-audit or volunteer findings.
- For each item: Claude reads the relevant code, confirms current state, then responds.
- Nothing changes until owner says go.

## Cross-platform requirement
Every change here must be applied across **web + iOS (VerityPost) + kids iOS (VerityPostKids)**. If a change is genuinely not applicable to one of those, state "n/a" explicitly with a one-line reason. Default assumption is all three.

---

## The three phases

### Phase 1 — Owner walkthrough (current)
Owner goes page by page (web pages, iOS screens, kids iOS screens) and flags what looks off or needs to change. Claude only logs the items into this doc. **No agents dispatched. No code review yet. No fixes.**

### Phase 2 — Diagnostic confirmation
Once owner has flagged an item, Claude + agents read the actual code and confirm *what it might need to be* — current behavior, downstream callers, what a proper fix would look like. Output is a recommendation written into the item's block. **Still no implementation.**

### Phase 3 — Implementation (right-sized per item)
Trigger: owner says "go on item N." Nothing ships until then. Items get split by size:

**Trivial — Claude implements, no agent panel.** One-file or one-line edits where downstream effects are self-contained.
Currently: items **1, 3, 5, 8, 9**.

**Medium — Claude implements, then one reviewer agent does a post-impl pass.** Multi-file edits that touch a couple of components but no data model or trust-sensitive surface.
Currently: items **2, 4, 6, 11, 13**.

**Bigger — full 4-agent review (Reviewer A + Reviewer B + pressure-test + post-impl adversary + Claude confirm).** Items that touch data model, trust/abuse vectors, or build a new surface from scratch.
Currently: items **7, 10, 12**.

If reviewers diverge on a bigger item, dispatch a fresh independent panel to break the tie.

---

## Items

### 12. Follow stories — locked spec
**The unit being followed:** the **story (slug)**. Not articles, not events, not timelines — the whole story. One Follow row per user per story.

**Behavior:**
1. User taps Follow on a story → one row added to their Following list.
2. A new article gets stamped with that `story_id` (i.e. a new event lands on that story's timeline) → the row shows an unread dot + the user gets an in-app notification.
3. User taps the row → lands on **the most recent article on that story's timeline**. Unread dot clears on tap.

**Mental-model tree:**
```
Story (slug)               ← the thing you follow
├── lifecycle_status, title
└── Timeline               ← list of events on this story
    ├── Event 1 (article)
    ├── Event 2 (article)
    └── new events appended over time → drives the unread dot
```

Articles are stamped with `story_id`. Following the slug = following everything that lands inside it.

**Phase 2 (diagnostic) findings:**
- DB: no `story_follows` table exists. `bookmarks` is per-article (wrong unit). `follows` is user-to-user. `notifications` table has full unread infra (`is_read`, `read_at`) — reusable. `stories` and `timelines` tables exist; `articles.story_id` FK exists.
- Web: launch-hidden `/following/page.tsx` exists but infers follows from `reading_log` (wrong). No "Follow story" button anywhere.
- iOS: `BookmarksView` currently routed for the `.following` tab (wrong content). A parallel launch-hidden `FollowingView.swift` exists, also reading_log-based. No "Follow story" button.
- Notification + realtime infra (used by messages) is the unread-state precedent to borrow.

**Phase 3 — implementation scope (sized, no work started yet):**
1. New `story_follows` table: `(user_id, story_id, followed_at, last_seen_at)` + RPC for toggle + index.
2. New API: `POST /api/story-follows` (toggle), `GET /api/story-follows` (list user's follows).
3. "Follow story" button on the story page (web + iOS). Replaces the per-article Save heart in the unified concept.
4. Web: rewrite `/following/page.tsx` to query `story_follows` joined to `stories`, with a per-row unread dot (newest article on the story has `published_at > follow.last_seen_at`).
5. iOS: route the `.following` tab at `FollowingView.swift` (not `BookmarksView`); rebuild `FollowingView` to mirror web.
6. Realtime: subscribe to `articles` INSERT events filtered by user's followed story_ids → update unread dot live.
7. Notification on new article in followed story: write a `notifications` row (in-app channel only per owner direction).
8. Cross-platform: web + iOS. Kids = needs owner call on whether kids can follow stories.
9. Existing `bookmarks` table data: needs owner call — convert article-level saves to story follows (one follow per unique story_id), or leave dormant and start fresh.

**Owner answers (2026-05-08):**
- Kids: yes, in scope.
- Existing bookmarks: ignore — all seeded data, no real-user value to migrate.
- Button label: "Follow."

**Phase 3 shipped (2026-05-08):**
- DB: `story_follows` table + RLS + `toggle_story_follow` and `mark_story_seen` RPCs + `articles_fanout_story_follow_notifications` triggers (INSERT path + draft→published UPDATE path) writing in-app notifications with story-slug deep-links.
- API: `web/src/app/api/story-follows/route.js` — POST (toggle) / GET (list with unread + latest article) / PATCH (mark seen) / DELETE (explicit unfollow). Auth-gated, rate-limited.
- Web UI: `FollowStoryButton` replaces `BookmarkButton` (deleted) on the article reader. `/following/page.tsx` rewritten to query `story_follows` with unread dots + latest-article previews + tap-to-mark-seen.
- iOS main: `.following` tab swapped from `BookmarksView` to `FollowingView` (rewritten end-to-end). `StoryDetailView` Save button replaced with Follow button gated on `story.storyId`. State load via task; toggle via API.
- Kids iOS: data layer is universal (table + API + RLS work for kids) and `KidArticle` now decodes `story_id`. **Kids UI surfaces deferred** — adding a Follow button without a Following list is a half-affordance, and kids' fixed 4-tab bar needs a design pass before a Following destination lands. Filed as item 12-kids for a separate batch.

**Status:** shipped (web + main iOS). Kids UI = follow-up.

---

### 13. Article summaries on main page — never truncate, but keep length bounded
**Page / screen:** main page article cards (web home + iOS feed + kids feed where summaries render)
**What owner sees:** summaries getting clamped/truncated on the main page; on smaller viewports the layout looks crunched
**What should change:**
- Summary always renders in **full** on the main page — no line clamp, no "show more" gate.
- Summary copy itself must be **bounded short enough** that on every viewport (mobile, tablet, desktop) the card doesn't look cramped or crunched.
- Implies a content rule (max-length on summary at write/AI-generation time) plus a UI rule (no clamp).

**Owner note (2026-05-08):** max length = TBD. Will set when Phase 2 surfaces sample distribution + breakpoint behavior.

**Phase 2 (diagnostic) findings — 2026-05-08:**

(a) **Where summaries currently truncate.** Adult summary lives on `articles.excerpt`; kid summary on `articles.kids_summary`.
- Web home `web/src/app/page.tsx`: 5 clamp sites — hero cards `WebkitLineClamp: 4` (lines 717, 825); standard cards `WebkitLineClamp: 2` + `maxHeight: 3.15em` Firefox fallback (lines 976, 1067, 1118).
- Web category `web/src/app/category/[id]/page.js:638`: title 2-line clamp + a hard 60-char string slice on excerpt (`excerpt.slice(0, 60) + '…'`).
- iOS main `VerityPost/VerityPost/HomeView.swift:432-438` (standard card): `.lineLimit(2)`. Hero card at `:368-374` is **already untruncated** (`fixedSize` only).
- Kids iOS `VerityPostKids/VerityPostKids/ArticleListView.swift:147-152`: `.lineLimit(2)` on `kids_summary ?? excerpt`.

(b) **Generation source + length bound.** Excerpts are AI-generated, not admin-written. Two prompts target slightly different lengths — divergence worth normalizing:
- `web/src/app/api/admin/pipeline/generate/route.ts:1684` — "EXACTLY 3 sentences, 40–60 words total."
- `web/src/lib/pipeline/editorial-guide.ts:854, 1184` — "2–3 sentences, 30–50 words. Fixed target."
- The persisted column is `articles.excerpt` (no `summary` column despite its name in the prompt), set at `generate/route.ts:2564`.
- Source-fed excerpts (RSS / scrape paths) cap at 3000 chars (`scrape-discovery.ts:39`, `scrape-json.ts:40`) but those raw values are not used directly on the home cards — generation rewrites them.

(c) **Sample distribution (4 published articles in prod DB).**

| metric | chars |
|---|---|
| min | 266 |
| p50 | 311 |
| avg | 329 |
| p90 | 394 |
| p95 | 411 |
| p99 | 425 |
| max | 428 |

40-60 words ≈ 240-360 chars in English, so most rows land in spec; the 425-char tail suggests a few prompts overshoot. `kids_summary` is currently empty across the 4 published rows.

(d) **Breakpoint reality at current 30-60-word generation target.**
- Standard card content width is ~280px on a 320px mobile viewport, which fits ~30 chars per line at the existing 14px serif. A 311-char p50 excerpt wraps to ~10 lines on mobile, ~6 on tablet, ~4 on desktop.
- The 2-line web clamp + iOS `lineLimit(2)` therefore drop ~80% of summary text on a small phone today. Cards look "crunched" because the clamp + the excerpt size are mismatched, not because the excerpt is too long in absolute terms.

**Recommendation for the owner's max-length call.**

The cap has to satisfy two things at once: (1) the smallest mobile card stays the height the owner wants without truncation, (2) the line is still useful information.

| target | chars | mobile lines | desktop lines | feel |
|---|---|---|---|---|
| label | 60-90 | 2-3 | 1 | Drudge-ish one-liner |
| **tight** | **100-140** | **3-4** | **1-2** | **fits typical card without crunching** |
| current | 240-360 | 8-12 | 4-6 | requires clamp |

If the goal is "card never truncates and never looks crunched on a 320px viewport," **100-140 chars (≈ 18-22 words, 1-2 sentences)** is the realistic ceiling. Loosen to 160-180 if owner wants a bit more breathing room and accepts a 4-line block on the smallest screens.

To ship, the work splits into:
- **Content rule:** rewrite both AI prompts (`generate/route.ts:1684` and `editorial-guide.ts:854/1184`) to target the new word/char count, single source of truth.
- **UI rule:** delete the `WebkitLineClamp` styles on `page.tsx` (5 sites), drop the `slice(0, 60) + '…'` on `category/[id]/page.js:638`, drop iOS `.lineLimit(2)` in `HomeView.swift:432` + `ArticleListView.swift:147,151`.
- **Backfill:** existing 4 articles' excerpts run through the new shorter prompt (or get manually trimmed since the dataset is tiny).

**Owner pick (2026-05-08):** tight (100–140 chars / 18–22 words / 1–2 sentences).

**Phase 3 shipped (2026-05-08):**
- AI generation prompt at `web/src/app/api/admin/pipeline/generate/route.ts:1684` rewritten to "1–2 sentences, 18–22 words total (target ≈120 characters)" with a 25-word / 160-char ceiling and 12-word floor.
- `web/src/lib/pipeline/editorial-guide.ts` — adult, kids, and tweens deck rules all rewritten to the same tight target. Stale "30–50 words" / "40–60 words" / "2–3 sentences" copy removed end-to-end.
- Web home `web/src/app/page.tsx` — 5 `WebkitLineClamp` blocks deleted (hero ×2, standard ×3 + Firefox `maxHeight: 3.15em`).
- Web category `web/src/app/category/[id]/page.js:646-650` — `excerpt.length > 60 ? slice(0, 60) + '…'` replaced with `story.excerpt || ''`.
- iOS main: `HomeView.swift` standard card + the 2 secondary-list excerpts at lines ~1307 + ~1571 — `.lineLimit(2)` removed. `FindView.swift:386` — same.
- Kids iOS: `ArticleListView.swift:147-152` — `.lineLimit(2)` on summary removed (title-clamp above intentionally kept).
- DB backfill: 4 published articles' `articles.excerpt` rewritten in-place to land 108–134 chars (down from 266–428).

**Reviewer post-impl pass (2026-05-08):** caught 4 holes (HomeView.swift secondary-list `.lineLimit`, FindView.swift `.lineLimit`, stale kids LENGTH paragraph in editorial-guide); all fixed before commit.

**Status:** shipped.

---

<!-- Format per item:

### N. Short title
**Page / screen:** (web URL, iOS screen name, kids screen name)
**What owner sees:**
**What should change:**

— Phase 2 (diagnostic) —
**Current code state:**
**Downstream effects:**
**Recommended fix:**

— Phase 3 (implementation) —
**Reviewer A:**
**Reviewer B:**
**Pressure test:**
**Adversary (post-impl):**
**Claude confirm:**

**Status:** flagged / diagnosed / approved / shipped

-->
