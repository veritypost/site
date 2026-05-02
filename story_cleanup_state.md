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
Status: RESOLVED
Symptom: Clicking Remove on a source row in a Discovery card surfaces a
"Could not remove source" toast.

```
RESOLUTION (concern 3) — 2026-05-02
Investigate: Stage 1 hypothesised the RPC reassign_cluster_items rejects
             p_target_cluster_id=null because the param is "non-nullable
             uuid". REFUTED in Stage 2. Postgres function params accept
             NULL by default; the RPC body explicitly handles `IF
             p_target_cluster_id IS NOT NULL`. The proposed `DEFAULT NULL`
             ALTER FUNCTION fix would also be a Postgres syntax error
             (defaults must trail). Real cause lives in the route, not
             the RPC.
Review:      A (confirmer) ran the RPC via supabase MCP and confirmed
             NULL handling works; could not pin a single static cause;
             listed three real candidates including unguarded
             recordAdminAction. B (adversarial) re-traced the route and
             identified recordAdminAction at move-item/route.ts:132 as
             unguarded `await`; adminMutation.ts:247/254 throws
             Error('audit_failed') on actor-resolution + fallback-insert
             failures; the throw produces an HTML 500 from Next.js after
             the RPC mutation has already committed; client's
             `body.error` is undefined → falls back to "Could not remove
             source" string. A.B don't disagree — B picked the strongest
             candidate from A's list and made the case stronger. No tie-
             breaker needed.
Fix:         web/src/app/api/admin/newsroom/clusters/[id]/move-item/route.ts
             — wrapped the existing recordAdminAction call (already
             commented "best-effort") in try/catch. Audit failures now
             log + Sentry-capture but do not crash the response. The
             mutation succeeds AND the client receives a JSON success
             body. Honors the documented adminMutation.ts contract that
             audit failures must not roll back the mutation response.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only
Verifier:    self-verified; change is 5 lines around an existing call
             site; no new code paths, no new state, no removed code
Status:      RESOLVED — owner can confirm by reproducing: click Remove on
             a source; on first click, response now succeeds (toast
             absent). If the original audit-throw path was the cause,
             a row should now appear in admin_audit_log for action=
             'cluster.move'. If the toast still surfaces post-fix, the
             cause is upstream of the route; reopen this concern.
             Out-of-scope adjacencies surfaced for new concerns:
             - Same audit-throw pattern likely exists across other admin
               mutation routes → see new concern #32.
             - Hardcoded `audience: 'adult'` in StoryCard.tsx:109 is
               masked because all current feed_clusters are adult; will
               break the moment kid clusters exist → covered by the
               broader source-semantics work (concern #31 splits
               selection into "attach as source" vs "feed to AI").
             - RPC reassign_cluster_items's kid branch references
               public.kid_discovery_items which does not exist (table
               was dropped); will hard-fail any kid-audience call →
               implicit dependency for #31's kid path.
```

### 4. Newsroom — drop bulk-generate buttons
Status: RESOLVED
Symptom: Both "Generate All Pending" (page) and "Generate All" (per-card,
all 3 audiences at once) need to go. Generation is one-AudienceCard at a time.

```
RESOLUTION (concern 4) — 2026-05-02
Investigate: Two surfaces fired bulk generation. (a) Page-level "Generate
             All Pending" at page.tsx:507-514, backed by handleBulkGenerate
             (page.tsx:390-430) and bulkBusy/bulkProgress state at 269-270.
             Stage 1 noted this handler silently ignored selectedModelIdx
             and POSTed without provider/model — a latent quality bug on
             top of the dead-button concern. (b) Per-Story "Generate All"
             at StoryCard.tsx:193-196, backed by handleGenerateAll (132-136)
             which dispatched triggerGenerate() through three useRefs
             (99-101) into AudienceCard's useImperativeHandle (223-225)
             behind a forwardRef wrapper (91-92). The refs were the only
             consumers of AudienceCardHandle and triggerGenerate repo-wide.
Review:      A (confirmer) re-derived independently — line ranges
             confirmed; flagged additional cleanup Stage 1 missed:
             StoryCard.tsx bandRef derivation (212) + ref={bandRef} prop
             (216), unused imports (useRef on :10, AudienceCardHandle on
             :11, Button on :15), and a hard "yes, strip" verdict on
             AudienceCard's forwardRef/useImperativeHandle/handle-type
             plumbing. B (adversary) hit the same conclusions
             independently — bandRef/ref prop omission would have broken
             the build, and leaving the imperative-handle apparatus would
             violate the genuine-fixes rule. Both reached PARTIAL agree
             with Stage 1's targets but extended the delete list. No
             tie-breaker needed — A and B converged.
Fix:         web/src/app/admin/newsroom/page.tsx — removed bulk state
             (bulkBusy, bulkProgress), removed handleBulkGenerate
             function, removed "Generate All Pending" button.
             web/src/app/admin/newsroom/_components/StoryCard.tsx —
             removed three refs + handleGenerateAll + anyIdle + Button
             JSX + bandRef derivation + ref={bandRef} prop; cleaned up
             imports (dropped useRef, AudienceCardHandle, Button).
             web/src/app/admin/newsroom/_components/AudienceCard.tsx —
             reverted from forwardRef wrapper to plain function
             component, removed useImperativeHandle block, removed
             exported AudienceCardHandle type, dropped forwardRef +
             useImperativeHandle from React import. Re-indented the
             function body from 4-space to 2-space to match conventions.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only; both iOS apps verified
             clean of any "Generate All" reflection (grep across
             VerityPost/ and VerityPostKids/ — zero hits)
Verifier:    pass — 9/9 checks. Bulk plumbing fully gone, AudienceCard
             rendered as plain function component with default export,
             every retained feature (global model picker, merge, new
             article, ViewToggle, Runs/Costs/Cleanup, categories/dq,
             per-card Generate/Skip/Cancel/Retry, source toggle/remove)
             intact. Brace balance verified, no orphan imports, no
             repo-wide refs to deleted symbols.
Status:      RESOLVED
```

### 5. Newsroom — DB wipe to start fresh
Status: RESOLVED
Symptom: Owner wants every article + news row cleared so testing starts
clean. Wipe SQL handed over and verified against information_schema. Owner
runs it in the Supabase SQL editor. Awaiting confirmation it ran.

```
RESOLUTION (concern 5) — 2026-05-02
Investigate: n/a — destructive SQL is owner-run by policy.
Review:      n/a
Fix:         Owner ran the wipe SQL in the Supabase SQL editor (confirmed
             2026-05-02). DB now clean for fresh testing of downstream
             concerns (#10, #11, #14-19, #21-25, #28, #30).
TypeScript:  n/a
iOS build:   n/a
Verifier:    n/a — owner self-confirmed
Status:      RESOLVED
```

### 6. Newsroom — manual create flow (no AI)
Status: DEFERRED
Symptom: Need a "+ New manual story" path that opens a blank StoryEditor
without invoking any AI. Owner enters a slug (required) up front; the rest
is blank.
Reason: Big-feature peel-off — owner locked this for its own session
(2026-05-02).

### 7. Newsroom — top-row buttons different sizes
Status: RESOLVED
Symptom: The top row of the newsroom page mixes button sizes / variants —
visually inconsistent.

```
RESOLUTION (concern 7) — 2026-05-02
Investigate: Button.jsx (web/src/components/admin/Button.jsx) defines a
             44px minHeight floor for both `sm` and `md` sizes. All six
             top-toolbar Buttons already use size="sm" → 44px. The
             outliers in the top region were:
             (a) ViewToggle (page.tsx:646-668) — custom inline component
                 with no minHeight, rendering at ~24px next to 44px
                 toolbar buttons.
             (b) Filter-row TextInput (page.tsx:479) — md size renders
                 ~36px, no minHeight.
             (c) Three raw <select> elements (categories, sort, model
                 picker, page.tsx:485-541) — padY=4, no minHeight,
                 ~28px each. Page already imports the polished
                 Select.jsx (line 32) but the filter row reinvented
                 raw selects.
Review:      A (confirmer) re-derived independently — confirmed Stage
             1's ViewToggle target, recommended EXTEND scope to filter
             row since owner words ("buttons at the top") describe the
             visible top region not just one row, and filter-row
             cosmetic alignment doesn't conflict with #8's deferred
             search-redesign. B (adversary) flagged: ViewToggle inner
             button needs explicit minHeight (defensive), raw-<select>
             at minHeight has cross-browser rendering risk where the
             existing Select.jsx component already solves it
             (appearance:none + custom chevron), TabBar above toolbar
             could also be considered. Resolved without tie-breaker:
             A and B converge on direction (extend scope to filter
             row); their disagreements are tactical not strategic.
             Adopted B's defensive ViewToggle inner-minHeight, B's
             swap to Select.jsx component. Skipped TabBar — owner said
             "buttons" and tabs aren't buttons; if owner pushes back
             it's a small follow-up. "What's mute outlet?" is already
             tracked by concern #31 (mute outlet rip-out).
Fix:         web/src/app/admin/newsroom/page.tsx —
             - ViewToggle outer div: added minHeight: 44,
               alignItems: 'stretch', overflow: 'hidden'
             - ViewToggle inner buttons: added display: 'inline-flex',
               alignItems: 'center', justifyContent: 'center',
               minHeight: 44, padding: '0 ${S[3]}px' (dropped vertical
               padding since minHeight controls height now)
             - dq-search TextInput: added minHeight: 44, padding: '0 10px'
               to inline style
             - Replaced 3 raw <select> blocks with <Select> component
               (categories, sort, model picker), each block={false},
               minHeight: 44 via style. Preserved aria-label on model
               picker, all values/options/handlers untouched.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only
Verifier:    pass — all spec items satisfied, zero raw <select>
             remaining, ViewToggle structure correct, toolbar Buttons
             untouched, no behavior changes, file compiles clean
Status:      RESOLVED
```

### 8. Newsroom — feed run becomes search
Status: DEFERRED
Symptom: Today the feed-run flow is opaque. Wanted: two modes — General
(grab everything) and Custom (operator types a prompt + picks category and
subcategory). Search runs across all ~250 feeds' ingested clusters, e.g.
"tigers" returns every cluster mentioning tigers.
Reason: Big-feature peel-off — owner locked this for its own session
(2026-05-02).

### 9. Newsroom — drop per-card freeform-instructions input
Status: RESOLVED
Symptom: AudienceCard currently has its own per-article "Optional
instructions…" textarea. Wanted: removed — replaced by the feed-level
search prompt from #8.

```
RESOLUTION (concern 9) — 2026-05-02
Investigate: AudienceCard.tsx had `instructions` useState + an
             <input placeholder="Optional instructions…"> rendered when
             state was idle/failed, plumbing into POST body as
             `freeform_instructions`. Backend (generate route, retry,
             new-draft) all consume freeform_instructions for legitimate
             non-newsroom reasons: new-draft uses it for topic-seed
             ("Topic seed: ${topic}"), retry preserves the original
             run's value, generate route schema marks it optional.
Review:      A (confirmer) re-derived independently — confirmed all 4
             deletion targets, verified zero other consumers in the
             file, confirmed schema is .optional() so omitting is safe,
             confirmed retry round-trip works for stored runs. B
             (adversary) ran 9 probe attacks — all came back clean: no
             shared wrapper around the input, actionError fully
             decoupled, 500-cap bypass impossible (no other user channel
             into freeform_instructions), layout absorbs the loss
             (minHeight:130 + marginTop:auto), no in-flight closure
             race, no test/story files reference instructions. B's only
             advisory: the second half of the owner's request ("add
             general search prompt for the whole feed") is concern #8
             and remains deferred — not in scope here. A and B
             converged on AGREE; no tie-breaker needed.
Fix:         web/src/app/admin/newsroom/_components/AudienceCard.tsx —
             - removed `instructions` useState declaration
             - removed the `<input>` rendered conditionally on
               idle/failed state
             - removed `freeform_instructions` from generate POST body
             - removed `instructions` from handleGenerate's useCallback
               dep array
             Backend untouched (per locked recommendation): schema field
             stays optional, DB column stays, retry preservation stays,
             new-draft topic-seed still works.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only
Verifier:    pass — 7/7 checks. Five expected removals confirmed,
             POST body shape matches spec (cluster_id + apiAudience +
             provider + model + optional source_urls), backend files
             unchanged via git diff, no other newsroom file references
             instructions, useState import still used by 9 other states.
Status:      RESOLVED — backend `freeform_instructions` plumbing
             intentionally retained for new-draft topic-seed + retry
             round-trip. Concern #8 (general feed search prompt) is
             still deferred to its own session.
```

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

### 32. Admin routes — audit failures crash mutation responses (systemic)
Status: PENDING
Symptom: `recordAdminAction` from web/src/lib/adminMutation.ts can throw
Error('audit_failed') on actor-resolution failure or fallback-insert
failure (lines 243-254). Many admin mutation routes call it via plain
`await` outside any try/catch — when it throws, Next.js renders an HTML
500 even though the underlying DB mutation already committed. The client
sees a non-JSON response and falls back to whatever generic toast string
the call site uses, leading the operator to believe the action failed
when it actually succeeded. Concern #3 patched the move-item route in
isolation; the rest of the admin surface is still exposed. Two ways to
fix: (a) update recordAdminAction itself to log + capture instead of
throw (single-place fix; changes contract for all callers), or (b) wrap
each call site in try/catch (many-place fix). Owner-locked decision
needed before implementation.

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
