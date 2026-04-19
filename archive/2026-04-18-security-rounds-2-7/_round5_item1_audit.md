# Round 5 Item 1 — Promo column name bug: AUDIT

## Bug location
- File: `site/src/app/api/promo/redeem/route.js`
- Line(s): 88 (read in logic), 133 (read in response payload). Comment at line 85 also uses the wrong name.
- Expression(s):
  - Line 85 (comment): `// explicit applicable_plans on the promo — no silent fallback`
  - Line 88: `const targetPlan = promo.applicable_plans?.[0];`
  - Line 133: `applicable_plans: promo.applicable_plans,`

## Canonical column name
- DB: `applies_to_plans`, data_type `ARRAY` (declared `uuid[]` in `01-Schema/reset_and_rebuild_v2.sql:1359`). Confirmed via `information_schema.columns` for `public.promo_codes`; column `applicable_plans` does NOT exist on the table.
- `site/src/types/database.ts`: uses `applies_to_plans: string[] | null` for `promo_codes` Row/Insert/Update (lines 5174, 5197, 5220) and again in the relational block at lines 5597, 5612, 5627.

## Every reference in the codebase
| File | Line | Name used | Read or Write | Notes |
|---|---|---|---|---|
| `site/src/app/api/promo/redeem/route.js` | 85 | `applicable_plans` | (comment) | Wrong name in inline documentation. |
| `site/src/app/api/promo/redeem/route.js` | 88 | `applicable_plans` | Read (from selected promo row) | Bug: always `undefined` at runtime; `?.[0]` yields `undefined`, triggers 400. |
| `site/src/app/api/promo/redeem/route.js` | 133 | `applicable_plans` | Read (into response) | Returns `undefined`; breaks any web/iOS consumer that expects the promo's plan list. |
| `site/src/app/admin/promo/page.tsx` | 37 | `applies_to_plans` | Type field on `FormState` | Correct name. |
| `site/src/app/admin/promo/page.tsx` | 50 | `applies_to_plans` | Form initial state | Correct name. |
| `site/src/app/admin/promo/page.tsx` | 102 | `applies_to_plans` | Read (SELECT from `promo_codes`) | Correct name; list view. |
| `site/src/app/admin/promo/page.tsx` | 133, 136, 137, 138 | `applies_to_plans` | Local form mutation | Correct name. |
| `site/src/app/admin/promo/page.tsx` | 182 | `applies_to_plans` | Write (INSERT into `promo_codes`) | Correct name. Writes an array of plan **UUIDs** (`plan.id`). |
| `site/src/app/admin/promo/page.tsx` | 274 | `applies_to_plans` | Read (render column) | Correct name. |
| `site/src/app/admin/promo/page.tsx` | 432 | `applies_to_plans` | Local read (toggle state) | Correct name. |
| `site/src/types/database.ts` | 5174, 5197, 5220, 5597, 5612, 5627 | `applies_to_plans` | Generated type | Matches DB. |
| `01-Schema/reset_and_rebuild_v2.sql` | 1359 | `applies_to_plans` | DDL | `uuid[]` — canonical. |
| `VerityPost` (iOS) | — | neither | — | No Swift references to either name. iOS does not touch this column directly. |

No other code path writes `applicable_plans` or reads `applies_to_plans` incorrectly. The write side (admin UI) is consistent with DB; only the redeem route diverges.

## Impact
- What breaks:
  - **100%-discount promo redemption via `/api/promo/redeem`** always returns HTTP 400 `"This promo is not tied to a specific plan."` — `promo.applicable_plans` is `undefined` (the row only has `applies_to_plans`), so `?.[0]` is `undefined` and the guard at line 89 rejects. The plan upgrade path (lines 92–125) is unreachable.
  - The partial-discount success response at line 128 returns `applicable_plans: undefined`, so any web/iOS client reading that field to know which plans the discount applies to gets nothing. At runtime this silently serializes as the key being omitted or `null` in JSON, not as the array of UUIDs that was configured.
- What works:
  - The early path of the route is fine: lookup (line 27), duplicate check (44), atomic increment (56), `promo_uses` insert (69). These do not reference the broken name.
  - Non-100% partial-discount redemptions still return `success: true` (line 128) — the request does not 400 — but the plan list is lost in the response.
- Who's affected:
  - Web users redeeming a 100% promo via `site/src/app/profile/settings/page.tsx` (`handlePromo` at line 2988, POST to `/api/promo/redeem`): blocked.
  - iOS clients, if they call the same endpoint: blocked identically (no iOS-side schema mismatch; they just get the API's 400).
  - Admin testing promos end-to-end: cannot verify the full-discount plan upgrade.
  - Partial-discount redemptions succeed but downstream UI that expects `applicable_plans` in the response sees an empty/undefined value.

## Adjacent issues found

**1. (Critical, same route) Plan lookup uses `name` but column stores UUIDs.** At line 95 the route does:
```js
.from('plans').select('id, display_name').eq('name', targetPlan)
```
But the admin UI writes `applies_to_plans` as an array of plan **UUIDs** (`plan.id`), not plan `name`s (see `site/src/app/admin/promo/page.tsx:432` and :182 — the toggle stores `plan.id`, the insert persists those IDs). The DB schema confirms `uuid[]` (`01-Schema/reset_and_rebuild_v2.sql:1359`). So even after fixing the column name, `targetPlan` will be a UUID string, and `.eq('name', <uuid>)` will match nothing → the route will 400 with `"Plan not found for this promo."` at line 99. Fixing only the column rename will turn a 400 into a different 400.

**2. (Same route) Response payload name.** Line 133 returns `applicable_plans:` as the key name. Even after fixing the read to `promo.applies_to_plans`, the response key name is inconsistent with the DB/admin convention. Consumers likely need the key renamed too (or a deliberate decision to keep `applicable_plans` as the external API contract and only fix the read).

**3. No other route reads `promo_codes` with a mismatched schema assumption.** A codebase-wide grep finds only `admin/promo/page.tsx` and `api/promo/redeem/route.js` referencing promo plan columns; the admin UI is schema-correct.

**4. No live data yet.** `SELECT ... FROM promo_codes WHERE is_active=true` returns zero rows — no 100%-discount promos exist in the DB today, so the bug has not been hit in production. First real 100% promo created via the admin UI would trip it immediately.

**5. Documentation drift note.** `01-Schema/reset_and_rebuild_v2.sql:210` also has a column named `applies_to_plans` on a different table (likely `rate_limits` — `text[]`). Not related to this bug, but worth knowing the name is reused.

## Proposed fix (for Reviewer — do NOT apply)

Read-only code fix — no schema migration needed; the DB column is already correctly named `applies_to_plans` and the type generator confirms it.

Minimal surgical changes in `site/src/app/api/promo/redeem/route.js`:
- Line 85 (comment): `applicable_plans` → `applies_to_plans`.
- Line 88: `promo.applicable_plans?.[0]` → `promo.applies_to_plans?.[0]`.
- Line 95 (plan lookup — adjacent issue 1): change `.eq('name', targetPlan)` → `.eq('id', targetPlan)` because the stored values are plan UUIDs. Also rename the local variable `targetPlan` → `targetPlanId` for clarity, and in the audit-log `metadata` (lines 115–116) replace `plan_name: targetPlan` with `plan_id: targetPlanId` (the `plan_id: plan.id` line is already present and redundant after the rename — keep one, and optionally add `plan_name: plan.name` by selecting `name` in the `.select()` at line 94).
- Line 133: `applicable_plans: promo.applicable_plans` → `applies_to_plans: promo.applies_to_plans` (rename key too, so the API surface matches the DB and admin convention). If any consumer already depends on the `applicable_plans` key name, rename only the read side (`: promo.applies_to_plans`) and leave the key. Reviewer should confirm by grepping clients.

Whether to fix adjacent issue 1 in the same change is a judgment call for the Reviewer — but the ticket's current wording ("Any 100%-discount promo redemption will 400 ... until renamed") is wrong: renaming alone moves the 400 one line down. The column-name fix and the `name` → `id` fix must ship together to actually unblock the redeem path.

## Tests / verification steps for implementer
1. Via admin UI at `/admin/promo`, create a promo: `discount_type = 'percent'`, `discount_value = 100`, `applies_to_plans` set to one specific plan (e.g. `verity_monthly`), `is_active = true`, no expiry. Note the promo code and target plan's UUID.
2. As a test user on the free tier, POST `/api/promo/redeem` with `{ "code": "<promo code>" }`. Expect 200 with `{ success: true, fullDiscount: true, plan: <plan name or id>, message: "You've been upgraded to ..." }`. Without the fix: expect 400 "This promo is not tied to a specific plan." With only the column-name fix but not the `id`/`name` fix: expect 400 "Plan not found for this promo."
3. Verify `users` row for that user: `plan_id` now matches the target plan's UUID, `plan_status = 'active'`.
4. Verify `audit_log` has a row with `action = 'promo:apply_full_discount'`, correct `actor_id`, and metadata containing the promo and plan identifiers.
5. Re-POST the same code with the same user: expect 400 "You have already used this code" (duplicate guard still works).
6. Create a partial-discount promo (e.g. 20% off, applies to plan X). Redeem it and confirm the response body carries the plans list under whichever key name was chosen (`applies_to_plans` if renamed, `applicable_plans` if kept) — and that the values are UUIDs matching what the admin UI wrote.
7. Grep consumers of the redeem response for either key name (`site/src/app/profile/settings/page.tsx` around line 2991, iOS code if any) and confirm nothing breaks on the chosen key name.
8. Run `tsc` / lint on `site/` after the JS edit — no type regressions (route is `.js`, so types won't catch this; the rename is purely runtime).
