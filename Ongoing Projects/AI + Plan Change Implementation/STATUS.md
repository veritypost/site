# AI + Plan Change Implementation — Project Status

Last updated: 2026-04-27

## Verdict

Functionally complete + type-clean. **NOT production-ready end-to-end** until the items below close.

## What's solid

- All 6 phases shipped: DB schema, prompts, banding, DOB correction, graduation, polish
- 4-agent pre-impl + post-impl review pattern executed end-to-end; F1 (HIGH) and F2 (MEDIUM) remediated
- Web `tsc --noEmit` clean (excluding pre-existing `redesign/` work stream)
- Both iOS targets `xcodebuild ** BUILD SUCCEEDED **` (adult + kids)
- 218-checkbox EXECUTE.md sweep verified against live DB state via MCP

## Blockers before production

### 1. Phase 6b migration UNAPPLIED — regressive until applied
- File: `Ongoing Projects/migrations/2026-04-27_phase6b_add_kid_idempotency_table.sql`
- Creates `add_kid_idempotency` table that the F1 fix depends on
- Until applied, `/api/family/add-kid-with-seat` will 500 on first INSERT
- Apply via Supabase SQL editor, then regen types: `npx supabase gen types typescript`
- After regen, the `IdemTableClient` cast in `web/src/app/api/family/add-kid-with-seat/route.ts` can come out

### 2. No live testing
Every flow verified by code reading, type-check, and `xcodebuild` only — never exercised against a real session. Untested paths:
- Graduation token claim (web `/welcome?graduation_token=...`)
- Birthday banner appearing AND clearing after parent acts
- 402 upsell modal full flow (Stripe sandbox)
- Add-kid + seat-bump rollback (Stripe insert success → kid_profiles failure)
- Kids-app graduation handoff (in-session detection + foreground detection + launch detection)
- DOB correction request → admin queue → approve → cooldown lifecycle

Recommendation: one full staging pass on each before declaring done.

### 3. Owner-blocked items (18 in EXECUTE.md)
Not blocking for code, blocking for traffic:
- Apple Small Business Program enrollment
- Apple SKUs in App Store Connect (10 SKUs: solo + family 1-4 kids × monthly/annual)
- Stripe products + prices with `metadata.seat_role` ('family_base' / 'extra_kid')
- `STRIPE_VERITY_FAMILY_EXTRA_KID_PRICE_ID` env var (route enters dry-run without it)
- AdSense + AdMob applications
- Email send infra decision (graduation email, DOB-correction outcome notifications)
- DOB documentation upload mechanism decision
- Free-tier paywall threshold

### 4. Type regeneration pending
After Phase 6b applies, run type regen so `IdemTableClient` cast can be deleted.

## Migrations applied

- Phase 1 (kid_articles drop) ✓
- Phase 2 (plan structure rewrite) ✓
- Phase 3 (age banding) ✓
- Phase 4 (DOB correction infra) ✓
- Phase 5 (graduation flow) ✓
- Phase 6 (birthday_prompt_at clearing) ✓ (applied via SQL editor)
- Phase 6b (add_kid_idempotency table) ✗ **PENDING**

## Open polish (non-blocking)

- F3 (LOW) — `set_config('app.dob_admin_override', '', true)` could use `null` for clarity; transaction-scoped so harmless today
- F4 (LOW) — `PairingClient.probeGraduationDisplayName()` swallows the 401 path silently; theoretical edge case (would only bite if a future JWT denylist landed server-side)
- Reconcile cron + add_kid_with_seat: kid_profiles row is NOT reconciled if local insert succeeded but kid_seats_paid update failed (currently logs only)

## Files of record

- This file: `Ongoing Projects/AI + Plan Change Implementation/STATUS.md`
- Execution checklist: `Ongoing Projects/AI + Plan Change Implementation/EXECUTE.md`
- Migrations: `Ongoing Projects/migrations/2026-04-27_phase{1-5,6,6b}_*.sql`
