# Reference1 — Reviewed

Items where 3/3 independent reviewers agreed Verity Post should adopt from Reference1.md.

---

**1. Strong verb replaces verb + adverb**
Where in ref: §3 "Strong verbs do the work" + Stephen King "adverbs are dandelions".
Land in: `web/src/lib/pipeline/editorial-guide.ts` (extend the existing banned-verbs/adjectives section to include "verb + adverb constructions" — replace `walked slowly` with `trudged`, `said loudly` with `shouted`).

**2. Specificity ladder — "get the name of the dog"**
Where in ref: §1 "Clarity and Concreteness" + Roy Peter Clark's tool. Ladder: creature → animal → dog → Roxy.
Land in: `web/src/lib/pipeline/editorial-guide.ts` adult body prompt — extend the existing specificity rule from "≥1 concrete anchor per paragraph" to an explicit ladder (abstract → category → specific noun → named instance).

**3. Known-new contract for sentence flow**
Where in ref: §2 "The known-new contract".
Land in: `web/src/lib/pipeline/editorial-guide.ts` add a sentence-cohesion sub-rule across all three audience prompts: each sentence opens with info the previous sentence ended on, closes with new info.

**4. Vary sentence length — short after long**
Where in ref: §2 "Vary sentence length to make music" + §5 "The simple sentence after the complex one".
Land in: `web/src/lib/pipeline/editorial-guide.ts` rhythm guidance — already mentioned for adult, extend to kids/tweens prompts (kids 8–12 avg ≠ uniform; alternate). Optional post-render heuristic to flag 3+ consecutive same-length sentences.

**5. Place strongest word at the period**
Where in ref: §2 "Place your strongest word at the period" + Clark's "period as a stop sign".
Land in: `web/src/lib/pipeline/editorial-guide.ts` sentence-construction rule across all three audiences.

**6. Open with scene, not thesis**
Where in ref: §4 "Open with a scene, not a thesis".
Land in: adult body prompt (`pipeline.prompt.adult.body` and the .ts constant) — first paragraph permitted to lead with a real person doing a specific thing, before the news fact. Stays compatible with 250–450 word budget.

**7. Telling detail replaces editorial adjective**
Where in ref: §1 "The telling detail" + McPhee's Florida-oranges rewrite.
Land in: `web/src/lib/pipeline/editorial-guide.ts` FACTS ONLY block — augment the banned-adjective rule with the positive instruction: select the detail that implies the judgment instead of stating it.

**8. Analogy translator for big numbers**
Where in ref: §4 "The analogy as translator" + Roach's roaster-chicken example.
Land in: kids body prompt (already requires "scale comparisons for every large number") + extend to tweens and adult prompts as encouraged-not-required.

**9. Read-aloud as polish diagnostic**
Where in ref: §1 + §5 "Read aloud. Always."
Land in: admin newsroom approval flow (`web/src/app/admin/newsroom/...`) — add a "read aloud" checkbox or Web Speech API button on the article-edit screen so the human approver can ear-check rhythm before publishing.
