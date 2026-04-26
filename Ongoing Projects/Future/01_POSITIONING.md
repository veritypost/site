# 01 — Positioning

**Owner:** Dunford (positioning lead), Thompson (editorial sign-off), Lessin (business model sign-off).
**Depends on:** `00_CHARTER.md`.
**Affects:** every marketing surface, every paywall, the App Store listing, every ad, the home page wordmark.

---

## The one-sentence positioning

**Verity is the news site where the comments are worth reading — because commenters proved they read the article.**

That's the pitch. Nine seconds. Names the category (news), names the differentiator (comments worth reading), names the mechanism (proof of reading). Every other positioning variant fell short of one of those three.

## The three-sentence pitch

For the about page, the App Store subtitle, the first-time-visitor hero, the ad copy:

> Verity is a news site where every article ends in a 3-of-5 comprehension quiz. Pass the quiz and the comment section unlocks. Which means the people in the conversation actually read the piece — and the conversation is worth having.

Notice what's not in the pitch: no AI, no algorithm, no personalization, no community, no kids, no subscription. Those are features, not the pitch. The pitch is the quiz gate and what it does to the comment section. Everything else is what the quiz gate enables.

## The longer pitch (for deeper surfaces — FAQ, press, investor conversations)

> Most news sites are optimized for engagement. Verity is optimized for comprehension. We write clear summaries, date the front page, link our sources, and gate the comments behind a short quiz that proves you read the piece. The result is a news experience where the reading is efficient and the conversation is honest.
>
> We also build the only kids news app that treats young readers like readers — no patronizing, no cartoon mascots, no fake "social" features. Just real stories, written clearly, with the same quiz mechanic adapted for the age group.
>
> Adults and kids share one family subscription. The reading habit starts at seven and carries through adulthood. That lifecycle — reader-years, not monthly actives — is what we measure.

## What Verity is not

This is the antidote to positioning drift. When someone proposes a feature, check it against this list. If it collapses a distinction, the feature is wrong.

- **Not an aggregator.** Aggregators don't write. Verity writes.
- **Not a newsletter.** Newsletters don't have a comment layer. Verity's whole point is the comment layer.
- **Not a social network.** Social networks optimize for engagement graph. Verity optimizes for comprehension per article.
- **Not a neutral wire service.** AP and Reuters are neutral, no comment layer, no opinion at all. Verity is neutral in *content*, opinionated in *curation*.
- **Not a bias-chart tool.** Ground News tells you what the left said vs. what the right said. Verity does not. Verity tells you what happened.
- **Not Reddit with better styling.** Reddit lets anyone comment on anything. Verity gates comments behind reading. Different product.
- **Not a kids' learning app.** Not Khan Academy, not Newsela, not News-O-Matic. Verity is a news product that happens to have a kids lane. The adult product is the core.

## The positioning triangle

On the left-right spectrum most news products use, Verity doesn't fit. Verity's axis is different:

- **Engagement-optimized** (left): most modern news sites. Algorithmic feeds, clickbait headlines, infinite scroll, rage content.
- **Neutrality-optimized** (center): AP, Reuters, wire services. No opinion, no comment, no community.
- **Comprehension-optimized** (right — where Verity lives): clear summaries, sourced facts, an earned comment layer, a dated front page. Opinions happen in the comments, not in the copy.

The category doesn't have a word for this yet. "Comprehension journalism" is the working internal term. Don't use it externally — readers don't care about the category name. They care about the product experience.

## Audience segments (for ad and channel work)

Not one audience. Five, in descending order of near-term commercial value:

### 1. The tired reader (primary)

Adults 30–55 who've been burned by engagement-optimized news and have been looking for something that respects their time. Highly motivated once they find it. Willing to pay.

Messaging: "News without the noise." "Finally, a news site that respects your time." Lead with the quiz mechanic and the dated front page.

### 2. The informed parent (primary — because of kids wing)

Parents 30–50 who want their kids reading real news without getting rotted by TikTok. The kids app is the wedge. The family subscription captures both sides.

Messaging: "Real news your kids can actually read." Lead with the kids product; back-end-load the adult product as the bonus.

### 3. The teacher / educator (distribution lever)

Middle and high school teachers of social studies, civics, current events. Free educator accounts; they distribute to parents organically. Not a revenue segment — an acquisition channel.

Messaging: media literacy framing. "The news app for civics class." Lead with the quiz mechanic as a pedagogy tool.

### 4. The commenter-first reader

Readers who care more about comment quality than reading speed. Reddit refugees, forum loyalists, people who got tired of shallow takes. Smaller segment but extremely high LTV — they use the product daily and evangelize.

Messaging: "Comments worth reading — because commenters read the article."

### 5. The institution

Newsrooms, think tanks, policy shops, universities. Not a consumer segment — a credibility one. Verity being used internally at AP, at Columbia, at the Brookings Institution is a signal that compounds in press coverage.

Messaging: none direct. This segment is earned through institutional relationships and press coverage, not purchased.

## What we stop saying

These phrases are positioning drift. They appear in older docs and mockups. They need to leave every surface.

- **"No spin, no bait, just news."** Too generic. Every outlet says this. Replace with the quiz mechanic.
- **"The news app for the whole family."** Implies one app. It's two apps linked by one subscription. Say so.
- **"Real news for real kids."** Fine for an ad headline, not for positioning. Back-seat.
- **"We're like Reddit meets Drudge."** Internal shorthand only. Never external. Readers who know Drudge are older than our primary segment and the reference dates the product.
- **"Built by someone who loves honest reporting."** No. We don't sell the founder. We sell the product.
- **Anything with "revolutionary," "game-changing," "next-generation."** These are tells that the positioning isn't clear.

## The tests this positioning has to pass

1. **The sibling test.** If your sibling heard the one-sentence pitch, could they explain Verity accurately to a friend? Yes.
2. **The headline test.** If a journalist wrote a piece about Verity using only the positioning doc, would the headline be accurate? Yes — "The news site that makes you pass a quiz to comment."
3. **The competitor test.** Can you name three competitors and explain why Verity isn't one of them? Yes: Apple News (aggregator, no comment layer), Ground News (bias chart, no earned comments), The Athletic (sport-specific, no kids product).
4. **The refusal test.** Does the positioning rule out any feature the team might be tempted to build? Yes: no algorithmic ranking, no bias chart, no kids-only product without an adult tie-in.

If a proposed feature breaks any of the four tests, it's not a feature problem — it's a positioning problem. Go back to the doc.

## Acceptance criteria

- [ ] Every marketing surface (home page hero, App Store listing, ad copy, press release, FAQ) uses the one-sentence pitch verbatim or a tightened variant that preserves the three elements.
- [ ] The About page explicitly lists the "what Verity is not" items.
- [ ] The kids product positioning is subordinate to the adult product positioning on every adult-facing surface and primary on kids-facing surfaces.
- [ ] No positioning surface contains "no spin, no bait, just news" or other drift phrases.
- [ ] When a feature is proposed, the spec references whether it serves the positioning or breaks it.

## Dependencies and sequencing

- Blocks: any new ad creative, any press release, the marketing site copy pass.
- Blocked by: nothing. This is a starting doc.
- Pairs with: `00_CHARTER.md` (positioning says what Verity is; the Charter says how Verity behaves).
