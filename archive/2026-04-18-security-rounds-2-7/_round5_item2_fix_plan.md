# Round 5 Item 2 — iOS users.update hardening + latent column fix: FIX PLAN

Reviewer: Round 5 Reviewer (Item 2)
Date: 2026-04-18
Scope: iOS SettingsView + AuthViewModel direct `users` writes, plus the seven web client-session writes that share the same surface. Trigger (Round 4) stays as defence-in-depth.

---

## Validation of Auditor's claims (done first)

1. **Phantom columns confirmed.** `information_schema.columns` for `public.users`
   (90 columns queried live on project `fyiwulqphgmoqullmrfn`) contains NONE
   of `location`, `website`, `avatar`, `preferences`. `site/src/types/database.ts`
   agrees — the generated `Row` type for `users` lists `metadata jsonb` and
   `avatar_url text` / `avatar_color varchar` but no `avatar`, no `preferences`,
   no `location`, no `website`.

2. **Intended canonical column names:**
   - iOS `location`   -> store inside `metadata.location` (no first-class column;
     web also has no `location` column and never attempts to write it).
   - iOS `website`    -> store inside `metadata.website` (same reasoning).
   - iOS `avatar` (jsonb outer/inner/initials) -> store inside `metadata.avatar`
     (this is exactly what web does at `profile/settings/page.tsx:1223-1242`:
     `mergedMeta = { ...prevMeta, avatar: avatarPayload }` and writes to
     `metadata`).
   - iOS `preferences` -> the column name is `metadata`. The web equivalent
     reads/writes `metadata` everywhere; iOS using `preferences` is a bug.

3. **Seven web call sites verified.** All seven live in
   `site/src/app/profile/settings/page.tsx` and all use the user-session
   `supabase` client from `@/lib/supabase/client`. No API-route / service-role
   writes among them. Lines: 1244, 1641, 2034, 2409, 3361, 3466, 3542.

4. **Service-role / legitimate direct writes (OUT OF SCOPE):**
   - `api/auth/login/route.js:32` — session client writes `last_login_at,
     last_login_ip` server-side; already behind an API route and auth-guarded.
     Leave alone.
   - `api/auth/callback/route.js:129` — session client writes email-verified
     fields; server-side only. Leave alone.
   - `admin/users/page.tsx:222, 246, 443, 463` — admin-only writes to
     `is_banned`, `plan_id`, `plan_status`. The Round-4 trigger explicitly
     exempts `public.is_admin_or_above()`, so these remain legitimate.
   - `api/kids/route.js:101`, `api/stripe/webhook/route.js:*`,
     `api/promo/redeem/route.js:128`, `api/admin/subscriptions/.../manual-sync/route.js:*`,
     `api/cron/send-push/route.js:54`, `api/ios/subscriptions/sync/route.js:106`,
     `api/ios/appstore/notifications/route.js:186`,
     `api/admin/users/[id]/permissions/route.js:104` — all use the **service**
     client (`createServiceClient()` / `service.from('users')`). Service role
     bypasses the trigger by design. Leave alone.

---

## Part A — DB: create `update_own_profile` RPC

### Schema
- **Name:** `public.update_own_profile(p_fields jsonb) RETURNS jsonb`
- **Security:** `SECURITY DEFINER`, `SET search_path = public, pg_catalog`,
  owned by `postgres`
- **Grants:** `REVOKE ALL ... FROM PUBLIC, anon`;
  `GRANT EXECUTE ... TO authenticated`
- **Body behaviour:**
  - Reject if `auth.uid() IS NULL` (raise `EXCEPTION` code `42501`,
    message `"not authenticated"`).
  - Walk `jsonb_object_keys(p_fields)`. For each key:
    - If key is not in the allowlist, **raise EXCEPTION**
      (message `"unknown field: <key>"`, code `22023`).
      Fail-closed rather than silently drop, because silent-drop is exactly
      the bug that hid the iOS typos (`preferences`, `location`, `website`,
      `avatar`) for this long. We want the next typo to be loud.
  - Build one `UPDATE public.users SET ...` column-by-column (NO dynamic
    SQL — use `CASE WHEN p_fields ? 'bio' THEN p_fields->>'bio' ELSE bio END`
    style, or `COALESCE(p_fields->>'bio', bio)` per column). Type-cast each
    column to match its declared SQL type (e.g. `bio` is `character varying`,
    `notification_email` is `boolean`, `date_of_birth` is `date`, `metadata`
    is `jsonb`).
  - `WHERE id = auth.uid()`.
  - Return `jsonb_build_object('ok', true, 'updated_at', updated_at)` after
    the update. If 0 rows matched (should never happen — auth.uid is a FK),
    raise.
  - Raise on any SQLERRM; caller's `try/catch` (iOS) or `error` handler
    (web) surfaces it.

### Column allowlist (authoritative)

Scope: every column that (a) iOS OR web CURRENTLY writes through a session
client, AND (b) exists in `public.users`, AND (c) is not on the Round-4
privileged list, AND (d) is not a system-only column (e.g. `id`, `email`,
`created_at`, `perms_version`, counts, streak fields).

Resulting allowlist — **18 columns**:

| # | Column | Type | Writer today |
|---|--------|------|--------------|
| 1 | `username` | varchar | iOS line 312/319 |
| 2 | `display_name` | varchar | web line 1230 |
| 3 | `bio` | varchar | iOS line 312/319, web lines 1231, 3364 |
| 4 | `avatar_url` | text | web line 1234 |
| 5 | `avatar_color` | varchar | iOS line 312/319, web line 1235 |
| 6 | `banner_url` | text | web line 1236 |
| 7 | `profile_visibility` | varchar | web line 1237 |
| 8 | `show_activity` | boolean | web line 1238 |
| 9 | `show_on_leaderboard` | boolean | web line 1239 |
| 10 | `allow_messages` | boolean | web line 1240 |
| 11 | `dm_read_receipts_enabled` | boolean | iOS line 1239, web line 1241 |
| 12 | `notification_email` | boolean | (not currently written but a visible self-serviceable toggle; add so follow-up UI doesn't have to bump the RPC) |
| 13 | `notification_push` | boolean | (same rationale as notification_email) |
| 14 | `att_status` | varchar | (iOS ATT prompt flow — self-serviceable; pre-provision) |
| 15 | `att_prompted_at` | timestamptz | (same) |
| 16 | `metadata` | jsonb | iOS lines 906, 984, 1154 (today written as `preferences` — bug); web lines 1242, 1641, 2034, 2409, 3466, 3542 |
| 17 | `last_login_at` | timestamptz | iOS `AuthViewModel.swift:153` (best-effort login-timestamp write) |
| 18 | `onboarding_completed_at` | timestamptz | (self-ish; no current writer but included so the in-flight onboarding rework doesn't need a second RPC bump) |

**Excluded on purpose (flag to owner if anyone disagrees):**
- `first_name`, `last_name`, `date_of_birth`, `gender`, `country_code`,
  `timezone`, `locale`, `is_kids_mode_enabled`, `supervisor_opted_in` —
  the Auditor included these; **NO current writer exists** in either iOS or
  web. Adding them expands the attack surface for no app benefit today.
  Add when the UI that writes them lands. YAGNI.
- `last_active_at` — server-driven via a trigger / cron elsewhere; not a
  client write.
- All 22 Round-4-privileged columns — defence-in-depth duplication; the
  whole point of Option B is that the allowlist is tight.

### Migration file
- **Name:** `01-Schema/067_fix_item2_update_own_profile_rpc_2026_04_19.sql`
  (066 is Round 5 Item 1B's migration; 067 is next free — Implementer
  should double-check immediately before applying)
- **Idempotent:**
  - `CREATE OR REPLACE FUNCTION public.update_own_profile(jsonb) ...`
  - `REVOKE ALL ON FUNCTION public.update_own_profile(jsonb) FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION public.update_own_profile(jsonb) TO authenticated;`
  - No `DROP FUNCTION` needed because the signature is stable
    (`(p_fields jsonb) RETURNS jsonb`). If a future migration changes the
    signature, that migration must `DROP FUNCTION IF EXISTS` first.
- **Comment:** `COMMENT ON FUNCTION public.update_own_profile(jsonb) IS
  'Round 5 Item 2: single server-side write contract for self-profile
  edits. SECDEF + explicit allowlist; unknown keys RAISE.'`

---

## Part B — Swift: replace direct writes with RPC calls

All edits are in
`/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/SettingsView.swift`
and `AuthViewModel.swift`. Six SettingsView edits + one AuthViewModel edit = **7 iOS edits**.

### Edit 1: `SettingsView.swift` line 312 — `AccountSettingsView.save()` FullUpdate path

**Old (lines 293-327):**
```swift
// Prefer the full update with avatar jsonb. If the schema doesn't have
// the avatar column yet, fall back to the legacy avatar_color path.
struct AvatarJSON: Encodable { let outer: String; let inner: String?; let initials: String }
struct FullUpdate: Encodable {
    let username: String; let bio: String
    let location: String; let website: String
    let avatar_color: String
    let avatar: AvatarJSON
}
struct LegacyUpdate: Encodable {
    let username: String; let bio: String
    let location: String; let website: String
    let avatar_color: String
}
let initials = avatarInitials.isEmpty
    ? String((username.first.map { String($0) } ?? "?")).uppercased()
    : avatarInitials

do {
    try await client.from("users").update(FullUpdate(
        username: username, bio: bio, location: location, website: website,
        avatar_color: avatarOuter,
        avatar: AvatarJSON(outer: avatarOuter, inner: avatarInner, initials: initials)
    )).eq("id", value: userId).execute()
} catch {
    do {
        try await client.from("users").update(LegacyUpdate(
            username: username, bio: bio, location: location, website: website,
            avatar_color: avatarOuter
        )).eq("id", value: userId).execute()
    } catch {
        Log.d("Save profile error:", error)
        return
    }
}
```

**New:**
```swift
// Single server contract — SECDEF RPC with explicit column allowlist. The
// RPC merges metadata.{avatar,location,website} on the server after a
// fresh read, matching what the web profile settings page does. No more
// schema-drift try/catch fallback — unknown keys raise loudly.
struct AvatarJSON: Encodable { let outer: String; let inner: String?; let initials: String }
struct MetadataPatch: Encodable {
    let avatar: AvatarJSON
    let location: String
    let website: String
}
struct ProfilePatch: Encodable {
    let username: String
    let bio: String
    let avatar_color: String
    let metadata: MetadataPatch
}
let initials = avatarInitials.isEmpty
    ? String((username.first.map { String($0) } ?? "?")).uppercased()
    : avatarInitials

do {
    try await client.rpc(
        "update_own_profile",
        params: ProfilePatch(
            username: username,
            bio: bio,
            avatar_color: avatarOuter,
            metadata: MetadataPatch(
                avatar: AvatarJSON(outer: avatarOuter, inner: avatarInner, initials: initials),
                location: location,
                website: website
            )
        )
    ).execute()
} catch {
    Log.d("Save profile error:", error)
    return
}
```

**Note for Implementer:** the RPC expects `p_fields jsonb`, so the Swift
postgrest client should wrap the struct in the request body as-is (the
Swift postgrest `rpc` overload accepts a single `Encodable` argument and
sends it as the request JSON; verify with a grep of existing `client.rpc(...)`
call sites in this repo, e.g. `PublicProfileView.swift` or wherever
`bump_user_perms_version` is called, if it is).

**Rationale:** also fixes the latent `location`/`website`/`avatar` column-typo
bugs by routing those three into `metadata` sub-keys (where web already puts
them). Removes the whole FullUpdate-then-LegacyUpdate catch-fallback pattern
that was only there because the "full" path never worked.

**Caveat on metadata merge semantics:** the RPC replaces the whole `metadata`
jsonb if `metadata` is in the payload. That would clobber `notification_prefs`,
`feed`, `expert`, `a11y`, `expertWatchlist`, `expertVacation`. Two acceptable
options — **Implementer picks one and documents**:
- Option 1 (recommended): RPC does a server-side deep-merge when `metadata`
  is present — reads old `metadata`, applies top-level key merge, writes
  merged result. Matches web's "read-then-merge" dance but moves it into
  the DB so concurrent edits compete at the same point. Implementer adds
  this merge behaviour to the SQL body with a comment.
- Option 2: iOS does the read-then-merge locally before calling the RPC
  (matches web). Simpler SQL but races with web concurrent edits.

Reviewer recommends **Option 1** for long-term clarity but will accept
Option 2 if Implementer finds Option 1 runs into SQL-plpgsql jsonb merge
weirdness. If Option 1, the allowlist doc should note "metadata: deep-merged
at top level".

### Edit 2: `SettingsView.swift` line 319 — LegacyUpdate fallback

Deleted as part of Edit 1. No separate patch needed.

### Edit 3: `SettingsView.swift` line 906 — `NotificationsSettingsView.save()`

**Old:**
```swift
try await client.from("users")
    .update(["preferences": dictString])
    .eq("id", value: userId)
    .execute()
```

**New:**
```swift
struct MetadataPatch: Encodable { let metadata: JSONValue }
let metadataValue = try JSONDecoder().decode(JSONValue.self, from: data)
try await client.rpc(
    "update_own_profile",
    params: MetadataPatch(metadata: metadataValue)
).execute()
```

`data` is the already-built `Data` from `JSONSerialization.data(withJSONObject: merged)`
on line 904. `JSONValue` is the existing helper used throughout SettingsView
for decoding (`JSONValue?` appears on lines 889, 970, 1132, 1146, etc.).
Verify a matching `JSONValue` Encodable conformance exists, or switch to
`Data`/`[String: AnyEncodable]`.

**Rationale:** fixes the `preferences` -> `metadata` typo AND gates through
the RPC. If `JSONValue` is not bidirectionally Encodable, Implementer falls
back to re-decoding `merged` as `[String: AnyEncodable]` (there are patterns
in the codebase for this) or just skips the round-trip and encodes `merged`
directly.

### Edit 4: `SettingsView.swift` line 984 — `FeedPreferencesSettingsView.save()`

Identical shape to Edit 3 (same `preferences` -> `metadata` via RPC). Apply
the same pattern.

### Edit 5: `SettingsView.swift` line 1154 — `ExpertSettingsView.save()`

Identical shape to Edit 3. Apply the same pattern.

### Edit 6: `SettingsView.swift` line 1239 — `DataPrivacyView.saveDmReceiptsPref()`

**Old:**
```swift
try await client.from("users")
    .update(["dm_read_receipts_enabled": newValue])
    .eq("id", value: userId)
    .execute()
```

**New:**
```swift
struct Patch: Encodable { let dm_read_receipts_enabled: Bool }
try await client.rpc(
    "update_own_profile",
    params: Patch(dm_read_receipts_enabled: newValue)
).execute()
```

### Edit 7: `AuthViewModel.swift` line 153 — best-effort `last_login_at`

**Old:**
```swift
try await client.from("users")
    .update(["last_login_at": ISO8601DateFormatter().string(from: Date())])
    .eq("id", value: session.user.id.uuidString)
    .execute()
```

**New:**
```swift
struct Patch: Encodable { let last_login_at: String }
try await client.rpc(
    "update_own_profile",
    params: Patch(last_login_at: ISO8601DateFormatter().string(from: Date()))
).execute()
```

`last_login_at` is in the allowlist (row 17 in the table above). Matches
the Auditor's recommendation (Regression #9).

**AuthViewModel.swift:249 is out of scope.** It's an `.upsert(...)` on
signup (INSERT path). Trigger does not fire on INSERT; RPC is for UPDATE.
Keep the direct upsert. A comment in the migration or CLAUDE.md should
note this split so future readers don't miss it.

---

## Part C — Web: replace 7 direct writes with RPC calls

All seven are in `site/src/app/profile/settings/page.tsx` and all use the
session `supabase` client (from `@/lib/supabase/client`). Each is a
self-edit on `users` WHERE `id = userId`.

### Web Edit 1: line 1244 — `handleSave` (profile/identity save)

**Old:**
```ts
const update: Partial<UserRow> = {
  display_name: displayName || null,
  bio: bio || null,
  avatar_url: avatarMode === 'upload' ? (avatarUrl || null) : null,
  avatar_color: avatarOuter,
  banner_url: bannerUrl || null,
  profile_visibility: profileVisibility,
  show_activity: showActivity,
  show_on_leaderboard: showOnLeaderboard,
  allow_messages: allowMessages,
  dm_read_receipts_enabled: dmReadReceipts,
  metadata: mergedMeta,
};
const { error } = await supabase.from('users').update(update).eq('id', userId);
```

**New:**
```ts
const patch = {
  display_name: displayName || null,
  bio: bio || null,
  avatar_url: avatarMode === 'upload' ? (avatarUrl || null) : null,
  avatar_color: avatarOuter,
  banner_url: bannerUrl || null,
  profile_visibility: profileVisibility,
  show_activity: showActivity,
  show_on_leaderboard: showOnLeaderboard,
  allow_messages: allowMessages,
  dm_read_receipts_enabled: dmReadReceipts,
  metadata: mergedMeta,
};
const { error } = await supabase.rpc('update_own_profile', { p_fields: patch });
```

Response parse: `supabase.rpc` returns `{ data, error }`. Callers here only
check `error`, so no shape change needed.

### Web Edits 2-7: lines 1641, 2034, 2409, 3361, 3466, 3542

All six follow the same pattern. Replace:

```ts
await supabase.from('users').update({ <fields> }).eq('id', userId);
```

with:

```ts
await supabase.rpc('update_own_profile', { p_fields: { <fields> } });
```

Specifically:
- **1641** (`saveNotifs`): `{ metadata: merged }`
- **2034** (`handleSave` feed): `{ metadata: merged }`
- **2409** (`handleSave` a11y): `{ metadata: merged }`
- **3361** (expert-profile save): `{ expert_title, expert_organization, bio }`
  - **BLOCKER for this edit:** `expert_title` and `expert_organization`
    are **NOT** in the Round-5-Item-2 allowlist (they're classified
    SYSTEM-ONLY / set-on-approval by the Auditor). This web call site
    currently succeeds via `supabase.from('users').update` because RLS +
    no-column-grant-restriction lets the user-session client write them.
    Reviewer believes these columns should in fact be EXCLUDED from
    self-edits (changing them is effectively re-claiming an expert
    credential). **Decision needed from owner:** either
    (a) add `expert_title`, `expert_organization` to the allowlist (matches
        current web behaviour) — accept the minor risk that an approved
        expert can rewrite their displayed title/org,
    or
    (b) block this via the RPC; `site` line 3361 handler raises, and the
        web ExpertProfileCard only edits `bio` via the RPC. Title/org
        would require a server-side admin action or a dedicated
        `update_expert_profile` RPC gated on `is_expert = true`.
    **Reviewer recommendation:** (a) for minimum-viable parity with today's
    behaviour — add two more rows to the allowlist with a comment
    "approved-expert self-edit; audited". Flag as follow-up to harden.
- **3466** (expert-vacation toggle): `{ metadata: merged }`
- **3542** (expert-watchlist toggle): `{ metadata: merged }`

If Implementer picks SQL-side deep-merge for `metadata` (Option 1 in Part B),
the client no longer needs the pre-read at lines 2016, 2402, 3462, 3539,
3520 — those fetches can be deleted. Mention in the Implementer notes but
do NOT require it in this pass; it's a follow-up cleanup.

### Out of scope in web (already correct)
- `/api/auth/login/route.js:32` — server-side, session-authed, writes
  `last_login_at` + `last_login_ip`. Could migrate to RPC too but it's
  already on a trusted server surface. Leave.
- `/api/auth/callback/route.js:129` — same rationale. Leave.
- `/api/auth/email-change/route.js:34` (update detected earlier) — server
  side API route. Leave. If it were migrated we'd need `email` in the
  allowlist which defeats the email verification flow.
- `admin/users/page.tsx:222, 246, 443, 463` — admin-exempt via trigger.
  Leave. (If we want everything through RPC eventually, that's a separate
  `update_any_user_as_admin` RPC — not Item 2's scope.)
- All `service.from('users').update(...)` — service-role, trigger-bypass
  by design. Leave.

---

## What NOT to change
- `public.reject_privileged_user_updates` trigger from
  `01-Schema/065_restrict_users_table_privileged_updates_2026_04_19.sql` —
  stays as defence-in-depth. Belt AND suspenders.
- `bump_user_perms_version`, `increment_field`, `cancel_account_deletion`,
  `handle_auth_user_updated`, `billing_freeze_profile`, etc. — all existing
  RPCs that touch `public.users` via service-role. Untouched.
- `AuthViewModel.swift:249` signup UPSERT — INSERT path, trigger irrelevant.
- Admin UI writes — trigger already grants admin bypass.
- `/api/auth/login` / `/api/auth/callback` / `/api/auth/email-change` — server
  routes running under session-auth; leave as is.

---

## Verification

1. **TypeScript:** `cd site && npx tsc --noEmit` -> exit 0.
   (Shape of `supabase.rpc('update_own_profile', { p_fields: <object> })`
   requires the generated types to include the new RPC. Implementer regenerates
   `site/src/types/database.ts` via
   `mcp__claude_ai_Supabase__generate_typescript_types` after applying the
   migration.)

2. **SQL probes (run with `SET LOCAL ROLE authenticated; SET LOCAL
   "request.jwt.claims" = '{"sub":"<real-user-uuid>"}';`):**
   - `SELECT public.update_own_profile('{"bio":"new bio","display_name":"Alice"}'::jsonb);`
     -> returns `{ok: true, updated_at: <ts>}`; row updated.
   - `SELECT public.update_own_profile('{"is_expert":true}'::jsonb);` ->
     RAISES `unknown field: is_expert`. (Confirms silent-drop footgun is
     closed AND privilege escalation still blocked.)
   - `SELECT public.update_own_profile('{"location":"NYC"}'::jsonb);` ->
     RAISES `unknown field: location` (since `location` is NOT in the
     allowlist; iOS now routes it through `metadata.location`).
   - `SELECT public.update_own_profile('{"metadata":{"location":"NYC"}}'::jsonb);`
     -> succeeds; row's `metadata->>'location'` = `'NYC'`.
   - `SELECT public.update_own_profile('{"verity_score":9999}'::jsonb);` ->
     RAISES `unknown field: verity_score`.
   - `SELECT public.update_own_profile('{"id":"<other-user>"}'::jsonb);` ->
     RAISES `unknown field: id` (the function always writes WHERE id = auth.uid()
     so other-user injection is impossible regardless).
   - Direct `UPDATE public.users SET verity_score=9999 WHERE id = auth.uid();`
     -> still blocked by the Round-4 trigger (SQLSTATE 42501). Confirms
     defence-in-depth.

3. **iOS:** verify each of the 7 patched call sites now calls
   `client.rpc("update_own_profile", ...)`. Full Xcode compile not in scope
   for Implementer but recommended before shipping. The `Log.d` pattern
   already in use will log the error if the RPC returns one — no new error
   handling needed.

4. **Web:** each of the 7 migrated call sites is covered by the tsc check.
   Smoke test `/profile/settings` save paths manually or via Playwright if
   available.

5. **Migration-first release order:**
   - Merge + apply migration 067 to production **before** shipping the iOS
     binary or web deploy that uses `update_own_profile`. Otherwise iOS
     save paths 404 and silently `Log.d` the error. Sequence:
     1. Apply migration in Supabase (`mcp__claude_ai_Supabase__apply_migration`).
     2. Regenerate `site/src/types/database.ts`.
     3. Deploy web (which now calls the RPC — safe: RPC exists).
     4. Ship iOS build (which now calls the RPC — safe: RPC exists).

---

## Risk
- **Medium.** New DB RPC + 7 iOS edits + 7 web edits + regenerate types.
  Nothing irreversible.
- **Mitigations:**
  - Migration is idempotent; re-running is safe.
  - iOS failure path already caught by existing `Log.d`, no UX regression
    beyond what's there today (today silent-drops bad columns; after the
    fix it errors loudly but the `catch` still swallows).
  - Web failure path surfaces via existing `pushToast({ variant: 'danger' })`.
  - Type regeneration makes any shape mismatch caught by `tsc`.
- **Ambiguity flagged:**
  - Expert title/org allowlist decision (see Web Edit 6 / line 3361).
    Recommend owner weighs in.
  - Metadata deep-merge: SQL-side vs. client-side. Recommend SQL-side for
    consistency; Implementer may choose either.

---

## Tracker update
Implementer appends an entry under `### Round 5 — Item 2 (profile updates via RPC)`
in `/Users/veritypost/Desktop/verity-post/05-Working/PERMISSION_MIGRATION.md`
noting: migration 067, 7 iOS edits, 7 web edits, latent column bugs closed
(`location`, `website`, `avatar`, `preferences`).
