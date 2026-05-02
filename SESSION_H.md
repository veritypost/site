# Session H — concerns #13 + #28 (StoryEditor sidebar + late-loading timeline)

Continue with `story_cleanup_prompt.md`. Work concerns #13 and #28 in this
session, bundled — both live inside StoryEditor.tsx and KidsStoryEditor.tsx.

## #13 — "Open article" opens a sidebar

StoryEditor's "Open article" affordance currently opens a sidebar drawer
instead of navigating directly. Owner wants direct navigation to the
article.

Owner: "i click en open aritcle it oopens sidebar when it should immediately
bring me to the article."

Replace the drawer-open with a direct `router.push` to the public `/<slug>`
URL when slug exists, or noop / disable when slug is null. Drop the drawer
component entirely if it has no other consumers (verify via grep). Was
deferred by Session B (concern #12 owner) and re-deferred by Session E
because it lives in the editor bundle's files; you are now its session.

## #28 — Editor timeline appears late after generation

Owner saw the timeline section in the editor take minutes to populate after
the pipeline finished.

Owner: "timeline took a few minutes to actually show up."

Was deferred by Session E with the note "real fix is outside editor scope,
lives in newsroom progress-label clarity owned by another session" — but no
such session exists, so it's yours.

Investigate: does the editor timeline section fetch on-mount (reading the DB
directly), polling-with-debounce, or only on explicit refresh? Compare
against what the newsroom polling does (post-#33). Likely fix: add an effect
that re-fetches timeline rows when articleId becomes set, or shorten an
existing poll interval.

## Locked decisions in scope

- iOS scope deferred — web slice ships here.
- Editor button bar was condensed in #20 (commit `ea87909`) — your drawer
  removal for #13 may interact with the new toolbar; check the toolbar still
  reads as one bar after the drawer-trigger is gone.

## File scope

Touch ONLY:
- `web/src/components/article/StoryEditor.tsx`
- `web/src/components/article/KidsStoryEditor.tsx`
- The timeline section component the editor uses
- The drawer component being removed (only if it has no other callers —
  confirm via grep)

DO NOT touch AudienceCard, newsroom page.tsx, public story view, or admin
scaffolding.

## Concern bookkeeping

- Skip RESOLVED: #1, #2, #3, #4, #5, #7, #9, #10, #12, #14, #15, #16, #17,
  #18, #19, #20, #21, #22, #23, #24, #25, #26, #27, #30, #33.
- Skip DEFERRED-other: #6, #8, #29.
- #13 and #28 are listed DEFERRED in `story_cleanup_state.md` but you ARE
  picking them up. Flip status to IN_PROGRESS on each before working it.

## Parallel coordination

Three other sessions are running simultaneously:
- Session F — concerns #6 + #8 (newsroom modal + feed search)
- Session G — concerns #11 + #34 (AudienceCard.tsx)
- Session I — concern #29 (web mobile reader / article slug page)

None of them will touch StoryEditor.tsx / KidsStoryEditor.tsx. All sessions
write RESOLUTION blocks into `story_cleanup_state.md`; expect possible merge
conflicts local to each concern's section. Pull --rebase before pushing if
origin advanced.

Push when ready: `git push origin main`.
