# Round 5 Item 1 — Promo column name bug: FIX PLAN

## Summary

Two co-located bugs in the 100%-discount branch of the promo redemption route:

1. Wrong column name `applicable_plans` (three refs + one comment) — real column is `applies_to_plans`.
2. Plan lookup uses `.eq('name', targetPlan)` but the stored value is a plan UUID (column is `uuid[]`), so even after the column rename the lookup would still fail with "Plan not found for this promo."

Both must ship together. Column rename alone just moves the 400 one line down.

Read-only code fix. No DB migration. No client changes (the web consumer at `site/src/app/profile/settings/page.tsx:2988` only reads `data.error` and `data.message`; iOS has zero references to either column name).

## Files to modify
- `site/src/app/api/promo/redeem/route.js`

## Exact edits

### Edit 1 — fix the comment at line 85
**Old:**
```js
    // If 100% discount, upgrade user plan directly. Requires an
    // explicit applicable_plans on the promo — no silent fallback
    // (we don't want to guess which tier to grant).
```
**New:**
```js
    // If 100% discount, upgrade user plan directly. Requires an
    // explicit applies_to_plans entry on the promo — no silent fallback
    // (we don't want to guess which tier to grant).
```
**Rationale:** Comment at line 85 still refers to the old column name; keep docs in sync.

### Edit 2 — rename the read at line 88 and rename the variable
**Old:**
```js
      const targetPlan = promo.applicable_plans?.[0];
      if (!targetPlan) {
        return NextResponse.json({ error: 'This promo is not tied to a specific plan.' }, { status: 400 });
      }
      const { data: plan } = await supabase
        .from('plans')
        .select('id, display_name')
        .eq('name', targetPlan)
        .maybeSingle();
```
**New:**
```js
      const targetPlanId = promo.applies_to_plans?.[0];
      if (!targetPlanId) {
        return NextResponse.json({ error: 'This promo is not tied to a specific plan.' }, { status: 400 });
      }
      const { data: plan } = await supabase
        .from('plans')
        .select('id, name, display_name')
        .eq('id', targetPlanId)
        .maybeSingle();
```
**Rationale:**
- Line 88: `promo.applicable_plans` → `promo.applies_to_plans` so the read matches the real column.
- `targetPlan` → `targetPlanId` to reflect that the value is a plan UUID (the admin UI writes `plan.id` at `site/src/app/admin/promo/page.tsx:182`; DB column is `uuid[]` per `01-Schema/reset_and_rebuild_v2.sql:1359`).
- Line 95: `.eq('name', targetPlan)` → `.eq('id', targetPlanId)` to actually match the stored UUID against the plans table PK.
- Add `name` to the `select` list at line 94 so Edit 3 can record a human-readable `plan_name` in the audit log.

### Edit 3 — update audit log metadata at lines 112–117
**Old:**
```js
        metadata: {
          promo_code_id: promo.id,
          promo_code: promo.code,
          plan_name: targetPlan,
          plan_id: plan.id,
        },
```
**New:**
```js
        metadata: {
          promo_code_id: promo.id,
          promo_code: promo.code,
          plan_id: plan.id,
          plan_name: plan.name,
        },
```
**Rationale:** `plan_name: targetPlan` used to assume `targetPlan` was a plan name; after Edit 2 it is a UUID. Pull the real plan name from the fetched row instead. `plan_id: plan.id` is preserved.

### Edit 4 — update success response at line 123
**Old:**
```js
      return NextResponse.json({
        success: true,
        fullDiscount: true,
        plan: targetPlan,
        message: `You've been upgraded to ${plan.display_name}!`,
      });
```
**New:**
```js
      return NextResponse.json({
        success: true,
        fullDiscount: true,
        plan: plan.name,
        message: `You've been upgraded to ${plan.display_name}!`,
      });
```
**Rationale:** `plan: targetPlan` used to mean "the plan name string stored on the promo"; after Edit 2 `targetPlanId` is a UUID, and returning a UUID under a key called `plan` would be misleading. Return the plan's human-meaningful `name` field instead. Consumer in `site/src/app/profile/settings/page.tsx:2988` does not read this field — safe change.

### Edit 5 — rename the response key at line 133
**Old:**
```js
      applicable_plans: promo.applicable_plans,
```
**New:**
```js
      applies_to_plans: promo.applies_to_plans,
```
**Rationale:** Fix both the read (was `undefined`) and the key name so the API surface matches the DB and admin convention. Verified no consumer reads this key: the only caller is `handlePromo` in `site/src/app/profile/settings/page.tsx` which reads only `data.error` and `data.message`; iOS has no references to either column name. Safe to rename the key.

## What NOT to change
- Do NOT touch the DB (`applies_to_plans` is already the canonical column; no migration).
- Do NOT touch `site/src/app/admin/promo/page.tsx` (already schema-correct).
- Do NOT touch `site/src/types/database.ts` (generated; already correct).
- Do NOT change the early part of the route (lines 14–82: lookup, duplicate check, atomic increment, `promo_uses` insert, rollback). None of it references the broken name.
- Do NOT change the `handlePromo` consumer in `site/src/app/profile/settings/page.tsx` — it only reads `data.error`/`data.message`, already forward-compatible.
- Do NOT add new audit metadata fields beyond swapping `plan_name: targetPlan` → `plan_name: plan.name`.
- Do NOT rename the response key if you have already identified a consumer that depends on `applicable_plans` — but current grep confirms none exists.

## Post-fix verification
1. `grep -rn "applicable_plans" site/src VerityPost` → expect zero hits (only the five refs in the audit doc and feature ledger markdown will remain; those are docs, not code).
2. `cd site && npx tsc --noEmit` → EXIT=0 (route is `.js`, so tsc mostly just confirms no regressions elsewhere).
3. End-to-end test:
   a. Via admin UI `/admin/promo`, create a promo with `code = TESTFULL`, `discount_type = percent`, `discount_value = 100`, `applies_to_plans = [<uuid of one plan>]`, `is_active = true`.
   b. As a signed-in test user on free tier, POST `/api/promo/redeem` with `{"code":"TESTFULL"}`. Expect 200 with `{success: true, fullDiscount: true, plan: <plan.name>, message: "You've been upgraded to ..."}`.
   c. Verify `users` row: `plan_id` matches target plan UUID, `plan_status = 'active'`.
   d. Verify `audit_log` has `action='promo:apply_full_discount'` with `metadata.plan_id` and `metadata.plan_name` populated.
   e. Re-POST same code with same user → expect 400 "You have already used this code" (duplicate guard still works).
   f. Create a 20% partial promo, redeem it, confirm response body carries `applies_to_plans` with UUID array.
   g. Delete the test promos and the `promo_uses` row.
4. Read the patched `route.js` fully, confirm:
   - Zero occurrences of `applicable_plans`.
   - Zero occurrences of `targetPlan` (all renamed to `targetPlanId`).
   - `plans` select includes `id, name, display_name`.
   - `.eq('id', targetPlanId)` (not `.eq('name', ...)`).

## Risk
- Low. Read-only code changes in a single file, one route, no schema migration.
- Zero active promos in the DB today (auditor confirmed `SELECT ... FROM promo_codes WHERE is_active=true` returns zero rows), so zero production-user impact from the bug currently, and zero regression risk from the fix.
- The route is already gated by `requirePermission('billing.promo.redeem')` and the duplicate-guard via `promo_uses` — fix preserves both.

## Tracker update
Implementer should append to `05-Working/PERMISSION_MIGRATION.md` under a new `### Round 5 — Item 1 (promo redemption column name)` subsection:

- Bug: `/api/promo/redeem/route.js` read wrong column `applicable_plans`; DB column is `applies_to_plans` (`uuid[]`). Plan lookup also used `.eq('name', ...)` against a UUID value.
- Fix: renamed column reads (lines 88, 133) and the comment (line 85); switched plan lookup to `.eq('id', ...)`; renamed local `targetPlan` → `targetPlanId`; added `name` to `plans` select; updated audit metadata `plan_name` to use `plan.name`; renamed response key `applicable_plans` → `applies_to_plans` (no consumer dependency).
- Verification: created full-discount test promo via `/admin/promo`, redeemed via `/api/promo/redeem`, confirmed 200 + plan upgrade + audit row. Cleaned up test data.
- Also resolves the "V.6 / Must-fix" flag carried forward from Round 4 (`PERMISSION_MIGRATION.md:677`, `FEATURE_LEDGER.md:334`, `FEATURE_LEDGER.md:639`, `00-Folder Structure.md:550`) — implementer should strike those entries (or mark resolved) as part of the same pass.
