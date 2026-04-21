# Remaining-items relationship map — FIX_SESSION_1 (2026-04-21)

Produced via 4-agent review flow (2 parallel investigators + serial reviewer + independent adversary).
Source: `/Users/veritypost/Desktop/verity-post/Current Projects/FIX_SESSION_1.md`.

**Scope:** 35 items not yet SHIPPED. Breakdown: 15 owner-immediate (00-A…00-O) · 14 dev items (#1-partial, #4, #6, #10, #11, #12, #13, #14, #15, #16, #17-TS, #18, #19, #20) · 6 features (F2–F7).

**Canonical numbering caveat:** FIX_SESSION_1 numbers items `#4/12/13/14/20` twice — once in the "UI — Design-system bundle" section (responsive, palette, font-scale, maxWidth, radius/avatar/shadow) and once in "Other fixes / Dev fixes" (touch-targets, icons, env-cleanup, reserved-usernames, ESLint). Every reference below disambiguates with a suffix when the base number is ambiguous.

---

## Shared-resource adjacency (the core map)

### Files that multiple remaining items edit

**`web/src/app/page.tsx`** (home feed) — highest-collision file
- **F4** wraps/removes breaking banner (697–722), deletes ad slots (858–862), restyles cards
- **#4** bumps touch targets at 422 (subcategory chipStyle), 590 ("All" pill)
- **Track A** (design-system responsive) injects Container/Grid wrapper, rewrites hardcoded maxWidths
- **F5** (post-F4) re-adds ad slots at 858–862 if monetization re-enabled
- **#11** (error-state polish) touches 225, 345, 350–353, 363–366 (silent feed errors)
- **#1-client** adds sibling layout.js for home metadata (deferred; home specifically skipped)

**`web/src/app/story/[slug]/page.tsx`** (article reader) — second-highest collision
- **F2** inserts ReadingReceipt.tsx around 939; extends ArticleQuiz.onPass signature (634)
- **F3** flips kill-switch at 939 `{false && (isDesktop || showMobileDiscussion)}`
- **F4** inherits card styling changes from F4's home restyle (shared token layer)
- **#4** bumps source-pill touch targets at 111
- **#11** (error-state) touches 326, 396, 409–411, 417–429

**`web/src/middleware.js`**
- **00-F** CSP enforce flip (159, 213, 223, 250)
- **#19** coming-soon holding page (166–197) — already wired, config-only
- **00-E** `PREVIEW_BYPASS_TOKEN` enables `#19`'s bypass route at `/preview?token=...`

**`web/src/app/layout.js`**
- **00-B** AdSense script load (153–160, conditional on `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`)
- **F5** inherits the same conditional loader
- **#12-icons** re-adds `icons` metadata block (cleaned in commit 434aba5)
- **00-F** needs nonce wiring here for CSP enforce flip (architectural blocker)

**`web/src/components/Ad.jsx`** + **`AdSenseSlot.tsx`**
- **00-B** gates dispatch at Ad.jsx:93 on `ad_network='google_adsense' && ad_network_unit_id && ADSENSE_PUBLISHER_ID`
- **F5** full ads system hangs off this same dispatch; IntersectionObserver viewability logging absent

**`web/src/app/signup/page.tsx`**
- **#11** has a **launch-critical sub-item** at 104–106: missing `res.status === 409` check creates duplicate auth users on retry. Not the full sweep, the single check. (Agent 4 elevated — #3 shipped a11y but did NOT include 409.)

**`web/tsconfig.json`**
- **#17-TS** flips `strict: true` + three `noUnused*`
- **#16** is hard prereq (19 `as any` in admin; concentrated in `admin/subscriptions/page.tsx`)

**`web/src/types/database.ts`** (8,900 lines, generated)
- **#16** feeds into it
- **F7** pipeline will regenerate once new columns added

**`web/vercel.json`**
- **00-A** adds Vercel-cron alternative to pg_cron if chosen (new route `api/cron/events-maintenance/route.ts`)
- **00-H** audits the 9 existing crons

**VerityPostKids/VerityPostKids/ParentalGateModal.swift**
- **#18** migrates UserDefaults → Keychain
- **F7** touches same Kids codebase if kids_* editorial flow added

### DB tables / RPCs that multiple items touch

- **`quiz_questions`** — 00-L (author ≥10 per article), F3 (read-only for `passed_readers_count` RPC)
- **`quiz_attempts`** — F3 new RPC `passed_readers_count` reads from here
- **`reading_log`** — F2 captures `time_spent_seconds`, currently posted to `/api/stories/read` but response ignored
- **`score_on_quiz_submit` RPC** — F2 needs response plumbed through `ArticleQuiz.onPass`
- **`score_events` + `reconcile_verity_scores`** — F6 materialized views / dashboards read from these
- **`ad_placements` / `ad_units` / `ad_campaigns` / `ad_impressions` / `ad_daily_stats`** — shared by 00-B, F5, F6
- **`serve_ad` RPC** — 00-B dispatch + F5 targeting logic (**schema/025 status unverified** — blocks F5/F6 scoping)
- **`events` partitioned table (schema/108)** — F6 reads for dashboards; 00-A (pg_cron) maintains partitions
- **`freeze_kid_trial` RPC** — 00-M adds notification branch; feeds kid-trial → Family conversion funnel
- **`reserved_usernames` + new `claim_mode` col + new `username_claim_requests` table + new `claim_reserved_username` RPC** — #14-reserved (all absent per MCP schema query)
- **`record_admin_action` RPC** — #15 adds calls across 23 admin routes; one "gold-standard" exemplar exists but agents did not identify the exact route (Agent 4 flagged as quality risk)
- **`discovery_items` / `discovery_groups` / `articles.historical_context` / `articles.kids_*` / `quizzes.is_kid` / `timelines.is_kid|is_current`** — F7 adds all of these

### Env vars + external accounts (overlap grid)

| Resource | Items |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` (truncated `.c` vs `.co`) | **00-C** — blocks everything until fixed |
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | **00-B** + **F5** + AdSense approval (external) |
| `NEXT_PUBLIC_SITE_MODE` + `PREVIEW_BYPASS_TOKEN` | **00-E** + **#19** (coming-soon holding page) |
| `SENTRY_DSN` + 4 more Sentry vars | **00-D** only, but mitigates **#11** error.js:9-19 / global-error.js:10-20 swallow |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | **00-G** + **00-K** (sequenced: K is quick, G is full audit) |
| `APNS_*` + `.p8` auth key + `apple-app-site-association` | **00-I** (Apple Dev enrollment) — also gates **#18** App Store submission |
| `HEALTH_CHECK_SECRET` | **00-E** only |
| `APPLE_ROOT_CA_DER_BASE64` | **00-E** only (file fallback in repo works) |
| GA4 API secret | **F6** Measurement Protocol server-side forwarding (not wired) |
| Vercel team membership | **00-J** must execute before **00-G / 00-H / 00-K** become trustworthy |

### Owner-decision gates (same decision affects multiple items)

- **Launch-phase aesthetic (quiet vs. monetized):** F4 vs F5 phasing (Agent 4 reframed — NOT a conflict, a phase decision; F4 pre-launch, F5 post-launch is the expected sequence)
- **Apple Developer enrollment:** gates **00-I** + **#18** + iOS half of **F7** kids pipeline editorial
- **AdSense approval (Google-side):** gates **00-B** + **F5** testing path
- **Kids editorial data model decision (F7 §12 D2):** single-row + kids_* columns vs. separate rows — affects F7 scope + kids editorial workflow + iOS content population
- **Bottom nav direction (#6):** owner design call, blocks `NavWrapper.tsx` + `ContentView.swift` + `TabBar.swift` edits
- **Reserved-usernames scope (#14-reserved):** SSA name list size, match policy, review-note field — blocks 6-10 hr feature
- **F4/F5 ad phasing:** see above
- **F3 kill-switch flip (page.tsx:939):** blocks F3 entirely (Agent 4 flagged — this is NOT a dev task, it's an owner "turn it on" decision)

---

## Natural clusters (corrected per Agent 4 + owner's launch model)

> **Owner clarification 2026-04-21 (late session):** "launch" = getting through AdSense + Apple review with everything not-yet-ready hidden via kill switches. Reviewers never see the holes because they never see the features. Drops several agent-flagged "launch-critical" items to post-approval. See memory file `project_launch_model.md`.

1. **Launch-critical under the reviewer-approval model** — 00-C (auth broken on prod; visible to reviewers), 00-J (ex-dev Vercel security), **#11-signup-409** (reviewers create test accounts; race-condition surfaces), 00-I (Apple Dev enrollment — gates iOS review entirely). AdSense-approval signals audit: `/contact` page, `/privacy` AdSense language, broken footer links, `/sitemap.xml`.
   - **Dropped from launch-critical under owner's model:** 00-L quiz content (comments kill-switched at `page.tsx:939`; reviewers never see empty quiz), 00-M schema/106 kid-trial (iOS-gated behind 00-I; Kids iOS can't submit until Apple enrollment lands anyway), F2/F3 (sit behind the same comment kill-switch).
   - These dropped items remain OPEN as post-approval work; they're not shipped, just not blocking the review gate.
2. **Monetization** — 00-B + F5 + F6 (shared: AdSense pub ID, ad_* schema, serve_ad RPC, events table, **schema/025 pending**, CMP absent = EU blocker)
3. **TypeScript / code quality** — #16 → #17-TS → #20 (ESLint) (hard chain: strict mode errors cascade without `as any` cleanup first)
4. **Reader-UX** — F2 + F3 + F4 (all edit story/[slug]/page.tsx or page.tsx; F3 blocked on kill-switch flip at 939)
5. **Kids platform launch prereqs** (Agent 4 identified — missed by Agent 3) — 00-I (enrollment, multi-day wait) → #18 (Keychain, 1-2 hrs, needs provisioning) → F7 kids data model (post-iOS launch enhancement)
6. **Web accessibility + responsive** — #4 touch-targets + #12-icons + design-system Track A (Container/Grid) + potential coupling with F4 card restyle
7. **Launch-phase config** — 00-E (preview token) + #19 (coming-soon mode) + 00-F (CSP flip, post-launch only)
8. **Stripe verification** — 00-K (30-sec quick check) → 00-G (full audit) → dependency on 00-J (ex-dev removal) landing first
9. **Audit + observability** — #15 (admin audit calls) + 00-D (Sentry) + #11 (error state polish) — all feed the "know when something breaks" story

**Standalone (don't belong in any cluster):**
- 00-N DR migration reconciliation (dev hygiene, 13 unknown migrations)
- 00-O HIBP (dashboard toggle)
- #13 .env.example cleanup (2-min cosmetic)
- #14-reserved reserved-usernames feature (self-contained 6-10 hr build)

---

## Sequencing chain (hard → soft)

**Hard dependencies (cannot skip):**
1. **00-J** (remove ex-dev from Vercel) → everything else owner-external — security hygiene comes first
2. **00-C** (Supabase URL verify) → launch — auth broken until fixed
3. **#16** (cleanup `as any`) → **#17-TS** (strict mode) — cascading build errors without it
4. **00-M** (apply schema/106) → kid-trial → Family conversion funnel works
5. **F3 kill-switch flip** (page.tsx:939) → F3 feature ships (Agent 4 added — this should be a line item, not a hidden prereq)
6. **00-I** (Apple Dev enrollment) → **#18** App Store submission → Kids iOS launch
7. **00-B** (AdSense approval) → F5 end-to-end testing (can prep code without)
8. **Sentry activation (00-D)** → #11 error.js swallow mitigated (Sentry provides redundant coverage per 00-D §Caveat)

**Soft dependencies (efficiency, not blocking):**
1. **00-A** (pg_cron) → before F6 reaches 90-day partition age; not blocking launch
2. **schema/025 verify** → before F5/F6 scope estimates are meaningful
3. **Track A responsive** → before F4 card restyle (either first, or F4 will rework with new Container/Grid)
4. **00-K Stripe 3-check** → 00-G full Stripe audit (K is the gating quick-check for G)
5. **#15 admin audit sweep** → 00-D Sentry (Sentry surfaces missed audits in production, so audit-first reduces noise)

---

## Silent-conflict risks (Agent 4 finds)

- **`page.tsx` edit collision:** if F4 + #4 + Track A responsive ship independently, all three edit the same file in overlapping line ranges. Recommended order if >1 ships same sprint: **Track A → #4 → F4**.
- **`story/[slug]/page.tsx` edit collision:** F2 + F3 + #4 + #11 all edit the same file. Recommended: **F3 kill-switch flip first → #11 error state → #4 touch targets → F2 receipt**.
- **`Ad.jsx:93` dispatch change:** 00-B gates on three-way conjunction; F5 adds targeting logic at same call site. Ship together, or 00-B first with stub.
- **schema migration numbering:** Multiple new migrations pending (F7 pipeline restructure, #14 reserved usernames, 00-N backfill reconciliation). Ensure unique sequential numbers — repo has gone through collision before (schema/105 seed-rss-feeds renamed to 107).
- **F4 vs F5 at `page.tsx:858-862`** — F4 deletes `{(idx + 1) % 6 === 0 && <Ad />}`; F5 implies re-adding ads. Not a conflict if phased correctly (F4 pre-launch, F5 post-launch), but both editing the same line range requires explicit sequencing.

---

## Unknowns blocking execution (resolve with the owner)

**Must answer before committing any launch:**
1. **00-C status** — is the Supabase URL actually truncated in Vercel right now, or already fixed? Owner-verify only path.
2. **00-L timeline** — how will ~50+ quiz questions get authored (manual / AI-assisted) and how long?
3. **13 missing migrations (00-N)** — which 13? Any RLS-critical? No names surfaced yet.
4. **schema/025 applied?** — blocks F5/F6 feasibility scoping.

**High-value before scoping next batch:**
5. **F4 phase decision** — pre-launch quiet or ships simultaneous with F5 ads?
6. **#6 bottom nav** — keep as-is / add Bookmarks / 5-tab redesign?
7. **F3 kill-switch flip** — when? (blocks entire F3 feature)
8. **AdSense approval ETA** — affects F5 timeline
9. **#11 signup-409** — elevate the 5-min check to launch-critical, or keep in full-sweep bucket?
10. **Icon assets (#12-icons)** — when do PNGs land?

**Affect effort estimation:**
11. **F2 endpoint verify** — does `/api/stories/read` already return `{scoreDelta, readSeconds}`, or does F2 scope balloon?
12. **#15 pattern exemplar** — which admin route is the 1-of-24 already calling `record_admin_action` correctly?
13. **F7 §12 8 decisions** — especially kids data model (single-row vs. separate rows) and cron schedules
14. **#14-reserved inputs** — name list size (top 2-3k default), match policy (bounded default), review note field

---

## Top-of-mind takeaways

- **The single highest-leverage 5-minute fix on the entire board is #11's signup-409 check** (Agent 4 elevation) — it sits in a "post-launch sweep" bucket but is actually a race-condition that creates duplicate auth users. Worth pulling forward.
- **F3's kill-switch flip at page.tsx:939 should be its own line item.** It's currently buried inside F3's description as a prereq, but it's actually an owner-decision gate that blocks the whole F3 feature independent of any dev work.
- **schema/025 status is a bigger blocker than the tracker acknowledges** — both F5 and F6 scope estimates are wishful until it's verified applied.
- **The F4/F5 "conflict" is a phase decision, not a conflict.** F4 pre-launch quiet, F5 post-launch re-adds ads via the same slot. One line range (858–862), two phases.
- **Kids platform has its own launch track separate from web:** 00-I → #18 → F7, all gated on Apple enrollment. Should be tracked as one cluster, not three scattered items.

---

## Process notes

- Workflow: 4-agent review per `~/.claude/projects/.../memory/feedback_four_agent_review.md` (Agent 1 + Agent 2 parallel, Agent 3 serial consolidation, Agent 4 independent adversarial).
- Item count convergence: 3/4 agents landed at 35 remaining (Agent 1, Agent 3, Agent 4 independently). Agent 2 reported 39 due to including SHIPPED items as context; not a factual disagreement.
- Deltas Agent 4 added (not present in Agent 3's consolidated map): F3 kill-switch as its own line item, page.tsx edit-collision risk, schema/025 unknown blocking F5/F6, Kids-platform prereq cluster, #11 signup-409 elevation to launch-critical, F4/F5 reframe (phase not conflict), FIX_SESSION_1 numbering collision between design-system bundle items and Other-fixes items.
- No unresolved contradictions between agents — all deltas are additive.

---

## Session-end status (2026-04-21)

This document was produced mid-session and is stale for the launch-critical cluster. Several named items shipped or changed status the same day. The rest of the relationship analysis remains valid — file collisions, env-var overlaps, cluster groupings, sequencing chain, silent-conflict risks, and the 35-item scope are all still useful for the still-open items. Only the launch-critical and Agent-4-flagged items shifted.

### Launch-critical cluster — status after end-of-day

| Item | Status after 2026-04-21 | Evidence |
|---|---|---|
| **00-C** (Supabase URL truncation) | CLOSED — not applicable, site works on live. Owner-verified. | no-commit (owner dashboard verification) |
| **00-J** (ex-dev on Vercel team) | CLOSED — only owner (`admin-13890452`) on team; no ex-dev to remove. | no-commit (Vercel team audit) |
| **00-L** (quiz content authoring) | DEFERRED under reviewer-approval launch model — comments are kill-switched at `story/[slug]/page.tsx:939`, so reviewers never see empty-quiz articles. Still open as post-approval work. | see memory `project_launch_model.md` |
| **00-M** (schema/106 kid-trial freeze notification) | SHIPPED — applied via MCP 2026-04-21, verified. | no-commit (Supabase apply) |
| **00-I** (Apple Dev enrollment) | APPLIED — Organization-track submission; on Apple's review clock. Item is "in flight," not open dev work. | no-commit (Apple dashboard) |
| **#11 signup-409** (Agent-4 elevation) | SHIPPED — duplicate-email 400 detection + sign-in routing. | `b7996ee` |

### AdSense-approval signals

The earlier audit's "AdSense-approval signals audit" items (`/contact` page, `/privacy` AdSense language, broken footer links, `/sitemap.xml`) partially shipped the same day:
- `/privacy` AdSense language — SHIPPED (`91055cc`, Advertising & Cookies section).
- `sitemap.xml` — SHIPPED (owner submitted to Google Search Console, no-commit).
- `ads.txt` + site-ownership meta tag — SHIPPED (`1e27318` + `cbf1875`).
- CMP wizard — started; "3 choices" pattern selected; final publish parked behind serving approval.
- `/contact` page + broken footer link sweep — not verified in this session, still open.

### Items whose status CHANGED without shipping

- **#15** (admin route compliance sweep) — PARKED under new "Pre-Launch — Parked (trigger-based resume)" category in FIX_SESSION_1 (`7cbc1bc`). 75 routes audited (31% pass rate), 4-5 hr scope, 5 resume triggers defined. Audit artifact: `ADMIN_ROUTE_COMPLIANCE_AUDIT_2026-04-21.md`.
- **00-O** (HIBP leaked-password toggle) — PARKED (Pro-plan gated; waits on Supabase upgrade).
- **CMP final publish** — PARKED behind AdSense serving approval (wizard config started, 3-choices pattern chosen).

### What still holds from this document

- File-collision maps (`page.tsx`, `story/[slug]/page.tsx`, `middleware.js`, `layout.js`, etc.) — unchanged.
- Env-var + external-account overlap grid — mostly unchanged (AdSense pub ID now set in Vercel; Stripe 3-check clean; Vercel team clean; Apple enrollment in flight).
- Sequencing chain (hard + soft) — still correct for the items that remain open.
- Silent-conflict risks — still valid for the remaining reader-UX + design-system + F4/F5 phasing work.
- Owner-decision gates — F3 kill-switch flip, F4/F5 phasing, #6 bottom nav, F7 §12 decisions, #14-reserved-usernames scope all still open.

### Note on this document's shelf life

This map was built BEFORE several launch-critical items shipped the same day. Treat the "Natural clusters" and "Launch-critical" sections as snapshot-of-audit-time. For live state of the 35-item audit, read `Current Projects/FIX_SESSION_1.md` — items that shipped carry inline `SHIPPED <date>` blocks there.
