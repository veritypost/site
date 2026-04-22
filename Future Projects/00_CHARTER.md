# 00 — The Charter

**Owner:** Bezos (final authority on whether a decision serves a ten-year reader), Thompson (final authority on editorial posture).
**Status:** Constitutional. Changes require both owners to sign.
**Last reviewed:** 2026-04-21.

---

## What this is

The commitments that define Verity. Everything downstream in this folder serves one of them. If a proposed change doesn't serve any of them, it doesn't belong.

This is a constitution. It is deliberately short. It is deliberately rigid. Operating principles are expensive to write and cheap to abandon, which is why most products don't have them. Verity has them. Break one and the product degrades. Keep them all and the product compounds.

---

## The commitments

### 1. Every Verity article has a tight summary. Prose only. No labels. No frameworks.

The summary is one paragraph — usually two to four sentences — that tells the reader what happened. No "Fact / Context / Stakes" breakdown, not even internally. No "The big picture:" bullets. No "Zoom in:" prefixes. No tone markers. No emoji. Just clean, dense prose written by an editor who knows what they're doing.

The reader interprets. Verity does not signpost which sentence to trust, which is the take, which is the implication. The reader is trusted to read a paragraph and understand it. That trust is the brand.

Competitors own the labeled-structure lane — Axios built a company on bullets, Morning Brew on emoji and tone, The Skimm on voice. Verity is the opposite. One summary paragraph, written well, no scaffolding visible.

Editors write it. It ships. That's the whole discipline.

**Banned verbs and phrases — all adult-surface headlines, decks, summaries, and bodies:**
slams, blasts, crushes, shocks, sparks, could, may, reportedly, amid, rams through, stunning, bombshell, looms, faces mounting pressure, raises questions, critics say, is poised to, is set to, soar, plunge, dovish, hawkish.

This is a constitutional specification, not a style guideline. The story-manager UI flags violations at compose time.

**The screenshot-decontextualization test.** Every summary must stand alone if the headline is covered. If a reader screenshots just the summary, it has to remain true. The feed-card summary and the on-page summary are the same text, driven from the same DB column. No divergence permitted.

**Absolute dates only.** "February 14, 2024" — not "last Tuesday," not "in recent months," not "amid rising tensions." "Amid" is a tell of a writer who didn't look up the date.

**Anonymous sources require a stated reason in-line, or they are cut.** "A senior Treasury official speaking on condition of anonymity because they were not authorized to discuss the matter publicly" is permitted. "Sources say" is not.

### 2. The front page is chosen by a human and dated.

No algorithmic feed. No infinite scroll. No engagement-optimized ranking. The front page is an artifact of editorial judgment, on a specific day.

The date is visible. The choices are auditable.

There will come a day — probably six months in — when someone argues that an algorithm would lift engagement. The argument will be correct, narrowly. Refuse it anyway.

**Every article carries a timeline above the body.** Not below. Not as an appendix. Chronology before narrative forces the writer to honor the facts — Nielsen's trust research is the tiebreaker. The rule is selection: **a 30-event timeline is a log; a 7-event timeline is journalism.** If removing an event does not change the reader's understanding of how we got here, it does not belong.

**Gaps in the reporting go in the prose, not in a labeled section.** No "What we don't know" header. No sidebar. A sentence inside the body that says "ByteDance has not publicly detailed a plan that would satisfy the statute" carries the uncertainty where it belongs — in the voice of the piece.

### 3. Comments are earned through the quiz gate.

A reader cannot comment on an article without passing a 3-of-5 comprehension quiz. This isn't a feature. It's the reason Verity comments are worth reading.

The gate is visible everywhere comments appear — every thread carries a small permanent marker that says these readers passed. The gate is the signal.

### 4. The article is the product.

The reader never sees a byline on the article itself. No "by [name], Reporter." No "5 min read." No "posted 2h ago." No sourcing-strength row. No corrections banner. No list of source documents at the bottom.

All of that is production metadata. Verity's product is the reporting. When the reader opens a piece, they see a category, a headline, a deck, a prose summary, a timeline, the body, a link to where else the story is covered, the quiz gate, and the comments. Nothing else surrounding the content.

Attribution inside the prose stays — every quote has a named speaker with role, every number has its source in the sentence. That's writing, not metadata.

If a fact is later corrected, the prose reflects the current state of our knowledge. We don't run stealth edits and we don't surface correction trails on the article. The piece you read today is the piece we stand behind today.

### 5. Engagement-bait is not a trade-off. It's a refusal.

When a decision is between optimizing for engagement and optimizing for honesty, honesty wins. Every time. Publicly.

This refusal is the moat. Competitors can't follow without destroying their own revenue models. The day Verity ships one engagement-bait headline, one algorithmic feed tweak, one dark-pattern paywall, the moat drains.

---

## What the commitments explicitly exclude

- **No bias meters, no left/right chips, no "both sides" framing.** Verity reports facts. Curation has opinion. Reporting does not.
- **No autoplay video.** A reader opens Verity by choice and leaves the same way.
- **No push notifications optimized for re-engagement.** Breaking news only.
- **No infinite feed.** Front page has a bottom. A reader finishes the day.
- **No emoji on adult surfaces.** Kids iOS is the only exception.
- **No engagement metrics in UI.** A reader does not see "X people read this."
- **No bylines, no read times, no publication timestamps on articles.** The article stands on its own (commitment 4).
- **No sourcing-strength row, no corrections banner on articles, no sources-block at article end.** See commitment 4.
- **No A/B testing of the Charter.** Everything else is testable. These commitments are not.

---

## What changes when a commitment breaks

Because they will. Slowly, by accident, through drift.

- A headline gets clickbait-y. **Refuse the piece.** Coaching, not firing, the first time. Second time, it's a staffing problem.
- An editor hands the front page to a ranking algorithm for a weekend. **Revert.** Same day.
- A paywall copy change says "upgrade to unlock." **Every paywall surface is rewritten as invitation. If it's not invitation, it ships again.**
- A byline slips onto an article. **Remove.** If the production pipeline reintroduces metadata, the pipeline is broken — fix it.

## What the commitments are worth

Nothing, unless the reading experience reflects them. The Charter is an internal operating document — it does not ship as a public page, and it doesn't need to. Readers don't need to be told the rules. They need to feel them in the product.

The day a reader finds Verity because someone they trust said "this is the only news site I actually read" — that's the day the commitments became a business.

---

## Sign-off record

The Charter reflects multiple rounds of editorial review. Most recent pass: 2026-04-21, removing per-article production metadata (bylines, read times, publication timestamps, corrections UI on articles, sourcing-strength row, sources block) and removing the public standards / refusals pages from the launch plan. The article is the product; scaffolding around it and scaffolding around the project are both cut.

Next scheduled review: when a commitment is broken, or at 12 months, whichever comes first.
