# Owner next-actions — four sequential commits just shipped

The code for commits #1, #2, and #4 from the master-plan Phase A/B/D/E
sequence is merged. Commit #3 (pg_cron enablement) is entirely an
owner-side Supabase dashboard action. Everything below is what you
still need to do manually for the work to take effect.

---

## #1 — Apply `schema/109_verity_score_events.sql`

Supabase → SQL Editor → paste the file → Run.

**Verify:**
```sql
-- 1. Ledger table exists.
SELECT count(*) FROM public.verity_score_events;
-- (returns a number; if zero users had nonzero scores, zero is fine)

-- 2. Backfill seeded a row per user with nonzero score.
SELECT source, count(*) FROM public.verity_score_events
  GROUP BY source;
-- (expect: backfill_initial with one row per user with score > 0)

-- 3. Reconciliation returns no drift.
SELECT * FROM public.reconcile_verity_scores();
-- (expect: empty result set)

-- 4. RPC is callable.
SELECT public.increment_verity_score(
  '00000000-0000-0000-0000-000000000000'::uuid,
  'test', 0
);
-- (expect: {"ok":true,"noop":true,"reason":"zero_delta"})
```

---

## #2 — Apply `schema/110_adsense_adapter.sql`

Supabase → SQL Editor → paste → Run. Updates `serve_ad` RPC to include
`ad_network` + `ad_network_unit_id` in its response.

**Verify:**
```sql
-- Function body mentions ad_network in its SELECT list.
SELECT prosrc FROM pg_proc WHERE proname = 'serve_ad';
-- (expect: output includes 'ad_network' near the jsonb_build_object).
```

No ads will actually render differently yet — the dispatch path is
live in Ad.jsx, but until you have an AdSense publisher ID + created
ad_unit rows with `ad_network='google_adsense'`, only direct/house
paths fire.

---

## #3 — Enable `pg_cron` (optional; partition auto-maintenance)

Without pg_cron, schema/108's `events` table still works — but
tomorrow's partition and old-partition drops don't auto-run.

Supabase → Database → **Extensions** → search `pg_cron` → **Enable**.

Then re-run `schema/108_events_pipeline.sql` in SQL Editor (it's
idempotent). The DO block detects pg_cron this time and registers the
two jobs (`events-create-next-partition`, `events-drop-old-partitions`).

**Verify:**
```sql
SELECT jobname, schedule FROM cron.job
  WHERE jobname LIKE 'events-%';
-- (expect two rows)
```

If you don't enable pg_cron, remember to run this once a week:
```sql
SELECT public.create_events_partition_for(current_date + 1);
SELECT public.drop_old_events_partitions(90);
```

---

## #4 — AdSense publisher ID + ads.txt

**When AdSense approves the domain (apply.google.com/adsense):**

1. Copy the publisher ID (`ca-pub-xxxxxxxxxxxxxxxx`).
2. Vercel → Settings → Environment Variables → add
   `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=ca-pub-xxxxxxxxxxxxxxxx`.
3. Edit `web/public/ads.txt`: uncomment the line and replace
   `REPLACE_WITH_REAL_ID` with the real pub ID.
4. Commit + push ads.txt.
5. Vercel will redeploy. The adsbygoogle.js script starts loading on
   every page. Existing ad_units with `ad_network != 'google_adsense'`
   keep serving their direct/house creative.
6. Create AdSense ad units in the AdSense console — one per placement
   you want to monetize (home_feed_inline, article_bottom, etc.).
7. In Verity admin `/admin/ad-placements`, create ad_unit rows with
   `ad_network='google_adsense'`, `ad_network_unit_id=<slot-id-from-
   AdSense>`, approval_status='approved'.
8. Navigate to the placement, confirm AdSense fills the slot.

**Verify:**
- DevTools Network tab shows `pagead2.googlesyndication.com/.../adsbygoogle.js`
  loading on every page.
- `curl https://veritypost.com/ads.txt` returns the correct pub line.
- `/admin/ad-placements` shows the AdSense units rendering fill stats
  in the admin impression counters.

---

## Already done (no action needed)

- `schema/108_events_pipeline.sql` applied (events table, partitions,
  RLS, helper functions).
- GA4 measurement ID `G-NE37VG1FP6` hardcoded fallback in `layout.js`;
  pageviews already firing on every route.
- `EVENT_HASH_SALT` set in Vercel prod env.
- First `track()` call sites wired across home / story / category /
  leaderboard / search / browse / login / signup / welcome, plus quiz
  events and signup/onboarding server events.

---

## Once all four above are done

The measurement + monetization foundations are in place. Next wave
(still pending prioritization):

- `reading_log` trigger for read-complete scoring.
- `max_per_day` rate-limit enforcement inside `increment_verity_score`.
- Enable the guard BEFORE-UPDATE trigger once legacy direct-update
  call sites are migrated to the RPC.
- CMP (Google Funding Choices) for consent-gated AdSense + GA4 loading.
- `/admin/analytics/*` dashboard pages (overview / categories /
  articles / funnels).
- Server-side GA4 Measurement Protocol forwarding so server events
  reach GA4 even when client ad-blockers swallow the browser tag.
- AdSense slot editor inside `/admin/ads/slot/{id}` with a paste tab
  for pasting `<ins class="adsbygoogle">` snippets straight from the
  AdSense console.

Say go on any of these and they ship next.
