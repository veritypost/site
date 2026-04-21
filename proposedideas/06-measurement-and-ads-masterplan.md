# Measurement + ads master plan

The one doc that ties together four systems that have to coexist
without stepping on each other: **ads**, **scoring**, **own-built
telemetry**, and **GA4**. Every system has a job, a boundary, and a
story for what happens when another one fails.

Rule of the whole document: **your own DB is truth. Everything else
— GA4, AdSense reports, BigQuery exports — is a lens.** When the
truth and the lens disagree, the truth wins, and the lens gets
fixed.

---

## The single principle

Four systems, ranked by authority:

1. **Postgres (your DB)** — authoritative for every user, every
   article, every quiz, every score, every subscription, every
   reading event. Source of product truth. Cannot go down.
2. **Own-built telemetry** — a thin event pipeline that mirrors
   product activity into a queryable store. Owned end-to-end,
   privacy-aware, ad-block-proof. Source of product analytics.
3. **GA4** — market-standard reach + marketing attribution. Pulls
   from the same event stream. Source of "how did people find us"
   data. Can fail silently; nothing downstream breaks.
4. **AdSense / ad networks** — settles monetary truth monthly.
   Source of revenue reporting. Reconciled against own-built
   telemetry's ad-event stream.

**Never** let a lower system write to a higher one. GA4 cannot
update a Verity Score. AdSense cannot reconcile against itself.
Own-built telemetry cannot silently reshape product behavior.

---

## 1. The unified event collector — one pipeline, four outputs

The key architectural move. Every trackable action on the site
flows through **a single endpoint and a single event schema**. That
endpoint fans out to four destinations:

```
                 user does thing
                         │
                         ▼
           ┌──────────────────────────┐
           │  POST /api/events/batch  │
           │  (client or server-side) │
           └──────────┬───────────────┘
                      │
        ┌─────────────┼─────────────┬────────────────┐
        ▼             ▼             ▼                ▼
   ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌────────────┐
   │ Postgres│  │ GA4 MP   │  │ ClickHouse │  │ AdSense    │
   │ (truth) │  │ (reach)  │  │ (analytics)│  │ (passthru) │
   └─────────┘  └──────────┘  └────────────┘  └────────────┘
```

**Why one pipeline, not four:** instrumentation is the hardest part
of analytics to keep clean. If quiz_completed fires to Postgres
from one code path, to GA4 from another, and to your dashboard
from a third, they diverge. One call, one source of truth, four
lenses. Any engineer adding a new trackable action instruments it
exactly once.

### The event shape

Every event, every source:

```
events (partitioned by day)
├── event_id          uuid PK — idempotency key, client-generated
├── event_name        text   — e.g. 'page_view', 'quiz_completed',
│                              'article_read_complete',
│                              'ad_viewable', 'subscribe_complete'
├── event_category    text   — 'product' | 'ads' | 'marketing' | 'system'
├── occurred_at       timestamptz
├── received_at       timestamptz
├── user_id           uuid NULL       — null for anon
├── session_id        text             — stable for session
├── device_id         text             — stable-ish per browser
├── user_tier         text             — anon / free_verified / verity / pro / family / xl
├── user_tenure_days  int NULL
├── page              text
├── content_type      text             — story / category / home / profile / etc.
├── article_id        uuid NULL
├── article_slug      text NULL
├── category_slug     text NULL
├── subcategory_slug  text NULL
├── author_id         uuid NULL
├── referrer_domain   text NULL
├── utm_source        text NULL
├── utm_medium        text NULL
├── utm_campaign      text NULL
├── device_type       text             — web_desktop / web_mobile / ios / android
├── country_iso2      text NULL
├── region            text NULL
├── viewport_w        int NULL
├── viewport_h        int NULL
├── consent_analytics bool
├── consent_ads       bool
├── is_bot            bool
├── experiment_bucket text NULL
├── user_agent_hash   text             — sha256, never raw
├── ip_hash           text             — sha256, never raw
├── payload           jsonb            — event-specific fields
│                                       (quiz_score, ad_unit_id,
│                                        scroll_depth_pct, etc.)
├── created_at        timestamptz
```

One table to rule them all. Ad events, pageviews, quiz completions,
subscribe clicks — all rows. The `event_category` + `event_name` +
`payload` determine the domain. Partitioned daily; 90-day retention
in Postgres; long-term storage in ClickHouse/BigQuery.

### The endpoint

`POST /api/events/batch` accepts `{ events: Event[] }`. Client-side
helper (`lib/track.ts`) accumulates events in a ref and flushes:

- every 2s
- on `visibilitychange=hidden`
- on `beforeunload` (via `navigator.sendBeacon` so it survives)
- when the buffer hits 20 events

Server-side events (quiz submit, subscribe complete) call the same
endpoint internally from the API route that performs the action —
after the authoritative DB write succeeds. Never before.

The endpoint does:

1. **Dedupe** via Redis Bloom filter on `event_id`.
2. **Bot filter** via `isbot` + header heuristics. Bot events go
   to a separate partition (`events_bot`) for analysis, not to
   GA4 or dashboards.
3. **Write to Postgres** partition for the day.
4. **Forward selected events to GA4** via Measurement Protocol
   (server-side, not client — bypasses ad-blockers). Only
   forward `event_category IN ('product', 'marketing')`.
5. **Forward to ClickHouse** (via insert buffer) for long-term
   analytics.
6. **Ad events** also increment AdSense-equivalent counters for
   reconciliation against AdSense reports.

Writing to Postgres is **sync** — the API doesn't return until
the row is in. GA4 + ClickHouse forwarding is **async** — queued,
not blocked on. If GA4 is down, the product never notices.

---

## 2. The own-built measurement tool

This is the "without GA4" question, answered: **build both, use
them for different things.** Here's the own-built half.

### Architecture

```
  events table (Postgres, 90-day hot)
          │
          ▼
  nightly export partition
          │
          ▼
  ClickHouse Cloud / Tinybird / self-hosted CH
          │
          ▼
  materialized views refreshed hourly:
    stats_daily_by_category
    stats_daily_by_article
    stats_daily_by_user_tier
    funnel_daily_by_category
    retention_daily_cohort
          │
          ▼
  /admin/analytics  (Next.js pages, read-only)
```

### Why ClickHouse (or BigQuery)

Postgres is right for operational data. It's wrong for analytics
at scale — columnar storage beats row storage by 10-100× for
aggregate queries. ClickHouse was built for this exact shape:
billions of events, group-bys, percentiles, cohort retention.

- **Free/cheap tier:** ClickHouse Cloud starts ~$50/mo for the
  first few hundred GB. Tinybird similar. BigQuery free to 1 TiB
  queries/month.
- **Ingest:** append-only insert from Postgres. Via CDC
  (ClickHouse's PostgreSQL engine) or nightly batch. Either works.
- **Query:** SQL, same shape as Postgres. No rewrite.

### The admin analytics pages

Seven pages, each a focused view. All pull from ClickHouse (or
Postgres for recent days). Read-only. No GA4 dependency.

**1. `/admin/analytics/overview`** — the day-one dashboard.
- Unique users today / 7d / 30d.
- Sessions today / 7d / 30d.
- Signups (all / verified) today / 7d / 30d.
- Quizzes taken + passed today.
- Articles read to completion today.
- Active streaks ≥ 7 days.
- Revenue today (subscription + ad, separate columns).

**2. `/admin/analytics/traffic-sources`** — where readers come from.
- Top referrer domains.
- Top search queries (from Search Console API, not GA4).
- UTM campaign performance.
- Direct vs organic vs referral split.
- Geographic breakdown.
- Device breakdown.

**3. `/admin/analytics/categories`** — the category audit you
asked for.
- Heatmap: row = category, column = day, cell = unique readers.
- For each category: uniques, sessions, avg session duration,
  quiz-pass rate, subscribe conversion rate.
- Same table by subcategory, nested.
- Drill-down: click a category → article-level list.

**4. `/admin/analytics/articles`** — per-article depth.
- Top N articles by uniques, by read-completion, by quiz-pass
  rate, by comment activity, by share activity.
- Per-article scroll-depth distribution (histogram).
- Per-article bailout point (P50 scroll % at which users close).
- Gap list: articles with high uniques but low read completion
  (headline/opening-paragraph problem).

**5. `/admin/analytics/funnels`** — conversion paths.
- Default funnel: home → category → article → quiz started →
  quiz passed → discussion posted → subscribe.
- Custom funnel builder: pick any 2-5 events, segment by user_tier,
  category, device.
- Per-step drop-off rate with confidence intervals.
- Cohort comparison: "signups from last week vs last month."

**6. `/admin/analytics/retention`** — the lifetime view.
- D1, D7, D30 retention curves by signup cohort.
- By category of first article read.
- By user_tier.
- By acquisition channel.
- Churn prediction (at scale; skip at launch).

**7. `/admin/analytics/ads`** — the monetization view.
- Impressions / viewable impressions / CTR / RPM per placement
  per day.
- Fill rate per placement (% filled vs null return from serve_ad).
- Per-category ad revenue.
- Per-tier ad exposure.
- Reconciliation row: AdSense-reported revenue vs own-counted
  impressions × expected RPM (gap signals tracking issues).

### Privacy posture (built-in, not bolted on)

- **No raw IP** stored — SHA-256 hashed with a rotating salt.
- **No raw user agent** — hashed.
- **Consent-gated forwarding** — GA4/ClickHouse receive events
  only from users who accepted analytics cookies. Consent-denied
  users still appear in Postgres (your DB, your data, legal
  basis = legitimate interest + contract) but never leave.
- **DSAR (subject access) support** — `/admin/user/{id}/export`
  returns all events for that user across all stores.
- **Right to deletion** — cascade delete by `user_id` across
  events, ClickHouse, and a forwarded API call to GA4.

### GA4 vs own-built — where each wins

| Question | Best source | Why |
|---|---|---|
| Traffic sources, SEO queries | GA4 + Search Console | They already index the web |
| "How many uniques from organic last week" | GA4 | Free, fast, good enough |
| "How many human users took a quiz" | Own DB | Truth, no sampling, no opt-out blind spot |
| "Quiz-pass rate by category" | Own DB / ClickHouse | Product semantics GA4 doesn't know |
| Real-time "who's reading right now" | Own DB | GA4 real-time is aggregate only |
| Cross-device joined user journey | Own DB | GA4 stitches by opt-in user_id only |
| Ad revenue settlement | AdSense report | Authoritative |
| Ad impressions, CTR, fill rate | Own event stream | Millisecond-accurate, per-placement |
| Marketing attribution (last-click) | GA4 | Industry-standard models, free |
| Product funnels / cohort retention | Own ClickHouse / BigQuery | GA4 funnels are limited + sampled |

Use both. They answer different questions. The shared event
stream is what keeps them from drifting.

---

## 3. GA4, configured right

GA4 is the marketing lens. Below is everything it needs to be
useful.

### One-time setup (~2 hours)

- Create GA4 property. Record Measurement ID `G-XXXXXXXXXX`.
- Create a Measurement Protocol API secret (Admin → Data Streams →
  Measurement Protocol API secrets).
- Enable Google Signals (cross-device, demographics). Required
  consent flow already handles this.
- Enable GA4 → BigQuery free export (non-reversible — do it day one).
- Enable Enhanced Measurement (scroll, outbound, search, video).
- Configure Internal Traffic filter (your office IP, any staff IPs).
- Register custom dimensions (event-scope unless noted):
  - `category_slug`
  - `category_name`
  - `subcategory_slug`
  - `subcategory_name`
  - `article_id`
  - `article_slug`
  - `author_name`
  - `is_breaking` (bool)
  - `is_editors_pick` (bool)
  - `user_tier` (user-scope)
  - `user_tenure_days` (user-scope)
  - `experiment_bucket`
  - `content_type` — story / category / home / profile / etc.
- Configure conversions: `signup_complete`, `quiz_passed`,
  `subscribe_complete`.

### Events to fire

Client-side (browser, via gtag):
- `page_view` — enriched with all content dimensions above.
- `signup_start`, `onboarding_complete`.
- `scroll` — default enhanced.
- `click` — default enhanced for outbounds.

Server-side (Measurement Protocol, fire-and-forget after DB write):
- `signup_complete`
- `verify_email_complete`
- `quiz_started`, `quiz_completed` (with `quiz_score`, `quiz_passed`)
- `article_read_complete` (with `read_seconds`, `completion_pct`)
- `comment_post`
- `bookmark_add`
- `subscribe_complete` (with `revenue`, `currency`, `plan_tier`)
- `score_earned` (with `delta`, `source`, `current_score`)

Server-side events bypass ad-blockers (~20-30% of sessions).
Critical for funnel accuracy.

### Dashboards to build in Looker Studio (free)

- "Verity traffic" — 6 tiles: users, sessions, top categories,
  top articles, traffic sources, geo.
- "Verity funnel" — signup → verified → first quiz → first pass →
  subscribe, broken out by source.
- "Verity SEO" — Search Console data, queries driving clicks,
  pages growing/shrinking.

Refresh every time you open. Free.

---

## 4. Ads — perfect placement, perfect handling

Reframing the prior gameplan into operational terms. Everything
below assumes the scale work in the previous doc is shipped
(partitioned `ad_events`, edge config, Redis caps, batched
impression writes). Skip that and none of this holds under load.

### Placement grammar (where ads are allowed)

One table, one source of truth, enforced by a DB CHECK.

`ad_placements` is the inventory. Each row says: "on `page` X
at `position` Y, a `placement_type` Z can be served, to tiers
[a,b,c], optionally filtered to categories [d,e]." The admin UI
creates these rows.

Allowed `page` values at launch: `home`, `category`, `story`,
`search`, `leaderboard`, `profile_public`.

Forbidden, enforced by CHECK constraint and CI test:
`login`, `signup`, `signup/*`, `verify-email`, `reset-password`,
`forgot-password`, `welcome`, `admin`, `admin/*`, `kids-app`,
`kids-app/*`, `error`, `not-found`, `global-error`.

### Placement-to-unit resolution (the serving path)

Runtime resolution, millisecond-bound, fully cached:

```
Ad.jsx mounts with <Ad placement="home_feed_inline" />
                         │
                         ▼
     Edge Config lookup: active placement config for this slot
                         │
                         ▼
     Candidate units list (from edge config, refreshed 60s)
                         │
                         ▼
     Filter by:
       - user_tier not in hidden_for_tiers
       - user_tier not in filtered-out tiers
       - category_slug matches target_categories (if set)
       - article_id in target_article_ids (if set)
       - now() between start_date and end_date
       - frequency cap not reached (Redis check)
                         │
                         ▼
     Weighted random pick from remaining candidates
                         │
                         ▼
     Network adapter:
       - direct → return creative URL
       - house → return creative URL
       - google_adsense → return { client_id, slot_id, format }
       - amazon / gam / prebid → return adapter config
                         │
                         ▼
     Client renders. Fires rendered + viewable + (maybe) clicked.
```

No Postgres on the hot path. 100% of the serving logic runs on
the edge. Postgres is only the source of truth behind the daily
edge config refresh.

### Targeting specificity — the "perfect placement" promise

Six axes, composable. An ad unit is eligible for a placement when
all six conditions match:

1. **Tier filter** — `user_tier NOT IN hidden_for_tiers`. Paid
   tiers see zero ads by default.
2. **Category filter** — if `target_categories` is set, user must
   be on a page where the category_slug matches.
3. **Article filter** — if `target_article_ids` is set, user must
   be on one of those articles.
4. **Device filter** — web / ios / android / any.
5. **Time window** — start_date / end_date.
6. **Frequency cap** — per-user-per-day, per-session caps not yet
   reached (Redis-backed, atomic).

This is "this category gets this ad for these users placed here"
rendered in DB fields. Your admin UI exposes all six as form
fields; targeting preview page shows the effective result per
user profile.

### The code-paste admin surface

The one page that matters for self-service: **`/admin/ads/slot/{id}`
Slot editor.** Opens the placement config. Has four tabs for
adding a new unit:

- **AdSense tab** — paste the `<ins class="adsbygoogle">` block;
  parser extracts client_id, slot_id, format, size; unit created
  with `ad_network='google_adsense'` and `network_config` jsonb.
- **Direct image** — upload/paste image URL, click URL, alt, CTA,
  weight, dates.
- **Direct HTML** — paste HTML; rendered in sandboxed iframe.
- **House** — pick from library (subscribe CTA, newsletter promo,
  download-app CTA).

Plus: weight slider, frequency caps, targeting filters (category
multi-select, article multi-select, tier checkbox group, device
checkboxes, date range).

Plus: last-24h stats inline per unit (impressions, viewable,
clicks, CTR, fill contribution) so you can see which units earn
their slot.

### The targeting preview page

`/admin/ads/preview` — "type a user profile, see what serves."

Inputs: tier (dropdown), category (dropdown), device (dropdown),
article (search + pick).

Output: for every active placement, which unit would serve (or
"no fill"), with the reason. Catches targeting misconfigurations
before users see them.

### Fraud, viewability, honesty

- **Viewability via IntersectionObserver** — `rendered` fires on
  mount; `viewable` fires at ≥50% / ≥1s (IAB MRC standard);
  `engaged` at ≥75% / ≥5s (premium).
- **Idempotency keys** — `event_id` client-generated; server
  rejects duplicates via Bloom filter + unique index.
- **Bot filtering** — `isbot` npm + header heuristics at middleware.
- **Click rate limiting** — Redis throttle: max 3 clicks per
  user per ad_unit per session.
- **Spend counter sharding** — `campaign_spend_shards` 16-way
  split, pacing uses SUM. No row-lock contention.
- **Reconciliation** — nightly cron compares own-counted
  AdSense impressions against AdSense API report (when available)
  or CSV import. Gap > 5% triggers an alert.

### Revenue & reporting

- **Per-placement RPM** computed from own impressions × imported
  AdSense RPM (for AdSense units) or campaign `rate_cents`
  (for direct).
- **Per-category revenue** — sum across placements filtered to
  that category's articles.
- **Per-tier ad exposure** — how many ads did each tier see this
  week. Verity Pro should be zero. Verity should be reduced.
  Deviation = bug.
- **Per-user ad load** — max, avg, p95 ads served to a single
  user in a day. Set an alert if p95 exceeds 20.

---

## 5. Scoring system — perfect means authoritative, auditable,
reconcilable

The Verity Score is the product's spine. Hardening it to "perfect":

### Append-only ledger — never mutate the score silently

New table `verity_score_events`:

```
verity_score_events
├── id           uuid PK
├── user_id      uuid
├── source       text — 'quiz_pass', 'read_complete',
│                       'streak_milestone', 'comment_upvoted',
│                       'achievement_unlock', 'admin_manual'
├── source_ref   uuid NULL — FK to the causing row
├── delta        int
├── score_before int
├── score_after  int
├── metadata     jsonb
├── created_at   timestamptz
```

Every score change inserts a row here AND updates
`users.verity_score` — in the same transaction, via the RPC.
Nothing in the app updates `users.verity_score` directly. A DB
trigger can prevent it: `BEFORE UPDATE ON users FOR EACH ROW
IF NEW.verity_score <> OLD.verity_score AND current_setting
('vp.source') IS NULL THEN RAISE EXCEPTION`.

### Triggers, not route-level calls

Scoring fires from DB triggers on `quiz_attempts` and
`reading_log` inserts. This guarantees the score updates even
when a future route forgets the RPC. No way to earn a quiz pass
without a score event — the trigger is the only code path.

### Idempotency

Unique index on `(user_id, source, source_ref)`. Double-submitted
quizzes, retry storms — can only create one score event.

### Reconciliation

Nightly cron:

```sql
SELECT
  u.id,
  u.verity_score AS current,
  COALESCE(SUM(e.delta), 0) AS ledger_sum
FROM users u
LEFT JOIN verity_score_events e ON e.user_id = u.id
GROUP BY u.id
HAVING u.verity_score <> COALESCE(SUM(e.delta), 0);
```

Any rows returned = drift. The cron emails the owner and writes
to `/admin/alerts`. Investigate before it spreads.

### Rate limiting — no unbounded earning

Per `score_rules.max_per_day` per user per source. Enforced via
Redis counter in the RPC, not just a SQL cap. Atomic. A user
refreshing 10k times cannot earn 10k points.

### Retroactive corrections

If `score_rules` change (e.g. "quiz_pass now earns 15 points
instead of 10"), a one-off script writes a correction event per
user for the delta. Never retroactively overwrite historical
events. The ledger remains immutable.

### Leaderboard

Materialized view refreshed every 5 min:

```sql
CREATE MATERIALIZED VIEW leaderboard_global AS
  SELECT
    id, username, avatar_url, verity_score,
    streak_current, rank() OVER (ORDER BY verity_score DESC)
  FROM users
  WHERE is_banned = false
    AND deletion_scheduled_for IS NULL
    AND verity_score > 0;
```

Refresh runs via `pg_cron` every 5 min. Queries read the view,
never the underlying aggregate. O(1) lookup.

### Streaks

Daily cron reconciles `streak_current` against reading_log
history. Heals drift caused by timezone bugs, missed runs, or
outage gaps. Never trust `streak_current` alone — always
reconcilable.

---

## 6. The audit dashboard — one page answers "how are we doing"

`/admin/dashboard` — single page, live-ish (5-min freshness),
six tiles:

**Tile 1 — Reach (last 24h / 7d / 30d)**
- Unique users (from own events, deduped via device_id)
- Sessions
- Pageviews
- New signups

**Tile 2 — Product funnel (last 7d)**
- Signups → verified → first quiz taken → first quiz passed →
  first subscribe. Each step with count + % conversion.
- Click any step to drill down by category / source.

**Tile 3 — Category health (heatmap)**
- Rows: top 10 categories by traffic.
- Columns: uniques, quiz-pass rate, comment rate, subscribe rate.
- Color-coded: green if quiz-pass rate ≥ 60%, yellow 40-60%, red
  below. Actionable gap signals.

**Tile 4 — Article gaps (list)**
- Top 20 articles with high uniques but low completion rate.
  "These articles are getting clicked but not finished — audit
  the openings."
- Alongside: top 20 articles with high completion but low
  quiz-pass rate. "These articles are confusing — audit the
  quizzes."

**Tile 5 — Monetization (last 7d)**
- Subscription revenue.
- Ad revenue (AdSense settlement + direct billed).
- Subscriber churn.
- Ad fill rate per placement.
- Avg ads served per free user (sanity check — should be < 20/day).

**Tile 6 — System health**
- API p95 latency on the hot routes (/story, /api/ads/serve,
  /api/events/batch).
- Error rate per route.
- Ad event queue depth.
- Score reconciliation drift count.
- GA4 forwarding success rate.

Every tile is a query against own Postgres + ClickHouse. None of
them depend on GA4 being up.

---

## 7. Execution order — the commits

Do these in order. Each is self-contained, shippable, reversible.

### Phase A — Foundations (1 week)

1. **`events` table, partitioned by day, wide schema from §1.**
   One migration. Keep existing `ad_impressions` in place;
   migrate it later.
2. **`verity_score_events` ledger + DB trigger on
   `quiz_attempts` / `reading_log`.** Start logging; don't
   enforce yet.
3. **Redis (Upstash) + Bloom filter for dedup.** Infrastructure
   only; wire later.
4. **`POST /api/events/batch` endpoint + `lib/track.ts` client
   helper.** With batching, beacon, dedup.
5. **CI test + DB CHECK blocking ads on forbidden pages.**
6. **Internal Traffic filter on everything** — admin/staff
   user_ids excluded from all analytics aggregates.

### Phase B — GA4 + telemetry (3-5 days)

7. **CMP install (Google Funding Choices). Consent-gated loading.**
8. **GA4 property + custom dimensions + script install + route
   listener.** gtag only; server-side MP next step.
9. **Measurement Protocol forwarding in `/api/events/batch`.**
   Server events reach GA4 without ad-blocker interference.
10. **GA4 → BigQuery export enabled.** Day one.
11. **Looker Studio "Verity traffic" + "Verity funnel"
    dashboards.**

### Phase C — Own-built analytics (1 week)

12. **ClickHouse Cloud (or BigQuery) export pipeline.** Nightly
    at first, streaming later.
13. **Materialized views:** `stats_daily_by_category`,
    `stats_daily_by_article`, `funnel_daily_by_category`,
    `retention_cohort_daily`.
14. **`/admin/analytics/overview`** — first admin dashboard
    page. Others follow one at a time.
15. **`/admin/analytics/categories`** — the category heatmap
    you asked for.
16. **`/admin/analytics/articles`** — per-article depth.
17. **`/admin/analytics/funnels`** — conversion paths.
18. **`/admin/analytics/retention`** — D1/D7/D30 curves.

### Phase D — Ads at scale (1-2 weeks)

19. **Schema extensions:** `ad_units.ad_network` enum, `network_config`,
    `target_categories`, `target_article_ids`.
20. **`AdSenseSlot` subcomponent + dispatch in `Ad.jsx`.**
21. **`ads.txt` + AdSense script + consent-gated loading.**
22. **Edge Config for placement/unit config** — nightly refresh,
    zero Postgres reads on hot path.
23. **Redis frequency caps.**
24. **IntersectionObserver viewability.**
25. **Spend-counter sharding.**
26. **`/admin/ads/slot/{id}` slot editor** (the code-paste UI).
27. **`/admin/ads/preview` targeting preview.**
28. **`/admin/analytics/ads`** — monetization dashboard.

### Phase E — Scoring hardening (3-5 days)

29. **Enforce ledger-only mutations** — trigger blocks direct
    `users.verity_score` updates outside the RPC.
30. **Nightly reconciliation cron** — ledger sum vs current score.
    Alerts on drift.
31. **Redis rate limits on score earning.**
32. **Leaderboard materialized view + 5-min refresh.**
33. **Streak daily reconciliation cron.**

### Phase F — Ongoing (week after launch, forever)

34. **Load test with k6** — simulate 10k concurrent users refreshing
    home. Measure P95 latency under load. Fix whatever breaks.
35. **SLO alerts** — Datadog or Grafana. Fill rate, latency, error
    rate, throughput drop, score drift.
36. **Weekly reconciliation** — own ad counts vs AdSense CSV.
    Gap > 5% investigated.
37. **Quarterly dimension audit** — unused GA4 custom dimensions
    dropped; new product concepts added.

---

## 8. The boundaries (never cross these)

- **Analytics never writes product state.** GA4 cannot update a
  Verity Score. A ClickHouse query cannot trigger a badge unlock.
- **Ad systems never write analytics.** AdSense cannot be the
  source for pageview counts.
- **Kids surfaces ship zero SDKs.** No GA4, no ads, no third-party
  script ever. Enforced by CSP header on `/kids-app/*` and by
  absence of SDK imports in `VerityPostKids/`.
- **Admin reads never appear in analytics aggregates.** Filtered
  by user_id at the query layer.
- **Consent denial degrades GA4, never product.** If a user opts
  out, GA4 gets nothing. Your DB keeps everything it needs for
  product function (legal basis: contract).
- **AdSense impressions never count toward the Verity Score.**
  Earning is from reading and quizzes. Always.
- **Real-time revenue doesn't exist.** AdSense lags 24-48h. Your
  dashboard must be honest about that.

---

## 9. The costs

At 10M events/month (realistic 6-month target):

| Service | Purpose | ~Monthly cost |
|---|---|---|
| Upstash Redis | Frequency caps, dedup, rate limits | $10-50 |
| ClickHouse Cloud (or BigQuery) | Analytics store | $50-200 |
| Vercel Edge Config | Ad config cache | included |
| Sentry | Error tracking | $26 (team tier) |
| Datadog or Grafana Cloud | Observability | $0-100 |
| Google Funding Choices | CMP | free |
| GA4 | Traffic analytics | free |
| AdSense | Ad serving | revenue share |
| Looker Studio | Dashboards | free |

Total infra: **$100-400/month pre-revenue.** Scales with traffic.

---

## 10. The short answer to "without GA4"

**Build both. Don't pick.**

- **GA4** is free, is the language every marketer / advertiser /
  journalism grant committee speaks, plus gets you Search Console
  integration for SEO.
- **Own-built (events → ClickHouse → admin pages)** is where the
  product truth lives, where privacy is clean, where ad-blockers
  don't blind you, and where your dashboards answer
  product-semantic questions GA4 can't.

They share the same event stream. Instrumentation is done once.
Either lens can go down and the other still works.

If you had to pick one: **own-built.** Because the product's
differentiators — the scoring system, the quiz gating, the
tier-aware ad load, the per-category pass rates — are all
product-semantic. GA4 doesn't know what a Verity Score is and
never will.

But GA4 is essentially free and answers different questions. Do
both.

---

## What ships first

Three commits in the first week, no matter what:

1. **`events` table + batch endpoint + client helper.** Everything
   downstream needs this.
2. **`verity_score_events` ledger + trigger.** The product-spine
   insurance policy.
3. **CMP + GA4 script + route pageview listener.** Traffic
   numbers visible by end of week.

Say go and the ledger migration is the first commit.
