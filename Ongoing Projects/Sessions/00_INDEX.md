# Sessions — TODO + TODO2 split into 10 hermetic parallel sessions

Created: 2026-04-27.

Each session below is **hermetic**: it owns a strict set of file paths. No two sessions edit the same file. 10 Claude Code instances can run in parallel against their session's TODO and never collide on git or on import contracts.

**Owner-locked decisions** referenced from these sessions live in `Ongoing Projects/OWNER-ANSWERS_READ_ONLY_HISTORICAL.md`. Each session reads but never edits OWNER-ANSWERS.

**Order of execution / dependencies:**
- **Session 1 (DB Migrations) and Session 2 (Cron) are foundation.** Other sessions can run in parallel with them. Owner applies S1 migrations as they land.
- Sessions 3–10 are independent; any can run before, during, or after any other.
- Items requiring cross-session coordination (e.g., a code change in S5 that depends on a new DB column from S1) are flagged with "Depends on Sx" inside that session's items list. Each dependent item gates its OWN ship on the upstream completing — the session itself doesn't block.

**Hermetic rules each session must follow:**
1. NEVER edit a file outside the owned-paths list. If a fix needs an off-domain edit, defer the item and flag it for the owning session.
2. Shared libs (anything in `web/src/lib/`) — only the session listed as owner edits the file. Others may import existing exports read-only. **Do not break public export shape** of any shared lib your session owns.
3. New shared lib files (e.g., `lib/rateLimits.ts`, `lib/cors.js`) are created by the session that needs them first; ownership passes to that session.
4. Run a final `grep -rn "<your-domain-keyword>" out-of-scope-paths` before shipping to verify no off-domain references slipped in.
5. Smoke-test in-scope only. Don't run cross-cutting tests that would invalidate other sessions' in-flight work.
6. Commit messages tagged `[Sx]` where x is the session number.
7. **Pre-flight per item.** Investigator agent re-greps every cited file:line in the item against current code before planner runs. Stale citations get corrected in-session. No item ships on a stale citation.

---

## Session map

| # | Name | Owns | Items |
|---|---|---|---|
| 1 | DB Migrations + RPCs | `Ongoing Projects/migrations/**` (SQL only) | 21 |
| 2 | Cron Routes + vercel.json | `web/src/app/api/cron/**`, `web/vercel.json`, `web/src/lib/cronLog.js`, `web/src/lib/cronAuth.js`, `web/src/lib/cronHeartbeat.js` | 6 |
| 3 | Auth + Account + Email + Login UI | `web/src/app/api/auth/**`, `web/src/app/api/account/**`, `web/src/app/api/access-request/**`, `web/src/app/api/access-redeem/**`, `web/src/middleware.js`, `web/src/lib/auth.js`, `web/src/lib/email.js`, `web/src/lib/betaApprovalEmail.ts`, `web/src/lib/accessRequestEmail.ts`, `web/src/lib/apiErrors.js`, `web/src/lib/siteUrl.js`, `web/src/lib/rateLimits.ts` (new), `web/src/lib/cors.js` (new), `web/src/app/login/**`, `web/src/app/signup/**`, `web/src/app/forgot-password/**`, `web/src/app/verify-email/**` | 16 |
| 4 | Billing / Stripe / Apple StoreKit | `web/src/app/api/stripe/**`, `web/src/app/api/billing/**`, `web/src/app/api/promo/**`, `web/src/app/api/ios/appstore/**`, `web/src/app/api/ios/subscriptions/**`, `web/src/app/api/family/**`, `web/src/app/billing/**`, `web/src/lib/stripe.js`, `web/src/lib/plans.js` | 9 |
| 5 | Social Surfaces (Comments/Votes/Reports/Notifications/Messages/DMs/Bookmarks/Follows) | `web/src/app/api/comments/**`, `web/src/app/api/reports/**`, `web/src/app/api/follows/**`, `web/src/app/api/messages/**`, `web/src/app/api/notifications/**`, `web/src/app/api/bookmarks/**`, `web/src/app/api/users/[id]/block/**`, `web/src/app/api/push/**`, `web/src/app/api/alerts/**` (new), `web/src/components/CommentRow.tsx`, `web/src/components/CommentThread.tsx`, `web/src/components/CommentComposer.tsx`, `web/src/lib/reportReasons.js`, `web/src/app/messages/**`, `web/src/app/notifications/**`, `web/src/app/bookmarks/**` | 14 |
| 6 | Admin + Pipeline + Newsroom | `web/src/app/admin/**`, `web/src/app/api/admin/**`, `web/src/app/api/expert/**`, `web/src/app/api/ai/**`, `web/src/app/api/newsroom/**`, `web/src/app/api/ads/**`, `web/src/app/api/events/**`, `web/src/app/api/support/**`, `web/src/app/api/settings/**`, `web/src/app/api/health/**`, `web/src/app/api/csp-report/**`, `web/src/app/api/errors/**`, `web/src/components/admin/**`, `web/src/lib/adminMutation.ts`, `web/src/lib/adminPalette.js`, `web/src/lib/pipeline/**`, `web/src/types/database.ts` | 24 |
| 7 | Public web (non-social, non-profile) | `web/src/app/about/`, `web/src/app/browse/`, `web/src/app/dmca/`, `web/src/app/help/`, `web/src/app/how-it-works/`, `web/src/app/ideas/`, `web/src/app/leaderboard/`, `web/src/app/recap/`, `web/src/app/story/[slug]/`, `web/src/app/search/`, `web/src/app/welcome/`, `web/src/app/contact/`, `web/src/app/appeal/`, `web/src/app/beta-locked/`, `web/src/app/request-access/`, `web/src/app/privacy/`, `web/src/app/terms/`, `web/src/app/pricing/`, `web/src/app/page.tsx`, `web/src/app/layout.js`, `web/src/app/manifest.js`, `web/src/app/NavWrapper.tsx`, `web/src/app/api/quiz/**`, `web/src/app/api/recap/**`, `web/src/components/*.tsx` (top-level only — see components carve-out below), `web/src/components/marketing/**` (new), `web/src/components/family/**`, `web/public/**` | 22 |
| 8 | Profile + Settings + Redesign + Public Profile | `web/src/app/profile/**`, `web/src/app/redesign/**`, `web/src/app/u/[username]/`, `web/src/components/profile/**` | 11 |
| 9 | iOS Adult App | `VerityPost/**` | 26 |
| 10 | iOS Kids App + Kids Server Routes | `VerityPostKids/**`, `web/src/app/api/kids/**`, `web/src/app/api/kids-waitlist/**`, `web/src/components/kids/**` | 22 |

---

## Cross-cutting items (intentionally split across sessions)

These items touch multiple file domains. Each session owns ONLY its slice.

| Item | Web slice | iOS slice | DB slice |
|---|---|---|---|
| Brand casing (A52, A53) — pick "Verity Post" + sweep | S7 | S9 (adult) + S10 (kids) | — |
| Banned timeline copy (A47) — "coming soon" / "we're working on it" purge | S7 (recap, profile-stub-pages, UnderConstruction.tsx) + S8 (profile/settings) | S9 (AlertsView.swift) | — |
| Per-tier color violation (A12) | S6 (admin/users palette) | S9 (ProfileView.swift) | S1 (`score_tiers.color_hex` column drop migration) |
| AI byline conflation + provenance pill (A13, A43, A44) | S7 (story/[slug] + how-it-works) | — | — |
| Magic-link AUTH-MIGRATION (Q2) | S3 (entire surface) | S9 (iOS half via API contract — call S3's new `/api/auth/send-magic-link`) | — |
| Cross-platform comment parity (A123–A126) | — | S9 | — |
| Kid JWT issuer flip (Q3b) — verdict RED, requires DB + middleware + RPC + iOS coordination | S3 (middleware + auth.js) | S10 (kids/pair + kids/refresh routes) | S1 (~25 RPC kid-reject migration + restrictive `users` insert/update RLS) |
| S8-T360 — CategoriesSection + MilestonesSection autonomous component build (blocker for S9-T358) | S8 (entire item) | — | — |

When an item depends on a peer session's work, the dependent slice waits for the upstream slice to land before shipping. Each session's items list flags its own dependencies.

---

## `web/src/components/` carve-out

S7 owns the top-level `web/src/components/*.tsx` files (excluding the three S5-owned Comment files) plus `web/src/components/marketing/` (new) and `web/src/components/family/` (family discovery is web-marketing scope). The component subtrees are split as follows:

| Subtree | Owner | Note |
|---|---|---|
| `web/src/components/*.tsx` (top-level only) | S7 | Excludes `CommentRow.tsx`, `CommentThread.tsx`, `CommentComposer.tsx` (→ S5) |
| `web/src/components/marketing/` | S7 | New directory; S7 creates as needed |
| `web/src/components/family/` | S7 | Currently `AddKidUpsellModal.tsx` only; family-discovery upsell scope |
| `web/src/components/admin/` | S6 | Admin chrome / palette components |
| `web/src/components/profile/` | S8 | Profile redesign components |
| `web/src/components/kids/` | S10 | `PairDeviceButton.tsx`, `OpenKidsAppButton.tsx`, `Badge.tsx` |
| `web/src/components/Comment*.tsx` | S5 | Three files: Row / Thread / Composer |

Verified subdir list as of 2026-04-27 via `find web/src/components -maxdepth 2 -type d`: `admin/`, `family/`, `kids/`, `profile/`. No additional subdirs missed.

---

## Shipping order (cross-session sequencing)

When two or more sessions touch the same workstream, the order below is mandatory. No parallel ships within a workstream.

### Q3b — kid JWT issuer flip
1. **S1** ships RPC kid-rejects (~25 RPCs) **and** users-RLS RESTRICTIVE policies for insert/update.
2. **THEN S3** ships middleware kid-blind fix and `kindAllowed` param wiring in `auth.js`.
3. **THEN S10** flips the issuer in `web/src/app/api/kids/pair/route.js` and `web/src/app/api/kids/refresh/route.js`.

No parallel work on this chain. Each step ships and is verified before the next starts.

### S1 → S2 RPC gate (push + email batch)
S1 must ship the following 4 RPCs **before** S2's send-push and send-emails redesign can ship. These are gating items inside S1:
- `claim_push_batch`
- `ack_push_batch`
- `claim_email_batch`
- `ack_email_batch`

S2 cron redesign of `/api/cron/send-push` and `/api/cron/send-emails` waits on all 4.

### S8-T357 → all UI sessions
S8-T357 (web profile redesign cutover) ships first. After T357 lands, the legacy paths `web/src/app/profile/page.tsx` and `web/src/app/profile/settings/page.tsx` are deleted. **No other session edits the legacy paths after T357** — any item targeting profile or settings UI must target the redesign tree.

---

## Shared-lib write contract

Some shared libs in `web/src/lib/` need cross-session reads (and occasional cross-session writes for additive-only changes). The owner-of-shape is fixed; cross-session edits are additive-only and must commit-tag the owning session.

| File | Shape owner | Cross-session write rule |
|---|---|---|
| `web/src/lib/rateLimits.ts` (new) | S3 | S4 / S5 / S6 MAY add new keys to the exported `RATE_LIMITS` record. They MUST NOT change the type signature, the `getRateLimit` helper, or any existing key's value. Cross-session edits commit-tag `[S3-shared]` regardless of which session ships. |
| `web/src/lib/cors.js` (new) | S3 | Same rules as `rateLimits.ts`. S3 owns the shape; additive-only writes from other sessions tag `[S3-shared]`. |
| `web/src/types/database.ts` | S6 | Regen-only. No other session regenerates. If a non-S6 session needs new types, S6 regens on their behalf and ships under `[S6-shared]`. |

---

## How to run a session

1. Pick a session file (`Session_01_DB_Migrations.md` etc).
2. Read it end-to-end — it is self-contained.
3. Execute items top to bottom. Each item is independently shippable.
4. Items marked **Owner Pending** wait on owner decisions in OWNER-ANSWERS_READ_ONLY_HISTORICAL.md (don't touch them; they're listed for completeness).
5. Items marked **Depends on Sx** wait on another session's specific deliverable (named in the item).
6. Use the batch-mode pattern from memory `feedback_batch_mode_4_parallel_implementers` when items can be parallelized within a session: 1 planner + N implementers + reviewer.
7. Tag commits `[Sx-Tnnn]` where Sx = session number, Tnnn = item id.
8. After each item ships, mark it ✅ in this index and in the session file.

---

## Items NOT included in any session (need owner decisions or are out-of-scope projects)

- **Q1 (tier collapse)** — DONE (see OWNER-ANSWERS_READ_ONLY_HISTORICAL.md Q1).
- **Q1b (verification gate banner-only)** — DECIDED but not implemented; requires permission-seed sweep + AccountStateBanner work spread across S6 (admin perms) + S7 (banner component) + S3 (auth flow).
- **Q2 (magic-link AUTH-MIGRATION)** — DECIDED, see split above.
- **Q3a (CSAM categories on iOS)** — DONE.
- **Q3b (kid JWT issuer flip)** — RED verdict from Phase-1 audit; requires DB + middleware + RPC + iOS coordination across S1, S3, S10. Listed inside those sessions as a coordinated workstream.
- **A28 / AR1 — Pipeline rewrite (AI-as-author → AI-assists-human-author)**. Multi-week project. Not in any session — needs separate planning. Schema work would land in S1; admin newsroom UI in S6; story-page provenance in S7; prompt rewrites in S6's pipeline lib. Bundle as a project, not as session items.
- **CC-3 (component dedup), CC-7 (design tokens), CC-19 (permission audit tool), CC-21 (naming drift), AR2 (kids unbundle), AR4 (audit-log unification)** — multi-week architectural cleanup projects. Not in any session.
- **A49 — GDPR / GA4 EU consent gate** — owner-blocked on Google Funding Choices publisher ID + snippet. Tracked in `TODO-PRE-LAUNCH.md` T2. Not a session gap; ships when owner provides the snippet. When it lands, the work touches `web/src/app/layout.js` (S7) + audit of `<script>` / `<iframe>` references across the app.
- **A54 — Verity Pro tier disposition** — partial cleanup landed in Q1 (legacy `verity_monthly`/`_annual` deleted, iOS labels collapsed to "Pro"). The remaining 3-option owner pick (rename SKU `verity_pro` → `verity` and collapse, surface Pro on /pricing as grandfathered, hide tier label entirely for non-grandfathered users) is parked as **Q5 in OWNER-ANSWERS_READ_ONLY_HISTORICAL.md** — pending owner answer.
- **Panel strategic items (§1–§8 from TODO_READ_ONLY_HISTORICAL.md)** — owner-decision territory; track separately.
- **Owner-side action items** — Stripe price archival, NCMEC ESP registration, Apple Developer console walkthrough, AdSense submission. Not engineering work; owner runs.

---

## Status legend

- 🟦 = item open
- 🟧 = owner decision pending
- 🟨 = depends on peer session
- 🟩 = shipped (commit hash recorded)
- 🟥 = blocked (reason in item)
