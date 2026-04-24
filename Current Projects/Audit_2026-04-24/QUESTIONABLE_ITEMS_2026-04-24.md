# Questionable / Uncertain Items — 2026-04-24

**Bucket C: items I am NOT confident enough to put on the autonomous fix list.**

Four kinds of items live here:
1. **Wave-A vs Wave-B contradictions** — one wave says X, the other says not-X. Both had evidence.
2. **Single-agent findings** — only one of six agents raised them. Could be real and subtle, could be a false positive. Haven't been tiebroken.
3. **UI / product-judgment calls** — code could reasonably work two ways; needs you to pick.
4. **Findings that depend on state only you can verify** — Vercel env vars, Stripe dashboard, live DB state that I couldn't check with MCP disconnected.

Everything here needs your input or verification before it lands on the fix list. Flagged, not forgotten.

---

## 1. Wave-A vs Wave-B direct contradictions

### Q-CON-01. Billing B1 completeness — is `handlePaymentSucceeded` missing the perms bump?
- **Wave A says:** B1 fully CLOSED by migration 148 (3 agents agree).
- **Wave B Agent 2 says:** CRITICAL — `handlePaymentSucceeded` in `web/src/app/api/stripe/webhook/route.js:809-853` updates `plan_status='active'` + clears grace period WITHOUT calling `bump_user_perms_version()`. Re-opens the B1 stale-cache window for this specific handler.
- **Why it matters:** If Wave B is right, a user who pays after their grace period starts keeps free-tier perms until 60s TTL expires.
- **Verify:** Read `webhook/route.js:809-853` directly. Does it or does it not call the bump? Three-line resolution.

### Q-CON-02. Billing audit_log coverage — partial or asymmetric?
- **Wave A says:** Audit coverage present for Stripe webhook; fine.
- **Wave B Agent 3 says:** CRITICAL — Stripe webhooks do audit, but iOS receipt handlers (sync + appstore/notifications) + user-facing billing routes (`/api/billing/change-plan`, `/cancel`, `/resubscribe`) + admin billing routes (`/admin/billing/freeze`, `/cancel`) ALL skip audit_log.
- **Why it matters:** If Wave B is right, operator can't investigate iOS fraud / admin freeze abuse.
- **Resolution:** Policy call (see OWNER_ACTIONS O-DESIGN-08). Recommend treat as CRITICAL, add audit to all paths. Claude ready once you confirm scope.

### Q-CON-03. Coming-soon wall scope — does it block `/signup`, `/login`, `/verify-email`?
- **Wave A Agent 3 says:** CRITICAL — middleware redirects unauthed traffic to `/welcome` except `/api`, `/admin`, `/_next`; auth routes are NOT in the allowlist, blocking new signups and email-verification clicks.
- **My earlier audit read:** Disagreed — middleware has exemptions for auth paths. But I didn't re-check against current code at anchor SHA.
- **Why it matters:** If true, nobody can sign up or verify email right now in prod. Easy to verify: visit `https://veritypost.com/signup` in an incognito window. If you get the signup form, Wave A Agent 3 is wrong. If you get redirected to `/welcome`, it's right and this is blocker #1.

### Q-CON-04. T0-1 DELETE /roles crash status
- **MASTER_TRIAGE said:** Critical handler crash.
- **Audit agents say:** Already fixed in commit 4a59752 (prior to anchor SHA). Code at anchor shows `requireAdminOutranks` in place; no crash path.
- **Resolution:** Agents are right. Update MASTER_TRIAGE to mark T0-1 closed. Low-risk cleanup.

---

## 2. Single-agent CRITICAL findings — untiebroken, judgment needed

High-severity items from only one of six agents per group. Could be real, could be false positive. Listing them so you can pick which merit a tiebreaker verification pass before fixing.

### Q-SOLO-01. Billing Webhook `handlePaymentSucceeded` missing `bump_user_perms_version`
- Covered by Q-CON-01. Single line of code to verify.

### Q-SOLO-02. Admin role grant/revoke — missing `requireAdminOutranks`?
- **Source:** WaveA Agent1 only (G7)
- **Claim:** Penalty route was hardened with outranks check per F-036; grant/revoke `/api/admin/users/[id]/roles` may lack equivalent.
- **Other agents said:** Grant/revoke IS correctly outranks-gated.
- **Verify:** `grep requireAdminOutranks web/src/app/api/admin/users/*/roles/route.js` — should appear for both POST and DELETE.

### Q-SOLO-03. Category delete cascades without outranks re-check on affected users
- **Source:** WaveB Agent3 only (G6)
- **Claim:** Deleting a permission set cascades to revoke it from all holders; cascade doesn't re-validate `requireAdminOutranks` per affected user. Admin could wipe out owner perms by deleting a high-privilege set.
- **Verify:** Read `/api/admin/permission-sets/[id]/route.js:114` DELETE handler. Does it iterate holders and check rank?

### Q-SOLO-04. Cluster merge/split RPCs duplicate-operation idempotency
- **Source:** WaveA Agent3 (G8)
- **Claim:** Network retry of merge/split → double operation. Could be safe (RPCs may be internally idempotent) or not.
- **Verify:** Read the RPC definitions in schema to confirm idempotency.

### Q-SOLO-05. Admin layout client-side role-gate vs middleware
- **Source:** Multiple agents across groups 6/14 — flagged as defense-in-depth, not active exploit.
- **Claim:** `admin/page.tsx:99-129` checks `MOD_ROLES` client-side before middleware runs; non-admins briefly see HTML structure before redirect.
- **Verify:** API routes all do `requirePermission` so no privilege escalation. The concern is info disclosure. UX-minor, not blocker. Fix in the admin refactor batch, not urgent.

### Q-SOLO-06. Generate finally-block UPDATE catch swallows status-guard rejection
- **Source:** WaveB Agent3 (G8)
- **Claim:** If `.eq('status','running')` guard rejects the update (run was cancelled), the UPDATE silently fails but the handler returns 200 OK with `finalStatus:'completed'`. Client thinks success; DB shows failed.
- **Verify:** Read `generate/route.ts:1657-1682`. Is the catch silent? Should it surface as 409 Conflict?

### Q-SOLO-07. Retry route depends on migration 120 (`error_type` column)
- **Source:** WaveB Agent1 (G8)
- **Claim:** `retry/route.ts` SELECTs `error_type` without fallback. If migration 120 not deployed, route 500s.
- **Verify:** Is migration 120 deployed? (See O-INFRA-07.)

---

## 3. UI / product decisions — covered in OWNER_ACTIONS

All 15 items from OWNER_ACTIONS §2 live here too — listed by ID for cross-reference:
- O-DESIGN-01 — Comments `visible` vs `published`
- O-DESIGN-02 — Password reset silent-success copy
- O-DESIGN-03 — Coming-soon wall scope (overlaps Q-CON-03)
- O-DESIGN-04 — Verify-email state separation
- O-DESIGN-05 — Feed Cancel button
- O-DESIGN-06 — Kids COPPA gate placement (A/B/C)
- O-DESIGN-07 — Plagiarism fail-closed vs soft-degrade
- O-DESIGN-08 — Billing audit_log scope (overlaps Q-CON-02)
- O-DESIGN-09 — Permission naming `bulk_resolve`
- O-DESIGN-10 — Kids threshold DB settings key
- O-DESIGN-11 — Quiz server returns `is_passed`
- O-DESIGN-12 — `access-request` / `support/public` / `generate-pair-code` auth model
- O-DESIGN-13 — 14 RLS-no-policies tables per-table classification
- O-DESIGN-14 — Rate-limit uniformity
- O-DESIGN-15 — Tracker doc consolidation

---

## 4. Audit findings I can't verify without your help

### Q-ENV-01. Production state of migrations 148 + 120 + 160
- Needed for B1/B3/B6 closure confirmation + pipeline retry dependency + avatar bucket existence.
- Fastest: paste results of `SELECT max(version) FROM supabase_migrations.schema_migrations;` from Supabase SQL editor.

### Q-ENV-02. `permissions.xlsx` ↔ DB sync status
- `scripts/import-permissions.js` needs `.env.local` I don't have. If you run `node scripts/import-permissions.js --dry-run` and paste the diff, Claude can tell you exactly what's drifted.

### Q-ENV-03. Whether dev server can reach authenticated flows
- Agents couldn't UI-smoke-test past the coming-soon wall because `PREVIEW_BYPASS_TOKEN` isn't in local env. If you set it (one line in `web/.env.local`), future audits include live click-through coverage, not just code-reading.

### Q-ENV-04. Live pg_cron schedule
- Cron routes exist but agents couldn't verify they're scheduled (pg_cron extension may not be enabled; see O-INFRA-03). Nightly grace-period sweeper may not be running.

### Q-ENV-05. Vercel / Stripe / Apple dashboard state for any of the "recent commits maybe closed this" items
- L3/L4/L5/L6/L19 were marked autonomous-fixable by recent commits but I can't verify production behavior of rate limits or push delivery. Worth a monitored next week.

---

## 5. Stale-but-noted

Items an agent flagged that are already known-handled per MASTER_TRIAGE / prior commits. Not bugs. Not fixes. Logged for completeness.

- **T0-1** (DELETE /roles crash) — fixed in `4a59752` before anchor. MASTER_TRIAGE entry is stale.
- **T0-2** (cancel/freeze handler crashes) — audit gap found (covered C20), but crash behavior itself is not reproducible.
- **L3–L6, L19** (cron/lib batch) — recent commits claim fixes; audit confirms code matches claim. Production behavior unverified but code is right.
- **Expert Q&A `#if false`** on iOS StoryDetailView — known disabled feature, stale comment about schema shape. Not a bug. Decide later: enable (needs schema migration) or remove dead code.
- **Perm-scope-overrides historical RLS gap** — tightened by migration 087; current code clean. Only relevant if you have pre-87 backups in cold storage.

---

## 6. Items I filtered from the master list because I'm uncertain

Every `UNIQUE-A` / `UNIQUE-B` finding per group's reconciliation totals ~135 items. Most are MEDIUM/LOW polish, not launch-blocking. They're documented in the 14 `Recon_Group*.md` files in this directory. Categories:

- **Rate-limit consistency / threshold tuning** — 8 findings across groups
- **Error-response code hygiene** (403 vs 200 vs 429) — 6 findings
- **Type-safety / dead-code / unused imports** — 5 findings
- **Empty-state UX / skeleton loaders / loading states** — 9 findings
- **Cross-device sync (web ↔ iOS preferences)** — 4 findings
- **Audit-log detail/completeness (oldValue vs newValue)** — 5 findings

If you want, Claude can:
- (a) Roll all of them into a low-priority "polish" backlog and ship post-launch
- (b) Tiebreaker-verify the ones where severity ≥ HIGH (~15 items), promote to fix list on verify
- (c) Ignore until they surface as real bugs

Recommend **(b)** for HIGH-severity uniques, **(a)** for everything else.

---

## Summary

- **4 direct Wave-A vs Wave-B contradictions** — 2 easy to resolve by reading code; 1 (coming-soon) easy to resolve with a browser; 1 (T0-1) resolved in agents' favor.
- **7 single-agent CRITICAL findings** — verify before fixing.
- **15 design decisions** — see OWNER_ACTIONS.
- **5 environment-dependent items** — I need your dashboard or your shell.
- **5 stale-but-noted** items — cleanup only.
- **~135 low-priority uniques** — bundle into polish backlog or tiebreaker-verify; your call.

Nothing in this list gets fixed until you say go on a per-item or per-bucket basis.
