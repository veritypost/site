# Search, Browse & Categories — Index

**Last updated:** 2026-04-29 (session 6 — Wave 1 confirmed shipped; owner decisions locked; Wave 2 unblocked)
**Phase:** execution
**Next session should pick up:** Wave 2 — three independent items, all unblocked: (2a) admin is_featured removal + DB column drop, (2b) web home edition model, (2c) breaking strip permission restructure. Apply 6-agent ship pattern per memory.

---

## Slice status

| # | Slice | Status | Last touched | Slice doc |
|---|---|---|---|---|
| 01 | Home | **locked** | 2026-04-29 | `slices/01-home.md` |
| 02 | Browse | **locked** | 2026-04-29 | `slices/02-browse.md` |
| 03 | Navigation & Discovery System | **locked** | 2026-04-29 | `slices/03-navigation-discovery.md` |
| 04 | Search (interaction mechanics) | **not-started** | 2026-04-29 | — |

**Default ordering:** home → browse → categories → search. Owner can redirect.

**Blocked-by:** Nothing. Slice 04 unblocked. Structural questions resolved through Slices 01–03. Slice 04 scoped to search interaction mechanics within Browse — the navigation shape that hosts search is now locked.

---

## Foundation status

| Doc | Status |
|---|---|
| `README.md` | ✓ written 2026-04-29 |
| `00-system-map.md` | ✓ written 2026-04-29 |
| `SESSION_LOG.md` | ✓ written 2026-04-29 (session 1 entry) |

---

## Structural questions (must answer before affected slice locks)

**Answered in Slice 01:**
- ✓ **Personalization scope** — home feed never personalized. My Feed is a future program. `user_preferred_categories` schema kept, not populated.
- ✓ **Two-tier breaking news** — strip open to all, article gated. Paid perk = proactive push/email alerts.

**Still open:**

1. **Two-tier search — intentional gate or temp scaffolding?** Free users get title ILIKE only; paid users get full-text on title + excerpt + body. Slice 04 must decide whether this is a long-term monetization lever or placeholder gating — different designs.

2. **Tags — real surface or drop?** `articles.tags` is populated but nothing reads it. Slice 04 should decide: build a tags surface in search, keep as metadata-only, or drop the column.

**Resolved in Slice 03 (Navigation & Discovery):**
- ✓ **Subcategory hierarchy** — surfaced in Browse via category tiles → category section front with subcategory chips. No separate subcategory page.
- ✓ **Story-level grouping** — Browse shows story containers, not individual articles. Category pages (accessed from Browse) show story containers too.
- ✓ **`is_featured` fate** — column has no consumer after browse's featured strip dropped. Execution should drop it.
- ✓ **Personalization scope** — home never touched (locked Slice 01). Browse is where category-follow affordance lives. My Feed is a named future program.
- ✓ **Trending** — filter pills dropped from browse (Slice 02). `view_count` used only for Trending sort within category pages. Not a browse-level signal.

---

## Cross-slice findings

- **Top Stories schema (home → execution):** `hero_pick_for_date` is superseded by a pinned top-stories stack. New schema needed in execution program — exact approach (new table vs. pinned-positions column on articles) TBD.
- **Nav tab rename (home → execution):** "Home" tab → "Today". Same screen, stronger editorial framing. All code references to a home tab label need updating.
- **`is_featured` is fully dead** — browse dropped the featured strip (Slice 02). Slice 03 confirmed no repurpose. Execution: drop the column.
- **`home.breaking_banner.view` permission restructure needed** — currently gates strip visibility. In execution: strip becomes all-users, paid gate moves to proactive alert delivery.
- **Web category page exists** — `web/src/app/category/[id]/page.js`. Route handles both UUID and slug lookup. Three bugs to fix in execution: missing `stories(slug)` join (article links broken), no visibility filter, dead "Top Contributors" sidebar.
- **Browse shows story containers, not articles** — this is the sharpest design distinction from competitors. Execution must build a story container card component for Browse (headline, lifecycle status, "N articles · N days in", reader progress, quiz indicator). This is new UI, not a refactor of existing article cards.
- **Following tab needs reading_log + stories join** — Following shows stories with status ≠ Resolved that the reader has engaged with (read ≥1 article OR passed ≥1 quiz). The query needs `reading_log`, `stories`, and `story_articles` at minimum. Schema compatibility should be verified before execution starts.
- **Depth selector placement** — persistent below masthead on Today screen. Not in settings. Not per-article. Session-level. Execution must wire this to actual depth-variant article content delivery.
- **Quiz gate connects to discussion section** — quiz completion unlocks a comment composer. The discussion section itself hasn't been designed. This is a dependency for the execution program.
- **Family cross-band feature** — one line on adult StoryDetailView. Requires: (a) `reading_log` has `kid_profile_id` populated, (b) `feed_clusters` has `primary_kid_article_id`. Verify both columns exist before execution. The `suggested_article_id` write to the kid profile row is new.
- **Following ↔ timeline feature** — the Following tab is the navigation expression of the article-lifecycle timeline. Slice 05 of the article-lifecycle program (timeline content feature) and this slice's Following tab execution must be coordinated. They share data model and editorial concept.
- **Article reading experience undesigned** — navigation gets readers to the door. The reading experience itself (sources inline, timeline rendering within article, depth transition animation, quiz-to-discussion flow) is unaddressed. This is the first priority after these four slices are execution-ready.
- **Search = first-class discovery** — search is the primary "I know what I want" path. Slice 04 must treat it as first-class, not utility. The always-open search bar in Browse is a commitment to that posture.

---

## Open owner-questions

*(Populated during slice Q&A sessions.)*

---

## Execution program — wave plan (session 5, 2026-04-29)

Planning program suspended. Owner moved to execution. Slice 04 (Search) deferred — to be picked up in a future planning or execution session once Waves 1–4 are shipped.

**Wave 1 — SHIPPED. Commit `1f2498e`.**
- 1a: Web browse featured strip removed. ✓
- 1b: Web category page — stories(slug) join, visibility filter, article href fix, sidebar removed. ✓
- 1c: iOS BrowseLanding kids filter. ✓

**Wave 2 — after Wave 1, mostly parallel.**
- 2a: DB migration — `ALTER TABLE articles DROP COLUMN is_featured` (after Wave 1a removes all consumers).
- 2b: Web home — add `.gte('published_at', today.startUtc)`, cap to 12, add edition end state, add "X of 12 read today" counter.
- 2c: Web + iOS — breaking strip permission restructure (strip to all users, paid gate = alerts only).

**Wave 3 — schema. Owner decisions LOCKED 2026-04-29.**
- 3a: Add `lifecycle_status text NOT NULL DEFAULT 'developing'` to stories.
- 3b: Create `top_stories` table (new table — owner confirmed).

**Wave 4 — after Wave 3.**
- 4a: iOS tab bar: Today | Browse | Following | Profile (ContentView.swift full restructure).
- 4b: Badge on Today tab icon, AlertsView opens as a tray/sheet (owner confirmed).
- 4c: Web home edition completion.

**Wave 5 — after Wave 3+4.**
- 5a: FollowingView (new Swift screen — reading_log → story_id join, lifecycle_status filter).
- 5b: Browse tab redesign (search-merge interaction, story containers component, past editions section).

**Wave 6 — after Wave 3b+4.**
- 6a: Top Stories admin + home rendering (web + iOS).
- 6b: Today screen typographic redesign (depth selector, lifecycle markers on cards).

**Owner decisions LOCKED 2026-04-29:**
1. `top_stories` schema: **new table**.
2. Notifications/alerts tray: **badge on Today tab icon, opens a tray. Not a tab, not in Profile.**

---

## Deferred items (named, intentional)

- **My Feed surface** — explicit category preferences, depth-first curation, non-exclusionary. Trigger: 500+ MAU, 600+ articles, 8+ consistent categories. Future program.
- **Cross-device read-state sync (iOS)** — reading_log query on iOS home load to match web's cross-device read-state. Ship local UserDefaults first; sync in a follow-up.
- **Top stories schema design** — deferred to execution program. `hero_pick_for_date` superseded but exact replacement model TBD.
- **Push/email breaking alert delivery** — paid-tier perk for proactive breaking news. Implementation detail for execution.
- **Discussion section design** — comment composer + thread design unlocked by quiz pass. Not designed yet. Dependency for quiz gate execution.
- **Past editions calendar design** — the "See all editions" surface inside Browse. Dated list / calendar navigation of all sealed past editions. Not detailed yet.
- **iOS kids app discovery surface** — kids tab bar stays as Home | Ranks | Experts | Me. Kids does not get a Following tab at this stage. Separate consideration.
- **Notification tray design** — lives inside Profile or as a pull-down. Not designed. Execution detail.
- **Rankings section design in Profile** — separated from reading record, measures breadth and editorial range across categories over time. Not designed in detail. Execution.
- **Depth selector exact copy** — labels for Adult / Tween / Kids (or better framing that avoids intellectual hierarchy). Polish pass.
- **Animation curves and spring parameters** — 220ms spring for search-merge, 150ms for depth transition. Exact easing values are execution.
- **`family_suggestions` table schema** — for "Send to kids app" write path. Execution.
