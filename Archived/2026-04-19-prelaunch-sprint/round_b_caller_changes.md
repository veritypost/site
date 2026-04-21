# Round B — caller code changes

Every caller touched before, during, or after the `093_rpc_actor_lockdown.sql`
deploy. Only **one** web-route file needs a code edit. The remaining
10 RPCs are called exclusively by server routes that already use the
service-role client, so `REVOKE EXECUTE FROM authenticated` is a
no-op for their happy path while closing the attack surface.

Count of unique caller files touched: **1** (`site/src/app/api/support/route.js`).

Ship order: the caller edit and the migration must land in the **same**
deploy. If the migration lands first, the support route breaks
(old 5-arg RPC signature removed). If the caller lands first, the
3-arg RPC does not exist yet (42883 undefined_function).

---

## WITH-MIGRATION (must ship atomically with 093_rpc_actor_lockdown.sql)

### 1. `/site/src/app/api/support/route.js` — drop p_user_id + p_email

Lines 38-44. Triggered by: C-04 (spoofable p_user_id), M-14
(caller-supplied p_email stored on the ticket).

Current:
```js
const { data: ticket, error: rpcErr } = await supabase.rpc('create_support_ticket', {
  p_user_id:  user.id,
  p_email:    user.email,
  p_category: category,
  p_subject:  subject,
  p_body:     description,
});
```

Required (new 3-arg signature; the RPC body now reads `auth.uid()`
and the caller's email from `public.users` internally):
```js
const { data: ticket, error: rpcErr } = await supabase.rpc('create_support_ticket', {
  p_category: category,
  p_subject:  subject,
  p_body:     description,
});
```

Why: the RPC now gets the user id from `auth.uid()` and the canonical
email from `public.users WHERE id = auth.uid()`. Dropping
`p_user_id` closes C-04 (no spoofable actor arg). Dropping `p_email`
closes M-14 (staff replies always go to the verified account email
on file, never to an attacker-controlled string).

Prerequisite: `/api/support` already calls the RPC on a session-bound
Supabase client (`createClientFromToken(token)` or cookie-bound
`createClient()`), so `auth.uid()` resolves inside the RPC body.
Confirmed at `site/src/app/api/support/route.js:19`:
```js
const supabase = token ? createClientFromToken(token) : await createClient();
```
No client-swap needed.

---

## NO CHANGE REQUIRED (service-role callers — migration is a no-op for them)

The 10 RPCs below are revoked from `authenticated` but stay granted
to `service_role`. Every caller listed here already uses
`createServiceClient()`, so the revoke silently tightens the
attack surface without touching happy-path behaviour.

### 2. `/site/src/app/api/family/weekly-report/route.js` — family_weekly_report

Line 22. Uses `createServiceClient()`.
```js
const { data, error } = await service.rpc('family_weekly_report', { p_owner_id: ownerId });
```
No change. Service role keeps EXECUTE.

### 3. `/site/src/app/api/family/leaderboard/route.js` — family_members

Line 26. Uses `createServiceClient()`.
```js
const { data, error } = await service.rpc('family_members', { p_owner_id: ownerId });
```
No change. Service role keeps EXECUTE.

### 4. `/site/src/app/api/reports/weekly-reading-report/route.js` — weekly_reading_report

Line 18. Uses `createServiceClient()`.
```js
const { data, error } = await service.rpc('weekly_reading_report', { p_user_id: user.id });
```
No change. Service role keeps EXECUTE.

### 5. `/site/src/app/api/cron/check-user-achievements/route.js` — check_user_achievements

Line 42. Uses `createServiceClient()`.
```js
const { data } = await service.rpc('check_user_achievements', { p_user_id: uid });
```
No change. Cron path — service role keeps EXECUTE.

### 6. `/site/src/lib/scoring.js` — check_user_achievements (scoring pipeline)

Line 56. Helper accepts the service client from callers.
```js
const { data, error } = await service.rpc('check_user_achievements', { p_user_id: userId });
```
No change. All call sites (quiz submit, reading complete, comment
post scoring paths) pass in a service-role client.

### 7. `/site/src/app/api/conversations/route.js` — start_conversation

Line 28. Uses `createServiceClient()`.
```js
const { data, error } = await service.rpc('start_conversation', {
  p_user_id: user.id,
  p_other_user_id: other_user_id,
});
```
No change. Service role keeps EXECUTE, and `user.id` is resolved
server-side from `requirePermission('messages.dm.compose')` — a
signed-in attacker cannot supply a different `p_user_id` because
the route ignores the request body for that field.

### 8. `breaking_news_quota_check` — no JS caller

Zero hits in `site/src` or `VerityPost/` for `rpc('breaking_news_quota_check'`.
Only consumer is `public.create_notification` (DEFINER, owned by
postgres). No caller edit. The `scripts/preflight.js:181` reference
is a smoke-test existence check (calls `pg_proc` not the RPC) —
leave untouched.

### 9. `_user_freeze_allowance` — no JS caller

Zero hits in `site/src` or `VerityPost/`. Only consumer is
`public.advance_streak` (DEFINER). No caller edit.

### 10. `user_article_attempts` — no JS caller

Zero hits in `site/src` or `VerityPost/`. Only consumers are
`public.article_quiz_pool_size` and `public._next_attempt_number`
(both DEFINER). `scripts/preflight.js:135` is a smoke-test catalog
probe; leave untouched. No caller edit.

### 11. `user_has_dm_access` — no JS caller

Zero hits in `site/src` or `VerityPost/`. Only consumers are
`public.post_message`, `public.start_conversation` (both DEFINER).
No caller edit.

### 12. `can_user_see_discussion` — no JS caller

Zero hits in `site/src` or `VerityPost/` apart from the
`types/database.ts` auto-generated type declaration (which does not
invoke anything). No caller edit.

---

## AFTER (optional hygiene, non-blocking)

### 13. Regenerate `/site/src/types/database.ts`

Not a runtime-blocking change. The regenerated file will drop the
`p_user_id` and `p_email` args from the `create_support_ticket`
type, and drop `authenticated` from the permissions on the 10
revoked RPCs. Safe to ship in a follow-up PR if Round B's window
is tight.

Command:
```bash
npx supabase gen types typescript --project-id <ref> > site/src/types/database.ts
```

---

## Shipping order checklist

1. Land caller edit #1 (support route) + migration 093 in the same
   atomic deploy/commit. Preferred: single PR titled
   `Round B — RPC actor-spoof lockdown (C-04, M-14)`.
2. Run SQL verification queries V1-V4 from the migration file.
3. Run probe scripts P1-P9 against the live DB as an authenticated
   Postgres role. All spoof attempts must 42501. The new
   `create_support_ticket(text, text, text)` call with a valid
   session must succeed and the resulting `support_tickets.email`
   must equal `users.email` for the caller's `auth.uid()`.
4. Smoke:
   - Log in as a free user, open `/profile/settings` → submit a
     support ticket → 200, email field in Supabase dashboard on the
     new row matches the account's email.
   - Log in as a family-plan owner, load `/family` → weekly report +
     leaderboard render (both still service-role routes, no regression).
   - Log in as a paid user, open `/messages` → compose a new DM
     to another user → conversation created via
     `/api/conversations` (no regression).
   - Run `node scripts/smoke-v2.js` — `family_members` check at
     line 200 must still pass because the script runs as
     service-role.
5. If anything fails, the single roll-back is: restore the
   `create_support_ticket(uuid, text, text, text, text)` overload
   and re-grant the 10 REVOKEd EXECUTEs to `authenticated`. All
   other code paths are untouched.
