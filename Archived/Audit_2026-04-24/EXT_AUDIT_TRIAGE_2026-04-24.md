# External Audit Triage — 2026-04-24

Source documents:
- `Current Projects/Audit_2026-04-24/review external audit` (owner-dropped, 19 sections, ~120 claims)
- `Current Projects/Audit_2026-04-24/review external audit-review` (prior verification pass, REAL/BS/STALE/PARTIAL ledger)

Of ~120 claims, the prior verification gave ~85% REAL, ~5% BS, ~10% PARTIAL/STALE.

This triage routes each REAL/PARTIAL finding to one of four buckets. Items the prior review classified as BS or STALE are skipped (K.2, AAA.9, BB.2, Y.11, BBB.1).

---

## Bucket 1 — Shipped this session (commit `e8898a8`)

| ID | Title | Note |
|---|---|---|
| C2 | settings cancel path missing perms refresh | `await refreshAllPermissions()` after billing cancel |
| Q.1 | billing routes missing rate limits | 5/min on cancel/change-plan/resubscribe; 10/min on promo redeem |
| M.2 | email-change has no audit | best-effort `audit_log` insert with hashed email tags |
| K.6 | breaking page leaks Postgres error.message | generic UI copy + raw cause to server log |
| L.4 | achievements echoes user input in error | generic 'Unknown achievement' |
| F.1 | comments generic error → actionable copy | quiz-gate / duplicate / missing-parent branches |

## Bucket 2 — Owner decision required (cannot ship autonomously)

| ID | Title | What I need |
|---|---|---|
| **GG.1** | `follows_select` RLS ends `OR true` — entire follow graph readable by anon | Intent confirmation. If accidental, drop the `OR true` and tighten. If "social transparency by design," document the choice and remove the unreachable per-user clauses. |
| **AA.1 + YY.C1** | Invite-gate (`access_codes`) is unenforced; admin UI has no approve/reject buttons | Decide: (a) wire the workflow end-to-end and gate signup, or (b) strip the half-built UI and document open signup as the launch posture. |
| **T.3** | `persist_generated_article` RPC: schema/118 creates, schema/119 drops, code at `persist-article.ts:139` still calls it | MCP-verify prod state of this function. If 119 was applied, the pipeline is broken right now. |
| **TODO-6 + TODO-7** | already documented in `OWNER_TODO_2026-04-24.md` | migration-state SQL paste + `import-permissions.js --dry-run` paste |

## Bucket 3 — Apple-block items (gated by TODO-4 dev account enrollment)

| ID | Title |
|---|---|
| BBB.2 | No `VerityPostKids.entitlements` file; no entitlements in project.yml |
| BBB.3 | `VerityPostKidsApp.swift` 10-line shell, no `onOpenURL` handler |
| BBB.4 | Adult entitlements declare only `applesignin` — missing aps-environment + associated-domains |
| BBB.5 | Adult Info.plist has no `LSApplicationCategoryType` |
| BBB.6 | `PrivacyInfo.xcprivacy` declares Analytics with no SDK |
| BBB.8 | AppIcon.appiconset only has 1024×1024 universal (App Store requires sized variants) |

These are ready-when-the-account-is-ready work; specs documented, no autonomous action until enrollment lands.

## Bucket 4 — Deferred per project posture (no action)

| ID | Title | Posture |
|---|---|---|
| PP.1–PP.7 | Performance debt (LOC, virtualization, lazy loading, next/image, select(*)) | Pre-launch posture, not blocker |
| RR.1–RR.3 | Sentry coverage / iOS crash reporter | Per memory: deferred until monetization |
| RR.10 | Zero test files | Project stance: tests later |
| SS.1 | No i18n | Product stance: English-only |
| UU.1 | tsconfig strict | Already shipped (Batch 20) |
| UU.2 | No CI workflows | Owner-side infra decision |
| UU.3 | No eslint-plugin-jsx-a11y | Could ship; low signal |
| AAA.9 | settings PATCH no rate limit | STALE — already wired |

## Bucket 5 — Real but not in this batch (medium-effort follow-ups)

These are real findings that need more than a one-line fix, and didn't fit the surgical pass. Future batches:

| ID | Title | Estimate |
|---|---|---|
| A.1 | `v2LiveGuard` covers 12 of 173 mutating routes | Architectural — sweep needed |
| A.2 | Client/server gate drift on comments | Touches CommentComposer + perm seed |
| A.3 | Feature-flag cache per-process 10s TTL | Pub/sub design |
| B.1 | Two audit tables (`audit_log` + `admin_audit_log`) | Consolidation effort |
| B.2 | Tier list hardcoded in 5+ places | DB-table extract |
| B.3 | NavWrapper substring tier matching | One-file fix |
| C.3 | `refreshIfStale` zeroed-init edge case | Lib edit + test |
| D.1 | Stripe webhook swallows `create_notification` failures (intentional but fragile) | Add structured retry/log surface |
| D.2 | auth routes swallow audit_log failures | Surface failure paths |
| D.3 | B18 audit insert swallowed | Same |
| E.1 | Batch/page sizes scattered | DB-config extract |
| E.2 | Kids PIN MAX_ATTEMPTS=3 hardcoded | Move to settings |
| E.3 | Apple JWS anti-replay windows hardcoded | Move to settings |
| E.4 | Comment depth: server reads DB, client uses literal `< 2` | One-file fix |
| F.2 | Mentions soft-warn doesn't block submit | CommentComposer rewire |
| F.3 | `v2_live=false` has no visible banner | Banner component |
| K.1 | 4 different admin gate idioms | Harmonize |
| K.3 | breaking/page hardcodes `'owner' \|\| 'admin'` | Switch to ADMIN_ROLES |
| K.5 | pipeline/costs `.range(0, 9999)` | Pagination |
| L.1 | data-export route missing `require_outranks` | Easy follow-up |
| L.3 | Permission-key drift (`articles.edit.any` vs `articles.patch`) | Naming sweep |
| M.3 reset revoke | reset-password no post-reset signOut on server | Server-side complement to client signOut |
| M.8 | `lib/password.js` hardcodes 8/upper/digit | Move to settings |
| O.* | Reader/story posture (TTS/quiz revalidation, quiz state local-only, LAUNCH_HIDE flags) | Reader-redesign track |
| Q.2 | billing routes missing audit_log | Server-side audit pattern |
| S.1 | send-emails has no atomic claim batch | Cron-pattern parity with send-push |
| S.2 | Skip-branch row update swallows error | Cron resilience |
| T.1 | reset_and_rebuild_v2 missing events + ai_prompt_presets | DR rebuild track |
| T.2 | Migration number gaps (007/008/052/092/093/100) | Document or backfill |
| U.4 | scrape-article no robots.txt check | Pipeline policy decision |
| U.6 | pipeline-cleanup doesn't DELETE orphan discovery_items | Cron policy decision |
| W.1 | Kids keychain persists across uninstall | COPPA edge — install-scoped UUID |
| W.2 | Kids pair-code 7-day TTL — too long? | Owner decision on TTL |
| W.5 | iOS pair-code length fixed at 8, server accepts 6-16 | Align iOS to server range |
| W.6 | Kid foreground refresh — partial | scenePhase rewire |
| W.7 | ParentalGateModal has zero callers | Already partially fixed (C16); audit broader callers |
| W.8 | Streak milestone missing day-3 | Switch case add |
| W.9 | Math challenge kid-solvable | Difficulty bump |
| W.12 | 0.6 hardcoded in KidQuizEngineView | Already DB-driven via schema/162; remove iOS fallback |
| W.16 | Family leaderboard fallback row | Query fix |
| X.* | Data lifecycle (export retention, push-token cleanup, delete re-confirm) | Privacy hardening track |
| Y.1, Y.2, Y.4 | Events/analytics (rate limit, payload constraint, iOS emission) | Telemetry track |
| AA.3 | Age gate is client checkbox | COPPA hardening |
| BB.1, BB.3 | Ad serving gates + creative URL allowlist | Ads-system track |
| CC.1 | `toggle_follow` ignores blocked_users | RPC fix |
| CC.2 | `claim_queue_item` no TTL/cron | Queue lifecycle |
| CC.7 | `approve_expert_answer` doesn't notify | RPC fix |
| EE.1, EE.9 | Adult iOS singleton race + splash duration | iOS bootstrap track |
| FF.* | Moderation flow hardening | Mod track |
| GG.2 | quiz_attempts SELECT missing kid-JWT branch | RLS migration |
| GG.3 | Permission-set tables `USING (true)` | RLS migration |
| JJ.1, JJ.2, JJ.7 | Component a11y + DB-validated URLs | Components track |
| KK.1, KK.4 | Feeds POST accepts any URL; ingest ignores audience | Pipeline policy |
| LL.1, LL.2, LL.3 | Email infra (suppression, List-Unsubscribe, quiet hours) | Email track |
| NN.1, NN.3 | Accessibility (`<main>`, keyboard cards) | A11y track |
| OO.1, OO.2 | CSP enforce + style-src `unsafe-inline` | CSP-tightening track |
| WW.1 | iOS webhooks payload size cap | Webhook hardening |
| YY.A1, YY.B1 | Newsroom realtime + support reply audit | Admin track |
| AAA.1–AAA.8 | Settings/scoring debt (hardcoded fallbacks, recap→award_points wiring, FOR UPDATE) | Settings/scoring track |
| CCC.* | Triggers/roles/rate_limits (UNIQUE constraints, seeded policy rows, cleanup cron) | Schema/infra track |

---

## Where this leaves the audit

- Critical surgical fixes shipped (`e8898a8`).
- Owner-blocked items routed (Bucket 2 + 3).
- Posture-only items deferred per project stance (Bucket 4).
- Real medium-effort findings catalogued (Bucket 5) — these become the next sprint's queue once owner clears Bucket 2.

The external audit was high-signal and the work it surfaced beyond what the internal audit caught is genuinely useful. Treating Bucket 5 as a follow-up backlog rather than a single batch — they touch enough surfaces that they'd benefit from being interleaved with feature work, not crammed into one ship.
