# AI + Plan Change Implementation

Master plan for two intertwined initiatives:
1. **AI pipeline fix** — unblock generation (Pass A) + add age-banded kid generation
2. **Plan structure rewrite** — collapse to Free / Verity / Family + per-kid add-ons; introduce age-banded reading_band + COPPA-defensible DOB policy

Both touch the same surfaces (kid_profiles, family billing, kid app, parent dashboard) so they're planned together.

---

## Documents in this directory

| # | File | Covers |
|---|---|---|
| 00 | `00_INDEX.md` | This file — overview + navigation |
| 01 | `01_DECISIONS.md` | Every locked decision from the planning conversation |
| 02 | `02_DATABASE.md` | All schema changes, migrations, triggers, RPC rewrites, RLS |
| 03 | `03_PAYMENTS.md` | Stripe (web) + Apple StoreKit (iOS) + reconciliation, plan-table changes |
| 04 | `04_PIPELINE.md` | Pass A prompt fixes + banded generation chain |
| 05 | `05_WEB.md` | Every web page that changes (paywall, profile, family, admin) |
| 06 | `06_IOS.md` | Every iOS screen across both apps (VerityPost + VerityPostKids) |
| 07 | `07_ADMIN.md` | Admin tools: newsroom band UI, DOB-correction queue, plan migrations |
| 08 | `08_FLOWS.md` | Graduation, DOB correction, band advance, downgrade gating, signup |
| 09 | `09_SCENARIOS.md` | Every edge case: divorce, custody change, plan downgrade, refunds, etc. |
| 10 | `10_ROLLOUT.md` | Order of operations, testing plan, rollback, comms |

---

## TL;DR — what's actually shipping

### Phase 0: Pass A (Day 1 morning, ships first)
Fix the prompt-vs-schema bugs that have left generation 0/5 successful in 90 days. Files: `web/src/lib/pipeline/editorial-guide.ts`, `web/src/app/api/admin/pipeline/generate/route.ts`. Pure prompt + Zod edits, no DB or UI changes. Unblocks the pipeline.

### Phase 1: kid_articles consolidation (Day 1 PM - Day 2)
Drop dead `kid_articles`/`kid_sources`/`kid_timelines`/`kid_quizzes`/`kid_discovery_items` tables (zero rows in any). Rewrite `persist_generated_article` RPC to write kid runs into `articles` with `is_kids_safe=true`. Aligns the pipeline with what the iOS app and admin tool already use as source of truth.

### Phase 2: Plan structure rewrite (Day 2-4)
Retire Verity Pro tier (grandfather existing). Verity solo $7.99/mo. Verity Family $14.99/mo with 1 kid included, $4.99/mo per extra kid up to 4. Update Stripe products, Apple StoreKit subscription group, plan table, all pricing UI. **Owner-side setup runs in parallel.**

### Phase 3: Age banding (Day 4-7)
Add `reading_band` to `kid_profiles` (kids 7-9 / tweens 10-12 / graduated 13+). Add `age_band` to `articles`. RLS keyed off bands. Pipeline generates two articles per kid cluster (kids voice + tweens voice). Kid iOS app filters by band.

### Phase 4: DOB-correction request system (Day 5-7, parallel with Phase 3)
In-product correction request form. Auto-rejects older-band moves. Younger-band moves: 7-day cooldown, auto-approve unless fraud signals. Admin queue with full household context. Audit trail. One correction per kid lifetime.

### Phase 5: Graduation + parent flows (Day 7-10)
Birthday-prompt cron. Manual band-advance UI. Adult-account creation at graduation (parent enters email). Net-zero seat math. Categories carry over, nothing else.

### Phase 6: Admin polish + testing (Day 10-12)
Plan-comparison page, DOB queue, banded kid editor, full rollout testing.

**Total: ~12 working days dev side, no soak windows. Calendar depends on owner setup speed (Apple SKUs, Stripe products, AdSense application). Realistic ship: 2-3 weeks.**

---

## Decisions not yet made (still owed)

Locked 2026-04-26:
- ✅ **Pricing:** $7.99 Verity / $14.99 Family / $4.99 extra kid (monthly). Annual is ~10× monthly.
- ✅ **Verity Family XL:** dropped permanently. Per-kid model replaces.
- ✅ **Verity Pro grandfather:** Option B — auto-migrate Stripe Pro subs to Verity at next renewal (with 30-day notification). Apple Pro users get in-app prompt to manually switch.

Still need decisions before Phase 5:
1. **Stripe → Apple sub conflicts** — block, prefer one, or warn? (Recommended: block second sub on platform with "manage on other platform" message)
2. **Family seat editing platform restriction** — confirm "edit on owning platform only"? (Yes recommended)
3. **AdSense + AdMob coverage** — Free tier only on web + adult iOS, never kid app. Confirm.
4. **Free-tier metered paywall threshold** — 5 articles/mo? 10? Different for anon vs verified?
5. **Ages 3-6 kid app behavior** — gate out, or curated kids-band feed?
6. **Refund policy** — 7-day grace, immediate prorated refund, or platform-handled only?
7. **Trial period at launch** — yes 7-day, no trial, or other?
8. **Stripe Customer Portal scope** — allow whitelisted plan changes, or disable plan changes entirely?

---

## Read order

If reviewing this for the first time:
1. `01_DECISIONS.md` — what's already settled
2. `10_ROLLOUT.md` — when each phase ships and in what order
3. `09_SCENARIOS.md` — what could go wrong
4. Detail docs (02-08) on demand

If implementing a phase:
1. `01_DECISIONS.md` for the principles
2. The phase's primary doc (02-08)
3. `10_ROLLOUT.md` for the testing/rollback procedure for that phase
