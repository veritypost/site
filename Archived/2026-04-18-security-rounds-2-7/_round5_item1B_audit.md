# Round 5 Item 1B — promo_uses insert bug: AUDIT

## Bug location
- File: `site/src/app/api/promo/redeem/route.js`
- Line(s): 68-73 (the insert itself is lines 69-73; the `const now` on line 24 is the source of the bad value)
- Current code (verbatim):
  ```js
  // Record redemption
  const { error: useError } = await supabase.from('promo_uses').insert({
    promo_code_id: promo.id,
    user_id: user.id,
    redeemed_at: now,
  });
  ```
  (where `const now = new Date().toISOString();` is defined on line 24)

## Canonical `promo_uses` schema

Live pulled from `fyiwulqphgmoqullmrfn` `information_schema.columns`; confirmed against `01-Schema/reset_and_rebuild_v2.sql` lines 1578-1585 and `site/src/types/database.ts` lines 5259-5307.

| column | type | nullable | default | notes |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `promo_code_id` | uuid | NO | — | FK -> `promo_codes(id)` ON DELETE CASCADE |
| `user_id` | uuid | NO | — | FK -> `users(id)` ON DELETE CASCADE |
| `subscription_id` | uuid | YES | — | FK -> `subscriptions(id)` ON DELETE CASCADE |
| `discount_applied_cents` | integer | **NO** | — | **required, no default** |
| `created_at` | timestamptz | NO | `now()` | canonical timestamp |

No `redeemed_at` column exists on this table. No UNIQUE constraint is declared on `(promo_code_id, user_id)` — the app-level duplicate check at lines 44-49 is the only guard.

RLS: `promo_uses_insert` policy requires `user_id = auth.uid()`; the route uses the service client, which bypasses RLS, so that is fine.

## Mismatches

- **Wrong column:** `redeemed_at` — does not exist on `promo_uses`. Postgres will reject the insert with `column "redeemed_at" of relation "promo_uses" does not exist` (PostgREST surfaces this as a `PGRST204`/42703 error).
- **Missing required column:** `discount_applied_cents` — NOT NULL with no default. The insert omits it entirely, so even if `redeemed_at` were accepted the insert would fail with `null value in column "discount_applied_cents" violates not-null constraint`.

## What to write instead

- **`created_at`** — rely on the DB default. `created_at` already has `DEFAULT now()` server-side, and the generated TS type marks it optional on insert (`created_at?: string`). Cleanest fix: drop the field from the insert and let Postgres set it. (Writing `created_at: now` explicitly also works — just don't name it `redeemed_at`.)
- **`discount_applied_cents`** — must be supplied. The redemption path as written does **not** have a concrete line amount to discount against (no `subscription_id`, no cart). Options, in order of preference for a precise fix:
  1. **100% promos (current path that actually mutates the user):** look up the target plan's `plans.price_cents` (already fetched as `plan` later in the block) and record `discount_applied_cents = plan.price_cents`. That's the full discount applied for the "free upgrade" case.
  2. **Non-100% promos (current path just returns "apply at checkout"):** there is no subscription or charge yet — the row is recording intent, not an actual money movement. Write `0` and rely on a later checkout/webhook flow to write the real `promo_uses` row. The existing redemption flow is really doing "reserve this code for this user," which makes the current placement of the `promo_uses` write questionable (see Adjacent issues below).
- **`subscription_id`** — nullable, omit. No subscription context is in scope here.

## Adjacent issues (in the SAME insert block / flow)

1. **No UNIQUE constraint on `(promo_code_id, user_id)`.** The code relies on a TOCTOU pre-check (lines 43-53) followed by an insert. Two concurrent redemptions of the same code by the same user can both pass the pre-check and both insert — duplicate rows will exist, and the user will have "used" the code twice against one `current_uses` slot. A partial-index UNIQUE or DB-level dedup is warranted. Out of scope for Item 1B (schema change), but worth logging.
2. **Counter-rollback on `useError` returns "already used" to the caller (line 81).** If the real error is something else (e.g., schema mismatch — which is exactly this bug), the user sees "already used" and we silently roll the counter back. This will mask the fix's failure modes during manual QA. Reviewer should consider logging `useError` before rolling back and returning a generic 500, reserving the "already used" branch for the pre-check at line 51.
3. **Order-of-operations:** `current_uses` is incremented *before* the `promo_uses` row is written. The rollback on failure is best-effort (optimistic concurrency — if another redeemer raced in between, the rollback's `eq('current_uses', promo.current_uses + 1)` will silently no-op). A proper fix is an RPC that does both writes atomically; again out of scope for Item 1B, but this bug is the kind of thing that makes the counter drift in production.
4. **`discount_applied_cents` semantics aren't defined anywhere in code.** The column exists in schema and types but is never written by any existing code path — `grep discount_applied_cents site/src` returns only the generated type definitions. Whatever value the fix writes becomes the de-facto definition, so the Implementer should pick deliberately and note it for the auditor's sibling reports.

## Proposed fix (for Reviewer)

**Scope:** lines 68-73 only. Do not touch the duplicate-check, the counter update, or the rollback.

Replace:
```js
    // Record redemption
    const { error: useError } = await supabase.from('promo_uses').insert({
      promo_code_id: promo.id,
      user_id: user.id,
      redeemed_at: now,
    });
```
with a two-step that knows the plan price for the 100%-discount case (which is the only branch that completes a material mutation). Because `plan.price_cents` is only fetched *after* this insert (lines 92-100), the clean version moves the promo_uses write down to after the plan lookup in the 100% branch, and for the non-100% branch writes `0`:

```js
    // Determine amount discounted for this redemption.
    // Non-100% codes don't yet have a subscription/cart in scope — this
    // row records "code reserved for user"; the real cents are recorded
    // later in the checkout/webhook path.
    let discountAppliedCents = 0;
    let targetPlanForInsert = null;

    if (promo.discount_type === 'percent' && promo.discount_value >= 100) {
      const targetPlanId = promo.applies_to_plans?.[0];
      if (!targetPlanId) {
        // Roll back the counter we just claimed
        await supabase.from('promo_codes')
          .update({ current_uses: promo.current_uses })
          .eq('id', promo.id)
          .eq('current_uses', promo.current_uses + 1);
        return NextResponse.json({ error: 'This promo is not tied to a specific plan.' }, { status: 400 });
      }
      const { data: plan } = await supabase
        .from('plans')
        .select('id, name, display_name, price_cents')
        .eq('id', targetPlanId)
        .maybeSingle();

      if (!plan) {
        await supabase.from('promo_codes')
          .update({ current_uses: promo.current_uses })
          .eq('id', promo.id)
          .eq('current_uses', promo.current_uses + 1);
        return NextResponse.json({ error: 'Plan not found for this promo.' }, { status: 400 });
      }
      discountAppliedCents = plan.price_cents ?? 0;
      targetPlanForInsert = plan;
    }

    // Record redemption. created_at is DB-defaulted.
    const { error: useError } = await supabase.from('promo_uses').insert({
      promo_code_id: promo.id,
      user_id: user.id,
      discount_applied_cents: discountAppliedCents,
    });

    if (useError) {
      await supabase.from('promo_codes')
        .update({ current_uses: promo.current_uses })
        .eq('id', promo.id)
        .eq('current_uses', promo.current_uses + 1);
      console.error('[promo/redeem] promo_uses insert failed:', useError);
      return NextResponse.json({ error: 'Could not record redemption. Please try again.' }, { status: 500 });
    }
```
Then in the existing 100%-discount block below, replace the plan re-lookup with `const plan = targetPlanForInsert;` (it was already fetched above) and keep the rest of the block (users update + audit_log) unchanged.

**Minimal alternative** (smaller diff, less opinionated — if the Reviewer wants surgical scope):
- Change `redeemed_at: now,` -> drop it (use DB default).
- Add `discount_applied_cents: 0,` on a new line.
- Move the `const now` removal to a later cleanup.
- This at least makes redemption *work*. It leaves `discount_applied_cents` meaningless for the 100%-discount case; document this in the Round 5 ledger and revisit when the real checkout path gets wired.

  Precise minimal diff:
  ```diff
  -    const { error: useError } = await supabase.from('promo_uses').insert({
  -      promo_code_id: promo.id,
  -      user_id: user.id,
  -      redeemed_at: now,
  -    });
  +    const { error: useError } = await supabase.from('promo_uses').insert({
  +      promo_code_id: promo.id,
  +      user_id: user.id,
  +      discount_applied_cents: 0,
  +    });
  ```

## Tests / verification

1. Create a test promo:
   ```sql
   INSERT INTO promo_codes (code, discount_type, discount_value, applies_to_plans, is_active, max_uses)
   VALUES ('R5ITEM1B', 'percent', 100, ARRAY[(SELECT id FROM plans WHERE name='family' LIMIT 1)], true, 5)
   RETURNING id;
   ```
2. Hit `POST /api/promo/redeem` with `{ "code": "R5ITEM1B" }` as an authenticated user who has `billing.promo.redeem`. Expect `200` and `fullDiscount: true`.
3. Confirm the row:
   ```sql
   SELECT id, promo_code_id, user_id, subscription_id, discount_applied_cents, created_at
   FROM promo_uses
   WHERE promo_code_id = '<promo id from step 1>';
   ```
   Expect one row, `discount_applied_cents` = plan.price_cents (full fix) or `0` (minimal fix), `created_at` populated by DB.
4. Hit the same endpoint again with the same user. Expect `400 "You have already used this code"` (pre-check hit).
5. Confirm `promo_codes.current_uses` incremented by exactly 1:
   ```sql
   SELECT code, current_uses FROM promo_codes WHERE code = 'R5ITEM1B';
   ```
6. Cleanup:
   ```sql
   DELETE FROM promo_uses WHERE promo_code_id = (SELECT id FROM promo_codes WHERE code='R5ITEM1B');
   DELETE FROM promo_codes WHERE code = 'R5ITEM1B';
   -- if the 100% path ran, revert the test user's plan:
   -- UPDATE users SET plan_id = <prior>, plan_status = <prior> WHERE id = '<test user>';
   ```
7. Regression guard: confirm `grep -rn "redeemed_at" site/src` returns zero hits after the fix.
