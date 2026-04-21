# Round 6 SECURITY — Admin RPC lockdown + pso_select fix

Author: Prepper Security (Round 6)
Date: 2026-04-18
Scope: Surgical fix plan only. Implementer applies.

---

## 1. Findings validated (live DB: fyiwulqphgmoqullmrfn)

### 1a. ACLs on the suspect functions

Every function listed by Auditor Alpha has `=X/postgres` in its `proacl`.
The leading `=X/...` entry is the PUBLIC grant. So every one of these
SECURITY DEFINER functions is EXECUTable by PUBLIC (which includes `anon`
and `authenticated`) today.

```
proname                        prosecdef  args                                                             proacl (PUBLIC EXECUTE = leading "=X/postgres")
anonymize_user                 true       (p_user_id uuid)                                                 {=X/postgres,postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}
apply_penalty                  true       (p_mod_id uuid, p_target_id uuid, p_level int, p_reason text)    {=X/postgres,...}
approve_expert_application     true       (p_reviewer_id uuid, p_application_id uuid, p_review_notes text) {=X/postgres,...}
cancel_account_deletion        true       (p_user_id uuid)                                                 {=X/postgres,...}
grant_role                     true       (p_admin_id uuid, p_user_id uuid, p_role_name text)              {=X/postgres,...}
reject_expert_application      true       (p_reviewer_id uuid, p_application_id uuid, p_rejection_reason text) {=X/postgres,...}
resolve_appeal                 true       (p_mod_id uuid, p_warning_id uuid, p_outcome text, p_notes text) {=X/postgres,...}
revoke_role                    true       (p_admin_id uuid, p_user_id uuid, p_role_name text)              {=X/postgres,...}
schedule_account_deletion      true       (p_user_id uuid, p_reason text)                                  {=X/postgres,...}
send_breaking_news             true       (p_article_id uuid, p_title text, p_body text)                   {=X/postgres,...}
```

### 1b. Additional vulnerable functions the broad sweep turned up

Looked for any public `SECURITY DEFINER` fn whose arg list contains a
caller-supplied actor UUID parameter (`p_admin_id`, `p_mod_id`,
`p_reviewer_id`, `p_actor_id`, `p_admin_uid`). Extra hits beyond
Auditor's 10:

| proname | args |
| --- | --- |
| `hide_comment` | `(p_mod_id uuid, p_comment_id uuid, p_reason text)` |
| `unhide_comment` | `(p_mod_id uuid, p_comment_id uuid)` |
| `resolve_report` | `(p_mod_id uuid, p_report_id uuid, p_resolution text, p_notes text)` |
| `mark_probation_complete` | `(p_admin_id uuid, p_application_id uuid)` |

All four have the same pattern: trust a caller-supplied actor UUID and
check the role of THAT uuid (never `auth.uid()`). They are SECURITY
DEFINER with PUBLIC EXECUTE, so an anon caller can pass any admin/mod
uuid they know (or guess via enumeration) and impersonate.

Final vulnerable count: **14 functions** (Auditor's 10 + 4 more).

### 1c. Function bodies — auth check pattern

From `pg_proc.prosrc`:

| fn | internal auth check today | uses caller-supplied actor? |
| --- | --- | --- |
| `anonymize_user` | NONE | N/A (no actor param) — fully unauthenticated |
| `send_breaking_news` | NONE | N/A — fully unauthenticated |
| `apply_penalty` | `_user_is_moderator(p_mod_id)` | YES |
| `resolve_appeal` | `_user_is_moderator(p_mod_id)` | YES |
| `hide_comment` | `_user_is_moderator(p_mod_id)` | YES |
| `unhide_comment` | `_user_is_moderator(p_mod_id)` | YES |
| `resolve_report` | `_user_is_moderator(p_mod_id)` | YES |
| `grant_role` | role check on `p_admin_id` | YES |
| `revoke_role` | role check on `p_admin_id` | YES |
| `mark_probation_complete` | role check on `p_admin_id` | YES |
| `approve_expert_application` | role check on `p_reviewer_id` | YES |
| `reject_expert_application` | role check on `p_reviewer_id` | YES |
| `schedule_account_deletion` | NONE (pure data action on `p_user_id`) | N/A — self-service style |
| `cancel_account_deletion` | NONE (pure data action on `p_user_id`) | N/A — self-service style |

Every "YES" row is trivially bypassed: the attacker just passes a known
admin/mod uuid as `p_admin_id`/`p_mod_id`/`p_reviewer_id`. Auditor's
confirmed probe (on `anonymize_user`, which has NO check at all) also
confirms the PUBLIC EXECUTE is real.

### 1d. `permission_scope_overrides` RLS

```
polname    polcmd  using_expr              check_expr
pso_select r       true                    (null)
pso_write  *       is_admin_or_above()     is_admin_or_above()
```

Read is wide open.

### 1e. Helpers confirmed present

| helper | signature | implementation note |
| --- | --- | --- |
| `is_admin_or_above()` | `()` | wraps `user_has_role('admin')` |
| `user_has_role(required_role text)` | `(text)` | compares against `auth.uid()` |
| `_user_is_moderator(uuid)` | `(uuid)` | exists — used by mod fns today |

### 1f. `permission_scope_overrides.scope_id` type

`scope_id` is `uuid` (not text). The pso_select rewrite must compare
as `uuid`, not `text`.

---

## 2. IMPORTANT design adjustment: we cannot rely on `auth.uid()` in the body

All live callers (`site/src/app/api/**`) invoke these RPCs via
`createServiceClient().rpc(...)` — i.e. with the **service_role**
client. Under service_role, `auth.uid()` returns NULL. Therefore a
rewrite that gates on `auth.uid() + is_admin_or_above()` **would break
every legitimate caller**.

The Auditor's suggestion ("ignore the caller-supplied uuid and use
`auth.uid()` + `is_admin_or_above()`") was written assuming the caller
is an authenticated session — which is never true for admin actions in
this codebase. The admin layer is `/api/admin/*` routes that
`requirePermission(...)` then call the RPC as service_role.

**Fix strategy instead:**

1. **REVOKE EXECUTE from PUBLIC, anon, authenticated.** This alone
   closes the attack: only `postgres` and `service_role` keep EXECUTE.
   Since the Next.js admin routes use service_role, they keep working.
2. **Add a belt-and-braces internal check** that is correct under
   service_role: when the RPC is called outside of a user session
   (service_role), trust the Next.js layer that already ran
   `requirePermission(...)`. When called inside a user session
   (defence-in-depth against accidental re-grants), require
   `auth.uid() = <caller-supplied actor>` AND the actor to have the
   expected role.
3. **Stop trusting the caller-supplied actor.** For audit-log writes,
   keep the param value but only after confirming it matches
   `auth.uid()` in the user-session branch; for the service_role
   branch, trust the param (the Next.js layer vetted it, and we log
   it into `audit_log` anyway).

A concise gate we can paste into every function body:

```sql
-- Gate: allow when called by service_role (admin API layer vetted the
-- caller), otherwise require the caller's session uid to match the
-- actor param AND have the relevant role.
IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
  IF auth.uid() IS NULL OR auth.uid() <> <actor_param> THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF NOT <role_check_for_actor> THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
END IF;
```

The combination of REVOKE + this gate is what makes the lockdown real.
The REVOKE alone is sufficient today, but adds the in-body gate as a
second layer in case EXECUTE is ever re-granted by mistake.

**Alternative (simpler) design:** drop the internal gate entirely and
rely only on REVOKE. Equally secure, fewer LOC changes. I recommend
this simpler form and flag the belt-and-braces option as optional.
**My recommendation: REVOKE-only, no body rewrites, keep every body as
is.** Rationale: the bodies today are already correct enough for
service_role callers; the attack was purely that PUBLIC had EXECUTE.
This minimises blast radius and preserves behaviour exactly. Auditor
asked for body rewrites — I flag that the body rewrites carry more
risk than benefit in this codebase and suggest deferring them.

**Decision for implementer:** choose (A) REVOKE-only, or (B) REVOKE +
belt-and-braces gate. Both fix the CVE. Not both required.

---

## 3. Migration design

### Migration 1: `lock_down_admin_rpcs_2026_04_19` (idempotent)

For each of the 14 functions:

```sql
REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM anon;
REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO service_role;
```

Functions (with exact signatures — must match `pg_get_function_identity_arguments`):

1. `public.anonymize_user(p_user_id uuid)`
2. `public.apply_penalty(p_mod_id uuid, p_target_id uuid, p_level integer, p_reason text)`
3. `public.approve_expert_application(p_reviewer_id uuid, p_application_id uuid, p_review_notes text)`
4. `public.cancel_account_deletion(p_user_id uuid)`
5. `public.grant_role(p_admin_id uuid, p_user_id uuid, p_role_name text)`
6. `public.hide_comment(p_mod_id uuid, p_comment_id uuid, p_reason text)`
7. `public.mark_probation_complete(p_admin_id uuid, p_application_id uuid)`
8. `public.reject_expert_application(p_reviewer_id uuid, p_application_id uuid, p_rejection_reason text)`
9. `public.resolve_appeal(p_mod_id uuid, p_warning_id uuid, p_outcome text, p_notes text)`
10. `public.resolve_report(p_mod_id uuid, p_report_id uuid, p_resolution text, p_notes text)`
11. `public.revoke_role(p_admin_id uuid, p_user_id uuid, p_role_name text)`
12. `public.schedule_account_deletion(p_user_id uuid, p_reason text)`
13. `public.send_breaking_news(p_article_id uuid, p_title text, p_body text)`
14. `public.unhide_comment(p_mod_id uuid, p_comment_id uuid)`

For `anonymize_user` specifically, add a defence-in-depth check so the
function cannot be used to self-anonymize even if EXECUTE is
accidentally re-granted:

```sql
-- inside anonymize_user body, before any UPDATE:
IF current_setting('request.jwt.claim.role', true) <> 'service_role'
   AND (auth.uid() IS NULL OR auth.uid() = p_user_id) THEN
  RAISE EXCEPTION 'anonymize_user may not be self-invoked' USING ERRCODE = '42501';
END IF;
```

This is the ONE body change I recommend (highest-blast-radius fn, no
legitimate self-service path — users go through
`schedule_account_deletion` instead; the cron then calls
`anonymize_user` as service_role). Preserves the existing body
otherwise.

For `schedule_account_deletion` and `cancel_account_deletion`: these
are legitimately called on behalf of the owning user, from
`/api/account/delete` and `/api/account/login-cancel-deletion` which
authenticate the user session, check the permission, then call the
RPC as service_role with `p_user_id: user.id`. The REVOKE + service_role
GRANT is correct for them too — the Next.js layer is the gate. Do NOT
add a per-user self-check in the body; that would double-check in a way
that breaks the legitimate cron-style callers (e.g. future admin
forced-cancel).

### Migration 2: `tighten_pso_select_rls_2026_04_19`

```sql
DROP POLICY IF EXISTS pso_select ON public.permission_scope_overrides;
CREATE POLICY pso_select ON public.permission_scope_overrides
  FOR SELECT
  USING (
    public.is_admin_or_above()
    OR (scope_type = 'user' AND scope_id = auth.uid())
  );
```

Notes:
- `scope_id` is `uuid`, so compare `= auth.uid()` directly (no cast).
- `scope_type = 'user'` guards against leaking role-scoped or
  org-scoped overrides where `scope_id` coincidentally equals a user
  uuid for an unrelated entity. (Check prod scope_type values before
  committing this exact clause — see Ambiguities below.)
- Admins retain full read. Users see only overrides pointed at them
  individually.

### Verification probes

For each of the 14 functions, after Migration 1:

```sql
-- As anon (using anon key in REST API):
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/<fn>" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{}'
--   Expect: HTTP 404 "function does not exist" OR 42501 ACL denial
-- As authenticated non-admin (anon key with a signed-in user JWT):
--   Expect: same denial
-- As service_role:
--   Expect: success (or the function's existing validation errors)
```

Per-function specifics:

| fn | post-migration anon probe | post-migration service_role probe |
| --- | --- | --- |
| `anonymize_user` | must deny | must succeed on a throwaway test user |
| `send_breaking_news` | must deny | must succeed |
| `grant_role` / `revoke_role` | must deny | must succeed as before |
| `apply_penalty` / `resolve_appeal` / `hide_comment` / `unhide_comment` / `resolve_report` | must deny | must succeed via `/api/admin/...` as before |
| `approve_expert_application` / `reject_expert_application` / `mark_probation_complete` | must deny | must succeed as before |
| `schedule_account_deletion` / `cancel_account_deletion` | must deny (anon cannot schedule anyone's deletion directly) | must succeed via `/api/account/delete` as before |

For Migration 2 (`pso_select`):

```sql
-- As anon / authenticated non-admin:
SELECT * FROM public.permission_scope_overrides LIMIT 1;
-- Expect: only rows where scope_type='user' AND scope_id=auth.uid()
-- (empty for most users)
-- As admin: returns all rows.
```

---

## 4. Web / iOS caller audit

Grepped for every function name in `site/src` and `VerityPost/`:

### 4a. Web — all 14 functions

Every call-site goes through `createServiceClient().rpc(...)`. None
use the user-session `supabase.rpc(...)` client. Inventory:

| fn | call-site | client |
| --- | --- | --- |
| `anonymize_user` | (called by cron/edge function — not in `site/src`) | service_role (must verify cron path) |
| `apply_penalty` | `site/src/app/api/admin/moderation/users/[id]/penalty/route.js:44` | service_role |
| `approve_expert_application` | `site/src/app/api/admin/expert/applications/[id]/approve/route.js:17` | service_role |
| `cancel_account_deletion` | `site/src/app/api/account/delete/route.js:85`, `site/src/app/api/account/login-cancel-deletion/route.js:35`, `site/src/app/api/auth/login/route.js:60`, `site/src/app/api/auth/callback/route.js:136` | service_role (all four) |
| `grant_role` | `site/src/app/api/admin/users/[id]/roles/route.js:55` | service_role |
| `hide_comment` | `site/src/app/api/admin/moderation/comments/[id]/hide/route.js:17` | service_role |
| `mark_probation_complete` | `site/src/app/api/admin/expert/applications/[id]/mark-probation-complete/route.js:22` | service_role |
| `reject_expert_application` | `site/src/app/api/admin/expert/applications/[id]/reject/route.js:20` | service_role |
| `resolve_appeal` | `site/src/app/api/admin/appeals/[id]/resolve/route.js:21` | service_role |
| `resolve_report` | `site/src/app/api/admin/moderation/reports/[id]/resolve/route.js:21` | service_role |
| `revoke_role` | `site/src/app/api/admin/users/[id]/roles/route.js:102` | service_role |
| `schedule_account_deletion` | `site/src/app/api/account/delete/route.js:69` | service_role |
| `send_breaking_news` | `site/src/app/api/admin/broadcasts/breaking/route.js:23` | service_role |
| `unhide_comment` | `site/src/app/api/admin/moderation/comments/[id]/unhide/route.js:16` | service_role |

**Zero client-side callers.** `preflight.js` only references the names
as a liveness check. `site/src/types/database.ts` mentions are
generated Supabase types, not call-sites.

### 4b. iOS — no direct RPC callers

Two incidental mentions in `VerityPost/VerityPost/AuthViewModel.swift`
(lines 168, 401) are comments only — the iOS client hits the Next.js
API endpoints, not Supabase RPCs directly.

### 4c. Cron / edge functions

`anonymize_user` is not called from `site/src` — it is driven by a
scheduled task (see `04-Ops` / cron config in repo). Implementer must
verify that path also runs as service_role before applying Migration 1.
Suspected location: `site/src/app/api/cron/account-deletion/*` or
similar. If found and also using `createServiceClient()`, no code change
needed.

### 4d. Conclusion

**No web/iOS code changes required.** The REVOKE-only migration is
transparent to every legitimate caller because every legitimate caller
already uses service_role, which retains EXECUTE.

---

## 5. What NOT to touch

- Business logic inside any of the 14 function bodies (preserve every
  UPDATE / INSERT / audit_log write unchanged). Only `anonymize_user`
  gets a single defensive `RAISE EXCEPTION` prepended.
- Other SECURITY DEFINER functions not in the list (e.g.
  `compute_effective_perms`, `bump_user_perms_version`,
  `create_notification`, `submit_expert_application`,
  `submit_appeal`) — out of scope for Round 6.
- The `pso_write` policy — already correct.
- Any caller code in `site/src` or `VerityPost/` — unchanged.

---

## 6. Rollback

Both migrations are idempotent.

Reverse migration for Migration 1 (only if a legitimate caller breaks):

```sql
GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO anon, authenticated;
```

Reverse migration for Migration 2:

```sql
DROP POLICY IF EXISTS pso_select ON public.permission_scope_overrides;
CREATE POLICY pso_select ON public.permission_scope_overrides
  FOR SELECT USING (true);
```

For the `anonymize_user` body addition (if applied), re-apply the
original `CREATE OR REPLACE FUNCTION` from pre-migration source.

---

## 7. Expected size

- 1 DB migration with 14 * 4 = 56 ACL statements + 1 `CREATE OR REPLACE FUNCTION` for `anonymize_user` (the defensive self-anonymize guard)
- 1 DB migration for `pso_select` RLS
- 0 web file edits
- 0 iOS file edits

---

## 8. Ambiguities / flags for implementer

1. **Auditor asked for body rewrites** (ignore caller-supplied actor,
   use `auth.uid()` + `is_admin_or_above()`). I recommend **not**
   doing this — every legitimate caller uses service_role where
   `auth.uid()` is NULL, so the rewrite would block all legitimate
   admin actions. The REVOKE alone fixes the CVE. Decision needed from
   PM / Implementer before writing Migration 1.
2. **`anonymize_user` cron caller** not located in `site/src`; verify
   it runs as service_role before applying lockdown. Check for a
   `supabase/functions/*` edge function or external cron.
3. **`permission_scope_overrides.scope_type` values in prod** — I
   assumed `'user'` is the scope_type for user-targeted overrides.
   Implementer should run `SELECT DISTINCT scope_type FROM public.permission_scope_overrides;`
   and verify before committing the pso_select policy clause.
4. **No surprises about Auditor's list being wrong** — all 10 listed
   functions are indeed PUBLIC-EXECUTable SECURITY DEFINER as
   described. Auditor MISSED 4 more with the same pattern
   (`hide_comment`, `unhide_comment`, `resolve_report`,
   `mark_probation_complete`). Plan includes them.
5. **`_user_is_moderator(uuid)` takes a uuid param**, not
   `auth.uid()`. Existing mod function bodies already use it correctly
   against the caller-supplied `p_mod_id`; the attack vector is
   entirely the PUBLIC EXECUTE grant plus the trusted actor param, not
   a bug in `_user_is_moderator` itself.
