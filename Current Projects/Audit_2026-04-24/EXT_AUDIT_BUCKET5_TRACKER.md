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
