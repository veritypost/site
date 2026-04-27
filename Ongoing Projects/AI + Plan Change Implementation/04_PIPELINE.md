# Pipeline + AI generation

Two interlocked pieces:
1. **Pass A** — fix the prompt-vs-schema bugs blocking all generation today
2. **Banded generation** — pipeline produces up to 3 articles per cluster (Adult / Kids / Tweens) with band-specific prompts

Pass A ships first, alone, before any banding work begins.

---

## Pass A — surgical bug fixes

### File: `web/src/lib/pipeline/editorial-guide.ts`

#### TIMELINE_PROMPT (lines 719-925)
- **Strip lines 818-825** (the `text`/`summary` field block — contradicts OUTPUT FORMAT)
- **Strip lines 746-805** (entire "LINKING TO EXISTING VP ARTICLES" + "INHERITING EXISTING THREAD TIMELINES" sections — describes features the route doesn't wire)
- Keep lines 906-924 (correct OUTPUT FORMAT with `event_date`/`event_label`/`event_body`)
- Net: ~80 lines deleted

#### EDITORIAL_GUIDE (lines 28-342)
- **Strip lines 43-62** ("RELATED VP STORIES" block — same dead feature reference)
- **Strip lines 325-327** (`<!-- insufficient_data: -->` instruction — no parser exists)
- **Strip lines 339-342** (`<!-- word_count: 178 -->` trailing comment — incompatible with JSON output)
- **Strip lines 222-224** + **lines 333-336** (the "no markdown / plain text only" instructions — contradicted by route override that allows markdown JSON)
- Net: ~30 lines deleted

#### HEADLINE_PROMPT (lines 635-676)
- Fix OUTPUT FORMAT: change `"title": "..."` → `"headline": "..."` (matches schema)
- Add `"slug": "..."` to OUTPUT FORMAT (route requests it)
- Resolve "Maximum 10 words" vs "Aim for 6-8" — pick "Maximum 10 words; aim for 6-8"

#### QUIZ_PROMPT + KID_QUIZ_PROMPT (lines 678-717, 995-1020)
- Unify on `correct_index` (drop `correct_answer` from KID_QUIZ_PROMPT)
- Both keep `options: [{ "text": "..." }]` shape — confirmed by Zod schema

#### KID_ARTICLE_PROMPT (lines 943-973)
- **Replace OUTPUT FORMAT entirely** — drop `kid_title`/`kid_summary`/`kid_content`/`kid_category` fields
- New OUTPUT FORMAT: `{ "title": "...", "body": "...", "word_count": N, "reading_time_minutes": N }` (matches BodySchema)
- Keep all the editorial guidance (kid-friendly language, context, no graphic content) — drop only the unused field names

#### AUDIENCE_PROMPT (lines 931-941)
- Fix OUTPUT FORMAT: change `"reason": "..."` (singular string) → `"reasons": [...]` (array, matches Zod schema)

#### TimelineEventSchema (route.ts:352-358)
- Drop `title?` and `description?` optional fallback fields — these are vestigial accommodations for an earlier prompt shape

### File: `web/src/app/api/admin/pipeline/generate/route.ts`

#### Summary step user-turn (line 994)
**Current:**
```js
const summaryUser = `Write a 2-sentence plain-text summary (max 40 words)... Return JSON: {"headline":"<leave as empty string>","summary":"<your summary>"}. ...`;
```

**Fix — pick one:**

**Option 1: dedicated SUMMARY_PROMPT** (recommended)
- Add `SUMMARY_PROMPT` to `editorial-guide.ts` — purpose-built for the summary step
- Add `SummarySchema = z.object({ summary: z.string().min(1).max(500) })`
- Route uses `SUMMARY_PROMPT` as system, simpler user-turn

**Option 2: relax HeadlineSummarySchema for the summary step**
- Make `headline` optional in the schema
- Less code change but worse separation

#### Quiz user-turn (line 1383)
**Current:**
```js
const quizUser = `ARTICLE BODY:\n${finalBodyMarkdown}\n\nGenerate 5 Quick Check questions as JSON.${freeformBlock}`;
```

**Fix — add explicit schema reminder:**
```js
const quizUser = `ARTICLE BODY:\n${finalBodyMarkdown}\n\nGenerate 5 Quick Check questions as JSON. EXACT shape:
{
  "questions": [
    {
      "question_text": "...",
      "options": [
        { "text": "..." },
        { "text": "..." },
        { "text": "..." },
        { "text": "..." }
      ],
      "correct_index": 0,
      "section_hint": "..."
    }
  ]
}${freeformBlock}`;
```

This single change should resolve the 2/5 schema_validation quiz failures.

### Acceptance criteria for Pass A
- [ ] One adult run via `/admin/newsroom` → reaches `persist` step
- [ ] One kid run via `/admin/newsroom` (using existing single-tier prompts) → reaches `persist` step
- [ ] No new schema_validation errors in `pipeline_runs.error_message` for 7 days post-deploy
- [ ] No prompt content references "vp_slug", "is_current", "is_future", "RELATED VP STORIES", "INHERITING THREAD" — grep should return zero matches

### Pass A risk
**Very low.** Textual prompt edits + Zod tightenings. No DB migrations. No API contract changes. No UI. Worst case: model output shape shifts slightly and one more user-turn string needs tweaking.

### Pass A lift
~4 hours.

---

## Banded generation (Phase 3)

### Architecture

When `audience='kid'` is requested for a cluster, the pipeline now produces **two articles** in the same run:
- Article 1: `age_band='kids'` — voice for ages 7-9
- Article 2: `age_band='tweens'` — voice for ages 10-12

Adult runs unchanged: 1 article output, `age_band='adult'`.

So a single cluster can produce **up to 3 total articles**: 1 adult + 1 kids + 1 tweens.

### Steps shared across bands (run once)
- `audience_safety_check` — gates whether kid pipeline runs at all
- `source_fetch` — scrape source articles
- `categorization` — same category for both bands
- `source_grounding` — independent fact-check per body, but the source corpus is shared
- `plagiarism_check` — checked per body, but corpus shared

### Steps duplicated across bands (run twice for kid runs)
- `headline` (with `KIDS_HEADLINE_PROMPT` vs `TWEENS_HEADLINE_PROMPT`)
- `summary` (with `KIDS_SUMMARY_PROMPT` vs `TWEENS_SUMMARY_PROMPT`)
- `body` (with `KIDS_ARTICLE_PROMPT` vs `TWEENS_ARTICLE_PROMPT`)
- `timeline` (with `KIDS_TIMELINE_PROMPT` vs `TWEENS_TIMELINE_PROMPT`)
- `kid_url_sanitizer` — runs on each kid body
- `quiz` (with `KIDS_QUIZ_PROMPT` vs `TWEENS_QUIZ_PROMPT`)
- `quiz_verification` — runs on each quiz
- `persist` — two separate `persist_generated_article` calls

### Cost impact
- Adult cluster: 1× full chain — unchanged
- Kid-safe cluster: 2× the band-dependent steps — roughly 1.7× total cost (audience check, scrape, categorization, grounding amortized across both bands)
- Owner already approved 2× cost ceiling.

### Categorization for kid bands
Kid pipeline categorizes against the SAME 66-category list as adult. Some categories don't make sense for kids (Crypto, Federal Reserve, Cybersecurity) — handled by:
- Pre-filter: `audience_safety_check` rejects clusters in adult-only categories before generation starts
- The `categories.is_kids_safe` flag — categorize step prefers kids-safe categories when audience=kid

### New prompts to write

In `web/src/lib/pipeline/editorial-guide.ts`:

| Constant | Purpose | Voice |
|---|---|---|
| `KIDS_HEADLINE_PROMPT` | Headline + summary for ages 7-9 | Concrete, short, "wow" framing |
| `TWEENS_HEADLINE_PROMPT` | Headline + summary for ages 10-12 | News voice, slightly looser than adult |
| `KIDS_SUMMARY_PROMPT` | Summary only, kids voice | (split from headline if Pass A goes Option 1) |
| `TWEENS_SUMMARY_PROMPT` | Summary only, tweens voice | |
| `KIDS_ARTICLE_PROMPT` | Body for ages 7-9 | 80-120 words, short sentences, concrete examples ("like every school in your state") |
| `TWEENS_ARTICLE_PROMPT` | Body for ages 10-12 | 120-180 words, real news rhythm, jargon explained once |
| `KIDS_TIMELINE_PROMPT` | Timeline for ages 7-9 | 4-6 events, simple language |
| `TWEENS_TIMELINE_PROMPT` | Timeline for ages 10-12 | 4-8 events, slightly more depth |
| `KIDS_QUIZ_PROMPT` | Quiz for ages 7-9 | Easier difficulty ramp, friendly tone |
| `TWEENS_QUIZ_PROMPT` | Quiz for ages 10-12 | Closer to adult difficulty, fewer "gimme" questions |

Existing `KID_*` constants retire (or repurpose `KID_*` as `TWEENS_*` since the current voice is closer to tween than kid).

### Route changes

**`web/src/app/api/admin/pipeline/generate/route.ts`:**

```typescript
// Pseudocode for the new flow
if (audience === 'kid') {
  await runAudienceSafetyCheck();  // unchanged

  // Shared steps
  const sources = await runSourceFetch();
  const corpus = assembleCorpus(sources);
  const cat = await runCategorization(corpus);

  // Run kids and tweens chains in parallel
  const [kidsArticle, tweensArticle] = await Promise.all([
    runBandChain('kids', corpus, cat),
    runBandChain('tweens', corpus, cat),
  ]);

  // Persist both
  const kidsPersist = await persistGeneratedArticle({
    ...kidsArticle, age_band: 'kids', is_kids_safe: true, audience: 'kid',
  });
  const tweensPersist = await persistGeneratedArticle({
    ...tweensArticle, age_band: 'tweens', is_kids_safe: true, audience: 'kid',
  });

  // Return both article IDs
  return { ok: true, articles: [kidsPersist, tweensPersist] };
}
// Adult path unchanged
```

`runBandChain(band, corpus, cat)` runs: headline → summary → body → grounding → plagiarism → timeline → kid_url_sanitizer → quiz → quiz_verification, all using band-specific prompts.

### Persist payload contract

`PersistArticlePayload` (`web/src/lib/pipeline/persist-article.ts`) gets:
- `audience: 'adult' | 'kid'`
- `age_band: 'kids' | 'tweens' | 'adult'`
- `is_kids_safe: boolean` (derived from age_band, but explicit for clarity)
- `kids_summary?: string` (set on kid+tween articles, identical-to-summary OK)

### Acceptance criteria for Phase 3
- [ ] One adult cluster generated → 1 article in `articles` table, `age_band='adult'`, `is_kids_safe=false`
- [ ] One kid-safe cluster generated → 2 articles, both `is_kids_safe=true`, one `age_band='kids'` and one `age_band='tweens'`
- [ ] Articles share `cluster_id` so the admin can navigate between them
- [ ] Cost per kid cluster is roughly 1.7× cost per adult cluster (verify in `pipeline_costs`)
- [ ] Audience-mismatch (adult-grade content in a kid run) still produces zero kid articles

### Phase 3 lift
~12 hours (split: 4h editorial, 6h route refactor, 2h testing).

---

## Cluster → article relationship

Currently `feed_clusters.primary_article_id` points to the adult article. After banding:

```sql
ALTER TABLE feed_clusters
  ADD COLUMN primary_kid_article_id uuid REFERENCES articles(id),
  ADD COLUMN primary_tween_article_id uuid REFERENCES articles(id);
```

`primary_article_id` stays as "the adult article" for back-compat. New columns track the kid + tween siblings. Admin newsroom uses these to render a 3-slot view per cluster.

---

## Admin newsroom integration

Per owner clarification: pipeline generates up to 3 articles per cluster, each with its own admin manager.

| Generated article | Admin view |
|---|---|
| Adult article | `web/src/app/admin/newsroom/clusters/[id]/page.tsx` (existing — shows the adult article) |
| Kids article (age_band='kids') | `web/src/app/admin/kids-story-manager/page.tsx` (existing — needs to filter by age_band) |
| Tweens article (age_band='tweens') | `web/src/app/admin/tweens-story-manager/page.tsx` **NEW** |

**Story Manager** (the cluster detail page) presents a 3-pane or 3-tab view:

```
[ Cluster: <title> ]

[ Adult Article ] [ Kids Article ] [ Tweens Article ]
   (default tab)    (if exists)      (if exists)

   <article editor for selected pane>
```

Or a links view:

```
[ Cluster: <title> ]

✓ Adult Article — published          [Edit]
✓ Kids Article — draft               [Edit in Kids Story Manager]
✓ Tweens Article — draft             [Edit in Tweens Story Manager]
```

Each editor (Adult / Kids / Tweens) preserves its existing flows but filters articles by `age_band`. Detail in `07_ADMIN.md`.

---

## Settings + kill switches

Add to `settings` table:
- `ai.kid_band_generation_enabled` — boolean, default `true`. When false: kid runs produce only the tweens article (skip the kids band entirely). Cheap rollback path if the kids voice produces bad content at scale.
- `pipeline.kid_band_split_threshold_age` — integer, default `10`. The age boundary between kids and tweens bands, if you ever want to tune it.

Existing kill switches retain:
- `ai.adult_generation_enabled`
- `ai.kid_generation_enabled` — when false, neither band generates

---

## Categorization for kid runs — special handling

The categorize step uses the FULL category list. For kid runs, we want to constrain it to kid-safe categories. Two paths:

**Path 1: Filter at prompt-build time**
- When `audience='kid'`, the categorize step's category list is filtered to `WHERE is_kids_safe=true`
- LLM picks from a smaller list
- Simpler, no special prompt logic

**Path 2: Validate after picking**
- Categorize against full list, but reject + retry if returned category isn't `is_kids_safe`
- Higher cost (potential retry), but lets the categorize prompt stay generic

**Recommendation: Path 1.** Cleaner, lower cost.

### Category fallback
If the kids-safe list returns no good match, fall back to the cluster's existing `category_id` (if any), then to `pipeline.default_category_id`. Don't fail the whole run on categorize.

---

## Image generation

Out of scope for this plan. Cover images currently come from RSS feed metadata or the source articles. Banded versions can share the same cover image — both `articles` rows get the same `cover_image_url`. No additional generation cost.

---

## Cleanup of dead instructions in prompts

After Pass A, do a sweep for any remaining drift:
- All `KID_*` constant names should retire post-Phase-3 (replaced by `KIDS_*` and `TWEENS_*`)
- `editorial-guide.ts` should have a header comment listing every exported constant + its consuming step
- `prompt-overrides.ts` `StepName` union should match the route's `Step` union exactly

---

## Phase 0 + Phase 3 file change manifest

### Pass A only (Phase 0)
- `web/src/lib/pipeline/editorial-guide.ts` — prompt edits
- `web/src/app/api/admin/pipeline/generate/route.ts` — Zod tweaks + summary user-turn fix + quiz user-turn fix

### Phase 3 banded generation
- `web/src/lib/pipeline/editorial-guide.ts` — 8 new band prompts, retire 3 KID_* constants
- `web/src/app/api/admin/pipeline/generate/route.ts` — band-loop refactor, two-persist flow
- `web/src/lib/pipeline/persist-article.ts` — payload type + audience routing
- `web/src/lib/pipeline/prompt-overrides.ts` — extend `StepName` if any new override slots
- `supabase/migrations/...` — feed_clusters columns + age_band column (M5 from `02_DATABASE.md`)
- `web/src/app/admin/newsroom/clusters/[id]/page.tsx` — 3-tab cluster view
- `web/src/app/admin/kids-story-manager/page.tsx` — filter by age_band='kids'
- `web/src/app/admin/tweens-story-manager/page.tsx` — NEW file (mostly a clone of kids-story-manager scoped to tweens)
