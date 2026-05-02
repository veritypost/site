# Session G — concerns #11 + #34 (AudienceCard status pill + drop fallback Link)

Continue with `story_cleanup_prompt.md`. Work concerns #11 and #34 in this
session, bundled — both touch AudienceCard.tsx.

## #11 — AudienceCard live status pill

Today the card renders a pill at AudienceCard.tsx ~line 333 that shows
"Pending | Skipped | Working | Failed | Generated". Owner wants this to also
clearly include "Published" — and to be persistent / prominent enough that
an operator can scan a column of cards and know each audience's state at a
glance.

Owner: "that card should show the current status, whether gerernated,
published whatever."

Note: knowing if an article is published requires reading `articles.status`
from somewhere. The polling response (post-#33 fix landed in commit
`2c8fed9`) now correctly populates articleId — but `status="published"` is
set when the operator publishes from the editor, NOT during generation.
Decide in Stage 1: poll a separate endpoint for article status, embed the
status into the run-detail response, or read it on initial mount +
refresh-on-focus. Stay narrow — don't redesign the pill; just add Published.

## #34 — Drop the redundant articleId-fallback "View article" Link

In AudienceCard's `state === 'generated'` block. Concern #10 added an Edit
Link that already covers the editor-navigation path; the fallback (when
articleSlug is null but articleId is set) routes to the editor too, creating
two affordances doing the same thing. Concern #33 fixed the polling
articleId bug (commit `2c8fed9`), so this is unblocked. Also fixes a latent
bug in the fallback: it hardcoded `/admin/story-manager` even for tweens/kids
articles.

After this change: View=public-page (when slug exists), Edit=editor (when
articleId set), Skip=skip — clean affordance contract, no parallel paths.

## Locked decisions in scope

- "Genuine fixes, never patches" — kill the replaced thing; no parallel
  paths.
- Concern #33 already RESOLVED; #34's premise (polling populates articleId
  reliably) is now true.

## File scope

Touch ONLY:
- `web/src/app/admin/newsroom/_components/AudienceCard.tsx`
- A new article-status polling endpoint if #11 needs server data

DO NOT touch newsroom page.tsx (Session F), StoryEditor (Session H), public
story view, or admin scaffolding.

## Concern bookkeeping

- Skip RESOLVED: #1, #2, #3, #4, #5, #7, #9, #10, #12, #14, #15, #16, #17,
  #18, #19, #20, #21, #22, #23, #24, #25, #26, #27, #30, #33.
- Skip DEFERRED-other: #6, #8, #13, #28, #29.

## Parallel coordination

Three other sessions are running simultaneously:
- Session F — concerns #6 + #8 (newsroom modal + feed search)
- Session H — concerns #13 + #28 (StoryEditor.tsx + KidsStoryEditor.tsx)
- Session I — concern #29 (web mobile reader / article slug page)

None of them will touch AudienceCard.tsx. All sessions write RESOLUTION
blocks into `story_cleanup_state.md`; expect possible merge conflicts local
to each concern's section. Pull --rebase before pushing if origin advanced.

**Critical:** After this Wave 1 finishes, Session J (#31 mute outlet) runs
NEXT and ALSO touches AudienceCard. Make sure your changes are fully pushed
before J starts.

Push when ready: `git push origin main`.
