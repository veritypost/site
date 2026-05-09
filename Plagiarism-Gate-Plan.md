# Plagiarism Gate — Implementation Spec

## 1. Current flow (the bug)

`web/src/lib/pipeline/plagiarism-check.ts:125-141` — `rewriteForPlagiarism` swallows non-cost-cap errors and returns `rewrite_status: 'failed'` with the original (still-flagged) body.

`web/src/app/api/admin/pipeline/generate/route.ts:2113-2144` — route consumes `rewrite_status` and tracks a string but never aborts. The "second-pass" check at line 2128 uses relative comparison (`secondCheck < plagResult`), not the absolute flag threshold — a rewrite that drops from 70% to 60% passes today even though both are over the 25% legal threshold.

`route.ts:2597` — pipeline persists the article unconditionally. `route.ts:2619-2644` — sets `needs_manual_review=true` and `plagiarism_status='rewrite_failed'|'rewrite_kept_original'`. The article sits as a draft, one click from publish.

## 2. Strategy: Option A — hard-fail the run

Throw `PlagiarismCheckFailedError`. Run aborts. No article row written. AudienceCard renders "Failed at: Checking originality. Plagiarism rewrite failed" via existing labels. Editor regenerates.

Why not Option B (persist with flag): that's the status quo — already exists via `plagiarism_status` + `needs_manual_review`. It's exactly what's letting flagged drafts sit one click from publish. Option B requires a UI gate on `/admin/story-manager` AND the publish endpoint AND no DB-direct bypass — multi-surface, no defense-in-depth. Option A removes the artifact entirely.

**Hard-fail conditions:**
1. `rewrite_status === 'failed'` (rewrite errored)
2. `rewrite_status === 'no_change'` (identical or <100-char output)
3. `rewrite_status === 'rewritten'` AND second-pass `maxOverlap > flag_pct` (rewrite ran but still over absolute threshold)

**Soft-pass:** `rewritten` AND second-pass `maxOverlap <= flag_pct` AND second-pass `< first-pass`. Persist as before.

`'rewrite_kept_original'` status disappears from new runs (historical rows untouched).

## 3. Code changes

### `web/src/lib/pipeline/errors.ts` — new error class

Append after `PerRunCapExceededError`:

```ts
export class PlagiarismCheckFailedError extends Error {
  constructor(
    msg: string,
    public reason: 'rewrite_failed' | 'rewrite_no_change' | 'rewrite_over_threshold',
    public first_pass_overlap_pct: number,
    public final_overlap_pct: number,
    public flag_threshold_pct: number
  ) {
    super(msg);
    this.name = 'PlagiarismCheckFailedError';
  }
}
```

### `web/src/app/api/admin/pipeline/generate/route.ts`

Import `PlagiarismCheckFailedError` from `@/lib/pipeline/errors`.

Add to `classifyError` (route.ts:536-551, after `PersistArticleError`):
```ts
if (err instanceof PlagiarismCheckFailedError) return 'plagiarism_rewrite_failed';
```

Add to `safeErrorMessage`:
```ts
case 'plagiarism_rewrite_failed':
  return 'Originality check failed — could not produce a clean rewrite';
```

Add to `statusForError`:
```ts
case 'plagiarism_rewrite_failed':
  return 422;
```

Replace the rewrite-result branch at route.ts:2125-2144 with the gate (failed → throw, no_change → throw, rewritten → re-check absolute, over → throw, under → continue). Drop dead `'rewrite_kept_original'` and `'rewrite_failed'` `plagiarismStatus` assignments. Narrow `plagiarismStatus` type to `'ok' | 'rewritten'`.

The existing pre-baked `ERROR_LABELS['plagiarism_rewrite_failed']` in `PipelineStepLabels.ts:38` activates automatically — no UI change.

## 4. New error type

`PlagiarismCheckFailedError` with three reason variants. Maps to `error_type='plagiarism_rewrite_failed'`, HTTP 422.

## 5. Cross-platform applicability (LockedDecision #18)

- **Web (server pipeline)**: applicable.
- **Web (admin UI)**: not applicable — `AudienceCard` renders generic `errorStep`/`errorType`; existing labels resolve.
- **iOS adult**: not applicable — does not run AI generation.
- **iOS Kids**: not applicable — kids product is iOS-only by #15; generation is server-only.
- **Public reader**: not applicable — failed runs persist no article.

## 6. Admin UX

After the gate, AudienceCard polling hits the `failed` branch and renders **"Failed at: Checking originality. Plagiarism rewrite failed"** using existing `STEP_LABELS['plagiarism_check']` + `ERROR_LABELS['plagiarism_rewrite_failed']`. No new AudienceCard states.

## 7. Test plan

1. Trigger `rewrite_over_threshold` leg: lower `pipeline.plagiarism_flag_pct` to 2 and `plagiarism_rewrite_pct` to 1, run a generate. Expect `pipeline_runs.status='failed'`, `error_type='plagiarism_rewrite_failed'`, 0 `articles` rows for that run.
2. `rewrite_failed` leg: inject a throw in `rewriteForPlagiarism` post-`cleanText`. Same expected outcome.
3. `rewrite_no_change` leg: fixture-mock `callModel` to return identical or <100-char text. Same outcome.
4. Clean path: default thresholds (25/20), low-overlap cluster — run completes, article persists.
5. Cost-cap precedence: trip per-run cost cap during rewrite — `error_type='cost_cap_exceeded'`, NOT plagiarism (rethrow at plagiarism-check.ts:126).
6. Re-runnability: failed cluster lock releases (route.ts:2762-2771), state flips to `'failed'`. `[Generate]` works again.

## 8. Rollback

`git revert` the single PR. No DB migration. Schema accepts the now-historical `'rewrite_failed'` and `'rewrite_kept_original'` values; nothing breaks.
