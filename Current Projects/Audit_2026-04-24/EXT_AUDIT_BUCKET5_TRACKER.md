# External Audit — Bucket 5 Tracker

Working through Bucket 5 of `EXT_AUDIT_TRIAGE_2026-04-24.md` autonomously. Owner-decision items (Bucket 2), Apple-block items (Bucket 3), and posture-deferred items (Bucket 4) stay untouched.

Each item: status (open / shipped) + commit SHA when shipped.

## Batch 28 — shipped (commit pending push)

| ID | Title | Status |
|---|---|---|
| E.4 | Comment depth client uses literal `< 2`; server reads DB | shipped — hoisted to `COMMENT_MAX_DEPTH` constant + comment linking schema/033 |
| K.3 | `breaking/page.tsx:50` hardcodes `'owner' \|\| 'admin'` | shipped — uses `ADMIN_ROLES.has(r)` |
| L.1 | data-export route missing `require_outranks` | shipped — `requireAdminOutranks` guard added |
| B.3 | NavWrapper substring tier matching | shipped — joined `plans!fk_users_plan_id(tier)`, deriveTier reads canonical tier string |
| W.5 | iOS pair-code length 8 vs server 6-16 | **deferred — needs UX call** (8-slot grid vs flexible input) |
| W.8 | Streak milestone missing day-3 | shipped — case 3 added with copy |
| K.5 | `pipeline/costs/page.tsx:164` `.range(0, 9999)` | shipped — capped to `.limit(1000)` |

## Batch 29 — shipped

| ID | Title | Status |
|---|---|---|
| CC.1 | `toggle_follow` ignores blocked_users | shipped — schema/167 adds bidirectional block-relationship check |
| CC.7 | `approve_expert_answer` doesn't notify asker | shipped — schema/167 adds `create_notification` for the asker |
| E.2 | Kids PIN MAX_ATTEMPTS hardcoded | shipped — DB settings rows + cached helper read; constants are fallbacks |

## Batch 30 — A11y cluster (shipped)

| ID | Title | Status |
|---|---|---|
| NN.1 | Pages missing `<main>` | shipped — wrapped browse, leaderboard, bookmarks, notifications, messages |
| NN.3 | Browse category cards mouse-only | shipped — added `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space), `aria-expanded`. Kept `<div>` because card content includes `<a>` which can't nest inside `<button>`. |
| JJ.2 | PermissionGate keyboard inaccessible | shipped — `onKeyDown` for Enter/Space + `aria-label` |
| JJ.1 | User ConfirmDialog no focus trap | shipped — focus capture/restore + Tab cycle + initial focus on Cancel |

## Batch 31 — Security/policy cluster (shipped)

| ID | Title | Status |
|---|---|---|
| Y.1 | events/batch missing rate limit | shipped — 60 batches/min/IP |
| WW.1 | iOS webhooks no payload size cap | shipped — 256 KiB cap on appstore/notifications + subscriptions/sync (Stripe parity at 1 MiB) |
| AAA.6 | award_points cap-counting race | shipped — schema/168 adds `pg_advisory_xact_lock` keyed on (subject, action) |
| KK.1 | feeds POST accepts any URL | shipped — URL parse + http(s)-only + private/loopback host reject |

## Batch 32 — Email + push + scoring cluster (shipped)

| ID | Title | Status |
|---|---|---|
| LL.2 | No `List-Unsubscribe` header | shipped — RFC 8058 one-click headers via `sendEmail`; per-recipient URL or fallback to settings#emails |
| LL.3 | send-emails cron ignores quiet hours | shipped — quiet_hours_start/end loaded with prefs; deferred (not skipped) when current time falls inside |
| X.5 | Logout doesn't invalidate push tokens | shipped — POST /api/auth/logout marks user_push_tokens.invalidated_at = now() before signOut |
| AAA.4 | Recap pass not awarded points | shipped — schema/169 seeds `recap_pass` rule (6 pts) + rewires `submit_recap_attempt` to PERFORM `award_points` on >=60% pass |

## Batch 33 — Mega-batch: swallowed audits + billing audit + RLS + cleanup crons + misc (shipped)

| ID | Title | Status |
|---|---|---|
| D.1 | Stripe webhook swallows create_notification | shipped — 6 sites: silent catch → tagged console.error |
| D.2 | auth routes swallow audit_log | shipped — callback/login/signup audit_log inserts wrapped in try/catch + logged |
| D.3 | B18 webhook_handler_failed audit | already correct (logs on failure) |
| Q.2 | billing routes missing audit_log | shipped — cancel/change-plan/resubscribe each insert into audit_log post-RPC |
| O.7 | TTS button under 44pt touch target | shipped — padding 12x14 + minHeight 44 on `btn` and `btnGhost` styles |
| JJ.7 | Ad URL DB-level validation | shipped — POST /api/admin/ad-units validates http(s) on creative_url + click_url |
| CC.2 | claim_queue_item no TTL | shipped — schema/170 adds `release_stale_expert_claims(hours)` for cron use |
| CCC.2 | user_roles no UNIQUE(user_id, role_id) | shipped — schema/170 dedups + adds constraint |
| CCC.5 | rate_limit_events unbounded | shipped — schema/170 `cleanup_rate_limit_events(days)` + new cron route /api/cron/rate-limit-cleanup |
| GG.2 | quiz_attempts SELECT no kid-JWT branch | shipped — schema/171 adds `quiz_attempts_select_kid_jwt` policy |
| F.2 | Mentions soft-warn doesn't block submit | **intentional per in-code comment — closed without code change** |
| F.3 | v2_live banner | **deferred — UI design pass** |
| K.1 | Admin gate idiom harmonize | **deferred — 30+ file sweep** |
| L.3 | Permission-key drift naming sweep | **deferred — needs cross-cutting rename plan** |
| M.3 reset-revoke server-side | client-side already handles via `signOut({ scope: 'others' })` post-update — closed |
| KK.4 | Ingest ignores feeds.audience | **owner-decision** (unified-pool was deliberate) |
| AA.3 | Server-side age verification | **owner-decision** (requires DOB collection UX) |

## Batch 34 — Kids iOS polish (shipped)

| ID | Title | Status |
|---|---|---|
| W.9 | Math challenge kid-solvable (4..15 + 4..15) | shipped — bumped to 12..49 × 2..9 (multiplication) |
| W.16 | Family leaderboard returns single row under kid JWT | shipped — schema/172 adds `kid_family_leaderboard(kid_id)` SECDEF RPC; LeaderboardView swapped from PostgREST fallback to RPC call |
| EE.9 | Splash duration not coupled to session-restore | **already correct** — splash gated on `auth.isLoading`, no fixed timer in current code |

## Batch 35 — 8 owner-locked decisions + Apple BBB.* unblock (shipped)

| ID | Title | Status |
|---|---|---|
| GG.1 | follows_select OR true | shipped — schema/173 drops `OR true`, leaves follower/followee/admin |
| T.3 | persist_generated_article exists in prod | already verified by owner SQL (1 row); closed |
| AA.1 | Strip invite gate | shipped — /api/access-request returns 410; admin/access tab restricted to `codes` only; access_codes management retained for promo use |
| KK.4 | Unified ingest pool | closed — owner deliberate, in-code comment retained |
| C.26 | 14-table RLS classification | **draft** at `Audit_2026-04-24/C26_RLS_CLASSIFICATION_DRAFT.md` — owner pastes SQL result + greenlights; migration 174 ships next |
| W.5 | 8-slot pair-code coupling guard | shipped — `SERVER_PAIR_CODE_LENGTH` constant + `assertServerCodeLengthMatches()` in `PairCodeView.onAppear` |
| M.8 | Password rules to DB | shipped — schema/173 seeds 4 settings rows + new `validatePasswordServerWithSettings(pw, supabase)` helper + new `/api/settings/password-policy` GET endpoint |
| AA.3 | Combined 13+ / Terms checkbox | already shipped — single `agreed` checkbox at signup line 668 with "13 or older + Terms + Privacy" copy |
| BBB.2 | VerityPostKids.entitlements | shipped — file created with aps-environment + associated-domains. **Owner: link this file in Xcode project Build Settings → Code Signing Entitlements during the console walkthrough.** |
| BBB.3 | onOpenURL handler in VerityPostKidsApp | shipped — stub handler logs in DEBUG, ignores production payloads (kid surface accepts no real deep-links by design) |
| BBB.4 | Adult entitlements aps-environment + associated-domains | shipped — added to VerityPost.entitlements |
| BBB.5 | Adult Info.plist LSApplicationCategoryType | shipped — `public.app-category.news` |
| BBB.6 | PrivacyInfo.xcprivacy declares Analytics with no SDK | shipped — adult plist purpose narrowed to AppFunctionality only (no third-party analytics SDK in build); kids plist already correct |
| BBB.8 | AppIcon sized variants | **owner action — Xcode work**: open AppIcon.appiconset, drag in iPhone Notification 20pt 2x/3x, Settings 29pt 2x/3x, Spotlight 40pt 2x/3x, App Icon 60pt 2x/3x. The 1024x1024 marketing icon stays. Asset catalog edits don't round-trip through git well; doing this in Xcode preserves the JSON. |

## Owner-decision sub-bucket (added during Bucket 5 work)

| ID | Title | Question |
|---|---|---|
| W.5 | iOS pair-code length | 8-slot fixed grid (current) vs flexible 6-16 input field. Server today produces 8-char codes; aligning to server range needs UI redesign. |
| M.8 | Password rules to DB | Multi-file SSR/API delivery for client-side rules; needs design pass before extracting (signup form, settings, reset-password all read these). |

## Future batches (queued)

- E.1, E.2, E.3 — config-to-DB extraction (PIN attempts, anti-replay windows, batch sizes)
- A.1 — `v2LiveGuard` coverage sweep
- B.1 / B.2 — audit table + tier list consolidation
- C.3 — `refreshIfStale` zero-init edge case
- D.1, D.2, D.3 — swallowed audit failures
- F.2, F.3 — mentions block + v2_live banner
- K.1 — admin gate idiom harmonization
- L.3 — permission-key drift naming sweep
- M.3 reset-revoke server-side
- M.8 — password rules to DB
- O.* — reader/story posture (revalidation, LAUNCH_HIDE)
- Q.2 — billing audit_log writes
- S.1, S.2 — send-emails atomic claim, cron resilience
- T.1, T.2 — reset_and_rebuild_v2 + migration gaps
- U.4, U.6 — pipeline policy decisions
- W.* — Kids app polish (keychain, foreground refresh, math challenge, family leaderboard)
- X.* — data lifecycle (export retention, push-token cleanup, delete re-confirm)
- Y.1, Y.2, Y.4 — events/analytics
- AA.3 — server-side age verification
- BB.1, BB.3 — ad system hardening
- CC.1, CC.2, CC.7 — social-graph RPC fixes
- EE.1, EE.9 — adult iOS bootstrap
- FF.* — moderation hardening
- GG.2, GG.3 — RLS migrations
- JJ.* — components a11y + URL validation
- KK.1, KK.4 — feed POST + audience
- LL.* — email infra
- NN.1, NN.3 — `<main>` + keyboard cards
- OO.1, OO.2 — CSP enforce + style-src
- WW.1 — iOS webhook payload cap
- YY.* — newsroom realtime + support reply audit
- AAA.* — settings/scoring debt
- CCC.* — triggers/roles/rate_limits
