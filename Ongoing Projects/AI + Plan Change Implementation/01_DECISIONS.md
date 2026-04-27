# Locked Decisions

Source of truth for what's been agreed in planning. Apply, never re-debate.

---

## Pricing — LOCKED

| Plan | Monthly | Annual | Reach |
|---|---|---|---|
| Free | $0 | — | 1 reader, daily article cap, ad-supported (web + adult iOS) |
| Verity | **$7.99** | **$79.99** | 1 adult, unlimited reading, bookmarks, comments |
| Verity Family | **$14.99** | **$149.99** | 6-seat household pool, 1 kid included, parent dashboard, kid app |
| + Extra kid seat | **+$4.99/mo** | **+$49.99/yr** | Stackable up to 4 kids total |

- **Verity Pro retired — Option B (auto-migrate at next renewal).** Existing subscribers stay on Pro until next renewal date, then automatically migrate to Verity at $7.99 (lower price). 30-day advance email notification. Apple Pro users get in-app banner asking them to manually switch (Apple doesn't allow programmatic plan-switch the same way).
- **Verity Family XL retired permanently.** Per-kid add-on replaces it. Drop all iOS code references. Don't revisit.
- **Annual = ~10× monthly.** Standard discount across all tiers.
- **Apply for Apple Small Business Program before launch** to lock in 15% Apple cut from day one (vs 30% standard).

## Plan structure

- **Free** = ad-supported, daily article cap (~5/mo metered, NYT pattern). Web + adult iOS only. Kid app is never on Free.
- **Verity** = 1 adult, full content access.
- **Family** = 6-seat household pool. 2 adults + 1 kid baseline. Adult seats flex up to 6 (e.g., as kids graduate). Kid sub-cap at 4. Adding kid #2-#4 costs +$4.99/mo each.
- **No Duo tier.** Couples without kids should buy 2× Verity solo.
- **No more than 4 kids per household.** Beyond 4 = contact support, manual case.

## Family seat math

- Total pool size: 6 seats
- Kid sub-cap: 4 seats max
- Adult flex: any unused seats (post-graduation) become adult seats
- **Graduations are net-zero seat events.** Kid seat frees, adult seat fills, household count unchanged. If parent had paid for an extra kid seat, bill drops by $4.99/mo automatically when that kid graduates.
- **Plan downgrades that orphan kids: gated.** Hard stop until parent removes profiles.

## Age banding

| Band | Ages | Lives in |
|---|---|---|
| Kids | 7-9 | Kids iOS app |
| Tweens | 10-12 | Kids iOS app |
| Graduated | 13+ | Adult iOS app + web (new adult account) |

- DOB is captured at kid-profile creation (already in `kid_profiles.date_of_birth`).
- `reading_band` is **system-derived from DOB, never user-set.**
- Kid profiles support ages 3-12 today (DOB validation in `api/kids/route.js`). Reading content is band-gated starting at 7. Ages 3-6 see a curated kids-band feed (or get a "your child is too young to read" message — owner decision).
- **Ratchet-only progression.** Never reverts. Once tweens, never kids again. Once graduated, kid profile retired permanently.

## DOB policy (COPPA-defensible)

- DOB locked after profile creation. Read-only field with "Was this entered incorrectly?" link.
- DB-level trigger blocks `UPDATE` to `date_of_birth` outside the admin override RPC.
- **Corrections via in-product request form** (not email, not direct edit).
- **One correction per kid profile lifetime.**
- **Younger-band corrections:** 7-day cooldown, then auto-approve unless fraud signals fire (escalates to manual).
- **Older-band corrections:** require birth-certificate documentation, always manual review, never auto-approved.
- **Maximum 3-year DOB shift** per correction.
- **Corrections cannot trigger graduation.** Graduation must go through the natural birthday-prompt flow.
- **Kids are not notified** of corrections to their own profile.
- **Documentation uploads encrypted at rest, auto-purged 90 days post-decision.**
- Audit trail: `kid_dob_history` table, append-only.

## Graduation flow

- Parent-triggered (auto-prompt at 13th birthday, or earlier if parent advances manually).
- Parent enters email + temp password (or "claim your account" link) for new adult account.
- New adult account created in `auth.users`, linked to family.
- **Categories carry over** from kid profile to adult preferences.
- **Saves, streaks, scores, reading_log do NOT carry** to adult account. They stay attached to the soft-deleted kid profile (preserved for audit).
- **Within kid app, advances kids→tweens preserve everything.** Only graduation resets.
- Kid PIN credentials revoked. `kid_sessions` revoked.
- Kid profile soft-deleted (`is_active=false`), not hard-deleted.

## kid_articles vs articles split

- **Path A locked: kill `kid_articles`.** And kill `kid_sources`, `kid_timelines`, `kid_quizzes`, `kid_discovery_items` (zero rows each).
- Source of truth for kid content: `articles` table with `is_kids_safe=true` + `kids_summary` + `age_band`.
- `persist_generated_article` RPC rewritten to write all audiences into `articles`.
- RLS on `articles` enforces kid visibility based on `reading_band` + `age_band`.

## Pipeline (banded generation)

- Adult clusters: 1 article output (unchanged).
- Kid-safe clusters: **2 article outputs** — `age_band='kids'` + `age_band='tweens'`.
- Adult-only clusters: 0 kid output.
- Cost roughly 2× per kid cluster (acceptable per owner).
- 6 new prompts in `editorial-guide.ts`: `KIDS_*` and `TWEENS_*` versions of HEADLINE / TIMELINE / QUIZ / ARTICLE prompts.
- Existing `KID_*` prompt constants retired.
- Pass A prompt-vs-schema fixes ship first, before any banded work.

## Categories

- Single taxonomy. Kid-safe categories flagged via `categories.is_kids_safe`.
- **Drop the `(Kids)` variants** (`Science (Kids)`, `World (Kids)`, etc.). Reparent any rows referencing them to the non-`(Kids)` version, then delete the variant rows.
- 13 of 66 categories have prompts in `CATEGORY_PROMPTS`. Remaining ~50 fall through to generic. Coverage backfill is a **separate** non-blocking project.

## User states (not plans, separate axis)

- **Anon** — no account, browsed via cookie. Daily metered paywall. Can't bookmark/comment.
- **Unverified** — account created, email not yet confirmed. Read but can't comment/bookmark.
- **Verified Free** — full free-tier access. Subject to metered paywall.
- **Subscriber** — plan-determined access.

These gate **independently** of plan tier. (Verified Free is still on `free` plan; Anon has no plan.)

## Ads

- **Adult web Free + adult iOS Free:** ad-supported via AdSense (web) + AdMob (iOS).
- **Kid app:** never ad-supported. COPPA-defensible.
- **Subscribers (any tier):** no ads anywhere.
- **AdSense application before launch.** Approval lag is weeks-to-months.

## Cross-platform billing rules

- **One subscription per user.** If user has Stripe sub, can't add Apple sub (and vice versa). Block second-sub attempts with clear messaging.
- **Edit seats on the platform that owns the sub.** iOS-subscribed family edits in iOS. Web-subscribed family edits in web. Don't cross-write.
- **Cancellation:** managed on the platform that issued the sub. Stripe cancels in web. Apple cancels in App Store settings.
- **Refunds:** for accidental seat add-ons, 7-day grace via support. Apple-billed refunds go through Apple. Stripe-billed refunds initiated by support, prorated automatically.

---

## Decisions still owed (block Phase 2+)

1. ~~Verity Pro grandfather: auto-migrate or hold-and-lock?~~ **LOCKED 2026-04-26: Option B (auto-migrate at next renewal).**
2. Stripe + Apple dual-sub: block, prefer one, or warn?
3. Free metered paywall threshold (5/mo? 10/mo? different for anon vs verified?)
4. Ages 3-6 kid app behavior (gate out, or curated kids-band feed)?
5. Refund policy for accidental seat additions (7-day grace, or platform-handled?)
6. Edit-seats-on-owning-platform restriction (recommended yes)
7. Family-tier-required permission name (e.g. `family.kids.manage`) and which existing permissions need plan-tier gating

Decisions 2-7 are tagged in the relevant phase docs as **OPEN** so they don't block early phases.

---

## Decisions definitively NOT being made

- **No Duo tier** between Verity solo and Family.
- **No Verity Family XL** — per-kid add-on replaces it. **Locked 2026-04-26, do not revisit.**
- **No DOB self-edit UI** — request form only.
- **No tween-only kid generation** — every kid-safe cluster generates BOTH kids + tweens.
- **No reverse band advances** (graduated → tweens → kids forbidden by trigger).
- **No data carry from kid → adult account** beyond categories.
- **Pricing locked 2026-04-26:** $7.99 Verity / $14.99 Family / $4.99 per extra kid. Do not revisit at this stage.
