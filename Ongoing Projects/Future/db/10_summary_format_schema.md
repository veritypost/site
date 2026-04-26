# db/10 — Summary and Article Schema

**Owner:** Thompson (editorial ops), Dunford (format ownership).
**Purpose:** `10_SUMMARY_FORMAT.md`. Keep one prose `summary` column, add type + kicker-date columns, add quiz type column. Strip every production-metadata column per Charter commitment 4 (no bylines, no read times, no publication timestamps visible on articles).
**Migration filename:** `schema/<next>_article_surface_cleanup_2026_XX_XX.sql`

---

## Current state (verified 2026-04-21)

`articles` table has a `summary` text column and existing metadata columns: `author_user_id`, `published_at`, `updated_at`, `reading_time_minutes`, and similar. It likely also has joins for `corrections`. Legacy V3 pipeline already produces a prose summary.

## The change

### Additive columns

```sql
ALTER TABLE articles
  ADD COLUMN article_type text NOT NULL DEFAULT 'standard' CHECK (
    article_type IN ('standard', 'developing', 'explainer', 'expert_qa')
  ),
  ADD COLUMN kicker_next_event_date date;

COMMENT ON COLUMN articles.summary IS 'One prose paragraph, 2–4 sentences. No Fact/Context/Stakes labels, no bullets, no scaffolding. Same text renders on feed cards and article header — screenshot-decontextualization test applies.';
COMMENT ON COLUMN articles.article_type IS 'Controls publish validation: standard requires counter-evidence paragraph + kicker_next_event_date + Type A/D quiz. developing/explainer/expert_qa relax specific rules per 10_SUMMARY_FORMAT.md.';
COMMENT ON COLUMN articles.kicker_next_event_date IS 'The dated, scheduled, verifiable next event referenced in the kicker paragraph. Required on publish for article_type=standard. Internal only — not rendered on the reader surface.';
```

### Columns stripped from the reader surface (retained in DB for ops, not rendered)

The following columns may continue to exist in the DB (for admin ops, CMS filtering, legal records, etc.) but are never rendered on reader-facing article surfaces per Charter commitment 4:

- `author_user_id` — retained for admin only. Reader never sees the author name. Story-manager may show it to editors internally.
- `published_at` — retained for chronological ordering and archive-date grouping. Not rendered on article.
- `updated_at` — retained for editorial workflow and admin filtering. Not rendered.
- `reading_time_minutes` — recommend DROP. It was a production artifact with no internal use after the reader-surface rule change.

### Columns removed outright

```sql
ALTER TABLE articles DROP COLUMN IF EXISTS reading_time_minutes;
```

### Explicitly NOT added

- **No `summary_fact` / `summary_context` / `summary_stakes` split.** The summary is one prose paragraph in a single column. No internal scaffolding, no three-field composer, no labels visible or invisible.
- **No `what_we_dont_know` column.** Gaps in reporting live in the article body as prose. Editorial review at publish flags articles that don't weave any of the research gaps into prose.
- **No `named_sources_count`, `document_sources_count`, `anonymous_sources_count` columns.** The sourcing-strength row is cut from the reader surface (Charter commitment 4). If internal analytics want these counts for editor dashboards, they derive at query time from the sources relation — don't persist on `articles`.

### Corrections table

**Recommendation:** drop the public corrections feed entirely per Charter commitment 4 (no corrections banner on articles, no corrections count under byline, no public corrections feed). If the table `corrections` exists from a prior migration:

```sql
-- Option A: drop entirely (recommended if feed is being removed from product)
DROP TABLE IF EXISTS corrections;

-- Option B: keep for internal audit only; remove public read policy
ALTER TABLE corrections DISABLE ROW LEVEL SECURITY;
-- Followed by re-enabling with editor-only read; no public policy.
```

The `corrections.diff_before` / `corrections.diff_after` columns from the prior schema draft are **not added.** No reader-facing correction UI renders diffs.

If a fact changes after publish, the article prose is updated in place to reflect current knowledge. "No stealth edits" (refusal list item 12) is enforced through editor discipline, not a reader-visible diff.

### Quiz questions — add type column

Every quiz contains at least one Type A (Central Claim) and one Type D (Scope Boundary). The type tag powers the fail diagnostic.

```sql
ALTER TABLE quiz_questions
  ADD COLUMN type text NOT NULL DEFAULT 'A' CHECK (
    type IN ('A', 'B', 'C', 'D', 'E', 'F')
  );

COMMENT ON COLUMN quiz_questions.type IS 'Question type: A=Central Claim, B=Load-Bearing Number, C=Causal Chain, D=Scope Boundary, E=Source Attribution, F=Timeline Order. Every quiz must include at least one A and one D. Used by fail diagnostic.';
```

## Backfill

No split. No migration. The existing `articles.summary` column stays. Legacy V3 articles are re-reviewed under V4 editorial rules during normal workflow; no batch rewrite required.

## Trigger on publish

Application code enforces V4 rules. For `article_type='standard'`:

```typescript
// web/src/app/api/admin/articles/save/route.ts
if (article.status === 'published' && article.article_type === 'standard') {
  const missing: string[] = [];
  if (!article.summary || article.summary.trim().length === 0) missing.push('summary');
  if (!article.body || article.body.trim().length === 0) missing.push('body');
  if (!article.kicker_next_event_date) missing.push('kicker_next_event_date');

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Article missing required fields: ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  // Quiz must have at least one Type A and one Type D
  const quizTypes = new Set((await getQuizQuestions(article.id)).map(q => q.type));
  if (!quizTypes.has('A') || !quizTypes.has('D')) {
    return NextResponse.json(
      { error: 'Quiz must include at least one Type A (Central Claim) and one Type D (Scope Boundary) question.' },
      { status: 400 }
    );
  }

  // Timeline: at least 4 events, exactly one is_current
  const timeline = await getTimelineEvents(article.id);
  if (timeline.length < 4) {
    return NextResponse.json({ error: 'Timeline must have at least 4 events.' }, { status: 400 });
  }
  const currentCount = timeline.filter(e => e.is_current).length;
  if (currentCount !== 1) {
    return NextResponse.json(
      { error: `Timeline must have exactly one is_current event, found ${currentCount}.` },
      { status: 400 }
    );
  }
}
```

For `developing`: `kicker_next_event_date` may be null.
For `explainer`: counter-evidence and kicker rules relax per `10_SUMMARY_FORMAT.md`.
For `expert_qa`: alternate validation — requires linked question + expert response rows.

The banned-words check runs at the editorial-review step in the pipeline (step 8 in `24_AI_PIPELINE_PROMPTS.md`), not at the DB layer.

## Callers

### Reads
- `web/src/app/story/[slug]/page.tsx` — renders `<SummaryBlock />` as one prose paragraph; body; timeline; quiz.
- `web/src/app/page.tsx` — feed cards show eyebrow + headline + summary.
- iOS `StoryDetailView` + iOS home feed — same, single prose summary.
- `SummaryBlock` component (web + iOS).

Readers never touch `author_user_id`, `published_at`, `updated_at`, or quiz `type` directly. Quiz `type` feeds the fail-diagnostic copy only.

### Writes
- `/admin/story-manager` — composer UI: single prose `summary` textarea + banned-words compose-time warning + next-event-date picker + counter-evidence presence check. Quiz composer tags each question with a `type` value from A–F.

## Acceptance criteria

- [ ] `articles.summary` remains a single prose column. No split.
- [ ] `article_type` column added with CHECK constraint.
- [ ] `kicker_next_event_date` column added.
- [ ] `reading_time_minutes` column dropped from `articles`.
- [ ] `corrections` table either dropped or its RLS tightened to editor-only (no public feed).
- [ ] `quiz_questions.type` column added with CHECK constraint (A–F).
- [ ] **No** `summary_fact` / `summary_context` / `summary_stakes` columns.
- [ ] **No** `what_we_dont_know` column.
- [ ] **No** `named_sources_count` / `document_sources_count` / `anonymous_sources_count` columns.
- [ ] **No** `corrections.diff_before` / `corrections.diff_after` columns if corrections table retained.
- [ ] Story-manager UI: single prose summary textarea, banned-words check, next-event picker, quiz type tagger.
- [ ] Publish validation blocks missing summary/body/kicker date, or missing Type A/D on quiz, for `standard` type.
- [ ] Reader-facing article renders summary as one prose paragraph; no byline, no read time, no timestamp, no sourcing row, no corrections banner, no sources block.
- [ ] `tsc --noEmit` passes; types regenerated via `mcp__supabase__generate_typescript_types`.

## Dependencies

Ship after `10_SUMMARY_FORMAT.md` is signed. Blocks `09_HOME_FEED_REBUILD.md`, `views/web_story_detail.md`, `views/ios_adult_story.md`.
