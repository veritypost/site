# Pipeline Restructure — Plan of Attack

Working doc. The plan is written to be independently verifiable: every claim cites either a file:line, a DB table column, or a specific snapshot reference. A reviewer should be able to tick each assertion without trusting the narrative.

**Inputs this plan draws from:**
- Snapshot at `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/existingstorystructure/` — prior JS pipeline, outdated code + outdated schema, salvage the ideas and prompts only.
- Current repo at `/Users/veritypost/Desktop/verity-post/` — canonical destination, TypeScript, current schema.
- Current DB ground truth: **`web/src/types/database.ts`** (auto-generated from live Supabase), backed by live DB inspection via Supabase MCP when in doubt.
- `schema/reset_and_rebuild_v2.sql` — **baseline only, DO NOT trust for current state.** The live DB has drifted from this file (e.g. `articles.is_developing`, `articles.subcategory_id`, `articles.search_tsv` are in live + types.ts but not in the reset file). Use it to understand design intent at v2 cutover; always cross-check against `types/database.ts` before acting.
- Prior working doc content in this file (pre-supersede) — superseded by this plan.

**Citation convention:** column citations use `types/database.ts:LINE` for current live state. When referencing the v2 baseline for historical context, the file is called out explicitly as "baseline only."

**Guiding principle:** salvage the brain (prompts + step sequence + safety rails + algorithms); rewrite the body (routes, tables, auth, UI) fresh against the current codebase. Do not copy-paste JS files. Do not port old table names.

---

## 1. Current DB inventory — what's already there

Verified against `web/src/types/database.ts` (auto-generated from live Supabase). Reset file line numbers are approximate — use `types/database.ts:LINE` for current-state verification. A reviewer can also run `\d <table>` in Supabase SQL editor or the MCP to confirm live.

**Drift already known from the live DB that is NOT in the reset file:**
- `articles.is_developing` boolean (types.ts:1145) — breaking/developing story flag pair
- `articles.subcategory_id` string nullable (types.ts:1172) — subcategory FK
- `articles.search_tsv` (types.ts:1161) — alongside `search_vector`; appears to be an alternate tsvector column

These affect the plan: snapshot's `story_type` maps to `is_breaking`/`is_developing`; snapshot's subcategory assignment maps to `subcategory_id`. Use live columns, not reset's smaller set.

### Content tables (ready to use)

| table | key columns | file:line |
|---|---|---|
| `articles` | id, title, slug, body, body_html, excerpt, category_id, **subcategory_id**, author_id, status, is_ai_generated, ai_model, ai_provider, **ai_prompt_id** (unused FK slot), is_breaking, **is_developing**, is_kids_safe, **kids_summary** (text — manual today), source_feed_id, source_url, external_id, cluster_id, tags, **moderation_status**, **metadata** (jsonb), search_vector, search_tsv | types.ts:1118-1184 (reset baseline: L1597-1659, outdated) |
| `sources` | article_id, title, url, publisher, author_name, published_date, source_type, quote, sort_order | L1664-1678 |
| `timelines` | article_id, title, description, event_date, event_label, event_body, source_url, sort_order, metadata | L1683-1697 |
| `quizzes` | article_id, question_text, question_type, options (jsonb), explanation, difficulty, points, **pool_group** (integer, default 0 — ready for historical split), sort_order, is_active, attempt_count, correct_count | L1702-1722 |
| `quiz_attempts` | quiz_id, user_id, kid_profile_id, article_id, attempt_number, is_correct, points_earned, time_taken_seconds | L1727-1740 |

### Pipeline infrastructure (partial, extendable)

| table | key columns | file:line | status |
|---|---|---|---|
| `pipeline_runs` | pipeline_type, feed_id, status, started_at, completed_at, duration_ms, items_processed/created/failed, error_message, input_params (jsonb), output_summary (jsonb), triggered_by, triggered_by_user | L1176-1194 | Ready. `/api/ai/generate/route.js` already writes to it. |
| `pipeline_costs` | pipeline_run_id, article_id, model, provider, input_tokens, output_tokens, cost_usd, step, latency_ms, success, error_message, metadata | L1927-1943 | Table exists. Not yet written to by any code — grep finds no inserts. |
| `feed_clusters` | title, summary, primary_article_id, category_id, keywords (text[]), similarity_threshold, is_breaking, expires_at | L1875-1888 | Empty today. Matches the snapshot's pre-clustering output shape. Will reuse, not retire. |
| `feed_cluster_articles` | cluster_id, article_id, added_at | L2069-2074 | Join table for cluster members. Ready. |
| `feeds` | id, name, url, feed_type, category_id, is_active, is_auto_publish, is_ai_rewrite, poll_interval_minutes, last_polled_at, last_etag, last_modified, articles_imported_count, error_count, last_error, metadata | L771-797 | Ready. 234 rows seeded via `schema/105_seed_rss_feeds.sql`. |
| `settings` | key, value, value_type, category, is_public, is_sensitive | L667-680 | Key-value store. Perfect home for AI kill switch (`settings.key='ai.enabled'`). |
| `feature_flags` | key, display_name, is_enabled, rollout_percentage, target_platforms | L685-~720 | Alternative home for AI kill switch if we want rollout control. |
| `events` (partitioned) | event_id, event_name, event_category, article_id, user_id, session_id, occurred_at | `schema/108_events_pipeline.sql` | Applied — confirm via `\d events_*`. Target for context-read tracking. |

### Gaps — tables/columns that do not exist yet

| item | purpose | why needed |
|---|---|---|
| `articles.historical_context` (text, nullable) | Optional background prose under the article body | Feature spec'd in §5 below |
| `articles.kids_body` (text) | Full kid version prose | Snapshot pattern — one article row holds both versions |
| `articles.kids_headline` (varchar) | Kid headline | same |
| `articles.kids_slug` (varchar UNIQUE) | Kid page slug | same — kid page at its own URL |
| `articles.kids_excerpt` (varchar) | Kid summary (replaces `kids_summary`) | same |
| `articles.kids_reading_time_minutes` (integer) | Kid reading time | same |
| `quizzes.is_kid` (boolean, default false) | Split kid vs adult quiz | Snapshot pattern; same table, boolean flag |
| `timelines.is_kid` (boolean, default false) | Split kid vs adult timeline events | same |
| `timelines.is_current` (boolean, default false) | Mark "today's development" timeline entry | Snapshot uses `metadata.is_current`; we lift to a proper column |
| `discovery_items` (new table) | 24h unused buffer per user | Spec'd in §4 |
| `discovery_groups` + `discovery_group_items` (new tables) | User-initiated grouping | Spec'd in §4 |
| `pipeline_prompts` (new table, phase 2) | Editable prompts library | Phase 2 only — prompts live in code first |
| Cost-cap setting (`settings.key='pipeline.daily_cost_usd_cap'`) | $75/day hard stop | Snapshot-derived. Read by cron before each run. |

**Reviewer verification:** open `web/src/types/database.ts` and search for each table name (e.g. `articles: {`). Confirm the column list matches the "exists" rows above. For the "gaps" table, confirm none of those columns/tables appear in `types/database.ts`. Do NOT use the reset file as primary — it's known-drifted. When in doubt, run the Supabase MCP against project `fyiwulqphgmoqullmrfn` with `SELECT column_name FROM information_schema.columns WHERE table_name = '<name>'`.

---

## 2. Snapshot inventory — what's reusable vs discard

Snapshot root: `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/existingstorystructure/`.

### Salvage verbatim (copy text into new TS file, refine only for the new HISTORICAL_CONTEXT_PROMPT)

All of `lib/editorial-guide.js`:
- `EDITORIAL_GUIDE` (L5, ~320 lines) — adult article system prompt
- `CATEGORY_PROMPTS` (L322)
- `HEADLINE_PROMPT` (L612)
- `QUIZ_PROMPT` (L655)
- `TIMELINE_PROMPT` (L686)
- `REVIEW_PROMPT` (L903)
- `AUDIENCE_PROMPT` (L1012)
- `KID_ARTICLE_PROMPT` (L1024)
- `KID_TIMELINE_PROMPT` (L1056)
- `KID_QUIZ_PROMPT` (L1076)

Plus one **new** prompt to author: `HISTORICAL_CONTEXT_PROMPT` (+ a variant for kid-side `KID_HISTORICAL_CONTEXT_PROMPT`). These are net additions; the feature is not in the snapshot.

Destination: `web/src/lib/pipeline/editorial-guide.ts`.

### Salvage as algorithms (reimplement in TS, keep the logic)

From `lib/pipeline.js`:
- Model constants (`HAIKU = 'claude-haiku-4-5-20251001'`, `SONNET = 'claude-sonnet-4-6'`), `getModel()` dispatcher
- `parseJSON()` — strips markdown fences, rejects HTML, safe boundary finding
- `estimateCost()` — Haiku vs Sonnet per-million rates
- `isAIEnabled()` / `disableAI()` / `requireAI()` — kill switch with 30s cache and auto-trip on errors

From `utils/plagiarismCheck.js`:
- Trigram overlap; >20% to any source triggers rewrite

From `utils/scrapeArticle.js`:
- Full-article fetch fallback when RSS excerpt < 2000 chars

From `api/cron/ingest/route.js`:
- Pre-cluster algorithm: keyword overlap (≥35%), minimum 2 sources per cluster — pure JS, no AI, free
- Story-match logic: new cluster vs existing story (≥40% keyword overlap) → merge sources vs create draft

From `api/ai/pipeline/route.js`:
- Step sequence: research (web_search + scrape fallback) → write → plagiarism → audience classify → quiz → quiz verify → categorize → kid pass
- Insert-then-delete swap pattern for quiz updates (no gap where article has no quiz)
- "Historical" mode for filling past context on existing stories

From `api/cron/pipeline/route.js`:
- 10-min DB lock to prevent overlap (uses `site_settings.pipeline_cron_lock`)
- `$75/day` cost cap check
- 2 stories per cron run throttle
- Retry cap at 3

Destinations:
- `web/src/lib/pipeline/models.ts` — constants + getModel
- `web/src/lib/pipeline/parse-json.ts`
- `web/src/lib/pipeline/cost.ts`
- `web/src/lib/pipeline/kill-switch.ts`
- `web/src/lib/pipeline/plagiarism.ts`
- `web/src/lib/pipeline/scrape.ts`
- `web/src/lib/pipeline/clustering.ts`

### Discard outright

- All route handlers (will rewrite against current permissions + audit patterns)
- All admin pages (`/admin/story-manager/*`, `/admin/kids-story-manager/*` in snapshot — current repo already has placeholder versions at those paths, will adapt in place)
- All table references (stories → articles, source_links → sources, timeline_entries → timelines, quiz_questions → quizzes, scanned_articles → discovery_items, site_settings → settings)
- `requireAdmin` calls → replace with current `requirePermission('admin.newsroom.run')` pattern
- `stories.pipeline_data` JSON blob → replace with proper inserts into `pipeline_runs` + `pipeline_costs`
- JavaScript everywhere → TypeScript
- Snapshot's direct `@anthropic-ai/sdk` calls inline in routes → wrap through `lib/pipeline/call-model.ts` so the kill switch, cost logging, and retry logic all live in one place

**Reviewer verification:** open each snapshot file listed under "salvage algorithms" and confirm the cited function/pattern exists. For the "discard" list, cross-reference current repo patterns (e.g. `web/src/app/api/admin/feeds/[id]/route.ts` for the `requirePermission` + `recordAdminAction` pattern; `web/src/lib/supabase/server.js` for the service-client factory).

---

## 3. Naming and page renames

Current → proposed:

| current route | proposed route | rationale |
|---|---|---|
| `/admin/pipeline` | `/admin/newsroom` | Doesn't leak "AI"; reads as an editorial tool |
| `/admin/ingest` | `/admin/discover` | Users find stories, not a data pipeline |
| `/admin/feeds` | `/admin/feeds` | Stays. Owner manages source URL list. |
| `/admin/story-manager` + `[id]` | `/admin/story-manager` + `[id]` | Stays. The editor. |
| `/admin/kids-story-manager` + `[id]` | `/admin/kids-story-manager` + `[id]` | Stays. Kid editor. |
| `/admin/stories` | Delete or redirect to `/admin/story-manager` | The richer editor supersedes the list. Confirm with owner. |

Permission keys to add/rename: `admin.newsroom.run`, `admin.newsroom.cron`, `admin.discover.use`. Existing keys (`admin.articles.create`, `admin.articles.edit.any`, `admin.feeds.manage`) stay untouched.

**Reviewer verification:** grep current repo for each current path, confirm presence. Grep for `admin.ai.generate` permission key and confirm it's the one currently used by `/api/ai/generate/route.js:14`.

---

## 4. Discover page — design lock

User-initiated grouping (not algorithmic clustering). Single page that runs scans, shows results, persists unused items for 24h, lets the user multi-select and group.

### Page layout (top-down)

1. **Filter bar** — time window (6h / 12h / 24h / 48h / 72h), feed set dropdown, search text, Run button. Collapses after scan.
2. **Selection toolbar** (appears when rows checked) — `Group · Dismiss · Clear`.
3. **Groups section** — collapsible blocks: `[▼] "Label" · N articles · [Workbench] [Ungroup] [Dismiss]`. Label auto-seeded from first member headline, editable. Diversity shown inline: `4 articles · BBC, NPR, Reuters, AP`.
4. **Ungrouped list** — flat rows: `[checkbox] [time ago] [source] Title — snippet [badge] [dismiss]`. Badge is `NEW` or `Seen 6h ago`.
5. **Filter toggle** above the list: `[x] New  [x] Seen earlier` — both on by default.

### Row click behavior

- Click a single ungrouped row → opens Workbench for that item
- Check multiple, click Group → rows fold into a new group block
- Click a group's Workbench button → opens Workbench for the combined set; the group is treated as ONE story with N sources

### Workbench panel (slide-over from right)

Tabs:
1. **Article** — source preview (tabbed when group has multiple members)
2. **Timeline** — generate from sources, add historical research, manual add
3. **Context** — scratchpad, chat with article(s) as pinned context, related coverage search against own `articles` (tsvector)
4. **Sources** — auto-extracted URLs from member articles, deduped
5. **Draft** — preview, `[Draft article]` button → opens Run settings → fires `/api/newsroom/pipeline`

### Data model

**`discovery_items`** (new table):

```
id                uuid PK
user_id           uuid NOT NULL
feed_item_url     text NOT NULL
feed_item_title   text
feed_item_source  text
feed_item_pub_at  timestamptz
feed_id           uuid   -- FK to feeds, nullable
state             text NOT NULL  -- new | seen | grouped | dismissed | drafted
first_seen_at     timestamptz NOT NULL
last_seen_at      timestamptz NOT NULL
created_at        timestamptz NOT NULL DEFAULT now()
updated_at        timestamptz NOT NULL DEFAULT now()
UNIQUE (user_id, feed_item_url)
INDEX (user_id, state, last_seen_at)
INDEX (last_seen_at) -- for purge cron
```

**`discovery_groups`** (new table):

```
id           uuid PK
user_id      uuid NOT NULL
label        text
scan_session text   -- bucket grouping by scan; so groups auto-expire with scan
created_at   timestamptz NOT NULL DEFAULT now()
updated_at   timestamptz NOT NULL DEFAULT now()
INDEX (user_id, scan_session)
```

**`discovery_group_items`** (new join table):

```
group_id   uuid NOT NULL
item_id    uuid NOT NULL  -- FK to discovery_items
added_at   timestamptz NOT NULL DEFAULT now()
PRIMARY KEY (group_id, item_id)
```

### Cleanup cron

One entry in `web/src/app/api/cron/discovery-sweep/route.ts`:

```
DELETE FROM discovery_items
WHERE last_seen_at < now() - interval '24 hours';

DELETE FROM discovery_groups
WHERE scan_session NOT IN (
  SELECT DISTINCT scan_session FROM discovery_items ...
);
```

Runs hourly. Bounded table size.

### Relationship to `feed_clusters`

`feed_clusters` + `feed_cluster_articles` are already in the schema. They will **not be used by the Discover flow** (user-initiated grouping is stored in `discovery_groups`). They remain for two reasons:
- Snapshot's server-side keyword pre-clustering runs during ingest and can populate `feed_clusters` as a **hint layer** — the Discover UI could surface "candidate groups" the algorithm suggested, which the user accepts/modifies.
- Future: if auto-drafting from high-confidence clusters is ever wired, the infrastructure exists.

Decision: populate `feed_clusters` as a courtesy during ingest (cheap), surface it as an optional "Suggested groups" row in Discover above the ungrouped list. User still has full control; the suggestion layer does not bind anything.

**Reviewer verification:** confirm `feed_clusters` and `feed_cluster_articles` exist in `schema/reset_and_rebuild_v2.sql`. Confirm no existing code writes to them (grep `.from('feed_clusters')` in `web/src/`).

---

## 5. Historical context feature — design lock

### Reader-side

- Collapsible disclosure under the article body, before the comprehension quiz.
- Only renders when `articles.historical_context IS NOT NULL`.
- Label: "More background (click to expand)".
- Below the prose, if any `pool_group=1` quizzes exist for the article: `[Try the history questions →]` button → opens quiz engine scoped to pool_group=1.

Three surfaces affected:
- `web/src/app/story/[slug]/page.tsx` (adult web)
- `VerityPost/VerityPost/StoryDetailView.swift` (adult iOS)
- `VerityPostKids/VerityPostKids/KidReaderView.swift` (kids iOS)

### Admin-side

- Story Manager + Kids Story Manager get two new collapsed sections in the edit form:
  - **Historical context (optional)** — rich-text editor bound to `articles.historical_context`; `[Generate]` button calls the step endpoint
  - **Historical context quiz (optional, up to 5)** — question editor, saves with `pool_group=1`; `[Generate 5]` button calls the step endpoint

### Schema change

One migration file:

```
ALTER TABLE articles ADD COLUMN historical_context text;
```

(That is the entire schema delta for this feature. Quiz split via existing `pool_group` column, no change needed there.)

### Gating decisions (locked)

- Historical quiz: **bonus only, does not gate comments**. Comment gate stays on pool_group=0 comprehension at 3/5.
- Scoring: awards `quizzes.points` (default 10) per correct, same as comprehension.
- Retake rules: mirror comprehension retake rules from the existing plan permission matrix.
- Permissions: historical context block inherits `article.body.read` (existing permission). No new perms.

### Tracking

Two questions, two homes:

| question | where it's already tracked | what's needed |
|---|---|---|
| Did user answer historical questions right? | `quiz_attempts` table — every attempt is row with `is_correct`, `points_earned`, joined to `quizzes.pool_group` via `quiz_id`. Existing `/api/quiz/submit` already writes these. | **Nothing.** Start populating pool_group=1 quizzes; existing tracking captures it. |
| Did user read the historical context block? | `events` (schema 108) — designed for exactly this kind of engagement signal. | Fire 3 new event names: `article_context_expanded`, `article_context_scrolled_end`, `article_context_dwell_30s`. |

Hook: `web/src/lib/track.ts` on web (seen in `git status`), iOS event client on the two mobile surfaces. Events flow to `/api/events/batch` (present per `git status`: `web/src/app/api/events/`).

**Reviewer verification:** confirm `quizzes.pool_group` exists with default 0 (`schema/reset_and_rebuild_v2.sql:1713`). Confirm `quiz_attempts.quiz_id` FK + `is_correct` (L1729, L1736). Confirm `events` table and `/api/events/batch` endpoint exist.

---

## 6. Kids data-model decision (locked)

Options considered:
- (a) One `articles` row per story, kids content in extra columns (snapshot pattern)
- (b) Separate `articles` row per audience with `parent_article_id` link

**Decision: (a), matching the snapshot.**

Rationale:
- Simpler: one row is the single source of truth for a story across audiences
- Matches the editorial design (the article + timeline are a pair; the kids version is a facet of the same pair, not a fork)
- Avoids sync problems (adult update → kid row stale) — one canonical row
- Matches snapshot's `KID_ARTICLE_PROMPT` flow which generates kid content from raw facts alongside adult, not downstream from adult
- Quiz and timeline splits use simple boolean flags (`is_kid`) on existing tables; minimal schema impact

Schema deltas for this decision:

```
ALTER TABLE articles ADD COLUMN kids_headline varchar(500);
ALTER TABLE articles ADD COLUMN kids_slug varchar(600) UNIQUE;
ALTER TABLE articles ADD COLUMN kids_excerpt varchar(2000);
ALTER TABLE articles ADD COLUMN kids_body text;
ALTER TABLE articles ADD COLUMN kids_body_html text;
ALTER TABLE articles ADD COLUMN kids_reading_time_minutes integer;
ALTER TABLE articles ADD COLUMN kids_historical_context text;
ALTER TABLE quizzes   ADD COLUMN is_kid boolean NOT NULL DEFAULT false;
ALTER TABLE timelines ADD COLUMN is_kid boolean NOT NULL DEFAULT false;
ALTER TABLE timelines ADD COLUMN is_current boolean NOT NULL DEFAULT false;
```

Existing `articles.kids_summary` becomes redundant for kids body but stays for legacy reasons until explicit cleanup; populated kid articles use `kids_excerpt`.

Kids reader (iOS) queries:
- Kids content filter: `SELECT ... FROM articles WHERE kids_body IS NOT NULL AND status='published' ORDER BY published_at DESC`
- Kids quiz: `SELECT ... FROM quizzes WHERE article_id=? AND is_kid=true ORDER BY pool_group, sort_order`
- Kids timeline: `SELECT ... FROM timelines WHERE article_id=? AND is_kid=true ORDER BY event_date`

Kid slug routing (future): iOS app could expose `/kids-slug/kids-body` at `{app-scheme}://kid/article/<kids_slug>` for deep linking. Not required for v1.

**Reviewer verification:** confirm `articles.kids_summary` exists (L1625) — proposed decision preserves it. Confirm `quizzes.pool_group` exists (L1713). Confirm no `is_kid` columns currently (grep `is_kid` in schema → should only find kid_profile references). Confirm snapshot's `KID_ARTICLE_PROMPT` at `lib/editorial-guide.js:1024` uses raw facts, not the adult body, for its output.

---

## 7. Model provider strategy (deferred, explicit)

Snapshot is Anthropic-only (Haiku default, Sonnet opt-in). Owner asked for provider + model picker.

Decision: **v1 is Anthropic-only, matching snapshot.** Add provider abstraction in phase 2.

Rationale:
- Provider picker is UX surface area, not a capability gap (Haiku is the right default for almost every step)
- Snapshot's routing is battle-tested
- Abstraction can land after v1 ships; the extraction is straightforward (wrap `anthropic.messages.create` calls behind `runStep({step, prompt})` that reads model from a config)

Phase 2 abstraction:
- New lib: `web/src/lib/pipeline/call-model.ts` — single function `runStep({ step_key, system, user, expected_json })` → `{ text, tokens_in, tokens_out, model, cost_usd, latency_ms }`
- Config source: `pipeline_model_profiles` table (optional, deferred) or constants in `web/src/lib/pipeline/config.ts` (v1).
- Hooks: kill switch + cost logging + retry, all centralized here.

v1 config (in code, not DB):

```ts
// web/src/lib/pipeline/config.ts
export const MODEL_BY_STEP = {
  research:          HAIKU,
  write_article:     HAIKU,    // snapshot default
  plagiarism_check:  null,     // pure JS
  audience_classify: HAIKU,
  quiz_generate:     HAIKU,
  quiz_verify:       HAIKU,
  categorize:        HAIKU,
  kid_article:       HAIKU,
  kid_quiz:          HAIKU,
  kid_timeline:      HAIKU,
  historical_context: HAIKU,
  historical_quiz:   HAIKU,
  editorial_review:  HAIKU,    // upgrade to SONNET later if quality lags
  cleanup:           HAIKU,
  headline_rewrite:  HAIKU,
} as const;
```

Owner can override per-run via a URL param or a small "Use Sonnet for body" toggle in the Run settings modal — single toggle, no per-step dropdown matrix, keeps UX simple.

**Reviewer verification:** confirm snapshot's `lib/pipeline.js:5-17` sets Haiku default with `getModel('sonnet')` opt-in. Confirm current `/api/ai/generate/route.js:82` uses OpenAI gpt-4o-mini (will be replaced in new endpoints).

---

## 8. Endpoint map

All new endpoints. Reviewer should confirm none of these paths currently exist (`ls web/src/app/api/newsroom/` should fail; current `/api/ai/generate` stays only as OpenAI fallback or gets removed later).

### Newsroom group — `/api/newsroom/*`

| endpoint | purpose | writes to |
|---|---|---|
| `POST /api/newsroom/pipeline` | Full pipeline run: research → write → ... → kid pass. Accepts `{ article_id, mode: 'manage'\|'historical', audience: 'adult'\|'kids'\|'both', step_overrides? }`. Streams progress SSE. | articles, sources, timelines, quizzes, pipeline_runs, pipeline_costs |
| `POST /api/newsroom/step/research` | Run only the research step | pipeline_runs, pipeline_costs |
| `POST /api/newsroom/step/write` | Write/rewrite article body | articles, pipeline_runs, pipeline_costs |
| `POST /api/newsroom/step/headline` | Regenerate headline only | articles, pipeline_runs, pipeline_costs |
| `POST /api/newsroom/step/summary` | Regenerate excerpt only | articles |
| `POST /api/newsroom/step/quiz` | Regenerate quiz (pool_group from body) | quizzes |
| `POST /api/newsroom/step/quiz-verify` | Fact-check quiz vs article | quizzes (marks bad items) |
| `POST /api/newsroom/step/timeline` | Generate timeline events | timelines |
| `POST /api/newsroom/step/historical-context` | Generate the new historical context block | articles.historical_context |
| `POST /api/newsroom/step/historical-quiz` | Generate up to 5 pool_group=1 questions | quizzes |
| `POST /api/newsroom/step/categorize` | Assign category_id | articles |
| `POST /api/newsroom/step/audience` | Classify audience | articles.metadata |
| `POST /api/newsroom/step/cleanup` | Grammar pass | articles |
| `POST /api/newsroom/step/kid-article` | Generate kid prose | articles.kids_* |
| `POST /api/newsroom/step/kid-quiz` | Generate kid quiz (is_kid=true) | quizzes |
| `POST /api/newsroom/step/kid-timeline` | Generate kid timeline (is_kid=true) | timelines |
| `POST /api/newsroom/cluster` | Manual trigger of cluster labeling over staged discovery_items | feed_clusters (optional) |

All gated by `admin.newsroom.run`; all wrap with `record_admin_action` audit.

### Discover group — `/api/discover/*`

| endpoint | purpose | reads/writes |
|---|---|---|
| `POST /api/discover/scan` | Fetch RSS for selected feeds within time window, upsert to discovery_items, return rows with state/badge | reads feeds, writes discovery_items |
| `POST /api/discover/group` | Create group from selected item ids | writes discovery_groups, discovery_group_items |
| `PATCH /api/discover/group/:id` | Rename / ungroup / dismiss group | discovery_groups |
| `POST /api/discover/dismiss` | Mark item(s) dismissed | updates discovery_items.state |
| `POST /api/discover/workbench/related` | Tsvector search articles for related coverage | reads articles |
| `POST /api/discover/workbench/research-web` | Web research call (phase 2, Exa/Perplexity) | behind flag, optional |

All gated by `admin.discover.use`.

### Cron — `/api/cron/*`

| endpoint | purpose | schedule |
|---|---|---|
| `GET /api/cron/ingest` | Poll RSS, upsert scanned items, pre-cluster (populate `feed_clusters` as hints), merge into existing stories via keyword match | every N minutes from settings.scan_interval_minutes |
| `GET /api/cron/pipeline` | Find stories needing AI, call `/api/newsroom/pipeline` with `mode=manage`. 10-min lock, $75/day cap, 2/run throttle, 3-retry max | every 5-10 min |
| `GET /api/cron/discovery-sweep` | Purge discovery_items older than 24h | hourly |

All gated by `x-cron-secret` header check (existing pattern).

**Reviewer verification:** `ls web/src/app/api/newsroom 2>&1` must fail; same for `/api/discover`. `/api/cron/ingest`, `/api/cron/pipeline` also must not exist yet. Confirm existing cron pattern in `web/src/app/api/cron/send-emails/route.js` for secret header shape.

---

## 9. Schema migrations (single file)

One new migration file: `schema/NNN_pipeline_restructure.sql`. Applied once by owner. Idempotent.

```sql
BEGIN;

-- Historical context feature
ALTER TABLE articles ADD COLUMN IF NOT EXISTS historical_context text;

-- Kids content on same row (matches snapshot pattern)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS kids_headline varchar(500);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS kids_slug varchar(600) UNIQUE;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS kids_excerpt varchar(2000);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS kids_body text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS kids_body_html text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS kids_reading_time_minutes integer;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS kids_historical_context text;

-- Quiz + timeline kid split + current flag
ALTER TABLE quizzes   ADD COLUMN IF NOT EXISTS is_kid boolean NOT NULL DEFAULT false;
ALTER TABLE timelines ADD COLUMN IF NOT EXISTS is_kid boolean NOT NULL DEFAULT false;
ALTER TABLE timelines ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

-- Discovery tables
CREATE TABLE IF NOT EXISTS discovery_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  feed_item_url    text NOT NULL,
  feed_item_title  text,
  feed_item_source text,
  feed_item_pub_at timestamptz,
  feed_id          uuid,
  state            text NOT NULL DEFAULT 'new',
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discovery_items_user_url_uniq UNIQUE (user_id, feed_item_url),
  CONSTRAINT discovery_items_state_check CHECK (state IN ('new','seen','grouped','dismissed','drafted'))
);
CREATE INDEX IF NOT EXISTS idx_discovery_items_user_state ON discovery_items(user_id, state, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_items_lastseen   ON discovery_items(last_seen_at);

CREATE TABLE IF NOT EXISTS discovery_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  label        text,
  scan_session text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discovery_groups_user ON discovery_groups(user_id, scan_session);

CREATE TABLE IF NOT EXISTS discovery_group_items (
  group_id uuid NOT NULL,
  item_id  uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, item_id)
);

-- Settings for AI kill switch + daily cost cap
INSERT INTO settings (key, value, value_type, category, display_name, description)
VALUES
  ('ai.enabled',                  'true', 'boolean', 'ai',       'AI enabled',           'Master kill switch for all pipeline steps'),
  ('pipeline.daily_cost_usd_cap', '75',   'number',  'pipeline', 'Daily cost cap (USD)', 'Pipeline stops when cumulative cost exceeds this'),
  ('pipeline.cron_lock',          '',     'string',  'pipeline', 'Cron lock timestamp',  'ISO timestamp of the most recent cron lock grab'),
  ('pipeline.scan_interval_min',  '15',   'number',  'pipeline', 'Scan interval (min)',  'How often ingest cron polls feeds')
ON CONFLICT (key) DO NOTHING;

COMMIT;
```

**Reviewer verification (critical — do this BEFORE applying the migration):**

1. Regenerate types: `cd web && npx supabase gen types typescript --project-id fyiwulqphgmoqullmrfn > src/types/database.ts` (or equivalent command in this repo's flow). Diff against committed version — any unexpected additions are drift that could collide.
2. For each `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the migration, grep the freshly-regenerated `types/database.ts` and confirm the column is NOT present. If it IS, that means live DB already has it (drift) — investigate before applying. `IF NOT EXISTS` will silently skip, but you want to know why.
3. For each `CREATE TABLE IF NOT EXISTS`, same — confirm the table doesn't exist live.
4. Confirm `settings` key uniqueness: `SELECT key FROM settings WHERE key IN ('ai.enabled', 'pipeline.daily_cost_usd_cap', 'pipeline.cron_lock', 'pipeline.scan_interval_min')` — if any rows, `ON CONFLICT DO NOTHING` handles it but again worth confirming expected.
5. After applying, re-regenerate `types/database.ts` and confirm all new columns/tables appear.

---

## 10. Prompts to author (net-new)

Two prompts not in the snapshot:

1. **`HISTORICAL_CONTEXT_PROMPT`** — generates the background prose block. Input: article body + timeline entries + source URLs. Output: 120-250 words of prose that adds useful context without overlapping the timeline.
2. **`HISTORICAL_QUIZ_PROMPT`** — generates up to 5 questions from the historical_context block (NOT the article body). Matches the existing `QUIZ_PROMPT` shape for structural consistency.

Kid variants (mirror adult structure, kid-appropriate tone):
3. **`KID_HISTORICAL_CONTEXT_PROMPT`**
4. **`KID_HISTORICAL_QUIZ_PROMPT`**

Location: `web/src/lib/pipeline/editorial-guide.ts` alongside the ported snapshot prompts.

---

## 11. Build order (revised to hours)

Each step is checkpointed with a verification criterion.

| # | task | files touched | verify when done |
|---|---|---|---|
| 1 | Rename pages (`/admin/pipeline` → `/admin/newsroom`, `/admin/ingest` → `/admin/discover`); update nav + permission keys. Rebuild target pages as shell (empty content, correct routes). | nav file, permission seed, 2 page files | visit both URLs, return 200 with titled shells |
| 2 | Apply schema migration | `schema/NNN_pipeline_restructure.sql` | grep new columns; select from `discovery_items` returns 0 rows without error |
| 3 | Port prompts into TS | `web/src/lib/pipeline/editorial-guide.ts` | file exports the 11 snapshot prompts + 4 new historical ones; `tsc --noEmit` passes |
| 4 | Implement helper libs (parse-json, cost, kill-switch, plagiarism, scrape, models) | `web/src/lib/pipeline/*.ts` | unit-visible: can instantiate, basic smoke test |
| 5 | Implement `call-model.ts` wrapper | `web/src/lib/pipeline/call-model.ts` | calls kill switch, logs to pipeline_costs, handles 429 auto-disable |
| 6 | Implement `/api/newsroom/pipeline` (full orchestrator, mode=manage) | 1 route file | runs end-to-end on a seeded test story; writes articles/sources/timelines/quizzes; pipeline_runs completes |
| 7 | Implement step endpoints (headline, summary, quiz, quiz-verify, timeline, cleanup, categorize, audience) | 8 route files | each can be POST'd with article_id and runs cleanly |
| 8 | Implement historical-context + historical-quiz steps + kid variants | 4 route files | populate both block + questions on a test article |
| 9 | Implement `/api/discover/scan` (RSS fan-out, upsert discovery_items, optional feed_clusters hint write) | 1 route file, reuses helper libs | scan returns >0 rows; second scan 10s later returns same rows with state='seen' |
| 10 | Implement `/api/discover/group`, dismiss, workbench endpoints | 3-4 route files | can group, rename, dismiss; related coverage returns matches |
| 11 | Implement crons (ingest, pipeline, discovery-sweep) | 3 route files | each fires with x-cron-secret and completes; lock prevents double-run |
| 12 | Build Discover page UI (scan, list, group, dismiss, filter toggle) | 1 page file + components | full flow works manually |
| 13 | Build Workbench panel (5 tabs) | component + tab files | each tab populates on a chosen item/group |
| 14 | Extend Story Manager edit form: historical context section, historical quiz section, per-step regenerate buttons | existing `/admin/story-manager/[id]/page.tsx` | form saves + regen buttons call step endpoints |
| 15 | Extend Kids Story Manager identically | existing `/admin/kids-story-manager/[id]/page.tsx` | same |
| 16 | Build Newsroom dashboard: live runs, cost chart, cron status | new page at `/admin/newsroom/page.tsx` | reads pipeline_runs + pipeline_costs; chart renders |
| 17 | Reader changes: historical context disclosure on web | `web/src/app/story/[slug]/page.tsx` | renders when non-null; event fires on expand |
| 18 | Reader changes: iOS adult + iOS kids | `StoryDetailView.swift`, `KidReaderView.swift` | same, `xcodebuild` clean on both targets |
| 19 | Quiz engine split: run pool_group=1 as separate optional mode | web quiz component + iOS KidQuizEngineView | history questions launch from disclosure; scoring works |
| 20 | Event wiring: 3 new context events through track.ts + iOS client | `web/src/lib/track.ts`, iOS event client | events land in `events` table |

Time budget (rough, single focused operator):
- 1-2, 4-5 (prep + libs): ~2 hrs
- 3 (prompts port): ~30 min
- 6-8 (pipeline + steps + historical): ~4 hrs
- 9-11 (discover + crons): ~2.5 hrs
- 12-13 (Discover UI): ~2.5 hrs
- 14-16 (admin UIs): ~3 hrs
- 17-20 (readers + events): ~2.5 hrs

**Total: ~17 hours of focused build time.** More realistic than 10-12 given adaptation to current UI kit and TS conversion.

---

## 12. Open decisions requiring owner sign-off

1. Confirm page renames: `/admin/newsroom`, `/admin/discover`. Or alternates.
2. Confirm kids data model: **single articles row + kid columns + `is_kid` flags on quizzes/timelines** (recommended, matches snapshot). Rejecting this forces a bigger schema change to parent/child article rows.
3. Confirm `/admin/stories` fate: delete or redirect to `/admin/story-manager`.
4. Confirm "Anthropic-only for v1" model strategy. Phase 2 adds the abstraction.
5. Confirm `feed_clusters` stays (as pre-cluster hint output from ingest cron) vs gets retired. Recommended: stay.
6. Confirm cron schedule targets: 15min ingest, 10min pipeline, 60min discovery-sweep. Owner runs these via Vercel cron or external scheduler.
7. Confirm cost cap: $75/day default (from snapshot). Can be raised in `settings.pipeline.daily_cost_usd_cap`.
8. Confirm the scope of the Discover/Workbench web-research tab (Exa/Perplexity/Tavily vs none). Recommended: **none in v1**; tsvector search against own archive only. Phase 2 adds a web tool behind an explicit button.

---

## 13. What this plan does NOT include (explicitly out of scope)

- Per-step provider/model dropdown matrix UI. Deferred to phase 2.
- `pipeline_prompts` DB-backed editable prompt library. Deferred to phase 2; prompts live in `editorial-guide.ts`.
- Semantic search (pgvector embeddings) for related coverage. Deferred; tsvector sufficient for v1.
- Auto-drafting from high-confidence algorithmic clusters. Deferred; user-initiated grouping only.
- Provider fallback logic (OpenAI when Anthropic down). Deferred; kill switch is sufficient — a downed provider flips `settings.ai.enabled=false` and owner re-enables.
- Web-research tool (Exa / Perplexity / Tavily) inside Workbench Context tab. Deferred.
- DB-backed saved feed sets / run profiles. Deferred; v1 uses URL state for filter persistence.

---

## 14. How a reviewer should audit this plan

1. Confirm every cited DB table + column exists via `web/src/types/database.ts` (preferred) or live DB inspection via Supabase MCP. Reset file is known-drifted; do NOT use as primary source. Cross-check the "drift already known" list in §1 — if the reviewer finds additional drift, flag it before approving the §9 migration.
2. Confirm every cited snapshot file exists and contains the claimed function/prompt (§2).
3. Confirm no target route or table is already taken — run the `ls`/grep verifications called out in §3 and §8.
4. Red-team: is the kids single-row approach good enough, or does any future feature demand separate rows? (If kids ever gets its own editorial workflow where two different editors can touch the adult and kid versions independently with concurrent edit semantics, separate rows get more attractive. Current scope: one person, no problem.)
5. Red-team: does the Anthropic-only v1 block anything critical? (Only if Anthropic is down for >24h — kill switch handles that with a manual re-enable once up, owner edits articles by hand in the meantime. Acceptable for v1.)
6. Red-team: can the ingest cron DOS upstream feeds? (234 feeds × every 15 min = 22k fetches/day; with 5-concurrent throttle from the snapshot, fine. Feeds table's `error_count` + `poll_interval_minutes` already exist for backoff.)
7. Red-team: is the 24h `discovery_items` retention right? (Short enough that the table stays small; long enough to catch "I meant to cover that." If it ever feels short, bump to 48h — one setting change.)
8. Red-team: do the F-077 prompt-injection defenses survive the port? (Yes — apply the `stripInjection` + `===MARKERS===` pattern from current `/api/ai/generate/route.js:52-59` to every new step endpoint.)
9. Confirm the build order's "verify when done" criteria are testable without owner intervention; flag any that require manual click-through that could be automated.

Any disagreement with §12 decisions should resolve before step 6 (orchestrator build) — after that, un-doing a kids model choice or a page rename has ripple cost.
