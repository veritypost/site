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

## 3. Item 11a part-2 — RPC short-circuit migration

**What:** finish the `2026-05-01_admin_god_mode_rpc_patches.sql` placeholder migration. Currently has a `RAISE EXCEPTION` guard preventing apply.

**Why it matters:** today, owner has god-mode via the email-allowlist (`OWNER_EMAILS` in `web/src/lib/permissions.js` + `web/src/lib/auth.js`) — that works for the owner. But future 11b grantees (other staff who get `admin.god_mode`) don't get the email-allowlist treatment, so they need the SQL-side short-circuit to bypass `my_permission_keys` properly. Also fixes the cosmetic `granted_via='admin_role'` instead of `'god_mode'` in the admin permissions console.

**How to finish:**
1. Run in Supabase SQL editor:
   ```sql
   select pg_get_functiondef(oid) from pg_proc where proname = 'my_permission_keys';
   select pg_get_functiondef(oid) from pg_proc where proname = 'get_my_capabilities';
   select pg_get_functiondef(oid) from pg_proc where proname = 'compute_effective_perms';
   select pg_get_functiondef(oid) from pg_proc where proname = 'has_permission';
   select pg_get_functiondef(oid) from pg_proc where proname = 'has_permission_for';
   ```
2. Paste each result back to the agent. The agent will write the `CREATE OR REPLACE` patches into `2026-05-01_admin_god_mode_rpc_patches.sql`, remove the `RAISE EXCEPTION` guard, then you apply.

**Status:** doable any time owner is ready to paste the RPC bodies.

---

## 4. Web AvatarEditor silently no-ops on save

**Discovered:** 2026-05-01 while writing the avatar CHECK constraint.

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
