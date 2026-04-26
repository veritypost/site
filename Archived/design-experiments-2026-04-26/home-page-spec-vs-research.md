# Home Page: Current Spec vs. Research — Gap Analysis

## Where They Agree (keep these, they're solid)

**No algorithmic feed, no infinite scroll, no engagement tricks.** Both the Charter and the research land here hard. The research actually validates this even more strongly than the spec does — Artifact's collapse and SmartNews's decline are the evidence. The Charter's "refuse it anyway" stance is backed by data.

**Editorial hierarchy with a dominant hero.** The spec gives slot 0 a bigger headline and a deck. The research says this is the single most important layout decision. Agreement.

**A "That's today's front page" finish state.** The spec has it. The research calls the Espresso finish-cue "the single most-praised anti-engagement move in the entire research corpus." You're already doing the right thing.

**Typography-forward, restrained design.** The spec says "no card backgrounds, no shadows, no chrome." The research says the apps that feel most alive "commit to a print-inherited visual hierarchy and execute typography, curation signals, and restraint with unusual discipline." Same energy.

**Breaking strip used sparingly.** The spec requires Senior Editor sign-off. The research says Drudge's siren works because it's used once a week, and CNN's permanent "BREAKING" banner is meaningless. Same principle.

**No streaks, no gamification on home.** Spec moves the streak card to profile. Research explicitly names streak mechanics as a refused technique.

---

## Where They Conflict (the Charter intentionally rejects what the research recommends)

These are the hard ones. The research makes a strong case for each of these, but the Charter explicitly says no. These aren't gaps to "fix" — they're philosophical choices to revisit or defend.

### 1. Source-diversity / bias indicators

**Research says:** Put a source-diversity micro-bar on every card showing L/C/R distribution. Ground News proved users value this (hit #1 free news app, 4.7 rating). It's "the best-in-class example and a direct answer to your 'unbiased' brand positioning."

**Charter says (commitment explicitly):** "No bias meters, no left/right chips, no 'both sides' framing. Verity reports facts. Curation has opinion. Reporting does not."

**The tension:** The research treats transparency signals as trust-builders. The Charter treats them as editorial interference — labeling sources L/C/R implies a framework Verity refuses to endorse. These are genuinely opposite positions on what "unbiased" means.

**Worth revisiting?** Maybe. You could do a *source count* indicator ("Covered by 14 outlets") without the L/C/R breakdown, which gives transparency without the bias-labeling the Charter rejects. The current spec (09) actually had a sourcing-strength row ("4 named · 2 documents · 0 anonymous") that was later cut by the Charter revision. A simpler "12 sources covering this story" might thread the needle.

### 2. Freshness timestamps

**Research says:** "Freshness timestamps that silently update ('Updated 3 min ago')" are a legitimate engagement technique.

**Charter says (commitment 4):** "No '5 min read.' No 'posted 2h ago.'" The article stands on its own. No production metadata.

**The tension:** The research sees recency signals as useful information. The Charter sees them as noise that distracts from the journalism.

**Worth revisiting?** Probably not for the article page, but maybe for the front page cards? The current spec has a "meta line" with "time published" in the 09 doc's original version but the web_home_feed and ios_adult_home views cut it. The eyebrow already carries category — you could add a quiet "2 hrs ago" there without violating the spirit of "the article is the product" (since this is the feed, not the article).

### 3. Bylines

**Research says:** Nothing explicit, but NYT and Apple News — the apps it praises most — show bylines prominently.

**Charter says:** "The reader never sees a byline." Attribution lives inside the prose.

**Worth revisiting?** This seems like a firm, intentional choice. The Charter's logic is clear — the article is the product, not the reporter. Leave it.

---

## Where the Research Suggests Things the Spec Doesn't Address (real gaps)

These are places where the research recommends something the current spec simply doesn't mention. No Charter conflict — just features or patterns that aren't in the plan yet.

### 4. Three-tier hierarchy, not two-tier

**Research says:** Hero (45% of viewport) → 2–3 mid-tier cards (medium headlines, half-width) → dense stack of 15–30 items. Three visual tiers.

**Current spec says:** Hero (slot 0) → 7 identical supporting slots. Two visual tiers.

**The gap:** The research argues that 7 equally-sized supporting stories still flatten hierarchy — the very problem the redesign is trying to solve. A middle tier (slots 1–3 at 22–26pt) and a tighter stack (slots 4–7 at 15–17pt) would give the editor three levels of emphasis instead of two.

**Recommendation:** This is probably the single highest-impact change. Give the editor 3 tiers: 1 hero, 2–3 major, and 4–5 stack items. It directly implements the Drudge principle the research identifies — "Drudge makes [the lead] 300% larger. Mainstream news sites hedge by making the lead 20% larger."

### 5. More stories below the fold

**Research says:** The stack should have 15–30 stories. "Information density below the fold" is one of the four non-negotiable principles. "This is where Drudge fans spend most of their time and where the 'alive' feel comes from."

**Current spec says:** 8 stories total, then the page ends.

**The gap:** 8 stories is a *very* tight edition. The research argues that the "alive" feeling of a curated page comes from density below the hero — the sense that someone surveyed the entire news landscape and organized it. 8 slots may feel like a newsletter, not a front page.

**Recommendation:** Keep the top 8 as the editorially curated "front page," but add a secondary "More from today" section below the finish state — a dense, text-only, chronological stack of 15–25 additional stories. Not editorially ranked, but editorially selected (each still passes through the pipeline). The "That's today's front page" line marks the boundary between curated hierarchy and curated completeness.

### 6. Inline-expanding AI summaries

**Research says:** Every card should support inline expansion to a 3-bullet AI summary via a small chevron (Axios/Particle pattern). "Reuters Institute found 27% of users actively want" multi-source AI summaries.

**Current spec says:** Feed cards show the summary paragraph. Tap the headline to go to the full article. No inline expansion.

**The gap:** The current spec already shows summaries on cards, which is good. But the research suggests a *layered* approach — headline visible, summary revealed on tap without leaving the feed. This respects the "80% of readers quit after 350 words" finding.

**Recommendation:** Consider a chevron-expand that reveals the summary paragraph inline. You already have the summary text (it's the same DB column). This doesn't require AI bullets — just show the prose summary on expand instead of navigating away. It's a small UX addition that the research says dramatically reduces tap-out. The Charter's "no labels, no frameworks" rule still holds because the summary is plain prose.

### 7. Edition numbering

**Research says:** "Edition #1,247" in the masthead transforms the screen from "algorithmic stream" to "edition of record." A dated, numbered edition signals accumulated credibility.

**Current spec says:** Masthead shows wordmark + date. No edition number.

**Recommendation:** Small addition, high signal. "Edition #47" or whatever the count is. Costs nothing, communicates permanence.

### 8. Time-of-day editions

**Research says:** Morning Briefing / Today's Stream / Evening Review — three editions per day. NYT's The Morning, Espresso's full-edition swipe, Axios's AM/PM all exploit this.

**Current spec says:** One front page per day.

**The gap:** One edition per day works for a newspaper but may feel stale by 3pm. The research argues that time-of-day editions create habit loops ("check Verity in the morning, check again after lunch").

**Recommendation:** This is a v2 feature, not launch. But worth noting in the roadmap. A midday refresh of the 8 curated slots — with the morning edition archived — would address staleness without adding algorithmic ranking.

### 9. Photos / visual treatment

**Research says:** Hero should have a "house-duotone-treated" photo. Stack items get 48×48pt thumbnails or none. "Photo normalization is the aggregator's hidden battle." Three solutions: duotone pipeline, category icon fallbacks, or typography-forward (the one you're doing).

**Current spec says:** "No image unless we have a genuinely good one. Most hero stories will be pure typography."

**The gap:** The research acknowledges typography-forward as a valid approach (citing Economist, Semafor). The current spec is already in this camp. No conflict, but worth noting that the research considers a duotone photo pipeline a stronger option if you have the editorial resources.

**Recommendation:** The typography-forward approach is defensible and aligns with the Charter's restraint ethos. Keep it at launch. If you later add photos, the duotone normalization pipeline is the way to go — it prevents the "messy scraping" problem the research warns about.

### 10. Section ribbon / navigation

**Research says:** A horizontal section ribbon under the masthead (Top / World / Politics / Business / Tech) with swipe between sections. NYT's 2024 ribbon "won Fast Company's 2025 Innovation by Design General Excellence award."

**Current spec says:** "No category nav pills. Categories live on a dedicated /sections page."

**The gap:** The research calls the ribbon a "strong complement" to the edition layout. The current spec moves categories entirely off the home page.

**Recommendation:** This one could go either way. The spec's "no pills on home" keeps the page clean and focused. The research's ribbon adds navigability. A compromise: no ribbon on the home page itself, but a small "Sections →" link in the masthead that opens the ribbon. The front page stays editorial; sections are one tap away.

### 11. Density toggle (Comfortable / Compact)

**Research says:** Ship Comfortable as default. Offer a Settings-hidden Compact mode for power users.

**Current spec says:** One layout, no toggle.

**Recommendation:** Not launch-critical, but a good v2 feature for retention. Power users who want the Drudge-density experience will appreciate Compact mode.

### 12. The breaking indicator style

**Research says:** "A small pulsing red dot (8–12pt, like an iOS Live Activity indicator) with a tiny 'BREAKING' label. Not a full-width bar."

**Current spec says:** Full-width dark bar with "BREAKING" in bold white.

**The gap:** The research argues for a more restrained indicator. The current spec's full-width bar is closer to the CNN pattern the research criticizes.

**Recommendation:** Consider scaling down to a thin red top-rule on the hero card + a small indicator, rather than a full-width strip. Subtler = more meaningful when it appears.

---

## Summary: The Five Changes That Would Matter Most

1. **Three-tier hierarchy** (hero → major → stack) instead of two-tier (hero → 7 equal). Highest-impact layout change.
2. **More stories below the fold** — a "More from today" dense stack of 15–25 items after the curated 8. Addresses the "alive" problem.
3. **Inline-expanding summaries** — chevron to reveal the prose summary without leaving the feed. Reduces tap-out.
4. **Edition numbering** in the masthead. Tiny effort, high signal.
5. **A transparency signal that respects the Charter** — something like "Covered by 14 outlets" without the L/C/R breakdown. Threads the needle between research and Charter.

## What to Explicitly Defend (Not Change)

- No bias meters / L-R-C indicators (Charter commitment)
- No bylines (Charter commitment 4)
- No algorithmic personalization
- No infinite scroll
- Typography-forward, minimal images
- Finite edition with a clear ending
