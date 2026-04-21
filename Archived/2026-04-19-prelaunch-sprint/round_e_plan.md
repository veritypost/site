# Round E plan — auth + signup integrity

Source of truth: `_prelaunch_attack_plan.md` Round E; `_prelaunch_master_issues.md` H-01, H-02, H-08, H-22, N-03.

Audit date: 2026-04-19. Live DB: `fyiwulqphgmoqullmrfn`.

Context: Round A (`round_a_caller_changes.md`) already reworked `/api/auth/signup` so the post-`signUp()` writes to `users`, `user_roles`, and `audit_log` go through `createServiceClient()`. The OAuth callback route has NOT been updated yet on disk; Round A's doc schedules that swap to ride along with the 092 migration. This plan treats the signup side as resolved and the OAuth side as still open.

---

## Summary of dispositions

| Issue | Disposition |
|---|---|
| H-01 | Resolved by Round A caller change — service-role upsert now persists `display_name` + `metadata.terms_accepted_at` on the confirm-email branch. No further code change required. Verify only. |
| H-02 | Partially resolved — `auth_providers` insert is scheduled to switch to service-role as part of Round A's callback swap. Round E tracks follow-through: the callback route on disk still uses the caller client. Do the swap here if Round A has not shipped the callback update by the time Round E migration lands. |
| H-08 | Open — `handleCheckoutCompleted` has JS-level null check only. Add SQL-level `.is('stripe_customer_id', null)` filter to close the replay race. |
| H-22 | Verified safe live — `handle_new_auth_user` body does not read `raw_user_meta_data`. Ship a one-line comment in the 094 migration noting the 2026-04-19 audit. |
| N-03 | Open — add explicit owner-exists guard at the top of the trigger so a future `truncate public.users` or dev-DB replay cannot auto-promote the next signup. |

H items already resolved by Round A: **H-01 fully; H-02 partially (still contingent on the callback-route swap shipping).**

---

## H-01 — signup `display_name` + `terms_accepted_at` persistence

### Current state (post-Round-A)

`/Users/veritypost/Desktop/verity-post/site/src/app/api/auth/signup/route.js` lines 54–67 already route the `users.upsert` through `createServiceClient()`, and the payload writes `display_name` plus `metadata.terms_accepted_at`, `metadata.terms_version`, `metadata.age_confirmed_at`. Service role bypasses RLS, so the caller `auth.uid()` null problem on the confirm-email branch is eliminated.

`terms_accepted_at` is stored inside the `metadata` JSONB — `public.users` has no dedicated `terms_accepted_at` column (verified via `information_schema.columns`: only `display_name` and `metadata` exist from the set `{terms_accepted_at, terms_version, display_name, metadata}`). Queries that read terms acceptance must read `metadata->>'terms_accepted_at'`. This is intentional; do not add a top-level column.

### Required change

None. H-01 is closed by the Round A signup swap.

### File + line

`/Users/veritypost/Desktop/verity-post/site/src/app/api/auth/signup/route.js:54-67` (existing code, no change).

### Verification

1. Sign up with email-confirmation required (use a fresh address on a brand-new anon session).
2. Before clicking the confirmation link, query:
   ```sql
   SELECT id, display_name, metadata->>'terms_accepted_at' AS tca, metadata->>'terms_version' AS tv
   FROM public.users WHERE email = '<test-email>';
   ```
3. Expect: row present, `display_name` matches submitted `fullName`, `tca` is a non-null ISO timestamp within the last minute, `tv = '2026-01'`.
4. Click confirmation link. Re-query — row unchanged (confirmation flips `email_verified` on `auth.users`, does not touch `public.users.metadata`).

---

## H-02 — OAuth callback `auth_providers` insert

### Current state (post-Round-A doc, pre-code)

`round_a_caller_changes.md` §2 schedules the callback swap. The file on disk `/Users/veritypost/Desktop/verity-post/site/src/app/api/auth/callback/route.js` still uses the caller-scoped `supabase` client for the `auth_providers` insert (line 88), the `users` insert (line 78), the `user_roles` insert (line 106), and the `audit_log` insert (line 113).

Live RLS on `auth_providers`:
```
auth_providers_insert  cmd=INSERT  with_check = (user_id = auth.uid())
auth_providers_select  cmd=SELECT  qual       = ((user_id = auth.uid()) OR is_admin_or_above())
auth_providers_update  cmd=UPDATE  qual       = (user_id = auth.uid())
```

After `exchangeCodeForSession` returns, `auth.uid()` IS populated, so the RLS check passes today. The Round A rationale for switching to service-role is consistency (Round A's 092 migration revokes `user_roles` and `audit_log` inserts from authenticated, so those two writes MUST swap; `auth_providers` piggybacks on the same edit for defensive uniformity).

### Required change

Switch the four writes inside the "no existing row" branch to service-role. Mirror the signup route's pattern.

### File + line

`/Users/veritypost/Desktop/verity-post/site/src/app/api/auth/callback/route.js:72-119`.

### Code snippet

```js
if (!existing) {
  const provider = user.app_metadata?.provider || 'unknown';
  const meta = user.user_metadata || {};
  const safeDisplayName = sanitizeDisplayName(meta.full_name || meta.name || null);
  const safeAvatarUrl = sanitizeAvatarUrl(meta.avatar_url);

  const service = createServiceClient();

  await service.from('users').insert({
    id: user.id,
    email: user.email,
    email_verified: !!user.email_confirmed_at,
    email_verified_at: user.email_confirmed_at || null,
    display_name: safeDisplayName,
    avatar_url: safeAvatarUrl,
    primary_auth_provider: provider,
  });

  await service.from('auth_providers').insert({
    user_id: user.id,
    provider,
    provider_user_id: user.user_metadata?.sub || user.id,
    email: user.email,
    display_name: safeDisplayName,
    avatar_url: safeAvatarUrl,
    provider_data: meta,
  });

  const { data: userRole } = await service
    .from('roles')
    .select('id')
    .eq('name', 'user')
    .single();
  if (userRole) {
    await service.from('user_roles').insert({
      user_id: user.id,
      role_id: userRole.id,
      assigned_by: user.id,
    });
  }

  await service.from('audit_log').insert({
    actor_id: user.id,
    action: 'auth:signup',
    target_type: 'user',
    target_id: user.id,
    metadata: { method: 'oauth', provider },
  });

  return NextResponse.redirect(`${siteUrl}/signup/pick-username`);
}
```

Also line 129 — the returning-user `users.update({ last_login_at, ... })` stays on the caller client for now (the updated columns are not REVOKE targets). No change needed there for Round E. If Round A's `092_rls_lockdown.sql` extends the N-02 column revoke to `last_login_at`, revisit — today it does not.

Note on sequencing: this change is the same swap Round A's caller-changes doc already specifies. If Round A ships the callback swap first, Round E has nothing to do here. If Round E lands first, it carries the swap. Do not double-apply.

### Verification

1. OAuth sign-in as a brand-new user (Google, or whichever provider is live).
2. After redirect to `/signup/pick-username`, query:
   ```sql
   SELECT user_id, provider, provider_user_id FROM public.auth_providers WHERE user_id = '<new-user-id>';
   SELECT user_id, role_id FROM public.user_roles WHERE user_id = '<new-user-id>';
   SELECT COUNT(*) FROM public.audit_log WHERE actor_id = '<new-user-id>' AND action = 'auth:signup';
   ```
3. Expect one row in each.
4. Negative: try the same flow after Round A's 092 migration has revoked authenticated INSERT on `user_roles` and `audit_log`; confirm the OAuth path still succeeds because it is now on service-role.

---

## H-08 — Stripe webhook `stripe_customer_id` race

### Current state

`/Users/veritypost/Desktop/verity-post/site/src/app/api/stripe/webhook/route.js:241-245`:

```js
if (!userRow.stripe_customer_id) {
  await service.from('users')
    .update({ stripe_customer_id: customerId })
    .eq('id', userRow.id);
}
```

The null check is JS-side against the row read at line 207. A concurrent replay that reads before either writes wins by last-write. The defensive takeover check at line 236 also depends on the stale read.

### Required change

Add `.is('stripe_customer_id', null)` to the UPDATE so Postgres enforces the invariant atomically. Second writer's UPDATE affects zero rows and no-ops.

### File + line

`/Users/veritypost/Desktop/verity-post/site/src/app/api/stripe/webhook/route.js:242-244`.

### Code snippet

```js
if (!userRow.stripe_customer_id) {
  await service.from('users')
    .update({ stripe_customer_id: customerId })
    .eq('id', userRow.id)
    .is('stripe_customer_id', null);
}
```

Leave the JS guard in place — it short-circuits the common case without a DB round-trip. The `.is()` filter is the SQL-side belt-and-suspenders.

### Verification

1. Pick a test user whose `stripe_customer_id` is NULL. Simulate two concurrent `checkout.session.completed` events with different `customer` ids (`cus_A`, `cus_B`) via `stripe trigger` or a stored fixture. Ensure both pass the signature verifier and claim the `webhook_log` idempotency row for distinct `event_id`s.
2. Expect: exactly one UPDATE succeeds; the other's UPDATE affects zero rows and the handler completes without writing. The second handler will then hit the customer/user-mismatch guard at line 227 on its subscription-resolution step (because the customer it claims is not the one bound), or simply no-op the mapping and continue to the plan-apply step.
3. Replay the first event after success — confirm the UPDATE is a no-op (`!userRow.stripe_customer_id` short-circuits; even if it didn't, the `.is` filter would produce zero affected rows).
4. SQL spot-check:
   ```sql
   SELECT id, stripe_customer_id FROM public.users WHERE id = '<test-user-id>';
   ```
   Expect: bound to exactly one customer id.

---

## H-22 — `handle_new_auth_user` metadata trust

### Current state (live, 2026-04-19)

Queried `pg_proc.prosrc` directly. Body of `handle_new_auth_user` (pasted verbatim from live DB):

```
DECLARE
  user_count int;
  owner_role_id uuid;
  user_role_id uuid;
  free_plan_id uuid;
BEGIN
  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

  INSERT INTO public.users (id, email, email_verified, email_verified_at, plan_id, plan_status, locale)
  VALUES (NEW.id, NEW.email, false, NULL, free_plan_id, 'active', 'en')
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.users;

  IF user_count = 1 THEN
    SELECT id INTO owner_role_id FROM public.roles WHERE name = 'owner' LIMIT 1;
    IF owner_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, owner_role_id) ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    SELECT id INTO user_role_id FROM public.roles WHERE name = 'user' LIMIT 1;
    IF user_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, user_role_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
```

Confirmed: no read of `NEW.raw_user_meta_data`, no read of `NEW.raw_app_meta_data`, no dynamic role-name path. The only role write is to `owner` (when `user_count = 1`) or `user` (otherwise). H-22 is closed on semantics — what remains is a defensive comment.

### Required change

Add a SQL comment documenting the 2026-04-19 audit. Land in the same migration as N-03 (below) so the `CREATE OR REPLACE FUNCTION` happens once.

### File + line

New migration: `01-Schema/094_round_e_auth_integrity_2026_04_19.sql`. Matches existing date-suffixed naming.

### Verification

- Post-migration SQL:
  ```sql
  SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_auth_user';
  ```
  Expect: body contains the `-- Audited 2026-04-19` comment line and no reference to `raw_user_meta_data` or `raw_app_meta_data`.
- Post-migration integration test: create an `auth.users` row via the service client with `raw_user_meta_data = '{"role":"admin"}'::jsonb`. Confirm the corresponding `public.user_roles` row is `user` (or `owner` if this is the first signup and the N-03 guard finds no existing owner — which it should), never `admin`.

---

## N-03 — owner-bootstrap race guard

### Current state

Same function. The `IF user_count = 1` branch promotes the next signup to `owner` whenever `public.users` is empty. Today this only happens once (at initial bootstrap). Future failure modes:

- Manual `TRUNCATE public.users` in prod by accident (followed by a restore that misses `user_roles` seed).
- Dev-DB-to-prod copy-paste of a `DELETE FROM public.users` run.
- Any operational path that empties the table before restoring the roles.

If any of these happen and a user signs up before the owner row is restored, that user is silently promoted to `owner`.

### Required change

Prepend an explicit owner-exists check. If an owner already exists in `user_roles`, bump `user_count` to `2` so the trigger falls through to the `user`-role branch regardless of how many rows are in `public.users`. Keeps the bootstrap path working on a truly empty DB (no owner row, user_count = 1 → owner promotion).

### File + line

Same migration: `01-Schema/094_round_e_auth_integrity_2026_04_19.sql`.

### Migration SQL (H-22 comment + N-03 guard, single `CREATE OR REPLACE`)

```sql
-- 094_round_e_auth_integrity_2026_04_19.sql
-- Round E migration. Single ALTER FUNCTION pass covering H-22 + N-03.
--
-- H-22: handle_new_auth_user() body audited on 2026-04-19. The function
-- does NOT read NEW.raw_user_meta_data or NEW.raw_app_meta_data. The
-- only role assignments are the hard-coded 'owner' (bootstrap) and
-- 'user' (every other signup) names. A crafted raw_user_meta_data.role
-- claim at signup has no effect on the role this trigger writes.
-- Comment added below so future auditors do not have to reconfirm.
--
-- N-03: owner-bootstrap hijack guard. The original bootstrap condition
-- `user_count = 1` would fire again if public.users is ever emptied
-- (dev-DB reset, accidental TRUNCATE) leaving the next signup silently
-- promoted to owner. Guard: if an owner already exists in user_roles,
-- force user_count to a value that bypasses the bootstrap branch.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  user_count int;
  owner_role_id uuid;
  user_role_id uuid;
  free_plan_id uuid;
BEGIN
  -- H-22 audit 2026-04-19: this function does not read raw_user_meta_data
  -- or raw_app_meta_data. Role assignment is hard-coded to the 'owner' or
  -- 'user' role names. Do not introduce metadata-driven role logic here
  -- without a fresh security review.

  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

  INSERT INTO public.users (id, email, email_verified, email_verified_at, plan_id, plan_status, locale)
  VALUES (
    NEW.id,
    NEW.email,
    false,
    NULL,
    free_plan_id,
    'active',
    'en'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.users;

  -- N-03 guard: if an owner is already seated, force the non-bootstrap
  -- branch regardless of user_count. Prevents a post-truncate signup
  -- from being auto-promoted to owner.
  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.name = 'owner'
  ) THEN
    user_count := 2;
  END IF;

  IF user_count = 1 THEN
    SELECT id INTO owner_role_id FROM public.roles WHERE name = 'owner' LIMIT 1;
    IF owner_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, owner_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    SELECT id INTO user_role_id FROM public.roles WHERE name = 'user' LIMIT 1;
    IF user_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, user_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;
```

### Verification

1. Pre-migration snapshot:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_auth_user';
   ```
2. Apply migration.
3. Post-migration:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_auth_user';
   ```
   Expect: owner-exists guard present, H-22 audit comment present, role assignment logic otherwise unchanged.
4. Live bootstrap behavior: confirm the owner role still resolves for the existing owner:
   ```sql
   SELECT u.email
   FROM public.user_roles ur
   JOIN public.roles r ON r.id = ur.role_id
   JOIN public.users u ON u.id = ur.user_id
   WHERE r.name = 'owner';
   ```
   Expect: the existing owner account, unchanged.
5. Post-truncate simulation (on a dev branch only, never prod):
   - `TRUNCATE public.users RESTART IDENTITY CASCADE;` (leaves `user_roles` rows intact since CASCADE only follows FKs originating from users; verify).
   - Sign up a new user via the auth flow.
   - Confirm the new user lands in the `user` role, not `owner`.
6. Empty-DB bootstrap (brand new project):
   - Deploy schema + this migration to an empty branch, with no users and no seeded owner row.
   - Sign up the first user.
   - Expect: that user gets `owner` role (bootstrap path still works because the guard's `EXISTS (owner)` check returns false).

---

## Migration ordering

Single migration file `094_round_e_auth_integrity_2026_04_19.sql` carries both H-22 and N-03 as one `CREATE OR REPLACE FUNCTION`. No second DB deploy needed for Round E.

Code changes (H-02 callback swap, H-08 webhook `.is()` filter) ship as a single commit alongside the migration. Commit order inside the round:

1. Apply 094 migration.
2. Deploy code (callback swap + webhook filter).
3. Verify per the checklists above.

No dependency between the code changes and the migration — they can land in any order within the same deploy window.

---

## Files touched

- `/Users/veritypost/Desktop/verity-post/01-Schema/094_round_e_auth_integrity_2026_04_19.sql` (new).
- `/Users/veritypost/Desktop/verity-post/site/src/app/api/auth/callback/route.js` (edit; only if Round A did not already ship this swap).
- `/Users/veritypost/Desktop/verity-post/site/src/app/api/stripe/webhook/route.js` (edit).

Three files total: one new migration + two code edits (one of which may already be covered by Round A).
