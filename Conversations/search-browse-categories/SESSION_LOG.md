# Search, Browse & Categories — Session Log

Append-only chronological log. Most recent at the bottom. Each entry: date, phase, what happened, what got locked, what's blocked, what next session picks up.

---

## Session 1 — 2026-04-29 — Foundation

**Phase entering:** 0 (no artifacts).
**Phase leaving:** 1 (foundation locked, no slice started).

**What happened.** Program started cold. The `article-lifecycle` program was used as the format reference — its discipline rules, session log narrative style, and slice doc shape are the model. An Explore agent investigated the full search/browse/categories/discovery surface across web, iOS adult, iOS kids, and Supabase migrations.

Investigation covered: browse page, search (web + API), category schema and hierarchy, home feed (web + iOS), tags, admin newsroom (user-facing discovery absent — admin only), iOS browse and CategoryDetailView, iOS kids discovery, pagination model, trending/featured, related articles/Up Next, relevant DB schema, and known gaps.

**What the investigation found (high-level):**

The surface is larger and more fragmented than it looks from the outside. There are four distinct areas with real gaps between them:

**Home** is functional and consistent between web and iOS — hero pick via `hero_pick_for_date`, 20 articles, breaking strip, read-state dimming. But it is editorially manual (one admin sets the hero per day) with no ranking or personalization beyond which articles were read. `user_preferred_categories` exists in the DB and is never touched.

**Browse** is partially built. The category grid and per-category article counts work. But filter pills (Most Recent / Most Verified / Trending) are dead code — T111, commented out, never wired. There's no pagination (hard 500-article limit). The featured label logic (`hasEditorPick`) was coded but the label was never rendered (S7-A107). `view_count` is incremented on page load but never queried in browse. iOS browse parallels web reasonably well but via different queries.

**Categories** have a two-level hierarchy (`parent_id`) that is completely unexposed anywhere — no subcategory surfacing in browse, search, iOS, or admin. The `category_density` column exists and is never read. Category pages (`/category/<slug>`) are referenced as link destinations in the browse page but the page component does not exist in web. iOS has a fully functional `CategoryDetailView`. This is the biggest user-visible gap: clicking a category on web goes nowhere.

**Search** is gated by tier: free users get title ILIKE only, paid get full-text on `search_tsv` (title + excerpt + body). Advanced filters (category, subcategory, date range, source publisher) are all paid-only. No pagination — hard 50-result limit. iOS FindView exists behind the home magnifier but its internals weren't surfaced in the investigation. Kids search: not found in the kids app.

**Dead schema worth noting:** `articles.tags` (populated, never read), `articles.view_count` (incremented, never queried for ranking), `user_preferred_categories` (table exists, never populated), `categories.category_density` (column, never read).

**Structural questions surfaced.** Five questions that cross slice boundaries were identified and logged in `INDEX.md` — they must be answered before the affected slices lock. Most important: the category FK after the stories-as-containers migration (articles have `category_id`, stories don't — which wins?).

**What got locked.**
- Foundation artifacts: `README.md`, `INDEX.md`, `SESSION_LOG.md`, `00-system-map.md`.
- Slice ordering default (home → browse → categories → search). Owner can redirect.
- The five structural questions are documented in `INDEX.md` — not answered, but captured so they don't surface mid-program.

**No design decisions were made.** This session is understanding only.

**What's blocked.** Nothing. All four slices are unblocked. The structural questions should be surfaced in the Slice 01 (Home) Q&A before the browse and categories slices commit to anything that depends on them.

**What next session should pick up.** Slice 01 — Home. Re-read the home section of the system map. Spawn parallel Explore agents targeting: web `page.tsx` + `_homeShared.ts` + `_HomeBreakingStrip.tsx` + `_HomeVisitTimestamp.tsx` in depth, iOS `HomeView.swift` home feed section, `hero_pick_for_date` admin mechanism (how does an admin set it?), and `reading_log` + `user_preferred_categories` tables. Surface the structural questions to the owner before Q&A on home-specific decisions.

---

## Session 2 — 2026-04-29 — Slice 01: Home

**Phase entering:** 1 (foundation locked, no slice started).
**Phase leaving:** 2 (Slice 01 locked).

**What happened.** Four parallel Explore agents investigated the home feed surface in depth: web server component (`page.tsx`, `_homeShared.ts`, `_HomeBreakingStrip.tsx`, `_HomeVisitTimestamp.tsx`), iOS `HomeView.swift` home section, admin hero-pick mechanism (`StoryEditor.tsx`, `/api/admin/articles/save`), and the `reading_log` + `user_preferred_categories` + `view_count` schema. Seven findings were surfaced, including a critical divergence: web fetches 20 most-recent articles with no date filter; iOS filters to today-only (`published_at >= today midnight ET`), producing thin or empty feeds on slow days.

Q&A used a multi-expert panel (engagement strategist, UX/editorial designer, iOS engineer, web engineer, publishing industry analyst) for every question. The owner wanted visionary thinking — what should exist, not what's broken — so a second panel (behavioral psychologist, editorial director, luxury brand strategist, media futurist, reader experience designer) reframed both Q1 and Q2 from first principles.

**What got locked.**

1. **Edition model, not feed.** Home is a finite daily edition — 8–12 curated articles, completable, with a clear end state. No infinite scroll. Not a river.

2. **Top Stories replaces the single daily hero.** Editor-pinned stack (1–5 stories, no date limit). Major stories stay up for days if still most important. `hero_pick_for_date` superseded. Exact schema deferred to execution.

3. **Previous editions as discrete artifacts.** End of today's edition → "Yesterday's edition →" — each day is its own completable page, navigable by date. Archive is deep; home feed is finite.

4. **Volume lives in categories, not home.** As publishing scales, home stays 8–12 picks. Everything else lives in category pages. Categories are now first-class editorial surfaces.

5. **Personalization: home never touched.** Editorial front page is sacred. My Feed (explicit preferences, depth-first, non-exclusionary) is a future program. Named deferred with trigger conditions.

6. **Breaking strip: open to all readers.** Strip visible to everyone. Full article stays gated. Paid perk = proactive push/email alerts. Editorial discipline: 4–6 uses per year max, two-person sign-off, remove when story moves from breaking to developing.

7. **Read-state and new badge: both platforms.** Web unchanged. iOS: local UserDefaults (capped 200 IDs for dimming, timestamp for new badge). Top stories exempt from dimming. Cross-device sync named deferred.

**What's blocked.** Nothing. Slices 02–04 are all unblocked. Category FK structural question (which level owns category after stories migration) still open — surface in Slice 02 or 03.

**What next session should pick up.** Slice 02 — Browse. Re-read the browse section of the system map. Key investigations: dead filter pills (state exists, render removed — resurrect or drop?), `is_featured` with no admin write path, the category page 404 from browse links, iOS N+1 query pattern vs. web bulk fetch, and whether the `category/[id]` page the reading_log agent found is real. The home edition model sends readers into categories after finishing — browse needs to surface that flow naturally.

---

## Session 3 — 2026-04-29 — Slice 02: Browse

**Phase entering:** 2 (Slice 01 locked).
**Phase leaving:** 3 (Slice 02 locked).

**What happened.** Three parallel Explore agents investigated the browse surface in depth (web browse page, iOS BrowseLanding + CategoryDetailView, and admin write paths + category page existence). One critical correction emerged immediately: the web category page was not missing — it exists at `web/src/app/category/[id]/page.js`. Session 1 searched for `[slug]` patterns and `.tsx` extensions and missed it. Browse links to `/category/<slug>` work via the dynamic `[id]` route's slug fallback.

Four owner questions, answered quickly. Owner preference was for tight Q&A (no long preambles). An adversarial review agent caught one genuine clarification: "drop featured strip" needed confirmation that the relabeled "Latest stories" section was also dropped, not just the `is_featured` editorial concept. Owner confirmed: drop the whole section.

**What got locked.**

1. **Featured strip dropped entirely.** The entire top-3-article section removed from browse. No editorial pinning at the browse level. `is_featured` now has no consumer anywhere in the product.

2. **Filter pills dropped permanently.** Fully removed from code already. Not building them. Browse does not rank or sort articles.

3. **iOS kids/adult exclusion — both directions.** Adult iOS browse adds `kids-*` slug exclusion to BrowseLanding categories query. Kids app browse already filters to `kids-*` categories in `KidsAppState.loadCategories()` — verify browse surface uses that same list.

4. **Category pages filter by visibility.** Web category page adds `.eq('visibility', 'public')`. iOS CategoryDetailView already has it. Kids app category view should filter to `is_kids_safe = true`.

5. **Obvious bug fixes (no owner Q needed):** Category page article links switch from `articles.slug` to `stories.slug` (join `stories(slug)`, broken post-migration). "Top Contributors" sidebar dropped. System map corrected.

**What's blocked.** Nothing. Slice 03 (Categories) is unblocked.

**What next session should pick up.** Slice 03 — Categories. Key questions: subcategory hierarchy (schema exists, never surfaced — build or drop?), whether category pages should group by story rather than article, fate of `is_featured` column (now fully dead), and what "genuinely editorial" category pages mean — description header only, or something richer? Also: does `categories.article_count` get used or dropped? Is `is_premium` ever going to gate access or drop?

---

## Session 4 — 2026-04-29 — Slice 03: Navigation & Discovery System

**Phase entering:** 3 (Slices 01–02 locked).
**Phase leaving:** 4 (Slice 03 locked — Navigation & Discovery System).

**What happened.** Session started with the owner requesting a holistic rethink of the entire discovery surface — browse, search, categories — from first principles, not constrained by what's currently built. The owner's framing: "I just need the best possible fucking thing on my site, something thats god tier and clever and awesome above every other thing out there for this shit."

The session ran four distinct phases:

**Phase 1 — Wrong framing, corrected.** An initial 12-agent panel returned output heavy on streak ceremonies, gamification mechanics, confetti animations, and badge systems. Owner rejected immediately: "but doesnt this just gamify it to no end, im trying to spin this as a trustworthy news site, turning into duolingo or wordl or whatever defeats my fucking purpose." The agent brief was rewritten: mission-forward (informed citizens, not engagement platform), gamification explicitly ruled out, persona list changed from consumer-app designers to journalism and editorial experts.

**Phase 2 — Right team assembled.** Rather than guess the right experts, agents were asked first who should be brought in to solve this. Responses were deduplicated across all agents. Final panel of 11: news information architect, editorial art director, finite-edition digital product lead, news literacy educator, cognitive load researcher, editorial trust researcher, public media product designer, deliberation designer, reference librarian, civic participation researcher, parent-child co-use researcher. Owner approved.

**Phase 3 — Two independent expert rounds.** Round 1 (11 experts, each briefed independently) reviewed the owner's original concept: Home | Notifications | Leaderboard | Profile, category pills on home, magnifying glass merging with pills. Round 2 (11 new expert teams, fully independent — no shared context between rounds) reviewed the synthesized first-round proposal. Both rounds reached near-unanimous consensus on core architecture.

**Phase 4 — Slice locked.** The final proposal incorporated all second-round refinements and was locked into `slices/03-navigation-discovery.md`.

**What the two expert rounds agreed on (near-unanimous across 22 experts):**

- Category pills on the home screen signal aggregator, not publication. They conflict with the edition model. They belong on Browse only.
- "Leaderboard" as a primary tab label signals gamification before a word is read. Rename to Rankings and move inside Profile.
- The search + category unification instinct is correct but belongs on a dedicated Browse tab, not on home.
- Today's edition and the discovery archive are different jobs requiring different surfaces.
- Notifications as a primary tab becomes dead real estate for a publication without social volume driving daily pings. A badge on Today is sufficient.
- The Following tab — stories the reader is tracking through their lifecycle — is the retention mechanism the original design was missing. It connects directly to the timeline feature.

**Key second-round refinements over first-round synthesis:**

- **Rankings ≠ Reading Record.** Two clearly separated sections inside Profile. One is personal and private (the editorial record of what you've read). One is social and competitive (how your reading breadth compares). Mixing them collapses two distinct reader motivations. Keep them separate.
- **Story containers in Browse.** Browse should show story containers (headline, lifecycle status, "3 articles · 6 days in", reader progress) — not individual articles. No other news product surfaces the arc model in discovery. This is the sharpest product-level differentiation available.
- **The depth transition is a signature moment.** When a reader switches reading depth, the story title stays anchored and the body cross-dissolves. Same story at a different intellectual register. This is the product's editorial mission made tactile. Design it with the care of a hero animation.
- **Breaking epistemic disclaimer front-loaded.** "This story is developing. Key facts may change." As the opening line of every breaking article, not a footer disclaimer. Reading-science finding: readers pre-warned about uncertainty calibrate confidence more accurately.

**What got locked.**

Seven decisions are locked in `slices/03-navigation-discovery.md`:

1. **Navigation:** Today | Browse | Following | Profile. Notifications = badge on Today tab, not a tab. This is the four-tab structure.

2. **Today screen:** Edition only. No category pills. Depth selector (Adult / Tween / Kids) persistent below masthead. Typographic card hierarchy. Lifecycle markers without color (Breaking = thin left-rule, Developing = small-caps label, Resolved = no marker). "X of 12 read today" count, not a progress bar. Edition end state: "That's today's edition." — no ceremony.

3. **Browse tab:** Always-open search bar (never a magnifying glass icon). Category tiles default. On search activation: tiles compress to horizontal chip strip (220ms spring). Story containers, not articles. Filter chips: Category / Status / Has Quiz / Age Band / Date Range (paid). Past editions at bottom: dated list, "See all editions" calendar.

4. **Following tab:** Developing stories the reader has engaged with (read ≥1 article or passed ≥1 quiz). Shows lifecycle status, what changed since last visit, date of most recent update, link to most recent article. On resolve: full arc link + harder quiz. This is the lifecycle model made navigational — the retention mechanism without manufactured urgency.

5. **Quiz gate:** "You finished this article. Three quick questions to join the conversation." Inference questions (not recall). Pass = comment composer opens immediately, no score, no celebration. Fail = "Re-read this section →" with direct link to relevant passage. No public scores anywhere.

6. **Depth architecture:** Session-level (one setting, whole product). Depth transition: title stays anchored, body cross-dissolves (150ms). Per-article override lands at equivalent structural position in new depth (not at top). Never implies lesser choice.

7. **Family cross-band:** "Also read by Emma — kids edition." One sentence on adult StoryDetailView when story has kids-band article and reader has linked kid profiles. "Send to kids app" writes `suggested_article_id` to kid profile row. No push notification required.

**Connection to timeline feature.** Owner noted: "the following kinda plays off my timeline thing." Confirmed. The Following tab is the navigation expression of the article-lifecycle timeline. Every story in Following is a living timeline the reader is personally tracking. The timeline content feature (Slice 05 of the article-lifecycle program) and the Following tab execution must be coordinated — they share data model and editorial concept.

**Operational requirements named.** Three infrastructure promises the design makes that execution must not discover by surprise: (a) lifecycle status needs a defined editorial owner and daily review cadence; (b) inference-level quiz questions are 20–40 min/story to write well — who writes them and what the dispute pathway is must be defined; (c) three reading depths per story requires a defined writing process or adult-only becomes the silent default.

**What's blocked.** Nothing. Slice 04 is unblocked.

**What next session should pick up.** Slice 04 — Search interaction mechanics within Browse. The navigation shape is locked. What needs slicing: autocomplete behavior, result types (story containers vs. individual articles), query parsing model, filter chip interaction (category chip + status chip + has-quiz chip + age-band chip + date-range chip), zero-state design for the always-open search bar, and the two-tier search gate question (free = title ILIKE only; paid = full-text — monetization lever or placeholder?). Also: tags column — build a surface, keep as metadata, or drop?

---

## Session 5 — 2026-04-29 — Execution Investigation

**Phase entering:** 4 (Slices 01–03 locked, Slice 04 not started).
**Phase leaving:** 4+ (planning program suspended at owner direction; execution investigation complete).

**What happened.** Owner redirected from Slice 04 (Search) to execution. All three locked slice docs were re-read. A full execution investigation ran against current code — `web/src/app/page.tsx`, `web/src/app/browse/page.tsx`, `web/src/app/category/[id]/page.js`, `VerityPost/HomeView.swift` (HomeView + BrowseLanding + CategoryDetailView), `VerityPost/ContentView.swift` (MainTabView + TextTabBar), and Supabase schema queried live for `articles`, `stories`, `reading_log`, `categories`. All claims were verified with file:line quotes before the plan was written.

**Key findings from the investigation.**

- **Web home (page.tsx:188–192):** Fetches 20 most-recent articles with no date filter. iOS home correctly scopes to today with `.gte("published_at", todayStartIso)`. Both are wrong per Slice 01 — edition model requires today's articles only, capped at 8–12.
- **Web browse (browse/page.tsx:96–100, 129–136, 304–406):** Featured strip lives on — `featured`/`hasEditorPick` state, dedicated `featuredRes` query, `FeaturedCard` type, and the entire "Latest stories" section JSX. All must go per Slice 02.
- **Web category page (category/[id]/page.js:58, 62, 394, 507–519):** Three bugs: `.select('*')` with no `stories(slug)` join (article hrefs use `articles.slug` — broken post-migration), no `.eq('visibility', 'public')` (adult page shows kids articles), dead "Top Contributors" sidebar hardcoded "No contributors yet."
- **iOS BrowseLanding (HomeView.swift:751–756):** Categories query has no `kids-*` filter. Adults see kids categories. Web already excludes them.
- **iOS tab bar (ContentView.swift:232, 446–451):** Current tabs `home | notifications | mostInformed | profile` with labels "Home / Notifications / Most Informed / Profile". Locked design: `Today | Browse | Following | Profile`. Full restructure required.
- **DB — stories table:** Only `id, slug, title, published_at, created_at, updated_at`. No `lifecycle_status` column. Gap for Following tab and Browse story containers.
- **DB — no `top_stories` table.** Needed for Slice 01 Top Stories. `hero_pick_for_date/set_by/set_at` superseded but no replacement schema exists yet.
- **`is_featured` column:** Still on articles, confirmed dead after browse strip is removed.

**Execution plan produced.** Six waves:

- **Wave 1 (unblocked, all parallel):** (1a) Remove featured strip from web browse. (1b) Fix web category page: add `stories(slug)` join, visibility filter, remove sidebar. (1c) iOS BrowseLanding kids filter.
- **Wave 2 (after Wave 1, mostly parallel):** Drop `is_featured` column, web home date scope + edition end state, breaking strip open to all users.
- **Wave 3 (schema):** `lifecycle_status` on stories, `top_stories` table (owner decision needed on shape).
- **Wave 4 (after Wave 3):** iOS tab bar restructure, web home completion.
- **Wave 5 (after Wave 3+4):** FollowingView, Browse tab redesign with story containers.
- **Wave 6 (after Wave 3b+4):** Top Stories admin + home rendering, Today screen typographic redesign.

**Two owner decision points needed before Wave 3:**

1. `top_stories` schema: new table (`id, article_id FK, position, pinned_by, pinned_at`) vs. `top_story_position` nullable integer on articles. New table is cleaner — no nullable column on a hot table, delete-not-nullify for unpinning.
2. Notification tray placement: AlertsView currently lives as its own tab. Slice 03 says "badge on Today tab icon, tray inside Profile or pull-down." Choice (badge tray as a sheet vs. buried inside Profile) affects how prominent breaking alerts feel.

**What's blocked.** Waves 3–6. Wave 1 and Wave 2 are fully unblocked.

**What next session should pick up.** Wave 1 execution: 3 parallel bug fixes (web browse strip removal, web category page 3-fix bundle, iOS BrowseLanding kids filter). Apply 6-agent ship pattern (4 pre-impl + 2 post-impl) per memory. No schema changes, no nav restructure in Wave 1.
