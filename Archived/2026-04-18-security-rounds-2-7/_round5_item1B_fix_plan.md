# Round 5 Item 1B — promo_uses insert bug: FIX PLAN

## Summary

The `promo_uses` insert at `site/src/app/api/promo/redeem/route.js:69-73` writes to a nonexistent column (`redeemed_at`) and omits the NOT NULL column `discount_applied_cents`. Either failure alone would break every redemption; together they guarantee it. Additionally, the `useError` branch (line 75-82) returns `"You have already used this code"` for any insert failure, which has been masking this bug from manual QA.

Full fix: re-order to fetch the plan for the 100%-discount branch before the insert, compute `discount_applied_cents` (plan.price_cents for 100%, else 0), drop the bad `redeemed_at` field, and tighten the error branch so schema failures no longer masquerade as duplicate-use.

## Files to modify

- `site/src/app/api/promo/redeem/route.js`

## Background validated

- `promo_uses` canonical columns (verified in `site/src/types/database.ts:5259-5307` and `01-Schema/reset_and_rebuild_v2.sql:1578-1585`): `id`, `promo_code_id`, `user_id`, `subscription_id?`, `discount_applied_cents` (NOT NULL), `created_at` (DB default `now()`). No `redeemed_at` column.
- `plans.price_cents` is `integer NOT NULL DEFAULT 0` (`site/src/types/database.ts:5121`; `01-Schema/reset_and_rebuild_v2.sql:155`). Safe to read for paid plans; `0` for a hypothetical free plan is harmless for this column's semantics.
- Control flow check: the `promo_uses` insert at lines 69-73 fires on **both** the 100%-discount path and the non-100% path — the partial-discount path does not early-return before it. So the fix must cover both branches.
- `const now` on line 24 is also used at line 32 (`expires_at.gt.${now}`). Do not remove the declaration.
- Only other `redeemed_at` occurrences in `site/src` are on the unrelated `access_code_uses` table (`database.ts:22/29/36`). Fix is isolated.
- No existing `site/src` code writes `discount_applied_cents` anywhere else; this route's value becomes the de-facto definition. The chosen semantics: "the cents removed from the user's billable amount by this redemption" (full plan price for 100%-off upgrade, `0` when the code only reserves an intent for a later paid checkout).
- Only caller: `site/src/app/profile/settings/page.tsx:2991` — reads `data.error` / `data.message` / nothing else. Shape changes in `useError`'s 500-vs-400 status are safe for this caller.

## Exact edits

### Edit 1 — compute `discountAppliedCents` and pull the plan lookup above the insert

**Old (lines 68-73):**
```js
    // Record redemption
    const { error: useError } = await supabase.from('promo_uses').insert({
      promo_code_id: promo.id,
      user_id: user.id,
      redeemed_at: now,
    });
```

**New:**
```js
    // Determine discount_applied_cents for this redemption.
    // 100%-off codes record the full plan price (the cents removed from
    // the user's billable amount by this "free upgrade"). Other codes
    // reserve intent for a later paid checkout — no money has moved yet,
    // so write 0 and let the checkout/webhook path record the real value.
    let discountAppliedCents = 0;
    let prefetchedPlan = null;

    if (promo.discount_type === 'percent' && promo.discount_value >= 100) {
      const targetPlanId = promo.applies_to_plans?.[0];
      if (!targetPlanId) {
        await supabase.from('promo_codes')
          .update({ current_uses: promo.current_uses })
          .eq('id', promo.id)
          .eq('current_uses', promo.current_uses + 1);
        return NextResponse.json({ error: 'This promo is not tied to a specific plan.' }, { status: 400 });
      }
      const { data: planForInsert } = await supabase
        .from('plans')
        .select('id, name, display_name, price_cents')
        .eq('id', targetPlanId)
        .maybeSingle();

      if (!planForInsert) {
        await supabase.from('promo_codes')
          .update({ current_uses: promo.current_uses })
          .eq('id', promo.id)
          .eq('current_uses', promo.current_uses + 1);
        return NextResponse.json({ error: 'Plan not found for this promo.' }, { status: 400 });
      }
      discountAppliedCents = planForInsert.price_cents ?? 0;
      prefetchedPlan = planForInsert;
    }

    // Record redemption. created_at uses the DB default.
    const { error: useError } = await supabase.from('promo_uses').insert({
      promo_code_id: promo.id,
      user_id: user.id,
      discount_applied_cents: discountAppliedCents,
    });
```

**Rationale:** `plan.price_cents` must be known before the insert for the 100% branch. Moving the plan lookup above the insert (with counter-rollback on either of its two failure modes) lets us compute `discount_applied_cents` without adding a second query. The non-100% branch passes through with `0`.

### Edit 2 — differentiate insert errors from duplicate-use

**Old (lines 75-82):**
```js
    if (useError) {
      // Roll back counter
      await supabase.from('promo_codes')
        .update({ current_uses: promo.current_uses })
        .eq('id', promo.id)
        .eq('current_uses', promo.current_uses + 1);
      return NextResponse.json({ error: 'You have already used this code' }, { status: 400 });
    }
```

**New:**
```js
    if (useError) {
      // Roll back counter (best-effort; no-ops if a concurrent redeemer raced).
      await supabase.from('promo_codes')
        .update({ current_uses: promo.current_uses })
        .eq('id', promo.id)
        .eq('current_uses', promo.current_uses + 1);
      console.error('[promo/redeem] promo_uses insert failed:', useError);
      return NextResponse.json({ error: 'Could not record redemption. Please try again.' }, { status: 500 });
    }
```

**Rationale:** The duplicate-redemption case is already caught by the pre-check at lines 44-53. Any `useError` reaching this point is a real error (schema mismatch, network, RLS, etc.) and should surface as 500, not as a misleading "already used." Without this change, regressions like Item 1B remain invisible to manual QA. Caller (`settings/page.tsx:2997`) branches on `!res.ok` regardless of 400 vs 500, so the client UX does not regress.

### Edit 3 — consume the pre-fetched plan in the 100%-discount block (drop the duplicate lookup)

**Old (lines 87-100):**
```js
    // If 100% discount, upgrade user plan directly. Requires an
    // explicit applies_to_plans entry on the promo — no silent fallback
    // (we don't want to guess which tier to grant).
    if (promo.discount_type === 'percent' && promo.discount_value >= 100) {
      const targetPlanId = promo.applies_to_plans?.[0];
      if (!targetPlanId) {
        return NextResponse.json({ error: 'This promo is not tied to a specific plan.' }, { status: 400 });
      }
      const { data: plan } = await supabase
        .from('plans')
        .select('id, name, display_name')
        .eq('id', targetPlanId)
        .maybeSingle();

      if (!plan) {
        return NextResponse.json({ error: 'Plan not found for this promo.' }, { status: 400 });
      }
```

**New:**
```js
    // If 100% discount, upgrade user plan directly. The plan was already
    // resolved above so we could compute discount_applied_cents — reuse it.
    if (promo.discount_type === 'percent' && promo.discount_value >= 100) {
      const plan = prefetchedPlan;
      // Defensive: the block above guarantees plan is set when we reach here.
      if (!plan) {
        return NextResponse.json({ error: 'Plan not found for this promo.' }, { status: 400 });
      }
```

**Rationale:** Avoid re-querying `plans` for the same id we just fetched. The `applies_to_plans` nullity and `plan` existence checks already fired above (with counter rollback on failure), so reaching this block with `prefetchedPlan === null` is unreachable; the defensive branch remains for type-narrowing. The subsequent `users` update and `audit_log` insert at lines 102-118 are unchanged.

## What NOT to change

- The Item 1 column fix (`expires_at.gt.${now}` on line 32 and the `.eq('id', promo.id)` on line 59) — both correct.
- Line 24 `const now` — still used on line 32.
- RLS policies, `promo_uses` constraints, or any migration (the Auditor's note about a missing UNIQUE on `(promo_code_id, user_id)` is out of scope).
- The counter-increment optimistic-concurrency pattern (lines 56-66) and the rollback shape.
- The `audit_log` insert (lines 107-118) — untouched by this fix.
- The final success response for the non-100% path (lines 128-135).
- Other routes, type generators, or schema files.

## Post-fix verification

1. `cd /Users/veritypost/Desktop/verity-post/site && npx tsc --noEmit` → EXIT=0 (must pass; `database.ts` requires `discount_applied_cents` on insert, which this fix supplies).
2. `grep -rn "redeemed_at" /Users/veritypost/Desktop/verity-post/site/src/app/api/promo/redeem/route.js` → 0 hits.
3. SQL probe via `mcp__claude_ai_Supabase__execute_sql` against project `fyiwulqphgmoqullmrfn`:
   ```sql
   -- Create fixture
   WITH p AS (SELECT id FROM plans WHERE name='family' LIMIT 1)
   INSERT INTO promo_codes (code, discount_type, discount_value, applies_to_plans, is_active, max_uses)
   SELECT 'R5I1BTEST', 'percent', 100, ARRAY[p.id], true, 5 FROM p
   RETURNING id, applies_to_plans;

   -- Confirm the insert shape the route now uses is accepted
   INSERT INTO promo_uses (promo_code_id, user_id, discount_applied_cents)
   SELECT
     (SELECT id FROM promo_codes WHERE code='R5I1BTEST'),
     (SELECT id FROM users LIMIT 1),
     0
   RETURNING id, created_at, discount_applied_cents;

   -- Cleanup
   DELETE FROM promo_uses WHERE promo_code_id = (SELECT id FROM promo_codes WHERE code='R5I1BTEST');
   DELETE FROM promo_codes WHERE code = 'R5I1BTEST';
   ```
4. Re-read the patched `route.js` end-to-end; confirm:
   - `let discountAppliedCents`, `let prefetchedPlan` are declared before first use
   - No reference to `redeemed_at` remains
   - The 100%-discount block uses `prefetchedPlan` (not a second `.from('plans')` call)
   - The `users` update and `audit_log` insert still reference `plan` (the local alias)
5. Manual flow scenarios:
   - 100%-discount promo with a valid `applies_to_plans[0]` → expect `200`, `fullDiscount: true`, `promo_uses.discount_applied_cents = plan.price_cents`, `audit_log` row written, `users.plan_id` updated.
   - 100%-discount promo with `applies_to_plans` null → expect `400 "not tied to a specific plan"`, counter rolled back, no `promo_uses` row.
   - 100%-discount promo with an invalid `applies_to_plans[0]` → expect `400 "Plan not found"`, counter rolled back, no `promo_uses` row.
   - Non-100% promo → expect `200`, `fullDiscount: false`, `promo_uses.discount_applied_cents = 0`, no `audit_log` row, counter incremented.
   - Double-redeem the same code as the same user → expect `400 "already used"` from the pre-check at line 51 (not from the `useError` branch).

## Risk

- **Low** for edits 1 and 3: the schema column fix and code-reuse refactor are straightforward; no migration.
- **Low** for edit 2: the caller already branches on `!res.ok`, and the pre-check at line 51 still catches the only legitimate "already used" case; the status-code change from 400 to 500 on insert error is semantically more correct and aligns with the existing `catch` block at line 138.
- **Medium (flagged, not blocking):** moving the plan lookup above the `promo_uses` insert changes the ordering of two writes relative to a read. The new order is: increment counter → look up plan (with rollback on miss) → insert promo_uses (with rollback on miss) → update users → write audit_log. This is strictly better than the old order (counter increment → blind insert → plan lookup) because failures now roll back the counter in more cases.

## Tracker update

Implementer appends to `05-Working/PERMISSION_MIGRATION.md` under a new section:

```
### Round 5 — Item 1B (promo_uses insert schema)
- Fixed `site/src/app/api/promo/redeem/route.js` promo_uses insert:
  - Dropped nonexistent `redeemed_at` column; rely on `created_at` DB default.
  - Added required `discount_applied_cents`: `plan.price_cents` for 100%-off promos, `0` for non-100% (intent-only, real value written at checkout).
  - Moved `plans` lookup above the insert so 100%-off branch can compute cents.
  - Differentiated insert failures (now 500 with logged error) from the duplicate-use pre-check (still 400).
- No schema change; no migration.
- Verified: `npx tsc --noEmit` clean; SQL probe confirms insert shape `{promo_code_id, user_id, discount_applied_cents}` is accepted.
```
