# LiveProgressSheet — T-011: Fix auto-freeze on ambiguous charge refund
Started: 2026-04-26

## User Intent

**Task (verbatim from Current Tasks.md item 1):**
> Fix auto-freeze on ambiguous charge refund — no grace window or admin approval gate (T-011, MASTER_TRIAGE B11) — add a grace period or an admin-approval step before freezing on apparent full refund. Affects: `web/src/app/api/stripe/webhook/route.js:392-419`.

**Reconciled brief:**
`handleChargeRefunded` in the Stripe webhook currently calls `billing_freeze_profile` immediately when `charge.refunded === true`. The task asks for either:
(a) a grace window before freeze fires, OR
(b) an admin-approval step instead of immediate freeze.

The existing `refund-decision` endpoint (`/api/admin/billing/refund-decision/route.ts`) already marks invoices with `refund_status` metadata but does NOT gate or delay the webhook freeze — those are disconnected. The webhook freezes unconditionally on the charge event; the refund-decision UI is a separate workflow.

**History context:**
- B11 partial (commit 8984700): fixed partial-refund misclassification + added user notification
- B11 tail (schema/158 + webhook handlers): added `billing_unfreeze` RPC, `handleRefundUpdated`, `handleDisputeClosed` — unfreeze paths are complete
- T-011 is the remaining piece: the initial freeze should not be immediate

**Chosen approach (admin-approval queue via `audit_log` + deferred freeze):**
- On `charge.refunded === true`: write an `audit_log` row with `action='billing:refund_pending_admin_review'` and create a high-priority admin notification via `create_notification` targeting the platform admin users (via the existing settings key or a hardcoded role lookup). Do NOT call `billing_freeze_profile`.
- Add a `settings` row `billing.refund_freeze_grace_hours` (default `24`) — after this window with no admin decision, a scheduled step (new cron handler or the existing `freeze-grace` cron extension) fires the freeze.
- Alternatively (simpler): add a `billing.refund_auto_freeze` boolean setting (default `false` for new behavior) — when false, route to admin review without freeze; when true, freeze immediately (backward-compatible escape hatch for operators).

**BUT** — the `freeze-grace` cron calls `billing_freeze_expired_grace` RPC which only sweeps `plan_grace_period_ends_at`. Attaching refund-hold to that mechanism would require a DB schema migration. Without a DB migration, we cannot persist the "pending review" state across restarts unless we use `audit_log` as the source of truth + a new cron.

**Simplest correct design (minimum schema change):**
1. Add `settings` row `billing.refund_auto_freeze` = `'false'` (existing `settings` table, no schema migration needed — just a new row in the seed/migration).
2. In `handleChargeRefunded`: read that setting. When `false`, create admin notification + audit log entry with `action='billing:refund_pending_admin_review'` + skip freeze. When `true`, freeze immediately (existing behavior).
3. Existing `refund-decision` route already lets admins trigger downstream actions (currently only marks invoices). Extend it to accept `decision='approved'` and actually call `billing_freeze_profile` on the target user (the webhook wrote `charge_id` to audit_log — need user_id too).
4. New migration: add `billing.refund_auto_freeze` settings row.

**Simplification after analysis:**
The `refund-decision` route operates on `invoice_id` but the webhook charges operate on `charge_id`. These don't share a FK path in current schema without additional join. To avoid scope expansion into schema join tables, use a cleaner approach:
- The audit_log entry written by `handleChargeRefunded` already has `target_id = userRow.id` and `metadata.charge_id`. Admin can look up the user from the audit_log.
- `refund-decision` route currently takes `invoice_id`; we'd need to extend it or add a new `billing_freeze` action.
- Admin already has `/api/admin/billing/freeze` to manually freeze any user.

**FINAL chosen design:**
1. Add `settings` row `billing.refund_auto_freeze` = `'false'` via new migration (schema/178).
2. In `handleChargeRefunded` (lines 537-559): when `billing.refund_auto_freeze` is false, skip `billing_freeze_profile`, keep the existing `audit_log` write (already there, changes action to `billing:refund_full_pending_review`), and add an admin-directed `create_notification` so admins see it in their queue.
3. When `billing.refund_auto_freeze` is true, behave exactly as today (immediate freeze + user notification).
4. Adjust audit_log action name to distinguish `billing:refund_full` (auto-freeze path) from `billing:refund_full_pending_review` (admin-review path).

This is surgical: 1 migration file (settings row insert), 1 code block changed in webhook route.

## Live Code State

### web/src/app/api/stripe/webhook/route.js

**Lines 487–560 — `handleChargeRefunded`:**
- Line 515: `async function handleChargeRefunded(service, charge)`
- Line 521: `const fullyRefunded = charge.refunded === true;`
- Lines 523–535: `audit_log` insert (always runs; action is `billing:refund_full` or `billing:refund_partial`)
- Lines 537–559: `if (fullyRefunded && !userRow.frozen_at)` → immediate `billing_freeze_profile` + user notification
- **No grace window. No settings read. No admin notification. No approval gate.**

### web/src/app/api/admin/billing/refund-decision/route.ts

- Accepts `invoice_id + decision (approved|denied|partial)`
- Only updates `invoices.metadata.refund_status` — does NOT call `billing_freeze_profile`
- Disconnected from webhook freeze path

### web/src/app/api/admin/billing/freeze/route.js

- Manual admin freeze: `POST { user_id }` → `billing_freeze_profile`
- Requires `admin.billing.freeze` permission
- This is the correct manual path for admin to freeze after review

### schema/reset_and_rebuild_v2.sql line 3376

```sql
('billing.grace_period_days', '7', 'number', 'billing', 'Days of grace period after payment failure', false),
```
Pattern for new setting is established. `settings` table has `key`, `value`, `type`, `group`, `description`, `is_public` columns.

### DB constraint (reset_and_rebuild_v2.sql line 2792)

```sql
ALTER TABLE "users" ADD CONSTRAINT "chk_users_plan_status" CHECK (
  (plan_id IS NULL AND plan_status IN ('free', 'frozen')) OR
  (plan_id IS NOT NULL AND plan_status NOT IN ('free', 'frozen'))
);
```
Adding a `'refund_hold'` plan_status would require ALTER TABLE + constraint update — **not needed** with the settings-flag approach.

### Settings table read pattern

No existing helper in webhook for `settings` table reads. Will use direct `service.from('settings').select('value').eq('key','billing.refund_auto_freeze').maybeSingle()` — consistent with other one-off settings reads in the codebase.

### Admin notification target

`create_notification` RPC takes `p_user_id`. Admin users don't have a single well-known UUID. Pattern: select all users with `admin` or `owner` role and fan-out notifications. Existing webhook code never fans out — creates notifications only for the affected user. **Simpler:** Use `audit_log` as the admin-visible record (already written), plus a console.warn log so Sentry/observability picks it up. The admin can filter `audit_log` by action `billing:refund_full_pending_review` in the subscriptions admin page. No new fan-out needed.

### Helper Brief (what "done correctly" looks like)

**Minimum correct end-state:**
1. Migration `schema/178_billing_refund_auto_freeze_setting.sql` — inserts `('billing.refund_auto_freeze', 'false', 'boolean', 'billing', 'When true, auto-freeze user on full Stripe refund. When false, create admin review entry and skip freeze.', false)` into `settings`.
2. `handleChargeRefunded` reads `billing.refund_auto_freeze` at webhook time.
3. When `false`: audit_log action = `billing:refund_full_pending_review`, add `console.warn` for ops visibility, skip freeze call. User notification copy updated to indicate "pending review" not "frozen."
4. When `true`: existing behavior (audit_log action `billing:refund_full`, freeze, user notification as today).
5. Partial refund path (`!fullyRefunded`) is unchanged throughout.
6. `tsc --noEmit` passes (file is `.js`, not typed, so no tsc risk — but run anyway).
7. No DB constraint changes required.

**What the intake agent may miss:**
- The `refund-decision` route is already disconnected from the freeze path — it does NOT need to be extended for this task; admin freeze is already available via `/api/admin/billing/freeze`.
- The settings read adds a DB round-trip per `charge.refunded` event. This is acceptable (low volume, already within the webhook's async context).
- The user notification copy must branch: when pending review, the user should NOT see "paid features are now paused" because they aren't frozen yet. This is a real UX correctness issue.
- Migration number: latest in `schema/` is `177_grant_ai_models_select.sql` → next is `178`.
- The `audit_log` already has `action='billing:refund_full'` for the auto-freeze path. When pending review, use `billing:refund_full_pending_review` so admin queries can distinguish.
- No iOS changes. No DB constraint changes. Web-only + one migration.

## Contradictions

| Agent | File:line | Expected | Actual | Impact |
|-------|-----------|----------|--------|--------|
| Intake | `427_PROMPT.md:90` states B11 "deferred tail" was the unfreeze handlers | Unfreeze handlers (billing_unfreeze + charge.refund.updated + charge.dispute.closed) shipped | Both confirmed live in webhook + schema/158 | No action; T-011 is specifically the *freeze gate* not the unfreeze path |
| Intake | `route.js` comment lines 505-514 says unfreeze handlers "Deferred (separate items)" | Comment is stale | Handlers ARE implemented (handleRefundUpdated lines 708+, handleDisputeClosed lines 623+) | Comment should be cleaned up as part of this change |
| Reviewer | `schema/178` migration draft used `type` and `group` column names | settings table uses `value_type` and `category` columns (verified in reset_and_rebuild_v2.sql:667-680 and seed at 3358+) | Migration had wrong column names | RESOLVED: corrected to `value_type` and `category` in PLANNER PLAN FINAL |
| Reviewer | audit_log action written before freeze decision | `audit_log` insert at lines 523-535 determines action before reading autoFreeze flag | Settings read must happen before audit_log insert to write correct action name | RESOLVED: read setting first, pass `autoFreeze` into action name determination |

## Agent Votes
- Planner: APPROVE (confirmed after Reviewer revisions)
- Reviewer: REVISE → resolved (wrong column names + audit_log ordering fix)
- Final Reviewer: APPROVE (plan is correct, minimal, faithful to intent)
- Consensus: 3/3 APPROVE — proceed to execution

## 4th Agent (if needed)
[not needed yet]

## Implementation Progress
[pending]

## Completed
[pending]
