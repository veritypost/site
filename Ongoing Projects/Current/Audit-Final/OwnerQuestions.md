# Owner Questions — merged from AuditV1 + AuditV2

109 items where the audits need owner input. Each entry has:

- **Why we ask** — origin trail + the actual ambiguity
- **What's there now** — concrete code / DB state I have evidence for (file:line where I read it; "per audit, not independently verified" otherwise)
- **Implications** — what changes if you go each direction (or what we'd do with the answer)

Citations: V1 = `AuditV1/99-final-synthesis.md`, V2 = `AuditV2/AuditV2.md`, GAPS = `AuditV2/GAPS.md`.

> **For the owner**: feel free to drop off-the-cuff replies — "kill it", "ehh leave it", "you decide", "do A but not for kids". I'll interpret intent and ask one targeted clarifier if I genuinely can't act, otherwise I'll execute and surface what I did.

---

## HOW THIS SESSION WORKS

This is the canonical process for running the owner question pass. Follow it exactly.

**One question per turn.** Present one question, wait for the owner's answer, log the decision, move to the next. Never batch or present multiple questions at once.

**Before presenting any question:**
- Read the relevant code/file to get the current live state. Never present an audit claim as fact without verifying it first — ~5 in every 35 items are stale or wrong.
- State what's actually live (file:line), not what the audit said.
- Keep the context brief: what it is, what's live now, what the options are. Owner shouldn't need background knowledge to answer.

**After the owner answers:**
- Log the decision immediately in the DECISIONS table above before moving on.
- If the decision requires code/file changes, create a Task entry (numbered, spec-ready) in the TASKS table and the detailed spec section below.
- If the decision is "resolved, no action needed" — log it as resolved in DECISIONS. No Task.
- If the decision is a reminder or deferred item — log it with the relevant note.

**Task specs must include:**
- CURRENT behavior (verified, file:line)
- TARGET behavior
- CHANGES (concrete diff list — specific files, specific lines, what to do)
- Acceptance criteria (grep checks, tsc, xcodebuild where applicable)
- Scope estimate
- Blockers (if any)
- Relevant project patterns to follow (e.g., route convention from CLAUDE.md, DB-over-code rule, permission matrix shape)

**No live code changes during this session.** Only `Audit-Final/OwnerQuestions.md` gets updated. Any code action becomes a Task. Even trivial ones.

**Format for presenting a question:**

```
**Q[N]**

**What it's about:** one sentence.

**What's live right now:** concrete verified state (file:line or "not independently verified").

**Options:**
- A — ...
- B — ...
- C — ...
```

**What belongs in DECISIONS vs TASKS:**
- DECISIONS = every Q, regardless of outcome. Quick one-liner per row.
- TASKS = only Qs that spawn code/file work. Full spec in its own section below.

**Status values for Tasks:**
- `Spec-ready` — everything needed to execute is in the spec; no owner input needed to start.
- `Blocked on [X]` — can't start until X ships or owner answers something.
- `Future Projects` — intentionally deferred post-launch; add to `Future Projects/` when the question pass closes.

---

## DECISIONS (2026-04-26)

| Q | Decision |
|---|---|
| Q1 | Cut all charter / trust pages. → Task 1. |
| Q2 | Keep `/admin/story-manager`. (Audit was wrong about it being a duplicate.) → role implemented inside Tasks 2-4. |
| Q3 | Keep `/admin/kids-story-manager`. (Same reason.) → role implemented inside Tasks 2-4. |
| Q4 | What shipped (Default/Preset/Custom prompt picker in newsroom + `ai_prompt_presets` table + `/admin/prompt-presets` mgmt page) is enough. V4's layered prompt architecture is superseded. → Task 5 (mark V4 doc superseded). **Conditional**: owner verifies prompt picker actually works as expected on next newsroom use. |
| Q5 | **Resolved — not a Task.** Code already does both behaviors at different stages: bounds-check silently patches to 0 (`generate/route.ts:1414`); semantic-check throws on mismatch (`:1456-1462`). The "Decision 8 vs §5" contradiction was a doc-only ambiguity describing two separate code paths. No code change. Doc clarification is optional and not worth the keystroke until F7-DECISIONS-LOCKED.md gets touched for another reason. |
| Q6 | Drop the kid-reader illustration requirement from PRELAUNCH §3.13. No `articles.illustration_url` column. Kid reader stays text-only for now. Owner will source illustrations separately when image support is added later. → Task 6. |
| Q7 | StoreManager.swift pricing is canonical. Verity $3.99/$39.99, Pro $9.99/$99.99, Family $14.99/$149.99, FamilyXL $19.99/$199.99. A/B framing in `02_PRICING_RESET.md` is superseded. → Task 7. |
| Q8 | F1/F3/F4 absorbed or superseded by PRELAUNCH. F2 reading receipt UI deferred — data layer stays live, UI never built. No further action. |
| Q9 | Remove all `LAUNCH_HIDE_*` flags — redirect to `/welcome` is the real gate. Removed `LAUNCH_HIDE_ANON_INTERSTITIAL` from `story/[slug]/page.tsx` and `LAUNCH_HIDE_RECAP` + all eslint-disable companion comments from `recap/page.tsx` + `recap/[id]/page.tsx`. tsc clean. **Done.** |
| Q10 | **Resolved — no action.** `CommentRow` already uses `hasPermission` correctly. Expert reply blur gates on `article.expert_responses.read`. Author badges (verified, expert pill, VS score) read directly from user data — no permission gate needed. |
| Q11 | Launch sequence: web → adult iOS → kids iOS. Keep `verity_family` + `verity_family_xl` as `is_active=false` (not purchasable). Show them on the pricing/billing page as "Coming soon" so users know they're planned. Currently they're fully invisible — needs a UI change. → Task 9. |
| Q12 | **Resolved — already live.** `PipelineRunPicker` in newsroom reads `ai_models` table and shows Provider + Model dropdowns per run. Both Anthropic and OpenAI are active in the table. Owner already has per-run provider + model selection. |
| Q13 | Make adult quiz unlock threshold DB-driven like kids. Currently hardcoded `>= 3` in `schema/012` RPCs. → Task 10. |
| Q14 | Delete bias-spotting mechanic entirely. Remove `BadgeUnlockScene.swift` (306 LOC) + `QuizPassScene.swift` (351 LOC), strip `biasedSpotted` param + `if biasedSpotted` branch from `KidsAppState.completeQuiz`, remove `.badge` case from `KidsAppRoot.ActiveSheet`. → Task 11. |
| Q15 | **Resolved — no action.** Schema gaps (7, 8, 52, 92, 93, 100) are numbering artifacts only. Live DB has everything applied. Not a live code or DB issue. |
| Q16 | **Apple Console session reminder.** Adult app missing `aps-environment` (push) + `associated-domains` (Universal Links) entitlements. Kids app missing SIWA entitlement + needs `aps-environment` flipped from `development` to `production` for App Store builds. All fixed in App Store Connect → Identifiers → enable capabilities → regenerate provisioning profiles. Handle during the Apple Console walkthrough session. |
| Q17 | Move `VerityPost/VerityPost/possibleChanges/` out of the app bundle. Currently ships as Resources in the `.app`. → Task 12 (Future Projects). |
| Q18 | **Apple Console session reminder.** Both apps have `CFBundleVersion=1`, never bumped. Must increment before first TestFlight/App Store submission. Decide bump pattern (manual / agvtool / CI) and do first bump during the Apple Console walkthrough session. |
| Q19 | Delete `99.Organized Folder/Proposed Tree` — folder reorg rejected, `Current Projects/` stays as-is. → Task 13. |
| Q20 | Fix 6 stale facts in `Reference/CLAUDE.md`: Apple dev account claim, FALLBACK_CATEGORIES (gone), ParentalGate callers (4 not 0), hooks-disable count (25 not 23), settings page size (5247 not 3800), schema/100 path (in Archived/ not schema/). → Task 14. |
| Q21 | Patch old session logs in `Sessions/` that reference dead paths (`site/`, `01-Schema/`, `proposedideas/`, `05-Working/`, `docs/`, `Ongoing Projects/`, `test-data/`) → current paths. → Task 15. |
| Q22 | Delete `VerityPost/VerityPost/REVIEW.md` — open items already in MASTER_TRIAGE. → Task 16. |
| Q23 | **Resolved — no action.** `PROFILE_FULL_FLOW.md` stays in `Archived/2026-04-20-consolidation/`. Useful as historical reference but not canonical. |
| Q24 | **Resolved — no action.** Origin of the 8→24 doc expansion unknown. Treat all 24 `Future Projects/` docs as canonical. |
| Q25 | **Resolved — no action.** Superseded `NEXT_SESSION_PROMPT` files in `Sessions/` folders left as-is. No cleanup needed. |
| Q26 | Remove `.mcp.json` from `.gitignore` — file is safe to commit (no secrets), gitignore line is just wrong. → Task 17. |
| Q27 | **Resolved — no action.** Keep `AuditV1/` and `AuditV2/` as-is for now. Owner may delete individually later. |
| Q28 | Wire `scripts/check-admin-routes.js` into CI. Currently works (87 routes passing). Goal: Salesforce-style automated compliance enforcement on every PR. Research how Salesforce handles route/API compliance gates and model after that. → Task 18 (Future Projects). |
| Q29 | **Resolved — no action.** `TODO_2026-04-21.md` reconciled against MASTER_TRIAGE: 7 of 10 items already handled (shipped, gone, or covered by Task 15). One surviving open item — `Reference/PM_ROLE.md` scope questions — owner confirmed the doc is not load-bearing and outdated. Leave as-is. |
| Q30 | `hasPermission` is canonical. Migrate 6 hardcoded-role pages first (`access`, `analytics`, `feeds`, `notifications`, `subscriptions`, `system`), then sweep ~38 role-set pages. Same principle as Q28 (route compliance) applied to admin pages — both sides of the gate must go through the permission matrix. → Task 19 (links to Task 18). |
| Q31 | Rename `hasPermissionServer` → `hasPermissionViaRpc` in `permissions.js` + update the one import in `rlsErrorHandler.js`. Audit claim of wrong client was stale — file is `'use client'` and correct. Name is the only real issue. → Task 20. |
| Q32 | Make `hasPermission` fail-closed when `allPermsCache` is null — remove legacy section-cache fallthrough. Revoke stale-through already fixed (L2). Remaining risk is initial-load window reading stale section cache. 3-line change. → Task 21. |
| Q33 | **Resolved — skip.** Fresh-agent W2 re-verification deferred. A full independent audit pass will run after the current cleanup + restructure sprint completes. |
| Q34 | **Resolved — defer all 47.** `Round2/_NOTIFICATION_DIGEST.md` findings (L01, L02, L04, L08, L11, L12, L13, L15) folded into the end-of-sprint audit pass alongside Q33. Including 5 CRITICALs (L08-001, L08-004, L04-01, L15-01, L15-02) — owner acknowledged. |
| Q35 | **Resolved — defer.** ~60 remaining MASTER_TRIAGE SHIPPED block verifications folded into the end-of-sprint pass with Q33 + Q34. |
| Q36 | **Deferred — end-of-sprint pass.** EXT_AUDIT_FINAL_PLAN Tiers + O-DESIGN items diff vs PRELAUNCH_UI_CHANGE. |
| Q38 | **Deferred — end-of-sprint pass.** `tsc --noEmit` + `xcodebuild` on web + both iOS apps. |
| Q76 | **Resolved — no action.** Apple Developer account active (Team `FQCAS829U7`). CLAUDE.md stale claim fixed by Task 14. |
| Q77 | **Apple Console session reminder.** Both apps have `Contents.json` only in `AppIcon.appiconset/` — no PNG files. App Store rejects without them. Add 1024×1024 source PNG, let Xcode export the rest, for both `VerityPost` and `VerityPostKids`. |
| Q78 | **Apple Console session reminder.** Universal Links not wired on adult app (no `associated-domains` entitlement). Kids half-wired (`applinks:veritypost.com` in entitlements) but AASA file unconfirmed. Full UL setup — AASA file + entitlements on both apps — handled during Apple Console walkthrough. |
| Q79 | **Apple Console session reminder.** Bundle IDs (`com.veritypost.app` + `com.veritypost.kids`), push certs, IAP products, SIWA capability — registration status unconfirmed. Verify and complete during Apple Console walkthrough. |
| Q80 | **Apple Console session reminder.** Verify App Store Connect IAP product IDs match `StoreManager.swift:50-57` exactly (`com.veritypost.verity.{monthly,annual}` etc.). Mismatch = silent empty products + broken billing. |
| Q81 | **Apple Console session reminder.** Kids app App Store URL not yet published. `KidsAppLauncher.swift:19` + `OpenKidsAppButton.tsx:3` both have fallback to `veritypost.com/kids-app`. Swap to real `apps.apple.com` URL once app is live. |
| Q82 | **Resolved.** Live Stripe keys active. Stripe fully set up. |
| Q83 | **Resolved.** Billing routes (`cancel`, `change-plan`, `resubscribe`) confirmed operational per owner. Stripe fully wired. |
| Q84 | **Resolved.** Stripe webhook processing live production events. |
| Q85 | **Resolved.** L06 cross-provider duplicate sub rows — theoretical finding, not a real repro. Live DB clean. |
| Q86 | **Resolved.** Stripe webhook idempotency confirmed correct. Code pattern verified (`webhook_log.event_id UNIQUE`). |
| Q89 | **Resolved.** Publisher ID is `ca-pub-3486969662269929` — already hardcoded in `layout.js:95`. No action needed. |
| Q91 | **Resolved — no domain in vercel.json.** `vercel.json` contains only cron config. Production domain is set in the Vercel dashboard. Owner to confirm typo was fixed there. |
| Q93 | **Resolved — Vercel crons, not pg_cron.** `vercel.json` schedules 10 cron routes (sweep-kid-trials, send-emails, send-push, etc.). pg_cron is not the scheduling mechanism. Q71/Q99 concerns about pg_cron scheduling are moot. |
| Q94 | **Resolved — duplicate of Q84.** Stripe fully set up + live. 22 rows = production traffic. |
| Q95 | **Resolved — duplicate of Q52.** Deferred to end-of-sprint pass. |
| Q96 | **Resolved — duplicate of Q51.** Deferred to end-of-sprint pass. |
| Q97 | **Resolved.** `admin_audit_log` is canonical for admin actions (`adminMutation.ts:60-61`). `audit_log` is for system events (auth, Stripe, promo). Not duplicates — different purposes. |
| Q98 | **Resolved — duplicate of Q68.** Deferred to end-of-sprint pass. |
| Q99 | **Resolved — duplicate of Q71/Q93.** Crons run via Vercel, not pg_cron. `cleanup_rate_limit_events` is a separate concern — deferred to end-of-sprint. |
| Q100 | **Resolved — duplicate of Q37.** Deferred to end-of-sprint pass. |
| Q101 | **Deferred — end-of-sprint pass.** 1 query to confirm live `perms_global_version`. |
| Q109 | **Resolved.** Canonical dev port is 3000 (`web/package.json:6`). `Reference/parity/*.md` references to 3333 are stale. → Task 22. |
| Q88 | **Resolved.** AdSense approval pending. Keep `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` unset in Vercel until approved. Meta tag + `ads.txt` already in place for review. |
| Q90 | Keep both — AdSense + hand-managed `Ad.jsx` / `ad_units` infrastructure. Full flexibility: any ad type, any placement, any page. `Ad.jsx:148-152` XSS bug (`click_url` no scheme validation) must be fixed before hand-managed ads go live. → Task 23. |
| Q92 | **Resolved — deferred post-launch.** Sentry wired post-launch once users + revenue justify the cost. `SENTRY_DSN` stays unset in Vercel. Build passes cleanly without it. |
| Q103 | **Resolved — no action.** Owner not pursuing ex-dev access revocation. |
| Q104 | **Resolved — dropped.** Migration-state SQL paste not needed. |
| Q105 | **Resolved.** External launch blockers: (1) AdSense approval, (2) Apple review (adult + kids apps), (3) COPPA attorney sign-off before kids app ships, (4) Anthropic/OpenAI API tier upgrade if traffic spikes post-launch. Stripe already live — not a blocker. |
| Q108 | `Reference/README.md` claims kids iOS doesn't exist — false since 2026-04-19. Retire the file (CLAUDE.md is the canonical entry point). → Task 24. |
| Q109 | **Resolved.** Port 3000 confirmed canonical (`web/package.json:6`). Stale 3333 references in parity docs fixed by Task 22. |
| Q61 | **Resolved — duplicate of Q13.** Framing debate moot — adult threshold is being made DB-driven (Task 10) regardless. |
| Q37 | **Deferred — end-of-sprint pass.** xlsx ↔ DB permissions row-by-row diff script. |
| Q39 | **Deferred — end-of-sprint pass.** AuditV1 4-session fresh read vs V2. |
| Q40 | **Deferred — end-of-sprint pass.** MASTER_TRIAGE full paginated read. |
| Q41 | **Deferred — end-of-sprint pass.** `Future Projects/db/*.md` 11-file per-file read. |
| Q42 | **Deferred — end-of-sprint pass.** Q_SOLO_VERIFICATION items Q-SOLO-01 + Q-SOLO-05. |
| Q43 | **Deferred — end-of-sprint pass.** F7 tables ↔ migration 177 SELECT-grant audit. |
| Q44 | **Deferred — end-of-sprint pass.** F7-PM-LAUNCH-PROMPT vs F7-DECISIONS-LOCKED full diff. |
| Q45 | **Deferred — end-of-sprint pass.** ExpertWatchlistCard concurrency read at line 4892. |
| Q46 | **Deferred — end-of-sprint pass.** Round 2 L03 TOCTOU race verification. |
| Q47 | **Deferred — end-of-sprint pass.** Round 2 L06 cross-provider duplicate-row repro. |
| Q48 | **Deferred — end-of-sprint pass.** Story-page kill-switch grep enumeration. |
| Q49 | **Deferred — end-of-sprint pass.** BUCKET5_TRACKER stale "queued" entries sweep. |
| Q51 | **Deferred — end-of-sprint pass.** Storage bucket state via Supabase MCP query. |
| Q52 | **Deferred — end-of-sprint pass.** `verity_score_events` existence check post 109/111 rollback. |
| Q53 | **Deferred — end-of-sprint pass.** `APP_STORE_METADATA.md` full audit beyond `site/` paths. |
| Q54 | **Deferred — end-of-sprint pass.** `audit_log` table policies + write-paths inventory. |
| Q55 | **Deferred — end-of-sprint pass.** `webhook_log` idempotency claim read at lines 88-115. |
| Q56 | **Deferred — end-of-sprint pass.** C2 — origin of `100_backfill_admin_rank_rpcs_*.sql`. |
| Q57 | **Deferred — end-of-sprint pass.** C7 — whether 127 rollback was ever run. |
| Q58 | **Deferred — end-of-sprint pass.** C16–C20 MASTER_TRIAGE items still-in-code verification. |
| Q59 | **Deferred — end-of-sprint pass.** D7 — `/api/comments/[id]/report` rate-limit read. |
| Q60 | **Deferred — end-of-sprint pass.** C8 — `adminMutation.ts:84-88` `p_ip`/`p_user_agent` gap confirmation. |
| Q62 | **Deferred — end-of-sprint pass.** C45 orphan components — `React.lazy` / `next/dynamic` grep. |
| Q63 | **Deferred — end-of-sprint pass.** `comment_status` enum drift — final schema + admin API grep. |
| Q64 | **Deferred — end-of-sprint pass.** L08-001 kid RLS NULL `kid_profile_id` pre-claim edge case. |
| Q65 | **Deferred — end-of-sprint pass.** Wave B `handlePaymentSucceeded` early-return path trace. |
| Q66 | **Deferred — end-of-sprint pass.** Z02 "67 items" vs "39 numbered" count reconciliation. |
| Q67 | **Deferred — end-of-sprint pass.** AuditV1 vs AuditV2 thoroughness spot-check. |
| Q68 | **Deferred — end-of-sprint pass.** `events` parent table no-policies — service role confirmation. |
| Q69 | **Deferred — end-of-sprint pass.** AppIcon `Assets.xcassets` PNG inspection. |
| Q70 | **Deferred — end-of-sprint pass.** `superadmin` count — routine body reads. |
| Q71 | **Deferred — end-of-sprint pass.** `cleanup_rate_limit_events` pg_cron scheduling verification. |
| Q72 | **Deferred — end-of-sprint pass.** AASA file — Next.js route handler verification. |
| Q73 | **Deferred — end-of-sprint pass.** `JsonLd.tsx` `/icon.svg` reference — route existence check. |
| Q74 | **Deferred — end-of-sprint pass.** `HomeFeedSlots.swift` + `Keychain.swift` orphan comprehensive grep. |
| Q75 | **Deferred — end-of-sprint pass.** `PipelineRunPicker.tsx` call sites — dynamic import check. |
| Q87 | **Resolved — duplicate of Q7.** Pricing locked: Verity $3.99/$39.99, Pro $9.99/$99.99, Family $14.99/$149.99, FamilyXL $19.99/$199.99. |
| Q102 | **Resolved — duplicate of Q12.** Both Anthropic + OpenAI active in `ai_models` table. Intentional. |
| Q106 | **Resolved — covered by Task 14.** CLAUDE.md settings page annotation (5247 not 3800) fixed in Task 14. |
| Q107 | **Resolved — covered by Task 14.** CLAUDE.md hooks-disable count (25 not 23) fixed in Task 14. |

## TASKS

Each Task is prompt-ready: CURRENT / TARGET / CHANGES laid out so a coding session can pick it up without me re-explaining the conversation that led here.

| # | Title | Status |
|---|---|---|
| Task 1 | Cut all charter / trust-infrastructure references from `Future Projects/` | Spec-ready |
| Task 2 | Rebuild newsroom cluster UI (Kids + Adult horizontal cards per cluster) | Spec-ready (3 open items below) |
| Task 3 | Per-article AI actions inside story-manager pages | Blocked on owner enumerating action set |
| Task 4 | Delete F7 `/admin/articles/[id]/{review,edit}` pages | Blocked on Task 2 shipping |
| Task 5 | Mark `Future Projects/24_AI_PIPELINE_PROMPTS.md` (V4) as superseded; document the live prompt-versioning flow | Spec-ready |
| Task 6 | Strip kid illustration requirement from `Current Projects/PRELAUNCH_UI_CHANGE.md` §3.13 | Spec-ready |
| Task 7 | Rewrite `Future Projects/02_PRICING_RESET.md` — drop A/B framing, document locked prices | Spec-ready |
| Task 9 | Show Family + Family XL as "Coming soon" on billing/pricing UI instead of hiding them | Spec-ready |
| Task 10 | Make adult quiz unlock threshold DB-driven — add `settings` row, parameterize both RPCs in `schema/012` | Spec-ready |
| Task 11 | Delete bias-spotting dead code from kids app — `BadgeUnlockScene.swift`, `QuizPassScene.swift`, and all call sites | Spec-ready |
| Task 12 | Move `VerityPost/VerityPost/possibleChanges/` outside the app source tree so it doesn't ship in the bundle | Future Projects |
| Task 13 | ~~Delete `99.Organized Folder/Proposed Tree` from repo~~ **CLOSED — folder never existed in repo. Nothing to do.** | Done |
| Task 14 | Fix 6 stale facts in `Reference/CLAUDE.md` | Spec-ready |
| Task 15 | Patch dead-path references in `Sessions/` logs (`site/`, `01-Schema/`, `proposedideas/`, etc.) → current paths | Spec-ready |
| Task 16 | Delete `VerityPost/VerityPost/REVIEW.md` | Spec-ready |
| Task 17 | Remove `.mcp.json` from `.gitignore` | Spec-ready |
| Task 18 | Wire `check-admin-routes.js` into CI — research Salesforce-style API compliance enforcement pattern first | Future Projects |
| Task 19 | Migrate all admin pages to `hasPermission` gating — 6 hardcoded-role pages first, then ~38 role-set pages. Companion to Task 18 (same principle: full permission-matrix enforcement, pages + routes). | Spec-ready |
| Task 20 | Rename `hasPermissionServer` → `hasPermissionViaRpc` in `web/src/lib/permissions.js` + update the one import in `rlsErrorHandler.js` | Spec-ready |
| Task 21 | Make `hasPermission` fail-closed when `allPermsCache` is null — remove section-cache fallthrough (3-line change in `permissions.js:181-185`) | Spec-ready |
| Task 22 | Fix `localhost:3333` → `localhost:3000` in `Reference/parity/Shared.md`, `Web-Only.md`, `iOS-Only.md` | Spec-ready |
| Task 23 | Fix `Ad.jsx:148-152` XSS — validate `click_url` scheme (allow only `https://`) before rendering. Hand-managed ads must not go live without this. | Spec-ready |
| Task 24 | Delete `Reference/README.md` — stale (claims kids iOS doesn't exist), CLAUDE.md is canonical. | Spec-ready |

---

### Task 1 — Cut all charter / trust-infrastructure references from `Future Projects/`

**Source decision:** Q1 — owner picked "cut all of it."

**Files in scope (verified by grep 2026-04-26):**
- `Future Projects/README.md` — already accurate (lines 48-50 + 62 already flag the cut). Audit pass: no edit needed unless wording can be tightened.
- 15 `Future Projects/` docs that still cite `04_TRUST_INFRASTRUCTURE.md` or `17_REFUSAL_LIST.md` as dependencies:
  - `Future Projects/24_AI_PIPELINE_PROMPTS.md` (line 4 dep list)
  - `Future Projects/07_KIDS_DECISION.md` (line 57)
  - `Future Projects/05_EDITOR_SYSTEM.md` (lines 4, 35, 172, 173)
  - `Future Projects/19_MEASUREMENT.md` (line 166)
  - `Future Projects/06_DEFECTION_PATH.md` (lines 4, 106, 148)
  - `Future Projects/20_RISK_REGISTER.md` (lines 28, 142, 159)
  - `Future Projects/10_SUMMARY_FORMAT.md` (lines 226, 294)
  - `Future Projects/db/00_INDEX.md` (lines 31, 32, 37, 64) — already flags as cut; tighten language
  - `Future Projects/db/05_defection_links_table.md` (line 98)
  - `Future Projects/views/web_leaderboard.md` (lines 5, 16)
  - `Future Projects/views/ios_adult_alerts.md` (line 5)
  - `Future Projects/views/web_profile_settings.md` (lines 5, 46, 78)
  - `Future Projects/views/ios_adult_profile.md`
  - `Future Projects/views/web_welcome_marketing.md` (lists the 8 trust pages as "to build")
  - `Future Projects/views/web_notifications.md`
  - `Future Projects/views/web_login_signup.md`

**Files NOT in scope (audit claim refuted by grep):**
- Web app code (`web/src/`): **zero** hits for `/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`.
- iOS adult app (`VerityPost/VerityPost/SettingsView.swift`): **zero** hits for "Standards" or "Corrections" — audit's "iOS Settings rows still surface /standards + /corrections links that 404" claim is **stale or wrong**. No iOS edit required.
- DB tables `corrections`, `trust_events`, `standards_doc`, `defection_links`, `editorial_charter`: don't exist (per `Future Projects/README.md:62` — verified accurate).

**CURRENT BEHAVIOR (verified):**
- 15 `Future Projects/` docs reference cut infrastructure as a "Depends on:" or inline cross-reference, OR list charter-cut pages as "to build" / "ship after". A new contributor reading any of these docs would believe the trust infrastructure is in scope, then discover via README that it isn't — confusing and contradictory.
- `views/web_welcome_marketing.md` enumerates 8 public trust pages as buildable surfaces.
- `db/00_INDEX.md` already flags the trust tables as cut but uses soft language ("If the table exists, lock or drop").

**TARGET BEHAVIOR:**
- Charter / trust-infrastructure references are **gone** from every doc that currently cites them as a dependency or planned page.
- The only mentions of `04_TRUST_INFRASTRUCTURE.md` / `17_REFUSAL_LIST.md` / `db/03_corrections_table.md` / `db/06_trust_events_table.md` / `db/07_standards_doc_table.md` that survive are in `Future Projects/README.md`'s "scaffolding cut" historical note (lines 48-50, 62).
- The 8 trust pages (`/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`, `/archive/[date]`, `/recent`) are stripped from `views/web_welcome_marketing.md` and any other doc that promises to build them.
- Future readers see a coherent product surface without dead promises.

**CHANGES (concrete diff list per file):**

For each of the 15 files above, do the following pass:
1. **In "Depends on:" headers** — remove `04_TRUST_INFRASTRUCTURE.md` and `17_REFUSAL_LIST.md` entries entirely. Leave the rest of the dependency list alone.
2. **In inline cross-references** like "as established in `04_TRUST_INFRASTRUCTURE.md`" or "see `17_REFUSAL_LIST.md`" — delete the cross-reference clause. Rephrase the surrounding sentence so it stands alone, OR delete the whole sentence if it only existed to set up the cross-reference.
3. **In "Ship after:" / "Pairs with:" footers** — remove charter / trust entries. If the entry leaves an empty "Ship after:" line, delete the whole line.
4. **In `views/web_welcome_marketing.md` specifically** — find the section enumerating 8 trust pages as "to build" and delete that section entirely. Replace with a single sentence: "Trust-page surface (standards / corrections / editorial-charter / editorial-log / refusals / masthead / archive / recent) was cut from scope per the 2026-04-21 Charter update — see README."
5. **In `db/00_INDEX.md`** lines 31-32 + 37 — tighten language from "If the table exists, lock or drop" to "Cut from scope; tables not built. If reintroduced, reopen as a fresh project."
6. **At the top of each modified file** add a 1-line note: `<!-- 2026-04-26: charter / trust references stripped per Task 1 (see Audit-Final/OwnerQuestions.md). -->`

**Acceptance criteria:**
- `grep -rn "04_TRUST_INFRASTRUCTURE\|17_REFUSAL_LIST" "Future Projects/"` returns hits ONLY in `README.md` (the historical "scaffolding cut" note).
- `grep -rn "03_corrections_table\|06_trust_events_table\|standards_doc" "Future Projects/"` returns hits ONLY in `README.md` and `db/00_INDEX.md` (with the tightened language).
- `web/src/` and `VerityPost/` grep results unchanged (no code touched).

**SCOPE:** ~1 hour. Pure mechanical doc edits.

**No blockers.**

---

### Task 2 — Rebuild newsroom cluster UI (Kids + Adult horizontal cards per cluster)

**Source decision:** Q2 + Q3 deep-dive landed on this as the new flow.

**Files in scope:**
- `web/src/app/admin/newsroom/page.tsx` (2349 LOC) — modify
- `web/src/components/admin/GenerationModal.tsx` — likely delete or repurpose
- `web/src/components/admin/PipelineRunPicker.tsx` — keep (still needed for model/provider selection)
- `web/src/app/api/admin/pipeline/generate/route.js` (or equivalent) — verify request shape supports per-audience invocation

**CURRENT BEHAVIOR (verified by reading `newsroom/page.tsx`):**
- Top of page: filter row (category, subcategory, outlet, time window, search) + prompt picker (Default / Preset / Custom) + provider/model picker (`PipelineRunPicker`) + "Refresh feeds" button.
- Cluster list renders as **flat single rows** (one row = one cluster, sorted by `updated_at desc`, 50 per page, "Load more").
- Each row shows: title + dim metadata + generated-state badges (`Adult: View` / `Kid: View` IF articles already exist for that cluster) + a single **Generate** button + Move/Merge/Split/Dismiss controls + source-row disclosure toggle.
- Clicking the single Generate button calls `openGenerate(cluster)` (line 1004) which opens **`GenerationModal`** with a **3-button audience picker (Adult / Kid / Both)**.
- Operator picks audience inside the modal → modal calls the pipeline → result lands at `/admin/articles/[id]/review` (read-only F7 page) → operator clicks Edit → `/admin/articles/[id]/edit` (form editor).
- Prompt/provider/model selections at the top of newsroom flow through into the GenerationModal.
- Existing `Adult: View` / `Kid: View` badges on the cluster row link to `/admin/articles/[id]/review` for the existing generated article.

**TARGET BEHAVIOR:**
- Top of page: **unchanged** — same filter row + prompt picker + provider/model picker + Refresh feeds button.
- Cluster list renders as **two horizontal cards stacked per cluster row**:
  - **Kids card** (left or top half) — kid-themed visual (blue accent #2563eb to match `kids-story-manager`), shows title + summary preview + a per-card **Generate** button. If a kid article already exists for this cluster, the card shows a "View" link to `/admin/kids-story-manager/[id]` instead of (or alongside) Generate.
  - **Adult card** (right or bottom half) — adult-themed visual (#111111 accent), shows title + summary preview + a per-card **Generate** button. If an adult article already exists for this cluster, the card shows a "View" link to `/admin/story-manager/[id]` instead of (or alongside) Generate.
  - Cluster-level controls (Move / Merge / Split / Dismiss / source-row toggle) sit above or beside both cards (one set per cluster, not per card).
- Clicking Kid Generate → calls pipeline with `audience: 'kid'` + carries the top-of-page prompt + provider/model → on success, **navigates operator directly** to `/admin/kids-story-manager/[id]` (no intermediate review page).
- Clicking Adult Generate → calls pipeline with `audience: 'adult'` + same carry-through → navigates to `/admin/story-manager/[id]`.
- **No "Both" button** — operator clicks each side individually if they want both. (If owner wants a Both button, that's a follow-up decision; default is per-card only.)
- `GenerationModal` is removed entirely (the modal's whole job was the audience picker, which now lives in the per-card buttons).
- Top-of-page prompt picker is **shared** between both cards (not per-card). Owner already confirmed this is fine — same prompt feeds whichever side gets clicked.

**CHANGES (concrete diff list):**

1. `web/src/app/admin/newsroom/page.tsx`:
   - Replace `openGenerate(cluster)` (lines ~1002-1011) with two handlers: `generateForCluster(cluster, 'kid')` and `generateForCluster(cluster, 'adult')`. Each builds the pipeline request with hardcoded audience + the top-of-page prompt/provider/model + cluster_id, calls the existing generate endpoint, and on success uses `router.push('/admin/kids-story-manager/'+id)` or `/admin/story-manager/'+id`.
   - Replace the cluster row component (`function ClusterRow` around line ~1645+) with a new layout: cluster header (title + metadata + cluster-level controls) + two stacked card sub-components (`KidsClusterCard`, `AdultClusterCard`). Each card sub-component owns: its accent color, its Generate button, its existing-article state lookup, its View link.
   - Remove `<GenerationModal />` mount + `closeGenerate()` (around line ~1011, ~1157-1167) + the `openGenerate` prop wiring in child components.
   - Drop the `import GenerationModal from '@/components/admin/GenerationModal'` (line 60).
2. `web/src/components/admin/GenerationModal.tsx`: delete file.
3. `web/src/app/api/admin/pipeline/generate/route.js`: verify it accepts `audience: 'kid' | 'adult'` in the request body (it currently does per the F7 design — the GenerationModal already passes this — so this is a verify, not a change).
4. Existing `Adult: View` / `Kid: View` badges on cluster rows: repoint URLs from `/admin/articles/[id]/review` → `/admin/story-manager/[id]` (adult) or `/admin/kids-story-manager/[id]` (kid). Sweep cluster-row + cluster-list render code for any other links to `/admin/articles/[id]/...`.

**SCOPE:** ~1-2 days. UI rebuild is the bulk; pipeline route is no-touch; `GenerationModal` deletion is trivial.

**OPEN ITEMS (need owner direction before coding starts):**
- Layout: **horizontal side-by-side** (kids left / adult right) OR **stacked** (kids on top / adult below within the cluster row)? Owner said "horizontal cards" — I'm reading that as side-by-side; confirm.
- Per-cluster Both button: yes/no?
- Should the cluster-level controls (Move / Merge / Split / Dismiss) stay shared, or duplicate per card?

---

### Task 3 — Per-article AI actions inside story-manager pages

**Files in scope:**
- `web/src/app/admin/story-manager/page.tsx` (1229 LOC) — add buttons + handlers
- `web/src/app/admin/kids-story-manager/page.tsx` (1037 LOC) — same
- `web/src/app/api/admin/articles/[id]/ai-action/route.js` — NEW endpoint (or one route per action)
- `web/src/lib/pipeline/` — extend with per-action prompt/handler files

**CURRENT BEHAVIOR (verified by reading both files):**
- `/admin/story-manager/[id]` and `/admin/kids-story-manager/[id]` are full-form editors. Operator can hand-edit any field (title, slug, summary, body, sources, timeline, quiz, hero pick) and click Save.
- **No AI actions inside the page.** All AI work happens upstream in newsroom Generate; once an article is generated, all subsequent edits are manual.

**TARGET BEHAVIOR:**
- Add a **"AI actions" button group** inside each story-manager page (probably top of the form or in a sticky toolbar).
- Each button calls a pipeline endpoint scoped to the current draft id, the pipeline mutates the draft in place, and the page re-loads the updated fields.
- Initial action set (owner to confirm/expand):
  - **Rewrite** — re-runs body generation from sources with the current prompt; replaces `body` (and maybe `summary`).
  - **Enrich** — adds context, sources, related links; doesn't replace the body wholesale.
  - **Add Historical Context** — generates a timeline backfill (events before the article date) and appends to the timeline section.
  - (Owner-extensible — owner needs to enumerate the full set.)
- Each action has a confirmation modal showing "this will replace X / append to Y" so operator doesn't accidentally nuke their hand-edits.

**CHANGES — needs owner spec before code:**
1. Owner enumerates the full action set (3? 5? 10?).
2. For each action: input (whole article? one section?), output (replace which fields? append to which?), model choice (Sonnet 4.6? Opus 4.7?), cost cap per call (cents).
3. Then: implement endpoint(s), button group component, per-action confirmation modals, error states, loading states.

**SCOPE:** ~1-2 days for first round once spec is locked.

**OPEN ITEMS (block all coding until answered):**
- What's the full action set?
- Which fields does each action mutate?
- Per-action model + cost cap?
- Should actions be available before save (mutating in-memory) or only on saved drafts (mutating DB)?

---

### Task 4 — Delete F7 review/edit pages

**Files in scope:**
- `web/src/app/admin/articles/[id]/review/page.tsx` (767 LOC) — DELETE
- `web/src/app/admin/articles/[id]/edit/page.tsx` (910 LOC) — DELETE
- `web/src/app/admin/articles/[id]/` directory — DELETE if empty after the two file removals
- `web/src/app/admin/page.tsx` — sweep quick links + group items for `/admin/articles` references
- `web/src/middleware.js` — optionally add a 301 redirect from `/admin/articles/[id]/review` → `/admin/story-manager/[id]` for any external bookmarks
- Any other internal linker (newsroom badges already covered in Task 2)

**CURRENT BEHAVIOR:**
- After Generate, operator lands at `/admin/articles/[id]/review` — read-only render of the AI draft with Edit / Regenerate / Publish / Reject buttons.
- Clicking Edit navigates to `/admin/articles/[id]/edit` — inline form editor (lighter than story-manager: no full quiz editor, no full timeline editor, smaller scope).
- Newsroom cluster-row badges link to `/admin/articles/[id]/review`.
- `/admin/articles/[id]/review/page.tsx` header docstring says "audience inferred server-side" — same URL serves adult or kid.

**TARGET BEHAVIOR:**
- F7 review + edit pages no longer exist.
- All "review the AI draft" + "edit the AI draft" jobs are absorbed by `/admin/story-manager/[id]` (adult) or `/admin/kids-story-manager/[id]` (kid).
- Newsroom Generate routes directly to story-manager (covered in NEW-1).
- Existing badges on cluster rows that link to `/admin/articles/[id]/review` are repointed (covered in NEW-1).
- Optional: 301 redirect from old URLs preserves any external bookmarks (Slack messages, email links).

**CHANGES (concrete diff list):**
1. `grep -rn "/admin/articles/" web/src` to find ALL references to the F7 review/edit URLs. Repoint each to the matching story-manager URL based on audience.
2. Delete `web/src/app/admin/articles/[id]/review/page.tsx` (767 LOC).
3. Delete `web/src/app/admin/articles/[id]/edit/page.tsx` (910 LOC).
4. If `web/src/app/admin/articles/[id]/` is empty after deletion, remove the directory.
5. Optionally add to `web/src/middleware.js`: `if (pathname.match(/^\/admin\/articles\/[^/]+\/(review|edit)$/)) { /* 301 to /admin/story-manager/<id> or /admin/kids-story-manager/<id> based on a server-side audience lookup */ }` — note this requires an audience lookup against the articles table, which is doable via a thin route handler if owner wants the redirect.
6. **Verify F7 endpoints aren't used elsewhere**: check that the `Regenerate` button currently in the F7 review page doesn't have unique behavior — its functionality should be absorbed by NEW-2's "Rewrite" AI action inside story-manager, OR added as a "Regenerate from cluster" button in story-manager.
7. Sweep `Reference/`, `Current Projects/`, `Future Projects/`, `Sessions/` docs for `/admin/articles/[id]` references; update or remove.

**BLOCKED BY:** Task 2 must ship first (newsroom must route Generate to story-manager directly, otherwise deleting the F7 pages strands operators with no post-Generate destination).

**SCOPE:** ~1 hour after Task 2 lands and the grep shows no remaining linkers.

---

**🔁 GO BACK TO** — once we finish the rest of the question pass, re-open Task 2 / Task 3 / Task 4 to:
1. Lock the open items in Task 2 (layout direction, Both button, cluster-level control placement).
2. **Owner enumerates the full AI action set for Task 3** — this blocks all coding on Task 3.
3. Confirm Task 4 deletion is safe via the grep sweep.
4. Owner confirms Task 5 conditional: prompt picker actually works as expected in newsroom (Default / Preset / Custom modes all functional, presets load from `ai_prompt_presets`, custom prompt flows into pipeline).

---

### Task 5 — Mark V4 prompt-architecture doc as superseded; document live flow

**Source decision:** Q4 — what shipped is enough.

**Files in scope:**
- `Future Projects/24_AI_PIPELINE_PROMPTS.md` — annotate as superseded
- `Reference/` — add a small doc describing live prompt-versioning behavior
- (Optional) `Reference/CLAUDE.md` — add 1 line pointing to the live flow

**CURRENT BEHAVIOR (verified in `web/src/app/admin/newsroom/page.tsx` lines 122-1556):**
- `PromptPicker` component (line 1489) offers three modes:
  - **Default** — uses `editorial-guide.ts` prompt as-is.
  - **Preset** — operator picks from `ai_prompt_presets` DB table (managed at `/admin/prompt-presets`).
  - **Custom** — operator types freeform prompt body in a textarea.
- `activePromptBody` memo at line 802 picks ONE of the three.
- The chosen prompt body is forwarded into `GenerationModal` (line 1165) → into the pipeline as freeform instructions.
- This is **flat single-pick** — no stacking / layering.

**TARGET BEHAVIOR:**
- `Future Projects/24_AI_PIPELINE_PROMPTS.md` carries a clear "SUPERSEDED 2026-04-26" header explaining that the live flat single-pick architecture (Default / Preset / Custom) replaces the V4 layered/stacked proposal.
- A new `Reference/prompt-versioning.md` (or section in CLAUDE.md) documents the live flow so future contributors don't re-propose layered architecture without context.

**CHANGES:**
1. `Future Projects/24_AI_PIPELINE_PROMPTS.md` — prepend a header block:
   ```markdown
   <!-- SUPERSEDED 2026-04-26.
   Live prompt-versioning shipped as a flat single-pick model:
     - Default (uses web/src/lib/pipeline/editorial-guide.ts as-is)
     - Preset (picks one row from ai_prompt_presets table)
     - Custom (freeform textarea)
   See web/src/app/admin/newsroom/page.tsx PromptPicker (line ~1489)
   and /admin/prompt-presets for management.
   This V4 layered/stacked proposal is NOT planned. If layering is
   needed later, reopen as a fresh project. -->
   ```
2. Create `Reference/prompt-versioning.md` (~30 lines) describing:
   - The 3 modes
   - Where presets live (`ai_prompt_presets` table)
   - How `activePromptBody` flows into the pipeline
   - Where to manage presets (`/admin/prompt-presets`)
   - That kid prompts pull from the same table (audience-scoped)
3. Optional: add 1 line to `Reference/CLAUDE.md` pointing to the new doc.

**Acceptance criteria:**
- `Future Projects/24_AI_PIPELINE_PROMPTS.md` clearly marked superseded at the top.
- `Reference/prompt-versioning.md` exists and accurately describes the 3-mode picker + presets table.

**SCOPE:** ~30 min.

**Conditional:** Owner verifies on next newsroom use that the picker actually works (Default → uses base prompt; Preset → loads + applies the chosen preset body; Custom → operator's text reaches the pipeline). If not, Q4 reopens.

---

### Task 6 — Strip kid illustration requirement from PRELAUNCH §3.13

**Source decision:** Q6 — owner won't have illustrations ready pre-launch; image support is a later project.

**Files in scope:**
- `Current Projects/PRELAUNCH_UI_CHANGE.md` — edit §3.13 + the "Kids:" line in the rollout summary

**CURRENT BEHAVIOR (verified):**
- `articles.illustration_url` column does NOT exist (zero hits in `schema/`, `web/src`, `web/src/types/database.ts`).
- `articles.cover_image_url` exists but is the adult hero photo — wrong fit for kid-friendly illustrations.
- `PRELAUNCH_UI_CHANGE.md:225` (inside §3.13 Kids): "Reading is large-type, illustrated. Pull illustrations from `articles.illustration_url` (column add, UI-only). No ads ever."
- `PRELAUNCH_UI_CHANGE.md:386` (rollout summary): "Kids: today's-adventure home, illustration support, ParentalGateModal call-site audit."
- `PRELAUNCH_UI_CHANGE.md` Part 5: "All RPCs and DB schema" stays the same — directly contradicts §3.13's column-add proposal.

**TARGET BEHAVIOR:**
- §3.13's "illustrated" requirement is removed. Kid reader stays large-type text-only for pre-launch.
- No `articles.illustration_url` column added.
- The contradiction with Part 5 disappears.
- Owner sources illustrations separately later when image support is wired (separate post-launch project).

**CHANGES:**
1. `Current Projects/PRELAUNCH_UI_CHANGE.md:225` — replace the bullet with: "**Reading is large-type.** Designed for kid focus and comprehension. No ads ever. (Illustrations deferred — owner will add when image support lands as a separate post-launch project.)"
2. `Current Projects/PRELAUNCH_UI_CHANGE.md:386` — remove "illustration support" from the kids rollout line. New text: "Kids: today's-adventure home, ParentalGateModal call-site audit."
3. Optionally add at the top of §3.13 a short note: `<!-- 2026-04-26: illustration requirement dropped per Q6 — kid reader is text-only for pre-launch. -->`

**Acceptance criteria:**
- `grep -n "illustration" "Current Projects/PRELAUNCH_UI_CHANGE.md"` returns the explanatory note + the deferred-mention only; no remaining "illustration_url" or "illustrated" requirement.
- Part 5's "schema stays the same" stands uncontradicted.

**SCOPE:** ~5 min.

**No blockers.**

### Task 7 — Rewrite `Future Projects/02_PRICING_RESET.md`

**Source decision:** Q7 — current StoreManager.swift pricing is final.

**Files in scope:**
- `Future Projects/02_PRICING_RESET.md` — rewrite to remove A/B framing, document locked prices
- `Future Projects/views/ios_adult_subscription.md` — verify it references the same prices; update if not

**CURRENT BEHAVIOR:** `02_PRICING_RESET.md` frames pricing as an unresolved "Option A vs Option B" decision. Live code already has locked prices in `VerityPost/VerityPost/StoreManager.swift:50-57` and `web/src/lib/plans.js:101-117`.

**TARGET BEHAVIOR:** Doc reflects what shipped. No A/B framing. Locked prices documented clearly.

**CHANGES:**
1. `Future Projects/02_PRICING_RESET.md` — replace A/B framing with: "Pricing locked 2026-04-26. Verity $3.99/mo $39.99/yr · Verity Pro $9.99/mo $99.99/yr · Verity Family $14.99/mo $149.99/yr · Verity Family XL $19.99/mo $199.99/yr. Source of truth: StoreManager.swift:50-57 + lib/plans.js:101-117."
2. `Future Projects/views/ios_adult_subscription.md` — verify pricing references match; update any stale Option A/B mentions.

**SCOPE:** ~10 min.

**No blockers.**

---

### Task 19 — Migrate all admin pages to `hasPermission` gating

**Source decision:** Q30 — `hasPermission` is canonical; same principle as Task 18 (route compliance) applied to admin pages.

**Companion:** Task 18 enforces the permission matrix at the API route layer. Task 19 enforces it at the page layer. Together they close the full gate.

**CURRENT BEHAVIOR (verified 2026-04-26):**
- 6 pages hardcode role literals: `access/page.tsx:82`, `analytics/page.tsx:73`, `feeds/page.tsx:82`, `notifications/page.tsx:113`, `subscriptions/page.tsx:121`, `system/page.tsx:135`. Pattern: `roleNames.some(r => r === 'owner' || r === 'admin')` or `roleNames.includes('owner') && roleNames.includes('admin')`.
- ~38 pages use role-set membership (e.g. `ADMIN_ROLES.has(role)`, `MOD_ROLES.has(role)`).
- 4 pages already use `hasPermission` — canonical.

**TARGET BEHAVIOR:**
- Every admin page gates via `hasPermission(user, 'some.permission.key')`. No role literals, no role-set checks in page-level gate code.
- The permission matrix (`permissions` table + `compute_effective_perms` RPC) is the single source of truth for what each role/plan/user can access.

**CHANGES:**
1. **Phase 1 — 6 hardcoded pages** (smallest, safest, most egregious drift):
   - For each page, identify the right permission key (query `permissions` table — likely `admin.access`, `admin.analytics`, etc.).
   - Replace the `roleNames.includes(...)` block with `hasPermission(user, '<key>')` from `web/src/lib/permissions.js`.
   - Verify the permission key exists in the DB and is assigned to `owner` + `admin` roles via the matrix.
2. **Phase 2 — ~38 role-set pages**:
   - Grep for `ADMIN_ROLES\|MOD_ROLES\|EDITOR_ROLES\|OWNER_ROLES` in `web/src/app/admin/`.
   - For each hit, map the role-set to its equivalent permission key and replace.
   - Run `scripts/check-admin-routes.js` after (confirms route layer still clean).

**Acceptance criteria:**
- `grep -rn "roleNames.includes\|roleNames.some\|ADMIN_ROLES.has\|MOD_ROLES.has" web/src/app/admin/` returns zero hits in page-level gate code.
- `tsc --noEmit` clean.
- Manual click-through: each of the 6 Phase 1 pages still loads for owner/admin, still blocks non-admin.

**SCOPE:** Phase 1 ~2 hours. Phase 2 ~1 day (sweep is mechanical but large).

**No blockers.**

---

### Task 9 — Show Family + Family XL as "Coming soon" on billing UI

**Current state:** `is_active=false` plans are filtered out entirely — invisible on the web billing page. Family and Family XL just don't appear.

**What needs to happen:** Billing UI renders inactive plans as greyed-out "Coming soon" cards — visible but not purchasable. DB stays unchanged. iOS StoreKit unaffected.

**Files:** `web/src/app/profile/settings/page.tsx` billing section (~line 3817).

---

Locked-in pipeline flow as of 2026-04-26 (so the owner doesn't have to re-explain):

> Filter / search / pick prompt at top of newsroom → click Refresh feeds → ingest runs → cluster list renders → each cluster row shows two horizontal cards (Kids + Adult) → operator clicks Generate on one (or both) → pipeline produces full draft (title, slug, summary, body, timeline, quiz, sources) → operator lands on `/admin/story-manager/[id]` (adult) or `/admin/kids-story-manager/[id]` (kid) → **no auto-publish, ever** → operator reviews inline, edits any field, optionally clicks per-article AI actions (Rewrite / Enrich / Historical Context) → clicks Publish (or Reject) when satisfied.

---

## A. Architecture / product fate (decisions that block downstream cleanup)

**Q1. Charter retired-but-still-cited — resurrect or delete?**

- **Why we ask.** `Future Projects/views/web_welcome_marketing.md` lists 8 trust/editorial pages (`/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`, `/archive/[date]`, `/recent`) as "to build". `Future Projects/views/00_INDEX.md` says they were "Removed from scope in the 2026-04-21 Charter update". `Future Projects/db/03_corrections_table.md` + `db/06_trust_events_table.md` are explicitly DEFERRED. Six other docs cross-reference the deleted strategy doc `04_TRUST_INFRASTRUCTURE.md`. The contradiction is *inside* `Future Projects/`.
- **What's there now.** Zero of the 8 pages exist in `web/src/app/`. The DB tables (`corrections`, `trust_events`, `standards_doc`) don't exist either. Some iOS Settings rows still surface "Standards" / "Corrections" links that 404 on tap (per audit; haven't independently grepped iOS).
- **Implications.**
  - **Cut all of it**: mass-edit 6+ docs to strip references, remove the iOS Settings rows. Charter commitment 4 sticks. ~1 hour of doc + iOS work.
  - **Resurrect**: re-create 4 deleted strategy docs, build 8 web pages, add 2 DB tables (corrections + trust_events), wire iOS to the new endpoints. 2-4 days minimum.
- **Decision (2026-04-26).** Cut all of it. Keep charter/trust pages retired for launch, strip stale references from `Future Projects/`, and remove iOS Settings links that currently 404. If revived later, reopen as a fresh scoped project after launch.
- (V1 I-1 / V2 U1 / GAPS Owner-§3 U1)

---

**Q2. Story-manager fate — keep parallel admin or deprecate legacy?**

- **Why we asked.** Two admin surfaces appeared to produce/edit articles. Audit (V2 D5) flagged as duplicates. Initial direction was "deprecate legacy."
- **What's actually there (re-verified).**
  - `web/src/app/admin/story-manager/page.tsx` (1229 LOC) — full manual-authoring form for adult articles (title, slug, summary, body, sources, timeline, quiz, hero pick).
  - `web/src/app/admin/kids-story-manager/page.tsx` (1037 LOC) — kid variant (no body field, no hero pick, blue accent).
  - `web/src/app/admin/articles/[id]/review/page.tsx` (767 LOC) + `edit/page.tsx` (910 LOC) — F7-pipeline-output review + edit pages. Single URL handles both audiences.
  - `web/src/app/admin/newsroom/page.tsx` (2349 LOC) — F7 redesign with unified cluster list + audience picker at generation time.
  - `web/src/app/admin/page.tsx:84` "New article" quick link points at `/admin/story-manager`.
- **Decision (2026-04-26 — walked back from initial "deprecate"):** **Keep `/admin/story-manager`.** It becomes the canonical post-Generate review-and-edit destination for adult drafts under the rebuilt newsroom flow (see DECISIONS LOG above). Audit's "duplicate" framing was wrong — this is an audience-specific landing page, not a duplicate of newsroom or F7 articles editor.
- **Spawned items.** NEW-1 (newsroom rebuild), NEW-2 (per-article AI actions), NEW-3 (delete F7 articles/[id]/review + edit). See DECISIONS LOG.
- (V1 I-5 / V2 U2 / V2 D5)

---

**Q3. Kid story-manager — merge with `?kid=true` toggle, or keep parallel?**

- **Why we asked.** Audit (V2 D6) flagged as near-duplicate of adult story-manager.
- **What's actually there.** `web/src/app/admin/kids-story-manager/page.tsx` (1037 LOC). Distinct from adult variant: blue accent (#2563eb), `EDITOR_ROLES` gate, no `body` field, no hero pick. Same form shape but kid-scoped categories + COPPA constraints.
- **Decision (2026-04-26 — walked back from initial "deprecate"):** **Keep `/admin/kids-story-manager`.** Becomes canonical post-Generate review-and-edit destination for kid drafts under the rebuilt newsroom flow. NOT merged with adult variant — kid form differs structurally and the URL split is intentional product separation by audience.
- **Spawned items.** Same NEW-1 / NEW-2 / NEW-3 as Q2.
- (V1 I-6 / V2 U3 / V2 D6)

---

**Q4. F7 V4 prompts vs F7-DECISIONS-LOCKED — which is canonical?**

- **Why we ask.** `Future Projects/24_AI_PIPELINE_PROMPTS.md` (called V4) proposes a different prompt-version system than what shipped per `F7-DECISIONS-LOCKED.md` Phase 4.
- **What's there now.** Shipped pipeline lives in `web/src/lib/pipeline/` (13 files: editorial-guide.ts, call-model.ts, prompt-overrides.ts, …). `editorial-guide.ts` is a verbatim port from a snapshot — character-for-character. V4 doc proposes a different layered-override scheme.
- **Implications.**
  - **V4 is next-cycle iteration**: leave V4 untouched, add a one-line "FUTURE — not yet implemented" header at the top of the doc.
  - **V4 is stale-superseded**: archive the doc, update `Future Projects/24_AI_PIPELINE_PROMPTS.md:?` to redirect to `F7-DECISIONS-LOCKED.md`.
  - This affects Q44 (full diff between F7-PM-LAUNCH-PROMPT and F7-DECISIONS-LOCKED).
- (V1 I-2 / V2 D9 + C25)

---

**Q5. F7-DECISIONS-LOCKED Decision 8 vs §5 line 348 — internal contradiction.**

- **Why we ask.** Same doc, two paragraphs that disagree on what the pipeline should do when the AI returns a `correct_index` outside `0..3`.
- **What's there now.** Decision 8 says "patches wrong correct_index" (silently fix). §5 line 348 says "throw-and-regenerate for safety" (regenerate the question). Haven't independently verified which behavior actually shipped in the pipeline code.
- **Implications.**
  - **Patch silently**: weaker quiz quality (we ship a "fixed" answer that may not match the article), faster pipeline.
  - **Throw-and-regenerate**: stricter quality bar, occasional cost spike on regen, maybe a generate-failure rate increase.
- (V1 I-3 / V1 Q-7 / V2 C25)

---

**Q6. PRELAUNCH_UI_CHANGE.md Part 5 vs §3.13 — internal contradiction.**

- **Why we ask.** Same doc, opposite claims about whether `articles.illustration_url` is a new column.
- **What's there now.** Part 5: "schema stays the same". §3.13: proposes `articles.illustration_url`. Live `articles` table — haven't independently verified column presence.
- **Implications.**
  - **Schema stays**: §3.13 is wrong; remove the proposed column.
  - **Add column**: Part 5 is wrong; write migration to add `articles.illustration_url`, wire the upload UI, plumb the read path through reader + admin newsroom.
- (V1 A-8 / V2 §2.B)

---

**Q7. Pricing — Option A vs Option B?**

- **Why we ask.** `Future Projects/02_PRICING_RESET.md` and `Future Projects/views/ios_adult_subscription.md` reference Option A vs Option B without an owner-locked choice. Meanwhile App Store Connect product IDs are de-facto truth.
- **What's there now.** Live code reflects 8 IAP product IDs at `VerityPost/VerityPost/StoreManager.swift:50-57` and matching DB plans (per `web/src/lib/plans.js:101-117`):
  - Verity: $3.99/mo, $39.99/yr
  - Verity Pro: $9.99/mo, $99.99/yr
  - Verity Family: $14.99/mo, $149.99/yr
  - Verity Family XL: $19.99/mo, $199.99/yr
- **Implications.**
  - **Lock in current pricing**: rewrite `02_PRICING_RESET.md` to drop the A/B framing and document what shipped.
  - **Pick the un-shipped option**: requires App Store Connect price changes (Apple-side flow), DB plan price updates, marketing page rewrite.
  - **Asking what A/B even meant** is fair — the doc was written before pricing locked.
- (V1 I-4 / V1 Q-Pricing)

---

**Q8. F1-F4 vs PRELAUNCH side-by-side scope diff — approve the audit?**

- **Why we ask.** PRELAUNCH_UI_CHANGE supersedes F1-F4 on overlapping scope (more recent), but the F-specs aren't marked. No line-by-line diff exists, so we can't tell which F-sections die vs survive.
- **What's there now.** Four F-spec files (`F1`, `F2-reading-receipt.md`, `F3-...`, `F4-...`) all dated pre-PRELAUNCH. PRELAUNCH dated 2026-04-25.
- **Implications.**
  - **Approve**: I read all 5 docs, mark each F-section "shipped / superseded / still-relevant" with citations. ~30 min.
  - **Skip**: docs stay drifted; new readers will find contradictions and ask the same questions.
- (V2 U4 / GAPS M5)

---

**Q9. F2 reading-receipt UI gate — confirm whether the UI is intentionally hidden pre-launch?**

- **Why we ask.** Data layer is built (`reading_log` table active with 8 rows; `api/stories/read` live; admin pages consume it). Audit suspects UI is hidden but couldn't confirm.
- **What's there now.** `story/[slug]/page.tsx` is 1752 LOC; haven't grepped for the reading-receipt UI specifically. `LAUNCH_HIDE_ANON_INTERSTITIAL = true` is one confirmed kill-switch in that file (line 80).
- **Implications.**
  - **Intentionally hidden**: leave it. Add to `KILL_SWITCH_INVENTORY` so the launch flip is tracked.
  - **Should ship**: surface the UI gate. Probably 1-2 hour edit to story page.
  - **Don't know**: I can grep + report what gating exists in 5 minutes if you want.
- (V2 U12 / GAPS M19)

---

**Q10. F3 earned-chrome perm-vs-plan gating — read CommentRow and tell me how it works?**

- **Why we ask.** Audit deferred. F3 spec says comment-author chrome (badge / verified pill / etc.) should differentiate by something — unclear if it's `hasPermission` or plan-tier.
- **What's there now.** `web/src/components/CommentRow.tsx` — exists, ~31 lines per audit, has `COMMENT_MAX_DEPTH=2` constant (D15). Haven't read the chrome-rendering branch.
- **Implications.**
  - **Currently uses plan-tier**: doc may be wrong, or this is unmigrated.
  - **Currently uses `hasPermission`**: matches the canonical pattern.
  - **Doesn't differentiate yet**: F3 not implemented; matches the "F3 absorbed into PRELAUNCH" claim.
  - I can read the file in 5 minutes and tell you which is true.
- (V2 U13 / GAPS M20)

---

## B. Code/DB scope decisions

**Q11. `verity_family_annual` + `verity_family_xl` plans — `is_active=false` — intentional?**

- **Why we ask.** AuditV2 queried the live DB and found these two plans flagged inactive. They're in `lib/plans.js` PRICING and in `StoreManager.swift` product IDs.
- **What's there now (per audit, not independently re-queried today).** DB `plans` table: `verity_family_annual.is_active=false`, `verity_family_xl.is_active=false`. Code paths assume both are sellable. `lib/plans.js:164` `getWebVisibleTiers` filters out inactive plans — so checkout UI on web silently drops them.
- **Implications.**
  - **Intentional pre-launch hold**: leave the flag, document why in the doc; the iOS app will still try to sell them via StoreKit (StoreKit doesn't read this flag) — possible UX bug if iOS shows them and web doesn't.
  - **Oversight**: flip to `is_active=true`. One UPDATE, then verify checkout works.
  - **Family is rolling out later**: keep flag down on web, hide from iOS too.
- (V1 Q-13 / V2 U5)

---

**Q12. `ai_models` table dual-provider — both intended?**

- **Why we ask.** AuditV2 saw 4 active rows in `ai_models`, including both Anthropic and OpenAI providers. Pipeline could be using either or both.
- **What's there now.** `web/src/lib/pipeline/call-model.ts` — abstracts model dispatch. `package.json` lists both `@anthropic-ai/sdk` (^0.90.0) and `openai` (^6.34.0). So both are installed.
- **Implications.**
  - **Both intentional** (multi-provider for resilience / cost / model-mix): leave it; document which model handles which step.
  - **One defunct**: drop the SDK, drop the unused rows, stop paying for two API surfaces.
- (V2 U18)

---

**Q13. Adult quiz threshold hardcoded `>= 3` in RPC — add a setting now or wait?**

- **Why we ask.** `schema/012_phase4_quiz_helpers.sql:85` and `:322` both hardcode `correct_sum >= 3` and `v_correct >= 3` in `user_passed_article_quiz` and `submit_quiz_attempt`. Kids side is parameterized (per audit). Asymmetric governance for the same product behavior.
- **What's there now (verified).** No `quiz.unlock_threshold` row in `settings`. Web `lib/settings.js` has `getNumber()` helper to read settings rows but no quiz threshold key exists. Comments route enforces this via `user_passed_article_quiz` RPC pre-check (`api/comments/route.js:64`).
- **Implications.**
  - **Add setting now**: write migration to add `settings.quiz.adult_unlock_threshold = 3`, parameterize both RPCs to read it. Maybe 1 hour. Symmetry with kids.
  - **Wait until threshold needs to change**: leaves the asymmetry; if you ever decide adults need 4/5, it's a migration anyway.
  - **Audit framing may overstate**: the original intent might have been "3 is forever" — just a literal, not a violation.
- (V1 C-4 / V1 Q-8 / V2 C13 / V2 Q6)

---

**Q14. Bias-spotting fate — wire it or delete the dead branch?**

- **Why we ask.** The kids app has a "spotted a biased headline" mechanic that's wired in the data layer but unreachable from the UI. Verified at the source.
- **What's there now (verified).**
  - `KidsAppRoot.swift:199` calls `state.completeQuiz(passed:..., biasedSpotted: false)` — hardcoded `false`.
  - `KidsAppState.swift:203-214` — the only branch that constructs `BadgeUnlockScene` is `if biasedSpotted { ... }`.
  - `BadgeUnlockScene.swift` (306 LOC) — dead code as currently called.
  - `QuizPassScene.swift` (351 LOC) — same orphan pattern (audit C12, only its own `#Preview` constructs it).
- **Implications.**
  - **Wire it**: KidQuizEngine needs a per-question "is biased headline" flag, the engine has to detect/track which the kid spotted, KidsAppRoot threads `biasedSpotted: true/false` into `completeQuiz`. Probably ~3-4 hours.
  - **Delete**: drop `BadgeUnlockScene.swift` (306) + `QuizPassScene.swift` (351), strip the `if biasedSpotted` branch from KidsAppState, remove the BadgeUnlockScene case from `KidsAppRoot.ActiveSheet`. ~30 min.
  - **Defer to post-launch**: leave the dead code with a TODO header + add to `KILL_SWITCH_INVENTORY`. Ships as-is; "biased headlines spotted" stat in profile reads 0 forever.
- (V1 B-13 / V1 Q-12 / V2 C11 + C12)

---

**Q15. Schema gaps 7..8 / 52 / 92..93 / 100 — backfill or document as bootstrap?**

- **Why we ask.** Verified gaps via `ls schema/`. Some have known sources; some are mysteries.
- **What's there now (verified).**
  - **7..8** — gap. No known source; pre-numbered-convention bootstrap likely.
  - **52** — gap. Same.
  - **92..93** — `Archived/2026-04-19-prelaunch-sprint/round_a_migration.sql` + `round_b_migration.sql`. SQL bodies live in archive, not in `schema/`.
  - **100** — `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql`. Header says "no DB change is applied by this file" — it was a sync-from-prod doc, not a real migration. Live RPCs `require_outranks` + `caller_can_assign_role` exist in `pg_proc` per AuditV2 verification.
- **Implications.**
  - **Backfill**: copy the archive files into `schema/092`, `schema/093`, `schema/100`. DR replay reproduces the live state. ~15 min.
  - **Document as bootstrap**: write a `schema/00_README.md` explaining "missing IDs reflect pre-numbered-convention or archived rebuilds; live state is canonical via reset_and_rebuild_v2.sql + supabase_migrations table".
  - **For 100 specifically**: the file declares itself a no-op sync doc, so backfilling it doesn't change DR. The live RPCs need a real `CREATE OR REPLACE` migration regardless (V2 C2 — Sprint 1 #2). That's a separate fix.
- (V1 C-7 / V1 Q-6 / V2 C2)

---

**Q16. Apple Day-1 entitlements bundle — flip all at once or sequence?**

- **Why we ask.** Adult and kids each have HALF the entitlements they need. Apple-block now actionable per memory. Question is rollout pattern.
- **What's there now (verified).**
  - **Adult `VerityPost.entitlements`**: `applesignin: Default` only. Missing `aps-environment`, missing `associated-domains`.
  - **Kids `VerityPostKids.entitlements`**: `aps-environment=development` + `associated-domains=applinks:veritypost.com`. Missing nothing critical, but `development` should flip to `production` for App Store builds.
  - **Adult `PushRegistration.swift`** calls `registerForRemoteNotifications` without an entitlement — silently broken right now.
  - **Adult Universal Links** (e.g., `KidsAppLauncher.swift` deep-link path) open Safari instead of the app.
- **Implications.**
  - **All at once**: one build, one TestFlight, all entitlements configured. Risk: if any one breaks signing, the build doesn't ship at all. ~30 min config + provisioning profile regeneration.
  - **Sequence (push first, then UL, then kids prod flip)**: smaller blast radius per step. More TestFlight cycles. Probably wastes a day total.
  - **Apple Console walkthrough memory says we deferred the bundle ID + capabilities walkthrough** — Q79 needs answering before any of this.
- (V1 B-5/B-6/B-7 / V1 Q-9 / V2 C4 + C35 + C37)

---

**Q17. `possibleChanges/` — purge from app bundle, or move out of source tree?**

- **Why we ask.** 7 mockup files (HTML/JSX/MD) inside `VerityPost/VerityPost/possibleChanges/` will ship as Resources in the `.app` bundle.
- **What's there now (verified).** `VerityPost/project.yml:30` excludes only `**/.DS_Store`. The folder lives directly under the source path.
- **Implications.**
  - **Purge from app bundle (add to project.yml excludes)**: file stays in the repo for reference, doesn't ship. 1-line edit.
  - **Move out of source tree entirely**: cleanest; relocate to `VerityPost/possibleChanges/` outside the target source. ~5 min including a build verify.
  - **Either way fixes the same App Store hygiene issue.**
- (V1 B-9 / V1 Q-11 / V2 C42)

---

**Q18. `CFBundleVersion=1` — pick a bump pattern (manual / agvtool / CI)?**

- **Why we ask.** Both iOS apps have `CFBundleVersion=1` and have never bumped. App Store Connect rejects builds where the version hasn't changed.
- **What's there now (verified).** `VerityPost/VerityPost/Info.plist:31` — `<string>1</string>`. `VerityPostKids/VerityPostKids/Info.plist` — same. `project.yml`: `CURRENT_PROJECT_VERSION: "1"`.
- **Implications.**
  - **Manual**: edit `project.yml` per submission. Cheapest, error-prone (forgetting bumps a published-version conflict on every TestFlight).
  - **`agvtool new-version -all`**: one command per submission. Standard Apple-recommended path. Still manual but less error-prone.
  - **CI auto-bump**: GitHub Action increments on every merge to main. Best long-term, more setup. Owner has no CI for iOS today (per audit).
- (V1 B-14 / V2 C41)

---

## C. Doc / convention decisions

**Q19. Adopt `99.Organized Folder/Proposed Tree` reorg of `Current Projects/`?**

- **Why we ask.** Mid-audit, `99.Organized Folder/Proposed Tree` appeared at repo root proposing numbered prefixes (`00-LIVE/`, `10-LAUNCH-PACKETS/`, `20-FEATURES/`, `30-AUDITS/`).
- **What's there now (verified).** File exists at `99.Organized Folder/Proposed Tree` (no `.md` extension). Folder name is unusual (`99.Organized Folder/`). `Current Projects/` is currently a flat heap of ~14 root files plus subfolders.
- **Implications.**
  - **Adopt**: requires CLAUDE.md path rewrites everywhere (the doc tree is referenced by name throughout). High effort, mid-launch reorg risk.
  - **Reject**: rename the file to `.md` extension and either move into `AuditV1/` or delete.
  - **Half-adopt** (use the categorisation but keep current paths): basically just clean up `Current Projects/` in place.
- (V1 Q-1)

---

**Q20. CLAUDE.md drift fixes — one-shot or cycle by cycle?**

- **Why we ask.** Multiple stale claims in CLAUDE.md that the audits flagged. Question is rollout style.
- **What's there now (verified).**
  - Apple-block paragraph (lines 35-39): "owner does not yet have an Apple Developer account" — memory says enrolled.
  - Repo-tree comment "FALLBACK_CATEGORIES hardcode still there in `web/src/app/page.tsx`" — `grep` returns 0 hits.
  - "ParentalGate has zero callers (T-tbd)" — verified 4 callers (`PairCodeView.swift:143`, `ProfileView.swift:48` + `:51`, `ExpertSessionsView.swift:85`).
  - "23 rules-of-hooks disables" — verified count is 25.
  - "the 3800-line settings page" — actual `profile/settings/page.tsx` is 5247 lines.
  - "schema/100_backfill_admin_rank_rpcs_*.sql" — file lives in `Archived/`, not `schema/`.
- **Implications.**
  - **One-shot**: 6 edits to `Reference/CLAUDE.md` in one commit. ~15 min. Risk: minor merge conflict if owner is editing in parallel.
  - **Cycle by cycle**: each item gets fixed when its surface gets touched. Drift compounds in the meantime.
- (V1 Q-2)

---

**Q21. Retired-path references inside historical session logs — patch or leave period-correct?**

- **Why we ask.** `site/`, `01-Schema/`, `05-Working/`, `docs/`, `proposedideas/`, `Ongoing Projects/`, `test-data/` paths exist throughout old session logs in `Sessions/`.
- **What's there now (per audit).** Many session logs in `Sessions/04-1[5-9]-2026/` reference paths that were renamed in 2026-04-20.
- **Implications.**
  - **Patch**: ~50+ files with sed-style edits. Loses the historical accuracy ("at the time, this was where it lived").
  - **Leave period-correct**: future readers have to know paths got renamed. Not a real bug, just slightly confusing.
- (V1 Q-3)

---

**Q22. `VerityPost/VerityPost/REVIEW.md` — keep, annotate per-item, or retire?**

- **Why we ask.** 400-line 2026-04-19 UI/UX audit. Some items shipped (per Session 5 SHIPPED commits) but REVIEW isn't annotated; cross-references files like `KidViews.swift` that no longer exist (audit confirmed deletion).
- **What's there now.** File exists at the path. Sized at 400 lines per audit; haven't independently read.
- **Implications.**
  - **Keep + annotate per-item**: walk every item, mark shipped / stale / open. ~2 hours.
  - **Mark whole file historical + create new REVIEW**: declare REVIEW.md a snapshot, start `REVIEW_2026-04-26.md` for outstanding work. ~30 min.
  - **Retire entirely**: delete; outstanding items already live in MASTER_TRIAGE.
- (V1 A-35 / V1 Q-10)

---

**Q23. PROFILE_FULL_FLOW.md — promote to `Reference/`?**

- **Why we ask.** Z08 candidate; never read end-to-end. Could be a useful canonical doc or stale archive material.
- **What's there now.** File path not pinned in audit (says "Z08"); haven't independently located.
- **Implications.**
  - **Promote**: copy to `Reference/`, link from CLAUDE.md.
  - **Leave in archive**: no harm.
  - **Read first**: I can locate + read in 5 min, report what's in it.
- (V1 §5 #56 / V2 U9 / GAPS M13)

---

**Q24. Future Projects 8-doc → 24-doc chronology — what happened?**

- **Why we ask.** `Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md:50` describes dissolving an 8-doc `Future Projects/`. Same session's NEXT_SESSION_PROMPT flagged the folder reappearing as a contradiction. Current state: 24-doc panel-driven set. The transition isn't recorded.
- **What's there now.** `Future Projects/` exists with 24 docs, all dated 2026-04-21.
- **Implications.**
  - This is a "tell me how it happened" question — historical, not actionable. Knowing helps me trust whether the 24-doc set is intentional or an accident.
  - **If intentional re-creation**: trust the 24 docs as canonical.
  - **If out-of-band tool action**: re-evaluate which docs are "real".
  - **If owner-direct**: the 8 → 24 expansion was a deliberate panel structure decision, treat as canonical.
- (V1 I-12)

---

**Q25. Per-session `NEXT_SESSION_PROMPT` files — establish `_superseded/` convention?**

- **Why we ask.** Sessions/04-21-2026/Session 1 + 2 + 04-22-2026 etc. each carry a `NEXT_SESSION_PROMPT` that's been superseded by the next session's variant; only 04-22-2026 used `_superseded/` convention.
- **What's there now.** Inconsistent — most session folders just leave the old prompt next to the next one.
- **Implications.**
  - **Adopt `_superseded/`**: future sessions move stale prompts there. Backfill old folders if owner cares about hygiene.
  - **Don't bother**: prompts are session-scoped, drift is expected.
- (V1 I-13)

---

**Q26. `.mcp.json` — committed AND gitignored. Pick one.**

- **Why we ask.** File is committed at root, but `.gitignore:57` lists it. Future re-add would fail silently.
- **What's there now (per audit).** `.gitignore:57` — `.mcp.json`. File present at repo root.
- **Implications.**
  - **Drop the gitignore line**: file stays tracked, future edits commit.
  - **`git rm --cached .mcp.json`**: file becomes untracked, gitignore actually applies.
  - **What's in `.mcp.json`**: probably MCP server config for Claude Code. If it has secrets → untrack. If it's pure config → keep tracked.
- (V1 D-2 / V1 I-14 / V2 §2.F)

---

**Q27. AuditV1 vs AuditV2 archival — keep both or archive one?**

- **Why we ask.** V1 default: keep both as parallel artifacts. V2 default: archive V1 once V2 acted on.
- **What's there now (verified).** Both folders committed at repo root in commit `cf5481a`. `Audit-Final/OwnerQuestions.md` (this file) is the merged owner-decision tracker.
- **Implications.**
  - **Keep both**: storage is free, future audit-of-the-audits is easier.
  - **Archive V1**: move to `Archived/AuditV1/`. V2 + Audit-Final remain canonical.
  - **Archive both**: once Audit-Final's questions are answered and the punch list ships, both source audits become history. Move to `Archived/audit-2026-04-25/`.
- (V1 I-11 / V1 Q-14 / V2 U20)

---

## D. Cross-zone hooks pending owner call

**Q28. Wire `scripts/check-admin-routes.js` into CI?**

- **Why we ask.** Script exists but isn't wired into CI. ADMIN_ROUTE_COMPLIANCE audit found 52/75 routes failing at one point; spot-checks since are compliant but a full re-run hasn't happened.
- **What's there now (per audit).** `scripts/check-admin-routes.js` exists; no GitHub Action references it.
- **Implications.**
  - **Wire to CI**: every PR that touches `web/src/app/api/admin/` runs the check. Catches drift automatically. Need a `.github/workflows/admin-routes.yml`. ~30 min.
  - **Skip**: drift creeps back in over time.
  - **Run manually as a one-shot**: clears the current backlog without recurring guarantee.
- (V1 D-9 / CZ-H)

---

**Q29. `TODO_2026-04-21.md` unchecked items — sweep or leave?**

- **Why we ask.** File still carries unchecked items. Cross-reference with MASTER_TRIAGE not done.
- **What's there now.** Haven't read; per audit the unchecked items are unspecified count.
- **Implications.**
  - **Approve a focused sweep**: walk every unchecked item, classify shipped / open / stale, fold open ones into MASTER_TRIAGE. ~1 hour.
  - **Leave deferred**: file rots; new contributors won't trust it.
- (V1 CZ-I)

---

**Q30. Admin permission-gate inconsistency — confirm `hasPermission` is canonical, approve migration sweep order?**

- **Why we ask.** Three patterns coexist across admin pages.
- **What's there now (per audit).**
  - **Hardcoded `'owner'||'admin'` literals**: 6 pages — access, analytics, feeds, notifications, subscriptions, system.
  - **Role-set membership** (e.g., `MOD_ROLES.has(role)`): ~30 pages.
  - **`hasPermission` resolver**: canonical pattern, partial coverage.
  - Audit log writes also split: server-owned via `recordAdminAction`, client-side via `record_admin_action`, direct supabase mutations bypassing audit.
- **Implications.**
  - **`hasPermission` canonical**: matches CLAUDE.md "permission matrix is the platform's DNA". Migrate the 6 hardcoded pages first (smallest unit), then the ~30 role-set pages.
  - **Role-sets canonical**: simpler, but breaks the permission matrix as-source-of-truth promise.
  - **Tolerate the mix**: drift will continue.
- (V1 I-7 / V2 C21 + C22)

---

**Q31. `lib/rlsErrorHandler.js` — possibly wrong client. Read + fix if broken.**

- **Why we ask.** File imports `permissions.js#hasPermissionServer` (browser cookie client) while invoked from server route handlers. Audit suspects wrong client.
- **What's there now.** File exists at `web/src/lib/rlsErrorHandler.js`. Haven't read end-to-end.
- **Implications.**
  - **Approve the read + fix**: 5-10 min to confirm. If wrong, swap to `auth.js#hasPermissionServer` (server-context). Should be a 2-line fix.
  - **Skip**: handler may be returning wrong perm data on RLS errors → wrong error messages.
- (V2 U11 / GAPS M16)

---

**Q32. `permissions.js` dual-cache stale-fallthrough — trace + fix?**

- **Why we ask.** Wave A 4-vs-1 said bug; never traced through cache logic. The L2 hard-clear comment in `permissions.js` (lines 64-99) addresses the inverse direction (revoke), but the section-cache fallthrough on full-cache miss could still serve stale.
- **What's there now (verified by reading file).** `permissions.js:174-186` — `hasPermission(key)`: if `allPermsCache` exists, check it (deny on missing key); ELSE iterate `sectionCache.values()` and return first match. After L2 hard-clear, `allPermsCache=null` until refetch completes — during that window, sectionCache entries (if any survived `sectionCache.clear()` race) could be returned. The clear/null happen in `refreshIfStale` lines 91-94, which appears atomic.
- **Implications.**
  - **Trace + verify**: 10-min read; either confirm the race is impossible or write a small fix. Worth doing pre-launch since perms are load-bearing.
  - **Skip**: theoretical risk; in practice Wave A reviewers couldn't agree it was real.
- (V2 U19 / GAPS M17)

---

## E. Audit-process gap closures (V2 GAPS list)

These are "approve more audit work" decisions. Each is bounded effort.

**Q33. Re-run the 11 W2 findings as fresh-agent verification when budget resets?**

- **Why.** Wave 3 was supposed to be fresh-eyes; degraded to same-eyes when V2 agent budget ran out.
- **Cost.** ~11 parallel agents; ~$20-50 in API spend depending on model.
- **Value.** Closes the independence gap on the cross-cutting findings.
- (V2 GAPS M1)

**Q34. 47 NOTIFICATION_DIGEST lens findings — sweep?**

- **Why.** 8 lenses didn't write to disk: L01, L02, L04, L08, L11, L12, L13, L15. Findings live only in `Round2/_NOTIFICATION_DIGEST.md`.
- **Cost.** ~2-3 hours of careful walking. Each finding gets shipped / stale / open classification.
- **Value.** Largest single block of unresolved audit volume.
- (V2 U7 / GAPS M2)

**Q35. ~60 of 72 MASTER_TRIAGE SHIPPED claims — verify?**

- **Why.** ~12 spot-checked. The remaining ~60 SHIPPED blocks were trusted, not independently verified.
- **Cost.** `git show <SHA>` + read current file at cited line × 60. ~3-4 hours.
- **Value.** Catches any "I claimed this shipped but it didn't quite" cases.
- **Likely outcome.** 90%+ will verify clean; the value is mostly in catching the 5%.
- (V2 GAPS M3 + M8)

**Q36. EXT_AUDIT_FINAL_PLAN open Tiers + 15 O-DESIGN items — diff vs PRELAUNCH_UI_CHANGE?**

- **Why.** Many likely superseded by PRELAUNCH; diff never done.
- **Cost.** ~1 hour.
- (V2 U8 / GAPS M4)

**Q37. xlsx ↔ DB row-by-row diff for permissions — write the diff script?**

- **Why.** 998 DB perm rows + 3,090 set_perms vs `permissions.xlsx` never compared. Drift here = permission bugs you can't see.
- **Cost.** ~1 hour to write Node + xlsx-reader script. Then run it before any new permission work.
- **Value.** High — owner already burned on permission drift before.
- (V2 U6 / GAPS M6)

**Q38. `tsc --noEmit` + `xcodebuild` — run on both projects?**

- **Why.** 9 truly-open MASTER_TRIAGE bugs cited as "still in code" via grep, not compile-verified.
- **Cost.** 5 min for `tsc`. ~10 min each for the two xcodebuild runs.
- **Value.** Confirms the codebase actually compiles before any "ship" claim. Should be done routinely.
- (V2 GAPS M7)

**Q39. AuditV1's 4 sessions — fresh pass vs V2?**

- **Why.** V2 cherry-picked V1 findings via grep; V1 finished all 11 sessions after V2 was authored. V2 may have missed nuance.
- **Cost.** Reading V1's 11 docs (~25KB total) end-to-end vs V2 line-by-line. ~2 hours.
- **Value.** This Audit-Final file does most of that already. Probably unnecessary now.
- (V2 GAPS M9)

**Q40. MASTER_TRIAGE_2026-04-23.md — full read?**

- **Why.** Z02 (V2 wave 1) summarized; never paginated 256 lines. Round 3 + 4 sub-items not enumerated.
- **Cost.** 30-60 min.
- **Value.** Complete inventory of open items.
- (V2 GAPS M10)

**Q41. `Future Projects/db/*.md` 11 files — per-file read?**

- **Why.** Z06 summarized at zone level. Schema-change specs may overlap or contradict.
- **Cost.** 1-2 hours.
- (V2 GAPS M11)

**Q42. `Q_SOLO_VERIFICATION` items Q-SOLO-01 + Q-SOLO-05 — resolve?**

- **Why.** Listed in audit, never resolved against code/DB.
- **Cost.** 15-30 min each.
- (V2 GAPS M12)

**Q43. F7 tables ↔ migration 177 SELECT-grant — audit each table?**

- **Why.** Migration 177 only granted SELECT on 4 of ~10 F7-era tables.
- **Cost.** SQL `has_table_privilege` query loop, ~10 min. Write follow-up migration 178+ for missing grants.
- (V2 GAPS M14)

**Q44. F7-PM-LAUNCH-PROMPT vs F7-DECISIONS-LOCKED — full diff?**

- **Why.** W2-02 listed only high-level superseded points.
- **Cost.** ~30 min granular diff.
- **Affects.** Q4 (V4 prompts) and Q5 (Decision 8 contradiction).
- (V2 GAPS M15)

**Q45. ExpertWatchlistCard concurrency mitigation — read line 4892?**

- **Why.** `profile/settings/page.tsx:2732` acknowledges concurrent A11yCard / ExpertWatchlistCard saves; never confirmed line 4892's clobber-prevention pattern.
- **Cost.** 10 min.
- (V2 GAPS M18)

**Q46. Round 2 L03 TOCTOU specifics — verify each cited race?**

- **Why.** Lens reported races in comment edit/delete + quiz attempt-count; never verified.
- **Cost.** 30-60 min.
- (V2 GAPS M21)

**Q47. Round 2 L06 cross-provider duplicate-row repro — read the lens text?**

- **Why.** Live DB has no duplicates. Need to know if L06 was real-and-fixed-since, or theoretical.
- **Cost.** 15 min read.
- (V2 GAPS M22)

**Q48. Story-page launch-hide enumeration — grep all kill-switches?**

- **Why.** Need full list of env-flag conditional renders in `story/[slug]/page.tsx`.
- **Cost.** 15-min grep + report. I already saw `LAUNCH_HIDE_ANON_INTERSTITIAL=true` (line 80).
- (V2 U15 / GAPS M23)

**Q49. BUCKET5_TRACKER stale "queued" entries — sweep?**

- **Why.** Walk each "queued" item against closed Batches 28-35.
- **Cost.** 30-60 min.
- (V2 GAPS M24)

**Q50. `audit_log` (6,456 rows) vs `admin_audit_log` (90 rows) — disambiguate?**

- **Why.** Two audit tables; canonical use of each not documented.
- **What's there now.** `lib/adminMutation.ts` header comment line 61 says: "Goes to admin_audit_log (NOT the older audit_log table — that one is for system events: auth, stripe, promo)." So canonical use IS documented in the helper, just not externally.
- **Cost.** Lift the comment into a `Reference/audit-log-tables.md`. 10 min.
- (V2 GAPS M25)

**Q51. Storage bucket state for avatar/banner — Supabase MCP `storage.buckets` query?**

- **Why.** Storage buckets not in default `list_tables`. MASTER_TRIAGE #19 references avatar bucket.
- **Cost.** 1 SQL query + interpretation. 5 min.
- (V2 GAPS M26)

**Q52. `verity_score_events` table existence post 109/111 rollback — explicit check?**

- **Why.** Recent `list_tables` did NOT show it (suggests rolled back correctly), never explicitly confirmed.
- **Cost.** `SELECT to_regclass('public.verity_score_events')` — 1 query.
- (V2 GAPS M27)

**Q53. `APP_STORE_METADATA.md` beyond `site/` paths — full audit?**

- **Why.** Audit cited 5+ stale paths. Didn't validate screenshot file names, retired feature claims, IAP product IDs.
- **Cost.** 30-45 min end-to-end read + cross-check.
- **Stakes.** This doc is the App Store submission asset.
- (V2 GAPS M28)

**Q54. `audit_log` table policies + write-paths inventory — grep + RLS read?**

- **Why.** RLS state not enumerated; routes that write directly to `audit_log` (bypassing `record_admin_action`) not counted.
- **Cost.** `grep -rn "from('audit_log').insert\|.into('audit_log')"` + RLS query. 15 min.
- (V2 GAPS M29)

**Q55. `webhook_log` idempotency claim — read lines 88-115?**

- **Why.** Locking mechanism asserted in `api/stripe/webhook/route.js:88-115` but not code-verified.
- **What's there now (verified by reading lines 86-120 of that file).** Atomic claim via `webhook_log.event_id UNIQUE` constraint; INSERT with `processing_status='processing'` is the claim. Unique violation → look up prior row → branch on its status (processed = replay, in-flight = wait, failed = re-claim). `STUCK_PROCESSING_SECONDS=5min` reclaim. Pattern is correct.
- **Cost.** 10 min to write up the verification more formally.
- (V2 GAPS M30)

---

## F. Lower-confidence claims that need spot-verification

Each is a 5-15 minute read to confirm or refute.

**Q56. C2 — what happened to original `100_backfill_admin_rank_rpcs_*.sql`?**

- **What's there now (verified).** File exists at `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql`. Header reads: "no DB change is applied by this file" (it's a sync-from-prod doc). The mystery isn't really a mystery — it was archived deliberately, but the live RPCs still need an authoritative on-disk source migration (V2 C2 / Sprint 1 #2).
- **Implication.** No action needed for "the mystery"; the C2 fix (write `schema/178_recreate_admin_rank_rpcs.sql`) is what matters.
- (V2 Q1)

**Q57. C7 — has anyone actually run the 127 rollback?**

- **What's there now (verified).** `schema/127_rollback_126_newsroom_redesign.sql` lines 24-26 (verified): `DELETE FROM public.permissions WHERE key IN ('pipeline.manage_clusters', 'pipeline.manage_presets', 'pipeline.manage_categories')`. Live perm keys are `admin.pipeline.<noun>.<verb>` (per CLAUDE.md). So this DELETE matches no rows → rollback would leave permission rows orphan.
- **Implication.** Severity = "future footgun" if no one's run it. If we've never rolled back 126, fix is just "edit 127 in place" or "write 179 corrected rollback" — same fix either way.
- (V2 Q2)

**Q58. C16-C20 — MASTER_TRIAGE items #6, #7, #8, #9 still in code?**

- **What's there now (per audit, not independently re-verified today).** Listed as still-open in W2-07. Cited specifically: #6 PasswordCard `signInWithPassword` clobbers session, #7 `Ad.jsx:148-152` no scheme validation on `ad.click_url`, #8 avatar/banner `backgroundImage` from raw URLs (CSS injection), #9 profile/[id] tab nav hardcoded to viewer's profile.
- **Cost.** 10 min to re-grep each cited file/line. I can do this now if you want.
- (V2 Q3)

**Q59. D7 — `/api/comments/[id]/report` no rate limit — read full file?**

- **What's there now (verified by reading file).** Confirmed: no `checkRateLimit` call between `requirePermission('comments.report')` and `service.from('reports').insert(...)`. Sister `/api/reports` has 10/hr.
- **Implication.** Real bug. Fix is ~6 lines (mirror the `/api/comments/route.js:37-49` rate-limit pattern).
- (V2 Q4)

**Q60. C8 — `adminMutation.ts:84-88` `p_ip`/`p_user_agent` gap — confirmed by reading file?**

- **What's there now (verified).** Lines 84-88 are the file's own header comment: "FOLLOW-UP (not in scope of audit-sweep B-C): recordAdminAction does not yet pass `p_ip` / `p_user_agent` through to the RPC." Lines 138-155: `recordAdminAction` body — confirmed no `p_ip` / `p_user_agent` passed.
- **Implication.** Real, self-documented gap. Fix is reading the request headers (forwarded-for, user-agent) and threading them through. ~10 min.
- (V2 Q5)

**Q61. C13 — adult quiz threshold framing — violation or "kid pct was always intended for adults"?**

- **What's there now (verified).** `schema/012_phase4_quiz_helpers.sql:85` and `:322` — `>= 3` literal. No `quiz_unlock_threshold` settings row. Kids side IS DB-driven (per audit).
- **Implication.** Either framing is defensible. The fix (Q13) is the same either way — add the setting if you want symmetry, leave the literal if you don't.
- (V2 Q6)

**Q62. C45 — 5 orphan components — verify dynamic-import grep didn't miss `React.lazy` / `next/dynamic`?**

- **Listed orphans:** `RecapCard.tsx`, `admin/Sidebar.jsx`, `admin/ToastProvider.jsx`, `FollowButton.tsx`, `TTSButton.tsx`.
- **Caveat.** `RecapCard` + `FollowButton` match recap + follows feature names, both of which have launch-hide gates. Possibly orphan-by-kill-switch, not actually unused.
- **Cost.** `grep -rn "lazy\|dynamic" web/src` + cross-reference. 10 min.
- **Implication.** If launch-hidden but referenced via dynamic import, deletion would break post-launch.
- (V2 Q7)

**Q63. Wave A `comment_status` enum drift — final grep across schema + admin API?**

- **Why.** 6/6 audit consensus said this is a bug; AuditV2 marked refuted. Strong consensus is unusual to refute from a single grep.
- **Cost.** `grep -rn "comment_status\|published" schema/ web/src/app/api/admin/comments/` + interpretation. 10 min.
- (V2 Q8)

**Q64. L08-001 kid RLS edge case — verify NULL kid_profile_id during JWT-validation pre-claim?**

- **Why.** RLS verified correct from a structural standpoint, but L08 may have been about a NULL-during-pre-claim edge case.
- **Cost.** 15 min read of the kid JWT path + RLS policies.
- (V2 Q9)

**Q65. Wave B `handlePaymentSucceeded` bump — trace lines 812-870 for early-return paths?**

- **Why.** Bump call confirmed at `webhook/route.js:846`. Surrounding code path may early-return before reaching line 846.
- **Cost.** 10 min.
- (V2 Q10)

**Q66. Z02's "67 items" vs "39 numbered" count discrepancy — reconcile?**

- **Why.** Z02 may have counted lettered items (K1, K8, AD1, B1, B3, B11) plus Round-3 / Round-4 sub-items.
- **Cost.** 10 min count.
- (V2 Q11)

**Q67. AuditV1 vs AuditV2 thoroughness — spot-check V1 findings?**

- **Why.** V2 framing assumes it's at least as thorough as V1.
- **Implication.** Audit-Final's §6 cross-reference (in V1 99-final-synthesis.md) already does most of this. Probably redundant now.
- (V2 Q12)

**Q68. `events` parent table no-policies — confirm `/api/events/batch` uses service role?**

- **Why.** Refutation depended on this assumption.
- **Cost.** 5 min file read.
- (V2 Q13)

**Q69. AppIcon "no PNG" claim — directly inspect `Assets.xcassets/AppIcon.appiconset/`?**

- **Cost.** 1 `ls` command.
- **Implication.** Confirms Apple-block P0 item severity.
- (V2 Q14)

**Q70. `superadmin` count = 8 — read each routine body to confirm role-check vs comment?**

- **Cost.** 8 SQL `pg_get_functiondef` queries. 15 min.
- (V2 Q15)

**Q71. `cleanup_rate_limit_events` runtime severity — pg_cron actually scheduling it?**

- **What's there now (verified by reading schema/170).** Function body uses `occurred_at`; live column is `created_at`. Function would throw `column does not exist` on every call.
- **Severity hinges on:** is pg_cron calling it? If yes → broken on every invocation, P0. If no → dormant, P3.
- **Cost.** 1 SQL query: `SELECT * FROM cron.job WHERE command LIKE '%cleanup_rate_limit_events%'`.
- (V2 Q16)

**Q72. AASA file — served by Next.js route handler?**

- **Cost.** `find web/src/app -path '*well-known*'` — 1 command.
- **Implication.** If served via route handler, audit's "AASA missing from public/" is misleading. If not, Universal Links don't work — Apple-block.
- (V2 Q17)

**Q73. `JsonLd.tsx` `/icon.svg` reference — `web/src/app/icon.svg/route.ts` exists?**

- **Cost.** `find web -name "icon.svg*"` — 1 command.
- **Implication.** If route handler exists, no bug. If not, 404 on every page that uses JsonLd organisation schema.
- (V2 Q18)

**Q74. `HomeFeedSlots.swift` + `Keychain.swift` orphan — comprehensive grep?**

- **Cost.** `grep -rn "HomeFeedSlots\|Keychain" VerityPost/` — 1 command.
- **Implication.** If truly orphan, delete; ~1500 LOC of dead code.
- (V2 Q19)

**Q75. `admin/PipelineRunPicker.tsx` "two call sites" comment stale — check dynamic imports?**

- **Cost.** `grep -rn "PipelineRunPicker" web/src` — 1 command.
- **Implication.** Comment correctness, not behavior.
- (V2 Q20)

---

## G. State discrepancies — what's actually true?

These are items where the audits found **conflicting or unverifiable claims about live state** of external systems, accounts, or owner-side facts. Audits have no Vercel / Stripe / Apple / AdSense dashboard visibility.

### Apple / App Store

**Q76. Is the Apple Developer account active right now?**

- **Why we ask.** Three different sources, three different claims.
  - `Reference/CLAUDE.md:35-39`: "owner does not yet have an Apple Developer account" — Apple-block paragraph.
  - Memory `project_apple_console_walkthrough_pending.md`: "owner has dev account; bundle ID + capabilities walkthrough deferred."
  - AuditV2 §1.A: "verified via memory 2026-04-25 that account is enrolled (Team `FQCAS829U7`)."
- **What's there now.** Adult app entitlements are `applesignin` only (no push, no UL); kids has push (`development`) + UL but no SIWA. Code is positioned for whatever the owner says — but nothing has been provisioned in App Store Connect yet (per memory).
- **Implications.**
  - **Active**: ~6 P0 items unblock immediately — entitlements (Q16), AppIcon (Q77), Universal Links (Q78), AASA, App Store URL placeholders (Q81).
  - **Not active**: Apple-block paragraph in CLAUDE.md still applies; kids `aps-environment=development` is fine; adult push registration stays silently broken.
  - **Active but un-walked-through**: bundle ID + capabilities still pending. Q79 next.

**Q77. Does `Assets.xcassets/AppIcon.appiconset/` actually have PNG files?**

- **Why we ask.** Audit reported only `Contents.json`, no PNGs. Audit also admitted (Q14) it was reported but not directly inspected.
- **Cost.** `ls` command. 5 seconds.
- **Implication.** No PNG → App Store rejects build. P0 if you submit before fixing.
- **Both apps** affected per audit (B-8 / V2 C5).

**Q78. Does Universal Links work end-to-end, and is AASA being served somewhere?**

- **Why we ask.** Audit says `web/public/` has only `ads.txt`, no `apple-app-site-association`. Audit also admitted (Q72) it didn't check whether AASA is served via a Next.js route handler at `/.well-known/apple-app-site-association/route.ts`.
- **What's there now.** Adult entitlements have NO `associated-domains`. Kids entitlements have `applinks:veritypost.com`. So even if AASA exists, adult UL still doesn't work.
- **Implications.**
  - **AASA exists via route handler + adult entitlement added**: UL works for both.
  - **AASA missing**: P2 to add.
  - **Owner can confirm by tapping a `https://veritypost.com/<x>` link from Messages — does iOS show "Open in Verity Post"?**

**Q79. Are bundle IDs registered, push certs issued, capabilities set in App Store Connect?**

- **Why we ask.** Memory says bundle ID + capabilities walkthrough deferred. We can't see App Store Connect.
- **What's there now.** Code expects bundle IDs `com.veritypost.app` (adult) + `com.veritypost.kids` (kids). Push registration, IAP products, SIWA capability all assumed configured.
- **Implications.**
  - **All registered + configured**: just need to add the missing entitlements per Q16 and submit.
  - **Not yet**: Apple-Console walkthrough is the gating step. ~30-60 min real-time with owner.
  - **Partially**: depends. Need owner to walk through what's set.

**Q80. What are the live App Store Connect IAP product IDs?**

- **What's there now (verified).** `StoreManager.swift:50-57` — 8 product IDs hardcoded:
  - `com.veritypost.verity.{monthly,annual}`
  - `com.veritypost.verity_pro.{monthly,annual}`
  - `com.veritypost.verity_family.{monthly,annual}`
  - `com.veritypost.verity_family_xl.{monthly,annual}`
- **Implication.** If App Store Connect product IDs match these strings exactly, no code change needed. If they differ, `StoreManager.swift` needs editing. Owner can confirm by listing the product IDs from App Store Connect.

**Q81. What's the published Kids app App Store URL?**

- **What's there now (verified).**
  - `KidsAppLauncher.swift:19` — fallback URL `https://veritypost.com/kids-app`.
  - `web/src/components/kids/OpenKidsAppButton.tsx:3` — `// TODO: swap to real App Store URL once app is published`.
- **Implication.**
  - **Not yet published**: leave fallback. The veritypost.com/kids-app marketing page handles "kids app coming soon" messaging.
  - **Published**: swap both to real `https://apps.apple.com/app/...` URL. ~5 min.

**Q82. Stripe sandbox or live keys in `web/.env.local` right now?**

- **What's there now.** `scripts/stripe-sandbox-restore.sql` exists — implies sandbox mode is the dev default. `web/.env.local` is gitignored so I can't see it.
- **Implication.**
  - **Sandbox**: dev-mode stripe; webhook fires from Stripe CLI replay. Ready for sandbox testing.
  - **Live**: production billing operational.
  - **Affects:** Q83-Q86, Stripe webhook P0 readiness.

### Stripe / billing

**Q83. Do `cancel`, `change-plan`, `resubscribe` actually call Stripe yet, or still DB-only?**

- **Why we ask.** MASTER_TRIAGE notes billing routes are still "DB-only, not Stripe-synced".
- **What's there now.** Routes exist at `web/src/app/api/billing/{cancel,change-plan,resubscribe}` (per directory listing). Haven't read each to verify. Stripe webhook (`api/stripe/webhook/route.js`, 955 LOC) IS wired and handles `customer.subscription.updated` / `.deleted` / `invoice.payment_*` / `charge.refunded` / etc.
- **Implication.**
  - **DB-only**: in-app cancel/change/resubscribe writes to DB but doesn't call Stripe APIs — Stripe state will diverge from app state until webhook fires from Stripe CLI/test action.
  - **Synced**: routes call Stripe SDK + the webhook reconciles. Production-ready.
  - **Mid-migration**: some routes synced, some not. Need to read each.

**Q84. Has the Stripe webhook actually processed real production events yet?**

- **What's there now (per audit).** `webhook_log` has 22 rows. Tiny for a live billing system.
- **Implication.**
  - **Test traffic only**: pre-launch state; expected.
  - **Real production events**: 22 = 22 customers transacted. Owner knows.
  - **Empty webhook_log + a real customer last week**: signature verification or RLS bug.

**Q85. Was Round 2 L06 "cross-provider duplicate sub rows" a real repro, or theoretical?**

- **What's there now.** AuditV2 marked refuted — live DB has 0 duplicate sub rows; 2 active stripe subs, both unique.
- **Caveat.** Audit Q10/GAPS M22 admit they didn't trace whether the bump call at `webhook/route.js:846` is reachable on all paths.
- **Implication.**
  - **Real repro fixed since**: file an audit-result note "no repro on current state".
  - **Theoretical concurrency note**: leave open, treat as future footgun.

**Q86. Is the Stripe webhook idempotency claim correct (and proven via replay)?**

- **What's there now (verified by reading lines 86-120).** Atomic claim via `webhook_log.event_id UNIQUE` + status-based branching. Pattern is correct. **Has anyone tested replay** (Stripe CLI `stripe events resend <event_id>`, or production duplicate `event.id`) is the question.
- **Implication.**
  - **Tested**: high confidence. Note in `Reference/`.
  - **Untested**: `stripe events resend` with the same `event_id` and check `webhook_log` → expected: row exists with status=processed, response should be `{ received: true, replay: true }`. ~10 min test.

**Q87. Pricing decision (Option A vs B) — same as Q7. Pick.**

### AdSense / ads

**Q88. What's the AdSense application status?**

- **What's there now (verified).**
  - `web/src/app/layout.js:23` — `const ADSENSE_PUB_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID || ''`.
  - `web/src/app/layout.js:95` — `'google-adsense-account': 'ca-pub-3486969662269929'` emitted in `<meta>` UNCONDITIONALLY.
  - `web/.env.example:69-72` — comment: "Leave BLANK until AdSense approves".
  - `web/public/ads.txt` — exists (the only file in `public/`).
- **Implication.**
  - **Approved**: set `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` in Vercel env, AdSense library loads, `<AdSenseSlot />` components render.
  - **Pending**: keep env var unset; the meta tag at layout.js:95 is enough for AdSense to recognize the site for review.
  - **Rejected**: dispute or pivot to direct ad sales (audit found the schema for this — `Ad.jsx`, ad_units table, etc.).

**Q89. If approved, what's the publisher ID?**

- **What's there now.** Hardcoded `ca-pub-3486969662269929` in the meta tag at layout.js:95. So this IS the registered publisher account.
- **Implication.** Owner can verify in AdSense dashboard. If status=approved, set `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=ca-pub-3486969662269929` in Vercel and we're live.

**Q90. Ad-serving model — AdSense auto-units, manual ad ops, or both?**

- **What's there now.** `Ad.jsx:148-152` reads `ad.click_url` from DB without scheme validation — that's MASTER_TRIAGE #7 / V2 C16 (XSS vector). Suggests hand-managed ad infrastructure exists alongside AdSense.
- **Implication.**
  - **AdSense only**: the `Ad.jsx` + `ad_units` infrastructure can be deleted. ~500-1000 LOC removed.
  - **Hand-managed only**: AdSense `<meta>` tag is dead, can be removed.
  - **Both**: keep both, fix the `Ad.jsx:148-152` scheme-validation bug regardless.

### Vercel / infra

**Q91. What's the canonical production Vercel URL, and was the typo fixed?**

- **Why we ask.** `OWNER_TODO_2026-04-24.md` lists "Vercel URL typo" as an owner-action item.
- **What's there now.** `web/vercel.json` exists. Haven't read. Likely contains the production domain.
- **Implication.** I can read `vercel.json` to see the configured domain; you can confirm against Vercel dashboard whether it matches.

**Q92. Is `SENTRY_DSN` currently set in Vercel env vars?**

- **What's there now (verified by reading `web/next.config.js:60-86`).** The throw fires ONLY when `@sentry/nextjs` package fails to load AND `VERCEL_ENV=production`. It does NOT throw if `SENTRY_DSN` is missing — it just silently runs without error reporting.
- **(Correction to my earlier StateDiscrepancies framing — Sentry build does not fail on missing DSN, only on missing package.)**
- **Implication.**
  - **DSN set**: Sentry captures errors. Memory `feedback_sentry_deferred.md` says "deferred until monetization + traffic" — possible misalignment.
  - **DSN unset**: build still passes; no error reporting. Matches "deferred" memory.

**Q93. Is pg_cron enabled and scheduling jobs?**

- **What's there now.** `OWNER_TODO_2026-04-24.md` lists "pg_cron" as an owner-action item. AuditV2 GAPS Q16 admits not checked.
- **Implication.** Affects severity of `cleanup_rate_limit_events` bug (Q71) and any scheduled cron jobs. 1 SQL query: `SELECT * FROM cron.job` resolves it.

**Q94. `webhook_log` 22 rows — production traffic or test traffic?**

- See Q84.

### Supabase / DB-state assumptions audits made

**Q95. Does `verity_score_events` exist post 109/111 rollback?**

- See Q52. 1 query.

**Q96. What's the storage bucket state for avatar/banner uploads?**

- See Q51. 1 query.

**Q97. Which is canonical — `audit_log` (6,456) or `admin_audit_log` (90)?**

- See Q50. Already documented in `lib/adminMutation.ts:61`. Just needs lifting into `Reference/`.

**Q98. Does `/api/events/batch` use service role?**

- See Q68. 5 min read.

**Q99. Is `cleanup_rate_limit_events` actually being called?**

- See Q71 + Q93.

**Q100. xlsx ↔ DB sync state — believed in sync right now, or run a drift sweep first?**

- See Q37.

**Q101. What's the live `perms_global_version` value?**

- **What's there now.** `Reference/FEATURE_LEDGER.md` says `4409`. AuditV2 §1.A flagged "possibly outdated". The actual storage location is `settings` table (per `lib/permissions.js` polling `my_perms_version()` RPC, which reads from there).
- **Implication.** 1 query to confirm. If wildly different, FEATURE_LEDGER.md needs a rewrite.

**Q102. `ai_models` dual-provider — both intended? (See Q12.)**

### Owner workflow / ex-people

**Q103. Has the ex-dev's access been revoked across all shared services?**

- **What's there now.** `OWNER_TODO_2026-04-24.md` lists "ex-dev removal" as owner-action.
- **Services to check:** GitHub repo collab + org membership; Vercel team; Supabase project members; Stripe team; AdSense; Apple Developer team; Anthropic console; OpenAI console; any Slack workspace.
- **Implication.** Owner-only action. I can confirm the list above; revocation has to happen on each dashboard.

**Q104. Was the migration-state SQL paste completed, and where does the result live?**

- **Why we ask.** Listed as owner-action. No record of completion.
- **Implication.** Owner-only "have you done this yet?". If yes, where's the output stored?

**Q105. Are AdSense + Apple review the only external launch blockers?**

- **What memory says.** `project_launch_model.md` — these are the only two launch gates.
- **Other potential blockers to consider:** DUNS number (sometimes required by AdSense / iOS publishing), COPPA-attorney sign-off (kids privacy review), Stripe production activation review, Anthropic API tier upgrade if traffic spikes.
- **Implication.** Owner confirms or adds to the gate list.

### Doc-vs-truth

**Q106. CLAUDE.md "3800-line settings page" — actual is 5247. Update annotation, remove, or split file?**

- **What's there now (verified).** `web/src/app/profile/settings/page.tsx` — 5247 lines.
- **Implications.**
  - **Update annotation**: change CLAUDE.md to "5247 lines, careful edits". 1 line change.
  - **Remove the size note**: just say "the giant settings page". Less drift over time.
  - **Split the file**: real architecture work; ~1-2 days. Worth doing if it keeps growing.

**Q107. CLAUDE.md "23 rules-of-hooks disables" — actual is 25 in `app/{recap,welcome,u}/...`. Acceptable, or sweep?**

- **What's there now (verified).** 25 disables found via grep.
- **Implications.**
  - **Acceptable**: update CLAUDE.md count + leave the disables.
  - **Sweep**: refactor each disable away. Probably ~2-4 hours; risk of subtle render-loop regressions.

**Q108. `Reference/README.md` says "kids iOS doesn't exist yet" — false. Rewrite or retire?**

- **What's there now.** `VerityPostKids/` shipped 2026-04-19 with 25 Swift files. The README claim is just stale.
- **Implications.**
  - **Rewrite**: 30 min update reflecting current state.
  - **Retire**: the file was never load-bearing; CLAUDE.md is the canonical entry. Just delete `Reference/README.md`.

**Q109. `Reference/parity/*.md` says localhost:3333 — actual is 3000. Confirm the canonical dev port?**

- **What's there now (verified).** `web/package.json:6` — `"dev": "next dev -p 3000"`. So 3000 IS canonical. The 3333 reference in parity docs is stale.
- **Implication.** 3 files to update (`Shared.md`, `Web-Only.md`, `iOS-Only.md`). Or rewrite the parity docs entirely (V1 A-4 already flags them for rewrite).

---

## Summary

- **A. Architecture / product fate**: Q1-Q10 (10) — load-bearing decisions
- **B. Code/DB scope**: Q11-Q18 (8) — sized but reversible
- **C. Doc / convention**: Q19-Q27 (9) — hygiene
- **D. Cross-zone hooks**: Q28-Q32 (5) — partly verified, partly need approval
- **E. Audit-process gap closures**: Q33-Q55 (23) — "do more audit work?"
- **F. Spot-verification**: Q56-Q75 (20) — 5-15 min code reads each
- **G. State discrepancies (Apple/Stripe/AdSense/Vercel/DB/owner-workflow/doc-vs-truth)**: Q76-Q109 (34) — most are "what's actually true?" not "decide A/B"

**Total: 109 items.**

**Categories I can clear myself with owner approval (no decision needed):** E (audit gap-closures, ~23), F (spot-verification, ~20), and the "1 query" items in G — easily ~50 items I can run if you say "go close the verifiable ones". Real owner-decision items are ~30-40.

**For off-the-cuff replies:** if you answer one question with implications for others (e.g., "kill story-manager" in Q2 also resolves Q3 and parts of E/F), I'll cascade and report what I executed.
