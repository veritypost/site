# The Kinetic Edition — A Feed That Has Never Existed

**Status:** Vision document. Not a spec. A provocation for the team.
**Context:** The current home feed spec (09) builds a solid newspaper-style front page. This document asks: what if we went further? What if the page itself — its typography, its whitespace, its rhythm — carried information that no other news product has ever communicated visually?

---

## The Core Idea

Every news feed in existence treats the page as a container. Stories go in the container. The container doesn't change.

The Kinetic Edition is different. **The page is the signal.** Its visual properties — ink weight, whitespace, card density, page shape — carry meaning. A reader who glances at the page for two seconds, without reading a single headline, already knows: how heavy today's news is, how well-sourced the stories are, and whether the editor just touched this page five minutes ago or five hours ago.

No one has ever done this. Here's what it looks like.

---

## 1. Ink Weight = Trust

This is the signature move. The one people will screenshot and talk about.

Every story on the page is typeset at a weight that corresponds to its sourcing depth — not as a label, not as a number, but as **the actual darkness of the ink on the page.**

A story backed by 12 named sources, 4 primary documents, and 3 on-the-record quotes renders in a visibly heavier typographic weight. The headline is darker. The summary text is denser. The ink is confident.

A developing story with 2 sources and no documents renders lighter. Not faded — not gray — but visibly lighter weight. The ink is cautious.

The reader never sees a number. They never see a "trust score." They never see a label. They see typography that *feels* different, and over time — maybe a week, maybe a month — they internalize it. "Oh, the heavy ones are always right. The lighter ones sometimes update." That's the Verity brand burning into muscle memory.

**Implementation:** The `articles` table already tracks `named_sources_count`, `document_sources_count`, `anonymous_sources_count` (per `10_SUMMARY_FORMAT.md`). Derive a composite weight score. Map it to 3–4 typographic weight tiers:

- **Tier 1 (Black, 800 weight):** 8+ named sources, 3+ documents. Rock solid.
- **Tier 2 (Bold, 700 weight):** 4–7 named sources, 1–2 documents. Strong.
- **Tier 3 (Semibold, 600 weight):** 2–3 named sources, minimal documents. Developing.
- **Tier 4 (Medium, 500 weight):** Breaking/early reporting, few confirmed sources. The page is honest about this.

This is NOT a gimmick. It's a typographic system where weight = confidence. The serif headline at 800 weight on a well-sourced story literally looks like it was carved into the page. The 500-weight developing story looks like pencil. You feel the difference before you understand it.

**Why no one has done this:** Because every other news org treats all stories as equally trustworthy at the display layer. They might badge something as "developing" or "breaking" — but the typography is always the same weight. Verity is the first product to say: the ink itself tells you how much we trust this.

**Charter alignment:** This is the opposite of a bias meter. It doesn't label stories L/R/C. It communicates *Verity's own editorial confidence* in the sourcing — which is what the Charter actually cares about. Trust the reporting, show it in the type.

---

## 2. The Day's Shape — Layout as Information

Right now, every day looks the same: hero + 7 slots. A day when a Supreme Court ruling dominates all coverage and a day when 8 moderately important things happen get the same layout. That's a lie. Those days feel fundamentally different, and the page should show it.

The editor, when curating the front page, chooses a **page shape** — one of four layout archetypes that communicate the character of the news day:

### Shape A — "One Story" Day
The hero takes 55–60% of the first screen. Massive headline. Full summary. The supporting stories compress into a tight, dense stack below — small type, hairline dividers, almost footnotes. The page screams: THIS is the story. Everything else is context.

Use case: a war starts. A president resigns. A pandemic is declared. One thing matters.

### Shape B — "Two Giants" Day
Two co-equal heroes split the top of the page side by side (on desktop) or stacked with equal treatment (on mobile). Both get display-size headlines, both get summaries. The remaining 6 slots sit below in standard treatment.

Use case: a Supreme Court ruling drops the same morning as a Fed rate decision. Neither can be subordinated.

### Shape C — "Broad Coverage" Day
The standard layout. One hero, but not dramatically oversized. Three mid-tier stories with medium headlines. Four stack stories below. The page communicates: today is wide, not deep. Many things matter roughly equally.

Use case: most days.

### Shape D — "Quiet" Day
Fewer slots filled (5–6 instead of 8). More whitespace. The page breathes. The hero is present but modest. The message: not much happened today, and we're not going to pretend otherwise. This is the most radical shape — it's Verity saying "we won't manufacture urgency."

Use case: holiday weekends. Slow news days.

**Why this is revolutionary:** Every feed in existence has one layout, one shape, every day. The reader can never tell from the *shape* of the page whether today is a huge news day or a nothing day. The Kinetic Edition's shape is itself a piece of editorial judgment that the reader absorbs before reading a word.

**Implementation:** The `/admin/editorial/curate` page gets a shape selector (A/B/C/D) that the editor picks at the start of their curation. The shape determines the CSS grid template and the typographic scale applied to each slot. The front_page_state table gets a `page_shape` column ('one_story', 'two_giants', 'broad', 'quiet'). Rendering reads this value and applies the corresponding layout.

---

## 3. The Source Constellation

The Charter rejects bias meters. Good. Bias meters impose a political framework. But the research is right that *some* transparency signal builds trust.

The answer: **source dots.** Every story card has a small cluster of dots in the meta area — one dot per primary source cited in the article. Not colored. Not labeled L/R/C. Just dots. Small, neutral-500, evenly spaced.

A story with 14 sources has 14 dots. A story with 3 sources has 3 dots. The constellation is dense or sparse. That's all.

No labels. No numbers. No tooltip. Just dots.

**What this communicates:** "We did the work." A reader scanning the page sees: oh, that story has a thick cluster of dots. That story has three. The dot count is a trust signal that says nothing about left/right/center and everything about journalistic effort. It's Ground News's transparency minus Ground News's political framing.

**Why dots and not a number:** A number feels like a score. Dots feel like evidence. The physical presence of each dot — each one representing a named human being who went on record — is more powerful than "Sources: 14." The constellation is beautiful at high counts and honest at low counts.

**Implementation:** `named_sources_count` + `document_sources_count` from the articles table. Render as inline SVG dots, 4px diameter, neutral-500, 6px spacing, wrapping into rows if needed. Cap visual rendering at 20 dots (stories with 20+ sources all look equally dense — diminishing returns past that). Place below the summary, before the hairline divider.

---

## 4. Story Lifecycle — Cards That Age

This is the feature that will make designers lose their minds.

Most feeds treat every appearance of a story as if it's brand new. If a story was on the front page yesterday and is still there today, it looks exactly the same. That's wrong. The story has evolved. The page should show it.

**Three lifecycle stages, each with a distinct visual treatment:**

### New (first edition appearance)
Full treatment. Large headline (per the slot tier). Full summary paragraph. Source constellation visible. This is the story's debut on the Verity front page. It gets the most space because it needs to earn the reader's attention.

### Developing (2nd+ edition appearance, still on front page, has been updated)
Headline tightens. Summary replaced by a **single-sentence update line** in italic: "Updated: The committee vote has been rescheduled to Thursday; three additional witnesses have been added." The source constellation may have grown (more dots now than yesterday). The card is visibly more compact — it's saying "you probably saw this yesterday, here's what changed."

### Resolving (story has a conclusion or has aged off the active cycle)
The card contracts to a single line: headline only, smaller type, no summary, minimal dots. A thin right-border accent in neutral-300 marks it as "closing." It sits in a small "Resolved today" cluster at the bottom of the front page, above the "That's today's front page" footer.

**Why this has never been done:** Because it requires editorial tooling that tracks a story's lifecycle across editions. Most feeds are stateless — each page load renders from scratch with no memory of what the reader saw before. Verity's `front_page_state` table, combined with the per-article edit history, gives you the data to do this. The editor marks each story's lifecycle stage when curating, or it auto-derives from how many editions the story has appeared in and whether the article body was updated.

**What it communicates to the reader:** Journalism is a *process*, not a snapshot. Stories arrive, develop, and resolve. The page shows that process visually. A reader who checks Verity twice a day sees the same story contract from full treatment to update line to resolved. That arc — visible, over days — is something no other news product shows you. It's addictive in the best way: you come back to see how the story progressed, not because a notification told you to.

**Implementation:** Add `lifecycle_stage` enum ('new', 'developing', 'resolving') to `front_page_state` rows. Editor sets this during curation (with a smart default: first appearance = new; 2nd+ = developing; editor-marked = resolving). Each stage maps to a distinct card component variant with progressively tighter typography and spacing.

---

## 5. The Edition Pulse

The masthead currently shows "Verity" + date. Functional. Not alive.

Add one thing: a nearly imperceptible glow — a soft, 2-second CSS animation on the date/wordmark area — that activates when the editor has touched the front page in the last 30 minutes. The glow fades slowly over the next hour.

**What this communicates:** Someone is here. Someone just looked at this page and made a decision. You're not reading a cached artifact from 6 hours ago — this was tended recently.

It's not a badge. It's not a timestamp. It's a *presence.* Like seeing a light on in the editor's office.

On mobile: a subtle warm shift in the masthead background — from pure white (#ffffff) to the slightest cream (#fffdf7) — that decays back to white over 60 minutes. Unnoticeable if you're not looking for it. Deeply reassuring if you are.

**Implementation:** The `/api/front-page/version` endpoint already returns a hash that changes when the editor updates the page. Add a `last_edited_at` timestamp to the response. Client-side: if `last_edited_at` is within 30 minutes, apply a CSS class that triggers the glow/warm-shift animation. Decay via CSS transition timing.

Respects `prefers-reduced-motion`: if the user has motion reduction on, the glow is replaced by a tiny "Updated recently" text line in meta type below the date. Same information, no animation.

---

## 6. The Dense Stack (Below the Fold)

The current spec stops at 8 stories. The research says density below the fold is one of four non-negotiable principles — it's where the "alive" feeling comes from.

Below the curated 8 and the "That's today's front page" line, add **The Wire** — a dense, text-only, monospace-influenced section of 20–30 additional stories that passed editorial review but weren't front-page-selected.

Treatment:
- Small type (13–15pt sans)
- No summaries — headline only
- Eyebrow category in ALL CAPS before each headline
- Hairline dividers
- No images, no cards, no chrome
- Subtle monospace influence on the eyebrows (think: wire service ticker aesthetic)
- Each headline is tappable → full article

The Wire isn't the front page. It's the raw editorial feed — everything Verity published today, organized by recency. It's there for the reader who wants exhaustive coverage. It's Drudge's dense link list, modernized.

**The division is the point:** Above the fold = editorial judgment, typographic hierarchy, curated. Below the fold = editorial quality control, dense, complete. The reader can feel where one ends and the other begins. That boundary — "front page vs. wire" — is itself a trust signal.

---

## Putting It All Together — What the Reader Sees

A reader opens Verity at 9:47am on a Wednesday:

**The masthead glows faintly** — the editor touched this page 12 minutes ago. The warmth is barely noticeable but it's there.

**The page is shaped as "One Story" today** — a Senate impeachment vote landed at 8am. The hero takes 55% of the viewport. The headline is in Black weight (800) — the story has 16 named sources and 5 documents. The ink is dark, confident, authoritative. Below the summary: 16 small dots in a tight constellation. The typography says: this is real, this is sourced, this is THE story.

**Below the hero, the supporting stories are tight and dense.** One of them — a Fed story — is in Bold weight (700, strong sourcing). Another — a developing story from overnight about a factory fire — is in Semibold (600). The reader's eyes register the difference without conscious processing.

**One card is in "developing" state** — it was on the front page yesterday too. Instead of a full summary, it shows an italic update line: "Updated: Rescue operations have concluded; death toll revised to 14." The source constellation has grown from 4 dots to 9 since yesterday. The reader sees the journalism in motion.

**At the bottom of the curated section, two stories sit in "resolving" state** — single lines, compact, thin accent border. A trade deal that closed yesterday. A court case that was dismissed. The reader sees: these stories have endings. Journalism resolves.

**"That's today's front page."**

**Below: The Wire.** Twenty-two additional headlines in dense, wire-service style. ECONOMY: Manufacturing output rose 0.3% in March. WORLD: Australian PM arrives in Jakarta for bilateral talks. TECH: FTC opens review of cloud computing market concentration.

The reader scrolls, scans, taps two stories, closes the app. They feel informed. They feel like a human curated this for them this morning. They feel like the heavier stories can be trusted more. They didn't see a single bias label, a single engagement metric, or a single dark pattern.

They come back at 3pm. The page has shifted. The masthead is slightly warm — the afternoon editor touched it 20 minutes ago. The Senate story is still the hero but it's now in "developing" state — the summary has been replaced by an update line. The shape is still "One Story" but the supporting slots have rotated. Two morning stories have resolved; three new ones have entered as "new." The Wire has grown by 8 stories.

The reader feels the passage of time in the page itself. That feeling — of a page that lives, that ages, that reflects the actual weight and evolution of the news — is the thing nobody else has.

---

## What Makes This Uncopyable

Most of these features are individually implementable by anyone. The moat is that they form a **coherent system**:

- Ink weight requires sourcing metadata in the database. You can't fake this without actually tracking named sources per article. Most publications don't.
- Page shape requires an editorial tooling system that lets editors choose layout archetypes. Most publications don't have this.
- Story lifecycle requires tracking article appearances across editions. Most feeds are stateless.
- Source constellations require per-article source counts that are already captured in the Verity pipeline. Most aggregators don't have per-article sourcing data.
- The edition pulse requires a real-time editing timestamp exposed through an API that already exists in the editor system.

A competitor could copy any one feature. Copying all five requires rebuilding the entire editorial infrastructure — the editor system, the source-tracking pipeline, the front-page-state table, the lifecycle tracking. That's months of work, and by then Verity owns the visual language.

The other reason it's uncopyable: it only works if you actually have human editors curating a real front page. Algorithmic feeds can't do page shape (no editorial judgment), can't do ink weight honestly (no sourcing metadata), can't do lifecycle (no edition memory), can't do the edition pulse (no human to pulse). The Kinetic Edition is a visual system that *requires* the thing the Charter already demands. The design and the editorial philosophy are the same thing.

---

## What This Intentionally Rejects

Everything the research flagged as refused, plus:

- No bias bars, no L/R/C coloring (Charter explicit rejection — source dots replace this)
- No algorithmic personalization
- No infinite scroll (The Wire has a bottom too)
- No streaks, no gamification on the feed
- No red "BREAKING" bars (the breaking treatment is: Shape A + Tier 1 ink weight + the edition pulse glowing warm. The page itself becomes the siren.)
- No photos on the feed (typography IS the visual. Ink weight IS the image.)
- No engagement metrics ("X people reading this")
- No pull-to-refresh slot machine
- No autoplay anything

---

## Charter Compliance Check

- **Commitment 1 (tight summary):** Preserved. Summaries are prose, no labels. Ink weight is applied to the headline, not the summary.
- **Commitment 2 (front page chosen by human, dated):** Strengthened. Page shape is an editorial decision. Edition pulse makes the human presence felt.
- **Commitment 3 (quiz gate):** Unchanged. Quiz gate operates at article level, not feed level.
- **Commitment 4 (article is the product):** Preserved. No bylines, no read times, no timestamps on cards. Ink weight and source dots replace metadata with visual signals.
- **Commitment 5 (engagement-bait refusal):** Strengthened. The Kinetic Edition's trust signals are anti-engagement-bait by design.

---

## The Five Pillars, Summarized

| Pillar | What the Reader Sees | What It Communicates | Precedent |
|---|---|---|---|
| **Ink Weight** | Headlines in varying typographic weights | "How well-sourced is this?" | None. Never done. |
| **Page Shape** | Different layouts on different days | "What kind of news day is today?" | None. All feeds use one layout. |
| **Source Constellation** | Dot clusters on each card | "How many sources back this?" | Loosely inspired by Ground News, but without political framing. |
| **Story Lifecycle** | Cards that contract over editions | "Where is this story in its arc?" | None. Feeds are stateless. |
| **Edition Pulse** | Subtle glow in the masthead | "A human was here recently." | None. No feed shows editor presence. |

Three of these five have zero precedent in any shipping news product. The other two (dots, lifecycle) have loose inspiration but have never been executed in this form. This is the feed that doesn't exist yet.

---

## Open Questions for the Team

1. **Ink weight sensitivity:** Does the 4-tier weight system create enough visual contrast on a phone screen, or do we need to supplement with a subtle background tint (e.g., Tier 1 cards get a barely-perceptible warm background)?
2. **Page shape on mobile:** Shape B (Two Giants side-by-side) works on desktop but stacks on mobile. Does stacking two equal heroes on mobile still communicate "co-equal" or does it just look like "two heroes in a row"?
3. **Lifecycle editorial burden:** Does marking lifecycle stages add too much work for the editor, or can it be auto-derived (first edition = new, 2nd = developing, editor-flagged = resolving)?
4. **The Wire length:** 20–30 stories? 40? How many stories does Verity publish per day at launch?
5. **The glow on low-brightness screens:** Does the edition pulse read on phones at low brightness, or do we need a fallback (like a tiny text indicator)?

---

## Next Steps

If this vision resonates, the implementation path is:

1. Update `09_HOME_FEED_REBUILD.md` to incorporate the five pillars.
2. Update `views/web_home_feed.md` and `views/ios_adult_home.md` with the new card variants and layout archetypes.
3. Add `page_shape` and `lifecycle_stage` to the `front_page_state` schema.
4. Update `08_DESIGN_TOKENS.md` to include the 4-tier typographic weight system mapped to sourcing scores.
5. Build a high-fidelity HTML mockup showing all four page shapes with ink weight variation.
6. User-test the ink weight system: can readers perceive 4 weight tiers at phone viewing distance?

This is the feed that doesn't exist. Build it.
