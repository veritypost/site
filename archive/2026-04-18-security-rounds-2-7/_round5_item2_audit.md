# Round 5 Item 2 — iOS SettingsView users.update hardening: AUDIT

Auditor: Round 5 Auditor (Item 2)
Date: 2026-04-18
Target file: `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/SettingsView.swift`
Trigger of record: `public.trg_users_reject_privileged_updates`
  -> function `public.reject_privileged_user_updates()` (SECURITY INVOKER)
  -> introduced by `01-Schema/065_restrict_users_table_privileged_updates_2026_04_19.sql`

---

## Call sites in SettingsView

All direct `client.from("users").update(...)` writes in `SettingsView.swift`
(grep-verified; reads excluded; lines are exact):

| Line | Function / Context | Columns set | Notes |
|------|--------------------|-------------|-------|
| 312  | `AccountSettingsView.save()` -> `FullUpdate` | `username`, `bio`, `location`, `website`, `avatar_color`, `avatar` (jsonb: outer/inner/initials) | Primary profile save. Five of these six columns are real; see "Latent bug" below. |
| 319  | `AccountSettingsView.save()` -> `LegacyUpdate` (catch-fallback) | `username`, `bio`, `location`, `website`, `avatar_color` | Executes only if the FullUpdate path throws (e.g. no `avatar` column). Same latent-column issue. |
| 906  | `NotificationsSettingsView.save()` | `preferences` (jsonb string) | Writes merged notifications prefs. |
| 984  | `FeedPreferencesSettingsView.save()` | `preferences` (jsonb string) | Writes merged feed prefs. |
| 1154 | `ExpertSettingsView.save()` | `preferences` (jsonb string) | Writes merged expert prefs. |
| 1239 | `DataPrivacyView.saveDmReceiptsPref()` | `dm_read_receipts_enabled` | Single-boolean toggle. |

Plus one more write in the iOS codebase outside `SettingsView.swift`:

| File | Line | Columns set | Notes |
|------|------|-------------|-------|
| `AuthViewModel.swift` | 153 | `last_login_at` | Best-effort login timestamp. |
| `AuthViewModel.swift` | 249 | `id`, `email`, `username` | Signup upsert — INSERT path, not UPDATE. |

All iOS `from("users")` reads (non-write, for completeness):
`AuthViewModel.swift:225, 480`, `MessagesView.swift:400, 766`,
`StoryDetailView.swift:959, 1302`, `LeaderboardView.swift:380, 395, 409, 423, 453`,
`PublicProfileView.swift:160`, `SettingsView.swift:870, 890, 954, 971, 1133, 1147, 1228`.

---

## Column classification

Full `public.users` column list from information_schema (90 columns), categorized:

| Column | Category | Trigger-protected? | Should be self-writable? |
|--------|----------|--------------------|--------------------------|
| id | SYSTEM-ONLY (PK, auth-linked) | no (but RLS `eq id, auth.uid()`) | no |
| email | AUTH (goes through `auth.users`) | no | no (via `auth.update`) |
| email_verified / email_verified_at | SYSTEM-ONLY | no | no |
| phone / phone_verified / phone_verified_at | SYSTEM-ONLY | no | no |
| password_hash | SYSTEM-ONLY | no | no (auth system) |
| username | SELF-SERVICEABLE | no | yes |
| display_name | SELF-SERVICEABLE | no | yes |
| first_name / last_name | SELF-SERVICEABLE | no | yes (not currently exposed in iOS UI) |
| bio | SELF-SERVICEABLE | no | yes |
| avatar_url | SELF-SERVICEABLE | no | yes |
| banner_url | SELF-SERVICEABLE | no | yes |
| avatar_color | SELF-SERVICEABLE | no | yes |
| date_of_birth | SELF-SERVICEABLE (with care; age-gate side effects) | no | yes |
| gender | SELF-SERVICEABLE | no | yes |
| country_code | SELF-SERVICEABLE | no | yes |
| timezone | SELF-SERVICEABLE | no | yes |
| locale | SELF-SERVICEABLE | no | yes |
| primary_auth_provider | SYSTEM-ONLY | no | no |
| plan_id | PRIVILEGED | yes | no |
| plan_status | PRIVILEGED | yes | no |
| stripe_customer_id | PRIVILEGED | yes | no |
| verity_score | PRIVILEGED | yes | no |
| articles_read_count | SYSTEM-ONLY (engine-tallied) | no | no |
| quizzes_completed_count | SYSTEM-ONLY | no | no |
| comment_count | SYSTEM-ONLY | no | no |
| followers_count / following_count | SYSTEM-ONLY | no | no |
| is_expert | PRIVILEGED | yes | no |
| expert_title / expert_organization | SYSTEM-ONLY (set on approval) | no | no |
| is_verified_public_figure | PRIVILEGED | yes | no |
| is_kids_mode_enabled | SELF-SERVICEABLE (parent-scope) | no | yes |
| kids_pin_hash | SYSTEM-ONLY (hashed server-side) | no | no (but set via dedicated RPC) |
| has_kids_profiles | SYSTEM-ONLY | no | no |
| is_active | PRIVILEGED | yes | no |
| is_banned | PRIVILEGED | yes | no |
| ban_reason / banned_at / banned_by | PRIVILEGED | yes | no |
| is_shadow_banned | PRIVILEGED | yes | no |
| is_muted | SYSTEM-ONLY | no | no |
| muted_until | PRIVILEGED | yes | no |
| mute_level | PRIVILEGED | yes | no |
| last_login_at | SYSTEM-ish (iOS writes this at 153) | no | technically yes — bounded to own row |
| last_active_at | SYSTEM-ish | no | bounded |
| last_login_ip / last_login_device | SYSTEM-ONLY | no | no |
| login_count / failed_login_count | SYSTEM-ONLY | no | no |
| locked_until | SYSTEM-ONLY | no | no |
| att_status / att_prompted_at | SELF-SERVICEABLE (App Tracking Transparency) | no | yes |
| deletion_requested_at | SYSTEM-ONLY (via /api/account/delete) | no | no |
| deletion_scheduled_for | PRIVILEGED | yes | no |
| deletion_completed_at | PRIVILEGED | yes | no |
| deletion_reason | SYSTEM-ONLY | no | no |
| notification_email | SELF-SERVICEABLE | no | yes |
| notification_push | SELF-SERVICEABLE | no | yes |
| referral_code | SYSTEM-ONLY (server-generated) | no | no |
| referred_by | SYSTEM-ONLY (set at signup) | no | no |
| metadata | SELF-SERVICEABLE (jsonb — mixed; see note) | no | partial |
| created_at / updated_at / deleted_at | SYSTEM-ONLY | no | no |
| profile_visibility | SELF-SERVICEABLE | no | yes |
| show_activity / show_on_leaderboard / allow_messages | SELF-SERVICEABLE | no | yes |
| streak_current / streak_last_active_date / streak_freeze_remaining / streak_frozen_today / streak_freeze_week_start | SYSTEM-ONLY (engine-driven) | no | no |
| streak_best | PRIVILEGED | yes | no |
| kid_trial_used / kid_trial_started_at / kid_trial_ends_at | SYSTEM-ONLY | no | no |
| frozen_at | PRIVILEGED | yes | no |
| frozen_verity_score | PRIVILEGED | yes | no |
| plan_grace_period_ends_at | PRIVILEGED | yes | no |
| supervisor_opted_in | SELF-SERVICEABLE (COPPA consent UI) | no | yes |
| warning_count | PRIVILEGED | yes | no |
| last_warning_at | SYSTEM-ONLY | no | no |
| parent_pin_hash | SYSTEM-ONLY (RPC-hashed) | no | no |
| pin_attempts / pin_locked_until | SYSTEM-ONLY | no | no |
| perms_version | PRIVILEGED | yes | no |
| perms_version_bumped_at | SYSTEM-ONLY | no | no |
| onboarding_completed_at | SELF-ish | no | yes |
| dm_read_receipts_enabled | SELF-SERVICEABLE | no | yes |

Round-4 trigger-protected set (counted from `reject_privileged_user_updates`):
`plan_id, plan_status, is_expert, is_verified_public_figure, is_banned,
is_shadow_banned, verity_score, warning_count, perms_version, ban_reason,
banned_at, banned_by, muted_until, mute_level, frozen_at, frozen_verity_score,
plan_grace_period_ends_at, is_active, stripe_customer_id, deletion_scheduled_for,
deletion_completed_at, streak_best` — 22 columns. Matches Round 4 doc.

---

## Do SettingsView writes touch any SYSTEM-ONLY or PRIVILEGED columns?

No. Every column iOS actually attempts to set is either SELF-SERVICEABLE
(username, bio, avatar_color, dm_read_receipts_enabled, metadata-like) or
doesn't exist in the schema (see latent bug below).

**Conclusion: there is no live column-leak bug.** The Round 4 trigger already
neutralizes the privileged-escalation vector. Item 2 is genuine **defense-in-
depth hardening**, not a live-bug fix.

---

## Latent bug found (orthogonal to this hardening, worth flagging)

`AccountSettingsView.save()` at line 312 references columns that do NOT
exist in `public.users`:

- `location` — not a column
- `website` — not a column
- `avatar` (jsonb) — not a column (only `avatar_url`, `avatar_color` exist)
- `preferences` — not a column; the actual jsonb column is named `metadata`

This means the `FullUpdate` at line 312 has always thrown (no `avatar`/
`location`/`website` column). The code silently falls through to the
`LegacyUpdate` at line 319, which also references non-existent `location`
and `website`, so that likely throws too and is caught by the outer `catch`
at line 323 (only logged via `Log.d`, not surfaced to user).

Similarly, the three `preferences` writes at lines 906, 984, 1154 attempt to
write a non-existent `preferences` column — the web equivalent correctly
uses `metadata`. Every iOS profile/preferences save is probably a silent
no-op today. Reviewer should treat this as a separate item; it does not
change the hardening recommendation but the eventual RPC allowlist must
NOT include these bogus names.

---

## Existing infrastructure

- **Web API `/api/account/...` endpoints present?**
  `site/src/app/api/account/` contains only `delete/`, `login-cancel-deletion/`,
  and `onboarding/`. There is **no** `/api/account/profile` or similar
  self-update endpoint. The web client itself does direct
  `supabase.from('users').update(...)` from the browser at
  `site/src/app/profile/settings/page.tsx:1244, 1641, 2034, 2409, 3361,
  3466, 3542`. Both surfaces (iOS + web) currently bypass a server-side
  contract.

- **DB RPCs present that match?**
  None. Grep for `update_own_profile|update_user_profile|update_self|
  update_profile` in `01-Schema/` returned no matches. The closest
  SECURITY DEFINER functions on `public.users` are unrelated
  (`billing_freeze_profile`, `handle_auth_user_updated`,
  `list_profiles_for_device`, `owns_kid_profile`). The trigger function
  `reject_privileged_user_updates` is SECURITY INVOKER (gatekeeping only).

- **Pattern iOS should follow:**
  There is no shared "self-profile write" contract to reuse. Option A
  (call web API) is therefore not cheaper than Option B: the web endpoint
  would have to be built first either way.

---

## Proposed fix options

### Option A — iOS POSTs to a new web endpoint `/api/account/profile`
- Next.js route under `site/src/app/api/account/profile/route.js` that
  validates `auth.uid()` via Supabase SSR client, accepts an allowlisted
  subset of fields, and performs the UPDATE server-side.
- iOS switches `AccountSettingsView.save()` to `URLSession` POST/PATCH
  with `Authorization: Bearer <accessToken>`.
- Web `profile/settings/page.tsx` migrates to the same endpoint (separate
  task but aligns surfaces).
- **Pros:** JS/TS validation lives with the rest of the web API,
  observability via Sentry server hooks, easy to add schema validation
  (zod), CORS-free for web.
- **Cons:** Extra network hop from iOS -> Vercel -> Supabase. A hot profile
  save becomes three hops instead of one. If web endpoint is down, iOS
  can't save. Two surfaces (iOS + web) must both be updated in lockstep.

### Option B — New SECURITY DEFINER RPC `public.update_own_profile(p_fields jsonb)`
- SQL function:
  - `SECURITY DEFINER`, `SET search_path = public, pg_catalog`.
  - Rejects if `auth.uid() IS NULL`.
  - Whitelists keys from `p_fields`. Proposed allowlist (matches current
    iOS + web intents, sized to what we ACTUALLY store):
    `username, display_name, bio, avatar_url, avatar_color, banner_url,
    first_name, last_name, date_of_birth, gender, country_code, timezone,
    locale, profile_visibility, show_activity, show_on_leaderboard,
    allow_messages, notification_email, notification_push,
    dm_read_receipts_enabled, att_status, att_prompted_at, metadata`.
  - Unknown keys -> `RAISE EXCEPTION` (fail-closed, catches typos like
    `preferences` or `location` before they silently disappear).
  - Executes `UPDATE public.users SET ... WHERE id = auth.uid()` with
    column-by-column assignment (no dynamic SQL; use `CASE p_fields ?
    'k' THEN ... END` or one coalesced SET list).
  - Grants `EXECUTE` to `authenticated` only.
- iOS replaces the two `from("users").update(...)` calls at 312/319 with
  a single `client.rpc("update_own_profile", params: payload)`. The
  preferences writes at 906/984/1154 and the dm-receipts write at 1239
  can all route through the same RPC with a `metadata` payload.
- The Round-4 trigger still runs (defense in depth). The RPC allowlist
  means the trigger list is belt-and-suspenders, not the sole defense.
- **Pros:**
  - Single server contract enforced at the DB layer — both iOS and web
    can switch to it and we stop depending on RLS + trigger combined.
  - No extra network hop (PostgREST RPC is the same transport as the
    current `from("users").update`).
  - Schema drift protection: adding a new column to `public.users`
    doesn't expose it to clients unless it's added to the RPC allowlist
    (opposite default of the trigger, which has to remember to deny).
  - Easy to unit-test via `pg_tle`/`pgTAP` in migrations repo.
- **Cons:**
  - New RPC surface to maintain (but small, read-only audit).
  - Requires a migration and an iOS update released together — if iOS
    rolls before the migration, it will 404 on the RPC; manage via
    feature flag or migration-first release.
  - Admin-forced updates (e.g. ops tooling) must continue to use
    service-role UPDATE; the RPC is for self-edits only.

### Recommendation: **Option B** (SECURITY DEFINER RPC `update_own_profile`).

Reasoning: we have NO existing web endpoint to reuse (web is just as
direct-to-Supabase as iOS), so Option A's "reuse existing gated server
logic" pro evaporates. Option B keeps the transport identical (one
PostgREST hop), expresses the contract in exactly one place (the DB),
flips the default from "deny list" to "allow list" (which is what Item 2
is explicitly asking for), and naturally catches the latent
`preferences`/`location`/`website`/`avatar` column typos that currently
fail silently.

---

## Tests / verification (for Reviewer's fix plan)

1. **DB — trigger still blocks direct UPDATEs.** As `authenticated` with
   a normal user JWT, run `UPDATE public.users SET verity_score = 9999
   WHERE id = auth.uid();` -> expect SQLSTATE 42501 from the Round-4
   trigger. Confirms defense-in-depth remains.
2. **DB — RPC allowlist rejects unknown keys.** Call
   `select update_own_profile('{"verity_score": 9999}'::jsonb);` ->
   expect exception "unknown field: verity_score". Also try
   `{"id": "<other-uuid>"}` -> exception.
3. **DB — RPC applies allowed keys.** Call
   `select update_own_profile('{"bio": "test", "avatar_color": "#111"}');`
   then `SELECT bio, avatar_color FROM public.users WHERE id = auth.uid()`
   -> both set.
4. **DB — typo protection.** Call with `{"preferences": {}}` or
   `{"location": "NYC"}` or `{"website": "x.com"}` -> all must raise
   (verifies the latent-bug footgun is closed going forward).
5. **iOS — AccountSettingsView saves.** Build & run with the new RPC call.
   Edit bio + username + avatar color. Verify the row updates in DB and
   the app reflects the new values after `auth.loadUser`.
6. **iOS — Notifications/Feed/Expert preferences.** Confirm merged
   metadata write still works through the RPC (`metadata` is allowlisted;
   server-side merge NOT required because the RPC only overwrites the
   one key). If a merge is needed, the RPC body should read OLD metadata
   and deep-merge before assigning.
7. **iOS — DataPrivacyView.** Toggle `dm_read_receipts_enabled` ->
   verify value persists.
8. **Permission check.** Run as admin and as plain user — plain user can
   only edit their own row (function is `WHERE id = auth.uid()`), admin
   path should still go through existing admin tooling (not this RPC).
9. **Regression — login timestamp.** `AuthViewModel.login()` at line 153
   writes `last_login_at` directly. Reviewer must decide whether to
   migrate it to the RPC (cleaner) or add `last_login_at` to the RPC
   allowlist or leave it alone (trigger doesn't block it). Recommend:
   include in RPC allowlist for consistency.
10. **Web parity (separate follow-up).** Once the RPC exists, the seven
    web `from('users').update(...)` call sites in
    `profile/settings/page.tsx` should migrate too — tracked as a
    separate item, not part of Item 2.
