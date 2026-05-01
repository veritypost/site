# Outstanding follow-ups

Items locked but not yet shipped. Created 2026-05-01.

---

## 1. Privacy policy clause for write-impersonation (item 12 prereq)

**What:** before item 12's write-mode impersonation endpoints ship, `web/src/app/privacy/page.tsx` needs an explicit clause covering admin access and "act-as-user" actions. Owner-written / owner-approved (not agent-drafted).

**Why:** GDPR + CCPA + standard platform-operator legitimate interest require disclosure. Industry-standard wording — Reddit, Discord, Twitter, Substack all carry this. Without it, write-impersonation has real EU/CA exposure.

**Suggested wording (starting point — refine yourself):**
> Verity Post staff may, in connection with support, security, or policy enforcement, access your account and act on your behalf. Any actions taken by staff while accessing your account are logged and you will be notified by email.

**Blocks:** item 12 Surface 4 (impersonation endpoint) cannot ship until this clause is live on `/privacy`.

---

## 2. AI provider/model picker UI (item 4)

**What:** mount `web/src/components/admin/PipelineRunPicker.tsx` somewhere usable. Component is built but has zero consumers.

**Locked decision:** mount in **both** `/admin/story-manager` (per-article override) AND `/admin/pipeline-config` (global default). Per-run picker reads the global default and lets you override for one generation.

**Open prereqs:**
- Confirm the `ai_models` table is populated (`select provider, model from ai_models` via Supabase MCP).
- Identify the API route(s) that trigger generation; confirm they accept `{ provider, model }` in the body. If not, that's a prerequisite change.
- Decide default behavior when no override is picked (config row vs hardcoded fallback).

---

## 3. Item 11a part-2 — RPC short-circuit migration — ✅ shipped 2026-05-01

**Resolved:** pulled live RPC bodies via MCP, wrote `CREATE OR REPLACE` patches for `my_permission_keys` (god_mode_keys CTE) and `compute_effective_perms` (is_god CTE + CASE arms). Applied both migrations live. Owner grant confirmed: permission → set → role link → owner user all verified 1/1/1/1/1. Committed `ec341c0`.

---

## 4. Item 11b — Per-user god-mode grant UI (web admin)

**What:** extend `/admin/users/[id]/permissions/page.tsx` with a "Sensitive grants" section containing toggles for `admin.god_mode`, `admin.users.edit`, `admin.users.impersonate`.

**Scope:**
- Toggle writes to `user_permission_sets` via the existing `postToggle` helper
- API write endpoint must `requirePermission('admin.god_mode')` — not just admin-role membership; any admin could otherwise grant god-mode to anyone
- Self-revoke blocked (owner can't accidentally lock themselves out)
- Hide for kid accounts
- Confirmation modal on grant: "Type @username to confirm"
- Cache invalidation: call `bump_user_perms_version(target)` + `bump_perms_global_version()` after write
- Audit log: action strings `god_mode.grant` / `god_mode.revoke` / `users.edit.grant` / `users.impersonate.grant`
- Plan card refinement: if grantee has an active sub, show "You have admin access. Your subscription remains active for billing purposes." instead of the owner copy

**Blocks:** item 12 (needs the toggle infrastructure).

**Platform:** web admin only.

---

## 5. Item 12 — Admin opens / edits / impersonates any user (web)

**Prereqs:** item 11b shipped + privacy policy clause (OUTSTANDING #1) live.

**Surface 1 — admin strip on `/u/[username]`**
- Visible only to users with `auth.isAdmin`
- Row pinned under banner: "Open in admin →" / "View as @username" / "Edit profile" / quick badges (BANNED / SHADOW / ROLE)

**Surface 2 — inline edit on `/u/[username]`**
- When admin clicks "Edit profile": swap display_name, bio, avatar, banner, username fields to inline editors
- Writes via new `/api/admin/users/[id]` PATCH endpoint (`requirePermission('admin.users.edit')`)
- Every write inserts an `admin_audit_log` row with actor, target, action, old_value, new_value

**Surface 3 — extend `/admin/users/[id]` to full editor**
- Currently read-only. Add inline edit for: identity (username, display_name, bio, email), avatar/banner, plan dropdown, roles, flags (is_banned, is_shadow_banned, is_muted, frozen_at, show_on_leaderboard), kid profiles + PIN reset
- Email change fires a verification flow
- PIN reset: confirmation dialog → `/api/admin/kids/[id]/reset-pin` POST → clears PIN → parent notification

**Surface 4 — write-mode impersonation**
- Owner: forever session (until manual exit or logout)
- Grantees: 1hr idle / 4hr absolute
- Persistent banner in chrome while impersonating
- No impersonating admins / owners / kids
- No financial endpoints under impersonation
- Full audit log + sidecar attribution column
- Mandatory email notification to target user

**Privacy policy:** clause at `web/src/app/privacy/page.tsx` must be live before Surface 4 ships (see OUTSTANDING #1).

**Platform:** web only. iOS admin surface not in scope.

---

## 6. Web AvatarEditor silently no-ops on save — ✅ shipped 2026-05-01

**Discovered:** 2026-05-01 while writing the avatar CHECK constraint.
**Resolved:** same day — web payload now wraps `avatar` inside `metadata` to match the iOS contract and the RPC's jsonb merge path. Two-line fix at `web/src/app/profile/_components/AvatarEditor.tsx:165`.

**What:** `web/src/app/profile/_components/AvatarEditor.tsx:165` calls:
```ts
supabase.rpc('update_own_profile', {
  p_fields: { avatar: next, avatar_color: outer },
});
```
The RPC's UPDATE statement has `avatar_url` and `avatar_color` columns plus a `metadata` JSONB merge — but does NOT handle a top-level `avatar` key. So the web avatar payload is silently dropped server-side. The save toast says success but nothing changes. Users would see this if they ever closed and reopened the avatar editor (the optimistic UI hides it during the same session).

iOS does the right thing — `SettingsView.swift:1465` and `ProfileView.swift:2122` write inside `metadata.avatar`, which goes through the RPC's `metadata` jsonb merge.

**Fix options:**
1. **Change web payload to match iOS:** `p_fields: { metadata: { avatar: next }, avatar_color: outer }`. Two-line change in AvatarEditor.tsx. Reads remain compatible (web already reads `u.avatar?.outer ?? u.avatar_color`).
2. **Patch the RPC** to handle a top-level `avatar` key by writing into `metadata.avatar`. Backwards-compatible if any other client also sends top-level `avatar`. More change.

Recommend option 1 — surgical, matches iOS contract, no migration needed.

**Status:** small fix; queue alongside item 7 or item 8.
