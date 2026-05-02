# Session F — concerns #6 + #8 (newsroom: manual create flow + feed search)

Continue with `story_cleanup_prompt.md`. Work concerns #6 and #8 in this
session, bundled — both redesign the "+ New article" / "Run Feed" entry
points on the newsroom page.

## #6 — Manual create flow

A "+ New manual story" path that opens a blank StoryEditor without invoking
any AI. Operator types a slug (required, must be unique against
`stories.slug`) up front; the rest is blank. Today the new-article modal only
does AI-generate from sources.

Owner: "i can choose to manually create the article or auto generate, auto
generate it uses ai, manual it doesnt."

## #8 — Feed-run becomes search

Today the Run Feed button just ingests. Wanted: two modes — General (grab
everything, current behavior) and Custom (operator types a freeform prompt +
picks category + maybe subcategory). Search runs across all ~250 feeds'
ingested clusters, e.g. "tigers" returns every cluster mentioning tigers.
This is the "general search prompt for the whole feed" the owner referenced
when deferring concern #9 (per-card freeform input — already removed).

Owner: "i want to be able to do a general seaerch then it just grabs
everything. then i can choose a custom search that i can enter in a prompt
and search by category and maybe subcategory. there should be a general
search prompt for the whole feed so we can look for certain things, not a
per article prompt."

Owner also: "find articles about a tiger or tigers cuz its for kids then i
want it to do that and search like all 250 feeds for shit about tigers."

## Locked decisions in scope

- "+ New article" modal redesign for #6 IS in scope.
- Slug uniqueness against `stories.slug` is required at create time for #6.
- Backend `freeform_instructions` was retained on the generate route
  (concern #9's resolution); decide whether #8 reuses that field for
  per-cluster generation runs or introduces a feed-level filter that
  precedes generation. The owner's intent reads as "filter the cluster
  list", not "feed a prompt to the LLM" — verify in Stage 1.

## File scope

Touch ONLY:
- `web/src/app/admin/newsroom/page.tsx` and its modal + new-article logic
- The feed-run / clusters/list API routes if #8 needs server-side filtering
- Any new manual-story RPC for #6

DO NOT touch AudienceCard, StoryEditor, ArticlesTable, public story view, or
admin auth scaffolding — those belong to other sessions or are out of scope.

## Concern bookkeeping

- Skip RESOLVED: #1, #2, #3, #4, #5, #7, #9, #10, #12, #14, #15, #16, #17,
  #18, #19, #20, #21, #22, #23, #24, #25, #26, #27, #30, #33.
- Skip DEFERRED-other: #13, #28, #29.
- #6 and #8 are listed DEFERRED in `story_cleanup_state.md` but you ARE
  picking them up. Flip status to IN_PROGRESS on each before working it.

## Parallel coordination

Three other sessions are running simultaneously:
- Session G — concerns #11 + #34 (AudienceCard.tsx)
- Session H — concerns #13 + #28 (StoryEditor.tsx + KidsStoryEditor.tsx)
- Session I — concern #29 (web mobile reader / article slug page)

None of them will touch newsroom/page.tsx or the new-article modal. All
sessions write RESOLUTION blocks into `story_cleanup_state.md`; expect
possible merge conflicts local to each concern's section. Pull --rebase
before pushing if origin advanced.

After this Wave 1 finishes, Session J (#31 mute outlet) and Session K (#32
audit-failure systemic) run sequentially, alone.

Push when ready: `git push origin main`.
