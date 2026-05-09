# Reference3 — Reviewed

Items where 3/3 independent reviewers agreed Verity Post should adopt from Reference3.md.

---

**1. Hamburger-model paragraph structure for kids/tweens**
Where in ref: Phase Four "Framed Paragraphs and the Hamburger Model".
Land in: `pipeline.prompt.kids.body` and `pipeline.prompt.tweens.body` (and the .ts constants `KIDS_ARTICLE_PROMPT`, `TWEENS_ARTICLE_PROMPT`) — each paragraph: topic sentence → 3–5 supporting details → closing summary sentence.

**2. Explicit transition words in kids/tweens body**
Where in ref: Phase Five "The Mechanics of Transition Words".
Land in: kids and tweens body prompts — require visible connectors (`first`, `next`, `then`, `because`, `however`, `therefore`) instead of implicit logical flow. Younger readers don't supply the missing chain.

**3. Sentence-length variation rhythm**
Where in ref: Phase Five "Syntactic Rhythm and Sentence Variation".
Land in: editorial-guide.ts across all three audiences — alternate short / medium / long; allow 3–5 word percussive sentences for emphasis. Extends the existing kids 8–12-word-avg / tweens 12–18-word-avg constraints into a rhythm rule rather than a flat target.

**4. Cap paragraphs at ~70 words, one topic each**
Where in ref: Phase Five "Paragraph Length and Visual Density" (chicken nuggets vs Big Macs).
Land in: editorial-guide.ts adult body prompt + an optional paragraph-length lint in the render step. Reduces visual intimidation on mobile.

**5. Mandatory nut graf for adult articles**
Where in ref: Phase Three "The Crucial Role of the Nut Graf".
Land in: `pipeline.prompt.adult.body` + the .ts `EDITORIAL_GUIDE` constant — the second or third paragraph must explicitly carry the article's core angle. Compatible with the existing "so what" sentence rule; codifies its placement.

**6. Anecdotal / question lead for kids**
Where in ref: Phase Six "Typologies of the Lead" + Phase Four scaffolded macro-structures.
Land in: kids body prompt — open with a relatable scenario or a direct question before facts. Children build emotional resonance before they accept abstraction.

**7. White space and visual hierarchy in render**
Where in ref: Phase Eight "The Psychology of White Space and Visual Crowding".
Land in: `web/src/components/...` article renderer + CSS — generous line-height and paragraph spacing; clear hierarchy between H2/H3.

**8. Subheading checkpoints in long adult articles**
Where in ref: Phase Eight "Typographical Tools: Subheadings".
Land in: adult body prompt + render — descriptive H3 every 3–4 paragraphs in articles approaching the 450-word ceiling. Helps goal-oriented adult skimming and SEO.

**9. Pull quotes — short, isolated, max 5 lines**
Where in ref: Phase Eight "Pull Quotes and Block Quotes".
Land in: render template + a `<PullQuote>` component — bordered, max 5 lines, generous spacing, no clustering. Brings skimming readers back into the body.

**10. Interactive decision moments in kids articles**
Where in ref: Phase Eight "Visual Literacy and Digital Interactivity".
Land in: VerityPostKids iOS app — clickable glossary terms, tap-to-reveal facts, story-map branching. Active processing beats passive scrolling for retention with ages 7–9.

**11. Comforting context paired with distressing kids news**
Where in ref: Phase Two "The Cognitive Landscape of Juvenile Audiences".
Land in: kids body prompt + the existing `[kid] audience-safety` step — when a story carries distressing facts, require explicit boundaries / reassurance in the same paragraph as the fact (not separate, not absent). Prevents anxiety cultivation without softening truth.
