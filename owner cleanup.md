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
