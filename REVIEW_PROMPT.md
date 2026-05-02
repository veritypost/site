# Story Cleanup — End-to-End Review

You are running a verification pass on the story cleanup work. The cleanup
loop closed 34 concerns across ~25 commits. Owner wants confidence that
each RESOLVED concern actually ships the behavior the owner asked for —
not just that tsc passes.

## What you're checking

`/Users/veritypost/Desktop/verity-post/story_cleanup_state.md` lists every
concern with its RESOLUTION block. Concerns #1–#34, minus #6 (RESOLVED via
Session F), #8 (RESOLVED via Session F), #13 (RESOLVED via Session H), #28
(RESOLVED via Session H, one-shot retry — not a full polling fix), #29 (web
slice RESOLVED, iOS deferred — DO NOT touch Swift), #31 (RESOLVED via
Session J), #32 (RESOLVED via Session K). Everything else also RESOLVED.

The risk: some concerns were self-verified by the implementing agent
without a third-party verifier pass. Specifically:
- **Editor bundle (Session E)**: #14, #15, #16, #17, #18, #19, #20, #30 —
  all self-verified, tsc clean, but no independent UI check.
- **Public reader bundle (Session C)**: #21, #22, #23, #24, #25 — verified
  but with documented papercuts (#21 masthead says "today" on fallback;
  #24 anon quiz attempt 4xx's after card click).
- **#28**: Session H shipped a one-shot retry, NOT a full polling fix. If
  pipeline finalization takes >2 ticks the timeline will show stale-empty
  until the operator refreshes.
- **#11 + #34**: Session G; Published pill depends on a polling path the
  reviewer didn't personally trace end-to-end.
- **#33**: Polling reads article_id from `pipeline_costs.article_id` (not
  `pipeline_runs`) — a behavior change to a load-bearing path.

## Your job

Spawn **5 parallel investigation sub-agents** (Agent tool, run in single
message with multiple tool calls so they execute concurrently). Each agent
reads code in a specific surface area and reports verifier-style:
**Does the actual current code on `main` deliver the symptom-fix the
RESOLUTION block claims?** Read-only — no code changes.

For each agent: give it (a) the concern numbers it owns, (b) the relevant
RESOLUTION blocks from `story_cleanup_state.md` quoted verbatim, (c) the
specific files to read, (d) the question to answer per concern.

The agents must NOT trust the RESOLUTION blocks at face value. They should
quote actual code with file:line, compare it to the claimed fix, and
report PASS / FAIL / SUSPICIOUS for each concern.

### Agent 1 — Newsroom Discovery surface

Concerns: #3, #4, #6, #7, #8, #9, #11, #34, #31.

Files:
- `web/src/app/admin/newsroom/page.tsx`
- `web/src/app/admin/newsroom/_components/StoryCard.tsx`
- `web/src/app/admin/newsroom/_components/AudienceCard.tsx`
- `web/src/app/admin/newsroom/_components/SourcesBlock.tsx`
- `web/src/app/api/admin/newsroom/clusters/[id]/move-item/route.ts` (#3)
- `web/src/app/api/admin/articles/new-draft/route.ts` (#6)
- `web/src/app/api/admin/newsroom/clusters/list/route.ts` (#8)
- `web/src/app/api/admin/pipeline/generate/route.ts` (#31 source split)

Per concern, verify:
- #3: move-item route catches recordAdminAction failures.
- #4: zero references to bulkGenerate, "Generate All Pending", or
  per-card "Generate All" anywhere in the newsroom directory.
- #6: new-article modal has Manual + AI modes; Manual requires unique slug
  and lands in editor; new-draft route handles `mode: 'manual'` without
  invoking AI.
- #7: ViewToggle has minHeight 44 + alignItems stretch; filter row uses
  `<Select>` component (not raw `<select>`); TextInput has minHeight 44.
- #8: Run Feed modal has General + Custom modes; clusters/list route
  accepts `q`, `category`, `subcategory` and searches across `feed_id`s
  not just one feed.
- #9: zero `instructions` state or `<input placeholder="Optional
  instructions…">` in AudienceCard.
- #11: AudienceCard pill includes "Published" label; check how `published`
  gets sourced (poll? prop? on-mount fetch?).
- #31: AudienceCard generate POST splits `attach_as_source_urls` from
  `all_source_urls` (or equivalent named pair); StoryCard wires both
  arrays through; generate route schema accepts both; mute outlet UI is
  removed; verify `muted_outlets` table reference is gone client-side.
  Note: server-side migration to drop the table is owner-run — confirm
  it's NOT silently dropped by the agent.
- #34: AudienceCard generated-state JSX has NO articleId-fallback "View
  article" Link branch; only `articleSlug ? <Link>...</Link> : null`
  followed by the Edit Link.

### Agent 2 — Articles tab + StoryEditor

Concerns: #10, #12, #13, #14, #15, #16, #17, #18, #19, #20, #28, #30.

Files:
- `web/src/app/admin/newsroom/_components/ArticlesTable.tsx`
- `web/src/components/article/StoryEditor.tsx`
- `web/src/components/article/KidsStoryEditor.tsx`
- `web/src/app/admin/story-manager/page.tsx`
- `web/src/app/admin/kids-story-manager/page.tsx`
- The timeline section component used by the editors (find via grep)

Per concern, verify:
- #10: AudienceCard has Edit Link routed by audienceBand to story-manager
  vs kids-story-manager.
- #12: ArticlesTable row title `<Link>` href routes to editor (story-
  manager / kids-story-manager), not `/<slug>` public.
- #13: StoryEditor's "Open article" button does router.push to public
  slug, NOT open a drawer; the drawer component is gone or has no
  remaining callers (grep confirms).
- #14: editor renders `articles.body` in the textarea (search for the
  body field load path).
- #15: editor's Timeline section shows the article anchor row (type=
  'article') visually distinct from events.
- #16: KidsStoryEditor mirrors #15.
- #17: article-date input has a default value (anchor row's date OR
  today) when newly generated.
- #18: editor renders `articles.excerpt` / summary field.
- #19: timeline event badge derived from `entry.type` ('event' shows
  Event, 'story' shows Story, 'article' shows Article).
- #20: toolbar (Open article / View timeline / Preview / Save / Publish
  draft / Unsave) is one consolidated bar at consistent sizes.
- #28: timeline section has a one-shot retry effect — if first fetch is
  empty, it retries once after a delay. Verify the retry actually fires.
- #30: + Article / + Event / + Story buttons all exist; each writes the
  matching `entry.type` to DB / state.

### Agent 3 — Public reader (web) — `/<slug>` surface

Concerns: #21, #22, #23, #24, #25, #26, #27, #29.

Files:
- `web/src/app/[slug]/page.tsx`
- `web/src/app/page.tsx` (home — for #21)
- Article body / Sources / Timeline / Quiz / Discussion components
- `web/src/lib/dates.ts` or wherever `formatTimelineDate` lives (#26)
- The mobile-tab wrapper added by Session I (#29)

Per concern, verify:
- #21: home page falls back to recent published when today's edition is
  empty (find the article query, check the OR/fallback clause).
- #22: sources block render path has NO `hasPermission`/RLS gate that
  blocks anon viewers.
- #23: timeline render path has NO anon-blocking gate.
- #24: quiz card render path has NO anon-blocking gate (the click-to-
  attempt path can still 4xx — that's a known papercut, not a regression).
- #25: discussion section render path has NO anon-blocking gate.
- #26: `formatTimelineDate` returns MM/DD/YYYY for valid dates; check the
  helper handles edge cases (bad date → fallback, null → '').
- #27: timeline render does NOT include event_body / description text.
- #29: at narrow viewport, public reader renders top tabs: Article /
  Timeline / Quiz & Discussion (adult); Article / Timeline / Quiz (kids
  version — find which prop / context flag selects kids).

### Agent 4 — Polling, audit, infrastructure

Concerns: #5, #32, #33.

Files:
- `web/src/app/admin/newsroom/_components/AudienceCard.tsx` (#33 polling
  reads `pipeline_costs.article_id`)
- `web/src/app/api/admin/pipeline/runs/[id]/route.ts` (returns steps
  array with article_id field)
- `web/src/lib/adminMutation.ts` (#32 — `recordAdminAction` logs +
  Sentry-captures, does NOT throw)
- Find every callsite of `recordAdminAction` via grep — confirm none is
  wrapped in a try/catch that suppresses ITS OWN errors (now redundant)
  AND none assumes it throws on failure.

Per concern, verify:
- #5: locked by owner manual SQL — n/a, just confirm no migration file
  was added in this batch that would re-create wiped data.
- #32: `recordAdminAction` body has try/catch that logs + Sentry-captures
  failures without re-throwing; confirm return type is unchanged so
  callers don't need updates.
- #33: pollOnce reads `article_id` from the last successful step in
  `json.steps` (not `json.run.article_id`). Quote the actual line.

### Agent 5 — Cross-platform + DB integrity

Concerns: any cross-platform issues, plus DB schema sanity.

Tasks:
- Confirm iOS files (`VerityPost/`, `VerityPostKids/`) were NOT modified
  by any concern except where iOS scope was explicitly opted into. Run
  `git log --oneline origin/main -- VerityPost VerityPostKids` and
  expect zero commits in this cleanup batch.
- Verify `formatTimelineDate` is imported by every consumer that
  formats a timeline date (not duplicated). Grep for `MM/DD/YYYY` or
  date-format-like strings in timeline components and confirm they all
  funnel through the helper.
- Verify NO destructive SQL was applied automatically: the
  `muted_outlets` table drop should still be PENDING owner-run if #31
  flagged it that way, OR a migration file should exist for the owner
  to apply manually. Check `supabase/migrations/` for any new files
  added in this batch and report.
- Search for orphaned imports / dead code: anything that still imports
  `forwardRef`, `useImperativeHandle`, `AudienceCardHandle`, mute-outlet
  helpers, freeform_instructions UI helpers — should be zero.

## Output format (each agent)

Plain text, one section per concern owned. Per concern:
- **PASS / FAIL / SUSPICIOUS** (one of three)
- **Evidence**: file:line + quoted code (1-3 lines)
- **Gap (if any)**: what the RESOLUTION claimed vs what the code does

End with a final-line verdict for the agent's bucket: e.g. "Bucket: 11/12
PASS, 1 SUSPICIOUS (#17 — article-date default branches on a stale prop)".

## Final aggregation

After all 5 agents return, **YOU** synthesize a single summary back to
the owner:
- Total PASS / FAIL / SUSPICIOUS counts
- List each FAIL with concern # + one-sentence symptom
- List each SUSPICIOUS with concern # + one-sentence "worth a manual
  test"
- Recommend: ship as-is / fix N items first / dig deeper on specific
  concerns

Be ruthless — if an agent reports SUSPICIOUS and the gap is real, call
it out. If everything PASSes, say so plainly.

Do NOT modify code in this review pass. If you find a real bug, file a
new concern in `story_cleanup_state.md` (numbered #35+) and report it
to the owner; do NOT fix it inline.
