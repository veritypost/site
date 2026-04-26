# Owner Questions — merged from AuditV1 + AuditV2

Every question that requires owner direction across both audits, deduped and grouped. Each item cites its origin (V1 = `AuditV1/99-final-synthesis.md`, V2 = `AuditV2/AuditV2.md`).

---

## A. Architecture / product fate (decisions that block downstream cleanup)

**Q1. Charter retired-but-still-cited — resurrect or delete?**
`Future Projects/views/web_welcome_marketing.md` enumerates 8 new public trust/editorial pages (`/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead`, `/archive/[date]`, `/recent`) as pages to build. `views/00_INDEX.md` says they were "Removed from scope in the 2026-04-21 Charter update". `db/03_corrections_table.md` + `db/06_trust_events_table.md` are explicitly DEFERRED. Multiple iOS Settings views still link to `/standards` + `/corrections`.
- **Option A:** cut all of it (per Charter commitment 4) → mass-edit 6+ docs to remove references.
- **Option B:** resurrect the 4 retired strategy docs and ship the pages.
- (V1 I-1 / V2 U1)

**Q2. Story-manager fate.**
`web/src/app/admin/story-manager/page.tsx` (1229 LOC) vs `admin/articles/[id]/{review,edit}` F7 surfaces — both routable today.
- **Option A:** keep parallel admin (legacy + F7).
- **Option B:** deprecate legacy story-manager.
- (V1 I-5 / V2 U2 / V2 D5)

**Q3. Kid story-manager.**
`web/src/app/admin/kids-story-manager/page.tsx` (1037 LOC) — near-duplicate of story-manager.
- **Option A:** merge with `?kid=true` toggle.
- **Option B:** keep parallel.
- (V1 I-6 / V2 U3 / V2 D6)

**Q4. F7 V4 prompts vs F7-DECISIONS-LOCKED shipped.**
`Future Projects/24_AI_PIPELINE_PROMPTS.md` V4 proposes a different prompt-version system than what shipped per `F7-DECISIONS-LOCKED.md` Phase 4. Shipped pipeline (`web/src/lib/pipeline/editorial-guide.ts`, 13-file directory) is canonical.
- Is V4 next-cycle iteration, or stale-superseded?
- (V1 I-2 / V2 D9 + C25)

**Q5. F7-DECISIONS-LOCKED Decision 8 vs §5 line 348 — internal contradiction.**
Decision 8 says "patches wrong correct_index"; §5 says "throw-and-regenerate for safety."
- Pick one.
- (V1 I-3 / V1 Q-7 / V2 C25)

**Q6. PRELAUNCH_UI_CHANGE.md Part 5 vs §3.13 — internal contradiction.**
Part 5 says schema stays the same; §3.13 proposes new `articles.illustration_url` column.
- Reconcile.
- (V1 A-8 / V2 §2.B)

**Q7. Pricing not locked.**
`Future Projects/02_PRICING_RESET.md` and `views/ios_adult_subscription.md` reference Option A vs Option B without an owner-locked decision. App Store Connect product IDs are de-facto truth.
- Owner-locked decision needed.
- (V1 I-4)

**Q8. F1-F4 vs PRELAUNCH side-by-side scope diff.**
PRELAUNCH supersedes F1-F4 on overlapping scope (PRELAUNCH is more recent), but F-specs aren't marked. Line-by-line diff was never done.
- Approve a one-shot Wave 4 to walk all 4 F-specs + PRELAUNCH side-by-side and annotate.
- (V2 U4 / GAPS M5)

**Q9. F2 reading-receipt UI gate.**
Data layer is built (`reading_log` table active, 8 rows; `api/stories/read` live; admin pages consume it). UI may be hidden.
- Confirm whether F2 is intentionally UI-hidden pre-launch or whether the UI gate should ship.
- (V2 U12 / GAPS M19)

**Q10. F3 earned-chrome perm-vs-plan gating.**
Need to read `CommentRow` to see whether comment-author chrome differentiation uses `hasPermission` or just plan-tier.
- Owner direction on which is correct.
- (V2 U13 / GAPS M20)

---

## B. Code/DB scope decisions

**Q11. `verity_family_annual` + `verity_family_xl` plans — `is_active=false`.**
- Intentional pre-launch hold, or oversight?
- (V1 Q-13 / V2 U5)

**Q12. `ai_models` table dual-provider.**
4 active rows. Anthropic + OpenAI both present.
- Both intended, or one defunct?
- (V2 U18)

**Q13. Adult quiz threshold — hardcoded `>= 3` in `user_passed_article_quiz` RPC.**
No `quiz.unlock_threshold` setting (verified all 30 settings rows). Asymmetric with kids (`schema/162` is DB-driven).
- Add setting + parameterize the RPC now, or wait until threshold needs to change?
- (V1 C-4 / V1 Q-8 / V2 C13 / V2 Q6)

**Q14. Bias-spotting fate.**
`KidsAppRoot.swift:199` calls `completeQuiz(...biasedSpotted: false)` hardcoded; `BadgeUnlockScene` only constructs if `biasedSpotted`; `QuizPassScene` is also orphan.
- **Option A:** wire bias-spotting from quiz answers.
- **Option B:** delete the dead branch + dead scenes.
- (V1 B-13 / V1 Q-12 / V2 C11 + C12)

**Q15. Schema gaps 001-004 / 007-008 / 052.**
- Backfill from live DB DDL, or document as expected pre-numbered-convention bootstrap?
- (V1 C-7 / V1 Q-6)

**Q16. Apple Day-1 entitlements bundle.**
Adult missing `aps-environment` + `associated-domains`; Kids `aps-environment=development` (should flip to `production`); adult `applesignin` capability TBD.
- Flip all at once on the same build, or sequence them?
- (V1 B-5/B-6/B-7 / V1 Q-9 / V2 C4 + C35 + C37)

**Q17. `possibleChanges/` 7 mockup files inside `VerityPost/`.**
Currently ship as Resources in the `.app` bundle.
- **Option A:** purge from app bundle (add to project.yml excludes).
- **Option B:** move out of source tree entirely.
- (V1 B-9 / V1 Q-11 / V2 C42)

**Q18. iOS `CFBundleVersion=1` — never bumped.**
- Pick a bump pattern: manual, `agvtool`, or CI.
- (V1 B-14 / V2 C41)

---

## C. Doc / convention decisions

**Q19. Adopt `99.Organized Folder/Proposed Tree` reorg of `Current Projects/`?**
Numbered-prefix scheme (`00-LIVE/` / `10-LAUNCH-PACKETS/` / `20-FEATURES/` / `30-AUDITS/`). Concrete answer to Sessions 2+3 inconsistencies but reorgs feel risky mid-launch.
- (V1 Q-1)

**Q20. CLAUDE.md drift fixes — one-shot or cycle by cycle?**
The drift sweep (Apple-block paragraph, FALLBACK_CATEGORIES comment, ParentalGate "zero callers", 23-vs-25 rules-of-hooks count, 3800-line settings claim, schema/100 reference) — apply all together or as items get touched.
- (V1 Q-2)

**Q21. Retired-path references inside historical session logs.**
`site/`, `01-Schema/`, `05-Working/`, `docs/`, `proposedideas/`, `Ongoing Projects/`, `test-data/` paths exist throughout old session logs.
- **Option A:** patch them.
- **Option B:** leave period-correct.
- (V1 Q-3)

**Q22. REVIEW.md (`VerityPost/VerityPost/REVIEW.md`).**
400-line 2026-04-19 UI/UX audit. Some items shipped but REVIEW isn't annotated; cross-references files like `KidViews.swift` that no longer exist.
- **Option A:** annotate per-item ship state.
- **Option B:** mark whole file historical + create a new REVIEW for outstanding work.
- **Option C:** retire entirely.
- (V1 A-35 / V1 Q-10)

**Q23. PROFILE_FULL_FLOW.md — promote to `Reference/`?**
Z08 candidate; never read end-to-end.
- (V1 §5 #56 / V2 U9 / GAPS M13)

**Q24. Future Projects 8-doc → 24-doc chronology.**
`Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md:50` describes dissolving an 8-doc `Future Projects/`; same session's NEXT_SESSION_PROMPT flagged the folder reappearing. Current state: `Future Projects/` is a 24-doc panel-driven set dated 2026-04-21. Transition isn't captured anywhere.
- Was this intentional re-creation, an out-of-band tool action, or owner-direct authoring?
- (V1 I-12)

**Q25. Per-session NEXT_SESSION_PROMPT files never archived to `_superseded/`.**
Only 04-22-2026 used the convention.
- Establish convention going forward.
- (V1 I-13)

**Q26. `.mcp.json` — committed AND gitignored.**
- **Option A:** drop the gitignore line (keep tracked).
- **Option B:** `git rm --cached .mcp.json` (untrack).
- (V1 D-2 / V1 I-14 / V2 §2.F)

**Q27. AuditV1 vs AuditV2 archival.**
- V1 default: keep both as parallel artifacts.
- V2 default: archive V1 once V2 is acted on.
- (V1 I-11 / V1 Q-14 / V2 U20)

---

## D. Cross-zone hooks pending owner call

**Q28. ADMIN_ROUTE_COMPLIANCE 52/75 routes failing — full re-run.**
Spot-checks compliant. Wire `scripts/check-admin-routes.js` into CI to catch automatically.
- (V1 D-9 / CZ-H)

**Q29. TODO_2026-04-21.md unchecked items.**
Defer to a focused TODO sweep (cross-reference with MASTER_TRIAGE).
- Approve the focused sweep, or leave deferred?
- (V1 CZ-I)

**Q30. Admin permission-gate inconsistency — establish canonical, migrate everywhere.**
3 patterns coexist across admin pages: hardcoded `'owner'||'admin'` literals (6 pages: access/analytics/feeds/notifications/subscriptions/system), role-set membership (~30 pages), `hasPermission` resolver (canonical, partial). Audit log writes also split: server-owned, client-side `record_admin_action`, direct supabase mutations bypassing audit.
- Confirm `hasPermission` is the canonical. Approve the migration sweep order.
- (V1 I-7 / V2 C21 + C22)

**Q31. `lib/rlsErrorHandler.js` — possibly wrong client.**
Imports `permissions.js#hasPermissionServer` (uses browser cookie client) while invoked from server route handlers.
- One-shot read to confirm; if wrong, switch to server client.
- (V2 U11 / GAPS M16)

**Q32. `permissions.js` dual-cache stale-fallthrough.**
Wave A 4 vs 1 said bug; needs trace through cache logic.
- Approve the trace + fix.
- (V2 U19 / GAPS M17)

---

## E. Audit-process gap closures (V2-side)

**Q33. Re-run the 11 W2 findings as fresh-agent verification.**
Wave 3 was supposed to be fresh-eyes; degraded to same-eyes when budget ran out.
- Approve the re-run when agent budget resets?
- (V2 GAPS M1)

**Q34. 47 NOTIFICATION_DIGEST lens findings — fully deferred.**
8 lenses didn't write to disk: L01, L02, L04, L08, L11, L12, L13, L15. Findings live only in `Round2/_NOTIFICATION_DIGEST.md`. Each needs status: shipped / stale / still-open.
- Approve the sweep.
- (V2 U7 / GAPS M2)

**Q35. ~60 of 72 MASTER_TRIAGE SHIPPED claims not verified.**
~12 spot-checked. Remaining 60 SHIPPED blocks were trusted, not independently verified.
- Approve the verification pass (`git show <SHA>` + read current file).
- (V2 GAPS M3 + M8)

**Q36. EXT_AUDIT_FINAL_PLAN open Tiers + 15 O-DESIGN-* items not classified.**
Many likely superseded by PRELAUNCH_UI_CHANGE; diff never done.
- Approve the diff.
- (V2 U8 / GAPS M4)

**Q37. xlsx ↔ DB row-by-row diff for permissions.**
998 DB permission rows + 3,090 permission_set_perms vs `permissions.xlsx` never compared.
- Approve writing the diff script.
- (V2 U6 / GAPS M6)

**Q38. `tsc --noEmit` + `xcodebuild` never run.**
9 truly-open MASTER_TRIAGE bugs cited as "still in code" via grep, not compile-verified.
- Approve the build verification on both projects.
- (V2 GAPS M7)

**Q39. AuditV1's 4 completed files never read end-to-end by V2.**
V2 cherry-picked via grep; V1 finished all 11 sessions after V2 was authored.
- Approve a fresh pass merging missed V1 findings into V2 (or supersede with this Audit-Final).
- (V2 GAPS M9)

**Q40. MASTER_TRIAGE_2026-04-23.md not read end-to-end.**
Z02 summarized. Round 3 + Round 4 sub-items weren't enumerated.
- Approve the full read.
- (V2 GAPS M10)

**Q41. Future Projects/db/*.md 11 individual files not read.**
Z06 summarized at zone level.
- Approve per-file read.
- (V2 GAPS M11)

**Q42. Q_SOLO_VERIFICATION items Q-SOLO-01 + Q-SOLO-05 unresolved.**
Listed in audit but never resolved against code/DB.
- Approve the resolve.
- (V2 GAPS M12)

**Q43. F7 tables ↔ migration 177 SELECT-grant audit.**
Need to list all F7-era tables and check each for `SELECT` grant on `authenticated`.
- Approve the audit.
- (V2 GAPS M14)

**Q44. F7-PM-LAUNCH-PROMPT vs F7-DECISIONS-LOCKED full diff.**
W2-02 listed only high-level superseded points.
- Approve the granular diff.
- (V2 GAPS M15)

**Q45. ExpertWatchlistCard concurrency mitigation status.**
`profile/settings/page.tsx:2732` acknowledges concurrent A11yCard / ExpertWatchlistCard saves; never read line 4892 to confirm clobber-prevention.
- Approve the read.
- (V2 GAPS M18)

**Q46. Round 2 L03 TOCTOU specifics in comment edit/delete + quiz attempt-count.**
Never read the lens text or inspected specific routes for the race.
- Approve the verification.
- (V2 GAPS M21)

**Q47. Round 2 L06 cross-provider duplicate-row repro — real or theoretical?**
Live DB has no duplicate sub rows.
- Approve the lens read to determine.
- (V2 GAPS M22)

**Q48. Story-page launch-hide enumeration.**
Need to enumerate every kill-switched UI block in `story/[slug]/page.tsx`.
- Approve the enumeration.
- (V2 U15 / GAPS M23)

**Q49. BUCKET5_TRACKER stale "queued" entries sweep.**
Walk each "queued" item and verify against closed Batches 28-35.
- Approve the sweep.
- (V2 GAPS M24)

**Q50. `audit_log` (6,456 rows) vs `admin_audit_log` (90 rows) disambiguation.**
Two audit log tables; canonical use of each not determined.
- Approve the disambiguation read.
- (V2 GAPS M25)

**Q51. Storage bucket state for MASTER_TRIAGE #19 (avatar bucket).**
Need Supabase MCP `storage.buckets` query.
- Approve.
- (V2 GAPS M26)

**Q52. `verity_score_events` table existence post 109/111 rollback.**
Likely rolled back correctly (not in `list_tables`); never explicitly confirmed.
- Approve the explicit check.
- (V2 GAPS M27)

**Q53. APP_STORE_METADATA.md beyond `site/` paths.**
Audit cites 5+ stale `site/` paths; didn't audit document for other staleness (screenshot file names, retired feature claims, IAP product IDs).
- Approve end-to-end read.
- (V2 GAPS M28)

**Q54. `audit_log` table policies + write-paths inventory.**
RLS state not enumerated; routes that write directly to `audit_log` (bypassing `record_admin_action`) not enumerated.
- Approve the grep + RLS read.
- (V2 GAPS M29)

**Q55. `webhook_log` (22 rows) idempotency claim verification.**
Locking mechanism not code-verified end-to-end.
- Approve the claim block read at `api/stripe/webhook/route.js:88-115`.
- (V2 GAPS M30)

---

## F. Lower-confidence claims that need spot-verification (V2 Q-list)

These are V2 findings the audit author flagged as needing re-verification before action. Each is a 5-15 minute read.

**Q56.** C2 — what happened to original `100_backfill_admin_rank_rpcs_*.sql`? Renumbered or lost? (V2 Q1)
**Q57.** C7 — has anyone actually run the 127 rollback? Severity = currently affected vs future footgun. (V2 Q2)
**Q58.** C16-C20 — MASTER_TRIAGE items #6, #7, #8, #9: independently verify each is still in code at cited line ranges. (V2 Q3)
**Q59.** D7 — `/api/comments/[id]/report` "no rate limit": read full file to confirm. (V2 Q4)
**Q60.** C8 — `adminMutation.ts:84-88` `p_ip`/`p_user_agent` gap: read directly to confirm. (V2 Q5)
**Q61.** C13 — adult quiz threshold framing: violation vs "kid pct was always intended for adults too." (V2 Q6)
**Q62.** C45 — 5 orphan components: verify dynamic-import grep didn't miss `React.lazy` / `next/dynamic`. RecapCard + FollowButton may be orphan-by-kill-switch, not unused. (V2 Q7)
**Q63.** Wave A `comment_status` enum drift: 6/6 audit consensus was strong; grep across `schema/` migrations + admin API to absolutely rule out. (V2 Q8)
**Q64.** L08-001 kid RLS: verify the specific NULL `kid_profile_id` edge case during JWT-validation pre-claim. (V2 Q9)
**Q65.** Wave B `handlePaymentSucceeded` bump: trace lines 812-870 end-to-end for early-return paths. (V2 Q10)
**Q66.** Z02's "67 items" vs "39 numbered" count: reconcile. (V2 Q11)
**Q67.** AuditV1 vs AuditV2 thoroughness: spot-check V1 findings against V2 to confirm V2 didn't miss V1 nuance. (V2 Q12)
**Q68.** `events` parent table no-policies: confirm `/api/events/batch` uses service role. (V2 Q13)
**Q69.** AppIcon "no PNG" claim: directly inspect `VerityPost/VerityPost/Assets.xcassets/AppIcon.appiconset/`. (V2 Q14)
**Q70.** `superadmin` count = 8: read each routine body; confirm each match is in a role-check, not comment/variable. (V2 Q15)
**Q71.** `cleanup_rate_limit_events` runtime severity: check `cron.job` for any reference; if no scheduler runs it, bug is dormant. (V2 Q16)
**Q72.** AASA file: check whether served by Next.js route handler at `/.well-known/apple-app-site-association/route.ts`. (V2 Q17)
**Q73.** `JsonLd.tsx` `/icon.svg` reference: check whether `web/src/app/icon.svg/route.ts` exists. (V2 Q18)
**Q74.** `HomeFeedSlots.swift` + `Keychain.swift` orphan claim: comprehensive grep across iOS target. (V2 Q19)
**Q75.** `admin/PipelineRunPicker.tsx` "two call sites" comment: check for dynamic imports. (V2 Q20)

---

## G. State discrepancies — what's actually true?

These are items where the audits found **conflicting or unverifiable claims about live state** of external systems, accounts, or owner-side facts. Audits can read code/docs/DB but have no visibility into Vercel / Stripe / Apple / AdSense dashboards.

### Apple / App Store

**Q76. Is the Apple Developer account active right now?**
Discrepancy: `Reference/CLAUDE.md:35-39` says "owner does not yet have an Apple Developer account" — Apple-block paragraph treats publishing as gated. Memory `project_apple_console_walkthrough_pending.md` says "owner has dev account; bundle ID + capabilities walkthrough deferred." AuditV2 §1.A says "verified via memory 2026-04-25 that account is enrolled (Team `FQCAS829U7`)."
- If active, ~6 P0 items unblock immediately (entitlements, AppIcon, Universal Links, AASA, App Store URL placeholders).
- (V1 A-1 / V2 §2.A row 1 / Memory)

**Q77. Does `Assets.xcassets/AppIcon.appiconset/` actually have PNG files?**
AuditV2 Z17 reported only `Contents.json`, no PNGs. AuditV2 Q14 admits this was reported by Z17 but not directly inspected. App Store rejects builds without icons.

**Q78. Does Universal Links work end-to-end? Is AASA being served somewhere?**
AuditV2 says `web/public/` has only `ads.txt`; no `apple-app-site-association`. AuditV2 Q17 admits: didn't check whether AASA is served by a Next.js route handler at `/.well-known/apple-app-site-association/route.ts`.

**Q79. Are bundle IDs registered, push certs issued, capabilities set in App Store Connect?**
Memory says "bundle ID + capabilities walkthrough deferred." Adult `aps-environment` entitlement missing; Kids `aps-environment=development`. What's the actual state of provisioning?

**Q80. What are the live App Store Connect IAP product IDs?**
Pricing not locked (V1 I-4: Option A vs Option B in `02_PRICING_RESET.md`). Doc says "App Store Connect product IDs are de-facto truth" but the IDs aren't in any committed file.

**Q81. What's the published Kids app App Store URL?**
`KidsAppLauncher.swift:19` fallback URL: `https://veritypost.com/kids-app`. `OpenKidsAppButton.tsx:3`: `// TODO: swap to real App Store URL once app is published`. Has the app been published yet?
- (V1 B-10 + B-11 / V2 C43)

### Stripe / billing

**Q82. Is `web/.env.local` pointing at Stripe sandbox or live keys right now?**
`scripts/stripe-sandbox-restore.sql` exists. MASTER_TRIAGE notes billing routes are still "DB-only, not Stripe-synced." Which mode is live?

**Q83. Do `cancel`, `change-plan`, `resubscribe` actually call Stripe yet, or still DB-only?**
MASTER_TRIAGE says DB-only; need to confirm whether the Stripe sync work is in flight.

**Q84. Has the Stripe webhook actually processed real production events yet?**
`webhook_log` only has 22 rows — tiny for a live billing system. Production traffic, test traffic, or no traffic?

**Q85. Was Round 2 L06 "cross-provider duplicate sub rows" a real repro, or theoretical?**
AuditV2 marked refuted: live DB has zero duplicates; 2 active stripe subs, both unique. AuditV2 Q10 + GAPS M22 admit: didn't trace whether the surrounding code path always reaches `webhook/route.js:846` (the bump call). Early-return paths possible. Is the race actually closed?

**Q86. Is the Stripe webhook idempotency claim correct?**
AuditV2 GAPS M30: idempotency claim asserted in `api/stripe/webhook/route.js:88-115` but locking mechanism not code-verified. Has anyone tested replay (Stripe CLI replay event, or duplicate `event.id` from prod logs)?

### AdSense / ads

**Q87. What's the AdSense application status?**
Memory `project_launch_model.md` says: "owner's launch is AdSense + Apple review gates." Audits have no visibility — fully external. Approved? Pending? Rejected?

**Q88. If AdSense is approved, what's the publisher ID, and is `web/public/ads.txt` correct?**
Currently `ads.txt` is the only file in `public/`.

**Q89. Is ad-serving model AdSense auto-units, manual ad ops, or both?**
`Ad.jsx:148-152` reads `ad.click_url` from DB without scheme validation (security bug — MASTER_TRIAGE #7 / V2 C16). Suggests hand-managed ad-unit infrastructure, but unclear if it's wired to AdSense too.

### Vercel / infra

**Q90. What's the canonical production Vercel URL, and was the typo fixed?**
`OWNER_TODO_2026-04-24.md` lists "Vercel URL typo" as an owner-action item. Audits don't have Vercel dashboard access.

**Q91. Is `SENTRY_DSN` currently set in Vercel env vars?**
`web/next.config.js` requires it in prod or build fails. Memory `feedback_sentry_deferred.md` says Sentry is deferred. Conflict: build-fail behavior vs deferred posture. What's the actual setup — empty DSN, dummy DSN, or actual Sentry account?

**Q92. Is pg_cron enabled and scheduling jobs?**
`OWNER_TODO_2026-04-24.md` lists "pg_cron" as an owner-action item. AuditV2 Q16: didn't check `cron.job` table for any reference to `cleanup_rate_limit_events`. If no scheduler runs the function, the C1 P0 bug is dormant — severity changes.

### Supabase / DB-state assumptions

**Q93. Does `verity_score_events` table actually exist post 109/111 rollback?**
AuditV2 GAPS M27: recent `list_tables` did NOT show it (suggesting rolled back correctly), but never explicitly confirmed via `SELECT to_regclass('public.verity_score_events')`.

**Q94. What's the storage bucket state for avatar/banner uploads?**
AuditV2 GAPS M26: storage buckets not in default `list_tables`; never queried `storage.buckets`. MASTER_TRIAGE #19 references avatar bucket. Does the bucket exist? RLS configured?

**Q95. Which is canonical — `audit_log` (6,456 rows) or `admin_audit_log` (90 rows)?**
Two audit log tables exist; canonical use of each not determined.
- (V2 GAPS M25)

**Q96. Does `/api/events/batch` actually use service role?**
AuditV2 marked `events` parent table no-RLS-policies as refuted (intentional: writes via service role from `/api/events/batch`). AuditV2 Q13 admits: didn't confirm by reading the batch route.

**Q97. Is `cleanup_rate_limit_events` actually being called right now?**
Function would throw `column "occurred_at" does not exist`. If pg_cron schedules it (Q92), broken on every invocation. If not, dormant. Severity hinges on this.

**Q98. Are `permissions.xlsx` and DB believed to be in sync right now?**
998 DB perm rows + 3,090 set_perms never row-by-row diffed against xlsx. Should a drift sweep run before any new perm work, or trust they're aligned?

**Q99. What's the live `perms_global_version` value?**
`Reference/FEATURE_LEDGER.md` says `4409`; possibly outdated. Need `SELECT value FROM settings WHERE key = 'perms_global_version'`.

**Q100. `ai_models` table has 4 active rows including both Anthropic + OpenAI — is dual-provider intentional, or one defunct?**
- (V2 U18)

### Owner workflow / ex-people

**Q101. Has the ex-dev's access been revoked across all shared services?**
`OWNER_TODO_2026-04-24.md` lists "ex-dev removal" as an owner-action item. GitHub, Vercel team membership, Supabase access, any other shared services — all revoked?

**Q102. Was the migration-state SQL paste completed, and where does the result live?**
`OWNER_TODO_2026-04-24.md` lists this as an owner-action item.

**Q103. Are AdSense + Apple review the only external launch blockers?**
Memory says these are the only two launch gates. Any other external blockers we should track (DUNS, COPPA-attorney sign-off, Stripe activation, etc.)?

### Doc claims that need owner truth

**Q104. CLAUDE.md says "3800-line settings page"; actual file is 5247 lines — update annotation, remove it, or split the file?**
- (V1 A-1)

**Q105. CLAUDE.md says "23 rules-of-hooks disables"; actual count is 25 in `app/{recap,welcome,u}/...` — acceptable, or sweep to remove?**
- (V1 A-1 / V2 §2.A row 3)

**Q106. `Reference/README.md` says "kids iOS doesn't exist yet" — false (`VerityPostKids/` shipped 2026-04-19). Rewrite or retire `Reference/README.md`?**
- (V1 A-2 / V2 §2.A row 5)

**Q107. `Reference/parity/*.md` says localhost:3333; actual is localhost:3000 (per `web/package.json` default). What's the canonical dev port?**
- (V1 A-4 / V2 §2.A row 7)

**Q108. Have any of MASTER_TRIAGE items 1-9 shipped quietly without their SHIPPED block being added?**
AuditV2 Q3 / GAPS M3: didn't independently verify each is still in code at cited line ranges.

**Q109. Sessions/04-21-2026/Session 2/`REVIEW_UNRESOLVED_2026-04-21.md` M46 — is it resolved?**
Doc says "Owner adjudicates"; memory says "resolved as keep-and-refresh." If resolved, append RESOLVED entry to the doc.
- (V1 A-30)

---

## Summary

- **A. Architecture/product fate:** Q1-Q10 (10)
- **B. Code/DB scope:** Q11-Q18 (8)
- **C. Doc/convention:** Q19-Q27 (9)
- **D. Cross-zone hooks:** Q28-Q32 (5)
- **E. Audit-process gap closures:** Q33-Q55 (23)
- **F. Spot-verification:** Q56-Q75 (20)
- **G. State discrepancies (Apple, Stripe, AdSense, Vercel, DB, owner-workflow, doc-vs-truth):** Q76-Q109 (34)

**Total: 109 owner-decision / verification / state-check items.**

Categories A-D (32 items) — real product/code decisions you need to make.
Category E (23 items) — "approve more audit work or not" — can be batched.
Category F (20 items) — 5-15 min spot-reads — can be cleared in one focused session.
Category G (34 items) — state discrepancies; mostly owner-side knowledge or external dashboard checks (Apple Connect, Stripe, AdSense, Vercel) plus a handful of DB queries.
