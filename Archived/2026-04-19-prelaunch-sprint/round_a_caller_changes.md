# Round A — caller code changes

Every caller touched before, during, or after the `092_rls_lockdown.sql`
deploy. Ship order: all items tagged **BEFORE** must land in a deploy
that is live in prod before (or in the same atomic deploy as) the
migration. Items tagged **AFTER** can ship in a follow-up if the
migration's column-grant REVOKEs do not trip them in normal flow.

The biggest blast radius is the six `user_roles / roles / permissions /
permission_sets / plans` admin CRUD callers plus the three auth writes
(`audit_log` and column-level `users.last_login_ip`). Everything else is
smaller surface area.

Count of unique files touched: **15** (web 12, iOS 3).

---

## BEFORE (must ship with or before the migration)

### 1. `/site/src/app/api/auth/signup/route.js`

Lines 51, 70, 77. Triggered by: C-03 (users upsert needs to persist
private profile_visibility default), C-05 (user_roles insert revoked),
C-06 (audit_log insert revoked).

Current:
```js
await supabase.from('users').upsert({ id: userId, email, email_verified: false, display_name: ..., metadata: {...} }, { onConflict: 'id' });

const { data: userRole } = await supabase.from('roles').select('id').eq('name', 'user').single();
if (userRole) {
  await supabase.from('user_roles').insert({ user_id: userId, role_id: userRole.id, assigned_by: userId });
}

await supabase.from('audit_log').insert({ actor_id: userId, action: 'auth:signup', target_type: 'user', target_id: userId, metadata: { method: 'email', ip } });
```

Required (service-role client for all three writes):
```js
import { createClient, createServiceClient } from '@/lib/supabase/server';
// ...
const service = createServiceClient();
await service.from('users').upsert({ id: userId, email, email_verified: false, display_name: ..., metadata: {...} }, { onConflict: 'id' });

const { data: userRole } = await service.from('roles').select('id').eq('name', 'user').single();
if (userRole) {
  await service.from('user_roles').insert({ user_id: userId, role_id: userRole.id, assigned_by: userId });
}

await service.from('audit_log').insert({ actor_id: userId, action: 'auth:signup', target_type: 'user', target_id: userId, metadata: { method: 'email', ip } });
```

Why: C-05 revokes authenticated INSERT on `user_roles`, C-06 revokes it
on `audit_log`. At signup time the session is often not yet populated
(email-confirm flow), so the caller-client auth.uid() is null anyway.
Round E H-01 already calls for this migration — Round A forces it
earlier.

### 2. `/site/src/app/api/auth/callback/route.js`

Lines ~85 (auth_providers upsert), 106 (user_roles insert), 113
(audit_log insert). Triggered by: C-05, C-06.

Current:
```js
await supabase.from('auth_providers').upsert({ ... });
await supabase.from('user_roles').insert({ user_id: user.id, role_id: userRole.id, assigned_by: user.id });
await supabase.from('audit_log').insert({ actor_id: user.id, action: 'auth:signup', target_type: 'user', target_id: user.id, metadata: { method: 'oauth', provider } });
```

Required: same as #1 — swap `supabase` to `createServiceClient()` for
all three writes. Keep the session-scoped client for the OAuth code
exchange and user lookup.

Why: C-05 user_roles + C-06 audit_log. `auth_providers` upsert is a
Round E H-02 item but safe to ship here.

### 3. `/site/src/app/api/auth/login/route.js`

Lines 32 (users.update with last_login_ip), 48 (audit_log.insert).
Triggered by: C-06, N-02 column REVOKE.

Current:
```js
await supabase.from('users').update({ last_login_at: ..., last_login_ip: ip }).eq('id', userId);
// ...
await supabase.from('audit_log').insert({ ... });
```

Required:
```js
await service.from('users').update({ last_login_at: ..., last_login_ip: ip }).eq('id', userId);
// ...
await service.from('audit_log').insert({ ... });
```

Why: N-02 revokes authenticated INSERT/UPDATE on `last_login_ip`
column. The file already imports `createServiceClient` (line 3) and
holds `service` at line 30 — the change is a one-character swap on
two lines.

### 4. `/site/src/app/api/promo/redeem/route.js`

Line 140. Triggered by: C-06.

Current:
```js
await supabase.from('audit_log').insert({ actor_id: user.id, action: 'promo:apply_full_discount', ... });
```

Required: swap `supabase` to `createServiceClient()` (import already
available elsewhere in the file if `plan_id` update routes through
service; otherwise add it).

Also review line 135 `supabase.from('users').update({ plan_id, plan_status })`
— this updates privileged columns that `reject_privileged_user_updates`
already blocks. If it currently succeeds it is because the route is
admin-only at the permission layer (`promo.redeem`); confirm by
running the route as a standard user → expect 42501.

### 5. `/site/src/app/admin/subscriptions/page.tsx`

Line 143. Triggered by: C-06.

Current:
```js
const insertBillingAudit = async (action, target_type, target_id, metadata) => {
  try { await supabase.from('audit_log').insert({ action, target_type, target_id, metadata } as any); }
  catch { /* best-effort */ }
};
```

Required: move the audit write into a new API route
`/api/admin/billing/audit` that uses service-role, and call it from
here. Keep the fire-and-forget semantics.

Why: admin UI runs on the caller-scoped client; `audit_log` INSERT
is revoked from authenticated. Every other admin audit already uses
this pattern (see `/api/admin/subscriptions/[id]/manual-sync/route.js`).

### 6. `/site/src/app/admin/users/page.tsx`

Lines 245 (users.update is_banned), 414 (roles.select), 419
(user_roles.delete), 420 (user_roles.insert), 456 (plans.select).
Triggered by: C-05.

Current:
```js
await supabase.from('user_roles').delete().eq('user_id', dialog.userId);
const { error } = await supabase.from('user_roles').insert({ user_id: dialog.userId, role_id: roleRow.id, assigned_by: currentUserId });
```

Required: move the role/plan assignment logic into a new API route
(e.g. `/api/admin/users/[id]/role` with PATCH) running on the service
client. Also audit the existing line 245 `supabase.from('users').update({ is_banned: true })`
— the trigger blocks it today, so this code cannot be firing end to
end; confirm by testing and then route through the admin RPC instead.

### 7. `/site/src/app/admin/permissions/page.tsx`

Lines 203 (permissions.update), 230 (permissions.insert), 271
(permissions.delete), 284 (permission_sets.update), 345
(permission_sets.delete), 528 (user_permission_sets.insert), ~568
(user_permission_sets.delete). Triggered by: C-05.

Required: create `/api/admin/permissions/*` service-role routes
mirroring the existing `get_advisors`-style admin API pattern. Replace
every `supabase.from('permissions|permission_sets|user_permission_sets').<mutation>`
call with a `fetch('/api/admin/permissions/...', { method: 'POST|PATCH|DELETE' })`
call.

Rough shape:

```
POST   /api/admin/permissions            create permission
PATCH  /api/admin/permissions/[id]       update permission
DELETE /api/admin/permissions/[id]       delete permission
PATCH  /api/admin/permission-sets/[id]   update set
DELETE /api/admin/permission-sets/[id]   delete set
POST   /api/admin/permissions/grant      insert user_permission_sets
DELETE /api/admin/permissions/grant      delete user_permission_sets
```

Each route requires `is_admin_or_above()` / `has_permission('admin.permissions.write')`.

### 8. `/site/src/app/admin/plans/page.tsx`

Line 169 (plans.update). Triggered by: C-05.

Current:
```js
const { error } = await supabase.from('plans').update(patch).eq('id', selected.id);
```

Required: new `/api/admin/plans/[id]` PATCH route running on service.

---

## AFTER (schema-safe but will trip edge cases)

### 9. `/site/src/app/card/[username]/opengraph-image.js` (line 22-26),
### `/site/src/app/card/[username]/page.js` (line 47-52),
### `/site/src/app/card/[username]/layout.js` (line 9-13)

Anon-facing reads of `public.users`. Triggered by: C-03 (profile flip
to private).

Current (layout.js):
```js
const { data: target } = await supabase
  .from('users')
  .select('username, display_name, bio, verity_score, profile_visibility')
  .eq('username', username)
  .maybeSingle();
```

Required: switch to the view so the read is explicit about its public
contract, and survives future column REVOKEs.

```js
const { data: target } = await supabase
  .from('public_user_profiles')
  .select('username, display_name, bio, verity_score, profile_visibility')
  .eq('username', username)
  .maybeSingle();
```

Apply to all three files. The view auto-filters by
`profile_visibility='public'`; the route today does a client-side
`visible = target.profile_visibility === 'public'` check that still
works but becomes redundant (keep for defensive rendering).

Why: after civilians flip to private, anon callers of `/card/<user>`
will get NULL for every private profile. The view mirrors that
behavior server-side and documents intent. It also survives any
follow-up column REVOKE sweep on `public.users`.

Note: `opengraph-image.js` + `page.js` also select `avatar_url`,
`avatar_color`, `banner_url`, `streak_current`, `is_expert`,
`expert_title`, `expert_organization` — NOT in the view. Options:
(a) widen the view (breaks the attack-plan whitelist), (b) add a
companion `public_user_profiles_extended` view, (c) accept that
anon-facing card pages show reduced data. **Recommend (a) — widen the
view to match the existing PUBLIC_USER_FIELDS set used at
`/profile/[id]/page.tsx:83`**. Flag for Planner review.

### 10. `/site/src/app/u/[username]/page.tsx`

Line 118. Triggered by: C-03 civilian flip.

Current:
```js
const { data: targetRow } = await supabase
  .from('users')
  .select('id, username, display_name, bio, avatar_url, avatar_color, banner_url, verity_score, followers_count, following_count, profile_visibility, is_expert, expert_title, expert_organization')
  .eq('username', username as string)
  .maybeSingle<TargetRow>();
```

Required: no change needed for the query itself — this runs on an
authenticated client, and the RLS policy still returns the row for
own-user or for `profile_visibility='public'` (staff) or for
`is_admin_or_above()`. The existing `if (targetRow.profile_visibility
=== 'private' && (!user || user.id !== targetRow.id))` branch at line
127 will now fire for every civilian target, which is exactly the
intended outcome of the flip.

**Action:** add a toast or empty-state copy so signed-in visitors to a
private profile see "This profile is private" rather than silent
not-found. Flag UX lift for Round I (out of scope for Round A).

### 11. `/site/src/app/profile/[id]/page.tsx`

Line 153-155. Triggered by: C-03 civilian flip.

Current:
```js
const { data: byId } = await supabase
  .from('users')
  .select(PUBLIC_USER_FIELDS)
  .eq('id', id as string)
  .maybeSingle();
```

Required: no query change — the route's existing `PUBLIC_USER_FIELDS`
filter (line 83) already narrows the payload to safe columns and the
RLS policy continues to gate the row itself. Same UX concern as #10 —
most civilians now 404 to anon visitors. Acceptable.

---

## iOS

### 12. `/VerityPost/VerityPost/PublicProfileView.swift`

Line 161-163. Triggered by: C-03.

Current:
```swift
let row: VPUser? = try await client.from("users")
    .select()
    .eq("username", value: username)
    ...
```

Required: switch to the view.
```swift
let row: VPUser? = try await client.from("public_user_profiles")
    .select("id, username, display_name, avatar_url, bio, verity_score, created_at, profile_visibility")
    ...
```

Why: `.select()` with no argument is `SELECT *`. After anon SELECT
is revoked on PII columns, the entire call returns 42501 even for
authenticated sessions if PostgREST's column inference still includes
revoked columns — fail-safe is to narrow the projection. The view is
the cleanest contract.

### 13. `/VerityPost/VerityPost/AuthViewModel.swift`

Line 253-255. Triggered by: C-03 (implicit — authenticated upsert of
its own row is still fine, but validate the upsert doesn't touch
REVOKEd columns).

Current:
```swift
try await client.from("users")
    .upsert(UserUpsert(id: userId, email: email, username: normalized), onConflict: "id")
    .execute()
```

Required: unchanged for Round A — `UserUpsert` only touches `id,
email, username`, all of which the authenticated role retains write
grants on. Flag in comments that any future column addition to
`UserUpsert` must not include a privileged / N-02 column. Covered by
Round E H-01 (move post-signup write to service). No Round A action.

### 14. `/VerityPost/VerityPost/LeaderboardView.swift`

Lines 380-386, 395-401, 409-415, 423-430, 453-459. Triggered by:
C-03 (indirectly).

Current:
```swift
let data: [VPUser] = try await client.from("users")
    .select("id, username, verity_score, avatar_color, avatar_url, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, streak_current, created_at")
    .order("verity_score", ascending: false)
    ...
```

Required: no change for the narrow column-REVOKE set in this
migration. None of the selected columns are in the REVOKE list.
Flag in a comment that these calls depend on the current public-
column set and must be revisited if a later migration tightens more
columns.

### 15. `/VerityPost/VerityPost/ExpertQueueView.swift`

Line 272-273. Triggered by: N-01 expert_queue_items REVOKE.

Current:
```swift
var query = client.from("expert_queue_items")
    .select("id, status, created_at, article_id, comments!comment_id(body), answer_comments:comments!answer_comment_id(body), articles(title)")
```

Required: swap the direct table read for a call to the existing web
API (`GET /api/expert/queue?status=...`) and parse the JSON response.
After Round A the authenticated Swift client will get 42501 on this
table because we revoke SELECT from authenticated.

Alternative (lighter touch, keep the direct query): add a SELECT
policy to `expert_queue_items` that mirrors the API's filter logic
(expert in category OR target expert). This is a whole policy of
its own and adds coupling to `expert_application_categories`. The
API-route swap is cleaner.

---

## Non-touches confirmed (no action needed)

These patterns exist in the codebase but DO NOT need changes under
Round A's scope:

- All other `/admin/*/page.tsx` `supabase.from('users').select('id')`
  own-row self-check calls (lines at admin/{analytics, breaking,
  comments, cohorts, email-templates, kids-story-manager, moderation,
  notifications, reader, stories, story-manager, streaks, subscriptions,
  support, system, webhooks}). These run as authenticated, RLS permits
  own-row reads, and no REVOKE-listed column is selected.
- `NavWrapper.tsx`, `welcome/page.tsx`, `messages/page.tsx`,
  `CommentComposer.tsx`, `story/[slug]/page.tsx`, `appeal/page.tsx`
  own-row reads. Same reasoning — authenticated, own-row, no REVOKE
  columns projected.
- `leaderboard/page.tsx` reads `is_banned`, `email_verified` on anon
  client. The narrow REVOKE set keeps these columns anon-readable.
- `signup/pick-username/page.tsx:72` `users.select('username').eq('username', name)`
  is used on the anon client for uniqueness checks. `username` is not
  in the REVOKE list. Safe.
- All `.from('webhook_log').insert` callers already run on service.
  `/site/src/lib/cronLog.js:45`, `api/stripe/webhook/route.js:58`,
  `api/ios/subscriptions/sync/route.js:80`,
  `api/ios/appstore/notifications/route.js:87`.
- All admin audit inserts in `/api/admin/*` and `/api/stripe/webhook`
  already use the `service` client.
- `/api/recap/*` routes already use `service` for weekly_recap_* reads.
- `/api/family/achievements/route.js` already uses `service`.
- `/api/bookmark-collections/route.js` already uses `service` for
  selects + RPC.
- `comment_context_tags` client read in `components/CommentThread.tsx:105`
  — the new SELECT policy (`user_id = auth.uid()`) matches the
  caller's existing `.eq('user_id', currentUserId)` filter. No change
  needed.
- `profile/settings/page.tsx:2681` category_supervisors own-row read —
  the new SELECT policy covers it. No change needed.
- `MessagesView.swift:413` `user_roles` SELECT (roles join) — SELECT
  not revoked. Safe.
- No caller anywhere reads or writes `perms_global_version` directly;
  `my_perms_version()` DEFINER RPC is the only access path and remains
  intact.
