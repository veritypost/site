# db/02 — Ad-Free Tier Reconciliation

**Owner:** Dunford (positioning integrity), Lessin (tier feature alignment).
**Purpose:** Verity tier marketing implies ad-free; `plan_features` says `ad_free=false, reduced_ads=true` for Verity. Reconcile.
**Migration filename:** `schema/<next>_verity_ad_free_flip_2026_XX_XX.sql`

---

## Current state (verified 2026-04-21)

Query result:
```
verity_monthly / verity_annual: ad_free=false, reduced_ads=true
verity_pro_monthly / verity_pro_annual: ad_free=true
verity_family_*: ad_free=true
```

Ad-free starts at Verity Pro ($12.99/mo). The Verity tier ($6.99/mo) has reduced ads, not zero.

## The decision

This is a product decision — not purely DB. Two options:

### Option A: Verity tier becomes ad-free (flip the flag)

Marketing matches the DB. Move the "reduced ads" feature into Pro, which already has "ad-free." Verity tier gets:
- Ad-free reading.
- Unlimited bookmarks.
- Bookmarks collections.
- Basic features.

Verity Pro keeps: expert Q&A, advanced search, investigations archive, DM, etc.

This simplifies the pitch but leaves Pro with less differentiation.

### Option B: Keep Verity as reduced-ads, fix the marketing

Marketing stops saying "ad-free." Verity tier is "fewer ads"; Pro is "ad-free." More honest given current structure.

### Recommendation

**Option A.** The whole pitch becomes cleaner: "Verity Pro is for power readers (expert Q&A, archives, DMs). Verity is for everyone else who just wants ad-free news."

Execute:

```sql
UPDATE plan_features SET ad_free = true, reduced_ads = false
  WHERE plan_id IN (
    SELECT id FROM plans WHERE tier = 'verity'
  );
```

Verify:

```sql
SELECT p.name, pf.ad_free, pf.reduced_ads
  FROM plan_features pf
  JOIN plans p ON p.id = pf.plan_id
  WHERE p.tier IN ('free', 'verity', 'verity_pro');
```

Expected: free is false/false, verity is true/false, verity_pro is true/false.

## Callers

- `<Ad />` component — reads `plan_features.ad_free` via permissions (`ads.suppress` permission). Already permission-matrix-driven.
- `web/src/app/page.tsx`, `/story/[slug]/page.tsx` — render ads conditional on permission.
- `VerityPost/VerityPost/HomeView.swift`, `StoryDetailView.swift` — same.

No code changes required — permission matrix re-resolves.

## Bump `perms_global_version`

After the plan_features change, call:

```sql
SELECT bump_user_perms_version(NULL); -- bumps global version
```

This forces all connected clients to re-fetch permissions on next nav.

## Acceptance criteria

- [ ] `plan_features.ad_free = true` on all `verity` tier rows.
- [ ] `plan_features.reduced_ads = false` on `verity` tier rows.
- [ ] `perms_global_version` bumped.
- [ ] Visual check: a Verity-tier user navigating the site sees no ads.
- [ ] A free-tier user still sees ads.
- [ ] No paywall copy references "reduced ads" for Verity tier.

## Dependencies

Ship with `db/01_trials_add_to_plans.md` — same migration window, same Stripe/Apple coordination.
