# Slice 03 — Navigation & Discovery System

**Status:** locked
**Session:** 2026-04-29 (Session 4 — multi-round expert panel)
**Adversarial review:** complete (two independent rounds, 22 total experts across original concept and synthesized proposal)

---

## What this slice covers

The full navigation structure and discovery surface across iOS adult, iOS kids, and web. This supersedes earlier assumptions about where category navigation lives and what Browse is. Slices 01 and 02 locked the edition model and browse-level bug fixes; this slice locks the navigation architecture that connects all surfaces.

Slice 04 (Search) covers the search interaction mechanics within Browse in detail. This slice locks the nav structure and Browse's design shape.

---

## How we got here

The original concept (Home | Notifications | Leaderboard | Profile, category pills on home, magnifying glass top-right merging with pills) was run through two independent expert panels — one critiquing the original, one critiquing a synthesized alternative. 22 total experts across: news information architects, editorial art directors, finite-edition digital product leads, news literacy educators, cognitive load researchers, editorial trust researchers, public media product designers, deliberation designers, reference librarians, civic participation researchers, parent-child co-use researchers, veteran mobile product leads, editorial directors, behavioral researchers, brand strategists, iOS interaction designers, design critics, newsroom innovation directors, long-form reading designers, digital publishing strategists, and senior product designers.

Two rounds reached near-unanimous consensus on the core architecture. Key points of near-unanimous agreement:

- Category pills on the home screen signal aggregator, not publication. They conflict with the edition model.
- "Leaderboard" as a primary tab label signals gamification before a word is read.
- The search+browse unification instinct is correct but belongs on a dedicated Browse tab, not on home.
- Today's edition and the discovery archive are different jobs requiring different surfaces.
- The Following tab — stories you're tracking through their lifecycle — is the retention mechanism the original design was missing, and it connects directly to the timeline feature.

---

## Locked decision 1: Navigation structure

**Tab bar: Today | Browse | Following | Profile**

**Today** — the daily edition. One job: present today's curated 8–12 articles. Nothing else lives here.

**Browse** — all discovery. The search+category unification lives here. Story containers, past editions, category navigation.

**Following** — stories the reader has engaged with that are still Developing. The lifecycle spine made navigational. This is what pulls readers back tomorrow without manufactured urgency.

**Profile** — reading record (personal, private) and rankings (social, competitive) as clearly separated sections. Family management. Depth preference.

**Notifications:** a badge on the Today tab icon. Not a tab. At current notification frequency (breaking news alerts, story-resolved, story-state-change for followed stories), a dedicated tab is an empty room most days and trains readers to expect volume that doesn't exist. Badge communicates "something happened"; the notification tray inside Profile or a pull-down shows the detail.

**Why not Notifications as a tab:** The behavioral evidence is consistent — Notifications in a bottom nav becomes dead real estate within two weeks for a publication without social activity driving daily ping volume. Reserve the real estate for surfaces that readers visit intentionally on any given session.

**Why Following instead:** The story lifecycle (Breaking → Developing → Resolved) is the product's most distinctive editorial concept and the natural re-engagement mechanism. A reader who read a Breaking story has a reason to return when it moves to Developing. That pull should be structural — a tab they check — not reliant on a push notification they may have disabled. Following turns the lifecycle model into a daily reading habit.

---

## Locked decision 2: Today screen

Today presents the daily edition. Its only job is the edition.

**No category pills.** Pills on the edition screen signal "filter this," which contradicts "an editor curated this." The edition is a complete editorial statement. Adding navigation above it implies the reader should sort it, which is the wrong message for a publication competing on editorial judgment.

**Depth selector:** Adult · Tween · Kids, persistent just below the masthead. Session-level. This is the product's core differentiator — publishing the same story at three intellectual depths — and it belongs on the primary screen, not in settings. Framed as format, not difficulty. "Adult" means full context and complexity. "Tween" means the core story, clean structure. "Kids" means what happened and why it matters. The labels should reflect this — avoid anything that implies intellectual hierarchy.

**The depth transition is the product's signature moment.** When a reader switches depth, the story title stays anchored in place while the body cross-dissolves to the new depth version. This makes the product's editorial mission tactile: same story, same facts, different intellectual register. This is not a UI state change — it is the moment the product demonstrates what it is. It deserves the same design attention as a hero animation.

**Story cards:** Typographic hierarchy. No card borders, no drop shadows, no rounded-corner containers above 2px. No color-per-category. Hierarchy comes from scale, weight, and position.

- Lead story: largest headline (24pt), full-width image if available
- Supporting stories (2–3): standard headline (20pt), image if available
- Remaining stories: typographic list, hairline rules between entries, no images

**Lifecycle on cards:**
- Breaking: thin left-rule border — the only color exception in the card system. Rare, high-trust, never decorative.
- Developing: "DEVELOPING" in small-caps, wide-spaced, above the headline. Not a badge shape. Typographic.
- Resolved: no marker. The absence is the signal. A finished story looks like finished editorial record.

**Breaking epistemic signal:** Breaking articles open with a single line of editorial context: "This story is developing. Key facts may change." Front-loaded, not a footer disclaimer. This is a reading-science intervention — readers pre-warned about information uncertainty calibrate their confidence more accurately than readers who encounter caveats at the end.

**"X of 12 read today":** Quiet counter, top right. Not a progress bar. Not a badge. A count, like a chapter number. Informational, not evaluative. The difference: a progress bar creates anxiety about completion. A count creates satisfaction when it closes.

**Edition end state:** "That's today's edition." — one line, quiet, editorial. Below it: "Browse past editions →" linking into Browse. No ceremony, no confetti, no achievement animation. A reader who finishes the edition has done something real. The interface acknowledges it with the gravity it deserves.

---

## Locked decision 3: Browse tab

Browse is a unified search and discovery surface. The original concept's magnifying glass + category pill merge lives here, in the right location.

**Default state (nothing typed, nothing selected):**

Search bar always open at the top. Not a magnifying glass icon — a full, always-visible search bar with placeholder: *Search stories, topics, timelines…* This removes the activation cost that filters out casual search users and signals that search is a first-class action, not a utility hidden in a corner.

Below the search bar: a two-column grid of category tiles. Each tile shows: category name in large type, and an activity signal — "4 active stories" or "quiet this week." Not article counts. Activity signals, not volume. A tile that says "47 articles this week" triggers anxiety. A tile that says "active this week" communicates editorial energy without implying an obligation to read everything.

**The search-merge interaction:**

When the reader taps into the search bar:
- Keyboard rises
- Category tiles compress: they shrink from tile size to chip size, reflow into a horizontal scroll strip pinned below the search bar
- 220ms spring transition
- The reader now has two simultaneous inputs: the text field and the category chips

Tapping a chip while typing narrows results to that category. Tapping a chip without typing enters browse mode for that category (equivalent to navigating to that category's section). Clearing both inputs spring-back animates to the tile grid.

Category tile tap → category section front: a push navigation showing stories in that category, subcategory chips at top, story containers below. Not a filtered feed — a section front.

**Browse shows story containers, not individual articles.** This is the single sharpest distinction from every competitor. A story card in Browse shows:
- Headline
- DEVELOPING / BREAKING status (same typographic treatment as Today)
- "3 articles · 6 days in" — scope without volume anxiety
- A progress indicator: "2 of 3 read" if the reader has engaged with prior articles in this container
- Quiz indicator when a quiz exists and hasn't been passed

Showing story containers trains readers to understand the product's actual model: stories have arcs, articles are chapters, the publication tracks events through time. No other news product surfaces this in discovery.

**Filter chips (appear after search or category tap):**

Category | Status (Breaking / Developing / Resolved) | Has Quiz | Age Band | Date Range (paid only)

"Has Quiz" as a binary chip surfaces the quiz-gated discussion mechanic as a discovery affordance. Readers encounter it in browse and learn what it means without needing to be told.

"Age Band" chip opens: All / Has kids version (ages 8–10) / Has tweens version (ages 11–14). Parent-facing vocabulary, not internal terminology. When active, "K" and "T" badges appear on story cards — small, non-interactive, scannable.

**Past editions at the bottom of Browse:**

A dated list: Tue 28 · Mon 27 · Sun 26 · See all editions →

Each date links to the sealed edition for that day — same Today screen structure, frozen as published. Not a list of articles — the full edition front page as it was. Navigation by date. Each past edition is completable, same as today's.

"See all editions" opens a calendar/dated list of all past editions. This is the archive surface. It is inside Browse, not a separate tab.

Past editions are the same collection as the live edition, accessed with a date filter. They are not a separate product. Navigating into a past edition from Browse should feel like turning to a specific date in a physical archive — continuous, not a mode switch.

---

## Locked decision 4: Following tab

The Following tab is where the lifecycle model becomes a daily reading behavior.

**What appears here:** Story containers the reader has engaged with (read at least one article, passed at least one quiz) that have not yet reached Resolved status.

**What the tab shows for each story:**
- Story headline and current lifecycle status
- What changed since the reader's last visit: "2 new articles since you last read" or "Story moved from Breaking to Developing"
- The date of the most recent update
- A direct link into the story container's most recent article

**When a story resolves:** It appears in Following with a Resolved marker and an invitation: "This story is complete. Read the full arc →" — linking to the story container's full chronological view of all articles from Breaking through Resolved. The Resolved state also surfaces the harder comprehension quiz (see quiz gate below).

**Why this is the retention mechanism:** A reader who has followed a Developing story has a genuine editorial reason to return tomorrow — not because of a streak counter or a notification badge, but because the story isn't finished and they care about it. This is the difference between manufactured urgency and genuine journalistic pull. The Following tab makes that pull visible and actionable.

**The connection to the timeline feature:** The Following tab is the timeline feature made into a navigation surface. Every story in Following is a living timeline the reader is personally tracking. The timeline isn't just a content feature inside an article — it's the spine of the reader's daily return behavior. Following is where the timeline's value compounds over days and weeks.

**Following and civic identity:** A reader who opens Following and sees "Iran nuclear talks — Day 12, now Resolved" understands something that no feed product can give them: they followed a story through to its conclusion. They have a complete account of something that happened in the world. This is the product's civic mission made visible in the navigation.

---

## Locked decision 5: Quiz gate

**The gate framing:**

At the end of an article, before the discussion section, a single transition: *"You finished this article. Three quick questions to join the conversation."*

Not "prove you read it." Not a lock icon. Not "quiz required." The quiz is the opening of the conversation, framed as a natural next step.

**Question type:** Inference questions, not recall. A recall question ("What did the article say the mayor cited as the reason?") can be answered by skimming. An inference question ("Given the timeline the reporter established, which of the following is most consistent with the administration's priorities?") requires genuine engagement with the argument. Editorial team writes the questions. They take the same care as the article itself.

**Pass:** Comment composer opens immediately. No celebration, no score displayed, no points. Access is the reward.

**Fail:** "Re-read this section →" with a direct link to the relevant passage in the article. Not a generic retry screen. Not a score. A specific redirect back to the part they missed.

**Returning user:** Quiz completion persists. A reader who passed the quiz last week does not re-quiz. They go directly to the comment section. If the story has updated significantly (Developing to a new major development), a "New discussion" indicator appears but re-quizzing is not required unless a new article is added to the container.

**No public scores.** Quiz results are not displayed anywhere. They gate access. They contribute to the reader's private reading record in Profile. They do not appear on cards, in Following, or in Rankings.

**Rankings and quiz:** The Rankings section in Profile reflects breadth and consistency of reading across categories — not quiz scores. A reader who has quizzed across six categories over three months ranks differently than one who quizzed 50 times in one category. Breadth and editorial range are what Rankings measures. Score optimization would degrade the reading culture the quiz is trying to create.

---

## Locked decision 6: Reading depth architecture

**Session-level, not per-article.** The reader sets their depth once (Adult, Tween, or Kids) and the entire product — Today, Browse, Following — renders at that depth. They are not confronted with a depth toggle on every article. The toggle is available but ambient.

**The transition:** When switching depth, the story title stays anchored, the body cross-dissolves. 150ms. The reader watches the same story described at a different intellectual register. This is the product's signature moment. Design it with the care of a hero animation.

**Depth as format:** The UI should never imply that switching to a simpler depth is a lesser choice. "Adult" is the full version. "Tween" is the clean version. "Kids" is the essential version. All three are editorially intentional. The selector should use these frames — or even better, something the reader can identify with — never "Easy / Medium / Hard."

**Per-article override:** Readers can switch depth within an article. When they do, they land at the equivalent structural position in the new depth — not at the top. Dropping a reader back to the top of an article they're halfway through imposes a full re-read cost and they won't use the feature again.

**Depth availability:** Not every story will have all three depths immediately. When a depth isn't available, the selector shows the available options only. No placeholder content, no "coming soon." The product ships what's ready.

---

## Locked decision 7: Family cross-band discovery

One quiet line on the adult `StoryDetailView`, rendered only when two conditions are true: the story has a published kids-band article, and the reader has linked kid profiles.

*"Also read by Emma — kids edition."*

Not a feature announcement. Not a badge. One sentence. The data to power this is already in place (`reading_log` has `kid_profile_id`, `feed_clusters` has `primary_kid_article_id`).

"Send to kids app" writes a `suggested_article_id` to the kid profile row. The kid sees "Your parent shared this" on their home screen next time they open the kids app. No push notification required. When the kid reads it, `reading_log` writes. The loop is complete.

This is not a large feature. It is one sentence and one database write. It is the household moment that distinguishes Verity Post from two parallel apps that happen to share infrastructure.

---

## What this slice does not decide

- Exact animation curves and spring parameters (execution)
- Typography face selection and exact sizing (execution — constrained to: newspaper serif for headlines, clean grotesque for body and UI, generous margins and measure)
- Exact copy for depth selector labels (polish pass)
- Notification tray design inside Profile (execution)
- Rankings section design in detail (execution)
- `family_suggestions` table schema (execution)
- iOS kids app discovery surface (separate consideration — kids tab bar stays as Home | Ranks | Experts | Me; kids does not get a Following tab at this stage)

---

## Operational requirements this design creates

This design makes editorial promises that require operational infrastructure. Name them explicitly so execution doesn't discover them by surprise:

**Lifecycle status maintenance:** Breaking → Developing → Resolved transitions require a defined editorial owner and daily review cadence. The UI makes these states visible to readers; stale lifecycle labels erode trust faster than having no labels at all. Execution must include an admin UI for lifecycle status management and a defined editorial workflow for who owns it.

**Quiz question authorship:** Inference-level quiz questions are 20–40 minutes per story to write well. This is not a trivial editorial overhead. Execution must define: who writes them, what "inference question" means in a style guide, and what the dispute pathway is when a reader argues a question is unfair. The quiz gate's credibility depends on question quality.

**Depth adaptation workflow:** Three reading depths per story requires a defined writing process. Without a workflow, adult-only will become the silent default. Execution must decide: are all three depths required to publish, or is adult the default with depth adaptation as a secondary process? If required, the publish workflow must enforce it. If optional, the UI must handle depth-unavailable states gracefully.

---

## Cross-slice notes

- **Slice 01 (Home):** The edition model is confirmed and unchanged. The "Today" tab label replaces "Home" as the tab name — same screen, stronger editorial framing.
- **Slice 02 (Browse):** The bug fixes locked in Slice 02 (visibility filter, stories(slug) join, sidebar removal) are still in scope. Browse's design shape is now locked by this slice. The category grid, story containers, and search-merge are the definitive Browse design.
- **Slice 04 (Search):** The search interaction mechanics — autocomplete behavior, result types, query parsing, the overlay vs. full-screen question — are detailed in Slice 04. This slice locks the shape; Slice 04 locks the behavior.
- **Timeline feature:** The Following tab is the navigation expression of the timeline. The timeline content feature (editing, admin authoring) is covered in the article-lifecycle program's Slice 05. These must be coordinated in execution.
