# AI Redesign — Research-First Newsroom Pipeline

This document is the source of truth for the next phase of the discovery /
generation pipeline. It rewrites the operator model from "polling firehose +
ephemeral clusters" into "topic-driven research + persistent stories +
permanent source provenance."

The current pipeline (Phase A/B/C, shipped 2026-05-04) does feed-fanout
correctly but treats every Run Feed click as a generic everything-pull and
discards cross-day connections. This redesign keeps that backbone and adds
the layers above it that turn Verity Post from an aggregator into a
research-first newsroom.

---

## Session state — read first, update on every ship

**For the assistant:** this block is the live execution state. Treat it
as authoritative over anything else in the doc. Update it the same turn
you ship a wave — do not batch bookkeeping. Only the fields under
"Current status" change between sessions; the design below stays locked
unless the owner explicitly unlocks something.

### Phase
Implementing the design. Design is LOCKED through four trim sweeps
(2026-05-04). Do not re-plan. Do not re-ask owner-decided questions
listed in § Decisions the owner needs to make.

### Current status
- **Last shipped wave:** Wave 6 — Stream F provenance UI
  (commit `aa5158f`, 2026-05-04). New `/admin/sources`
  standalone page reads from `article_sources` (the no-delete
  provenance log populated by Wave 0). Two new endpoints:
  `GET /api/admin/sources` (keyset paginated list filtered by
  `outlet` ilike on `outlet_snapshot`, `date_from` / `date_to`
  on `created_at`; default order is `created_at DESC, id DESC`;
  joins `articles` for title + status + age_band + deleted flag
  so the row links into the right editor surface, and `feeds`
  for `source_name`/`name` + `deleted_at` so each row shows
  which feed the URL came from with a "Removed" badge when the
  feed has been soft-deleted) and
  `GET /api/admin/sources/export.csv` (same filters, no
  pagination, capped at 50,000 rows, sorted oldest-first for
  audit pasteability, returns a `text/csv` Response with a
  `verity-sources-YYYY-MM-DD.csv` Content-Disposition).
  New page `web/src/app/admin/sources/page.tsx` shows the three
  required filter controls (outlet text search debounced 350ms
  to URL, first-cited date_from, first-cited date_to) plus an
  Export CSV anchor that bundles the current filter into the
  download. Source rows render outlet, URL (opens new tab),
  title snapshot, citing article (linked to story-manager or
  kids-story-manager based on `articles.age_band`) with
  Published/Archived/Deleted badges, feed name (with a Removed
  badge when soft-deleted), and source class label.
  Load more keyset pagination. Empty state explains the
  no-delete contract. Sources card added to the Content
  Pipeline group on the admin hub at `/admin`. Per § Stream F
  trim sweep: no source-class filter, no feed-status filter,
  no view toggle, no free-text URL search. `tsc --noEmit`
  clean; `next lint` clean for the touched dirs.
- **Next wave to ship:** **none — wave order complete.** All
  seven waves (0 through 6) of AI_Redesign.md are shipped. Open
  follow-ups now belong to v1.1 (per the Out of scope and
  v1-deferred lists below): public-facing surfacing of
  `article_sources` on the article reader, Detach + Lock UI
  for `story_observations.detached_at` / `stories.is_locked`,
  paid news-search vendor as a second `search_api` feed.
- **Branch:** main (direct commit per repo workflow — recent history
  is single-branch).
- **Open blockers:** none.

### Wave order (locked)
1. **Wave 0 — `article_sources` only.** New table + RLS (blanket DENY
   UPDATE + DELETE except `service_role`; INSERT service_role only).
   Patch `/api/admin/articles/[id]/route.ts` after the existing
   `sources` delete-and-reinsert at `:560` to write `article_sources`
   with `ON CONFLICT (article_id, url_snapshot) DO NOTHING`.
   Regenerate `web/src/types/database.ts`. Smoke test: edit an article
   → row lands in `article_sources`. **Genuinely independent** — no
   downstream coupling. Ship as its own PR.
2. **Wave 1 — Stream A1 schema + GIN index.** Remaining four tables
   (`research_queries`, `discovery_runs`, `story_observations`,
   `research_jobs`) + `stories` ALTERs (6 cols) + `discovery_items`
   ALTER (1 col) + GIN index on `stories.keywords` + partial unique
   index on `research_jobs WHERE status='running'`. Regenerate types.
3. **Wave 2 — Stream B handler.** New `grab-plan.ts` module + handler
   changes in `route.ts` (replace `oneDayAgo` + `SIX_HOURS_MS` with
   `lookbackMs`, grab plan filter, unbounded GIN-index story match,
   final transaction with `discovery_runs` audit + `query_*_snapshot`
   pair). `reserve_cost_or_fail` before the Haiku call.
4. **Wave 3 — Stream C Wikipedia.** New `wikipedia-search.ts` module +
   one `feed_type='search_api'` row + polling-cron WHERE clause to
   skip `search_api`. Silent-fail contract.
5. **Wave 4 — Stream D Run Feed UI.** Research panel (lookback /
   source-scope multi-select / mode / saved-queries dropdown with
   inline pencil/trash). Phase-label progress polling. Cancel button.
   Result screen (flat sortable table + Promote/Discard per row +
   View Stories CTA).
6. **Wave 5 — Stream E Stories list rebuild.** Replaces today's
   cluster list at `/admin/newsroom`. Paginated stories list with
   filters (research_query, date range, generation_state). Story
   detail drawer with read-only observation timeline.
7. **Wave 6 — Stream F provenance UI.** `/admin/sources` page with
   outlet text search + date range + sort + CSV export.

### Locked owner decisions (do not re-ask)
- **No Python worker.** All ingest stays inline in Next.js handler.
- **No `/admin/research-library` route.** Result screen is the only
  library surface.
- **No feed_groups, no presets, no read-state, no pin, no audience
  hints, no per-stream feature flags, no category columns on
  `discovery_items`.**
- **`article_sources`:** blanket DENY UPDATE + DELETE except service_role.
  Title-typo correction policy deferred to v1.1.
- **Unbounded story matching:** no staleness floor, no observation cap.
  3-year revival is the feature. `is_locked` flag is the manual lever
  if a zombie attractor surfaces.
- **Saved-query rename:** hard delete allowed; lineage survives via
  `discovery_runs.query_name_snapshot` + `query_text_snapshot`.
- **Audience:** Run Feed is fully audience-neutral. Generate-route
  call shape unchanged (`audience: 'adult' | 'kid'` + `age_band`).
- **Cancel mid-run, phase progress polling, CSV export, multi-select
  feed picker, Wikipedia consumer, `negative_keywords` from grab plan**
  — all kept (owner pushback against the trim agents).

### Update protocol — assistant rules
When you ship a wave:
1. Update **Last shipped wave** with the wave number and commit hash.
2. Update **Next wave to ship** to the next entry in the wave order.
3. Update **Branch** with the actual branch name on first PR.
4. If a real blocker emerges mid-wave, write it under **Open blockers**
   with a one-sentence description + the file/line where work paused.
5. Do not edit the locked design sections below without an explicit
   owner unlock — surface drift as an owner question instead.
6. Don't summarize history in this block. Status only.

---

## What we're building toward

A Run Feed control where the operator can say any of these, and the system
does the right thing:

- "Find articles about tigers for the kid section."
- "Pull anything about WW2 from the last 30 days."
- "Look at the Amelia Earhart / Artemis crossover."
- "Just run the wires for the last 15 minutes — breaking news only."
- "Run the science group for everything in the last week."
- "General feed, last 24 hours" — i.e. today's behavior, kept as the default.

The operator drives the question. The pipeline goes and finds. Stories live
across days or longer, gaining sources as more publishers cover them. Once
a source is cited in a published article, the record is permanent — even
if that source is later removed from our active feed list.

---

## Operator surface

The /admin/newsroom Discovery tab gains a Research panel. Four controls
(lookback, source scope, mode, run). Audience is **NOT** a Run Feed
control — today's model picks audience per-AudienceCard at generation
time (`StoryCard.tsx:59` always renders all three bands;
`web/src/app/admin/feeds/page.tsx:33-34` comment confirms "operators
pick adult vs kid at generation time on the Newsroom page"). The
redesign preserves that. Run Feed is fully audience-neutral — no
audience hint, no audience stamp, no audience filter anywhere in the
pipeline. Audience only matters at the AudienceCard click downstream.

### 1. Lookback window

A dropdown next to Run Feed:

```
Last 15 minutes / 1 hour / 6 hours / 24 hours (default) / 3 days / 7 days / 30 days
```

The choice drives both the freshness filter on incoming items (RSS
`pubDate` filter today, replacing the hardcoded `oneDayAgo` at
`web/src/app/api/newsroom/ingest/run/route.ts:589`) and the
cluster/story formation window (replacing `SIX_HOURS_MS` at
`route.ts:717`). A 7-day choice means the pipeline pulls newer items
AND re-clusters older pending items that fall in the window. Operator
gets one knob. Story-match candidate lookup also moves off today's
top-200-recent-articles ranking (`STORY_MATCH_CANDIDATE_LIMIT = 200`
at `web/src/lib/pipeline/story-match.ts:44`, query in
`loadStoryMatchCandidates` at `:107`) and onto unbounded matching
against the new `stories.keywords` GIN index.

Hard cap at 30 days. The choice persists in the URL as a query param
(`?lb=24h`), matching the existing admin convention — `/admin/newsroom`
already stores filter state via URL params (`?dq=`, `?cat=`, `?so=` at
`web/src/app/admin/newsroom/page.tsx:6-14`). No `localStorage` /
`sessionStorage` / `user_preferences` table is introduced; URL
persistence survives device switch via shareable links.

### 2. Source scope

Two options under one picker:

- **All active feeds** (default — today's behavior)
- **Custom** — open a multi-select feed picker and check boxes

(Feed groups were dropped from the design 2026-05-04 — single
operator, ~93 feeds, multi-select Custom covers the use case at zero
schema cost. Add later if a real need emerges.)

### 3. Mode

Two options:

- **General** — pull everything in scope (today's behavior)
- **Topic** — operator types a query (free text: keywords, phrases,
  or a short prompt). The pipeline only keeps items that match the
  query before they enter the story-formation pass.

Topic queries are saved. Operator can pick a previously-used query
from a dropdown; queries are also editable and deletable.

### 4. Run

Click **Run Feed** with whatever combination of the three above.
Kill-switch + rate-limit + singleflight all stay as Phase C; the
existing `pipeline_runs_singleflight_ingest` partial unique index
returns 409 to a second click while one is `running`.

---

## Typical session flow

Where the operator actually goes, click by click:

1. Operator opens `/admin/newsroom` (Discovery tab is the default).
2. Sets lookback / source scope / mode in the Research panel and
   hits **Run Feed**. The panel collapses into an **inline progress
   view** with phase labels ("Planning…", "Fetching feeds…",
   "Forming stories…") backed by 2s polling on
   `research_jobs.progress`. A Cancel button writes
   `status='cancelled'`; the handler aborts at the next checkpoint
   and writes whatever items already landed.
3. When the handler returns (typical 25-60s), the progress view
   replaces itself with a **result screen** for that job (still
   inside the Discovery tab, no navigation jump):
   - Headline counters: items_fetched, items_kept, stories_formed,
     stories_extended.
   - One CTA: **View stories** (jumps to the Stories list with the
     filter `?job=[id]` pre-applied).
   - Below the CTA, a flat sortable table — one row per
     `discovery_item` the job produced. Columns: outlet, title,
     fetched date, source class badge, match score. Each row has
     **Promote** + **Discard** buttons.
   - Items not promoted in the current session stay in
     `discovery_items` until the 90-day cleanup catches them; a
     re-run of the same query surfaces them again.
4. From the result screen the operator either jumps to a single
   story to write, or keeps triaging items inline (Promote / Discard)
   without leaving the panel.

If the operator clicks Run Feed while a run is already in flight,
the existing 409 + `runningRunId` toast fires (Phase C behavior).
There is no queue.

Two surfaces only: `/admin/newsroom` is the home base for runs +
stories + result-screen triage; `/admin/sources` is the receipts log.
There is no separate research-library route.

---

## Schema reshape

The current schema (`feeds → discovery_items → feed_clusters → articles`)
is preserved as the backbone, with new tables layered on top.

### New tables

#### `research_queries`

Operator-typed prompts. Persistent so the operator can re-run any past
query and so each `discovery_run` can record what drove it.

```
id              uuid PK
name            text  (operator-editable label, optional — auto-derived
                       from query_text if blank)
query_text      text NOT NULL  (the actual keywords / phrase / prompt)
created_at      timestamptz
```

That's it — four columns. All trims locked 2026-05-04:
- No `match_mode` — single mode locked
- No `audience` — Run Feed is audience-neutral
- No `created_by` — single operator
- No `last_used_at` / `total_runs` — UI doesn't render counters; compute
  via `COUNT(*)` / `MAX(created_at)` over `discovery_runs` if needed
- No `deleted_at` — `discovery_runs` carries `query_name_snapshot` +
  `query_text_snapshot`, so historical lineage survives hard-delete
- No `metadata` jsonb — never read

#### `discovery_runs`

Replaces the run-level metadata that lives in `pipeline_runs.input_params`
today. One row per Run Feed click; stamps the query, source scope, and
lookback so the operator can audit what each click actually did.

```
id                    uuid PK
pipeline_run_id       uuid FK pipeline_runs (existing observability table)
research_query_id     uuid FK research_queries (nullable — null = general mode)
query_name_snapshot   text   (snapshot of the query's name at run time —
                              survives later rename / hard-delete; null
                              for general-mode runs)
query_text_snapshot   text   (snapshot of the query's text at run time —
                              survives later edit; null for general-mode
                              runs)
lookback_ms           bigint (the window for this run)
items_fetched         int
items_kept            int    (post-filter)
stories_formed        int
stories_extended      int    (existing stories that gained observations)
created_at            timestamptz
```

(No `feed_ids uuid[]` — duplicates `research_jobs.request_body.feedIds`,
which is already stored verbatim on the in-flight row. Forensics
reach the feed list there.)

The query snapshot pair is what makes the audit log honest under
saved-query rename: `research_queries.name` is operator-editable and
the FK alone would back-fill historical rows with the new name.
Handler writes `query_name_snapshot` / `query_text_snapshot` from
`research_queries` at job-start time, in the same DB tx as the
final status flip (see Stream B).

#### `stories` — already live, gets new columns

**Important: `stories` is not a new table. It already exists** with
`slug` + `title` (`web/src/app/api/admin/pipeline/generate/route.ts`
calls `persist_generated_article` which inserts into `stories` and
attaches articles via `articles.story_id`). The redesign **adds
columns**, doesn't create the table.

Today's live model (verified at
`supabase/migrations/2026-04-29_followup_article_generation.sql:80-104`):

- `stories` has `id`, `slug`, `title`. Each story has a permanent URL
  `/stories/{slug}`.
- `articles.story_id` is an FK; **multiple articles attach to one
  story** (Day-1 article + Day-3 follow-up + Day-5 follow-up share
  one slug).
- `timelines` is story-scoped with a `type` discriminator:
  - `type='event'` — factual events extracted by AI ("2024-01-15:
    contract awarded")
  - `type='article'` — Verity Post articles linked into the timeline
    via `linked_article_id`. Every published article inserts one of
    these, joining the story's timeline at the publish moment.
- `persist_generated_article` accepts optional `existing_story_id`.
  Pass it → article attaches to that story. Pass null → new story +
  slug created.

Columns to ADD on `stories`:

```
keywords            text[]   (extracted at formation; recomputed at
                              article-generation time, NOT on every
                              new observation; needs a GIN index for
                              the unbounded story-match lookup)
first_seen_at       timestamptz
last_observed_at    timestamptz
generation_state    text     ('forming' | 'ready' | 'generating'
                              | 'published' | 'rejected' | 'archived')
research_query_id   uuid FK research_queries (nullable — null = general)
is_locked           boolean  (read on the hot story-match path to
                              exclude locked stories from auto-attach;
                              UI badge deferred to v1.1)
```

Trims locked 2026-05-04:
- No `total_observations` / `total_sources` — `COUNT(*) OVER` on
  `story_observations` is fast at small scale; revisit if the table
  hits 10k+ rows
- No `deleted_at` — no "Delete story" UI in scope;
  `generation_state='archived'` covers hide
- No `metadata` jsonb — never read

`feed_clusters` is **not** dropped — it stays as the short-window
clustering primitive that feeds into story formation. New stories are
formed by promoting a cluster; subsequent matching clusters add
observations to an existing story instead of creating a new one.

#### `story_observations`

Each time a source hits a story, a new row. Never deleted; even if the
underlying `discovery_items` row is later cleaned up, the observation
keeps its snapshot. This is the timeline the Story Manager renders.

```
id               uuid PK
story_id         uuid FK stories ON DELETE RESTRICT
discovery_item_id uuid FK discovery_items (nullable if cleaned up)
observed_at      timestamptz (when the observation attached, not pubDate)
match_score      numeric (0..1, the relevance score that promoted this item)
url_snapshot     text  NOT NULL  (raw URL — survives feed deletion)
title_snapshot   text
excerpt_snapshot text
outlet_snapshot  text  (denormalized; survives feed deletion)
source_class     text  ('rss' | 'scrape_html' | 'scrape_json' | 'search_api')
feed_id          uuid FK feeds (nullable — set if known, can outlive feed)
detached_at      timestamptz   (nullable; v1 doesn't expose detach UI
                                but the column is one timestamp's worth
                                of insurance — feature ships additive)
```

(No `metadata` jsonb — never read.)

#### `article_sources`

The permanent provenance layer. When an article gets generated, every
URL it cites lands here. Once a row exists it can never be deleted.
Even if the feed is soft-deleted, even if the discovery_item is cleaned
up, the URL + outlet + cited excerpt persist with the article forever.

**Relationship to existing `sources` table.** Today the editor already
writes a `sources` row per cited URL on every article PATCH at
`web/src/app/api/admin/articles/[id]/route.ts:560` — and that path
**delete-and-reinserts** the entire `sources` set on every PATCH that
includes `body.sources`
(`service.from('sources').delete().eq('article_id', id)` followed by
re-insert; gated by `body.sources !== undefined` at line 558). That is
incompatible with append-only provenance.

Two-table model (the picked answer, replacing the earlier draft):

- `sources` stays as the **editor-mutable** citation list — what the
  article currently cites. PATCH continues to delete-and-reinsert.
  No schema change.
- `article_sources` is a NEW **no-delete provenance log** — every
  URL we have EVER cited on an article, even if a later edit removed
  it. Written by the publish/edit path AFTER the `sources` reinsert,
  with `INSERT ... ON CONFLICT (article_id, url_snapshot) DO NOTHING`
  so re-edits don't create duplicates. RLS denies DELETE outside
  `service_role`. UPDATE is allowed for admins on `title_snapshot`
  ONLY (typo corrections); `outlet_snapshot`, `url_snapshot`,
  `fetched_at`, `feed_id` are immutable post-insert. Outlet rewrites
  are not in the trust contract for a public ethics receipt.

This means the public ethics receipt at `/admin/sources` reads from
`article_sources` (history), while the article reader reads from
`sources` (current). A URL removed by a later edit still appears in
provenance — that's the point.

```
id               uuid PK
article_id       uuid FK articles ON DELETE RESTRICT
url_snapshot     text  NOT NULL
title_snapshot   text
outlet_snapshot  text  NOT NULL
fetched_at       timestamptz NOT NULL
source_class     text
feed_id          uuid FK feeds (nullable — historical reference)
created_at       timestamptz NOT NULL DEFAULT now()
```

(No `story_id` FK — every cited URL flows through a `story_observation`
which lives on a story; reach the story via `articles.story_id` if
you need it. Dropped 2026-05-04 — there's no direct-cite path that
bypasses a story.)

`article_sources` is no-delete at the application layer. RLS denies
DELETE except by `service_role` during a controlled migration.
UPDATE is allowed for admins on `title_snapshot` ONLY so headline
typos can be corrected post-publish; `outlet_snapshot`,
`url_snapshot`, `fetched_at`, and `feed_id` are immutable from the
moment the row is inserted (the load-bearing fields for the public
ethics receipt).

### Schema constraints worth calling out

- **`feeds` cannot be hard-deleted** if any row in `article_sources`
  or `story_observations` references it. Soft-delete only via
  `deleted_at`. Enforce at the DB level (FK with `ON DELETE RESTRICT`
  on `article_sources.feed_id` and `story_observations.feed_id`,
  combined with the existing soft-delete UI).
- **`stories` cannot be hard-deleted** if any `article_sources`
  references them.
- **`research_queries` allows hard delete** — historical lineage
  survives via `discovery_runs.query_name_snapshot` +
  `query_text_snapshot`. The FK from `discovery_runs.research_query_id`
  uses `ON DELETE SET NULL` so the audit row stays intact and the
  snapshot pair carries forward what the query was named/said.

### Retention policy

- `discovery_items` rows that are **attached to a story_observation**
  → retained indefinitely.
- `discovery_items` rows that **never matched a story** → cleaned up
  after 90 days by the existing `pipeline-cleanup` cron.
- `pipeline_runs` → indefinite (small table, audit value).
- `discovery_runs` → indefinite (joined to research_queries; tiny).
- `stories` → indefinite. Operator can `archive` a story
  (`generation_state='archived'`) to hide it from the Story Manager
  default view, but the row stays.

---

## Pipeline behavior changes

### Architecture — extend the existing handler, no new service

Today's ingest route at
`web/src/app/api/newsroom/ingest/run/route.ts` already does the
RSS + scrape_html + scrape_json fanout in parallel inside a Next.js
API handler. The redesign keeps that handler. We add the grab-plan
step + new data writes inline, no new language, no new service.

**Why no Python worker (decided 2026-05-04):** the original draft
proposed a FastAPI worker on Fly.io because "info about tigers"
runs sounded unbounded. In practice they aren't — even a 30-feed
research fanout completes in 30-60 seconds with parallel fetch +
the existing 5s per-feed timeout. Vercel Pro gives 300s. We do not
exceed the budget under any realistic single-operator workload.
Adding a separate service costs a new repo, new language, new
deploy target, new secrets, new monitoring — for a marginal
ceiling we don't need yet. Defer until cron-of-saved-queries or
operator-stacked queueing actually demands it.

**Lifecycle of one Run Feed click:**

1. Operator clicks Run Feed on `/admin/newsroom`.
2. Next.js handler `/api/newsroom/ingest/run`:
   - Validates input + permission set + kill-switch + rate-limit
   - Inserts `research_jobs` row (status='running', `started_at = now()`)
   - One Haiku call to translate the prompt into a grab plan
   - Parallel fanout: RSS + scrape_html + scrape_json + Wikipedia
   - Applies the grab plan deterministically to filter items
   - Writes survivors to `discovery_items`
   - Runs story formation (promote cluster OR attach to existing
     story via unbounded keyword overlap)
   - Final transaction: `UPDATE research_jobs SET status='done',
     finished_at=now(), <counters>` + `INSERT INTO discovery_runs`
     (immutable audit row with `query_name_snapshot` +
     `query_text_snapshot`).
   - Returns synchronously with `{ jobId, summary }`.
3. UI is *already on* the result screen by the time the response
   lands — no progress polling needed for short runs. For runs
   that the UI starts polling (>5s), it polls `research_jobs`
   every 2s for `progress` + counters until `status='done'` or
   `'failed'`.

**Singleflight** stays as today's pattern: the Phase C
`pipeline_runs_singleflight_ingest` partial unique index. A second
Run Feed click while one is `running` returns 409 with the existing
`runningRunId` toast. No queue; no atomic claim SQL; no crash-recovery
sweep. The existing in-route orphan-reaper (already shipped) handles
stale `running` rows from Vercel-killed runs.

A new table:

```
research_jobs
  id              uuid PK
  status          text  ('running' | 'done' | 'failed' | 'cancelled')
  request_body    jsonb       (the POST body verbatim; forensic value)
  grab_plan       jsonb       (the Haiku plan; debug-only, no UI reads it)
  phase           text        ('planning' | 'fetching' | 'forming' |
                               'finalizing' | null) — set once per
                               phase boundary; UI polls every 2s.
                               Replaces the old numeric `progress`.
  items_fetched   int
  items_kept      int
  stories_formed  int
  stories_extended int
  error           text
  created_at      timestamptz
  started_at      timestamptz
  finished_at     timestamptz
```

(No `created_by` — single operator. Add later when a second
operator actually exists.)

`research_jobs` is one row per Run Feed click. `discovery_runs`
(defined earlier) is the immutable audit row written in the same
final transaction as the `research_jobs` status flip — both land or
neither does. `research_jobs` retention is 30 days (cleanup cron);
`discovery_runs` is indefinite.

### Run Feed entry point

`POST /api/newsroom/ingest/run` accepts a richer body:

```ts
{
  // Lookback
  lookbackMs?: number;          // 15min..30d range; default 24h

  // Source scope
  feedIds?: string[];           // explicit feeds; empty → all active

  // Topic mode
  query?: {
    text: string;               // operator-typed
    saveAs?: string;            // if set, persist to research_queries
                                // before the run
  };
  queryId?: string;             // OR pick a previously-saved query

  // No `audience`, no `feedGroupIds`, no `matchMode` — all dropped
  // 2026-05-04 per owner trim.
}
```

The route does the same Phase A/B/C fanout (RSS + scrape_html + scrape_json
in parallel) but with three new filters layered on:

1. **Source scope filter**: limit `feeds` query to the chosen
   `feedIds`. Empty → all active (today's behavior).
2. **Lookback filter**: replaces the hardcoded 24h pubDate cutoff +
   6h cluster window with `lookbackMs`. Single knob, both windows.
3. **Match filter**: applied to each item AFTER fetch but BEFORE
   `discovery_items` insert.

### Match mode — AI plans, handler executes

Single mode. The operator types a natural-language prompt
("info about the animal tigers"). One Haiku call inside the Next.js
handler translates the prompt into a structured grab plan:

```jsonc
{
  "keywords": ["tiger", "tigers", "big cat", "panthera tigris"],
  "wikipedia_topics": ["Tiger", "Bengal_tiger", "Siberian_tiger"],
  "negative_keywords": ["Tigers (band)", "Detroit Tigers"]
}
```

`negative_keywords` is the disambiguator the operator hits within
their first week — Tigers-band, Detroit Tigers, paper tigers etc.
Two-line `array.some()` filter; one prompt line on the Haiku call.

The handler then applies the plan deterministically to fetched items:

- RSS / scrape_html / scrape_json items pass if title or excerpt
  matches any positive keyword AND no negative keyword.
- Wikipedia: fetch each `wikipedia_topics` page via MediaWiki API.
- Items that match get inserted into `discovery_items` and flow into
  story formation as today.

No per-item LLM calls. Cost per Run Feed click is one Haiku
planning call (~$0.005) plus deterministic TypeScript work.

(Note: the kid-safety LLM filter — `audience_safety_check` at
`web/src/app/api/admin/pipeline/generate/route.ts:1004` — runs at
**generation time** on the cluster, not at ingest match time. It is
unrelated to this AI plan step and continues to run unconditionally
for any `audience='kid'` generate request.)

#### Cost guardrail

Reuse the existing `pipeline_costs` telemetry (`call-model.ts:309`
writes every model call) and the `reserve_cost_or_fail` RPC at
`supabase/migrations/2026-04-28_pipeline_cost_reservations.sql:46`
that already enforces a daily cap. The handler calls
`reserve_cost_or_fail` BEFORE the Haiku planning call (same path as
today's generate route). **No per-run item ceiling** — at ~$0.005/run
the daily cap rarely matters.

#### Handler timeout reality

Vercel Pro gives 300s per request. Realistic Run Feed budget:
- Haiku planning call: ~2s
- Parallel feed fanout (5s timeout per feed, ~50 feeds): ~10-15s
- Wikipedia topic fetches (parallel): ~3-5s
- Deterministic filter + insert: ~5s
- Story formation pass: ~3-5s
- **Typical total: 25-35s. Worst case: ~60s.**

If a single click ever blows the 300s budget (e.g. "all wires, last
30 days" with 100+ feeds), the handler returns a partial-success
state (whatever items did land) and the operator narrows scope.
That's the rare case. We add a worker only if it stops being rare.

### Story formation (replaces cluster formation as the terminal step)

After items are filtered + inserted, the existing `preCluster` +
story-match pass runs as today, BUT the output is different:

- **Cluster forms** → look for an existing `story` whose keywords
  overlap above threshold (40%) — **unbounded, no time window, no
  recency cap**. Replaces today's top-200-most-recent-articles match
  (`STORY_MATCH_CANDIDATE_LIMIT = 200` at
  `web/src/lib/pipeline/story-match.ts:44`, query in
  `loadStoryMatchCandidates` at `:107`). If one exists, attach
  the cluster's items as new `story_observations` on that story.
  `last_observed_at` bumps. (Source/observation counts are
  computed via `COUNT(*) OVER` at read time — no denormalized
  counter columns; see § Schema reshape.)
- **No matching story** → create a new `story` row, generation_state
  = 'forming'. The cluster's items become the first observations.

A story stays attachable forever — that's the persistent-story
promise. Add an index on `stories.keywords` (GIN array index) so the
unbounded match stays fast.

This is what gets you cross-day tying. Day 1 CNN forms the story.
Day 3 Fox covers it; the keyword overlap pulls it into the same story
as a new observation. Day 5 BBC adds the international angle; same
story, third source. Story Manager shows one story with three
observations on a timeline, not three separate clusters. **Years
later** a new article on the same topic still attaches to the
original story.

### Search-API as a fourth consumer — Wikipedia only

A new `feed_type = 'search_api'`. One row to start: the MediaWiki API.
Free, no auth, generous fair-use rate limit. Per-row
`extraction_config`:

```jsonc
{
  "provider": "wikipedia",
  "endpoint": "https://en.wikipedia.org/w/api.php",
  "default_params": { "format": "json", "action": "query" }
}
```

When a Run Feed click fires in topic mode, the AI plan's
`wikipedia_topics` list is fetched against the MediaWiki API and the
returned page summaries flow into `discovery_items` just like RSS
items. Same story-formation flow downstream.

Wikipedia is encyclopedic, not news — strong for evergreen / research
queries ("info about tigers", "WW2 battles", "Amelia Earhart"),
useless for breaking news. If breaking-news topic queries become
limiting later, add a paid news-search vendor (Brave / Tavily / etc.)
as a second `search_api` row without schema changes.

---

## Result screen (no separate library route)

The AI grab plan emits a small structured output:

```jsonc
{
  "keywords": [...],
  "wikipedia_topics": [...],
  "negative_keywords": [...]
}
```

`negative_keywords` is what disambiguates "Tigers (animal)" from
"Tigers (band)" or "Detroit Tigers" — the case the operator hits
within the first week of using Topic mode. The handler applies it
as a simple exclusion pass against title + excerpt.

(Originally drafted with `target_category_id` + `target_subcategory_id`
+ `source_preference` fields; both dropped 2026-05-04 — without
`/admin/research-library` and with a flat result screen, no consumer
read those fields. Smaller prompt, cheaper Haiku call.)

`discovery_items` ALTER ends up tiny — one column:

```
discovery_items
  ...existing columns...
  research_job_id      uuid FK research_jobs (nullable for
                                              pre-redesign rows)
```

(No `category_id` / `subcategory_id` — no consumer left after the
library route + grouped result screen were dropped. No `discarded_at`
— Discard is a hard delete; the 90-day cleanup is the safety net.)

### Promotion flow (from the result screen)

The result screen is a flat sortable table — one row per
`discovery_item` the job produced. Columns: outlet, title, fetched
date, source class badge, match score. Each row has:
- **Promote** → attaches the item to a story (existing via unbounded
  keyword match, or new story formed)
- **Discard** → hard-deletes the `discovery_items` row

Items not promoted in the current session stay until the 90-day
cleanup catches them.

**Post-promote visual contract (no navigation jump):**
- The row's "Promote" button is replaced inline with `Attached to →
  [story title]` linking to the story drawer.
- A toast confirms: "Attached to story X" or "New story Y formed."
- Operator stays on the result screen, keeps triaging the rest.

### Retention

`discovery_items` rows attached to a `story_observation` are
retained indefinitely. Rows that never matched a story get cleaned
up after 90 days by the existing `pipeline-cleanup` cron. To
preserve an item beyond 90 days, the operator promotes it to a
story (which can be locked immediately if the operator isn't ready
to write yet).

---

## /admin/newsroom Discovery tab — Stories list rebuild

This rebuild replaces the current Discovery cluster list at
`web/src/app/admin/newsroom/page.tsx` (cluster list, hard-limited to 50
at line 342, no pagination wired — `cursor` is fetched but unused).

**`/admin/story-manager` is NOT touched** — that route is a
single-article editor wrapping `StoryEditor`
(`web/src/app/admin/story-manager/page.tsx:13-21`) and stays as-is.

The Discovery tab list changes from "list of feed_clusters from the last
6 hours" to "list of stories, persistent." Pagination / infinite scroll
is required since stories accumulate beyond the current 50-item ceiling.

### Stories list

Each row shows:
- Title
- Per-AudienceCard generation status (adult / tweens / kids — all
  three rendered per current model)
- First-seen date + last-observed date (so the operator sees a 5-day-old
  story that gained a new observation today)
- Source count (distinct outlets) — computed via `COUNT(DISTINCT
  feed_id)` over `story_observations`, no denormalized counter
- Observation count (total pickups) — `COUNT(*)` over
  `story_observations`
- generation_state: forming / ready / generating / published / archived

(No "X new since you last looked" badge — read state dropped.
No padlock UI badge for v1 — the `is_locked` column ships and is
read on the hot match-exclusion path, but the visual badge + click-
to-unlock UI defers to v1.1 once a real zombie attractor appears.)

Filters:
- By research_query (so the operator can see "all stories from my WW2 query")
- By date range (first-seen)
- By generation_state
- (No audience filter — stories are audience-neutral; no feed_group
  filter — feed groups dropped 2026-05-04.)

### Story detail (drawer / modal in the Discovery tab)

Open a story → see:
- Title, keywords
- **Observation timeline** (chronological, by `observed_at`):
  - Each row is one source pickup with outlet, headline, excerpt,
    URL, match_score, source_class badge.
  - Each pickup links to the original URL (snapshot — survives feed
    deletion).
  - (No multi-select Detach UI for v1 — `story_observations.detached_at`
    column ships as cheap insurance, but the multi-select toolbar
    defers to v1.1. False-attach is rare; a wrong observation that
    never gets cited at generation time does no harm.)
- Article controls: Generate / Reject / Archive.
- (No Lock UI for v1 — `stories.is_locked` column ships and is
  honored by the auto-attach pass; visible toggle defers until a
  real zombie attractor appears in production.)
- Once published, the article appears with its `article_sources` list
  (immutable provenance — every URL cited, with outlet snapshot).

### Cross-source tying examples

**Day 1**: CNN runs "Pentagon awards $X contract for AI." Story #492
forms. One observation.

**Day 3**: Fox runs "DoD AI deal raises ethics concerns." Keyword
overlap with story #492's keywords; observation attaches. Story now
has 2 sources, 2 observations.

**Day 5**: BBC adds international angle on the same contract.
Observation 3 attaches.

**Day 7**: Operator clicks Generate on story #492. The article cites
all three. `article_sources` snapshots all three URLs + outlet names
+ excerpts permanently. From this point, even if Fox feed gets removed
from `feeds`, the article still credits Fox forever.

---

## Source provenance — the receipts layer

The owner-stated rule: "if we ever used a source and tied it to an
article we aren't removing it from our reputation."

### What "permanent" means

- A row in `article_sources` is **no-delete at the application layer**.
  No DELETE endpoint. RLS denies DELETE outside controlled migrations.
  UPDATE is allowed (admins can fix typos in `outlet_snapshot` /
  `title_snapshot`).
- Snapshot fields (`url_snapshot`, `outlet_snapshot`) are NOT NULL.
  The article can survive any churn in the source layer.
- The `feed_id` FK is informational only — even if the feed is
  soft-deleted (or hard-deleted in some future cleanup), the article's
  citation is intact.
- `feeds` cannot be hard-deleted while any `article_sources` references
  the feed. The DB constraint blocks it. Soft-delete is the only path.

### Operator-visible provenance

A standalone admin view at `/admin/sources` (NOT a tab in
`/admin/feeds` — surface separation: feeds page manages the live feed
list, sources page is the historical receipts log) shows:
- Every URL Verity Post has ever cited
- Which articles cited each URL
- Which feed (if any, current or historical) the URL came from
- Outlet attribution
- Date first cited

**Default sort + filters (load-bearing — table will hit thousands of
rows fast):**
- Default sort: `created_at DESC`.
- Header filters: outlet name (text search), date range (first
  cited).
- CSV export of the current filter (audit value).
- (Source-class filter, feed-status filter, view toggle, free-text
  URL search dropped 2026-05-04 in the fourth trim sweep — start
  with two controls and revisit when the table actually has
  thousands of rows and operators are hunting in it. See § Stream
  F below for the canonical filter set.)

This is the public-facing ethics receipt — "every link we've ever used
to write an article is on file."

### Ingest-side provenance

Even before article generation, every `story_observation` carries the
same snapshot fields. So even if a story is never published, the
historical record of "we considered these sources for this topic" is
intact.

---

## Saved queries

Operator-typed topic prompts persist in `research_queries` and
surface in the Run Feed panel as a dropdown. Four columns total:
`id`, `name`, `query_text`, `created_at`.

Examples the operator might save:

- "Tigers + big cats + jungle animals" — used to refresh the kids
  section monthly.
- "WW2 + battles + key figures" — historical features.
- "Amelia Earhart + Artemis program" — one-off but worth saving for
  future recurrence.

(For lookback-only bookmarks like "Breaking — last 15 minutes",
the operator browser-bookmarks the URL with `?lb=15m&fid=…`.
"Saved Presets" as a UI concept was dropped 2026-05-04.)

**Management surface:** inline pencil/trash icons on each dropdown
row. Click pencil → in-place text edit. Click trash → hard delete
(no soft-delete — audit lineage survives via the snapshot pair on
`discovery_runs`). No drawer, no separate route, no soft-delete
dance. ~5-20 saved queries; this is a low-frequency task that
doesn't earn ceremony.

A `discovery_run` records which `research_query` (or general mode)
drove it via the FK (`ON DELETE SET NULL`) AND snapshots
`query_name_snapshot` + `query_text_snapshot` at run time, so
historical attribution is preserved even after the query is
renamed, edited, or hard-deleted.

---

## Audience handling

A story can be written up for any combination of three audiences —
adult, tweens, kids — independently. One story → up to three articles,
one per band, each generated on its own AudienceCard click. That's
the production three-band model and it does not change.

**Run Feed is fully audience-neutral.** No audience filter, no
audience hint on saved queries, no audience stamp on `discovery_runs`,
no audience tag on stories. Audience only matters at the AudienceCard
click downstream — which uses today's existing call shape:

- The route at `generate/route.ts:128` takes
  `audience: 'adult' | 'kid'` + `age_band: 'kids' | 'tweens'`.
- band `adult` → `audience='adult'`, `age_band` ignored
- band `tweens` → `audience='kid'`, `age_band='tweens'`
- band `kids` → `audience='kid'`, `age_band='kids'`
- The kid-safety LLM filter (`generate/route.ts:1004`,
  `audience_safety_check`, Haiku-backed) fires unconditionally when
  `audience === 'kid'`, covering both kid bands.

Stories produced by any run can be written up for any band later.
Three-band AudienceCard rendering on each cluster (today's model)
is preserved.

---

## What stays the same

The Phase A/B/C backbone is preserved verbatim:

- Three-bucket feed fanout (RSS / scrape_html / scrape_json) in parallel
- Per-feed health writeback (last_polled_at, error_count, last_error)
- Singleflight enforcement via `pipeline_runs_singleflight_ingest`
  partial unique index
- In-route orphan-reaper for stale Vercel-killed runs
- HTTP 409 on collision with `runningRunId` in body
- Kill-switch via `settings.ai.ingest_enabled`
- Rate limit (5 per 600s per actor)
- Article-URL heuristic in `scrape-discovery.ts`
- env-var allow-list + per-vendor host binding in `extraction-config.ts`
- Audit-log redaction in `redactExtractionConfigForAudit`
- `/admin/feeds` rebuild contract (soft-delete + restore-on-re-add,
  Items/24h, Items/7d, Type column, Reclassify wizard)
- `/admin/feeds` default filter chip 'all' (1:1 with public.feeds)
- `articles.source_url` + `articles.source_feed_id` (already snapshotted
  at publish time via `2026-04-28_persist_timeline_lenient_date.sql:138`
  — `article_sources` extends, does not replace)
- `audience_safety_check` step on kid generation
  (`web/src/app/api/admin/pipeline/generate/route.ts:1004`)
- `pipeline_costs` + `reserve_cost_or_fail` daily-cap RPC
  (`call-model.ts:309`, `2026-04-28_pipeline_cost_reservations.sql:46`)
- `pipeline.story_match_overlap_pct` setting key
  (`web/src/lib/pipeline/story-match.ts:149`) — existing knob, just
  re-tuned for the new story-extension flow

The redesign **adds** layers on top. Nothing in Phase A/B/C is rolled back.

---

## Streams of work

The redesign breaks into shippable streams. There are **no per-stream
feature flags** (single operator + single-week build = ship the
branch). The hard ordering: A1 unlocks everything; B + C extend the
existing handler; D / E consume B + C. Stream G (Python worker) and
Stream H (research-library route) are both vacated.

### Stream A1 — Schema migration

- Create five NEW tables: `research_queries`, `discovery_runs`,
  `story_observations`, `article_sources`, `research_jobs`.
  (Originally drafted as eight; `feed_groups`, `feed_group_members`,
  and `story_read_state` were dropped 2026-05-04.)
- ALTER existing `stories` table to add new columns: `keywords`,
  `first_seen_at`, `last_observed_at`, `generation_state`,
  `research_query_id`, `is_locked`. Six columns. (`stories` is
  **already live** with `slug` + `title` + the timeline
  `type='article'` / `type='event'` integration — do not recreate.
  Trims locked 2026-05-04: no `total_observations`/`total_sources`
  counters, no `deleted_at`, no `metadata`.)
- ALTER `discovery_items` to add ONE column: `research_job_id`
  (FK research_jobs, nullable for pre-redesign rows). (`category_id`,
  `subcategory_id`, `discarded_at`, `pinned_at` all dropped
  2026-05-04 — no consumers after the result-screen flat redesign.)
- GIN index on `stories.keywords` for unbounded story-match lookup.
- Partial unique index `research_jobs_singleflight ON research_jobs
  ((true)) WHERE status = 'running'` — at most one running row.
- Settings seed for `pipeline.story_match_overlap_pct` deferred —
  existing code fallback (`THRESHOLD_FALLBACK = 0.4` at
  `story-match.ts:139`) already returns 40% silently. Add the
  seeded row when the operator wants to tune from the admin UI.
- Keep existing `feed_clusters`, `sources`, `articles.source_url`,
  `articles.source_feed_id`, `articles.story_id`, `timelines`
  untouched. Story formation reads `feed_clusters` as input and
  writes `stories` + `story_observations` as output. `sources` stays
  as the editor-mutable citation list; `article_sources` is the new
  no-delete provenance log.
- Add ON DELETE RESTRICT on `feeds.id` from any table that snapshots
  source attribution. (Belt-and-suspenders — soft-delete-only on
  `feeds` is already enforced by convention via
  `supabase/migrations/20260504140000_feeds_soft_delete.sql`.)
- RLS on `article_sources`: blanket DENY UPDATE + DELETE except
  `service_role`. INSERT allowed for service_role. (Originally
  drafted with column-level UPDATE on `title_snapshot` only via a
  trigger; simplified 2026-05-04 to blanket deny — stricter, not
  weaker; revisit when a real typo correction is needed and ship
  the column-level trigger then.)
- Polling cron exclusion: existing `feeds` polling cron must
  `WHERE feed_type != 'search_api'` so Wikipedia rows don't get
  polled (they're pulled on demand by the ingest handler).
- Regenerate `web/src/types/database.ts`.

### Stream A2 — Backfill + retention

- No backfill of `article_sources` for pre-redesign articles. Existing
  published articles are placeholders; the receipts log starts fresh
  from the redesign ship date forward.
- Update PATCH `/api/admin/articles/[id]` to write the
  `article_sources` log AFTER the existing `sources` delete-and-reinsert
  (`route.ts:560`), with `ON CONFLICT (article_id, url_snapshot) DO
  NOTHING`.
- 90-day age-based cleanup + observation-attached exemption rule
  deferred — existing `pipeline-cleanup` cron only deletes orphan-
  state rows, not aged rows. At launch volume `discovery_items`
  won't grow meaningfully. Ship both rules together when the table
  actually needs aging.

### Stream B — Extend the existing handler

`POST /api/newsroom/ingest/run` keeps doing the work synchronously.
Stream B is the inline pipeline upgrade: grab plan + new data shape
+ unbounded story matching + final transaction. No new service.

- Body parse for `lookbackMs`, `feedIds`, `query.text`, `queryId`.
  (No `audience`, no `feedGroupIds`, no `matchMode` — all dropped.)
- Source-scope resolution: validate `feedIds` against active
  `feeds` rows; empty → all active.
- Singleflight stays as today's `pipeline_runs_singleflight_ingest`
  partial unique index pattern, plus a parallel index on
  `research_jobs WHERE status='running'`. Concurrent click → 409
  with the existing `runningRunId` toast.
- Insert `research_jobs` row, `status='running'`, `started_at=now()`.
- New TS module `web/src/lib/pipeline/grab-plan.ts` — one Haiku call
  via the existing `call-model.ts` path with `reserve_cost_or_fail`
  guarding the call. Output structure: `keywords`,
  `wikipedia_topics`, `negative_keywords`. JSON-mode response.
  Retry once on parse failure; second failure → handler exits with
  `research_jobs.status='failed'`, `error='grab_plan_failed'`.
- Replace hardcoded `oneDayAgo` (`route.ts:589`) + `SIX_HOURS_MS`
  (`route.ts:717`) with `lookbackMs` from the request body. Single
  knob, both windows.
- Phase A/B/C parallel fanout unchanged (RSS + scrape_html +
  scrape_json), plus a fourth source class added by Stream C
  (Wikipedia).
- Apply the grab plan deterministically against fetched items.
  Title + excerpt keyword include pass; then `negative_keywords`
  exclusion pass. Both run BEFORE `discovery_items` insert.
- Phase tracking: write `research_jobs.phase` once per phase
  boundary (`planning` → `fetching` → `forming` → `finalizing`).
  4 writes per run, no per-percent updates. UI polls the column
  every 2s while the request is in flight to render the current
  phase label.
- Cancel checkpoint: between each phase, `SELECT status FROM
  research_jobs WHERE id = $1` — if `'cancelled'`, abort cleanly,
  keep what landed, write the audit row.
- Story formation: replace `loadStoryMatchCandidates` (top-200
  articles) with the unbounded `stories.keywords` GIN-index match.
  Reuses the `pipeline.story_match_overlap_pct` setting (40%, code
  fallback). On NEW story formation: `keywords` = union of
  (founding article's `seo_keywords` + `tags`) ∪ (originating
  cluster's keywords), deduped, set ONCE. (Re-run on every new
  observation deferred to v1.1 — recompute happens at article-
  generation time when we're already in the LLM context.)
- Final transaction in one DB tx:
  - `UPDATE research_jobs SET status='done', finished_at=now(),
    items_fetched=…, items_kept=…, stories_formed=…,
    stories_extended=…`
  - `INSERT INTO discovery_runs(...)` with `query_name_snapshot` +
    `query_text_snapshot` taken from the `research_queries` row at
    job-start time, so audit survives later rename / hard-delete.
  - On any worker-step exception, the catch block writes
    `status='failed'` + the error string and still inserts the
    `discovery_runs` audit row (with whatever counters did land).
- Existing in-route orphan-reaper (Phase C) recovers stale
  `running` rows from Vercel-killed runs — no separate sweep job.

### Stream C — Wikipedia search consumer

- New TS module `web/src/lib/pipeline/wikipedia-search.ts`.
  Silent-fail contract — failures don't block the run.
- New `feed_type='search_api'` row, one only, pointing at MediaWiki.
- Per-row `extraction_config`:
  `{ "provider": "wikipedia", "endpoint": "https://en.wikipedia.org/w/api.php" }`.
- Free, no auth, no env-var work.
- Hooks into the grab plan's `wikipedia_topics` list — fetches each
  page's summary via `action=query&prop=extracts` (parallel `fetch`
  calls) and feeds it into `discovery_items` like any other source.
- The polling cron WHERE clause from Stream A1 skips
  `feed_type='search_api'` rows so Wikipedia isn't polled on the
  normal feed schedule.

### Stream D — Operator UI (Run Feed redesign)

- /admin/newsroom Discovery tab gets the Research panel:
  - Lookback dropdown (7 options) — URL param `?lb=`
  - Source-scope picker (All / Custom multi-select) — URL param
    `?fid=` (feed ids, comma-sep)
  - Mode toggle (General / Topic) with text input + saved-queries
    dropdown when Topic is selected — URL params `?mode=`, `?q=`, `?qid=`
  - **No match-mode picker** — single mode (AI plans, handler executes)
  - **No audience toggle** — audience is per-AudienceCard at generation
    time per current model
  - **No feed-group picker** — dropped 2026-05-04
- Run Feed button POSTs the new body shape. The handler runs
  synchronously and either:
  - Returns the result inline (typical 25-35s). UI shows a phase-
    label spinner ("Planning…", "Fetching feeds…", "Forming
    stories…") that polls `research_jobs.phase` every 2s. Handler
    writes the phase string ONCE per phase boundary (3-4 writes
    total per run) — enough for the operator to see "still working"
    vs "stuck" without flooding writes.
  - Returns 409 if another run is already `running` (existing Phase C
    `runningRunId` toast).
- On response, the panel flips to the **result screen** described in
  § Typical session flow (counters + flat sortable item table +
  Promote / Discard per row + View Stories CTA).
- **Cancel mid-run:** Cancel button writes
  `research_jobs.status='cancelled'`. Handler checks the row between
  phases (4 checkpoints total) — next checkpoint sees the flip and
  aborts cleanly, writing whatever items already landed plus the
  audit row. Cancel is real cost protection on the rare big-scope
  run that would otherwise eat the daily cost cap.
- (Recent jobs tab dropped 2026-05-04 — `research_jobs` table still
  ships for singleflight + audit, no UI render. Re-running a query
  from the saved-queries dropdown is one click.)
- **Saved-queries management:** inline pencil/trash icons on each
  dropdown row. Click pencil → in-place text edit. Click trash →
  hard delete (audit lineage survives via the snapshot pair on
  `discovery_runs`). No separate drawer.

### Stream E — Discovery tab Stories list rebuild

(Renamed from "Story Manager rebuild" — the surface being rebuilt is
`/admin/newsroom` Discovery tab, not `/admin/story-manager`.)

- Stories list view with the new filter set: research_query, date
  range (first-seen), generation_state. **No audience filter**
  (stories are audience-neutral); **no feed_group filter** (groups
  dropped); **no read-state badge** (single operator).
- Source count + observation count rendered via `COUNT(*)` over
  `story_observations`; no denormalized counter columns on `stories`.
- Story detail drawer with observation timeline (read-only in v1).
- Manual attach via Promote button on any result screen.
- Generate / Reject / Archive controls per story.
- Detach UI + Lock UI deferred to v1.1; underlying columns
  (`story_observations.detached_at`, `stories.is_locked`) ship in
  Stream A1 as cheap insurance.

### Stream F — Provenance UI

- `/admin/sources` standalone page (NOT a tab in `/admin/feeds` —
  surface separation: feeds page manages the live feed list; sources
  page is the historical receipts log) showing every URL ever cited.
- Default sort `created_at DESC`. Header filters: outlet (text
  search) + date range (first-cited).
- **CSV export of the current filter** — load-bearing for "show me
  every CNN article you've cited" requests once the redesign is
  visible to the public; ~20 lines, ships with v1.
- (Source-class filter, feed-status filter, view toggle, free-text
  URL search dropped 2026-05-04 — start with three controls; revisit
  when the table actually has thousands of rows and operators are
  hunting in it.)
- Public-facing surfacing of `article_sources` on the article reader is
  out of scope (per § Out of scope at the bottom of this doc).
- (Schema-level no-DELETE + DENY UPDATE enforcement, ON DELETE
  RESTRICT FKs are part of Stream A1 above.)

### Stream G — REMOVED (no Python worker)

Decided 2026-05-04: the redesign does NOT add a Python worker
service. All ingest logic stays in the existing Next.js handler.
See § Architecture — extend the existing handler, no new service.

### Stream H — REMOVED (no separate library route)

Decided 2026-05-04: the redesign does NOT add a `/admin/research-library`
route. The result screen on the Discovery tab is the only library
surface. Categorization on `discovery_items` was also dropped in
the second trim sweep — the grab plan no longer emits
`target_category_id` / `target_subcategory_id`, and the columns
were never added.

---

## Decisions the owner needs to make before any of this ships

These are the open questions where the design has multiple defensible
answers; each one needs an owner call.

Closed by code review (no longer questions):

- ~~Audience cross-pollination~~ — closed. Stories are
  audience-neutral; AudienceCard picks at Generate time, matching the
  current three-band model.
- ~~Saved-queries scope (personal vs team)~~ — closed.
  `admin.newsroom.view` is granted only to `admin` + `owner`
  permission sets; one admin account today, so personal == team.
  Implement as a single shared list.
- ~~Story-formation overlap threshold~~ — partially closed. The knob
  already exists as `pipeline.story_match_overlap_pct`
  (`web/src/lib/pipeline/story-match.ts:149`); the question is just
  what value to set it to (default proposal: 0.60).
- ~~Cost telemetry / cap infrastructure~~ — closed. Reuse
  `pipeline_costs` + `reserve_cost_or_fail`. Only the per-run item
  ceiling is new (Q3 below).
- ~~`article_sources` correction policy~~ — closed (Phase A Q1,
  2026-05-04). UPDATE allowed for admin typo corrections; DELETE
  denied except `service_role`.
- ~~`article_sources` snapshot fidelity~~ — closed (Phase A Q2,
  2026-05-04). URL + outlet + title + fetched_at only; no
  `cited_excerpt`, no `cite_position`.
- ~~Backfill of `article_sources` for existing articles~~ — closed
  (Phase A Q3, 2026-05-04). No backfill; pre-redesign articles are
  placeholders, receipts log starts fresh.

Closed by Phase B Q&A (2026-05-04):

- ~~Match-mode default~~ — closed. Single mode: **AI plans, handler
  executes.** One Haiku call per Run Feed click translates the
  operator's natural-language prompt ("info about the animal tigers")
  into a structured grab plan (keywords, Wikipedia topics, source
  preferences). The Next.js handler applies the plan deterministically
  to fetched items. No per-item LLM calls. The four-mode picker
  (keyword/semantic/hybrid/llm_filter) collapses to one mode.
  (Originally drafted as "Python executes" — reversed 2026-05-04
  with the worker drop. Same logic, different language; same Haiku
  call cost.)
- ~~Search-API vendor~~ — closed. **Wikipedia only.** One
  `search_api` feed row using the MediaWiki API (free, no auth).
  Brave / Tavily / Bing / SerpAPI dropped. Tradeoff: Wikipedia is
  encyclopedic, not news — breaking-news topic queries hit RSS feeds
  only, not the wider web. Add a paid news-search vendor later as a
  second `search_api` row if this becomes limiting.
- ~~Per-run item ceiling~~ — closed. **No cap.** No
  `settings.research.max_items_per_run`. Daily $ cap via existing
  `reserve_cost_or_fail` is the only ceiling; per-run cost is now
  ~$0.005 (one Haiku planning call), so the daily cap rarely matters.
- ~~Story-extension lookback~~ — closed. **Unbounded.** Match new
  clusters against ALL stories ever, not a time window or recency
  cap. Replaces today's top-200 recency rank
  (`STORY_MATCH_CANDIDATE_LIMIT = 200` at
  `web/src/lib/pipeline/story-match.ts:44`, applied in
  `loadStoryMatchCandidates` at `:107`). Add an index on story
  keywords for fast lookup. A story stays attachable forever — that's
  the persistent-story promise. **Owner-locked 2026-05-04:** no
  staleness floor or per-story observation cap; a story posted today
  can pick up a relevant article 3+ years from now and surface that
  on the timeline. Operator's only mitigation against zombie
  attractors is the manual `is_locked` flag (Stream E).
- ~~Story-match overlap threshold value~~ — closed. **40% (keep
  current).** No change to `pipeline.story_match_overlap_pct = 40`.
  Revisit if false attaches show up after unbounded matching ships.

Closed by Phase C Q&A (2026-05-04):

- ~~Python worker hosting~~ — **REVERSED 2026-05-04 (post-review).**
  No Python worker. Ingest stays inline in the existing Next.js
  handler. See § Architecture — extend the existing handler, no new
  service. Stream G is intentionally vacated.
- ~~Job progress to UI~~ — closed. **2-second polling** on the
  `research_jobs.progress` field while the request is in flight (for
  long runs). No Realtime wiring.
- ~~Job concurrency~~ — **REVERSED 2026-05-04 (post-review).** No
  queue. Singleflight is the existing Phase C
  `pipeline_runs_singleflight_ingest` partial unique index — second
  click while one is `running` returns 409 with the existing
  `runningRunId` toast. Stack-and-run was justification for the
  worker; the worker is gone, so is the queue.
- ~~`research_jobs` retention~~ — closed. **30 days.** Cleanup cron
  deletes completed/failed/cancelled jobs older than 30 days.
  Permanent audit lives in `discovery_runs` (indefinite).
- ~~Category assignment~~ — **REVERSED 2026-05-04 (fourth pass).**
  Grab-plan classification (`target_category_id` + `target_subcategory_id`)
  dropped along with `/admin/research-library` and grouped result
  screen — no consumer remains. Categorization happens at article-
  generation time as today.
- ~~`stories.keywords` source on new story formation~~ — closed.
  **Both, deduped.** Union of (founding article's `seo_keywords` +
  `tags`) ∪ (originating cluster's keywords). **Set ONCE at
  formation; recompute happens at article-generation time, not on
  every new attach.** (Re-run-on-attach was originally locked but
  deferred to v1.1 in the fourth pass — recompute is free when the
  LLM context is already loaded for generation.)
- ~~Backfill `stories.keywords` for existing stories~~ — closed.
  **Skip.** Existing stories are placeholders; new keywords column
  populates only from the redesign ship date forward.
- ~~Grab-plan failure handling~~ — closed. **Retry once, then fail.**
  Second-attempt failure sets `research_jobs.status='failed'` with
  the error; operator re-runs by clicking Run Feed again with the
  same query.
- ~~`feed_clusters` keep or drop~~ — closed. **Keep.** Clusters
  remain the intermediate "ready to generate" surface. Each cluster
  renders as a card with three AudienceCards (adult / tweens / kid).
  On Generate, article persists and attaches to a story (existing
  via unbounded keyword match, or new story formed).

Closed by post-review Q&A (2026-05-04, second pass):

- ~~Audience model alignment~~ — closed. **One story → up to three
  articles.** Run Feed is fully audience-neutral; no audience
  columns on `research_queries`, no `discovery_runs.audience`. The
  generate-route call shape stays `audience: 'adult' | 'kid'` +
  `age_band: 'kids' | 'tweens'`; translation happens at call time
  (see § Audience handling). (Originally drafted with hint columns
  on the new tables; columns dropped 2026-05-04 as part of the
  trim sweep — they were never going to be read.)
- ~~`article_sources` UPDATE policy~~ — closed. **Title typos only.**
  RLS allows admin UPDATE on `title_snapshot` only;
  `outlet_snapshot`, `url_snapshot`, `fetched_at`, `feed_id` are
  immutable from insert. Outlet rewrites are not in the trust
  contract for the public ethics receipt.
- ~~Mega-story zombie-attractor cap~~ — closed. **No cap.** No
  staleness floor, no max-observation-age. The 3-year revival case
  is the feature: post a story today, surface a related article
  three years from now on its timeline. Mitigation if a real zombie
  attractor emerges = manual `is_locked` flag.
- ~~Saved-query rename behavior~~ — closed. **Snapshot, don't
  prohibit.** The handler writes `query_name_snapshot` +
  `query_text_snapshot` onto `discovery_runs` at job-start time, so
  historical audit survives any later rename / edit / soft-delete
  of the source query.
- ~~Python worker — keep or drop~~ — closed. **Drop.** Phase C had
  Fly.io / FastAPI / Python port locked in. Owner pushback
  2026-05-04: ingest already happens in TypeScript today and works;
  realistic Run Feed budget is 25-60s, well under Vercel's 300s cap;
  the worker added a new language + new service + new deploy target
  for a ceiling we don't actually need. All ingest stays inline.
  The data model + grab plan + new UI are unaffected.

Closed by trim sweep (2026-05-04, third pass — owner ask "what else
can we trim that's not necessary"):

- ~~`feed_groups` + `feed_group_members` tables~~ — **dropped.**
  Single operator + ~93 feeds + multi-select Custom scope covers the
  same use case. Add later if a real need emerges; pure additive
  migration with no callsite churn.
- ~~`/admin/research-library` route~~ — **dropped.** The result
  screen on the Discovery tab covers item-level triage at zero
  extra UI cost. Three-pane left-rail category tree doesn't earn
  its keep for a single operator. (In the fourth pass, the
  `category_id` / `subcategory_id` columns themselves were also
  dropped — no consumer remained.)
- ~~Saved Presets concept~~ — **dropped.** Lookback-only bookmarks
  are URL params; the operator browser-bookmarks them. UI no longer
  splits the saved-queries dropdown into two groups; `query_text`
  is NOT NULL.
- ~~`discovery_items.pinned_at`~~ — **dropped.** Saving a
  "researched but not yet written" item past 90 days = manually
  create a story with `is_locked=true` and Promote the item to it.
  One column gone, one cleanup-cron exemption rule gone.
- ~~Audience hints on saved queries / `discovery_runs.audience`~~ —
  **dropped.** The hint did nothing — explicitly documented as
  "does not restrict story formation, item matching, or which
  AudienceCards render." A column nothing reads is just data debt.
- ~~`story_read_state` table + "X new since you last looked"
  badge~~ — **dropped.** Single operator who just clicked Run Feed
  knows what's new. Sort by `last_observed_at` covers the rare case.
- ~~`research_queries.match_mode` column~~ — **dropped.** Single
  mode locked (AI plans, handler executes). Future modes don't
  exist yet; column would only ever hold one value.
- ~~Per-stream feature flags~~ — **dropped.** Single-week build
  ships on a branch and merges; no gradual-rollout need across
  multiple operators or weeks.

Closed by trim sweep (2026-05-04, fourth pass — three-agent
schema/UI/MVP review):

- ~~All `metadata` jsonb columns (`stories`, `research_queries`,
  `story_observations`)~~ — **dropped.** Never read by any
  callsite. Add a real column when a real field is named.
- ~~`research_queries.created_by` + `last_used_at` + `total_runs` +
  `deleted_at`~~ — **all dropped.** Single operator (no created_by
  needed). UI doesn't render counters yet — compute from
  `discovery_runs` if the dropdown ever wants popularity sort.
  No `deleted_at` because `discovery_runs.query_name_snapshot` +
  `query_text_snapshot` carry historical lineage even after hard
  delete.
- ~~`discovery_runs.feed_ids uuid[]`~~ — **dropped.** Duplicates
  `research_jobs.request_body.feedIds`.
- ~~`article_sources.story_id` FK~~ — **dropped.** No direct-cite
  path that bypasses a story; reach via `articles.story_id`.
- ~~`stories.total_observations` + `total_sources`~~ — **dropped.**
  `COUNT(*) OVER` is fast at small scale; revisit at 10k+ stories.
- ~~`stories.deleted_at`~~ — **dropped.** No "Delete story" UI in
  scope; `generation_state='archived'` covers hide.
- ~~`discovery_items.category_id` + `subcategory_id`~~ — **dropped.**
  No consumer left after the library route + grouped result screen
  were dropped. `discovery_items` ALTER ends up adding only one
  column: `research_job_id`.
- ~~`discovery_items.discarded_at`~~ — **dropped.** Discard is a
  hard delete; 90-day cleanup is the safety net.
- ~~Grab plan `target_category_id` + `target_subcategory_id`~~ —
  **dropped.** No consumer after category columns went.
- ~~Grab plan `source_preference`~~ — **dropped.** Never exercised;
  remove a hallucination surface.
- ~~Result-screen nested category groups + bulk recategorize
  toolbar~~ — **dropped.** Flat sortable table with Promote /
  Discard per row.
- ~~Recent jobs tab UI~~ — **dropped.** `research_jobs` table still
  ships for singleflight + audit; no UI render. Re-running a query
  is one dropdown click.
- ~~Saved-queries management drawer~~ — **dropped.** Inline
  pencil/trash icons on each dropdown row.
- ~~`/admin/sources` filter set (source-class, feed-status, view
  toggle, URL search)~~ — **dropped.** Three controls only at v1:
  outlet text search + date range + default sort + CSV export.
- ~~Detach UI (multi-select + toolbar)~~ — **deferred.** Column
  `story_observations.detached_at` ships as cheap insurance; the
  multi-select toolbar defers to v1.1.
- ~~Lock UI badge + click-to-unlock~~ — **deferred.**
  `stories.is_locked` column ships and is read on the hot match-
  exclusion path; visible badge defers until a real zombie
  attractor surfaces.
- ~~`pipeline-cleanup` cron 90-day age rule + observation-attached
  exemption~~ — **deferred.** Existing cron deletes orphan-state
  rows only, not aged rows. Ship both rules together when the
  table actually needs aging.
- ~~Settings seed for `pipeline.story_match_overlap_pct`~~ —
  **deferred.** Code fallback (`THRESHOLD_FALLBACK = 0.4`) returns
  40% silently. Seed when operator wants to tune from admin UI.
- ~~`stories.keywords` re-run on every new observation attach~~ —
  **deferred.** Set ONCE at story formation; recompute at article-
  generation time when LLM context is already loaded.
- ~~Column-level UPDATE policy on `article_sources.title_snapshot`~~ —
  **deferred.** v1 ships blanket DENY UPDATE (service_role only);
  add the title-only trigger when a real typo correction is needed.
  Stricter, not weaker.

What still survived (the real load-bearing layer):
- 5 new tables, 6-column `stories` ALTER, 1-column `discovery_items`
  ALTER.
- 30-day `research_jobs` cleanup cron.
- `article_sources` permanent provenance with blanket DENY UPDATE.
- `story_observations` cross-day source tying.
- Unbounded story matching against `stories.keywords` GIN.
- AI grab plan with `keywords` + `wikipedia_topics` +
  `negative_keywords`.
- Wikipedia consumer (Stream C).
- Multi-select feed picker for Custom scope.
- Cancel mid-run button (cost protection on big-scope runs).
- Phase-label progress polling (4 writes per run).
- CSV export on `/admin/sources`.
- `is_locked` + `detached_at` columns ship even though their UI
  defers — cheap insurance, feature ships additive.

No open questions remain at the design level. Implementation follows.

---

## Cross-platform

Web admin only. iOS adult and Kids iOS read the published articles
that come out of this pipeline; they don't care about the operator
controls. No iOS work in scope for any stream.

---

## Out of scope for the redesign

Nothing in the Phase A/B/C ship gets rolled back. Specifically:

- `/admin/feeds` rebuild stays as-shipped (soft-delete UI, Items
  columns, Type badges, Reclassify wizard).
- The four feed_type values (feed/rss/scrape_html/scrape_json) stay
  (verified at `web/src/app/api/newsroom/ingest/run/route.ts:292,310-312`).
  `search_api` is the new fifth value added by this redesign.
- The singleflight + orphan-reaper + 409 pattern stays.
- The kill-switch + rate-limit gates stay.
- The Phase B extraction_config + per-vendor host binding stays.
- The 26 + 47 + 20 seeded feeds stay.

Things that are explicitly NOT part of this redesign and would be
separate work later:

- Automated cron triggering the new research pipeline (today everything
  is operator-triggered Run Feed clicks; cron of saved queries is a
  separate ask).
- Realtime story updates pushed to operators (today operators load
  the Story Manager when they want to see new stuff).
- Public-facing source provenance display on the article reader (the
  `article_sources` data exists; surfacing it on the public article
  page is a separate UI ship).
- Multi-language search (English-only).
- Audio / video / podcast sources.
