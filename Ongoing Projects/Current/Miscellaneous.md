# Miscellaneous

Items that are real and need tracking but are not discrete implementation tasks. See TASKS.md for actionable work items. See Pre-Launch Apple.md for anything gated on the Apple Console session.

Last verified: 2026-04-26

---

## Open Decisions

Owner calls that are still unresolved. Nothing in this section has a confirmed answer — every item here is waiting on owner input before related work can proceed.

**Profile navigation model (T-085 blocker).** Four options documented in PRELAUNCH_UI_CHANGE.md owner note 2: (a) one scroll with sticky section nav, (b) denser hub with secondary surfaces moved off profile, (c) tabs made visually obvious with collapsed sections, (d) something else. T-068 through T-072 cannot start until this is answered. No default — owner must pick one direction before those tasks are scheduled.

**Activity tab purpose (T-086 blocker).** Three options from PRELAUNCH_UI_CHANGE.md owner note 3: (a) repurpose as the user's public contribution surface (comments, quizzes passed, expert answers), (b) fold into streak grid plus milestones and remove as a tab, (c) cut entirely. Blocks profile redesign. Reading timeline as currently conceived is passive filler — the tab needs a new identity or elimination.

**F2 reading receipt fate.** F-spec F2 documents a monospaced read-receipt stub at the end of each article. PRELAUNCH_UI_CHANGE.md has no mention of it. F2 is not marked retired or superseded. Owner should either: retire F2 explicitly in Future Projects/ or surface the feature in a PRELAUNCH section. Currently in ambiguous limbo. Source: QUESTIONS_AND_CONTRADICTIONS Q52.

**F5 ads gameplan eight unanswered decisions.** F5 was partially superseded by F6 but neither doc is marked retired. F5 §1 D1-D8 remain blank: AdSense pub ID, ad networks, CMP choice, launch countries, paid-tier ad exclusion, reduced-tier ads, kids-no-ads confirmation, iOS-ads-default. Owner should either lock or retire F5 as superseded by F6. Source: QUESTIONS_AND_CONTRADICTIONS Q54.

**F7-DECISIONS-LOCKED Decision 8 vs §5 quiz-verification behavior.** Decision 8 says the quiz-verification step "patches wrong correct_index values." Section 5 line 348 says the spec was reconciled to match the implementation which chose throw-and-regenerate for safety. Both claims live in the same canonical F7 doc with no reconciliation. OwnerQuestions Q5 resolved this as a doc-only ambiguity describing two separate code paths, but the doc itself has not been corrected. The doc needs a one-line clarification added. Source: QUESTIONS_AND_CONTRADICTIONS Q47, OwnerQuestions Q5.

**PM_ROLE.md vs CLAUDE.md mode.** PM_ROLE.md line 43-86 says "You do not touch code" and claims PM_ROLE wins when the two docs conflict. CLAUDE.md says "operate as a master of this stack." Both are active docs. Owner should retire one or explicitly scope PM_ROLE.md as a historical artifact. Source: QUESTIONS_AND_CONTRADICTIONS Q43, O1.

**CHANGELOG.md — maintain or retire.** CHANGELOG.md has a single entry dated 2026-04-20. Sessions 04-21 through 04-25 (20+ commits, F7 phases 1-4, full audit pass, bug hunt) are not reflected. MASTER_TRIAGE SHIPPED blocks and session logs cover the same ground. Owner decides: backfill or retire the file. Source: QUESTIONS_AND_CONTRADICTIONS Q44, O11.

**F1 vs PRELAUNCH source attribution design.** F-spec F1 places a small-caps source line above the headline. PRELAUNCH_UI_CHANGE §3.2 moves sources inline as superscript citations with tap-to-reveal citation cards. These are directly opposite designs. One must be picked before the story reader rebuild (T-061 through T-062). Source: QUESTIONS_AND_CONTRADICTIONS Q50, O5.

**F4 quiet-home-feed vs PRELAUNCH full-bleed hero design.** F-spec F4 proposes a stripped home with no images, just headlines and a meta line. PRELAUNCH_UI_CHANGE §3.1 specifies a full-bleed image-led hero. Directly opposite designs. T-059 follows PRELAUNCH. If F4 is still alive, this needs resolution. Source: QUESTIONS_AND_CONTRADICTIONS Q51, O6.

**Task 2 newsroom cluster UI open layout questions.** OwnerQuestions.md Task 2 spec is ready to execute but three decisions are listed as open: (1) should kids/adult cards be horizontal side-by-side or stacked within the cluster row, (2) should a "Both" generate button exist or per-card only, (3) should cluster-level controls (Move / Merge / Split / Dismiss) be shared or duplicated per card. Owner said "horizontal cards" but side-by-side vs stacked needs confirmation. No code until these are answered.

**Task 3 per-article AI actions — action set not enumerated.** OwnerQuestions.md Task 3 is blocked on owner defining the full action set: what actions (Rewrite / Enrich / Add Historical Context / others), which fields each action mutates, per-action model and cost cap, and whether actions run on in-memory draft state or only on saved DB rows. No execution possible without this spec.

**Vercel auto-deploy state.** CUTOVER.md says Ignored Build Step is ON (manual deploy only). STATUS.md says deploys-on-push verified 2026-04-21. Directly contradictory. T-143 tracks this. Only the owner can confirm current Vercel dashboard state. Source: QUESTIONS_AND_CONTRADICTIONS Q9, O3.

**Apple Developer account paid-tier enrollment.** Team ID FQCAS829U7 is confirmed active (per memory 2026-04-25). Unresolved: is this a paid Developer Program account enabling App Store Connect publishing, or an account with credentials present but without the paid-tier enrollment that allows submissions? The distinction gates whether App Store Connect actions (TestFlight, IAP registration, app submission) are executable right now. Owner to confirm. Source: QUESTIONS_AND_CONTRADICTIONS Q7, O2.

---

## Known Risks

Things being watched but not acted on — not bugs with assigned tasks, but real risks the current codebase carries. Most require either a trigger event or a deferred fix session before action.

**iOS App Store receipt hijack — `userId` from bearer token never cross-checked against JWS `appAccountToken`.** MASTER_TRIAGE item B3. SHIPPED 2026-04-26. `web/src/app/api/ios/subscriptions/sync/route.js` lines 113–139 now reject any request where `payload.appAccountToken` is present and does not match the authenticated `userId` (403). Receipts without `appAccountToken` (pre-field purchases) pass through to the defense-layer-2 `subscriptions.user_id` check at lines 219–227. Commit: `security(ios-sync): reject receipt if appAccountToken does not match authenticated userId`.

**`import-permissions.js` non-functional `--apply`.** `scripts/import-permissions.js` calls `bump_global_perms_version` RPC, which does not exist in pg_proc. Any `--apply` run since the RPC was removed silently failed to bump the perms version. The xlsx and live DB may have diverged without anyone knowing. Risk: the next `--apply` run after the script is fixed may overwrite manual DB edits made in the interim. Source: QUESTIONS_AND_CONTRADICTIONS Q17.

**Stripe webhook `billing_change_plan` / `billing_freeze_profile` do not call `bump_user_perms_version`.** MASTER_TRIAGE item B1. Every Stripe plan-change and freeze event leaves the user's permission cache stale until natural TTL expiry. The admin-manual-sync path does bump — the webhook path was forgotten. Users who get plan-changed or frozen via Stripe events retain their prior permissions until the cache expires. This is the current live production behavior.

SHIPPED 2026-04-26. Full audit of all webhook billing paths confirmed: `billing_change_plan`, `billing_resubscribe`, `billing_cancel_subscription`, `billing_freeze_profile`, and `billing_unfreeze` all bump internally (migrations 148/158) — no gap on those paths. Two gaps found and fixed: (1) `billing_uncancel_subscription` (schema/059, pre-148) was missing the bump — fixed in `schema/189_billing_uncancel_bump_perms_version.sql`, ready to apply at next writable DB session; (2) direct-write fallback in `handleSubscriptionUpdated` that fires when the RPC is absent also missed the bump — fixed with an explicit `bump_user_perms_version` call in `web/src/app/api/stripe/webhook/route.js`. `tsc --noEmit` clean (no new errors).

**Apple JWS header timestamp not validated — past-dated receipt replay.** MASTER_TRIAGE item B14. A receipt with a past-dated header can be replayed without the server rejecting it. Flagged as deferred in the 2026-04-24 session because testing requires a real Apple JWS. Risk is real; fix requires a test harness that does not exist yet. Source: MASTER_TRIAGE B14.

**`billing_cancel_subscription` RPC skips cancellation for frozen users — no recovery path.** MASTER_TRIAGE item B17. Migration 157 changed the behavior from throwing to returning a no-op `skipped=true` response for frozen users, but still never performs the actual cancellation. A frozen user's subscription remains active with no exit path. Fix written: `schema/188_fix_billing_cancel_frozen_user.sql` removes the frozen-user short-circuit entirely, allowing cancellation to proceed regardless of freeze state. Owner must apply `schema/188_fix_billing_cancel_frozen_user.sql` via the Supabase dashboard. Source: MASTER_TRIAGE B17.

**Family plan seat counting and decrement not implemented.** MASTER_TRIAGE 3-C deferred items include family plan seat counting and decrement. The `verity_family` and `verity_family_xl` plans have no seat-enforcement logic in any route or RPC. When family plans go live, seat limits will not be enforced unless this is built first.

**Cron `send-push` has no concurrency lock.** MASTER_TRIAGE item L19. Overlapping cron invocations can fight the notification queue. If a push cron run takes longer than its schedule interval, two runs will process the same queue concurrently. Needs a claim column or advisory-lock RPC. Source: MASTER_TRIAGE L19.

**`ai_models` pricing hardcoded at seed — drift risk.** F7-DECISIONS-LOCKED §3.2 explicitly documents: "Price drift is a known liability. If Anthropic or OpenAI raises prices and this table is not updated, the $10/day cap silently allows overspend." No automation updates these prices. Named accepted risk, not an oversight.

**Cost cap cache TTL too long (60s).** Multiple audit sources (Round 1 H17, R-8-AGR-02, L10 L2-L10-05) flag the pipeline cost-cap settings cache TTL as too long. If an admin lowers the daily cap during an active generation run, the old cap stays in effect for up to 60 more seconds. Not verified at code level. Source: QUESTIONS_AND_CONTRADICTIONS N11.

**`events` partitioned table has RLS enabled with no policies.** `events` parent table has RLS on with zero policies; partition children inherit at the parent level (correct PostgreSQL pattern). Effect: writes via service role only; user-context queries fail closed. This is intentional but `/api/events/batch` route's client type has not been independently verified at code level. Source: QUESTIONS_AND_CONTRADICTIONS Q36, N33.

**iOS perms not refreshed on app foreground.** Multiple audit sources (R-10-AGR-04, external J.4, EXT_AUDIT_FINAL_PLAN D1) flag that iOS does not refresh permissions when the app comes back to the foreground after backgrounding. A user could have their role revoked while the app is backgrounded and return to full permissions until the next cold launch. Not verified in iOS code. Source: QUESTIONS_AND_CONTRADICTIONS N10.

**`cleanup_rate_limit_events` RPC is broken — 8,562 rows uncleared.** T-002 tracks the fix. The column mismatch (`occurred_at` vs `created_at`) means the cleanup RPC has never successfully deleted a row. The `rate_limit_events` table has 8,562 rows of accumulated data. This is a known ongoing accumulation until T-002 ships.

**`lib/plans.js` hardcoded TIERS / PRICING / TIER_ORDER.** The `plans` table has `display_name`, `price_cents`, and `sort_order` columns with all the same data. Any admin change to plan pricing in the DB requires a redeploy to take effect. DB-default-rule violation. Source: MASTER_TRIAGE L12, QUESTIONS_AND_CONTRADICTIONS Q38.

**`CommentRow.tsx` hardcoded `COMMENT_MAX_DEPTH = 2`.** The `settings` table has `comment_max_depth = 2` (values coincidentally match today), but the `post_comment` RPC uses the settings lookup while the UI reads a hardcoded constant. If an admin changes the setting in DB, the UI will still render depth-2 threading. Source: QUESTIONS_AND_CONTRADICTIONS Q39.

**`tsc --noEmit` and `xcodebuild` not confirmed green.** OwnerQuestions Q38 deferred green-build confirmation to the end-of-sprint pass. Current build state is unverified. Source: QUESTIONS_AND_CONTRADICTIONS N24.

**xlsx ↔ DB permissions row-by-row diff not run.** OwnerQuestions Q37 deferred this. 998 permissions and 3,090 permission_set_perms rows have not been compared against the xlsx. The `--apply` tool is also broken (see above), so the sync state is doubly uncertain. Source: QUESTIONS_AND_CONTRADICTIONS N23.

**~60 of 72 MASTER_TRIAGE SHIPPED blocks unverified.** The 2026-04-24 audit pass spot-checked roughly 12 SHIPPED claims. The remaining ~60 are trusted but not independently verified via `git show <SHA>`. Source: QUESTIONS_AND_CONTRADICTIONS N20.

**Discovery pipeline state race in finally-vs-cancel path.** Multiple audit sources (Round 1 H18, R-8-AGR-03, L10 L2-L10-01, external YY.A4) flag a state race in the pipeline between the finally block and the cancel path. Not verified at code level. Source: QUESTIONS_AND_CONTRADICTIONS N12.

**ExpertWatchlist concurrent-write clobber.** `profile/settings/page.tsx:2732` has a comment about concurrent A11yCard / ExpertWatchlistCard saves potentially clobbering each other. Not verified end-to-end whether the mitigation fully closes the race or only acknowledges it. Source: QUESTIONS_AND_CONTRADICTIONS N4.

**`comment_status` enum drift.** Six-of-six Wave A audit agents flagged that live code uses `'visible'/'hidden'` but something about a `'published'` status may be inconsistent across paths. V2 verified no `'published'` writes, but 6/6 consensus is unusually strong — a deep grep across schema/, admin/moderation, and all comment-touching code has not been run to close this out. Source: QUESTIONS_AND_CONTRADICTIONS N6.

**`JsonLd.tsx` references `/icon.svg` — file not confirmed present.** `web/src/components/JsonLd.tsx` references `/icon.svg`. `web/public/` has been verified to contain only `ads.txt`. If no route handler serves `/icon.svg`, every page's structured data has a broken icon reference. Verification needed: `find web/src/app -path '*icon.svg*'` and `ls web/public/icon.svg`. Source: QUESTIONS_AND_CONTRADICTIONS N16.

**iOS `HomeFeedSlots.swift` and `Keychain.swift` may be orphan files.** Z17 inventory flagged these two files as potentially unused in the adult app, but a comprehensive grep across the iOS target was not run. If orphaned, they ship unnecessarily in the app bundle. Verification needed: `grep -rn "HomeFeedSlots\|Keychain" VerityPost/`. Source: QUESTIONS_AND_CONTRADICTIONS N17.

**Admin settings page numeric field blur-only persistence — unverified bug.** Two independent audit waves (V1 C7 and V2 L05 L13-002) flagged that numeric input fields in `/admin/settings/page.tsx` only persist their value on `onBlur`, not on the Save button click. A user could change a numeric value, never tab out, and click Save — the value reverts. Not code-verified. Verification needed: read `/admin/settings/page.tsx` onChange vs onBlur vs save handlers for numeric fields. Source: QUESTIONS_AND_CONTRADICTIONS N14.

**`import-permissions.js` hardcodes role→set and plan→set mappings — third source of truth.** `scripts/import-permissions.js` lines 156-184 (per Z19) hard-code the mapping from roles to permission sets and from plans to permission sets. The live DB already has `role_permission_sets` (45 rows) and `plan_permission_sets` (21 rows). The script creates a third source of truth alongside xlsx and DB. Any drift in the hardcoded mappings goes undetected. Fix: script should read `role_permission_sets` and `plan_permission_sets` from DB rather than hardcoding. Note: the script's `--apply` is already broken (non-existent `bump_global_perms_version` RPC, tracked as Current Tasks item 18) — fix that first before addressing this. Source: QUESTIONS_AND_CONTRADICTIONS Q40.

**Wave 4 / end-of-sprint pass items — deferred en bloc from OwnerQuestions.** OwnerQuestions.md Q33, Q34, Q35, Q36, Q37, Q38, Q39, Q40, Q41, Q42, Q43, Q44, Q45, Q46, Q47, Q48, Q49, Q51, Q52, Q53, Q54, Q55, Q56, Q57, Q58, Q59, Q60, Q62, Q63, Q64, Q65, Q66, Q67, Q68, Q69, Q70, Q71, Q72, Q73, Q74, Q75, Q101 were all deferred to an "end-of-sprint pass." That pass has not been run. These represent a body of unresolved verification work across perms sync, schema state, SHIPPED-block accuracy, iOS orphan checks, pipeline table grants, and audit divergences. They are not open bugs — they are unverified claims that may or may not surface real work.

---

## Do Not Touch

Compatibility shims, architectural constraints, and things to preserve. These must survive cleanup sweeps, refactors, and migrations.

**`window.location.href` on three post-OAuth navigation legs.** `web/src/app/login/page.tsx:242`, `web/src/app/signup/page.tsx:120`, `web/src/app/signup/page.tsx:228`. Hard navigation is required so Supabase Set-Cookie attaches on the next request. Converting these to `router.push` will silently break auth on those legs. The strings at `login/page.tsx:97` and `signup/page.tsx:254` are SDK `redirectTo` option values, not navigations — also do not migrate. Source: PRELAUNCH_UI_CHANGE Part 11 shim 2, §9.2.

**`ParentalGateModal.swift` math challenge + "Not now" as the only dismiss path.** `VerityPostKids/VerityPostKids/ParentalGateModal.swift`. The COPPA constraint requires a math challenge before any external link, payment, or mailto. "Not now" is the only sanctioned cancel. Do not add a close button, swipe-dismiss that bypasses the math, or escape-key shortcut. The "add explicit close button to all sheets" sweep (T-051) explicitly exempts this file. Source: PRELAUNCH_UI_CHANGE Part 11 shim 3, §9.2.

**Bulk-submit quiz API contract.** `web/src/app/api/quiz/submit/route.js` expects all answers in one POST, validates `answers.length === quizCount`, and rate-limits at 30/min. Do not migrate to per-question submission without simultaneously updating the rate-limit parameters. Source: PRELAUNCH_UI_CHANGE Part 11 shim 4.

**`gateType` prop in `LockedFeatureCTA`.** After T-044 ships the component, the `gateType` prop discipline is the safety mechanism that keeps plan-gated surfaces (safe to upsell) from being miscategorized as role-gated or verification-gated. Do not drop the prop "for simplicity." Do not silently default it to `"plan"`. Source: PRELAUNCH_UI_CHANGE Part 11 shim 5, §9.3.

**`/profile/settings` unified page must survive as a fallback after Phase 3 settings split.** When the 11 sub-route shims flip direction (T-073), `/profile/settings` must not 404. It must either become a sidebar/landing or redirect out. Old bookmarks, email links, and external references all point to the unified URL. Stripe checkout/portal success URLs point to `/profile/settings/billing` specifically — that sub-route must exist as a real destination. Source: PRELAUNCH_UI_CHANGE Part 11 shim 1, §9.2.

**`web/public/ads.txt`.** AdSense reads `ads.txt` at the apex domain. The AASA rollout (T-047) adds files to `web/public/.well-known/`. The two operations must not disturb each other. `ads.txt` sits at `web/public/ads.txt` — a different path. But anyone touching `web/public/` for AASA should confirm `ads.txt` is unaffected before pushing. Source: PRELAUNCH_UI_CHANGE §9.2.

**`/profile/settings/{section}` redirect shims — do not delete before T-073 ships.** `web/src/app/profile/settings/{alerts,billing,blocked,data,emails,expert,feed,login-activity,password,profile,supervisor}/page.tsx` are currently redirect shims. Until T-073 flips them into real destinations, they are load-bearing: they catch direct navigation and deep-links to these URLs. Deleting them before the real pages exist would 404 all settings sub-route traffic.

**Kids iOS app emoji and animation scenes.** `GreetingScene.swift`, `StreakScene.swift`, `QuizPassScene.swift`, `BadgeUnlockScene.swift` are explicitly on-brand for the kids surface. They are not subject to the "no celebratory motion for trivial actions" adult rule. The no-emoji rule applies to adult surfaces only. Do not strip kid scenes or emoji from kids app surfaces during any adult-surface cleanup pass. Source: PRELAUNCH_UI_CHANGE Part 5, §2.5.

**`schema/127` rollback must never be run.** The rollback in schema/127 uses the wrong permission key naming convention (`pipeline.manage_clusters` instead of `admin.pipeline.clusters.manage`). Running it would silently not match any live rows. T-167 tracks creating a corrective migration. The rollback path itself is a footgun — do not run it. Source: QUESTIONS_AND_CONTRADICTIONS Q15, R3.

**SIWA placement in all auth surfaces.** Sign In with Apple must remain at first position or equal visual weight to other auth options. App Store Review rejects SIWA buried below Google/email (Apple G4.8 risk). Any Phase 2 auth polish that rearranges `LoginView`, `SignupView`, or web login/signup layout must preserve SIWA prominence. T-058 is the verification task. Source: PRELAUNCH_UI_CHANGE §9.4.

**Do not reintroduce `@admin-verified` markers.** The `@admin-verified` file-marker system was retired 2026-04-23. Seventy-seven markers were removed; the lock-rule in CLAUDE.md was deleted; admin code is now governed by the 6-agent ship pattern alone. Runtime RBAC is unchanged. Do not add this marker to any file. If a stale reference appears in a doc, delete it rather than treating it as active. Source: memory `feedback_admin_marker_dropped.md`.

**F7 cross-decision invariants — all four phases.** F7-DECISIONS-LOCKED §"Cross-decision invariants" lists 10 must-hold constraints across all pipeline phases. The three most fragile for cleanup sweeps: (1) nothing auto-publishes — every article lands in `draft` state, admin explicitly publishes; (2) kid and adult pools never cross — no shared table, no shared query, RLS enforces both directions; (3) all guardrail values (cost caps, lock durations, retry counts, retention windows, thresholds) live in the `settings` table — zero hardcoded in `web/src/lib/pipeline/`. Do not hardcode any pipeline config value. Source: F7-DECISIONS-LOCKED §"Cross-decision invariants".

---

## Deferred

Items with no current action, parked until a specific trigger (post-launch, a particular session, or an owner signal).

**Google Play IAP.** Confirmed out of scope per MASTER_TRIAGE 3-C deferred items. No Android app; no action needed.

**Win-back and churn cron.** MASTER_TRIAGE 3-C deferred. No implementation scheduled. Deferred post-launch.

**`invoices` table population.** MASTER_TRIAGE 3-C deferred: whether anything populates the `invoices` table has not been investigated. Deferred until billing monitoring becomes a priority post-launch.

**Subscription pause/resume handlers.** `pause_start` and `pause_end` columns exist on `subscriptions` but no Stripe or Apple event handlers for them exist. MASTER_TRIAGE 3-C deferred. No user-facing UI exists for pause either. Deferred post-launch.

**`pipeline/call-model.ts` retry and backoff tail.** MASTER_TRIAGE 3-D deferred. The retry logic tail of `call-model.ts` was not audited. Deferred to a pipeline-focused session.

**`pipeline/prompt-overrides.ts` injection logic.** MASTER_TRIAGE 3-D deferred. The prompt override injection has not been fully audited for correctness. Deferred.

**`pipeline/scrape-article.ts` SSRF allowlist.** MASTER_TRIAGE 3-D deferred with "likely real concern" annotation. The scraper may not enforce a source URL allowlist. Deferred to a security-focused pipeline session.

**Sentry coverage.** Deferred until monetization and traffic justify the cost per memory `feedback_sentry_deferred.md`. `SENTRY_DSN` stays unset in Vercel. Build passes without it. Do not reopen this until owner signals revenue or paging pain.

**Pricing reset — update plans table, Stripe, and App Store Connect.** T-144. Deferred post-launch. Requires creating new Stripe price objects and new Apple product IDs with `_v2` suffix, and needs the Apple Dev Console session. Not a pre-launch blocker.

**Trial strategy — `trial_days` configuration and reminder emails.** T-145, T-146. Deferred post-launch. Set `trial_days` on paid plan tiers, pass `subscription_data.trial_period_days` in Stripe checkout, add re-trial prevention, build `trial_reminder_monthly` and `trial_reminder_annual` email templates.

**Ad-free reconciliation — entry tier `plan_features`.** T-147. Deferred post-launch. `ad_free=true` / `reduced_ads=false` on Verity entry tier needs a DB update and perms version bump.

**Editor system — editorial schema, admin routes, public masthead.** T-148, T-149, T-150. Deferred post-launch. New `editorial_charter`, `editor_shifts`, and `front_page_state` tables, the `/admin/editorial/` route group, and `/masthead` public page.

**Defection links — per-article peer-outlet links.** T-151. Deferred post-launch. New `defection_links` table, story-manager UI fields, and "See also" render in the story body.

**Home feed rebuild to `front_page_state`.** T-152. Deferred post-launch. Migrating from algorithmic feed to 8-slot `front_page_state` table with masthead component, hero, supporting slots, breaking strip, and archive route.

**Summary format schema changes.** T-153. Deferred post-launch. `article_type` column, `kicker_next_event_date`, `quiz_questions.type`, drop `reading_time_minutes`.

**Paywall module system with invitation-voice copy.** T-154. Deferred post-launch.

**Quiz gate brand — make quiz always visible, add passed mark.** T-155. Deferred post-launch. Remove `{false && ...}` wrappers, add comprehension thread header, inline passed mark per commenter.

**Quiz unlock moment — result card, scroll animation, composer focus.** T-156. Deferred post-launch.

**Kids choreography polish — all seven animation surfaces.** T-157. Deferred post-launch.

**iOS `SubscriptionView` infinite loading state.** T-158. Deferred post-launch. Replace the "Loading..." failure path with an explicit retry/contact-support state.

**Performance budget — RSC, caching, image optimization.** T-159. Deferred post-launch. FCP <600ms 4G on home, LCP <1000ms on story, Lighthouse CI regression guard.

**Accessibility — WCAG AA color contrast, Dynamic Type, VoiceOver, reduce-motion, keyboard nav.** T-160. Deferred post-launch.

**Feature flag seeding — 14 production flags.** T-161. Deferred post-launch. Seed `quiz_gate_visible`, `comments_enabled`, `dms_enabled`, and the remaining 11 flags in the `feature_flags` table.

**Measurement dashboards.** T-162. Deferred post-launch. Four dashboards: weekly editorial, weekly subscription, weekly reader, monthly financial.

**AI pipeline V4 prompt updates.** T-163. Deferred post-launch. Updates to `editorial-guide.ts` for research, article body, headline, summary, timeline, quiz, quiz verification, and editorial review prompts to match V4 spec.

**Wire `check-admin-routes.js` into CI.** OwnerQuestions Task 18. Deferred to Future Projects. Research Salesforce-style API compliance enforcement before execution.

**`VerityPost/VerityPost/possibleChanges/` move out of app bundle.** OwnerQuestions Task 12. Deferred to Future Projects. Currently ships as Resources in the `.app`.

**`verity_family_annual` and both `verity_family_xl` plans `is_active=false`.** Only `verity_family_monthly` is the active family plan. Owner decision per OwnerQuestions Q11: show Family and Family XL as "Coming soon" on billing UI. T-084 tracks the UI change. The plan rows themselves staying `is_active=false` is intentional pre-launch posture.

**F7 tables SELECT-grant audit.** OwnerQuestions Q43 deferred. `177_grant_ai_models_select.sql` only granted on 4 of approximately 10 F7 tables. Full per-table enumeration not done. Deferred to end-of-sprint pass.

**AuditV1 and AuditV2 archival decision.** OwnerQuestions Q27. Owner may delete individually later. No action scheduled.

**`Unconfirmed Projects/product-roadmap.md` retirement.** 1,443 lines from 2026-04-19, wholly superseded by Future Projects/. References retired paths. Source: QUESTIONS_AND_CONTRADICTIONS Q70.

**`Unconfirmed Projects/UI_IMPROVEMENTS.md` partial retirement.** 613 lines, partially superseded. Some unique items on `ProfileSubViews.swift` and `SettingsView.swift` not covered in Future Projects; some shipped but doc not updated. Source: QUESTIONS_AND_CONTRADICTIONS Q71.

**`Reference/CHANGELOG.md` backfill or retirement.** Pending owner decision (see Open Decisions section above).

**`Reference/PM_ROLE.md` retirement or scoping.** Pending owner decision on which mode is canonical (see Open Decisions above).

**`Reference/README.md` retirement.** OwnerQuestions Task 24 is spec-ready: delete `Reference/README.md` — it falsely claims kids iOS does not exist (incorrect since 2026-04-19) and that VerityPost/ is "currently unified: adult + kid mode" (kid mode removed 2026-04-19). CLAUDE.md is the canonical entry point.

**Task 4 — delete F7 `/admin/articles/[id]/{review,edit}` pages.** OwnerQuestions Task 4. Blocked on Task 2 (newsroom cluster UI rebuild) shipping. Do not delete these pages before the replacement flow from Task 2 is live.

**`@admin-verified` marker residuals in active docs.** The marker was retired 2026-04-23 but 9 active-doc residuals exist: `Current Projects/F7-DECISIONS-LOCKED.md:18`, `F7-PM-LAUNCH-PROMPT.md:61,203`, `Future Projects/views/00_INDEX.md:51`, `Future Projects/db/00_INDEX.md:41`, `Future Projects/08_DESIGN_TOKENS.md:19`, `web/src/app/admin/pipeline/runs/page.tsx` (Z14), `Reference/FEATURE_LEDGER.md` (lines 471-489), `Reference/README.md:36`. Delete each reference encountered. Do not treat them as active markers. Source: QUESTIONS_AND_CONTRADICTIONS Q11.

**`Reference/FEATURE_LEDGER.md` and sibling docs with `site/` path references.** `FEATURE_LEDGER.md`, `Reference/README.md`, `Current Projects/APP_STORE_METADATA.md`, and `Reference/runbooks/ROTATE_SECRETS.md:94` all contain `site/src/app/...` path references. `site/` was renamed to `web/` on 2026-04-20. These are stale but low-priority doc cleanup. Source: QUESTIONS_AND_CONTRADICTIONS Q12.

**`ai_models` dual-provider intent — confirmed, recorded here for continuity.** Both Anthropic and OpenAI models are `is_active=true` in the `ai_models` table. OwnerQuestions Q12 and Q102 both confirm this is intentional — both providers are available in the per-run picker by design. Future agents should not flag this as an oversight or propose deactivating one. Source: OwnerQuestions Q12, Q102.

**12 deferred admin pages from MASTER_TRIAGE 3-B audit — no follow-up agent run yet.** The 3-B (Admin UI) round-3 agent deferred: `/admin/recap`, `/admin/breaking`, `/admin/subscriptions`, `/admin/expert-sessions`, `/admin/data-requests`, `/admin/webhooks`, `/admin/streaks`, `/admin/analytics`, `/admin/sponsors`, `/admin/promo`, `/admin/cohorts`, `/admin/reader`. Note: `/admin/articles/[id]/{edit,review}` is tracked separately as Task 4. The 12 above need a focused audit pass (DA-119 error leaks, role-gate pattern, raw error exposure) before launch. Flagged "Follow-up agent needed" in MASTER_TRIAGE §"Pages 3-B deferred."

**`app/layout.js` GA4/AdSense CSP/privacy audit.** MASTER_TRIAGE 3-D deferred. The GA4 and AdSense script tags in `app/layout.js` have not been audited for CSP header compatibility or privacy implications (cookie consent, GDPR). Deferred to a security-focused session.

**`apns.js` lifecycle tail audit.** MASTER_TRIAGE 3-D deferred. The tail of `web/src/lib/apns.js` past the JWT cache check was not fully audited for correctness in long-running cron scenarios. Deferred to a pipeline-focused session.

**`appleReceipt.js` `resolvePlanByAppleProductId` RLS safety.** MASTER_TRIAGE 3-D deferred. The `resolvePlanByAppleProductId` function in `web/src/lib/appleReceipt.js` was not verified for correct client type (service vs user) in the RLS context it runs in. Deferred.

**`cron/pipeline-cleanup` sweeps 3 and 4 not audited.** MASTER_TRIAGE 3-D deferred. The pipeline cleanup cron's sweeps 3 and 4 were not read during the audit pass. Deferred to a pipeline-focused session.
