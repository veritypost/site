# Article Pipeline Handoff

Orientation for the next person (or AI helper) working on Verity Post articles, timelines, and the story architecture behind them. Written 2026-05-18 by Claude after a full editorial pass on the first 10 published articles.

---

## What you're walking into

Verity Post is a serious newsroom built around a pipeline: feeds → discovery → AI generation → admin review → publish → render. The voice is wire-service / trusted-colleague register, not blog and not press release. Every article has three companions on the page: a timeline of the story arc, a sources block, and a quiz. All four pieces must agree.

The first 10 articles went live around 2026-05-16 (Trump–Xi summit, Cassidy primary, LIRR strike, Ebola in Congo, etc.). They came out of the pipeline solid but needed a human-level fact-check, plagiarism scan, voice polish, and several drift fixes. This doc captures what was done, why, and what the next helper should know.

---

## The pipeline in one read

1. **Feeds** (`feeds` table) — RSS/Atom sources, `is_active`, `audience`, `is_ai_rewrite`, `is_auto_publish`. Managed at `/admin/feeds`.
2. **Ingest** — `/api/newsroom/ingest/run` pulls active feeds → writes `discovery_items`. **On-demand only**, no cron in `vercel.json`.
3. **Cluster** — `discovery_items` group into `feed_clusters` with a working headline.
4. **Generate** — `/api/admin/pipeline/generate` runs the 13-step (adult) / 15-step (kids) pipeline per cluster × audience. Killswitches: `ai.adult_generation_enabled` / `ai.kid_generation_enabled`.
5. **Voice** — enforced by `web/src/lib/pipeline/editorial-guide.ts` (read it; it's the bible).
6. **Persist** — RPC `persist_generated_article()` writes `articles` (status=`draft`) + `sources` + `timelines` + `quizzes`, all FK'd to a `stories` row keyed by slug.
7. **Publish** — PATCH `/api/admin/articles/{id}` with `status='published'` → sets `published_at`. Body is re-sanitized server-side.
8. **Render** — `/` reads `home_layouts` slots; article URL is `/{story.slug}?a={article_id}`. Legacy `/story/:slug` 308s.

## Key file paths

- Pipeline orchestrator: `web/src/app/api/admin/pipeline/generate/route.ts`
- Editorial bible: `web/src/lib/pipeline/editorial-guide.ts`
- Persist RPC wrapper: `web/src/lib/pipeline/persist-article.ts`
- Admin newsroom UI: `web/src/app/admin/newsroom/page.tsx` + `_components/AudienceCard.tsx`
- Article page render: `web/src/app/[slug]/page.tsx`
- Timeline component: `web/src/components/article/TimelineSection.tsx`
- DB types: `web/src/types/database.ts`

---

## The editorial bible — what voice you're matching

Read `web/src/lib/pipeline/editorial-guide.ts` directly. The short version:

**Voice**
- Wire-service / trusted-colleague register. State what happened. No tease, no press release.
- Vary sentence length deliberately. Short sentences land harder after long ones. Never stack three same-length sentences.
- **Cumulative shape**: base clause first, modifiers after — never nested inside.
- **Known-new contract**: each sentence opens with information the previous sentence established; the new fact lands at the close.
- **Specific nouns** every time. "Mayor Garcia" beats "the mayor."

**Hard rules**
- **350-word target, 250–450 range**. Under 250 = under-reported. Over 450 = trim.
- **NO specific dates in article body.** Use relative time ("today," "Wednesday," "this week," "last month"). Dates live in the timeline. This is critical and easy to miss.
- **No editorializing.** Banned adjectives include: sweeping, landmark, controversial, stunning, dramatic, unprecedented, groundbreaking, historic, shocking, alarming, massive, huge, enormous, game-changing, revolutionary, breakthrough, significant, major. Banned verbs: slammed, blasted, torched, hammered, championed, hailed, vowed.
- **No inline outlet attribution** ("according to NBC News," "Reuters reported") except when the reporting itself is the news or when sources disagree. Outlets are credited in the `sources` block.
- **F-pattern paragraph front-load**: first 3–5 words of every paragraph carry the concept noun. Strip throat-clearing openers ("In a move that...", "After climbing for...").
- **No backstory**, no "here's how we got here." The timeline carries all of that.
- **Every sentence a fact.** Strip framing, interpretation, prediction.

**Headlines (8–14 words, aim for 10)**
- WHAT HAPPENED + STORY-ARC ANCHOR.
- No clickbait — bans: curiosity gaps, rhetorical questions, list-bait, tease colons, reaction framing, hype adjectives.

**Summaries (~30 words, range 18–45)**
- One sentence default. Plain restatement of today's news beyond the headline.
- No fact from the headline appears verbatim in the summary.

**Quizzes (5 per article)**
- Every correct answer must be verifiable by re-reading the article body. No timeline-only facts.
- Difficulty ramp: Q1 easy gimme → Q5 deep detail.
- Never test dates (article uses relative time).

**Timeline event labels (max 10 words)**
- Complete thought, scannable, no pronouns without antecedents. "The ruling" without saying what was ruled = bad.
- Every event must stand alone — some readers only read the timeline.
- **Mini-headline format, not slug format.** Owner rule, locked 2026-05-18. Each label is subject + verb + something specific — like a small headline, not a tag. "U.S. drones deployed" fails (slug-y); "U.S. deploys drones to Nigeria over Christian violence" passes. If the event can't justify a substantive label, it doesn't belong on the timeline — cut it. Don't pad timelines with thin events to hit a count.

**Timeline event dates — precision and display**
- `event_date` is always a real `timestamptz` and drives sort order. Use the most specific date you actually know.
- **Don't fake the day.** If you only know the month, do NOT use the 1st of that month and let the render show "Jan 01" — set `metadata.date_display` to a string at the precision you actually have ("Mar 2025", "1976") and the render will use that override instead.
- The render's `formatDateShort` now produces `MMM DD, YYYY` for full-date events (e.g., "Jan 06, 2021"), so the year is always visible — critical when timelines span years (locked 2026-05-18). Don't strip the year back out.
- `metadata.date_display` precedence: if set, it wins over `formatDateShort`. Use it for year-only ("2016") or month-year ("Mar 2025") entries.

**Story title vs. article title vs. story description**
- `stories.title` is **arc-level** — what the whole slug covers across time ("Trump's 2026 China visit", "Israel–Hamas war", "2026 Long Island Rail Road strike"). NOT today's headline.
- `articles.title` is **today's beat** — the news event being covered in that specific article ("Trump and Xi wrap two-day China summit with no Taiwan deal").
- `stories.description` (column added 2026-05-18) is a one-line summary of what the slug covers — appears in the timeline header below the story title. Example: "President Trump's May 2026 state visit to China for talks with Xi Jinping on Taiwan, trade, the Iran war and artificial intelligence, alongside Putin's follow-on Beijing visit."
- **Pipeline gotcha (open):** the initial `persist_generated_article` RPC copies the article title into `stories.title` at story-creation time. This is wrong — story title should be arc-level from the start. Until the pipeline is fixed, manually rewrite `stories.title` + set `stories.description` after the first article in any story is generated.
- Rendered by `TimelineSection.tsx` — title in `<h2>`, description in a paragraph below.

**Timeline event bodies — hand-written, never AI**
- Every event has an `event_body` field (2–4 sentences). The render surfaces it on click — each event label is a button with a ▸ caret; click expands the body underneath (wired 2026-05-18 in `TimelineSection.tsx`).
- **Owner rule: event bodies are hand-written, not pipeline-generated.** The original pipeline filled them in to keep the schema non-null, but going forward they should be owner-edited. The label is the scannable headline; the body is the depth a curious reader clicks for.
- **The right shape:** explain what the event *was*, name the players, give the consequence, anchor any number that matters. Don't just restate the label — add real information beyond what's in the headline.
  - BAD body for label "Makary takes over": "Marty Makary becomes FDA commissioner." (restates label, no depth)
  - GOOD body for label "Closed-primary law signed": "Gov. Jeff Landry signs Act 1 of the 2024 First Extraordinary Session, ending Louisiana's jungle primary for federal, state Supreme Court, PSC and BESE races. It takes effect Jan. 1, 2026, setting up the state's first closed-party Senate primary since the 1970s."
- The pre-2026-05-18 pipeline-generated bodies on the first 10 articles vary in quality — some are substantive, many just restate the label. Audit and rewrite as you cover each story.

---

## What was done in the 2026-05-18 editorial pass

The first 10 published articles got a full audit and rewrite. Here's what changed and why.

### Hard factual errors fixed

| Story | Error | Source verified |
|---|---|---|
| US–Cuba | "Castro led Cuba after the **death** of his brother Fidel" — Fidel died 2016, Raúl took over 2008 when Fidel resigned due to illness | NPR / Britannica / CNN |
| Mifepristone | Telehealth stat attributed to ACLU — actually originates with WeCount (Society of Family Planning) | PBS / STAT / SFP |
| US–Nigeria | "Sanctioned by Treasury two years ago" — actually three years (June 2023 OFAC designation) | OFAC sanctions list |
| Louisiana primary | Article framed Cassidy's race as upcoming, but he lost (third, ~25%); Letlow + Fleming advanced | NPR / CNN / NBC |
| LIRR strike | Quote misattributed to Gov. Hochul — actually Lisa Daglian, executive director of the Permanent Citizens Advisory Committee to the MTA | CBS NY / ABC7 |
| LIRR strike | Union rep's first name listed as "Anthony Sexton" — actually Kevin Sexton (BLET national VP) | ABC7 / gothamist |

### Timeline factual fixes

| Story | Issue | Fix |
|---|---|---|
| Israel-Hamas | Sinwar killed listed at 2025-01 — actually May 13, 2025 (Khan Younis European Hospital strike) | Date corrected; role attribution kept (al-Qassam commander, confirmed correct) |
| Mifepristone | "2016 Mail access expanded" — wrong; actual mail/telehealth permanent move was Dec 16, 2021 REMS modification | Re-dated |
| Louisiana primary | "Indiana primaries" event muddled and didn't belong as worded — but the underlying May 5, 2026 Indiana precedent IS real | Rewritten with accurate framing |
| LIRR | "2023 — three years of highest inflation in decades" — factually wrong (inflation peaked 2022) | Reframed to "contract takes effect; talks stall" |
| Ebola Congo | "2021 Ituri under military rule" — tangential to outbreak arc | Replaced with 2018–2020 Kivu Ebola outbreak (the relevant prior arc) |
| London rallies | Only the 1948 Nakba anchor (lopsided — only contextualized one side) | Added Sep 2025 Robinson "Unite the Kingdom" rally for balance |

### Plagiarism scan

20 distinctive phrases checked across the 10 articles (two per article), in quotes, against Google. **Zero verbatim hits in any other publication.** Sources are linked in the `sources` table; bodies were rewritten cleanly. Pipeline's `plagiarism_check` step evidently worked.

### Voice and editorializing pass

Three lines tightened from opinion to reporting:
- Louisiana: "the most direct test yet of Trump's effort to oust members of Congress" → "a test of..."
- Mifepristone: "remain with the agency's scientists" → "remain with the FDA" (neutral framing)
- Trump–Xi: dropped editorial "bargaining chips" conclusion; kept the underlying facts

All 10 bodies reshaped per the editorial bible — date rule enforced (no specific dates in body), paragraph front-load, cumulative sentences, varied length, no framing words ("amid", "underscores", "marks a shift").

### Quiz integrity

After the body rewrites, 5 quiz questions had stale references (correct answer no longer in body). All five fixed so every correct answer is now exact-phrase verifiable:
- Israel-Hamas Q4: "857 since ceasefire" (stale stat) → "hundreds of additional deaths"
- LIRR Q2: "1994" (only in timeline) → "more than 30 years" (in body)
- Mifepristone Q3: "per the ACLU" → "per the WeCount project of the Society of Family Planning"
- Louisiana Q1, Q2: present-tense framing → past-tense (Cassidy lost)

### Timeline label clarity

5 labels failed the standalone-readability bar:
- "Letlow launches" → "Letlow launches Senate campaign" (verb needed object)
- "Runoff scheduled" → "Letlow-Fleming runoff" (stale framing)
- "CBER turnover" → "Biologics center turnover" (jargon)
- "Earlier unverified claim" → "Nigeria's earlier kill claim" (pronoun without antecedent)
- "Steps down as party leader" → "Castro steps down as party leader" (subject needed)

### Headlines and subtitles

All 10 headlines audited against the editorial bible — 8–12 words, no clickbait, all state what happened. Three subtitles fixed:
- Louisiana subtitle had "June 27" date and was two sentences — rewritten to one sentence, no date
- Louisiana excerpt had same date — fixed
- Israel-Hamas subtitle was 35 words — tightened to 30, opens with Haddad's name (the new fact, not the headline-restatement)
- LIRR subtitle repeated "300,000" verbatim from the headline — replaced with new info (failed mediation)

---

## Drift bugs found in the render/data layer

### 1. Timeline article-anchor labels drifted from article titles

Every `type='article'` timeline row had been written at generation time with a slightly different headline than the eventual published article title. The Cassidy one was meaningfully wrong (anchor said "Cassidy faces challenger" while the article said "Cassidy loses"). The other 9 were minor variant wordings.

**Fix applied (one-shot):** synced `event_label` to `articles.title` for all `type='article'` rows.

**Open follow-up:** when an article title is edited post-publish, nothing currently re-syncs the timeline anchor. A trigger or admin-edit hook would prevent recurrence.

### 2. "Today" rendered on stale article anchors

`web/src/components/article/TimelineSection.tsx:218` computed `nowIdx` as "the most recent `type='article'` entry, regardless of date" — so the timeline always labelled the article anchor "Today" even when the article was days old.

**Fix applied:** in TimelineSection.tsx, the "Today" label now only renders when the event's date actually matches the user's current date; otherwise it shows the normal `Mon DD` date label, like every other event. See the edit around line 250–262.

### 3. Pipeline gotchas worth knowing

- **No feed-polling cron.** Ingestion only runs when admin hits `/api/newsroom/ingest/run`. There's no scheduled fetch.
- **Soft cluster lock is in-memory.** `generate/route.ts` uses a Map+TTL, not a DB claim. Two simultaneous requests on the same cluster could both pass the lock.
- **`feeds.is_auto_publish` exists but isn't wired.** Every article requires manual Publish click.
- **TS types drift on comments taxonomy.** Migration `20260512120000` added `author_self_tag` and `reply_type` columns to `comments`, but `web/src/types/database.ts` doesn't reflect them yet.
- **No AI-content disclosure on the article render.** `[slug]/page.tsx` selects `is_ai_generated`, `ai_model`, `ai_provider` but doesn't render anything. Worth adding a small byline-level "Drafted with AI — reviewed by editors" once you're publishing routinely.

---

## Story architecture — how to slice the world

This is editorial, not technical. The schema gives you one slug → one story → one timeline. The question is what counts as one story.

**The heuristic that works:** a story = one arc a reader can follow start → middle → end. Timeline events = the developments that pushed THAT specific arc forward. Anything else, no matter how related, lives in a different story.

**Two patterns**

**Pattern A — anchor slug.** One slug whose timeline accumulates events over years. Use sparingly. Right for arcs that are truly one continuous thread (e.g. `us-china-tariff-war` since 2018, `hong-kong-crackdown` since 2020).

**Pattern B — moment slug.** Each distinct news beat is its own slug with a narrow timeline of just that event. The default. Cross-link to broader arcs via category or related-stories rails, never by merging timelines.

**Test for each new article:** "Will I write 5+ articles on this thread over the next 12 months that all advance the same arc?" Yes → anchor. No → moment.

**Cross-linking, not duplication.** A single event can show up as a *timeline event* inside multiple anchor timelines while having its own *standalone slug* for the article coverage. Example: "Liberation Day tariffs" is its own moment slug AND appears as one event inside `us-china-tariff-war`, `usmca-tariff-disputes`, and `eu-steel-tariffs` timelines.

### Proposed taxonomy for Xi / tariffs (28 items → 22 slugs)

**9 anchor stories:**
```
us-china-tariff-war          (folds in: soybean/farm, Boeing orders, transshipment, rare-earth)
us-china-chip-war            (folds in: AI race / DeepSeek)
china-russia-axis            (folds in: Putin visit as one event)
hong-kong-crackdown
xinjiang-tibet-policy
south-china-sea
china-middle-east-role       (folds in: Strait of Hormuz / Iran pivot)
xi-power-consolidation
china-taiwan-tensions
```

**13 moment stories:**
```
trumps-2026-china-visit          (already exists)
putins-2026-beijing-visit
liberation-day-tariffs
2025-us-china-tariff-truce
xi-modi-reset
china-economic-stimulus
tiktok-divestiture
fentanyl-china-pressure
china-student-visa-crackdown
us-china-climate-cooperation
pandemic-origin-investigation
usmca-tariff-disputes
eu-steel-tariffs
```

Rough capacity when fully built: ~22 stories, ~126 timeline events, ~150 timeline rows total once the article-anchor pins are counted, ~30–40 articles in the first month of coverage if each moment is covered once and each anchor 2–3 times.

---

## Open items / what the next helper should pick up

1. **Stale-stat / outdated-figure check** — Israel-Hamas article had 857 deaths since the ceasefire (Nov 2025 Al Jazeera figure); I replaced with "hundreds of additional deaths" because I couldn't pin down a clean May 2026 number from one authoritative source. Pull the current figure and tighten if you want a specific count.
2. **AI disclosure on render** — see Drift bug #3.
3. **Pipeline triggers** — article-title-change → re-sync timeline article anchor (Drift bug #1) and `feeds.is_auto_publish` wire-up (Drift bug #3).
4. **TS types drift** on `comments.author_self_tag` and `reply_type` (Drift bug #3).
5. **Future article-helper handoff:** when you ship the next 10 articles, run the same checklist:
   - Fact-check named people, quotes, money figures
   - Plagiarism scan distinctive phrases
   - Voice pass against `editorial-guide.ts`
   - Date rule (no specific dates in body)
   - Quiz integrity (every answer verifiable in current body)
   - Timeline label standalone test
   - Headline + summary anti-repetition

---

## What this doc is not

- Not a substitute for reading `editorial-guide.ts`. The bible has examples and edge cases this doc doesn't.
- Not a current-state pointer. For "what's happening right now in the session," look at `CONTINUE.md` or owner's most recent direction.
- Not authoritative on the DB schema. `web/src/types/database.ts` is the source of truth; this doc may drift.

Verify before you act.
