# Zone Z06: Future Projects/

## Summary

Zone holds 80 files (counted via `find`, excluding `.DS_Store`): 21 top-level strategy MDs, 1 README, 1 vision document, 1 home-page gap analysis, 11 db/ schema-change MDs, 27 views/ per-screen specs, 11 mockup HTML files (incl. README + styles.css + index.html), and 7 standalone HTML mockups at the folder root. The folder is the panelist-driven plan for relaunch across web + adult iOS + kids iOS, all dated 2026-04-21 and grounded in a recon snapshot of that date. It is internally consistent: 00_CHARTER + 01_POSITIONING are the constitutional anchors; the numbered strategy docs (02–24) cite back to them; views/ and db/ are the implementation projections; mockups visualise the strategy. The folder explicitly retired four numbered docs in the 2026-04-21 Charter update (04_TRUST_INFRASTRUCTURE, 17_REFUSAL_LIST, 21+, db/07_standards_doc) — these names are still cross-referenced in adjacent docs as "deferred" or "removed," which is a minor consistency drift. `09_HOME_FEED_REBUILD.md` carries a 2026-04-23 bridge note acknowledging that schema/144 ships an interim hero-pick proxy ahead of the full editor system. None of the new tables (`front_page_state`, `editorial_charter`, `editor_shifts`, `defection_links`, `corrections`, `article_type`, `kicker_next_event_date`) are in the live schema yet, so this folder remains a forward-looking plan rather than active spec.

## Files

### README.md
- **Purpose:** Entry point + navigation guide for the folder.
- **Status:** Active.
- **Cross-refs:** Names every numbered MD; lists cleanup deletions (04, 17, db/07, mockups).
- **Concerns:** Lists four panelist groups (Strategy/UI/UX/Developers/Marketers/Media) that drive the panelist-owner headers across MDs.

### 00_CHARTER.md
- **Purpose:** The five constitutional commitments (tight prose summary, dated front page, quiz-gated comments, article-is-the-product, engagement-bait refusal). Banned-words list. Screenshot-decontextualization test. Anonymous-source rule.
- **Status:** Active / signed-off 2026-04-21.
- **Cross-refs:** Every other doc cites it.
- **Verified-against-code:** Banned-words list + no-emoji rule already enforced in adult code per CLAUDE.md and `Reference/STATUS.md`. The "no byline / no read-time / no publication-timestamp / no corrections-banner" production-metadata rules are *aspirational here* — the live story page is closer to compliant than not, but the formal cleanup hasn't been executed across `views/web_story_detail.md` and the iOS counterpart.

### 01_POSITIONING.md
- **Purpose:** One-sentence pitch ("the news site where the comments are worth reading because commenters proved they read the article"), three-sentence pitch, anti-positioning ("not aggregator / not newsletter / not Reddit / etc."), audience segments, "what we stop saying" drift list.
- **Status:** Active.
- **Cross-refs:** Charter + every marketing surface doc (welcome, signup, about, paywalls).

### 02_PRICING_RESET.md
- **Purpose:** Lessin-driven pricing teardown. Option A ($6.99/12.99/19.99/29.99) vs Option B (institutional). Trial config table. Stripe + Apple migration plan. New `_v2` Apple product IDs.
- **Status:** Active proposal — DB still has the 9 verified rows at the original $3.99/9.99/14.99/19.99 prices per the 2026-04-21 verification block.
- **Cross-refs:** db/01_trials_add_to_plans, db/02_ad_free_reconciliation, 03, 11.
- **Concerns:** Owner has explicitly told me to "audit Stripe" (per OWNER_TODO_2026-04-24.md) — that work feeds this doc directly.
- **Verified-against-code:** `web/src/lib/plans.js` is the canonical price table; verifying current values against this doc would belong to a downstream wave.

### 03_TRIAL_STRATEGY.md
- **Purpose:** Sutherland/Lessin/Wroblewski trial architecture: 7-day monthly / 14-day annual, card upfront, three-dot timeline UI, Day-5 reminder, one-tap cancel, Apple `isEligibleForIntroOffer`, abuse vectors, dunning cron.
- **Status:** Active proposal — `plans.trial_days = 0` confirmed across all paid rows; checkout route does not pass `subscription_data.trial_period_days`.
- **Cross-refs:** 02, 11, db/01.
- **Verified-against-code:** Confirmed `web/src/app/api/stripe/checkout/route.ts` does not yet contain `trial_period_days`.

### 05_EDITOR_SYSTEM.md
- **Purpose:** Three-editor rotation, editorial charter (DB-backed), shift hand-off, public on-shift editor byline, per-article editor attribution, scaling triggers.
- **Status:** Active proposal.
- **Cross-refs:** 00, 04 (deferred — see Concerns), 09, db/04, views/web_home_feed, views/web_welcome_marketing.
- **Concerns:** Doc still names dependency on `04_TRUST_INFRASTRUCTURE.md` ("Ship after `04_TRUST_INFRASTRUCTURE.md` has standards doc in place"), but README explicitly retired 04. Stale cross-ref. Also references "Sequencing > Pairs with: `17_REFUSAL_LIST.md`" — same staleness.
- **Verified-against-code:** No `editorial_charter`, `editor_shifts`, `front_page_state` tables in the live schema. `schema/144_articles_hero_pick.sql` is the bridge that 09's bridge-note acknowledges.

### 06_DEFECTION_PATH.md
- **Purpose:** "See also" inline link to peer outlet + primary source on every article. Editorial guidelines on outlet selection. Click tracking via `defection.click` event.
- **Status:** Active proposal.
- **Cross-refs:** 00 (commitment 4), 04 (deferred), 12, db/05, views/web_story_detail, views/ios_adult_story.
- **Concerns:** Cross-references the now-retired `04_TRUST_INFRASTRUCTURE.md` ("Depends on" + "Ship after"). Stale reference.

### 07_KIDS_DECISION.md
- **Purpose:** Sidecar-vs-flagship decision. Year 1: sidecar. Year 2 escalation criteria. Family-tier attach-rate target 35%+, kid pair-through 70%+, kid retention 60%+.
- **Status:** Active.
- **Cross-refs:** 00, 01, 02, 14, 19.
- **Verified-against-code:** Aligns with the kids-iOS scope memory ("kids product = iOS only").

### 08_DESIGN_TOKENS.md
- **Purpose:** Three-layer token system (primitives → semantic → component). Kids delta. Plan to retire `web/src/lib/adminPalette.js`. Introduce `KidPressStyle`. Port `Font.scaledSystem` to adult iOS.
- **Status:** Active proposal.
- **Cross-refs:** 00, 16, 14.
- **Verified-against-code:** `Font.scaledSystem` exists in `VerityPostKids/VerityPostKids/KidsTheme.swift` (lines 77–83) but **not** in `VerityPost/VerityPost/Theme.swift`. `KidPressStyle` is not in the kids codebase. Both confirm this doc is genuine forward work.

### 09_HOME_FEED_REBUILD.md
- **Purpose:** 8-slot dated front page with hero + 7 supporting + breaking strip + bottom block + archive route. Rebuilds `web/src/app/page.tsx` and `VerityPost/VerityPost/HomeView.swift`.
- **Status:** Active proposal — partially shipped via the 2026-04-23 bridge note.
- **Cross-refs:** 00, 05, 08, 10, 15, db/04.
- **Concerns:** The bridge note at the top is the only place in this folder that acknowledges interim implementation — useful precedent. Notes the FALLBACK_CATEGORIES constant is still in code (T-017).
- **Verified-against-code:** `web/src/app/page.tsx` confirmed to still reference `FALLBACK_CATEGORIES`. `schema/144_articles_hero_pick.sql` is the staged ship described in the bridge.

### 10_SUMMARY_FORMAT.md
- **Purpose:** "The Manifest" — headline rules, slug rules, summary as one prose paragraph (no Fact/Context/Stakes labels), banned-words list, body rules, timeline rules, kicker = dated next event, three exceptions (developing / explainer / expert_qa), screenshot-decontextualization test.
- **Status:** Active proposal.
- **Cross-refs:** 00, 09, 12, 17 (deferred), db/10, 24.
- **Concerns:** Cross-refers `17_REFUSAL_LIST.md` ("Pairs with") which is retired.
- **Verified-against-code:** `articles.article_type` and `articles.kicker_next_event_date` columns absent from live schema; `quiz_questions.type` (A–F) absent.

### 11_PAYWALL_REWRITE.md
- **Purpose:** Invitation voice. New `paywalls/` content modules per surface. New `<TrialTimeline>` component. Rewrite of `LockModal.tsx` to accept `surface` prop. Fix `SubscriptionView.swift` infinite-loading state (called out as Week 1 priority).
- **Status:** Active proposal.
- **Cross-refs:** 02, 03, 08.
- **Verified-against-code:** No `web/src/lib/paywalls/` directory in the codebase.

### 12_QUIZ_GATE_BRAND.md
- **Purpose:** Make the quiz gate visible everywhere. Comment thread header "Every reader here passed the quiz." `<PassedMark />` next to commenters. Unhide the `{false && ...}` launch hide on `/story/[slug]`. Type A/D mandatory, fail-state diagnostic without revealing answers, cool-down + Verity Pro skip.
- **Status:** Active proposal.
- **Cross-refs:** 00, 08, 13.
- **Concerns:** Acceptance criteria still says "6-hour cool-down" while the body says "10-minute cool-down" after 3 attempts → the body and AC contradict each other (acceptance line: "Fail-state copy rewritten — no punitive voice, reread-and-try-again option, 3-attempt cool-down (6 hours)"; body says "10-minute cool-down").

### 13_QUIZ_UNLOCK_MOMENT.md
- **Purpose:** The signature interaction — "You're in. The conversation is below." Soft scroll, single haptic on iOS, composer auto-focus, ≤1800ms total. Reduce-motion path.
- **Status:** Active proposal.
- **Cross-refs:** 08, 12, 14.

### 14_KIDS_CHOREOGRAPHY.md
- **Purpose:** Polish pass on the kids app. `KidPressStyle` foundational button style, quiz option press feedback, pair-code micro-feedback, reader progress + 80%-scroll moment, badge-unlock origin fix (top-right not center), category-tile progress trails, parental-gate wire-up, leaderboard rank animations, motion budget.
- **Status:** Active proposal.
- **Cross-refs:** 00, 07, 08.
- **Verified-against-code:** `ParentalGateModal.swift` exists in `VerityPostKids/VerityPostKids/`; `KidPressStyle` does NOT exist anywhere — confirms doc claims. The "ParentalGateModal has zero callers" assertion in the doc is the same one the memory file `feedback_verify_audit_findings_before_acting.md` warns about ("ParentalGate has live COPPA callers"); audit Wave 2 should re-verify.

### 15_PERFORMANCE_BUDGET.md
- **Purpose:** Sub-second budget per route. RSC-first. Edge cache. Ad time-budget. Lighthouse CI. RUM via web-vitals. iOS budgets per device.
- **Status:** Active.
- **Cross-refs:** 00, 16.

### 16_ACCESSIBILITY.md
- **Purpose:** Dynamic Type, color contrast (flags `#22c55e` text on white as failing AA), VoiceOver coverage, reduce-motion, keyboard navigation (no admin shortcuts), tap-target sweep (44pt), focus management on paywall + quiz.
- **Status:** Active.
- **Cross-refs:** 08, 15, 14.
- **Verified-against-code:** Confirmed `Theme.swift` for adult iOS has no UIFontMetrics path; recommendation in doc is correct.

### 18_ROADMAP.md
- **Purpose:** 12-week plan in three phases (Foundation / Surface / Launch prep). Phase gates. Year-1-but-after-launch list. Year-1-explicitly-not list.
- **Status:** Active. Aspirational dates.
- **Cross-refs:** Every other doc.
- **Concerns:** Roadmap is dated 2026-04-21; today is 2026-04-25. Week 1 deliverables (Charter sign, SubscriptionView fix) overlap with what `Reference/STATUS.md` and `Current Projects/MASTER_TRIAGE_2026-04-23.md` track separately. The roadmap is aspirational, not the live ship-status — keep that distinction clear when triaging.

### 19_MEASUREMENT.md
- **Purpose:** Metric philosophy ("Lessin: metrics reveal values"). Acquisition / Activation / Retention / Conversion / Revenue / Editorial-health / Trust / Kids cohorts. Explicit "what we don't measure" list (no time-on-page, no scroll depth, no engagement-rate, no third-party analytics on authed surfaces).
- **Status:** Active.
- **Cross-refs:** 00, 02, 07, 18, 04 (deferred).
- **Concerns:** Cross-refers retired `04_TRUST_INFRASTRUCTURE.md` for correction-cycle/reader-report metrics. Stale.

### 20_RISK_REGISTER.md
- **Purpose:** 15 risks ranked by severity-weighted probability. Top-5 "to watch" (factual error, editorial burnout, owner over-scoping, Apple Dev account delay, Charter-vs-revenue conflict).
- **Status:** Active.

### 24_AI_PIPELINE_PROMPTS.md
- **Purpose:** V4 pipeline prompts (Steps 2–9). Replaces V3 in `web/src/lib/editorial-guide.js` (or TS equivalent). New: banned-words expansion, counter-evidence paragraph mandatory, kicker rule, Type A/D quiz coverage, gaps-in-prose rule. Schema migration list.
- **Status:** Active proposal.
- **Cross-refs:** 00, 04 (deferred), 10, 12, db/10.
- **Concerns:** Cross-refers retired `04_TRUST_INFRASTRUCTURE.md`. Numbering jumps from 20 → 24 — implies 21/22/23 either reserved or retired without trace; the README's "Removed in cleanup" list does not enumerate them, which is a transparency gap.
- **Verified-against-code:** Live pipeline lives at `web/src/lib/pipeline/` per CLAUDE.md (editorial-guide, call-model, etc.); confirms the doc's target. The V4 changes (article_type column, kicker_next_event_date, quiz type) are not yet schema-applied.

### VISION_KINETIC_EDITION.md
- **Purpose:** Provocation/vision doc. Five pillars: Ink Weight = Trust (typographic weight derived from sourcing depth), Page Shape (4 layout archetypes by news-day character), Source Constellation (dot count per article), Story Lifecycle (cards that age across editions), Edition Pulse (subtle masthead glow when editor recently touched the page). Adds a "Wire" dense list below the curated 8.
- **Status:** Vision document — explicitly not a spec. "If this vision resonates, the implementation path is …" footer.
- **Cross-refs:** 00, 09, db/04, db/10, 08, views/web_home_feed, views/ios_adult_home.
- **Concerns:** Three of the five pillars (Ink Weight, Source Constellation, sourcing-strength tracking) require sourcing-count data the Charter cleanup explicitly excluded. **Direct conflict with `00_CHARTER.md` commitment 4** ("no sourcing-strength row, no corrections banner on articles") and with `db/10_summary_format_schema.md` ("**No** `named_sources_count` / `document_sources_count` / `anonymous_sources_count` columns"). VISION assumes those columns; the schema MD says they're explicitly NOT added. Owner-call needed if anyone seriously pursues this; otherwise it's read-only inspiration.

### home-page-spec-vs-research.md
- **Purpose:** Gap analysis between the home-page spec (09) and external research. Where they agree, where they conflict (bias indicators, freshness timestamps, bylines), real gaps (three-tier hierarchy, more-stories-below-the-fold, edition numbering, time-of-day editions, photos, section ribbon, density toggle, breaking-indicator style).
- **Status:** Active analysis doc — feeds into 09 future iterations.
- **Cross-refs:** 09, VISION.

### db/00_INDEX.md
- **Purpose:** Catalog of schema changes. Active vs Deferred vs Removed. Migration ordering by phase. Dependencies on Apple-coupled / launch-phase work.
- **Status:** Active.
- **Cross-refs:** Every db/ child.

### db/01_trials_add_to_plans.md
- **Purpose:** Set `trial_days` per plan; combine with the price update; document Stripe + Apple coordination.
- **Status:** Active proposal.
- **Cross-refs:** 03, 02.

### db/02_ad_free_reconciliation.md
- **Purpose:** Decide Verity tier ad-free flip. Recommends Option A (verity becomes ad-free; pro retains differentiation via expert/archives/DM/etc).
- **Status:** Active proposal — owner decision pending per the doc.
- **Cross-refs:** 02, 11.

### db/03_corrections_table.md
- **Purpose:** Originally backed `/corrections` public feed. Now: deferred. Doc retained to record the decision: drop the table or lock to editor-only. No diff_before/diff_after columns; no public route.
- **Status:** Deferred (per Charter 2026-04-21 update).
- **Cross-refs:** 00 (commitment 4).

### db/04_editorial_charter_table.md
- **Purpose:** Three tables (`editorial_charter`, `editor_shifts`, `front_page_state`) + `front_page_archive`. Two new RPCs (`get_on_shift_editor`, `get_front_page`). New permissions for editorial.* and `editor` role.
- **Status:** Active proposal.
- **Cross-refs:** 05, 09, 06.
- **Verified-against-code:** None of these tables exist in live schema. The 144 hero-pick migration is the bridge.

### db/05_defection_links_table.md
- **Purpose:** `defection_links` table (article_id, slot 1 or 2, outlet_name, url, link_type ∈ {peer, primary_source, background}). Application-level publish validation.
- **Status:** Active proposal.
- **Cross-refs:** 06, 04 (deferred).
- **Concerns:** Cross-ref to 04. Stale.

### db/06_trust_events_table.md
- **Purpose:** Originally backed "See a problem?" reader-flagged-issue queue. Now: deferred. Doc retained.
- **Status:** Deferred (per Charter 2026-04-21 update).
- **Cross-refs:** 00 (commitment 4).

### db/08_feature_flags_expansion.md
- **Purpose:** Seed 14 additional `feature_flags` rows (`quiz_gate_visible`, `comments_enabled`, `dms_enabled`, `defection_links_visible`, `kids_app_available`, `expert_qa_kids`, `adsense_enabled`, `trial_offered`, `editorial_frontpage`, `corrections_public`, `trust_report_button`, `masthead_editor_visible`, `recent_articles_feed`, `kids_leaderboard_family_scope_only`).
- **Status:** Active proposal.
- **Concerns:** Some seeded flags name retired/deferred features (`corrections_public`, `trust_report_button`, `masthead_editor_visible`, `editorial_frontpage`). If those features stay deferred, the flag rows still sit on the DB but never flip on. Acceptable as launch-hide pattern; just note the inconsistency.

### db/09_design_tokens_table.md
- **Purpose:** Considered DB-backed design tokens. Rejected. Doc retained as decision record.
- **Status:** Rejected/explainer-only (no migration).

### db/10_summary_format_schema.md
- **Purpose:** Add `articles.article_type` (CHECK in {standard, developing, explainer, expert_qa}), `articles.kicker_next_event_date`. Drop `articles.reading_time_minutes`. Add `quiz_questions.type` (A–F). Drop `corrections` table or lock to editor-only. Application-level publish validation logic.
- **Status:** Active proposal.
- **Cross-refs:** 10, 24, 09.
- **Concerns:** Embeds explicit "**NOT** added" lists for `summary_fact/context/stakes`, `what_we_dont_know`, `named_sources_count/document_sources_count/anonymous_sources_count`, `corrections.diff_before/diff_after` — useful trap-door against drift. Conflicts with VISION_KINETIC_EDITION (see notes there).

### views/00_INDEX.md
- **Purpose:** Catalog of views/. Notes admin views are excluded (locked), kids has no web surface, marketing pages don't get per-view docs.
- **Status:** Active.

### views/ios_adult_alerts.md / ios_adult_family.md / ios_adult_home.md / ios_adult_profile.md / ios_adult_story.md / ios_adult_subscription.md
- **Purpose:** Per-screen specs for the six adult iOS surfaces. Each: current state from 2026-04-21 recon, what changes, files touched, acceptance criteria, dependencies.
- **Status:** Active proposals.
- **Cross-refs:** Each cites its strategy MDs.
- **Concerns:** `ios_adult_profile.md` and `ios_adult_alerts.md` reference adding links to `/standards`, `/corrections`, `/refusals`, `/editorial-log` — those public web pages are part of the retired 04/17 scope and **do not exist** in `web/src/app/`. Stale add-instructions; should be reconciled with the README's "removed" list.

### views/ios_kids_pair.md / ios_kids_home_greeting.md / ios_kids_reader.md / ios_kids_quiz.md / ios_kids_streak.md / ios_kids_badges.md / ios_kids_leaderboard.md / ios_kids_profile.md / ios_kids_expert.md
- **Purpose:** Per-screen specs for the nine kids iOS surfaces.
- **Status:** Active proposals.
- **Cross-refs:** 14 (KidPressStyle), 07 (sidecar scope), 08 (tokens).
- **Verified-against-code:** All assume `KidPressStyle` exists; it doesn't yet. All depend on 14 shipping first.

### views/web_bookmarks.md / web_home_feed.md / web_leaderboard.md / web_login_signup.md / web_messages.md / web_notifications.md / web_paywall_surfaces.md / web_profile.md / web_profile_kids.md / web_profile_settings.md / web_search.md / web_story_detail.md / web_welcome_marketing.md
- **Purpose:** Per-screen specs for 13 web surfaces.
- **Status:** Active proposals.
- **Concerns:**
  - `web_welcome_marketing.md` lists eight new public pages (`/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`, `/archive/[date]`, `/recent`). Charter cleanup retired the standards/corrections/refusals/masthead group. The doc still has the full list. Stale → should be reduced to `/archive/[date]` + `/recent` only (or three of these if any survive the cleanup). I confirmed none of these eight routes exist in `web/src/app/`.
  - `web_profile.md` and `web_login_signup.md` cite removing keyboard shortcuts (1/2/3/4 + g+chord) — aligns with the no-keyboard-shortcuts memory; concern is whether those shortcuts actually exist or if this is a hallucinated pickup. Wave 2 should grep.
  - `web_story_detail.md` lists components to delete (`<StoryByline>`, `<CorrectionsBanner>`, `<SourcingStrengthRow>`, `<SourceList>`, `<ReportForm>`) — verifying which actually exist is downstream work.

### Mockup HTML files (mockups/index.html, styles.css, web-home.html, web-home-standalone.html, web-paywall.html, web-quiz-states.html, web-story.html, kids-home.html, kids-quiz-pass.html, kids-reader.html)
- **Purpose:** Static HTML renders of every surface following the updated 2026-04-21 spec. Self-served via `python3 -m http.server 4000` from `mockups/`.
- **Status:** Active reference. Charter-aligned (no bylines / no read-times / no source rows / no corrections UI in the rendered output, per `mockups/README.md`).
- **Cross-refs:** All numbered strategy docs.
- **Concerns:** `web-home.html` and `web-home-standalone.html` are byte-for-byte close — both 4849 bytes, identical headers. Most likely intentional (the "standalone" suffix implies offline-shareable copy without the gallery hub), but it's an effective duplicate.
- **Notable:** `mockups/README.md` references deleted mockups (`web-standards.html`, `web-refusals.html`, `web-corrections.html`, `web-masthead.html`) per the README's cleanup list — those are not in the directory, confirming the cleanup was executed.

### Top-level standalone HTML mockups (adult-home-preview.html, kinetic-edition-mockup.html, kinetic-edition-v2.html, verity-frontpage-v3.html, verity-living-edition.html, verity-reinvented.html, verity-scenes.html)
- **Purpose:** Various exploratory home-page renderings. Multiple iterations of the kinetic-edition concept (v1 mockup = 1005 lines, v2 = 563 lines), plus fully-styled long-form mockups (`verity-scenes.html` = 1093 lines, `verity-living-edition.html` = 789, `verity-reinvented.html` = 469, `verity-frontpage-v3.html` = 410, `adult-home-preview.html` = 155).
- **Status:** Exploratory. None are the canonical mockup — that's the `mockups/` set.
- **Cross-refs:** All map back to VISION_KINETIC_EDITION + `09_HOME_FEED_REBUILD.md` + `home-page-spec-vs-research.md`.
- **Concerns:** Seven exploratory home renders next to a separate canonical mockup is high entropy. Worth considering whether they should move into `Archived/` once the home-feed direction is fixed; right now they sit as historical context for design iterations on 2026-04-22.

## Within-zone duplicates / overlap

- **Home-page rendering is duplicated across many surfaces.** Canonical: `mockups/web-home.html` + `views/web_home_feed.md` + `09_HOME_FEED_REBUILD.md`. Exploratory: `verity-frontpage-v3.html`, `verity-living-edition.html`, `verity-reinvented.html`, `verity-scenes.html`, `adult-home-preview.html`, `kinetic-edition-mockup.html`, `kinetic-edition-v2.html`. Plus the gap analysis (`home-page-spec-vs-research.md`) and the vision (`VISION_KINETIC_EDITION.md`). Nine separate documents touch the home page conceptually. They serve different purposes — strategy / view-spec / mockup / vision / gap-analysis — but the volume risks drift.
- **`mockups/web-home.html` and `mockups/web-home-standalone.html` are effectively identical** (same byte size, identical opening 30 lines, same content). One is the gallery-linked version, the other is meant for standalone serving without `index.html`.
- **VISION_KINETIC_EDITION's "Source Constellation" + "Ink Weight" pillars conflict with `00_CHARTER.md` commitment 4 + `db/10_summary_format_schema.md`'s explicit "NOT added" sourcing-count columns.** Same folder, contradictory directions.
- **`12_QUIZ_GATE_BRAND.md` body-vs-acceptance contradiction** on the quiz cool-down duration (10 minutes in body, 6 hours in AC).

## Within-zone obvious staleness (already-shipped or already-dropped features still described as "future")

- **Cross-references to retired docs.** `05_EDITOR_SYSTEM.md`, `06_DEFECTION_PATH.md`, `10_SUMMARY_FORMAT.md`, `19_MEASUREMENT.md`, `24_AI_PIPELINE_PROMPTS.md`, `db/05_defection_links_table.md` all still cite `04_TRUST_INFRASTRUCTURE.md`. `05_EDITOR_SYSTEM.md` and `10_SUMMARY_FORMAT.md` cite `17_REFUSAL_LIST.md`. Both are retired per the README's 2026-04-21 cleanup. These should be reconciled or annotated with "(retired)" inline.
- **`views/ios_adult_profile.md` and `views/ios_adult_alerts.md` ask to add settings links to `/standards`, `/corrections`, `/refusals`, `/editorial-log`** — those routes were retired from scope (Charter 4) and don't exist in `web/src/app/`. Stale add-instructions.
- **`views/web_welcome_marketing.md` lists 8 new public pages**, 6 of which were cut by the Charter update. Doc should be trimmed to `/archive/[date]` + `/recent` only.
- **Numbering gap 20 → 24** (no 21/22/23 in the folder, none cited in README's cleanup list). Either retired without a record, or reserved.
- **`19_MEASUREMENT.md` references `events_20260421` table with "57 rows today"** — recon snapshot of 2026-04-21. Today is 2026-04-25. Cosmetic; not a defect.
- **Schema/144 hero-pick bridge already shipped** — only `09_HOME_FEED_REBUILD.md` acknowledges this with an inline bridge note. None of the other docs (e.g., `db/04_editorial_charter_table.md` which still describes `front_page_state` as the canonical source) reflect the staged-ship reality. db/04 should reference 144 as the bridge being migrated from.

## Notable claims worth verifying in later waves

- **`07_KIDS_DECISION.md` and `14_KIDS_CHOREOGRAPHY.md` claim `ParentalGateModal.swift` has zero callers.** Memory file `feedback_verify_audit_findings_before_acting.md` warns this was a stale audit finding ("ParentalGate has live COPPA callers"). Wave 2 must grep `VerityPostKids/` for ParentalGateModal call sites and reconcile.
- **`02_PRICING_RESET.md` quotes 9 specific Stripe price IDs** verified 2026-04-21. Owner has flagged the ex-dev-removal + Stripe audit as `OWNER_TODO_2026-04-24.md` items. Need to verify those Stripe prices still exist as quoted before this doc's migration plan is executed.
- **`09_HOME_FEED_REBUILD.md` claims `FALLBACK_CATEGORIES` is hardcoded in `web/src/app/page.tsx`.** Confirmed via grep — still there. Tracked in `Current Projects/MASTER_TRIAGE_2026-04-23.md`; this Future Projects doc and the triage are aligned.
- **`05_EDITOR_SYSTEM.md` proposes hiring three editors at $150–250K total.** Operational claim, not a code claim — flag for owner review when the editor system enters serious planning.
- **`08_DESIGN_TOKENS.md` claims `web/src/lib/adminPalette.js` should be deleted and admin should read from a unified token system.** Memory file `feedback_admin_marker_dropped.md` retired the `@admin-verified` lock-rule on 2026-04-23 (after this doc was written). The doc still says admin needs "explicit owner sign-off" — language is now stale though the underlying caution may still be appropriate.
- **`10_SUMMARY_FORMAT.md` and `24_AI_PIPELINE_PROMPTS.md` claim ~42 articles were generated under V3 pipeline.** Live count belongs to a downstream wave (query `articles` row count by status).
- **`16_ACCESSIBILITY.md` flags `#22c55e` text on white as failing AA (2.4:1).** Color shows up in `Theme.swift` (`success = Color(hex: "22c55e")`). Need a per-call-site audit before we know how big the cleanup is.
- **Multiple view docs cite "remove keyboard shortcuts (1/2/3/4 + g+chord)" from profile / settings.** Need to verify these shortcuts exist in current `web/src/app/profile/page.tsx` and related files; if absent, doc is referencing legacy/reverted behavior.
- **`24_AI_PIPELINE_PROMPTS.md` says target file is `web/src/lib/editorial-guide.js` (or TS).** CLAUDE.md says the pipeline now lives at `web/src/lib/pipeline/` (editorial-guide, call-model, cost-tracker, errors, plagiarism-check, prompt-overrides, persist-article, render-body, scrape-article, cluster, story-match, logger, clean-text). Path drift — doc references the older single-file target; current code has the directory. Update the V4 migration notes section.
- **`db/00_INDEX.md` says "Current last applied migration: `20260420020544 rls_hardening_kid_jwt_2026_04_19`."** Live `schema/` has 169 migrations including `175_ext_audit_batch36.sql` and `177_grant_ai_models_select.sql`. The INDEX claim is dated, harmless, but reinforces that this folder is a 2026-04-21 snapshot, not live state.
