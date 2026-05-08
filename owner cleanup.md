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

**Status:** flagged — Phase 2 diagnostic pending. Needs to confirm: (a) where summaries currently get clamped (CSS line-clamp on cards?), (b) whether summaries are admin-written or AI-generated and where the generation prompt/length bound lives, (c) sample distribution of existing summary lengths, (d) sample-renders at mobile / tablet / desktop breakpoints to inform owner's max-length pick.

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
