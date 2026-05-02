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
- **Concern #32 audit-failure fix** — owner picked option A (single-place
  fix on `recordAdminAction` in `web/src/lib/adminMutation.ts`: log +
  Sentry-capture instead of throwing). Option B (wrap every call site in
  try/catch) rejected. (2026-05-02)

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
Status: RESOLVED
Symptom: Need a "+ New manual story" path that opens a blank StoryEditor
without invoking any AI. Owner enters a slug (required) up front; the rest
is blank.

```
RESOLUTION (concern 6) — 2026-05-02
Investigate: The "+ New article" modal in page.tsx:684-803 already
             carried a manual vs ai_generate mode toggle (line 688
             default 'manual') and a slug field, but slug was
             documented "URL slug (optional)" with auto-suffix
             fallback. Submit handler at :701 omitted slug from POST
             when empty. Server route new-draft/route.ts:61 declared
             slug `.optional()` and at :161-170 fell back to
             `untitled-<6char>` then ran findFreeSlug (silent -2/-3
             dedupe). Manual branch already insert-ordered stories →
             articles synchronously and returns article_id+slug, so
             no DB-shape change needed; story-manager and kids-story-
             manager both accept ?article=ID. Public /<slug> does NOT
             auto-redirect admins to the editor — admins land on the
             public reader for an empty "Untitled draft", which is
             a real UX hit.
Review:      A (confirmer) re-derived independently and CONFIRMED the
             modal-already-toggleable + slug-currently-optional read.
             Verified single caller of the new-draft route
             (NewArticleModal). Audited kill-switch + COPPA — clean
             (manual branch never invokes pipeline/generate, so
             items 8/9/10 don't gate it). Flagged the slug-uniqueness
             gap independently. B (adversary) ran ten attacks A-J;
             converged on PARTIAL with the same two deltas. Three
             converged points: (1) drop `.optional()` from the
             discriminated-union manual variant for type-level
             enforcement (not just runtime), (2) bypass findFreeSlug
             for manual mode and pre-check stories.slug uniqueness
             — return 409 on collision, matching the locked decision
             "must be unique against stories.slug" verbatim,
             (3) redirect change is real UX improvement, not cosmetic
             (public /<slug> doesn't auto-redirect admins). Both
             confirmed iOS n/a (newsroom is web-admin only) and field
             order Audience → Mode → Slug stays. No tie-breaker.
Fix:         web/src/app/api/admin/articles/new-draft/route.ts —
             - dropped crypto + findFreeSlug imports; removed
               slugSuffix() helper.
             - manual variant Zod: slug `.optional()` → required
               `min(1).max(120)`.
             - replaced auto-suffix block with: lowercase slug,
               SLUG_SAFE regex check (422 on bad format), then
               .from('stories').select('id').eq('slug', finalSlug)
               .maybeSingle() + 409 if collision found. AI branch
               untouched.
             - updated the route header doc-comment to describe the
               new manual contract (slug required, unique, no AI).
             web/src/app/admin/newsroom/page.tsx (NewArticleModal) —
             - Field label: "URL slug (optional)" → "URL slug
               (required)"; hint changed from "Leave blank…" to
               "Lowercase letters, numbers, and hyphens. Must be
               unique."
             - submit handler: for mode==='manual', toast "Enter a
               slug." and bail when slug.trim() is empty; otherwise
               attach to body.
             - mode-keyed redirect on success: manual + article_id →
               /admin/story-manager?article=ID (adult) or
               /admin/kids-story-manager?article=ID (tweens|kids);
               AI mode keeps /<slug> redirect; final fallback closes
               modal.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only; no manual-create flow
             in VerityPost/ or VerityPostKids/.
Verifier:    pass — 10/10 checks. Schema enforcement tight (manual
             slug now `string` not `string | undefined`), 409 path
             precedes inserts, SLUG_SAFE preserved, both inserts
             unchanged with all NOT NULL columns satisfied, modal UX
             gated correctly, AI path untouched, dead code removed.
Status:      RESOLVED — manual create now lands operator straight in
             the editor with their typed slug; collisions surface a
             clear 409 toast instead of silently auto-suffixing.
```

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
Status: RESOLVED
Symptom: Today the feed-run flow is opaque. Wanted: two modes — General
(grab everything) and Custom (operator types a prompt + picks category and
subcategory). Search runs across all ~250 feeds' ingested clusters, e.g.
"tigers" returns every cluster mentioning tigers.

```
RESOLUTION (concern 8) — 2026-05-02
Investigate: Run Feed today triggers /api/newsroom/ingest/run — a real
             RSS pipeline (rss-parser, 6s/feed, dedupes by raw_url,
             upserts discovery_items, then preCluster/findBestMatch
             into feed_clusters). The clusters/list route already
             supports `q`, `category`, sort, dates, status — the
             search box at page.tsx:479-484 already wired to it. Two
             gaps vs the owner's words: (1) `q` searches
             feed_clusters.title/summary/keywords[] + outlet name,
             but NOT discovery_items.raw_title — so a cluster about
             tigers whose roll-up title says "Endangered cats" misses
             a "tigers" search; (2) the category dropdown is flat (65
             active rows = ~20 parent + ~45 child via
             categories.parent_id) and the API does an exact
             .eq('category_id') so picking a parent never matches
             clusters tagged at the leaf level. There's no separate
             subcategories table; subcats are just categories rows
             with non-null parent_id. discovery_items.raw_title has
             no trigram index, but at expected scale (~thousands of
             rows in the 6h cluster window) ILIKE is fine.
Review:      A (confirmer) re-derived independently and verified all
             findings, then DISAGREED with Stage 1's "split Run Feed
             into General/Custom + add modal" plan: the existing
             inline filter row IS the search the owner described,
             and a modal would duplicate it (parallel-paths
             violation). B (adversary) ran twelve attacks A-L and
             also DISAGREED on the same architecture point — owner's
             "general search prompt for the whole feed, not a per
             article prompt" reads as "ONE search input at the
             newsroom level," not as two button modes. B's other
             load-bearing catch: API must expand parent → descendants
             when a parent category is picked, otherwise leaf-tagged
             clusters silently disappear. A and B independently
             converged on the same plan; no tie-breaker needed.
             Convergent verdict: keep Run Feed button as-is, extend
             the inline filter row, add raw_title search reach, add
             subcategory cascade, expand parent→descendants in the
             API.
Fix:         web/src/app/api/admin/newsroom/clusters/list/route.ts —
             - new pre-query 3b: SELECT cluster_id FROM
               discovery_items WHERE raw_title ILIKE %q% ORDER BY
               created_at DESC LIMIT 1000; errors caught silently.
             - merged outletClusterIds + rawTitleClusterIds via Set
               and pushed `id.in.(...)` into the existing orParts
               chain (replaces the old outlet-only branch).
             - new pre-query 3c: when `category` set, look up
               descendants via .from('categories').eq('parent_id',
               category); build categoryFilter = [category,
               ...childIds]. Replaced .eq('category_id', category)
               with .in('category_id', categoryFilter); leaf picks
               degenerate to single-element .in() — same effect as
               eq.
             web/src/app/admin/newsroom/page.tsx (DiscoveryTab) —
             - useMemo added to react imports.
             - categories state shape and SELECT now include
               parent_id.
             - useMemo helpers: catById, parentCats (top-level only),
               picked, parentVal, subVal, subOptions.
             - replaced single flat category <Select> with parent
               <Select> + conditional subcategory <Select>; subcat
               only renders when parentVal is set AND that parent has
               children.
             - URL state: `cat` holds the most-specific picked id
               (parent or leaf). Picking a parent overwrites with
               parent id; picking a subcat overwrites with leaf id;
               picking "All subcategories" reverts to parent id;
               picking "All categories" deletes the param.
             - search box placeholder: "Search stories…" → "Search
               across all feeds (e.g. tigers)".
             - runFeed 503 toast: special-cased to surface "Feed
               ingestion is disabled. Flip ai.ingest_enabled in
               Pipeline Settings to re-enable." instead of the
               generic "Could not run feeds." path.
             Run Feed button JSX itself is unchanged.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only; no iOS surface calls
             clusters/list or ingest/run.
Verifier:    pass — 12/12 checks. raw_title pre-query gated, ordered,
             capped, error-isolated; merge dedupes via Set; category
             expansion handles parent + leaf cases; cascade UI hides
             empty subcat dropdown; URL transitions traced through
             five scenarios; placeholder + 503 toast strings match;
             only the two intended files modified; useMemo deps
             correct; .in() single-element semantics safe.
Status:      RESOLVED — owner's "tigers" example now hits clusters
             whose source headlines mention tigers even when the
             roll-up title doesn't; "search by category and maybe
             subcategory" delivered via parent-then-subcat cascade
             with API-side descendant expansion; Run Feed kept as
             the General "grab everything" ingest. No modal added.
```

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
Status: RESOLVED
Symptom: After an AudienceCard finishes generating, there's no way to jump
straight into editing the article. Operator has to leave the newsroom and
navigate to /admin/articles. Wanted: Edit button right on the card.

```
RESOLUTION (concern 10) — 2026-05-02
Investigate: Generated-state JSX in AudienceCard.tsx (~lines 394-435)
             rendered "View article" Link (slug→public; articleId→editor
             fallback) + "Skip" Button. No Edit button. Editor URL
             pattern verified: adult → /admin/story-manager?article=ID,
             tweens/kids → /admin/kids-story-manager?article=ID
             (matches ArticlesTable.tsx Edit button + ArticleSurface
             routing). AudienceCard already has `audienceBand` prop +
             `articleId` state, so no new data dependency needed.
Review:      A (confirmer) re-derived independently and pushed for an
             A2 plan: drop the existing articleId-fallback "View article"
             Link entirely so View=public, Edit=editor (clear-affordance
             contract, kills parallel paths). B (adversary) verified a
             real bug that A2 ignored: AudienceCard.tsx:141 calls
             setArticleId(json.run.article_id), but pipeline_runs has NO
             article_id column (database.ts:7977-8005, route.ts:43-60).
             Live `generating`→`generated` transitions overwrite
             articleId with undefined. The existing articleId-fallback
             Link is the only thing that ever rendered for live
             transitions, and even that's broken; A2's drop would make
             the failure more total. B pushed for A1.5 (keep fallback,
             add Edit, ALSO fix polling bug, ALSO add Published status
             pill, ALSO add Edit to failed state, ALSO refactor styles).
             Tie-breaker chose Option 2 (A1 narrow): keep fallback, add
             Edit, file polling bug as new concern #33 and the
             post-#33 cleanup as new concern #34. Reason: locked
             "single concern at a time"; A2's clean contract depends on
             #33 landing first; Published-status is concern #11
             territory; failed-state Edit and style refactor are scope
             creep.
Fix:         web/src/app/admin/newsroom/_components/AudienceCard.tsx —
             added an Edit Link in the generated-state JSX block,
             rendered when articleId is truthy. Routes by audienceBand:
             'adult' → /admin/story-manager?article=ID, else →
             /admin/kids-story-manager?article=ID. Style matches the
             existing View article pill exactly. Order: View article →
             Edit → Skip. Kept the existing articleId-fallback View
             Link untouched (will be removed in concern #34 once #33
             fixes the polling article_id bug).
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only
Verifier:    self-verified — Edit Link added at correct position with
             matching pill style, routes by audienceBand, gated on
             articleId. Existing JSX preserved verbatim around the
             insertion. tsc clean.
Status:      RESOLVED — Edit button visible immediately on refresh-
             rendered cards (server-side initialArticleId path); live
             post-generation transitions still need concern #33 to
             land before Edit shows without a refresh.
```

### 11. AudienceCard — live status
Status: RESOLVED
Symptom: Card doesn't show a clear status (idle / generating / generated /
published / failed). Wanted: persistent status badge per audience.

```
RESOLUTION (concern 11) — 2026-05-02
Investigate: AudienceCard pill at AudienceCard.tsx:336-338 maps a
             5-state enum (idle/skipped/generating/failed/generated) to
             labels. No "Published" branch — once a card lands in
             `generated` it shows "Generated" forever, regardless of
             whether the operator subsequently published from the
             editor. articles.status (draft/published/archived per
             /api/admin/articles/[id]/route.ts:188-192 +
             route.ts:250 zod enum) is the source of truth, but
             AudienceCard never reads it. Categorized (b) data exists
             but render hides it. Three options considered: (A) new
             batch endpoint + plumb through list route, (B) embed in
             run-detail response, (C) per-card client-side fetch on
             mount + on window focus/pageshow.
Review:      A (confirmer) re-derived 4/4 root causes and DISAGREED-ON-
             SCOPE with Stage 1's 4-file plan to LEFT-JOIN articles in
             the cluster list endpoint + plumb through StoryCard +
             page.tsx, citing SESSION_G's "Touch ONLY" lock and
             Session F's ownership of page.tsx.
             B (adversary) flagged FIVE attack vectors:
             (1) visibilitychange does NOT fire on same-tab back-
             navigation — owner's primary newsroom→editor→back flow
             would leave the pill stale forever, (2) scope inflation,
             (3) reuse the polling tick (rejected — articles always
             draft at completion), (4) articles.status has THREE values
             not two (must handle archived), (5) existing GET
             /api/admin/articles/[id] already returns status (no new
             endpoint needed).
             Tie-breaker picked Option E: 1 file (AudienceCard.tsx
             only), reuse existing GET endpoint, pageshow + window
             focus listeners (covers back-from-editor where
             visibilitychange doesn't fire).
Fix:         web/src/app/admin/newsroom/_components/AudienceCard.tsx —
             - Added articleStatus state ('draft'|'published'|
               'archived'|null), narrow union not loose string.
             - Added fetchArticleStatus useCallback that GETs
               /api/admin/articles/{id}, parses safely (no throw on
               bad JSON or non-200), runtime type-narrows the status
               string before setting state.
             - Added two effects, both gated on
               state==='generated' && articleId: one fires the fetch
               when those conditions become true (covers initial mount
               AND post-poll articleId-now-populated transition), the
               other registers window focus + pageshow listeners with
               proper cleanup (covers back-from-editor + bfcache
               restore).
             - Replaced the pill ternary with status-keyed label +
               color: Pending/Skipped/Archived = C.muted, Working/
               Generated = C.ink, Failed = C.danger, Published =
               C.success. Bumped pill style to match the AUDIENCE
               label on the other side of the row (fontWeight: 700,
               letterSpacing: 0.5, uppercase) — gives a column of
               cards a scannable status strip without redesigning
               the pill.
             No new endpoint. No edits to clusters/list, page.tsx,
             StoryCard, or any kids/iOS surface.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only; AudienceCard has zero
             references in VerityPost/ + VerityPostKids/ (consistent
             with kids_scope.md memory).
Verifier:    pass — 10/10 functional checks (pill branches, narrow
             union, mount + focus effects, color tokens, no
             regressions in View/Edit/Skip block or polling loop, no
             stray console/TODO). Verifier's "FAIL on file scope" was
             a false positive — the four other modified files
             (newsroom/page.tsx, articles/new-draft/route.ts,
             ArticleSurface.tsx, [slug]/page.tsx) belong to parallel
             Sessions F/H/I working on concerns #6/#8, #13/#28, #29
             and are not part of this concern's commit.
Status:      RESOLVED — pill now reads Published when articles.status
             flips, refreshes on window focus / pageshow / mount, and
             stays scannable across a column of cards. Trade-off:
             "publish-in-another-tab while focused on newsroom"
             updates only on next blur+focus, but this is rare in
             practice (single-operator workflow).
```

### 12. /admin/articles — clicking article opens view, not edit
Status: RESOLVED
Symptom: Default click on a row in /admin/articles navigates to the public
view of the article. Wanted: navigate to the editor.

```
RESOLUTION (concern 12) — 2026-05-02
Investigate: The Articles tab is /admin/newsroom?tab=articles, not a
             standalone /admin/articles route. ArticlesTable.tsx:411-421
             rendered the row title as a Next.js <Link> with
             href={row.stories?.slug ? `/${row.stories.slug}` : '#'} +
             an onClick that preventDefault'd when no slug — the
             "default click" went to the public story page. The
             existing Edit Button at lines 474-486 already encoded the
             correct editor routing
             (row.is_kids_safe ? /admin/kids-story-manager : /admin/story-manager)
             with `?article=${row.id}`. Both editor wrapper pages
             (story-manager + kids-story-manager) accept ?article=ID
             without requiring a slug.
Review:      A (confirmer) CONFIRMED Stage 1 end-to-end: title <Link> at
             411-421, Edit at 474-486, View at 455-473, no row-level
             onClick, no Drawer/Sidebar/Modal imports, both editor
             wrappers accept ?article=ID. B (adversary) flagged a real
             middle-click regression risk if the title were swapped to
             a Button + router.push — Stage 1's plan kept it as a
             <Link>, so middle-click/cmd-click semantics are preserved
             (now opens the editor in a new tab instead of the public
             page). B also confirmed the editor loads cleanly for all
             statuses (loadStory selects by id with no status filter).
             A and B converged on the #12 fix; their disagreement was
             on #13's scope (resolved by tie-breaker — see #13).
Fix:         web/src/app/admin/newsroom/_components/ArticlesTable.tsx —
             title <Link> href changed from the public-slug expression
             to the editor URL using row.is_kids_safe as the
             discriminator (mirrors Edit button at lines 474-486).
             Removed the no-slug onClick preventDefault since the
             editor route doesn't depend on slug. Kept <Link> (not
             swapped to Button+router.push) so middle-click /
             cmd-click still opens the destination in a new tab.
             "View" button (455-473) untouched — it remains the
             explicit public-page affordance for published rows.
             "Edit" button (474-486) untouched — duplicates the
             title-link destination now, intentional explicit affordance.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only; no equivalent admin
             article-list surface in VerityPost/ or VerityPostKids/
Verifier:    pass — 6/6 checks. Title href correctly routes by
             is_kids_safe, slug-fallback + preventDefault removed,
             View + Edit buttons untouched, no unused imports, no
             other call sites depend on the title link going to the
             public slug, middle-click semantics preserved.
Status:      RESOLVED
```

### 13. /admin/articles — "Open article" opens a sidebar
Status: RESOLVED
Symptom: The "Open article" affordance opens a sidebar drawer instead of
navigating directly to the article.

```
RESOLUTION (concern 13) — 2026-05-02 (Session H)
Investigate: Stage 1 confirmed the picker drawer + button live in
             StoryEditor.tsx and KidsStoryEditor.tsx, not /admin/articles
             (the structured-concern label was a mis-tag from the prior
             session's deferral). useRouter is already imported in both
             editors; lastPersistedSlugRef.current carries the canonical
             story slug post-load and post-save; public URL is `/<slug>`
             resolved against `stories.slug`. showPicker / storyList /
             newStory have no consumers outside the picker.
Review:      A (confirmer) CONFIRM-WITH-NOTES — diagnosis correct, but
             flagged that the existing "View" button at the toolbar
             already covers same-target navigation; replacing Open with
             a second router.push button would duplicate it. Also
             flagged Kids has no View button (no parity).
             B (adversary) MODIFY STAGE 1 — same direction as A. Added
             that the non-embedded delete handler still calls newStory()
             + storyList refresh, so those need a `router.push(
             '/admin/newsroom?tab=articles')` replacement to avoid a
             dangling reference. No tie-breaker — A and B converged.
Fix:         web/src/components/article/StoryEditor.tsx and
             web/src/components/article/KidsStoryEditor.tsx —
             - Removed Drawer import, showPicker / setShowPicker state,
               storyList / setStoryList state + init fetch, post-save
               storyList refresh, post-delete storyList refresh, and
               the legacy newStory() function.
             - Removed the Drawer JSX block + the Open button that
               opened it.
             - Changed the existing adult "View" button (which used
               window.open new-tab) to "Open article" using
               router.push(`/${lastPersistedSlugRef.current}`) for
               same-tab nav, matching owner's "immediately bring me to
               the article" wording.
             - Added the same "Open article" button to KidsStoryEditor's
               toolbar (kids previously had no View affordance — parity
               with adult).
             - Non-embedded delete handler now resetToEmpty() +
               onArticleChange(null) + router.push('/admin/newsroom
               ?tab=articles') in both editors.
             - Updated the doc comment block at top of both files to
               reflect that the picker is dropped for ALL modes (not
               just embedded).
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — neither iOS app has a story-editor surface; admin
             editor is web-only. Per locked decision, iOS scope deferred
             to a separate iOS session.
Verifier:    pass — read-only sub-agent reread both editors cold and
             confirmed: Drawer import gone, showPicker/storyList/newStory
             gone, single "Open article" button gated on slug, embedded
             mode safe (clicking from /<slug> just re-routes to the same
             /<slug>, harmless), delete flow intact in both branches.
Status:      RESOLVED — picker drawer dropped; one same-tab "Open
             article" button covers both #13 and the #20 toolbar-
             condense intent in adult + kids.
```

### 14. Generated article — body not visible
Status: RESOLVED
Symptom: After a successful generate, the article's body doesn't show in
the editor (or wherever the operator is looking). DB confirms body is
written, so this is a render-side gap.

```
RESOLUTION (concern 14) — 2026-05-02
Investigate: persist_generated_article RPC's anchor-row insert (timelines
             where type='article') only writes (story_id, type,
             linked_article_id, event_label, event_date, sort_order). It
             never sets event_body. StoryEditor.loadStory mapped
             event_body → entry.content. The "Article body" Textarea
             (line 1458) is bound to entry.content, not story.body.
             Article-level story.body IS populated from cast.body but is
             only rendered in preview mode. The edit view has no Textarea
             bound to story.body. Net: anchor row arrives with
             entry.content='' and the body Textarea renders empty.
Review:      A (confirmer) AGREE on diagnosis, PARTIAL on Stage 1's
             initial fix. B (adversary) AGREE on diagnosis, PARTIAL on
             fix. Both independently flagged the same critical
             regression: Stage 1 proposed `event_body || cast.body` as
             the predicate. saveAll writes entry.summary (excerpt) →
             event_body for the anchor. So on second load, event_body
             holds the excerpt, the conditional fallback stops firing,
             entry.content = excerpt, and the next save overwrites
             articles.body with the excerpt — silent body destruction.
             Both reviewers recommended an unconditional override for
             anchor rows + same fallback in regenTimeline (which has
             identical mapping logic). No tie-breaker — A and B
             converged.
Fix:         web/src/components/article/StoryEditor.tsx —
             - loadStory entry-mapping: for DB type='article' rows, set
               entry.content = cast.body || '' unconditionally (event_body
               is NULL by pipeline design). event_body still flows
               through entry.summary (handled by concern #18 in its
               own iteration).
             - regenTimeline entry-mapping: same override using
               story.body from component state.
             Save round-trip preserved: drivingEntry.content →
             articles.body unchanged at saveAll line 871; the anchor
             row's event_body in the DB is irrelevant since the loader
             never reads it. No saveAll changes needed.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — StoryEditor is web admin only. KidsStoryEditor.tsx
             has a structurally different shape (filters
             .eq('type','event'), never loads the article anchor) —
             adult editor only here.
Verifier:    self-verified — diff applied to both load sites; no save
             path changes; tsc clean. Commit 78ce9a2.
Status:      RESOLVED — fixes the body Textarea rendering for newly
             generated articles. Sister concern #18 (excerpt missing) is
             structurally identical and gets its own iteration.
             Pipeline-side RPC fix (writing articles.body into the
             anchor's event_body) is cleaner long-term but requires a
             migration; render-side fallback works for both already-
             written rows and future generations without DB change.
```

### 15. Generated article — anchor row not visible on its own timeline
Status: RESOLVED
Symptom: The generated article doesn't appear as a node on its own story's
timeline in the editor. DB confirms a `type='article'` anchor row exists.

```
RESOLUTION (concern 15) — 2026-05-02
Investigate: Stage 1 verified the anchor row IS fetched (loadStory line
             412-417, .in('type', ['event','article'])), mapped (419-446
             with dbType='article' → localType='story'), sorted (line
             1022, no filter), and rendered in both surfaces (Timeline
             entries section line 1378-1417, Timeline preview view line
             1101-1128). After concern #14 the entries-list section
             badges the row "Story" with body filled. Stage 1 hypothesised
             "no code change needed" — anchor visible after #14.
Review:      A (confirmer) AGREE — anchor fetched, mapped, rendered, no
             filter could hide it; post-#14 entries-list badge "Story"
             distinguishes it. B (adversary) PARTIAL — found a real
             adjacent issue: the `is_current` column does NOT exist on
             public.timelines (verified). StoryEditor.tsx:436 reads
             `Boolean(ev.is_current)` → always false. In the Timeline
             preview view (line 1097-1130), distinguishing markers (14px
             dot, "Now" pill, bold weight) ALL gate on is_current →
             never fire. Anchor row appears as a generic dot, visually
             indistinguishable from event rows. Owner's "doesn't appear
             as a node on its own story's timeline" reads more naturally
             as "can't visually pick it out" than "literally absent".
             Tie-breaker: MINIMAL_FIX. The Timeline preview view is the
             surface literally named "Timeline preview" and is exactly
             the surface the owner described. Concerns #19 (badge from
             entry.type) won't touch lines 1097-1130 since the preview
             view has no badges. The anchor's `entry.type === 'story'`
             is already correct on TimelineEntry — making the existing
             render block honor it is the genuine fix.
Fix:         web/src/components/article/StoryEditor.tsx — Timeline
             preview view block (~lines 1101-1128):
             - Compute isAnchor = e.type === 'story' and enlarged =
               e.is_current || isAnchor.
             - Dot grows to 14px and uses C.accent (ink) for anchors,
               so anchors are visually distinct from green-content events.
             - Render an "Article" pill (C.ink on C.card) in the same
               slot the "Now" pill occupies, when isAnchor && !is_current.
             - Date + title bold for both anchor and is_current entries.
             - is_current path preserved for when that signal lands.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — StoryEditor is web admin only.
Verifier:    self-verified — render block uses entry.type already
             populated by loadStory, no new state, no schema. Commit
             4925538.
Status:      RESOLVED — anchor row now visually distinct in Timeline
             preview view ("Article" pill + larger black dot + bold
             text). Entries-list section was already addressed by #14
             (Story badge via hasContent). Adjacent latent bugs flagged
             but out of scope: (a) is_current column missing from
             timelines schema — file as new concern if needed; (b)
             cast.story_id IS NULL legacy articles return zero-row
             timeline. Both unrelated to fresh-generation flow.
```

### 16. Editor timeline — historical events shown but not the new article
Status: RESOLVED
Symptom: Timeline section in the editor lists the historical events that
were generated, but the article itself isn't placed among them.

```
RESOLUTION (concern 16) — 2026-05-02
Investigate: Same observation as #15 from a different angle. Stage 1
             verified the adult-side anchor IS in the entries list and
             the Timeline preview view post-#14 + #15. Recommended
             RESOLVED_TRANSITIVELY for adult web.
Review:      Adversary B found a real cross-platform gap: KidsStoryEditor
             filters timelines `.eq('type','event')` (line 336), so the
             type='article' anchor row written by persist_generated_article
             is NEVER loaded into entries on the kids web admin editor.
             Per locked memory feedback_cross_platform_consistency.md,
             #16 isn't closed until kids web is also addressed. (iOS
             remains deferred per locked decision.)
Fix:         web/src/components/article/KidsStoryEditor.tsx —
             - Line 336: `.eq('type', 'event')` → `.in('type',
               ['event', 'article'])`.
             - Lines 339-353 mapping: branch on dbType === 'article':
               localType='story', content pulled from cast.body
               (anchor's event_body is NULL by pipeline design).
             Mirrors the adult #14 fix.
             Adult web entries-list + Timeline preview view already
             addressed by #14 + #15 (commits 78ce9a2, 4925538). No
             additional adult-side change needed.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — kids iOS deferred per locked decision; no iOS surface
             touched here.
Verifier:    self-verified — kids editor mapping mirrors adult; tsc
             clean. Commit 0851371.
Status:      RESOLVED — adult web (transitively via #14 + #15) and kids
             web (parallel filter + mapping fix) both surface the
             article anchor on its own timeline.
```

### 17. Editor — article date defaults blank
Status: RESOLVED
Symptom: The Article-date input in the editor renders blank for newly
generated articles. Wanted: defaults to the date generation ran (matches
articles.published_at / generated_at when present, otherwise today).

```
RESOLUTION (concern 17) — 2026-05-02
Investigate: timelines.event_date is timestamptz (parse_timeline_event_date
             returns timestamptz, migration 2026-04-28). PostgREST
             serializes it as full ISO-8601 string with time + offset.
             DatePicker (web/src/components/admin/DatePicker.jsx) is a
             thin <input type="date"> which silently renders blank for
             any value not already in YYYY-MM-DD form. Pipeline IS
             writing event_date=now() on the anchor row (correct); the
             bug is purely on read. Compare to articles.published_at
             at StoryEditor.tsx:386 — already uses .split('T')[0]
             precedent. The bug is missing that slice on event_date.
Review:      A (combined sanity + adversary) AGREE on diagnosis and
             scope. Verified: split safe for both ISO-with-time and
             pre-sliced shapes; no other timeline.event_date
             consumers; UTC-date drift matches existing published_at
             behavior, not a new regression; formatTimelineDate
             (web/src/lib/dates.ts) regex-matches the YYYY-MM-DD
             prefix and renders correctly regardless. No tie-breaker
             needed.
Fix:         web/src/components/article/StoryEditor.tsx — loadStory
             entry mapping + regenTimeline entry mapping: split the
             raw event_date on 'T' before assigning to entry.event_date.
             web/src/components/article/KidsStoryEditor.tsx — loadStory
             entry mapping: same slice on event_date and timeline_date.
             Inputs at StoryEditor.tsx:1431/1455/1469 (DatePicker bound
             to entry.event_date/timeline_date) and KidsStoryEditor
             equivalents now receive YYYY-MM-DD and render the date
             generation ran for the anchor row.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — iOS reads articles, not the editor.
Verifier:    self-verified. Commit 06f02ce.
Status:      RESOLVED — adult web + kids web both slice the timestamptz
             into the canonical date shape. Pre-existing UTC-date drift
             matches the published_at slice precedent and was not part
             of this concern.
```

### 18. Generated article — summary not visible
Status: RESOLVED
Symptom: Summary / excerpt isn't shown in the editor for newly generated
articles. DB confirms excerpt is populated.

```
RESOLUTION (concern 18) — 2026-05-02
Investigate: Sister concern of #14. Same root cause:
             persist_generated_article doesn't write event_body for the
             type='article' anchor row. The editor's Summary Textarea is
             bound to entry.summary, which loadStory mapped from
             event_body → empty. Article-level cast.excerpt IS populated
             (preview view at line 1058-1062 renders story.summary
             correctly) but no Textarea in edit mode binds to it.
Review:      Combined sanity + adversary AGREE — exact mirror of #14.
             Cast.excerpt available in scope at both load sites; story.
             summary available in regenTimeline closure; saveAll round-
             trip safe with unconditional override (excerpt is single-
             source-of-truth on articles.excerpt; event_body for anchor
             is irrelevant). Badge logic at line 1401 keys off
             hasContent only, no interaction. No tie-breaker needed.
Fix:         web/src/components/article/StoryEditor.tsx —
             - loadStory mapping: summary = isAnchor ? (cast.excerpt
               || '') : eventBody (unconditional override matches #14
               body pattern).
             - regenTimeline mapping: summary = isAnchor ? (story.summary
               || '') : eventBody.
             web/src/components/article/KidsStoryEditor.tsx —
             - loadStory mapping: summary = isAnchor ? (cast.excerpt
               || '') : eventBody-or-summary.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — editor is web admin only.
Verifier:    self-verified — diff is symmetrical with #14 body fix at
             same call sites. Commit 386b464.
Status:      RESOLVED — adult web + kids web both surface the article
             excerpt in the Summary Textarea on first load. Same drift
             resistance: unconditional override means event_body
             contents are immaterial to the loaded summary.
```

### 19. Editor timeline — historical events render as "stories" not events
Status: RESOLVED
Symptom: Historical timeline rows show the "Story" badge/styling instead
of the "Event" badge in the editor's timeline section. DB confirms they
are type='event'.

```
RESOLUTION (concern 19) — 2026-05-02
Investigate: Badge at StoryEditor.tsx:1411 was derived from
             `hasContent ? 'Story' : 'Event'` — content presence is
             not a valid proxy for entry type. After the wave of
             pipeline writes that populate event_body on historical
             events (type='event'), every event-with-body rendered
             as "Story". Symmetric inverse: addStoryEntry creates
             type='story' with empty content → badged "Event".
             storiesCount / eventsCount at lines 1030-1031 had the
             same content-derived drift, making the section
             description ("N articles · M events") miscount.
Review:      Combined check AGREE: switch derivation to entry.type;
             use "Article" label (not "Story") to match the
             "+ Article" affordance copy and the existing section
             description's "articles · events" wording. KidsStoryEditor
             at line 905 + counts at 647-648 have the identical bug
             — apply the same fix. iOS n/a (timeline editing is
             web-admin only). No tie-breaker needed.
Fix:         web/src/components/article/StoryEditor.tsx —
             - storiesCount/eventsCount filter by entry.type.
             - Badge text + variant derived from entry.type === 'story',
               labelled "Article" / "Event".
             web/src/components/article/KidsStoryEditor.tsx —
             - Same parallel fix (counts at 647-648, badge at 905).
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — timeline editing is web admin only.
Verifier:    self-verified — diff is symmetrical adult+kids; tsc
             clean. Commit e1fba65.
Status:      RESOLVED — type='event' rows always badge "Event"; type='
             story' (anchor or "+ Article" creation) always badge
             "Article". Fix also closes concern #30 transitively (the
             "+ Article" button now produces an "Article"-badged entry
             with no need for a third button option).
```

### 20. StoryEditor — button bar is sprayed
Status: RESOLVED
Symptom: Open article / View timeline / Preview / Save / Publish draft /
Unsave are scattered across the editor at inconsistent sizes and
positions. Owner wants this condensed into one clear bar.

```
RESOLUTION (concern 20) — 2026-05-02
Investigate: Two action rows competed: headerActions (lines 1165-1196 —
             Unsaved badge, status badge, Open article, View link as
             raw <a> with custom inline styles, Timeline, Preview, Save)
             AND a second row inside editorBody Section at lines 1198-
             1227 (AI generate, spacer, Publish/Update, Delete article).
             The View "link" used custom font-size 12 + 1px border +
             #ccc color, not matching any Button variant — visibly
             different size + style than its neighbors. KidsStoryEditor
             had the same split + extra "Simplify language" + "AI
             generate (kids)" buttons in its second row.
Review:      n/a — direct UX consolidation, no algorithmic ambiguity.
             Decision: Save stays primary (most-frequent action);
             Publish drops to secondary so the bar has one primary
             button, not two. View becomes a Button. Adult drops the
             legacy single-shot AI generate entry point (Generate
             follow-up subsumes it; aligns with "kill the thing being
             replaced" rule). Kids preserves AI generate (kids) +
             Simplify language but moves them out of the primary bar
             into a clearly-titled "Tools" subsection so they don't
             compete with the toolbar.
Fix:         web/src/components/article/StoryEditor.tsx —
             - headerActions: Open / View / Timeline / Preview / Save
               (primary) / Publish (secondary) / Delete (ghost danger),
               all sm Buttons. Status + Unsaved badges first.
             - View Button replaces the styled anchor.
             - editorBody first Section: AI generate row dropped; only
               the Generate follow-up flow remains.
             web/src/components/article/KidsStoryEditor.tsx —
             - headerActions: same condensed layout (Save / Publish /
               Delete folded in).
             - editorBody first Section retitled "Tools", contains
               only AI generate (kids) + Simplify language.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — editor is web admin only.
Verifier:    self-verified — both editors build clean, button row is
             single-line on wide viewports, Save remains the only
             primary, Publish/Delete now adjacent to Save, View
             matches Button sizing. Commit ea87909.
Status:      RESOLVED — adult web + kids web both have one consolidated
             toolbar with consistent sizing. Legacy AI generate dropped
             from adult; kids tools moved to dedicated "Tools" section.
```

### 21. Public — published article not on home page
Status: RESOLVED
Symptom: Article was published from the editor (articles.status='published'
+ articles.published_at set) but doesn't appear on the home page.

```
RESOLUTION (concern 21) — 2026-05-02
Investigate: Home query (web/src/app/page.tsx:197-204) requires
             status='published' AND browse_only=false AND
             published_at >= today.startUtc (midnight America/New_York
             today). browse_only defaults to false in DB (verified via
             information_schema). RLS allows anon+auth to read published
             rows (verified via pg_policy). top_stories empty post-wipe.
             The only filter that can hide a freshly published article
             is the today-edition window — anything published before
             ETZ midnight today drops out and the page renders the
             "Nothing published today" empty state.
Review:      A (confirmer) AGREED with a tightening request — clarify
             whether breaking-strip falls back too. B (adversary) PUSHED
             BACK on a masthead-lies-about-date concern (today.humanDate
             stays "today" even when fallback shows older articles) and
             argued for diagnosing the timezone/filter mismatch instead.
             Reconciled: ship the fallback because the symptom is
             provable on a quiet pre-launch day; accept the masthead
             papercut as known UX. Breaking-strip stays today-only —
             breaking is freshness-critical; falling back would lie.
Fix:         web/src/app/page.tsx — added recentFallback query that
             runs only when topArticles AND dateSorted are both empty
             AND no upstream throw. Same column projection + browse_only
             filter; no date window. displayedStories now cascades:
             top_stories → today's date query → recent fallback.
             breakingRes untouched.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — web home page; iOS adult/kids apps have their own
             feed implementations not gated through this query
Verifier:    pass — fallback gated correctly, defaults to [] on error,
             empty-state copy still fires when all three sources empty,
             masthead papercut acknowledged
Status:      RESOLVED — known papercut: when fallback supplies older
             articles, today.humanDate banner still renders ETZ-today.
             Acceptable for pre-launch; revisit if it becomes a real
             editorial issue.
```

### 22. Public story view — sources missing
Status: RESOLVED
Symptom: Sources block does not render on the public /<slug> story view.
DB confirms 2 source rows exist for this article.

### 23. Public story view — timeline missing
Status: RESOLVED
Symptom: Timeline does not render on the public /<slug> story view.
DB confirms 7 timeline rows for this story.

```
RESOLUTION (concerns 22 + 23) — 2026-05-02
Investigate: web/src/app/[slug]/page.tsx:144-145 gates sources +
             timeline on hasPermissionServer('article.view.sources') and
             hasPermissionServer('article.view.timeline'). Both
             permissions exist in the permissions table AND are granted
             to the anon permission set in permission_set_perms
             (verified via Supabase MCP — anon set holds
             article.view.sources, article.view.timeline,
             article.view.body, comments.section.view). BUT both server
             helper (auth.js:466 `if (!user) return false`) and client
             helper (permissions.js:119-122 `if (!userId) {
             allPermsCache = new Set(); }`) short-circuit to deny BEFORE
             loading anon-set grants. The DB grant for the anon set is
             dead — never reached. So canViewSources / canViewTimeline
             are always false for any unauthenticated viewer; the empty
             arrays passed to ArticleSurface make SourcesSection +
             TimelineSection early-return null (SourcesSection.tsx:51,
             TimelineSection.tsx:107). Sections silently disappear.
Review:      A (confirmer) AGREED outright. B (adversary) flagged a
             COPPA risk — kids articles' source URLs may be
             adult-shaped previews; suggested gating sources by
             isCoppa. Reconciled: kids web is "redirect-only, not
             active dev" per memory kids_scope.md — kids on web is not
             a real user surface. Drop the gates entirely; revisit
             if a kids web reader path materialises.
Fix:         web/src/app/[slug]/page.tsx — removed two
             hasPermissionServer calls from the Promise.all
             (article.view.sources + article.view.timeline). Removed
             canViewSources / canViewTimeline destructured names.
             Pass sources={sources} and timeline={timeline} directly
             to <ArticleSurface>. The dead permission keys can be
             retired in a follow-up sweep; the gates that consumed
             them are gone.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — iOS slice DEFERRED per locked iOS-session decision.
             Both iOS apps have separate sources/timeline render paths
             not gated through hasPermissionServer; flagged for the
             iOS session.
Verifier:    pass — Promise.all entries match destructured tuple
             count, no orphan canViewSources/canViewTimeline refs,
             ArticleSurface props type-compatible
Status:      RESOLVED. Out-of-scope adjacencies surfaced:
             - Same dead-perm-gate pattern likely affects other
               sections (browse, category, profile chrome, breaking
               strip). Recommended: grep `permsLoaded ?` and
               `hasPermissionServer('article.view` across web/src/
               for the full sweep; track as a new concern if owner
               wants it cleaned up systemically.
             - The underlying bug (anon set grants never loaded) is
               in lib/auth.js:466 + lib/permissions.js:119-122. A
               proper fix loads the anon perm set when no user; that
               affects many surfaces and is out of this loop's scope.
```

### 24. Public story view — quick-check questions missing
Status: RESOLVED
Symptom: Quiz questions do not render on the public /<slug> story view.
DB confirms 5 active quiz rows for this article.

```
RESOLUTION (concern 24) — 2026-05-02
Investigate: Two render gates suppressed the quiz. (a)
             ArticleEngagementZone.tsx:41-51 had an early-return for
             anon viewers (`if (!currentUserId)`) that rendered ONLY a
             read-only CommentThread — no quiz at all, regardless of
             hasQuiz. (b) ArticleQuiz.tsx:268 returned null whenever
             `canStart = hasPermission('quiz.attempt.start')` was
             false. Per the same anon-perm-load short-circuit
             documented in concerns 22+23, anon viewers always have
             canStart=false, so even if the EngagementZone gate were
             relaxed, the quiz card itself would render nothing. Both
             gates kill the quiz on the public surface.
Review:      A (confirmer) AGREED. quiz.attempt.start IS granted in DB
             to admin/free/owner sets — signed-in non-banned users
             will see a working Take-the-quiz button. B (adversary)
             flagged: anon clicking "Take the quiz" hits
             requirePermission server-side at /api/quiz/start which
             will 4xx — UX papercut, not a crash. ArticleQuiz already
             surfaces server errors via setError + the error div in
             the idle card (line 285), so the failure mode is graceful.
             Acceptable.
Fix:         web/src/components/ArticleEngagementZone.tsx — collapsed
             the two return branches into one. Both anon and
             signed-in render the same JSX: `{hasQuiz && <ArticleQuiz>}`
             + `<CommentThread>`. CommentThread now receives
             `currentUserId={currentUserId ?? null}` so the prop
             matches its `string | null` slot.
             web/src/components/ArticleQuiz.tsx — removed the dead
             canStart variable and its early-return at line 268. The
             idle quiz card always renders; canRetake remains in
             place for the result-stage retake button.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — iOS slice DEFERRED to iOS session. Native apps
             have separate quiz UI not gated through web
             ArticleEngagementZone / ArticleQuiz.
Verifier:    pass — single return path in EngagementZone, no orphan
             canStart refs in ArticleQuiz, error path on anon submit
             surfaces gracefully through existing setError flow
Status:      RESOLVED. Known UX papercut: anon clicking Take-the-quiz
             gets a server reject. Owner has accepted the trade.
```

### 25. Public story view — discussion area missing
Status: RESOLVED
Symptom: Discussion / comments area does not render on the public
/<slug> story view.

```
RESOLUTION (concern 25) — 2026-05-02
Investigate: CommentThread.tsx:111 computed
             `canViewSection = permsLoaded ? hasPermission(
             'comments.section.view') : true`. permsLoaded resolves
             true after refreshIfStale() returns; for anon viewers,
             allPermsCache is set to an empty Set per
             permissions.js:119-122 (anon-set grants never loaded —
             same root cause as 22/23/24). canViewSection therefore
             evaluates false for anon → "Comments aren't available
             for your account" empty-state at line 635 instead of
             the actual section. CommentThread is also short-routed
             through ArticleEngagementZone's anon early-return
             (handled in concern 24).
Review:      A (confirmer) AGREED on direction; flagged that
             CommentThread has no separate banned-user branch in
             this file — the only consumer of canViewSection is the
             empty-state — so forcing-true is safe. B (adversary)
             PUSHED BACK harder: keep the gate for signed-in users
             so future banned/age-restricted accounts retain the
             revoke channel; only relax for anon. Tie-breaker not
             needed — adopted B's tighter formulation directly.
Fix:         web/src/components/CommentThread.tsx — line 111 changed
             to:
               canViewSection = currentUserId
                 ? (permsLoaded ? hasPermission(
                     'comments.section.view') : true)
                 : true;
             Anon always sees the section; signed-in users still go
             through the existing gate so banned/restricted account
             UX (when implemented) keeps the revoke channel.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — iOS slice DEFERRED. Native apps render comments
             through their own permission paths; web fix doesn't
             cross over.
Verifier:    pass — only consumer of canViewSection unchanged in
             behavior for signed-in users, anon always passes the
             gate, no other call sites of the variable
Status:      RESOLVED. The root anon-perm-load bug
             (lib/permissions.js:119-122 returning empty Set for
             anon instead of loading the anon set) remains and
             affects other surfaces; out of scope for this concern.
```

### 26. Timeline — date format MM/DD/YYYY everywhere
Status: RESOLVED
Symptom: Timeline event dates are not displayed as MM/DD/YYYY across all
surfaces (public, editor, iOS, kids iOS).

### 27. Timeline — headline only, no body
Status: RESOLVED
Symptom: Timeline events render with body / description text. Wanted:
date + headline only, never any body, on every surface.

```
RESOLUTION (concerns 26 + 27) — 2026-05-02
Investigate: Three web surfaces render timeline event rows. Public
             reader (TimelineSection.tsx:89-98) used a private
             `formatDate` that emitted "Apr 2026" (month-short + year
             only — neither day nor MM/DD/YYYY) and rendered
             `ev.event_body` as a paragraph at line 137. Adult editor
             (StoryEditor.tsx:166-171) and kids editor
             (KidsStoryEditor.tsx:171-176) each had a private
             `formatMmDdYyyy` helper that already emitted MM/DD/YYYY and
             did NOT render any body in their timeline previews — but
             three parallel copies of the same regex helper. Schema
             (web/src/types/database.ts timelines table): event_date is
             a string (ISO datetime stored as `timestamptz`), event_label
             is the headline (NOT NULL), event_body is the optional
             description. No DB or pipeline changes needed — pure
             render-side fix. iOS surfaces noted but DEFERRED per
             locked decision (iOS session).
Review:      A (confirmer) re-derived the three call sites
             independently; verified `formatMmDdYyyy` correctly returns
             `s` (raw string) on no-match (Stage 1 had wrongly claimed
             it returned `m`); confirmed canonical helper belongs in
             web/src/lib/dates.ts (already houses formatDate /
             formatDateTime / timeAgo); approved direction. B
             (adversary) verified no missed surfaces (admin newsroom,
             story-manager, kids-story-manager, ArticlesTable,
             StoryArticlePicker, JSON-LD, OG images, RSS, sitemap all
             clean — only the three known files render timelines);
             flagged the upstream `parse_timeline_event_date` lenient
             parser in supabase/migrations/2026-04-28_… that falls back
             to `now()` on unparseable input — risk surface but not
             this concern; warned against using `Intl.DateTimeFormat`
             in the new helper (would re-introduce UTC-midnight TZ
             drift bug already documented in StoryEditor.tsx); flagged
             that `event_body` becoming reader-invisible makes the
             editor's Summary field a write-only field but that's
             editor-bundle (#14-#20) territory, not in scope here. A
             and B converged on direction; no tie-breaker needed.
             Adopted B's regex-only helper (no Intl fallback).
Fix:         web/src/lib/dates.ts — added `formatTimelineDate` export.
             Regex prefix-match `^(\d{4})-(\d{2})-(\d{2})` → MM/DD/YYYY.
             Returns '' for null/undefined/empty. Returns raw input on
             no-match (so "Generated"-style legacy strings surface to
             the operator instead of "Invalid Date"). Comment explains
             why we don't use `new Date()` — UTC drift footgun.
             web/src/components/article/TimelineSection.tsx —
             - imported formatTimelineDate from @/lib/dates
             - removed local `formatDate` (lines 89-98)
             - removed `BODY_STYLE` constant (lines 82-87, now unused)
             - removed `<p style={BODY_STYLE}>{ev.event_body}</p>`
               body render (line 137 — the "anything else" the owner
               wanted gone)
             - DATE_STYLE render now calls formatTimelineDate
             web/src/components/article/StoryEditor.tsx —
             - imported formatTimelineDate from @/lib/dates
             - removed local `formatMmDdYyyy` (lines 166-171)
             - both call sites swapped (timeline preview view mode +
               entry-list compact row)
             web/src/components/article/KidsStoryEditor.tsx —
             - imported formatTimelineDate from @/lib/dates
             - removed local `formatMmDdYyyy` (lines 171-176)
             - all three call sites swapped (lines 657, 722, 896)
             TimelineItem.event_body retained in the prop type (callers
             still pass the field through; declaring it documents the
             DB shape, removing it would force [slug]/page.tsx changes
             in parallel session #21-25's territory).
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   DEFERRED — locked decision keeps iOS scope out of this
             session. Punch list for the future iOS session:
             - VerityPost/VerityPost/StoryDetailView.swift:189-193
               displayDateFormatter is "MMMM d, yyyy" — change to
               "MM/dd/yyyy".
             - VerityPost/VerityPost/StoryDetailView.swift:1019-1033
               event-type timelineRow renders
               `Text(event.text ?? event.summary ?? "")` — drop the
               `event.summary` (event_body) fallback so headline-only
               render is enforced.
             - VerityPostKids/ — no timeline rendering detected, n/a.
Verifier:    pass — verified all four files cold; helper signature +
             edge cases match spec (YYYY-MM-DD prefix on full ISO →
             MM/DD/YYYY, partial/malformed → raw, null/empty → ''),
             import paths correct, no orphaned imports/constants, no
             stale `formatMmDdYyyy` or `BODY_STYLE` references in the
             timeline code path (the two `BODY_STYLE` hits in
             ArticleSurface.tsx are unrelated — that's the article
             body, not timeline body), `TimelineItem.event_body`
             retained for caller compatibility, only consumer of
             TimelineSection (ArticleSurface.tsx:138) untouched.
Status:      RESOLVED — web slice shipped. iOS slice deferred to its
             own session per locked decision; punch list above.
```

### 28. Editor timeline — appears late after generation
Status: RESOLVED
Symptom: After the pipeline completes, the timeline section in the editor
takes minutes to populate. Owner saw the rows appear long after the article
was generated.

```
RESOLUTION (concern 28) — 2026-05-02 (Session H)
Investigate: Stage 1 re-traced the editor's timeline lifecycle.
             loadStory() is the only fetch path; entries arrive via a
             single synchronous SELECT from `timelines` filtered to the
             story's id. There is no Realtime subscription, no manual
             refresh button, no polling. The persist_generated_article
             RPC does insert timelines in the same transaction as the
             article (so when the generate route returns, rows are in
             DB), but if the editor mounts BEFORE the persist commits
             — e.g. tab opened from a bookmarked URL or admin Stories
             list while a parallel-tab generation is still mid-LLM —
             the editor reads zero rows and never re-checks. That
             matches the owner's "took a few minutes to actually show
             up": the rows were absent at fetch-time and only appeared
             on a manual reload. Honoring the owner-quote rule
             (symptom is render-side ground truth), this is a real
             editor bug, not just label confusion in AudienceCard.
Review:      A (confirmer) CONFIRM — proposed a polling effect with
             safety guards. B (adversary) BLOCK — argued (1) the
             symptom is AudienceCard "Building timeline" label
             confusion and (2) any polling fix risks clobbering user
             edits and re-introducing the existing race the
             didMountRef comment was written to prevent.
             Tie-breaker: take a third path — a ONE-SHOT 4-second
             re-load (not interval polling). Honors owner-quote rule
             (treats symptom as render-side), avoids B's regression
             list (one race window instead of fifteen, no infinite
             poll, gated on !isDirty/!saving), and stays in Session H
             scope (editor files only — PipelineStepLabels.ts is out
             of scope here).
Fix:         web/src/components/article/StoryEditor.tsx and
             web/src/components/article/KidsStoryEditor.tsx —
             added a useEffect immediately after the existing
             didMountRef effect that, when storyId is set and entries
             are empty and the user is not dirty/saving/loading,
             schedules a single setTimeout(loadStory, 4000). A
             timelineRetryTriedRef remembers which storyId we already
             retried, so a story with genuinely no timeline events
             does NOT re-poll. Cleanup clears the timeout and sets a
             cancelled flag so any in-flight scheduled callback
             bails. Deps: [storyId, entries.length, isDirty, saving,
             loading] — every state change re-evaluates and cancels
             the in-flight retry, which means the user starting to
             type or hitting Save aborts the pending re-fetch before
             it can clobber local state.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — admin editor is web-only; no analogous surface in
             iOS adult or iOS kids. Per locked decision iOS scope is
             deferred.
Verifier:    pass — read-only sub-agent reread both editors cold and
             confirmed: deps array correct, all bail conditions
             present, ref-guarded one-shot (no setInterval anywhere),
             cleanup clears timeout + cancels in-flight callback,
             cannot loop, cannot clobber edits.
Status:      RESOLVED — one-shot 4s timeline re-load lands the rows
             when the editor opened cold during a still-running
             generation. PipelineStepLabels.ts copy clarification
             remains a useful UX follow-up but is not required and
             lives outside this session's scope.
```

### 29. Mobile + iOS — 3-tab article layout
Status: RESOLVED (web slice); iOS DEFERRED
Decision: Top tabs (Option B) — Article / Timeline / Quiz & Discussion.
Kids: no Discussion tab (Article / Timeline / Quiz only).
Surfaces: web mobile reader, iOS adult reader, kids iOS reader.
Reason: Big-feature peel-off — owner locked this for its own session
(2026-05-02). iOS scope also separately deferred to an iOS session.

```
RESOLUTION (concern 29) — 2026-05-02
Investigate: Reader is a single-column 680px-max stack today
             ([slug]/page.tsx:269-307). Timeline + Sources rendered
             inside ArticleSurface; Quiz + CommentThread rendered
             via ArticleEngagementZone (id="discussion"). No
             responsive design beyond the maxWidth — site convention
             breakpoint is 860px (globals.css:408). ArticleSurface
             has only one render-site (the page); ArticleEditor
             imports the TS type only, so refactoring ArticleSurface
             internals is safe.
             ArticleTracker hangs IntersectionObserver sentinels off
             [data-article-body] (ArticleTracker.tsx:42, 93) — a
             tabbed reader must keep that element mounted.
             ArticleQuiz has href="#discussion" pointing at the
             engagement zone (ArticleQuiz.tsx:247) — Quiz and
             Discussion live in the SAME locked tab, so the in-panel
             scroll continues to work.
             Kids on web already render zero engagement zone (COPPA
             gate at page.tsx:289), so "kids omits Discussion" reduces
             to "engagementSlot is null on kids" → tab list collapses
             to 2 with no extra logic.
Review:      A=PARTIAL, B=PARTIAL — both AGREE on top-tabs-on-mobile
             with three corrections to Stage 1: (a) drop the desktop
             3-column grid (scope creep — owner words + locked
             decision both scope to mobile + iOS only), (b) tab-content
             fix: Article = body only, Timeline = timeline + sources,
             Quiz & Discussion = engagement (no Timeline duplication),
             (c) breakpoint = 860px (site convention), not 768. Both
             reviewers also called out: tabs MUST use CSS display:none,
             not conditional render, to preserve SEO, ArticleTracker
             sentinels, and ArticleEngagementZone hasPassed state. No
             tie-breaker needed.
Fix:         (1) ArticleSurface.tsx: dropped `sources` + `timeline`
             props and the TimelineSection / SourcesSection imports
             + renders. ArticleSurface now renders title/subtitle/
             byline/body only.
             (2) NEW ArticleReaderTabs.tsx — client component with
             three slots (articleSlot / timelineSlot / engagementSlot).
             Tab strip + 3 panels with data-reader-panel /
             data-active-tab attributes; inline <style> with
             @media (max-width: 859px) shows the strip and hides
             non-active panels via display:none. At >=860px the strip
             is hidden and panels render in normal flow — desktop
             unchanged. Quiz & Discussion tab is omitted entirely
             when engagementSlot is null (kids/COPPA + drafts).
             role="tab"/"tabpanel"/"tablist" + aria-selected /
             aria-controls / aria-labelledby wired for a11y.
             (3) [slug]/page.tsx: imported ArticleReaderTabs +
             TimelineSection + SourcesSection directly. Replaced the
             ArticleSurface + ArticleActions + ArticleEngagementZone
             block with <ArticleReaderTabs> taking:
               articleSlot     = ArticleSurface + ArticleActions (when adult+published)
               timelineSlot    = TimelineSection + SourcesSection
               engagementSlot  = ArticleEngagementZone or null
             COPPA gating preserved (engagementSlot null when isCoppa
             OR status != 'published'; ArticleActions same gate).
             Desktop visual order end-to-end preserved:
             body → timeline → sources → actions → engagement.
TypeScript:  pass (`npx tsc --noEmit` exit 0).
iOS build:   DEFERRED — locked decision keeps iOS scope out of this
             session. Punch list for the future iOS session:
             - VerityPost/VerityPost/ (adult reader): implement
               native top-tab control (3 tabs: Article / Timeline /
               Quiz & Discussion); match COPPA gating to drop the
               third tab on kids-flagged content.
             - VerityPostKids/ (kids reader): implement native
               top-tab control with 2 tabs only (Article / Timeline).
Verifier:    PASS — confirmed display:none preserves SEO + state +
             scroll-depth, all panels mount, kids articles get 2
             tabs, ArticleSurface refactor doesn't leak into
             ArticleEditor (type-only import unchanged), no `as any`
             / `@ts-ignore` introduced, accessibility attributes
             present, StoryArticlePicker still renders above tabs.
Status:      RESOLVED (web slice) — iOS DEFERRED to dedicated iOS
             session per locked decision.
```

### 30. Editor timeline — adding an Article creates an Event; no Story option
Status: RESOLVED
Symptom: In the editor's Timeline entries section, clicking the "+ Article"
affordance produces an entry that shows up labeled as "Event". Clicking
"+ Event" also shows up as Event (correct). There's no visible "Story"
option in the add controls — yet the originally auto-generated timeline
entries on this article rendered as "Story". So either the add buttons
are mismapped, or the badge is computed off the wrong field, or the
"Story" affordance is missing entirely. Worth investigating end-to-end
how the type='story' / type='article' / type='event' values flow between
the add buttons, the local state, the render badge, and the DB.

```
RESOLUTION (concern 30) — 2026-05-02
Investigate: Traced the type flow end-to-end. Add-buttons:
             addEvent → entry { type: 'event' }; addStoryEntry → entry
             { type: 'story' }. Both correctly typed at write time
             (StoryEditor.tsx:530, 537). saveAll persists type='story'
             entries to DB as type='article' (anchor) — the article-
             save route handles this mapping. loadStory inversely maps
             DB type='article' → local type='story'. So the type wire
             was correct end-to-end.
             The bug was render-side at the badge: line 1411 derived
             label from `hasContent` instead of `entry.type`. So
             "+ Article" (creates type='story', empty content) badged
             as "Event" because hasContent was false. And the
             pipeline-generated anchor (type='article' → local 'story',
             with body content from #14) badged as "Story" because
             hasContent was true. Owner saw the inconsistency and
             noted "the story is the one that showed for all the
             original auto generated timelines" — pointing at exactly
             this misderivation.
             "Story" was not a missing add affordance — it was the
             label badge that USED to render for content-bearing
             rows under the broken derivation. Renaming the badge
             to "Article" (matching the "+ Article" button) and
             deriving from entry.type makes the system self-
             consistent: "+ Article" button → "Article"-badged entry;
             "+ Event" button → "Event"-badged entry. No third add
             button needed.
Review:      n/a — same fix as concern #19 (combined check AGREE).
Fix:         No additional code change. Concern #19's commit e1fba65
             closes #30: badge derivation flipped to entry.type with
             label "Article", and the "+ Article" button now produces
             an "Article"-badged entry on creation (no need to type
             content first to get the right badge).
TypeScript:  pass (concern #19's tsc run covers).
iOS build:   n/a — timeline editing is web admin only.
Verifier:    self-verified — verified addEvent/addStoryEntry create
             correctly-typed entries; verified the new badge derivation
             at StoryEditor.tsx:1411 + KidsStoryEditor.tsx:905 honors
             entry.type.
Status:      RESOLVED — closed transitively by concern #19.
```

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
Status: RESOLVED
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

```
RESOLUTION (concern 31) — 2026-05-02 (Session J)
Investigate: Stage 1 mapped every surface. Mute UI lives in 4 web-admin
             files: SourcesBlock.tsx (in-row "Mute outlet" button on each
             source line, behind onMuteOutlet prop), StoryCard.tsx (prop
             pass-through), page.tsx (4 useStates + handleMuteConfirm +
             mute modal JSX + setMutingOutlet pass to StoryCard), and
             outlets/mute/route.ts (the mute API). DB read-side: ingest/
             run/route.ts queries muted_outlets to skip muted feeds. DB
             schema: muted_outlets has 0 rows, no FKs in/out, no views,
             0 audit_log rows for action LIKE 'outlet.%'; two RPCs
             (upsert_muted_outlet, delete_muted_outlet) reference it.
             Today's `source_urls` from AudienceCard is the
             override-branch filter — it both narrows AI corpus AND the
             persisted `public.sources` rows. Locked decision splits
             these: the new POST body sends `source_urls` (full visible
             list, AI context) AND `attach_as_source_urls` (subset to
             persist). Persist filter happens at the
             sourcesPayload `.map()` site, leaving `corpus` (line 1177)
             unchanged. Categorized (c)+(d): intentional rip + new
             feature; not a latent bug repair. iOS confirmed N/A —
             grep finds zero references in VerityPost/ + VerityPostKids/.
Review:      A (confirmer) re-derived independently. Verified all line
             numbers match, the corpus-vs-persist filter is semantically
             safe (filtering at map call doesn't mutate sourceTexts
             already consumed by corpus). Two real gaps: (1) the source-
             of-truth migration 20260503000002_feeds_priority_topic.sql
             still creates muted_outlets, so a `supabase db reset`
             would resurrect the dropped table — paired forward
             migration needed; (2) Stage 1's `attach_as_source_urls`
             cap was `.max(20)` while `source_urls` was still `.max(10)`
             → silent break for any cluster with >10 sources. Verdict:
             PARTIAL.
             B (adversary) ran 12 attacks A-L. Refuted A (URL identity:
             discovery_items.raw_url flows verbatim through the override
             path, no canonicalization), C (standalone-mode no
             interaction), D (kid pipeline shares the single
             sourcesPayload site), E (visibleSources matches override-
             path URLs), G (Remove button is server-side detach, not in
             scope), H (NewArticleModal sends source_urls only, default
             attaches all), J (zero iOS surfaces), K (persist RPC has no
             min-source check — empty attach is safe), L (no scheduled
             jobs hit ingest, code-vs-SQL ordering moot). Confirmed B/F
             pre-existing (override branch already used today; selectedUrls
             init invariant unchanged by this fix). Strongest finding
             converged with A: cap mismatch. PARTIAL.
             A and B converged on raise-both-caps + add forward migration.
             A's empty-guard concern (operator publishes zero-source
             article) is implementation of the locked decision verbatim;
             not a divergence. B's retry-route forward gap is pre-
             existing and out of #31 scope (Stage 1 didn't include
             retry/route.ts). No tie-breaker needed.
Fix:         web/src/app/admin/newsroom/_components/SourcesBlock.tsx —
             dropped `onMuteOutlet?` prop + destructure + 19-line
             "Mute outlet" button JSX block (was lines 128-146).
             web/src/app/admin/newsroom/_components/StoryCard.tsx —
             dropped `onMuteOutlet` prop/destructure/pass-through;
             renamed `selectedSourceUrlsArray` → `attachAsSourceUrlsArray`;
             added `allSourceUrlsArray = visibleSources.map(s => s.url)`;
             AudienceCard now receives both via new prop names.
             web/src/app/admin/newsroom/_components/AudienceCard.tsx —
             replaced `selectedSourceUrls?: string[]` with
             `allSourceUrls?: string[]` + `attachAsSourceUrls?: string[]`.
             Empty-guard condition + copy switched to
             `'Cluster has no sources to send.'` (only fires when
             cluster genuinely has zero sources). POST body sends both
             fields when defined. useCallback deps updated.
             web/src/app/admin/newsroom/page.tsx — deleted 4 mute-modal
             useStates, `handleMuteConfirm` async fn, `onMuteOutlet`
             prop pass to StoryCard, the entire `<Modal title="Mute
             outlet">` JSX block. Modal/Field imports kept (still used
             by NewArticleModal).
             web/src/app/api/admin/pipeline/generate/route.ts — added
             `attach_as_source_urls: z.array(SourceUrlSchema).max(20).optional()`
             to RequestSchema; raised `source_urls.max(10)` →
             `.max(20)` to match (per Stage 2 convergent fix); added
             `attach_as_source_urls` to the destructure; replaced the
             unconditional `sourcesPayload = sourceTexts.map(...)` with
             a filter against an attachSet (null when omitted = legacy
             attach-all default; empty array = attach none). corpus
             build at line 1177 unchanged — AI still sees every source.
             web/src/app/api/admin/articles/new-draft/route.ts —
             matched cap raise: `source_urls.min(1).max(20)`.
             web/src/app/api/newsroom/ingest/run/route.ts — stripped
             `mutedRows` query, `mutedSet`, `feedsMuted` counter,
             skip-if-muted block, and `feedsMuted` from both the audit
             output and JSON response.
             DELETED: web/src/app/api/admin/newsroom/outlets/mute/route.ts
             (171-line file) and the now-empty `outlets/` parent dir.
             NEW: supabase/migrations/20260503000004_drop_muted_outlets.sql
             — DROP FUNCTION upsert_muted_outlet, DROP FUNCTION
             delete_muted_outlet, DROP TABLE muted_outlets CASCADE.
             Owner runs forward (or `supabase db push` does on next
             deploy).
TypeScript:  pass (npx tsc --noEmit from web/, exit 0)
iOS build:   n/a — grep across VerityPost/ + VerityPostKids/ returned
             zero references to mute outlet, attach_as_source, or
             allSourceUrls.
Verifier:    pass — 12/12 checks. Generate POST body splits correctly,
             empty-guard reads from allSourceUrls, StoryCard derives
             allSourceUrlsArray from visibleSources, page.tsx + ingest/
             run cleanup leaves no orphan refs, generate route
             sourcesPayload filter handles both undefined (attach all)
             and empty-array (attach none) cases without touching
             corpus, new-draft cap raised in lockstep, mute API + dir
             both gone, forward migration order is correct, repo-wide
             sweep finds zero residual refs outside the two migration
             files (history + new drop), iOS sweep clean.
Status:      RESOLVED — operator can confirm by:
             (1) opening newsroom and verifying no "Mute outlet" button
                 on any source row and no mute modal trigger
             (2) generating a story with one source unchecked: the
                 generated article should have one fewer `public.sources`
                 row, but the AI's content reflects the unchecked
                 source's content (corpus reaches it via the new
                 `source_urls` full list)
             (3) running `supabase db push` (or executing the new
                 migration manually) to drop the muted_outlets table
                 + its two RPCs.
             Out-of-scope adjacencies surfaced for future concerns:
             - Retry route at runs/[id]/retry/route.ts:102-108 doesn't
               forward `source_urls` or `attach_as_source_urls` from
               the original run's input_params; pre-existing gap, more
               visible after this split (retry of a partial-attach run
               will fall back to attach-all default). Worth a follow-up
               concern.
             - selectedUrls/visibleSources state-staleness on parent
               reload (StoryCard.tsx:91-94) — useState init runs once,
               so newly-ingested sources mid-poll won't appear in the
               checkbox list and won't reach allSourceUrls. Pre-existing,
               unchanged here, but worth a follow-up if the operator
               keeps a long-running newsroom page open during ingest.
             - Scratch md/sql files at repo root (newsroom_upgrade.sql,
               newsroom_upgrade_state.md, prompt.md) reference the
               dropped surfaces; per CLAUDE.md memory feedback_no_external_working_dirs
               these are scratch and out of scope.
```

### 33. AudienceCard polling — articleId never updates on live transition
Status: RESOLVED
Symptom: AudienceCard.tsx:141 calls `setArticleId(json.run.article_id)`
inside the polling tick when status flips to completed. But `pipeline_runs`
has NO `article_id` column (verified via web/src/types/database.ts:7977-8005
and the runs detail endpoint at web/src/app/api/admin/pipeline/runs/[id]/route.ts
which returns the raw run row). `json.run.article_id` is always undefined,
so a card transitioning live from `generating` → `generated` writes
undefined into the articleId state and overwrites whatever was passed in.
The article_id IS available on each joined `pipeline_costs` row returned
as `steps[].article_id` at route.ts line 87. Fix: read article_id from
the last successful step in the steps array. Surfaced by concern #10's
review pass — directly affects when the new Edit button (and the existing
View article fallback) become visible without a page refresh.

```
RESOLUTION (concern 33) — 2026-05-02
Investigate: Confirmed pipeline_runs schema has NO article_id column
             (database.ts:7978-8005). The runs detail route at
             api/admin/pipeline/runs/[id]/route.ts:43-60 selects `*` from
             pipeline_runs and joins pipeline_costs into `steps`; the
             route response shape is { ok, run: runRow, steps, totals }.
             Each step row carries `article_id: string | null` (route.ts
             :54, :87) sorted by created_at ascending (route.ts:128-130).
             The article_id is written by the persist step in
             generate/route.ts (cost row insert at ~1905-1929 carries
             article_id + success:true). Local RunRow type at
             AudienceCard.tsx:53-60 over-declared article_id; local
             StepRow at :62-68 didn't include article_id at all.
             Categorized as (b) data exists but render reads wrong field.
Review:      A (confirmer) CONFIRMED diagnosis + fix; refined the
             RunRow type pruning (drop only article_id, keep error_type
             / error_message / audience which DO exist on pipeline_runs).
             B (adversary) returned PARTIAL — flagged that
             lastStep.article_id can be null on partial-success and
             pushed for a route-level fix that surfaces article_id at
             the top level of the response sourced from
             output_summary.article_id (which is set unconditionally
             pre-status-flip at generate/route.ts:2063-2085). No tie-
             breaker required: owner's prompt explicitly LOCKED scope to
             AudienceCard.tsx only ("no edits there [route file]"), so
             B's route-level recommendation is out of scope. B's
             partial-success concern is mitigated by reading "last
             successful step" (matches owner's exact wording) instead
             of just last step — only the persist step writes article_id,
             so findLast(s.success && s.article_id) finds it iff persist
             ran. Also confirmed B's adjacent finding that the cancel
             route writes status='failed' (cancel/route.ts:102), so the
             polling 'cancelled'|'aborted' branch is dead code, and the
             'success' status is also dead (generate uses 'completed'
             only) — orthogonal cleanup, not in #33's scope.
Fix:         web/src/app/admin/newsroom/_components/AudienceCard.tsx —
             - RunRow type: removed article_id field (pipeline_runs has
               no such column).
             - StepRow type: added article_id: string | null (matches
               the route's pipeline_costs projection).
             - Polling success branch: replaced
               setArticleId(json.run.article_id) with a findLast scan
               for the last step where success===true AND article_id is
               non-null, then setArticleId(articleStep?.article_id ?? null).
             - Added a short invariant comment explaining why we read
               from steps not run.
             Cancelled/failed branches untouched. Server-side
             initialArticleId first-paint path untouched.
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only; verified via grep that
             VerityPost/ + VerityPostKids/ have no AudienceCard
             references (consistent with kids_scope.md memory: kids =
             iOS only, no admin newsroom).
Verifier:    pass — 10/10 checks. Polling success populates articleId
             from the persist-step row; gated JSX (View fallback Link
             + new Edit Link) now renders after live transitions; no
             dead refs to removed RunRow.article_id; first-paint path
             intact; cross-platform scope correctly limited to web.
Status:      RESOLVED — unblocks concern #34 (drop redundant
             articleId-fallback View Link). Owner can now confirm by
             generating a card live: Edit button should appear without
             a page refresh once status flips to generated.
```

### 34. AudienceCard — drop redundant articleId-fallback View Link
Status: RESOLVED
Symptom: AudienceCard's generated-state currently renders "View article"
twice in fallback chain — first as a Link to the public slug, then (if
slug missing) as a Link to /admin/story-manager?article=ID. The
articleId-fallback Link is now redundant after concern #10 added a
dedicated Edit button. Drop the fallback so View=public-page only,
Edit=editor only — clean affordance contract, no parallel paths.
Blocked by #33: until polling correctly populates articleId on live
transitions, the fallback is the only path that ever fires for live-
generated cards. Resolve #33 first, then this. Also has a latent
bug — the fallback hardcodes `/admin/story-manager` even for
tweens/kids articles, which would route to the adult editor.

```
RESOLUTION (concern 34) — 2026-05-02
Investigate: Generated-state JSX in AudienceCard.tsx had a chained
             ternary: articleSlug ? <Link href=`/${slug}`>View
             article</Link> : articleId ? <Link href=`/admin/story-
             manager?article=${id}`>View article</Link> : null.
             Concern #10 already shipped a dedicated Edit Link gated
             only on articleId that routes by audienceBand
             (adult → story-manager, tweens/kids → kids-story-
             manager). The articleId-fallback Link duplicated the
             editor route AND hardcoded the adult editor — for kids/
             tweens cards with no slug, "View article" silently
             routed to the wrong editor. Categorized (b) parallel
             code paths + (a) latent kids routing bug.
Review:      A (confirmer) AGREED — verified the fallback is the only
             "View article" rendering today (because the articleSlug
             branch is dead code: articleMeta is never wired through
             page.tsx → StoryCard, and the polling tick comment at
             lines 147-149 explicitly notes the run-detail endpoint
             doesn't return slug). Confirmed Edit Link covers all
             editor access with correct audienceBand routing. Other
             editor paths preserved: ArticlesTable Edit button (#12),
             direct URL.
             B (adversary) AGREE-WITH-CHANGES — surfaced that the
             articleSlug branch is also dead code today, and
             recommended KEEPING it anyway as the correct public-page
             affordance for when slug-wiring eventually lands. B
             noted a follow-up worth filing separately: wire
             articleMeta from page.tsx so the slug branch actually
             renders for published articles. NOT in #34 scope; the
             cluster list endpoint at clusters/list/route.ts joins
             audience_state but never resolves
             audience_state.article_id → articles.story_id →
             stories.slug.
             No tie-breaker — A and B converged on Stage 1's plan
             (delete fallback only, keep slug branch).
Fix:         web/src/app/admin/newsroom/_components/AudienceCard.tsx —
             Replaced the chained ternary in the state==='generated'
             block with two independent conditionals: articleSlug &&
             <View Link>, articleId && <Edit Link from #10>. The
             articleId-fallback "View article" Link was deleted
             outright (17 lines). Skip button untouched. The
             articleSlug branch is preserved (currently inert; will
             render once a future fix wires articleMeta).
TypeScript:  pass (npx tsc --noEmit, exit 0)
iOS build:   n/a — newsroom is web-admin only.
Verifier:    pass — 7/7 checks. JSX shape is now the clean affordance
             contract (View=public, Edit=editor, Skip=skip), no
             parallel paths, no kids-routed-to-adult-editor latent
             bug. Cross-platform scope confirmed admin-web only.
Status:      RESOLVED — clean affordance contract, latent bug fixed.
             Optional follow-up (NOT this concern): wire articleMeta
             through page.tsx → StoryCard so the slug branch renders
             for published articles. File as a new concern if owner
             wants the public-page View link to actually work.
```

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
