# Session 2 — Current Projects/ root, full content audit

**Date:** 2026-04-25
**Files read end-to-end (14):** `APP_STORE_METADATA.md` (409), `F1-sources-above-headline.md` (58), `F2-reading-receipt.md` (81), `F3-earned-chrome-comments.md` (110), `F4-quiet-home-feed.md` (112), `F5-ads-gameplan.md` (387), `F6-measurement-and-ads-masterplan.md` (820), `F7-DECISIONS-LOCKED.md` (502), `F7-PHASE-3-RUNBOOK.md` (374), `F7-PM-LAUNCH-PROMPT.md` (331), `F7-pipeline-restructure.md` (635), `MASTER_TRIAGE_2026-04-23.md` (256), `PM_PUNCHLIST_2026-04-24.md` (70, read in prior turn), `PRELAUNCH_UI_CHANGE.md` (596).
**Not read:** `Audit_2026-04-24/` subfolder (Session 3), `ad-mockups/` subfolder (code asset, not a doc).
**Total:** ~4,741 lines.

---

## Topic map

### T1. F7 has four docs covering the same project

| File | Date | What it is | Status today |
|---|---|---|---|
| `F7-pipeline-restructure.md` | 2026-04-21 | Original 635-line plan: schema design, Discover page spec, build order | **Mostly superseded** by DECISIONS-LOCKED and the actual ship history; conflicts with locked decisions on key choices |
| `F7-PM-LAUNCH-PROMPT.md` | 2026-04-22 | 331-line PM session-start prompt: role rules, sources, phased plan | §5 explicitly self-supersedes ("STATUS: all 8 decisions are locked… read F7-DECISIONS-LOCKED.md… The summary below is a cheat-sheet; the locked file is canonical"). Rest of doc is partly stale, partly unique. |
| `F7-DECISIONS-LOCKED.md` | 2026-04-22 | 502-line owner-locked contract for F7. "If any prior doc conflicts with this file, this file wins." | **Canonical.** Includes per-task SHIPPED log inline (lines 372–491). |
| `F7-PHASE-3-RUNBOOK.md` | 2026-04-22 | 374-line operational runbook for the orchestrator | **Active operations doc.** Mostly self-contained; some content duplicates DECISIONS-LOCKED. |

#### T1a. Conflicts between F7-pipeline-restructure and F7-DECISIONS-LOCKED

- **Kid data model:** restructure §6 picks "single articles row + kid columns + `is_kid` flags" (lines 317–356). DECISIONS-LOCKED Decision 2 (lines 24–32) picks "two fully separate tables. Adult content stays in `public.articles`. Kid content lives in a new `public.kid_articles`." **Direct opposite.** What shipped (per DECISIONS-LOCKED SHIPPED log + the schema 114 description) is the separate-tables model.
- **Model provider:** restructure §7 picks "Anthropic-only for v1" (lines 360–401), defers provider abstraction to phase 2. DECISIONS-LOCKED Decision 3 (lines 36–129) picks "multi-provider (Anthropic + OpenAI + future) with a per-run provider + model picker on `/admin/newsroom`". **Direct opposite.** What shipped supports both.
- **Endpoint paths:** restructure §8 lists endpoints under `/api/newsroom/*` and `/api/discover/*` (lines 410–456). What actually shipped uses `/api/admin/pipeline/generate`, `/api/admin/newsroom/clusters/:id/unlock`, `/api/newsroom/ingest/run`, etc. Different namespacing.
- **Schema migration:** restructure §9 proposes ONE migration adding columns to `articles` and creating `discovery_items` / `discovery_groups` (lines 461–531). DECISIONS-LOCKED Phase 1 ships 8 separate migrations (114, 116, 118, 120, 122, 124, 126) creating 8 NEW tables instead of altering articles. Different topology entirely.
- **Build order + time budget:** restructure §11 (~17 hours, 20 numbered tasks). What shipped: Phase 1 Tasks 1–4, Phase 2 Tasks 5–9, Phase 3 Tasks 10–19, Phase 4 Tasks 20–27, with several tasks each ≥1 day of work. Sequence and counts diverge.
- **Phase 2 deferrals:** restructure §13 says "Per-step provider/model dropdown matrix UI. Deferred to phase 2" (line 613). DECISIONS-LOCKED Decision 3 makes per-run picker v1. Reverses the deferral.

#### T1b. F7-PM-LAUNCH-PROMPT staleness

- §4 line 109 references `schema/105` through `schema/111` as "recent migrations" — current is `schema/177`. Same 66-migration staleness as Reference/PM_ROLE.md (T10 from Session 1).
- §3d (lines 60–62) "Files marked `@admin-verified <date>` in `web/src/app/admin/**` are LOCKED. Do not propose edits without owner sign-off per file. The current `/admin/pipeline/page.tsx` carries this marker." Per memory `feedback_admin_marker_dropped`, markers retired 2026-04-23. Same conflict as T12 from Session 1.
- §4 line 96 references the snapshot at `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/`. Not verified in this audit; could exist or not.
- §5 (lines 113–119) acknowledges its own §5 supersession but only flags the 8-decision summary; rest of doc still claims to be "the launch prompt" with phased plan that doesn't match what shipped (e.g., §6 Phase 3 "step endpoints" list at line 172–176 doesn't match the orchestrator path).
- §1 (lines 8–14) anchors operating mode to PM_ROLE.md ("PM-as-orchestrator rule is absolute and overrides anything in CLAUDE.md that frames the assistant as 'hands-on thinking brain.'"). Same I-1 conflict from Session 1.

#### T1c. Duplications between F7-DECISIONS-LOCKED and F7-PHASE-3-RUNBOOK

- **The 12-step orchestrator vocabulary** appears verbatim in DECISIONS-LOCKED §5 lines 328–350 ("step_name canonical list") and PHASE-3-RUNBOOK §3a lines 61–67 ("step vocabulary").
- **Cost cap settings** appear in DECISIONS-LOCKED Decision 4 settings table (lines 137–159) and PHASE-3-RUNBOOK §5 cost cap enforcement (lines 192–200). DECISIONS is more comprehensive; runbook restates a subset.
- **Cluster lock RPC:** PHASE-3-RUNBOOK §4 (lines 119–179) shows the SQL for `claim_cluster_lock` and `release_cluster_lock` and labels it "(Final RPC spec locked during Task 11 planning; this is the draft.)". The shipped implementation (verified earlier when I read the cron route) uses `locked_at` (not `locked_until`) and `generation_state` columns. Runbook §4 is therefore **stale draft** vs the shipped migration 116. The runbook even mentions this in Task 11 changelog at line 360–361 ("`feed_clusters.locked_by/locked_at/last_generation_run_id/generation_state` columns + `claim_cluster_lock(cluster_id, locked_by, ttl_sec=600)` + `release_cluster_lock(cluster_id, locked_by)` RPCs (explicit `p_locked_by` since `auth.uid()` is NULL under service role)") — so the runbook contradicts itself within the same file.
- **PHASE-3-RUNBOOK §1** says "the click-to-generate chain. One click = complete draft including quiz" plus a 10-prompt chain description (lines 9–11). DECISIONS-LOCKED Decision 8 + the 12-step canonical list say 12 steps, not 10. **Runbook says 10-prompt chain in two places** (§1 line 11, §8 line 261–262), but its own §3a vocabulary lists 12. Internal inconsistency.

#### T1d. F7-DECISIONS-LOCKED internal staleness

- Line 486 says "Phase 4 continues with Tasks 21+ (cluster detail, run detail UI) next session." But Task 27 SHIPPED block at lines 488–490 covers run detail page. Doc was edited in place after that "next session" line; the line wasn't updated. Confused reader-experience but not factually wrong.
- "Choice 8 — Quiz generation phase — Plus: quiz verification step (from audit — snapshot has this, locked file was missing it). After quiz generation, a HAIKU fact-check pass… patches wrong `correct_index` values" (lines 230). But Phase 1 pre-flight item 13 (line 285) says "port from snapshot/...pipeline/route.js:532-561. Haiku fact-check, patches wrong correct-indices." And §5 step list line 348 says "spec reconciled 2026-04-22 to match `generate/route.ts:1338-1343` behavior — earlier 'patches' wording was aspirational; implementation chose throw-and-regenerate for safety." So Decision 8 still says "patches" (line 230); the actual behavior is "throw-and-regenerate" per §5. **Internal contradiction within DECISIONS-LOCKED itself.**

### T2. F1–F4 specs vs PRELAUNCH_UI_CHANGE — competing designs

Per memory `feedback_kill_switched_work_is_prelaunch_parked`, F1–F4 are launch-parked. PRELAUNCH_UI_CHANGE.md (2026-04-25) is the live redesign doc. Where they touch the same surface:

- **Source attribution placement on article page:**
  - F1 (line 10–17): small-caps line ABOVE the headline — "REPORTED FROM · NYT · REUTERS · BBC".
  - PRELAUNCH §3.2 (line 105): "Source chips inline. Today sources live at the bottom. Move them inline as the reader encounters them — superscript number, tap to reveal a citation card."
  - **Conflicting designs.** F1 = above headline as banner; PRELAUNCH = inline superscript citations.

- **Reading receipt:**
  - F2 (entire file): monospaced "receipt stub" at end of article showing read time, quiz score, score delta.
  - PRELAUNCH: no mention anywhere of a reading receipt.
  - F2 was an aesthetic move; PRELAUNCH dropped it without documentation.

- **Comments visibility before quiz pass:**
  - F3 (entire file): hide comment section completely from anon and pre-pass users — "Delete branches 2 and 3 entirely. Replace with `null`." (line 60). Comments materialize on pass via 400ms transition.
  - PRELAUNCH §3.2 (line 106): "Comments unfold on pass. The Discussion panel literally slides in beneath the article." Same idea, more developed (uses the global 200ms transition).
  - **Same direction; PRELAUNCH absorbs F3 without retiring F3.**

- **Home feed design:**
  - F4 (entire file): strip home to near-nothing — "No category pills, no trending rail, no 'popular' section, no breaking banner, no author avatars, no cover images. Just headlines in serif, with a single muted line of meta." (lines 4–7).
  - PRELAUNCH §3.1 (lines 90–94): "Hero gets full-bleed treatment. Image bleeds to viewport edges (web) or screen edges (iOS), title overlays bottom-left in serif display, single source byline beneath."
  - **Direct opposite.** F4 = quiet/text-only/no images; PRELAUNCH = full-bleed image-led hero.

### T3. F5 vs F6 — ads docs

- **F5-ads-gameplan.md** (387 lines) = fill-in-the-blanks gameplan with 8 still-unanswered decisions in §1 (D1–D8: AdSense pub ID, networks, CMP choice, launch countries, paid-tier exclusion, reduced-tier, kids-no-ads-confirmed, iOS-ads-default-no). §2 placement catalog has empty checkboxes throughout. §3 worksheet template has empty fields.
- **F6-measurement-and-ads-masterplan.md** (820 lines) = comprehensive system architecture covering ads + analytics + scoring + GA4 + ClickHouse. Self-references F5: "Reframing the prior gameplan into operational terms" (line 360). F6 does not retire F5 but supersedes its scope.
- **Overlap:** Both docs cover ad placements, network setup, CMP, viewability, fraud. F6 covers it as part of broader telemetry; F5 is ads-focused. Reader has to read both to know what the actual plan is.
- **F6 §5 Scoring system** (lines 507–605) is **fully stale.** Describes the rolled-back schema/109 verity_score_events ledger design. Reference/PM_ROLE.md §6 explicitly flags this: "Group A — doc-only — Item 1: F6 references the rolled-back schema/109 design in three places: §5, Phase A item #2 under §7 Execution order, and item #2 under What ships first." This is a known issue but the F6 doc still hasn't been corrected (T7 from Session 1 confirms the canonical scoring reference is `Reference/08-scoring-system-reference.md`).

### T4. MASTER_TRIAGE_2026-04-23.md (the canonical tracker)

- Live-state tracker with explicit per-item resolution markers (`SHIPPED <date> · <SHA>`, `STALE <date>`, `DEFERRED <date>`).
- 4 "Round" sections + Round 4 additions from 2026-04-25 (BH1–BH8).
- Maintained well: most recent edit timestamps current, SHA references match commit log.
- **Tier 0 (handler crashes) — NEITHER SHIPPED:**
  - #1: `web/src/app/api/admin/users/[id]/roles/route.js:130` DELETE → undefined `assertActorOutranksTarget`. Every revoke 500s.
  - #2: `web/src/app/api/admin/billing/cancel/route.js:37` + `freeze/route.js:35` ReferenceError on every cross-user mutation.
  - These are documented as crashes but neither has a SHIPPED marker. **Open production-bug status.**
- **Tier 1 (4/4 unanimous CRITICAL) — partial ship:**
  - #4 (StoryDetailView quiz threshold), #6 (PasswordCard signInWithPassword), #7 (Ad.jsx unsanitized href), #8 (CSS injection via avatar/banner) — none have SHIPPED markers in the tracker.
  - #3 (auth/email-change), #5 (profile/[id] direct DB writes — RESOLVED-BY-9), #9 (profile/[id] tab nav) — all carry resolution notes.
- **B1 (Stripe webhook perms_version)** — flagged in OWNER_ACTIONS O-DESIGN-08 but no SHIPPED marker in MASTER_TRIAGE.
- **B3 (iOS receipt hijack)** — no SHIPPED marker.
- **K5 (ParentalGateModal call sites)** — no SHIPPED marker. Same item as PRELAUNCH §3.13 ("ParentalGateModal call-site audit. Verify it fires on every external link / payment / mailto.")

### T5. APP_STORE_METADATA.md — pre-2026-04-21 path references

- Line 5: "Cross-checked against `REFERENCE.md`, `FEATURE_LEDGER.md`, `site/src/app/page.tsx`, `site/src/app/how-it-works/page.tsx`, `00-Reference/Verity_Post_Design_Decisions.md`" — **all use `site/`** (renamed to `web/` per CHANGELOG 2026-04-20) and the `00-Reference/` numeric prefix (retired in 2026-04-21 reorg per PM_ROLE.md).
- Line 226: "`admin.veritypost.com` (Next.js routes under `site/src/app/admin/**`)" — `site/` reference.
- Line 266–272 URL table: 5 cross-references to "Exists — `site/src/app/...`". All `site/` references.
- Line 402–409 cross-references list: `00-Where-We-Stand/REFERENCE.md`, `00-Where-We-Stand/FEATURE_LEDGER.md`, `00-Reference/Verity_Post_Design_Decisions.md`, `test-data/accounts.json`, `site/src/app/api/ios/...`. **Five separate stale paths in the cross-reference block alone.**
- Line 405 references `test-data/accounts.json` — per Reference/PM_ROLE.md line 399, `seed-test-accounts.js` was retired to `Archived/_retired-2026-04-21/`. The `test-data/` folder may or may not still exist; per Reference/README.md it's listed in the layout, but Reference/README.md is itself stale (Session 1 T17). Need to verify Session 7.
- Line 247 review-notes: "creating or editing a kid profile on iOS opens an informational panel that redirects the parent to the web app to complete COPPA consent. This is intentional while we ship the full native flow." — Per the kids iOS audit + STATUS.md, the kids iOS app does have a real pair-code flow with custom JWT. So this review-notes language is informational about a fallback mode. Owner should confirm the language is still accurate vs the actual launch state.

### T6. PRELAUNCH_UI_CHANGE.md internal contradictions

- **Part 5 (line 297)** lists "What stays the same (intentionally): All RPCs and DB schema. Permission matrix. Plan catalog. Score tiers. Score rules. Rate limits."
- **§3.13 line 224** proposes "Pull illustrations from `articles.illustration_url` (column add, UI-only)." **Internal contradiction** — schema-stays-same conflicts with column-add.
- Also: this column-add references `articles.illustration_url` — but per F7 Decision 2 (T1a above), kid content lives in a separate `kid_articles` table. If illustrations are kid-specific, the column should be on `kid_articles`. If they're for adult articles, fine — but PRELAUNCH §3.13 is the Kids section so the proposal is muddled.
- **§3.4** (Settings split, lines 121–126) describes the 11-shim flip and is the "HIGH risk" item per §9.1. References `web/src/app/profile/settings/page.tsx` as ~3,800 lines. Per CLAUDE.md (Session 1 T1), the settings page is "the 3800-line settings page — giant, careful edits." Numbers match.

### T7. PM_PUNCHLIST_2026-04-24.md (already read in prior turn)

- Self-disclaims as "not canonical" (line 3).
- Has unique content not duplicated in OWNER_TODO/OWNER_ACTIONS/MASTER_TRIAGE: owner-reported UI-COMMENTS / UI-SETTINGS / UI-OTHER bugs (lines 15–18), tracker-known cross-refs (T0/B/L/K items, lines 21–27), quality-debt section (lines 56–61) flagging 94 type-escape hatches, 33+ next-lint warnings, CSP Report-Only at middleware.js:188, tsconfig `strict: false`, expert Q&A `#if false` block.
- Line 59: "CSP still `Report-Only` at `web/src/middleware.js:188` (#00-F)" — **independent confirmation of the I-2 conflict from Session 1.** CLAUDE.md says CSP is "(enforce)"; PM_ROLE.md and now PM_PUNCHLIST agree it's Report-Only. 2 docs vs 1.
- Line 60: "`web/tsconfig.json: 'strict': false`" — but per the web config audit earlier in this session, `tsconfig.json` has `strict mode: true`. **Direct conflict.** PM_PUNCHLIST is wrong, OR the web config audit was wrong. Verify Session 8.

### T8. Cross-doc duplications inside Current Projects/

- **The 8 owner-locked F7 decisions** appear in three places: F7-PM-LAUNCH-PROMPT §5 (lines 113–129, with notice that they're superseded), F7-DECISIONS-LOCKED whole document, F7-pipeline-restructure §12 (open decisions, all now resolved). Three copies, one canonical.
- **The Anthropic/OpenAI provider strategy** appears in F7-PM-LAUNCH-PROMPT §6 Phase 1 deliverables (line 137), F7-DECISIONS-LOCKED Decision 3 (lines 36–129), F7-pipeline-restructure §7 (lines 360–401). Three different versions; restructure now reverse-of-canonical.
- **The kids data model decision** appears in F7-PM-LAUNCH-PROMPT §5 (line 117), F7-DECISIONS-LOCKED Decision 2 (lines 24–32), F7-pipeline-restructure §6 (lines 317–356). Three versions; restructure is reverse-of-canonical.
- **`<source_article>` prompt-injection wrapping** appears in F7-DECISIONS-LOCKED Phase 1 pre-flight #2 (lines 270) and F7-PHASE-3-RUNBOOK §11 line 337. Both consistent.
- **24-hour discovery purge** appears in F7-DECISIONS-LOCKED Decision 7 (lines 197–222) and F7-pipeline-restructure §4 cleanup-cron (lines 240–249). Restructure proposes a different SQL than DECISIONS-LOCKED. Restructure's version is superseded.

### T9. Cross-zone hooks — Current Projects/ vs Reference/

- **F7-PM-LAUNCH-PROMPT.md §1** anchors the assistant to PM_ROLE.md mode. This is the same I-1 conflict from Session 1: PM_ROLE.md (orchestrator-only) vs CLAUDE.md (hands-on engineer). F7's PM-LAUNCH explicitly endorses PM_ROLE; today's session operates in CLAUDE mode. F7 work would in theory have been done under PM_ROLE rules. Whether it actually was is something Session 5 (Sessions/) can verify.
- **APP_STORE_METADATA references retired paths** (`site/`, `00-Where-We-Stand/`, `00-Reference/`, `test-data/`) that match the staleness pattern of Reference/FEATURE_LEDGER.md and Reference/README.md. Same migration-not-completed-here issue.
- **MASTER_TRIAGE B1** ("Stripe webhooks don't bump perms_version") is referenced in Reference/CLAUDE.md / STATUS.md as part of the canonical permissions cache description, but MASTER_TRIAGE marks it as still open. STATUS.md doesn't surface it as launch-blocking.
- **PRELAUNCH §6.1 weekly-digest removal** lists `email_templates.weekly_reading_report` and `email_templates.weekly_family_report` for soft-delete. Reference/CHANGELOG.md (2026-04-20 entry) only mentions `data_export_ready` template seeded. Whether the weekly templates exist in DB is a Session 7 verification item (`schema/`).
- **PRELAUNCH §3.13 ParentalGateModal call-site audit** is the same item as MASTER_TRIAGE K5 and FEATURE_LEDGER.md's open-items list. Three docs reference the same audit need. None has a SHIPPED marker.

### T10. Internal consistency within MASTER_TRIAGE

- Open-without-marker count for Tier 0–1 critical bugs: **5 items** (Tier 0 #1, #2; Tier 1 #4, #6, #7, #8; **plus** Tier 2 B1, B3 carry HIGH-impact and don't have SHIPPED markers). These are documented but not resolved on disk per the tracker itself. Should be visible in any "what's launch-blocking" view.

---

## Confident bucket — Current Projects/ only

1. **`F7-pipeline-restructure.md` is mostly superseded.** ~60% of content (kids model decision, provider strategy, endpoint paths, schema migration shape, build sequence) is opposite of or stale relative to what shipped. Useful for "how we got here" archaeology only.
2. **`F7-PM-LAUNCH-PROMPT.md` self-supersedes its own §5** but still has stale references throughout (migrations 105–111, `@admin-verified` markers, mismatched phased plan).
3. **`F7-DECISIONS-LOCKED.md` has internal contradictions** — Decision 8 says quiz-verification "patches wrong correct_index values" while §5 step list line 348 says "implementation chose throw-and-regenerate for safety." Pick one and update Decision 8.
4. **`F7-PHASE-3-RUNBOOK.md` has multiple internal inconsistencies:**
   - §1 line 11 + §8 line 261 say "10-prompt chain"; §3a lists 12.
   - §4 cluster-lock RPC (lines 119–179) labeled "draft" describes `locked_until` columns; the actual shipped migration 116 (per the file's own changelog at lines 360–361 + my read of the cron route earlier) uses `locked_at` + `generation_state`. Stale draft within doc.
5. **`F7-PHASE-3-RUNBOOK.md` and `F7-DECISIONS-LOCKED.md` duplicate** the 12-step canonical vocabulary verbatim and both restate the cost-cap settings table. Deduplicate by pointing one at the other.
6. **`F1-sources-above-headline.md` design conflicts with `PRELAUNCH §3.2`.** Both can't ship; one needs to be retired or the conflict resolved.
7. **`F4-quiet-home-feed.md` design conflicts with `PRELAUNCH §3.1`.** Same — one or the other.
8. **`F2-reading-receipt.md` is silently dropped** by PRELAUNCH (not mentioned anywhere). Either retire F2 explicitly or surface it.
9. **`F3-earned-chrome-comments.md` is absorbed into PRELAUNCH §3.2** but neither F3 nor PRELAUNCH cross-reference each other. F3 should retire and point at PRELAUNCH, or PRELAUNCH should credit F3.
10. **`F5-ads-gameplan.md` has 8 unanswered owner decisions** in §1 and unfilled checkboxes throughout §2. It's an unfilled-form artifact. Either lock the 8 decisions or retire it as superseded by F6.
11. **`F6-measurement-and-ads-masterplan.md` §5 (Scoring system) is fully stale.** Describes the rolled-back schema/109 design. Already known per Reference/PM_ROLE.md line 467; the doc still hasn't been corrected. Three locations inside F6 (§5, §7 Phase A item 2, §"What ships first" item 2) need rewrite or section-level retirement. Reader should be redirected to `Reference/08-scoring-system-reference.md`.
12. **`APP_STORE_METADATA.md` has 5+ stale paths** in cross-references (`site/`, `00-Where-We-Stand/`, `00-Reference/`, `test-data/`) plus ~6 inline `site/src/...` references. Bulk path-fix needed.
13. **`MASTER_TRIAGE_2026-04-23.md` Tier 0 + Tier 1 bugs without SHIPPED markers** — Tier 0 #1, #2 (handler crashes) and Tier 1 #4, #6, #7, #8 (4/4 unanimous critical) are documented as bugs but have no resolution markers. These are launch-blocking and should be top of any "what's left" view.
14. **`PM_PUNCHLIST_2026-04-24.md` line 60 claim that `tsconfig.json: 'strict': false`** contradicts the web config audit which read `strict: true`. One is wrong; verify in Session 8.
15. **`PRELAUNCH_UI_CHANGE.md` internal contradiction:** Part 5 says "All RPCs and DB schema… stay the same"; §3.13 proposes adding `articles.illustration_url`. Pick one — either schema is frozen or the column is added (and if added, the wording in §3.13 about adult vs kid placement needs clarity vs F7 Decision 2's separate-tables rule).

### What can be retired entirely from Current Projects/ (preview, contingent on owner sign-off)

- **`F7-pipeline-restructure.md`** → move to `Archived/F7-pipeline-restructure_superseded_2026-04-22.md` with a one-line header pointing at DECISIONS-LOCKED. Retains as historical archaeology, removes drift risk.
- **`F7-PM-LAUNCH-PROMPT.md`** → either rewrite to drop §5 (already self-superseded) and the stale phased plan, or move to Archived. PM-mode rules are duplicated in Reference/PM_ROLE.md anyway.
- **`F1`, `F2`, `F4` specs** → if PRELAUNCH wins (which it appears to per its 2026-04-25 date being newest), retire these to `Archived/`. F3 absorbs cleanly so retire too.
- **`F5-ads-gameplan.md`** → either fill in the 8 decisions (turn into a concrete plan) or retire as superseded by F6 §4.
- **`F6 §5 Scoring system` + 2 cross-refs** → strikethrough or section-level retirement; reader pointed at `Reference/08-scoring-system-reference.md`.

### What stays as canonical

- **`F7-DECISIONS-LOCKED.md`** — the contract. Fix the Decision 8 vs §5 quiz-verification inconsistency.
- **`F7-PHASE-3-RUNBOOK.md`** — operational. Fix 10 vs 12 prompt count + the stale RPC draft. Then deduplicate the canonical vocabulary against DECISIONS-LOCKED.
- **`MASTER_TRIAGE_2026-04-23.md`** — live tracker.
- **`PRELAUNCH_UI_CHANGE.md`** — active redesign spec.
- **`APP_STORE_METADATA.md`** — submission packet (after path fixes).
- **`PM_PUNCHLIST_2026-04-24.md`** — PM working baseline (despite self-disclaim, has unique content).
- **F6 §1–4, §6–10** — measurement architecture remains useful even though scoring §5 is stale.

---

## Inconsistent bucket — Current Projects/

### I-9. F1 vs PRELAUNCH source attribution (T2)

Two different designs for showing article sources. Owner needs to pick one.

### I-10. F4 vs PRELAUNCH home design (T2)

Quiet/text-only vs full-bleed/image-led. Owner needs to pick one.

### I-11. F7-DECISIONS-LOCKED Decision 8 vs §5 quiz-verification behavior (T1d)

"Patches wrong correct_index" vs "throw-and-regenerate." Both inside the same canonical file. The §5 wording references the actual implementation; Decision 8 is aspirational copy. Resolve in-doc by updating Decision 8 to match §5.

### I-12. PRELAUNCH §3.13 illustration_url column (T6)

Schema-stays-same statement vs proposed column-add. Plus, adult vs kid placement is muddled given F7 Decision 2's separate-tables design. Owner needs to clarify whether illustrations ship and where.

### I-13. PM_PUNCHLIST tsconfig strict claim (T7)

Two separate audits disagree on whether `web/tsconfig.json` has `strict: true` or `strict: false`. Resolved by reading the file in Session 8.

### I-14. MASTER_TRIAGE Tier 0/1 launch-blocking bugs without SHIPPED markers (T10)

Six documented critical bugs (`roles DELETE` 500, billing actor.id ReferenceError, iOS quiz threshold, PasswordCard, Ad.jsx XSS, CSS injection avatar/banner) have no resolution status. Either they shipped and the tracker missed the markers, or they're genuinely open and launch-blocking. Cannot resolve from doc-read alone — Session 7/8/9 (code + git log) can verify.

### I-15. F7-PHASE-3-RUNBOOK §4 stale RPC draft vs shipped (T1c)

The runbook's "(Final RPC spec locked during Task 11 planning; this is the draft.)" description (lines 119–179) doesn't match what migration 116 actually shipped per the same file's own changelog. The RPC is operational but the runbook describes a different shape. Either fix the runbook or remove the stale draft.

### I-16. ParentalGateModal status (T9 cross-zone)

K5 in MASTER_TRIAGE says "exists, used only on /profile Unpair + Privacy/Terms. NOT on quizzes, expert sessions, settings, reading. COPPA gap" — no SHIPPED marker. PRELAUNCH §3.13 says "verify it fires on every external link / payment / mailto. No close-button addition" — implies still pending. Memory `feedback_verify_audit_findings_before_acting.md` from 2026-04-25 says "ParentalGate has live COPPA callers" — but the iOS audit earlier in this session verified zero callers in production code. **Three different doc statuses for the same modal.** I-5 from Session 1 cluster.

### I-17. Apple Developer state (cross-zone with Session 1 T13)

`F7-DECISIONS-LOCKED §10 Apple MFK compliance` (line 257) makes Phase 4 verifications part of the iOS TestFlight gate. Reference/CLAUDE.md says "owner does not yet have an Apple Developer account." Reference/ROTATIONS.md lists rotated credentials. PRELAUNCH §9.2 (line 482) flags both AASA file + entitlements as "currently broken on both ends." Multiple docs disagree on what Apple state actually is. Same I-3 from Session 1.

---

## Open questions deferred to later sessions

- **`tsconfig.json` strict mode** (I-13) — Session 8 (web/ config) can resolve in ~30 seconds.
- **`articles.illustration_url` column existence** — Session 7 (schema/) can verify.
- **`email_templates` weekly_reading_report row existence** — Session 7 (schema/) can verify; PRELAUNCH §6.1 list is actionable only if the rows exist.
- **MASTER_TRIAGE Tier 0/1 status verification** (I-14) — Session 8 (web/src) plus `git log` can verify whether the 6 docs-flagged bugs actually shipped.
- **Snapshot folder existence** — F7-PM-LAUNCH-PROMPT references `/Users/veritypost/Desktop/verity-post-pipeline-snapshot/`. Whether it still exists is verifiable but outside repo scope; could affect F7-pipeline-restructure's archive value.

---

## Cross-zone topics flagged but not yet mapped (carry forward)

- **CSP enforcement state** — confirmed Report-Only by 2 of 3 docs (Session 1 T9 + Session 2 T7). Awaits Session 8 middleware.js read.
- **`@admin-verified` marker retirement** — confirmed retired by CLAUDE.md + memory + dated 2026-04-23, but FEATURE_LEDGER + Reference/README + F7-PM-LAUNCH-PROMPT still reference as active. Awaits Session 8 admin code grep.
- **Settings split (PRELAUNCH §3.4)** — Phase 3 of the redesign is the highest-risk item per PRELAUNCH §9.1. Stripe URL coupling at `web/src/app/api/stripe/checkout/route.js:82` and 10 internal `#anchor` hrefs make this Session 8 territory.
- **Three new notification templates** (PRELAUNCH §6.2: `comment_reply`, `expert_answer_posted`, `streak_jeopardy`) — not in any current `email_templates` audit. Session 7.
- **Owner-side punch list canonicalness** — already determined in earlier turn that OWNER_TODO + OWNER_ACTIONS + PM_PUNCHLIST aren't duplicates. Session 3 (Audit_2026-04-24/) confirms.

---

## Plan for Session 3

`Current Projects/Audit_2026-04-24/` — ~100 files. Strategy:

1. **Read in full (8 syntheses):** `MASTER_FIX_LIST_2026-04-24.md`, `OWNER_ACTIONS_2026-04-24.md`, `OWNER_TODO_2026-04-24.md`, `QUESTIONABLE_ITEMS_2026-04-24.md`, `EXT_AUDIT_FINAL_PLAN.md`, `EXT_AUDIT_TRIAGE_2026-04-24.md`, `EXT_AUDIT_BUCKET5_TRACKER.md`, `PHASE_8_VERIFICATION_2026-04-24.md`. Already partly read OWNER_TODO + OWNER_ACTIONS in earlier turn.
2. **Read in full (3 working notes):** `RLS_14_CLASSIFICATION.md`, `C26_RLS_CLASSIFICATION_DRAFT.md`, `Q_SOLO_VERIFICATION.md`.
3. **Read briefings:** `_AGENT_BRIEFING.md`, `_RECONCILER_BRIEFING.md`, `_ANCHOR_SHA.txt`.
4. **Read the two extensionless docs:** `review external audit`, `review external audit-review` (190KB + 22KB).
5. **Sample-read the 80+ Wave A/B/Recon raw agent reports** — only when a synthesis claim looks doubtful.
6. **Round 2 lens reports** — read 4–5 of the 10 to assess the lens layer's currency.
7. Build cross-doc map within Audit_2026-04-24 + cross-link to Sessions 1 and 2 findings.

Estimated work: ~6,000 lines of synthesis material + sampled raw artifacts. One full session.

---

*End of Session 2 findings. Sessions 1 + 2 carry: ~3,400 + 4,741 = 8,141 lines read end-to-end. 24 + 17 topics mapped. Pending owner go for Session 3.*
