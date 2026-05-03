# Q01 — Mass-impersonation strategy

## Question

~30 SECURITY DEFINER RPCs in `public.*` accept `p_user_id` (or `p_admin_id` / `p_editor_id`) and have `EXECUTE` granted to `PUBLIC`, so any anon-key holder can call `POST /rest/v1/rpc/<fn>` and act as any user. What is the right way to close this surface — REVOKE EXECUTE FROM PUBLIC (Option A), inline `auth.uid()` guards (Option B), or a hybrid?

## Context

- PM-8 P0 ("Mass impersonation surface — 30+ SECURITY DEFINER RPCs accept `p_user_id`…") at `REVIEW_REPORT.md:1028-1059`.
- PM-11 cross-checked PM-8 and confirmed it without re-listing (the column-list and `kid_profiles` gaps are PM-11's separate adders, not duplicates of this finding).
- Supabase advisor `0028_anon_security_definer_function_executable` and `0029_authenticated_security_definer_function_executable` flag this exact pattern. Their guidance is unambiguous (https://supabase.com/docs/guides/database/database-advisors?lint=0028_anon_security_definer_function_executable):

  > `SECURITY DEFINER` bypasses RLS … Postgres' default function ACL is `EXECUTE` to `PUBLIC` … The author has to actively revoke to remove that grant. The result: a developer writes a helper function … and the function becomes a public exfiltration endpoint. PostgREST exposes it at `/rest/v1/rpc/<name>` automatically … The function does not need to appear anywhere in the documented API for the call to work.
  > **Option 1 (Revoke EXECUTE) — most common.**

- Live ACL evidence (verbatim, via `has_function_privilege('anon', oid, 'EXECUTE')` over every SECURITY DEFINER function in `public` whose signature contains `p_user_id`):

  ```
  anon EXECUTE granted on:
    _subject_local_today, _user_is_comment_blocked, _user_is_dm_blocked,
    advance_streak, ask_expert, award_points,
    billing_cancel_subscription, billing_change_plan, billing_freeze_profile,
    billing_resubscribe,
    claim_queue_item, clear_failed_login, convert_kid_trial,
    create_bookmark_collection, create_notification,
    decline_queue_item, delete_bookmark_collection, edit_comment,
    expert_can_see_back_channel, export_user_data, freeze_kid_trial,
    is_category_supervisor, is_expert_in_probation, is_family_owner, is_user_expert,
    lockdown_self, log_ad_impression,
    post_back_channel_message, post_comment, post_expert_answer, post_message,
    preview_capabilities_as,
    recompute_verity_score, record_failed_login, rename_bookmark_collection,
    score_on_comment_post, score_on_quiz_submit, score_on_reading_complete,
    serve_ad, soft_delete_comment,
    start_kid_trial, start_quiz_attempt,
    submit_appeal, submit_expert_application, submit_quiz_attempt, submit_recap_attempt,
    supervisor_flag_comment, supervisor_opt_in, supervisor_opt_out,
    toggle_context_tag (2-arg), toggle_vote,
    update_metadata,
    user_is_supervisor_in, user_passed_article_quiz, user_passed_quiz,
    user_supervisor_eligible_for
  ```

  That's **55 functions**, not the PM's "~30." PM-8 listed the headline write-paths; the live count includes read-side helpers (`is_user_expert`, `_user_is_dm_blocked`, etc.) which the audit didn't enumerate but which leak truth-bits about other users when called direct.

- Blast radius (worst paths from the PM, all currently exploitable via the public anon key):
  - `billing_change_plan(p_user_id, p_new_plan_id)` → switch any user to any plan.
  - `clear_failed_login(p_user_id)` → defeat brute-force lockout on any account, including admins.
  - `post_comment(p_user_id, …)` / `edit_comment` / `soft_delete_comment` → impersonate or rewrite anyone's comments.
  - `submit_quiz_attempt` → fake quiz completions, unlock comment/Ask-Expert gates as another user.
  - `lockdown_self(p_user_id)` → lock any user out (mitigated — has the `auth.uid() <> p_user_id` guard already; see Inventory).

## Inventory (the actual RPCs, classed by current caller)

Every row below was checked: web grep across `web/src/`, iOS grep across `VerityPost/VerityPost/` and `VerityPostKids/VerityPostKids/`. "server-only" means no client-direct caller exists; the only callers route through service-role server handlers under `web/src/app/api/...`.

### Class A — server-only writes (REVOKE; never need PUBLIC)

These RPCs are called exclusively from server-side service-role contexts. Revoking PUBLIC EXECUTE breaks nothing and immediately closes the impersonation hole.

| RPC | Server caller (route) |
|---|---|
| `post_comment` | `web/src/app/api/comments/route.js:152` |
| `edit_comment` | `web/src/app/api/comments/[id]/route.js:192` |
| `soft_delete_comment` | `web/src/app/api/comments/[id]/route.js:277` |
| `toggle_vote` | `web/src/app/api/comments/[id]/vote/route.js:111` |
| `toggle_context_tag` (2-arg) | `web/src/app/api/comments/[id]/context-tag/route.js:89` |
| `supervisor_flag_comment` | `web/src/app/api/comments/[id]/flag/route.js:46` |
| `post_message` | `web/src/app/api/messages/route.js:54` |
| `post_back_channel_message` | `web/src/app/api/expert/back-channel/route.js:95` |
| `post_expert_answer` | `web/src/app/api/expert/queue/[id]/answer/route.js:37` |
| `ask_expert` | `web/src/app/api/expert/ask/route.js:66` |
| `claim_queue_item` | `web/src/app/api/expert/queue/[id]/claim/route.js:39` |
| `decline_queue_item` | `web/src/app/api/expert/queue/[id]/decline/route.js:24` |
| `submit_appeal` | `web/src/app/api/appeals/route.js:52` (signed-in user; the route is `requirePermission`-gated — no anon path despite PM phrasing) |
| `submit_expert_application` | `web/src/app/api/expert/apply/route.js:45` |
| `submit_quiz_attempt` | `web/src/app/api/quiz/submit/route.js:109` |
| `start_quiz_attempt` | `web/src/app/api/quiz/start/route.js:75` |
| `submit_recap_attempt` | `web/src/app/api/recap/[id]/submit/route.js:34` |
| `start_kid_trial` | `web/src/app/api/kids/trial/route.js:92` |
| `convert_kid_trial` | (no current caller — kept for parity with iOS/server flow) |
| `freeze_kid_trial` | (cron) |
| `billing_cancel_subscription` | `web/src/app/api/billing/cancel/route.js:104`, `web/src/app/api/admin/billing/cancel/route.js:54`, `web/src/app/api/stripe/webhook/route.js:614` |
| `billing_change_plan` | `web/src/app/api/billing/change-plan/route.js:135`, `web/src/app/api/ios/appstore/notifications/route.js:435`, `web/src/app/api/ios/subscriptions/sync/route.js:212`, `web/src/app/api/stripe/webhook/route.js:502,711` |
| `billing_resubscribe` | `web/src/app/api/billing/resubscribe/route.js:141`, `web/src/app/api/ios/appstore/notifications/route.js:430`, `web/src/app/api/ios/subscriptions/sync/route.js:207`, `web/src/app/api/stripe/webhook/route.js:496,705` |
| `billing_freeze_profile` | `web/src/app/api/admin/billing/freeze/route.js:52`, `web/src/app/api/ios/appstore/notifications/route.js:386,399`, `web/src/app/api/stripe/webhook/route.js:830,1028,1340` |
| `create_bookmark_collection` | `web/src/app/api/bookmark-collections/route.js:89` |
| `rename_bookmark_collection` | `web/src/app/api/bookmark-collections/[id]/route.js:25` |
| `delete_bookmark_collection` | `web/src/app/api/bookmark-collections/[id]/route.js:55` |
| `create_notification` | `web/src/app/api/cron/process-data-exports/route.js:118`, `web/src/app/api/stripe/webhook/route.js:836,862,925,1005,1092,1120,1242` |
| `award_points` | `web/src/lib/scoring.js:77,102,142` (server-only lib) |
| `advance_streak` | `web/src/lib/scoring.js:43,114` |
| `score_on_quiz_submit` | `web/src/lib/scoring.js:9` |
| `score_on_reading_complete` | `web/src/lib/scoring.js:23` |
| `score_on_comment_post` | `web/src/lib/scoring.js:34` |
| `recompute_verity_score` | (called from triggers / score sweeps) |
| `clear_failed_login` | (called from `record_failed_login` + auth-success path; ought to be invoker-side, not anon) |
| `record_failed_login` | (server-only; the email-keyed variant `record_failed_login_by_email` is the route caller) |
| `export_user_data` | `web/src/app/api/cron/process-data-exports/route.js:62` (server-only cron) |
| `supervisor_opt_in` | `web/src/app/api/supervisor/opt-in/route.js:27` |
| `supervisor_opt_out` | `web/src/app/api/supervisor/opt-out/route.js:27` |
| `serve_ad`, `log_ad_impression` | `web/src/app/api/ads/serve/route.js:32`, `web/src/app/api/ads/impression/route.js:58` (anon-allowed but caller is service; see Class C note) |
| `update_metadata` | `web/src/app/api/auth/email-change/route.js:165` (server-only; the iOS/web profile path uses `update_own_profile` which is properly auth.uid()-gated) |
| `_subject_local_today`, `_user_is_comment_blocked`, `_user_is_dm_blocked` | called only as RLS-policy helpers from inside other SECURITY DEFINER bodies |
| `is_user_expert`, `is_family_owner`, `is_expert_in_probation`, `is_category_supervisor`, `expert_can_see_back_channel`, `user_supervisor_eligible_for`, `preview_capabilities_as` | server-only / used inside RLS policies; no client-direct grep hits |

### Class B — direct-from-client, already self-guarded (REVOKE PUBLIC, regrant `authenticated`)

| RPC | Client caller | Current safety |
|---|---|---|
| `lockdown_self(p_user_id)` | `web/src/app/profile/settings/_cards/PrivacyCard.tsx:190` (signed-in user, anon-key client) | Body already has `IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN RAISE EXCEPTION 'permission_denied' …` — the only RPC in this surface that already does this. |

The `lockdown_self` body is the template every other "self-acting" RPC should match.

### Class C — direct-from-client, **read-side** identity leaks (REVOKE PUBLIC, regrant `authenticated`, add `auth.uid()=p_user_id` guard, OR rewrite to drop the parameter and use `auth.uid()` internally — best)

| RPC | Client caller | Leak shape |
|---|---|---|
| `user_is_supervisor_in(p_user_id, p_category_id)` | `web/src/components/CommentThread.tsx:271` | Body returns boolean from `category_supervisors` lookup. PUBLIC EXECUTE means anon can probe "is user X a supervisor in category Y?" for any X. |
| `user_passed_article_quiz(p_user_id, p_article_id)` | `web/src/app/[slug]/page.tsx:169` (server route uses `service` — but PUBLIC EXECUTE means clients can also probe) | Anon can probe "did user X pass quiz Y?" |
| `user_passed_quiz(p_user_id, p_article_id)` | (same family, ACL-shape parallel) | same |

These are read-only — not impersonation in the write sense — but they're identity leaks the audit grouped into the same finding because they share the `p_user_id`-with-PUBLIC-EXECUTE shape. Fix: drop the parameter; let the body use `auth.uid()`. The CommentThread caller can pass its own user via `auth.uid()` server-side, no functional regression.

### Class D — special cases that require keeping a public/anon path

| RPC | Why public |
|---|---|
| `serve_ad`, `log_ad_impression` | Both have `anon=EXECUTE` deliberately because article pages can render ads to anon visitors. Body is bounded — writes a single row keyed on `p_user_id` (nullable for anon). Still: the route handler at `web/src/app/api/ads/serve/route.js` already calls these with the verified `authUser?.id || null` over service-role. **The PUBLIC EXECUTE on these two is dead — safe to revoke; the route is the only caller.** |

There is **no** RPC in this audit where keeping PUBLIC EXECUTE is genuinely required. The owner's question premise ("submit_appeal needs PUBLIC for anon access-request flow") was wrong: `submit_appeal` is reached only via `/api/appeals` which calls `requirePermission('settings.appeals.open')` first — anon never invokes it. (The anon-facing access-request flow is `/api/access-requests` which writes directly to `access_requests` via a separate INSERT policy, not via this RPC.)

## Options considered

### Option A — REVOKE EXECUTE FROM PUBLIC (and from `anon`/`authenticated` for Class A)

Tradeoffs:
- **Closes the hole atomically** — once the grant is gone, PostgREST returns 42501 to any anon-key call. No body-level guard needed.
- **One-line per RPC** in a single migration: `REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM anon, authenticated, public;`
- Forces every caller through the service-role route handler. **Already true** for Class A (~50 RPCs).
- For Class B (`lockdown_self`), regrant `authenticated` and the existing body guard does the rest.
- For Class C, regrant `authenticated` + a follow-up rewrite to drop `p_user_id`.
- **Defense-in-depth bonus**: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, public;` — every future SECURITY DEFINER function inherits a deny-by-default ACL. This is the single most valuable line in the migration, because it neutralises the entire class of "next developer adds an RPC, forgets to revoke" regressions. Supabase docs explicitly recommend this in lint 0028's quick-reference.

What breaks (verified — none):
- `lockdown_self` — currently anon-callable but client uses authenticated session. Regrant `authenticated`. Fine.
- `user_is_supervisor_in` (CommentThread) — regrant `authenticated`. Fine.
- The `user_passed_article_quiz` page-render call at `web/src/app/[slug]/page.tsx:169` is a server-side `service.rpc(...)` — service_role keeps EXECUTE through the explicit `service_role=EXECUTE` ACL entry. Fine.
- All Class A RPCs are called with `service.rpc(...)` over the service-role client — service_role never had its grant revoked. Fine.

Migration cost: ~80 lines of SQL (one REVOKE per function + one default-privilege line + Class B/C regrants). Single migration, no body changes.

### Option B — Inline `auth.uid()` guard on every RPC

Tradeoffs:
- **Surgical**, doesn't change the ACL surface.
- Adds the same 6-line guard 50+ times. Requires `CREATE OR REPLACE FUNCTION` per RPC. Body changes mean re-running the migration risks resetting other ACL grants if the function declaration is re-emitted.
- Still leaves PUBLIC EXECUTE on every RPC, which means **every future contributor adding a new SECURITY DEFINER function inherits the same vulnerable default**. The pattern doesn't self-correct.
- The guard `IF p_user_id IS DISTINCT FROM auth.uid()` is correct for "self-acting" RPCs but **wrong for service-role callers**: when the route handler calls `billing_change_plan` over service-role, `auth.uid()` is NULL inside the function, so the guard would fire incorrectly. The right guard is `IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION …` — a more nuanced shape that has to be authored carefully. PM-8's suggested fix language got this right; PM-11 implicitly assumes it. Easy to get wrong on the implementer's first attempt.
- **Doesn't fix Class C identity-probing**. The body guard `auth.uid() = p_user_id` makes the RPC useless for its read-side use case (CommentThread probing whether *another* user is a supervisor). Would still need an ACL change.
- Doesn't fix `grant_role` / `revoke_role` defense-in-depth (PM-8 P0 #6 — they take `p_admin_id` but trust ACL alone). Option A's default-revoke catches this; Option B doesn't.

Migration cost: 50+ `CREATE OR REPLACE FUNCTION` blocks. Far more code, more review surface, more chances for typos. Each function body change needs to be re-tested against existing service-role + client callers.

### Option C — Hybrid (recommended class per RPC)

The recommendation is best framed not as A-vs-B but as a single canonical posture:

1. **Default-deny via `ALTER DEFAULT PRIVILEGES` so future RPCs are safe-by-default.**
2. **Explicit-grant per role** for every function: only the roles that need to call it directly.
3. **Body-level `auth.uid()` guard** only on RPCs that intentionally accept `auth.uid()`-callable traffic from `authenticated` (Class B + Class C rewrite). This is `lockdown_self`'s shape, and it should be the template.

Class breakdown applied:
- **Class A (Server-only):** REVOKE from `anon, authenticated, public`. Service-role retains EXECUTE via the explicit grant Supabase auto-applies; if a function loses its `service_role` grant it's because of `CREATE OR REPLACE` re-emission — fix that case by adding an explicit `GRANT EXECUTE … TO service_role` line. **No body changes required.**
- **Class B (Direct-from-client, self-guarded):** REVOKE from `anon, public`. Regrant `authenticated`. Body guard already exists. (Just `lockdown_self`.)
- **Class C (Direct-from-client, identity-probe):** REVOKE from `anon, public`. Regrant `authenticated`. Follow-up issue: drop `p_user_id` parameter, replace with `auth.uid()` inside the body. Three RPCs.
- **Class D (Genuinely public):** None in this audit. The two ad RPCs route through service-role; the PUBLIC grant is dead.

## Recommendation

**Adopt Option C, dominated by Option A's REVOKE.** Ship one migration that does three things: (1) `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, public;` so every future RPC is safe-by-default; (2) per-function `REVOKE EXECUTE … FROM anon, authenticated, public;` for the 50+ Class A functions, with an explicit `GRANT EXECUTE … TO service_role` re-issued (defensively, in case any of them lost theirs to a prior `CREATE OR REPLACE`); (3) for Classes B + C, `REVOKE … FROM anon, public; GRANT … TO authenticated;` and queue the Class C parameter-drop as a follow-up. **Do not** sprinkle `auth.uid()` guards into 50 function bodies — that's the patch shape, not the fix shape.

## Why this and not the alternatives

- A senior engineer who'd seen this pattern before would never touch the function bodies. The bug isn't in the bodies; it's in the ACL. Fix the ACL once with a `DEFAULT PRIVILEGES` line and you've also fixed every future regression of the same shape — which is the actual long-term failure mode here, not the current 50 functions. Body guards are local; the ACL fix is structural.
- Inline guards leave a pattern in the codebase that says "PUBLIC EXECUTE on SECURITY DEFINER is fine as long as you remember to write the guard." That's a tripwire the next contributor will hit. Supabase's lint will keep firing forever, and the team will become numb to it.
- The owner's question framed Option A as "breaks any RPC currently called directly from the iOS or web client." Verified empirically: the only direct-from-client `p_user_id` write path is `lockdown_self`, which works fine after a regrant to `authenticated`. The premise that "Option A breaks lots of things" was wrong; Option A breaks one thing, and that thing has a one-line fix (`GRANT EXECUTE … TO authenticated`).

## Files / migrations that would change

New migration: `supabase/migrations/2026-05-03_revoke_public_execute_security_definer_p_user_id.sql`

Approximate shape (do not commit; this is illustrative):

```sql
-- 1. Default-deny for future SECURITY DEFINER functions in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, public;

-- 2. Class A: server-only — revoke EXECUTE from anon/authenticated/public; keep service_role.
REVOKE EXECUTE ON FUNCTION public.post_comment(uuid, uuid, text, uuid, jsonb)
  FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.post_comment(uuid, uuid, text, uuid, jsonb)
  TO service_role;
-- … repeat for every Class A function in the inventory above (~50 lines × 2)

-- 3. Class B: direct-from-client, body-guarded.
REVOKE EXECUTE ON FUNCTION public.lockdown_self(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.lockdown_self(uuid) TO authenticated;

-- 4. Class C: direct-from-client read helpers — temporary regrant; follow-up to drop p_user_id.
REVOKE EXECUTE ON FUNCTION public.user_is_supervisor_in(uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.user_is_supervisor_in(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.user_passed_article_quiz(uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.user_passed_article_quiz(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.user_passed_quiz(uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.user_passed_quiz(uuid, uuid) TO authenticated;
```

No web/iOS/Swift code changes required.

Follow-up migration (separate, after the first lands and the advisor surface clears):
- `supabase/migrations/2026-05-?_drop_p_user_id_from_read_helpers.sql` — rewrite the three Class C functions to take no parameter and read `auth.uid()` internally; update the three callers (`web/src/components/CommentThread.tsx:271`, `web/src/app/api/comments/route.js:121`, `web/src/app/api/comments/[id]/vote/route.js:96`, `web/src/app/[slug]/page.tsx:169`) to drop the `p_user_id` arg.

Files that would NOT change in the primary migration:
- No `web/src/**/*.{ts,tsx,js,jsx}` files.
- No `VerityPost/**/*.swift` files.
- No `VerityPostKids/**/*.swift` files.

## Risks / unknowns

- **`CREATE OR REPLACE FUNCTION` regression risk.** Postgres preserves ACLs across `CREATE OR REPLACE`, but only if the function signature is unchanged. If a future migration re-creates a function with a changed parameter list, the new function is created fresh and inherits Postgres' default ACL — which, with the `ALTER DEFAULT PRIVILEGES` line in place, will be deny-by-default for anon/authenticated. **This is good** but might surface as "RPC suddenly returns 42501" if a developer also adds a new client caller that needs `authenticated` access. Mitigation: every migration that creates a SECURITY DEFINER function should explicitly include its `GRANT EXECUTE … TO <role>` lines. Make this a checklist item in the migration template.
- **`service_role` ACL preservation.** Supabase auto-grants `service_role` on function creation, but `CREATE OR REPLACE` does NOT re-emit that grant. Some functions in the live schema may have lost `service_role=EXECUTE` already (worth a one-shot audit). The migration should defensively re-`GRANT EXECUTE … TO service_role` on every Class A function it touches, even though most still have it.
- **Latent client callers not in the grep.** Grep covered `rpc(` invocations across `web/src/`, `VerityPost/VerityPost/`, `VerityPostKids/VerityPostKids/`. There is theoretically a path through dynamic RPC names (`supabase.rpc(rpcName, …)`) — found one such call at `web/src/app/api/promo/redeem/route.js:196`, but that's a service-role caller (uses `supabase` from `requireAuth`-derived context, calls `mint_referral_codes` / `redeem_referral` which are NOT in this audit's scope). Confidence: high, but worth a final fresh `grep -E "rpc\\(['\"]?\\\$\\{|rpc\\(rpc"` sweep before shipping the migration.
- **Functions with overloaded signatures.** `toggle_context_tag` has two overloads (2-arg PUBLIC, 3-arg authenticated-only). REVOKE has to target the exact signature. The `REVOKE EXECUTE ON FUNCTION public.toggle_context_tag(uuid, uuid)` line above is correct only for the 2-arg form; the 3-arg form is already restricted. Migration must be careful to spell out parameter types per overload.
- **Read-side identity leak severity.** Class C is real but is a P1, not P0. If shipping this migration is blocking on Class A urgency, Class C can ride a follow-up — but ship them within the same week so the advisor surface clears.

## Owner decision

- [ ] Approve recommendation (Option C: ALTER DEFAULT PRIVILEGES + per-function REVOKE/GRANT, no body guards, Class C parameter-drop as follow-up)
- [ ] Pick alternative (specify): _________
- [ ] Need more info on: _________
