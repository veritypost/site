# 424 PROMPT — handoff for next session

You are the owner's thinking brain on Verity Post (read `Reference/CLAUDE.md` cold). This is a **continuation** prompt — pick up exactly where the previous session left off, no recap, no warm-up. The previous session shipped 10 commits across 2 sessions; you're picking up mid-stream of session 2.

---

## ABSOLUTE FIRST STEP

Run `git log --oneline -15` and confirm you are at commit `4ca9d97` or later. If you're not, you're in the wrong worktree.

Then read **in this order**:
1. `Reference/CLAUDE.md` (project rules — non-negotiable)
2. `Current Projects/MASTER_TRIAGE_2026-04-23.md` (244 open items, ranked by 11-agent corroboration count)
3. The "What just shipped" section below
4. The "Pick up here" section below

Don't re-read `Reference/STATUS.md` unless you actually need it for something specific — it's a snapshot, not a TODO list, and the master triage is the live work surface.

---

## What just shipped (2 sessions, 10 fix commits + 2 docs commits)

### Session 1 (2026-04-23) — Option A complete (9 items)

7 commits closing the Tier 0 + Tier 1 cuts from the 11-agent review sweep:

| # | Bug | Commit |
|---|-----|--------|
| 1+2 | `roles` DELETE undefined `assertActorOutranksTarget` + `billing/cancel`+`freeze` undefined `actor` | `4a59752` |
| 7 | `Ad.jsx` `click_url` no scheme validation (XSS via `javascript:`/`data:`) | `e0cf1af` |
| 8 | CSS injection via `backgroundImage: url(${avatarUrl\|bannerUrl})` | `ccffa86` |
| 9 | `/profile/[id]` + `/u/[username]` kill-switched behind `<UnderConstruction>` | `11986e8` |
| 4 | iOS quiz pass at 70% via integer math (vs server's `correct >= 3`) | `7afc0bf` |
| 3 | `/api/auth/email-change` flip-before-resend permanent lockout | `a33a030` |
| 6 | PasswordCard `signInWithPassword` rate-limit bypass — new `/api/auth/verify-password` endpoint | `6e13089` |

Plus docs handoff: `ac8c36a`.

Item 5 (`profile/[id]` direct follow/block bypass) was RESOLVED-BY-9 — the kill-switch deleted the buggy code path. When the kill-switch flips back, the canonical `/u/[username]` path uses `FollowButton.tsx` → `/api/follows` (no bypass).

### Session 2 (started 2026-04-23, in progress)

3 commits so far on billing infrastructure:

| # | Bug | Commit |
|---|-----|--------|
| B1 | Stripe + Apple webhooks don't bump `perms_version` after plan changes — fixed RPC-internal in 4 billing RPCs | `9c88616` |
| B11 | Stripe `handleChargeRefunded` stale-state misclassifies partial refunds as full + adds freeze notification | `8984700` |
| B3 | iOS receipt hijack via missing `appAccountToken` check + existingSub user_id defense-in-depth | `4ca9d97` |

---

## OWNER ACTION ITEMS — verify still pending

Before doing anything new, check whether the owner has cleared these. If unsure, ask via the next user message — don't auto-assume.

1. **Apply migration `schema/148_billing_rpcs_bump_perms_version.sql` in Supabase.** This is the B1 fix — recreates 4 billing RPCs (`billing_cancel_subscription`, `billing_freeze_profile`, `billing_resubscribe`, `billing_change_plan`) with internal `PERFORM bump_user_perms_version(p_user_id)`. MCP was read-only when shipped, so the code is in main but not in the live DB. Until applied, the RPCs in production behave the OLD way (no internal bump); the route-level bump in `api/promo/redeem` (also in B1) is the only coverage. Verify by querying:
   ```sql
   SELECT pg_get_functiondef('public.billing_cancel_subscription'::regproc) LIKE '%bump_user_perms_version%';
   ```
   If false → migration not applied.

2. **Apply migration `schema/146_seed_verify_password_rate_limit.sql` in Supabase.** Adds the `verify_password` rate-limit policy (5/hr per user). Code falls back to inline `max:5, windowSec:3600` if missing, so it's not blocking — just enables runtime tuning via admin UI. Verify:
   ```sql
   SELECT * FROM rate_limits WHERE key = 'verify_password';
   ```

3. **Confirm `NEXT_PUBLIC_SITE_URL` is set in Vercel** for production AND preview environments (set during Session 1 to fix a build break — verify still there).

---

## Pick up here — L1 (SEO leak), 4 pre-impl agents IN FLIGHT

Session 2 was mid-flight on item **L1** (`/category` and `/card` in `PROTECTED_PREFIXES` causing SEO indexing leak) when the session was bookmarked.

### State of L1 when session ended

- 4 pre-impl agents dispatched. **Investigator A returned**, B and C may still be running (check `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/` for `a151cda10590372f0.output` and `ab0df371952c4c4ef.output`). Adversary D was NOT dispatched — only A/B/C investigators went out. **You need to dispatch the adversary D yourself before synthesizing.**
- Prompts for each investigator already sent are in the conversation log; copy the same prompt for the adversary D below.
- Investigator A's report (already in): **NEEDS-REWORK because there's a THIRD route with the same drift — `/browse`** (also in `PROTECTED_PREFIXES`, also published in sitemap as public per the page comment). A's recommended fix:
  - Remove `/browse`, `/category`, `/card` from `PROTECTED_PREFIXES` in `web/src/middleware.js` (lines 31, 33, 39)
  - No `robots.js` change needed (none of the 3 are in disallow today)
  - Page bodies all gracefully handle anon (verified by A)
  - `/card` has its own `robots: { index: false }` in layout — that's intentional (don't rank for person names) and stays
  - `/search` (line 32) stays protected (no canonical URLs, dynamic query-based)

### What to do

1. Check if B + C agents have returned. Read their reports.
2. Dispatch adversary D with this prompt (matches the A/B/C shape; the adversary takes positions opposite the proposed fix):

```
**Pre-impl ADVERSARY for L1 (SEO leak via /category and /card in PROTECTED_PREFIXES + robots.js inconsistency).** You are the contrarian. Find reasons NOT to ship the proposed fix, OR scope creeps that would derail the commit.

**THE PROPOSED FIX:** Remove `/browse`, `/category`, `/card` from middleware.js PROTECTED_PREFIXES. Investigator A confirmed all three are intended public per page-author comments + sitemap publishing. /card has its own noindex via layout metadata (intentional, stays). /search stays protected.

**Adversary tasks:**

1. Are these routes actually safe for anon viewers? Trace each page body — does any of them render personalized data (e.g., "your bookmarks for this article") that would crash or leak when there's no user?
2. Does the sitemap publishing them mean Google WILL index them? Or just "told they exist." What happens when Google fetches a category page that requires auth-derived rendering?
3. Is there a privacy concern with /card being public? It's a user's profile card. profile_visibility column — is it gated server-side?
4. Are there other routes with the same drift that A missed? Walk every PROTECTED_PREFIXES entry and confirm intent matches treatment.
5. Pre-launch impact — owner is currently kill-switching the public profile (item 9). Does opening /card to anon fight that decision? /card and /u/[username] aren't the same page but they both surface a user's profile-shaped data.
6. Backward compat — were these routes EVER public in prior commits? If they were just-recently-protected as part of a security sweep, removing the protection might re-open a bug that protection closed.
7. Is there an issue with the middleware still applying CSP / CORS / cookie cleanup to these routes once they're not in PROTECTED_PREFIXES? Trace.
8. Any auth state inconsistency — anon user lands on /category/science → reads articles → clicks bookmark → 401 with no upgrade path. Should there be a sign-in CTA?

**OUTPUT:** Numbered objections (Blocker / Worth-checking / Nit). End with VERDICT: SHIP-AS-PROPOSED / SHIP-WITH-CHANGES / DO-NOT-SHIP.
```

3. Synthesize the 4-agent matrix. **Important:** investigator A flagged that `/browse` is the third route, not just `/category` and `/card`. Master triage L1 only mentioned `/category` and `/card` — A's third-route finding is in-scope per CLAUDE.md "fix all of it." Confirm with B/C/D before bundling.
4. Implement the fix in `web/src/middleware.js`. Two-line removal (or three-line with `/browse`).
5. `cd web && npx tsc --noEmit` (must pass).
6. Dispatch 2 post-impl verifiers (input matrix: anon hitting each route; bookmark click as anon; auth user hitting same routes; route prefix collision with `/categorical` or `/cards` for word-boundary correctness).
7. Commit with conventional-commits + Co-Authored-By footer per session pattern.
8. Push.

---

## After L1, the queue (in priority order)

Per master triage at `Current Projects/MASTER_TRIAGE_2026-04-23.md`:

### Billing-infra remaining (continue from Session 2 thread)

- **B2** — `invoice.payment_succeeded` missing handler. Stripe sends this on every paid invoice (especially trial → paid). Webhook ignores it. If `customer.subscription.updated` fires out-of-order or misses, subscription is stuck in limbo. **Add handler at `api/stripe/webhook/route.js` switch (around line 142)**. Single new function ~30 lines.
- **B5** — Promo redeem races webhook for `users.plan_id` divergence. Promo write happens at `api/promo/redeem/route.js:144` direct UPDATE; concurrent Stripe webhook can land between read + write. B1's RPC-internal bump partially mitigates (perms cache invalidates either way) but the underlying state divergence remains. **Promo redeem should call `billing_change_plan` RPC instead of direct UPDATE** — let the RPC's `FOR UPDATE` lock serialize.
- **B4** — Webhook stuck-`processing` window. If a webhook crashes mid-RPC, `webhook_log.processing_status='processing'` row stays forever, all Stripe retries return 200 immediately. Add a >5min reclaim ladder. Schema work + `api/stripe/webhook/route.js:110-113` change.

### Tier 2 critical (web)

- **#10** — CommentThread Block button broken end-to-end (POST always returns `{blocked:true}`, no unblock from comment row). Components agent + B + D 3/4.
- **#11** — `/api/notifications/preferences` PATCH `?? true` defaults reset other channels on partial body; gate is `notifications.prefs.toggle_push` only.
- **#12** — `update_own_profile` RPC username-mutation hole (UI says "can't change," RPC + trigger both omit username from the deny list, iOS exploits it).
- **#14** — iOS `AuthViewModel.swift:213-217` username sanitizer accepts Unicode letters → Cyrillic а vs Latin a homoglyph collision.
- **#16** — `/api/account/delete` immediate path doesn't sign out cookie session.
- **#17** — `/api/auth/signup:67-94` step-by-step service writes with no rollback → orphan auth row.
- **#19** — Avatar bucket doesn't exist (`avatars` bucket missing in Supabase Storage). 100% failure on every avatar upload. Owner action — create bucket OR remove the upload UI.
- **#20** — `profile/settings/page.tsx:544` + iOS `AuthViewModel.swift:580` `select('*')` from users leaks `stripe_customer_id`, `apple_original_transaction_id`, `metadata` (provider tokens), etc.
- **#21** — `messages` + `conversations` route status-code derived from `error.message.includes('paid plan')` — RPC error rename silently breaks 429.

### Kids iOS launch blockers

- **K1** — Quiz pass uses 60% threshold for celebration UI; `completeQuiz()` increments streak unconditionally (no `passed` param). Failed quiz → "Great job!" + streak animation + DB unchanged.
- **K2** — Kid JWT 7-day TTL with no refresh path. Backgrounded-then-expired → silent 401, no error, no re-pair prompt.
- **K3** — `ArticleListView.swift:160-165` `categorySlug` accepted but never used. Every category card shows the same article list.
- **K4** — `reading_log` + `quiz_attempts` insert silent-fail. Streak trigger never fires; kid sees celebration locally but DB has nothing.
- **K10** — All V3 animation scenes (StreakScene, QuizPassScene, BadgeUnlockScene) unwired. `completeQuiz()` is dead code with hardcoded values, never called.

---

## How to work — non-negotiable per CLAUDE.md

**Every item ships with the 6-agent pattern:**
1. 4 pre-impl agents (3 investigators + 1 adversary, `subagent_type: "Explore"`, all 4 in a single message for parallel dispatch, no shared context)
2. Wait for all 4 to land. Synthesize the 4-agent verdict matrix. If 3-vs-1 split, the adversary's argument needs explicit adjudication — if they raise a real blocker, take it; if they raise scope creep, reject per CLAUDE.md "no silent scope expansion."
3. Implement minimal scope. Don't fold in cleanup. Don't add features not asked for.
4. `cd web && npx tsc --noEmit` (must pass; no warnings allowed). For iOS items also `xcodebuild -project VerityPost/VerityPost.xcodeproj -scheme VerityPost -destination 'generic/platform=iOS' build`.
5. Dispatch 2 post-impl verifiers (parallel, full input-matrix walkthrough, project-wide grep for sibling instances).
6. Wait for both to SHIP.
7. Commit with conventional-commits format `fix(area #item): short title` + multi-line body explaining the bug, the fix, deferred items, and 4-agent rationale. End with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
8. Push to main.

**Memory rules to follow (from `~/.claude/projects/.../memory/`):**
- `feedback_genuine_fixes_not_patches.md` — kill the thing being replaced, no parallel paths, no TODOs/HACKs
- `feedback_4pre_2post_ship_pattern.md` — 4 pre-impl + 2 post-impl, every item, no shortcuts
- `feedback_divergence_resolution_4_independent_agents.md` — 3-vs-1 splits → if can't resolve from arguments alone, dispatch 4 fresh agents on the disputed point
- `feedback_mcp_verify_actual_schema_not_migration_log.md` — fetch live function bodies via `mcp__supabase__execute_sql` against `pg_proc`, not the source migration files. Live state has drifted. Already saved you on B1 (Phase 15.2 `convert_kid_trial` block was missing from `schema/011_phase3_billing_helpers.sql`).
- `feedback_no_assumption_when_no_visibility.md` — Vercel/Supabase dashboards are invisible. Verify from code/live behavior or flag "can't see X, can you check?"
- `feedback_kill_switched_work_is_prelaunch_parked.md` — kill-switched items don't appear in autonomous next-pickup lists.

**Things that have bitten us this session:**
- MCP read-only mode blocks `apply_migration`. You can READ via `execute_sql` but can't WRITE. Owner must apply migrations manually. Always note this in the commit body and flag as owner action item.
- `cd` doesn't persist between Bash calls — always use absolute paths or compound `cd web && npx tsc`. Pre-commit hooks (lefthook) format your code mid-commit; check the actual committed file in case prettier shifted lines.
- Vercel build will fail if a route's module-eval throws. The `getSiteUrl()` throw at `lib/siteUrl.js:27` is intentional — don't soften it. Owner needs `NEXT_PUBLIC_SITE_URL` set in Vercel (already done this session, verify).
- `useSearchParams()` requires a `<Suspense>` boundary in Next 14. Already fixed `messages/page.tsx` this session; if you hit a new prerender error, that's almost certainly the cause.

---

## Triage source files

- `Current Projects/MASTER_TRIAGE_2026-04-23.md` — full 244-item inventory ranked by corroboration count
- `Sessions/04-23-2026/Session 1/NEXT_SESSION_HANDOFF.md` — Session 1's handoff (this file supersedes it but the historical context is there)
- Raw 11-agent reports at `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/` — DO NOT read end-to-end (huge JSONL transcripts that overflow context). The triage already extracted everything.

---

## When this session ends

Update `Current Projects/MASTER_TRIAGE_2026-04-23.md` with shipped items (mark them with commit SHA + date). Update `Sessions/04-23-2026/Session 2/SESSION_LOG_<date>.md` (or whichever session folder is current). Write a new handoff doc named `425_PROMPT.md` (incrementing) that supersedes this one, following the same shape — what shipped, what's pending, where the L1 / B2 / next-item left off mid-flight, owner action items.

Then say "Ready." Wait for direction.
