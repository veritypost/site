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

### 6. Tags feel bulky — visual cleanup
**Page / screen:** wherever tags render across the product
**What owner sees (2026-05-08 clarification):** "it's just kinda bulky" — visual weight, not specific tags. Polish, not deletion.
**What should change:** reduce visual weight of tag chips/pills wherever they render. Smaller text, tighter padding, fewer per row, maybe muted by default with hover-up.

— Phase 2 (inventory of tag surfaces) —
- **Comment-tag pills** (web `CommentRow.tsx:1333-1361`, iOS `StoryDetailView.swift:4357-4376`): currently `context` / `cite_needed` / `off_topic` — chunky chips in the action row. (Per item 5, `helpful` heart is being removed.)
- **Article tag row** (linked via owner memory `feedback_no_color_per_tier`): tags appearing on article cards / detail headers — should grep further.
- **Category chips** on home / browse pages.
- **Leaderboard fixture** (`web/src/app/redesign/leaderboard/page.tsx:40-47`): defines tag colors, not currently rendered live.
- **Kids iOS:** no tag UI (intentional, leave alone).

**Recommended fix shape:** treat as a single design-polish pass — pick one chip size + one weight + one muted color, apply uniformly across all surfaces. Remove redundant chip backgrounds where the text alone reads. Owner memory `feedback_no_color_per_tier` already prohibits color-per-tier — so single muted color throughout.

**Status:** scoped as visual polish — needs Phase 2 deeper grep of article + browse pages before Phase 3 gets a concrete diff

---

### 7. Updating own comment blocked by "only the comment author can post follow-ups"
**Page / screen:** comments — owner attempted to update their own comment (web; confirm iOS + kids in Phase 2)
**What owner sees:** error message: *"only the comment author can post follow-ups."*
**What should change:** the author should be able to update their own comment without hitting that error. Phase 2 needs to determine whether (a) the author check is broken, (b) edit is being misrouted as a follow-up, or (c) the gate is intentional and the UI is wrong to expose an edit affordance.

— Phase 2 (diagnostic) —
**System design (TODO-48):** comments are non-editable. The author can append up to 2 short "follow-up" notes. Two endpoints: `PATCH /api/comments/[id]` (edit, not currently used) vs. `POST /api/comments/[id]/followups` (the followup append). Error string lives at `web/src/app/api/comments/[id]/followups/route.js:72-76`, mapped from the `create_comment_followup` RPC.

**Agent's three hypotheses:**
- (a) Author check buggy → ruled out: error only fires when caller ≠ author, so the check itself is correct.
- (b) Edit misrouted as followup → ruled out: web and iOS have separate edit/followup state and endpoints.
- (c) UI exposes the affordance to non-authors → confirmed on iOS: `StoryDetailView.swift:2500` "Add an update" button is **not gated on isOwner**, so any viewer taps it and gets 403. Web is correctly gated at `CommentRow.tsx:1035`.

**But:** owner's report ("I try to update my comment") implies owner IS the author and still got 403. That contradicts the agent's read. Two possibilities the agent didn't fully resolve:
1. Owner clicked "Add an update" on someone else's comment, expecting it to edit theirs (UI confusion). On iOS this is the missing-gate bug.
2. Owner is the author, the gate is correct, but the RPC is comparing `auth.uid()` against a `user_id` that doesn't match — possibly because admin@veritypost.com has multiple permission rows and the comment was authored under a different row.

**Cross-platform scope:** web (correctly gated, but owner reports issue), iOS (UI gate missing — definitive bug). Kids n/a.

**Owner clarification (2026-05-08):** "author" = the person who wrote the comment, and they want to *edit* their comment. So this is a design change, not a bug — the current system intentionally blocks edits and only allows follow-up appends, but owner wants real editing.

**Reframed scope:**
- Allow the comment author to edit their own comment text (not just append follow-ups).
- TODO-48's "non-editable + follow-ups only" design is being reversed for the author.

**Open questions for owner before Phase 3:**
1. Keep follow-ups as a separate feature alongside edit, or kill follow-ups entirely now that edit is back?
2. Show an "edited" indicator + edit timestamp on edited comments? (Standard for comment systems — keeps trust intact.)
3. Edit window — unlimited time, or only within N minutes of posting?

**Recommended fix shape (assuming edits enabled, follow-ups stay, "edited" indicator on, no time limit):**
- Server: enable the existing `PATCH /api/comments/[id]` endpoint (likely already exists since the architecture distinguishes edit vs. followup). Verify RPC + RLS allow author update.
- DB: add `edited_at` (or `updated_at`) timestamp on comments if not already there.
- Web: wire `CommentRow.tsx` edit composer (variables `editing`/`editBody` already at line 266-267 — UI partially built).
- iOS: wire `editingCommentId` flow in `StoryDetailView.swift:2100`.
- UI: render "edited" pill + timestamp on edited comments across web + iOS.

**Status:** reframed as design change — needs owner answers on Q1-Q3 before Phase 3

---

### 12. "Following stories" page — list all followed timelines
**Page / screen:** the menu/section that lists what the user is following (formerly Saved / bookmarks; see item 2)
**What owner sees:** the page should show every story the user is following.
**Concept (owner clarified 2026-05-08):** "following a story" = following its **timeline**. When a new article is appended to that story's timeline, the user sees it appear in their Following feed. This is a notification-like subscription, not a save-for-later bookmark.

**What should change:**
- The page lists every **story timeline** the user is following.
- Each entry shows the story's headline + last-updated indicator + new-article count since last visit.
- New articles appended to a followed timeline trigger an unread-state on the entry (and possibly a push, scope TBD).
- Bookmarks framing is fully retired — labels, icons, and component names flip.

**Owner direction (2026-05-08):** when a new article lands on a followed timeline, the entry on the Following page shows a small unread dot. No push/email for now — in-app unread state only. ("I feel like we can do something else there as well" — owner is open to layering more on later, but unread-dot is the v1.)

**Phase 2 still needs to confirm:**
- Data model: does a `story_follows` table already exist, or are we currently using bookmarks rows? Need a grep pass before Phase 3.
- Where the "follow this story" affordance lives today (article header? timeline header? somewhere on the story page?). The follow trigger has to be paired with this destination, so I need to find or build it.
- iOS + kids parity: standard cross-platform — port the unread-dot to iOS Following tab; kids n/a unless owner wants kids to follow story timelines too.

**Status:** concept + v1 behavior locked — Phase 2 diagnostic still pending on data model + follow-affordance source

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
