# Reference4 — Reviewed

Items where 3/3 independent reviewers agreed Verity Post should adopt from Reference4.md.

---

**1. Explicit transition words for kids/tweens**
Where in ref: Phase Five "Mechanics of Transition Words" + Phase Four scaffolding.
Land in: `pipeline.prompt.kids.body` and `pipeline.prompt.tweens.body` — visible connectors (`first`, `next`, `then`, `because`, `however`) required, not implicit.

**2. Hamburger-model paragraph scaffold for kids**
Where in ref: Phase Four "Framed Paragraphs and the Hamburger Model".
Land in: kids and tweens body prompts (DB rows + `.ts` constants) — topic sentence → 3–5 supports → closing summary.

**3. Sentence-length rhythm variation**
Where in ref: Phase Five "Syntactic Rhythm and Sentence Variation".
Land in: editorial-guide.ts across all three audiences — alternate short / medium / long; permit 3–5-word percussive sentences for emphasis.

**4. Anecdotal lead for kids articles**
Where in ref: Phase Six "Typologies of the Lead" + Phase Four pacing for juveniles.
Land in: kids body prompt — open with a relatable character or scenario; defer hard facts to the second move.

**5. Mandatory nut graf for adult articles**
Where in ref: Phase Three "The Crucial Role of the Nut Graf".
Land in: adult body prompt + `EDITORIAL_GUIDE` constant — second or third paragraph explicitly carries the core angle. Aligns with the existing one-sentence "so what" rule by codifying its placement.

**6. White space and visual hierarchy**
Where in ref: Phase Eight "The Psychology of White Space and Visual Crowding".
Land in: render layer + CSS — line-height, paragraph spacing, clear H2/H3 differentiation.

**7. Pull quotes — max 5 lines, isolated, bordered**
Where in ref: Phase Eight "Typographical Tools: Pull Quotes and Block Quotes".
Land in: render template / `<PullQuote>` component — short, bordered, generous surrounding white space, no clustering.

**8. Interactive decision moments in kids content**
Where in ref: Phase Eight "Visual Literacy and Digital Interactivity".
Land in: VerityPostKids iOS — clickable glossary terms, tap-to-reveal facts, simple branching. Forces active processing.

**9. Personal, empowering call-to-action kicker for kids**
Where in ref: Phase Seven "Exit Strategies for Children".
Land in: kids body prompt — close with a concrete action the reader could take in their own world (try this / look for that), not a systemic exhortation, not an open dread.

Note: this convergent kid-CTA item is the one place where adopting Reference4 collides with the locked spec. The current editorial guide bans importance framing in kids/tweens (`"why this matters"`, `"this affects you"`, `"so what"`). A personal-action kicker is adjacent to that ban and needs phrasing that's *invitational* (e.g., "Next time you see ___, look for ___") rather than directive ("This affects you"). Owner judgment call before adopting.
