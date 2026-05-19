# Article Seed Runbook

Concrete pre-persist checklist for manual seed runs — when an agent (or owner) is writing articles directly via the `persist_generated_article` RPC instead of running the live pipeline. The editorial bible at `web/src/lib/pipeline/editorial-guide.ts` is the source of truth on voice. This doc is the operations checklist that makes sure the bible's rules actually land in the database row.

Written 2026-05-18 after the 10-reviewer adversarial panel surfaced a uniform blind spot in the first manual-seed batch. Update when new rules are added to the bible.

---

## When to use this runbook

- Owner asks for a manual article batch ("seed me 4 health pieces," "scour the news, write up X").
- Pipeline orchestrator is down or being bypassed.
- A specific story that the live pipeline's discovery/cluster step won't find on its own (niche health, off-wire investigative, foreign press scoops).

Do NOT use this runbook for stories the live `/api/admin/pipeline/generate` flow would handle. That's what the pipeline is for. Manual seeds are for content the pipeline isn't designed to surface.

---

## Phase 1 — Recency verification (do this BEFORE you start writing)

Aggregators (ScienceDaily, TechTimes, etc.) routinely recycle old papers as "this week" stories. Verify the underlying event date before treating anything as news.

For each candidate story:

1. Find the underlying primary source (the paper's DOI, the agency press release, the court filing, the report PDF).
2. Confirm its publication / event date is genuinely within the past week.
3. If the underlying date is older than a week, ask whether the candidate qualifies as a buried-but-current story (under-covered by major US outlets) or is a stale recycle.
4. Stale recycles get cut. Tell the owner.

The first batch lost 3 of 4 picks to this check.

---

## Phase 2 — Research (for each story)

Cast wide, then verify the gaps the bible's new rules require:

- **Source-actor identity:** Who funded / founded / runs the institutional source you're citing? (Amnesty → London-based, Western-funded NGO. NABU → US/EU-aid-conditioned 2015 establishment. NPR → US public radio.) Get the one-clause origin tag.
- **Methodology:** How did the source institution arrive at the number? What's excluded? What's estimated? This is the input to the methodology graf the bible requires.
- **Unnamed actors:** If your sources reference "a private developer," "a defense contractor," "a foreign government," etc. — search for the proper name. If you can't find it, you'll need to say so explicitly in the article.
- **Buried threads:** Any time a fugitive is "fled to" or "hiding in" somewhere, find the context (citizenship, extradition posture, prior business). The bible bans throwaway location clauses.
- **Codenames:** If the source uses one ("Operation Midas," etc.), find who minted it (usually the agency itself).
- **Additional outlets:** For any story built on a single secondary source, find at least one more outlet — ideally with different priors or a different geographic base — that covered the same event.

Wikipedia for historical timeline backfill is fine. Wikipedia for article body content is not (CC-BY-SA license incompatibility — find the primary source Wikipedia cites).

---

## Phase 3 — Write per the bible

Open `web/src/lib/pipeline/editorial-guide.ts`. The `EDITORIAL_GUIDE` constant is the canonical voice spec.

Pre-flight check before drafting:
- [ ] Headline 8-14 words, no clickbait, includes what happened + story-arc anchor.
- [ ] Subtitle ~30 words, opens with a fact NOT in the headline.
- [ ] Body target 350 words, range 250-450.
- [ ] Paragraphs ≤70 words each, max 2-3 sentences.
- [ ] F-pattern openers — first 3-5 words of every paragraph carry the concept noun.
- [ ] No specific dates in body (year-only OK only as scale comparison; otherwise relative time).
- [ ] No banned adjectives or banned verbs (see bible).
- [ ] Active voice default; passive only when patient is the news.
- [ ] **Ten** quiz questions per article (pool), distributed 2 easy / 4 medium / 2 connection / 2 hard. The live UI serves 5 at random per attempt via `ORDER BY random() LIMIT 5` in `start_quiz_attempt`. Every correct answer must be verifiable in the body; every question must stand alone (no question depends on a sibling).
- [ ] **Five-to-ten deeper-dive resources per story slug** — Wikipedia entries on the named people / agencies / places / concepts, primary documents (DOI, court filing, agency PR), official pages, academic background. Insert into `story_resources` table after the persist call (the RPC does not yet accept resources in payload; do it as a follow-up SQL batch).

Pre-flight check for the new (2026-05-18) rules:
- [ ] Every institutional source gets a one-clause origin tag the first time it appears.
- [ ] Methodology graf present if the story relies on a single aggregator's count.
- [ ] Codenames attributed to the actor that minted them.
- [ ] Source-combined unlike categories disaggregated before citing the combined figure.
- [ ] All "private developer / contractor / investor" type placeholders either named or flagged as unidentifiable.
- [ ] No throwaway "fled to X" / "hiding in X" / "said to be in X" without the why.
- [ ] If single-outlet sourcing: named reporter cited, additional outlet credited, explicit verification disclosure.
- [ ] No LLM sentence-template fingerprints (see rule 20 in the bible — "X% of Y% under matched conditions," three-clause em-dash appositive ledes, parallel-triplet openers).

Topic-swap test, both levels:
- [ ] Level 1 (adjective/tone): swap the topic — would the sentence read the same? If no, framing leaked.
- [ ] Level 2 (source-choice): swap the anchor source for one with opposite priors — would the framing still hold? If no, the source was doing framing work the byline should have done.

12+ comprehension check (read the draft as a smart 12-year-old would):
- [ ] Lede states the actual event or move in plain English BEFORE the technical name. If the lede only works for someone who already knows the field, rewrite.
- [ ] Every technical or specialist term glossed on first use, in a single comma-set or em-dash aside. ("kickbacks — illegal payments in exchange for awarded contracts," "extradition, the formal transfer of an accused person between countries to face charges.")
- [ ] Every official, agency, or institution named with its role on first appearance. ("Andriy Yermak, President Zelensky's former chief of staff," not bare "Yermak.")
- [ ] No synonym thickets — same concept = same name across the article. Vary sentence shape, not vocabulary.
- [ ] No "would only read for context" paragraphs — if a 12-year-old would skip it, an adult will too.

No-quotes / no-outlet check (added 2026-05-18, ABSOLUTE — supersedes prior carve-outs):
- [ ] **No direct quotes in body.** Search the draft for `"` and confirm every quotation mark wraps a factual label (Operation Midas, Dynasty, ghost face) — not a speaker's sentence. Strip every direct quote and replace with reported fact.
- [ ] **No inline news-outlet references.** Search for outlet names (NPR, CBS, Reuters, AP, Bloomberg, Axios, NYT, WaPo, Lawfare, etc.). Strip every inline occurrence; the sources block carries the credit.
- [ ] **Speech-attribution verbs stripped:** said, told, stated, declared, described as, characterized as, claimed, asserted, called X a Y. Replace with action verbs (confirmed, signed, ordered, paid, fired, etc.) or strip entirely.
- [ ] **Codenames and nicknames are NAMES, not quotes.** Capitalize and drop the quotation marks. Dynasty, not "Dynasty." Operation Midas, not "Operation Midas." Vova, not "Vova."

Story-flow check (added 2026-05-18 after the 5-lever uplift):
- [ ] **Lede ranked.** Named human > sensory image > institutional subject. Pick the highest available rank. If institutional, at least one piece in the same batch must lead with a named human (HUMAN ANCHOR rule).
- [ ] **One concrete, surprising detail per piece** the reader will remember a week later. Chosen before drafting. Without it, the piece is unfinished. ("A four-mansion compound with a spa and pool." "Florida 19." "Ghost face." "Mats under a shed outside our pastor's house.")
- [ ] **Rhythm hit.** At least one sentence ≤6 words AND at least one sentence whose length is at least 3× the short. Place the short at a turn, landing, or after a long technical run.
- [ ] **Kicker discipline.** Body closes on the most resonant fact, NOT on a verification hedge. If a piece needs a disclosure that Verity Post relied on a chain or couldn't independently verify, that line lands in the body (a one-clause acknowledgment of which outlet did the primary work) or the piece doesn't ship. There is no separate verification-disclosure surface (an earlier draft of this rule pointed hedges at an articles.verification_note column; owner killed that column 2026-05-19).
- [ ] **Observational sentence permission.** At most one per piece. Strictly verifiable — defensible to a hostile fact-checker via measurement, named-prior comparison, or documented event. If unsure, omit.

---

## Phase 4 — Build the persist payload

The RPC signature is `persist_generated_article(p_payload jsonb)` returning `(article_id, story_id, slug, audience)`. The TypeScript surface is `PersistArticlePayload` in `web/src/lib/pipeline/persist-article.ts`.

**Required fields:**
- `audience` — `"adult"` or `"kid"`
- `title` — the article headline (this also becomes the auto-derived story slug; you'll fix the slug post-persist)
- `body` — markdown, plain text with literal quotes, em-dashes, accents
- `body_html` — HTML, **must encode entities**: `&quot;` for `"`, `&#x27;` for `'`, `&mdash;` for `—`, `&egrave;` etc. for accents
- `category_id` — UUID from `categories` table; pick a real category that fits, not a stretch
- `ai_provider`, `ai_model`, `prompt_fingerprint` — for manual seeds use `'anthropic'` / `'claude-opus-4-7'` / `'manual-seed-YYYY-MM-DD-vN'`

**Pass empty string (NOT a fresh UUID) for:**
- `cluster_id` — has FK to `feed_clusters`; if you mint a UUID that doesn't exist the persist fails. The RPC turns empty string into NULL.
- `pipeline_run_id` — same logic. Empty string OK.

**Metadata tag** every manual seed for later auditing:
```json
"metadata": {"editorial_source": "manual-seed-claude-opus", "seed_run": "2026-MM-DD-pilot"}
```

**Sources, timeline, quizzes:** arrays. See `PersistArticlePayload` types in `persist-article.ts` for exact shape. Quiz options carry `{text, is_correct}`; the RPC strips `is_correct` and stores the correct index in `quizzes.metadata.correct_index`.

**Timeline events:** `event_date` accepts `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. When you only know the year or month, also set `date_display` (e.g., `"Jul 1990"`, `"2024"`) so the render doesn't fake the day. The RPC auto-creates one `type='article'` anchor row pointing at the new article; don't include it in your timeline array.

---

## Phase 5 — Post-persist story metadata fix

**This is the documented pipeline gotcha. Always run it.**

The RPC creates a `stories` row with `slug` and `title` derived from the article's headline — both wrong for arc-level story metadata.

```sql
UPDATE stories
SET slug = 'arc-level-slug-here',
    title = 'Arc-level story title',
    description = $$One-sentence description of what the slug covers across time.$$
WHERE id = '<returned-story_id-from-RPC>';
```

Examples:
- Article: "Cassidy loses Louisiana primary as Letlow and Fleming advance to runoff"
- Story slug: `2026-louisiana-senate-primary`
- Story title: `"2026 Louisiana U.S. Senate race"`
- Story description: one-sentence arc summary

---

## Phase 6 — Verify the row landed clean

```sql
SELECT
  (SELECT COUNT(*) FROM sources WHERE article_id = '<article_id>') AS srcs,
  (SELECT COUNT(*) FROM timelines WHERE story_id = '<story_id>' AND type='event') AS evts,
  (SELECT COUNT(*) FROM timelines WHERE story_id = '<story_id>' AND type='article') AS anchor,
  (SELECT COUNT(*) FROM quizzes WHERE article_id = '<article_id>') AS quizzes,
  (SELECT status FROM articles WHERE id = '<article_id>') AS status;
```

Expected: sources matches your sources array length; evts matches your timeline array length; anchor = 1 (the auto-created row); quizzes matches your quizzes array length; status = 'draft'.

---

## Phase 7 — Publish (only when owner says go)

```sql
UPDATE articles
SET status = 'published',
    published_at = now(),
    moderation_status = 'approved'
WHERE id = '<article_id>' AND status = 'draft';
```

The HTTP API equivalent (`PATCH /api/admin/articles/{id}` with `status='published'`) also runs server-side `renderBodyHtml(body)` re-sanitization. If you wrote `body_html` clean (with proper entity encoding), the direct SQL is equivalent. If you didn't, use the HTTP API so the sanitizer runs.

---

## Phase 8 — Adversarial review (recommended for the first batch in a new lane)

For new categories or unfamiliar editorial territory, dispatch a panel of hostile readers — 6-10 personas spanning left/right/religious/decolonial/local/skeptical lanes — to critique the batch before publishing. The first manual seed batch did this and surfaced uniform blind spots that no single-reviewer pass would have caught.

Pattern that works: feed each reviewer all article texts + the bible context + their persona prompt + "tell me why you'd never read this site." Synthesize the unanimous complaints into specific edits. The unanimous complaint is the editorial bullseye that the bible's existing rules don't cover yet — and the candidate for a new rule.

When a new rule earns its place this way, add it to `editorial-guide.ts` inside the relevant thematic section, document it in the file's provenance header, and update this runbook with a new Phase 3 checklist item.

---

## Reference: live URLs after publish

- Public: `https://veritypost.com/{story.slug}` — bare slug works when a story has one article. `?a={article_id}` deep-links to a specific article inside a multi-article story.
- Admin review: `https://veritypost.com/admin/story-manager?article={article_id}`

---

## What this runbook is not

- Not a substitute for reading `editorial-guide.ts`. The bible has examples and edge cases this doc doesn't.
- Not the canonical source on the persist RPC schema. `web/src/lib/pipeline/persist-article.ts` and the SECURITY DEFINER function body in the database are the source of truth.
- Not authoritative on what stories are worth writing. That's editorial judgment, not procedure.

Verify before you act.
