# Web changes

Every Next.js page, API route, and component that has to change. Grouped by surface.

---

## Public marketing surfaces

### `/pricing` (or wherever the public plan comparison lives)
Currently displays plan cards. Updates:
- 3 plan cards: Free / Verity / Family (drop Pro, drop Family XL)
- Family card shows "+$4.99/mo per additional kid (up to 4 kids)" inline
- Annual toggle on the page
- Verify file path — likely `web/src/app/pricing/page.tsx` or `/plans/page.tsx`

### `/r/[code]` (referral landing)
No structural change, but verify: referral codes that grant "Pro" become "Verity" post-migration. Update copy + the underlying plan grant.

### Paywall component
Likely at `web/src/components/paywall/...` or inline in story page. Updates:
- Show 2 paid options (Verity + Family), not 3
- Family card includes "Includes 1 kid; add more for $4.99/mo"
- CTA goes to checkout, not Stripe Customer Portal

---

## Auth + onboarding

### Signup page
`web/src/app/signup/page.tsx` (or similar). Two paths to add:
- Standard signup: existing flow, defaults to Free tier
- **Graduated kid signup:** new path triggered by deep link from kid app. URL contains a one-time graduation token. Page validates token, pre-fills display name, asks for email + password. On success, links new user to family group.

New endpoint: `web/src/app/api/auth/graduate-kid/claim/route.ts`
- Validates graduation token
- Creates `auth.users` row
- Links to family
- Copies categories from kid profile to new user prefs
- Marks kid profile `is_active=false, reading_band='graduated'`
- Returns adult user session

### Email verification
`web/src/app/api/auth/verify/route.ts` (or similar — verify file path). Update post-verification redirect to respect plan + family context.

### Login
No major changes. Just verify that login of a graduated kid's adult account works (it's a normal adult account at that point).

---

## Profile section

### `/profile` (root)
`web/src/app/profile/page.tsx`. Already exists. Minor updates:
- Show plan name + renewal date
- Surface "you have N kids on family plan" if applicable
- Link to family settings if Family tier

### `/profile/family`
`web/src/app/profile/family/page.tsx`. Major updates:
- For each kid: show display name, current `reading_band`, age, last active
- "Advance to Tweens" CTA if currently kids-band AND age >= 10 OR parent wants to early-advance
- "Move to adult app" CTA if currently tweens-band AND age >= 13
- Birthday-prompt banner if cron flagged this household
- Add-kid CTA shows "$4.99/mo more" if at extra-kid threshold
- Seat counter: "Family seats: N of 6 used. M kids of 4 max."

### `/profile/kids` (list)
`web/src/app/profile/kids/page.tsx`. Updates:
- DOB field is mandatory at create (already enforced)
- After create, DOB shows read-only with "Was this entered incorrectly?" link → DOB correction request modal
- Kid card shows current `reading_band` + age in years
- "Add another kid" button: if at `included_kids` limit, shows "$4.99/mo will be added to your subscription"

### `/profile/kids/[id]` (detail + edit)
`web/src/app/profile/kids/[id]/page.tsx`. Major updates:
- DOB read-only (was editable — `[id]/route.js` allowlist drops `date_of_birth`)
- "Was this entered incorrectly?" link → opens DOB correction request form
- Reading band display (`Kids 7-9` / `Tweens 10-12`)
- "Advance band" CTA (if eligible)
- "Move to adult app" CTA (if 13+)
- Reading history (already there — verify it works post-band-add)
- Streaks, scores, achievements (already there)
- Delete kid profile (already there — verify it triggers seat-decrement on Stripe/Apple)

### `/profile/settings/billing`
`web/src/app/profile/settings/billing/page.tsx`. Major updates:
- Show current plan with full price breakdown:
  ```
  Verity Family — Monthly
  Base: $14.99
  Extra kids: 2 × $4.99 = $9.98
  Total: $24.97/mo
  Next billing: 2026-05-15
  ```
- "Update payment method" → Stripe Customer Portal (web) or App Store settings (iOS sub redirected)
- "Cancel subscription" → platform-appropriate flow
- Show platform indicator: "Billed via Stripe" or "Billed via Apple"
- Disable plan-change buttons if platform mismatch (e.g., iOS sub on web → "Manage in App Store settings")

### `/profile/settings/profile`
Profile prefs. Categories selection. Verify post-graduation that a new adult account starts with the carried-over categories selected.

### `/profile/settings/feed`
Feed prefs. No structural change.

### `/profile/settings/supervisor`
Parent settings. Verify it doesn't gate by old `age_range` enum.

---

## DOB correction request flow

### Parent-side form
Modal triggered from `/profile/kids/[id]/page.tsx` and the iOS equivalent. Component lives at:
`web/src/components/family/DobCorrectionRequest.tsx` (NEW)

Form fields:
- Current DOB (read-only display)
- Requested DOB (date picker, validates 3-12 age range)
- Reason (textarea, 10-280 chars, required)
- Documentation upload (only required if requested DOB → older band)

Preview block:
- "Your child's reading band will change from `<current>` to `<resulting>`"
- "Their saves, streaks, and quiz scores will not change"
- For older-band moves: "We require birth-certificate documentation for corrections to an older reading band"

Submit → POST to `/api/kids/[id]/dob-correction`

### API: `web/src/app/api/kids/[id]/dob-correction/route.ts` (NEW)
- POST: insert pending request (or auto-reject if older-band without docs)
- GET: list this kid's request history (parent-scoped)

### API: `web/src/app/api/kids/[id]/dob-correction/upload/route.ts` (NEW)
- POST: accept doc upload → encrypted storage → return URL to attach to request

---

## Family seat management

### `/profile/family/seats` (NEW page or section)
Visual seat grid:
```
[ Adults: 1 of 6 used ] [ Kids: 2 of 4 used ]

[ Avatar 1 - Parent ] [ + Add adult ]
[ Avatar 2 - Kid 1 ] [ Avatar 3 - Kid 2 ] [ + Add kid ($4.99/mo) ]
```

Add adult: invite flow (existing? verify in `family/`)
Add kid: existing create-kid form, but with seat-charge confirmation modal

API: existing `/api/kids` (POST) + new seat-update endpoint:
`web/src/app/api/family/seats/route.ts` (NEW)
- POST: change seat count → triggers Stripe quantity update OR Apple SKU upgrade
- GET: current seats + paid seats

---

## Bookmark / saves / comments

No structural changes for the plan rewrite, but:
- Permission gate on `comments.create` now checks plan tier (Free can't comment)
- Bookmark cap on Free tier already exists (`max_bookmarks: 10` in plan metadata) — verify enforcement at API level

---

## API endpoint changes (full list)

### Updates to existing endpoints

| File | Change |
|---|---|
| `web/src/app/api/kids/route.js` | Already validates DOB 3-12. Add: check `kid_seats_paid >= current_kid_count + 1` before allowing create. Fail with 402 (Payment Required) if over seat. |
| `web/src/app/api/kids/[id]/route.js` | Remove `'date_of_birth'` from `allowed[]` allowlist. DOB updates only via admin RPC. |
| `web/src/app/api/family/config/route.js` | Drop `verity_family_xl: 4` default. Add `extra_kid_price_cents` to response. |
| `web/src/app/api/admin/referrals/mint/route.ts` | Update tier the referral grants ("Pro" → "Verity") |
| `web/src/app/api/webhooks/stripe/route.ts` | Handle subscription `items.quantity` changes, write to `kid_seats_paid` |
| `web/src/app/api/webhooks/apple/route.ts` | Handle SKU upgrades/downgrades within Family group, infer kid count from product ID |

### New endpoints

| File | Purpose |
|---|---|
| `web/src/app/api/kids/[id]/dob-correction/route.ts` | POST request, GET history |
| `web/src/app/api/kids/[id]/dob-correction/upload/route.ts` | Doc upload for older-band requests |
| `web/src/app/api/kids/[id]/advance-band/route.ts` | POST `{to: 'tweens' | 'graduated'}` — manual band advance |
| `web/src/app/api/auth/graduate-kid/claim/route.ts` | Adult account creation from graduation token |
| `web/src/app/api/family/seats/route.ts` | GET seat counts, POST seat changes |
| `web/src/app/api/cron/birthday-band-check/route.ts` | Daily cron — flag families for band-advance prompts |
| `web/src/app/api/cron/dob-correction-cooldown/route.ts` | Daily cron — auto-approve cooldown'd younger-band requests |
| `web/src/app/api/admin/kids-dob-corrections/route.ts` | Admin queue list |
| `web/src/app/api/admin/kids-dob-corrections/[id]/route.ts` | Admin approve/reject |

### Endpoints to deprecate
None. Existing endpoints stay; behavior augments.

---

## CRON jobs

| Cron | Schedule | Job |
|---|---|---|
| `birthday-band-check` | Daily at 03:00 UTC | For each active kid_profile, check if age has crossed a band boundary and the band hasn't been advanced. Insert parent notification. |
| `dob-correction-cooldown` | Daily at 03:30 UTC | For each `kid_dob_correction_requests` row in `pending` status with younger-band move and age >= 7 days, auto-approve. |
| `pipeline-cleanup` | Existing | Update to drop kid_articles handling post-M2 |

Add to `vercel.json` or wherever cron config lives.

---

## Email templates

New transactional emails:

| Template | Trigger |
|---|---|
| `dob_correction_received` | Parent submits DOB correction request |
| `dob_correction_approved` | Admin approves OR cooldown auto-approves |
| `dob_correction_rejected` | Admin rejects |
| `dob_correction_documentation_requested` | Admin asks for docs |
| `band_advance_birthday_prompt` | Cron detects band boundary crossed |
| `kid_graduation_account_created` | Parent triggers graduation; adult account ready |
| `family_seat_added` | Stripe webhook confirms extra-kid charge |
| `family_seat_removed` | Kid removed; bill drops next cycle |
| `verity_pro_migration` (one-time) | Migrating Pro subscribers to Verity at next renewal |

Templates live in `web/src/app/api/email/templates/...` or wherever the existing transactional email infra is. Verify path before writing.

---

## Subscription state UI integration

The subscription state appears in many places. Inventory of where it's read:

| File | What it reads | Update needed |
|---|---|---|
| `web/src/app/profile/page.tsx` | Plan name + tier | Show new tiers |
| `web/src/app/profile/settings/billing/page.tsx` | Full subscription state | Show seat count + per-seat breakdown |
| `web/src/app/admin/access-requests/...` | User plan | No change |
| `web/src/lib/permission/...` (or `compute_effective_perms` consumer) | Plan tier for permission gating | Verify Family permission keys honored |
| Header / nav components | Plan badge | Show "Verity" / "Family" badge if applicable |

---

## Error pages

When the user hits a paywalled feature without sufficient plan:
- Soft paywall: feature disabled, banner shows "Upgrade to Verity / Family for this feature"
- Hard paywall (kid app access): redirect to `/profile/family/upgrade` with a CTA explaining Family is required

`web/src/app/upgrade/page.tsx` (NEW or existing) — landing page for paywall traffic showing the 3-plan comparison.

---

## Static content updates

Marketing pages, FAQ, T&C, Privacy:

- `/about`, `/help`, `/faq`, `/terms`, `/privacy` — search for any references to "Verity Pro" → "Verity" rename. Some references will point at retired tier; update copy.
- COPPA disclosures: should already mention DOB collection + parental consent. Update to mention DOB-correction request process.
- Refund / cancellation policy: update to match new policy in `03_PAYMENTS.md`

---

## Sitemap + SEO

- New `/pricing` page (if redesigned) needs sitemap entry
- Old `/pro` or similar URLs that referenced Pro tier should 301 to `/verity` or `/pricing`
- Schema.org `Product` markup for plans should reflect new prices

---

## Lift estimate (web only)

| Area | Hours |
|---|---|
| Public pricing + paywall + signup updates | 6 |
| Profile + family + kids pages | 10 |
| DOB correction form + upload | 6 |
| Family seat management UI | 6 |
| Billing page rewrite | 4 |
| API route updates + new routes | 10 |
| Cron jobs | 4 |
| Email templates | 4 |
| Static content + SEO | 3 |
| Subscription webhook handlers | 6 |
| **Web total** | **~60 hours** |

That's about 1.5 weeks of pure web work, in parallel with iOS work and DB migrations.
