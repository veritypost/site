# C.26 — 14-Table RLS Classification Draft

Per owner-locked decision (option a, 2026-04-25): I draft the per-table posture, owner spot-checks + greenlights, then I write a single migration with all the policies.

## Posture vocabulary

- **owner-only** — only the user who owns the row reads/writes; admins read all
- **read-public** — anyone (including anon) can SELECT; only service role writes
- **service-role-only** — no public access of any kind; backend writes via service client only
- **kid-aware-owner** — owner-only with an extra branch accepting kid JWT when `kid_profile_id = auth.uid()` and `is_kid_delegated()`

## The 14 tables (RLS enabled, zero policies)

The audit didn't enumerate which 14 — let me actually look them up. **Owner: please run this query and paste the result so the classifier sees the real list. The `RLS_14_CLASSIFICATION.md` file the audit wrote may already have the names; I'll merge with current state.**

```sql
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
  )
ORDER BY c.relname;
```

## Classification heuristic (owner: confirm or override per row)

| Pattern | Posture |
|---|---|
| Has `user_id` FK, user owns the row | **owner-only** |
| Has `kid_profile_id`, kid app reads/writes | **kid-aware-owner** |
| Reference / lookup data (lists of plans, score_rules, email_templates, etc.) | **read-public** |
| System / observability (webhook_log, pipeline_runs, audit_log mirrors) | **service-role-only** |
| Aggregate counters maintained by triggers (counts, leaderboards) | **read-public** |

## Once owner pastes the table list

I'll produce `schema/174_ext_audit_rls_14_tables.sql` with one `CREATE POLICY ...` block per table using the heuristic above plus any per-row override the owner gives.

**Owner action:** paste the SQL result here and any "this one should be different" notes.
