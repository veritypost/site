# Consolidated SQL — 2026-04-23

One SQL block covering every pending DB change from Wave 1 + Wave 2. Owner
pastes the ENTIRE block in Supabase SQL editor in a single transaction.

## What's in this bundle

| File | Purpose | Status before bundle | Status after |
|---|---|---|---|
| `schema/144_drop_orphan_tables.sql` | Drops 9 confirmed-dead 0-row tables (Wave 2 Stream 3) | Not yet authored — body inlined below | Bundled, ready to apply |

That's the only pending migration. Other items investigated this session:

| Item | Status |
|---|---|
| `schema/106_kid_trial_freeze_notification.sql` | **Already applied in prod** — verified via MCP `pg_get_functiondef` matches file 1:1. FIX_SESSION_1 entry `00-M` is stale; mark SHIPPED. |
| `schema/142_profile_leaderboard_consensus_ship.sql` | Shipped 2026-04-22 (`62077f0`). |
| `@admin-verified` marker bumps (77 files) | Code-only; no SQL impact. Awaiting commit per OWNER_QUESTIONS.md §6.4. |
| Color-token sweep (this session, C10) | Code-only; no SQL impact. |

## Verification before applying

Run this one-liner first to confirm prod still matches Wave 2 Stream 3 findings
(should return exactly 9 rows, all with `rows = 0`):

```sql
SELECT table_name,
       (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = table_name) AS rows
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN (
     'access_code_uses', 'behavioral_anomalies', 'campaign_recipients',
     'cohort_members', 'consent_records', 'device_profile_bindings',
     'translations', 'sponsored_quizzes', 'expert_discussion_votes'
   )
 ORDER BY table_name;
```

If any row count > 0, **stop**. Open OWNER_QUESTIONS.md §1.1 and reply
before proceeding.

---

## The migration block (paste this)

```sql
-- 144_drop_orphan_tables.sql
--
-- Drop the 9 confirmed-dead 0-row tables surfaced by Wave 2 Stream 3
-- (Sessions/04-23-2026/Session 1/ORPHAN_TABLE_TRIAGE.md).
--
-- Each table:
--   - 0 rows in prod (verified via MCP `pg_stat_user_tables`)
--   - No code refs in `web/src/`, `VerityPost/`, `VerityPostKids/`
--   - No incoming FKs (only outbound to `users`, `kid_profiles`, etc.)
--   - All FKs are outbound, so drop order is irrelevant
--
-- `device_profile_bindings` was the storage target of the 7 dead RPCs
-- already removed in `schema/140_drop_dead_rpcs.sql`; dropping it here
-- finishes that cleanup.
--
-- `search_history` (also 0-row) is intentionally NOT dropped because
-- `Future Projects/views/web_search.md` references it as the planned
-- read target. Keep until that project ships or is itself scrapped.
--
-- Idempotent: every drop is `IF EXISTS`. Safe to re-run.

BEGIN;

DROP TABLE IF EXISTS public.access_code_uses;
DROP TABLE IF EXISTS public.behavioral_anomalies;
DROP TABLE IF EXISTS public.campaign_recipients;
DROP TABLE IF EXISTS public.cohort_members;
DROP TABLE IF EXISTS public.consent_records;
DROP TABLE IF EXISTS public.device_profile_bindings;
DROP TABLE IF EXISTS public.expert_discussion_votes;
DROP TABLE IF EXISTS public.sponsored_quizzes;
DROP TABLE IF EXISTS public.translations;

COMMIT;
```

---

## Verification after applying

Re-run the pre-flight query — should now return **0 rows** (all 9 tables gone):

```sql
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN (
     'access_code_uses', 'behavioral_anomalies', 'campaign_recipients',
     'cohort_members', 'consent_records', 'device_profile_bindings',
     'translations', 'sponsored_quizzes', 'expert_discussion_votes'
   );
```

Expected output: empty result set.

Also confirm `search_history` survived (it's the KEEP-DEFERRED row):

```sql
SELECT count(*) AS still_present
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'search_history';
```

Expected output: `still_present = 1`.

---

## Rollback

If you change your mind within the same SQL session, use `ROLLBACK;` instead
of `COMMIT;` above — none of the drops are visible until commit.

After commit, recovery requires PITR. The 9 tables had 0 rows so nothing of
value would be lost; the only cost is recreating the schema. The original
DDL for each is preserved in `schema/reset_and_rebuild_v2.sql`. Cheaper to
re-author from there than to PITR if rollback is ever needed.

---

## After applying — agent follow-ups (next session)

1. Author `schema/144_drop_orphan_tables.sql` containing the migration body
   above (matches what was actually applied).
2. Author `schema/145_rollback_144.sql` recreating the 9 tables from
   `reset_and_rebuild_v2.sql` excerpts.
3. Update `Reference/STATUS.md` table count (currently "100+ tables").
4. Update `web/src/types/database.ts` via
   `mcp__supabase__generate_typescript_types`.
5. Add SHIPPED block to FIX_SESSION_1 next available item slot (or
   create a new item: "Drop 9 orphan tables — Wave 2 Stream 3 follow-up").
6. Mark FIX_SESSION_1 `00-M` as SHIPPED 2026-04-23 (per OWNER_QUESTIONS.md
   §2.2 — `freeze_kid_trial` already live, entry was stale).
