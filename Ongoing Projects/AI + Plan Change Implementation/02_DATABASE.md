# Database changes

Every schema change, migration, trigger, RPC, RLS policy.

## Migration order

Migrations land in this order to avoid breakage:

| # | Migration | What it does | Reversible? |
|---|---|---|---|
| M1 | `pass_a_zod_alignment_check` | No DB change — sanity script that verifies pipeline post-Pass-A is producing valid output (read-only) | n/a |
| M2 | `kid_articles_consolidation` | Drop `kid_articles`, `kid_sources`, `kid_timelines`, `kid_quizzes`, `kid_discovery_items`. Drop their RLS policies. Rewrite `persist_generated_article` to write only to `articles` | NO — destructive |
| M3 | `plan_structure_rewrite` | Update `plans` table; mark Verity Pro inactive; add Family Annual; add per-kid metadata | YES |
| M4 | `family_seat_accounting` | New `family_seats` table OR `kid_seats_paid` column on subscriptions; quantity-based billing fields | YES |
| M5 | `age_band_columns` | Add `kid_profiles.reading_band`, `band_changed_at`, `band_history`. Add `articles.age_band`. Drop vestigial `kid_profiles.age_range` | YES |
| M6 | `dob_immutability_trigger` | Trigger on `kid_profiles` UPDATE: reject any `date_of_birth` change outside the admin override RPC | YES |
| M7 | `band_regression_trigger` | Trigger on `kid_profiles` UPDATE: reject `reading_band` regression (graduated→tweens→kids) | YES |
| M8 | `dob_correction_request_table` | New `kid_dob_correction_requests` table + indexes | YES |
| M9 | `kid_dob_history_table` | New append-only audit table for DOB changes | YES |
| M10 | `band_aware_rls` | Rewrite `articles` RLS for kid-band visibility | YES |
| M11 | `category_kids_dedup` | Drop `(Kids)` category variants, reparent any references | YES (with backfill script) |
| M12 | `permission_seeds` | New permission keys: `admin.kids.dob_corrections.review`, `family.seats.manage` | YES |

---

## M2: kid_articles consolidation

**Verify before drop** (one-shot SQL, abort if any non-zero):
```sql
SELECT
  (SELECT count(*) FROM kid_articles) AS kid_articles,
  (SELECT count(*) FROM kid_sources) AS kid_sources,
  (SELECT count(*) FROM kid_timelines) AS kid_timelines,
  (SELECT count(*) FROM kid_quizzes) AS kid_quizzes,
  (SELECT count(*) FROM kid_discovery_items) AS kid_discovery_items;
```

**Drop sequence:**
```sql
-- RLS first (FKs may depend on these)
DROP POLICY IF EXISTS kid_articles_admin_all ON kid_articles;
DROP POLICY IF EXISTS kid_articles_block_adult_jwt ON kid_articles;
DROP POLICY IF EXISTS kid_articles_read_kid_jwt ON kid_articles;
-- Same for kid_sources, kid_timelines, kid_quizzes, kid_discovery_items

-- Then tables
DROP TABLE kid_quizzes;
DROP TABLE kid_timelines;
DROP TABLE kid_sources;
DROP TABLE kid_articles;
DROP TABLE kid_discovery_items;
```

**Rewrite `persist_generated_article` RPC:**
- Remove the entire `IF v_audience = 'adult' THEN ... ELSE ... END IF;` branching for sources/timeline/quizzes
- Always write to `articles` + `sources` + `timelines` + `quizzes`
- For kid runs: set `articles.is_kids_safe = true`, `articles.kids_summary = (excerpt or summary)`, `articles.age_band = (kids|tweens — passed in payload)`
- Add `audience` and `age_band` to the payload contract; route them into the article row
- Strip the `audience NOT IN ('adult','kid')` guard — replace with `audience NOT IN ('adult','kid','tween') OR (audience='kid' AND age_band NOT IN ('kids','tweens'))`. Tighten validation since the kid path now has more shape

**`web/src/lib/pipeline/persist-article.ts`:**
- `PersistArticlePayload` adds `age_band?: 'kids' | 'tweens' | null`
- For adult: omit; for kid: required

---

## M3: plan_structure_rewrite

```sql
-- Retire Verity Pro tier (existing subscribers grandfather via subscriptions table; plans hidden from new signups)
UPDATE plans SET is_active = false, is_visible = false
WHERE name IN ('verity_pro_monthly', 'verity_pro_annual');

-- Update Verity solo prices
UPDATE plans SET price_cents = 799 WHERE name = 'verity_monthly';
UPDATE plans SET price_cents = 7999 WHERE name = 'verity_annual';

-- Update Family base price + metadata
UPDATE plans
SET price_cents = 1499,
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(metadata, '{included_kids}', '1'),
        '{max_kids}', '4'),
      '{extra_kid_price_cents}', '499'
    )
WHERE name = 'verity_family_monthly';

-- Insert Family annual
INSERT INTO plans (
  name, display_name, tier, billing_period, price_cents, currency,
  max_family_members, is_active, is_visible, sort_order, metadata
) VALUES (
  'verity_family_annual', 'Verity Family (annual)', 'verity_family',
  'year', 14999, 'usd', 6, true, true, /* same sort as monthly */,
  '{"included_kids": 1, "max_kids": 4, "extra_kid_price_cents": 4999, "max_total_seats": 6, "max_adults_flex": true, "is_annual": true}'::jsonb
);
```

**Drop XL references in DEFAULTS:**
- `web/src/app/api/family/config/route.js` line 22: drop `verity_family_xl: 4` from DEFAULTS

---

## M4: family_seat_accounting

Subscription billing needs to know: how many kid seats has this household paid for?

Two approaches — pick one:

**Option A: column on `user_subscriptions` (or wherever the active sub lives):**
```sql
ALTER TABLE user_subscriptions ADD COLUMN kid_seats_paid INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_subscriptions ADD CONSTRAINT kid_seats_paid_range
  CHECK (kid_seats_paid BETWEEN 0 AND 4);
```
Simpler. Single column. Quantity-based billing on Stripe maps directly.

**Option B: separate `family_seat_charges` table:**
Logs every seat add/remove with timestamps for billing reconciliation.

**Recommended: Option A.** Stripe quantity field handles the rest. Reconciliation lives in Stripe.

**Important:** verify what the actual subscription table is named — `user_subscriptions`, `subscriptions`, `app_users.subscription_id`. Need to read the schema before writing this migration.

---

## M5: age_band_columns

```sql
-- kid_profiles
ALTER TABLE kid_profiles ADD COLUMN reading_band TEXT NOT NULL DEFAULT 'kids'
  CHECK (reading_band IN ('kids', 'tweens', 'graduated'));
ALTER TABLE kid_profiles ADD COLUMN band_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE kid_profiles ADD COLUMN band_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from DOB
UPDATE kid_profiles
SET reading_band = CASE
  WHEN date_of_birth IS NULL THEN 'kids'  -- safe default for orphan rows
  WHEN extract(year from age(date_of_birth)) >= 13 THEN 'graduated'
  WHEN extract(year from age(date_of_birth)) >= 10 THEN 'tweens'
  ELSE 'kids'
END;

-- Drop vestigial column
ALTER TABLE kid_profiles DROP COLUMN age_range;

-- articles
ALTER TABLE articles ADD COLUMN age_band TEXT
  CHECK (age_band IS NULL OR age_band IN ('kids', 'tweens', 'adult'));
-- Backfill: any existing kids-safe articles get 'tweens' (closest to current 8-14 voice)
UPDATE articles SET age_band = 'tweens' WHERE is_kids_safe = true;
UPDATE articles SET age_band = 'adult' WHERE is_kids_safe = false;

-- Index for kid feed query
CREATE INDEX idx_articles_kid_feed
  ON articles (is_kids_safe, age_band, status, published_at DESC)
  WHERE is_kids_safe = true AND status = 'published';
```

---

## M6: dob_immutability_trigger

```sql
CREATE OR REPLACE FUNCTION enforce_kid_dob_immutable()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow the admin override RPC (it sets a session var before update)
  IF current_setting('app.dob_admin_override', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth THEN
    RAISE EXCEPTION 'DOB is immutable after profile creation. Use admin DOB-correction flow.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kid_profiles_dob_immutable
  BEFORE UPDATE ON kid_profiles
  FOR EACH ROW
  WHEN (OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth)
  EXECUTE FUNCTION enforce_kid_dob_immutable();
```

**Companion RPC for admin overrides:**
```sql
CREATE OR REPLACE FUNCTION admin_apply_dob_correction(
  p_request_id uuid,
  p_decision text,  -- 'approved' | 'rejected'
  p_decision_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_request kid_dob_correction_requests%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  -- Verify actor has the permission
  IF NOT EXISTS (
    SELECT 1 FROM compute_effective_perms(v_actor) p
    WHERE p.permission_key = 'admin.kids.dob_corrections.review' AND p.granted
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request FROM kid_dob_correction_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request not pending';
  END IF;

  -- Mark request decided
  UPDATE kid_dob_correction_requests
  SET status = p_decision, decision_reason = p_decision_reason,
      decided_by = v_actor, decided_at = now()
  WHERE id = p_request_id;

  -- If approved: apply DOB change with override flag set
  IF p_decision = 'approved' THEN
    PERFORM set_config('app.dob_admin_override', 'true', true);
    UPDATE kid_profiles
    SET date_of_birth = v_request.requested_dob,
        reading_band = compute_band_from_dob(v_request.requested_dob),
        band_changed_at = now(),
        band_history = band_history || jsonb_build_object(
          'old_band', reading_band,
          'new_band', compute_band_from_dob(v_request.requested_dob),
          'set_at', now(),
          'set_by', v_actor,
          'reason', 'dob_correction:' || v_request.id
        )
    WHERE id = v_request.kid_profile_id;

    -- Audit
    INSERT INTO kid_dob_history (kid_profile_id, old_dob, new_dob, change_source, actor_user_id, decision_reason)
    VALUES (v_request.kid_profile_id, v_request.current_dob, v_request.requested_dob,
            'admin_correction', v_actor, p_decision_reason);
  END IF;
END;
$$;
```

---

## M7: band_regression_trigger

```sql
CREATE OR REPLACE FUNCTION enforce_band_ratchet()
RETURNS TRIGGER AS $$
DECLARE
  v_old_rank int;
  v_new_rank int;
BEGIN
  v_old_rank := CASE OLD.reading_band
    WHEN 'kids' THEN 1
    WHEN 'tweens' THEN 2
    WHEN 'graduated' THEN 3
  END;
  v_new_rank := CASE NEW.reading_band
    WHEN 'kids' THEN 1
    WHEN 'tweens' THEN 2
    WHEN 'graduated' THEN 3
  END;

  -- DOB correction (admin override) is the only path that can lower the band
  IF v_new_rank < v_old_rank
     AND current_setting('app.dob_admin_override', true) <> 'true' THEN
    RAISE EXCEPTION 'reading_band cannot regress (% -> %)',
      OLD.reading_band, NEW.reading_band USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kid_profiles_band_ratchet
  BEFORE UPDATE ON kid_profiles
  FOR EACH ROW
  WHEN (OLD.reading_band IS DISTINCT FROM NEW.reading_band)
  EXECUTE FUNCTION enforce_band_ratchet();
```

---

## M8: dob_correction_request_table

```sql
CREATE TABLE kid_dob_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_profile_id uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  parent_user_id uuid NOT NULL REFERENCES auth.users(id),
  current_dob date NOT NULL,
  requested_dob date NOT NULL,
  reason text NOT NULL CHECK (length(reason) >= 10 AND length(reason) <= 280),
  documentation_url text,  -- only required for older-band corrections
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'documentation_requested')),
  decision_reason text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  approved_at timestamptz,  -- when the cooldown completes (younger-band auto-approves)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One pending request per kid at a time
CREATE UNIQUE INDEX idx_dob_corrections_one_pending
  ON kid_dob_correction_requests (kid_profile_id)
  WHERE status = 'pending';

-- Lifetime correction limit (one per kid)
CREATE UNIQUE INDEX idx_dob_corrections_lifetime
  ON kid_dob_correction_requests (kid_profile_id)
  WHERE status = 'approved';

CREATE INDEX idx_dob_corrections_queue
  ON kid_dob_correction_requests (status, created_at DESC);
```

---

## M9: kid_dob_history_table

```sql
CREATE TABLE kid_dob_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_profile_id uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  old_dob date NOT NULL,
  new_dob date NOT NULL,
  change_source text NOT NULL CHECK (change_source IN ('initial_creation', 'admin_correction', 'admin_manual_override')),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  decision_reason text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kid_dob_history_kid ON kid_dob_history (kid_profile_id, created_at DESC);
```

Append-only — no UPDATE or DELETE permissions for any role except DB superuser.

---

## M10: band_aware_rls

```sql
-- Helper SQL function
CREATE OR REPLACE FUNCTION kid_visible_bands(p_profile_id uuid)
RETURNS text[] AS $$
DECLARE
  v_band text;
BEGIN
  SELECT reading_band INTO v_band FROM kid_profiles WHERE id = p_profile_id;
  RETURN CASE v_band
    WHEN 'kids' THEN ARRAY['kids']
    WHEN 'tweens' THEN ARRAY['kids', 'tweens']  -- tweens see both
    ELSE ARRAY[]::text[]                         -- graduated sees nothing in kid app
  END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get current kid profile from JWT claims
CREATE OR REPLACE FUNCTION current_kid_profile_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'kid_profile_id')::uuid;
$$ LANGUAGE sql STABLE;

-- New RLS on articles for kid readers
DROP POLICY IF EXISTS articles_read_kid_jwt ON articles;
CREATE POLICY articles_read_kid_jwt ON articles
  FOR SELECT
  USING (
    is_kid_delegated()
    AND status = 'published'
    AND is_kids_safe = true
    AND age_band = ANY(kid_visible_bands(current_kid_profile_id()))
  );

-- Block kid JWT from reading non-kids articles
DROP POLICY IF EXISTS articles_block_adult_jwt ON articles;
CREATE POLICY articles_block_adult_jwt ON articles
  FOR ALL
  USING (
    NOT is_kid_delegated()
    OR (is_kids_safe = true AND age_band = ANY(kid_visible_bands(current_kid_profile_id())))
  );
```

---

## M11: category_kids_dedup

```sql
-- For each (Kids) variant, find the base category and reparent
DO $$
DECLARE
  v_pair record;
BEGIN
  FOR v_pair IN
    SELECT k.id AS kid_id, k.name AS kid_name,
           b.id AS base_id, b.name AS base_name
    FROM categories k
    JOIN categories b ON regexp_replace(k.name, ' \(Kids\)$', '') = b.name
    WHERE k.name LIKE '% (Kids)'
  LOOP
    -- Reparent any articles
    UPDATE articles SET category_id = v_pair.base_id WHERE category_id = v_pair.kid_id;
    -- Reparent any other references (subcategories, prompt_overrides, etc.)
    UPDATE ai_prompt_overrides SET category_id = v_pair.base_id WHERE category_id = v_pair.kid_id;
    -- Then delete the (Kids) row
    DELETE FROM categories WHERE id = v_pair.kid_id;
  END LOOP;
END $$;

-- Ensure base categories that should be kid-safe are flagged
UPDATE categories SET is_kids_safe = true
WHERE name IN ('Animals', 'Arts', 'History', 'Space', 'Weather', 'Health',
               'Science', 'Technology', 'World', 'Sports', 'Education');
```

---

## M12: permission_seeds

```sql
INSERT INTO permissions (key, display_name, surface) VALUES
  ('admin.kids.dob_corrections.review', 'Review kid DOB correction requests', 'admin'),
  ('family.seats.manage', 'Manage family seat count + extra kid purchases', 'profile')
ON CONFLICT (key) DO NOTHING;

-- Grant admin role
INSERT INTO role_permissions (role, permission_key)
SELECT 'admin', 'admin.kids.dob_corrections.review'
ON CONFLICT DO NOTHING;
```

---

## RLS sweep — what else to review

Tables that need RLS review under the new model:
- `articles` — kid visibility now band-keyed ✓ M10
- `kid_profiles` — parent owns; trigger enforces band + DOB ✓ M6/M7
- `kid_dob_correction_requests` — parent reads own, admin reads all
- `kid_dob_history` — admin only (audit trail)
- `categories` — already has `is_kids_safe` filter; ensure (Kids) cleanup doesn't leak
- `quizzes`, `timelines`, `sources` — inherit visibility from parent article via `articles` RLS

---

## Order-of-ops gotchas

- **M2 must come AFTER Pass A** lands and pipeline writes are confirmed working with the new persist contract.
- **M5 + M10 must land together** — RLS will reference age_band; if column doesn't exist RLS errors on every query.
- **M11 (category dedup) must come before** the pipeline starts categorizing into the new band articles, OR after all existing articles have been backfilled. Otherwise some articles end up with `category_id` pointing at a deleted (Kids) row.
- **M3/M4 (plan structure) can ship independently** of age banding — they touch different tables.
- **M8/M9/M12 (DOB correction infra)** can ship before the UI is built — backend is dormant until the form is wired.

## Rollback procedure

Each migration has a `*_revert.sql` companion. M2 is the only non-reversible — kid_articles drops are destructive. Confirm zero rows + admin sign-off before running.

For Phase 5 (age banding), if production breaks badly:
- Revert M10 first (RLS) → falls back to existing kid_articles_* policy on articles
- Revert M5 (columns) — `age_band` becoming NULL on articles is graceful (Zod schema treats it optional)
- Revert M7/M6 (triggers) — admin can manually correct via service-role client if needed
- M3/M4 revert separately — restore old plan rows + drop new columns

Pipeline + iOS app code paths must check for both column-present and column-absent during the rollout window.
