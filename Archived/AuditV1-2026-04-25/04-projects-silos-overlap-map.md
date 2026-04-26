# Session 4 — Future / Unconfirmed / Completed Projects overlap map

**Scope:** `Future Projects/` (24 numbered specs + db/ + views/ + mockups/ + supporting docs), `Unconfirmed Projects/` (UI_IMPROVEMENTS.md, product-roadmap.md), `Completed Projects/` (CATEGORY_FIXES.md, FINAL_WIRING_LOG.md, MIGRATION_PAGE_MAP.md).

**Read end-to-end:** Future Projects root 24 specs + VISION_KINETIC_EDITION.md + home-page-spec-vs-research.md + README + 00_CHARTER (read in Session 2 cross-link); db/ all 9 active+deferred files (00, 01, 02, 03, 04, 05, 06, 08, 09, 10); views/ all 28 files (00_INDEX + 13 web + 6 adult-iOS + 9 kids-iOS); mockups/README + index.html + diff of web-home.html vs web-home-standalone.html (sampled — HTML mockups are exploratory per Session 3 plan); Unconfirmed Projects/UI_IMPROVEMENTS.md (613 lines) + product-roadmap.md (1443 lines); Completed Projects/CATEGORY_FIXES.md (367 lines) + FINAL_WIRING_LOG.md (178 lines) + MIGRATION_PAGE_MAP.md (205 lines).

**Anchor SHA at session open:** `5ad6ad4` (current HEAD after 2026-04-25 admin-newsroom + bug-hunt session).

---

## Overlap map by topic

### T1 — `Future Projects/` is internally inconsistent about what got cut 2026-04-21

`Future Projects/README.md` says cleanup deleted `04_TRUST_INFRASTRUCTURE.md` + `17_REFUSAL_LIST.md` (plus `db/07_standards_doc_table.md` and 4 mockups). Yet:

- `views/web_welcome_marketing.md` lists **8 new public pages** to build (`/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`, `/archive/[date]`, `/recent`) and quotes the trust-infrastructure doc as the source for `/standards` content.
- `views/ios_adult_profile.md` adds a Settings "How Verity works" section with links to `/standards`, `/corrections`, `/refusals`, `/editorial-log` "per `04_TRUST_INFRASTRUCTURE.md`".
- `views/ios_adult_alerts.md` declares `Depends on: 17_REFUSAL_LIST.md`.
- `views/web_login_signup.md` declares `Depends on: 17_REFUSAL_LIST.md`.
- `views/web_leaderboard.md`, `views/web_notifications.md`, `views/web_welcome_marketing.md` all `Depends on: 17_REFUSAL_LIST.md`.
- `views/web_story_detail.md` removes "no `<ReportFormButton />`" and "no standards link" — i.e. consistent with the cuts.
- `views/00_INDEX.md` "What's not covered here" explicitly says "Standards / refusals / corrections / masthead public pages — Removed from scope in the 2026-04-21 Charter update."

Conclusion: the 00_INDEX inside `views/` is the only place that internalised the 2026-04-21 Charter cuts; the per-view docs were not updated, so multiple views still treat the deleted strategy docs as shipping deliverables.

### T2 — `db/03_corrections_table.md` and `db/06_trust_events_table.md` are documented as DEFERRED but still cited as shipping by other `views/*` docs

Both files are explicit: **DEFERRED per 2026-04-21 Charter update.** "If the table already exists" → drop or lock to editor-only. Yet `views/web_story_detail.md` still names `corrections` removal as a delete-from-current-file item (consistent), while `views/ios_adult_profile.md` adds `/corrections` to the iOS Settings menu (inconsistent — there should be no public `/corrections` page).

### T3 — `views/00_INDEX.md` file-count is wrong + references retired `@admin-verified`

- `views/00_INDEX.md` line 38 says "Kids iOS (8 files)" but enumerates 9 (`ios_kids_pair`, `_home_greeting`, `_reader`, `_quiz`, `_streak`, `_badges`, `_leaderboard`, `_profile`, `_expert`). Filesystem confirms 9 files.
- `views/00_INDEX.md` line 51 says "Admin views… are `@admin-verified` LOCKED per CLAUDE.md". The `@admin-verified` marker was retired 2026-04-23 (memory: `feedback_admin_marker_dropped.md`). Current admin protection is the 6-agent ship pattern; the marker is gone.
- `db/00_INDEX.md` line 41 also references the retired `@admin-verified` marker.
- `db/00_INDEX.md` line 54 instructs "Log shipment in `Current Projects/FIX_SESSION_1.md`" — `FIX_SESSION_1.md` was retired and absorbed into `MASTER_TRIAGE_2026-04-23.md` per current CLAUDE.md.

### T4 — Mockups: `web-home.html` and `web-home-standalone.html` are byte-identical

`diff` returns no output. `mockups/README.md` lists only `web-home.html` (8 mockup files), not the standalone variant. The standalone copy carries permission `-rw-------` vs the others' `-rw-r--r--`, and was last touched 2026-04-22 — looks like an incidental copy.

### T5 — `Unconfirmed Projects/product-roadmap.md` is the OLD (pre-Future-Projects) roadmap

Last updated 2026-04-19. 1443 lines. References retired files (`/WORKING.md`, `docs/runbooks/CUTOVER.md`, `docs/planning/FUTURE_DEDICATED_KIDS_APP.md`, `docs/reference/Verity_Post_Design_Decisions.md`). Wholly superseded by `Future Projects/18_ROADMAP.md` (2026-04-21, panel-driven phase plan). Massive content overlap on:

- Pricing model → now in `Future Projects/02_PRICING_RESET.md`
- Trial flow → now in `Future Projects/03_TRIAL_STRATEGY.md`
- Defection path → now in `Future Projects/06_DEFECTION_PATH.md`
- Editor system → now in `Future Projects/05_EDITOR_SYSTEM.md`
- Home rebuild → now in `Future Projects/09_HOME_FEED_REBUILD.md`
- Summary format → now in `Future Projects/10_SUMMARY_FORMAT.md`

The kids decision in product-roadmap (full standalone Kids app, deep-link hand-off) matches `Future Projects/07_KIDS_DECISION.md` directly.

### T6 — `Unconfirmed Projects/UI_IMPROVEMENTS.md` is a 4-peer UI audit dated 2026-04-19, partially superseded

613 lines. Authored before the Future Projects panel run. Many UI items are now reframed inside Future Projects:

- Design tokens / typography → `Future Projects/08_DESIGN_TOKENS.md`
- Accessibility / Dynamic Type → `Future Projects/16_ACCESSIBILITY.md`
- Paywall voice → `Future Projects/11_PAYWALL_REWRITE.md`
- Kids motion polish → `Future Projects/14_KIDS_CHOREOGRAPHY.md`
- Quiz unlock moment → `Future Projects/13_QUIZ_UNLOCK_MOMENT.md`

UI_IMPROVEMENTS still has unique items not covered in Future Projects (e.g. specific component-level audit findings on `ProfileSubViews.swift` and `SettingsView.swift`). Some findings have been shipped per `Sessions/04-21-2026/` logs but the doc itself hasn't been updated to reflect ship state.

### T7 — `Completed Projects/` is v1-era; uses retired `site/src/` paths

All three files predate the `site/` → `web/` rename:

- **CATEGORY_FIXES.md** (367 lines, dated by topic-by-topic bug-hunt). Uses `site/src/app/...`, `site/src/components/...` everywhere. References migration `034_bugfix_ask_expert_tier.sql` (current schema is at 177+). References retired tables: `community_notes`, `morning_digest`, `flag_digest`, `reactions`, `REACTION_TYPES`, `toggleReaction`, `handleAskExpert`, `read_scroll_depth_pct` config — most explicitly noted as already-removed in Phase 13.
- **FINAL_WIRING_LOG.md** (178 lines, dated 2026-04-15). Phase 0–5 wiring log. `site/` paths.
- **MIGRATION_PAGE_MAP.md** (205 lines). v1→v2 migration page-by-page map. References `reset_and_rebuild.sql` (v1 deprecated) and `reset_and_rebuild_v2.sql` (current canonical, still present in `schema/`). `site/src/` paths throughout.

The substance (which routes existed, which v1 features were dropped) is now historical. Treating these as completed-archive is correct — the retired-path references make them unsuitable for any current grep/jump-to-file workflow.

### T8 — Pricing in `views/ios_adult_subscription.md` is not locked

The doc names prices ($6.99 / $12.99 / $19.99 / $29.99) and qualifies: "Option A per `02_PRICING_RESET.md`; adjust if owner committed Option B." `02_PRICING_RESET.md` (Session 4 read) presents Option A vs Option B without an owner-locked decision. Current Apple Connect product IDs (per recon) carry the in-effect pricing; the spec doc has not been reconciled.

### T9 — `Future Projects/09_HOME_FEED_REBUILD.md` bridge state vs `db/04_editorial_charter_table.md` final state

`09_HOME_FEED_REBUILD.md` "Current state" note says the feed temporarily reads `articles.hero_pick_for_date` until `front_page_state` table ships. `db/04_editorial_charter_table.md` lists `front_page_state` as a primary deliverable (Phase 1 Week 3). No SHIPPED marker on either side; current code state is not asserted in either doc.

### T10 — `Future Projects/24_AI_PIPELINE_PROMPTS.md` (V4) vs Current Projects `F7-DECISIONS-LOCKED.md` (Phase 4 SHIPPED)

Cross-zone hook continuing from Session 2 / Session 3. `F7-DECISIONS-LOCKED.md` (Current Projects) records Phases 1–4 as SHIPPED with a specific 12-step orchestrator and prompt structure. `Future Projects/24_AI_PIPELINE_PROMPTS.md` proposes V4 prompts that diverge from the SHIPPED set (different version system, different prompt-override path). No reconciliation marker on either side.

### T11 — `views/web_search.md` proposes a `/` keyboard shortcut, contradicting `views/web_profile.md` and the no-shortcuts memory

`views/web_profile.md` (lines 21–24) explicitly removes the existing 1/2/3/4 + g+chord shortcuts citing the no-shortcuts memory. `views/web_search.md` (line 67) adds an acceptance criterion: "`/` keyboard focuses search from any page (verify single non-admin keyboard binding is acceptable — this is a standard browser convention, not a custom shortcut)." Memory rule says "No keyboard shortcuts in admin UI" — wording leaves the reader-side gray, but two docs in the same folder land on opposite verdicts without cross-reference.

### T12 — `Future Projects/VISION_KINETIC_EDITION.md` is exploratory; not pulled into 18_ROADMAP

VISION_KINETIC_EDITION.md is labelled "vision document, not a spec". Five pillars (kinetic typography, ambient haptics, etc.) — not referenced from `18_ROADMAP.md` Phase 1–5, not referenced from any `views/*`. Standalone exploratory artifact.

### T13 — `home-page-spec-vs-research.md` is a single-purpose comparison doc

Reconciles `09_HOME_FEED_REBUILD.md` against panel research notes. Standalone, one-shot artifact. No conflicting references found.

---

## Confident bucket (ready for cleanup decisions)

**C-1.** `Future Projects/mockups/web-home-standalone.html` is byte-identical to `web-home.html` and is not referenced by `mockups/README.md` or `mockups/index.html`. Safe candidate for deletion.

**C-2.** `Future Projects/views/00_INDEX.md` line 38 file-count says "Kids iOS (8 files)" — actual is 9. Single-line factual fix.

**C-3.** `Future Projects/views/00_INDEX.md` line 51 references retired `@admin-verified` marker.

**C-4.** `Future Projects/db/00_INDEX.md` line 41 references retired `@admin-verified` marker.

**C-5.** `Future Projects/db/00_INDEX.md` line 54 references retired `Current Projects/FIX_SESSION_1.md` (now `MASTER_TRIAGE_2026-04-23.md`).

**C-6.** `Completed Projects/CATEGORY_FIXES.md` uses retired `site/src/` paths everywhere; references migration 034 (current schema is 177+); references multiple retired tables and helpers (`community_notes`, `reactions`, `REACTION_TYPES`, `toggleReaction`, `handleAskExpert`, `flag_digest`, `morning_digest`). The doc is historical archive of v1-era bug-hunt; either retire to `Archived/` or annotate as v1-era at the top.

**C-7.** `Completed Projects/FINAL_WIRING_LOG.md` dated 2026-04-15, uses retired `site/src/` paths. Same archive-vs-annotate decision as C-6.

**C-8.** `Completed Projects/MIGRATION_PAGE_MAP.md` uses retired `site/src/` paths; references v1-deprecated `reset_and_rebuild.sql`. Same archive-vs-annotate decision.

**C-9.** `Unconfirmed Projects/product-roadmap.md` (1443 lines, 2026-04-19) is wholly superseded by `Future Projects/18_ROADMAP.md` (2026-04-21) and the per-topic Future Projects strategy docs. References retired files (`/WORKING.md`, multiple `docs/...` paths). Safe candidate to retire to `Archived/`.

**C-10.** `Unconfirmed Projects/UI_IMPROVEMENTS.md` (2026-04-19) is largely superseded by Future Projects docs (08_DESIGN_TOKENS, 16_ACCESSIBILITY, 11_PAYWALL_REWRITE, 14_KIDS_CHOREOGRAPHY). Component-level findings that are NOT in Future Projects need to be either (a) folded into the relevant `views/*` doc, or (b) marked obsolete with reference to the superseding spec.

**C-11.** Multiple `views/*` docs declare `Depends on: 17_REFUSAL_LIST.md` or `04_TRUST_INFRASTRUCTURE.md` — both files were deleted in the 2026-04-21 cleanup per `Future Projects/README.md`. Affected files: `web_login_signup.md`, `web_leaderboard.md`, `web_notifications.md`, `web_welcome_marketing.md`, `ios_adult_alerts.md` (and probably more — full-grep recommended in the cleanup pass). Either restore the deleted strategy docs or strip the dependency lines.

**C-12.** `Future Projects/db/03_corrections_table.md` and `db/06_trust_events_table.md` are explicitly DEFERRED, but `views/ios_adult_profile.md` and `views/web_welcome_marketing.md` still treat `/corrections` as a shipping public page. Inconsistent surface vs DB intent.

---

## Inconsistent bucket (project-itself-is-inconsistent — flag for resolution session)

**I-1.** `Future Projects/views/web_welcome_marketing.md` enumerates 8 new public trust/editorial pages (`/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`, `/archive/[date]`, `/recent`) as "new pages to build", while `views/00_INDEX.md` declares "Standards / refusals / corrections / masthead public pages — Removed from scope in the 2026-04-21 Charter update." Direct head-on contradiction inside the same folder. Need an owner call: which bucket is the trust surface in? (This is the same thread as the Session 2 finding "F1–F4 vs PRELAUNCH" charter-commitment churn.)

**I-2.** `Future Projects/views/web_search.md` proposes a `/` keyboard shortcut, while `views/web_profile.md` actively removes existing 1/2/3/4 + g-chord shortcuts citing the no-shortcuts memory. Memory rule says admin UI; reader-side is unstated. Need scope clarification.

**I-3.** Pricing in `Future Projects/02_PRICING_RESET.md` and `views/ios_adult_subscription.md` carries an unresolved "Option A vs Option B" — no owner-locked decision is recorded in either doc. Live App Store Connect product IDs are the de-facto truth; specs have drifted.

**I-4.** `Future Projects/24_AI_PIPELINE_PROMPTS.md` V4 vs `Current Projects/Audit_2026-04-24/F7-DECISIONS-LOCKED.md` Phase 4 SHIPPED — different prompt-version system. (Continued cross-zone hook from Session 2 / Session 3.) Need owner call: is V4 the next-cycle iteration or stale-and-superseded?

**I-5.** `Future Projects/09_HOME_FEED_REBUILD.md` bridge note (`articles.hero_pick_for_date` until `front_page_state` ships) vs `db/04_editorial_charter_table.md` (treats `front_page_state` as Phase 1 Week 3 deliverable). Neither has a SHIPPED marker; current state of the home page on `web/` is the resolver but neither doc records it. Will resolve in Session 8 (web read).

**I-6.** `Unconfirmed Projects/UI_IMPROVEMENTS.md` was the panel feedback prior to the Future Projects authoring run. Some items have been shipped (per Sessions logs); some have been folded into Future Projects; some are unaddressed. The doc itself does not mark per-item ship state. Need a reconciliation pass: per-item, does it (a) ship, (b) move to Future Projects spec, or (c) drop.

**I-7.** `Future Projects/VISION_KINETIC_EDITION.md` exists as standalone exploratory doc not referenced from any roadmap or view spec. Status unclear: aspirational / dead-letter / next-cycle? No owner annotation.

---

## Open questions (need owner direction before next-session work)

**Q-1.** Is `Future Projects/` the canonical strategy folder, with `Unconfirmed Projects/` slated for retirement? (If yes: archive product-roadmap and UI_IMPROVEMENTS; if no: explain what `Unconfirmed Projects/` is for.)

**Q-2.** Are the trust-infrastructure pages (`/standards`, `/corrections`, etc.) cut from launch (per `views/00_INDEX.md` + Charter commitment 4) or still slated to ship (per `views/web_welcome_marketing.md`)? This is the same recurring churn from Session 2 — owner call needed once.

**Q-3.** Should `Completed Projects/` be moved into `Archived/` wholesale? The three files use retired paths and reference v1-era artifacts; their value is purely historical.

---

## Cross-zone hooks (carried forward to later sessions)

- **CZ-A (continued from S2/S3):** F7 prompts — `Future Projects/24_AI_PIPELINE_PROMPTS.md` V4 vs `F7-DECISIONS-LOCKED.md` Phase 4 SHIPPED. Will be re-touched in Session 8 (web/lib/pipeline) and Session 11 synthesis.
- **CZ-B (continued from S1):** Reference/STATUS.md vs `Unconfirmed Projects/product-roadmap.md` — both make claims about current state and roadmap. STATUS.md is canonical per CLAUDE.md; product-roadmap is older. Will be re-touched in Session 11 synthesis.
- **CZ-C (new):** Multiple views/* declare dependencies on deleted strategy docs (`17_REFUSAL_LIST.md`, `04_TRUST_INFRASTRUCTURE.md`). Full grep + clean-up pass deferred to Session 11.
- **CZ-D (new):** `front_page_state` state-of-implementation — bridge note in 09_HOME_FEED_REBUILD vs db/04. Will be resolved in Session 8 (web read) by reading the current `web/src/app/page.tsx`.
- **CZ-E (new):** `Completed Projects/` vs `Archived/` — Session 6 (Archived/) read may reveal whether anything from Completed Projects has already been migrated. If so: redundant. If not: confirm move recommendation.

---

## Plan for Session 5

`Sessions/` logs. Per the earlier folder audit there are ~10–12 dated session folders, each containing multiple session sub-logs. The most recent few are load-bearing (active work context); older logs are historical.

Approach:
1. List `Sessions/` contents by mtime.
2. Full-read the **5 most recent** session folders end-to-end (likely 04-21-2026 through 04-25-2026).
3. Sample 1–2 older folders for shape/format consistency.
4. Map session-log claims against:
   - `Reference/STATUS.md` (Session 1 baseline)
   - `Current Projects/MASTER_TRIAGE_2026-04-23.md` SHIPPED blocks (Session 2)
   - `Audit_2026-04-24/` artifacts (Session 3)
5. Surface session-log claims that contradict either canonical doc.
6. Write `AuditV1/05-sessions-overlap-map.md`.
7. Update `AuditV1/00-README.md` status table.
