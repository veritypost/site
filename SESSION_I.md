# Session I — concern #29 (web mobile reader 3-tab layout)

Continue with `story_cleanup_prompt.md`. Work concern #29 in this session,
**web slice only — iOS deferred.**

## #29 — Mobile + iOS article reader: 3-tab layout

Owner wants top tabs (Option B) on the article reader at narrow widths,
with three sections:

- **Article** (the body)
- **Timeline** (the story's events)
- **Quiz & Discussion** (combined for adults)

Kids version omits the Discussion tab — Article / Timeline / Quiz only.

Surfaces:
- web mobile reader at `web/src/app/[slug]/page.tsx` and its child
  components (Article, Timeline, Quiz, Discussion)
- iOS adult reader (DEFERRED to a separate iOS session)
- kids iOS reader (DEFERRED to a separate iOS session)

Owner: "while youre in there, on mobile view and ios it each article should
be 3 columns. 1 is the article middle is the timeline and then right quiz &
dicsussion also kids would not get discssion obviously"

Owner picked Option B (top tabs) for the layout.

## Locked decisions in scope

- Mobile + iOS reader layout: top tabs, three sections (Article / Timeline
  / Quiz & Discussion). Kids omits Discussion.
- iOS scope deferred — note iOS in your investigation but DON'T touch Swift
  code; ship the web slice.
- The desktop reader can stay as-is OR adopt the same tabs — verify with
  current code; the owner's "3 columns" implies desktop side-by-side and
  mobile stacked-as-tabs. Read the current desktop layout in Stage 1 and
  decide which interpretation matches.

## File scope

Touch ONLY:
- `web/src/app/[slug]/page.tsx`
- The reader's child components (Article body, Timeline section, Quiz card,
  Discussion section) — likely under `web/src/components/article/` or
  `web/src/components/reader/`

DO NOT touch AudienceCard, newsroom page.tsx, StoryEditor, ArticlesTable, or
admin scaffolding.

DO NOT touch any Swift / iOS file. Note iOS surfaces in the resolution
block as DEFERRED with a punch list.

## Concern bookkeeping

- Skip RESOLVED: #1, #2, #3, #4, #5, #7, #9, #10, #12, #14, #15, #16, #17,
  #18, #19, #20, #21, #22, #23, #24, #25, #26, #27, #30, #33.
- Skip DEFERRED-other: #6, #8, #13, #28.
- #29 is listed DEFERRED in `story_cleanup_state.md` but you ARE picking it
  up. Flip status to IN_PROGRESS before working it.

## Parallel coordination

Three other sessions are running simultaneously:
- Session F — concerns #6 + #8 (newsroom modal + feed search)
- Session G — concerns #11 + #34 (AudienceCard.tsx)
- Session H — concerns #13 + #28 (StoryEditor.tsx + KidsStoryEditor.tsx)

Session F's, G's, and H's surfaces are independent of the public reader.
**Risk of overlap: timeline rendering helpers.** Session D in Wave 1 already
shipped the canonical `formatTimelineDate` helper (commit `fb28a66`); use
it. If the Article body component you're tabbing imports anything from the
editor side, coordinate by importing helpers, not component internals.

All sessions write RESOLUTION blocks into `story_cleanup_state.md`; expect
possible merge conflicts local to each concern's section. Pull --rebase
before pushing if origin advanced.

Push when ready: `git push origin main`.
