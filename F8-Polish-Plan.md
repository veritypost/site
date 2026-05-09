# F8 Polish Plan — 8 prompt-rule additions to `editorial-guide.ts`

Read-only spec. Implementer pastes the diffs below into `web/src/lib/pipeline/editorial-guide.ts`. All inserts land **inside existing thematic sections**. Only item #7 rewrites an existing line; the other 7 append.

File reference points (post-F8 wave 1, 1693 lines):
- Adult `EDITORIAL_GUIDE`: lines 36–605
- Adult `LANGUAGE RULES`: lines 406–544 (rule 2 active voice = 413–420; rule 5 banned adjectives = 435–449; rule 6 banned verbs = 451–454; rule 10 number context = 462–466)
- Adult `FACTS ONLY`: lines 230–404 (banned-adjective example = 247–251)
- Adult `VOICE — YOUR NORTH STAR`: lines 40–71
- Adult `STRUCTURE`: lines 95–157
- `KIDS_ARTICLE_PROMPT` VOICE RULES: ~1286–1301
- `TWEENS_ARTICLE_PROMPT` VOICE RULES: ~1406–1422

---

## 1. Per-item plan

### Item 1 — Strong verb over adverb
**Land-in.** Adult LANGUAGE RULES, after rule 6 (banned verbs) at line 454. Echo to kids VOICE RULES (after active-voice line) and tweens VOICE RULES.
**Diff (adult, after line 454):**
```
   USE: criticized, opposed, supported, praised, said, stated

   ADVERB DOWNGRADE — verbs do the work, not -ly. A -ly adverb
   modifying a weak verb is the prompt to pick the right verb.
     WEAK:   walked slowly        STRONG: trudged
     WEAK:   said loudly          STRONG: shouted
     WEAK:   ran quickly          STRONG: sprinted
     WEAK:   replied angrily      STRONG: snapped
   The narrow exception: a manner adverb that itself carries a
   verifiable fact ("the vote passed unanimously," "the index
   closed slightly higher"). Keep those. Strip the rest.
```
**Diff (kids VOICE RULES, after the "Active voice always" line):**
```
- Pick the verb that already carries the action. "Trudged" beats "walked slowly." "Shouted" beats "said loudly."
```
**Diff (tweens VOICE RULES, after the "Active voice" line):**
```
- Pick the verb that already carries the action. "Trudged" beats "walked slowly." "Shouted" beats "said loudly." A -ly adverb on a weak verb is the prompt to pick the right verb.
```
**Length.** ~850 chars total.
**Collisions.** None — distinct from rule 13 (LOADED VERB BAN) and rule 5 (banned adjectives).

---

### Item 2 — Known-new contract
**Land-in.** Adult VOICE — YOUR NORTH STAR, after the "Specificity is credibility" line (~61). Light echo into kids and tweens VOICE RULES.
**Diff (adult VOICE, after the specificity line):**
```
"local schools." Specificity is credibility.

KNOWN-NEW CONTRACT. Each sentence opens with information the
previous sentence already established; the new fact lands at
the close. The reader's eye picks up where it just left off,
then collects the new piece. Done well, this carries the
paragraph forward without "however" / "meanwhile" crutches.
  GOOD: "The agency fined the bank $2 billion. The fine
         was the largest the agency has issued since 2014."
  WEAK: "The agency fined the bank $2 billion. A 2014
         penalty was the previous record."
```
**Diff (kids VOICE RULES, after the "End each sentence on the strongest word" line):**
```
- Start each sentence from where the last one ended. The new fact lands at the end.
```
**Diff (tweens VOICE RULES):**
```
- Known-new contract. Open each sentence with what the last sentence ended on; close with the new fact. Carries the paragraph forward without "however" / "meanwhile" crutches.
```
**Length.** ~940 chars.
**Collisions.** Mild risk with kids' explicit-transitions rule — kids wording above ("Start each sentence from where the last one ended") deliberately avoids forbidding transitions.

---

### Item 3 — Telling detail over editorial adjective
**Land-in.** Adult FACTS ONLY, immediately after "ADJECTIVES MUST DESCRIBE, NOT CHARACTERIZE" example block at line 251. **CRITICAL:** anchor lines (the existing BAD examples at 250–251) shown for context only — DO NOT paste them. Begin the paste at the blank line after them. The diff block below starts at "TELLING DETAIL OVER…".
**Diff (insert AFTER line 251, starting with a single blank line):**
```
TELLING DETAIL OVER EDITORIAL ADJECTIVE. The job is not to
tell the reader the news is remarkable; it is to pick the
detail that makes the reader notice on their own. The
selection implies the judgment.
  WEAK:    "Florida saw a remarkable amount of citrus growth."
  CONCRETE: "Florida surpassed California in 1942 and now grows
            three times as many oranges."
  WEAK:    "The settlement was significant."
  CONCRETE: "The settlement was the largest the agency has
            issued since 2008."
A "remarkable" adjective signals you have not done the
selection work yet. Pick the fact that does it for you.
```
**Length.** ~720 chars.
**Collisions.** Sibling of rule 5 (banned adjectives) and rule 18 (specificity ladder); no duplication.

---

### Item 4 — Analogy translator for big numbers
**Land-in.** Adult LANGUAGE RULES rule 10 ("Every number includes comparison context", line 462–466) — append-after line 466. Tweens VOICE RULES — append after the "Variation is good" line. **DO NOT touch kids** (already covered at line 1290).
**Diff (adult rule 10, after line 466):**
```
10. Every number includes comparison context. Never a number
    floating alone. "$105/barrel — up from $3.10 before the
    conflict" not just "$105/barrel."

    HOUSEHOLD-SCALE TRANSLATOR — encouraged when an abstract
    figure outruns the reader's intuition. A roaster-chicken
    weighs five pounds; a cubic mile holds a trillion gallons;
    a million seconds is twelve days. When a number is large
    enough that a comparison-against-the-prior-record is not
    enough to make it land, pair it with a concrete object
    or duration the reader can picture.
      GOOD: "147 cubic miles of ice — roughly the volume of
             Lake Erie."
      GOOD: "$2.4 billion — about what Apple earns every
             three days."
    Use sparingly: one per article, only when the abstraction
    invites it. Do not stack analogies; do not strain them.
```
**Diff (tweens VOICE RULES):**
```
- For abstract big numbers, pair with a household-scale comparison ("147 cubic miles — roughly Lake Erie's volume"). Encouraged, not required — use when the abstraction outruns intuition.
```
**Length.** ~900 chars.
**Collisions.** Verified no kids overlap.

---

### Item 5 — Cumulative sentence rhythm
**Land-in.** Adult VOICE — YOUR NORTH STAR, after "Do not stack three same-length sentences in a row." line.
**Diff:**
```
three same-length sentences in a row.

CUMULATIVE SHAPE FOR LONG SENTENCES. When a sentence runs
long, anchor it on a base clause that stands alone, then
layer modifiers AFTER the base — participles, absolutes,
appositives — never nested inside it. The reader gets the
news first, then collects the texture.
  GOOD: "The Senate passed the bill 51-49, sending it to the
         House, ending a four-month standoff that had stalled
         the appropriations calendar."
  BAD:  "The Senate, after a four-month standoff that had
         stalled the appropriations calendar, passed the bill
         51-49 and sent it to the House."
The base clause carries the news; the modifiers do the work.
```
**Length.** ~640 chars.
**Collisions.** Compatible with stress-position rule.

---

### Item 6 — Front-load critical nouns (F-pattern)
**Land-in.** Adult STRUCTURE block, after PARAGRAPH 3 spec, before "SO WHAT" sentence (around line 121).
**Diff:**
```
"Two sentences max. If paragraph 2 covered everything, skip this.

PARAGRAPH FRONT-LOAD — F-PATTERN. The first three to five
words of every paragraph carry the most important concept
noun in that paragraph. Readers scan; the eye sweeps left
to right across the opening words and decides whether to
read on. Lead with the noun that earns the read.
  GOOD: "The Federal Reserve raised rates a quarter point..."
  BAD:  "In a move that surprised analysts, the Federal
         Reserve..."
  GOOD: "Mortgage applications fell 7% in the latest week..."
  BAD:  "After climbing for three months, mortgage
         applications..."
Strip throat-clearing openers. The concept noun goes first.
```
**Length.** ~620 chars.
**Collisions.** Concentric with existing rule 1 (lead with the fact). Aligned with scene-opener carve-out.

---

### Item 7 — Passive voice: surgical, not banned absolute (REWRITE)
**Land-in.** Adult LANGUAGE RULES rule 2 (line 413). **REWRITE** the first sentence of rule 2 only — the zombie-noun sub-block (lines 414–420) stays untouched.
**OLD line 413:**
```
2. Active voice always. "The Senate passed" not "was passed."
```
**NEW (replaces only line 413):**
```
2. Active voice by default. "The Senate passed" not "was
   passed." The narrow exception: when the recipient of the
   action is the news, passive correctly centers the recipient.
     GOOD: "The agency was fined $2 billion." (The agency is
            the news; the enforcer is not.)
     GOOD: "The bill was signed into law Tuesday." (The bill
            is the news; the signer is downstream.)
     STILL BAD: "Mistakes were made." (Hides the actor when
                the actor IS the news.)
   Test: ask which noun is the story. If the patient is the
   story, passive is the right voice. If the actor is the
   story, active. Default active when in doubt.
```
**Length.** ~640 chars (net add ~580).
**Collisions.** **HIGH RISK.** Adult permits surgical passive; kids and tweens still forbid all passive. **Do NOT propagate item 7 to kids or tweens.** Note the divergence in commit message for any future refactor.
**Indentation.** Match the existing rule 2 sub-block style — items 414–420 use a 3-space indent under the `2.` numeral. The new GOOD/STILL BAD/Test lines must use the same 3-space indent so the rule reads as one continuous block, not two grafted halves.

---

### Item 8 — Phonological harmony (subtle)
**Land-in.** Adult VOICE — YOUR NORTH STAR, after "Neither should repeat what the other covers." line (~71).
**Diff:**
```
read your article. Both must work independently. Neither should
repeat what the other covers.

PHONOLOGICAL HARMONY — DO NOT PURSUE; DO NOT STRIP. Quiet
alliteration, assonance, and consonance may occur naturally
when you are choosing concrete nouns and strong verbs.
Tolerate them; do not reach for them. The bar is strict:
nothing rhymed, nothing showy, nothing the reader notices
on a first pass.
  PERMITTED: "the bill barred broadcasters" (mild b-stress)
  PERMITTED: "settlement, sealed Tuesday, set the precedent"
             (s-thread, unforced)
  TOO MUCH:  "the silver-tongued senator slammed sweeping
             sanctions" (showy; also banned verb + adjective)
  TOO MUCH:  any rhymed pair, any internal rhyme, any phrase
             that draws attention to its sound
If a phrase makes you pause to admire it, cut it. The sound
should serve the sense, never replace it.
```
**Length.** ~830 chars.
**Critical guard-rail.** The phrase "nothing the reader notices on a first pass" is the entire load-bearing constraint. Do not soften it.

---

## 2. Cut order if size-constrained
Total: ~5.7 KB. If trimming needed, cut in this order: (1) Item 8, (2) Item 5, (3) Item 4 tweens echo, (4) Item 2 kids echo. Stop there. Items 1, 3, 6, 7 are non-negotiable.

---

## 3. PROVENANCE header update

Append a new deviation #5 after the existing F8 deviation block (after line 25):
```
 *   5. F8 Editorial uplift — polish (2026-05-09): eight items from the
 *      four Reference reviews' unanimous-recommend set — seven new
 *      rules (adverb downgrade, known-new contract, telling-detail-
 *      over-editorial-adjective, household-scale analogy translator,
 *      cumulative sentence shape, paragraph front-load / F-pattern,
 *      phonological harmony) plus one strategic rewrite to LANGUAGE
 *      RULES rule 2: "Active voice always" became "Active voice by
 *      default" with a surgical-passive carve-out for sentences where
 *      the recipient of the action is the news. The kids and tweens
 *      absolute active-voice rule is preserved unchanged. All seven
 *      additions land inside existing thematic sections; no snapshot
 *      prose outside item-7's first line was reflowed.
```

---

## 4. Risk callouts

- **A.** Item 7 contradicts kids/tweens absolute active-voice — DO NOT propagate.
- **B.** Item 4 already exists in kids — kids prompt UNTOUCHED for item 4.
- **C.** Item 1 distinct from rule 13 (loaded-verb ban).
- **D.** Item 6 aligned with existing scene-opener carve-out.
- **E.** Item 8 LLM-misuse risk: the "nothing the reader notices on a first pass" phrase is non-negotiable.
- **F.** PROVENANCE date 2026-05-09.

---

## 5. Verification

1. `wc -l web/src/lib/pipeline/editorial-guide.ts` → ~1820 ± 30
2. Diff: lines deleted ≤ 5 (item 7's single-line rewrite only)
3. Sentinel grep: each of `ADVERB DOWNGRADE`, `KNOWN-NEW CONTRACT`, `TELLING DETAIL OVER`, `HOUSEHOLD-SCALE TRANSLATOR`, `CUMULATIVE SHAPE`, `PARAGRAPH FRONT-LOAD`, `Active voice by default`, `PHONOLOGICAL HARMONY` returns exactly one match
4. PROVENANCE deviation #5 present
5. `npx tsc --noEmit` clean from `web/`
6. No `--`, no straight quotes introduced; em-dashes `—` only

---

## 6. Cross-platform applicability (LockedDecisions #18)
Server-side prompt rules. Web / iOS adult / iOS Kids = all read `articles.body_html`; no native code change. Item 7 deliberately scoped to adult only to preserve absolute-active-voice for early readers in kids/tweens.

---

## 7. Rollback
`git revert <commit-sha>` — single file, no migration.
