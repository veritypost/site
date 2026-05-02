# Story Cleanup — Concerns Tracker

This file is the source of truth for the post-Wave-7 newsroom + reader cleanup.
Each entry is a symptom the owner saw. Each agent session picks the next
concern with status PENDING, runs Investigate → Review → Fix, and updates the
status block.

Status values: PENDING | IN_PROGRESS | RESOLVED | DEFERRED

---

## Raw owner notes — verbatim

These are the unedited messages the owner sent in the originating chat
session. Agents must read THIS section before reading the structured concern
list below, and form their own interpretation of what the owner is
describing. Do NOT trust the structured concerns to be a complete or correct
restatement. If a concern in the list contradicts a raw note, the raw note
wins; flag the mismatch in your resolution block.

> we are missing haiku and other openai models from the search. i want to
> do a general dropdown on top where i can select what ai generates it.
> theres no need to have each card have its own which model. we can just do
> a blank model for each. also i try to remove source and it says could not
> remove source.
>
> i dont want a generate all pending pbutton or genrete all button eitehr.
> so make note of that and then i want you to clear every article and every
> news thing in the newsroom.
>
> its okay the sites not live
>
> so then i start from scratch

> i can choose to manually create the article or auto generate, auto
> generate it uses ai, manual it doesnt. whats mute outlet again? the
> buttons at the top are confusing theyre all different sizes in newsroom.
> and when i say want to run the feed and customize i want to be able to do
> a general seaerch then it just grabs everything. then i can choose a
> custom search that i can enter in a prompt and search by category and
> maybe subcategory. there should be a general search prompt for the whole
> feed so we can look for certain things, not a per article prompt

> blank sotry editor but it rquires a slug
> it narrows it down so if im like find articles about a tiger or tigers
> cuz its for kids then i want it to do that and search like all 250 feeds
> for shit about tigers

> also when genrate an aritcle on that card it should show edit where i can
> immediaely edit it, i shouldntn have to go to articles to see that. then
> that card should show the current status, whether gerernated, published
> whatever, also when i immedately clicked the article from articles it
> brought me to teh view not to edit. also it didnt gerenate an article
> body, didnt put this current article on the timeline date, now it create
> timeline events but not for the article, arrticle date shoud default date
> it ran. akso the summary is missing. alsowhen tit created the the
> timeline for when things happened it created them as stories andnot
> events if you look at article=2c0d9dda-e0ca-4e58-872c-0fbbf9bab786 youll
> know what im talking about
>
> also idk why i see open article view timeline preview save and publish
> draft and unsave, theyre all over the place and look like shit and feel
> like it can be doenseed. also i click en open aritcle it oopens sidebar
> when it should immediately bring me to the article.
>
> also that article was published and its not on the home page, nor are
> the sources are showing at the story view, nor is the timeline nor are
> the questions nor is the discussion area

> timeline should be mm/dd/yyyy and also only be the headline never
> anything else and

> timeline took a few minutes to actually show up

> while youre in there, on mobile view and ios it each article should be 3
> columns. 1 is the article middle is the timeline and then right quiz &
> dicsussion also kids would not get discssion obviously

(owner picked Option B — top tabs — for the 3-tab layout.)

> also when i click it article it calls it an event, when i click event it
> shows as an event
> i dont see an option for story even tho the story is the one that showed
> for all the original auto gerneated timelines so that should be looked
> into

When the owner says "I saw X" treat that as ground truth. Do not respond by
showing them DB rows that imply they didn't see what they say they saw.
Render-side bugs are common; the absence of the symptom in the data is
evidence that the bug is render-side, not evidence that the user is wrong.

---

## Locked decisions

- Mobile + iOS reader layout: top tabs, three sections (Article / Timeline /
  Quiz & Discussion). Kids version omits the Discussion tab.
- Manual story creation requires a slug at create time (operator types it;
  must be unique against `stories.slug`).
- DB wipe scope already locked and run by owner via Supabase SQL editor.
- **Mute outlet** — DROPPED (rip out entirely). Replacement behavior: an
  unchecked source on a Story stays available to the article-generation
  pipeline as content/context but does NOT get attached to the published
  article as a "source" row. Selection (the checkbox state) controls
  source-attachment, not whether the cluster item participates in
  generation. (2026-05-02)
- **Commit cadence** — owner indifferent; default to one commit per
  resolved concern (clean reviewable history). (2026-05-02)
- **Big-feature peel-off** — #6 (manual flow), #8 (feed search), #29
  (3-tab layout) get their OWN sessions; do not run inside this loop.
  (2026-05-02)
- **iOS scope** — DEFERRED to a separate iOS-specific session. Within this
  loop, iOS slices are noted but not implemented; the web slice ships
  here. (2026-05-02)

---

## Open decisions the owner still owes

(none currently)

---

## Concerns

### 1. Newsroom — model picker
Status: RESOLVED
Symptom: Model selector is missing Claude Haiku and other OpenAI models
(currently Sonnet, Opus, GPT-4o only).

### 2. Newsroom — one global model dropdown
Status: RESOLVED
Symptom: Each card has its own model selector. Wanted: one dropdown at the
top of the Discovery tab; cards have no model UI of their own.

```
RESOLUTION (concerns 1 + 2) — 2026-05-02
Investigate: Per-card MODEL_OPTIONS (3 entries: Sonnet, Opus, GPT-4o)
             lived in AudienceCard.tsx:84-88 with local modelIdx state at
             :121, rendered as <select> at :414-431 (idle) and :489-506
             (failed). Locked decision: one global picker at the top of
             Discovery tab with 5 models — Sonnet 4.6, Opus 4.7, Haiku 4.5,
             GPT-4o, GPT-4o Mini. Backend already validates against the
             ai_models allowlist; queried it via supabase MCP and confirmed
             4 active rows present (Sonnet, Haiku, GPT-4o, GPT-4o-mini)
             but NO row for claude-opus-4-7 — pre-existing latent bug in
             the old 3-entry list too.
Review:      A (confirmer) CONFIRMED on direction; flagged missing Opus
             allowlist row + dead retry-path picker + adjacent bulk-generate
             button. B (adversarial) flagged: wrong version labels (Stage 1
             proposed 4.5/4.5 instead of 4.6/4.7/4.5), bulk-generate would
             violate the locked no-bulk-generate decision, "+ New article"
             modal + retry route + StoryEditor follow-up generate could
             miss the global picker. Tie-breaker decided focused scope:
             only AudienceCard's per-card picker is in scope; bulk-generate
             belongs to concern #4, modal redesign belongs to concern #6,
             retry route is a non-visible behavior the owner didn't speak
             to. Labels corrected to match locked memory + DB display_name.
Fix:         NEW web/src/lib/newsroomModels.ts (single source of truth, 5
             entries with correct backend model strings).
             web/src/app/admin/newsroom/page.tsx — DiscoveryTab imports
             MODEL_OPTIONS, holds selectedModelIdx state, renders <select>
             in filter row after sort dropdown, passes prop to StoryCard.
             web/src/app/admin/newsroom/_components/StoryCard.tsx — accepts
             selectedModelIdx?: number prop (default 0), forwards to all
             three AudienceCards in the BANDS.map.
             web/src/app/admin/newsroom/_components/AudienceCard.tsx —
             imports MODEL_OPTIONS from @/lib/newsroomModels, removes
             inline const + local modelIdx state, accepts prop, uses
             MODEL_OPTIONS[selectedModelIdx] in handleGenerate POST body,
             deletes both <select> blocks (idle + failed).
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only, no iOS surface
Verifier:    pass — all five models in dropdown; per-card UI fully
             removed; prop drilled to all three bands; useCallback deps
             updated; no dead refs; filter-row placement sensible
Status:      RESOLVED — owner must INSERT the ai_models row for
             ('anthropic','claude-opus-4-7','Claude Opus 4.7',15,75,true)
             before Opus is selectable end-to-end. SQL provided in chat.
             Out-of-scope adjacencies surfaced for sibling concerns:
             - handleBulkGenerate (page.tsx:386-426) and the page-level
               "Generate All Pending" button (page.tsx:503-510) → concern #4
             - per-Story "Generate All" button on StoryCard header
               (StoryCard.tsx:191-195) → concern #4
             - "+ New article" modal (page.tsx:758) → concern #6
             - Retry route inherits original run's model — by design,
               not in scope for owner's reported symptom
             - StoryEditor follow-up generate (StoryEditor.tsx:806) — out
               of newsroom scope entirely
```

### 3. Newsroom — "Could not remove source"
Status: PENDING
Symptom: Clicking Remove on a source row in a Discovery card surfaces a
"Could not remove source" toast.

### 4. Newsroom — drop bulk-generate buttons
Status: PENDING
Symptom: Both "Generate All Pending" (page) and "Generate All" (per-card,
all 3 audiences at once) need to go. Generation is one-AudienceCard at a time.

### 5. Newsroom — DB wipe to start fresh
Status: IN_PROGRESS
Symptom: Owner wants every article + news row cleared so testing starts
clean. Wipe SQL handed over and verified against information_schema. Owner
runs it in the Supabase SQL editor. Awaiting confirmation it ran.

### 6. Newsroom — manual create flow (no AI)
Status: DEFERRED
Symptom: Need a "+ New manual story" path that opens a blank StoryEditor
without invoking any AI. Owner enters a slug (required) up front; the rest
is blank.
Reason: Big-feature peel-off — owner locked this for its own session
(2026-05-02).

### 7. Newsroom — top-row buttons different sizes
Status: PENDING
Symptom: The top row of the newsroom page mixes button sizes / variants —
visually inconsistent.

### 8. Newsroom — feed run becomes search
Status: DEFERRED
Symptom: Today the feed-run flow is opaque. Wanted: two modes — General
(grab everything) and Custom (operator types a prompt + picks category and
subcategory). Search runs across all ~250 feeds' ingested clusters, e.g.
"tigers" returns every cluster mentioning tigers.
Reason: Big-feature peel-off — owner locked this for its own session
(2026-05-02).

### 9. Newsroom — drop per-card freeform-instructions input
Status: PENDING
Symptom: AudienceCard currently has its own per-article "Optional
instructions…" textarea. Wanted: removed — replaced by the feed-level
search prompt from #8.

### 10. AudienceCard — Edit button after generate
Status: PENDING
Symptom: After an AudienceCard finishes generating, there's no way to jump
straight into editing the article. Operator has to leave the newsroom and
navigate to /admin/articles. Wanted: Edit button right on the card.

### 11. AudienceCard — live status
Status: PENDING
Symptom: Card doesn't show a clear status (idle / generating / generated /
published / failed). Wanted: persistent status badge per audience.

### 12. /admin/articles — clicking article opens view, not edit
Status: PENDING
Symptom: Default click on a row in /admin/articles navigates to the public
view of the article. Wanted: navigate to the editor.

### 13. /admin/articles — "Open article" opens a sidebar
Status: PENDING
Symptom: The "Open article" affordance opens a sidebar drawer instead of
navigating directly to the article.

### 14. Generated article — body not visible
Status: PENDING
Symptom: After a successful generate, the article's body doesn't show in
the editor (or wherever the operator is looking). DB confirms body is
written, so this is a render-side gap.

### 15. Generated article — anchor row not visible on its own timeline
Status: PENDING
Symptom: The generated article doesn't appear as a node on its own story's
timeline in the editor. DB confirms a `type='article'` anchor row exists.

### 16. Editor timeline — historical events shown but not the new article
Status: PENDING
Symptom: Timeline section in the editor lists the historical events that
were generated, but the article itself isn't placed among them.

### 17. Editor — article date defaults blank
Status: PENDING
Symptom: The Article-date input in the editor renders blank for newly
generated articles. Wanted: defaults to the date generation ran (matches
articles.published_at / generated_at when present, otherwise today).

### 18. Generated article — summary not visible
Status: PENDING
Symptom: Summary / excerpt isn't shown in the editor for newly generated
articles. DB confirms excerpt is populated.

### 19. Editor timeline — historical events render as "stories" not events
Status: PENDING
Symptom: Historical timeline rows show the "Story" badge/styling instead
of the "Event" badge in the editor's timeline section. DB confirms they
are type='event'.

### 20. StoryEditor — button bar is sprayed
Status: PENDING
Symptom: Open article / View timeline / Preview / Save / Publish draft /
Unsave are scattered across the editor at inconsistent sizes and
positions. Owner wants this condensed into one clear bar.

### 21. Public — published article not on home page
Status: PENDING
Symptom: Article was published from the editor (articles.status='published'
+ articles.published_at set) but doesn't appear on the home page.

### 22. Public story view — sources missing
Status: PENDING
Symptom: Sources block does not render on the public /<slug> story view.
DB confirms 2 source rows exist for this article.

### 23. Public story view — timeline missing
Status: PENDING
Symptom: Timeline does not render on the public /<slug> story view.
DB confirms 7 timeline rows for this story.

### 24. Public story view — quick-check questions missing
Status: PENDING
Symptom: Quiz questions do not render on the public /<slug> story view.
DB confirms 5 active quiz rows for this article.

### 25. Public story view — discussion area missing
Status: PENDING
Symptom: Discussion / comments area does not render on the public
/<slug> story view.

### 26. Timeline — date format MM/DD/YYYY everywhere
Status: PENDING
Symptom: Timeline event dates are not displayed as MM/DD/YYYY across all
surfaces (public, editor, iOS, kids iOS).

### 27. Timeline — headline only, no body
Status: PENDING
Symptom: Timeline events render with body / description text. Wanted:
date + headline only, never any body, on every surface.

### 28. Editor timeline — appears late after generation
Status: PENDING
Symptom: After the pipeline completes, the timeline section in the editor
takes minutes to populate. Owner saw the rows appear long after the article
was generated.

### 29. Mobile + iOS — 3-tab article layout
Status: DEFERRED
Decision: Top tabs (Option B) — Article / Timeline / Quiz & Discussion.
Kids: no Discussion tab (Article / Timeline / Quiz only).
Surfaces: web mobile reader, iOS adult reader, kids iOS reader.
Reason: Big-feature peel-off — owner locked this for its own session
(2026-05-02). iOS scope also separately deferred to an iOS session.

### 30. Editor timeline — adding an Article creates an Event; no Story option
Status: PENDING
Symptom: In the editor's Timeline entries section, clicking the "+ Article"
affordance produces an entry that shows up labeled as "Event". Clicking
"+ Event" also shows up as Event (correct). There's no visible "Story"
option in the add controls — yet the originally auto-generated timeline
entries on this article rendered as "Story". So either the add buttons
are mismapped, or the badge is computed off the wrong field, or the
"Story" affordance is missing entirely. Worth investigating end-to-end
how the type='story' / type='article' / type='event' values flow between
the add buttons, the local state, the render badge, and the DB.

### 31. Mute outlet — rip out, change selection semantics
Status: PENDING
Symptom: "Mute outlet" UI is dead weight. Owner wants it removed entirely.
Replacement behavior for the source checkbox on each Story:
  - Unchecked source = NOT attached to the published article as a "source"
    row.
  - Unchecked source IS still passed to the article-generation pipeline
    as content/context (so the AI still sees it).
  - Today's behavior conflates these two: unchecking removes the URL from
    the generate POST body's `source_urls`, which means the AI doesn't
    see it AND it can't be attached. We need to split these concerns.
Surfaces: AudienceCard generate POST + StoryCard sources block + the
mute modal in newsroom page.tsx + any mute-outlet API route.

---

## How to add new concerns

Append a new numbered entry at the bottom (or in the appropriate cluster
above) with status PENDING and a 1-3 sentence symptom description. Do NOT
guess at root causes here — the diagnose step writes that into the per-
concern resolution block when the agent reaches it.

## Per-concern resolution block (filled in as agents run)

When an agent works a concern, it appends a block underneath the entry:

```
RESOLUTION (concern N) — YYYY-MM-DD
Diagnose:    one paragraph on what was actually broken (verified facts only)
Review:      key findings from independent review agents
Fix:         files changed + behavioral summary
TypeScript:  pass/fail
Verifier:    pass/fail with notes
Status:      RESOLVED | DEFERRED (with reason)
```
