# Q02 — `app.dob_admin_override` GUC trust

## Question

PM-8 flagged the `app.dob_admin_override` GUC as client-trustable: any caller can `SET app.dob_admin_override = 'true'` and then update `kid_profiles.date_of_birth` or regress `reading_band`, defeating both `enforce_kid_dob_immutable` and `enforce_band_ratchet`.

PM-8 proposed `current_user = 'postgres'` as a replacement. That works for the auth-sync trigger (`app.auth_sync`), but it does **not** work for `app.dob_admin_override`, because the admin DOB-correction flow runs through a Next.js route → service-role client → SECURITY DEFINER RPC. The role context inside the RPC is **not** `postgres`; it's whatever role the SECURITY DEFINER function was created under (typically `postgres` *only* if the migration was applied as `postgres`, but the JWT-claim role and `current_user` inside an RPC invoked over PostgREST is the function owner, while the trigger sees the *invoker's* role chain in unpredictable ways).

What's the right pattern that (a) doesn't trust client-settable state, and (b) keeps admin DOB correction working?

## Context

### Triggers in play (live DB, queried via MCP)

```sql
-- BEFORE UPDATE OF date_of_birth ON public.kid_profiles
CREATE OR REPLACE FUNCTION public.enforce_kid_dob_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('app.dob_admin_override', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth THEN
    RAISE EXCEPTION
      'date_of_birth is immutable after profile creation. Use the DOB-correction request flow.'
      USING ERRCODE = '22023', HINT = 'Submit POST /api/kids/[id]/dob-correction';
  END IF;
  RETURN NEW;
END;
$function$
```

```sql
-- BEFORE UPDATE OF reading_band ON public.kid_profiles
--   WHEN (old.reading_band IS DISTINCT FROM new.reading_band)
CREATE OR REPLACE FUNCTION public.enforce_band_ratchet()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_rank int; v_new_rank int;
BEGIN
  IF current_setting('app.dob_admin_override', true) = 'true' THEN
    RETURN NEW;
  END IF;
  v_old_rank := CASE OLD.reading_band WHEN 'kids' THEN 1 WHEN 'tweens' THEN 2 WHEN 'graduated' THEN 3 ELSE 0 END;
  v_new_rank := CASE NEW.reading_band WHEN 'kids' THEN 1 WHEN 'tweens' THEN 2 WHEN 'graduated' THEN 3 ELSE 0 END;
  IF v_new_rank < v_old_rank THEN
    RAISE EXCEPTION 'reading_band cannot regress (% -> %)', OLD.reading_band, NEW.reading_band
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$
```

Neither trigger is `SECURITY DEFINER`. Both run as the invoker. Both ship `current_setting('app.dob_admin_override', true)` as the *only* gate.

### RPCs that legitimately need the bypass (all three, queried via MCP)

There are **three** SECURITY DEFINER functions that legitimately mutate `kid_profiles.date_of_birth` and/or `reading_band` in ways that violate the triggers, and each currently uses `set_config('app.dob_admin_override', 'true', true)`:

1. **`admin_apply_dob_correction(p_request_id, p_decision, p_decision_reason)`** — admin route writes new DOB + recomputed band when the admin approves a correction request:
   ```sql
   PERFORM set_config('app.dob_admin_override', 'true', true);
   UPDATE public.kid_profiles
   SET date_of_birth = v_request.requested_dob,
       reading_band  = v_new_band,
       band_changed_at = now(),
       band_history = band_history || jsonb_build_array(...)
   WHERE id = v_request.kid_profile_id;
   ...
   PERFORM set_config('app.dob_admin_override', '', true);
   ```

2. **`system_apply_dob_correction(p_request_id, p_decision_reason)`** — cron auto-approves "younger" corrections after cooldown. Same UPDATE shape, no auth.uid() actor.

3. **`graduate_kid_profile(p_kid_profile_id, p_intended_email)`** — parent graduates their tweens-band kid; sets `reading_band = 'graduated'`, which would normally pass the ratchet, but it also sets `is_active = false` and writes a band_history entry, and uses the same override toggle defensively. The graduation isn't actually a regress (`tweens` → `graduated` rank 2 → 3), so the override is **not strictly required** for `enforce_band_ratchet`, but the function uses it.

### Caller chain for admin correction

```
client → POST /api/admin/kids-dob-corrections/[id]                 (Next.js route, web/src/app/api/admin/kids-dob-corrections/[id]/route.ts:115)
       → service.rpc('admin_apply_dob_correction', {...})           (line 154; service = createServiceClient, web/src/lib/supabase/server.ts:136)
       → PostgREST runs RPC under service-role JWT                  (function is SECURITY DEFINER, owner = postgres in supabase)
       → RPC PERFORMs set_config('app.dob_admin_override','true',true)
       → RPC issues UPDATE public.kid_profiles ...                  (triggers fire as SECURITY DEFINER's effective role)
       → enforce_kid_dob_immutable + enforce_band_ratchet read GUC, RETURN NEW
```

The service-role JWT carries `role = service_role` in the JWT claim and PostgREST does `SET LOCAL role = service_role`. Inside a SECURITY DEFINER function, `current_user` switches to the **function owner** (`postgres` in stock Supabase), but the BEFORE UPDATE triggers are *not* SECURITY DEFINER — they execute in the calling function's role context, which is also `postgres` for the duration of the SECURITY DEFINER. So `current_user = 'postgres'` actually **would** match inside these RPCs — but it would also match every other SECURITY DEFINER function in the schema, including any future one written by a less-careful author. That's a meaningful blast-radius increase.

### What's actually exploitable today

The exploitability depends on whether RLS/grants give a hostile authenticated user a path to UPDATE `kid_profiles.date_of_birth` at all. The triggers are the *last* line of defence; the *first* is `kid_profiles` RLS. If RLS is correctly scoped to "parent can SELECT/INSERT but the `date_of_birth` column is locked to "admin/service-role only" via column grants or RLS, then the GUC trust is defence-in-depth and the bug is theoretical. If RLS lets an authenticated parent UPDATE arbitrary `kid_profiles` columns including `date_of_birth`, then the GUC trust **is** the gate and a hostile parent who runs `SELECT set_config('app.dob_admin_override','true',true)` followed by an UPDATE bypasses both immutability and the ratchet.

Either way the GUC trust is a smell — defence-in-depth that doesn't defend is a footgun, and PM-8 is right to flag it.

## Options

### Option A — Move the override into the RPC body via savepoint + `ALTER TABLE ... DISABLE TRIGGER`

```sql
BEGIN;
  SAVEPOINT before_dob_write;
  ALTER TABLE public.kid_profiles DISABLE TRIGGER kid_profiles_dob_immutable;
  ALTER TABLE public.kid_profiles DISABLE TRIGGER kid_profiles_band_ratchet;
  UPDATE public.kid_profiles SET date_of_birth = ..., reading_band = ... WHERE id = ...;
  ALTER TABLE public.kid_profiles ENABLE  TRIGGER kid_profiles_dob_immutable;
  ALTER TABLE public.kid_profiles ENABLE  TRIGGER kid_profiles_band_ratchet;
RELEASE SAVEPOINT before_dob_write;
```

Won't work. `ALTER TABLE ... DISABLE TRIGGER` requires table ownership and acquires `SHARE ROW EXCLUSIVE` lock on the entire table. Even setting aside the lock cost, the DISABLE/ENABLE is **not transaction-local for the trigger state from other backends' perspective** — between the DISABLE and ENABLE, *every other concurrent writer to `kid_profiles`* skips the triggers. That's the opposite of what we want. Reject.

### Option B — Replace GUC with role/JWT check inside the trigger

```sql
IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
  RETURN NEW;
END IF;
```

This is what `users_protect_columns` already does for the second-tier bypass. It's not client-settable: PostgREST sets `request.jwt.claim.role` from the verified, signed JWT before invoking SQL, and a regular authenticated user's JWT has `role = 'authenticated'`, not `service_role`. The signing happens in GoTrue and the Postgres backend trusts only what PostgREST puts there.

But this widens the bypass to *every* service-role caller, not just the three audited RPCs. A future endpoint that uses `createServiceClient()` and then issues a raw `service.from('kid_profiles').update({ date_of_birth: ... })` would silently bypass the immutability rule. Today that's hypothetical, but the `kid_profiles` table is touched by many code paths and the protection should be tight, not broad.

### Option C — Drop the GUC, route all writes through SECURITY DEFINER RPCs, gate triggers on `current_user = 'postgres'`

```sql
-- enforce_kid_dob_immutable
IF current_user = 'postgres' THEN RETURN NEW; END IF;
```

PM-8's suggestion. Inside a SECURITY DEFINER function owned by `postgres`, `current_user = 'postgres'` is true. So all three RPCs above would pass without any explicit override. **But**:

- It implicitly bypasses *any* SECURITY DEFINER function owned by postgres, including future ones authored by less-careful agents.
- It depends on the function owner remaining `postgres` after every migration; if a function is reassigned or recreated under a different owner, the bypass silently fails.
- It conflates "this is a privileged path" with "this is the right privileged path."

It's correct but blunt — the same blast-radius problem as Option B, just expressed via DB role rather than JWT.

### Option D — Replace GUC with a *function-presence* check (named SECURITY DEFINER allowlist)

Use Postgres's stack-introspection: have the trigger check whether the call stack includes one of the known whitelisted functions.

```sql
DECLARE
  v_caller text;
BEGIN
  -- Inspect the current call stack for an authorised caller
  GET DIAGNOSTICS v_caller = PG_CONTEXT;
  IF v_caller ~ 'function (admin_apply_dob_correction|system_apply_dob_correction|graduate_kid_profile)' THEN
    RETURN NEW;
  END IF;
  ...
```

Hardens against new SECURITY DEFINER functions accidentally inheriting the bypass. But `PG_CONTEXT` parsing is fragile (function names with quoting, schema-qualified vs not), and the allowlist becomes a maintenance burden — every legitimate new caller has to be added in two places (the trigger function and the RPC). Reject as too clever for the value.

### Option E — Signed token in the GUC

Generate a per-transaction nonce inside the RPC, sign it with a server-only key, set the signed token in the GUC, have the trigger verify the signature. Cryptographically sound, solves the trust problem.

But: the signing key has to live in the DB (e.g., a `vault.secrets` row or a `pgcrypto`-encrypted GUC), every RPC adds 5–10 lines of crypto, and the trigger runs HMAC verification on every kid_profile UPDATE. Operationally heavy. The threat model doesn't justify it.

### Option F — Use a session-local *table* row as the override marker

```sql
-- Inside RPC:
INSERT INTO pg_temp.dob_override_marker(token) VALUES (...);
```

`pg_temp` is per-session, and a regular caller can't write to the trigger's `pg_temp` from a different session. But: a malicious caller *can* write to their own `pg_temp` and then trigger an UPDATE in the same session, since the trigger runs in the caller's session. So this doesn't actually prevent the abuse — same problem as the GUC.

## Recommendation

**Option B (JWT role check) + Option C (current_user check) combined as a defence-in-depth gate, plus drop the GUC entirely.**

Rewrite both triggers as:

```sql
-- enforce_kid_dob_immutable
CREATE OR REPLACE FUNCTION public.enforce_kid_dob_immutable()
RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only the postgres role (i.e., inside a SECURITY DEFINER RPC owned by
  -- postgres) and direct service-role connections may change DOB.
  -- Both conditions are signed/verified server-side: current_user is set
  -- by Postgres itself when entering a SECURITY DEFINER function;
  -- request.jwt.claim.role is set by PostgREST from the signed JWT before
  -- SQL runs. Neither is settable by a hostile authenticated user.
  IF current_user = 'postgres'
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth THEN
    RAISE EXCEPTION
      'date_of_birth is immutable after profile creation. Use the DOB-correction request flow.'
      USING ERRCODE = '22023', HINT = 'Submit POST /api/kids/[id]/dob-correction';
  END IF;
  RETURN NEW;
END;
$function$;

-- enforce_band_ratchet — same prelude
```

Then:

1. **Remove every `set_config('app.dob_admin_override', ...)` PERFORM** from `admin_apply_dob_correction`, `system_apply_dob_correction`, and `graduate_kid_profile`. The triggers no longer need them — the SECURITY DEFINER context (`current_user = postgres`) is the gate.
2. **Verify `kid_profiles` RLS still locks self-update of `date_of_birth` and `reading_band` for `authenticated` role.** This is the defence the triggers back up; if RLS lets a parent UPDATE these columns directly, no trigger gate matters because the path of least resistance is through PostgREST as `authenticated` (which both gates reject anyway, but the principle is "RLS first, trigger last"). This audit is in scope for the same migration.
3. **Drop `app.dob_admin_override` from the admin RPC's docstring and migrations** — once the RPCs no longer set it and the triggers no longer read it, the GUC name is dead and shouldn't survive in the codebase as a confusion vector.
4. **Compare to `app.auth_sync`:** the auth-sync GUC has the same theoretical exploit (a hostile user could `SET app.auth_sync='true'` and then update their own `email_verified`). Migrate it the same way: replace the GUC check in `users_protect_columns` with `current_user = 'postgres' OR v_role = 'service_role'`. The `handle_auth_user_updated` trigger is itself SECURITY DEFINER, so `current_user` inside its UPDATE will be `postgres` and the bypass kicks in naturally. This is **strictly an improvement** over the current GUC — the auth-sync trigger doesn't need the GUC either; the role check covers it.

## Reasoning

The exploit window for both GUCs is the same: a hostile authenticated user issues `SELECT set_config(...)` then an UPDATE in the same transaction. The fix has to be a value Postgres itself controls, not the client.

`current_user` is set by Postgres when entering a SECURITY DEFINER function. It cannot be spoofed from SQL (`SET ROLE` is the only way to change it, and that requires explicit GRANT). `request.jwt.claim.role` is set by PostgREST from the *cryptographically verified* JWT signature; a hostile caller cannot mint a JWT claiming `role = 'service_role'` without the project's JWT secret.

Both values are already in the existing `users_protect_columns` function (added in `2026-04-28_auth_sync_guc_bypass.sql`), so this isn't introducing a new pattern — it's making the kid-profile triggers consistent with the user-protect trigger.

The blast-radius concern with Option B/C alone (any SECURITY DEFINER function or any service-role call silently inherits the bypass) is real but acceptable because:

- **Service-role is already a trust boundary in this codebase.** Every `createServiceClient()` route is privileged by definition. The triggers are not the primary defence against service-role misuse — code review is. This matches the existing posture of `users_protect_columns`.
- **`current_user = 'postgres'` is the same pattern.** Every SECURITY DEFINER RPC owned by postgres is a trust boundary. There are dozens of these in the schema and they're already trusted to write privileged data; treating DOB the same way is consistent.
- **The narrower alternatives (Option D function-allowlist, Option E signed tokens) cost engineering and runtime overhead disproportionate to the threat.** The triggers are belt-and-suspenders; the suspenders here are RLS plus code review.

Combining `current_user = 'postgres'` **with** `request.jwt.claim.role = 'service_role'` as an OR is deliberately redundant — it covers (a) the SECURITY DEFINER RPC path (postgres) and (b) any direct service-role write that doesn't go through an RPC (service_role). Either gate alone would cover the three known callers, but both together future-proof against caller-pattern shifts.

## Files

**DB objects to modify (all live in DB; no migration on disk yet — write a new migration):**

- `public.enforce_kid_dob_immutable()` — replace GUC check with `current_user = 'postgres' OR jwt role = 'service_role'`
- `public.enforce_band_ratchet()` — same
- `public.users_protect_columns()` — remove `v_auth_sync` GUC check (the existing role check below it already covers auth-sync because `handle_auth_user_updated` is SECURITY DEFINER); see `supabase/migrations/2026-04-28_auth_sync_guc_bypass.sql:38-64` and `supabase/migrations/2026-05-01_protect_users_username.sql:27`
- `public.handle_auth_user_updated()` — remove the `set_config('app.auth_sync', ...)` line; see `supabase/migrations/2026-04-28_auth_sync_guc_bypass.sql:16-36`
- `public.admin_apply_dob_correction()` — remove the two `set_config('app.dob_admin_override', ...)` calls (lines surrounding the kid_profiles UPDATE)
- `public.system_apply_dob_correction()` — same
- `public.graduate_kid_profile()` — same

**No code changes in `web/` or `VerityPost/` or `VerityPostKids/` are required.** The route at `web/src/app/api/admin/kids-dob-corrections/[id]/route.ts:154` keeps invoking the RPC the same way. The fix is entirely SQL.

**Existing migrations to consult for context (do not edit, just read):**

- `/Users/veritypost/Desktop/verity-post/supabase/migrations/2026-04-28_auth_sync_guc_bypass.sql`
- `/Users/veritypost/Desktop/verity-post/supabase/migrations/2026-05-01_protect_users_username.sql`
- `/Users/veritypost/Desktop/verity-post/supabase/migrations/2026-04-29_combined_unapplied.sql` (lines 426 + 801 — earlier copies of the GUC reads)
- `/Users/veritypost/Desktop/verity-post/supabase/migrations/2026-04-29_session3_invite_cap.sql` (line 26 — another GUC reader to update)
- `/Users/veritypost/Desktop/verity-post/supabase/migrations/2026-04-29_auth_redesign_consolidated.sql` (line 364 — same)

**New migration to write:** `supabase/migrations/2026-05-03_drop_guc_trust_in_triggers.sql` — single migration that recreates all six functions (4 triggers + 3 RPCs minus overlap) without GUC references, plus a brief audit query that confirms no surviving `app.dob_admin_override` or `app.auth_sync` references in `pg_proc.prosrc`.

## Risks

**R1 — Hidden writers we missed.** The MCP scan turned up three writers of `app.dob_admin_override` (`admin_apply_dob_correction`, `system_apply_dob_correction`, `graduate_kid_profile`). If there's a fourth that isn't owned by `postgres` and doesn't run as service-role, removing the GUC will break it. Mitigation: query `pg_proc` for any function whose `prosrc ILIKE '%dob_admin_override%'` *and whose owner is not postgres* before deploying. The MCP scan has already been run; result: zero non-postgres owners. Re-run as a pre-flight check in the migration.

**R2 — Future SECURITY DEFINER RPCs accidentally bypass.** Anyone writing a new SECURITY DEFINER function owned by postgres can now write `kid_profiles.date_of_birth` without realising the trigger is silently allowing it. Mitigation: add a CLAUDE.md note under "kid profile invariants" that `date_of_birth` and `reading_band` writes from a new RPC must go through `admin_apply_dob_correction` or be explicitly justified in code review. Same posture as the rest of the SECURITY DEFINER fleet.

**R3 — RLS gap.** If `kid_profiles` RLS for `authenticated` role permits UPDATE of `date_of_birth` or `reading_band` (it shouldn't), the trigger is the only gate, and Option B+C still rejects the authenticated path correctly because `current_user = 'authenticated'` and the JWT role is `'authenticated'`, not `'service_role'`. So Option B+C is no worse than the current GUC. But the migration should include a one-line RLS check (`pg_policies` query) confirming UPDATE on these columns is denied for `authenticated`. If the gap exists, fix it in the same migration.

**R4 — `current_user` inside a non-SECURITY-DEFINER trigger called from a SECURITY DEFINER RPC.** Postgres semantics: a non-SECURITY-DEFINER trigger fired during a SECURITY DEFINER function's UPDATE *runs with the SECURITY DEFINER's effective user*, not the original invoker's. So inside `admin_apply_dob_correction` (SD, owned by postgres), the BEFORE UPDATE trigger sees `current_user = 'postgres'`. Confirmed by Postgres docs. Mitigation: write a one-shot test in the migration's verification block that asserts the bypass works:
```sql
DO $$ BEGIN
  PERFORM admin_apply_dob_correction(...);  -- should succeed end-to-end on a synthetic request
END; $$;
```

**R5 — Test coverage.** No existing test directly asserts "an authenticated parent cannot bypass DOB immutability." Add a regression test (preferably a SQL-level pgTAP test or a Node API-level test that uses a real authenticated session) that runs `SELECT set_config('app.dob_admin_override','true',true)` followed by an UPDATE on the parent's own kid and asserts a `22023` error is raised. This pins the fix.

## Owner decision

- [ ] Approve Option B+C combined: replace GUC checks in `enforce_kid_dob_immutable`, `enforce_band_ratchet`, and `users_protect_columns` with `current_user = 'postgres' OR jwt role = 'service_role'`; remove `set_config` calls from the three RPCs and from `handle_auth_user_updated`.
- [ ] Approve writing the new migration `2026-05-03_drop_guc_trust_in_triggers.sql` plus the pgTAP/Node regression test described in R5.
- [ ] Approve adding the CLAUDE.md note under kid-profile invariants (R2).
- [ ] Defer until Q01 (auth_sync GUC) decision lands — bundle both into one cleanup migration.
- [ ] Reject; keep the GUC trust as belt-and-suspenders defence-in-depth and rely on RLS as the primary gate. (Argues the threat is theoretical and the fix isn't free.)
