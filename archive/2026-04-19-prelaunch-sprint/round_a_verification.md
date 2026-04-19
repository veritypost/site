# Round A — verification checklist

Run every block after `092_rls_lockdown.sql` commits AND after the
caller-changes PR ships. Each issue has its own SQL + live-curl /
manual section so the round can be verified one concern at a time.

All SQL runs against the live DB as the `postgres` role (service-role
psql or Supabase SQL editor). All curl runs against the dev server on
`localhost:3000` or the staging deploy.

---

## C-03 — public.users PII lockdown

**SQL.**

```sql
-- 1. View exists, SECURITY INVOKER.
SELECT schemaname, viewname, definition ~ 'security_invoker'
FROM pg_views WHERE viewname = 'public_user_profiles';
-- expect: one row, boolean true.

-- 2. View grants: anon + authenticated have SELECT.
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='public_user_profiles';
-- expect: anon SELECT, authenticated SELECT.

-- 3. anon lost SELECT on PII columns.
SELECT column_name FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='users' AND grantee='anon'
  AND column_name IN ('email','phone','date_of_birth','stripe_customer_id',
                      'parent_pin_hash','kids_pin_hash','last_login_ip',
                      'failed_login_count','locked_until','password_hash',
                      'metadata','first_name','last_name');
-- expect: 0 rows.

-- 4. Column default flipped.
SELECT column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='users' AND column_name='profile_visibility';
-- expect: 'private'::character varying.

-- 5. Civilians backfilled to private. Staff remain public.
SELECT profile_visibility, COUNT(*) FROM public.users GROUP BY profile_visibility;
-- expect: 'public' ~8 (staff), 'private' ~40 (civilians).

-- 6. A freshly inserted civilian user defaults to private.
-- (Run as service-role; read-only check on default behavior.)
SELECT column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='users' AND column_name='profile_visibility';
```

**Curl / manual.**

- `curl -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" "https://<project>.supabase.co/rest/v1/users?select=email&limit=1"`
  - expect: `{ "code": "42501", ... }` or empty array (PostgREST drops
    unreadable columns silently in some configs — the explicit request
    for `email` must fail).
- `curl ... "https://<project>.supabase.co/rest/v1/public_user_profiles?select=*&limit=1"`
  - expect: row with 8 whitelisted columns only.
- Browser: open `/card/<staff-username>` in incognito — expect full
  card. Open `/card/<civilian-username>` in incognito — expect private
  / reduced render (after caller-change #9 ships).
- Browser: signed-in visit to `/u/<civilian-username>` (where viewer
  is NOT the target and NOT admin) — expect not-found / private state.

---

## C-05 — authorization-table CRUD

**SQL.**

```sql
-- authenticated has SELECT only on the six tables.
SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.table_privileges
WHERE table_schema='public' AND grantee='authenticated'
  AND table_name IN ('user_roles','user_permission_sets','roles','permissions','permission_sets','plans')
GROUP BY table_name;
-- expect: each row's privs = 'SELECT'.

-- has_table_privilege for each INSERT/UPDATE/DELETE.
SELECT has_table_privilege('authenticated','user_roles','INSERT'),
       has_table_privilege('authenticated','permissions','INSERT'),
       has_table_privilege('authenticated','plans','UPDATE'),
       has_table_privilege('authenticated','permission_sets','DELETE');
-- expect: four false.
```

**Manual.**

- Sign in as a non-admin test user.
- From the browser devtools console on any page: `await supabase.from('user_roles').insert({ user_id: '<self>', role_id: '<admin-role-id>', assigned_by: '<self>' })` — expect `permission denied for table user_roles`.
- Admin UI: visit `/admin/users` as owner/admin, change a user's role via the new service-role API. Verify the role flips (read back via SELECT, which still works).

---

## C-06 — audit_log forgery

**SQL.**

```sql
-- INSERT revoked from authenticated.
SELECT has_table_privilege('authenticated','audit_log','INSERT');
-- expect: false.

-- Policy body is now false.
SELECT with_check FROM pg_policies WHERE tablename='audit_log' AND policyname='audit_log_insert';
-- expect: 'false'.
```

**Manual.**

- Authenticated session: `await supabase.from('audit_log').insert({ actor_id: '00000000-0000-0000-0000-000000000001', action: 'forge', target_type: 'user', target_id: 'x' })` — expect `permission denied`.
- Happy path: sign up a brand-new user through `/signup` — confirm the `auth:signup` audit row lands (written via service).
- Happy path: admin UI grace-period extend (touching `insertBillingAudit`) — confirm audit row lands via the new service-route.

---

## H-07 — anon EXECUTE on auth helpers

**SQL.**

```sql
-- 0 rows expected for anon.
SELECT routine_name FROM information_schema.routine_privileges
WHERE routine_schema='public' AND grantee='anon'
  AND routine_name IN ('is_admin_or_above','is_editor_or_above','is_mod_or_above',
                       'is_paid_user','is_premium','user_has_role','has_permission',
                       'has_permission_for','my_permission_keys','get_my_capabilities',
                       'has_verified_email','is_banned');
-- expect: 0 rows.

-- authenticated still holds EXECUTE.
SELECT COUNT(*) FROM information_schema.routine_privileges
WHERE routine_schema='public' AND grantee='authenticated'
  AND routine_name IN ('is_admin_or_above','is_editor_or_above','is_mod_or_above',
                       'is_paid_user','is_premium','user_has_role','has_permission',
                       'has_permission_for','my_permission_keys','get_my_capabilities',
                       'has_verified_email','is_banned');
-- expect: 12.
```

**Curl.**

- `curl -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -X POST "https://<project>.supabase.co/rest/v1/rpc/is_admin_or_above" -H "Content-Type: application/json" -d '{}'`
  - expect: 403 / function not executable.
- Same curl with an authenticated JWT in the Authorization header —
  expect: `false` (the caller is not an admin, but the RPC succeeds).

---

## H-20 — perms_global_version

**SQL.**

```sql
-- RLS enabled.
SELECT relrowsecurity FROM pg_class WHERE relname='perms_global_version';
-- expect: true.

-- Writes revoked from authenticated.
SELECT string_agg(privilege_type, ',') FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='perms_global_version' AND grantee='authenticated';
-- expect: 'SELECT' (or NULL if SELECT was also revoked elsewhere).

-- DEFINER bumper still callable by service.
SELECT has_function_privilege('service_role','public.bump_perms_global_version()','EXECUTE');
-- expect: true.
```

**Manual.**

- Authenticated session (signed-in test user), devtools console:
  `await supabase.from('perms_global_version').update({ version: 999 }).eq('id', 1)` —
  expect permission denied.
- Trigger a legitimate global bump by having an admin grant a perm
  (via `/admin/permissions`). Watch the global version monotone
  increment via `select version from perms_global_version;` (as
  service).

---

## M-16 — webhook_log insert

**SQL.**

```sql
SELECT has_table_privilege('authenticated','webhook_log','INSERT');
-- expect: false.

SELECT with_check FROM pg_policies WHERE tablename='webhook_log' AND policyname='webhook_log_insert';
-- expect: 'false'.
```

**Manual.**

- Stripe webhook replay (staging Stripe CLI): confirm row lands in
  `webhook_log` (writer is service-role, unaffected by revoke).
- Authenticated session: `await supabase.from('webhook_log').insert({ event_type: 'forge' })` — expect deny.

---

## N-01 — 12 RLS-no-policy tables

**SQL — all 12 in one shot.**

```sql
SELECT c.relname,
       c.relrowsecurity AS rls,
       (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename=c.relname) AS policy_count,
       (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
          FROM information_schema.table_privileges tp
         WHERE tp.table_name=c.relname AND tp.grantee='authenticated') AS authed_privs
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('behavioral_anomalies','bookmark_collections','category_supervisors',
                    'comment_context_tags','expert_queue_items','family_achievement_progress',
                    'family_achievements','sponsored_quizzes','user_warnings',
                    'weekly_recap_attempts','weekly_recap_questions','weekly_recap_quizzes')
ORDER BY c.relname;
```

Expected per table:

| table | rls | policies | authed_privs |
|---|---|---|---|
| behavioral_anomalies | true | 0 | NULL |
| bookmark_collections | true | 1 | SELECT |
| category_supervisors | true | 1 | SELECT |
| comment_context_tags | true | 3 | SELECT |
| expert_queue_items | true | 0 | NULL |
| family_achievement_progress | true | 1 | SELECT |
| family_achievements | true | 0 | NULL |
| sponsored_quizzes | true | 0 | NULL |
| user_warnings | true | 1 | SELECT |
| weekly_recap_attempts | true | 2 | INSERT,SELECT |
| weekly_recap_questions | true | 0 | NULL |
| weekly_recap_quizzes | true | 0 | NULL |

**Curl / manual.**

- Signed-in test user (paid plan) visits `/bookmarks` — expect
  collections render.
- Signed-in test user visits `/appeal` — expect own warnings render,
  warnings from other users do NOT.
- Moderator test user visits `/admin/moderation` — expect pending
  appeals list renders.
- Signed-in test user visits `/profile/settings` → Category
  Supervisor section — expect own opt-in/opt-out state renders.
- Signed-in test user visits a story page with comments — expect the
  comment context-tag "I found this helpful" marker on own-tagged
  comments renders.
- Expert test user uses the web `/expert/queue` (via API) — expect
  items render. iOS ExpertQueueView: verify the app now calls the API
  route; direct table read should 42501 until that caller is updated.
- Any signed-in user tries in devtools:
  `await supabase.from('behavioral_anomalies').select('*')` —
  expect 0 rows (RLS deny + revoked grant).
- Signed-in user tries: `await supabase.from('sponsored_quizzes').insert({ title: 'x' })` — expect permission denied.

---

## N-02 — privileged column write primitives

**SQL.**

```sql
-- authenticated lost INSERT/UPDATE on the five columns.
SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='users' AND grantee='authenticated'
  AND column_name IN ('parent_pin_hash','kids_pin_hash','failed_login_count','locked_until','last_login_ip')
  AND privilege_type IN ('INSERT','UPDATE');
-- expect: 0 rows.

-- Trigger body now mentions all five columns.
SELECT prosrc ~ 'parent_pin_hash'    AS p,
       prosrc ~ 'kids_pin_hash'      AS k,
       prosrc ~ 'failed_login_count' AS f,
       prosrc ~ 'locked_until'       AS l,
       prosrc ~ 'last_login_ip'      AS i
FROM pg_proc WHERE proname='reject_privileged_user_updates';
-- expect: all true.
```

**Manual.**

- Signed-in test user, devtools:
  `await supabase.from('users').update({ failed_login_count: 0 }).eq('id', '<self>')` —
  expect permission denied (first by column grant, second by trigger).
- Signed-in test user tries `await supabase.from('users').update({ locked_until: null }).eq('id', '<self>')` —
  expect deny.
- Happy path: log in via `/login` — confirm `last_login_ip` and
  `last_login_at` update for the session (written via service-role;
  verify the caller change in `api/auth/login/route.js` landed).
- Happy path: set a parent PIN through `/profile/kids` → confirm
  `parent_pin_hash` updates (via the existing `/api/kids/set-pin`
  route which already runs on service).

---

## Global smoke (run last)

- Re-run Supabase `get_advisors` (category=security) — expect the
  `policy_exists_rls_disabled` / `rls_enabled_no_policy` rows for the
  12 N-01 tables + `perms_global_version` to disappear.
- Home, nav, notifications, messages, leaderboard, story, card,
  profile, settings — visit each as (a) anon, (b) signed-in free user,
  (c) signed-in paid user, (d) admin. Compare against pre-deploy
  baseline for any new console errors or empty-state regressions.
- Sign up a brand-new user end-to-end (email-confirm flow) — confirm
  the users row, user_roles row, and audit_log signup row all land.
- Run the Stripe webhook test event — confirm webhook_log row lands
  and `handleCheckoutCompleted` path still updates `stripe_customer_id`
  via service.
