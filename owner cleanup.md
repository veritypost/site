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

### 2. Remove "Alerts" + rename "Saved" → "Following stories"
**Page / screen:** nav (web top + iOS bottom tab + iOS profile)
**What owner sees:** "Alerts" entry point and "Saved" entry point in nav
**What should change:**
- **Alerts** — remove entirely (web + iOS).
- **Saved** — do NOT remove. Owner clarification (2026-05-08): bookmarks concept is gone; this surface is "Following stories" (or similar). Rename label, reroute to a page that lists all stories the user is following. See item 12 for the destination page itself.

— Phase 2 (diagnostic) —
**Current code state:**

*Alerts:*
- Web: `web/src/app/NavWrapper.tsx:622-644` — top-bar Alerts link → `/notifications`
- iOS: `VerityPost/.../ProfileView.swift:882` — `quickLink(label: "Alerts", ...)` in profile "My stuff"
- Kids iOS: not present (n/a)

*Saved (→ to be renamed Following):*
- Web: `NavWrapper.tsx:381` — nav item `{ label: 'Saved', href: '/bookmarks' }`
- iOS: `ContentView.swift:482` — `Item(id: .following, label: "Saved")` in MainTabView (already uses `.following` ID internally — only the label is wrong)
- iOS: `ProfileView.swift:511` — `quickActionChip(icon: "bookmark.fill", label: "Saved")`
- iOS: `ProfileView.swift:893` — `quickLink(label: "Saved", ...)`
- Kids iOS: not present (n/a)

**Cross-platform scope:** web + iOS for both. Kids n/a.

**Downstream effects:**
- Removing Alerts: `/notifications` route (`web/src/app/notifications/page.tsx`) and iOS `AlertsView` become unreachable from the UI but remain in the codebase. Owner decides whether to delete the route + view or leave them orphaned.
- Renaming Saved: web destination is `/bookmarks` route + page; iOS destination is `BookmarksView()`. These need to be reworked into a "Following stories" page (item 12 covers this). The string "Saved" + bookmark iconography appears in 4 spots that all need to flip together.

**Open questions for owner:**
1. After removing Alerts entry points, do we also delete `/notifications` route + `AlertsView`, or leave them as orphans?
2. For the Saved → Following rename: keep route at `/bookmarks` for now or rename to `/following` (URL change has SEO/redirect implications)?

**Recommended fix shape (Alerts):** delete the link blocks at the four locations above; decide on route/view fate per Q1.

**Recommended fix shape (Saved → Following):** rename label in 4 spots (Web NavWrapper:381, iOS ContentView:482, ProfileView:511 + 893); swap bookmark icon for follow/heart-style icon; the destination page itself is item 12.

**Status:** diagnosed — needs owner answers on Q1 + Q2 before Phase 3

---

### 4. Timeline placement on article page (web)
**Page / screen:** article page — web only (n/a iOS / kids — confirm in Phase 2)
**What owner sees:** timeline is not to the right of the article body
**What should change:** move timeline to the right of the article

— Phase 2 (diagnostic) —
**Current code state:**
- `web/src/app/[slug]/page.tsx:365-372` passes `timelineSlot` (TimelineSection) into `ArticleReaderTabs`.
- `web/src/components/article/ArticleReaderTabs.tsx:62-83` renders `[data-reader-body]` as a single block: `[data-reader-main]` (article) and `[data-reader-panel="timeline"]` stacked.
- `web/src/app/globals.css:660-677` is single-column desktop (`display: block`, `max-width: 760px`); timeline = `display: block; margin-top: 40px` → renders **below** the article.
- Comment at globals.css:579-583 explicitly notes the right rail was killed in TODO-38 ("the timeline now flows below the article instead of a side rail").
- Timeline component: `web/src/components/article/TimelineSection.tsx:1-201`. Data fetched at `[slug]/page.tsx:182-185` from `timelines` table (scoped by `story_id`).

**Cross-platform scope:**
- **Web:** in scope (timeline currently below article)
- **iOS:** n/a — `StoryDetailView.swift:81` already shows timeline as a separate tab (gated by `canViewTimeline`)
- **Kids iOS:** n/a — `KidReaderView.swift` has no timeline at all (text-only reader)

**Open question for owner before Phase 3:**
"Right of article" means restoring the 75/25 split that TODO-38 removed. Want to confirm: restore that exact layout (article ~680px + sticky timeline ~300px right rail on desktop ≥1024px, tabbed UI staying on mobile)? Or a different layout (e.g., overlay, drawer)?

**Recommended fix shape (assuming 75/25 restore):**
- `web/src/app/globals.css` — change `[data-reader-body]` from block to grid (`grid-template-columns: 1fr 300px` ≥1024px); make timeline sticky.
- `web/src/components/article/ArticleReaderTabs.tsx` — keep tabbed UI for mobile; suppress timeline tab on desktop where right rail shows it.
- No data, schema, or component-rewrite changes.

**Status:** diagnosed — needs owner answer on layout question before Phase 3

---

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

### 10. 404 page redesign
**Page / screen:** 404 / not-found page (web first; iOS + kids equivalents confirmed in Phase 2)
**What owner sees:** current copy talks about the link being out of date / article moved or removed; offers a "browse categories" button alongside the home button
**What should change:**
- Tone: nonchalant and a little fun — drop the "link may be out of date / article moved or removed" framing
- Single button only: back to today's front page (home)
- Remove the "browse categories" button

— Phase 2 (diagnostic) —
**Current code state — two 404 pages on web:**
- `web/src/app/not-found.js:29-61` (root 404). Heading "404"; body copy line 34: *"The link may be out of date, or the article may have been moved or removed."* Two buttons (line 48 + 51): "Today's front page" → `/`, "Browse categories" → `/` (both currently point to the same URL).
- `web/src/app/[slug]/not-found.tsx:24-38` (article 404). Heading "Article not found." Same body copy. Same two buttons.

**iOS:** no formal 404 screen. `StoryDetailView.swift:1926-1932` silently fails on missing article (no UI). Profile-not-found shows a small inline error state. So "404 redesign" on iOS = build a proper not-found state, not redesign existing.

**Kids iOS:** no 404 / not-found state at all.

**Cross-platform scope:**
- Web: redesign both files.
- iOS: build a not-found state in `StoryDetailView` (and `PublicProfileView` if profile 404s should match).
- Kids iOS: build a kid-appropriate not-found state.

**Open question for owner:** scope iOS + kids in this item, or only web for now?

**Recommended fix shape (web):**
- Edit both not-found files: replace body copy (owner writes copy — direction: nonchalant, light); reduce to a single CTA "Back to today's front page" → `/`; delete the "Browse categories" button.

**Recommended fix shape (iOS + kids):** build new not-found state components matching the web tone — depends on owner's scope answer.

**Status:** diagnosed — needs owner answer on iOS/kids scope + final copy before Phase 3

---

### 11. Footer cleanup — too many legal/policy links
**Page / screen:** global site footer (web)
**What owner sees (2026-05-08 clarification):** "all the links like t&cs and pp & dmca there's just a ton there"
**What should change:** trim/reorganize the footer link cluster.

— Phase 2 (inventory) —
**The footer the agent missed earlier**: it's actually in `web/src/app/NavWrapper.tsx:490-587`, gated by `SHOW_FOOTER` (line 145). 14 links + 1 "Cookie preferences" button:

*Product (3):* About · How it works · Pricing
*Trust (2):* Editorial standards · Corrections
*Support (2):* Help · Contact
*Legal/privacy (7):* Privacy · Kids Privacy · Your California Privacy Rights · Do Not Sell or Share My Personal Information · Terms · Cookies · Accessibility · DMCA
*Plus:* "Cookie preferences" (re-opens the consent banner)

**The compliance constraint** (from the comments in NavWrapper.tsx): most legal/privacy links are required for AdSense + Apple reviewer signals, COPPA, CCPA, ePrivacy, and DMCA safe harbor. Few of those can be cut outright; they can be **consolidated into one "Legal" page** that links to all sub-policies internally. Apple's Support URL requirement = `/help` must stay reachable.

**Owner direction (2026-05-08):** keep only what's legally obligated in the footer; relocate everything else.

**Strictly legally/policy-mandated (must stay reachable from every page):**
- **Privacy** — required by GDPR, CCPA, COPPA baseline.
- **Kids Privacy** — required by COPPA for any site with users under 13.
- **California Privacy Rights** — required by CCPA.
- **Do Not Sell or Share My Personal Information** — required by CCPA when AdSense rolls out (selling/sharing personal data).
- **Terms** — required as the binding legal contract surface.
- **Cookies** — required by ePrivacy Directive (EU) for cookie disclosure.
- **DMCA** — required to claim DMCA safe harbor protection from copyright liability.
- **Accessibility** — strongly recommended (ADA litigation exposure if missing). Industry-standard footer link.
- **Cookie preferences button** — required by ePrivacy to allow consent withdrawal.

**Apple-mandated (not legal-legal, but required to ship the iOS app):**
- **Help** — App Store Connect requires a Support URL. Must stay reachable.

**Not required by anyone (can be moved):**
- About, How it works, Pricing, Editorial standards, Corrections, Contact.

**Recommended fix shape — what the footer becomes:**
A single tight legal-strip — small muted text, all on one line on desktop, wraps on mobile:
> Privacy · Kids Privacy · California Privacy · Do Not Sell · Terms · Cookies · DMCA · Accessibility · Cookie preferences

That's 9 items, all required. Help stays via the top nav (it's a support entry point, not a legal one).

**Where everything else goes — open for owner direction:**
- About + How it works + Pricing → top nav (where they belong as discovery/conversion entry points), or a "More" menu in the top bar.
- Editorial standards + Corrections → either inside the About page as embedded sections, or stay as separate pages linked from About.
- Contact → could fold into Help (single support surface), or stay separate inside About.

**Open question for owner:** for the relocated items (About / How it works / Pricing / Editorial standards / Corrections / Contact), do you want them in the top nav, behind a "More" menu, or merged into the About page? Top nav is simplest if there's room.

**iOS / kids iOS:** n/a (Apple-mandated Terms/Privacy on subscription/parental-gated screens stays as-is).

**Status:** diagnosed — needs owner direction on where the relocated items go

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
