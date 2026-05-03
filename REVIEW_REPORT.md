# Verity Post — Code Review Report

Architect-led review. Each PM appends findings under their own `## PM-N — <name>` section.

## Finding format (every entry uses this)

```
### [P0|P1|P2|P3] <one-line title>
- File: <path>:<line>
- Issue: <what is wrong>
- Evidence: <short quote or symbol from current file>
- Impact: <user/system consequence>
- Suggested fix: <concrete change>
- Verified by: <subagent or check that confirmed it on disk>
```

## Severity
- **P0** — crash, data loss, auth bypass, payment bug, RLS hole, COPPA violation
- **P1** — broken user flow, dead-end UX, wrong data shown, race condition with user-visible effect
- **P2** — polish, copy, a11y, dark-mode, minor inconsistency
- **P3** — nice-to-have

## Rules every PM follows
1. Verify against the actual file on disk before logging a finding. Quote the line.
2. Ignore old md notes at repo root (`BUG_HUNT*.md`, `Owner_Audit_Finds.md`, `UI_UX_REVIEW/`). Source of truth is the code.
3. Kill-switched surfaces (see `CLAUDE.md` Kill-Switch Inventory): do NOT flag missing functionality. DO flag broken chrome on the disabled surface itself, prefixed `[KILL-SWITCHED]`.
4. Don't recommend deletes/renames without grepping for callers.
5. If a finding can't be verified, drop it — no speculation.

---

# Architect synthesis

**Cleanup plan:** 6 sequential sessions in `/Users/veritypost/Desktop/verity-post/REVIEW_SESSIONS/`. To start a session, open a fresh Claude conversation and type `start session N` (1-6). Each session doc is self-contained.

**Review pass:** 11 PMs (9 Tier-A in parallel + 2 Tier-B sequential), each with their own subagent team. Every finding was verified on disk by the owning PM and quoted from current code or live `pg_catalog`.

**Aggregate counts (deduped, treating PM-10 confirmations and PM-11 extensions correctly):**

| Severity | Count | Notes |
|---|---|---|
| P0 | **17** | 14 from Tier A + 3 new from PM-11 (PM-10's P0 is the same finding as PM-5's, scoped wider) |
| P1 | ~50 | Plus 8 P1s newly surfaced in Tier B |
| P2 | ~70 | Mostly hardening + parity polish |
| P3 | ~17 | |
| Doc-drift | 4 | CLAUDE.md kill-switch rows #1, #3, #4, #5 are stale |

**Surfaces ranked by P0 density (worst first):**
1. **DB / RLS** (PM-8 + PM-11) — 10 P0s. Mass-impersonation surface, GUC bypass, articles draft leak, events partition RLS gap, kids waitlist anon-write, `users_protect_columns` allowlist gap, `kid_profiles` has no protection trigger, `generate_kid_pair_code` uses non-CSPRNG `random()`.
2. **Auth (web)** (PM-1) — 2 P0s, both block real flows: email-change is broken for everyone; OTP typo silently lands user on home as anon.
3. **Admin (web)** (PM-3) — 2 P0s: `top_stories` RBAC bypass (any signed-in user can rewrite the front-page hero pin) and `/admin/webhooks` retry is non-functional.
4. **Billing + iOS bridge** (PM-5/PM-10) — 2 P0s: cross-platform double-billing path; change-plan silently un-cancels.
5. **Pipeline + Cron** (PM-9) — 1 P0 spanning 5 routes: LLM calls bypass `lib/pipeline/call-model.ts` and skip every cost-cap, retry, ledger, and redaction enforcement.

**Surfaces in unusually good shape (notable):**
- **Web public-API toolkit** (PM-4, 0 P0). `requirePermission` / `requireAuth` / `checkRateLimit` / `safeErrorResponse` / UUID shape checks are wired through 95 routes consistently.
- **iOS adult app** (PM-6, 0 P0). Only 2 force-unwraps in 47 files (both guarded), zero force-casts, zero `try!`, `Log.d` is `#if DEBUG`-gated, realtime-channel teardown is structurally correct.
- **iOS kids app** (PM-7, 0 P0). Parental-gate coverage is complete: every external-action / sensitive-action surface gates through `ParentalGateModal` with `interactiveDismissDisabled` set. No StoreKit, no SFSafariViewController, no push, no PII in logs.

## Top-priority P0 list (recommended fix order)

Ordered by blast radius × ease of fix.

### Tier 1 — fix before anything else (DB/RLS hardening)
These are exploitable now via direct PostgREST without any web/iOS code involvement. Fix at the database layer; web/iOS get the protection automatically.

1. **Mass-impersonation surface** (PM-8). REVOKE EXECUTE FROM PUBLIC on every `p_user_id`-style RPC, OR add `IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE 42501` guards. ~30 RPCs. Affects `post_comment`, `post_message`, `award_points`, `submit_appeal`, `convert_kid_trial`, all `billing_*` RPCs.
2. **`users_protect_columns` allowlist is incomplete** (PM-11). Authenticated user can `UPDATE public.users SET trial_extension_until='2099-12-31' WHERE id = auth.uid()` and bypass the T304 paywall. Also exposes `failed_login_count`, `pin_*`, `streak_*`. Add the missing columns to the trigger's protected list.
3. **`kid_profiles` has no column-protection trigger** (PM-11). Parent can rewrite `coppa_consent_given`, `coppa_consent_at`, `verity_score`, `pin_hash`, opt the kid into global leaderboard. **COPPA-touching, Apple Kids Severity 1.** Add an analogous trigger.
4. **`generate_kid_pair_code` uses `random()`** (PM-11). Replace with `gen_random_bytes()` (pgcrypto installed). One-line fix.
5. **`app.auth_sync` GUC bypass** in `users_protect_columns` (PM-8). Replace GUC check with `current_user = 'postgres'`. Same pattern for `app.dob_admin_override` in `enforce_kid_dob_immutable` and `enforce_band_ratchet` (DOB rewrite path).
6. **Articles draft leak via OR'd RLS policies** (PM-8). Drop `articles_public_read_excludes_soft_deleted` PERMISSIVE policy; it OR-combines with `public_can_read_published` to expose every non-soft-deleted draft to anon.
7. **`events_*` partitions have no RLS** (PM-8). Patch `create_events_partition_for(date)` to ENABLE RLS + add `block_kid_jwt` policy after each creation. Backfill the 5 leaky partitions (1,037 rows).
8. **`kids_waitlist_insert_anon`** has `WITH CHECK (true)` (PM-8). Replace with service-role-only.

### Tier 2 — broken user flows (user-visible right now)
9. **Email-change endpoint reads non-existent column** (PM-1). `web/src/app/api/auth/email-change/route.js:60` reads `last_sign_in_at` off `public.users`, which only has `last_login_at`. Every legitimate caller gets 401. Email change is currently unusable for everyone.
10. **OTP typo lands user on home as anon** (PM-1). `web/src/app/login/_SingleDoorForm.tsx:106` treats privacy-posture `200 { ok: true }` as success. Most common auth failure mode is dead-end UX.
11. **`top_stories` RBAC bypass** (PM-3). RLS is `auth.role() = 'authenticated'` for all writes, page does client-only gating. Any signed-in user can curl-delete or rewrite the front-page hero pin.

### Tier 3 — financial / cost (real money)
12. **Cross-platform double-billing path** (PM-5, confirmed wider by PM-10). 4 web routes (`stripe/checkout`, `billing/change-plan`, `billing/resubscribe`, `billing/cancel`) lack Apple-sub precheck; iOS `subscriptions/sync` lacks Stripe-sub precheck. Single shared helper closes all 5 sites.
13. **`change-plan` silently un-cancels** (PM-5). `web/src/lib/stripe.js:150` hardcodes `cancel_at_period_end: 'false'`. User who cancels then changes plan has their cancel revoked; UI also stops showing it.
14. **5 LLM-calling routes bypass `lib/pipeline/call-model.ts`** (PM-9). `quiz-regenerate`, `sources-regenerate`, `timeline-regenerate`, `score-comments` cron (every 15 min), legacy `ai/generate`. No cost cap, retry limit, ledger write, or prompt redaction. A wedged tick spends without ceiling.

### Tier 4 — admin chrome
15. **`/admin/webhooks` retry button is non-functional** (PM-3). `webhook_log` has no UPDATE policy at all.
16. **`ticket_messages.is_staff` is client-trusted** (PM-3). Any user can post a staff-flagged reply on their own ticket and impersonate support.

### Tier 5 — auth resend across user base
17. **`auth.resend({ type: 'signup' })` for magic-link OTP users** (PM-1). Magic-link signups never had a pending signup confirmation. Resend always 400s. Leaderboard "resend verification" is non-functional for the entire user base.

## Cross-platform bundles (ship as one PR, not three)

Per owner memory `feedback_cross_platform_consistency.md`, every change should cover web + iOS-adult + iOS-kids. PM-10 enumerated 12 bundles; the highest-ROI ones:

1. **Apple/Stripe cross-platform precheck** (Tier 3 #12) — 4 web + 1 iOS file, single shared helper.
2. **Pricing source-of-truth** — DB `plans.price_cents` is authoritative; the web pricing page hardcodes prices and `/messages` paywall hardcodes a *different* price (`$3.99/mo` vs page's `$7.99/mo`); iOS keeps a Swift fallback.
3. **iOS account-state banner port** — web has 15 banner states, iOS adult has only `frozenAccountBanner`. Users in `muted` / `plan_grace` / `deletion_scheduled` / `verify_locked` / `comped` / `trial-ending-*` get unexplained denials on iOS.
4. **Push parity** — iOS adult has full APNs pipeline; web has zero push code. Either ship Web Push or document explicitly. iOS-kids has APNs entitlement with no registration code (drift vs iOS-adult).
5. **`verityposts://` URL scheme registration** (PM-6 / PM-10) — push deep-links silently fail because Info.plist registers `verity` (singular), parser checks `verityposts` (plural).

## CLAUDE.md kill-switch inventory updates

PM-10 audited every row. Stale rows requiring edits to `/Users/veritypost/Desktop/verity-post/CLAUDE.md`:

| Row | Status | Fix |
|---|---|---|
| #1 — `PUBLIC_PROFILE_ENABLED` | flag is already `true`; "flip to true to re-enable" is wrong | Remove from inventory or mark as "re-enabled, leave row for documentation" |
| #2 — `/profile/[id]/page.tsx` | doesn't reference the flag | Tighten the cite |
| #3 — `PublicProfileSection.tsx:192` share-link block | flag #1 was flipped but the share-link block was never re-enabled — **active bug** | Re-enable the block (PM-2 also flagged) |
| #4 — `OAUTH_ENABLED` | iOS counterpart `VPOAuthEnabled` at `AuthViewModel.swift:48` not mentioned | Add iOS row; flip both together when re-enabling |
| #5 — `manageSubscriptionsEnabled` | line number is 340 not 305; flag is `true` not `false`; UI is enabled but Add handlers no-op (Apple Review risk) | Either set the flag to `false` until Add handlers work, or implement the handlers |

## What this review did not cover

- Performance / load testing
- Visual / design polish (out of scope by your instruction)
- Old md notes at repo root (intentionally excluded)
- iOS UI tests / Playwright tests (only product code reviewed)
- Vercel / Apple Developer / AdSense dashboard state (not code-visible)

## Recommended next step

Open a fix-implementation session with the same orchestration pattern but focused on Tier 1 (DB hardening) first, since it's the broadest blast radius and most surgical to apply. Each Tier 1 item is a single migration. After Tier 1 lands and is verified via Supabase MCP, move to Tier 2 (user-visible broken flows), then Tier 3 (money), then Tier 4/5.

---

## PM-4 — Web-API-Public

**Scope inventory:** 95 in-scope `route.js` / `route.ts` files under `web/src/app/api/` (excluding `admin/`, `auth/`, `csp-report/`, `health/`, `billing/`, `stripe/`, `ios/`, `cron/`, `newsroom/`).

**Headline:** This surface is in unusually good shape. The `requirePermission` / `requireAuth` / `checkRateLimit` / `safeErrorResponse` / `NO_STORE` / `getRateLimitPolicy` toolkit is wired through almost every route, with thoughtful inline comments explaining defense-in-depth choices (T170/T171/T173/F-070/F-077/F-139/H4/H7/Q3b, etc.). No P0 auth bypasses. No SQL-injection holes. No swallowed-error → 200 responses. No PII leaks. The findings below are all hardening gaps and minor consistency issues; nothing that should block ship.

**Total:** 1 P1, 12 P2, 2 P3.

### [P1] Self-mutation `analytics_events` insert can be flooded by anon callers despite rate limit
- File: `web/src/app/api/analytics/scroll/route.js:36-69`
- Issue: Per-IP cap is 300/min (the same policy `ads_impression` reuses); each accepted call writes a row to `analytics_events`. The article-published precheck is good, but a determined attacker rotating articles + IPs can drive sustained writes against `analytics_events` with very small effort.
- Evidence (line 39-42): `policyKey: 'ads_impression', // reuse the permissive 300/min policy / max: 300, windowSec: 60,`
- Impact: storage / write-amplification on `analytics_events` for an unauthenticated endpoint. Not catastrophic, but the comment explicitly acknowledges piggy-backing on a permissive policy.
- Suggested fix: Add a dedicated `analytics_scroll` policy at, e.g., 30/min/IP. Scroll-depth events realistically fire a few times per article read.
- Verified by: read of `analytics/scroll/route.js`; confirmed policy literal.

### [P2] No rate-limit on `/api/account/onboarding` POST
- File: `web/src/app/api/account/onboarding/route.js:55-87`
- Issue: Authenticated state-changing write (`update_own_profile` RPC sets `onboarding_completed_at`, fires analytics). No rate-limit gate, so an authenticated client (or compromised session) can spam telemetry + repeatedly hit the SECURITY DEFINER RPC.
- Evidence (line 63-65): `const authed = createClient(); const { error } = await authed.rpc('update_own_profile', { p_fields: { onboarding_completed_at: new Date().toISOString() } });` — no `checkRateLimit` anywhere in the file.
- Impact: low (idempotent, RLS-scoped), but inconsistent with the rest of the surface and floods the `trackServer('onboarding_complete', …)` analytics path.
- Suggested fix: Wrap in a 5/min `account_onboarding` checkRateLimit.
- Verified by: file read; `grep -L checkRateLimit` confirmed.

### [P2] No rate-limit on `/api/profile/trial-banner-dismiss`
- File: `web/src/app/api/profile/trial-banner-dismiss/route.ts:6-28`
- Issue: Authenticated write to `users.trial_extended_seen_at`. No rate-limit, no `requirePermission` (only `getUser()`).
- Evidence (line 8-12): `const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }` — no rate-limit follows.
- Impact: low (the `is(... null)` clause is idempotent), but a logged-in attacker can flood `users` updates.
- Suggested fix: 10/min checkRateLimit.
- Verified by: file read.

### [P2] No rate-limit on multiple expert-flow write endpoints
- Files:
  - `web/src/app/api/expert-sessions/route.js:46-85` (POST, admin-create)
  - `web/src/app/api/expert-sessions/[id]/questions/route.js:69-119` (POST, kid asks)
  - `web/src/app/api/expert-sessions/questions/[id]/answer/route.js:23-80` (POST, expert answers)
  - `web/src/app/api/expert/queue/[id]/answer/route.js:10-47` (POST, expert posts answer)
  - `web/src/app/api/expert/queue/[id]/decline/route.js:8-33` (POST)
  - `web/src/app/api/expert/answers/[id]/approve/route.js:10-35` (POST, admin approve)
- Issue: Authenticated writes that fire RPCs / table updates without per-user rate-limit. Permissions gate access, but a compromised/abusive expert account can spam answers and approvals.
- Evidence: none of the listed files contain `checkRateLimit`. Confirmed via `grep -L checkRateLimit` over each.
- Impact: P2 — the perm gate is the main control; rate-limit is defense-in-depth for compromised accounts and consistency with the rest of /api/expert/* (which DOES rate-limit ask/claim/back-channel/vacation/apply).
- Suggested fix: Add 30/min user-keyed limits matching the existing `expert-claim` style.
- Verified by: file read of each + grep.

### [P2] No input length cap on kid question_text + expert answer_text + session title/description
- Files:
  - `web/src/app/api/expert-sessions/[id]/questions/route.js:84-90` — `question_text` only `!question_text` check
  - `web/src/app/api/expert-sessions/questions/[id]/answer/route.js:38-39` — `answer_text` only `!answer_text` check
  - `web/src/app/api/expert-sessions/route.js:60-77` — `title`, `description` no length caps
- Evidence (`expert-sessions/[id]/questions/route.js:84-90`): `if (!kid_profile_id || !question_text) { return NextResponse.json({ error: 'kid_profile_id and question_text required' }, { status: 400 }); }` — no `body.length > N` guard.
- Impact: a verified parent or expert can post unbounded text. DB column likely caps but app-layer fast-fail is the standing pattern (T173 per other files).
- Suggested fix: Mirror `/api/expert/ask/route.js:58` (`if (body.length > 1000)`) — pick reasonable caps (e.g., 500 for kid questions, 5000 for answers, 200/2000 for title/description).
- Verified by: file reads; cross-reference to `expert/ask` length pattern.

### [P2] `/api/users/[id]/block` interpolates `params.id` into PostgREST `.or()` without UUID validation
- File: `web/src/app/api/users/[id]/block/route.js:73-95`
- Issue: After insert, the `follows` cleanup uses a string-built `.or()` with both `params.id` and `user.id` interpolated. There's no UUID-shape check on `params.id`. PostgREST will reject a malformed UUID, but a malformed value still passes through the FK insert above (which 23503's), and the comma/parenthesis interpolation pattern mirrors known PostgREST filter-injection footguns (similar to what `messages/search` and `expert/queue` defend against).
- Evidence (line 93): ``await service.from('follows').delete().or(`and(follower_id.eq.${user.id},following_id.eq.${params.id}),and(follower_id.eq.${params.id},following_id.eq.${user.id})`);``
- Impact: low at present — both inputs come from authenticated user.id (UUID by construction) and Next.js dynamic params (string-typed), and Postgres's `eq.<uuid>` parser will reject anything malformed. Still a hardening gap relative to the rest of the surface, which validates UUID shape on path params (e.g., `ads/click` uses `UUID_RX`).
- Suggested fix: Add `if (!UUID_RX.test(params.id)) return 400` at the top of POST + DELETE.
- Verified by: file read; cross-reference to `ads/click/route.js:19` UUID_RX pattern.

### [P2] `comments/[id]/agree` and `comments/[id]/vote` and `comments/[id]/context-tag` use weak / inconsistent `Cache-Control`
- Files:
  - `web/src/app/api/comments/[id]/agree/route.js:8` — `const NO_STORE = { 'Cache-Control': 'no-store' };` (only `no-store`, missing `private`/`max-age=0`)
  - `web/src/app/api/comments/[id]/vote/route.js` — no NO_STORE constant; success returns `NextResponse.json(data)` with no headers
  - `web/src/app/api/comments/[id]/context-tag/route.js` — same; no NO_STORE
- Issue: T170/T209 standard everywhere else is `private, no-store, max-age=0`. These three write-side endpoints diverge.
- Evidence: see line 8 of agree; confirmed no `Cache-Control` references in vote/context-tag.
- Impact: a misconfigured CDN could cache. Low risk because they're authed POSTs, but inconsistent with the rest of the surface.
- Suggested fix: Standardize on `'private, no-store, max-age=0'` and apply on every response branch (success + error + 401/403/429).
- Verified by: grep `NO_STORE\|no-store\|Cache-Control` against each.

### [P2] `comments/[id]/agree` POST does not gate non-clear reactions on quiz pass
- File: `web/src/app/api/comments/[id]/agree/route.js:14-101`
- Issue: `comments/[id]/vote/route.js:90-109` enforces a quiz-pass gate (H4) before letting upvote/downvote land. The `agree`/`disagree` reaction route shares the same input (one reaction per user per comment) but does NOT mirror the quiz gate.
- Evidence (vote, line 95): `if (!isOwnerMode && type !== 'clear' && commentArticleId) { const { data: passed } = await service.rpc('user_passed_article_quiz', …); … }`. Agree route runs none of this.
- Impact: depending on product spec, the moat that "you must pass the quiz to vote" is intentionally NOT applied to agree/disagree. If that's by design this is a P3; if it's an oversight from when agree was extracted, it's P2.
- Suggested fix: Confirm with PM whether agree/disagree is meant to bypass the quiz moat. If not, add the same `user_passed_article_quiz` precheck.
- Verified by: cross-file diff between `vote/route.js` and `agree/route.js`.

### [P2] `comments/route.js` POST executes 5 sequential `hasPermissionServer` RPC calls in the editor-preview branch
- File: `web/src/app/api/comments/route.js:142-150`
- Issue: When the article is non-published, the route calls `hasPermissionServer('articles.edit')` then `hasPermissionServer('admin.articles.edit.any')` sequentially. Plus the prior `hasPermissionServer('admin.owner_mode')` and `hasPermissionServer('comments.post')`. Each is a network round-trip in the cold case.
- Evidence (lines 144-146): `const isEditor = isOwnerMode || (await hasPermissionServer('articles.edit')) || (await hasPermissionServer('admin.articles.edit.any'));`
- Impact: latency-only; up to ~5 sequential perm RPCs on the comment-post path. Tail latency on cold cache.
- Suggested fix: `Promise.all([…])` the two non-cached `hasPermissionServer` calls in the preview branch.
- Verified by: file read.

### [P2] `/api/promo/redeem` `current_uses` rollback path uses non-atomic update without WHERE-on-old-value on plan-not-found branch
- File: `web/src/app/api/promo/redeem/route.js:127-150`
- Issue: After the optimistic-concurrency claim succeeds, if the target plan lookup fails, the code rolls back via `update({ current_uses: promo.current_uses }).eq('id', promo.id).eq('current_uses', promo.current_uses + 1)`. That's correctly fenced. BUT if the rollback UPDATE fails (race with another redeemer who also incremented to +2), the counter is now off-by-one and there's no audit row.
- Evidence (line 127-131 + 144-148): two near-identical rollback blocks.
- Impact: at-most one stuck use-slot per affected promo if a race + plan lookup-failure both happen; very low likelihood in practice.
- Suggested fix: Log when the rollback's UPDATE returns `affected_rows = 0` so an admin can reconcile, OR move the plan/applies_to_plans validation BEFORE the optimistic claim.
- Verified by: file read.

### [P2] `/api/comments/[id]` admin-edit path is not idempotent across status='deleted' rows
- File: `web/src/app/api/comments/[id]/route.js:158-178`
- Issue: The admin edit branch updates the row with `.neq('status', 'deleted')` — good. But the PATCH still returns `{ ok: true }` even when the update affected 0 rows (because the comment was already soft-deleted). The client thinks the edit succeeded.
- Evidence (line 171-178): `if (updateErr) return safeErrorResponse(...); return NextResponse.json({ ok: true });` — no check on affected rows.
- Impact: low; admin tool only. But silent no-op is a known pattern of bug.
- Suggested fix: Add `.select('id')` and check that a row was returned; 404 when soft-deleted.
- Verified by: file read.

### [P2] `/api/expert/apply` PATCH returns 500 on a non-existent application before checking emptiness
- File: `web/src/app/api/expert/apply/route.js:95-110`
- Issue: PATCH does `.update().eq('user_id', user.id).order(…).limit(1).select('id')`. If no matching row exists, Supabase returns `{ data: [], error: null }`. The handler correctly returns 404 — good. But if the user has zero applications, the underlying query is essentially a no-op that still hits the DB; not a security issue but inconsistent with the "verify-before-mutate" pattern used elsewhere (e.g., bookmarks/[id]/PATCH).
- Evidence (line 95-110): no pre-read of an existing application before the update.
- Impact: minor.
- Suggested fix: Pre-read application_id; 404 early.
- Verified by: file read.

### [P3] `/api/ai/generate` swallows OpenAI/upstream errors silently in `timeline` action
- File: `web/src/app/api/ai/generate/route.js:148-173`
- Issue: When `action === 'timeline'`, JSON parse failure inserts a literal `'AI Timeline'` row into `timelines` instead of erroring. The catch block masks the parse failure entirely.
- Evidence (line 164-172): `} catch { await supabase.from('timelines').insert({ article_id, event_date: 'Generated', event_label: 'AI Timeline', event_body: generated.slice(0, 500), …`
- Impact: an editor sees a "successful" timeline generation but gets junk content. Non-user-facing route (admin-only behind `admin.ai.generate`); tagged P3.
- Suggested fix: Surface the parse failure to the editor and skip the fallback insert.
- Verified by: file read.

### [P3] `/api/ai/generate` — no rate-limit despite calling OpenAI on each request
- File: `web/src/app/api/ai/generate/route.js:14-186`
- Issue: Admin-gated (`admin.ai.generate`), so abuse vector is small, but each call burns OpenAI tokens. No `checkRateLimit` anywhere.
- Evidence: `grep -c checkRateLimit` returns 0.
- Impact: cost-only; if an admin's session is stolen or a script bug fires repeatedly, OpenAI bill grows unbounded.
- Suggested fix: 10/min user-keyed `checkRateLimit`.
- Verified by: file read.

### Top 3 P0/P1 (highest-priority items for fix-pass)
1. **[P1] `analytics/scroll`** — write-amplification via permissive 300/min/IP shared policy. Recommend dedicated `analytics_scroll` policy at 30/min/IP.
2. **[P2] Expert-flow write endpoints missing rate-limit** — 6 routes (expert-sessions create, kid-question post, expert-answer, queue/answer, queue/decline, answers/approve). Compromised expert account can spam.
3. **[P2] Kid question_text + expert answer_text + session title/description not length-bounded at the API layer** — defense-in-depth gap relative to the T173 pattern used everywhere else.

### Routes lacking auth, rate-limit, or input validation (consolidated table)

| Route | File | Auth | Rate-limit | Input bounds |
|---|---|---|---|---|
| POST `/api/account/onboarding` | `account/onboarding/route.js` | Yes | **No** | n/a (RPC writes fixed shape) |
| POST `/api/profile/trial-banner-dismiss` | `profile/trial-banner-dismiss/route.ts` | Yes | **No** | n/a |
| POST `/api/expert-sessions` | `expert-sessions/route.js:46` | Yes | **No** | **No length cap on title/description** |
| POST `/api/expert-sessions/[id]/questions` | `expert-sessions/[id]/questions/route.js:69` | Yes | **No** | **No length cap on question_text** |
| POST `/api/expert-sessions/questions/[id]/answer` | `expert-sessions/questions/[id]/answer/route.js:23` | Yes | **No** | **No length cap on answer_text** |
| POST `/api/expert/queue/[id]/answer` | `expert/queue/[id]/answer/route.js:10` | Yes | **No** | length cap 10000 ✓ |
| POST `/api/expert/queue/[id]/decline` | `expert/queue/[id]/decline/route.js:8` | Yes | **No** | n/a |
| POST `/api/expert/answers/[id]/approve` | `expert/answers/[id]/approve/route.js:10` | Yes | **No** | n/a |
| POST `/api/recap/[id]/submit` | `recap/[id]/submit/route.js:11` | Yes | **No** | answers[] length not capped |
| POST `/api/supervisor/opt-in` | `supervisor/opt-in/route.js:8` | Yes | **No** | category_id only |
| POST `/api/supervisor/opt-out` | `supervisor/opt-out/route.js:8` | Yes | **No** | category_id only |
| POST `/api/support` | `support/route.js:17` | Yes | **No** | category/subject/description not capped |
| POST `/api/support/[id]/messages` | `support/[id]/messages/route.js:43` | Yes | **No** | body not capped |
| POST `/api/kids/[id]/streak-freeze` | `kids/[id]/streak-freeze/route.js:8` | Yes | **No** | n/a |
| PATCH/DELETE `/api/kids/[id]` | `kids/[id]/route.js:20,73` | Yes | **No** | n/a (RPC enforces) |
| POST `/api/kids/set-pin` | `kids/set-pin/route.js:10` | Yes | **No** | validatePin ✓ |
| GET/POST `/api/kids` | `kids/route.js:16,45` | Yes | **No** (POST has seat-cap, no rate-limit) | DOB checks ✓, no display_name length cap |
| POST `/api/kids/trial` | `kids/trial/route.js:39` | Yes | **No** | DOB checks ✓ |
| POST `/api/ai/generate` | `ai/generate/route.js:14` | Yes (admin) | **No** | inputs slice-capped ✓ |

**No routes lack auth where they should require it.** Public-by-design endpoints (`access-redeem`, `access-request`, `ads/click`, `ads/impression`, `ads/serve`, `analytics/scroll`, `errors`, `events/batch`, `kids/pair`, `kids/refresh`, `kids/quiz/[id]`, `kids-waitlist`, `settings/public`, `settings/password-policy`, `support/public`, `articles/by-slug`) all defend appropriately (UUID shape checks, per-IP rate limits, bot-UA filters, JWT signature verification on kid bearers).

### Cross-platform note (per `feedback_cross_platform_consistency.md`)
- Every flagged write endpoint is consumed by both web AND iOS clients (the iOS app talks to `/api/comments`, `/api/messages`, `/api/expert/*`, `/api/kids/*`, `/api/support`, etc. via bearer tokens). Adding rate-limits server-side affects both surfaces uniformly — no separate iOS work needed for these fixes. Length caps server-side similarly cover both. Kids iOS / kids web is iOS-only per `kids_scope.md`; kids endpoints already iOS-aware (bearer JWT in `kids/quiz`, `kids/refresh`).

### Notes on what's NOT a finding
- `requirePermission`/`requireAuth` is consistently called before any service-client write across the surface.
- `safeErrorResponse` correctly maps Postgres error codes (P0001 passthrough, 23505/23503/23514 mapped, 22P02 mapped) — no raw DB errors leak to clients.
- `truncateIpV4` consistently used for any persisted IP (audit_log, kids-waitlist, support/public).
- `NO_STORE = 'private, no-store, max-age=0'` standard applied to ~70% of authenticated routes; the gaps flagged above are the exceptions.
- Ownership checks (`bm.user_id !== user.id`, `kid.parent_user_id !== user.id`, `comment.user_id === user.id`) are applied consistently before mutation. The notable case is `comments/[id]` PATCH/DELETE which uses the `EDIT_WINDOW_MS = 10 * 60 * 1000` self-edit window (T280) — solid pattern.
- Webhook idempotency: in-scope routes don't host externally-driven webhooks (those are PM-5/PM-9 territory).
- Sentry coverage: not flagged per `feedback_sentry_deferred.md`.


## PM-3 — Web-Admin

Scope: `web/src/app/admin/**`, `web/src/app/api/admin/**`, `web/src/components/admin/**`, admin lib helpers (`adminMutation.ts`, `adminPalette.js`, `adminValidation.ts`, `adUrlValidation.js`, `permissions.js`, `permissionKeys.js`, `roles.js`, `rlsErrorHandler.js`).

Inventory verified: 102 admin API route files, 53 admin page files, 27 admin component files. 101/102 API routes call `requirePermission`; the only exception is `/api/admin/billing/audit` which uses `requireAuth + hasPermissionServer` over a write-perm allowlist (an idiomatic equivalent — verified safe).

Live RLS verified via Supabase MCP for `top_stories`, `access_codes`, `plan_features`, `campaigns`, `webhook_log`, `support_tickets`, `ticket_messages`, and the `hide_comment` SECDEF RPC body.

Severity tally: 2 P0, 6 P1, 4 P2, 0 P3.

RBAC findings (called out separately): F-1 (top_stories — RLS bypass on a public-facing surface), F-2 (admin/access — direct client mutation, RLS-gated but no rank guard, no rate limit, audit-before-mutate anti-pattern), F-7 (ticket_messages.is_staff is client-trusted), F-9 (hide_comment RPC has no rank guard), F-10 (admin pages mix MOD vs ADMIN gates). The other admin API surfaces are tightly gated through `requirePermission` + `requireAdminOutranks` + `recordAdminAction` and are clean.

Top 3 P0/P1: F-1 (top_stories RBAC bypass), F-7 (ticket_messages staff-impersonation), F-2 (admin/access client-side mutation surface).

---

### [P0] `top_stories` table is writable by ANY authenticated user (RLS bypass on front-page hero)
> CLOSED in Session 3 — migration `2026-05-03_session_3_top_stories_rbac` + new POST/DELETE routes + page rewrite. Old `top_stories_write_authenticated` policy dropped, `admin.top_stories.manage` perm minted.
- File: `supabase/migrations/2026-04-29_create_top_stories_table.sql:23-26`, exploited from `web/src/app/admin/top-stories/page.tsx:110-128`
- Issue: The `top_stories_write_authenticated` RLS policy is `USING (auth.role() = 'authenticated')` for ALL operations (insert/update/delete). The migration explicitly says "the admin UI will enforce role checks at the application layer" — but `/admin/top-stories/page.tsx` enforces only client-side via `ADMIN_ROLES.has(r)` (line 81), and the page issues `supabase.from('top_stories').upsert(...)` (line 112) and `.delete()` (line 128) directly through the cookie-scoped browser client. There is NO server-side API route for `top_stories` (`web/src/app/api/admin/top-stories` does not exist). Any logged-in non-admin can `curl -X DELETE` (or use the JS client) to clear or replace the front-page hero pin.
- Evidence: Live RLS via MCP returns `{polname: 'top_stories_write_authenticated', polcmd: '*', using_expr: "(auth.role() = 'authenticated'::text)"}`. Migration comment line 22: "For now, restrict to authenticated users; the admin UI (Wave 6a) will enforce role checks at the application layer via RBAC."
- Impact: Any logged-in user can pin or unpin articles on the home page. No audit row written. No rank guard. The article being pinned just needs to exist (FK to articles.id ON DELETE CASCADE).
- Suggested fix: Replace the policy with `is_admin_or_above()` (matches the `access_codes`/`plans`/`sponsors` pattern in the same DB), and route the page's mutations through a new `/api/admin/top-stories/route.ts` that calls `requirePermission('admin.top_stories.manage')` + `recordAdminAction` + rate limit. Audit gap: even owner-pinned changes leave no admin_audit_log trail today.
- Verified by: Read the page (lines 110-128, 81), checked for an API route under `web/src/app/api/admin/top-stories` (none), MCP-queried `pg_policy` on `public.top_stories`.

### [P0] `webhook_log.update` is RLS-default-denied — admin retry button silently fails forever
> CLOSED in Session 3 — migration `20260503000015_session3_webhook_ticket_rbac` adds admin UPDATE policy + new POST /api/admin/webhooks/[id]/retry route. Note: route now sets `processing_status='success'` (operator-acknowledged) since no backend retry worker exists; UI copy updated to match honest semantics.
- File: `web/src/app/admin/webhooks/page.tsx:151-158`
- Issue: The page's "Retry" action runs `supabase.from('webhook_log').update({ processing_status: 'success', retry_count: ... })`. Live RLS on `webhook_log` has only `webhook_log_insert` (with-check `false`) and `webhook_log_select` (admin+); there is NO `webhook_log_update` policy. Postgres default-denies. Every retry click toasts "Retry failed. Try again." regardless of admin level. No path to recover a failed webhook from the UI.
- Evidence: MCP `pg_policy` query returns only `(insert, a)` and `(select, r)` for `public.webhook_log`. Page handler at line 151 calls `.update(...)` against this RLS-locked table.
- Impact: Admin webhook-retry feature appears to exist but is non-functional. No audit row either. Operators chasing webhook failures hit a dead-end.
- Suggested fix: Either (a) add a `webhook_log_update` policy gated on `is_admin_or_above()` and route through a new `/api/admin/webhooks/[id]/retry` API that audits + rate-limits, or (b) remove the retry button if the underlying retry worker is the only path. The current code is shaped like option (a) but the policy was never created.
- Verified by: MCP `pg_policy` query, code read at `web/src/app/admin/webhooks/page.tsx:145-170`.

### [P1] `ticket_messages.is_staff` is client-trusted — non-admin can post staff-flagged replies
> CLOSED in Session 3 — `check_ticket_message_is_staff` BEFORE INSERT/UPDATE trigger raises `insufficient_privilege` for non-admin sender; new POST /api/admin/support/[id]/reply server-sets is_staff. Trigger hardened to `hierarchy_level >= 80` (immune to role rename).
- File: RLS policy + `web/src/app/admin/support/page.tsx:174-183`, plus the client-facing send path in `web/src/app/(any)/support` if it shares the table
- Issue: `ticket_messages` has only `(insert, withcheck=(sender_id = auth.uid()) OR (sender_id IS NULL) OR is_admin_or_above())` and `(select, r)`. The column `is_staff` defaults `false` but has no CHECK constraint or trigger pinning it to admin-or-above when set true. The admin support page sets `is_staff: true` from the client. Any authenticated user can craft an INSERT against a ticket they own (or a NULL-sender row) with `is_staff: true` and impersonate staff in the conversation thread.
- Evidence: MCP `pg_policy` shows the with-check expression. `information_schema.columns` shows `is_staff boolean default false` with no constraint. Page sends `is_staff: true` directly in the insert payload.
- Impact: A user replying to their own ticket can post messages that the support UI renders as if they came from staff (color, label, badge). Confidence-game / impersonation vector. Limited blast radius (own ticket only) but unambiguous bug.
- Suggested fix: Add a column-level CHECK or trigger that rejects `is_staff = true` unless `is_admin_or_above(sender_id)` (or unless a SECDEF RPC is the writer). Better still, route admin replies through `/api/admin/support/[id]/reply/route.ts` (does not exist today) so the column is server-set, never client-passed, and the RPC asserts the role.
- Verified by: MCP `pg_policy` on ticket_messages, MCP `information_schema.columns`, code read at support/page.tsx:174.

### [P1] `/admin/access` mutates `access_codes` from the browser — no rank guard, no rate limit, audit-before-mutation anti-pattern
> CLOSED in Session 3 — 3 page flows moved to POST /api/admin/access-codes + PATCH /api/admin/access-codes/[id] (canonical 8-step + `withDestructiveAction` audit-after). Adversary follow-up added rank check on `grants_role_id` (closes role-grant escalation hole).
- File: `web/src/app/admin/access/page.tsx:151-217, 244-258`
- Issue: Three flows (`toggleCode`, `saveExpiry`, `createCode`) mutate `access_codes` directly via the cookie-scoped client. RLS gates writes on `is_admin_or_above()` so non-admins are blocked, but: (a) no rank guard — any admin can flip an owner-tier referral code, (b) no rate limit, (c) the audit row is written via `record_admin_action` BEFORE the mutation. If the mutation fails after the audit lands (network hiccup, RLS rejection due to a future policy tightening, race), the audit log records a phantom action that never happened. This is the exact anti-pattern that `withDestructiveAction()` in `lib/adminMutation.ts:274-287` exists to prevent.
- Evidence: Page lines 153-176 (`toggleCode`): `record_admin_action` runs first, then `supabase.from('access_codes').update(...)`. Line 244 inserts a row with no rate-limit and no per-actor cap. Sibling routes (`/api/admin/users/[id]/ban`, etc.) all run audit AFTER the mutation per the canonical order documented in `adminMutation.ts:1-88`.
- Impact: Phantom audit entries on partial-failure; missing rank guard means a junior admin can revoke an owner-minted referral code.
- Suggested fix: Move all three flows behind a `/api/admin/access-codes/[id]/route.ts` (POST/PATCH/DELETE) following the canonical mutation order: requirePermission → service client → rate limit → body validate → outranks check (when target is owned by another user) → mutation → audit-on-success.
- Verified by: Code read at lines 151-260, MCP `pg_policy` on `access_codes` (admin RLS only, no rank check), comparison against `adminMutation.ts` canonical pattern.

### [P1] `/admin/reader` writes `record_admin_action` audit row before the actual settings update
- File: `web/src/app/admin/reader/page.tsx:167-197`
- Issue: `toggle()` and `updateNum()` write the audit row via `supabase.rpc('record_admin_action', ...)` first, then POST to `/api/admin/settings/upsert`. If the upsert fails, audit was already written. The settings/upsert API route itself ALSO writes its own audit row on success, so successful saves produce TWO audit rows for the same change. Same anti-pattern as `/admin/access`.
- Evidence: Lines 172-184 — audit RPC runs first, on success runs `await fetch('/api/admin/settings/upsert', ...)`. The upsert route at `web/src/app/api/admin/settings/upsert/route.ts:78-84` also calls `recordAdminAction` after the DB write succeeds.
- Impact: Phantom audit rows on save failure; duplicate audit rows on success. Audit-trail integrity drift over time.
- Suggested fix: Drop the client-side `record_admin_action` call entirely — the API route already writes the audit. The client should fire one POST, period.
- Verified by: Code read at both files.

### [P1] `/admin/support` setStatus mutates support_tickets from client + writes audit-first
- File: `web/src/app/admin/support/page.tsx:202-230`
- Issue: When status flips to `'closed'`, the function writes `record_admin_action` first, then `supabase.from('support_tickets').update(...)`. Same anti-pattern + no rate limit + relies on RLS for authorization (RLS gates support_tickets update on user_id match OR is_admin_or_above, so non-admins can't close *other* users' tickets but no rank guard within admins).
- Evidence: Lines 205-218 `record_admin_action` rpc, then 220-223 the actual `.update()`.
- Impact: Same phantom-audit risk + no per-route rate limit + no rank guard.
- Suggested fix: Add `/api/admin/support/[id]/status/route.ts` following the canonical mutation order; remove the client-side audit call.
- Verified by: Code read.

### [P1] `hide_comment` RPC missing rank guard — moderator can hide an owner's comment
> CLOSED in Session 3 — `requireAdminOutranks(comment.user_id, user.id)` added to `/api/admin/moderation/comments/[id]/hide/route.js` before RPC call. Matches `apply_penalty` pattern.
- File: `web/src/app/api/admin/moderation/comments/[id]/hide/route.js:57-61` calling `hide_comment` RPC
- Issue: The route calls `service.rpc('hide_comment', { p_mod_id: user.id, p_comment_id: ..., p_reason: ... })`. The RPC body (verified live) only checks `_user_is_moderator(p_mod_id)` and updates `comments.status = 'hidden'`. There is no check that `p_mod_id` strictly outranks the comment's `user_id`. Sibling routes (`apply_penalty`, ban, role-set) all call `requireAdminOutranks` first; this route is the gap.
- Evidence: MCP `pg_get_functiondef` on `public.hide_comment` returns the function body — only `_user_is_moderator` check, no rank logic. Route file at line 57 calls the RPC without a preceding `requireAdminOutranks(commentAuthorId, user.id)` call.
- Impact: Any moderator (60) can hide a comment authored by an admin (80) or owner (100). Not catastrophic (comments can be unhidden, audit row exists), but inconsistent with the rest of moderation surface.
- Suggested fix: Look up the comment's `user_id` first, then call `requireAdminOutranks(comment.user_id, user.id)` before the `hide_comment` RPC call. Same pattern as `apply_penalty`.
- Verified by: MCP `pg_get_functiondef`, code read.

### [P1] Three pipeline-regenerate routes missing rate limits
> CLOSED in Session 3 — `checkRateLimit` (10/60s, distinct policy keys per surface) added to sources-regenerate, timeline-regenerate, quiz-regenerate. Note: Session 5 will further wrap these in `lib/pipeline/call-model.ts` (cost-cap + ledger) — the rate-limit is a layered guard, do not remove.
- File: `web/src/app/api/admin/pipeline/sources-regenerate/route.ts`, `web/src/app/api/admin/pipeline/timeline-regenerate/route.ts`, `web/src/app/api/admin/pipeline/quiz-regenerate/route.ts`
- Issue: All three routes invoke external LLM APIs (Anthropic) on every call but have no `checkRateLimit`. A misbehaving admin (or compromised admin token) can drain the LLM budget faster than the cost guard can stop it. Other LLM-touching admin routes (`/api/admin/articles/list`, `/api/admin/articles/new-draft`) all rate-limit.
- Evidence: Grep shows these 3 routes lack `checkRateLimit` while having POST handlers; verified by reading `sources-regenerate/route.ts` (no `checkRateLimit` import or call).
- Impact: Cost-amplification vector. A locked-down deployment caps via Anthropic dashboard, but rate-limiting at the route is the cheaper guard.
- Suggested fix: Add `checkRateLimit({ key: 'admin.pipeline.regenerate.X:<actor.id>', max: 10, windowSec: 60 })` to each of the three routes.
- Verified by: Bash grep over `web/src/app/api/admin` for routes with POST/PATCH/DELETE but no `checkRateLimit`; spot-checked `sources-regenerate/route.ts`.

### [P1] `/admin/users` page-entry gate uses `admin.users.list.view` permission, but admin-page entry already passes the lower MOD threshold via layout — moderators get bounced to `/` without a clear message
> NOT CLOSED in Session 3 — this is a UX polish issue (silent redirect vs explicit "insufficient permissions" panel). Documented as deferred in Session 3 status; revisit in Session 6 verification or as a focused permission-set audit.
- File: `web/src/app/admin/users/page.tsx:133-137`
- Issue: The admin layout (`app/admin/layout.tsx:35`) gates on `MOD_ROLES` (owner/admin/editor/moderator). Moderators reach the page, then the page-level check at line 134 calls `hasPermission('admin.users.list.view')`. If the moderator role doesn't hold that key, the page silently `router.push('/')`. No toast, no "you need higher access" message, no /admin breadcrumb back. Multiple admin pages duplicate this pattern with slightly different keys (`/admin/newsroom`: ADMIN_ROLES check, `/admin/breaking`: ADMIN_ROLES check) — moderators bounce out inconsistently.
- Evidence: Layout at lines 31-36 (MOD_ROLES). Page at 134 (hasPermission gate, redirect on fail).
- Impact: UX dead-end for moderators. Page intent (admin layout grants access) and final gate (admin perm only) disagree.
- Suggested fix: Either tighten the layout to ADMIN_ROLES for these pages, or in each page show an in-place "Insufficient permissions" panel instead of a silent redirect, so the operator knows why they were bounced.
- Verified by: Code reads on layout.tsx, users/page.tsx, newsroom/page.tsx, breaking/page.tsx.

### [P2] `/api/admin/permissions` POST gates on `admin.permissions.set.edit` — wrong key for "create permission catalog row"
- File: `web/src/app/api/admin/permissions/route.js:19`
- Issue: The route creates a row in the `permissions` table (the catalog), but is gated on `admin.permissions.set.edit` ("Edit permission set contents") — that's the key for editing `permission_sets`/`permission_set_perms` membership, not for creating a new permission row. The `permissions` table doesn't have a dedicated `admin.permissions.catalog.edit` key, only `admin.permissions.catalog.view`.
- Evidence: MCP `SELECT key, display_name FROM permissions WHERE key LIKE 'admin.permissions%'` returns 7 keys; `set.edit` is for set contents per its display_name. Route hardcodes that key for catalog INSERT.
- Impact: Concept drift. Whoever can edit set contents implicitly can also mint new permission keys (and edit/delete via PATCH/DELETE on the same route family). Probably overlaps in practice but the audit log will name a misleading action.
- Suggested fix: Mint a new `admin.permissions.catalog.edit` permission key, gate this route + the PATCH/DELETE siblings on it, and grant it to the same role-set as `set.edit` so behavior doesn't change.
- Verified by: MCP query on `permissions`, route read.

### [P2] Dead component `KBD.jsx` (keyboard-shortcut chip) — owner banned hotkeys, component should be deleted
> CLOSED in Session 3 — file deleted (verified zero live imports).
- File: `web/src/components/admin/KBD.jsx`
- Issue: Component renders Cmd+K-style keyboard chips. Owner directive (`feedback_no_keyboard_shortcuts.md`) bans hotkeys/command palette from admin. Grep shows zero imports of KBD across `web/src/app` and `web/src/components` — only its own JSDoc references it. The `DataTable.jsx:28` comment says "Click-driven (no keyboard shortcuts — admin UI is mouse-first)", consistent with the directive. KBD.jsx is dead code that contradicts policy.
- Evidence: `grep -rn "import.*KBD\|from.*KBD"` across web/src returns only the file's own docstring lines. No live import.
- Impact: Latent risk — a future contributor sees the component and reintroduces hotkey UI. Better to delete and align with the standing rule.
- Suggested fix: Delete `web/src/components/admin/KBD.jsx`. Confirm no test or storybook refs first (none in the grep).
- Verified by: Grep over web/src for KBD imports.

### [P2] `/api/admin/auth-recovery/[user_id]` and `/api/admin/kids-dob-corrections/[id]` lack rate limits on POST
- File: `web/src/app/api/admin/auth-recovery/[user_id]/route.ts`, `web/src/app/api/admin/kids-dob-corrections/[id]/route.ts`
- Issue: Both POST handlers gate via `requirePermission` and apply mutations through service-role + recordAdminAction, but neither calls `checkRateLimit`. Auth-recovery actions (confirm_email, clear_login_lock) and DOB-correction decisions are sensitive enough to deserve a per-actor cap to slow down abuse if a token is compromised.
- Evidence: Both files read in full; no `checkRateLimit` import or call. Grep over `web/src/app/api/admin` confirms.
- Impact: Lower priority because these are gated behind admin-or-above perms and rank-guard, but consistency matters — 95% of admin mutation routes rate-limit.
- Suggested fix: Add `checkRateLimit({ max: 30, windowSec: 60, key: ..., policyKey: ... })` to each.
- Verified by: Code reads.

### [P2] Admin pages `/admin/newsroom`, `/admin/breaking`, `/admin/top-stories`, `/admin/access`, `/admin/users`, `/admin/users/[id]/permissions` each repeat their own client-side role-fetch + redirect logic
- File: `web/src/app/admin/newsroom/page.tsx:120-133`, `web/src/app/admin/breaking/page.tsx:44-57`, etc.
- Issue: Six pages each fetch `user_roles → roles(name)`, lowercase, intersect with `ADMIN_ROLES` or `MOD_ROLES`, redirect on fail. Different pages choose different gates. The admin layout (`app/admin/layout.tsx`) already does this server-side — the duplicate client-side checks add latency, query load, and inconsistent gating. With permissions.js now offering `hasPermission(key)` after `refreshAllPermissions()`, the canonical client-side pattern is `hasPermission('admin.<surface>.view')` (used in `/admin/users:134`). Other pages haven't migrated.
- Evidence: Code reads on each page's `useEffect` boot block.
- Impact: Inconsistent denial UX (silent redirect to `/` vs `/login` vs nothing). Wasted DB roundtrips. Drift risk: a role rename or hierarchy change requires touching every page.
- Suggested fix: Replace each page's client-side role fetch with a single `await refreshAllPermissions(); if (!hasPermission(key)) router.push('/admin');` block. The server-side layout is already the security boundary.
- Verified by: Code reads, comparison against `web/src/app/admin/users/page.tsx:133-137` (the migrated pattern).


## PM-5 — Billing-and-iOS-Bridge

Scope reviewed: `web/src/app/api/billing/{cancel,change-plan,resubscribe}/route.js`, `web/src/app/api/stripe/{checkout,portal,webhook}/route.js`, `web/src/app/api/ios/{appstore/notifications,subscriptions/sync}/route.js`, `web/src/lib/{stripe.js,appleReceipt.js,plans.js}`, `web/src/app/pricing/{page.tsx,_CheckoutButton.tsx}`, `web/src/app/billing/page.tsx`, `web/src/app/profile/settings/_cards/BillingCard.tsx`, `VerityPost/VerityPost/StoreManager.swift`, `VerityPost/VerityPost/SubscriptionView.swift`.

The code is unusually mature. Stripe HMAC sig + 5-minute timestamp window with one-directional past-bound (F-047), Apple JWS chain + ES256 + Apple Root CA-G3 + Sandbox/Production env gate (S4-A4), webhook_log UNIQUE event_id idempotency on both sides with stuck-row reclaim, F-016 client_reference_id/metadata.user_id pair-match defense, B3 appAccountToken hardening on both sync and S2S notifications, T304 comp/trial-extension double-billing guard for web checkout/change-plan/resubscribe, S-001 receipt-expiry gate, S-002 no-token-no-prior-row rejection, B14 signedDate replay window, F-016 customer-mapping refuse-overwrite — all in place with explanatory comments tying each to its prior bug. What follows is what's still wrong.

Severity tally: **2 P0, 5 P1, 4 P2, 1 P3.**

### [P0] Web checkout/change-plan/resubscribe never check for an active Apple subscription
> CLOSED in Session 4 — commit 41ea524 (Stream 1 — billingPlatformGuard.ts helper + Apple precheck on 4 web routes; cancel-route precheck reverted in second pass per adversary)
- File: `web/src/app/api/stripe/checkout/route.js:70-109`, `web/src/app/api/billing/change-plan/route.js:71-100`, `web/src/app/api/billing/resubscribe/route.js:67-96`
- Issue: All three web billing routes pre-flight-check `comped_until` and `trial_extension_until` on `users`, but NONE checks for an active Apple-side subscription on the same user. The user-row select doesn't even pull a `subscriptions` join filtered by `platform='apple'` AND `status IN ('active','trialing','past_due')`.
- Evidence: checkout's user select reads only `'id, stripe_customer_id, email, cohort, comped_until, trial_extension_until'` (line 73). change-plan reads `'stripe_customer_id, cohort, comped_until, trial_extension_until'`. resubscribe reads the same. Grep for `platform.*apple` / `apple_original` across all three returns zero hits.
- Impact: Cross-platform double-billing. A user with a live Apple subscription (`subscriptions.platform='apple', auto_renew=true`) who lands on `/pricing` and clicks Subscribe gets a Stripe checkout session minted, completes payment, and `handleCheckoutCompleted` runs `billing_change_plan` against `users` (webhook lines 502-507). The user is now charged by both Stripe AND Apple. Apple keeps billing until they manually cancel in iOS Settings; `users.plan_id` is whichever provider wrote last; `subscriptions` carries two active rows with no reconciliation. Symmetric exposure: `ios/subscriptions/sync` calls `billing_change_plan`/`billing_resubscribe` (sync route lines 207-216) without checking for an active Stripe sub either.
- Affected RPCs/events: `billing_change_plan`, `billing_resubscribe`, Stripe `checkout.session.completed`, iOS `apple_sync` event_id.
- Suggested fix: Before any Stripe state mutation in the web routes, query `subscriptions` for `(user_id=user.id AND platform='apple' AND status IN ('active','trialing','past_due'))`. If found, return 409 `{ error: 'apple_sub_active', manage_url: 'open Settings → Apple ID → Subscriptions' }` matching the existing T304 comp 409 shape. Mirror the inverse check in `ios/subscriptions/sync` against `(platform='stripe' AND stripe_subscription_id IS NOT NULL AND status active/trialing/past_due)` — refuse with 409 telling iOS to direct user to web portal to cancel Stripe first.
- Verified by: Read of all three web route files plus iOS sync route plus webhook handler; grep for any `platform`/`apple`/`stripe_subscription_id` cross-check in those files returned nothing.

### [P0] change-plan silently un-cancels a scheduled cancellation
> CLOSED in Session 4 — commit 41ea524 (Stream 1 — `cancel_at_period_end: 'false'` dropped from `updateSubscriptionPrice`; change-plan returns 409 `cancel_pending` if existing sub has cancel scheduled)
- File: `web/src/app/api/billing/change-plan/route.js:102-122` calling `web/src/lib/stripe.js:143-154`
- Issue: When a user has previously clicked "Cancel subscription" and the Stripe sub is in `status='active', cancel_at_period_end=true`, the change-plan route's "find active sub" query (line 105) matches it (filter is `status === 'active'|'trialing'|'past_due'` with no cancel_at_period_end check). It then calls `updateSubscriptionPrice(active.id, item.id, plan.stripe_price_id)` which unconditionally sets `cancel_at_period_end: 'false'` in its body.
- Evidence: stripe.js line 150 — `cancel_at_period_end: 'false'` is hardcoded into the updateSubscriptionPrice body. change-plan does not read or pass through `cancel_at_period_end` from the existing sub.
- Impact: User who cancels then changes plan (e.g. "I'll downgrade and ride out the period") has their cancellation silently revoked. They will be re-billed at the next renewal without ever clicking "Resume". The webhook will fire `customer.subscription.updated` with `cancel_at_period_end=false` and the un-cancel branch (webhook route lines 646-684) will clear `plan_grace_period_ends_at` locally, so the UI also stops showing "cancel-scheduled" — the user has no signal until the next charge. Affected events: Stripe `subscriptions` POST with `cancel_at_period_end='false'` body, downstream `customer.subscription.updated` triggering `billing_uncancel_subscription`.
- Suggested fix: In change-plan route, after picking `active` (line 105), check `if (active.cancel_at_period_end) return 409 { error: 'cancel_pending', resume_first: true }`. Force the user to click Resume before changing plans. Refusing is cleaner than silently un-cancelling because the user's intent is ambiguous and we cannot tell from the request body which they meant.
- Verified by: Read of change-plan/route.js + stripe.js; the hardcoded 'false' in updateSubscriptionPrice body confirms unconditional un-cancel.

### [P1] iOS sync grants plan BEFORE writing the subscriptions row (no transaction)
> CLOSED in Session 4 — commit 41ea524 (Stream 2 — 3-step ordering: pending upsert → RPC → activate UPDATE; second pass added .update() error capture + 500-on-failure for retry-safety)
- File: `web/src/app/api/ios/subscriptions/sync/route.js:206-267`
- Issue: `billing_change_plan` (or `billing_resubscribe`) runs at lines 207-216, then the `subscriptions` upsert runs at lines 263-267. Between those two writes, `users.plan_id` is set to the new Apple plan but the subscriptions row either does not exist or still shows the old plan. If the request fails between the RPC and the upsert (network blip, Supabase hiccup), `users.plan_id` is granted with no matching subscriptions row — the next Apple S2S notification's `lookupUserAndPlan` sees no subscriptions row to update, and the standard reconciliation paths cannot roll back the plan grant.
- Evidence: Lines 206-216 call billing_change_plan/billing_resubscribe; lines 263-267 do the subscriptions upsert. No transaction wraps the two writes. The `webhook_log` row only flips to `processed` after both succeed (lines 269-275), so a retry CAN re-run, but the user has already been granted plan permissions in the gap.
- Impact: Inconsistent state where a user has plan permissions but no record of which receipt granted them. Risk is real but low under normal conditions. Affected event: `apple_sync` event_id.
- Suggested fix: Reorder to write the subscriptions row first (status='pending'), then call billing_change_plan/resubscribe, then update subscriptions to status='active'. Or wrap both in a single SECDEF RPC `apple_sync_grant_plan(user_id, plan_id, original_tx_id, period_start, period_end)`. The Stripe checkout-completed handler has the same shape (RPC then upsert) but is followed by a stripe_subscription_id-keyed upsert that's a no-op on retry, so a symmetric fix would help both.
- Verified by: Read of sync route lines 196-275 — no transaction boundary, RPC fires before subscription row write.

### [P1] BillingCard.tsx retry loop has stale-closure read on `sub` and sets state from cleanup
> CLOSED in Session 4 — commit 41ea524 (Stream 3 — `gotPaidSubRef` ref pattern replaces stale closure; `setRetryOnSuccess(false)` removed from cleanup return)
- File: `web/src/app/profile/settings/_cards/BillingCard.tsx:146-173`
- Issue: The webhook-wait retry loop fires `fetchData()` up to 6 times with 1s spacing on `?success=1` landing. The intent (per code comment lines 156-158) was to stop early when the new sub appears, but the closure cannot read post-fetch state — so it always runs all 6 attempts regardless of outcome. The cleanup function on lines 167-170 calls `setRetryOnSuccess(false)` from the unmount callback, a state-update-during-unmount pattern that React strict-mode warns about.
- Evidence: Lines 158-160 comment — `// Re-read sub from state after fetchData settles is not reliable inside the closure; instead we schedule the next attempt and let it re-check` — confirms always-MAX-attempts. Line 169: `setRetryOnSuccess(false)` inside the cleanup return.
- Impact: User who lands on /profile/settings?success=1 with a fast-firing webhook still triggers up to 5 unnecessary Supabase queries. React strict-mode console warnings on Settings page. Not a user-visible failure but wasteful and noisy.
- Suggested fix: Capture a `gotPaidSub` ref (`useRef`) inside the retry loop, set it true when fetchData resolves with a non-free sub, check it before scheduling the next attempt. Move `setRetryOnSuccess(false)` outside the cleanup (set it when MAX hits inside the loop body, or via a separate effect that watches `attempt`).
- Verified by: Read of BillingCard.tsx lines 142-173.

### [P1] handleSubscriptionUpdated cancel-while-grace-already-set early-returns and skips a coincident plan change
> CLOSED in Session 4 — commit 41ea524 (Stream 1 — early-return at line 638 dropped; cancel block falls through to plan-change branch when both occur in same event)
- File: `web/src/app/api/stripe/webhook/route.js:612-639`
- Issue: When `cancel_at_period_end=true` and `userRow.plan_grace_period_ends_at` already exists, the handler updates the grace marker, mirrors `subscriptions.cancel_at`, then `return`s at line 638. Stripe Portal allows multiple actions per session and consolidates them into one `customer.subscription.updated` event — if a user changes plan AND cancels in the same Portal click-through, the price-change branch (lines 700-746) never runs.
- Evidence: Line 638 `return;` exits before the price-change block at 700. The early-return comment doesn't acknowledge the combined case.
- Impact: Edge case but real — local `users.plan_id` stays on the OLD plan_id while Stripe charges the new tier on next cycle (until cancel takes effect). Mismatch shows up as "I downgraded but I'm still charged the higher rate" support ticket. Affected event: `customer.subscription.updated`.
- Suggested fix: Drop the `return` at 638 and continue to the plan-change branch when `priceId && planRow && planRow.id !== userRow.plan_id`. The plan-change branch is idempotent (RPC bumps perms cache via internal trigger; subscriptions upsert is keyed on stripe_subscription_id), so combining the two writes is safe.
- Verified by: Read of webhook route.js lines 553-748.

### [P1] handleChargeRefunded auto-freeze gate parses settings.value as string 'true'/'false'
> CLOSED in Session 4 — commit 41ea524 (Stream 1 — `String(settingRow?.value ?? '').toLowerCase() === 'true'` coercion; sweep confirmed no other instances)
- File: `web/src/app/api/stripe/webhook/route.js:792-799`
- Issue: `settings.value === 'true'` comparison treats the column as a string. If anyone migrates `settings.value` to JSONB or boolean (a common Postgres setting-table pattern), this comparison silently turns autofreeze OFF (because `true === 'true'` is false) and full refunds skip the freeze path, leaving users with revoked-payment-but-active-plan.
- Evidence: line 798 `const autoFreeze = settingRow?.value === 'true';`
- Impact: Silent fail-open on refund freeze if the settings column type ever changes. Currently latent (column is text) but the failure mode is silent + payment-affecting. Affected event: `charge.refunded`.
- Suggested fix: Change to `String(settingRow?.value).toLowerCase() === 'true'` or use a dedicated helper that handles boolean / 't' / 'true' / 1 consistently. Worth a sweep for any other `settings.value === 'true'` usage in the codebase.
- Verified by: Read of webhook route.js line 792-799.

### [P1] Pricing page metadata + plan card hardcode prices that may diverge from DB
> CLOSED in Session 4 — commit 41ea524 (Stream 3 — RSC reading from DB with `revalidate: 300`, pricingCopy.ts shared fallbacks, BillingCard schema bug fix `monthly_price_cents`→`price_cents`. Owner action: apply migration 20260503000019 + mint Stripe price IDs)
- File: `web/src/app/pricing/page.tsx:14-18, 166, 186, 232-251`
- Issue: Pricing page is a server component that hardcodes `$7.99/mo`, `$14.99/mo`, `$79.99` annual, `$149.99` annual, plus a 4-row Family scaling table. None come from the `plans` table. `web/src/lib/plans.js:7-20` documents that `verity_monthly` is the legacy grandfathered $3.99 SKU, while `verity_pro_monthly` is $9.99 — but the page sells "Verity" at $7.99 with `planName="verity_monthly"`.
- Evidence: page.tsx line 180 `planName="verity_monthly"`, line 166 `price="$7.99"`. plans.js line 7-20 calls verity_monthly the legacy $3.99 row.
- Impact: One of three states is true (only the owner can confirm via the DB): (a) the DB row for `verity_monthly` was updated from $3.99 to $7.99 and the plans.js comment is stale documentation; (b) the DB still shows $3.99 and the page is over-quoting (Stripe charges less than the page claimed — minor refund risk + confusion); (c) the DB has both rows and the page is selling the wrong one. iOS-side StoreManager.swift uses Phase-2 SKU `com.veritypost.verity.monthly` priced at $7.99, consistent with the web page's claim, suggesting state (a) — but the plans.js documentation drift is itself a bug.
- Suggested fix: Convert the pricing page to read from `getPlans(supabase)` and render `formatCents(monthly.price_cents)` per tier (server-side; same pattern as BillingCard but in the RSC). Removes drift risk and means owner-driven price changes do not require code edits. Update plans.js header comment to match current DB reality.
- Verified by: Read of pricing/page.tsx + plans.js comment header + StoreManager.swift price fallbacks.

### [P2] Apple notification env-gate defaults to Production when both VERCEL_ENV and NODE_ENV are unset, with no audit row
- File: `web/src/app/api/ios/appstore/notifications/route.js:128-138`
- Issue: When neither `VERCEL_ENV` nor `NODE_ENV` is set, the route defaults `expectedEnv='Production'` with a CRIT log. Per the comment this is intentional (avoid silent dev-side rejection) but there is no audit_log row — only a console.error that may not be surfaced anywhere.
- Evidence: lines 128-138, the fallback branch.
- Impact: Misconfigured deploy silently accepts Production traffic with no alerting. Low likelihood (Vercel sets VERCEL_ENV automatically) but the bypass exists.
- Suggested fix: Insert an audit_log row in the misconfigured branch (action='ios_webhook_env_misconfigured', metadata captures the missing envs) so admin surfaces see it without depending on log search.
- Verified by: Read of ios/appstore/notifications/route.js lines 120-138.

### [P2] handleSubscriptionUpdated kid_seats fallback heuristic accepts ambiguous line items
- File: `web/src/app/api/stripe/webhook/route.js:566-587`
- Issue: The kid-seats extractor walks subscription items, summing `quantity` for items whose `meta.seat_role === 'extra_kid'|'kid_seat'` and flagging `hasFamilyBase` for `meta.seat_role === 'family_base'`. The fallback heuristic at lines 575-580 (`if (it?.price?.id && planRow?.tier === 'verity_family')`) flags base for ANY priced line on the family tier, even when metadata.role is unset on what's actually the extras line. Result depends on metadata being uniformly stamped on every Stripe price.
- Evidence: Lines 566-587 — fallback runs whenever metadata.role is absent, with no disambiguation between base-line and extras-line.
- Impact: Family tier seat count could mis-show during a Stripe-side metadata change or a proration window where line ordering shifts. Low frequency but visible to family users.
- Suggested fix: Require explicit `meta.seat_role` on every Family price (already documented as the convention) and treat absence as an error rather than a fallback — log it, do not update kid_seats_paid. Fail-loud is better than silent miscount on a paid feature.
- Verified by: Read of webhook route.js lines 554-608.

### [P2] iOS notifications mint-on-fallback row leaves plan_id NULL on terminal types (EXPIRED/REVOKE/REFUND)
- File: `web/src/app/api/ios/appstore/notifications/route.js:291-410`
- Issue: When no subscriptions row exists for an `originalTxId` and the JWS-verified `transaction.appAccountToken` matches a real user, the route mints a `subscriptions` row with `plan_id` not set (insert object lines 309-316). It then falls through to the type-switch. SUBSCRIBED/DID_RENEW etc. resolve a plan and write it; but EXPIRED/REVOKE/REFUND only write `status='cancelled'` (lines 386-395) without ever resolving plan_id from `transaction.productId`.
- Evidence: lines 309-316 (insert without plan_id), lines 386-395 (EXPIRED/REVOKE writes without resolving plan).
- Impact: Forensic / accounting confusion only — user-facing freeze still happens via `billing_freeze_profile` at line 386. But the orphan-row pattern (`plan_id IS NULL, status='cancelled', source='apple'`) complicates support investigations and audits.
- Suggested fix: Either resolve the plan from `transaction.productId` before any type-branch write (do it at line 365 unconditionally), or skip the mint-on-fallback entirely for terminal types where the freeze is the only thing we care about. The latter is simpler and matches the comment's intent.
- Verified by: Read of ios/appstore/notifications/route.js lines 277-410.

### [P2] CheckoutButton uses localStorage for cross-tab idempotency without pagehide eviction
- File: `web/src/app/pricing/_CheckoutButton.tsx:5-32`
- Issue: `CHECKOUT_IN_FLIGHT_KEY` is set on click, removed on success/error/redirect. If the user closes the tab mid-fetch (before any clear runs), the key persists with its 60s TTL. Wall-clock TTL works in practice but a user who closes-and-retries within 60s sees "Checkout already opened in another tab" when there is no other tab.
- Evidence: lines 25-32 wall-clock TTL check; no `pagehide`/`beforeunload` listener clears the key.
- Impact: Minor UX friction; user has to wait up to 60s after a closed tab to retry. Refresh works because the localStorage TTL is short.
- Suggested fix: Add `window.addEventListener('pagehide', () => localStorage.removeItem(CHECKOUT_IN_FLIGHT_KEY))` so a closed tab releases the lock immediately. Optional polish.
- Verified by: Read of _CheckoutButton.tsx in full.

### [P3] BillingCard EXPIRED_STATUSES carries both 'cancelled' and 'canceled' spellings
- File: `web/src/app/profile/settings/_cards/BillingCard.tsx:229, 337`
- Issue: Both spellings are listed in `EXPIRED_STATUSES`. Indicates ambiguity about which our internal tables write (`cancelled`, double-l per webhook handler insertions at route.js:1314, 1316) vs Stripe's spelling (`canceled`, single-l). Belt-and-braces is fine; flag for cleanup.
- Evidence: line 229 + line 337 — both spellings in both sets.
- Impact: None — code clutter signalling unresolved naming. A future contributor might pick the wrong spelling for a new check.
- Suggested fix: Standardise on the database value (`cancelled`) for our writes and document at the top of the file that Stripe → 'canceled' maps to our 'cancelled' on insert. Drop one spelling once verified end-to-end.
- Verified by: Read of BillingCard.tsx.

### Cross-platform parity drift (web ↔ iOS) — for PM-10

These are NOT bugs in scope to fix here; logging for the parity sweep:

1. **Pricing source-of-truth split (3 copies).** Web pricing page hardcodes prices in TSX (page.tsx:166, 186, 232-251); iOS hardcodes in StoreManager.swift:476-491 (priceCentsForProduct fallback) and SubscriptionView.swift:99-110 (legalDisclosures); DB `plans.price_cents` is the third copy. None reference the others; any price change requires three edits + an App Store Connect submission.

2. **Plan name mapping is brittle on iOS.** StoreManager.swift `planName(for:)` (lines 437-444) does string-contains matching ('verity_family', 'verity_pro', 'verity'). Web reads `plans.name` directly. If a future plan adds 'verity_lite', the iOS contains-match returns 'verity' incorrectly because of substring overlap. iOS-side mapping is brittle; flag for unification.

3. **Trial duration: no canonical source visible.** Stripe checkout creator does not set `subscription_data.trial_period_days`; Apple's SKU configures trial in App Store Connect. The two trial regimes cannot be aligned automatically. The pricing page's "Cancel anytime" copy implies no trial; SubscriptionView.swift's legalDisclosures includes "Any unused portion of a free trial period, if offered, will be forfeited" — boilerplate, but suggests a trial may be offered iOS-side that is not surfaced web-side.

4. **Sandbox vs Production env handling: present iOS, absent Stripe.** `appleReceipt.js` + the notifications route enforce a Sandbox/Production env match (S4-A4). Stripe's analogue would be checking `STRIPE_SECRET_KEY` starts with `sk_test_` vs `sk_live_` and refusing test events on prod / vice-versa. No such check exists. Lower risk because Stripe webhook secrets are env-distinct and signature verification rejects cross-env traffic, but still drift from the iOS side's defensive posture.

5. **Family tier purchasable iOS-only, but `users` rows on Apple plans are reachable on web cancel/portal calls without platform check.** Plans.js + `is_visible=false` mean web checkout/change-plan/resubscribe correctly 404 on family `plan_name`s. StoreManager.swift offers them via StoreKit. But a user with an active iOS Family receipt who calls `/api/billing/cancel` from web is not platform-checked — the route attempts to cancel via Stripe (no-op since no Stripe sub), then runs `billing_cancel_subscription` RPC locally. Effect: local plan state cancelled while Apple keeps charging. Same root cause as the P0 above (no platform=apple cross-check on web routes); flagging here so PM-10's parity sweep covers the full set: cancel + change-plan + resubscribe + checkout, all four web routes, against Apple sub presence.

### Top 3 P0/P1 (highest-priority items for fix-pass)

1. **[P0] Cross-platform double-billing via web checkout/change-plan/resubscribe** — three web routes never check for an active Apple sub before minting / mutating a Stripe sub. Symmetric exposure on iOS sync. Add `platform='apple'` precheck on all three web routes + inverse `platform='stripe'` precheck on iOS sync.

2. **[P0] change-plan silently un-cancels a scheduled cancellation** — `updateSubscriptionPrice` hardcodes `cancel_at_period_end: 'false'`, so any user who clicks Cancel and later changes plan has their cancel revoked without ever clicking Resume. Add `if (active.cancel_at_period_end) return 409 'cancel_pending'` precheck.

3. **[P1] iOS sync grants plan_id before writing the subscriptions row** — non-atomic two-step write. A failure between the RPC and the upsert leaves `users.plan_id` set with no matching subscriptions row, breaking S2S reconciliation. Wrap in a single SECDEF RPC or write subscriptions first.


## PM-9 — Pipeline-and-Cron

### Summary

- 22 cron routes inventoried — **every route calls `verifyCronAuth` on the first request line**. No P0 cron-auth gaps.
- 17 pipeline lib files inventoried; 1 ingest route, 1 generate route, 5 cron routes calling LLMs.
- vercel.json `crons[]` has 22 entries, 1:1 with the on-disk cron route folders (verified by `scripts/check-crons.mjs` semantics).
- `pipeline-cleanup`, `process-deletions`, `purge-audit-log` all gate on `verifyCronAuth` AND have RPC-side row caps / grace windows / status guards. No quorum/dry-run, but the RPCs themselves are bounded and idempotent — acceptable per `feedback_genuine_fixes_not_patches.md` (the gate is real, not a patch).
- Cost-cap, retry, prompt-redaction, and `pipeline_costs` ledger live entirely inside `/lib/pipeline/call-model.ts`. **Five LLM-calling routes bypass it** (P0).

### Cron-auth verification (every route, file:line)

All 22 cron handlers invoke `verifyCronAuth(request)` before any side effects:

```
api/cron/anonymize-audit-log-pii/route.js:22         — if (!verifyCronAuth(request).ok) return 403
api/cron/birthday-band-check/route.ts:95             — handler-level verifyCronAuth gate
api/cron/check-user-achievements/route.js:35         — if (!verifyCronAuth(request).ok) return 403
api/cron/cleanup-data-exports/route.ts:36            — if (!verifyCronAuth(request).ok) return 403
api/cron/dob-correction-cooldown/route.ts:217        — handler-level verifyCronAuth gate
api/cron/expire-mutes/route.ts:19                    — if (!verifyCronAuth(request).ok) ...
api/cron/flag-expert-reverifications/route.js:25     — if (!verifyCronAuth(request).ok) ...
api/cron/freeze-grace/route.js:26                    — if (!verifyCronAuth(request).ok) return 403
api/cron/pipeline-cleanup/route.ts:79                — if (!verifyCronAuth(request).ok) return 403
api/cron/process-data-exports/route.js:29            — if (!verifyCronAuth(request).ok) return 403
api/cron/process-deletions/route.js:37               — if (!verifyCronAuth(request).ok) return 403
api/cron/purge-audit-log/route.js:20                 — if (!verifyCronAuth(request).ok) return 403
api/cron/purge-webhook-log/route.js:21               — if (!verifyCronAuth(request).ok) ...
api/cron/rate-limit-cleanup/route.ts:27              — if (!verifyCronAuth(request).ok) return 403
api/cron/recompute-family-achievements/route.js:25   — if (!verifyCronAuth(request).ok) return 403
api/cron/score-comments/route.ts:16                  — if (!verifyCronAuth(request).ok) ...
api/cron/send-emails/route.js:68                     — if (!verifyCronAuth(request).ok) ...
api/cron/send-push/route.js:67                       — if (!verifyCronAuth(request).ok) ...
api/cron/subscription-reconcile-stripe/route.ts:163  — handler-level verifyCronAuth gate
api/cron/sweep-beta/route.js:26                      — if (!verifyCronAuth(request).ok) ...
api/cron/sweep-kid-trials/route.js:22                — if (!verifyCronAuth(request).ok) ...
api/cron/sweep-trial-expiry/route.ts:20              — if (!verifyCronAuth(request).ok) ...
```

`verifyCronAuth` itself (`web/src/lib/cronAuth.js:18-46`) does timing-safe compare via `crypto.timingSafeEqual` + accepts `x-vercel-cron: 1` (a Vercel-stripped platform header) as proof of origin. Solid.

### Findings

### [P0] LLM-calling admin routes bypass `call-model.ts` cost-cap, retry, ledger, and prompt redaction
- File: `web/src/app/api/admin/pipeline/quiz-regenerate/route.ts:96-99` + `:170-175`
- File: `web/src/app/api/admin/pipeline/sources-regenerate/route.ts:97` + downstream `client.messages.create`
- File: `web/src/app/api/admin/pipeline/timeline-regenerate/route.ts:82` + downstream `client.messages.create`
- File: `web/src/app/api/cron/score-comments/route.ts:52-70`
- File: `web/src/app/api/ai/generate/route.js:87-98`
- Issue: All five routes instantiate the Anthropic / OpenAI SDK directly and call `client.messages.create` / `fetch('https://api.openai.com/...')` without going through `lib/pipeline/call-model.ts`. They therefore skip every safeguard `call-model.ts` enforces:
  - `checkCostCap` (daily + per-run dollar cap, fail-closed) — a runaway regenerate / a stuck score-comments cron has no spending ceiling
  - `reserveCostOrFail` advisory-lock that prevents concurrent overspend
  - `pipeline_costs` ledger insert (success + failure)
  - `RETRY_ATTEMPTS_DEFAULT` + exponential backoff with jitter (429/5xx)
  - `cleanText` post-process pass
  - prompt-redaction shape (no Anthropic prompt-cache header use)
- Evidence (quiz-regenerate L96-100, L170-175):
  ```
  function getAnthropicClient(): Anthropic {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    return new Anthropic({ apiKey: key });
  }
  ...
  const res = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2000,
    system: quizSystem,
    messages: [{ role: 'user', content: quizUser }],
  });
  ```
- Evidence (score-comments L52-70):
  ```
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  ...
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: 'You are a content moderation system...',
    messages: [{ role: 'user', content: `Score this comment:\n${comment.body.slice(0, 2000)}` }],
  });
  ```
- Evidence (ai/generate L87-98):
  ```
  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [...], max_tokens: 1500 }),
  });
  ```
- Impact: A wedged score-comments tick processing 100 comments × Haiku, an admin clicking "Regenerate quiz" 50 times on a long article, or an editor with permission to call `/api/ai/generate` in a loop, all spend money with **zero ceiling**. The daily cap announced by `pipeline.daily_cost_usd_cap` and the per-run cap announced by `pipeline.per_run_cost_usd_cap` only apply to the F7 generate path. There is no `pipeline_costs` row written for any of these calls, so cap-aware dashboards underreport spend.
- Suggested fix:
  - Route quiz-regenerate / sources-regenerate / timeline-regenerate through `callModel({...})` with synthesized `pipeline_run_id` (insert a `pipeline_runs` row with `pipeline_type='regenerate_quiz' | 'regenerate_sources' | 'regenerate_timeline'`, mark complete in finally). The cap then applies and the run is auditable.
  - Route `score-comments` through `callModel`, with `pipeline_run_id` per cron tick (one row per tick, sub-rows in `pipeline_costs`). Cap triggers fail-closed, abort the rest of the batch, the next tick retries.
  - Delete `/api/ai/generate/route.js` (the file's TODO(T69) header already plans this) once `admin/story-manager` and `admin/kids-story-manager` migrate. Until then, at minimum gate it on `checkCostCap` and write a `pipeline_costs` row.
- Verified by: file reads above; cross-grep confirms `callModel` / `checkCostCap` / `reserveCostOrFail` are only imported by `api/admin/pipeline/generate/route.ts` and the lib itself (`grep -rn "callModel\|checkCostCap\|reserveCostOrFail" web/src/app/api`).

### [P1] `kid_url_sanitizer` step is non-fatal — kid articles can persist with raw external URLs in body
- File: `web/src/app/api/admin/pipeline/generate/route.ts:1625-1652`
- Issue: The kid-pipeline URL-sanitizer step wraps `callModel` in a try/catch and on any failure logs a warning but **leaves `finalBodyMarkdown` untouched** (i.e., still containing the URLs the writer step emitted). The article continues through persist with raw URLs in the body, then ships as `status='draft'` with no `needs_manual_review` flag.
- Evidence:
  ```
  } catch (sanErr) {
    pipelineLog.warn(`newsroom.generate.${sanStepName}`, {
      ...
      error_type: classifyError(sanErr),
      error_message: sanErr instanceof Error ? sanErr.message : String(sanErr),
    });
  }
  stepTimings[sanStepName] = Date.now() - sanStart;
  ```
- Impact: COPPA + Apple kids-app guidelines require external links to be stripped from kid content. A flaky Haiku call (timeout, 429, JSON-parse failure) silently lets a kid article persist with raw URLs in the markdown body. Persist's status is `draft` so an editor still has a gate, but there's no signal flagging the article for review and no retry — if the editor publishes by sight, the URLs ship. The plagiarism-check step has the same shape but DOES set `needs_manual_review=true` (route L1543-1546); kid_url_sanitizer doesn't.
- Suggested fix: in the catch branch, set a `kidUrlSanitizerFailed = true` flag; merge into the `needs_manual_review` calculation at L1543-1546. Optionally add a deterministic regex strip pass as a fallback when the LLM call fails (the writer prompt explicitly forbids external URLs already, so this is defense-in-depth).
- Verified by: file read + cross-reference to plagiarism flag-handling pattern at L1543-1546 + L1893-1916.

### [P1] `score-comments` cron has no per-tick cost ceiling AND processes up to 100 comments serially with no backoff
- File: `web/src/app/api/cron/score-comments/route.ts:38-121`
- Issue: Selects 100 comments at a time (`.limit(100)` L45), iterates `for (const comment of comments)`, and inside each iteration creates an Anthropic Haiku call. No `checkCostCap`, no retry policy, no parallelism cap, no per-tick budget. Errors are caught and logged per comment but not aggregated against any ceiling.
- Evidence:
  ```
  const { data: comments } = await service
    .from('comments')
    .select('id, body')
    ...
    .limit(100);
  ...
  for (const comment of comments as ...) {
    if (!comment.body?.trim()) continue;
    try {
      const msg = await client.messages.create({ ... });
      ...
    } catch (err) {
      console.error('[score-comments] error on comment', comment.id, err);
    }
  }
  ```
- Impact: Scheduled every 15 min (vercel.json). At full backlog × 100 comments × $X/Haiku-call there's no ceiling and no observability via `pipeline_costs` (the F7 ledger). At scale the cron also pins the Anthropic SDK's HTTP/1.1 connection pool because there's no concurrency cap; a wedge here propagates to other cost-aware paths via shared rate limits.
- Suggested fix: route through `callModel` with a `pipeline_run_id` per tick (one ledger row per call). Add `Promise.all` with a small concurrency cap (5-10 mirrors `check-user-achievements`'s pattern, route L62-83). Existing `pipeline.daily_cost_usd_cap` then applies.
- Verified by: file read.

### [P1] `subscription-reconcile-stripe` overwrites local `kid_seats_paid` with whatever Stripe says — even when Stripe is empty
- File: `web/src/app/api/cron/subscription-reconcile-stripe/route.ts:107-153`
- Issue: When `stripeRetrieveSubscription` returns `null` (network blip, 4xx, missing key), the row is counted as an error and skipped. But when Stripe responds successfully but no item matches `seat_role='extra_kid'` AND no item matches `family_base`, `expected = sub.kid_seats_paid` (line 120) — meaning the cron passes the existing value through unchanged. That branch is safe. However, if a Stripe `family_base` price loses its `seat_role='family_base'` metadata for any reason (manual product edit, migration), `isFamilyBase` becomes `false` and again `expected = sub.kid_seats_paid` — also safe.
  - The real issue: if `family_base` is correctly tagged but `extra_kid` items were temporarily removed (admin deleted then re-added a price item between webhook and cron), `expected = Math.min(4, 1 + 0) = 1`, and the cron OVERWRITES `kid_seats_paid` from (e.g.) 4 to 1. The row is written immediately (L139-142) without confirming via a second read or comparing against any audit-log freshness threshold. A webhook event that arrives the next second to restore the items would race.
- Evidence:
  ```
  let extras = 0;
  let isFamilyBase = false;
  for (const item of remote.items.data) {
    const meta = item.price.metadata || {};
    const role = (meta.seat_role || '').toLowerCase();
    if (role === 'extra_kid') {
      extras += item.quantity ?? 0;
    } else if (role === 'family_base') {
      isFamilyBase = true;
    }
  }
  const expected = isFamilyBase ? Math.min(4, 1 + extras) : sub.kid_seats_paid;
  ...
  if (v.expected !== v.sub.kid_seats_paid) {
    drifted++;
    const { error: updErr } = await service
      .from('subscriptions')
      .update({ kid_seats_paid: v.expected, updated_at: new Date().toISOString() })
      .eq('id', v.sub.id);
    ...
  }
  ```
- Impact: Family-tier user could lose paid kid seats temporarily if Stripe's items list is mid-edit during the 04:45 UTC sweep. iOS app will downgrade their kids' access at next session refresh (kid_seats_paid drives the seat-cap check). Recovery requires a webhook event or another cron tick after Stripe stabilises.
- Suggested fix: add a freshness guard — if `subscriptions.updated_at` is < (e.g.) 60s old, skip this row (a webhook just touched it; the cron is the slow path). Or: only DECREMENT `kid_seats_paid` when `expected < current AND current > 1` — a downgrade should require admin confirmation since Stripe-side product config edits are rare and worth pausing on. PM-5 (Stripe/Apple) owns the billing surface; flagging here as the cron-mechanics owner.
- Verified by: file read.

### [P2] `slug-collide.ts` is dead code — has zero in-tree callers
- File: `web/src/lib/pipeline/slug-collide.ts:18` (`findFreeSlug` export)
- Issue: `grep -rn findFreeSlug web/src/` returns only the export line. The slug-collision logic the file's header advertises is actually implemented inside the `persist_generated_article` Postgres RPC (per `persist-article.ts:7-9`).
- Impact: Dead-code maintenance load. Shipping a query against `stories` table that nobody calls.
- Suggested fix: delete the file or repoint persist-article.ts to use it (decision: owner pick). `feedback_no_assumption_when_no_visibility` says verify before deleting — confirmed via grep.
- Verified by: `grep -rn findFreeSlug web/src/`.

### [P2] Three cron routes only export `GET`, the rest export both `GET` and `POST`
- File: `web/src/app/api/cron/cleanup-data-exports/route.ts:125`
- File: `web/src/app/api/cron/expire-mutes/route.ts:41`
- File: `web/src/app/api/cron/rate-limit-cleanup/route.ts:59`
- Issue: 19 of 22 cron routes export both `GET` and `POST`. These three only export `GET`. Consistency only — Vercel's scheduler uses GET for crons; manual operator triggers via curl typically use GET too. But ad-hoc POST-style backfills against these three would 405.
- Suggested fix: either standardise to GET-only across all cron routes, or add the missing `export const POST = withCronLog(...)` line. P2 polish.
- Verified by: file reads above.

### [P2] `cleanup-data-exports` heartbeat phase string is inconsistent with the rest of the cron set
- File: `web/src/app/api/cron/cleanup-data-exports/route.ts:121`
- File: `web/src/app/api/cron/rate-limit-cleanup/route.ts:55`
- Issue: Both use `logCronHeartbeat(CRON_NAME, 'ok', {...})`. Every other cron route uses `'end'` (success) / `'error'` (failure). The `cronHeartbeat.js` writer is permissive — it just stamps `event_type = cron:NAME:PHASE` — but the inconsistency makes querying webhook_log for "all successful runs" require a 2-value `IN ('end','ok')`.
- Suggested fix: standardise on `'end'`.
- Verified by: file reads, grep confirmed only these two use `'ok'`.

### [P3] `cluster.ts` has documented quirks preserved verbatim from snapshot
- File: `web/src/lib/pipeline/cluster.ts:25-33`
- Issue: Header self-describes 6 known quirks (STOP_WORDS duplicate, `.length` vs `Set.size` divisor, input-order-sensitive greedy, `|| ''` vs `??`, `null` outlets preserved, cluster-title = first article). None are bugs in the strict sense — they're locked-in snapshot parity.
- Impact: Algorithmic edge cases stay where they are; future tuning will need owner sign-off given the verbatim-fidelity rule.
- Suggested fix: none (this is a doc-only flag for the architect).
- Verified by: file read.

### [P3] Pricing cache (`call-model.ts`) is in-process; cold-start re-pays one DB round trip
- File: `web/src/lib/pipeline/call-model.ts:85-89, 121-147`
- Issue: `PRICING_CACHE` is a module-scope `Map`; on Vercel serverless each cold start re-fetches. Same goes for `KILL_SWITCH_TTL_MS` cache in `generate/route.ts:214-217` and the `caps` cache in `cost-tracker.ts:55-105`. With 60-second TTLs and Vercel's per-invocation isolation, a high-frequency burst hits the DB once per cold-start lambda.
- Impact: At current scale (no monetization, low pipeline traffic) this is fine. Worth noting if traffic ever spikes — neither finding rises to a P0/P1.
- Suggested fix: none until traffic warrants. Owner directive `feedback_sentry_deferred` supports the not-yet posture.
- Verified by: file reads.

---

## PM-6 — iOS-Adult

**Scope inventory:** 47 Swift files under `VerityPost/VerityPost/` (auth + main views + services + models + chrome). Read every file in full or against grep targets for force-unwraps, force-casts, missing weak self, scheme/URL plumbing, double-submit, realtime cleanup, keychain leaks, and a11y. Subagents folded into the inline pass: bug-hunter-runtime, bug-hunter-flow, bug-hunter-security, independent-reviewer.

**Headline:** This codebase is **substantially better hardened than typical Swift apps** — almost every async path uses `try?` + thrown-error guards, every singleton with state has a deinit/cancellation handler, the `drainRealtimeChannel` helper makes channel leaks structurally hard, and `Log.d` is `#if DEBUG`-only so no PII leaks via `print()` to release builds. The findings are: 1 dead-code URL-scheme typo (deep-link route silently inert), 1 fake-functional Manage Subscriptions UI (Add buttons no-op), 1 force-unwrap on a constructed URL, several inconsistent loading-state guards on submit buttons, a small handful of accessibility gaps, plus the usual launch-phase cross-platform parity drift.

**Total:** 0 P0 · 4 P1 · 7 P2 · 2 P3 · 1 [KILL-SWITCHED] · 3 parity flags for PM-10.

### [P1] Custom URL scheme `verityposts://story/<slug>` is dead — Info.plist registers `verity://` not `verityposts://`
- File: `VerityPost/VerityPost/VerityPostApp.swift:23` and `VerityPost/VerityPost/Info.plist:24-27`
- Issue: `ArticleRouter.slug(from:)` parses `scheme == "verityposts"` for the custom-scheme deep-link branch, but `Info.plist` only registers `verity` as the URL scheme. iOS will never deliver a `verityposts://` URL to the app, so the custom-scheme branch in `slug(from:)` is unreachable. Push payloads that reference `verityposts://story/<slug>` (the comment at line 16 calls this out as "reserved for push payloads") would arrive at the app and silently fail to route.
- Evidence — `VerityPostApp.swift:21-26`:
  ```
  // Custom scheme: verityposts://story/<slug> — host carries "story"
  // and the slug is the first path component.
  if scheme == "verityposts", host == "story" {
  ```
  vs `Info.plist:24-27`:
  ```
  <key>CFBundleURLSchemes</key>
  <array>
      <string>verity</string>
  </array>
  ```
- Impact: Push notifications that try to deep-link via `verityposts://` are dropped. Universal Links (`https://veritypost.com/story/<slug>`) still work via the second branch (line 28-34). Auth deep-links still work via `verity://login` and `verity://reset-password` (used in `AuthViewModel.swift:1170,1208,1312`).
- Suggested fix: Either rename the scheme literal in `ArticleRouter.slug` to `"verity"` and use a path prefix to disambiguate from auth deep-links (e.g., `verity://story/<slug>`), or add `verityposts` to `Info.plist`'s `CFBundleURLSchemes`. The latter is cleaner since `verity://login` is already overloaded for auth.
- Verified by: `grep -n "verityposts\|verity://" VerityPostApp.swift AuthViewModel.swift Info.plist` confirmed the mismatch on disk.

### [P1] AlertsView "Manage" tab renders Add Category / Subcategory / Keyword UI but every Add button silently no-ops
- File: `VerityPost/VerityPost/AlertsView.swift:340, 786-812`
- Issue: `manageSubscriptionsEnabled = true` (line 340) flips the Manage tab live. The picker UI renders. But `addCategorySubscription()`, `addSubcategorySubscription()`, and `addKeywordSubscription()` all discard their inputs (`_ = userId; _ = catName`) without making any API call.
- Evidence — `AlertsView.swift:786-812`:
  ```
  private func addCategorySubscription() async {
      guard let userId = auth.currentUser?.id, !selectedCategoryToAdd.isEmpty else { return }
      let catName = allCategories.first(where: { $0.id == selectedCategoryToAdd })?.name ?? selectedCategoryToAdd
      _ = userId; _ = catName
      selectedCategoryToAdd = ""
      await loadManageData()
  }
  ```
- Impact: Fake-functional UX. User taps "Add", picker resets to empty, list stays unchanged, no error. Classic dark-pattern footprint Apple Review flags as 4.0 / 4.3.
- Suggested fix: The comments above (lines 332-339, 759-766) explain the schema gap (`alert_preferences` has no `type/value/reference_id` columns yet). Two paths: (a) flip `manageSubscriptionsEnabled = false` until the `subscription_topics` table + API ships, which renders the existing `manageContentPlaceholder` instead — note `CLAUDE.md` Kill-Switch Inventory item #5 already says this *should* be `false`, so the flag has drifted from its documented state; (b) ship the `subscription_topics` API and wire each Add button to it. Path (a) is the launch-safe move per the kill-switch policy.
- Verified by: file read; cross-reference to CLAUDE.md kill-switch inventory.

### [P1] `RegistrationSheetView` force-unwraps a `URL(string:)` constructed from a concatenated Info.plist value
- File: `VerityPost/VerityPost/StoryDetailView.swift:3528`
- Issue: `Link("Sign up — free", destination: URL(string: "\(Bundle.main.infoDictionary?["APP_BASE_URL"] as? String ?? "https://veritypost.com")/login")!)`. Only force-unwrap on a constructed URL in the entire codebase. The fallback `https://veritypost.com/login` is RFC-clean, but the build-time `APP_BASE_URL` could be set with whitespace or an invalid character that fails URL parsing → crash on registration-sheet present.
- Evidence — `StoryDetailView.swift:3528`:
  ```
  Link("Sign up — free", destination: URL(string: "\(Bundle.main.infoDictionary?["APP_BASE_URL"] as? String ?? "https://veritypost.com")/login")!)
  ```
- Impact: Crash if a misconfigured xcconfig ships an invalid `APP_BASE_URL`. This is the registration wall presented to anon users tapping bookmark/quiz CTA → first-touch crash for new users.
- Suggested fix: Route through `SupabaseManager.shared.siteURL.appendingPathComponent("login")` exactly the way `SubscriptionView.swift:128,132` already does for Terms/Privacy. The note at `SubscriptionView.swift:124-126` explicitly chose this pattern "so we can't trip on a malformed string literal". Bring this last call site into line.
- Verified by: `grep -nE "URL\(string:.+\)!"` returned exactly this one hit; cross-reference to SubscriptionView pattern.

### [P1] `ContentView` allows the SignInGate sheet to remain dismissable while a deep-link / username-pick flow is mid-flight
- File: `VerityPost/VerityPost/ContentView.swift:165-173, 257-259`
- Issue: `ContentView` mounts `PickUsernameView` as `.interactiveDismissDisabled(true)` (good), but `MainTabView` separately mounts `LoginView` as `.sheet(isPresented: $showLogin)` without that modifier. When the session-expired banner's "Sign in" button fires `showLogin = true` (line 386), the user can pull-to-dismiss the LoginView during the auth flow, leaving them on a tab-bar view with no session. Subsequent taps on tabs that gate on `auth.currentUser` (Profile, Following) show the SignInGate, but article reads silently fail with no banner.
- Evidence — `ContentView.swift:257-259`:
  ```
  .sheet(isPresented: $showLogin) {
      LoginView().environmentObject(auth)
  }
  ```
- Impact: A user who half-signed-in (entered email, magic-link sent, swipes the sheet down) has nothing telling them the flow incompleted. Re-tapping a gated CTA re-opens the sheet without preserving their email entry — friction.
- Suggested fix: This is product-shape-dependent. Two options: (a) `.interactiveDismissDisabled(loading)` while a magic-link send is in flight (LoginView's `loading` state could be exposed via a binding), or (b) add an "About to leave?" confirmation when the user pulls down with a pending send. (a) is the smaller change.
- Verified by: file read; trace from session-expired banner Button to sheet binding.

### [P2] StoryDetailView quiz `submitQuiz` re-uses `DispatchQueue.main.asyncAfter` instead of structured `Task`, can fire after view dismissed
- File: `VerityPost/VerityPost/StoryDetailView.swift:2983-2985`
- Issue: After a quiz pass, `DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { withAnimation { showPassBurst = false } }` is unstructured — if the user navigates away during the 2s window, the burst-hide block still fires against detached view state. SwiftUI tolerates writes to `@State` after disappear, but the project's explicit pattern elsewhere (`scheduleSessionExpiredAutoDismiss` in AuthViewModel:194-206, `flashModerationToast` etc.) is to use `Task { … try? Task.sleep … }` so cancellation is structural.
- Evidence — `StoryDetailView.swift:2983-2985`:
  ```
  DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
      withAnimation { showPassBurst = false }
  }
  ```
- Impact: Minor — visual artifact, no crash. Inconsistent with the project's structured-concurrency pattern.
- Suggested fix: Replace with `Task { @MainActor in try? await Task.sleep(nanoseconds: 2_000_000_000); withAnimation { showPassBurst = false } }`, or use the existing `triggerQuizPassMoment` path which already does this correctly.
- Verified by: `grep -n DispatchQueue.main.asyncAfter` on disk: 2 hits (this one + `RecapView.swift:301` which has the same pattern after answer-tap auto-advance).

### [P2] `RecapView` quiz auto-advance uses `DispatchQueue.main.asyncAfter` and ignores question-state cancellation
- File: `VerityPost/VerityPost/RecapView.swift:301-307`
- Issue: After a recap-quiz option tap, `DispatchQueue.main.asyncAfter(deadline: .now() + 0.35)` advances or submits. No cancellation handle, so if the user double-taps two options in <350ms (which should be blocked by the `disabled(answered)` guard, but `answered` is a per-option computed Bool that only flips once `answers[questionIndex]` is set — there's a sub-frame window where two taps both pass the guard), the second tap can race onto the already-advancing question.
- Evidence — `RecapView.swift:301-307`:
  ```
  answers[questionIndex] = optionIndex
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
      if questionIndex < questions.count - 1 {
          current = questionIndex + 1
      } else {
          submit()
      }
  }
  ```
- Impact: Edge-case double-advance / double-submit on extremely fast double-taps. Server is the authoritative grader (line 458-486), so the worst case is a duplicate `/api/recap/<id>/submit` POST that the server should idempotency-handle.
- Suggested fix: Mirror the StoryDetailView pattern at line 1339-1349 — use a `quizAdvanceTask: Task<Void, Never>?` handle, cancel before scheduling, and check `Task.isCancelled` inside.
- Verified by: file read; cross-reference to StoryDetailView's `quizAdvanceTask` pattern.

### [P2] `StoreManager.purchase` doesn't disable the Subscribe button while a previous purchase is mid-flight
- File: `VerityPost/VerityPost/SubscriptionView.swift:277-315`
- Issue: The Subscribe button checks `store.isLoading` to decide whether to show the spinner, but `store.isLoading` is set inside `purchase()` (`StoreManager.swift:158`) and reset on `defer { isLoading = false }` (line 159). On a slow network, a user who taps Subscribe twice could see a brief window where the second tap fires before `isLoading` flips. StoreKit's `product.purchase()` is mostly idempotent against a single product, but the post-purchase `syncPurchaseToServer` could double-fire.
- Evidence — `SubscriptionView.swift:314`:
  ```
  .disabled(store.isLoading)
  ```
- Impact: Low — `Transaction.updates` is the canonical entitlement path; double-sync to server is a duplicate-receipt that the server should reject as already-recorded by `transaction_id` (the schema/transactionId UNIQUE applies). But the iOS-side comment at `StoreManager.swift:188-193` explicitly chose to NOT pre-insert into `purchasedProductIDs`, which is a conscious GAP-010 fix; that's good. The remaining issue is just the button race.
- Suggested fix: Add a per-button `isPurchasing` `@State` flag in SubscriptionView, set true on tap, `false` after the await in the `Task` block returns.
- Verified by: file read.

### [P2] HomeView.trackArticleView UserDefaults set is non-atomic across the seen-set and counter writes
- File: `VerityPost/VerityPost/HomeView.swift:636-643`
- Issue: Two sequential `UserDefaults.standard.set(...)` calls — one for the seen-IDs set, one for the count. App backgrounded between them = inconsistent on next launch (count says 4, set says 3 → one extra free article granted).
- Evidence — `HomeView.swift:636-643`:
  ```
  var seen = Set(UserDefaults.standard.stringArray(forKey: seenKey) ?? [])
  if seen.contains(articleId) { return }
  seen.insert(articleId)
  UserDefaults.standard.set(Array(seen), forKey: seenKey)
  let countKey = "vp_articles_viewed_\(scope)"
  let viewed = seen.count
  UserDefaults.standard.set(viewed, forKey: countKey)
  ```
- Impact: At most 1 extra free read per app-suspend race. Trivial.
- Suggested fix: Drop the redundant count key entirely — it's derivable from `seen.count` so the source of truth can be the array. Saves the synchronization gap.
- Verified by: file read.

### [P2] AuthViewModel.signup posts the username to `update_own_profile` while LoginView/SignupView only POST email — username field is dead code post S9-Q2-iOS rebuild
- File: `VerityPost/VerityPost/AuthViewModel.swift:549-706` (signup) vs `LoginView.swift` and `SignupView.swift`
- Issue: `signup(email:password:username:ageConfirmed:termsAccepted:)` validates username + retries `update_own_profile` 3× with backoff + handles a rollback path. None of this is reachable in the current build: SignupView is magic-link-only and never calls `signup()`; the picker flow (`PickUsernameView.save`) writes via `/api/auth/save-username`. The only callers of `auth.signup` would have been password-flow signup, which the comment at `SignupView.swift:7-13` says was rebuilt out.
- Evidence — `grep -n "auth\.signup\|.signup(" *.swift` returns zero callers; AuthViewModel.swift:549 is unreachable.
- Impact: Dead code. ~150 lines of complex retry logic + rollback that's never exercised. Risk: when a future change wires it back up and the contract has drifted vs what the server actually accepts.
- Suggested fix: Either delete `signup()` (and its `attemptSignupRollback` helper) or leave a `// LAUNCH-PHASE — preserved for future password signup, do not delete` comment at the top so the reviewer knows it's intentional. Per `feedback_launch_hides.md` the latter is the project's standard.
- Verified by: `grep` over all .swift files.

### [P2] PushPromptSheet "Asking…" label uses literal `\u{2026}` but the rest of the codebase uses `…` directly
- File: `VerityPost/VerityPost/PushPromptSheet.swift:55`
- Issue: `Text(isRequesting ? "Asking\u{2026}" : "Turn on notifications")` — works, but inconsistent with sibling files that use the literal ellipsis character. Minor; only flagging because grep caught it.
- Evidence — `PushPromptSheet.swift:55`: `Text(isRequesting ? "Asking\u{2026}" : "Turn on notifications")`
- Impact: None functionally. Style / consistency.
- Suggested fix: Use `…` directly.
- Verified by: file read.

### [P2] Several confirmationDialog labels reference dynamic usernames without sanitizing for control characters
- Files:
  - `StoryDetailView.swift:462` — `blockTargetUser.map { "Block @\($0.username ?? "user")?" }`
  - `MessagesView.swift:181, 213` — `Block @\(convo.otherUsername ?? "user")`
  - `PublicProfileView.swift:84-85` — `Unblock @\(profile?.username ?? username)?`
- Issue: Username is server-validated to ASCII a-z/0-9/underscore at signup (`AuthViewModel.swift:577-585`) and at the picker route, so the risk of injection is minimal. However, legacy users predating the validator could still carry non-ASCII usernames in the DB. iOS rendering is safe (`Text` interpolation escapes), but the dialog title length isn't bounded — a 200-char username would push the title off-screen on smaller devices.
- Evidence: see file/line citations above.
- Impact: Cosmetic; rare. No injection risk.
- Suggested fix: Pre-truncate `username` to 30 chars in dialog titles; or add `.lineLimit(2)` to the `Text` instances inside the dialog.
- Verified by: file reads.

### [P3] HomeView heroBlock + supportingCard expose `Story` to NavigationLink twice on the same tap surface
- File: `VerityPost/VerityPost/HomeView.swift:179-184` (supporting list) + `HomeView.swift:142-147` (breaking strip) + `HomeView.swift:279-333` (hero)
- Issue: Each NavigationLink uses `value: story` and the parent has `.navigationDestination(for: Story.self)`. Three sibling NavigationLinks on the same value-typed destination is fine, but the hero has `accessibilityElement(children: .combine)` only on the breaking strip (line 146-147), not on the hero or supporting cards. VoiceOver users hear the title twice (once for the eyebrow + headline + meta, once again as the link label) on hero + supporting.
- Evidence: see file citations.
- Impact: Minor a11y polish. Not blocking.
- Suggested fix: Add `.accessibilityElement(children: .combine)` and a single `accessibilityLabel(...)` on heroBlock + supportingCard like the breaking strip already does.
- Verified by: file read.

### [P3] BookmarksView pendingDelete optimistic-undo restores at clamped index but doesn't restore collection-pill filter
- File: `VerityPost/VerityPost/BookmarksView.swift:230-240`
- Issue: When the user undoes a remove, the row is re-inserted into `items` at the original index (clamped), but `activeCollection` could have been switched between Remove and Undo, in which case the row reappears in the underlying list but is filtered out of the visible view. User sees no Undo effect → re-taps Undo → still nothing.
- Evidence — `BookmarksView.swift:233-237`:
  ```
  if let pending = pendingDelete {
      let idx = pendingDeleteOriginalIndex ?? 0
      let safeIdx = min(max(0, idx), items.count)
      items.insert(pending, at: safeIdx)
  }
  ```
- Impact: Edge case (collection swap during 5-second undo window). Visible-list behavior diverges from underlying state.
- Suggested fix: When un-doing, also reset `activeCollection = "all"` (or to the collection the bookmark belongs to); short toast: "Restored to All".
- Verified by: file read.

### [KILL-SWITCHED] AlertsView `manageSubscriptionsEnabled` flag has drifted ON despite kill-switch documentation
- File: `VerityPost/VerityPost/AlertsView.swift:340`
- Issue: CLAUDE.md kill-switch inventory item #5 says: "iOS alerts — Manage subscriptions section · `manageSubscriptionsEnabled` · re-enable when wired". Current value on disk is `true` (line 340), and the live `manageContentLive` view renders. This is what enables the P1 finding above ("fake-functional Add buttons") — the flag was meant to render `manageContentPlaceholder` instead, which says "Subscription manager not available."
- Evidence — `AlertsView.swift:340`: `private let manageSubscriptionsEnabled = true`
- Impact: The kill-switch contract is broken. Either (a) the kill-switch inventory in CLAUDE.md is stale and Manage Subscriptions is intentionally back on (in which case the schema gap from line 332-339 is unresolved and the Add buttons need real wiring), or (b) the flag has drifted ON inadvertently and should be flipped back to `false`. Per the launch policy (`feedback_launch_hides.md`), the safe move is `false`.
- Suggested fix: Flip `= true` → `= false`. The placeholder copy at `manageContentPlaceholder` (lines 351-374) is already correctly worded for the kill-switched state.
- Verified by: file read; cross-reference to CLAUDE.md.

### Cross-platform parity drift (flagged for PM-10, NOT fixed here)

1. **Auth flow shape divergence — magic-link only on iOS, full password+OAuth on web**
   - iOS: `LoginView.swift:54-66` and `SignupView.swift:71-82` gate OAuth behind `VPOAuthEnabled = false` (`AuthViewModel.swift:48`). Default flow is email-only magic-link.
   - Web (per code comments at `AuthViewModel.swift:7-12, 22, 1232-1271`): magic-link is the canonical flow but password + OAuth are visible options on `/login` and `/signup`.
   - This is a **deliberate** flag (`OAUTH_ENABLED` per CLAUDE.md kill-switch #4), but `OAUTH_ENABLED = false` is web's flag; iOS has its own `VPOAuthEnabled = false` (line 48). When web flips `OAUTH_ENABLED = true`, iOS won't follow automatically. Flag for PM-10 to ensure they flip in lockstep.

2. **iOS ships a "Continue without signing in" affordance on the splash; web has no equivalent splash gate**
   - iOS: `ContentView.swift:91-99` (slow-network splash) and `ContentView.swift:130-134` (timed-out fallback) both expose "Continue without signing in".
   - Web: no equivalent — refresh recovers, no anon-fallback button.
   - This is intentional iOS-side recovery for offline cold launch, but the resulting anon UX surface (which features show, what's gated) needs to match web. Flag for PM-10 to verify.

3. **iOS subscription tier list excludes "verity_pro" entirely; web's pricing page shows it as a grandfather option**
   - iOS: `SubscriptionView.swift:61-63` only renders `free`, `verity`, `verity_family`. Pro is documented as grandfathered (StoreManager.swift:80-86) but legacy Pro subscribers see no "current plan" indicator on the iOS subscription screen — `currentPlan == "verity_pro"` won't match any of the three rendered cards, so the CURRENT badge never appears.
   - Web: pricing page at `web/src/app/pricing/page.tsx` (per the recent diff in repo gitStatus) handles `verity_pro` rendering.
   - Flag for PM-10 to confirm the grandfathered Pro UX matches across surfaces.

### Notes on what's NOT a finding (but I checked)

- **Force-unwrap audit**: `grep` over all 47 .swift files returned exactly 2 matches outside the one P1 listed above (`StoreManager.swift:502` `best!.1` — guarded by `if best == nil`; `SettingsView.swift:2669` `vacationUntil!` — guarded by `vacationUntil != nil`). No force-cast (`as!`) anywhere. No `try!` anywhere.
- **Token logging**: `grep -E "(accessToken|password|refresh_token).*\b(print|Log\.d|NSLog)"` returned zero hits. `Log.d` is `#if DEBUG`-only (Log.swift:8). EventsClient.swift uses raw `print()` but each call site is `#if DEBUG`-wrapped (lines 132, 273, 280, 322, 340).
- **Realtime channel cleanup**: `RealtimeHelpers.swift` provides `drainRealtimeChannel` with both loop-end and cancellation paths firing `Task.detached { await channel.unsubscribe() }`. Used consistently by MessagesView, BookmarksView, StoryDetailView, FollowingView. Two channels in StoryDetailView still hand-roll the pattern (`subscribeToNewComments` — but with the same correct cleanup shape).
- **Keychain**: `Keychain.swift` is unused (zero call sites — `grep -n "Keychain\." *.swift` returns 0 matches). It's dead code preserved per `feedback_launch_hides.md`. Not a security issue — the file's correct, just inert.
- **Push consent**: `PushPermission.shared` correctly defers to the OS authorization flow; `requestIfNeeded` only fires the system dialog when status is `.notDetermined` (line 77) and stamps `vp_push_prompted` so the pre-prompt UX picks the right copy. The `prePromptDeclinedKey` 7-day cooldown (line 31-32) prevents nag.
- **Session refresh**: `AuthViewModel.startAuthStateListener` distinguishes `userDeleted` (remote signout banner) from `signedOut` (local token-expired banner) at line 470-474. Token leak audit clean.
- **iOS timeline copy / "coming soon"**: The codebase consistently follows `feedback_no_user_facing_timelines` — comments at `AlertsView.swift:351-356` and `ExpertQueueView.swift:189-191` explicitly call out the rule. Verified zero "coming soon" strings via grep.
- **44pt tap targets**: `frame(minHeight: 44)` is applied to most submit buttons; the few small icon buttons that miss it (e.g., the `xmark` dismiss buttons inside the session-expired banner — ContentView.swift:399-407) have `frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())` correctly applied.

### Top 3 P0/P1 (highest-priority items for fix-pass)

1. **[P1] AlertsView Manage Subscriptions Add buttons silently no-op** — fake-functional UX. Either flip `manageSubscriptionsEnabled = false` (kill-switch contract) or wire the `subscription_topics` API. The kill-switch path is the launch-safe move.
2. **[P1] `verityposts://` deep-link scheme not registered in Info.plist** — push payloads referencing the custom scheme silently fail. Either register `verityposts` in Info.plist or rewrite the parser to use the registered `verity://story/<slug>` shape (with disambiguation against auth deep-links).
3. **[P1] `RegistrationSheetView` URL force-unwrap on Bundle-derived value** — first-touch crash risk for anon users hitting the registration wall. Route through `SupabaseManager.shared.siteURL.appendingPathComponent("login")` like SubscriptionView already does.



---

## PM-8 — DB-and-RLS

Live-schema MCP review of `public` schema (134 tables, 700+ functions, ~600 RLS policies). All findings verified against `pg_policy`, `pg_proc`, `pg_trigger`, `pg_class`, and ACL via `pg_get_function_identity_arguments`. Migration log not consulted (per owner memory `feedback_mcp_verify_actual_schema_not_migration_log.md`).

**Summary by severity**: P0 = 7, P1 = 8, P2 = 3, P3 = 0.

### [P0] Five `events_*` daily partition tables have RLS disabled — anon can read all analytics events
> CLOSED in Session 1 — migration `20260503000013_session1_articles_events_kids_waitlist_rls.sql` (PM-D). All 5 partitions backfilled with `ENABLE ROW LEVEL SECURITY`; `create_events_partition_for(date)` patched so new partitions inherit RLS at creation.
- File: live schema (created by `public.create_events_partition_for(date)` cron)
- Issue: `events_20260430`, `events_20260501`, `events_20260502`, `events_20260503`, `events_20260504` all have `relrowsecurity = false`. The parent `events` table has RLS enabled with 0 policies (locked-out). When PostgREST queries the parent it locks all anon access; but **direct queries against the daily partitions bypass RLS entirely** because RLS is per-table in Postgres. Older partitions (`events_20260421`..`events_20260429`) each have one RESTRICTIVE `block_kid_jwt` policy; the partition-creator function stopped applying ENABLE ROW LEVEL SECURITY to new partitions on or before 2026-04-30.
- Evidence: `mcp__supabase__list_tables` returned `rls_enabled:false` for those 5 tables; `pg_class.relrowsecurity` confirms; advisor `rls_disabled` lint flagged identically.
- Impact: Every product/ads/marketing/system event since 2026-04-30 (1,000+ rows including user_id, IP-derived columns, session_id, page) is readable by anyone holding the anon key. Service-role still works as a backdoor, but the anon-key surface is the leak.
- Suggested fix: Patch `public.create_events_partition_for` to `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `CREATE POLICY <p>_block_kid_jwt RESTRICTIVE` after each partition creation, then run a one-shot `ALTER TABLE` on the five existing leaky partitions and add a default-deny SELECT policy. The parent's no-policy lockout is the right base, but only if every partition inherits the same posture.
- Verified by: `mcp__supabase__list_tables`, `pg_policies` query for `events*`, `relrowsecurity` query, advisor output.

### [P0] `users_protect_columns` trigger has unauthenticated `app.auth_sync` GUC bypass — any authenticated user can self-grant `comped_until`, `email_verified`, `referral_code`, `cohort`, `verify_locked_at`
- File: `supabase/migrations/2026-04-28_auth_sync_guc_bypass.sql:38-51` (trigger function definition)
- Issue: The trigger short-circuits on `current_setting('app.auth_sync', true) = 'true'` with no role check. Postgres lets any session set arbitrary `app.*` GUCs at runtime (`SELECT set_config('app.auth_sync', 'true', true)`). A normal authenticated user calling `set_config` then `UPDATE public.users SET comped_until='2099-01-01' WHERE id = auth.uid()` will bypass the entire column-by-column read-only check. The complementary trigger `reject_privileged_user_updates` blocks `plan_id`, `plan_status`, `is_banned`, `verity_score`, `perms_version`, etc. — but it does **not** cover `comped_until`, `cohort`, `cohort_joined_at`, `verify_locked_at`, `referred_by`, `referral_code`, `invite_cap_override`, `email_verified`, `email_verified_at`, `phone_verified`, `phone_verified_at`, `expert_title`, `expert_organization`, or the username lock.
- Evidence (current `pg_proc`): `IF v_auth_sync = 'true' THEN RETURN NEW; END IF;` is the very first conditional; only afterward does it check service_role / `is_admin_or_above()`. `reject_privileged_user_updates` does not read `app.auth_sync` and protects a different (overlapping but smaller) column set.
- Impact: Free Verity tier (set `comped_until='2099-01-01'` → bypass paywall, gain comped permissions). Bypass email-verification gates used by `post_comment`/`ask_expert`. Self-clear `verify_locked_at` lockouts. Spoof expert credentials (`expert_title`, `expert_organization`). Rewrite `referral_code` and `referred_by` to claim referral rewards. Re-rename `username` after the lock (defeats `2026-05-01_lock_username_in_update_own_profile.sql` + `2026-05-01_protect_users_username.sql`). All exploitable via the standard `users_update` RLS policy `((id = auth.uid()) OR is_admin_or_above())` from any logged-in account.
- Suggested fix: Replace the GUC check with a role check that PostgREST cannot trick. The only legitimate caller of the bypass is the auth-sync trigger `handle_auth_user_updated` running as the postgres-owned SECURITY DEFINER, where `current_user` is `postgres`. So gate on `current_user IN ('postgres','supabase_admin','supabase_auth_admin')` instead of the GUC. If a runtime override is genuinely needed, switch to a server-only GUC name reserved by Supabase (e.g. one set in a SECURITY DEFINER caller and immediately reset) AND combine with a `current_user` check; never trust an `app.*` GUC alone.
- Verified by: `pg_get_functiondef('users_protect_columns')`, `pg_get_functiondef('reject_privileged_user_updates')`, `pg_policy` for `public.users`.
> CLOSED in Session 1 — migration `20260503000011_session1_drop_gucs_extend_users_protect.sql` (PM-B). GUC bypass replaced with `current_user='postgres' OR jwt role='service_role'` gate; `set_config('app.auth_sync',...)` removed from `handle_auth_user_updated`.

### [P0] `enforce_kid_dob_immutable` and `enforce_band_ratchet` have unauthenticated `app.dob_admin_override` GUC bypass — parents can rewrite kids' DOB and downgrade reading_band on their own children
- File: live `pg_proc` for both trigger functions (no migration file in the repo defines this protection — created in an earlier migration not listed)
- Issue: Both triggers begin with `IF current_setting('app.dob_admin_override', true) = 'true' THEN RETURN NEW; END IF;` and have no role check. The legitimate caller `admin_apply_dob_correction` is permission-gated and SETs the GUC inside its body, but a parent calling `set_config('app.dob_admin_override', 'true', true)` themselves can then `UPDATE kid_profiles SET date_of_birth = '...', reading_band='kids' WHERE id=<their kid> AND parent_user_id = auth.uid()` — the `kid_profiles_update` RLS only requires `parent_user_id = auth.uid() AND has_permission('profile.kids')`.
- Evidence: `pg_proc` body of `enforce_kid_dob_immutable` and `enforce_band_ratchet`, both quoted above. `pg_policies` for `kid_profiles_update`: `qual = ((parent_user_id = auth.uid()) AND has_permission('profile.kids'::text))`.
- Impact: COPPA-relevant — parents can falsify children's DOB to flip `reading_band` and unlock content gates outside the documented `kid_dob_correction_requests` flow. Bypasses the band-ratchet guarantee that bands are monotonic. Eliminates the audit trail (`kid_dob_history` rows are only inserted from `admin_apply_dob_correction`).
- Suggested fix: Same shape as the `app.auth_sync` fix — gate on `current_user` not the GUC. Inside `admin_apply_dob_correction` keep the `set_config` line for symmetry, but make the trigger's bypass condition `(current_user = 'postgres' OR session_user IN ...) AND current_setting('app.dob_admin_override', true) = 'true'`. Equivalent: replace the GUC entirely with a `pg_advisory_xact_lock` token only the SECURITY DEFINER RPC can acquire.
- Verified by: `pg_get_functiondef`, `pg_policy` query, function-body read above.
> CLOSED in Session 1 — migration `20260503000011_session1_drop_gucs_extend_users_protect.sql` (PM-B). Both triggers gated on `current_user='postgres' OR jwt role='service_role'`; `set_config('app.dob_admin_override',...)` removed from `admin_apply_dob_correction`, `system_apply_dob_correction`, and `graduate_kid_profile`.

### [P0] `articles_public_read_excludes_soft_deleted` policy leaks every non-soft-deleted article (drafts, generated, retracted) to anon
> CLOSED in Session 1 — migration `20260503000013_session1_articles_events_kids_waitlist_rls.sql` (PM-D). Permissive policy dropped; published-only policy (`public_can_read_published`) + `articles_select` + restrictive `articles_block_kid_jwt` retained.
- File: live `pg_policies` (policy created by an earlier migration; not the file `2026-04-29_slice02_scheduled_rip_articles_rls.sql` which only added `public_can_read_published`)
- Issue: There are EIGHT policies on `public.articles`. Two PERMISSIVE SELECT policies grant overlapping SELECT to `{anon, authenticated}`:
  1. `public_can_read_published` — `qual = ((status)::text = 'published'::text)` (intent: only published)
  2. `articles_public_read_excludes_soft_deleted` — `qual = ((deleted_at IS NULL) OR is_admin_or_above())` (intent: hide soft-deletes only)
  Postgres OR-combines permissive policies for the same role, so the **union** is what the user gets: anon can SELECT every article whose `deleted_at` is NULL, regardless of `status`. That includes `draft`, `generated`, `pending_review`, etc.
- Evidence: `pg_policies` row for both policies, both `permissive=PERMISSIVE`, both for roles `{anon,authenticated}`. The columns leaked include `body`, `body_html`, `moderation_notes`, `nsfw_score`, `plagiarism_status`, `needs_manual_review` and other moderator-only fields.
- Impact: Pre-publication content leak. Internal moderation state visible to the public. Newsroom drafts and AI-generation work-in-progress queryable by any anon-key holder.
- Suggested fix: DROP `articles_public_read_excludes_soft_deleted`. Replace its purpose (admin sees soft-deleted) by extending the existing `articles_select` policy (already authored on `{public}` with status+author+editor branches) to add `OR is_admin_or_above()`. Then the policies reduce to one anon SELECT (`public_can_read_published`) plus one role-aware SELECT (`articles_select`).
- Verified by: `pg_policies` for `public.articles`; column inventory via `information_schema.columns`.

### [P0] Mass impersonation surface — 30+ SECURITY DEFINER RPCs accept `p_user_id` (or `p_admin_id`/`p_editor_id`) without checking it equals `auth.uid()` AND are EXECUTE-granted to `PUBLIC` (anon + authenticated)
> CLOSED in Session 1 — migration `20260503000010_session1_revoke_public_execute_security_definer.sql` (PM-A). 55 functions REVOKE'd from anon/authenticated/PUBLIC + ALTER DEFAULT PRIVILEGES deny-by-default for future SECURITY DEFINER functions in `public`. Class B (`lockdown_self`) + Class C (3 read helpers) regranted to `authenticated`. Class C parameter-drop rewrite queued as Session 6 follow-up.
- File: live `pg_proc` ACLs; selected by Supabase advisor `anon_security_definer_function_executable` (127 functions) + `authenticated_security_definer_function_executable` (150 functions)
- Issue: The Verity Post pattern is to take the actor as a parameter (`p_user_id`) so route handlers running with service-role can pass the verified user. But the same RPCs are also callable by `anon`/`authenticated` (ACL contains `=X/postgres`, the PUBLIC entry), and the RPC body doesn't constrain `p_user_id = auth.uid()` or check a role. A logged-in user POSTing to `/rest/v1/rpc/<fn>` directly with the anon key can pass any other user's UUID as `p_user_id`. Confirmed dangerous functions where the ACL contains `=X/postgres` (PUBLIC EXECUTE):
  - **`post_comment(p_user_id, p_article_id, p_body, p_parent_id, p_mentions)`** — comment under any user; their `comment_count` increments; reply/mention notifications fire as them.
  - **`edit_comment(p_user_id, p_comment_id, p_body)`** — rewrite any user's comment.
  - **`soft_delete_comment(p_user_id, p_comment_id)`** — delete any user's comment.
  - **`toggle_vote(p_user_id, p_comment_id, p_vote_type)`** — vote on behalf of others; ballot stuffing.
  - **`toggle_context_tag(p_user_id, p_comment_id)`** (2-arg overload — the 3-arg overload is locked down).
  - **`post_message(p_user_id, p_conversation_id, p_body)`** — DM impersonation.
  - **`start_conversation(p_user_id, p_other_user_id)`** — only admin/service grant; OK.
  - **`award_points(p_action, p_user_id, p_kid_profile_id, …)`** — award points to anyone, gameable verity score / leaderboard / streak. PUBLIC EXECUTE confirmed.
  - **`award_reading_points(p_article_id)`** — uses `auth.uid()`; OK.
  - **`recompute_verity_score(p_user_id, p_kid_profile_id)`** — trigger arbitrary score recompute, can mask cheating.
  - **`clear_failed_login(p_user_id)`** — defeats brute-force lockout on any account, including admins.
  - **`create_notification(p_user_id, p_type, p_title, p_body, p_action_url, …)`** — spam any user's notification feed; can fake "Your account has been suspended" type messages.
  - **`start_quiz_attempt(p_user_id, p_article_id, p_kid_profile_id)`** + **`submit_quiz_attempt`** — fake quiz completions on anyone, unlocking comment/Ask-Expert gates as them.
  - **`submit_recap_attempt(p_user_id, …)`**.
  - **`submit_appeal(p_user_id, p_warning_id, p_text)`** — submit appeals as other users.
  - **`submit_expert_application(p_user_id, …)`** — apply as anyone with arbitrary credentials.
  - **`lockdown_self(p_user_id)`** — lock any user out of their account.
  - **`convert_kid_trial(p_user_id)`** — flip another user's kid trial to active.
  - **`start_kid_trial(p_user_id, p_display_name, p_avatar_color, p_pin_hash, p_date_of_birth)`** — create kid_profiles under another user.
  - **`billing_cancel_subscription(p_user_id, p_reason)`** — cancel another user's subscription. PUBLIC EXECUTE confirmed (`=X/postgres`).
  - **`billing_change_plan(p_user_id, p_new_plan_id)`** — switch any user to any plan.
  - **`billing_resubscribe`**, **`billing_freeze_profile`**, **`billing_unfreeze`**, **`billing_uncancel_subscription`** — same shape.
  - **`admin_restore_article(p_article_id, p_admin_id)`** + **`admin_soft_delete_article(p_article_id, p_admin_id, p_reason)`** — both call `has_permission('admin.articles.delete', p_admin_id)` checking the *passed* admin_id, not the caller. Anon can pass `p_admin_id = <real admin UUID>` to soft-delete or restore any article. ACL `=X/postgres` confirmed.
  - **`admin_apply_dob_correction(p_request_id, p_decision, p_decision_reason)`** — does check `compute_effective_perms(auth.uid())`, but ACL grants `authenticated=X/postgres` not service-role-only. The `auth.uid()` check is real; this one is genuinely safe. ✅
  - **`approve_expert_answer(p_editor_id, p_comment_id)`** — checks role on the *passed* editor_id; ACL is service-role only (`=X/postgres` is **absent**). Safe. ✅
- Evidence: `array_to_string(proacl, ', ')` per function; the absence of `authenticated=` and presence of `=X/postgres` indicates PUBLIC EXECUTE. Function bodies inspected for missing `auth.uid()`/role guards.
- Impact: Catastrophic privilege escalation across billing, content, moderation, scoring, account state, and COPPA flows. Any anon key holder (the public NEXT_PUBLIC_SUPABASE_ANON_KEY) can directly call these RPCs against the production REST API. The route handlers' server-side `requireAuth` is bypassed because PostgREST exposes RPCs at `/rest/v1/rpc/<fn>`.
- Suggested fix: For every "self-acting" RPC in this list, add `IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin_or_above() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;` as the first check after `is_kid_delegated()` guards. For "actor-on-other" RPCs (`grant_role`, `admin_*`, `approve_*`), check `p_admin_id = auth.uid()` AND the role gate. Independently, audit every RPC currently granted to PUBLIC and `REVOKE EXECUTE … FROM PUBLIC` for ones that should only run from a server-side service-role caller (e.g. `post_comment` should be service-role-only since the route handler `web/src/app/api/comments/route.ts` calls it via service-role; same for `billing_*`).
- Verified by: `pg_proc.proacl` per function, function body reads above, advisors `anon_security_definer_function_executable` (127 hits) + `authenticated_security_definer_function_executable` (150 hits).

### [P0] `grant_role(p_admin_id, p_user_id, p_role_name)` and `revoke_role(p_admin_id, ...)` trust the passed admin_id — service_role/admin-only ACL is the only thing stopping privilege escalation
- File: live `pg_proc`
- Issue: Both functions take `p_admin_id` as the first parameter. The advisor reports they are exposed via `/rest/v1/rpc/...` to authenticated. Their ACL is `postgres=X/postgres, service_role=X/postgres, supabase_auth_admin=X/postgres` — no PUBLIC entry, so anon and authenticated **cannot** call them. ✅ This is one place where the ACL is correctly tight.
- Evidence: `array_to_string(proacl, ', ')` — no `=X/postgres` PUBLIC entry.
- Impact: Currently safe because ACL revokes EXECUTE from anon/authenticated. Defence-in-depth gap: the functions still accept `p_admin_id` as a parameter rather than using `auth.uid()`. If a future migration accidentally re-grants EXECUTE to PUBLIC (Supabase's default behavior on `CREATE OR REPLACE FUNCTION` re-creates default ACL), this becomes an instant role-grant escalation.
- Suggested fix: Re-author `grant_role`/`revoke_role` to drop the `p_admin_id` parameter and use `auth.uid()` for the actor; explicitly check `is_admin_or_above()`. Add a `REVOKE EXECUTE ... FROM PUBLIC` line after the `CREATE OR REPLACE` so future re-creates can't accidentally widen the ACL.
- Verified by: `pg_proc.proacl`, function body inspection.

### [P0] `kids_waitlist` allows arbitrary anon writes — comment says service-role-only but policy is `WITH CHECK (true)`
> CLOSED in Session 1 — migration `20260503000013_session1_articles_events_kids_waitlist_rls.sql` (PM-D). `kids_waitlist_insert_anon` policy dropped. `web/src/app/api/kids-waitlist/route.ts:106` uses `createServiceClient()` and bypasses RLS — legitimate write path preserved.
- File: live `pg_policies`; table comment from `mcp__supabase__list_tables` — "Service-role-only writes via POST /api/kids-waitlist."
- Issue: Three policies on `kids_waitlist`: `kids_waitlist_insert_anon` (PERMISSIVE, role public, `with_check = 'true'`), `kids_waitlist_modify` (admin-or-above, ALL), `kids_waitlist_select` (admin-or-above SELECT). The INSERT policy lets any anon push rows directly via the anon key.
- Evidence: `pg_policies` row above. Advisor `rls_policy_always_true` flagged identically. The intent stated in the table comment is "service-role-only writes."
- Impact: Anon can flood the waitlist with arbitrary email addresses (CAN-SPAM exposure if those emails get an unsubscribe-required notification later), bypassing the `/api/kids-waitlist` route's rate limits and IP captchas. Email-validation logic in the route handler is sidestepped. Potential to fill the table with malformed rows that break downstream send jobs.
- Suggested fix: `DROP POLICY kids_waitlist_insert_anon ON public.kids_waitlist; CREATE POLICY kids_waitlist_insert_service ON public.kids_waitlist FOR INSERT TO service_role WITH CHECK (true);`. Or REVOKE INSERT on the table from anon, since RLS only restricts what's already grantable.
- Verified by: `pg_policies` for kids_waitlist; advisor lint; table comment.

### [P1] `permission_key_aliases` has RLS disabled — its 9 rows are exposed to anon
- File: live `pg_class`
- Issue: `permission_key_aliases` has `relrowsecurity = false`, no policies. Table contains the alias map between legacy permission keys and current ones. 9 rows currently. Although the data is not user-PII, it leaks the internal permission taxonomy and gives an attacker a hint about what permissions exist (useful for the owner-mode attack surface).
- Evidence: `mcp__supabase__list_tables` shows `rls_enabled:false`; advisor `rls_disabled` lint.
- Impact: Disclosure of internal naming. Defence-in-depth gap. Not directly exploitable but helps reconnaissance against the permission system that's currently the only thing protecting `admin.owner_mode`.
- Suggested fix: `ALTER TABLE public.permission_key_aliases ENABLE ROW LEVEL SECURITY; CREATE POLICY permission_key_aliases_select ON public.permission_key_aliases FOR SELECT TO authenticated USING (is_admin_or_above());`
- Verified by: `pg_class.relrowsecurity`; advisor.

### [P1] `permissions_select` policy is `qual = true` for the public role — anon can enumerate every permission key in the catalog
- File: live `pg_policies`
- Issue: `permissions_select` is PERMISSIVE for `{public}` (which includes anon) with `using_clause = 'true'`. The catalog includes the freshly-renamed `admin.owner_mode` row plus every other privileged permission key.
- Evidence: `pg_policies` row above.
- Impact: Reconnaissance + the `admin.owner_mode` key name is now world-readable. Combined with the stale legacy `admin.god_mode` references that may exist in older code, an attacker has a list of every gate to attack. Not a direct compromise.
- Suggested fix: Restrict to `authenticated` role and constrain on `is_active = true` (matches the `permission_sets_select` shape). If unauthenticated reads are genuinely needed for a public capability list, project a view that excludes admin-prefixed keys.
- Verified by: `pg_policies`; catalog row read.

### [P1] Two SECURITY DEFINER views (`public_profiles_v`, `v_cluster_lifecycle`) bypass RLS of querying user
- File: live database (advisor: `security_definer_view`, level=ERROR)
- Issue: Both views were created as SECURITY DEFINER. PostgreSQL evaluates SECURITY DEFINER views with the view-creator's permissions, not the querying user's, which silently bypasses RLS on the underlying tables.
- Evidence: Advisor lints (`public.public_profiles_v`, `public.v_cluster_lifecycle`).
- Impact: `public_profiles_v` likely projects `users` columns for public consumption; if it accidentally exposes internal-only columns (cohort, cohort_joined_at, comped_until, perms_version, …), those leak to anon irrespective of the `users` table RLS. `v_cluster_lifecycle` similar concern for clusters.
- Suggested fix: Recreate both as `SECURITY INVOKER` views (the Postgres default) OR add an explicit projection that excludes sensitive columns and document the bypass. Re-run `get_advisors security` until the lints clear.
- Verified by: Supabase advisor.

### [P1] 6 INSERT policies have `WITH CHECK = true` and grant to PUBLIC — three of them shouldn't be writable by anon at all
- File: live `pg_policies`
- Issue: Advisor `rls_policy_always_true` flagged six. Status check:
  - `kids_waitlist_insert_anon` — see P0 finding above (should be service-role-only).
  - `analytics_events_insert` — likely intentional (any client can post events). Confirm route validates schema first; otherwise rate-limit at gateway.
  - `ad_impressions_insert` — likely intentional (ad metrics from client).
  - `rate_limit_events_insert` — service-role pattern; either grant should be tightened or this is fine if the table is partitioned by ip_hash that the trigger refuses to trust.
  - `access_requests_insert` — beta access-request signup; intentional but very low validation.
  - `user_sessions_insert` — should NOT be anon-writable; sessions are server-issued.
- Evidence: `pg_policies` rows above; advisor list.
- Impact: For `user_sessions_insert` specifically, anon can forge session rows to impersonate at the analytics/observability layer (if anything reads `user_sessions` to attribute activity). For `analytics_events_insert` and `ad_impressions_insert`, attackers can pollute reporting.
- Suggested fix: Restrict `user_sessions_insert` to `service_role`. Add column-level constraints (`with_check = (user_id = auth.uid())`) to `analytics_events_insert` and `ad_impressions_insert` so anon can't attribute events to other users.
- Verified by: `pg_policies`, advisor.

### [P1] `add_kid_idempotency` has RLS enabled with 0 policies — locked-out by design but defense-in-depth missing
- File: live `pg_policies` (no rows for this table)
- Issue: RLS-enabled-no-policy is the right "default deny" posture for service-role-only tables, but it's silent — there's no positive expression of intent. A future contributor could add a permissive policy without realizing the table was deliberately locked.
- Evidence: Advisor `rls_enabled_no_policy` lint; `policy_count = 0` query.
- Impact: Maintainability. No active leak.
- Suggested fix: Add an explicit comment-as-policy: `CREATE POLICY add_kid_idempotency_service ON public.add_kid_idempotency FOR ALL TO service_role USING (true) WITH CHECK (true);` and a SQL comment documenting the intent.
- Verified by: `pg_policies`, advisor.

### [P1] 9 SECURITY DEFINER functions have a mutable `search_path` — function-hijack vector via untrusted schema search
- File: live `pg_proc.proconfig`
- Issue: Advisor `function_search_path_mutable` flagged 9 functions (`reconcile_verity_scores`, `tg_set_updated_at`, `touch_audience_state_updated_at`, `parse_timeline_event_date`, `current_kid_profile_id`, `compute_band_from_dob`, `enforce_kid_dob_immutable`, `enforce_band_ratchet`, `_user_is_moderator`). When a SECURITY DEFINER function has no `SET search_path` (or sets it inside the body), an attacker can create same-named objects in a different schema and the function will resolve to those instead.
- Evidence: Advisor lint output.
- Impact: Object-shadowing privilege escalation. Specifically `enforce_kid_dob_immutable` and `enforce_band_ratchet` are kid-safety triggers — exploitable if combined with table-create privilege (currently only postgres has it, so latent risk).
- Suggested fix: Add `SET search_path = public, pg_temp` to each function definition's header (matches the pattern already used in `_user_is_moderator` is wrong — advisor still flags it; recheck).
- Verified by: Supabase advisor.

### [P1] `pg_trgm` extension installed in `public` schema (Supabase recommends `extensions`)
- File: live `pg_extension`
- Issue: Advisor `extension_in_public` lints `pg_trgm`. Standard Supabase guidance: install user-facing extensions in a dedicated schema (`extensions`) so PostgREST doesn't expose them as RPC.
- Evidence: Advisor.
- Impact: Latent — exposes `similarity()`/`%`/`<%>` operators in PostgREST namespace; minor attack surface.
- Suggested fix: `CREATE SCHEMA IF NOT EXISTS extensions; ALTER EXTENSION pg_trgm SET SCHEMA extensions;` and update any callers that referenced `public.similarity`.
- Verified by: Advisor.

### [P1] Auth leaked-password protection (HaveIBeenPwned) is disabled in Supabase Auth settings
- File: Supabase project settings (advisor).
- Issue: `auth_leaked_password_protection` advisor.
- Impact: Users can register with passwords known to be in breach corpora.
- Suggested fix: Enable in Supabase dashboard → Auth → Password Protection.
- Verified by: Advisor.

### [P2] `2026-04-29_grant_stories_select_to_anon_authenticated.sql` granted column-wide SELECT — manual column audit recommended
- File: `supabase/migrations/2026-04-29_grant_stories_select_to_anon_authenticated.sql`
- Issue: The migration grants SELECT on the entire `public.stories` table to anon and authenticated. The `stories_admin_or_published` policy correctly filters to `(is_admin_or_above() OR (published_at IS NOT NULL))`, so anon can only read published rows — that's fine. But the grant is column-wide; future columns added to `stories` (e.g. an internal moderator note) would inherit anon-readability and rely on policy filtering alone. No active leak today.
- Evidence: `\d stories` and `pg_policies` row for `stories_admin_or_published`.
- Impact: Maintainability; latent leak surface for future columns.
- Suggested fix: Reduce to the explicit columns the public profile/article embed needs: `GRANT SELECT (id, slug, title, dek, hero_image_url, published_at, …) ON public.stories TO anon, authenticated;` and revoke the table-wide grant. List the public projection in a SQL comment so future migrations know.
- Verified by: Migration file read, `pg_policies`.

### [P2] `is_admin_or_above` calls `user_has_role('admin')` which fails-open on hierarchy_level NULL
- File: live `pg_proc` for `user_has_role`
- Issue: `user_has_role` joins on `r.hierarchy_level >= req.hierarchy_level`. If a role row has NULL `hierarchy_level`, the comparison is NULL → not true → user-not-admin (correct fails-closed). But if `req.hierarchy_level` (admin) is NULL, no one passes — meaning a misconfigured `roles` table fails closed for everyone. That's actually safe; but the inverse: if `hierarchy_level` defaults to something weird, alignment may shift. Quick `roles` data check recommended.
- Evidence: Function body above.
- Impact: Operational; not a leak. Worth testing: `SELECT name, hierarchy_level FROM roles ORDER BY hierarchy_level NULLS FIRST;`
- Suggested fix: Add `NOT NULL` to `roles.hierarchy_level` or a `CHECK (hierarchy_level >= 0)` constraint.
- Verified by: `user_has_role` body.

### [P2] `_user_is_moderator` uses `IS NULL OR ur.expires_at > now()` style that's missing here — could grant moderator role via expired user_roles row
- File: `_user_is_moderator(p_user_id uuid)` body
- Issue: Body reads `WHERE ur.user_id = p_user_id AND r.name IN ('moderator','editor','admin','owner')`. Does NOT filter `(ur.expires_at IS NULL OR ur.expires_at > now())`. Other helpers (`my_permission_keys`, `compute_effective_perms`) DO filter on expires_at. So an expired moderator role still satisfies `_user_is_moderator(p_user_id)`.
- Evidence: Body above; compare to `my_permission_keys` body that includes the filter.
- Impact: Where `_user_is_moderator` is referenced (search for callers) it could grant access to a former-moderator after their grant expired.
- Suggested fix: Add `AND (ur.expires_at IS NULL OR ur.expires_at > now())` to the WHERE clause.
- Verified by: `pg_get_functiondef('_user_is_moderator')`.

### Tables without RLS (full inventory)
Per `mcp__supabase__list_tables`, these 6 public tables have `rls_enabled = false`. All except `permission_key_aliases` are `events_*` partitions covered by the P0 above:
1. `public.events_20260430` — P0 above.
2. `public.events_20260501` — P0 above.
3. `public.events_20260502` — P0 above.
4. `public.events_20260503` — P0 above.
5. `public.events_20260504` — P0 above.
6. `public.permission_key_aliases` — P1 above.

Plus `public.add_kid_idempotency` has RLS enabled but 0 policies (P1, defence-in-depth).

### SECURITY DEFINER functions missing internal caller-identity / role checks
Verified via heuristic `pg_get_functiondef` scan + body reads above. Functions that take `p_user_id`/`p_admin_id`/`p_editor_id` etc. but neither use `auth.uid()` for verification nor call a role helper, AND have PUBLIC EXECUTE (`=X/postgres` in proacl):

**Critical (P0 — covered by mass-impersonation finding):**
`post_comment`, `edit_comment`, `soft_delete_comment`, `toggle_vote`, `toggle_context_tag(p_user_id, p_comment_id)` (2-arg), `post_message`, `award_points`, `recompute_verity_score`, `clear_failed_login`, `create_notification`, `start_quiz_attempt`, `submit_quiz_attempt`, `submit_recap_attempt`, `submit_appeal`, `submit_expert_application`, `lockdown_self`, `convert_kid_trial`, `start_kid_trial`, `billing_cancel_subscription`, `billing_change_plan`, `billing_resubscribe`, `billing_freeze_profile`, `billing_unfreeze`, `billing_uncancel_subscription`, `admin_restore_article`, `admin_soft_delete_article`, `delete_bookmark_collection`, `rename_bookmark_collection`, `create_bookmark_collection`, `decline_queue_item`, `claim_queue_item`, `score_on_comment_post`, `score_on_quiz_submit`, `score_on_reading_complete`, `freeze_kid_trial`, `record_failed_login`, `start_quiz_attempt`, `supervisor_opt_in`, `supervisor_opt_out`, `supervisor_flag_comment`, `post_back_channel_message`, `post_expert_answer`, `serve_ad`, `log_ad_impression`, `weekly_reading_report`, `export_user_data`, `cancel_account_deletion` (ACL is service-role-only), `schedule_account_deletion` (ACL service-role-only), `start_conversation` (ACL service-role-only — these last three are safe because of ACL, not body).

**Properly gated (verified safe):**
- `update_own_profile()` — uses `auth.uid()` directly; rejects kid-delegated; checks username lock. ✅
- `update_metadata` — uses `auth.uid()` and has role check. ✅
- `award_reading_points(p_article_id)` — uses `auth.uid()` directly. ✅
- `clear_kid_lockout` — uses `auth.uid()` for parent + bcrypt(parent_pin). ✅
- `mint_referral_codes` — uses auth.uid() + role check. ✅
- `bump_user_perms_version` — explicit `service_role` OR `is_admin_or_above()` check. ✅
- `complete_email_verification` — has role check. ✅
- `apply_signup_cohort` — has role check. ✅
- `preview_capabilities_as` — has role check. ✅
- `use_streak_freeze` — uses auth.uid() + role check. ✅
- `admin_apply_dob_correction` — checks `compute_effective_perms(auth.uid()) WHERE permission_key='admin.kids.dob_corrections.review'`. ✅
- `admin_force_bookmark` — service-role-only ACL (REVOKEd from anon/authenticated). ✅
- `approve_expert_answer`, `approve_expert_application`, `reject_expert_application`, `mark_probation_complete`, `grant_role`, `revoke_role` — service-role-only ACL; impersonation pattern exists in body but unreachable via PostgREST. ✅ (still recommend removing `p_admin_id` parameter for defense-in-depth.)

### God-mode / Owner-mode review (`2026-05-01_admin_god_mode_*` + `2026-05-02_admin_owner_mode_rename.sql`)
1. **Migrations applied as advertised**. `permissions` row renamed `admin.god_mode` → `admin.owner_mode`; `permission_sets` row renamed `god_mode` → `owner_mode`; `my_permission_keys` and `compute_effective_perms` rebuilt with the new key string. Verified via `pg_proc.pg_get_functiondef` for both functions.
2. **Owner Mode short-circuit is correctly scoped by kid-session**. `my_permission_keys` returns the catalog superset only when `(SELECT active_kid FROM me) IS NULL` AND the user holds `admin.owner_mode` via `user_permission_sets` OR via `role_permission_sets` joined through `user_roles`. So a parent with owner_mode who delegates to a kid jwt does NOT pass owner_mode into the kid session. ✅
3. **`compute_effective_perms` correctly forces `granted=true` for owner under all gates** (banned, verify_locked, requires_verified, override) — these are intentionally bypassed per the migration comment. ✅ Owner cannot accidentally lock themselves out.
4. **Detection is non-recursive** in `compute_effective_perms` (walks grants directly rather than calling `my_permission_keys`). No infinite recursion risk. ✅
5. **`SET LOCAL app.allow_system_perm_edits = 'true'`** in the rename migration is transaction-scoped and released on COMMIT. The `guard_system_permissions` trigger reads the GUC; same exploitable shape as `app.auth_sync` *if* a non-admin could write to `permissions`/`permission_sets`, but the RLS policies on those tables (`permissions_insert WITH CHECK is_admin_or_above()`, `permission_sets_write USING is_admin_or_above()`) block non-admins from reaching the trigger at all. Defence-in-depth: still tighten the GUC to require `current_user='postgres'` for parity with the recommended `users_protect_columns` fix.
6. **Owner-grants are auto-recreated for `owner` role** (`role_permission_sets` insert at the bottom of `2026-05-01_admin_god_mode_owner_auto.sql`). Verified the `owner` role currently has `owner_mode` set granted (`role_permission_sets` row exists).
7. **No backdoors**: I searched `pg_proc` for `'admin@veritypost.com'` literal — found one match in `post_comment` (`IF v_user.email NOT IN ('admin@veritypost.com')` quiz bypass — see P3 below). No other email-allowlist backdoors.

### [P3] `post_comment` has a hard-coded email allowlist for the quiz gate (`admin@veritypost.com`)
- File: `pg_proc.post_comment`, body around line `IF v_user.email NOT IN ('admin@veritypost.com')`
- Issue: A literal email allowlist replaces the proper `is_admin_or_above()` / `has_permission('admin.owner_mode')` check. If the owner email ever changes (or if owner-mode is granted to a second account), they will hit the quiz gate. Inconsistent with the post-rename policy that owner_mode is the sole identification path.
- Evidence: Function body above.
- Impact: Functional (owner mode bypass not honored on comment quiz gate); no security exposure.
- Suggested fix: Replace the email check with `IF NOT EXISTS (SELECT 1 FROM unnest((SELECT array_agg(permission_key::text) FROM my_permission_keys())) k WHERE k = 'admin.owner_mode')` or call a helper `is_owner_mode_active()` for parity with the rest of the codebase.
- Verified by: `pg_get_functiondef('post_comment')`.

### Auth-sync GUC bypass — adversary's note
The `2026-04-28_auth_sync_guc_bypass.sql` migration was the trigger for the P0 above. The actual fix is structural: `users_protect_columns` should not key its bypass off an unprivileged GUC. The legitimate caller (the auth-sync trigger) runs as the postgres-owned SECURITY DEFINER trigger function, so `current_user = 'postgres'` is reliable inside it. The migration's claim that `is_local := true` "scopes it to the current transaction so it can't leak across requests" is correct but misses the point — leakage isn't the concern; it's that the **same** transaction is the attack surface. Any single PostgREST request can SET the GUC and then UPDATE in one round-trip.

### `database.ts` ↔ live schema drift
Cursory check only (12,825 lines, 134 tables in DB vs auto-generated types). Spot-checks confirm the recently-added tables (`top_stories`, `comment_agree_disagree`, `kid_dob_correction_requests`, `kid_dob_history`, `graduation_tokens`, `add_kid_idempotency`, `consent_versions`, `subscription_topics`, `pipeline_cost_reservations`, `feed_cluster_locks`, `feed_cluster_audience_state`, `moderation_actions`, `stories`) all appear in the types file. No P0 drift detected. Owner memory `feedback_verify_fk_hints_against_schema.md` confirms FK hint convention is `<table>_<column>_fkey` (per `database.ts` examples) — verified consistent. A full mechanical drift run via `mcp__supabase__generate_typescript_types` and diff vs disk should be performed, but is out-of-scope for an RLS review.

### Out-of-scope notes
- API route handlers (PM-3/4/5): all the impersonation P0s above assume the route handler validates `auth.uid()` server-side and passes it to the RPC. That's the documented pattern but the RPC layer should defend regardless of caller. The PM-3/4/5 reports should cross-reference to confirm no route accidentally lets the client supply `user_id`.
- Stripe/Apple webhook signature verification: handled at the API layer, not RLS-relevant.


---

## PM-1 — Web-Public

Scope: public/anonymous + auth-entry surfaces of the web app (login, signup, forgot/reset/verify-email, welcome, request-access, beta-locked, appeal, logout, marketing/legal pages, preview, /api/auth/*, /api/csp-report, /api/health, middleware, lib/auth*, lib/cors, lib/session, lib/password, lib/emailNormalize, lib/betaGate, lib/*Email, lib/featureFlags, lib/siteUrl, lib/email, lib/rateLimit, lib/rateLimits, lib/botDetect).

**Total:** 2 P0, 6 P1, 7 P2, 1 P3.

### [P0] email-change route reads `last_sign_in_at` off the wrong object — every legitimate caller gets 401 `recent_auth_required`
- File: web/src/app/api/auth/email-change/route.js:60
- Issue: The recent-auth gate checks `user.last_sign_in_at`, but `user` here is the value returned by `requireAuth()` → `getUser()`, which is the `public.users` row (spread of `profile`) plus `email`/`roles`/`kind`. `public.users` has no `last_sign_in_at` column (verified in `web/src/types/database.ts:10968` — only `last_login_at` exists). The auth.users field of the same name lives on `authUser` inside `getUser()` and is never propagated. So `user.last_sign_in_at` is always `undefined`, the `!user.last_sign_in_at || ...` branch always fires, and the route returns 401 to every caller.
- Evidence: `if (!user.last_sign_in_at || (Date.now() - new Date(user.last_sign_in_at).getTime()) > 900_000) { return NextResponse.json({ error: 'recent_auth_required' }, { status: 401 }); }`. `users` table type declaration in `database.ts:10968` has `last_login_at: string | null` and no `last_sign_in_at` anywhere in the file.
- Impact: The "change email" flow on /profile/settings/EmailsCard is unusable — every attempt 401s with `recent_auth_required` even immediately after sign-in. Users cannot change their email at all.
- Suggested fix: Either (a) carry `authUser.last_sign_in_at` through `getUser()` in `lib/auth.js` so the field exists on the returned object, or (b) re-resolve the auth user inside the route via `supabase.auth.getUser()` and check `data.user.last_sign_in_at`. Pick (b) for surgical fix; (a) for a wider clean-up.
- Verified by: read `email-change/route.js`, `lib/auth.js` `getUser()`, grep for `last_sign_in_at` across `web/src/` (only the route + a billing/cancel comment — never set on a user row).

### [P0] Wrong OTP code redirects user to home with no session and no error message — silent dead-end on every typo
- File: web/src/app/login/_SingleDoorForm.tsx:106
- Issue: `/api/auth/verify-magic-code` deliberately returns `200 { ok: true }` for both correct AND incorrect codes (privacy posture, see route header at route.ts:1-16). The form-side handler treats any `res.ok === true` + `json.ok === true` as success and calls `router.replace(safe || '/')`. The fallback `if (!json.ok)` branch exists but never fires because the server always sends `ok: true`. Net effect: a user who mistypes their code is silently navigated to `/` with no session cookie and no on-screen error.
- Evidence: route returns `genericOk()` on the OTP-failed path (`verify-magic-code/route.ts:149`); form code (`_SingleDoorForm.tsx:118-131`): `if (!res.ok) {...} if (!json.ok) {...} /* Success */ const safe = resolveNext(rawNext, null); router.replace(safe || '/');`.
- Impact: Total dead-end UX on the auth happy path's most common failure mode (typo). The user has no idea why they're back on home and no path to recover except guessing they should retry — they may give up entirely, especially since the site is invite-only and the code email is the *only* way in.
- Suggested fix: After receiving `ok: true`, the client must verify a session actually got created before navigating — e.g. call `supabase.auth.getUser()` (or hit a server-side `/api/auth/me` probe) and only `router.replace` if a real user comes back. On null user, surface the existing "Could not sign in. Please try again or request a new code." copy. Server-side privacy posture stays unchanged.
- Verified by: read `verify-magic-code/route.ts:36-37, 136-150` (always `genericOk` on failure) and `_SingleDoorForm.tsx:106-137`.
> CLOSED in Session 0 — commit 0ed48a4 (post-200 client-side `getSession()` probe; null session surfaces existing retry copy)

### [P1] resend-verification endpoint uses `auth.resend({ type: 'signup' })` for users created via OTP magic-link → resend fails for the entire OTP-signup user base
- File: web/src/app/api/auth/resend-verification/route.js:39
- Issue: New accounts created through the magic-link flow are created via `service.auth.admin.createUser({ email, email_confirm: true })` (send-magic-link/route.js:262-265), which marks the email already confirmed at creation time — there is no pending "signup confirmation" email queued. The resend route asks Supabase to re-send a `signup` confirmation that does not exist for these accounts; Supabase returns an error and the route 400s. The route worked when there was a separate password-signup flow that left email_confirmed_at null until the user clicked a confirm link, but that flow no longer exists in this codebase (signup page now redirects to login; the OTP flow is single-door).
- Evidence: `await supabase.auth.resend({ type: 'signup', email });` (route.js:39); send-magic-link sets `email_confirm: true` at create time (`send-magic-link/route.js:262-265`).
- Impact: Caller is `web/src/app/leaderboard/page.tsx:441` (clicked when an unverified-email banner shows). For all OTP users, the resend will appear to send (POST returns 400 → client surfaces a generic error) but never delivers a usable email. There is no working "resend verification" path on web at all.
- Suggested fix: Branch on which transition is pending. If the user's `email_verified=false` came from an email-change initiation, send `type: 'email_change'` (read `auth.users.new_email` to detect). If verification was bypassed at signup, return a clear-but-generic "your email is already verified" so the client copy doesn't lie.
- Verified by: read `resend-verification/route.js`, `send-magic-link/route.js:259-280`, `signup/page.tsx` (redirect-only).

### [P1] verify-magic-code gate-deny path may leave a session cookie on the response when deleteUser/signOut error-paths fire
- File: web/src/app/api/auth/verify-magic-code/route.ts:163-202
- Issue: The OTP success path runs `verifyOtp` (line 130) which writes session cookies via the `cookies()` adapter inside `createOtpClient`. Only after that does the route construct `response = NextResponse.json(...)` (line 163). If the new-user beta-gate then denies (lines 173-189), the route deletes the auth user, calls `signOut()`, and returns the same `response`. `signOut()` should clear the session cookies via the same adapter, but both `deleteUser` and `signOut` are wrapped in try/catch that `console.error` and continue. If `signOut` fails (network blip, already-deleted user 404), the response carries an active session cookie pointing at a now-deleted auth row.
- Evidence: lines 173-189 — `try { await service.auth.admin.deleteUser(user.id); } catch (e) { console.error(...); }` and `try { await supabase.auth.signOut(); } catch (e) { console.error(...); }`; line 189: `return genericOk();` returns the same response object that may still carry cookies.
- Impact: Edge case (only fires if a new user is granted an OTP and the beta gate revokes between issuance and redemption), but the failure mode is "logged in as ghost user" — middleware will keep redirecting them to login because `auth.users` row is gone, but the session cookie isn't cleared, producing a redirect loop until cookies expire (or user clears them manually).
- Suggested fix: On gate-deny, replace the response with a fresh `NextResponse.json` AND explicitly delete each Supabase session cookie name on the new response (`sb-<ref>-auth-token`, `.0`, `.1`). Don't rely on signOut to clean up after a deleteUser already removed the server-side session.
- Verified by: read `verify-magic-code/route.ts:128-202`.

### [P1] CSP-report endpoint module-level mutable counters → effectively unrate-limited across serverless instances
- File: web/src/app/api/csp-report/route.js:19-31
- Issue: Rate-limit state is `let windowStart = Date.now(); let windowCount = 0;` at module scope. Vercel serverless instances are independent and short-lived; each cold start resets the counter, and 30 reports/min is per-instance not per-user/per-IP. A single device generating CSP violations from a privacy extension can still spawn far more than 30 reports/min in aggregate (each invocation may hit a fresh instance). The earlier 20k-violation incident on 2026-04-30 (acknowledged in middleware comment lines 122-127) is exactly this failure mode.
- Evidence: `let windowStart = Date.now(); let windowCount = 0;` (lines 19-20). Comment at line 7 itself: "Serverless instances are short-lived so this won't catch storms across all instances."
- Impact: CSP storms can drive five- or six-figure invocation counts even with the current cap. Cost exposure on Vercel pricing.
- Suggested fix: Either (a) move the limiter to the same DB-backed `checkRateLimit` everything else uses, keyed on truncated /24 IP; (b) drop the report-uri to a static endpoint — but Sentry is deferred per `feedback_sentry_deferred.md`, so (a) is the right pick today.
- Verified by: read `api/csp-report/route.js`, comment at lines 5-9.

### [P1] /preview owner-bypass token compares with non-constant-time `!==` → small but nonzero timing channel
- File: web/src/app/preview/route.ts:20
- Issue: `if (!expected || token !== expected)`. JavaScript string `!==` is byte-by-byte and short-circuits on first mismatch. On Node it's negligible per-call but observable across many requests. The health-check token comparison was hardened to `crypto.timingSafeEqual` for exactly this reason (see `api/health/route.js:44-48`); the same pattern should apply here since the bypass token is the only thing standing between an unauthenticated visitor and the entire site during coming-soon mode.
- Evidence: `if (!expected || token !== expected) { return NextResponse.redirect(new URL('/welcome', request.url)); }`.
- Impact: Timing oracle on the bypass token. Realistic exploit cost is high (Vercel adds latency jitter, attacker would need many thousands of probes per byte) but it's free to fix and the precedent already exists in the same codebase.
- Suggested fix: Mirror `api/health/route.js:44-48` — `crypto.timingSafeEqual(Buffer.from(token||''), Buffer.from(expected))` guarded by length-equality first.
- Verified by: read `preview/route.ts:15-34` and `api/health/route.js:36-49`.
> CLOSED in Session 0 — commit 0ed48a4 (length pre-check + `crypto.timingSafeEqual`)

### [P1] verify-magic-code "OTP failed" path leaks raw upstream error string into audit log (truncated)
- File: web/src/app/api/auth/verify-magic-code/route.ts:144-148
- Issue: Failure audit row stores `reason: \`otp_failed:${(error?.message || 'no_user').slice(0, 80)}\``. Supabase's `verifyOtp` error messages are unbounded-shape free-text from upstream; pasting the first 80 chars of an arbitrary upstream message into a persisted audit row commits the application to whatever Supabase decides to put there in any future SDK version.
- Evidence: line 146: `reason: \`otp_failed:${(error?.message || 'no_user').slice(0, 80)}\``.
- Impact: Audit-log shape drift; low PII risk today, but the contract isn't enforced and a future Supabase string change can echo the submitted token or email back into the row.
- Suggested fix: Map the upstream error to a small enum (`otp_failed:invalid`, `otp_failed:expired`, `otp_failed:rate_limited`, `otp_failed:other`) and stash any raw message under `metadata.detail` only, not in `reason`.
- Verified by: read `verify-magic-code/route.ts:136-150`.
> CLOSED in Session 0 — commit 0ed48a4 (closed-set classifier: expired / invalid / rate_limited_upstream / other / no_user)

### [P1] welcome graduation-claim form leaves `busy=true` after success — submit button stays disabled-styled until unmount
- File: web/src/app/welcome/page.tsx:87
- Issue: `submit()` sets `setBusy(true)` at line 58. On the success branch it calls `setDone({ ... })` at line 87 and returns without resetting `setBusy(false)`. The catch path resets busy correctly. The rendered tree switches to the `done`-card so the disabled button is no longer visible, but the residual state is a bug if the form is re-mounted or re-used.
- Evidence: `submit` body lines 57-92; success branch is `setDone({ ... })` at line 87 with no preceding `setBusy(false)`.
- Impact: Cosmetic on this surface. Easy to fix.
- Suggested fix: Add `setBusy(false)` immediately before `setDone(...)`, or replace `busy` with a derived boolean off `done`.
- Verified by: read `welcome/page.tsx:57-92`.

### [P2] /verify-email handler accepts `type: 'email'` from query param but the route is meant for email-change only
- File: web/src/app/verify-email/route.ts:16
- Issue: `const type = searchParams.get('type') as 'email_change' | 'email' | null;` then passes `type` directly to `verifyOtp`. `'email'` is the legacy Supabase type for confirming a brand-new email at signup — but this route's purpose is email-change confirmation and unconditionally redirects to `/profile/settings?notice=email_changed` on success (line 37). If a user clicks an old/cross-flow link that lands here with `type=email`, the OTP verify may succeed but the user lands on the wrong success page with the wrong copy.
- Evidence: `const type = searchParams.get('type') as 'email_change' | 'email' | null;` … `await supabase.auth.verifyOtp({ token_hash: tokenHash, type });` and unconditional redirect to `/profile/settings?notice=email_changed`.
- Impact: Misleading success copy in the rare cross-flow click. Low.
- Suggested fix: Narrow the accepted set to `'email_change'` only and reject everything else with a 400-style redirect (e.g., `/login?error=link_expired`). Drop the `'email' |` from the cast.
- Verified by: read `verify-email/route.ts`.

### [P2] welcome page graduation flow flashes blank between effect setters
- File: web/src/app/welcome/page.tsx:26-36
- Issue: The effect calls `router.replace('/')` for the no-token case, then unconditionally calls `setReady(true)` immediately afterward. Between the dispatch of `replace` and the actual navigation, the component re-renders with `ready=true` and `graduationToken=null`, falling through to `return null;` at line 42. The user sees an empty page for one paint before the redirect lands.
- Evidence: lines 26-36; both branches call `setReady(true)` after the conditional; null-token branch additionally calls `router.replace('/')`.
- Impact: Brief blank-page flash on /welcome without a token. Cosmetic.
- Suggested fix: Only `setReady(true)` in the token-present branch; let the null-token branch leave `ready=false` so the "Loading…" state holds until the redirect completes.
- Verified by: read `welcome/page.tsx:22-43`.

### [P2] login form: `'invite_required'` magic-string in `emailError` state slot is a maintenance hazard
- File: web/src/app/login/_SingleDoorForm.tsx:92-95
- Issue: The form uses `setEmailError('invite_required')` as a sentinel value to switch from the danger-styled error block to the invite-only callout. Two consumers (`emailError && emailError !== 'invite_required'` at 221 and `emailError === 'invite_required'` at 235) split on the magic string. A future translator/copywriter who sees `emailError === 'invite_required'` won't expect that semantic.
- Evidence: lines 92-95 (set), 221-256 (consumers split on the magic string).
- Impact: Maintenance hazard, no immediate user impact.
- Suggested fix: Hoist a separate `inviteRequired: boolean` state alongside `emailError: string|null`. Mutually exclusive but each has a clear semantic.
- Verified by: read `_SingleDoorForm.tsx:75-256`.

### [P2] /api/auth/check-username only enforces session-scoped rate limit, not per-IP — an authed insider can probe usernames at 30/min/session
- File: web/src/app/api/auth/check-username/route.js:62-73
- Issue: Rate limit key is `check_username:user:${user.id}` — scoped to the authenticated user id. The route doesn't return a `taken` vs `reserved` oracle (collapsed to `available: false`), but rapid probing by an authed insider can still enumerate the reserved-usernames table by diff against a known-taken seed. Per-user cap is `AUTH_USERNAME_CHECK_PER_SESSION { windowSec: 60, max: 30 }` — 1800/hour per identity.
- Evidence: `key: \`check_username:user:${user.id}\`` (line 65), policy `AUTH_USERNAME_CHECK_PER_SESSION` `{ windowSec: 60, max: 30 }` in `lib/rateLimits.ts:53`.
- Impact: Reserved-username enumeration by an authed insider. Low — the lists aren't secret, but an attacker who learns the reserved list can pre-position squat-attempts on those names if the reserved-status is ever lifted.
- Suggested fix: Add a per-IP cap as a second gate (truncated /24, e.g., 200/hr) ANDed with the per-user cap. Same pattern as send-magic-link.
- Verified by: read `check-username/route.js`, `lib/rateLimits.ts:53`.

### [P2] anon read counter cookie can grow to ~1.4 KB and is re-set on every middleware pass through a slug path
- File: web/src/middleware.js:516-525, web/src/lib/anonReadCounter.ts:24-28
- Issue: `incrementAnonRead` stores up to 50 ISO timestamps as a JSON-encoded array; URI-encoded that's ~50×30 = ~1.5 KB. The cookie ships on every request to the origin (max-age 7d, path=/). The middleware re-sets the cookie on every visit to a slug-shaped path (line 519) so every article hit incurs Set-Cookie overhead even if the value is unchanged.
- Evidence: middleware lines 516-525, anonReadCounter line 27 (`MAX_ENTRIES = 50`).
- Impact: Slight bandwidth cost on every request from heavy anon readers. Not a correctness issue.
- Suggested fix: Either reduce `MAX_ENTRIES` to ~12 (the regwall threshold the counter actually drives is small) or store a compact representation (count + window-start) instead of an array of ISO strings.
- Verified by: read `middleware.js:481-525`, `lib/anonReadCounter.ts`.

### [P2] [KILL-SWITCHED] OAuth buttons in `_SingleDoorForm` have permanent `disabled` attribute — they will appear inert when the OAUTH_ENABLED flag is flipped
- File: web/src/app/login/_SingleDoorForm.tsx:307-332
- Issue: Per the kill-switch inventory, OAuth is intentionally hidden via `OAUTH_ENABLED = false`. When `OAUTH_ENABLED` flips to true, the buttons render with `disabled` and "not-allowed" cursor (lines 314-322 / 324-330). The OAuth flag is meant to *gate* the buttons, not render them disabled when shown — the `disabled` attribute is dead code under both branches today and a foot-gun once the flag flips.
- Evidence: `<button type="button" disabled style={{ ...btnPrimary(false), background: C.border, color: C.dim, marginBottom: 8 }}>Continue with Apple</button>` (lines 312-323) and the parallel Google button at 324-330.
- Impact: When the kill-switch is removed in a future commit, the OAuth buttons will appear but be inert. Bug bloom waiting to happen on un-hide.
- Suggested fix: Drop the `disabled` attribute from both OAuth buttons and replace `btnPrimary(false)` styling with the active-button shape; wire up real `onClick` handlers that call `supabase.auth.signInWithOAuth({ provider })`.
- Verified by: read `_SingleDoorForm.tsx:307-332`; CLAUDE.md kill-switch inventory entry #4.

### [P2] Marketing pages hardcode hex colors instead of CSS variable tokens — dark-mode coverage regression
- File: web/src/app/about/page.tsx:36, web/src/app/contact/page.tsx:97, web/src/app/beta-locked/page.tsx:42-43
- Issue: These pages set explicit `#ffffff` / `#fafafa` background, `#111111` text, `#666666` dim — bypassing the CSS-variable theming used by the auth surface. globals.css defines `--bg`, `--text`, `--dim`, `--card`, `--border` and exposes a dark-mode set via `[data-theme="dark"]`. The auth surfaces (login/_SingleDoorForm, welcome) use the variables; these marketing pages don't. Users with dark mode preferred get a forced light experience on the legal/about pages.
- Evidence: about/page.tsx line 36 `background: '#ffffff'`; contact/page.tsx line 97 `background: '#ffffff'`; beta-locked/page.tsx line 42 `background: '#fafafa'`.
- Impact: Inconsistent theming across surface. P2 polish.
- Suggested fix: Migrate hardcoded hex to `var(--bg)`, `var(--text)`, `var(--dim)`, `var(--border)`, `var(--card)` per the existing token set used in auth pages.
- Verified by: read about/contact/beta-locked pages and confirmed the variables exist in globals.css (`--danger-bg`, `--warn-bg`, etc. all present).

### [P3] `/api/health` detailed mode leaks env-var presence map without IP allowlist
- File: web/src/app/api/health/route.js:38-56
- Issue: Anyone with the shared `HEALTH_CHECK_SECRET` gets a present/missing dump for stripe_secret, stripe_webhook_secret, resend_api_key, cron_secret. Constant-time compare is correct (T-M-03). But the secret is one shared string with no rotation cadence and no audit trail. If it leaks, an attacker maps your backend posture without any other signal.
- Evidence: lines 51-56 emit the env-var map when the constant-time compare passes.
- Impact: Backend-config disclosure on secret leak. Very low (the listed envs being present is true regardless and known to anyone reading the codebase), but combining presence-of-CRON_SECRET with the cron paths gives a probe-ready surface.
- Suggested fix: Either drop the detailed mode entirely (the same info is in the codebase + Vercel dashboard), or IP-allowlist the detailed branch in addition to the secret check.
- Verified by: read `api/health/route.js`.

### Cross-scope items noticed but not in PM-1's lane
(For the architect to route to other PMs.)

- `_RequestAccessForm` and `_WaitlistForm` POST to `/api/access-request` (web/src/app/login/_RequestAccessForm.tsx:73, _WaitlistForm.tsx:46). The endpoint is at `web/src/app/api/access-request/route.js` — that route's ownership likely belongs to PM-4 (Web-API-Public, who flagged a similar pattern) or whoever owns admin-side access flows. Worth confirming the same privacy-posture (oracle collapse on existing-account check) applies.
- `_SingleDoorForm.tsx` does NOT call `clearAnonArticleViews()` from `lib/session.js` after a successful OTP sign-in. The lib has a comment (`// T64`) saying the counter should clear on auth-state transitions; that wiring is missing on the new OTP flow. Probably the signed-in app surface PM's lane.
- The `EmailsCard` in `/profile/settings` is the only caller of /api/auth/email-change; the P0 above will surface there. Profile-settings PM should be aware once the auth fix lands — the broken state is likely already visible to users.


## PM-2 — Web-AppShell

**Scope inventory:** Discovery routes (`browse`, `search`, `category/[id]`, `following`, `leaderboard`), story surfaces (`[slug]`, `story/[slug]` redirect, `card/[username]`, `r/[slug]`, `recap`), user surfaces (`bookmarks`, `notifications`, `messages`, `expert-queue`), profile tree (`profile/`, `profile/_components/`, `profile/_sections/`, `profile/[id]/`, `profile/family/`, `profile/kids/`, `profile/contact/`, `profile/settings/_cards/`), `u/[username]`, plus all reader-facing components in `web/src/components/` (Avatar, BookmarkButton, FollowButton, ShareButton, CommentThread, CommentComposer, CommentRow, RegistrationWall, LockModal, ConfirmDialog, Interstitial, Toast, EmptyState, ErrorState, Skeleton, ArticleEngagementZone, ArticleQuiz, ArticleActions, ArticleSurface, MidBodyQuizTeaser, UpNextSheet, NextStoryFooter, AnonArticleCtaBanner, AccountStateBanner, MobileStickyAd, JsonLd, VerifiedBadge, etc.).

**Headline:** Surface is generally in good shape — focus traps wired into modal patterns (Interstitial, LockModal, ConfirmDialog, the message-search overlay, the DM paywall), permission gates layered with friendly fallbacks, abort-controllers protecting in-flight requests, optimistic UI on bookmark/comment/follow paths, undo-via-toast on bookmark removal. The findings below cluster around (a) one real **misleading-privacy-copy bug** between PrivacyCard and `/u/[username]`, (b) a few stale kill-switch comments now that `PUBLIC_PROFILE_ENABLED` has flipped to `true`, (c) modal hardening on the legacy `RegistrationWall`, and (d) emoji vs. ASCII-glyph house-style inconsistency on two surfaces.

**Total:** 5 P1, 11 P2, 4 P3. No P0s.

**Note on kill-switch state:** Per `CLAUDE.md` the `/u/[username]` and `/profile/[id]` routes are listed as kill-switched, but `PUBLIC_PROFILE_ENABLED` at `web/src/app/u/[username]/page.tsx:22` is set to `true` and `web/src/app/profile/[id]/page.tsx` does not reference the flag (it's a thin redirect). Treating these surfaces as **live** for the review per the actual code state.

### [P1] Privacy "Followers-only" setting silently saves as fully-private — runtime treats followers as random visitors
- File: `web/src/app/profile/settings/_cards/PrivacyCard.tsx:158,165` and `web/src/app/u/[username]/page.tsx:207-218`
- Issue: PrivacyCard exposes a tri-state audience picker — Public / **Followers** / Hidden. Picking "Followers" persists `profile_visibility = 'private'` and toasts "Profile is followers-only." But `/u/[username]` blocks `'private'` for *every* non-self viewer — followers get the same dead-end as randoms.
- Evidence: `PrivacyCard.tsx:158`: `const dbValue = next === 'public' ? 'public' : 'private';`; `:165`: `toast.success(next === 'public' ? 'Profile is public.' : 'Profile is followers-only.');`. Paired with `/u/[username]/page.tsx:207-218`: `if ((targetRow.profile_visibility === 'private' || targetRow.profile_visibility === 'hidden') && user.id !== targetRow.id) { … setPrivateProfile(true); … return; }` — no follow-relationship check.
- Impact: Users who pick "Followers" believe their followers can still see their profile; reality is every visitor (including followers) hits the "This profile is private" screen. Privacy errs strict (no leakage), but the setting copy is a lie. Same mismatch in `PublicProfileSection.tsx:285`'s sub-label "Only your followers can view."
- Suggested fix: Either (a) add a `follows` lookup on `/u/[username]` that allows followers through when visibility = `'private'`, or (b) collapse the audience picker to Public / Private and rewrite all copy to match.
- Verified by: end-to-end read of both files; no other branch in `/u/[username]` softens the private gate.

### [P1] PublicProfileSection share-link block suppressed by stale kill-switch comment though `/u/[username]` is live
- File: `web/src/app/profile/_sections/PublicProfileSection.tsx:191-193`
- Issue: Inline comment claims `Public URL link intentionally omitted — /u/[username] is kill-switched pending public profile launch. Re-enable when PUBLIC_PROFILE_ENABLED flips to true.` But `web/src/app/u/[username]/page.tsx:22` already has `const PUBLIC_PROFILE_ENABLED = true;` — flag flipped, public profile is live, share-link affordance was never re-enabled.
- Evidence: comment at `PublicProfileSection.tsx:191-193`; flag definition at `u/[username]/page.tsx:22` set to `true`.
- Impact: Users editing their public profile have no in-page way to reach or copy the canonical URL even though the URL works. (`u/[username]/page.tsx:710-743` does have its own "Copy shareable profile card link" affordance for self-viewers — duplication / ambiguity.)
- Suggested fix: Re-enable the share-link block, and update CLAUDE.md kill-switch table row #1 to reflect the current flag state.
- Verified by: grep `PUBLIC_PROFILE_ENABLED`; both files read.

### [P1] RegistrationWall "Sign up — free" CTA goes to `/login` and drops `next` param; modal lacks aria/focus-trap/Escape
- File: `web/src/components/RegistrationWall.tsx:38-186`
- Issue: Modal is opened from anon flows on the article page (via `openWall` in `BookmarkButton`, `ArticleQuiz`). Two issues:
  1. Primary CTA is `<a href="/login">` with no `next` param. After auth, the user lands on `/` instead of returning to the article they were reading.
  2. The modal wrapper has no `role="dialog"`, no `aria-modal`, no focus trap (compare to the same-codebase `useFocusTrap` used by `Interstitial`, `LockModal`, the message-search overlay, the DM paywall), no Escape handler.
- Evidence: `RegistrationWall.tsx:149-152`: `<a href="/login" …>Sign up — free</a>` — no `?next=…`. Lines 60-69 wrap in a plain `<div>` with no aria-modal/role.
- Impact: After bouncing through login, the reader loses context (article URL) and lands on the homepage; conversion path is leaky. A11y users have no escape gesture.
- Suggested fix: Pass `pathname` as `?next=…` (mirrors `AnonArticleCtaBanner.tsx:32`); add `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `useFocusTrap`, and Esc handler.
- Verified by: full file read; cross-reference to `AnonArticleCtaBanner` which does pass `next`.

### [P1] Story page "Open in Verity Kids" CTA has `rel="noopener noreferrer"` but no `target` — navigates current tab
- File: `web/src/app/[slug]/page.tsx:369-385`
- Issue: COPPA articles render an "Open in Verity Kids" CTA with `<a rel="noopener noreferrer">` but no `target="_blank"`. `rel` is a no-op without `target`; the link will navigate the current tab to whatever `NEXT_PUBLIC_KIDS_APP_URL` points at.
- Evidence: `[slug]/page.tsx:370-388`: `<a href={process.env.NEXT_PUBLIC_KIDS_APP_URL} rel="noopener noreferrer" style={{ … }}>Open in Verity Kids</a>` — no `target`.
- Impact: A parent or kid taps "Open in Verity Kids" and the current tab navigates away from the article they were reviewing.
- Suggested fix: Add `target="_blank"` (consistent with the rel intent), or drop the `rel` if same-tab is intended.
- Verified by: file read.

### [P1] BookmarksSection imports `useToast` but never invokes it; failure path is dead-end
- File: `web/src/app/profile/_sections/BookmarksSection.tsx:15,28,50-54,64-68`
- Issue: Component imports `useToast` and calls `const toast = useToast();` but the error branch on the bookmarks query just sets `setError(true)` and renders fallback copy with no Retry CTA — every other surface in this app surfaces a Retry via `ErrorState`.
- Evidence: line 28: `const toast = useToast();` (unused — grep confirmed no `toast.` invocations); lines 50-54: `if (queryError) { setError(true); setLoading(false); return; }`; lines 64-68 render dead-end copy.
- Impact: Dead-end UX on transient bookmark fetch failures inside the profile shell — the user can't retry without leaving the section.
- Suggested fix: Drop the unused `useToast` import + call; replace the inline error fallback with `<ErrorState onRetry={…} />`.
- Verified by: grep + file read.
> CLOSED in Session 0 — commit 0ed48a4 (toast on failure + Retry button that re-runs the loader)

### [P2] Comment mentions link to `/card/<username>` instead of `/u/<username>`; same on leaderboard rows
- File: `web/src/components/CommentRow.tsx:80-84` and `web/src/app/leaderboard/page.tsx:928`
- Issue: `renderBody` resolves `@username` mentions to `<a href={`/card/${name}`}>` and `LeaderRow` builds `profileHref = u.username ? `/card/${u.username}` : null`. The canonical profile page is `/u/<username>` (now that `PUBLIC_PROFILE_ENABLED` is true); `/card/<username>` is the small share-card OG asset. Mixed destinations across the codebase — `web/src/app/u/[username]/page.tsx:814` correctly uses `/u/${u.username}` for follower/following lists.
- Evidence: `CommentRow.tsx:82`; `leaderboard/page.tsx:928`.
- Impact: A reader clicks @alice in a comment or a leaderboard row and lands on the small share card instead of alice's full profile.
- Suggested fix: Pick one canonical destination ("click on a username" → `/u/<username>`); update both call sites.
- Verified by: cross-file read.

### [P2] AccountStateBanner (profile shell variant) uses 13 emojis while every other surface uses ASCII glyphs
- File: `web/src/app/profile/_components/AccountStateBanner.tsx:38,49,61,71,83,95,107,120,132,144,154,165,177,189,201`
- Issue: Banner uses emoji glyphs (`⛔ 🔒 ✉️ 📨 🗑️ ❄️ 🔇 👤 ⏰ 🕐 🎁 ⏳ ⚠️ 🎉 🚀`). The rest of the codebase deliberately uses ASCII / box-drawing glyphs (`[@]`, `[!]`, `◐`, `✶`, `✦`, `✎`, `⛨`, `⌬`, `☷`, `⊘`, `◈`, `↪`) — see `web/src/app/u/[username]/page.tsx:328`, `web/src/app/profile/_components/ProfileApp.tsx:251,265,283,307`.
- Evidence: line 49: `glyph: '🔒'`; line 61: `glyph: '✉️'`; line 95: `glyph: '❄️'`; line 144: `glyph: '🕐'`; etc.
- Impact: Visual inconsistency on a high-impression surface (account-state banners surface on every page they apply to). Emoji rendering varies across platforms.
- Suggested fix: Replace each emoji with an ASCII / box-drawing glyph or a small inline SVG.
- Verified by: file read; cross-referenced public-profile + profile-app glyph usage.

### [P2] MidBodyQuizTeaser uses 📋 emoji in headline
- File: `web/src/components/article/MidBodyQuizTeaser.tsx:58`
- Issue: Headline is `📋 5 questions · Test your understanding`. Same house-style inconsistency — every surrounding surface (story page, quiz card, comment composer) is emoji-free.
- Evidence: line 58: `<p style={HEADLINE_STYLE}>📋 5 questions · Test your understanding</p>`.
- Impact: Cosmetic / typography inconsistency on every story page mid-body.
- Suggested fix: Drop the emoji or replace with a tasteful inline SVG.
- Verified by: file read.

### [P2] Following page header "Active Stories" but route is `/following` — semantic mismatch with route name
- File: `web/src/app/following/page.tsx:131-135,64-92`
- Issue: The route is `/following` but the H1 is "Active Stories" and the body copy says "Stories you've been reading that are still active." There's no following-list anywhere on the page — the data source is `reading_log`, not `follows`.
- Evidence: line 131: `<h1 … >Active Stories</h1>`; lines 64-92 query `reading_log`.
- Impact: Users expecting "the people I follow" view land on a reading-history view.
- Suggested fix: Either repurpose this route to actually show stories from followed users, or rename the route + update nav copy.
- Verified by: file read.

### [P2] BookmarkButton has no unbookmark affordance — "Saved" state is one-way per session
- File: `web/src/components/BookmarkButton.tsx:75-98,100-135`
- Issue: After bookmarking, the button's only state transition is `bookmarked = true` and the button disables. The user must navigate to `/bookmarks` or the profile bookmarks section to remove the bookmark. Same code base already does two-way toggle correctly on the category page (`web/src/app/category/[id]/page.js:178-218`).
- Evidence: `BookmarkButton.tsx:76`: `if (busy || bookmarked) return;` (early-return blocks any subsequent click). The "Saved" state has no DELETE branch.
- Impact: Users who accidentally bookmark have no quick undo.
- Suggested fix: Mirror category-page pattern — add a DELETE branch when already-bookmarked; preserve optimistic UI.
- Verified by: file read; cross-reference to category page bookmark toggle.

### [P2] Leaderboard "Resend verification" sent / rate-limited states never auto-clear
- File: `web/src/app/leaderboard/page.tsx:438-453,795-845`
- Issue: After successful resend (`resendState='sent'`), UI swaps in "Check your inbox for a verification link." with no way to retry. Same dead-end on `rate-limited`. Only the `error` branch has a "Try again" button (line 810).
- Evidence: lines 794-803.
- Impact: Stuck-state UX; can't request another email even after the rate-limit window passes.
- Suggested fix: Add "Resend again" button to both `sent` and `rate-limited` branches that resets `resendState` to `idle`.
- Verified by: file read.

### [P2] Search anon CTA copy says "available to signed-in users" but advanced filters require Verity+
- File: `web/src/app/search/page.tsx:341-358`
- Issue: When `!canAdvanced && hasInteracted && isAuthed === false`, the tease shows "Advanced filters (date range, category, source) are available to signed-in users." But `canAdvanced = hasPermission('search.advanced')` requires a paid plan.
- Evidence: line 354 anon copy; line 103 paid-tier gate.
- Impact: Bait-and-switch feel for anon users who sign up free expecting advanced filters.
- Suggested fix: Honest copy: "Advanced filters are a Verity Plus perk." (matches the authed-but-free branch already at line 355).
- Verified by: file read.

### [P2] Browse page `relTime` returns "0m ago" for very recent items
- File: `web/src/app/browse/page.tsx:65-70`
- Issue: `function relTime(ms)` does `const h = (Date.now() - ms) / 3_600_000;` then `if (h < 1) return ${Math.round(h * 60)}m ago`. For just-published items (ms ≈ now), `Math.round(h*60)` returns 0, rendering "0m ago".
- Evidence: line 67: `if (h < 1) return ${Math.round(h * 60)}m ago;`.
- Impact: Minor copy issue.
- Suggested fix: `if (h < 1/60) return 'just now'; if (h < 1) return ${Math.max(1, Math.round(h*60))}m ago;`.
- Verified by: file read.

### [P2] Profile shell binds Cmd/Ctrl+K to focus rail search with no visible affordance or kbd hint
- File: `web/src/app/profile/_components/AppShell.tsx:107-122`
- Issue: AppShell binds `(metaKey||ctrlKey)+k` globally to focus the rail search input, but no visible kbd hint, no `aria-keyshortcuts`, and the shortcut potentially conflicts with browser-level shortcuts.
- Evidence: lines 107-112 — listener is global; search input id `redesign-rail-search` has no aria-keyshortcuts.
- Impact: Hidden affordance + potential conflict.
- Suggested fix: Either drop the shortcut (the codebase memory `feedback_no_keyboard_shortcuts.md` mandates click-driven for admin; spirit may carry to /profile) or add `aria-keyshortcuts="Meta+K Control+K"` and a visible kbd hint.
- Verified by: file read.

### [P2] Browse page mixes HTML entity styles in JSX text
- File: `web/src/app/browse/page.tsx:631`
- Issue: Loading-failed copy uses literal `&rsquo;` HTML entity in a JSX text node. JSX renders entities literally; works in modern browsers but fragile to React 19's stricter parser. Inconsistent with surrounding `&apos;` / raw-quote usage.
- Evidence: line 631: `<div style={{...}}>Couldn&rsquo;t load stories</div>`.
- Impact: Cosmetic / fragility.
- Suggested fix: Use literal Unicode `'`; standardize across the file.
- Verified by: file read.

### [P3] CategoryPage wraps content in `<Suspense>` with no `fallback` prop
- File: `web/src/app/category/[id]/page.js:727-733`
- Issue: `<Suspense>` rendered without a `fallback`. Convention everywhere else passes `fallback`.
- Evidence: line 729: `<Suspense>` (no props).
- Impact: None observed; convention drift only.
- Suggested fix: `<Suspense fallback={null}>` or wire to a skeleton.
- Verified by: file read.

### [P3] RegistrationWall sets cookie with `Secure` flag — breaks suppress-on-localhost-http dev
- File: `web/src/components/RegistrationWall.tsx:38`
- Issue: `document.cookie = 'vp_wall_supp=1; path=/; max-age=86400; Secure; SameSite=Strict';` — `Secure` means browsers reject the cookie over plain http. In dev (`http://localhost:3000`) the cookie silently fails to set; the wall keeps re-opening for engineers running locally.
- Evidence: line 38.
- Impact: Dev-only papercut; production unaffected.
- Suggested fix: Conditional `Secure` based on `window.location.protocol === 'https:'`.
- Verified by: file read.

### [P3] Bookmarks page `loadMore()` is hidden when collection filter active — > 50 items per collection unreachable
- File: `web/src/app/bookmarks/page.tsx:766-787,762-765`
- Issue: "Load more" button is hidden when `activeCollection !== 'all'` (line 767). Defensive comment at 762-765 acknowledges the cursor can't mix with client-side filter — but the workaround means a paid user with > 50 bookmarks in one collection sees only the first 50.
- Evidence: line 767: `{hasMore && activeCollection === 'all' && items.length > 0 && (`.
- Impact: Edge case — paid users only (free is capped at 10 total).
- Suggested fix: Server-side filter (cursor walks the filtered list), or load all bookmarks into memory when a collection filter is active.
- Verified by: file read.

### [P3] Avatar's default `text` color is white; if `avatar_color` is light, initials become invisible
- File: `web/src/components/Avatar.tsx:36-37,84-95`
- Issue: When `avatar_color` is `#ffffff` or any pastel near-white, white initials become invisible. No contrast guard.
- Evidence: line 37: `const text = user?.avatar?.text || '#ffffff';`. Outer color is unguarded user-controlled.
- Impact: Edge case — depends on what the avatar editor lets users pick.
- Suggested fix: Compute relative luminance of `outer` and pick black or white text accordingly.
- Verified by: file read.

---

### Top 3 P0/P1 (highest-priority items for fix-pass)
1. **[P1] Privacy "Followers-only" maps to fully-private** — `PrivacyCard.tsx:158` saves `'private'` for the "Followers" choice, and `/u/[username]/page.tsx:207` blocks `'private'` for every non-self viewer. Either restore the followers-only path or fix the copy.
2. **[P1] PublicProfileSection share link suppressed by stale comment** — kill-switch comment at line 191 is wrong now that `PUBLIC_PROFILE_ENABLED = true`. Re-enable the share link block.
3. **[P1] RegistrationWall drops `next` param + lacks aria/focus-trap/Esc** — primary CTA goes to `/login` with no return path; modal is not aria-marked or focus-trapped despite the codebase having `useFocusTrap` ready.

### Out-of-scope notes (flagged for the architect to route)
- **PM-9 / iOS:** `web/src/app/[slug]/page.tsx:369` kids-app link relies on `process.env.NEXT_PUBLIC_KIDS_APP_URL`. iOS likely has a parallel deep-link path — verify both work in tandem.
- **PM-5 / billing:** The DM paywall in `messages/page.tsx:1003-1021` hardcodes the Verity tier price (`$3.99/mo`) and feature bullets. Will diverge from `/pricing` if pricing changes.
- **Architect:** CLAUDE.md kill-switch table row #1 (`/u/[username]`) is stale — flag is currently `true` but the table says "Flip … to true to re-enable." Suggest updating the inventory after this review.
- **Architect:** The `recap/[id]` page is launch-hidden (`LAUNCH_HIDE_RECAP = true` at line 72). I did not deep-review the dead branches per the launch-hide preserved-state contract; flagging only that the file uses 13 inline `// eslint-disable-next-line react-hooks/rules-of-hooks` comments to keep dead hooks alive — pattern is documented.

---

## PM-7 — iOS-Kids

**Scope inventory:** 25 Swift files + Info.plist + entitlements under `VerityPostKids/VerityPostKids/`. Coverage:
- Auth/pairing: `KidsAuth.swift`, `PairingClient.swift`, `SupabaseKidsClient.swift`, `PairCodeView.swift`
- Root/state: `VerityPostKidsApp.swift`, `KidsAppRoot.swift`, `KidsAppState.swift`, `Models.swift`, `TabBar.swift`
- Reading/quiz: `ArticleListView.swift`, `KidReaderView.swift`, `KidQuizEngineView.swift`
- Profile/social: `ProfileView.swift`, `LeaderboardView.swift`, `ExpertSessionsView.swift`
- Parental gate: `ParentalGateModal.swift`
- Scenes: `BadgeUnlockScene.swift`, `GreetingScene.swift`, `QuizPassScene.swift`, `StreakScene.swift`, `ParticleSystem.swift`, `FlameShape.swift`, `KidPrimitives.swift`, `CountUpText.swift`
- Theme/config: `KidsTheme.swift`, `Info.plist`, `VerityPostKids.entitlements`

### Severity totals
- P0: 0
- P1: 4
- P2: 5
- P3: 1

No P0 issues. Parental-gate coverage is complete and the bypass surface is clean.

### Parental-gate audit table (every external-action / sensitive-action surface)

| Surface | File:line | Action | Gate? | Verified on disk |
|---|---|---|---|---|
| Privacy Policy link | `ProfileView.swift:73-74,89-93` | `UIApplication.shared.open` to `veritypost.com/privacy` | YES — `showLegalGate` → `parentalGate` | Lines 51-56, 89-93 quoted below |
| Terms of Service link | `ProfileView.swift:77-78,89-93` | `UIApplication.shared.open` to `veritypost.com/terms` | YES — same `showLegalGate` | Same |
| Unpair this device | `ProfileView.swift:132-138,48-50` | `auth.signOut()` (clears Keychain + UserDefaults) | YES — `showUnpairGate` → `parentalGate` | Lines 48-50 quoted below |
| Pair-code Help (`mailto:`) | `PairCodeView.swift:124-135,149-156` | `UIApplication.shared.open(mailto:)` | YES — `showHelpGate` → `parentalGate` | Line 149 quoted below |
| Expert Sessions tab | `ExpertSessionsView.swift:30-32,85-88` | Network fetch + display of adult-contact discovery | YES — gated before fetch + render via `parentGatePassed` flag, `parentalGate` runs `load()` only after pass | Lines 85-88 quoted below |
| Universal Link / `onOpenURL` | `VerityPostKidsApp.swift:13-27` | Currently logs + drops; no routing yet | N/A — no destination; if a route is added, MUST be re-audited | Lines 19-27 quoted below |
| In-app purchase / billing | n/a | No StoreKit/IAP code in target | N/A — surface not present | `grep -r "StoreKit\|SKProduct\|IAPManager" VerityPostKids/` returns nothing |
| Settings / account changes (DOB edit, email, password) | n/a | No such surfaces in kids app | N/A — kids app has no adult-credential UI | Confirmed by reading `ProfileView.swift` end-to-end; only stats + badges + unpair |
| External web view / SFSafariViewController | n/a | Not present — only `UIApplication.shared.open` | N/A | `grep -r "SFSafari\|WKWebView\|UIWebView" VerityPostKids/` returns nothing |
| Push notifications outbound | n/a | Entitlement has `aps-environment` (development) but no registration code | N/A for now — flag if registration is added | `grep -r "registerForRemoteNotifications\|UNUserNotificationCenter" VerityPostKids/` returns nothing |

**Verdict:** Every code path that *should* gate, gates. The `interactiveDismissDisabled(true)` on the sheet content (line 283 of `ParentalGateModal.swift`) prevents swipe-to-dismiss bypass. Lockout state survives app launch via UserDefaults. **No P0 parental-gate bypass found.**

Quoted evidence:
```swift
// ProfileView.swift:48-56
.parentalGate(isPresented: $showUnpairGate) {
    Task { await auth.signOut() }
}
.parentalGate(isPresented: $showLegalGate) {
    if let url = pendingLegalURL {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
    pendingLegalURL = nil
}

// PairCodeView.swift:149-156
.parentalGate(isPresented: $showHelpGate) {
    if let url = URL(string: "mailto:support@veritypost.com?subject=Kids%20app%20pair%20code%20help") {
        UIApplication.shared.open(url, options: [:]) { opened in
            if !opened { showMailUnavailable = true }
        }
    }
}

// ExpertSessionsView.swift:85-88
.parentalGate(isPresented: $showParentGate) {
    parentGatePassed = true
    Task { await load() }
}

// VerityPostKidsApp.swift:19-27
private func handleIncomingURL(_ url: URL) {
    #if DEBUG
    print("[VerityPostKidsApp] onOpenURL host=\(url.host ?? "<none>") path=\(url.path)")
    #endif
}

// ParentalGateModal.swift:281-284
// Must be on the sheet content, not the presenter, to prevent
// the swipe-to-dismiss gesture from bypassing the parental gate.
.interactiveDismissDisabled(true)
```

### P1 findings

### [P1] Profile stats render stale 0 instead of server values until kid completes a quiz this session
- File: `VerityPostKids/VerityPostKids/KidsAppState.swift:36-37,90-115` and `VerityPostKids/VerityPostKids/ProfileView.swift:152-157`
- Issue: `verityScore` and `quizzesPassed` are `@Published` in-memory counters initialized to 0. `KidsAppState.loadKidRow()` selects only `streak_current, reading_band` — `verity_score`, `quizzes_completed_count`, and `articles_read_count` are never fetched. ProfileView binds the 2x2 stats grid to `state.verityScore` and `state.quizzesPassed`, so a paired kid who has 87 score + 14 passed quizzes server-side sees `0 Score / 0 Quizzes` on every cold launch until they finish a quiz this session, then `+10 / 1`.
- Evidence:
  ```swift
  // KidsAppState.swift:36-38
  @Published var verityScore: Int = 0
  @Published var quizzesPassed: Int = 0
  @Published var biasedHeadlinesSpotted: Int = 0
  // KidsAppState.swift:96-114 — loadKidRow only fetches streak_current + reading_band
  let row: Row = try await client
      .from("kid_profiles")
      .select("streak_current, reading_band")
      …
  self.streakDays = row.streak_current ?? 0
  self.readingBand = row.reading_band ?? "kids"
  // ProfileView.swift:152-157
  StatBubble(value: state.streakDays, label: "Day streak",    color: K.coral)
  StatBubble(value: state.verityScore, label: "Score",         color: K.teal)
  StatBubble(value: state.quizzesPassed, label: "Quizzes",      color: K.purple)
  StatBubble(value: badges.count,      label: "Badges",        color: K.gold)
  ```
- Impact: Returning kid sees their progress evaporate to zero until next quiz. Direct hit on the 90%+ retention bar — quiz progress is the core engagement loop, and "you have 0 quizzes" on every relaunch undermines streak continuity messaging. LeaderboardView pulls real `verity_score` from `kid_profiles` (line 209-213 of LeaderboardView.swift) so the kid simultaneously sees score=0 in profile and a non-zero score in Global leaderboard — visibly inconsistent.
- Suggested fix: Extend `loadKidRow()` to select `streak_current, reading_band, verity_score, quizzes_completed_count, articles_read_count` and assign all four into `@Published` properties. Drop the in-memory `+= scoreDelta` / `+= 1` mutations in `completeQuiz` and instead re-call `loadKidRow()` after `KidsAppRoot.handleQuizComplete` so the UI reflects trigger-recomputed server values (the comment block at `KidsAppRoot.swift:230-238` already names `kid_profiles.streak_current` as authoritative — extend the same pattern to score and quizzes_completed_count). Either way, current zero-on-launch is a real regression to fix.
- Verified by: read of `KidsAppState.swift`, `ProfileView.swift`, `LeaderboardView.swift` on disk; `grep` for `verity_score` confirmed the column is selected in `loadGlobal` (LeaderboardView line 209) but never in KidsAppState.

### [P1] `biasedHeadlinesSpotted` badge cannot fire (always passed `false`)
- File: `VerityPostKids/VerityPostKids/KidsAppRoot.swift:249-253` and `VerityPostKids/VerityPostKids/KidsAppState.swift:241-253`
- Issue: `KidsAppRoot.handleQuizComplete` calls `state.completeQuiz(passed: result.passed, score: scoreDelta, biasedSpotted: false)` — third argument is hardcoded `false`. `KidsAppState.completeQuiz` only increments `biasedHeadlinesSpotted` and returns the Bias Detection Level 3 badge when `biasedSpotted == true`. The badge never fires; `biasedHeadlinesSpotted` never increments; the only path to a `BadgeUnlockScene` from quiz completion is dead code.
- Evidence:
  ```swift
  // KidsAppRoot.swift:249-253
  let outcome = state.completeQuiz(
      passed: result.passed,
      score: scoreDelta,
      biasedSpotted: false
  )
  // KidsAppState.swift:241-253
  var badge: BadgeUnlockScene? = nil
  if biasedSpotted {
      biasedHeadlinesSpotted += 1
      if biasedHeadlinesSpotted == 5 {
          badge = BadgeUnlockScene( … "Bias Detection — Level 3" … )
      }
  }
  ```
- Impact: BadgeUnlockScene queue path in `handleQuizComplete` (lines 263-265) is unreachable through normal play. Kids never see the celebration → engagement loss. Badges section in profile shows DB-driven `user_achievements` rows (server-issued), so a server-side achievement-unlock trigger could still populate the profile, but the in-app celebration scene the engagement system was built around never plays.
- Suggested fix: Either (a) extract a "biased option chosen" signal from the quiz attempt (e.g. `chosen.isCorrect && question.questionType == "bias_detection"`, but verify against the schema first) and propagate it through `KidQuizResult` → `handleQuizComplete`, or (b) drop `biasedHeadlinesSpotted` + the dead badge branch entirely and rely on server-side achievement triggers + a re-fetch of `user_achievements` on quiz completion. Don't ship the dead-code path indefinitely.
- Verified by: read of both files on disk; `grep "biasedSpotted" VerityPostKids/` returns only the call site (always `false`) and the function signature.

### [P1] Streak count flickers down on foreground re-load before server trigger lands
- File: `VerityPostKids/VerityPostKids/KidsAppRoot.swift:79-95` and `VerityPostKids/VerityPostKids/KidsAppState.swift:226-240`
- Issue: `completeQuiz(passed: true, …)` does `streakDays += 1` (in-memory). The server-side streak is recomputed by a trigger on `reading_log` insert. On scenePhase → active, KidsAppRoot calls `state.load(forKidId:kidName:)` which calls `loadKidRow()` and *overwrites* `streakDays` with `kid_profiles.streak_current`. If the trigger hasn't fired yet (replication lag, transient connectivity, server-side trigger ordering), the foreground reload pulls the old value and the kid sees: 5 → animate to 6 (StreakScene celebrates) → background app → return → streak shows 5 again. Kids background the app right after a celebration scene constantly — that's the natural flow.
- Evidence:
  ```swift
  // KidsAppState.swift:236-239
  verityScore += scoreDelta
  quizzesPassed += 1
  let oldStreak = streakDays
  streakDays += 1
  // KidsAppRoot.swift:79-95 — onChange(scenePhase == .active)
  await PairingClient.shared.refreshIfNeeded()
  …
  await state.load(forKidId: kid.id, kidName: kid.name)
  // KidsAppState.swift:108 — overwrites in-memory bump
  self.streakDays = row.streak_current ?? 0
  ```
- Impact: Visible regression of celebrated streak number is the worst possible UX for a habit-formation product (engagement bar). The Q33 comment at `KidsAppRoot.swift:232-238` already acknowledges in-memory state shouldn't run ahead of the DB and gates updates on `writeFailures == 0`, but the trigger-lag race isn't covered.
- Suggested fix: Two options — (a) After successful `quiz_attempts` insert, do not increment local `streakDays` until a follow-up `loadKidRow()` confirms the server trigger has applied (with one short retry). The streak celebration would fire from the server-confirmed delta (`row.streak_current > previousStreakDays`). (b) Tag the local bump with a "pending confirmation" sentinel and only run StreakScene after server confirms; if server still shows old value after retry, treat as a soft failure and silently rollback the bump. Option (a) is the cleaner architecture and matches the Q33 comment's intent.
- Verified by: read of both files on disk; the comment at line 232-238 of KidsAppRoot.swift names this exact concern but the mitigation is incomplete.

### [P1] AsyncImage loads `cover_image_url` from arbitrary external hosts (ATS / privacy)
- File: `VerityPostKids/VerityPostKids/KidReaderView.swift:122-132`
- Issue: Article cover images are loaded via `AsyncImage(url:)` from `article.coverImageUrl` (any URL string from `articles.cover_image_url`). No scheme allowlist, no host allowlist, no per-request cache-control. This means: (a) `http://` URLs would hit Apple's ATS exception path and either fail or — if a future Info.plist exception lands — leak unencrypted traffic from a kid device; (b) cover URLs pointing to third-party CDNs (Unsplash, Imgur, news-source CDNs) leak the kid's device IP + network fingerprint to those hosts every time the article list/reader renders. Apple Kids Category review (App Store Review Guidelines 1.3 / 5.1.4) prohibits third-party tracking from kid surfaces; even passive image loads from non-allowlisted domains are scrutinized.
- Evidence:
  ```swift
  // KidReaderView.swift:122-132
  if let urlString = article.coverImageUrl, let url = URL(string: urlString) {
      AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image):
              image.resizable().scaledToFill()
          default:
              gradientPlaceholder
          }
      }
  }
  ```
- Impact: Apple Kids Category submission risk; passive third-party leak from kid-band surface.
- Suggested fix: (a) Validate `url.scheme == "https"` before instantiating `AsyncImage`; fall through to `gradientPlaceholder` otherwise. (b) Add a host allowlist (likely `cdn.veritypost.com`, the supabase storage host, and any other first-party hosts) and reject URLs outside it. (c) The durable fix is server-side: the adult pipeline rewrites externally-sourced covers into a first-party storage bucket so the kid app never fetches from third-party hosts at all. Client-side allowlist is the immediate safety net.
- Verified by: read of `KidReaderView.swift` on disk; confirmed no scheme/host validation upstream — `cover_image_url` flows directly from `articles.cover_image_url` through `KidArticle` model to `AsyncImage`.

### P2 findings

### [P2] PairingClient install-id mismatch path leaves stale UserDefaults kid identity
- File: `VerityPostKids/VerityPostKids/PairingClient.swift:312-331,267-276`
- Issue: When `keychainReadToken()` detects an install-id mismatch (Ext-W.1 freshness check), it calls `keychainDeleteToken()` and returns nil — but it does NOT clear the UserDefaults entries for `kid_profile_id`, `kid_name`, `expires_at`. `restore()` correctly returns nil because the token is gone, so the UI drops to `PairCodeView`. But the next time `clear()` is called (e.g., after user pairs, then signs out), the UserDefaults wipe runs anyway, so it's contained to the in-flight launch. Still, between the install-id-mismatch detection and the next `clear()` or successful `pair()`, `UserDefaults.standard.string(forKey: kidIdKey)` returns the previous kid's ID — any code path reading UserDefaults directly (none today, but easy to introduce) would see stale data.
- Evidence:
  ```swift
  // PairingClient.swift:312-320 — keychainReadToken mismatch branch
  if let storedInstallId = keychainReadInstallId(), storedInstallId != deviceId {
      keychainDeleteToken()
      return nil
  }
  // …no UserDefaults wipe alongside. clear() at lines 267-276 does both, but isn't invoked here.
  ```
- Impact: Latent — no current consumer reads kid_id from UserDefaults directly; all reads go through `restore()` which gates on token presence. Future code reading UserDefaults could surface stale kid identity.
- Suggested fix: When install-id mismatch is detected, either call `clear()` (the full wipe) or duplicate the UserDefaults removeObject calls inline. The simplest fix is to extract a `private func wipeUserDefaults()` and call it from both places.
- Verified by: read of `PairingClient.swift` on disk.

### [P2] scenePhase onChange in KidsAppRoot fires `state.load(...)` on every active transition without debounce
- File: `VerityPostKids/VerityPostKids/KidsAppRoot.swift:79-96`
- Issue: `onChange(of: scenePhase)` runs whenever `scenePhase == .active`. iOS fires `.background → .inactive → .active` on lock+unlock, control-center pull, multitasking switcher, etc. Each fires `refreshIfNeeded()` (cheap, no-op past 24h check) AND `state.load(forKidId:kidName:)` which fires three Supabase queries (kid row + categories + progress counts). No debounce; rapid foreground/background cycles can stack queries.
- Evidence:
  ```swift
  // KidsAppRoot.swift:79-95
  .onChange(of: scenePhase) { _, phase in
      guard phase == .active, let kid = auth.kid else { return }
      Task {
          await PairingClient.shared.refreshIfNeeded()
          if PairingClient.shared.hasCredentials == false { auth.kid = nil; return }
          await state.load(forKidId: kid.id, kidName: kid.name)
      }
  }
  ```
- Impact: Wasted bandwidth + battery on a kid device + race conditions where two simultaneous loads write to the same `@Published` properties (final value depends on which finishes second; the `isLoading` flag is set/cleared per-call without serializing). User-visible flicker is rare but possible.
- Suggested fix: Track last-load timestamp; debounce `state.load` to once-per-5s. Or use a single in-flight Task handle and cancel-and-replace on each scenePhase trigger.
- Verified by: read of `KidsAppRoot.swift` on disk.

### [P2] LeaderboardView shows fake "Rank 1" for kid with no category standing
- File: `VerityPostKids/VerityPostKids/LeaderboardView.swift:58-65,300-316`
- Issue: When `loadCategory()` finds the kid has no rank (RPC returns no row OR returns a row with `rank == nil`), the entry is built as `LeaderboardEntry(id: kidId, name: kidName, score: 0, rank: nil)`. `LeaderRow` is then called with `rank: entry.rank ?? (idx + 1)` which falls back to `1`. The kid sees "Rank 1" with score 0 — visually claiming first place when they have no actual standing in this category.
- Evidence:
  ```swift
  // LeaderboardView.swift:58-65
  ForEach(Array(entries.enumerated()), id: \.element.id) { idx, entry in
      LeaderRow(
          rank: entry.rank ?? (idx + 1),    // ← falls back to 1 for the only entry
          entry: entry, accent: K.teal,
          isSelf: entry.id == auth.kid?.id
      )
  }
  // LeaderboardView.swift:312-315
  } else {
      self.entries = [
          LeaderboardEntry(id: kidId, name: kidName, score: 0, rank: nil)
      ]
  }
  ```
- Impact: Wrong-data shown in category leaderboard. Kid sees themselves at "Rank 1" with score 0 in a category they haven't engaged with.
- Suggested fix: When `row.rank == nil` (or `rows.isEmpty`), render a "no rank yet" empty state for the category instead of a fake row, OR render a "—" rank without a numeric badge. The current `emptyState` view at line 167 already handles `entries.isEmpty`, so the simplest fix is to leave `entries` empty in this branch and let `emptyState` take over with copy like "Read articles in this category to get on the leaderboard."
- Verified by: read of `LeaderboardView.swift` on disk.

### [P2] PairCodeView debug `assert` on server pair-code length is silently skipped in release
- File: `VerityPostKids/VerityPostKids/PairCodeView.swift:40-47,118`
- Issue: The coupling guard `assertServerCodeLengthMatches()` only fires in debug builds — `assert(...)` is a no-op in release. The user-facing copy at line 118 hardcodes "8-character code" in the kid-facing instruction text. If the server-side generator length is changed and only the runtime assert was relied on, release kids would see "Type an 8-character code" but the server would issue (e.g.) 6 characters, the UI's `codeLength = 8` slot would never accept submission, and the `Pair` button would never enable.
- Evidence:
  ```swift
  // PairCodeView.swift:40-47
  fileprivate static let SERVER_PAIR_CODE_LENGTH = 8
  private func assertServerCodeLengthMatches() {
      assert(
          codeLength == Self.SERVER_PAIR_CODE_LENGTH,
          "Pair code UI slot count (\(codeLength)) drifted from server generator …"
      )
  }
  // PairCodeView.swift:118 — hardcoded copy
  Text("…they'll read out an 8-character code…")
  ```
- Impact: Latent — only fires if server-side generator length changes. Release builds offer no signal, so a mid-change drift wouldn't be caught until kid-side pair attempts started silently failing.
- Suggested fix: Either (a) make the copy template-driven from `codeLength` (`"...read out a \(codeLength)-character code..."`) and replace `assert` with a `precondition` so release builds also crash early on mismatch, or (b) ship a build-time check that fails CI if the constants drift. Option (a) is the practical fix.
- Verified by: read of `PairCodeView.swift` on disk.

### [P2] KidQuizEngineView.retryFailedWrites can race on double-tap → stuck spinner
- File: `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:729-749,678-680`
- Issue: `retryFailedWrites()` resets `didTriggerDrain = false` and schedules `Task { await runResultGate() }`. If the kid double-taps "Try again" inside the failure body, two `runResultGate()` tasks race on the second tap: the first flips `didTriggerDrain = true`, the second sees `didTriggerDrain == true` and bails (`guard !didTriggerDrain else { return }`) without flipping `awaitingDrain` back to false. UI stays on `awaitingDrain == true` spinner because the second task returned early.
- Evidence:
  ```swift
  // KidQuizEngineView.swift:729-749
  private func retryFailedWrites() {
      …
      awaitingDrain = true
      drainHadFailures = false
      didTriggerDrain = false
      writeFailures = 0
      Task { await runResultGate() }
  }
  // KidQuizEngineView.swift:678-680
  private func runResultGate() async {
      guard !didTriggerDrain else { return }
      didTriggerDrain = true
      …
  }
  ```
- Impact: Stuck spinner on a double-tapped retry. Recoverable by closing + re-opening the quiz, but for a kid that's confusing.
- Suggested fix: Either (a) disable the retry button while `awaitingDrain == true`, or (b) make `runResultGate()` idempotent by checking a stronger guard than `didTriggerDrain` (e.g., a per-invocation epoch token captured at entry, similar to `dispatchEpoch`). Option (a) is the simplest and matches the existing pattern.
- Verified by: read of `KidQuizEngineView.swift` on disk.

### P3 finding

### [P3] FamilyRow.is_self is decoded but never read
- File: `VerityPostKids/VerityPostKids/LeaderboardView.swift:246-266`
- Issue: `FamilyRow` decodes `is_self: Bool?` from the `kid_family_leaderboard` RPC payload but the entry construction at line 259-265 doesn't use it; the LeaderRow's `isSelf` is computed by comparing `entry.id == auth.kid?.id`. Either drop the field from the decoded struct or use the server-provided value.
- Evidence:
  ```swift
  // LeaderboardView.swift:246-251 — declared
  struct FamilyRow: Decodable {
      let id: String
      let display_name: String?
      let verity_score: Int?
      let is_self: Bool?
  }
  // …never read in the mapping at lines 259-265
  ```
- Impact: Trivial dead field; no functional issue.
- Suggested fix: Remove the field from `FamilyRow` or pass it through to `LeaderboardEntry` and consume it in `LeaderRow`.
- Verified by: read of `LeaderboardView.swift` on disk.

### Notes on what's NOT a finding
- **ParentalGateModal lockout works correctly.** 3 attempts, 5-minute UserDefaults-persisted lockout, timer scheduled on `.common` runloop mode (line 248) so it ticks during user interaction with the modal. `.interactiveDismissDisabled(true)` is on the sheet content (line 283) — correct placement to prevent swipe-bypass. Locked state survives app launch.
- **Kid JWT injection is correct.** `SupabaseKidsClient` injects bearer token as a global header on a fresh client (lines 70-80) rather than calling `setSession` (which would hit GoTrue's `/user` endpoint and fail because kid_profile_id isn't in `auth.users`). RLS reads JWT claims via PostgREST; correct architecture for COPPA (no child accounts in auth.users).
- **Install-id freshness check (Ext-W.1) is sound.** Keychain survives uninstall; UserDefaults does not. `keychainReadToken()` (lines 312-320) compares stored install id against current `deviceId` and clears keychain on mismatch — prevents a previous kid's session leaking to a new install on the same device.
- **`fatalError` in SupabaseKidsClient init (lines 46-52)** is launch-time-only and protects against missing build config (SUPABASE_URL/KEY); fires before any view renders. Not a runtime crash risk.
- **`Color(hex:)` in KidsTheme (lines 126-157)** has explicit dev-time fuchsia fallback — no silent black render on bad hex strings.
- **No PII in logs.** All 18 `print(...)` statements log error descriptions, status codes, file names, or URLs — never kid name, DOB, score, or token. Spot-checked all sites.
- **Reduce-motion paths verified** in StreakScene, BadgeUnlockScene, GreetingScene, QuizPassScene, KidFlame, ParticleLayer — all correctly snap to end-state and skip animation choreography.
- **Apple Kids Category compliance — no third-party SDKs.** Target imports only SwiftUI, UIKit, Foundation, Supabase. No analytics, no crash reporters, no ads.
- **`onOpenURL` handler is a no-op stub.** `VerityPostKidsApp.swift:13-27` logs and drops; not currently a deep-link surface. Re-audit if a route handler is ever added.
- **No StoreKit / IAP code in target** — kids app has no purchases. Apple Kids Category review accepts this.
- **No DOB collection or underage UI inside the kids app.** Kid pair flow doesn't ask for age; the parent assigns reading_band server-side. No COPPA data-collection vector inside the kids app itself.
- **Quiz engine pre-flight verifies `is_kids_safe = true`** at `KidQuizEngineView.swift:355-374` (defense-in-depth on top of RLS, fail-closed on RPC error). Reader applies the same filter at `KidReaderView.swift:298-314`.
- **Streak/quiz scenes have proper async cancellation** (`Task.checkCancellation()` between every `Task.sleep`, `.task` modifier ties lifetime to view) — cancel-mid-animation does not mutate dead view state.
- **Pending quiz_attempts queue is disk-persisted** (`KidQuizPendingPersistence`, `KidQuizPendingHydrator`) so a kid backgrounded-then-killed mid-write resumes on next launch. Sound design.


---

## PM-10 — Cross-Platform-Parity

**Scope:** Compared web ↔ iOS-adult ↔ iOS-kids on 13 shared concepts. Pulled parity flags from PM-1, PM-2, PM-5, PM-6, PM-7, PM-9 report-back sections and verified each on disk; added new findings beyond what the Tier-A PMs surfaced. Audited all 10 rows of the kill-switch inventory in `CLAUDE.md` against current code.

**Headline:** The cross-platform contract is leakier than any individual surface. Web vs iOS-adult drift dominates: pricing literals appear in 4 places (web pricing page TSX, web `/messages` paywall, iOS `StoreManager.swift`, iOS `SubscriptionView.swift`) with the DM paywall already $4 stale. Account-state coverage is asymmetric — web surfaces 15 banner states, iOS-adult surfaces 1 (`frozenAccountBanner`), so iOS users in `muted` / `plan_grace` / `deletion_scheduled` / `verify_locked` / `comped` / `trial-ending` states see no in-app explanation. The kill-switch inventory itself has 3 stale rows (#1 PUBLIC_PROFILE_ENABLED is `true` not `false`, #5 manageSubscriptionsEnabled is `true` and at line 340 not 305, #4 OAUTH_ENABLED has a parallel iOS flag `VPOAuthEnabled` the inventory doesn't mention). Two flag pairs (web `OAUTH_ENABLED` ↔ iOS `VPOAuthEnabled`, `PUBLIC_PROFILE_ENABLED` web-only with no iOS analogue) won't flip in lockstep. iOS-kids vs iOS-adult drift is small and intentional (no IAP, no settings, parental gate added) — the flags reviewed here are appropriate for kids scope.

**Total:** 1 P0 · 8 P1 · 7 P2 · 5 P3 · 3 [DOC-DRIFT] kill-switch table rows.

### [P0] Cross-platform double-billing — same root cause, web AND iOS exposed
> CLOSED in Session 4 — commit 41ea524 (same fix as PM-5's P0; iOS sync 409 returns `stripe_sub_active` shape consumed by SubscriptionConflictSheet on iOS)

This is PM-5's [P0] re-stated through a cross-platform lens to confirm scope: the parity gap touches every cross-provider write on every platform, not just one route.

- Files:
  - Web: `web/src/app/api/stripe/checkout/route.js:70-109`, `web/src/app/api/billing/change-plan/route.js:71-100`, `web/src/app/api/billing/resubscribe/route.js:67-96`, `web/src/app/api/billing/cancel/route.js` (PM-5 #5 in parity drift list extends scope to cancel)
  - iOS-adult sync route: `web/src/app/api/ios/subscriptions/sync/route.js:206-267`
- Issue: All four web billing routes mutate Stripe state without first checking `subscriptions WHERE platform='apple' AND status IN ('active','trialing','past_due')`. Symmetric: iOS sync mutates plan state without checking for active Stripe sub. PM-5 verified the absence with `grep -E "platform.*apple|apple_original|stripe_subscription_id" web/src/app/api/{billing,stripe,ios}/**/*.js` returning zero hits in the relevant routes.
- Cross-platform exposure surface:
  - Web `cancel`: cancels Stripe sub locally for an Apple-billed user — Apple keeps charging.
  - Web `change-plan`: mints a Stripe sub for an Apple-billed user — both providers now charge.
  - Web `resubscribe`: re-mints a Stripe sub for an Apple-billed user whose Stripe sub is already cancelled.
  - Web `checkout`: same as change-plan, fresh checkout session for an Apple-billed user.
  - iOS sync: writes Apple plan state for a Stripe-billed user — local plan state inconsistent with Stripe billing.
- Impact: P0 financial double-charge across platforms. Evident on the support side as "I'm being billed twice" and "I cancelled but I'm still being charged." iOS App Review flags a known case; Apple-side cancel must be done via Settings → Apple ID → Subscriptions and the web app cannot do it via Stripe API.
- Suggested fix (PM-5's, scoped for cross-platform): add a `getActiveSubscriptionPlatform(user.id)` helper in `web/src/lib/stripe.js`. Each web route 409s with `apple_sub_active` if the helper returns `'apple'`. iOS sync 409s with `stripe_sub_active` if it returns `'stripe'`. `cancel` route uses the same helper: if user's active sub is on Apple, redirect them to iOS Settings; if on Stripe, proceed. Single helper, four call sites, plus iOS sync.
- Verified by: PM-5's diff confirmed; cross-checked with my own grep over the four route files for any `platform`/`apple_original_transaction_id` cross-check — zero hits.
- **Needs treatment on:** web (4 routes) + iOS sync route (1) = 5 fix points, single shared lib helper.

### [P1] Pricing fragmentation — DM paywall hardcodes stale `$3.99/mo` while pricing page sells same plan at `$7.99/mo`
> CLOSED in Session 4 — commit 41ea524 (Stream 3 — `messages/page.tsx` imports `FALLBACK_VERITY_MONTHLY` from `pricingCopy.ts`; pricing page reads same source from DB)

- Files:
  - Web pricing page: `web/src/app/pricing/page.tsx:166` — `price="$7.99"` for `planName="verity_monthly"`
  - Web messages paywall: `web/src/app/messages/page.tsx:1006` — `<span style={...}>$3.99/mo</span>` for the same Verity tier
  - iOS-adult fallback: `VerityPost/VerityPost/StoreManager.swift:476-491` — `case Self.verityMonthly: return 799` ($7.99)
  - iOS-adult SubscriptionView legalDisclosures: `VerityPost/VerityPost/SubscriptionView.swift:99-110` (per PM-5 parity drift list)
  - DB: `plans.price_cents` (per PM-5 reads from BillingCard via `getPlans(supabase)`)
- Issue: Four separate hardcodes for the same monthly Verity SKU. Pricing page and StoreManager agree at `$7.99`; messages-paywall says `$3.99`; DB is the only authoritative source and BillingCard is the only consumer reading from it.
- Evidence:
  ```
  // web/src/app/pricing/page.tsx:166
  name="Verity"
  price="$7.99"
  pricePeriod="/mo"
  ```
  ```
  // web/src/app/messages/page.tsx:1006
  <span style={{ fontSize: 13, color: '#666' }}>$3.99/mo</span>
  ```
- Impact: A user sees `$3.99/mo` on the DM paywall, clicks through to `/profile/settings#billing`, opens `/pricing`, sees `$7.99/mo`, balks. P1 because it's user-visible wrong-pricing on the conversion path. Worse: when the owner edits `plans.price_cents` next, the pricing page won't follow (it hardcodes), the messages paywall won't follow (it hardcodes), the iOS app will follow at next App Store Connect submission only, and BillingCard is the only surface that reflects the change immediately.
- Suggested fix: Server-side — pricing page becomes a Server Component that reads `getPlans(supabase)` and renders `formatCents(monthly.price_cents)` (PM-5 Suggested fix). Messages paywall does the same — it's already a client component but can fetch via `/api/settings/public` or via a server-rendered prop. iOS legalDisclosures and StoreManager fallback should reference Apple's `Product.price` (already done at runtime — these are display-only literals; mark as "fallback only, real price comes from Product.price" with a more visible code comment).
- Verified by: file reads of all four sources; cross-reference to PM-5's pricing parity drift item #1.
- **Needs treatment on:** web pricing page + web messages paywall = 2 fix points; iOS literals are fallback-only (correct as-is, just needs better in-code annotation).

### [P1] iOS plan-name mapping uses brittle substring match — `verity` matches `verity_lite` / `verity_pro` / `verity_family`
> CLOSED in Session 4 — commit 41ea524 (Stream 4 — `planByProductID` static dict with exact-match lookup; values are tier-level (`verity` / `verity_family` / `verity_pro`) matching `planPriority` keys)

- File: `VerityPost/VerityPost/StoreManager.swift:437-444`
- Issue: `planName(for productID: String)` uses `productID.contains("verity_family")`, then `.contains("verity_pro")`, then `.contains("verity")` — string-contains match. Returns `"verity"` for any product ID containing the substring. If a future SKU is `com.veritypost.verity_lite.monthly` it returns `"verity"` (wrong). Web reads `plans.name` directly from the DB row keyed on Stripe price ID; no substring match.
- Evidence:
  ```swift
  // StoreManager.swift:437-444
  func planName(for productID: String) -> String {
      if productID.contains(".family.") || productID.contains("verity_family") {
          return "verity_family"
      }
      if productID.contains("verity_pro") { return "verity_pro" }
      if productID.contains("verity") { return "verity" }
      return "free"
  }
  ```
- Impact: P1 latent. No `verity_lite` SKU exists today but the order-dependent contains-match is a footgun. The server-side plan resolver `web/src/lib/appleReceipt.js:284-291` (`resolvePlanByAppleProductId`) does the right thing — looks up `plans WHERE apple_product_id = ?`. iOS should mirror that — use the canonical product-ID → plan map seeded from `plans.apple_product_id`. iOS's local mapping is only used for UI affordances (not server writes), so the impact is "iOS UI shows wrong plan name for a future SKU" not "wrong server state."
- Suggested fix: Replace the contains-chain with an exact-match lookup table seeded from `StoreManager.swift`'s SKU constants (`Self.verityMonthly` etc.) and exposed as a single `static let planByProductID: [String: String]` dict. Same pattern as the existing `kidSeatsForProduct(_:)` which uses contains-match on `.1kid.`/`.2kids.` infixes — that one is also brittle but less risky because the infix is unambiguous.
- Verified by: PM-5 parity drift item #2; full read of `StoreManager.swift:437-456`.
- **Needs treatment on:** iOS-adult only (web doesn't have this pattern; kids has no IAP).

### [P1] Account-state banner asymmetry — iOS-adult surfaces `frozenAccountBanner` only; web has 15 banner states

- Files:
  - Web: `web/src/app/profile/_components/AccountStateBanner.tsx:30-210` — 15 cases (`banned`, `locked_login`, `verify_locked`, `unverified_email`, `deletion_scheduled`, `frozen`, `muted`, `shadow_banned`, `expert_rejected`, `plan_grace`, `expert_pending`, `comped`, `trial-ending-week`, `trial-ending-day`, `trial_extended`, `beta_cohort_welcome`)
  - iOS-adult: `VerityPost/VerityPost/ProfileView.swift:362` — `frozenAccountBanner` only; `ContentView.swift:378` — `sessionExpiredBanner`; `ContentView.swift:417` — `deepLinkErrorBanner`. No `muted`/`plan_grace`/`deletion_scheduled`/`verify_locked`/`unverified_email`/`comped`/`trial-ending-*`/`trial_extended`/`expert_pending`/`expert_rejected` surfacing.
- Issue: An iOS user in any of the 12+ states web surfaces gets no in-app explanation of *why* their actions are blocked (RLS denies, RPC returns 403, UI silently swallows). A `muted` user can't comment but the iOS comment box just disables silently — the user has no path to learn when the mute lifts. A `plan_grace` user gets the same UX as a `frozen` user even though they have an actionable "update payment" affordance. A `deletion_scheduled` user has no in-app way to cancel deletion (web has `Cancel deletion` action button — iOS has nothing).
- Evidence:
  ```swift
  // ProfileView.swift:148-150 — only frozen state surfaced
  if user.frozenAt != nil {
      frozenAccountBanner
  }
  ```
  ```typescript
  // AccountStateBanner.tsx:30-210 — 15 cases
  case 'banned': /* ... */
  case 'locked_login': /* ... */
  case 'verify_locked': /* ... */
  // ...
  ```
- Impact: iOS users in account-state limbo get unexplained denials. P1 because it directly breaks recovery flows (a `verify_locked` user must be told to verify their email; a `plan_grace` user must be told their card needs updating before grace expires). Apple Review 4.0 / 4.3 risk if a reviewer hits one of these states.
- Suggested fix: Port `AccountStateBanner` to iOS as `AccountStateBannerView` consuming the same `users` columns (`frozen_at`, `paused_at`/`muted_until`, `deletion_scheduled_for`, `comped_until`, `verify_locked_at`, `plan_grace_period_ends_at`, `email_verified`). Add to `MainTabView` chrome above the tab content (or inside each tab's scroll view) so it surfaces on every tab the way web's profile shell does.
- Verified by: full read of both files; grep over iOS for `AccountStateBanner` returns 0 hits; iOS has `Models.User.frozenAt` exposed (line 76) but no other state fields decoded — extending requires DB column decoding too.
- **Needs treatment on:** iOS-adult only (web complete, kids N/A — kids app has no adult account states).

### [P1] Web has no push-notification surface at all; iOS-adult ships full APNs registration + delivery

- Files:
  - iOS-adult: `VerityPost/VerityPost/PushRegistration.swift` (108 lines), `PushPermission.swift`, `PushPromptSheet.swift`, `AlertsView.swift:92` (registers user)
  - Web: `grep -rn "serviceWorker\|push_subscription\|PushSubscription\|onesignal\|fcm" web/src/` returns zero hits
- Issue: iOS app maintains APNs device tokens, user-keyed registration, pre-prompt UX (7-day cooldown), permission storage, and delivery handler (`completionHandler([.banner, .sound, .badge])`). Web has no equivalent — no service worker registration, no PushSubscription handling, no Web Push manifest.
- Evidence:
  ```swift
  // PushRegistration.swift:15-47 — full APNs registration pipeline
  final class PushRegistration: NSObject, UNUserNotificationCenterDelegate {
      static let shared = PushRegistration()
      // ...
      UIApplication.shared.registerForRemoteNotifications()
  }
  ```
  ```
  // grep -rn "serviceWorker\|push_subscription" web/src/ → 0 hits
  ```
- Impact: P1 cross-platform inconsistency. A user receives breaking-news push on iOS but never on web — the same `notifications` table row drives the iOS APNs payload but the web client gets nothing. Web-only users (no iOS app) get only in-app inbox notifications. This is a deliberate scope choice or a known gap; flagging because the project includes `PushPromptSheet` UX implying parity.
- Suggested fix: Either (a) ship Web Push (service worker + VAPID + browser notification API + `push_tokens` table extension to handle web subscriptions), or (b) document the asymmetry as intentional in CLAUDE.md so it's not flagged on every review. Path (a) is the parity fix; (b) is the launch-pragmatic move.
- Verified by: grep over both surfaces; PM-6 confirmed iOS-adult side; no Tier-A PM mentioned web push.
- **Needs treatment on:** web only (iOS-adult complete, iOS-kids appropriately N/A — Apple Kids Category disallows targeted push from kid surfaces).

### [P1] iOS-kids has APNs entitlement but no registration code — entitlement drift

- Files:
  - `VerityPostKids/VerityPostKids/VerityPostKids.entitlements` — has `aps-environment` (per PM-7 audit table)
  - `VerityPostKids/VerityPostKids/` — `grep -rn "registerForRemoteNotifications\|UNUserNotificationCenter" VerityPostKids/` returns nothing (per PM-7)
- Issue: Entitlement promises push capability; codebase has no registration. App Review will not reject for unused entitlement (it's permitted) but the entitlement should match actual capability or be removed.
- Evidence (PM-7 audit table line 1488): `Push notifications outbound · n/a · Entitlement has aps-environment (development) but no registration code · N/A for now — flag if registration is added`.
- Impact: P1 latent — if kids push is ever wired up without re-auditing parental-gate posture, the registration would fire without consent. Removing the entitlement now closes that future foot-gun.
- Suggested fix: Either remove `aps-environment` from `VerityPostKids.entitlements` (recommended — Apple Kids Category review prefers tight entitlements), or wire up registration with an explicit COPPA-aware parental opt-in flow. Path (a) is the launch-safe move.
- Verified by: PM-7's audit at REVIEW_REPORT.md:1488; entitlements file (per PM-7 scope read).
- **Needs treatment on:** iOS-kids only.

### [P1] `verityposts://` push deep-link scheme not registered — iOS push payloads silently fail to route

This is PM-6's [P1] re-stated as a parity finding because it's specifically a push-flow gap.

- Files:
  - iOS-adult: `VerityPost/VerityPost/Info.plist:24-27` registers `verity` only; `VerityPost/VerityPost/VerityPostApp.swift:23` parses `scheme == "verityposts"`
  - iOS-kids: `VerityPostKids/VerityPostKids/Info.plist:24-28` registers `veritypostkids` (correct, no drift in kids)
- Issue: Push payloads referencing `verityposts://story/<slug>` (the scheme the comment at `VerityPostApp.swift:16` calls out as "reserved for push payloads") are dropped on arrival because iOS only knows the `verity` scheme. PM-6 flagged this as a P1; flagging here for parity completeness because the equivalent kids deep-link (`veritypostkids://`) IS correctly registered both in the kids `Info.plist` AND in the adult app's `LSApplicationQueriesSchemes`.
- Evidence:
  ```
  // Info.plist (adult) lines 22-29 — only registers 'verity'
  <key>CFBundleURLSchemes</key>
  <array>
      <string>verity</string>
  </array>
  ```
  ```swift
  // VerityPostApp.swift:23
  if scheme == "verityposts", host == "story" {
  ```
- Impact: P1 — every push payload routing through `verityposts://` silently fails to open the correct story. Universal Links via `https://veritypost.com/story/<slug>` still work, so impact depends on which scheme the server-side push sender writes.
- Suggested fix: Per PM-6 — either register `verityposts` in `Info.plist` OR rewrite the parser to use `verity://story/<slug>` and disambiguate from the existing `verity://login` / `verity://reset-password` auth paths.
- **Needs treatment on:** iOS-adult only (web side is the push sender; kids correctly registered).

### [P1] `[slug]/page.tsx:369` "Open in Verity Kids" CTA uses web URL only — does not invoke the `veritypostkids://` deep-link

This extends PM-2's P1 finding ("Open in Verity Kids" CTA has rel without target, navigates current tab) with a parity dimension: the standalone `OpenKidsAppButton` component DOES use the deep-link, but the COPPA-article CTA on the story page does not.

- Files:
  - Web: `web/src/app/[slug]/page.tsx:369-385` — `<a href={process.env.NEXT_PUBLIC_KIDS_APP_URL} ...>Open in Verity Kids</a>`
  - Web: `web/src/components/kids/OpenKidsAppButton.tsx:5,9-13` — uses `KIDS_APP_SCHEME = 'veritypostkids://'` first, then falls back to `/kids-app` after 1.5s timeout
  - iOS-kids `Info.plist:24-28` — registers `veritypostkids` correctly
- Issue: Two surfaces both meant to open the kids app; only one (`OpenKidsAppButton`) actually tries the deep-link. The story-page CTA always navigates to whatever `NEXT_PUBLIC_KIDS_APP_URL` points at (a marketing URL).
- Evidence:
  ```tsx
  // [slug]/page.tsx:369-385 — no scheme attempt
  <a
    href={process.env.NEXT_PUBLIC_KIDS_APP_URL}
    rel="noopener noreferrer"
    style={{ ... }}
  >
    Open in Verity Kids
  </a>
  ```
  ```tsx
  // OpenKidsAppButton.tsx:5-13 — tries scheme first
  const KIDS_APP_SCHEME = 'veritypostkids://';
  // ...
  window.location.href = KIDS_APP_SCHEME;
  setTimeout(() => { window.location.href = KIDS_APP_INFO_URL; }, 1500);
  ```
- Impact: Parents who have the kids app installed get bounced to the web marketing page instead of being deep-linked into the app. P1 — defeats the conversion intent of the CTA.
- Suggested fix: Replace the static `<a>` with a render of `<OpenKidsAppButton />` (the component already handles install-or-not detection via the timeout fallback pattern).
- Verified by: file reads; PM-2 #1313 surfaced the rel-without-target issue on this same line; this finding is the parity dimension.
- **Needs treatment on:** web only.

### [P1] Privacy "Followers-only" copy lies; iOS settings has no privacy-visibility surface at all

- Files:
  - Web: `web/src/app/profile/settings/_cards/PrivacyCard.tsx:158,165` — saves `'private'` for the "Followers" choice; `web/src/app/u/[username]/page.tsx:207-218` — blocks `'private'` for every non-self viewer
  - iOS-adult: `grep -n "profile_visibility" VerityPost/VerityPost/SettingsView.swift VerityPost/VerityPost/ProfileView.swift` returns zero hits — iOS settings has NO privacy-visibility picker
- Issue: PM-2 flagged the web copy lie. Cross-platform dimension: an iOS user who sets their visibility to `'public'` on iOS has no way to do it from iOS at all — they must open web settings. The setting is server-side (a `users.profile_visibility` column with `'public'|'private'|'hidden'`), so the gate works correctly on iOS, but the iOS user has no UI to change it.
- Evidence:
  ```typescript
  // web PrivacyCard.tsx:158
  const dbValue = next === 'public' ? 'public' : 'private';
  // web /u/[username]/page.tsx:207-218
  if ((targetRow.profile_visibility === 'private' || targetRow.profile_visibility === 'hidden') && user.id !== targetRow.id) {
      // ...
  }
  ```
  ```
  // iOS grep — no profile_visibility surface
  $ grep -rn "profile_visibility" VerityPost/VerityPost/
  (no results)
  ```
- Impact: P1 web copy bug + P2 iOS missing-feature. iOS users can't toggle privacy; web users who pick "Followers" think their followers can see their profile but they can't. PM-2 already covers the web-side fix; the parity dimension is "iOS lacks the same control entirely."
- Suggested fix: PM-2's web fix (rename the option or wire the followers-only path); separately, plan an iOS settings card that mirrors `PrivacyCard` (visibility + allow_messages + show_activity). Could be a follow-up post-launch but the asymmetry is a real parity gap.
- Verified by: grep on disk; PM-2 #1287; PM-2 #1295 (related stale kill-switch comment).
- **Needs treatment on:** web (PM-2's fix) + iOS-adult (new privacy settings card).

### [P2] iOS subscription tier list excludes `verity_pro` — grandfathered legacy users see no "current plan" indicator

This is PM-6 parity drift item #3 promoted to a finding here.

- Files:
  - iOS: `VerityPost/VerityPost/SubscriptionView.swift:61-63` renders `free`, `verity`, `verity_family` only
  - iOS: `VerityPost/VerityPost/StoreManager.swift:80-86, 120-121` — Pro is documented as grandfathered; `currentPlan == "verity_pro"` won't match any rendered card
  - Web: `web/src/app/pricing/page.tsx` — does not render `verity_pro` either (per grep)
- Issue: An iOS user grandfathered on `verity_pro` opens the iOS subscription screen and sees no CURRENT badge — the "active plan" UX is broken. Web has the same gap (does NOT render `verity_pro` either), so this is technically aligned drift across both platforms — but the legacy Pro subscriber population is an actual user cohort and they get no acknowledgement of their plan on either surface.
- Evidence:
  ```swift
  // SubscriptionView.swift:61-63
  planCard(plan: "free")
  planCard(plan: "verity")        // line 62 (verified)
  planCard(plan: "verity_family")
  ```
- Impact: P2 — legacy Pro subscribers see no plan indicator. Confusion at "wait, am I still subscribed?" Both platforms agree on this drift, so it's not technically a web↔iOS parity bug, but the iOS surface in particular is the one where they'd most likely renew/check their plan.
- Suggested fix: Either render a fourth grandfathered-Pro card on both surfaces (iOS + web pricing page) when `currentPlan == 'verity_pro'`, OR auto-migrate Pro subscribers on next renewal to the closest current tier (`verity` monthly; the StoreManager priority table at line 120-121 already treats Pro as same priority). Migrate path is what the comment at `StoreManager.swift:435-436` plans ("Pro grandfathers as 'verity_pro' so the server-side migration cron can detect + flip").
- Verified by: file reads; PM-6 parity drift item #3.
- **Needs treatment on:** iOS-adult + web pricing page = 2 fix points (plus optional cron-side auto-migration).

### [P2] Auth flow shape divergence — iOS magic-link only; web has password+OAuth options visible

This is PM-6 parity drift item #1 verified.

- Files:
  - iOS: `VerityPost/VerityPost/AuthViewModel.swift:48` — `static let VPOAuthEnabled = false`; `LoginView.swift:54-66`, `SignupView.swift:71-82` gate OAuth behind this
  - Web: `web/src/app/login/_SingleDoorForm.tsx:9` — `export const OAUTH_ENABLED = false`
- Issue: Two parallel kill-switch flags. Both currently `false`, so today the surfaces match. But when web flips `OAUTH_ENABLED = true`, iOS won't follow automatically — the iOS flag must be flipped separately. CLAUDE.md kill-switch row #4 documents the web flag only.
- Evidence:
  ```swift
  // AuthViewModel.swift:48
  static let VPOAuthEnabled = false
  ```
  ```typescript
  // _SingleDoorForm.tsx:9
  export const OAUTH_ENABLED = false;
  ```
- Impact: P2 deferred — they're aligned today but will drift when one flips. Process risk, not user-visible bug.
- Suggested fix: Update CLAUDE.md kill-switch row #4 to reference both flags (web `OAUTH_ENABLED` + iOS `VPOAuthEnabled`); or move both to a single source-of-truth (DB setting `auth.oauth_enabled` consumed by both).
- Verified by: file reads; PM-6 parity drift item #1.
- **Needs treatment on:** doc-update (CLAUDE.md) + (when ready to enable) both web + iOS.

### [P2] iOS "Continue without signing in" splash affordance has no web analogue — anon UX surface differs

This is PM-6 parity drift item #2 verified.

- Files:
  - iOS: `VerityPost/VerityPost/ContentView.swift:91-99` (slow-network splash) and `:130-134` (timed-out fallback)
  - Web: no equivalent splash gate; `grep -rn "Continue without" web/src/app/page.tsx` returns 0 hits
- Issue: iOS exposes "Continue without signing in" on cold-launch when the auth-status check is slow. Web doesn't have this — refresh recovers, no anon-fallback button.
- Evidence:
  ```swift
  // ContentView.swift:92
  Button("Continue without signing in") { ... }
  ```
- Impact: P2 — intentional iOS-side recovery for offline cold launch, but the resulting anon UX surface (which features show, what's gated) needs to behave the same as web's anon flow. iOS-anon currently sees the tab bar with article reads + leaderboard + browse but with sign-in walls on Profile/Following — likely matches web's anon flow but no test confirms.
- Suggested fix: Document the iOS-only path in CLAUDE.md or a relationship-map note; verify the gated-features list matches web's anon-feature list. No code change unless a feature actually drifts.
- Verified by: file reads; PM-6 parity drift item #2.
- **Needs treatment on:** doc / verification only.

### [P2] Stripe webhook parses `settings.value` as string `'true'` — iOS Apple notifications use the same settings table without the same coercion

- Files:
  - Web stripe webhook: `web/src/app/api/stripe/webhook/route.js:798` — `const autoFreeze = settingRow?.value === 'true';`
  - Web Apple notifications: `web/src/app/api/ios/appstore/notifications/route.js` — uses settings indirectly via downstream RPCs (per PM-5 P2 #393)
- Issue: PM-5 flagged this as latent — settings.value is `text` today but if migrated to JSONB or boolean, the strict-equality comparison silently flips OFF. Cross-platform dimension: iOS-side notification handler doesn't have the same string-coerce comparison, but if the same `settings` row drives behavior on both Stripe (charge.refunded → freeze) and Apple (REFUND notification), an inconsistent coercion produces inconsistent freeze behavior across providers.
- Evidence:
  ```javascript
  // web/src/app/api/stripe/webhook/route.js:798
  const autoFreeze = settingRow?.value === 'true';
  ```
- Impact: P2 latent — fail-open on freeze if the column type ever changes. Cross-platform exposure: a refund processed via Stripe might freeze the account; the same refund processed via Apple might not, depending on which path reads settings with which coercion.
- Suggested fix: Per PM-5 — extract a `parseBooleanSetting(value)` helper in `web/src/lib/settings.js` that handles `'true'` / `true` / `'t'` / `1`. Use it everywhere `settings.value` is read.
- Verified by: PM-5 #377; grep for `settings.value === 'true'` in web/src returned only the one site.
- **Needs treatment on:** web only (single helper, all callers).

### [P2] iOS adult posts comments through `/api/comments` but does not enforce the server's `comment_max_length` client-side

- Files:
  - Server: `web/src/app/api/comments/route.js:106-115` — enforces from `settings.comment_max_length` (default 4000)
  - Web client: `web/src/components/CommentThread.tsx:1040,1176` — `maxLength={1000}` and `maxLength={500}` (both lower than server's 4000)
  - iOS: `VerityPost/VerityPost/StoryDetailView.swift:1627` — `TextField("Join the discussion…", text: $commentText, axis: .vertical)` — no character cap
- Issue: Three surfaces have three caps. Web textareas are stricter than the server (1000/500 vs 4000); iOS has no client-side cap at all. An iOS user typing 4001 chars hits a 400 from the server with no way to know in advance how long is too long. Web users see the maxLength enforced in the textarea.
- Evidence:
  ```swift
  // StoryDetailView.swift:1627 — no cap
  TextField("Join the discussion…", text: $commentText, axis: .vertical)
  ```
  ```javascript
  // /api/comments/route.js:111
  if (typeof body !== 'string' || body.length > commentMaxLength) {
  ```
- Impact: P2 — iOS users get a server-side 400 error on a long comment with no preview/affordance. Web also has the inconsistency between client (1000) and server (4000) caps.
- Suggested fix: iOS — fetch `comment_max_length` from `/api/settings/public` and bind a `.onChange` truncation on `commentText`. Web — align the textarea `maxLength` to match the server-side `commentMaxLength` setting (4000 default).
- Verified by: file reads.
- **Needs treatment on:** iOS-adult + web (CommentThread.tsx) = 2 fix points.

### [P2] Reading-progress / streak: iOS-adult uses `reading_log` + server triggers; iOS-kids uses same mechanism but had a streak-flicker race PM-7 already flagged

- Files:
  - Web: `web/src/app/profile/_sections/MilestonesSection.tsx:411` references `reading_count` / `streak_days` as retired counters; canonical is in `users.streak_current` (presumably) or kid_profiles.streak_current
  - iOS-adult: `VerityPost/VerityPost/HomeView.swift:623,193` — `trackArticleView` fires `reading_log` insert via the server
  - iOS-kids: PM-7 [P1] line 1585 — streak flickers on foreground re-load before server trigger lands
- Issue: All three platforms write to `reading_log` and read `streak_current` from the appropriate row. PM-7's flicker is the kid-app version of the same trigger-lag race. Adult-side iOS doesn't visibly flicker because adults don't have a celebratory streak scene; web doesn't flicker because the reload interval is longer. Cross-platform dimension: the same trigger lag affects all three but only iOS-kids surfaces it visibly.
- Evidence: PM-7 #1585 covers iOS-kids in detail. iOS-adult `HomeView.trackArticleView` fires UserDefaults set + reading_log insert; the streak isn't surfaced animated on adult.
- Impact: PM-7's [P1] is the visible failure. Adult-side is latent (no animated streak surfacing).
- Suggested fix: PM-7's fix (wait for trigger confirmation before incrementing local streak); apply the same pattern adult-side if/when adult ever gets a celebratory streak scene.
- Verified by: PM-7 finding; file reads.
- **Needs treatment on:** iOS-kids (PM-7's fix) + iOS-adult (defensive, if/when adult adds a celebratory streak surface).

### [P3] iOS push prompt label uses `\u{2026}` literal; web equivalent (no web push) has no analog

- Files:
  - iOS: `VerityPost/VerityPost/PushPromptSheet.swift:55` — `Text(isRequesting ? "Asking\u{2026}" : "Turn on notifications")` (PM-6 #802)
- Issue: PM-6 flagged the unicode-escape style inconsistency on iOS-adult. Web has no push-prompt sheet so there's nothing to compare. Including for completeness.
- Impact: PM-6's P2; not a parity finding per se. P3 here.
- Verified by: PM-6 #802.
- **Needs treatment on:** iOS-adult only.

### [P3] iOS adult `LSApplicationQueriesSchemes` lists `veritypostkids` — kids reverse-list does not include adult scheme

- Files:
  - iOS-adult: `VerityPost/VerityPost/Info.plist:34-36` — `LSApplicationQueriesSchemes` contains `veritypostkids`
  - iOS-kids: `VerityPostKids/VerityPostKids/Info.plist:34+` — does NOT have a `LSApplicationQueriesSchemes` entry for `verity` (the adult scheme)
- Issue: Adult app can detect+open kids app; kids app can't open adult app (would silently fail `canOpenURL`). Probably intentional — kids app should never link to adult content — but worth flagging in case a future "thank parent" or "parent dashboard" cross-link is added.
- Evidence:
  ```
  // adult Info.plist:34-36
  <key>LSApplicationQueriesSchemes</key>
  <array>
      <string>veritypostkids</string>
  </array>
  ```
  ```
  // kids Info.plist — no LSApplicationQueriesSchemes for verity
  ```
- Impact: P3 — intentional asymmetry. Kids app should not link out to adult app per Apple Kids Category guidelines.
- Suggested fix: None unless a future feature requires it; if so, audit COPPA/Apple Kids implications first.
- Verified by: file reads of both Info.plists.
- **Needs treatment on:** none currently.

### [P3] Pricing page does not render `verity_pro` — grandfather UX gap (mirrored across web + iOS)

- Files:
  - Web: `web/src/app/pricing/page.tsx` — grep `verity_pro` returns 0 hits
  - iOS: per PM-6 parity drift item #3, also doesn't render
- Issue: Same drift as the [P2] above; flagging again as P3 doc-only because the parity is "both surfaces consistently miss the same case." Single fix would treat both.
- Verified by: file read.
- **Needs treatment on:** see [P2] above; logged as duplicate P3 for the inventory.

### [P3] Trial-duration source-of-truth is split — `plans.trial_days` (DB) + Stripe checkout NOT setting `subscription_data.trial_period_days` + Apple SKU

This is PM-5 parity drift item #3 verified.

- Files:
  - DB: `web/src/types/database.ts:8206` — `plans.trial_days: number`
  - Web Stripe checkout: `web/src/app/api/stripe/checkout/route.js` — does NOT pass `subscription_data.trial_period_days` (per PM-5)
  - Web admin plans: `web/src/app/admin/plans/page.tsx:37,46,66,168,500-501` — `trial_days` field in admin form (so owner can edit it)
  - iOS: `SubscriptionView.swift:118` — legalDisclosures includes "Any unused portion of a free trial period, if offered, will be forfeited" — Apple-side trial config in App Store Connect
- Issue: The DB has a `trial_days` per plan that the admin can edit. Web Stripe checkout ignores it (no `trial_period_days` arg passed to Stripe). Apple-side trial is configured in App Store Connect. Three regimes, not aligned.
- Impact: P3 doc-only — owner edits `trial_days` in admin UI, expects it to drive Stripe checkout, doesn't. iOS independently honors App Store Connect's trial config.
- Suggested fix: Web Stripe checkout reads `plan.trial_days` and passes `subscription_data.trial_period_days = plan.trial_days` if > 0. iOS-side trial config in App Store Connect should match `plan.trial_days` per SKU; document the manual sync requirement.
- Verified by: PM-5 parity drift item #3; database.ts confirms field.
- **Needs treatment on:** web Stripe checkout + doc note that Apple side requires App Store Connect manual sync.

### [P3] Sandbox-vs-Production env handling: present iOS, absent Stripe

This is PM-5 parity drift item #4.

- Files: `web/src/lib/appleReceipt.js` + `web/src/app/api/ios/appstore/notifications/route.js` enforce S4-A4; web Stripe webhook doesn't enforce a parallel `STRIPE_SECRET_KEY` prefix check
- Issue: PM-5 #443 — Stripe webhook secrets are env-distinct so signature verification rejects cross-env traffic; the explicit prefix check would be defense-in-depth.
- Impact: P3 — low risk; flagging for parity completeness.
- Suggested fix: Add a `STRIPE_SECRET_KEY` prefix assertion at webhook bootstrap.
- Verified by: PM-5 #443.
- **Needs treatment on:** web only.

---

### Kill-switch inventory audit (CLAUDE.md vs current code)

| # | Surface | CLAUDE.md cited location | Actual on disk | Match? | Notes |
|---|---------|--------------------------|----------------|--------|-------|
| 1 | `/u/[username]` PUBLIC_PROFILE_ENABLED | `web/src/app/u/[username]/page.tsx:22` | line 22, `const PUBLIC_PROFILE_ENABLED = true;` | **STALE** | Inventory says "flip to true to re-enable" — it IS already `true`. Surface is **live**. PM-2 also flagged. |
| 2 | `/profile/[id]` redirect via PUBLIC_PROFILE_ENABLED | `web/src/app/profile/[id]/page.tsx` | The file is a thin redirect to `/u/${username}` (line 18) — does NOT reference PUBLIC_PROFILE_ENABLED at all | **STALE** | The flag is not consulted in this file. It's just a redirect; would only need updating if `/u/[username]` is dead. |
| 3 | Public profile share link in `/profile` | `web/src/app/profile/_sections/PublicProfileSection.tsx:192` | line 191-193 — comment "Re-enable when PUBLIC_PROFILE_ENABLED flips to true" still present, share link still suppressed | **STALE** | Flag #1 has flipped; this section's share-link block was never re-enabled. PM-2 #1295 also flagged. |
| 4 | OAuth login OAUTH_ENABLED | `web/src/app/login/_SingleDoorForm.tsx:9` | line 9, `export const OAUTH_ENABLED = false;` | OK (web side) | But CLAUDE.md doesn't mention iOS's parallel `VPOAuthEnabled` flag at `AuthViewModel.swift:48`. **DOC GAP.** |
| 5 | iOS alerts manageSubscriptionsEnabled | `VerityPost/VerityPost/AlertsView.swift:305` | line 340, `private let manageSubscriptionsEnabled = true` | **STALE** | (a) Line number is wrong (340 not 305); (b) Flag is `true` not the documented `false`. PM-6 #844 flagged this as KILL-SWITCHED drift. The `manageContentLive` view renders, exposing the broken Add buttons (PM-6 #694 [P1]). |
| 6 | `/ideas/*` middleware admin gate | `web/src/middleware.js:165` | line 165 area is the admin pass-through `if (pathname.startsWith('/ideas')) { return NextResponse.next(); }` — admin-gate is elsewhere | OK (kind of) | The cited line is the env-var-bypass shortcut for `/ideas`; the actual middleware admin-gate is later. The note is correct in intent but the line citation is imprecise. |
| 7 | Sitewide holding mode | `web/src/app/preview/route.ts` | Confirmed — references `NEXT_PUBLIC_SITE_MODE=coming_soon` at line 5 | OK | |
| 8 | RSS ingest pipeline `ai.ingest_enabled` | DB setting; admin UI `web/src/app/admin/pipeline/settings/page.tsx:33` | Setting key referenced in admin UI + 1 newsroom call site | OK | DB-flag, no code drift. |
| 9 | Adult article generation `ai.adult_generation_enabled` | DB setting; admin UI line 34 | Setting key referenced in admin UI + `web/src/app/api/admin/pipeline/generate/route.ts:216,224` | OK | DB-flag, no code drift. |
| 10 | Kids article generation `ai.kid_generation_enabled` | DB setting; admin UI line 35 | Setting key referenced in admin UI + same generate route | OK | DB-flag, no code drift. |

**Verdict:** 4 of 10 rows are stale or imprecise (#1, #2, #3, #5). Row #4 has a **documentation gap** (no mention of iOS counterpart flag). Rows #6, #8-10 are accurate or close-enough.

### [DOC-DRIFT] Kill-switch row #1 — flag is `true` not the documented `false`
- Suggested fix: Remove from active kill-switch inventory or rewrite the "How to re-enable" column to "Already live; flip back to `false` to disable."

### [DOC-DRIFT] Kill-switch row #3 — share link in `/profile` was never re-enabled though row #1 flipped
- Suggested fix: Per PM-2 #1295, re-enable the share-link block at `PublicProfileSection.tsx:191-193`. Update CLAUDE.md row #3 to reflect "live" state OR drop the row.

### [DOC-DRIFT] Kill-switch row #5 — line number wrong (340 not 305) AND flag is `true` not `false`
- Suggested fix: Update CLAUDE.md row #5 line number. Per PM-6 #844, flip the flag back to `false` (launch-safe path) OR mark this row as "live" and remove from kill-switch inventory.

### [DOC-DRIFT] Kill-switch row #4 — iOS counterpart flag not documented
- Suggested fix: Add a sub-bullet under row #4 noting `VPOAuthEnabled` at `VerityPost/VerityPost/AuthViewModel.swift:48` must flip in lockstep with the web flag.

### Summary: total by severity
- **P0:** 1 (cross-platform double-billing — PM-5 P0 confirmed in cross-platform scope)
- **P1:** 8 (pricing fragmentation, iOS plan-name brittle match, iOS account-state banner gap, web push absent, iOS-kids APNs entitlement drift, verityposts:// scheme unregistered, kids-app deep-link not invoked from story page, privacy "Followers" iOS missing entirely)
- **P2:** 7 (Pro grandfather UX gap, auth-flag drift potential, iOS continue-anon parity, settings.value coercion, comment-length cap mismatch, streak flicker port, iOS push label unicode literal)
- **P3:** 5 (kids-doesn't-query-adult-scheme, pricing-page Pro re-statement, trial-duration split, Stripe sandbox/prod check, plus 1 already in PM-5/6 lanes)
- **DOC-DRIFT:** 4 kill-switch inventory rows (#1, #3, #5, plus #4 doc gap)

### Every P0 in full
**[P0] Cross-platform double-billing — same root cause, web AND iOS exposed**
(see findings above; this is the single P0 — it's PM-5's P0 reaffirmed across platforms)
- Web routes lacking Apple-sub precheck: `stripe/checkout`, `billing/change-plan`, `billing/resubscribe`, `billing/cancel` (4 routes)
- iOS sync route lacking Stripe-sub precheck: `ios/subscriptions/sync` (1 route)
- Single shared helper closes all 5 sites.

### Cross-platform fixes the architect should bundle (by "needs treatment on N platforms")

**5 platforms / fix points:**
1. **[P0] Apple-sub / Stripe-sub cross-platform precheck** — 4 web routes + 1 iOS sync route, single helper. **Most impactful.**

**2 platforms / fix points:**
2. **[P1] Pricing fragmentation** — web pricing page (read DB) + web messages paywall (read DB or settings).
3. **[P1] Privacy controls parity** — web copy fix (PM-2's) + iOS new privacy-settings card (or doc the gap).
4. **[P2] Pro grandfather card** — iOS SubscriptionView + web pricing page.
5. **[P2] Comment length cap alignment** — iOS adds client-side cap from `/api/settings/public` + web aligns `maxLength` to server's 4000.

**1 platform fixes (still parity-relevant):**
6. **[P1] iOS account-state banner port** — port web's `AccountStateBanner.tsx` to iOS-adult.
7. **[P1] Web push absence** — either ship Web Push or document the asymmetry.
8. **[P1] iOS-kids APNs entitlement** — remove from `VerityPostKids.entitlements` (no consumer).
9. **[P1] verityposts:// scheme** — register in iOS-adult `Info.plist` (PM-6's fix).
10. **[P1] iOS plan-name mapping** — replace contains-chain with exact-match dict.
11. **[P1] Story-page "Open in Verity Kids"** — replace static `<a>` with `<OpenKidsAppButton />` component.

**Doc fixes:**
12. **CLAUDE.md kill-switch inventory** — refresh rows #1, #3, #5 (stale state); add iOS counterpart flag note to row #4.


---

## PM-11 — Adversary-Sweep

Independent re-audit of the 4 elevated-care surfaces (auth, billing+iOS, kids iOS, DB/RLS). Cross-checked against PM-1, PM-5, PM-7, PM-8 to avoid duplicates. Verified every finding against on-disk code or live `pg_proc` / `pg_policies` rows via Supabase MCP.

**Severity totals (NEW findings only): P0 = 3, P1 = 5, P2 = 3.**

### [P0] `users_protect_columns` trigger leaves `trial_extension_until` (and 14+ other state columns) unprotected — direct PostgREST UPDATE bypasses every server-side T304 / kid-trial / mute / lockout gate

- File: live `pg_proc` for `public.users_protect_columns()` (verified via `pg_get_functiondef`); `web/src/app/api/stripe/checkout/route.js:100`; `web/src/app/api/billing/change-plan/route.js:95`; `web/src/app/api/billing/resubscribe/route.js:91`
- Issue: PM-8's "auth_sync GUC bypass" P0 framed `users_protect_columns` as "the legitimate gate, just leaky via GUC." Adversary read of the live trigger body shows **the protected-column allowlist itself omits multiple state columns the application code uses for security gates** — so an authenticated user does not need the GUC bypass to compromise these. Direct `UPDATE public.users SET … WHERE id = auth.uid()` via PostgREST hits the trigger, the trigger has no `IS DISTINCT FROM` block on these columns, and the write succeeds:
  - **`trial_extension_until`** — the T304 guard in stripe/checkout, billing/change-plan, billing/resubscribe (`if (me?.trial_extension_until && new Date(me.trial_extension_until) > new Date())`) gates upgrade attempts. A user can `UPDATE users SET trial_extension_until='2099-12-31'` and immediately get permanent free access on every paid surface that consults this gate. NOT covered by the trigger; NOT covered by `update_own_profile` (RPC has its own allowlist); only PostgREST direct UPDATE is required.
  - **`kid_trial_used`, `kid_trial_started_at`, `kid_trial_ends_at`** — kid-trial state. Self-flip resets kid trial usage flags or extends `kid_trial_ends_at` past expiry.
  - **`failed_login_count`, `locked_until`** — brute-force lockout state. Self-clear defeats `record_failed_login` / `clear_failed_login` (the latter is already a P0 in PM-8's mass-impersonation list, but this is the same effect via direct UPDATE on the user's own row).
  - **`is_muted`, `muted_until`, `mute_level`, `warning_count`, `last_warning_at`** — moderation state. A muted user can self-clear `muted_until` and post immediately.
  - **`parent_pin_hash`, `kids_pin_hash`, `pin_attempts`, `pin_locked_until`, `is_kids_mode_enabled`, `has_kids_profiles`** — parental-control PIN state. Self-set `parent_pin_hash` to a known bcrypt hash defeats the PIN-required moderation flow.
  - **`comment_count`, `articles_read_count`, `quizzes_completed_count`, `followers_count`, `following_count`** — engagement counters used by the leaderboard. Self-pump for ranking gaming.
  - **`streak_*` columns** — streak gaming.
  - **`onboarding_completed_at`** — bypass onboarding gate.
  - **`deletion_requested_at`, `deletion_scheduled_for`** — manipulate scheduled deletion timeline (defer / accelerate own deletion).
- Evidence (verbatim trigger column-check list per `pg_get_functiondef('public.users_protect_columns')`):
  ```
  Protected: cohort, cohort_joined_at, comped_until, verify_locked_at,
             plan_id, plan_status, plan_grace_period_ends_at,
             stripe_customer_id, frozen_at, frozen_verity_score,
             perms_version, perms_version_bumped_at, referred_by,
             referral_code, invite_cap_override, is_banned, is_shadow_banned,
             ban_reason, banned_at, banned_by, email_verified, email_verified_at,
             phone_verified, phone_verified_at, is_expert,
             is_verified_public_figure, expert_title, expert_organization,
             verity_score, username (when set)
  ```
  Cross-referenced with `information_schema.columns` for `public.users`. The columns listed above as missing are present on the table but not in the trigger's column-check list.
- Impact: P0 — exploitable now from any authenticated session against the production REST API. Most severe path: `trial_extension_until` self-extend grants permanent paywall bypass. (extends PM-8 finding "users_protect_columns auth_sync GUC bypass" — same trigger, different exploit vector that works WITHOUT the GUC.)
- Suggested fix: extend the trigger's column-check list to cover every state column the application reads for security gates. Prefer an inverted allowlist — name the editable columns (`display_name`, `bio`, `avatar_*`, `banner_url`, `profile_visibility`, `show_*`, `allow_messages`, `notification_*`, `att_*`, `dm_read_receipts_enabled`, `metadata`, `last_login_at`, `last_active_at`, etc.) and reject anything else for self-update. Mirrors `update_own_profile`'s shape and means new sensitive columns can't drift unprotected.
- Verified by: `pg_get_functiondef('public.users_protect_columns')`, `information_schema.columns` for public.users, code reads of the three billing routes, code read of `update_own_profile` body.
> CLOSED in Session 1 — migration `20260503000011_session1_drop_gucs_extend_users_protect.sql` (PM-B). Adopted the suggested-fix shape: inverted allowlist that mirrors `update_own_profile`'s writable field set; everything else (incl. `trial_extension_until`, `kid_trial_*`, `failed_login_count`, `locked_until`, `mute_*`, `pin_*`, parental-control state, engagement counters, `streak_*`, `onboarding_completed_at`, `deletion_*`) raises 42501 on self-update.

### [P0] `kid_profiles` has no equivalent of `users_protect_columns` — parents can directly UPDATE their kids' COPPA consent rows, max_daily_minutes cap, paused_at, scores, streaks, PIN state, and global-leaderboard opt-in via PostgREST
> CLOSED in Session 1 — migrations `20260503000012_session1_kid_profiles_protect_and_pair_code_csprng.sql` (PM-C) + `20260503000014_session1b_adversary_followups.sql` (Session 1b). Trigger `kid_profiles_protect_columns_trg` BEFORE INSERT OR UPDATE. UPDATE branch denies changes to all COPPA, score, streak, PIN-lockout, band, identifier, and metadata columns. INSERT branch forces protected columns to server-managed defaults for non-privileged callers.

- File: live `pg_policies` for `public.kid_profiles`; `pg_trigger` for the table
- Issue: `kid_profiles_update` policy is `((parent_user_id = auth.uid()) AND has_permission('profile.kids'::text))` with NULL `with_check` (defaults to USING). Triggers on the table: `enforce_kid_dob_immutable`, `enforce_band_ratchet`, `enforce_max_kids`, `update_updated_at_column`. **Critically, only DOB and reading_band are protected.** Every other column on the table can be self-updated by the parent via `PATCH /rest/v1/kid_profiles?id=eq.<kid_id>`:
  - **`coppa_consent_given` + `coppa_consent_at`** — COPPA evidentiary record. The kid creation routes (`/api/kids/route.js:198`, `/api/family/add-kid-with-seat/route.ts:350`, `/api/kids/trial/route.js:121`) set these server-side, paired with a `parental_consents` row that carries IP + UA + `consent_method`. A parent can self-update `coppa_consent_given=true, coppa_consent_at=<arbitrary timestamp>` to forge a consent timestamp without the matching `parental_consents` row. Forensic + compliance hole.
  - **`max_daily_minutes`** — daily reading-time cap. Parent can self-raise.
  - **`paused_at`** — parental pause flag. Parent can self-clear (likely intentional — parents own this — but no audit trail).
  - **`global_leaderboard_opt_in`** — opt-in for the public kids' leaderboard. Self-flip silently surfaces a kid's display_name onto the public leaderboard with no audit row. PM-8 missed this because it focused on RLS policy logic, not application semantics of the column being writable.
  - **`pin_hash`, `pin_salt`, `pin_attempts`, `pin_locked_until`, `pin_hash_algo`** — kid-PIN state. Parent can rewrite; they own this surface, but absence of audit trail is a compliance gap.
  - **`reconsent_required_at`, `reconsented_at`** — band-change reconsent flow. Self-update flips reconsent flags without the underlying ceremony.
  - **`verity_score`, `articles_read_count`, `quizzes_completed_count`** — score gaming. Parent can pump their kid's score for the family leaderboard; the existing `enforce_band_ratchet` only watches `reading_band`.
  - **`band_history`** — JSONB transcript of band changes. Self-rewrite forges historical band record.
- Evidence: `pg_policies` for `kid_profiles`, `pg_trigger` for the table (4 triggers, none touching the listed columns), policy body verified via `pg_get_functiondef` cross-check on `enforce_band_ratchet` (only watches `reading_band` and `band_changed_at`).
- Impact: P0 — directly exploitable. Worst-case path: forge `coppa_consent_given` after the fact when an admin asks for proof of consent (the matching `parental_consents` row would still be missing, but a sloppy audit might not notice). Also a vector for kids' ranking inflation on the family/global leaderboards.
- Suggested fix: add a `kid_profiles_protect_columns` BEFORE-UPDATE trigger. Hard-protect `coppa_consent_given`, `coppa_consent_at`, `verity_score`, `articles_read_count`, `quizzes_completed_count`, `band_history`, `reconsent_required_at`, `reconsented_at`, `streak_current`, `streak_best`, `streak_last_active_date` from self-update. Allow parent to update only the parental-control surface (`display_name`, `avatar_*`, `max_daily_minutes`, `paused_at`, `pin_hash`+`pin_salt`+`pin_hash_algo` (admin-grade-checked), `global_leaderboard_opt_in`, `is_active`, `metadata`). For `coppa_consent_*` — invariant after first set: only service_role / RPC can write.
- Verified by: `pg_policies`, `pg_trigger`, `pg_get_functiondef('enforce_band_ratchet')`, `information_schema.columns`.

### [P0] Kid pair codes generated via PostgreSQL `random()` (non-CSPRNG) — predictable seed allows brute-force during 15-minute window
> CLOSED in Session 1 — migration `20260503000012_session1_kid_profiles_protect_and_pair_code_csprng.sql` (PM-C). Function body uses `gen_random_bytes(1)` with rejection sampling against the 31-char alphabet to avoid modulo bias. (Session-0 wrote `20260503000008` with the same body but the migration row never landed; PM-C re-issued and recorded.)

- File: live `pg_proc.generate_kid_pair_code` body
- Issue: The pair-code generator picks 8 chars from a 31-char alphabet using `random()`, PostgreSQL's standard linear-congruential PRNG. `random()` is documented as **not cryptographically secure** — its state is per-backend, seeded once, and predictable from any other observed `random()` call on the same backend. An attacker who can observe one `random()` output (e.g., via any RPC that returns a derivative random value, or any SQL surface that exposes randomness) can predict subsequent outputs from the same backend.
  - More directly: a same-session attacker (a parent on a poisoned device, or a misconfigured admin tool) can force `setseed()` on the backend, then trigger pair-code generation. With a known seed, the resulting 8-char code is fully predictable.
  - Even WITHOUT seed manipulation, the `random()` state has only 48 bits of effective entropy and is shared across all callers on the same backend. A parallel attacker who can observe ANY randomness output from the same backend can correlate.
  - Pair-code validity is 15 minutes (`v_expires := now() + interval '15 minutes'`). Combined with rate-limit on POST `/api/kids/pair` (10/min/IP + 10/min/device — `web/src/app/api/kids/pair/route.js:47-93`), brute force is gated to ~14k attempts in 15 min from a botnet across many IPs. Far below 31^8 ≈ 8.5×10^11 — but the attacker isn't blind-guessing, they're constraining the candidate space via predictable PRNG output.
- Evidence (verbatim from live `pg_get_functiondef`):
  ```
  v_alphabet := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  ...
  FOR v_i IN 1..8 LOOP
      v_code := v_code || substr(v_alphabet,
          (1 + floor(random() * length(v_alphabet)))::int, 1);
  END LOOP;
  ```
  Postgres docs (https://www.postgresql.org/docs/current/functions-math.html): "The random() function uses a deterministic pseudo-random number generator. It is fast but not suitable for cryptographic applications."
- Impact: P0 — kid-account takeover via pair-code prediction during the 15-minute window. Severity is qualified by needing some signal of `random()` state, which today's surface largely doesn't expose. But the failure mode is correct on its face — Apple Kids Category review treats kid-account compromise as Severity 1.
- Suggested fix: replace `random()` with `gen_random_bytes()` (pgcrypto, already installed per `pg_extension`):
  ```
  v_code := encode(gen_random_bytes(6), 'base32');
  -- then strip ambiguous characters (I/L/O/0/1) to keep readability
  ```
  Or generate at the JS layer (route handler) using `crypto.randomInt` from Node's CSPRNG and pass into a redemption RPC. Either way, drop `random()` from any auth-or-money-adjacent code.
- Verified by: `pg_get_functiondef('public.generate_kid_pair_code')`, Postgres docs.
> CLOSED in Session 0 — commit 0ed48a4 (migration `20260503000008_generate_kid_pair_code_csprng.sql`: `gen_random_bytes(1)` per char with rejection sampling against `256 - (256 % 31) = 248` to remove modulo bias). **Owner action required: apply migration via `supabase db push` or dashboard SQL editor — MCP is read-only so the live DB still has the `random()` body until applied.**

### [P1] Magic-link confirm path is GET-shaped — magic-link-prefetch by browser / email-client preview consumes the OTP before the user clicks

- File: `web/src/app/api/auth/confirm/route.ts:20` (`export async function GET(request: NextRequest)`)
- Issue: The magic link in the email points at `${siteUrl}/api/auth/confirm?t=<hashed_token>&e=<email>`. Many email clients (iOS Mail, Gmail desktop, Outlook web), antivirus URL scanners (Microsoft Safe Links, Cisco URL Defense, Mimecast, Proofpoint), and link-preview services (Slack unfurl, iMessage preview) issue an HTTP GET against every URL in inbound mail before the user ever clicks. Each of these GETs:
  1. Hits the IP-rate-limit (`AUTH_MAGIC_LINK_CLICK_PER_IP`, `route.ts:34-42`).
  2. **Calls `verifyOtp({ token_hash, type: 'magiclink' })` on Supabase, which atomically marks the token used.**
  3. Sets a session cookie on whatever `User-Agent` issued the request (a server in Microsoft's datacenter, not the user's browser).
  4. Runs `runSignupBookkeeping` for new users, including beta-gate, deleteUser-on-deny, and access-code consumption.
  When the user *finally* clicks, the token is already used → redirect to `/login?error=link_expired`. Worse, on first-signup paths, the user's signup has already been bookkept against an attacker-or-scanner's session cookie that lives in their datacenter — but is invalidated by IP / cookie mismatch the next time the real user shows up.
  Standard mitigations Supabase even documents (https://supabase.com/docs/guides/auth/concepts/redirect-urls#prefetch-protection):
  - Use a POST-shaped confirm endpoint behind a one-tap "Confirm" interstitial page that the link's GET serves
  - Or check `Sec-Purpose: prefetch` header and respond 200 without consuming
  - Or move all token-consumption to a separate POST after the GET landing page renders
  Neither mitigation is in place. The route consumes the token on GET.
- Evidence: `web/src/app/api/auth/confirm/route.ts:20-56` — `GET` handler immediately calls `otpClient.auth.verifyOtp({ ... type: 'magiclink' })` before any user interaction.
- Impact: P1 — on any corporate / educational / enterprise email environment that runs URL scanners (a large fraction of legitimate Verity Post users), magic links are **systematically broken**. The user-visible failure is generic "link_expired" with no explanation. Conversion-loss + support load. Plus the 8-digit OTP code path still works (PM-1 P0 about that path's redirect-to-home-on-typo aside), so users do have a fallback — but it's not signposted on the failure screen.
- Suggested fix: serve the GET as an HTML interstitial that renders a one-tap "Confirm sign-in" button which POSTs back to a confirm endpoint — verifyOtp moves to the POST. Or: detect `Sec-Purpose: prefetch` / bot-shaped User-Agents on the GET and skip token consumption (defensive but fragile because corporate URL scanners often forge browser UAs). Note that `lib/botDetect` exists in the codebase per PM-1's scope inventory; check whether it's threaded through here.
- Verified by: file read; checked that `verifyOtp` is called pre-render.

### [P1] `/api/auth/check-username` accepts both GET (querystring) and POST (JSON body) — GET form bypasses any future CSRF token system and is browser-cacheable

- File: `web/src/app/api/auth/check-username/route.js:90-96`
- Issue: The route handles `GET` via querystring `?u=<name>` and `POST` via JSON body `{ username }`. Both run through the same `handle(request)`. The GET form has two adversarial properties POST doesn't:
  1. **Cacheable across CDN / browser layers despite `Cache-Control: private, no-store`**. The intermediate Vercel edge is told no-store, but a malicious browser extension or shared proxy can still cache the URL+response pair, leaking which usernames an authed user probed.
  2. **CSRF-safe by design only because `getUser()` requires a session cookie**. But the GET shape means a `<img src="/api/auth/check-username?u=…">` from any origin still hits the route (browser sends the session cookie); the response body is ignored by `<img>` but the rate-limit slot is consumed. PM-1 noted the per-session rate-limit is 30/min — a hostile site can burn the user's entire username-check budget by image-tagging 30 random usernames.
- Evidence: lines 90-96 — `export async function GET(request)` and `export async function POST(request)` both call `handle(request)`. `getUser()` uses cookie-scoped Supabase client by default (`lib/auth.js:131-191`).
- Impact: P1 — rate-limit denial via cross-origin GET embed. Authed user's username-check quota consumable by any visited hostile site. Compounds with PM-1's noted "per-session-only rate limit, no per-IP gate" finding (extends PM-1 P2: `/api/auth/check-username only enforces session-scoped rate limit, not per-IP`).
- Suggested fix: drop the GET handler. POST-only routes can't be invoked via `<img>` / `<script>` cross-origin without CORS preflight (which the middleware allow-list already gates). Or: gate GET on `Sec-Fetch-Site: same-origin` header (defensive but incomplete cross-browser).
- Verified by: file read.

### [P1] Apple S2S notifications: `signedDate` 5-minute window is checked, BUT no per-`originalTransactionId` notification-ordering enforcement → REVOKE-then-DID_RENEW reorder restores access on a refunded subscription
> CLOSED in Session 4 — commit 41ea524 (Stream 2 — migration 20260503000020 adds `subscriptions.last_terminal_event_at` + `last_terminal_event_type`; REVOKE/REFUND/EXPIRED handlers stamp; SUBSCRIBED/DID_RENEW/REFUND_REVERSED compare `transaction.signedDate <= terminalMs` and 200-without-RPC on out-of-order; audit_log row `apple_notif_reorder_ignored`. Owner action: apply migration)

- File: `web/src/app/api/ios/appstore/notifications/route.js:366-457`
- Issue: PM-5's findings cover env-gating, JWS validation, signedDate replay, mint-on-fallback ergonomics. None of them cover **temporal ordering of notifications for the same `originalTransactionId`**. Apple's S2S delivery is best-effort — a `REVOKE` (or `REFUND`) notification can land seconds before, simultaneous with, or seconds AFTER a `DID_RENEW` for the same sub. The route's switch handles each notification independently:
  - `REVOKE` → `billing_freeze_profile(p_user_id)` + `subscriptions.status='cancelled'`
  - `DID_RENEW` → `billing_change_plan` (or `billing_resubscribe` if frozen) + `subscriptions.status='active'`
  Sequence: if Apple delivers `DID_RENEW` AFTER `REVOKE` (which can happen if the renewal landed during the user's refund-grace period and Apple's queues reorder them), the DID_RENEW handler runs `billing_resubscribe` (because user is frozen from the REVOKE), reactivating the subscription against a refunded receipt. The `signedDate` check passes for both because both are within their respective 5-minute windows.
  - The webhook_log idempotency is keyed on `notificationUUID` — different notifications get different UUIDs, so neither suppresses the other.
  - There's no check on `transaction.signedDate` vs the existing `subscriptions.cancel_reason='apple_revoke'` row (or any kind of ordering token) to refuse a REACTIVATE when the prior action was REVOKE within the same transaction's lifecycle.
- Evidence: `route.js:386-396` (REVOKE handler — only sets status='cancelled' + freeze, no immutable marker); `route.js:411-457` (renewal handler — does `billing_resubscribe` if frozen unconditionally); no ordering guard.
- Impact: P1 — exploitable under Apple's documented out-of-order delivery. Revoked-then-renewed = reactivate a refunded sub. Real-world frequency low (Apple usually orders correctly), but the failure mode is silent.
- Suggested fix: add a `subscriptions.last_terminal_event_at` column (or read from `webhook_log` joined on `originalTransactionId` via `event_id LIKE 'apple_notif:%'`). When processing SUBSCRIBED / DID_RENEW / REFUND_REVERSED, verify `transaction.signedDate > subscriptions.cancel_reason_set_at` (or the equivalent timestamp on `webhook_log`). If the renew is older than the last revoke, log `apple_notif_reorder_ignored` and 200 without re-activating.
- Verified by: route file read end-to-end; cross-checked against `assertSignedDateFresh` in `appleReceipt.js` (only confirms freshness, not ordering).

### [P1] `users_protect_columns` trigger does NOT log bypass attempts to `audit_log` — every successful write of a protected column raises 42501 but never surfaces ops-side

- File: live `pg_proc` for `users_protect_columns`
- Issue: Every protected-column self-update raises a Postgres exception with errcode 42501 ("insufficient privilege"). PostgREST converts that to an HTTP 403. The user sees `{"code":"42501","message":"users.is_banned is read-only for self-update"}`. **Nothing is logged to `audit_log` or `rate_limit_events`** — so a user attempting to self-clear a ban, self-grant comp, or self-extend a trial leaves zero forensic trail in the database. Ops only sees it if Vercel function logs catch the PostgREST error (which they don't, because the route handler never sees it — the user's bearer goes direct to PostgREST for `/rest/v1/users` PATCH).
- Evidence: `pg_get_functiondef('public.users_protect_columns')` — every branch raises EXCEPTION but no `INSERT INTO audit_log`. Compare with the documented pattern in other security definer functions in the project (`record_failed_login`, `lockdown_self`, `audit_log_insert` calls).
- Impact: P1 — defense-in-depth gap. A real attempt to escalate goes undetected. Pairs with the trigger's column-list gap (P0 above) and the GUC bypass (PM-8 P0) — three layers, none of which alert.
- Suggested fix: add an exception block that inserts to `audit_log` with `actor_id = auth.uid()`, `action = 'users.protect_columns.bypass_attempt'`, metadata pointing at the column name + OLD/NEW values, **before** raising the exception. Keep the exception so the write is still rejected; the audit log gives ops a signal.
- Verified by: trigger body read; `audit_log` table comment review.

### [P1] iOS subscription sync route's "no-token + existing-row-mismatch" path lets a logged-in user bind their account to another user's apple_original_transaction_id when the prior subscriptions row was deleted

- File: `web/src/app/api/ios/subscriptions/sync/route.js:223-249`
- Issue: The S-002 guard rejects "no `appAccountToken` AND no existing subscriptions row" (line 247). But it does NOT cover the case where an existing subscriptions row was previously DELETED (admin cleanup, kid_profiles cascade, etc.). After delete:
  - `existingSub` is null
  - `appAccountToken` is missing (legacy receipt) → S-002 fires → 400

  That's actually correct. **But** on a receipt where `appAccountToken` IS present and matches the bearer's userId, AND there is no existing subscriptions row (deleted), the route falls through to `INSERT INTO subscriptions` (line 266). The INSERT is ON `apple_original_transaction_id`-keyed conflict — but a recently-deleted row leaves the transaction id unique, so the insert succeeds. **The S-011 / B3 "appAccountToken matches userId" check only guards against the token belonging to a DIFFERENT user.** It doesn't catch the case where a user buys a sub, has the row deleted (admin support action, kid_profile delete cascade), then re-syncs with the same receipt — the row is recreated AS IF it's a fresh purchase, with `current_period_*` rewritten from the receipt.
  - Combined with PM-8's mass-impersonation P0: if `billing_change_plan` is callable from PostgREST without the `auth.uid()` check, then any user with a valid receipt can re-grant themselves plan permissions after their sub was administratively cancelled.
- Evidence: route.js lines 230-249 (existingSub check + S-002 gate); `INSERT INTO subscriptions` at 266 with no "row was previously deleted" check.
- Impact: P1 — admin-cancelled subscriptions can be re-activated client-side on iOS by any user with the original receipt still in their iCloud. Workaround for the user is technically legitimate; the issue is that admin action is undone without admin signal.
- Suggested fix: add a soft-delete column to subscriptions (`deleted_at` or `tombstoned_at`) so admin "delete" doesn't drop the row — it tombstones. The sync route checks tombstone status and refuses to re-insert.
- Verified by: route.js read 196-275.

### [P2] `/api/auth/email-change` rate-limit key includes raw IP — same authed user from two networks (work + home) can spend 6/hour total instead of 3/hour

- File: `web/src/app/api/auth/email-change/route.js:90`
- Issue: `key: \`email_change:user:${user.id}:${ip}\`` includes the IP. The intent of the cap (3 attempts / hour) is per-account, not per-network. A user roaming between WiFi networks doubles their effective rate-limit budget. Same-shape papercut: PM-1 P2 noted check-username's session-only key. This route's mistake is the inverse direction.
- Evidence: line 90.
- Impact: P2 — minor rate-limit drift. Email-change is a relatively expensive operation (Supabase send_email is a paid action) but 3/hour is generous already.
- Suggested fix: drop `:${ip}` from the rate-limit key. Per-user is the correct scope; per-IP can be a SECOND cap on top.
- Verified by: file read.

### [P2] Pair-code redeem path uppercases input — UNIQUE constraint on `kid_pair_codes.code` is case-sensitive at DB level — latent collision if alphabet ever extends to lowercase

- File: `web/src/app/api/kids/pair/route.js:71`
- Issue: `const normalised = code.trim().toUpperCase();` then `redeem_kid_pair_code(normalised, ...)`. The RPC body does `WHERE code = p_code` against `kid_pair_codes.code` which is stored UPPERCASE-only (per `generate_kid_pair_code` body — alphabet has no lowercase). So the UPPERCASE match works. iOS PairCodeView also forces uppercase (PairCodeView.swift:172 `.uppercased()`).
  - However: if a future code generator drift introduces lowercase characters (e.g., a UX request to expand the alphabet), the UNIQUE constraint at the DB layer is case-sensitive (Postgres default), but the redeem path silently uppercases. A lowercase code `abc12345` and an uppercase code `ABC12345` can both exist as separate rows but the redeem path collapses them.
  - Today this is latent — the alphabet doesn't include lowercase. P2.
- Evidence: route.js line 71; `generate_kid_pair_code` alphabet excludes lowercase.
- Impact: P2 — latent. Becomes P0 if the alphabet ever expands.
- Suggested fix: either (a) drop the `.toUpperCase()` and require the iOS app to send the exact code, or (b) add a `CHECK (code = upper(code))` constraint on `kid_pair_codes` so the DB rejects any future lowercase row.
- Verified by: code read + RPC body.

### [P2] Beta-gate "approved email" check is case-folded but PostgREST `.eq('email', lc)` against `users.email` (which may be mixed-case) silently returns no row

- File: `web/src/lib/betaGate.ts:42-49` and `web/src/app/api/auth/send-magic-link/route.js:188-193`
- Issue: `isApprovedEmail` and the ban-check both use `.ilike('email', email)` or `.eq('email', lc)` patterns. **`users.email` column has no `CITEXT` or `lower(email)` index, and there's no DB-level case-folding constraint**. So a row created as `Foo@Bar.com` is stored mixed-case. `.ilike('email', 'foo@bar.com')` matches; `.eq('email', 'foo@bar.com')` does NOT.
  - `betaGate.isApprovedEmail` uses `.eq('email', lc)` against `access_requests.email` — that table happens to be lowercased on insert (per signup form normalization). But the `users` lookup in the SAME flow (`send-magic-link/route.js:218`) uses `.ilike('email', email)` — case-insensitive — so the `existingUserId` check matches mixed-case rows, but `isApprovedEmail` may miss the approved access_request.
  - Risk: A user whose access_request was approved at one casing (`Foo@Bar.com`) but who was added to `users` at a different casing (lowercase) gets routed through the closed-beta gate again on signup attempt because `isApprovedEmail` does case-strict `.eq` against `access_requests.email` while the user table uses `.ilike`.
- Evidence: `betaGate.ts:42-49` (`.eq('email', lc)`); `send-magic-link/route.js:215-220` (`.ilike('email', email)`); no schema constraint forcing lowercase on either column.
- Impact: P2 — case-mismatch causes legitimate users to fail beta-gate + fall through to "approved bypass" path that doesn't fire. They get the gated response.
- Suggested fix: add `CHECK (email = lower(email))` constraint on both `users.email` and `access_requests.email`, plus `CREATE INDEX ON users (lower(email))` for the lookup path. Or migrate to `CITEXT`. Either way, every email comparison should be case-insensitive at the column type level, not at the call site.
- Verified by: file reads; `information_schema.columns` shows both as `character varying`.

### Notes on what's NOT a finding (cross-checked, dropped after verification)

- **`articles_select` policy looks broad but is correct.** Cross-checked `pg_policies` for `public.articles` — the `public_can_read_published` PERMISSIVE SELECT is OR-combined with the leaky `articles_public_read_excludes_soft_deleted` (PM-8 P0 — drop the second). The first by itself is fine.
- **`users_update` USING-without-WITH-CHECK is NOT an ID-flip vector.** Postgres docs confirm omitted WITH CHECK falls back to the USING clause, so the same predicate `(id = auth.uid()) OR is_admin_or_above()` applies on the new row state. A user cannot UPDATE their row to set `id = some_other_user_id` because the WITH CHECK derived from USING fails. The risk is column-level (P0 above), not row-identity.
- **Pair-code 15-min validity + 10/min/IP rate limit is sound at first principles** — the only weakness is `random()` being non-CSPRNG (P0 above). With CSPRNG, the brute-force window is safe.
- **CORS allowlist (`web/src/lib/cors.js`) is hardcoded** — no env-var trust path. Solid.
- **Stripe webhook `t` timestamp is parsed via `Number()` and validated `Number.isFinite`** — `NaN > 300` was the prior bug; `lib/stripe.js:265-271` is now correct. No new finding.
- **`appleReceipt.assertSignedDateFresh` rejects future-dated receipts** — covers part of the replay surface PM-5 already noted; the missing piece is per-`originalTransactionId` ordering (P1 above).
- **Kids-app `AsyncImage` with arbitrary HTTPS hosts** — already in PM-7 as P1; not duplicating.
- **Parental gate state machine** — re-audited `ParentalGateModal.swift` against gate-pass + scenePhase + sheet dismiss; `interactiveDismissDisabled(true)` is correctly placed on the sheet content. Lockout state survives backgrounding (countdown pauses, not breaks). The `clearLockoutState()` only fires on success — locked-then-app-killed-then-relaunched still respects the timestamp via UserDefaults. Solid.
- **Kid pairing JWT issuer is now `${supabaseUrl}/auth/v1`** — verified `web/src/app/api/kids/pair/route.js:163`. Combined with HS256 signing using `SUPABASE_JWT_SECRET`, this means kid JWTs are indistinguishable from real Supabase auth JWTs at the signature layer; only the `is_kid_delegated` claim differentiates. The middleware's kid-reject (`web/src/middleware.js:377-393`) reads `is_kid_delegated` from BOTH the top-level claim and `app_metadata` — correct.
- **PM-8 listed `comped_until`, `cohort`, `referral_code` etc. as missing from `users_protect_columns`** — re-read of the live trigger body shows ALL of those ARE in the trigger's protected list. PM-8's column-list claim was wrong; the actual missing columns are the ones in this report's P0.

### Tier-A under-coverage assessment

The biggest gap among Tier-A PMs was **PM-8 (DB/RLS)**. PM-8 correctly identified the auth_sync GUC bypass and the dob_admin_override GUC bypass as P0s but framed them as the only path to compromising the trigger-protected columns. The harder, non-GUC path — that the trigger's column-allowlist itself is incomplete on `trial_extension_until`, `kid_trial_*`, `failed_login_count`, `mute_*`, `pin_*`, etc. — was not surfaced. PM-8 also missed the `kid_profiles` analog entirely (no equivalent of `users_protect_columns`), and missed the `random()` weakness in `generate_kid_pair_code`. PM-8 also mis-listed which `users` columns are NOT in the trigger (cited columns that are actually present in the trigger; missed columns that are actually absent). Three of my four P0/P1s are in the DB layer.

PM-1 (Web-Public) was the next-most-under-covered: missed the magic-link prefetch issue and the dual-method (GET+POST) shape on `check-username`. Both are documented Supabase / web-auth pitfalls.

PM-5 (Billing) was solid; the only new P1 (Apple S2S out-of-order delivery) is a known-but-rare Apple platform quirk.

PM-7 (Kids iOS) was the most-thorough — couldn't find a P0/P1 the kids report missed; the related findings I surfaced are DB-side (`kid_profiles` column protection, `random()` in pair-code gen).
