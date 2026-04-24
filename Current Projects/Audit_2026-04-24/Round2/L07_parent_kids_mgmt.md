---
round: 2
layer: 1
lens: L07-parent-kids-mgmt
anchor_sha: 10b69cb99552fd22f7cebfcb19d1bbc32ae177fe
---

# Lens Audit — L07 Parent-Kids Management

## Summary

Audited parent-side and kid-side management surfaces across web (`/profile/kids`), iOS (`FamilyViews`), and API (`/api/kids/*`, `/api/cron/sweep-kid-trials`, `/api/cron/recompute-family-achievements`). Examined kid roster RLS, family-plan slot enforcement, kid-delete cleanup, trial-expiry sweep, COPPA consent records, pair-code TTL handling, and kid profile edit permissions. Found 4 issues: missing maxDuration on trial cron (extends C25), soft-deleted kids in household KPIs, COPPA consent write race, and pair-code table bloat.

## Findings

### [Severity: HIGH]

#### L07-001 — `sweep-kid-trials` cron missing `maxDuration` export

**File:line:** `web/src/app/api/cron/sweep-kid-trials/route.js:14-15`

**What's wrong:** The route exports `dynamic = 'force-dynamic'` and `runtime = 'nodejs'` but lacks `export const maxDuration`. Without it, Vercel's default (300–900s) applies. If the sweep encounters >1000 expired trial kids or slow DB, the job silently times out mid-sweep, leaving some trials frozen and others not. Family plan trial enforcement (D44) breaks.

**Lens applied:** Cron reliability for family-plan trial enforcement; incomplete sweeps leave the system in an inconsistent state.

**New vs Round 1:** EXTENDS_MASTER_ITEM_C25 — C25 lists 4 routes missing maxDuration; this job was omitted from that list.

**Evidence:**
```javascript
// sweep-kid-trials/route.js (lines 14-15)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Missing: export const maxDuration = 60;
```

**Suggested disposition:** AUTONOMOUS-FIXABLE

---

#### L07-002 — Household KPIs include soft-deleted kid profiles

**File:line:** `web/src/app/api/kids/household-kpis/route.js:31-33`

**What's wrong:** The endpoint queries `kid_profiles` without filtering `is_active = true`. Soft-deleted kids (paused/removed by parent) are included in the 7-day reading/quiz aggregate, inflating household stats with stale data. Inconsistent with `/api/kids` GET which correctly filters `is_active = true`.

**Lens applied:** Family-plan soft-delete consistency. Kids removed from the family should not contribute to household metrics.

**New vs Round 1:** NEW

**Evidence:**
```javascript
// household-kpis/route.js lines 31-33
service.from('kid_profiles').select(...).eq('parent_user_id', user.id),
// Missing: .eq('is_active', true)
```

**Suggested disposition:** AUTONOMOUS-FIXABLE

---

### [Severity: MEDIUM]

#### L07-003 — Kid trial COPPA consent metadata written in unguarded race

**File:line:** `web/src/app/api/kids/trial/route.js:92-126 + schema/017_phase9_family.sql:47-52`

**What's wrong:** The RPC inserts the kid with `coppa_consent_given = true` but metadata lacks the consent object (lines 47-52 of schema/017). The route then reads metadata, merges consent details, and updates (lines 103-126 of route.js). Between insert and update, the kid profile exists with an incomplete consent record. If the update fails, the profile has `coppa_consent_given = true` but metadata lacks parent_name, accepted_at, and IP needed for audit/verification.

**Lens applied:** COPPA compliance and consent-record atomicity. Parental consent must be complete and verified before a kid can be paired.

**New vs Round 1:** NEW

**Evidence:**
```sql
-- schema/017_phase9_family.sql lines 47-52 — metadata empty
INSERT INTO kid_profiles (...) VALUES (..., true, now(), jsonb_build_object('trial', true))
-- coppa_consent key is absent
```

```javascript
// route.js lines 117-126 — separate, unguarded UPDATE
const merged = { ...(fresh?.metadata || {}), coppa_consent: {...} };
await service.from('kid_profiles').update({ metadata: merged, coppa_consent_given: true, ... }).eq('id', kidId);
```

**Suggested disposition:** OWNER-INPUT — either move the metadata write into the RPC (atomic insert), or add a validation before pairing that blocks if consent metadata is missing.

---

#### L07-004 — `kid_pair_codes` table unbounded growth; no TTL cleanup

**File:line:** `schema/095_kid_pair_codes_2026_04_19.sql:16-31`

**What's wrong:** The table stores every generated code with `expires_at = now() + 15min`. The redeem RPC checks expiry but does not delete expired rows. No cron or cleanup function exists. Over time, millions of expired codes accumulate, causing table bloat. The index `kid_pair_codes_live_idx` (WHERE used_at IS NULL) becomes less effective.

**Lens applied:** Operational sustainability. Table bloat slows the `FOR UPDATE` lock on redeem (schema/095:160) as PostgreSQL must scan more rows.

**New vs Round 1:** NEW

**Evidence:**
```sql
-- schema/095, lines 16-31 — table definition
CREATE TABLE IF NOT EXISTS public.kid_pair_codes (
    code             TEXT PRIMARY KEY,
    parent_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    kid_profile_id   UUID NOT NULL REFERENCES public.kid_profiles(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL,
    used_at          TIMESTAMPTZ,
    used_by_device   TEXT
);

-- No cleanup anywhere in schema or cron jobs
```

**Suggested disposition:** POLISH — add a cron job to delete rows where `expires_at < now() - interval '7 days'` nightly, or accept table bloat if pair-code generation is low-volume.

---

## OUTSIDE MY LENS

- **L19-rateLimit:** Kids global-leaderboard opt-in toggle gating; client-side permission check but no explicit rate-limit. → Scope: rate-limiting lens, not parent-kids-mgmt.
- **L09-iosSync:** FamilyDashboardView hardcodes plan→kid-cap mapping in Swift (FamilyViews.swift:45–51), duplicating database logic; drifts if DB changes without app redeploy. → Scope: client cache staleness, not this lens.

