# Editorial / Render Uplift — Implementation Plan

Source-of-truth for the multi-agent implementation. Items #1–#11, #14, #15, #17 from the TL;DR. Item #16 (Kids iOS interactive) deferred — needs separate UX session.

---

## Scope

**Prompt-side (owned by Implementer A):**
1. Stress position — strongest fact at sentence end (all 3 audiences)
2. Specificity ladder — abstract → category → specific noun → named instance (adult)
3. Sentence rhythm — short after long, varied length (all 3 audiences)
4. Kill zombie nouns — `decision-making process` → `decided` (adult)
5. Empty adjective → concrete noun + active verb (adult)
6. Adult P1 may be a scene lead
7. Adult P2/P3 mandatory nut graf (ties to existing "so what")
8. Kids/tweens hamburger paragraphs (topic → 3–5 supports → close)
9. Kids/tweens explicit transition words (`first`, `next`, `because`, `however`)
10. Kids anecdotal/question lead in P1
11. Kids comforting context paired with distressing news in same paragraph
14. Adult paragraph cap ~70 words (prompt-side; render-side warning by Implementer C)
15. Adult subheadings every 3–4 paragraphs (only when ≥5 paragraphs AND ≥380 words)

**Render-side (owned by Implementer C):**
12. White space + clearer H2/H3 hierarchy
13. Pull quote — render-time heuristic (no LLM marker), `<aside class="pull-quote">`
14. Paragraph cap render warning (admin preview only — `<p class="over-cap">`)

**Process (owned by Implementer D):**
17. Read-aloud admin button — mount existing `<TTSButton>` in `StoryEditor.tsx` and `KidsStoryEditor.tsx`

**DB cleanup (owned by Implementer B, runs AFTER A):**
- DELETE all 12 rows under `settings.pipeline.prompt.*` — single source of truth becomes `editorial-guide.ts`. Loader (`system-prompt-loader.ts`) already falls back to .ts on empty rows.

---

## Cross-platform applicability (LockedDecisions #18)

| # | Item | Web | iOS adult | Kids iOS |
|---|---|---|---|---|
| 1–11, 14p, 15p | Prompt rules | yes (.ts) | n/a (server-side rule) | n/a (server-side rule; reads via web API) |
| 12 | Whitespace + hierarchy | yes (CSS) | iOS parity follow-up ticket | n/a |
| 13 | Pull quote | yes (render) | iOS parity follow-up ticket (HTML renders gracefully as plain block until iOS CSS ships) | n/a |
| 14r | Paragraph render warning | yes (admin only) | n/a | n/a |
| 15r | Subheadings | n/a (LLM emits `###`; existing CSS handles) | iOS adult picks up `<h3>` automatically | n/a |
| 17 | Read-aloud admin button | yes | n/a (admin newsroom is web-only) | n/a |

---

## File-ownership map (disjoint)

**Implementer A** — `web/src/lib/pipeline/editorial-guide.ts` only
**Implementer B** — DB SQL only (no code files)
**Implementer C** — `web/src/lib/pipeline/render-body.ts`, `web/src/app/globals.css` (only the `[data-article-body]` block at lines 619–683), and a new `web/src/components/article/PullQuote.tsx` if needed
**Implementer D** — `web/src/components/article/StoryEditor.tsx`, `web/src/components/article/KidsStoryEditor.tsx`

No two implementers touch the same file.

---

## Wave order

```
Wave 1 (parallel): A + C + D
Wave 2 (after A merges):  B
Wave 3 (after Waves 1+2): Adversary 1 + Adversary 2 in parallel
```

Hard dependency: B waits for A. Otherwise the loader keeps falling back to old .ts (still self-consistent — just doesn't pick up the new rules until A ships).

---

## Adversary review briefs

**Adversary 1 — Spec/voice consistency + downstream regression**
- Find any new rule that contradicts an existing rule (e.g. kids anecdotal lead vs FACTS ONLY; adult 70-word cap vs 2-3-sentence rule).
- Confirm `globals.css` changes scope to `[data-article-body]` only.
- Confirm `sanitize-html` allowlist additions are tight (named classes only).
- Confirm PROVENANCE header in `editorial-guide.ts` was updated to log the F8 Editorial uplift deviation, and that no existing snapshot text was reflowed.
- Confirm total `EDITORIAL_GUIDE` size < 20 KB; new content lands inside existing thematic sections (cache-prefix preservation).

**Adversary 2 — Cross-platform completeness + LockedDecisions audit**
- Walk the 18 LockedDecisions items against each PR.
- Confirm cross-platform applicability matrix is explicit per item (web / iOS adult / Kids iOS).
- Confirm `SELECT COUNT(*) FROM settings WHERE key LIKE 'pipeline.prompt.%'` returns 0.
- Confirm read-aloud button has no keyboard shortcut (#12), no model UI (#11), no Generate-All (#10).
- Confirm `VerityPost/VerityPost/StoryDetailView.swift` will render new HTML gracefully (pull-quote + h3 + larger paragraph margins).

---

## Rollback (one-liners)

| Change | Rollback |
|---|---|
| A | `git revert <sha>` on .ts PR |
| B | Pre-DELETE backup via `pg_dump --where="key LIKE 'pipeline.prompt.%'"`, restore via `psql` |
| C | `git revert <sha>` |
| D | `git revert <sha>` |

---

## Test plan

**A. Generate-one-per-audience** through `/admin/newsroom` Discovery → AudienceCard → Generate. Verify per audience:

*Adult:* P1 may be scene OR fact lead. P2/P3 carries nut graf. No paragraph >70 words. If word count ≥380 and paragraphs ≥5, at least one `<h3>`. No banned adjectives. No reducible nominalizations. Concrete-noun ladder visible. Final sentence ends on a strong fact.

*Kids:* P1 anecdotal/question. Hamburger paragraph shape. ≥1 transition per paragraph after P1. Distressing facts paired with factual reassurance in same paragraph. **No "why this matters" closer** (confirms DB delete worked). Scale comparisons present.

*Tweens:* Hamburger + transitions. **No "so what" closer**. No banned-importance phrases.

**B. Render visual smoke** on canonical reader (`web/src/app/[slug]/page.tsx`):
- Re-render a back-catalog article (admin edit + save).
- `<aside class="pull-quote">` appears on adult ≥5-paragraph articles with a quotable line.
- Paragraph spacing is visibly increased.
- H3 distinct from H2.
- Admin preview warns on >70-word paragraphs; public reader does not.

**C. DB cache flush:** after `DELETE`, hit `/api/admin/pipeline/generate` → no loader warnings → next 60 s confirms TTL doesn't cause stale prompts.

**D. Read-aloud:** click button under body textarea on `/admin/story-manager?article=<id>` and `/admin/kids-story-manager?article=<id>`. Speech reads in-memory edit value. Without `article.listen_tts` perm → button hidden.
