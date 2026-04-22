# 10 — The Manifest: Headlines, Slugs, Summaries, Bodies, Timelines

**Owner:** Dunford (format ownership), Thompson (editorial enforcement), Veerasingham (wire-service rigor reference), Bascobert (wire-service discipline), the editorial-desk panel (field rules).
**Depends on:** `00_CHARTER.md` (commitment 1).
**Affects:** article authoring workflow, `/admin/story-manager` (validation + compose-time warnings), `articles` table schema, every story detail view, every feed card, every timeline render.

---

## The commitment — read this first

Charter commitment 1: every summary carries three loads — what happened, what changed around it, why it matters. **The reader never sees these loads labeled.** The summary renders as one tight prose paragraph, two to four sentences, no bullets, no headers, no "Fact:" / "Context:" / "Stakes:" prefixes.

This is the critical distinction from every competitor's format play:

- **Axios** labels its bullets ("Zoom in:", "The big picture:", "Why it matters:"). The format is the product.
- **Morning Brew** uses emoji and tone markers. The format is the product.
- **The Skimm** writes in a voice ("Here's the deal"). The format is the product.
- **Verity writes plain prose.** The format is invisible. The *discipline* is the product.

Readers should feel Verity summaries are denser and cleaner without being able to name what's happening. Ours is the one where the labels aren't there, and because of that the reader stays in their own interpretation, doing their own work.

Editors write to the three loads internally as a compositional discipline. At render time, the three editorial fields are concatenated into clean prose. No labels ship.

## Why this matters

Labels are a crutch. Labels tell the reader which sentence to believe, which sentence is context, which sentence is emotional pay-off. Readers who grew up on labeled-summary formats will quickly notice Verity doesn't talk down to them. That is the brand.

It's also harder to write. Which is why competitors do it the other way.

The wire-desk and editorial panel surfaced four additional operational rules that the invisible-structure discipline depends on: headline discipline, slug discipline, timeline discipline, and body-voice discipline. This doc covers all five.

## The three beats, defined

### Beat 1 — Fact

**One sentence.** What happened. Declarative. No adjectives that signal stance. No interpretation.

Good: "The Senate Finance Committee voted 18-10 on Thursday to issue subpoenas for Treasury Department records dating to 2022."

Bad: "In a dramatic bipartisan vote, the Senate Finance Committee stunned observers Thursday by issuing sweeping subpoenas."

The Bad version editorializes ("dramatic," "stunned," "sweeping"). The Good version reports.

Length: strictly one sentence. If the story is complex enough that one sentence can't capture the core fact, pick the single most important fact and treat the rest as context.

### Beat 2 — Context

**One sentence.** What changed. What's at stake institutionally. What the reader needs to know around the fact to make sense of it.

Good: "The subpoenas mark the broadest use of the committee's investigative authority in three years and expand a bipartisan inquiry that had previously focused on a narrower set of sanctions cases."

Bad: "This is a huge deal for the White House and marks yet another attack on the administration's trade policy."

The Bad version editorializes and speculates. The Good version provides institutional context that helps the reader understand the significance without telling them what to think.

Length: one sentence. Subordinate clauses allowed but don't nest more than two.

### Beat 3 — Stakes

**One sentence.** Why a reader should care. What this could mean for them, for the world, or for the outcome. Specific, not generic.

Good: "If the committee's subpoenas survive the expected DOJ challenge, three senior Treasury officials named in the motion will face mandatory testimony that could reshape the department's enforcement priorities for 2027."

Bad: "This is a critical moment for American democracy."

The Bad version is a platitude. The Good version names specific people, specific outcomes, specific timing. Stakes should be concrete enough that a reader who doesn't click through still leaves with a clear mental model.

Length: one sentence. Can be slightly longer than Beats 1 and 2 because it often needs to connect two concrete actors.

## The rhythm is the brand

Over months and years, readers internalize this rhythm. They read a Verity summary and their brain fills in the structure unconsciously. Fact · Context · Stakes. Fact · Context · Stakes. The rhythm becomes a signal: "this is a real news product, not a feed algorithm."

This is why consistency matters so much. A single summary that breaks the rhythm doesn't just fail that story — it weakens the format for every story. Discipline is the asset.

## What it looks like visually

On article pages and feed cards, the three beats render as three paragraphs, separated by clear visual spacing. Not bulleted. Not labeled. Just three short paragraphs in body type.

The feed card shows all three beats when space permits (hero on home page). Secondary cards on home show Fact + Context (the "deck"). Article page shows all three as the opening before the body.

Screenshots of this format — three tight paragraphs — are what readers will share. The format fits in a text message. It fits in a tweet. The format *is* the marketing.

## What the format explicitly refuses

- **No clickbait lede.** ("You won't believe what happened next.")
- **No narrative hook.** ("It was a quiet Tuesday morning when the senator arrived on the Hill...")
- **No opinion framing.** ("The hypocrisy of the GOP vote is hard to overstate.")
- **No "anonymous sources say."** Sources are either named in the body or clearly attributed ("documents reviewed by Verity," "a senior Treasury official speaking on condition of anonymity because...").
- **No "some critics say."** If critics are named, name them. If they're not, they don't exist.
- **No "experts worry that..."** Experts have names and affiliations. If you can't name them, don't reference them.

## The banned-words list (all adult surfaces)

Headlines, decks, summaries, body paragraphs, kickers, email subject lines, OG meta, push text. All of them.

**Banned verbs:** slams, blasts, crushes, shocks, sparks, rams through, soar, soars, plunge, plunges, tanks, skyrockets, explodes.

**Banned modals of speculation:** could, may, might, is poised to, is set to, looms, faces mounting pressure.

**Banned hedges:** reportedly, amid, stunning, bombshell, raises questions.

**Banned unnamed attributions:** critics say, experts worry, some observers note, people familiar with the matter (without a stated reason for anonymity in the same sentence).

**Banned editorializing adjectives:** dovish, hawkish, controversial, explosive, devastating, resounding, stunning, chilling.

The story-manager UI greps compose-time input for these words and surfaces a yellow warning. Editor can override with a written justification that logs to `trust_events` — which means the editor chose, publicly, to use the banned word, and that choice is auditable.

## Headline rules

- **One load-bearing fact.** Subject-verb-object.
- **≤80 characters** including spaces.
- **Preferred verbs:** says, files, rules, votes, buys, sells, resigns, dies, killed, reports, approves, rejects, cuts, raises, holds, adds, removes, begins, ends.
- **Attribution inside the headline** for contested or single-source claims. Omit attribution only for official record (court filings, central-bank decisions, confirmed agency data).
- **The mirror test:** could a reporter who disagreed with our angle write this exact headline? If no, it's an op-ed, not a headline.

## Slug rules

- Headline's load-bearing noun phrase, lowercased, hyphenated.
- No articles (the, a, an), no attribution verbs, no hedges.
- **Dateless by default.** Include a date only when the date is the identifier (elections, scheduled budgets, recurring reports). Never the publication date.
- Keep proper nouns, the action noun, the spine number.

## Summary — the three beats, operationalized

The three beats stay: Fact, Context, Stakes.

**Additional operational rules layered on:**

- **Screenshot-decontextualization test.** Cover the headline with your thumb. Does the summary stand alone? If not, rewrite.
- **Feed-card summary and on-page summary are the same text.** One DB column drives both. No divergence. No A/B. No "condensed for feed."
- **No question-mark endings. No implication verbs.** ("The move raises questions about..." is forbidden. Either the questions have a named source, or they don't exist.)
- **No forward-looking speculation** unless tied to a named actor making a scheduled action ("The next FOMC meeting is January 28, 2026" is fine. "Economists expect another cut" is not, unless a specific economist is named in the same sentence.)

## Article body rules

**The lede:** one sentence, ≤35 words, subject-verb-object. No "as" or "amid" subordinate clauses.

**The nut graf:** 2–3 sentences. Stakes expressed in numbers or named parties. Never "turning-point" abstractions.

**Evidence:** one claim per paragraph. Attribution in the same sentence or the sentence immediately before. Strongest claim first.

**Counter-evidence paragraph is mandatory.** Strongest named objection to the main claim. No dismissive framing. No sneer quotes. If no credible counter exists, say so explicitly: "No named expert has publicly disputed [X] at press time."

**No composite quotes. Ever.** If a source said two things on two occasions, they are two quotes with two attributions.

**Every number has a source** in the sentence or the sentence immediately prior.

**The kicker points to a dated, scheduled, verifiable next event.** Never a rhetorical question. Never a reflection.

## The timeline — the load-bearing feature nobody else ships

Every article carries a timeline, rendered **above the body**.

**Selection, not logging.** A 30-event timeline is a log. A 7-event timeline is journalism. If removing an event does not change the reader's understanding of how we got here, it does not belong.

**Per-event rules:**
- Absolute dates, format "Month D, YYYY."
- ≤22 words per line.
- Preferred-verb list (same as headlines).
- No superscript source numbers. Timeline events read as journalism, not footnoted research.

**Presentation:** vertical, static, printed. No hover-to-expand. No horizontal scrollers. Everything the reader needs is on the page.

**Omission as signal.** If you leave out a widely-reported moment, you are telling the reader it did not change the state of the story. Be prepared to defend every omission in editorial review.

## Gaps live in the prose

Verity does not surface a "What we don't know" labeled section on articles. Labels scaffold the reader; the product trusts the reader.

Instead, gaps are named in the body as reporter statements. Example:

> The Court did not indicate when it would issue a decision. The January 19 deadline is statutory; it does not adjust based on the Court's schedule. ByteDance has not publicly detailed a divestment plan that would satisfy the statute, and the government has not publicly stated what would qualify. No named First Amendment scholar at a peer-reviewed U.S. law school has publicly argued that the D.C. Circuit's reasoning was incorrect as of the time of Friday's argument.

That's four gaps woven through a single paragraph of prose. No heading. No bullet list. The reader absorbs the uncertainty as part of reading the article.

Editorial review (step 8 of the pipeline) flags articles that had items in the research `gaps` array but don't surface any of them in the body prose.

## Kicker rule

The last paragraph of the body ends on a **dated, scheduled, verifiable next event.** A court date. A scheduled meeting. A bill's next vote. A report's release date.

Never a rhetorical question. Never a reflection. Never "what comes next is anyone's guess." If the future is unclear, the prior paragraphs name the specific unknowns — the kicker does not.

## Exceptions

There are three. Each is rare and each is explicit.

### 1. Breaking news where facts are developing

First-hour coverage of a breaking story may fail to fill the Stakes beat because the stakes aren't yet clear. In this case, the Stakes beat reads: "What it means depends on [specific next development we're watching]. We'll update this piece as the picture becomes clearer." Mark the article as `status = developing` in the DB. Revert to full three-beat structure as soon as the facts settle.

### 2. Pure explainer pieces

If the article is an explainer (e.g., "What is the filibuster?"), the summary structure shifts slightly:

- Beat 1: **Topic** — what we're explaining.
- Beat 2: **Why this matters now** — why the reader's seeing this today.
- Beat 3: **What you'll know by the end** — the reader's takeaway.

Explainers are tagged `type = explainer` in articles. The story-manager UI presents the alternate template.

### 3. Expert Q&A pieces

The kids-app and (eventually) adult expert Q&A feature. The summary is the question and the expert's name:

- Beat 1: **Q:** (verbatim kid question, slightly cleaned up)
- Beat 2: **A:** (the expert's top-line answer, one sentence)
- Beat 3: **Why this came up:** (the article that prompted the question)

Tagged `type = expert_qa`. Alternate template.

## What this doesn't apply to

- The comment section — comments are reader-generated, not editorial. Readers write freely.
- Admin-internal notes — not reader-facing.
- The standards doc, corrections feed, editorial log — these have their own structures defined in their respective docs.
- Kids articles — kids content uses a simplified 3-beat format (see `views/ios_kids_reader.md`).

## How editors enforce this

- **Every publish requires `summary` filled** — one prose paragraph. No template. No three fields. UI validation.
- **Soft cap on summary length:** 90 words. Yellow warning over 100. Hard block over 150. Over the cap means the editor is probably restating the article instead of condensing.
- **Banned-words compose-time check.** The story-manager greps the summary and body for the banned-words list. Yellow warning on a hit. Editor can override with a written justification that logs to `trust_events`.
- **Peer review:** every article has a second editor sign-off before publish. The reviewer specifically checks: does the summary survive the screenshot test? Does the body carry a counter-evidence paragraph? Does the kicker point to a dated event? Does the quiz include Type A and Type D?
- **Weekly editorial review:** the team reviews a random sample of 10 articles from the week. Any deviation from the manifest gets logged to the editorial log (per `04_TRUST_INFRASTRUCTURE.md`). Drift is a team problem, not an individual problem.

## Data model

The `articles` table's existing `summary` column stays. One prose paragraph. No split. No three-field composer.

Columns added per `db/10_summary_format_schema.md`:

- `named_sources_count` int — sources cited by name, computed from research
- `document_sources_count` int — primary-source documents
- `anonymous_sources_count` int — anonymous-with-reason sources
- `kicker_next_event_date` date — required on publish, the dated event referenced in the kicker
- `article_type` text — 'standard', 'developing', 'explainer', 'expert_qa'

Also added: `quiz_questions.type` (A–F) for the Type A/D mandatory coverage and the fail-diagnostic.

**Explicitly NOT added:** no `summary_fact` / `summary_context` / `summary_stakes` split, no `what_we_dont_know` column. The summary is one paragraph. Gaps live in the article body as prose. This was debated and decided: scaffolding is the one thing Verity refuses that competitors all ship.

## Rendering

A React component: `<SummaryBlock summary={...} />` takes the single prose string and renders it with token typography. Used on:

- Story detail pages (web + iOS)
- Home feed hero (full summary)
- Home feed supporting slots (full summary)
- Search results (full summary)
- Social share cards (summary rendered as body under headline)

One component, one styling pass (via `08_DESIGN_TOKENS.md`), one format.

## Marketing implications

- **Share cards** (Open Graph images): headline + summary paragraph. No labels. No scaffolding.
- **Newsletter**: subjects + summary paragraphs. Reads like a digest, not a templated product.
- **iOS app Notification Service Extension**: breaking push notifications show the headline; tap to read surfaces the summary and body.

## Acceptance criteria

- [ ] `articles.summary` column holds one prose paragraph per article. No label split.
- [ ] Story-manager UI validates: summary present, body present, kicker date set, quiz covers Type A + Type D, banned-words check runs.
- [ ] Summary word-count warning at 100 words, hard block at 150.
- [ ] Reader-facing summary renders as a single prose paragraph on feed cards and article surface — same text in both places.
- [ ] Article surfaces (web + iOS) render: eyebrow, headline, deck, summary, timeline, body, defection link, quiz, comments — nothing else. No byline, read time, publish timestamp, sourcing row, or sources block.
- [ ] Timeline above body, 4–10 events, absolute dates, exactly one is_current, no superscript source numbers.
- [ ] Every article body contains a counter-evidence paragraph (or explicit statement that no credible counter exists).
- [ ] Every article body carries at least one gap-statement in prose when the research output had gaps.
- [ ] Kicker is a dated, scheduled next event on public record.
- [ ] Weekly editorial review process documented and run.
- [ ] One month into launch, audit 50 random articles. >95% manifest adherence is the bar.

## Risk register

- **Editors find the format constraining and ship violations.** Mitigation: the weekly review + peer sign-off. If violations persist, it's a staffing or training issue, not a format issue.
- **Some stories genuinely resist the format.** Mitigation: the three exceptions exist. If a story doesn't fit any of the three, that's a sign it may not belong on Verity — or the editor needs to think harder about how to frame it. The format is the product constraint.
- **Readers don't notice the format.** Expected in the first six months. The format's power compounds over time. Stay disciplined.
- **Copycats adopt the format.** This would actually be validation and not a competitive threat — format ownership compounds for whoever held it first most disciplinedly. Stratechery's format got copied; Thompson still owns it.

## What this does NOT include

- The article body format — separate set of editorial guidelines.
- The quiz generation — quizzes are derived from the article body, not the summary (see `12_QUIZ_GATE_BRAND.md`).
- The hero / supporting visual treatment — that's in `09_HOME_FEED_REBUILD.md`.
- Social share rendering specifics — brief reference above; full spec would live in a dedicated doc.

## Sequencing

Ship with: `09_HOME_FEED_REBUILD.md`. The format renders on the new home page; the format is the reason the home page works without images.
Ship before: any marketing push. Marketing can't refer to the format until the format is shipping reliably.
Pairs with: `17_REFUSAL_LIST.md` (the format is a visible form of the refusal: "no clickbait" is structural, not aspirational).
