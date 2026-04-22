# 06 — Defection Path

**Owner:** Thompson (primary — he surfaced this in the hardass session and the original 34-panel missed it entirely), Bell (trust infrastructure tie-in), Bascobert (source-linking discipline).
**Depends on:** `00_CHARTER.md` (commitment 4), `04_TRUST_INFRASTRUCTURE.md`.
**Affects:** every article page, new DB table, new admin workflow, new reader-facing UI element.

---

## The gap

Current flow when a reader finds a Verity story they don't trust or want to verify: close the app, Google the story themselves, try to find coverage elsewhere, maybe find something, maybe not, maybe return, maybe don't.

That's lethal. A reader who suspects Verity is wrong and has to leave the product to check us loses the reading session and the trust.

## The fix

Every article has a small visible element — call it the defection line — that names where else this story is covered and links to the most credible source outside Verity.

Not a "you might also like." Not an algorithmic "related." Specifically: here is the original source if we cited one, and here is one named outside outlet covering the same event.

Reader clicks: they leave Verity. That's fine. They're going to check us. Better they leave and come back trusting us than stay and doubt us.

## The artifact on the page

Below the article body, above the comments, a single-line element:

> **See also:** [AP — Senate Finance Committee Votes to Expand Probe](link) · [Original Treasury IG report (PDF)](link)

Two slots. The first is a reputable competitor or wire service covering the same event. The second, if relevant, is the original source document — a court filing, a public report, a primary document. If there's no primary source document, the second slot is another outlet at a different political valence (e.g., if AP is slot 1, the Wall Street Journal or FT might be slot 2).

The point is not "bias balance." We don't do bias scoring. The point is: here are three separate pieces of evidence for this story, go check us.

### What about when a competitor is wrong and we're right?

It happens. We still link them. A reader clicking through and finding contradictory reporting is not a loss — it's an opportunity for the reader to see Verity was more careful. The defection path is a trust move, not a comparison move.

### What about when we broke the story?

If Verity broke the story, the defection line reads:

> **Verity reported this first.** See [Treasury IG original filing (PDF)] for the primary source.

One slot is enough when we're the origination point.

## Why this is the trust move

Bell in the hardass session: "The AP has trust because they've been wrong roughly never about facts for 178 years. Reuters has trust because wire-service discipline is a physical infrastructure. What's your trust infrastructure?"

Thompson's answer: "Every article should link to its peers. If we're the only source on something, the reader should know. If we're not, the reader should see who else is on it. The Browser does this. Semafor does this. Ben Thompson does this. Major-outlet exclusivity is a trust-destroying posture. Transparency about who else is on the beat is a trust-building posture."

## The mechanics

### Data model

New table `defection_links` (see `db/05_defection_links_table.md`). Columns:

- `id` uuid primary key
- `article_id` uuid fk → articles
- `slot` integer — 1 or 2
- `outlet_name` text — "AP", "Reuters", "Wall Street Journal", "Primary document"
- `url` text
- `link_type` text — one of `peer`, `primary_source`, `background`
- `curated_by_user_id` uuid fk → users (which editor added this)
- `created_at` timestamptz

Two rows per article at most. Added by the reporter or editor at publish time. Editable by any editor with `editorial.defection.edit` permission.

### Publishing flow

When an article is pushed to publish state, the publish UI requires at least one defection link filled in. This is enforced in the admin story-manager UI, not in the DB.

Exception: owner-flagged "Verity exclusive" articles can skip the peer link if no peer coverage exists. In that case, the primary-source slot must be filled (or a clear note: "no public primary source available — reporting based on [X]").

### Reader experience

Below the article body, above the quiz, a simple element. No buttons, no icons that invite confusion. Just a line:

> **See also:** [link] · [link]

Hover reveals the outlet name if not in the visible text. Click opens in a new tab (`target="_blank" rel="noopener noreferrer"`). The click is tracked (see below) but not prevented or slowed.

### Click tracking

Track every defection click. Not to "re-engage" the reader, but to know:

- Which articles get the most defection clicks (potential trust signal — reader uncertainty about those stories).
- Which outlets our readers trust enough to click through to.
- Whether defection correlates with return rate (do readers come back after defecting?).

New analytics event type: `defection.click`. Payload: `article_id`, `slot`, `outlet_name`, `user_id` (if authed). Stored in the existing `events` pipeline.

### No retention tricks

Explicitly refused by the panel:

- No "before you leave, here's our [X]" interstitial. Respect the decision.
- No "are you sure?" modal on external link click.
- No delayed redirect with a countdown. If they click, they go.
- No "Verity users also trust..." algorithm deciding which outlet to link. Editor-curated.

## What this doesn't include

- **Not related articles from Verity.** That's a separate discovery UX — different doc if we ever build it.
- **Not a bias-balance tool.** We pick outlets based on editorial quality, not political valence.
- **Not a "trusted source" badge.** We don't rate other outlets. We link them.
- **Not a reader-submitted link feature.** Readers can suggest via the "See a problem?" button (see `04_TRUST_INFRASTRUCTURE.md`) but editors curate.

## The list of outlets we'll commonly link

Not prescriptive. Guidance for editors. Real list evolves.

- **Wire services:** AP, Reuters, AFP, Bloomberg wire
- **Major outlets:** NYT, WSJ, WaPo, FT, The Economist
- **Specialist outlets:** ProPublica, Reveal, The Marshall Project (investigations), Bellingcat (OSINT), Just Security (legal/policy), Politico Pro (political insider)
- **Primary sources:** .gov filings, federal agency reports, court filings on PACER, congressional hearing transcripts, company press releases for corporate news
- **International:** BBC, The Guardian, Le Monde, Der Spiegel when story is globally relevant

We avoid explicitly partisan outlets (Fox News, MSNBC, Breitbart, Jacobin) because linking them is an editorial act that connotes "this is a valid alternative read." Editors may include them if genuinely relevant, but default avoid.

## Implementation order

1. **DB migration** — `db/05_defection_links_table.md`
2. **Admin story-manager UI** — two text fields per article at publish, with "outlet + url" pattern. Validation that URL is http(s) and not internal.
3. **Reader surface** — below-article element renders the two links. See `views/web_story_detail.md`.
4. **iOS** — mirror surface on `StoryDetailView.swift`. See `views/ios_adult_story.md`.
5. **Analytics** — defection.click event into existing pipeline.
6. **Editorial guidelines** — short internal doc for editors on which outlets to prefer, how to handle Verity-exclusive stories, when to link primary source vs peer.

## Acceptance criteria

- [ ] `defection_links` table exists with RLS.
- [ ] Story-manager UI enforces at least one defection link before publish (with exclusive exception).
- [ ] Every published article page (web + iOS) displays the defection line below body, above comments.
- [ ] Clicks tracked in analytics pipeline.
- [ ] No dark-pattern around the click (no modal, no delay, no warning).
- [ ] Editorial guidelines doc exists and is referenced in story-manager UI.
- [ ] Test: a reader clicks a defection link, leaves Verity, comes back — session resumes correctly.

## Risk register

- **Readers click through and don't come back.** Expected. The trust-building effect compounds. Short-term metric loss for long-term compound. Measure return rate over 30-day window.
- **Editors get lazy and link the same outlet every time (e.g., always AP).** Mitigation: internal guidelines recommend variety; weekly audit via a query on `defection_links` group by `outlet_name`.
- **External URLs break.** Mitigation: quarterly script checks all links for 200 response; flags broken links to editors.
- **Defection gets gamed** — somebody pays us to link their outlet. Explicit refusal: defection links are never monetized. Separate doc would be needed to formalize that as policy.

## Sequencing

Ship after: `04_TRUST_INFRASTRUCTURE.md` (corrections + standards doc establish the trust infrastructure this belongs to).
Ship before: any major PR push. This is part of what makes the product fundamentally different.
Pairs with: `12_QUIZ_GATE_BRAND.md` (two elements of the trust-visible product).
