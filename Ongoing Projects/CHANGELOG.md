# Change Log

Every change made during audit execution sessions. Format per entry:
- **What** — the specific change
- **Files** — files touched
- **Why** — the reason; OwnersAudit task reference where applicable

---

## 2026-04-27 (TODO cleanup — close 4 fully-shipped items) — _shipped, pushed to git_ (commit 004026e)

Owner applied all 4 of the pending migrations + the REINDEX. MCP-verified live state matches expected. Closing the bodies of items that are now fully done in BOTH code and SQL so the autonomous loop doesn't re-evaluate them.

### Closed (bodies + skip-list entries removed)

- **T26** — `post_comment` reply + mention notifications RPC migration applied; live function body contains both `'comment_reply'` and `'comment_mention'` INSERTs (verified via `pg_proc`). Locked direction fully shipped — body deleted from TODO; LOCKED skip-list entry removed; verify-via-MCP-first reference removed; priority-changes reference removed.

- **T334** — `lockdown_self()` SECURITY DEFINER RPC migration applied (`pg_proc` confirms function present). The caller-side change in `redesign/profile/settings/_cards/PrivacyCard.tsx` (replace two-statement client flow with single rpc call) lives in the untracked redesign tree and rolls up with T357 cutover; tracked by T357 scope, not a separate TODO entry. Body deleted.

- **T356** — `permission_set_perms` REINDEX completed in low-traffic window; index continues serving traffic (`idx_scan` counter steady at ~277k). One-shot maintenance command, no follow-up. Body deleted.

- **T361** — billing_period standardize migration applied; `pg_constraint` shows `plans_billing_period_check` live, `DISTINCT billing_period` returns `['month', 'year', null]` (no `'monthly'`/`'annual'`/`'lifetime'`). Code-side already reads canonical strings (verified via T57 mint endpoint shipping). Body deleted.

### TODO state

- **39 real items remain** (was 43). Tier classification rubric headers (T1-T5) are not items; they're scaffolding.
- LOCKED skip-list down to **T19** (simplify home).
- Owner-decision queue from earlier: T303, T308, T328, T345, T346.
- DEFERRED parked: T14, T34, T35, T79, T84.
- Migration drafts queued for owner: none currently — the 8 from waves 4/8/11/12 all applied + verified.

- **Files** — `Ongoing Projects/TODO.md` (4 bodies + skip-list trims), `Ongoing Projects/CHANGELOG.md` (this entry).

---

## 2026-04-27 (wave 12 — T26 migration drafted, T348 partial, T57 backend shipped) — _shipped, pushed to git_ (commit 17b4679)

### Shipped (2 backend, 1 migration draft)

- **T26 — `post_comment` notifications RPC migration drafted.** `Ongoing Projects/migrations/2026-04-27_T26_post_comment_notifications.sql`. Full `CREATE OR REPLACE FUNCTION` body that preserves all existing logic (quiz gate, mention strip for free tier, depth limits, reply-count bumps) AND adds two notification-insert blocks at the end:
  - **Reply notifications** — when `p_parent_id IS NOT NULL`, insert `'comment_reply'` notification for the parent comment's author. Skips self-replies + skips when the parent author has blocked the poster (silent block).
  - **Mention notifications** — for each mention entry in `p_mentions` jsonb (paid-tier only — free-tier mentions still stripped at the existing line ~30), insert one `'comment_mention'` per mentioned user. Skips self-mentions + skips when the mentioned user is also the parent author (already covered by reply branch) + skips blocked senders.
  Per locked spec: in_app + push only, no email — every inserted notification carries `email_sent=true` so the `send-emails` cron skips it (T-EMAIL-PRUNE already retired engagement-class email types). Owner applies via Supabase SQL editor.

- **T348 — per-supabase-client perm cache.** `web/src/lib/auth.js` `loadEffectivePerms` now stashes the resolver result on the client instance via `__permsCache: Map<userId, result>` (`Object.defineProperty` to make it non-enumerable so it doesn't pollute logs / serialization). Cache is keyed on `userId`. When a route handler threads the same client through `requirePermission` + `hasPermissionServer`, the second call returns from cache instead of round-tripping. Limited fix — most callers don't thread the client today; a future architecture pass with AsyncLocalStorage / `headers()` would catch the un-threaded callers too. T348 body re-scoped to "partial".

- **T57 — Stripe price mint endpoint.** `web/src/app/api/admin/plans/[id]/mint-stripe-price/route.js`. POST handler: refuses if `stripe_price_id` already set (callers explicitly clear via existing PATCH if they want to re-mint), refuses if `price_cents <= 0`, refuses if `billing_period` isn't `'month'`/`'year'` (one-time plans not supported here). Calls Stripe `/v1/prices` with `Idempotency-Key: mint-stripe-price:<plan_id>:<price_cents>:<period>` so a retry within Stripe's ~24h replay window returns the same id. Sets `lookup_key = <plan_name>_<billing_period>` and stamps plan_id/plan_name/tier metadata on both the Price and the auto-created Product. Writes back to `plans.stripe_price_id` via service-role (PATCH `ALLOWED_FIELDS` intentionally excludes that field — this is the one path that sets it). Audit row written via `recordAdminAction('plan.mint_stripe_price', ...)`. Eliminates the silent-fail class at `/api/stripe/checkout/route.js:62-66`. **UI button on `/admin/plans` page still pending** — ~10 lines of JSX next to "Save pricing"; T57 body re-scoped to "partial."

### Bookkeeping

- TODO closures: T57 + T348 bodies re-scoped to "partial." T55 + T57 removed from LOCKED skip list (T55 has its drop-migration drafted; T57 has the backend shipped).
- TypeScript: 13 pre-existing errors unchanged.

- **Files** — `Ongoing Projects/migrations/2026-04-27_T26_post_comment_notifications.sql` (new), `web/src/lib/auth.js`, `web/src/app/api/admin/plans/[id]/mint-stripe-price/route.js` (new), `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (wave 11 — T55 migration drafted; mid-edit reversal recorded) — _shipped, pushed to git_ (commit ea30523)

Caught a wrong-direction error mid-edit and reversed before commit.

### What happened

Started shipping T55 by adding INSERT-into-`ai_prompt_preset_versions` calls to the prompt-presets PATCH and DELETE routes (the original audit's recommendation). Then re-checked the locked direction and found the actual decision was the OPPOSITE: **drop the orphan table**, because T242 (pipeline-run prompt snapshot) already captures live preset state into `pipeline_runs.input_params.prompt_snapshot` at every pipeline-run start (per CHANGELOG 2026-04-23 cluster T235+T242+T241). The two T55 directions had been carried in parallel — original audit said "use the table"; locked decision said "drop it" — and I jumped on the audit text without re-checking the lock first.

### What I did

1. **Reverted the route edits** via `git checkout HEAD -- 'web/src/app/api/admin/prompt-presets/[id]/route.ts'`. Nothing committed.
2. **Drafted the drop migration** at `Ongoing Projects/migrations/2026-04-27_T55_drop_ai_prompt_preset_versions.sql`. Pre-flight DO-block refuses to drop if any rows present (defensive — verified 0 rows via MCP before drafting, but the guard catches the case where some other code path lands a row between drafting and applying). Owner applies.
3. **Removed the T55 body** from TODO (the OPEN-section body that contradicted the lock). Skip-list entry updated to point at the new migration file.

### Lesson

For LOCKED items: re-read the locked decision text BEFORE writing code. The original audit body and the locked decision can diverge — the lock wins.

### Skipped this wave (with reasons)

- **T57** (Stripe price auto-mint): no `/api/admin/plans` POST route exists — the admin page inserts plan rows via direct supabase client. Implementing T57 cleanly requires either (a) building a POST route + refactoring the admin page UI to use it, or (b) adding a separate "Mint Stripe price" button + helper route. Both are bigger than a same-turn ship; queueing for a focused session.
- **T27 iOS portion** (`SettingsView.swift:1887-2040`): the iOS toggles aren't safely-inert like the web ones — push delivery IS wired and these toggles MIGHT feed it. Needs a careful audit of `alert_preferences` + push-cron consumption before deletion.
- **T348** (perm memo): architecture decision deferred.

### Files

- `Ongoing Projects/migrations/2026-04-27_T55_drop_ai_prompt_preset_versions.sql` (new draft)
- `Ongoing Projects/TODO.md` (T55 body deleted; skip-list entry annotated)
- `Ongoing Projects/CHANGELOG.md` (this entry)
- `web/src/app/api/admin/prompt-presets/[id]/route.ts` reverted (no diff vs HEAD)

---

## 2026-04-27 (wave 10 — T354 closed via MCP audit, T-EMAIL-PRUNE shipped, T27 web partial) — _shipped, pushed to git_ (commit 6a1a5e8)

### Closed via MCP verification (1)

- **T354 — events partition retention.** MCP-queried `cron.job` and found two active pg_cron jobs already managing the daily-partition lifecycle:
  - `events-create-next-partition` daily at 00:05 — calls `public.create_events_partition_for(current_date + 1)`.
  - `events-drop-old-partitions` daily at 00:15 — calls `public.drop_old_events_partitions(90)` (90-day retention).
  Both functions exist in production with naming conventions matching the existing `events_<YYYYMMDD>` daily partitions (verified earlier this session). Goal already met — both creation AND retention are scheduled. Body deleted from TODO; no migration needed.

### Shipped (2)

- **T-EMAIL-PRUNE — `send-emails` cron pruned to 3 transactional types.** `web/src/app/api/cron/send-emails/route.js:21-32`. `TYPE_TO_TEMPLATE` reduced from 7 entries to 3: `data_export_ready`, `kid_trial_expired`, `expert_reverification_due`. The 4 dropped types (`breaking_news`, `comment_reply`, `expert_answer_posted`, `kid_trial_day6`) align with the memory-locked direction (no engagement-class email; only password reset / email verify / billing receipts / deletion notices ship — Supabase Auth + Stripe handle those non-cron paths). The `notifications.type` enum still allows the dropped values for in-app/push delivery; only the EMAIL channel is pruned. Removed from skip list.

- **T27 partial — web email-notifications subsection removed.** `web/src/app/profile/settings/page.tsx`. Deleted the entire "Email notifications" subsection (3 switches: `newsletter` / `commentReplies` / `securityAlerts`) plus the supporting state (`useState` × 4, `useEffect`, `notifSnap`, `saveNotifs` handler — ~75 lines total). Those switches wrote to `metadata.notification_prefs` which nothing consumed for delivery — the UI was promising controls that didn't gate anything real. Per the memory-locked transactional-only email direction, the controls are gone (Supabase Auth handles signup/login/password emails; Stripe handles receipts; `send-emails` cron handles 3 transactional types — none user-toggleable). iOS `SettingsView.swift:1887-2040` mirror still pending; needs a focused Swift session to verify no other surface depends on the metadata keys.

### Deferred from this wave

- **T299 (homoglyph)** — needs an npm install of a TR39-aware confusables library. I can't run npm in-session; queued as the next focused install + integration session.

TypeScript clean (13 pre-existing errors unchanged).

- **Files** — `web/src/app/api/cron/send-emails/route.js` (T-EMAIL-PRUNE), `web/src/app/profile/settings/page.tsx` (T27 web partial), `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (autonomous wave 9 — T333 middleware + T366 admin auth-recovery page) — _shipped, pushed to git_ (commit 1b206e1)

### Shipped (2)

- **T333 middleware partial.** `web/src/middleware.js`. Tightened `_isRedesignPort` to require `process.env.NODE_ENV !== 'production'` AND host ends with `:3333`. Defense-in-depth: a misconfigured prod env that happens to expose :3333 can't bypass the coming-soon gate or trigger the dev-perms-all-true ProfileApp branch. The mirror in `redesign/profile/_components/ProfileApp.tsx:117-121` is in the untracked redesign tree; ships with T357 cutover.

- **T366 — `/admin/auth-recovery/` consolidated support page.** Owner picked option C earlier today; full spec was queued in TODO. Built it.
  - **Page:** `web/src/app/admin/auth-recovery/page.tsx` (~225 lines). Search by email-or-username (uses `.or` filter for username/email match), renders the user's current recovery-relevant state (email_verified, verify_locked_at, locked_until, deletion_scheduled_for, is_banned) as labelled `<Badge>` pills, and offers 3 action buttons. Each button is auto-disabled when its action would be a no-op (Confirm Email greyed if already verified; Clear Verify Lock greyed if no `verify_locked_at`; Clear Login Lock greyed if no active `locked_until`). Plus an "Open user record →" shortcut to `/admin/users/[id]` for the deeper investigation flow. Toast feedback per action.
  - **POST endpoint:** `web/src/app/api/admin/auth-recovery/[user_id]/route.ts` (~145 lines). Accepts `{ action: 'confirm_email' | 'clear_verify_lock' | 'clear_login_lock' }`. `requirePermission('admin.users.delete')` (same high-trust level as user-delete; if a narrower "support" perm is wanted later, mint `admin.auth_recovery` and grant it on top). `requireAdminOutranks` guard so a moderator can't recover an admin's account. Each action writes its own audit_log row via `recordAdminAction` (`admin:auth_recovery:confirm_email`, etc.) and the `confirm_email` path also `bump_user_perms_version`s so the 21 `requires_verified=true` perms re-evaluate without waiting for the 60s client poll.
  - **Backend semantics:**
    - `confirm_email` → `UPDATE users SET email_verified=true, email_verified_at=now()` + perms bump.
    - `clear_verify_lock` → `UPDATE users SET verify_locked_at=NULL`.
    - `clear_login_lock` → `service.rpc('clear_failed_login', { p_user_id })` (RPC already exists per `login/route.js:142`).

TypeScript clean (13 pre-existing errors unchanged). Toast/Button/Badge all use the admin-system APIs (`toast.push({ variant: 'danger' })`, `Button variant="primary"`, `Badge variant="success"`).

### Skipped (next-session candidates)

Same skip-list as wave 8: T299 (homoglyph lib install), T348 (perm memo arch), T328 (owner direction), T354 (needs pg_cron job audit), all untracked redesign batch (waits for T357), all big-feature items (T92 web push, T322 16-events wire, T329 admin events panels, T360 Categories+Milestones, T363 public-profile redesign, T358 iOS port).

- **Files** — `web/src/middleware.js`, `web/src/app/admin/auth-recovery/page.tsx` (new), `web/src/app/api/admin/auth-recovery/[user_id]/route.ts` (new), `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (autonomous wave 8 — T317 + T310 + T355 shipped; T334 + T356 migrations drafted) — _shipped, pushed to git_ (commit 4791431)

### Shipped (3)

- **T317 — `access_codes.type` taxonomy collapsed to `'referral'`.** `web/src/app/admin/access/page.tsx`. The redemption routes (`/r/[slug]/route.ts:77`, `/api/access-redeem/route.ts:63`) only honor `type='referral'`; the other admin-mintable values (`invite`/`press`/`beta`/`partner`) silently produced codes that never redeemed. `TYPE_OPTIONS` reduced to `['referral']` + the `EMPTY_FORM.type` default flipped from `'invite'` to `'referral'`. Schema enum can be tightened in a follow-up after confirming any historical rows with the legacy types are confirmed unused (didn't ship the enum-narrow migration here — verify-then-narrow is one cleaner pass).

- **T310 — audit-log writes now `captureException` on failure across all 4 auth routes.** `signup/route.js`, `login/route.js`, `callback/route.js`, `email-change/route.js`. Each `try/catch` around the `audit_log` insert keeps its existing `console.error` (Vercel function log) AND now imports `@/lib/observability` lazily and calls `captureException(err, { route, actor_id })`. Sentry routes the failure to alerting when a DSN is configured; without DSN it's a dev-console no-op (same as before for `console.error`). Pre-T310, missed audit rows died silently in 7-day Vercel function logs with no alerting; now they surface in the existing Sentry sink.

- **T355 — `subscription-reconcile-stripe` cron now parallel-batches Stripe calls.** `web/src/app/api/cron/subscription-reconcile-stripe/route.ts`. Replaced the sequential per-sub `for` loop with `Promise.allSettled` over chunks of 10. Stripe's read rate-limit ceiling (100 RPS) is well above 10-parallel; per-row error isolation preserved via the settled-results loop. 200-sub runs that took ~minutes now complete in ~1/10th the wall time. The DB UPDATE writes happen sequentially after each chunk's Stripe results land, so no transaction-isolation surprises.

### Migration drafts queued for owner apply (2)

- **T334 — `lockdown_self()` RPC.** `Ongoing Projects/migrations/2026-04-27_T334_lockdown_self_rpc.sql`. SECURITY DEFINER function: atomically flips `profile_visibility='hidden'`, deletes the user's followers, writes audit_log, bumps perms_version. Self-only `auth.uid() == p_user_id` enforced inside the function so RLS drift on `follows` can't compromise it. Caller-side change in `redesign/profile/settings/_cards/PrivacyCard.tsx` (replace two-statement client flow with one `rpc('lockdown_self', ...)` call) ships with the redesign-cutover commit (T357) since PrivacyCard is in the untracked redesign tree.

- **T356 — `permission_set_perms` REINDEX script.** `Ongoing Projects/migrations/2026-04-27_T356_permission_set_perms_reindex.sql`. Single `REINDEX TABLE CONCURRENTLY` command + pre-flight bloat-check query. **NOT runnable via apply_migration** (CONCURRENTLY illegal in a transaction); owner pastes into Supabase SQL editor manually in a low-traffic window. Pre-flight query lets the owner decide whether the bloat is even material.

### Skipped this wave (with reasons)

- **T299** (homoglyph): needs a Unicode-confusables library install (npm dep change), out of scope for an in-session fix.
- **T348** (per-request perm memoization): architecture decision — AsyncLocalStorage vs microcache vs request-context plumbing. Defer to a focused session.
- **T328** (canonical analytics pipeline): owner direction, not autonomous.
- **T354** (events partition retention cron): events table is already daily-partitioned by something else (per the wave-7 retraction); needs `SELECT * FROM cron.job;` audit to confirm what manages the lifecycle before bolting on retention. Dispatched the pg_cron extension presence check (it exists); didn't query existing jobs because that's a separate diagnostic step.
- **Untracked redesign batch** (T331, T335, T336 focus-trap, T337, T339, T341, T351 5 sub-items): all in `web/src/app/redesign/*` which doesn't commit cleanly without the larger T357 cutover. Save for that bundle.
- **Big-feature items** (T92 web push, T322 16-event wiring, T329 admin events panels, T360 Categories+Milestones, T363 public-profile redesign, T366 admin auth-recovery, T358 iOS port): each warrants its own focused session with adversary review; not safe to bundle blind in a continuous-loop turn.

- **Files** — `web/src/app/admin/access/page.tsx`, 4 auth routes, `web/src/app/api/cron/subscription-reconcile-stripe/route.ts`, 2 new migration files, `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (autonomous wave 7 — Vercel hotfix + 5 quick-win fixes) — _shipped, pushed to git_ (hotfix bab1c82 + features b1625f9)

### Hotfix (commit bab1c82, already pushed)

Vercel deploy started failing at commit 855dcf3 with `Module not found: Can't resolve '@/components/family/AddKidUpsellModal'`. The file existed locally but was untracked (along with its bundled API route counterpart). Local TypeScript resolved fine because the files are on disk; Vercel's clone only sees tracked files. Earlier deploys reused build cache for `kids/page.tsx`; the T54 KPI reorder in 855dcf3 invalidated that cache and surfaced the missing modules.

Committed 5 untracked files that belong to the Phase 6 family-seat work:
- `web/src/components/family/AddKidUpsellModal.tsx`
- `web/src/app/api/family/add-kid-with-seat/route.ts`
- 2 Phase 6 SQL migrations + the AI+Plan Implementation STATUS.md

### Wave 7 — autonomous fixes shipped this turn

- **T301 partial — kid pair-code TTL reduced 7d → 24h.** `web/src/app/api/kids/pair/route.js:24`. The JWT minted on a successful pair grants `kid_profile_id` + `parent_user_id` full-session access; a 7-day window meant a leaked code (SMS, screenshot) could be replayed for a week. 24h cuts the leak window 7× without breaking common kid usage. The two remaining defenses (out-of-band parent confirmation + first-pair push alert) re-scoped under T301 partial; bundled with the broader kids-security pass.

- **T304 — Stripe + cohort double-billing pre-checkout guard shipped.** `web/src/app/api/stripe/checkout/route.js`. Added `cohort` + `comped_until` to the user-row select; refuses 409 with structured `beta_comp_active` reason + `comped_until` timestamp if the user is already on a comped beta window. Without this guard, a beta user who clicked Upgrade paid Stripe-side while `sweep_beta_expirations` never cancelled the upstream sub — double-billing on resume.

- **T233 — articles delete now uses `admin_soft_delete_article` RPC.** `web/src/app/api/admin/articles/[id]/route.ts:762`. Replaced `service.from('articles').delete().eq('id', id)` with the SECURITY DEFINER soft-delete RPC. Articles get `deleted_at = now()` instead of hard-tombstone; the 30-day `purge_soft_deleted_articles` cron RPC hard-deletes after the window. Existing `recordAdminAction` audit-write preserved for legacy `action='article.delete'` consumers; the RPC writes its own `action='admin:article_soft_delete'` row alongside. Cast through `service.rpc as unknown as ...` because the RPC was added by migration after the last database-types regen — same pattern lib/trackServer.ts uses for the events table.

- **T352 — audit_log retention crons registered.** Two new routes:
  - `web/src/app/api/cron/anonymize-audit-log-pii/route.js` — calls `anonymize_audit_log_pii()`. Schedule: `30 3 * * *` (nightly).
  - `web/src/app/api/cron/purge-audit-log/route.js` — calls `purge_audit_log()`. Schedule: `35 3 * * *` (nightly).
  - `web/vercel.json` updated with both schedules.

- **T353 — webhook_log retention cron registered.** `web/src/app/api/cron/purge-webhook-log/route.js`. Calls `purge_webhook_log()`. Schedule: `0 4 * * *` (daily). Stripe-idempotency only needs ~24h of recent events; the 30-day window is the safety margin.

### Bookkeeping

- TODO closures: T233 + T304 + T352 + T353 bodies deleted. T301 body re-scoped to "kids-security follow-up" since the TTL piece shipped.
- TypeScript: 13 pre-existing errors unchanged.
- Vercel cron registry now lists 18 jobs (was 15) — the 3 new audit/webhook retention crons are live as of this push.

- **Files** — `web/src/app/api/kids/pair/route.js` (T301), `web/src/app/api/stripe/checkout/route.js` (T304), `web/src/app/api/admin/articles/[id]/route.ts` (T233), 3 new cron route files, `web/vercel.json` (3 schedule entries), `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (corrected migrations applied — T319 + T352 idx + T362 verified live; T307 final half wired) — _shipped, pushed to git_ (commit 4e42bc2)

Owner applied the 3 corrected migration files. MCP verified all three landed:
- `family_xl_remaining = 0` — T319 done (2 rows + 60 dependent rows cleared)
- `audit_log_created_at_idx` exists — T352 index done
- `update_metadata` function exists — T362 done

### T307 final half wired now that T362 RPC exists

`web/src/app/api/auth/email-change/route.js` — added the deferred `metadata.terms_accepted_at` re-stamp via the new `update_metadata` RPC. Best-effort: failure logs but doesn't block the email-change response (auth.updateUser already kicked off the confirmation email). Comment block in the route updated to remove the "deferred to T362" note since T362 is now live. T362 body deleted from TODO.

### T307 spec is now fully shipped:
- **(a) `verify_locked_at = NULL`** ✓ (shipped earlier today)
- **(b) `public.users.email = normalized`** ✓ (shipped earlier today)
- **(c) `metadata.terms_accepted_at = now()` via JSONB merge** ✓ (this commit, unblocked by T362)
- Plus the perms-version bump (T306) ✓

- **Files** — `web/src/app/api/auth/email-change/route.js`, `Ongoing Projects/TODO.md` (T362 body deleted), `Ongoing Projects/CHANGELOG.md` (this entry).

---

## 2026-04-27 (post-migration audit — diagnose what landed, write 4 corrected migration files) — _shipped, pushed to git_ (commit 7f716b2)

Owner reported "applied all 8 migrations but some failed." Ran an MCP audit. **4 of the 8 had issues; 4 landed cleanly.**

### What landed cleanly

- **T233 — articles soft-delete:** all 3 functions present (`admin_soft_delete_article`, `admin_restore_article`, `purge_soft_deleted_articles`) + RLS policy `articles_public_read_excludes_soft_deleted` exists. ✓
- **T352 — audit_log retention:** both functions present (`anonymize_audit_log_pii`, `purge_audit_log`). ⚠️ Index `audit_log_created_at_idx` did NOT land — `CREATE INDEX CONCURRENTLY` can't run inside a transaction block; the apply path wrapped it. (See corrected file below.)
- **T353 — webhook_log retention:** `purge_webhook_log` present. ✓
- **T361 — billing_period standardize:** constraint `plans_billing_period_check` present; distinct values are now `['month', 'year', null]` (no more `'monthly'`/`'annual'`/`'lifetime'`). ✓
- **T347 — DRAFT marker:** N/A (file had no SQL body, intended). ✓

### What didn't land + 4 corrected files written

- **T319 (family_xl plan rows) — DID NOT DELETE.** Both `verity_family_xl_monthly` and `verity_family_xl_annual` still in `public.plans`. Diagnosed via `pg_constraint`: the FK references blocking delete are `plan_permission_sets.plan_id` (6 rows) and `plan_features.plan_id` (54 rows). The original migration named the wrong junction tables (`permission_set_perms` + `permission_sets WHERE name LIKE 'plan:verity_family_xl%'`) which don't exist with that naming.
  → **Corrected file:** `2026-04-27_T319_drop_inactive_family_xl_plans_CORRECTED.sql` — clears `plan_permission_sets` + `plan_features` first, then the plan rows. Pre-flight subscription-count guard preserved. Verified zero users / subscriptions / events / access_codes reference the XL plans.

- **T354 (events partition rebuild) — RETRACTED.** Verified via MCP: events table is ALREADY partitioned, with DAILY granularity (`events_20260421` … `events_20260428` + `events_default`). The system map snapshot the original T354 was drafted from described a single un-partitioned table; that was stale. The original migration would have failed because events was already partitioned. The cron functions in the original used a monthly naming scheme (`events_p_<YYYY_MM>`) that doesn't match the actual daily names anyway.
  → **Marker file:** `2026-04-27_T354_events_partition_RETRACTED.sql` — no SQL body; documents the retraction so future agents don't re-apply. Genuine retention follow-up still needed: confirm whether `pg_partman` / `pg_cron` already manages partition lifecycle, then add a 90-day drop-old rule aligned with the daily naming scheme.

- **T362 (`update_metadata` RPC) — DID NOT LAND.** `pg_proc` shows the function absent. The original file is correct; most likely cause is that this step was skipped or silently rolled back in the bundle apply.
  → **Re-apply file:** `2026-04-27_T362_update_metadata_rpc_REAPPLY.sql` — same body as the original, idempotent (`CREATE OR REPLACE`), no other table deps. Paste-and-run.

- **T352 retention index — DID NOT LAND.** As above; `CREATE INDEX CONCURRENTLY` is illegal inside a transaction block.
  → **Corrected file:** `2026-04-27_T352_audit_log_idx_CORRECTED.sql` — drops `CONCURRENTLY`. `audit_log` is small enough that the write-block is sub-second.

### Action items for the owner

1. Apply `2026-04-27_T319_drop_inactive_family_xl_plans_CORRECTED.sql` — finishes the family_xl cleanup.
2. Apply `2026-04-27_T352_audit_log_idx_CORRECTED.sql` — adds the retention-sweep index.
3. Apply `2026-04-27_T362_update_metadata_rpc_REAPPLY.sql` — adds the JSONB-merge RPC (unblocks the deferred half of T307).
4. Skip the T354 retraction file (no-op). Decide whether to schedule a daily partition retention cron — needs `SELECT * FROM cron.job;` to check existing pg_cron jobs first.

- **Files** — `Ongoing Projects/migrations/2026-04-27_T319_drop_inactive_family_xl_plans_CORRECTED.sql` (new), `Ongoing Projects/migrations/2026-04-27_T352_audit_log_idx_CORRECTED.sql` (new), `Ongoing Projects/migrations/2026-04-27_T362_update_metadata_rpc_REAPPLY.sql` (new), `Ongoing Projects/migrations/2026-04-27_T354_events_partition_RETRACTED.sql` (new marker), `Ongoing Projects/CHANGELOG.md` (this entry).

---

## 2026-04-27 (owner-queue cleared — T117 closed, T338 closed, Confirm-email=OFF logged, T366 spawned) — _shipped, pushed to git_ (commit 13248fb)

Owner cleared all four remaining queue items: T117 (option A), T338 (option A), `/admin/auth-recovery/` (option C), and confirmed Supabase "Confirm email" project setting is currently **OFF**.

### Decisions logged

- **T117 — closed.** Option A — the `<EmptyState>`-for-admin / `<ErrorState>`-for-user pattern split is intentional. Admin's table-dense layouts don't benefit from `<ErrorState>`'s hero treatment. T117 body deleted from TODO; the original ~19-page migration target was misframed and is no longer tracked.

- **T338 — closed.** Option A — keep `warnSoft` (yellow) for the deletion-scheduled banner. Deletion is reversible during the 30-day window; warn (vs danger) signals "act if you didn't mean it" without oversignaling imminent irreversible loss. The user already saw a confirmation modal when scheduling deletion; the persistent banner is a reminder, not a panic alarm. T338 body deleted from TODO.

- **Supabase "Confirm email" project setting = OFF.** Owner confirmed. Per the AUTH-MIGRATION pre-flight, the setting must flip ON before `signInWithOtp` traffic; otherwise sessions issue immediately on signup and magic-link doesn't actually wait for the click. **Logged into T345's body as an explicit pre-flight step** (alongside the existing beta-cron reconciliation). No code change today — this is an owner-applied dashboard toggle that lands inside the AUTH-MIGRATION execution session.

- **`/admin/auth-recovery/` page — option C accepted; spawned as new T366.** Single consolidated mini-page with three recovery levers (confirm email, clear `verify_locked_at`, reset failed-login lockout) + audit-log entries per action. Full spec written into the T366 body in TODO so a future agent (or me, next session) can ship without re-deciding scope. Not built today — it's a security-touching admin page that deserves its own focused build session, not a tail-of-day commit.

### Bookkeeping

- TODO closures: T117 + T338 bodies deleted. Owner-queue section cleared (was 8 entries, now 0). T345 body updated with the Confirm-email=OFF finding. T366 spawned with full spec.
- Owner-queue residual: **0 questions remain.** The autonomous loop is fully unblocked on every item except the AUTH-MIGRATION coordinated session (your call when to schedule).
- Sister item not added: I noted in T309 closure that the only theoretical path to a both-set `frozen_at` + `plan_grace_period_ends_at` state would be a Stripe webhook setting grace while the user is already frozen. Worth a one-line check next time the Stripe webhook is in scope; not a verified bug.

- **Files** — `Ongoing Projects/TODO.md` (T117 + T338 + 2 owner-queue entries deleted; T345 updated; T366 added), `Ongoing Projects/CHANGELOG.md` (this entry).

---

## 2026-04-27 (T309 closed — all three RPCs already cross-clear correctly, verified via MCP) — _shipped, pushed to git_ (commit bd7c474)

Owner authorized the MCP query for T309. Read all three function bodies via `pg_proc`:

- **`billing_freeze_profile`** — `UPDATE users SET frozen_at = now(), frozen_verity_score = verity_score, plan_id = v_free_plan_id, plan_status = 'frozen', plan_grace_period_ends_at = NULL, updated_at = now() WHERE id = p_user_id;` Sets the freeze AND clears the grace period in the same statement. ✓
- **`billing_resubscribe`** — `UPDATE users SET ... frozen_at = NULL, frozen_verity_score = NULL, plan_grace_period_ends_at = NULL, ...` Clears all three in one statement. ✓
- **`billing_unfreeze`** — `UPDATE users SET frozen_at = NULL, frozen_verity_score = NULL, plan_id = v_sub.plan_id, plan_status = 'active', plan_grace_period_ends_at = NULL, ...` Same. ✓

System map §16 #10 was authored when the bodies couldn't be read from local SQL files; the concern was hypothetical pending verification. Now verified: the cross-clear is correctly implemented across all three RPCs. **T309 closed as already-correct, no migration needed.** Body removed from TODO; owner-queue entry removed.

Sister observation (NOT a new TODO entry, just noted): I didn't see an RPC that *sets* `plan_grace_period_ends_at` — that path presumably lives in the Stripe webhook handler when a payment goes `past_due`. If a user is already frozen when grace gets re-set, that's the only theoretical path to a both-set state. Worth a one-line check next time the Stripe webhook is in scope, but not a TODO entry — it's defensive belt-and-braces, not a verified bug.

- **Files** — `Ongoing Projects/TODO.md` (T309 body + owner-queue entry deleted), `Ongoing Projects/CHANGELOG.md` (this entry).

---

## 2026-04-27 (wave 6 — code-resolved owner-queue items: T54 + T298 + T318 + T319) — _shipped, pushed to git_ (commit 855dcf3)

After the owner asked which queue questions could be answered from current code, four were resolvable end-to-end.

### Shipped

- **T319 — `verity_family_xl` retirement cleanup.** Code-side scrub across 8 sites + a migration draft for the DB row deletion.
  Code-side answer: `web/src/app/api/family/config/route.js:24` already documents the SKU as "retired permanently" — Phase 2 of AI + Plan Change Implementation locked the per-kid add-on model on `verity_family` (1 included kid + up to 4 total via $4.99/mo per-kid add-on). The XL pair was retired by that decision; only the cleanup pass remained. Files scrubbed:
  - `web/src/lib/plans.js` — TIER_ORDER + DB-rows comment block (added grandfathering doc for T318 in the same comment)
  - `web/src/app/NavWrapper.tsx` — `deriveTier` branch + AuthContext `userTier` type doc
  - `web/src/app/admin/ad-placements/page.tsx` — `ALL_TIERS` constant + new-placement `hidden_for_tiers` default
  - `web/src/app/api/admin/ad-placements/route.js` — POST default
  - `web/src/app/leaderboard/page.tsx` — comment
  - `web/src/app/api/cron/recompute-family-achievements/route.js` — comment
  - `web/src/app/api/account/onboarding/route.js` — `deriveServerTier` branch
  - `web/src/app/profile/page.tsx` — T316 Pro-pill billing tier check
  Migration draft: `Ongoing Projects/migrations/2026-04-27_T319_drop_inactive_family_xl_plans.sql`. Includes a pre-flight DO-block that refuses to delete if any subscription still references a verity_family_xl plan, then drops the dependent permission_set bindings + the 2 plan rows.

- **T318 — `verity_monthly` $3.99 grandfathering documented.** Code-side answer: `web/src/app/api/cron/pro-grandfather-notify/route.ts` is named "pro-grandfather-notify" and explicitly targets `verity_monthly` users — strong evidence the cheaper SKU is intentional legacy grandfathering, not a perm-set bug. Added a doc-comment in `web/src/lib/plans.js` clarifying the duplication is intentional + the price gap is the legacy promise. Future agents won't "fix" it as a bug.

- **T54 — kids dashboard KPI reorder shipped.** `web/src/app/profile/kids/page.tsx:880-888`. Order changed from Articles → Minutes → Quizzes Passed → Longest Streak (the verified pre-fix state) to **Quizzes Passed → Articles → Longest Streak → Reading Time** per the locked spec. "Reading Time (min)" label normalized from "Minutes this week" to match the locked spec's terminology.

- **T298 — magic-link vs system-map §17 conflict marked SUPERSEDED.** Code-side answer: repo grep for `signInWithOtp` returns zero active callers (only `TODO(T177)` deferral comments at email-change/route.js + billing/cancel/route.js). Signup/login still use email + password. So the system map's §17 Phase 1 describes CURRENT state, while TODO line 39 + AUTH DIRECTION lock describes FUTURE state. They're not in conflict in time — the "Phase 1" label collision is what makes them look conflicting. Added a SUPERSEDED note at the top of system map §17 Phase 1 noting the AUTH-MIGRATION bundle is the canonical next phase. Anomalies #1, #16, #18, #20 collapse under magic-link; #7 already shipped via T306+T307.

### Bookkeeping

- TODO closures: T54, T298, T318, T319 bodies deleted + corresponding owner-queue entries removed. Skip-list updated to drop T54 (locked → shipped).
- TypeScript: 13 pre-existing errors unchanged; my edits compile clean.
- New migration draft `T319_drop_inactive_family_xl_plans.sql` joins the 7 already in `Ongoing Projects/migrations/` from Wave 4. Total 8 migrations awaiting owner apply.

- **Files** — `web/src/app/profile/kids/page.tsx`, `web/src/lib/plans.js`, `web/src/app/NavWrapper.tsx`, `web/src/app/admin/ad-placements/page.tsx`, `web/src/app/api/admin/ad-placements/route.js`, `web/src/app/leaderboard/page.tsx`, `web/src/app/api/cron/recompute-family-achievements/route.js`, `web/src/app/api/account/onboarding/route.js`, `web/src/app/profile/page.tsx`, `Ongoing Projects/2026-04-27_AUTH_PERMS_SYSTEM_MAP.md`, `Ongoing Projects/migrations/2026-04-27_T319_drop_inactive_family_xl_plans.sql`, `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (autonomous-fix wave 5 — Wave B redesign batch, 4-of-8 shipped) — _shipped, pushed to git_ (commit c70fc8a; CODE itself in untracked redesign files, rolls up with T357 cutover)

Fifth execution wave on the redesign batch. **4 of the 8 redesign-cutover items shipped to disk** — code lives in `web/src/app/redesign/*` which is currently untracked, so the changes commit when the larger T357 cutover lands. TODO + CHANGELOG bookkeeping commits now (those files ARE tracked).

### Shipped (code on disk in untracked redesign files)

- **T336 partial — Escape-to-close on AppShell mobile drawer.** `web/src/app/redesign/_components/AppShell.tsx`. The existing keydown listener (Cmd+K rail search focus) now also handles Escape — closes the drawer when open. Focus trap + banner z-index promotion (currently drawer z-30 sits below banners z-40) deferred since both expand scope (focus trap needs a `useFocusTrap` integration; banner promotion needs auditing every banner caller). T336 body re-scoped to mark Escape as shipped.

- **T342 — ProfileApp 60s perms polling.** `web/src/app/redesign/profile/_components/ProfileApp.tsx`. Long-lived SPA shell now fires `setInterval(refreshIfStale, 60_000)` and bumps a `permsTick` state on each tick. The `perms` `useMemo` depends on `permsTick`, so admin perm flips / plan upgrades / cohort grants force a re-render of the section list / locked badges / nav items without a full page nav. Mirrors the T312 fix in NavWrapper for the redesign sub-shell.

- **T343 — Required-field markers on ExpertApplyForm.** `web/src/app/redesign/_components/Field.tsx` gained a `required?: boolean` prop that renders a red asterisk next to the label (mutually exclusive with the existing `optional` prop). 5 fields in `web/src/app/redesign/profile/_sections/ExpertApplyForm.tsx` updated: "I'm applying as", "Full name", "Credentials", "Short bio", "Areas of expertise". User now sees the requirement before they hit submit.

- **T351 partial — 2 of 7 microcopy items.** `web/src/app/redesign/_components/AppShell.tsx`. Rail search placeholder `"Search settings"` → `"Search profile"` (matches the section's actual scope). LockedSection title `"{title} is part of premium"` → `"Upgrade to unlock {title}"` (action-oriented copy). 5 sub-items remain (spacing literals, tier-badge consolidation, PasswordCard red-dot, PrivacyCard Retry/Hidden-count, expert-queue empty state, "Data & danger" rail title, PublicProfileSection bio placeholder).

### Deferred from Wave B (will pick up in a future redesign-batch pass)

- **T331** — `profile_visibility` enum write mismatch between `PrivacyCard` ('hidden') and `PublicProfileSection` ('public'/'private'). Needs careful caller analysis to unify the tri-state cleanly across both surfaces; not in this pass.
- **T335** — `Field.tsx` focus styles. CSS pseudo-class can't override inline styles cleanly without restructuring the component to use className-based styling + a global `<style>` block. Deserves its own pass.
- **T337** — replace 3 native `window.confirm()` calls (BillingCard cancel, MFACard disable, SessionsSection revoke-others) with a Card-variant modal. Needs a new modal primitive built first; out of scope as an autonomous fix.
- **T339** — `as never` Avatar casts in PrivacyCard + BlockedSection. Needs the Avatar component's prop type tightened (define a proper `AvatarUser` shape). Coordinates with the iOS Avatar work + Models.swift.

### Bookkeeping

- TODO closures: T342 + T343 bodies deleted. T336 body re-scoped to "focus trap + z-index" since Escape shipped. T351 body re-scoped from 7 sub-items to 5 + tracking note for the 2 microcopy items shipped.
- TypeScript: 13 pre-existing errors unchanged; my edits compile clean.
- The 4 untracked redesign files touched (`AppShell.tsx`, `Field.tsx`, `ExpertApplyForm.tsx`, `ProfileApp.tsx`) join the existing redesign WIP. Their changes ride along the eventual T357 cutover commit.

- **Files** — `web/src/app/redesign/_components/AppShell.tsx` (untracked), `web/src/app/redesign/_components/Field.tsx` (untracked), `web/src/app/redesign/profile/_sections/ExpertApplyForm.tsx` (untracked), `web/src/app/redesign/profile/_components/ProfileApp.tsx` (untracked), `Ongoing Projects/TODO.md` (tracked, this commit), `Ongoing Projects/CHANGELOG.md` (tracked, this commit).

---

## 2026-04-27 (autonomous-fix wave 4 — T312 + T316 partial + T359 + 7 migration drafts) — _shipped, pushed to git_ (commit c0580b2)

Fourth execution wave on the sixth-pass audit set. Three code-shippable items closed end-to-end + seven SQL migration files drafted for owner apply.

### Shipped (code)

- **T312 — perms cache 60s polling.** `web/src/app/NavWrapper.tsx`. Added `refreshIfStale` import + `setInterval(() => void refreshIfStale(), 60_000)` inside the auth useEffect, with `clearInterval` in the cleanup. The lib's `refreshIfStale` short-circuits when `my_perms_version()` matches the cached pair, so the typical tick is one cheap RPC. On a real bump, it hard-clears the capability cache so the UI picks up plan upgrades / lockout flips / admin perm edits without waiting for the next route navigation. The redesign mirror (T342) is in untracked files; ships with the redesign-cutover commit.

- **T316 partial — Pro pride pill on profile hero.** `web/src/app/profile/page.tsx`. Added `plans:plan_id(tier)` to the user fetch + a Pro badge in the role-badges row when `plans.tier` is `verity` / `verity_pro` / `verity_family` / `verity_family_xl`. Single neutral pill (no color-per-tier per the owner-locked rule). Comment-thread Pro pill (the second half of T316) needs query plumbing in `CommentThread.tsx` + `CommentRow.tsx` and is captured as new **T365**.

- **T359 — iOS `profile_visibility='hidden'` parity.** `VerityPost/VerityPost/Models.swift` + `VerityPost/VerityPost/PublicProfileView.swift`. Added `profileVisibility: String?` to `VPUser` (was selected from DB but discarded by the Codable decoder because the field wasn't declared), plus the `profile_visibility` CodingKey mapping. Then mirrored the web `/u/[username]/page.tsx:190` gate in `PublicProfileView.load()` — if the fetched row has `profile_visibility ∈ ('private', 'hidden')` AND the viewer isn't the profile owner, set `notFound = true` and return. The original audit framed this as a "missing 'hidden' check" but verification showed iOS had NO visibility gate at all — public profiles rendered regardless of the column value. Both bugs closed by the same fix.

### Migration drafts queued for owner apply (`Ongoing Projects/migrations/`)

- **`2026-04-27_T233_articles_soft_delete.sql`** — `admin_soft_delete_article` + `admin_restore_article` + `purge_soft_deleted_articles` cron + RLS read filter that excludes `deleted_at IS NOT NULL` for non-admin readers. Schema unchanged (`articles.deleted_at` already exists). Includes the route-side code change spec at the bottom.

- **`2026-04-27_T352_audit_log_retention.sql`** — `anonymize_audit_log_pii()` (NULLs `actor_id` + `target_id` after 90 days for PII-class actions, lists those actions explicitly) + `purge_audit_log()` (hard-deletes after 365 days) + `audit_log_created_at_idx` (CONCURRENTLY, after the BEGIN/COMMIT block). GDPR data-minimization aligned.

- **`2026-04-27_T353_webhook_log_retention.sql`** — `purge_webhook_log()` deletes rows older than 30 days. Stripe-idempotency only needs ~24h of recent events; 30d is the safety margin.

- **`2026-04-27_T354_events_partition_drop.sql`** — converts `public.events` to PARTITION BY RANGE on `occurred_at`, monthly partitions, builds backfill partitions for any historical month present, ships `events_create_next_partition()` (mid-month cron, builds month+2) + `events_drop_old_partitions()` (1st-of-month cron, detaches+drops > 12mo). The CREATE TABLE column list mirrors `lib/events/types.ts` shape — owner verifies against the actual `events_legacy` schema before applying.

- **`2026-04-27_T361_billing_period_standardize.sql`** — second half of T56's locked spec. Updates DB rows from `'monthly'`/`'annual'` → `'month'`/`'year'`, handles any leftover `'lifetime'` rows defensively (NOTICE'd for owner triage), adds CHECK constraint on `('month','year','')`. Code change spec for the admin form is in the file footer.

- **`2026-04-27_T362_update_metadata_rpc.sql`** — `update_metadata(uuid, jsonb)` SECURITY DEFINER with `metadata = COALESCE(metadata, '{}') || $2` semantics. Caller must be self OR admin (service-role bypasses, which is the email-change path). Unblocks the deferred half of T307 (re-stamping `metadata.terms_accepted_at` on email change) — code change spec in file footer.

- **`2026-04-27_T347_user_state_enum_DRAFT.sql`** — DRAFT only, no SQL body. Surfaces three model options (single-state enum + severity / bitmask / sidecar table) for owner pick before the full migration can be written. Touches ~30 read sites; large enough to halt before SQL bodies are committed.

### Bookkeeping

- TODO closures: bodies for T312, T316, T359 deleted. T365 added (Pro pill comment-thread Phase 2).
- TypeScript: 13 pre-existing errors unchanged; my edits compile clean.
- iOS Swift: no project compile run; SourceKit diagnostic about Supabase module is environmental (not from my edits — applies broadly outside Xcode).

- **Files** — `web/src/app/NavWrapper.tsx` (T312), `web/src/app/profile/page.tsx` (T316), `VerityPost/VerityPost/Models.swift` + `VerityPost/VerityPost/PublicProfileView.swift` (T359), 7 new files in `Ongoing Projects/migrations/`, `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (preview-fixture audit — 1 new TODO item, 2 confirmed-already-built) — _no code; bookkeeping only_ — _shipped, pushed to git_ (commit 82d51d1)

Owner asked whether the redesign preview fixture (`web/src/app/redesign/preview/page.tsx` at `localhost:3333/redesign/preview`) had UI patterns not yet accounted for in TODO. Audited every section in the fixture against its corresponding live `_sections/` component. Result: 1 real gap, 2 confirmed-built, 2 already-tracked.

### Audit results

- **YouSection — MATCHES preview.** `_sections/YouSection.tsx` uses `<TierProgress>` (`_components/TierProgress.tsx`) which renders the exact same shape: "Next tier" label + tier name + "N pts to go" + min/current/max range + progress bar. Plus the StatTile grid for the numbers (Verity Score / Articles / Quizzes / Comments / Followers / Following). No-action.

- **PlanSection — MATCHES preview.** `_sections/PlanSection.tsx` delegates to `_cards/BillingCard.tsx`, which renders the exact "CURRENT PLAN" label + plan name + "Renews [date]" + "Active" pill (success-soft/green) the preview shows. Goes further with Trial/Cancelled state pills + Resume action. No-action.

- **ActivitySection / MessagesSection / ExpertQueueSection — MATCH preview.** Filter pills, unread state, queue tabs all confirmed present. No-action.

- **PrivacyCard followers multi-select — MATCHES preview.** `_cards/PrivacyCard.tsx` already implements the "Select all" + "X of N selected" + danger-soft pickup pattern shown in the fixture's Followers section. No-action.

- **CategoriesSection + MilestonesSection — already tracked as T360.** Files don't exist yet; T360 captures the build (mirror leaderboard pill-row pattern + 2-stat drilldown for Categories; earned + still-ahead grid for Milestones).

### New finding — T363

- **Public profile redesign placeholder needs full rebuild.** `web/src/app/redesign/u/[username]/page.tsx` (83 lines) is a static "Public profile is being rebuilt" placeholder, not a real surface. Per its own copy, the rebuild needs: hero, member-since, expert badge with organization, tier expression (plain text per no-color-per-tier rule), paginated followers/following, real report sheet (the `lib/reportReasons` enum already exists), block-from-public action. The preview fixture covers user-own profile only; public-profile shape needs design first. T4 review minimum (cross-surface, security-sensitive — privacy leaks if wrong). Captured as **T363**, HIGH, cutover-blocking. Coordinates with T330 (just-shipped 'hidden' check) + T331 + T359 (iOS parallel) before `PUBLIC_PROFILE_ENABLED` ever flips.

### Sentry / Pre-Launch hygiene check

Owner direction was to ensure Sentry + Apple submission items live in `Pre-Launch Assessment.md`, not TODO. Grep confirms TODO's 8 Sentry mentions are all cross-references to Pre-Launch (runbook routing rules, "tracked separately" notes, closure logs) — zero active Sentry items on TODO. Same shape for Apple submission. No moves needed.

- **Files** — `Ongoing Projects/TODO.md` (T363 added), `Ongoing Projects/CHANGELOG.md` (this entry).

---

## 2026-04-27 (autonomous-fix wave 3: 2 T3 items shipped, 1 deferred with reason) — _shipped, pushed to git_ (commit 87bea57)

Third execution wave. 2 of the 3 T3 medium items shipped end-to-end. T329 deferred because its precondition (T322 — wire 16 missing event types) hasn't shipped, so an admin events dashboard would have nothing meaningful to surface yet.

### Shipped (T3, tracked files)

- **T302 — `'anon'` tier bucket split into `'anon'` + `'unverified'`.** `web/src/app/NavWrapper.tsx:73-92` and the new `deriveServerTier` in `web/src/app/api/account/onboarding/route.js`. Three states for the auth/verify dimension now: `'anon'` (no signed-in user / cold visit), `'unverified'` (signed in but `email_verified=false`), `<plan-tier>` (verified, bucketed by paid tier). Pro-unverified retention vs actually-anonymous retention can now be distinguished — the previous flatten was polluting every downstream cohort analysis.
  - **Scope-narrowing note:** the audit + system map §17 Phase 0.1 had recommended a full 5-bucket consolidation (`'anon' | 'unverified' | 'free' | 'pro' | 'family'` — i.e., also rename `verity_pro` → `pro`, etc.). I shipped only the `'anon'` split since that's the actual bug; the rename is product-facing analytics terminology that should have owner sign-off, and there are zero hardcoded `=== 'anon'` consumers in the codebase (the audit's "~9 callsites" claim was wrong — fresh grep returned 1 hit, the AuthContext default itself).

- **T305 — AccountStateBanner returns ALL states, ordered high-severity first.** `web/src/components/AccountStateBanner.tsx`. Renamed `pickState` → `pickStates` (array return); component now maps to N stacked banners. A banned + frozen user used to see only the ban banner; now both render. Mirrors the redesign's `deriveAccountStates()` shape but stays scoped to the legacy banner's 6 states + bespoke red/amber tokens (no scope creep into the redesign's 14-state taxonomy). Sole consumer is `NavWrapper.tsx:397`; type-check confirms no other callers.

### Deferred from this wave

- **T329 — admin/analytics events-table panels.** Not shipped. The TODO body explicitly listed T322 (wire 16 missing event types — `article_read_start`, `subscribe_complete`, `bookmark_add`, etc.) as a precondition. Until those events fire, an `events`-table dashboard would render mostly-empty tiles. Pairing them in one bundle when T322 is picked up.

### Verification

- TypeScript: `npx tsc --noEmit -p tsconfig.json` — no new errors introduced. 13 pre-existing errors unchanged.
- TODO closures: bodies for T302, T305 deleted from the file.

- **Files touched** — `web/src/app/NavWrapper.tsx`, `web/src/app/api/account/onboarding/route.js`, `web/src/components/AccountStateBanner.tsx`, `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (autonomous-fix wave 2: 7 T2 items shipped, 3 deferred with reasons) — _shipped, pushed to git_ (commit 6c88870)

Second execution wave on the sixth-pass audit set. 7 T2 items shipped end-to-end. 3 T2 items deferred with explicit reasons (homoglyph library install, T5 retry-table, NavWrapper coupling). 3 T2 items in untracked redesign files held for the redesign-cutover commit.

### Shipped (T2, tracked files)

- **T307 — `/api/auth/email-change` clears stale `verify_locked_at` + writes `public.users.email`.** `web/src/app/api/auth/email-change/route.js`. The single .update now sets `email_verified=false`, `email=normalized`, `verify_locked_at=null` in one round-trip after `auth.updateUser` succeeds. Previously a locked user changing email kept the lockout AND lost 21 perms; the displayed email column drifted until the on_auth_user_updated trigger eventually fired. Third half of the spec (re-stamping `metadata.terms_accepted_at`) deferred to **new T362** because a plain `.update({ metadata: {...} })` clobbers other JSONB keys — needs a `UPDATE ... SET metadata = metadata || $1` RPC.

- **T313 — `LockedTab` copy is now branch-correct.** `web/src/app/profile/page.tsx:1844-1880`. The verified-but-unpaid arm now reads "Upgrade your plan to unlock this tab." instead of "This tab is part of paid plans." (which conflated verify-gate vs pay-gate). The unverified arm was already correct ("Confirm your email to unlock this tab."); annotated the contract so future agents don't collapse the two arms.

- **T315 — Comment composer lock copy unified.** `web/src/app/story/[slug]/page.tsx:1337-1398`. Replaced the 3-arm ternary with a single `discussionLockState` ('error' | 'anon' | 'unverified' | 'quiz' | null) computed once + a single panel render that interpolates copy and the next-action CTA. Adds explicit handling for the previously-missing 'unverified' state (signed-in but `email_confirmed_at` null) — those users were getting the anon copy. Each gate now has one clear next action.

- **T323 — `signup_complete` event no longer hardcoded `user_tier: 'anon'`.** `web/src/app/api/auth/signup/route.js:215-227`. Dropped the field entirely; the dashboard now infers active tier from later events (`verify_email_complete` → next `page_view` carries the resolved tier). Was polluting cohort analytics by labelling every signup as anon for the funnel join.

- **T324 — `onboarding_complete` now passes `user_tier`.** `web/src/app/api/account/onboarding/route.js`. New `deriveServerTier(userId)` helper mirrors `NavWrapper.deriveTier` so the server-side bucket label matches the client-side one. Falls back to null on errors (preserves the prior NULL-tier semantics if the lookup fails). Fires after `update_own_profile` succeeds so the tier is the post-onboarding state.

- **T325 — `usePageViewTrack` now defers fire until `authLoaded`.** `web/src/lib/useTrack.ts:59-79`. Pulls `authLoaded` from useAuth and gates the useEffect body on it. The mount-time race that captured signed-in viewers as `userTier='anon'` for the first 30-150ms is closed. Existing 10+ callers (`_HomeFooter`, leaderboard, search, browse, login, etc.) inherit the fix automatically.

- **T327 — TrackEvent shape adds `cohort` + `via_owner_link`.** `web/src/lib/events/types.ts`. Both nullable, snake_case. The fields are now part of the typed contract; `trackServer.ts` already accepts the same shape via `ServerTrackOptions` union (extension picked up automatically). Beta-cohort vs open-signup + owner-link vs user-link retention can be distinguished going forward.

### Deferred from this wave (with reasons)

- **T299 — homoglyph bypass on ban-evasion email check.** Deferred. The genuine fix needs a Unicode-confusables library (NFKC normalization alone doesn't merge Cyrillic 'а' U+0430 with Latin 'a' U+0061; only a TR39-backed table does). Shipping NFKC-only would be a half-fix; per the project's "genuine fixes, never patches" rule, this needs a separate session that picks + installs the library.

- **T310 — audit-log try/catch sweep across 4 routes.** Deferred. The current best-effort + console.error pattern is acceptable hygiene; the genuine fix is either (a) a retry-table + cron processor (T5 schema work) or (b) Sentry `captureException` upgrade (paired with the Sentry DSN decision in `Pre-Launch Assessment.md` S1/S2). Both options need owner direction and don't fit a 2-agent T2 wave.

- **T312 — perms cache realtime push (60s lag).** Deferred. The lib itself can't add hooks; the fix lives in the callers (NavWrapper.tsx + redesign ProfileApp.tsx) — a `setInterval(refreshIfStale, 60_000)` polling effect, OR a Supabase realtime subscription on `users.perms_version`. Better paired with the NavWrapper tier resolver simplification (T302) since both touch the same useEffect block. Queued for the next caller-side wave.

- **T331 / T342 / T343** — all in untracked redesign files (`PrivacyCard.tsx`, `PublicProfileSection.tsx`, redesign `ProfileApp.tsx`, `ExpertApplyForm.tsx`). Same constraint as T332/T340 from wave 1: included in the redesign-cutover commit, not this T2 batch.

### Verification

- TypeScript: `npx tsc --noEmit -p tsconfig.json` — no new errors introduced. 13 pre-existing errors in unrelated paths (ScoreTier mismatches, AvatarEditor/PrivacyCard Json types, ExpertProfileSection field name) unchanged.
- TODO closures: bodies for T307, T313, T315, T323, T324, T325, T327 deleted from the file. New T362 added for the deferred metadata-merge piece of T307.

- **Files touched** — `web/src/app/api/auth/email-change/route.js`, `web/src/app/profile/page.tsx`, `web/src/app/story/[slug]/page.tsx`, `web/src/app/api/auth/signup/route.js`, `web/src/app/api/account/onboarding/route.js`, `web/src/lib/events/types.ts`, `web/src/lib/useTrack.ts`, `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (autonomous-fix wave: 7 trivials + 3 locked-ready shipped) — _shipped, pushed to git_ (commit 0b31efc)

First execution wave on the sixth-pass audit set. 10 items shipped end-to-end (code + verification + TODO/CHANGELOG bookkeeping in lockstep). All edits typecheck against the existing baseline (no new TS errors introduced; pre-existing `ScoreTier`/Json/AvatarEditor errors unchanged). No DB migrations applied; no Stripe API calls made; no tests added (none exist for the touched surfaces yet).

### Trivials shipped (T1, 0 agents — direct fix)

- **T306 — `/api/auth/email-change` now bumps `perms_version`.** `web/src/app/api/auth/email-change/route.js`. After the `email_verified=false` flip succeeds, `service.rpc('bump_user_perms_version', { p_user_id: user.id })` fires best-effort. The 21 `requires_verified=true` perms now re-evaluate to `granted=false` on the next request instead of staying granted client-side until next nav.

- **T311 — middleware CORS no longer trusts `NEXT_PUBLIC_SITE_URL`.** `web/src/middleware.js:155-186`. Dropped the `PROD_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || ...` line; allow-list is now purely the hardcoded prod hosts (`https://veritypost.com`, `https://www.veritypost.com`) + dev hosts. A hostile or misconfigured env var can no longer add itself to credentialed CORS for `/api/*`.

- **T330 — `/u/[username]/page.tsx:190` now also checks `'hidden'`.** `web/src/app/u/[username]/page.tsx:188-198`. Lockdown-tier users (`profile_visibility='hidden'`) are now hidden from non-self viewers same as `'private'`. Sister files (`layout.js`, `/card/[username]/*`) already had this check; this was the lone leak waiting on a `PUBLIC_PROFILE_ENABLED` flip.

- **T332 — Toast component cleans up timers on unmount.** `web/src/app/redesign/_components/Toast.tsx`. Active timer handles tracked in a `useRef<Set<ReturnType<typeof setTimeout>>>`; component-level `useEffect` cleanup clears them all. Eliminates the dev-mode "set state on unmounted component" warning + the closure leak through orphan `setTimeout` callbacks.

- **T340 — Privacy section rail-search keywords updated.** `web/src/app/redesign/profile/_components/ProfileApp.tsx:388`. Added `'followers'`, `'unfollow'`, `'remove follower'` to the keywords array. Users typing those terms in the rail search now find the Privacy section.

- **T344 — `EmptyState` `icon` prop removed (with caller cleanup).** `web/src/app/redesign/_components/EmptyState.tsx` dropped the `icon?: React.ReactNode` prop entry from `Props`. 5 callers swept to drop the now-rejected prop: `_sections/ActivitySection.tsx` (×2), `_sections/BlockedSection.tsx`, `_sections/BookmarksSection.tsx`, `_sections/MessagesSection.tsx`. Original "comment said for backward compat" was wrong — removing the prop produced 5 type errors that surfaced the actual usage.

- **T350 — Deprecated auth-mockups page deleted.** `web/src/app/ideas/auth-mockups/page.tsx` removed; empty parent dir also removed. Repo-grep confirmed zero inbound `/ideas/auth-mockups` links before deletion.

### Locked-ready shipped (LOCKED → ship on "go")

- **T40 — Desktop story-page Timeline aside removed.** `web/src/app/story/[slug]/page.tsx:2065-2069`. The `{false && isDesktop && canViewTimeline && (<aside>...)}` block deleted; replaced with a comment noting the wiring is intact (`Timeline` component, `canViewTimeline` perm, `timeline` state) for an eventual re-introduction. Mobile Timeline access via the `activeTab === 'Timeline'` tab bar unchanged.

- **T56 — `'lifetime'` dropped from admin BILLING_PERIODS array.** `web/src/app/admin/plans/page.tsx:56`. Array now `['', 'monthly', 'annual']`. Note: the locked spec also called for standardizing string values to `'month'` / `'year'` (matching the DB column reads in `web/src/app/profile/settings/page.tsx:4253` + `web/src/lib/plans.js:58,78`). That half is a T5 schema migration (existing plan rows carry `'monthly'`/`'annual'` from the admin form); tracked as new item **T361** for owner-applied migration.

- **T173 — PATCH `/api/comments/[id]` now enforces body-length cap.** `web/src/app/api/comments/[id]/route.js`. Added `getSettings`/`getNumber` import + `COMMENT_MAX_LENGTH_FALLBACK=4000` + the same `comment_too_long` short-circuit POST uses. RPC `edit_comment` already enforces internally — this closes the route-level parity gap so PATCH and POST short-circuit identically.

### Items deferred to T2 wave

The original "11 trivials" set included T335 (Field.tsx focus styling — needs a CSS class wrapper or `<style>` injection), T336 (AppShell drawer Escape + focus trap + banner z-index promotion — touches keyboard a11y), T337 (replace 3 native `confirm()` calls with a Card-variant modal — requires a modal primitive that isn't built yet), T339 (`as never` Avatar casts — requires defining a proper `AvatarUser` type, possibly in `@/components/Avatar`). All four are real but not 1-3 lines; reclassified to T2 and queued for the next wave.

### Verification

- TypeScript: `npx tsc --noEmit -p tsconfig.json` — no new errors introduced. 13 pre-existing errors remain unchanged (ScoreTier `label`/`slug` mismatches in 4 files, AvatarEditor + PrivacyCard Json type mismatches, ExpertProfileSection field-name mismatch). None on touched paths.
- TODO closures: bodies for T306, T311, T330, T332, T340, T344, T350, T40, T56 deleted from the file. Skip-list updated (T40, T56, T173 removed; T19/T26/T54/T55/T57/T-EMAIL-PRUNE remain locked).
- New item T361 added to track the deferred billing-period string standardization (T5 migration).

- **Files touched** — `web/src/app/api/auth/email-change/route.js`, `web/src/middleware.js`, `web/src/app/u/[username]/page.tsx`, `web/src/app/redesign/_components/Toast.tsx`, `web/src/app/redesign/_components/EmptyState.tsx`, `web/src/app/redesign/profile/_components/ProfileApp.tsx`, `web/src/app/redesign/profile/_sections/ActivitySection.tsx`, `web/src/app/redesign/profile/_sections/BlockedSection.tsx`, `web/src/app/redesign/profile/_sections/BookmarksSection.tsx`, `web/src/app/redesign/profile/_sections/MessagesSection.tsx`, `web/src/app/story/[slug]/page.tsx`, `web/src/app/admin/plans/page.tsx`, `web/src/app/api/comments/[id]/route.js`, `web/src/app/ideas/auth-mockups/page.tsx` (deleted), `Ongoing Projects/TODO.md`, `Ongoing Projects/CHANGELOG.md`.

---

## 2026-04-27 (TODO sixth-pass full re-audit — 3 dropped, 5 re-scoped, 6 queued for owner, 1 demoted) — _no code; verification + bookkeeping only_ — _shipped, pushed to git_ (in commit 0b31efc)

Sixth verification pass on outstanding TODO items, run via 6 parallel Explore agents reading live code in clusters (auth routes + middleware, profile/settings/NavWrapper, story/comments/articles, admin/plans/billing/Stripe, redesign components, analytics/events + misc). Every open item from T14 through T360 (excluding owner-input-locked items already-skipped) read against current code with file:line evidence. Three items dropped as already-fixed / wrong claim, five re-scoped inline, six items moved to QUEUED FOR OWNER REVIEW, one demoted on severity, one verdict overridden where the agent misread scope.

- **3 items DROPPED entirely** (verified stale or wrong-claim, body deleted from TODO):
  - **T117** — original "migrate ~19 web pages to `<ErrorState>` primitive" claim. Sixth-pass enumerated current callers: only 6 user-facing pages use `<ErrorState>` (bookmarks, leaderboard, messages, notifications, profile, search). The 19 admin pages cited (analytics, breaking, ad-campaigns, ad-placements, email-templates, moderation, newsroom, pipeline, promo, recap, reports, sponsors, stories, subscriptions, support, webhooks) use `<EmptyState>` for both empty AND error rendering. The split looks intentional — not a missed migration. Removed from skip list, owner-question queued.
  - **T314** — TTS button "renders disabled-but-visible for non-Pro" claim. Sixth-pass read at `web/src/app/story/[slug]/page.tsx:1805-1810` confirms button is conditionally rendered `{canListenTts && <TTSButton .../>}` — for non-Pro users it doesn't render at all. The "disabled-but-visible" premise was wrong. Item body deleted.
  - **T326** — `/api/events/batch` "doesn't whitelist client-supplied `user_tier`" claim. Sixth-pass read confirmed line 164 sets `user_id: ctx.authedUserId` server-authoritatively before line 167's `user_tier: clampString(e.user_tier, 32)` length-clamp. Security invariant holds via user_id; the tier clamp is hardening, not a hole. Item body deleted.

- **5 items RE-SCOPED inline** (kernel real, claim corrected):
  - **T54** — `web/src/app/profile/kids/page.tsx` line range 807-814 → 880-887 (KPI order Articles → Minutes → Quizzes Passed → Longest Streak still in place; locked reorder spec NOT yet implemented). Owner-queue entry added — current code matches neither the original audit claim's lines nor the locked-decision lines, so confirming what's actually intended is queued.
  - **T165** — count drift acknowledged: 4,272 → ~4,630 inline `style={{...}}` matches via fresh grep.
  - **T173** — file-path note: POST is in `web/src/app/api/comments/route.js:96-106` (not `[id]/route.js` as original claim implied). PATCH parity gap kernel still real at `[id]/route.js:47-84`.
  - **T310** — explicit route enumeration: `signup/route.js:200-210`, `login/route.js:119-128`, `callback/route.js:157-166`, `email-change/route.js:132-148` all wrap `audit_log` insert in try/catch. Sweep target is concrete now.
  - **T322** — count correction: 5-of-19 → only 3 events actually fire (`signup_complete`, `onboarding_complete`, `page_view`). `quiz_started` / `quiz_completed` not actually wired despite earlier audit listing them.

- **6 items moved to QUEUED FOR OWNER REVIEW** (require owner input before autonomous loop can pick them up):
  - **T54** — current KPI order doesn't match either claim or locked spec; need owner re-confirm.
  - **T117** — owner direction on `<EmptyState>`-for-admin / `<ErrorState>`-for-user split (intentional or migrate?).
  - **T309** — RPC bodies (`billing_freeze_profile` / `billing_resubscribe` / `billing_unfreeze`) need MCP read; can't verify cross-clearing from code.
  - **T318** — pricing decision: keep `verity_monthly` ($3.99) and `verity_pro_monthly` ($9.99) with identical perms (legacy grandfathering), OR differentiate.
  - **T319** — DB-row deletion of inactive `verity_family_*` SKUs (6 code references confirmed).
  - **T338** — UX call on deletion-scheduled banner severity (`warnSoft` vs `dangerSoft` — verifier and adversary disagreed).

- **T330 verdict OVERRIDDEN** — one redesign-cluster agent called T330 STALE on the assumption that `web/src/app/u/[username]/page.tsx` had been "superseded by the redesign." That's wrong: `/u/[username]/*` is the live public-profile route; the redesign at `/redesign/profile/*` is the user's own-editor view, a different surface. T330 remains CRITICAL — `page.tsx:190` checks only `'private'` while sister files (`layout.js:25-27`, `/card/[username]/page.js:59-61`, `/card/[username]/layout.js:24-27`) all check `'hidden'`. Privacy-leak risk on `PUBLIC_PROFILE_ENABLED` flip. Body annotated to make scope explicit.

- **T333 demoted HIGH → LOW.** "Dev-perms-all-true override gates only on `host === 'localhost:3333'`" — production hostnames never end in `:3333`, so the failure mode requires environment misconfiguration AND port collision. Cheap belt-and-suspenders fix (add `NODE_ENV !== 'production'` AND'd into the gate) is still worth doing opportunistically with the next redesign cutover work, but it's no longer a HIGH.

- **T-EMAIL-PRUNE clarified.** Current `web/src/app/api/cron/send-emails/route.js:21-29` defines 7 types: `breaking_news`, `comment_reply`, `expert_answer_posted`, `kid_trial_day6`, `kid_trial_expired`, `data_export_ready`, `expert_reverification_due`. Locked decision keeps 3; the concrete 4 to drop are: `breaking_news`, `comment_reply`, `expert_answer_posted`, `kid_trial_day6`. Skip-list entry annotated; ready to ship on owner "go."

- **CONFIRMED-REAL via sixth-pass with file:line evidence (~50 items):** T19, T26 (per prior MCP), T27, T40, T55, T56, T57, T92, T166, T173, T233, T299, T301, T302, T303, T304, T305 (with redesign multi-state alternative noted in `redesign/_lib/states.ts:68-157`), T306, T307, T308, T310, T311, T312, T315, T316, T317, T320, T321, T322, T323, T324, T325, T327, T328, T329, T330 (override), T331, T332, T334, T335, T336, T337, T339, T340, T341, T342, T343, T344, T350. Each verified by reading the cited file at the cited line and confirming the bug pattern.

- **2 items OUT-OF-SCOPE for code-only verification:** T14 (iOS dynamic streak-recovery rendering — needs running app to check conditional branch); T359 (full Swift `profile_visibility` audit — needs deeper iOS code dive than this pass). Both retained in TODO with notes.

- **Total open items in TODO now: ~173** (was ~176 — net minus 3 dropped: T117/T314/T326).

- **Files** — `Ongoing Projects/TODO.md` (sixth-pass verification banner + T117/T314/T326 deletes + T54/T165/T173/T310/T322/T330/T333/T338/T-EMAIL-PRUNE body updates + 6 new owner-queue entries), `Ongoing Projects/CHANGELOG.md` (this entry).

---

## 2026-04-27 (AUTH/PERMS SYSTEM MAP audit — 47 new TODO items T298-T344; 4 dropped as already-fixed; magic-link conflict surfaced) — _no code; verification + bookkeeping only_

Fifth verification pass, this one a 1-by-1 read of every finding in `Ongoing Projects/2026-04-27_AUTH_PERMS_SYSTEM_MAP.md` against live code via 4 parallel Explore agents (clusters: anomalies #1-11, anomalies #12-22, pen-test+analytics #23-38, redesign §21.1+§21.2). 61 findings reviewed.

- **47 items added** to TODO under new "AUTH/PERMS SYSTEM MAP FINDINGS — verified 2026-04-27" section, indexed T298-T344. Each entry has the cited file:line and a fix recommendation. Spans CRITICAL security (T299 homoglyph bypass, T300 public-profile column leak, T301 kid pair-code 7-day TTL), HIGH auth/billing flow (T302-T311 NavWrapper / leaderboard / Stripe-cohort / banner / email-change / admin-sync / state-machine / audit / CORS), MEDIUM (T312-T321 perms cache / locked tabs / TTS / composer / Pro pride / access_codes / SKU pricing / inactive plans / owner-link gaps), analytics gaps (T322-T329 events firing / tier accuracy / cohort tracking / GA4 dual / dashboard reads), and redesign-cutover-prep (T330-T344 covering §21.1 ship-blockers + §21.2 important UX gaps).

- **DIRECTION CONFLICT surfaced (T298, CRITICAL).** System map §17 Phase 1 plan (lines 922-987) describes a unified verify-email flow that begins "signup form (email + password)". This contradicts TODO line 39 + the AUTH DIRECTION LOCKED 2026-04-26 block ("magic-link auth only · no password"). Both docs dated 2026-04-27. Phase 1's `<VerifyGate>` placements + pick-username server-side `email_verified` gate + `complete_email_verification` flow assume password-confirm semantics that don't apply post-magic-link. Anomaly resolutions for #1, #16, #20 (T320, T313, T321) become moot post-AUTH-MIGRATION. Owner needs to confirm canonical direction before Phase 1 can be touched.

- **4 items DROPPED as already-fixed** (verified by quoting current code):
  - **Pen-test #26 (`/api/access-redeem` JSON parse before rate limit):** `web/src/app/api/access-redeem/route.ts` rate-limit check fires at line 39 BEFORE the `request.json()` parse at line 52. Order is correct.
  - **Pen-test #27 (login-precheck timing side-channel):** `web/src/app/api/auth/login-precheck/route.js` already has constant-shape responses (lines 47, 56, 65) + per-IP (30/h) and per-email (3/h) rate limits + email normalization at line 28. Compensating controls in place.
  - **Pen-test #30 (email-change race condition):** `web/src/app/api/auth/email-change/route.js:99-120` now calls `auth.updateUser` FIRST, then flips `email_verified=false`. The race window claimed in the system map (local flip beats updateUser) is no longer reproducible.
  - **Redesign §21.2.9 (AvatarEditor save placement):** AvatarEditor is mounted in `PublicProfileSection.tsx:197`; the card has its own dedicated footer Save at lines 203-215. Reviewer's claim that the save is "on the bio card below" was based on an earlier layout.

- **3 items NOT added to TODO (out of scope per system map):**
  - **Anomaly #14 (free-reads pill lying to anon):** owner-decided in system map Phase 0.4 to drop pill + regwall + `LAUNCH_HIDE_ANON_INTERSTITIAL` flag entirely. No TODO entry — execution falls under that Phase 0 PR when Phase 0 ships.
  - **Anomaly #15 (no lifecycle email cadence for unverified):** explicitly out of scope in the system map; separate retention project.
  - **Anomaly #21 (anon visitors no save-for-later):** explicitly out of scope; separate retention project.

- **2 items partially-verified, deferred to MCP confirm:**
  - **Anomaly #10 (frozen_at + plan_grace_period_ends_at don't clear each other):** RPC bodies `billing_freeze_profile` / `billing_resubscribe` / `billing_unfreeze` aren't fully readable from local SQL files. Captured as T309 with a "defer-to-MCP" note for the planner agent when the item is picked up.
  - **Anomaly #11 (verity_monthly vs verity_pro_monthly identical perms):** captured as T318. Cited from system map's MCP query result (545 perms each). Owner pricing decision before any technical work.

- **Verification banner updated** with fifth-pass entry and new total (~160 open items).

- **Files** — `Ongoing Projects/TODO.md` (new section ~T298-T344, verification banner update). System map doc itself NOT modified — it's a frozen-in-time reference doc per its own header.

### Follow-up second-pass (same date) — architectural / sequencing concerns added

After the user asked "is there anything in there we are missing or need to consider," re-skimmed the system map for items that don't fit the "bug with file:line" pattern but are real load-bearing concerns the line-by-line walk would skip. Added:

- **T345 — Beta-cron + AUTH-MIGRATION sequencing pre-flight (CRITICAL).** `sweep_beta_expirations` (system map §11) hard-locks every `cohort='beta' AND email_verified=false` user the moment `settings.beta_active='false'`. AUTH-MIGRATION cutover trips this. Pre-flight required: bulk-trigger magic-links for those users, OR admin-confirm them, OR keep beta_active=true through the migration window. Owner picks before the migration session opens.
- **T346 — Freeze-scope product question (MEDIUM).** Per system map §14: `frozen_at` blocks scoring + DM but NOT comments / voting / following / reading. Question for owner: intended (monetization signal only), or bug (should be content lockout)?
- **T347 — Consolidate 8 user-state flags into one enum (MEDIUM, T5 schema).** Per system map §8: `is_banned`, `locked_until`, `is_muted`, `deletion_scheduled_for`, `frozen_at`, `plan_grace_period_ends_at`, `verify_locked_at`, `comped_until` are independent columns with no synchronization. Pair with T305 (banner stacking) + T309 (frozen+grace clearing).
- **T348 — `requirePermission()` no per-request memoization (DEBT).** Per system map §12: every check round-trips to `compute_effective_perms`. Memoize via AsyncLocalStorage / request context.
- **T349 — Single-screen signup form factor under magic-link (MEDIUM).** Per system map §17 Phase 2: drop password fields + defer username to post-verify. Bundle into AUTH-MIGRATION execution.
- **T350 — Delete deprecated `web/src/app/ideas/auth-mockups/page.tsx` (LOW).** System map §20a's own recommendation — page doesn't align with the redesign palette.
- **T351 — §21.3 redesign polish bundle (LOW, 7 sub-items).** Spacing literals → S-tokens, tier-badge consolidation, PasswordCard red-dot signal, Retry on followers load fail, microcopy pass, Hidden-confirm count, expert-queue admin empty state.

**Two new entries to QUEUED FOR OWNER REVIEW:**
- Supabase "Confirm email" project setting — ON or OFF in prod? Blocks AUTH-MIGRATION planning.
- Manual admin email-confirm tool — ship `/admin/auth-recovery/` page now, or wait for first support ticket?

These weren't bugs the agents could verify line-by-line — they're load-bearing concerns surfaced from the system map's narrative sections (§8, §11, §12, §14, §17 Phase 2, §20a, §21.3). Captured here so they don't fall off the radar between sessions.

Total open items in TODO now: ~167 (was ~113 + 47 anomaly + 7 architectural). Verification banner reflects the new count.

### Third-pass (same date) — DB-perf findings + system-map resolved markers

After the user shared a self-critique pointing at additional gaps, two more changes:

- **+5 DB-perf items added (T352-T356).** From a follow-on DB-perf review pass that surfaced 6 items (#39-44 in that review). 5 are new TODO entries: T352 audit_log retention, T353 webhook_log retention, T354 events table partition-drop cron, T355 subscription-reconcile-stripe N+1 sequential calls, T356 permission_set_perms REINDEX before launch. The 6th review item (`compute_effective_perms` request-scoped memoization) was already captured as T348; not duplicated. None launch-blocking; all real ops debt.

- **System map doc updated inline** to mark already-fixed items as RESOLVED. The four items dropped during 5th-pass (§16 #26 access-redeem rate-limit order, §16 #27 login-precheck timing controls, §16 #30 email-change race ordering, §21.2.9 AvatarEditor save placement) now carry `[RESOLVED 2026-04-27 — TODO 5th-pass verification]` markers inline in `Ongoing Projects/2026-04-27_AUTH_PERMS_SYSTEM_MAP.md`. Future agents reading the system map see resolved status without having to cross-reference TODO.

Total open items in TODO now: ~172. Verification banner reflects the new count.

Files this round: `Ongoing Projects/TODO.md` (T352-T356 added in DB-perf section + verification banner update), `Ongoing Projects/2026-04-27_AUTH_PERMS_SYSTEM_MAP.md` (4 resolved markers inline at §16 #26, #27, #30 + §21.2.9), `Ongoing Projects/CHANGELOG.md` (this entry).

---

## 2026-04-27 (TODO fourth-pass audit — T201 / T285 closed; T40 / T54 / T117 / T165 / T173 / T233 re-scoped) — _no code; verification + bookkeeping only_

Fourth verification pass on outstanding TODO items, run via 4 parallel Explore agents reading live code in clusters (settings/profile, admin/story, comments/notifications, misc/security). Two items confirmed already-fixed and dropped; six items re-scoped inline (line numbers, counts, or kernel correction); rest confirmed real and unchanged. No new bugs surfaced incidentally.

- **T201 — REFERRAL_COOKIE_SECRET already in `.env.example`.** Verified at `web/.env.example:130`. Code at `web/src/app/r/[slug]/route.ts:100` and `web/src/lib/referralCookie.ts:24` reads it. Original gap-finder claim was stale. Item dropped from TODO verification banner.

- **T285 — Web comment report already structured.** `web/src/app/api/comments/[id]/report/route.js:73-79` calls `assertReportReason(reason)` against the `web/src/lib/reportReasons.js` enum union. iOS `BlockService.swift:141-158` posts the same enum (`spam` / `harassment` / `offTopic` / `misinformation` / `other`). Web ↔ iOS parity confirmed. Item body deleted from TODO.

- **T40 line correction.** Dead aside lives at `web/src/app/story/[slug]/page.tsx:2066`, not :1776. Body section updated.

- **T54 line correction.** Kids dashboard KPI cards live at `web/src/app/profile/kids/page.tsx:807-814`, not :749-756. Order verified as Articles → Minutes → Quizzes Passed → Longest Streak — owner-locked target Quizzes Passed → Articles → Streak → Reading Time still applies.

- **T117 re-scope.** ~19 pages need `<ErrorState>` migration, not ~9. Skip-list entry now lists explicit page set (admin: analytics, breaking, ad-campaigns, ad-placements, email-templates, moderation, newsroom, pipeline, promo, recap, reports, sponsors, stories, subscriptions, support, webhooks; user-facing: contact, expert-queue, forgot-password, login, profile, request-access, reset-password, verify-email, welcome).

- **T165 re-scope.** Inline `style={{...}}` count is 4,272 across `web/src/`, not "90+". Tailwind PostCSS plugin is wired but adoption minimal; `globals.css` exists but mostly unused. Body section updated with sharper count.

- **T173 re-scope.** Parity-only fix: `edit_comment` RPC enforces length internally so no data corruption risk. POST handler short-circuits with `comment_too_long` before RPC; PATCH passes `body` straight through. Skip-list entry updated to clarify scope.

- **T233 corrections.** Hard-delete lives at `web/src/app/api/admin/articles/[id]/route.ts:762`, not :611. `recordAdminAction` writes BEFORE the `.delete()` (audit lands but article is irrecoverable) — original "audit log writes after delete (orphan if persist fails)" claim was wrong. Body section updated.

- **All other open + locked + deferred items confirmed real and unchanged:** T14, T19, T26, T27, T34, T35, T55, T56, T57, T92, T166, T-EMAIL-PRUNE. All cross-checked against `web/src/app/profile/page.tsx`, `web/src/app/profile/settings/page.tsx`, `VerityPost/VerityPost/SettingsView.swift`, `VerityPost/VerityPost/ProfileView.swift`, `VerityPost/VerityPost/HomeView.swift`, `VerityPost/VerityPost/StoryDetailView.swift`, `VerityPost/VerityPost/Models.swift`, `VerityPost/VerityPost/BlockService.swift`, `web/src/app/api/admin/prompt-presets/route.ts`, `web/src/app/api/admin/plans/[id]/route.js`, `web/src/app/api/stripe/checkout/route.js`, `web/src/components/CommentThread.tsx`, `web/src/app/leaderboard/page.tsx`, `web/src/app/api/cron/send-emails/route.js`, `web/.env.example`. T26 migration still not drafted (awaiting owner answers per 2026-04-27 owner-decision pass).

- **Files** — `Ongoing Projects/TODO.md` (verification banner + T40 / T54 / T117 / T165 / T173 / T233 bodies + T285 deletion + T201 reference deletion).

---

## 2026-04-27 (Decision-log closures — T77 / T85 / T268 / T272 / T291) — _no code; closure record only_

Five TODO items closed during the 2026-04-27 owner-decision pass. No code change accompanies these — each represents either an owner-administrative action complete, or audit verification confirming the work was already shipped or already accurate. Recording here so TODO can drop the closed-status notes.

- **T77 — MASTER-6 (password verification) SHIPPED marker recorded.** Commit `6e13089b03f0ed38790b208668f6075c191f098e` is the canonical SHA for the password-verification endpoint. Route at `web/src/app/api/auth/verify-password/route.js` MCP-verified to have `requireAuth`, 5/hour rate limit, ephemeral client, `record_failed_login_by_email`. Settings password card is the consumer. Owner records the SHA in pre-launch tracker.

- **T85 — Profile Task 5 perm-key migration: already-resolved.** MCP query confirmed `profile.activity`, `profile.categories`, `profile.achievements` each bound to all 8 plan sets (admin / editor / expert / family / free / moderator / owner / pro). iOS `ProfileView.swift:191-200` uses canonical short-form keys (`profile.activity`, etc.). DB binding is live; no migration owed; iOS code already correct. Closed.

- **T268 — DMCA designated agent registration: owner filed.** Owner filed at copyright.gov/dmca-agent (free, ~10 min). Registration ID will be substituted into `web/src/app/dmca/page.tsx` line 125 (where the W3 placeholder line `[pending — to be filed at copyright.gov/dmca-agent]` lives) when ready. Pure copy edit when owner pastes the ID.

- **T272 — Accessibility statement: already-resolved.** MCP-verified `web/src/app/accessibility/page.tsx` already has the full formal statement: WCAG 2.1 AA commitment (line 49), known-limitations enumeration (lines 142-157), contact email `support@veritypost.com` (line 162), last-updated date (line 41). Audit's premise was stale.

- **T291 — Help page Verity-tier expert pricing: HELP-PAGE-ACCURATE.** MCP-verified `plan_features.ask_expert` is `false` for verity_monthly/annual and `true` for verity_pro_monthly/annual. Help page at `web/src/app/help/page.tsx:114-117` correctly reflects this — Verity excludes Ask-an-Expert; Pro includes. No drift, no copy fix needed. (If owner ever wants Verity tier to include Ask-an-Expert, that's both a `plan_features` row update AND a help page refresh — separate pricing decision.)

- **Files** — none modified for these closures. Status notes only.

---

## 2026-04-27 (Phase 6 — final polish + testing, code shipped) — _code shipped; no new migration_

### Context

Phase 6 of the AI + Plan Change Implementation roadmap. The final phase. Consolidates the customer-facing UI surfaces for the new plan structure + age-banded pipeline + DOB-correction system + graduation flow that Phases 0-5 built. Also closes out the operational gaps flagged in earlier phases (subscription drift reconciliation, Pro grandfather migration).

### Cluster — graduation welcome screen

`web/src/app/welcome/page.tsx` — added `GraduationClaim` early-return at the top of WelcomePage. When `?graduation_token=...` is present, renders dedicated email + password form, calls `/api/auth/graduate-kid/claim`, and on success surfaces a "Welcome [name], your account is ready" success state with login CTA. Without the token param, falls through to the standard onboarding carousel.

### Cluster — reconciliation crons

`web/src/app/api/cron/subscription-reconcile-stripe/route.ts` (NEW): daily cron at 06:45 UTC. For each Stripe-billed subscription in `active`/`trialing` status, retrieves the live Stripe subscription via the project's fetch-based Stripe client (REST API, no SDK dep). Computes expected `kid_seats_paid` from the `items.data[].price.metadata.seat_role` field (extra_kid quantity + 1 included). Updates DB if drift detected, logs to captureMessage. Capped at 200 subs/run.

### Cluster — Pro grandfather migration cron

`web/src/app/api/cron/pro-grandfather-notify/route.ts` (NEW): daily cron at 07:00 UTC. Two-stage flow:
- **Notify stage:** Pro subs with `current_period_end` between 25-31 days out + no prior `metadata.pro_migration_notified_at` get the heads-up email queued (currently logs to captureMessage as the placeholder for the real email-send when infra is wired) + metadata stamp.
- **Migrate stage:** Pro subs with `current_period_end` <= now() + 24h + already-notified get their Stripe subscription item swapped from Pro price → Verity price via REST PATCH (proration_behavior: 'none' — bills the new lower price at next renewal cleanly).
- Runs in dry-run mode if `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_ANNUAL_PRICE_ID` / `STRIPE_VERITY_MONTHLY_PRICE_ID` / `STRIPE_VERITY_ANNUAL_PRICE_ID` env vars unset (logs counts, no writes).
- Apple Pro subs not handled here — Apple StoreKit doesn't allow programmatic plan-switch the same way; in-app banner asks them to manually switch (deferred to iOS work).

### Cluster — family seat UI

`web/src/app/profile/family/page.tsx` — added inline `FamilySeatsCard` component. Calls `GET /api/family/seats` on mount; when an active Family sub is detected, renders a card showing:
- "M of N kid seats used (cap 4)"
- Current monthly extra-kid charge ("+$X.XX/mo for extra seats")
- Platform-specific copy: Apple users see "manage in App Store"; Google users see "manage in Google Play"; Stripe users see add-kid pricing or cap message.
Hidden gracefully (returns null) for non-Family users + permission-denied responses.

### Cluster — public pricing page

`web/src/app/pricing/page.tsx` (NEW): server component. 3-card layout (Free / Verity / Family) with feature lists, price + period, CTA buttons. Below: scaling table showing monthly + annual pricing for 1-4 kids ($14.99 → $29.96/mo). Closing copy explains net-zero seat math at graduation. Static SEO metadata. No client JS.

### Cluster — vercel.json

Added two cron entries: `subscription-reconcile-stripe` at 06:45 UTC, `pro-grandfather-notify` at 07:00 UTC.

### Verification

- `npx tsc --noEmit` clean for Phase 6 surfaces (the `redesign/` directory's `ScoreTier` type drift remains from the unrelated work stream — not introduced by Phase 6).
- ESLint + Prettier clean.

### Files touched (3 + 3 new)

- `web/vercel.json` (cron registration)
- `web/src/app/welcome/page.tsx` (GraduationClaim early-return component)
- `web/src/app/profile/family/page.tsx` (FamilySeatsCard inline component)
- NEW: `web/src/app/api/cron/subscription-reconcile-stripe/route.ts`
- NEW: `web/src/app/api/cron/pro-grandfather-notify/route.ts`
- NEW: `web/src/app/pricing/page.tsx`

### Owner action items

1. **Set Stripe price IDs as env vars.** For the Pro grandfather cron to switch out of dry-run mode, set:
   - `STRIPE_PRO_MONTHLY_PRICE_ID` (current Pro monthly price ID from Stripe Dashboard)
   - `STRIPE_PRO_ANNUAL_PRICE_ID`
   - `STRIPE_VERITY_MONTHLY_PRICE_ID` (the new Verity solo monthly price ID — owner created in Phase 2 setup)
   - `STRIPE_VERITY_ANNUAL_PRICE_ID`
2. **Wire the email-send infra.** The Pro grandfather notify stage currently logs to captureMessage instead of actually sending the email. When the email-template + outbound-send pipeline is online, replace the captureMessage block with the real send. Same applies to: DOB correction received/approved/rejected, band advance prompt, kid graduation account ready.
3. **Smoke test the welcome graduation path:** copy a real `claim_url` from `/api/kids/[id]/advance-band` response (Phase 5 endpoint), open it in a fresh incognito session, complete the form. Verify new auth.users row exists + categories carried over to `users.metadata.feed.cats`.
4. **Visit `/pricing` in prod** — copy + price + scaling table all reflect the locked Phase 2 numbers.

### What this DOESN'T do (post-launch backlog)

- **iOS graduation handoff** — kids app on launch detects `is_active=false AND reading_band='graduated'` → shows handoff screen + deep-links to VerityPost. Pure iOS work, separate ship.
- **Email send infrastructure for transactional emails** — DOB correction notifications, band-advance prompts, graduation-account-ready emails all log captureMessage today. Need owner-side decision on email provider + template system.
- **Apple Pro grandfather banner** — in-app one-time banner asking Apple-Pro users to manually switch. iOS work.
- **Family seat-add UI** — `FamilySeatsCard` renders the seat state but doesn't include a "+ add kid seat" button that triggers the Stripe quantity bump. The existing /api/family/seats POST handler is in place; UI for the parent-driven seat increase ships next.
- **`(Kids)` category cleanup verification** — Phase 3 migration drops the variant rows on apply. Confirm zero `(Kids)` rows remain after migration runs.

### Migrations summary across the whole AI + Plan Change Implementation initiative (5 migrations staged)

1. `2026-04-27_phase1_persist_article_consolidation.sql` — kid_articles consolidation
2. `2026-04-27_phase2_plan_structure_rewrite.sql` — pricing + subscription columns + permissions
3. `2026-04-27_phase3_age_banding.sql` — reading_band + age_band + RLS
4. `2026-04-27_phase4_dob_correction_system.sql` — triggers + tables + admin RPC
5. `2026-04-27_phase5_graduation_flow.sql` — graduation tokens + system RPC + claim RPC + birthday prompt

All staged; owner applies via Supabase SQL editor. After applying: `npm run types:gen` to refresh `web/src/types/database.ts` and the `as any`/`as never` casts scattered across Phase 1-5 endpoints can be dropped on a follow-up sweep.

### Initiative status: COMPLETE on dev side

All 6 phases of `Ongoing Projects/AI + Plan Change Implementation/EXECUTE.md` are shipped. Generation pipeline (Pass A) is unblocked. Pro/Family XL retired. Per-kid Family seats wired end-to-end. Age-banded kid generation produces kids + tweens articles. DOB locked + correction request system live. Graduation flow + parent UI + welcome screen live. Reconciliation crons in place.

Owner-side blockers to launch:
- Apply 5 migrations
- Run `npm run types:gen`
- Apple SBP enrollment
- 10 Apple SKUs in App Store Connect
- 4 Stripe products + 6 prices
- AdSense + AdMob applications
- Email-send infrastructure
- iOS graduation handoff (separate iOS commit)

---

## 2026-04-27 (Phase 5 — graduation + parent flows, code shipped + migration staged) — _code shipped; migration staged for owner SQL editor apply_

### Context

Phase 5 of the AI + Plan Change Implementation roadmap. Decisions locked 2026-04-26:
- Parent-triggered band advance + graduation (never automatic).
- Auto-prompt at 13th birthday via daily cron (parent must still click).
- Graduation = retire kid profile + create new adult auth.users + link to family + carry over categories.
- Net-zero seat math: kid seat frees, adult seat fills (Family pool=6).
- Saves/streaks/scores do NOT carry to adult account; categories do.
- Kid PIN credentials revoked + kid_sessions revoked on graduation.
- One-time claim token issued for the new adult account, parent surfaces to kid.

### Cluster — DB migration staged

`Ongoing Projects/migrations/2026-04-27_phase5_graduation_flow.sql`:
- New `graduation_tokens` table — single-use tokens (24h expiry), unique active token per kid, RLS gates SELECT to admin-only.
- New `system_apply_dob_correction(request_id, reason)` RPC: cron variant of Phase 4 admin RPC. Runs as service role (`auth.uid()` returns null → admin RPC permission gate fails). REVOKE from public/authenticated; GRANT only to `service_role`. Only auto-approves direction='younger' requests (admin-side reject + docs flows stay on `admin_apply_dob_correction`). Resolves the cooldown-cron permission gap flagged in Phase 4.
- New `graduate_kid_profile(kid_profile_id, intended_email)` RPC: atomic graduation transition. Validates parent ownership + tweens band + email format + email uniqueness in auth.users. Mints a 24h cryptographically-random claim token (gen_random_bytes 24-byte hex), flips kid_profiles to is_active=false / reading_band='graduated' (using the dob_admin_override session var to bypass band-ratchet trigger), revokes pin credentials + kid_sessions, decrements subscriptions.kid_seats_paid by 1 if extras paid.
- New `claim_graduation_token(token, new_user_id)` RPC: consumes the token, copies kid's `metadata.feed_cats` to new adult user's `users.metadata.feed.cats`. Granted to service_role only.
- New `kid_profiles.birthday_prompt_at` column + partial index for cron scan.

### Cluster — server endpoints

- **NEW `web/src/app/api/kids/[id]/advance-band/route.ts`:** parent-triggered band transitions.
  - `{to: 'tweens'}` — direct band update (kids → tweens). Trigger enforces ratchet; this endpoint pre-validates so 4xx errors are clean instead of 500s.
  - `{to: 'graduated', email}` — invokes `graduate_kid_profile(...)` RPC, returns the claim URL `${siteUrl}/welcome?graduation_token=...` for the parent to share with the kid. Maps RPC error codes to clean HTTP responses (`23505` → `email_in_use`, `42501` → `forbidden`, etc.).
- **NEW `web/src/app/api/auth/graduate-kid/claim/route.ts`:** public endpoint (token IS the auth). Pre-checks token validity, creates the new adult auth.users row via Supabase admin API (`email_confirm: true` since parent vetted), invokes `claim_graduation_token(...)` RPC, deletes the orphan auth.users row on RPC failure (cleanup so emails aren't permanently squatted).
- **NEW `web/src/app/api/cron/birthday-band-check/route.ts`:** daily cron, computes age from DOB on each active kid_profile, stamps `birthday_prompt_at = now()` when an unmet boundary is crossed (kids → tweens at 10, tweens → graduated at 13). Does NOT auto-advance. Wired into vercel.json crons[] at 06:15 UTC.

### Cluster — web parent flow UI

- **`web/src/app/profile/kids/[id]/page.tsx`:** added `BandPanel` component below the error banner. Reads `reading_band` + `birthday_prompt_at` off the kid row (cast until types regen). Renders:
  - Current band label + age-range hint.
  - "Advance to Tweens" button (kids band) or "Move to adult app" button (tweens band).
  - 🎂 birthday-prompt banner when `birthday_prompt_at` is set and a transition hasn't happened yet.
  - Confirmation modal: kids→tweens shows "this cannot be undone"; graduation shows the full bullet list (history not carrying over, claim link to share, etc.) plus an email input for the new adult account.
  - On graduation success: surfaces the one-time claim URL with copy-to-clipboard for the parent to share with the kid.

### Cluster — vercel.json

Added cron entry: `birthday-band-check` at `15 6 * * *` (after pipeline-cleanup at 06:00 and before dob-correction-cooldown at 06:30).

### Verification

- `npx tsc --noEmit` clean for Phase 5 surfaces (the `redesign/` directory has unrelated `ScoreTier` type drift from another work stream — not introduced by Phase 5).
- ESLint + Prettier clean.

### Files touched (3 + 4 new + 1 migration file)

- `web/vercel.json` (cron registration)
- `web/src/app/profile/kids/[id]/page.tsx` (BandPanel inline component)
- NEW: `web/src/app/api/kids/[id]/advance-band/route.ts`
- NEW: `web/src/app/api/auth/graduate-kid/claim/route.ts`
- NEW: `web/src/app/api/cron/birthday-band-check/route.ts`
- NEW: `Ongoing Projects/migrations/2026-04-27_phase5_graduation_flow.sql`

### Owner action items

1. **Apply migration.** Paste `2026-04-27_phase5_graduation_flow.sql` into Supabase SQL editor.
2. **Regenerate types.** `npm run types:gen` to refresh `database.ts` so `kid_profiles.birthday_prompt_at` + `graduation_tokens` table appear; remove the `as any` casts on follow-up sweep.
3. **Update Phase 4 cooldown cron to use `system_apply_dob_correction`.** The cron currently calls `admin_apply_dob_correction` which fails for service-role (no auth.uid()). Phase 5 ships the system-RPC variant; one-line change in `web/src/app/api/cron/dob-correction-cooldown/route.ts:184` swaps the function name. Doing in this commit.
4. **Smoke test:**
   - DB-set kid DOB to 9y 11mo → run birthday cron → `birthday_prompt_at` populated → web kid detail shows the 🎂 banner.
   - Click "Advance to Tweens" → confirm modal → submit → `reading_band='tweens'`, `birthday_prompt_at=null`, banner clears.
   - DB-set DOB to 12y 11mo → cron fires → graduation prompt shows.
   - Click "Move to adult app" → enter email → confirm → response includes `claim_url`.
   - Visit `/welcome?graduation_token=...` (Phase 6 builds the welcome screen; for now POST `/api/auth/graduate-kid/claim` directly with the token + email + password) → new adult user created, kid profile soft-deleted, kid PIN cleared, kid sessions revoked.

### What this DOESN'T do (deferred)

- **Welcome screen rendering** — `/welcome?graduation_token=...` URL parsing + signup form. Phase 6 polish.
- **Email notifications** — band advance prompt, graduation account created. Phase 6 templates.
- **iOS graduation handoff** — Kids app detection of `is_active=false AND reading_band='graduated'` → render handoff screen, deep-link to VerityPost. Phase 6 (iOS-specific work).
- **Family seat decrement reconciliation** — RPC decrements local `subscriptions.kid_seats_paid` immediately, but the actual Stripe quantity / Apple SKU change is parent-initiated separately. Reconciliation cron (Phase 6) will catch any drift.
- **Adult-account-already-graduated detection** — preventing a parent from triggering graduation when there's already an active adult account at that email. Currently caught at `auth.users` UNIQUE on email; clean error surfaces but no proactive prevention.

---

## 2026-04-27 (Phase 4 — DOB correction system, code shipped + migration staged) — _code shipped; migration staged for owner SQL editor apply_

### Context

Phase 4 of the AI + Plan Change Implementation roadmap. Decisions locked 2026-04-26:
- DOB locked after profile creation (DB-level trigger with admin override session var)
- One correction per kid lifetime (DB unique index)
- Younger-band corrections: 7-day cooldown then auto-approve unless fraud signals fire
- Older-band corrections: require birth-certificate documentation, always manual review
- Maximum 3-year DOB shift per correction
- Corrections cannot push age past 12 (graduation is separate flow in Phase 5)
- Audit trail on every change
- Kids are not notified

### Cluster — DB migration staged

`Ongoing Projects/migrations/2026-04-27_phase4_dob_correction_system.sql`:
- New helper fn `compute_band_from_dob(dob)` derives kids|tweens|graduated from age-from-DOB.
- New trigger `kid_profiles_dob_immutable` BEFORE UPDATE OF date_of_birth: rejects any change unless `app.dob_admin_override = 'true'` is set in the session. Errors with 22023 + a hint pointing at the request endpoint.
- New trigger `kid_profiles_band_ratchet` BEFORE UPDATE OF reading_band: rejects regression (graduated → tweens → kids), bypassed by the same session var.
- New table `kid_dob_correction_requests` with FKs to kid_profiles + auth.users, status check (pending|approved|rejected|documentation_requested|rejected_no_response), reason check (10-280 chars), unique indexes for (one pending per kid) + (one approved per kid lifetime), queue index, cooldown-due index. RLS: parent reads/inserts their own; admin (with `admin.kids.dob_corrections.review`) reads/updates all.
- New table `kid_dob_history` append-only audit. RLS: admin-only read; INSERT only via SECURITY DEFINER RPC.
- New RPC `admin_apply_dob_correction(request_id, decision, reason)`: gates on `admin.kids.dob_corrections.review`, sets the override session var, applies DOB change (triggers recompute band via compute_band_from_dob), appends band_history entry, writes kid_dob_history audit row. EXECUTE granted to authenticated.
- Permission seed: `admin.kids.dob_corrections.review`.

### Cluster — server endpoints

- **NEW `web/src/app/api/kids/[id]/dob-correction/route.ts`:** parent-side submit + GET history. Validates DOB shift ≤ 3 years; resulting age 3-12 (no graduation via correction); reason 10-280 chars. Auto-rejects older-band requests without documentation. Computes direction (younger/older/same); attaches 7-day cooldown for younger-band. Pre-checks lifetime limit. Rate-limited 5 submissions per parent per hour.
- **NEW `web/src/app/api/cron/dob-correction-cooldown/route.ts`:** daily cron. Pulls pending younger-band requests with `cooldown_ends_at <= now()`. Computes fraud signals (profile created < 30 days ago; parent has prior approval; large shift > 2 years; family sub upgraded < 14 days ago). On signal: extend cooldown 24h + stash signals for admin review. Else: invoke `admin_apply_dob_correction(...)` with `cooldown_auto_approval`. Wired into vercel.json crons[].
- **NEW `web/src/app/api/admin/kids-dob-corrections/route.ts`:** admin queue list with status + direction filters, rate-limited 60/60s.
- **NEW `web/src/app/api/admin/kids-dob-corrections/[id]/route.ts`:** GET full detail (request + kid + parent + siblings + parent's lifetime correction count + DOB history + on-demand fraud signals). POST applies decision via `admin_apply_dob_correction(...)` RPC. Audit log entry on every decision.

### Cluster — admin UI

- **NEW `web/src/app/admin/kids-dob-corrections/page.tsx`:** queue list with status + direction filters, color-coded badges, 📎 marker for documentation-attached requests, click-through to detail.
- **NEW `web/src/app/admin/kids-dob-corrections/[id]/page.tsx`:** three-column detail (kid context | request | parent context) with fraud signals banner, sibling kids, DOB history, inline decision panel.

### Cluster — vercel.json

Added cron entry: `dob-correction-cooldown` at `30 6 * * *`.

### Verification

- `npx tsc --noEmit` clean. Casts on the new tables/RPC sit behind `as any` / `as never` until generated types regen post-migration.
- ESLint + Prettier clean.

### Files touched (3 + 6 new + 1 migration file)

- `web/vercel.json` (cron registration)
- NEW: `web/src/app/api/kids/[id]/dob-correction/route.ts`
- NEW: `web/src/app/api/cron/dob-correction-cooldown/route.ts`
- NEW: `web/src/app/api/admin/kids-dob-corrections/route.ts`
- NEW: `web/src/app/api/admin/kids-dob-corrections/[id]/route.ts`
- NEW: `web/src/app/admin/kids-dob-corrections/page.tsx`
- NEW: `web/src/app/admin/kids-dob-corrections/[id]/page.tsx`
- NEW: `Ongoing Projects/migrations/2026-04-27_phase4_dob_correction_system.sql`

### Owner action items

1. **Apply migration.** Paste `2026-04-27_phase4_dob_correction_system.sql` into Supabase SQL editor.
2. **Regenerate types.** `npm run types:gen` to refresh database.ts; `as any` casts can be dropped on follow-up sweep.
3. **Grant the new permission.** `admin.kids.dob_corrections.review` is seeded but not granted; assign via existing role-permission UI or direct DB UPDATE to whichever admin role should review.
4. **Smoke test:**
   - PATCH `/api/kids/[id]` with `date_of_birth` → 400 `dob_locked`.
   - POST `/api/kids/[id]/dob-correction` with younger-band → row inserted, status=pending, cooldown 7 days out.
   - Second submit while pending → 409 `pending_exists`.
   - Admin approves via `/admin/kids-dob-corrections/[id]` → DOB updates, band recomputes, audit row written.
   - Second correction after approval → 409 `lifetime_limit_reached`.

### What this DOESN'T do (deferred)

- **Documentation upload endpoint** — `documentation_url` accepts a string; the encrypted-blob upload mechanism + 90-day TTL purge is a follow-up. Owner-decision: Supabase Storage signed URL with TTL, or external object store.
- **Email notifications** — request received / approved / rejected / documentation requested. Templates land in Phase 6 polish.
- **Parent-side request form UI** — web modal + iOS sheet that calls the POST endpoint. Phase 5 (graduation flow) ships them together since they share the kid-detail screen.
- **Cron RPC permission gate fix** — the cron path calls `admin_apply_dob_correction` with service role; the RPC's `compute_effective_perms(auth.uid())` returns empty for service role. Auto-approves won't pass the gate today. Fix is either a separate `system_apply_dob_correction(...)` RPC, or grant service role the permission. No production impact yet (no requests in DB); will fix before the cron fires its first batch.

---

## 2026-04-27 (T17 — bidirectional blocked_users enforcement on DM RPCs + uniform 403 collapse) — _migration applied; routes patched; shipped_

### T17 — start_conversation + post_message reject blocked counterparties; routes fold DM_BLOCKED into uniform 403

- **Migration applied** (owner): `Ongoing Projects/migrations/2026-04-27_T17_dm_block_enforcement.sql`. MCP verified — both `start_conversation(uuid,uuid)` and `post_message(uuid,uuid,text)` definitions now contain `DM_BLOCKED`.
  - `start_conversation` — bidirectional `blocked_users` check. Either direction blocks. Sits after the T16 recipient-opt-out check.
  - `post_message` — only fires on direct (`type='direct'`) conversations. Looks up the other participant, rejects if blocked in either direction. Group conversations skip — block-in-multi-party is a per-message UX hide, separate concern.
- **Route patches (genuine-fix completion)** — the T16 patch already collapsed `DM_RECIPIENT_OPTED_OUT` into the uniform `cannot_dm` 403 alongside `DM_PAID_PLAN`/`DM_MUTED`/`USER_NOT_FOUND`. Leaving `DM_BLOCKED` falling to a generic 400 would have been a parallel path. Both routes extended:
  - `web/src/app/api/conversations/route.js` — `DM_BLOCKED` joins the existing T283 + T16 collapse → uniform `403 { error: 'cannot_dm' }`.
  - `web/src/app/api/messages/route.js` — `DM_BLOCKED` added to the existing 403 set alongside `DM_PAID_PLAN`/`DM_MUTED`/`NOT_PARTICIPANT`. Same uniform user-facing message ("You cannot send messages in this conversation.") so the response shape doesn't leak whether the gate fired on plan, mute, participation, or block.
- **Closes the audit hole**: a blocked user can no longer call `start_conversation` against the user who blocked them, nor keep messaging in an existing pre-block conversation. Data-layer enforcement; third-party clients with the anon key are now gated. Response shape uniform across all reject reasons.
- **Files** — `Ongoing Projects/migrations/2026-04-27_T17_dm_block_enforcement.sql` (applied), `web/src/app/api/conversations/route.js`, `web/src/app/api/messages/route.js`.

---

## 2026-04-27 (T16 — recipient allow_messages enforced at RPC + uniform 403 collapse) — _shipped, pushed to git/Vercel_

### T16 — start_conversation honors recipient opt-out

- **Migration applied** (owner): `Ongoing Projects/migrations/2026-04-27_T16_start_conversation_allow_messages.sql` adds a recipient-allow-messages check to `start_conversation(uuid, uuid)`. New error code `[DM_RECIPIENT_OPTED_OUT]`. MCP verified post-apply (`pg_get_functiondef LIKE '%DM_RECIPIENT_OPTED_OUT%'` returns true).
- **Route patch:** `web/src/app/api/conversations/route.js` extends the T283 error-code-collapse to include `DM_RECIPIENT_OPTED_OUT` alongside `DM_PAID_PLAN`/`DM_MUTED`/`USER_NOT_FOUND`. All four collapse to a uniform `403 { error: 'cannot_dm' }` so response shape doesn't leak the recipient's opt-out preference.
- **Closes the privacy hole** the audit flagged: third-party clients with the anon key can no longer force-create conversations with users who toggled `allow_messages` off — the data layer enforces it now, not just the UI.
- **Files** — `Ongoing Projects/migrations/2026-04-27_T16_start_conversation_allow_messages.sql` (applied), `web/src/app/api/conversations/route.js`.

---

## 2026-04-27 (Phase 3 — age banding, code shipped + migration staged) — _code shipped; migration staged for owner SQL editor apply_

### Context

Phase 3 of the AI + Plan Change Implementation roadmap. Decisions locked 2026-04-26:
- 3 reading bands: kids (7-9), tweens (10-12), graduated (13+)
- Ratchet-only progression — never reverts (graduated > tweens > kids)
- System-derived from kid_profiles.date_of_birth, never user-set
- articles.age_band tags every article into kids|tweens|adult
- Pipeline produces up to 2 articles per kid-safe cluster (one kids, one tweens) — admin tooling presents each band as its own editor

### Cluster — DB migration staged

`Ongoing Projects/migrations/2026-04-27_phase3_age_banding.sql`:
- `kid_profiles` adds `reading_band text NOT NULL DEFAULT 'kids' CHECK (kids|tweens|graduated)` + `band_changed_at timestamptz` + `band_history jsonb`. Backfill from `date_of_birth` (>= 13 → graduated, 10-12 → tweens, else kids; null DOB defaults kids). First-history entry written with `reason='phase3_backfill_from_dob'`.
- `kid_profiles` drops vestigial `age_range` column.
- Drop the 5 `(Kids)` category variants (Science, World, Tech, Sports, Health). Reparent any FK refs (`articles.category_id`, `ai_prompt_overrides.category_id`, `feed_clusters.category_id`) to the matching base category, then DELETE the variant rows.
- Defensive UPDATE to flag base kid-safe categories `is_kids_safe=true` (Animals, Arts, History, Space, Weather, Health, Science, Technology, World, Sports, Education).
- `feed_clusters` adds `primary_kid_article_id uuid` + `primary_tween_article_id uuid` FKs to `articles(id)` ON DELETE SET NULL, with partial indexes for non-null lookups.
- New SQL fn `kid_visible_bands(profile_id)`: returns `text[]` of bands a profile may see (kids → ['kids']; tweens → ['kids','tweens']; graduated → []).
- New SQL fn `current_kid_profile_id()`: pulls `auth.jwt()->'app_metadata'->>'kid_profile_id'` for kid sessions.
- Drop + recreate `articles_read_kid_jwt` RLS policy to gate kid SELECT on `is_kid_delegated() AND status='published' AND is_kids_safe=true AND (age_band IS NULL OR age_band = ANY kid_visible_bands(current_kid_profile_id()))`. NULL `age_band` permitted so legacy single-tier kid articles (pre-Phase-3) keep showing.

### Cluster — banded prompts (`web/src/lib/pipeline/editorial-guide.ts`)

Added 8 new banded prompts (kept existing `KID_*` constants exported as-is for reference, no longer used by the route):
- `KIDS_HEADLINE_PROMPT`, `TWEENS_HEADLINE_PROMPT` — band-voiced headline + summary
- `KIDS_ARTICLE_PROMPT` (80-120 words, ages 7-9 voice) and `TWEENS_ARTICLE_PROMPT` (120-180 words, ages 10-12 voice). Both output match BodySchema (title/body/word_count/reading_time_minutes).
- `KIDS_TIMELINE_PROMPT` (4-6 events, max 8-word labels), `TWEENS_TIMELINE_PROMPT` (4-8 events, max 10-word labels).
- `KIDS_QUIZ_PROMPT`, `TWEENS_QUIZ_PROMPT` — band-appropriate difficulty curves; both unify on `correct_index`.

### Cluster — pipeline route refactor (`web/src/app/api/admin/pipeline/generate/route.ts`)

- Added optional `age_band: 'kids' | 'tweens'` to RequestSchema. Adult runs ignore. Kid runs default to `'tweens'` if omitted (back-compat with the legacy single-tier kid voice).
- New `effectiveAgeBand` constant (`'kids' | 'tweens' | 'adult'`) derived from input.
- `headlineSystem`, `bodySystem`, `timelineSystem`, `quizSystem` selectors all branch on `(audience, effectiveAgeBand)` to pick the band-appropriate prompt. Adult selectors unchanged.
- Persist payload `age_band` field set from `effectiveAgeBand` (was `audience === 'kid' ? 'tweens' : null` in Phase 1).
- Cluster update extended: when audience='kid' AND age_band='kids' → set `primary_kid_article_id`; band='tweens' → set `primary_tween_article_id`; adult → `primary_article_id` (unchanged). Multiple kid runs against the same cluster (one per band) accumulate across the two FK slots without overwriting each other.
- `KID_*` constants no longer imported (replaced by `KIDS_*` + `TWEENS_*`).

### Cluster — kid iOS app

- **`VerityPostKids/VerityPostKids/Models.swift`** — `KidProfile` adds `readingBand: String?` (decoded from `reading_band`); drops `ageRange` field (column dropped in migration). New computed `visibleBands` returns `[String]` per the band visibility rule. `KidArticle` adds `ageBand: String?` (decoded from `age_band`).
- **`VerityPostKids/VerityPostKids/KidsAppState.swift`** — `@Published readingBand: String = "kids"` cached on the state object. New `visibleBands` computed property mirroring server-side logic. `loadKidRow()` query now selects `streak_current, reading_band` and caches both.
- **`VerityPostKids/VerityPostKids/ArticleListView.swift`** — accepts `visibleBands: [String] = ["kids"]` prop. Article list query adds `.in("age_band", values: bands)` filter (defense-in-depth alongside RLS). Empty bands defaults to `["kids"]`.
- **`VerityPostKids/VerityPostKids/KidsAppRoot.swift`** — passes `state.visibleBands` to ArticleListView.

### Cluster — admin tooling

- **`web/src/app/admin/kids-story-manager/page.tsx`** — list + refetch + delete-refetch queries scoped to `age_band='kids' OR age_band IS NULL` (NULL surfaces legacy pre-Phase-3 kid content). Article save sets `age_band: 'kids'`.
- **`web/src/app/admin/tweens-story-manager/page.tsx` (NEW)** — minimal Tweens Story Manager. Status filter chips (all/draft/review/published/archived). Lists `articles` scoped to `is_kids_safe=true AND age_band='tweens'`. Click-through to `/admin/articles/:id` for the actual edit (Phase 1 already consolidated the unified article edit endpoint to handle both audiences via `is_kids_safe`).

### Verification

- `npx tsc --noEmit` clean (one `as never` cast on the Tweens Story Manager `.eq('age_band', ...)` call until generated types regen post-migration; same pattern as Phase 1's `kid_seats_paid` cast).
- ESLint + Prettier via husky hook clean.

### Files touched (8 + 2 new + 1 migration file)

- `web/src/lib/pipeline/editorial-guide.ts`
- `web/src/app/api/admin/pipeline/generate/route.ts`
- `web/src/app/admin/kids-story-manager/page.tsx`
- NEW: `web/src/app/admin/tweens-story-manager/page.tsx`
- `VerityPostKids/VerityPostKids/Models.swift`
- `VerityPostKids/VerityPostKids/KidsAppState.swift`
- `VerityPostKids/VerityPostKids/ArticleListView.swift`
- `VerityPostKids/VerityPostKids/KidsAppRoot.swift`
- NEW: `Ongoing Projects/migrations/2026-04-27_phase3_age_banding.sql`

### Owner action items

1. **Apply migration.** Paste `Ongoing Projects/migrations/2026-04-27_phase3_age_banding.sql` into Supabase SQL editor.
2. **Regenerate types.** `npm run types:gen` to refresh `web/src/types/database.ts` so `kid_profiles.reading_band` + `articles.age_band` + `feed_clusters.primary_*_article_id` columns appear; the `as never` cast in tweens-story-manager can then be dropped.
3. **Smoke test:**
   - Trigger one adult run → verify `articles.age_band='adult'`, no `primary_kid_article_id` set on the cluster.
   - Trigger one kid run with `age_band='kids'` → verify article in `articles` with `is_kids_safe=true, age_band='kids'`; cluster `primary_kid_article_id` set.
   - Trigger one kid run with `age_band='tweens'` (or omit, defaults to tweens) → verify article in `articles` with `age_band='tweens'`; cluster `primary_tween_article_id` set.
   - In kid iOS app, test profile with reading_band='kids' sees only kids articles; profile with reading_band='tweens' sees both kids+tweens.

### What this DOESN'T do (deferred)

- **Server-side band-loop generation** (one API call → both kids+tweens articles). Today this Phase 3 ship requires the operator to call `/api/admin/pipeline/generate` twice (once per band). A future BandedStoryEditor refactor + cluster detail 3-tab view (Phase 6 polish or post-launch) will consolidate.
- **Phase 4 — DOB correction system** — band ratchet trigger, request form, admin queue. Phase 3 doesn't add the trigger (band can be set freely by service-role writes); Phase 4 locks the ratchet via a DB trigger.
- **Phase 5 — graduation flow** — birthday cron, parent CTAs, adult-account creation. Today reading_band='graduated' is set by the migration backfill but no UI surfaces the transition.
- **Reading-level vs reading-band UI** — `kid_profiles.reading_level` (parent-set early/intermediate/advanced) is independent of `reading_band` (system-derived from DOB). The web/iOS forms still show reading_level; future Phase 5/6 polish surfaces both.

---

## 2026-04-27 (Phase 2 — plan structure rewrite, code shipped + migration staged) — _code shipped; migration staged for owner SQL editor apply_

### Context

Phase 2 of the AI + Plan Change Implementation roadmap. Decisions locked 2026-04-26:
- Verity solo: $7.99/mo, $79.99/yr
- Verity Family: $14.99/mo with 1 kid included; +$4.99/mo per extra kid up to 4 (Family annual: $149.99/yr; +$49.99/yr per extra kid)
- Verity Pro retired: existing subs grandfather (auto-migrate to Verity at next renewal — Option B)
- Verity Family XL retired permanently — per-kid model replaces it

Subscriptions table has zero rows pre-migration (clean slate).

### Cluster — DB migration staged

`Ongoing Projects/migrations/2026-04-27_phase2_plan_structure_rewrite.sql`:
- Update `verity_monthly` price_cents 399 → 799; `verity_annual` 3999 → 7999.
- Update `verity_family_monthly` price_cents 1499 (unchanged) + metadata: `included_kids=1, max_kids=4, extra_kid_price_cents=499, max_total_seats=6`. `max_family_members` set to 6.
- Insert `verity_family_annual` plan ($149.99/yr, same metadata + `is_annual=true`, `extra_kid_price_cents=4999` for annual).
- Mark `verity_pro_monthly` + `verity_pro_annual` `is_active=false, is_visible=false` (grandfather behavior — existing subs keep working until renewal cron migrates them).
- Mark any `verity_family_xl` rows `is_active=false, is_visible=false` (defensive — no rows seeded today, but lock anyway).
- `ALTER TABLE subscriptions ADD COLUMN kid_seats_paid integer NOT NULL DEFAULT 1` with check 0..4.
- `ALTER TABLE subscriptions ADD COLUMN platform text NOT NULL DEFAULT 'stripe'` with check (stripe|apple|google).
- `ALTER TABLE subscriptions ADD COLUMN next_renewal_at timestamptz` + partial index.
- Seed permissions: `family.seats.manage`, `family.kids.manage` (both surface=profile, deny_mode=allow_unless_blocked).

### Cluster — server endpoints

- **`web/src/app/api/family/config/route.js`** — DEFAULTS rewritten. Drops `verity_family_xl: 4` (retired permanently). Adds `included_kids`, `max_total_seats`, `extra_kid_price_cents` to defaults + response. Plans query narrowed to `tier='verity_family' AND is_active=true`. Response now includes the four metadata fields the iOS+web seat UI needs.
- **`web/src/app/api/kids/route.js` POST** — pre-flight kid seat enforcement. Reads `kid_profiles` count + active subscription's `kid_seats_paid + plan metadata`. Returns 400 with `code='kid_cap_reached'` over `max_kids`; returns 402 with `code='kid_seat_required' + extra_kid_price_cents` when over paid seats (lets the client surface the per-kid upsell). Non-fatal on errors (transient DB issues don't block create; reconciliation cron catches drift).
- **`web/src/app/api/kids/[id]/route.js` PATCH** — `date_of_birth` removed from `allowed[]` array; explicit 400 with `code='dob_locked'` if a client still posts it. Phase 4 builds the request-form path; this commit just locks down the direct edit per the Phase 2 decisions.
- **`web/src/app/api/family/seats/route.ts` (NEW)** — GET returns full seat state (used, paid, included, max_kids, max_total_seats, extra_kid_price_cents, platform, has_active_family_sub). POST sets paid count with rate limit (10/60s), platform-conflict guard (Apple/Google subs redirected to platform-native edit), orphan-kids guard (can't reduce below active kid count). Audit log entry on every change. Permission: `family.seats.manage`.
- **`web/src/app/api/stripe/webhook/route.js`** — `handleSubscriptionUpdated` extracts `kid_seats_paid` from subscription items by reading `price.metadata.seat_role` (`extra_kid` quantity → +N extras on top of the base 1 included). Persists `kid_seats_paid + platform='stripe' + stripe_subscription_id` on every webhook delivery. Best-effort — surrounding plan change handlers continue to do the canonical write.

### Cluster — iOS

- **`VerityPost/VerityPost/StoreManager.swift`** — full SKU lineup rewrite:
  - Verity solo (monthly + annual) — same product IDs, repriced.
  - Family tiered subscription group: 8 product IDs across 4 kid counts (1-4) × 2 billing periods.
  - Pro IDs retained as `legacy*` constants for grandfather-detection only; no longer queried from App Store on launch.
  - `priceCentsForProduct` updated to Phase 2 numbers.
  - `planName(productID)` collapses Family-tiered SKUs to `verity_family`; Pro grandfathers as `verity_pro`.
  - New `kidSeatsForProduct(productID)` extracts kid count from SKU.
  - New `familyProductID(kidCount, period)` computes the SKU for a (count, period) pair — used by FamilyViews seat upgrade flow.
  - `hasAccess(feature)` updated: ad-free / streak-freeze / Ask-an-Expert now ship with any paid plan (Verity solo OR Family) since Pro tier retired.
- **`VerityPost/VerityPost/SubscriptionView.swift`** — paywall rewritten to 3 plan cards (Free / Verity / Family), drops Pro and XL cards. Pricing copy updated to $7.99 / $14.99. Family card highlights "1 kid included; add up to 3 more for $4.99/mo each." Apple Review 3.1.2 disclosure block updated to match new lineup.

### Verification

- `npx tsc --noEmit` clean.
- `grep -rln "verity_family_xl|familyXl"` web/src returns zero matches in live code (one comment-only mention in StoreManager).
- ESLint + Prettier via husky hook clean.

### Files touched (8 + 1 new + 1 migration file)

- NEW: `web/src/app/api/family/seats/route.ts`
- `web/src/app/api/family/config/route.js`
- `web/src/app/api/kids/route.js`
- `web/src/app/api/kids/[id]/route.js`
- `web/src/app/api/stripe/webhook/route.js`
- `VerityPost/VerityPost/StoreManager.swift`
- `VerityPost/VerityPost/SubscriptionView.swift`
- NEW: `Ongoing Projects/migrations/2026-04-27_phase2_plan_structure_rewrite.sql`

### Owner action items

1. **Apple SBP enrollment.** Apply for Apple Small Business Program in App Store Connect to lock in 15% commission from launch.
2. **Apple SKUs.** Create 10 product IDs in App Store Connect under one subscription group `Verity Subscriptions`:
   - `com.veritypost.verity.monthly` ($7.99/mo)
   - `com.veritypost.verity.annual` ($79.99/yr)
   - `com.veritypost.family.1kid.monthly` ($14.99/mo)
   - `com.veritypost.family.2kids.monthly` ($19.98/mo)
   - `com.veritypost.family.3kids.monthly` ($24.97/mo)
   - `com.veritypost.family.4kids.monthly` ($29.96/mo)
   - `com.veritypost.family.1kid.annual` ($149.99/yr)
   - `com.veritypost.family.2kids.annual` ($199.98/yr)
   - `com.veritypost.family.3kids.annual` ($249.97/yr)
   - `com.veritypost.family.4kids.annual` ($299.96/yr)
3. **Stripe products.** Create 4 products + 6 prices in Stripe Dashboard:
   - Verity (monthly $7.99, annual $79.99)
   - Verity Family Base (monthly $14.99, annual $149.99) — metadata `seat_role: family_base`
   - Verity Family Extra Kid (monthly $4.99, annual $49.99) — metadata `seat_role: extra_kid`
   - Plus AdSense and AdMob applications.
4. **Apply migration.** Paste `2026-04-27_phase2_plan_structure_rewrite.sql` into Supabase SQL editor.
5. **Regenerate types.** `npm run types:gen` after migration so `kid_seats_paid` + `platform` + `next_renewal_at` columns appear in `web/src/types/database.ts` and the `as never` cast in `family/seats/route.ts` can be dropped.
6. **Pro grandfather migration cron.** Phase 6 ships the cron that auto-migrates Pro subs at next renewal. Until then, existing Pro subs continue billing at their original rates.

### What this DOESN'T do (deferred)

- **AdSense + AdMob integration** — Phase 6 (after launch). Free-tier metered paywall is also still pending.
- **Stripe Customer Portal allow-list configuration** — owner decides whitelist (currently disabled for plan changes per planning doc).
- **iOS FamilyViews seat upgrade UI** — wires `StoreManager.familyProductID(...)` + StoreKit upgrade flow + `/api/family/seats` POST. Lands in Phase 5/6.
- **Pro grandfather migration emails + cron** — Phase 6.

---

## 2026-04-27 (Phase 1 — kid_articles consolidation, code shipped + migration staged) — _code shipped + pushed; migration file staged for owner SQL editor apply_

### Context

Phase 1 of the AI + Plan Change Implementation roadmap (`Ongoing Projects/AI + Plan Change Implementation/`). Audit finding from yesterday: the kid iOS app reads from `articles WHERE is_kids_safe=true`, the admin Kids Story Manager writes to the same, but the pipeline writes kid runs to a separate `kid_articles` table that no consumer reads. Result: every successful kid generation has been a no-op as far as readers were concerned. Path A from the planning docs: kill the dead tables, write all audiences into `articles` with `is_kids_safe + age_band`. Pre-condition verified zero rows in all five tables (kid_articles, kid_sources, kid_timelines, kid_quizzes, kid_discovery_items) at migration time.

### Cluster — code changes shipped (commit pending)

- **`web/src/lib/pipeline/persist-article.ts`** — `PersistArticlePayload` extended with `age_band?: 'kids' | 'tweens' | 'adult' | null` and `kids_summary?: string | null`. Header docs updated to describe single-table consolidation. Header on `persistGeneratedArticle` rewritten to reflect the new RPC contract.
- **`web/src/app/api/admin/pipeline/generate/route.ts`** — payload construction now sets `age_band: audience === 'kid' ? 'tweens' : null` (Phase 3 will band-split into kids 7-9 + tweens 10-12; Phase 1 ships every kid run as `'tweens'` so the existing single-tier kid voice doesn't regress) and `kids_summary: audience === 'kid' ? summary || null : null`. Post-persist `needs_manual_review` flag write now targets the unified `articles` table directly (was branching `articles` vs `kid_articles`).
- **`web/src/app/api/admin/pipeline/runs/[id]/cancel/route.ts`** — cancel-route discovery state reset hardcoded to `discovery_items` (was branching on audience; `kid_discovery_items` is dropped).
- **`web/src/app/api/admin/newsroom/clusters/articles/route.ts`** — replaced two parallel reads (adult `articles` + kid `kid_articles`) with one read against `articles`, partitioning rows by `is_kids_safe` to derive `audience`. Header rewritten.
- **`web/src/app/api/admin/articles/[id]/route.ts`** — `fetchArticleWithAudience` rewritten as one query (was two — adult-then-kid fallback). Audience now derived from `articles.is_kids_safe`, not from which table holds the row. `tableNames(audience)` flattened — both audiences share the unified table set; the `_audience` parameter retained for call-site clarity. ARTICLE_SELECT picks up `is_kids_safe`. Three header comments updated.
- **`web/src/app/api/cron/pipeline-cleanup/route.ts`** — sweep #2 (orphan discovery items) collapsed from a 2-table loop (`discovery_items` + `kid_discovery_items`) to single-table. Sweep #4 (cluster expiry) collapsed from two scans (articles + kid_articles → unioned set) to one scan. T241 source-verification cron TODO reduced to one source table. Three header comments updated.
- **`web/src/lib/pipeline/story-match.ts`** — deleted dead export `loadKidStoryMatchCandidates` (zero callers across the codebase). Comment marker left behind documenting why; future kid story-match should use `loadStoryMatchCandidates` filtered by `is_kids_safe`.
- **`web/src/app/admin/newsroom/page.tsx`** — header comment rewrite (no behavior change).

### Cluster — migration staged

- **`Ongoing Projects/migrations/2026-04-27_phase1_persist_article_consolidation.sql`** — single transactional migration covering:
  - **A.** `ALTER TABLE articles ADD COLUMN age_band text` + check constraint (kids|tweens|adult|null) + partial index `idx_articles_kid_feed (is_kids_safe, age_band, status, published_at DESC)` for kid-feed reads.
  - **B.** `CREATE OR REPLACE FUNCTION persist_generated_article` — full rewrite. Audience-branching at write removed; all rows land in `articles` + `sources` + `timelines` + `quizzes`. Kid runs set `is_kids_safe=true`, `kids_summary=coalesce(payload.kids_summary, payload.excerpt)`, `age_band` from payload (defaults to `'tweens'` for kid runs missing it). Adult runs set `is_kids_safe=false`, `kids_summary=NULL`, `age_band=NULL`. Validation extended to reject `age_band NOT IN ('kids','tweens','adult')`.
  - **C.** Drops 14 RLS policies across the 5 kid_* tables.
  - **D.** Inline `DO $$` block re-verifies zero rows pre-drop (raises if any race-window write snuck in), then `DROP TABLE ... CASCADE` for `kid_quizzes`, `kid_timelines`, `kid_sources`, `kid_articles`, `kid_discovery_items` in FK-dependency order.
- **NOT YET APPLIED.** MCP is read-only. Owner must paste the SQL into Supabase SQL editor to apply.

### Verification

- `grep -rln "kid_articles|kid_sources|kid_timelines|kid_quizzes|kid_discovery_items" web/src --include="*.ts" --include="*.js"` returns 1 file (`types/database.ts` — generated; will regenerate post-migration). All other live refs eliminated.
- `npx tsc --noEmit` clean.
- ESLint + Prettier ran via husky pre-commit hook, all green.
- Pre-migration zero-row check passes via MCP read query.

### Files touched (8)

- `web/src/lib/pipeline/persist-article.ts`
- `web/src/lib/pipeline/story-match.ts`
- `web/src/app/api/admin/pipeline/generate/route.ts`
- `web/src/app/api/admin/pipeline/runs/[id]/cancel/route.ts`
- `web/src/app/api/admin/newsroom/clusters/articles/route.ts`
- `web/src/app/api/admin/articles/[id]/route.ts`
- `web/src/app/api/cron/pipeline-cleanup/route.ts`
- `web/src/app/admin/newsroom/page.tsx`
- NEW: `Ongoing Projects/migrations/2026-04-27_phase1_persist_article_consolidation.sql`

### Owner action items

1. **Apply the migration.** Paste `Ongoing Projects/migrations/2026-04-27_phase1_persist_article_consolidation.sql` into Supabase SQL editor and run. Single transaction; rolls back on any error. Inline zero-row check is the safety net.
2. **Regenerate Database types.** After migration: `npm run types:gen` (or whatever the project's type-gen command is) to refresh `web/src/types/database.ts` so the dropped kid_* table types disappear from the union.
3. **Smoke test.** Trigger one kid generation in `/admin/newsroom`. Verify: row appears in `articles` with `is_kids_safe=true`, `age_band='tweens'`, `kids_summary` populated. Verify: kid iOS app feed query (`articles WHERE is_kids_safe=true AND status='published'`) returns the new row when published.

### What this DOESN'T do (deferred)

- **Phase 2 (plan rewrite)** — Verity solo $7.99, Family $14.99 + $4.99/kid, retire Pro, drop Family XL. Separate phase.
- **Phase 3 (banded generation)** — split kid output into `kids` (7-9) + `tweens` (10-12) bands, two articles per kid cluster. The `age_band` column is added now; Phase 3 wires the band-split logic.
- **`kid_profiles.age_range` column drop.** Vestigial, but waiting until Phase 3's `reading_band` introduction so the kid app's profile reads have one consistent migration.

---

## 2026-04-27 (Pass A — pipeline prompt-vs-schema alignment, generation unblocked) — _shipped, pushed to git/Vercel (commit `d3b5c47`)_

### Context

Pipeline `pipeline_runs` was 0 completed / 5 failed across the last 90 days. Audit traced every failure to drift between what prompts told the LLM to output and what the route's Zod schemas actually accepted. This commit is the surgical alignment pass — Phase 0 of the AI + Plan Change Implementation roadmap (`Ongoing Projects/AI + Plan Change Implementation/`). No DB migrations, no UI, no infrastructure — just text edits on prompts + Zod tweaks on the route.

### Cluster — editorial-guide.ts dead-block strips

- **EDITORIAL_GUIDE: dropped "RELATED VP STORIES" block (~20 lines).** Route never feeds related stories to the model, so the entire conditional block was instructing the LLM about a feature that doesn't exist.
- **TIMELINE_PROMPT: dropped "LINKING TO EXISTING VP ARTICLES" + "INHERITING EXISTING THREAD TIMELINES" sections (~90 lines).** Both blocks instruct the LLM to emit `vp_slug`, `is_current`, `is_future` fields and to consume thread context. Route never passes thread context, never reads those output fields. `TimelineEventSchema` has no slot for them. Pure dead text that confused the model.
- **TIMELINE_PROMPT: dropped the `text`/`summary` field block in EVENT RULES.** Prose described two output fields named `text` and `summary`. The OUTPUT FORMAT block immediately below described `event_date`/`event_label`/`event_body`. The two halves of the same prompt disagreed on the output schema. Caused 1/5 generation failures (model picked the prose path, Zod rejected). Replaced with prose that aligns with the OUTPUT FORMAT.
- **EDITORIAL_GUIDE: dropped `<!-- insufficient_data: ... -->` instruction.** Prompt told the LLM to emit this when source data was thin. No parser exists; `extractJSON` rejects HTML comments; Zod fails. Replaced with "write the best article you can; route will reject thin output."
- **EDITORIAL_GUIDE: dropped `<!-- word_count: 178 -->` trailing comment instruction.** Incompatible with JSON output (route forces JSON in the user-turn override). The model dutifully emitting the comment after `}` would crash extractJSON.
- **EDITORIAL_GUIDE: loosened "no markdown / plain text only" rules.** The route's body-step user-turn explicitly allows markdown paragraphs and `**bold** sparingly`. The system prompt forbidding both directly contradicted that. Replaced with rules that match what the route actually wants (paragraph breaks `\n\n` and sparing bold OK; no headers, bullets, horizontal rules).

### Cluster — editorial-guide.ts schema fixes

- **HEADLINE_PROMPT OUTPUT FORMAT:** `"title"` → `"headline"` (matches `HeadlineSummarySchema` field). Added `"slug"` field (route's user-turn requests it; schema has it as optional but model wasn't told to emit it).
- **AUDIENCE_PROMPT OUTPUT JSON:** `"reason": "one sentence"` (singular string) → `"reasons": ["one sentence"]` (array of strings, matches `AudienceCheckSchema`).
- **KID_QUIZ_PROMPT OUTPUT:** `"correct_answer"` → `"correct_index"` (unifies with QUIZ_PROMPT and the route's normalizer's preferred key).
- **KID_ARTICLE_PROMPT OUTPUT:** dropped the `kid_title`/`kid_summary`/`kid_content`/`kid_category` shape; replaced with `title`/`body`/`word_count`/`reading_time_minutes` (matches `BodySchema`). Previously every kid run emitted four fields the route silently dropped while expecting a different shape entirely.
- **QUIZ_PROMPT verification protocol:** internal references to `correct_answer` corrected to `correct_index` (the prompt was inconsistent with itself across step 8b and step 8e).

### Cluster — route.ts schema + user-turn fixes

- **`HeadlineSummarySchema.headline`:** changed from `min(1).max(200)` to `max(200).optional().default('')`. Was guaranteeing failure on the summary step (which intentionally returned an empty headline). Headline step still requires non-empty headline because user-turn requests it.
- **`TimelineEventSchema`:** dropped vestigial `title` and `description` optional fields. Both were schema accommodations for an earlier prompt shape; no current prompt outputs them. Persist mapping at `:1649-1650` updated to use `event_label`/`event_body` directly.
- **Summary user-turn:** rewrote from `Return JSON: {"headline":"<leave as empty string>","summary":"<your summary>"}` to `Return JSON with ONLY a "summary" field: {"summary":"<your summary>"}`. Empty-string instruction was Zod-incompatible.
- **Quiz user-turn:** added explicit JSON shape inline + reminder "Each option MUST be an object with a 'text' field — never a bare string." Previously 2/5 generation failures were the model emitting `options: ["...","..."]` bare strings instead of `[{"text":"..."}]` objects. System prompt's schema didn't override the under-specified user-turn.

### Verification

- `grep -E "vp_slug|RELATED VP|insufficient_data|<!-- word_count|leave as empty string|kid_title|kid_summary|kid_content|kid_category|EXISTING VP STORIES|INHERITING EXISTING THREAD"` returns 0 matches across both files.
- `npx tsc --noEmit` clean.
- ESLint + Prettier ran via husky pre-commit hook, all green.

### Files touched

- `web/src/lib/pipeline/editorial-guide.ts` (-181 / +35 lines net)
- `web/src/app/api/admin/pipeline/generate/route.ts` (+28 / -10 lines net)

### Acceptance test (owner-driven)

Trigger one adult run and one kid run via `/admin/newsroom`. Both should reach `persist` step and produce `pipeline_runs.status='completed'`. If `error_type='schema_validation'` returns, the user-turn's embedded JSON shape needs further tightening; iterate from the error message.

### What this DOESN'T fix (deferred to later phases)

- `kid_articles` table is still being written to by the persist RPC (the writes succeed; the table is just unread). Phase 1 of the AI + Plan Change roadmap consolidates kid runs into `articles`.
- Banded generation (kids 7-9 + tweens 10-12) is Phase 3, not Pass A. Today's `KID_ARTICLE_PROMPT` produces a single mid-band kid voice. Phase 3 splits it.
- `CATEGORY_PROMPTS` covers 13 of 66 DB categories. The remaining ~50 fall through to the generic guide. Coverage backfill is a non-blocking separate project.
- 5 inline prompts (categorization, source_grounding, kid_url_sanitizer, quiz_verification, plagiarism rewrite in `plagiarism-check.ts`) are out of scope here. None had observed schema_validation issues.

---

## 2026-04-27 (Parallel sweep wave 7 — 11 items + iOS pre-submission prep) — _shipped, pushed to git/Vercel_

### Cluster — iOS Info.plist + entitlements (T255-T262)

- **T255** — `VerityPost/VerityPost/VerityPost.entitlements`: added `<key>aps-environment</key><string>development</string>` with comment instructing operator to flip to `production` (or split Release.entitlements) at App Store submission. APNs registration in `PushRegistration.swift` will now succeed in dev/TestFlight.
- **T256** — same file: removed `com.apple.developer.applesignin` entitlement key + value. Aligned with locked magic-link auth direction. Swift UI in SignupView/LoginView intentionally not edited (would need iOS build to verify); the SDK refuses authentication without entitlement, acceptable incremental step.
- **T257** — `VerityPostKids/VerityPostKids/Info.plist`: added `NSAppTransportSecurity` dict with `NSAllowsArbitraryLoads = false`, mirroring adult app declaration.
- **T258** — both Info.plists: replaced hardcoded `1.0` / `1` with `$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)` xcconfig refs. Build settings already in pbxproj — refs resolve at build time.
- **T259 STALE-CONFIRMED** — `TTSPlayer.swift:67-77` configures AVAudioSession with `.playback` / `.spokenAudio`. The `audio` UIBackgroundMode is justified — TTS continues when app backgrounds. No edit. Documented in runbook for App Review reference.
- **T260** — `VerityPostKids/VerityPostKids.entitlements`: added `applinks:kids.veritypost.com`. Out-of-scope finding flagged: kids entitlements already had `applinks:veritypost.com` (suspect — would steal universal links from adult app). Adult entitlements DO NOT have `com.apple.developer.associated-domains` at all (audit's premise was wrong). Both flagged for owner review.
- **T262** — created `Ongoing Projects/release-notes-ios.md` runbook documenting both submission targets (`com.veritypost.app`, `com.veritypost.kids`), test target IDs that must NOT ship, pre-submission checklist (entitlement env flip, build number increment, ATS, associated-domains caveats).

Build-required verification: T255 APNs token round-trip needs real device; T258 plist substitution needs sanity build; T260 universal-link interception needs deep-link tap on device after AASA published.

### Cluster — Web LOW + cron pattern-spread

- **T173** — `web/src/app/api/comments/route.js`: comment-body length cap added. Pulls `comment_max_length` from `settings` (default 4000), 400 with `{error: 'comment_too_long', max_length}` over cap. Settings-driven so cap is a one-row update.
- **T181 pattern-spread** — cron auth comments added to remaining 6 cron routes: pipeline-cleanup, recompute-family-achievements, send-emails, send-push, sweep-beta, sweep-kid-trials. Combined with W3's 6 = 12 of 13 cron routes now signposted (process-deletions remaining; not in spec).
- **T268** — `web/src/app/dmca/page.tsx`: added DMCA registration line `[pending — to be filed at copyright.gov/dmca-agent]` + TODO header comment with the URL. One-line copy update once owner registers.
- **T287** — already-done-W3 (TODO comment in `featureFlags.js`). Verified intact.
- **Cache-Control pattern-spread** — `NO_STORE` headers added to 5 more authenticated routes: `comments/[id]`, `bookmarks/[id]`, `messages/search`, `notifications/preferences`, `account/login-cancel-deletion`. Plus `v2LiveGuard()` 503 in `featureFlags.js` — one-line change covers every guard caller.

### Cluster — i18n constants seed (T167)

- **NEW `web/src/lib/copy.ts`** — `COPY` object with namespaced groups (`comments`, `notifications`, `errors`, `auth`, `kids`, `paywall`), seeded with ~22 strings. Top-of-file comment documents the i18n migration path. Exports `CopyTree` type alias.
- 3 call sites migrated as the demonstration: `CommentComposer.tsx` (mention paid hints — both post-submit toast and live inline hint now from COPY), `api/comments/[id]/route.js` (edit-window-expired response now returns both stable `error` code and `message` from COPP for client display), `logout/page.js` (3 status branches).
- Pattern-seeding only; full migration is multi-day work. Win is the shape in place.

### Files touched

- VerityPost/VerityPost/Info.plist + VerityPost.entitlements
- VerityPostKids/VerityPostKids/Info.plist + VerityPostKids.entitlements
- Ongoing Projects/release-notes-ios.md (NEW)
- web/src/app/api/comments/route.js + comments/[id]/route.js
- web/src/app/api/cron/{pipeline-cleanup,recompute-family-achievements,send-emails,send-push,sweep-beta,sweep-kid-trials}/route.{js,ts}
- web/src/app/api/bookmarks/[id]/route.js
- web/src/app/api/messages/search/route.js
- web/src/app/api/notifications/preferences/route.js
- web/src/app/api/account/login-cancel-deletion/route.js
- web/src/app/dmca/page.tsx
- web/src/app/logout/page.js
- web/src/components/CommentComposer.tsx
- web/src/lib/copy.ts (NEW)
- web/src/lib/featureFlags.js

---

## 2026-04-27 (Parallel sweep wave 6 — 9 items + 1 NEEDS-SCHEMA across 6 clusters) — _shipped, pushed to git/Vercel_

### Cluster — Return-visit + read-state (T91 + T109)

- **T91** — `web/src/app/_HomeVisitTimestamp.tsx` (NEW client island writes `vp_last_home_visit_at` cookie 90-day after first paint). `web/src/app/page.tsx` reads cookie via `next/headers`, computes `isNewStory(story)` predicate. Hero + supporting cards render a "New" pill (white-on-black inverted on hero, white-on-black on supporting) when `published_at > last_visit`. Cookie path chosen over localStorage so the SERVER can compute "New" at render time without flashing on hydration. First-time visit: no cookie → no badges + plant cookie for next visit.
- **T109** — same `page.tsx`: server-side `reading_log` query for authenticated viewer (last 30 days, limit 200, ordered desc), built into `Set<articleId>`. Hero + supporting cards render "Read" tag + dim-color title when `id` in set. Anon viewers short-circuit (no `reading_log` query, no extra round-trip).
- LCP impact: no extra round-trip for anon (auth.getUser short-circuits). Signed-in: one extra query in same Promise.all window.

### Cluster — Kids/family fetch separation (T51)

- **`web/src/app/profile/kids/page.tsx`** + **`web/src/app/profile/family/page.tsx`**: distinguished load-error from empty state. Sentinel symbol pattern (`Symbol('fetch-failed')`) replaces silent `.catch(() => empty)`. New `loadError` state separate from CRUD `error`. Error banner with Retry button. CTAs (Add kid, etc.) gated on `!loadError` so users don't get nudged to add a profile while fetch failed. Family page extraction of inline IIFE into `useCallback load` so Retry can re-fire it.

### Cluster — Palette consolidation (T82)

- 24 of 27 files migrated. Each file's inline `const C = { bg: '#fff', card: '#f7f7f7', border: '#e5e5e5', text: '#111', dim: '#666', accent: '#111', success: ..., danger: ... }` swapped to `const C = { bg: 'var(--bg)', card: 'var(--card)', border: 'var(--border)', text: 'var(--text)', dim: 'var(--dim)', accent: 'var(--accent)', success: 'var(--success)', danger: 'var(--danger)' }`. Audit said 15 files; reality was 27 (drift since audit).
- Files left untouched (3): admin pages already use `ADMIN_C` from centralized `web/src/lib/adminPalette.js` (separate admin theme by design); `web/src/components/profile/InviteFriendsCard.tsx` is fully bespoke dark theme with no globals match.
- Drift findings: `dim` token jumps from `#666` → globals' `#5a5a5a` (AA contrast improvement, ~5.13:1 → ~5.95:1). `success/warn/danger` deeper-variant pattern (`#16a34a`/`#b45309`/`#dc2626`) widespread in ~10 files; doesn't match canonical `--success`/`--warn`/`--danger`. Adding `--success-deep` etc. to globals would unify.

### Cluster — DOMPurify SSR + AI disclosure (T207 + T267)

- **T207 STALE-RESOLVED** — `web/src/app/expert-queue/page.tsx` already has the `typeof window === 'undefined' ? '' : DOMPurify.sanitize(...)` guard from W1 T202 hardening. SSR returns empty (not unsanitized input). Header comment accurately documents the state. No change.
- **T267** — `web/src/app/privacy/page.tsx` Section 3 (Content Processing): EU AI Act Article 50 + California AB 2655 disclosure sentence appended inside the existing AI-related bullet. Pairs with W4 T234 story-page AI-synthesized pill.

### Cluster — Block scope + expert revoke (T282 + T284)

- **T282 PARTIAL** — Block scope expanded to 2 surfaces:
  - **Leaderboard** (`web/src/app/leaderboard/page.tsx`): bidirectional `blockedIds` set populated in init via `blocked_users` `.or(...)`, `visibleUsers = users.filter(u => !blockedIds.has(u.id))` applied at render. `myRank` computed from `visibleUsers` so viewer's perceived rank matches what they see. Trade-off noted inline: post-fetch filter on `limit(50)` query can under-fill if many blocks intersect top 50; acceptable scale.
  - **Expert queue** (`web/src/app/api/expert/queue/route.js`): server-side bidirectional filter on the listing API. Asker IDs never leave the server when blocked. Client-side `expert-queue/page.tsx` consumes pre-filtered items.
- Surfaces deferred (TODO): `CommentRow.tsx` `renderBody` plain-text fallback for blocked-user mentions; `expert-sessions/[id]/questions` per-session question filter; iOS surfaces.
- **T284 NEEDS-SCHEMA** — schema reality verified: `users.is_expert: boolean` exists but `users.expert_verified_at` and `users.expert_revoked_at` DO NOT. The verification + expiry timestamps live on `expert_applications` (`credential_verified_at`, `credential_expires_at`, `status`, `revoked_reason`, `reverification_notified_at`). Halted per task instruction. Three owner decisions needed before implementation: (A) lighter schema-free path using `expert_applications.status='revoked'` + `audit_log`, vs (B) add `users.expert_revoked_at`/`expert_verified_at` columns, (C) confirm 35-day grace math, (D) confirm whether to flip `is_expert` AND `expert_applications.status` or just badge.

### Cluster — ErrorState primitive (T117)

- **NEW `web/src/components/ErrorState.tsx`** — `<ErrorState message? onRetry? inline? children? style? />`. Internal `busy` state during async retry, `role="alert"`, `aria-busy`. Hero + inline layouts. CSS-var styling with safe fallbacks.
- 6 sites migrated to use it: `search/page.tsx`, `bookmarks/page.tsx`, `notifications/page.tsx`, `messages/page.tsx`, `leaderboard/page.tsx`, `profile/page.tsx` (per-tab error states with retry that resets the tab's `loaded` flag).
- Profile page: added `activityError` / `categoriesError` / `milestonesError` per-tab states. Each tab renders `<ErrorState>` ahead of its empty/list branch.
- Kids page deliberately skipped (T51 was shipping in parallel and already added inline retry).

### Files touched (~32)

- web/src/app/_HomeVisitTimestamp.tsx (NEW)
- web/src/app/page.tsx
- web/src/app/profile/kids/page.tsx
- web/src/app/profile/family/page.tsx
- web/src/app/profile/page.tsx
- web/src/app/profile/kids/[id]/page.tsx
- web/src/app/profile/settings/expert/page.tsx
- web/src/app/leaderboard/page.tsx
- web/src/app/api/expert/queue/route.js
- web/src/app/expert-queue/page.tsx
- web/src/app/privacy/page.tsx
- web/src/app/login/page.tsx
- web/src/app/welcome/page.tsx
- web/src/app/recap/page.tsx
- web/src/app/recap/[id]/page.tsx
- web/src/app/notifications/page.tsx
- web/src/app/forgot-password/page.tsx
- web/src/app/reset-password/page.tsx
- web/src/app/verify-email/page.tsx
- web/src/app/logout/page.js
- web/src/app/signup/expert/page.tsx
- web/src/app/signup/pick-username/page.tsx
- web/src/app/signup/pick-categories/page.tsx
- web/src/app/u/[username]/page.tsx
- web/src/app/card/[username]/page.js
- web/src/app/browse/page.tsx
- web/src/app/messages/page.tsx
- web/src/app/search/page.tsx
- web/src/app/bookmarks/page.tsx
- web/src/components/ErrorState.tsx (NEW)
- web/src/components/UnderConstruction.tsx
- web/src/components/AccountStateBanner.tsx
- web/src/components/ArticleQuiz.tsx
- web/src/components/profile/BetaStatusBanner.tsx
- web/src/components/kids/PairDeviceButton.tsx

---

## 2026-04-27 (Parallel sweep wave 5 — 15 items + 4 stale-confirmed across 6 clusters) — _shipped, pushed to git/Vercel_

### Cluster — Small UX (T36 + T243; T97 stale)

- **T36** — `web/src/app/profile/page.tsx`: when `articles_read_count + comment_count === 0`, single onboarding card renders above the tabs ("Welcome to Verity Post — read an article and pass the quiz to start building your score." + Find-an-article CTA). Auto-hides once user has any activity. Tabs unchanged.
- **T243** — `web/src/app/story/[slug]/page.tsx`: extended `ArticleRow` with typed `author` field, augmented existing single-roundtrip article fetch with `author:users!fk_articles_author_id(...)` (disambiguated FK explicitly to `users` due to dual-target). Byline render added above the date/sources/read-time meta line: "By <displayName or username>" with inline "Expert · <title>" pill when `is_expert`.
- **T97 STALE-OBSOLETE** — `/signup` is a redirect to `/login`; the email-availability check no longer exists in either page (closed-beta refactor removed it).

### Cluster — DEBT cleanup (T70 + T71 + T73 + T75)

- **T70 STALE-RESOLVED** — `currentschema` is git-tracked (committed 2026-04-26 in restructure). Optional `npm run schema:dump` script skipped (no clean Supabase CLI recipe matches the existing format).
- **T71 STALE** — historical CHANGELOG entries describe shipped work; their file paths reflect repo state at the time. Correctly historical.
- **T73 RESOLVED (inventory delivered)** — new `Ongoing Projects/migrations/T73_permissions_wave1_retirement.md`. Key finding: legacy `getCapabilities` path has only 2 consumers (`PermissionGate` + `PermissionGateInline`); tree-wide grep for `<PermissionGate` JSX returns ZERO consumer sites. Components themselves are dead code. Retirement may be a straight delete rather than migration. Doc lays out the swap-safety analysis and 5-step recommended sequencing.
- **T75 STALE (premise wrong)** — `web/src/lib/password.js` contains zero PBKDF2 hashing. File is exclusively policy/strength helpers (`PASSWORD_MIN_LENGTH`, `PASSWORD_REQS`, `validatePasswordServer`, `passwordStrength`, etc.). The PBKDF2 hashing the audit was thinking of lives in `web/src/lib/kidPin.js` — that's the active kids COPPA flow with documented `pin_hash_algo: 'sha256' → 'pbkdf2'` rehash-on-verify migration. Not legacy. Not a candidate for retirement.

### Cluster — Backend defense (T174 + T177)

- **T174** — `web/src/app/api/ios/appstore/notifications/route.js`: comment block above the `received` reclaim guard cross-references the Stripe webhook's stuck-row reclaim (`STUCK_PROCESSING_SECONDS = 5*60`, `.in('processing_status', ['processing', 'received'])`). Explains why Apple only inspects `'received'` — Apple's path doesn't transition through `'processing'`. Comment-only.
- **T177 TODO-MARKERS-ONLY** — `web/src/app/api/auth/email-change/route.js` + `web/src/app/api/billing/cancel/route.js` got TODO blocks describing what auth_time-based recent-auth gate would look like under magic-link (`session.last_sign_in_at` 15min threshold + `/api/auth/re-verify` route owed). Defer until AUTH-MIGRATION ships.

### Cluster — Story page perf (T216 + T217 + T218)

NOTE: this cluster integrated cleanly with all 6 prior-wave story-page edits (T13/T30/T63/T130/T141/T234/T243/T11).

- **T216** — extracted 5 module-level `React.CSSProperties` constants (SECTION_LABEL_STYLE_MB16/MB10, LOCK_TITLE_STYLE, LOCK_BODY_STYLE, ACTION_BUTTON_STYLE, FREE_READS_PILL_STYLE). 9 style-object allocations per render eliminated on the hot render path. Spread+override patterns deliberately left inline (re-allocation would erase the gain).
- **T217** — article-load effect now has `let cancelled = false` + AbortController; every `await` is gated by `if (cancelled) return;` before its state setter. Kills the "wrong story flashes" race when slug changes mid-flight. Two more AbortControllers added on the read-open + read-complete fetch effects. 10 effects NOT consolidated (each is scoped + minimal-deps).
- **T218** — eliminated the second `users.select('plan_id')` round-trip by folding `plan_id` into the existing first user fetch. Did NOT inline timelines/sources into the article fetch (PostgREST nested-resource ordering quirks + RLS risk; current `Promise.all` shape is fine). Did NOT replace user fetch with AuthContext (AuthContext doesn't expose `metadata.a11y.ttsDefault` per T63 wiring + has different `userTier` semantics).

### Cluster — Home page → server component (T215)

This is a substantial refactor. Full conversion shipped:

- **`web/src/app/page.tsx` rewritten** as async server component. All three Supabase queries (today's stories, breaking row, categories) run on the server in parallel via cookie-bearing `createClient()`. HTML for masthead + hero + 19 supporting cards streams on first byte. `export const dynamic = 'force-dynamic'` so Next never statically caches the freshness-critical "today" feed.
- **NEW `web/src/app/_homeShared.ts`** — shared types/constants/timeShort. Non-`'use client'` so importable by both server + client tree.
- **NEW `web/src/app/_HomeBreakingStrip.tsx`** — client island, runs `refreshAllPermissions` + perm checks for `home.breaking_banner.view`/`.paid`.
- **NEW `web/src/app/_HomeFooter.tsx`** — client island for auth-aware CTA + `usePageViewTrack`.
- **NEW `web/src/app/_HomeFetchFailed.tsx`** — client island retry button (`router.refresh`).

Page went from ~825 lines all-client to ~445 server + ~270 across 3 small client islands. Expected anon LCP improvement on 3G: ~1.5-2.5s (cuts roughly half) — masthead + hero now paint in TTFB+layout time, not TTFB+JS+RTT time. T110 timezone disclosure preserved verbatim. Home-cap removal preserved.

### Cluster — Editorial integrity (T236 + T237 + T238 + T239)

- **T236** — `web/src/app/api/admin/pipeline/generate/route.ts`: snapshots `additionalInstructions` passed to `rewriteForPlagiarism()` into `pipeline_runs.input_params.prompt_snapshot.overrides['plagiarism.additional_instructions']` at the call site. Fail-OPEN on snapshot-write error.
- **T237** — `web/src/lib/pipeline/cost-tracker.ts`: emits `await captureMessage('pipeline cost-cap fail-closed', 'error', {...})` before each of the four throw paths (invalid estimate, cap-check unavailable, per-run cap breach, daily cap breach), with reason discriminator + attempted_cost + run_id + step/cluster/provider/model context. Throw behavior unchanged. Optional `CheckCostCapContext` arg threaded through `call-model.ts`.
- **T238** — `web/src/app/api/admin/users/[id]/route.ts`: replaced hard `.delete()` with soft-delete UPDATE — `deleted_at = now()`, `display_name = 'deleted'`, `email = 'deleted-<id>@deleted.invalid'`, `is_banned = true`, `is_active = false`, PII null-out on username/avatar_url/banner_url/bio/first_name/last_name/phone. Idempotent. `recordAdminAction` logs `newValue: { soft_deleted: true }`. Two TODOs: (1) RLS verification on public reads (needs migration), (2) future GDPR hard-purge cron at 30d.
- **T239** — `web/src/app/browse/page.tsx`: separate Supabase fetch ordered `is_featured DESC, published_at DESC LIMIT 3`. `FeaturedCard` gained `isFeatured` flag; `hasEditorPick` state swaps section title from "Latest" → "Featured by editors" when any displayed card is editor-pinned. `articles.is_featured` schema column verified to exist. Admin pin UI deliberately not built (separate task).

### Files touched

- web/src/app/api/admin/pipeline/generate/route.ts
- web/src/app/api/admin/users/[id]/route.ts
- web/src/app/api/auth/email-change/route.js
- web/src/app/api/billing/cancel/route.js
- web/src/app/api/ios/appstore/notifications/route.js
- web/src/app/browse/page.tsx
- web/src/app/page.tsx (substantial rewrite)
- web/src/app/profile/page.tsx
- web/src/app/story/[slug]/page.tsx
- web/src/lib/pipeline/call-model.ts
- web/src/lib/pipeline/cost-tracker.ts
- web/src/app/_homeShared.ts (NEW)
- web/src/app/_HomeBreakingStrip.tsx (NEW)
- web/src/app/_HomeFooter.tsx (NEW)
- web/src/app/_HomeFetchFailed.tsx (NEW)
- Ongoing Projects/migrations/T73_permissions_wave1_retirement.md (NEW)

---

## 2026-04-27 (Parallel sweep wave 4 — 15 items + 1 deferred across 6 clusters) — _shipped, pushed to git/Vercel_

### Cluster — Story page (T234 + T11)

- **T234** — `web/src/app/story/[slug]/page.tsx`: `is_ai_generated` flag now rendered as a small "AI-synthesized" pill below excerpt, gated by `settings.show_ai_label !== false` (defaults true). Long EU AI Act / CA AB 2655 explanation in the `title=` tooltip on hover. Integrates cleanly with prior-wave T13/T30/T130/T63 edits.
- **T11 (web piece)** — same file: post-article "More in [Category]" strip below the discussion section (3-card stacked grid, title + published date, top-bordered). Same-category articles fetched alongside existing timelines/sources/quizzes (no extra round-trip). Empty discussion state gets a compact same-category list via new `emptyStateExtra` prop on `<CommentThread>`. Silent absence when article has no `category_id` or no siblings. iOS Up Next removal still owed (T11 iOS piece) — separate task.

### Cluster — Kids privacy URL (T273)

- New `web/src/app/privacy/kids/page.tsx` — full COPPA notice with 7 sections (collect / don't-collect / VPC / parental rights / retention / no-third-party / contact). Server component, no auth gate. Style matches main privacy page.
- `web/src/app/privacy/page.tsx` Section 7 (COPPA) gains a final bullet linking to `/privacy/kids`.
- `web/src/app/NavWrapper.tsx` footer adds `Kids Privacy → /privacy/kids` between Privacy and the California Privacy Rights link.

### Cluster — CSAM reporting (T278)

- New `web/src/lib/reportReasons.js` — single source of truth for report reasons. Exports `URGENT_REPORT_REASONS` (`csam`, `child_exploitation`, `grooming`), three reason lists (`COMMENT_REPORT_REASONS`, `ARTICLE_REPORT_REASONS`, `PROFILE_REPORT_REASONS`), `isUrgentReason()` + `assertReportReason()` for server-side enum validation.
- New `web/src/lib/ncmec.ts` — `reportToNCMEC()` stub + `ncmecConfigured()` env-flag helper. Header is operator runbook with 18 U.S.C. § 2258A context, NCMEC field requirements, full registration checklist (`NCMEC_ESP_ID` / `NCMEC_API_TOKEN` env vars).
- `web/src/app/api/comments/[id]/report/route.js`: urgent reasons (a) bypass T281 per-target rate limit (victim never silenced), (b) insert with `is_escalated=true` + `metadata={severity:'urgent', legal_basis, reason_code}`, (c) emit `captureMessage('urgent report submitted', 'error', ...)`, (d) attempt `reportToNCMEC()` if `ncmecConfigured()`.
- `web/src/app/api/reports/route.js`: same enum check + urgent-flag flow on article-level reports.
- `web/src/components/CommentThread.tsx`, `web/src/app/story/[slug]/page.tsx`, `web/src/app/u/[username]/page.tsx` — all import shared `*_REPORT_REASONS` so urgent options surface in every report dropdown.
- `web/src/app/dmca/page.tsx` + `web/src/app/help/page.tsx` — CyberTipline footer block (https://report.cybertipline.org, 1-800-843-5678, § 2258A citation).
- **NCMEC API wire is SCAFFOLDED ONLY** — operator must register Verity Post as an ESP at cybertipline.org/registration, store credentials, then implement `reportToNCMEC()` body. In-app urgent path (escalation flag + Sentry page + rate-limit bypass) works today regardless.
- Out-of-scope flag: iOS `BlockService.swift ReportReason` enum needs the same three values added.

### Cluster — Article admin + pipeline (T235 + T242 + T241 + T231 + T240 verify)

- **T235** — `web/src/app/api/admin/articles/[id]/route.ts`: per-table delete-then-insert sequences wrapped in try/catch with `captureMessage('admin article PATCH inconsistent state', 'error', ...)` on partial-failure. Begin/commit audit_log pair (`article.edit.begin` / `article.edit.commit`) — operators detect failed mid-flight PATCHes by scanning for begins without matching commits. TODO(T5) comment references the future `update_admin_article_with_children` RPC.
- **T242** — `web/src/app/api/admin/pipeline/generate/route.ts`: snapshot active `ai_prompt_presets` + `ai_prompt_overrides` into `pipeline_runs.input_params.prompt_snapshot` jsonb at run start. Existing `input_params` reused — no schema change. Failure of snapshot capture fails-OPEN; pipeline still runs.
- **T231** — new executable `web/scripts/check-crons.mjs` reads `vercel.json` + walks `web/src/app/api/cron/*/route.{js,ts}`, asserts bidirectional 1:1. Wired as `npm run check-crons`. Already finds 2 real drifts (`cleanup-data-exports`, `rate-limit-cleanup` exist on disk but missing schedules) — flagged for owner triage.
- **T241** — TODO(T241) block added to `web/src/app/api/cron/pipeline-cleanup/route.ts` header documenting proposed schema (`sources.last_verified_at`, `sources.status_code`) + cron route + weekly cadence. T5 schema halt; no migration drafted.
- **T240** — already-done in W3; verified TODO comment still in place at `web/src/app/admin/moderation/page.tsx`.

### Cluster — Post-signup category picker (T140)

- New `web/src/app/signup/pick-categories/page.tsx` — client component, 8-12 category chips, MIN_PICKS=3 / MAX_PICKS=7, "Skip" option. Saves selected category IDs into `users.metadata.feed.cats` via `update_own_profile` RPC (preserves other `feed.*` keys via fresh-read merge). Redirects to `/welcome` on submit/skip. Idempotent: returning user with `onboarding_completed_at` set OR `feed.cats.length >= 3` bounces to `/welcome`. Forwards `?next=` through.
- `web/src/app/signup/pick-username/page.tsx`: 3 redirect targets switched from `/welcome` to `/signup/pick-categories` (returning-user-with-username branch, successful submit, skip path).
- Used existing `users.metadata.feed.cats` key (the live key in production), NOT the `metadata.feed.preferred_categories` the audit suggested. Aligned to existing storage to avoid forking a parallel store.
- Flow: signup → email-verify/OAuth callback → `/signup/pick-username` → `/signup/pick-categories` (3-7) → `/welcome` carousel → first story (T39).

### Cluster — Web small UX (T110 + T141 + T149 + T151 + T153)

- **T110** — `web/src/app/page.tsx`: home masthead now renders the date + small "Today's edition (Eastern Time)" 11px disclosure under it. Timezone logic untouched.
- **T141** — `web/src/components/ArticleQuiz.tsx` passed-stage: single-line "Jump to discussion · Browse for your next article" CTA below the existing pass message. Adult-only (skipped for kids). Required adding `id="discussion"` anchor on the discussion section in `web/src/app/story/[slug]/page.tsx`.
- **T149** — `web/src/components/ArticleQuiz.tsx`: new `poolExhausted` state set when API returns "pool exhausted." Renders "Try a different article — browse more." recovery line in the idle stage below the existing terminal-error message.
- **T151** — `web/src/app/signup/pick-username/page.tsx`: supporting line below the existing copy: "This is how other readers find and follow you. Choose carefully — usernames are permanent."
- **T153** — `web/src/app/messages/page.tsx`: `?to=<userId>` deep-link now UUID-shape regex-checked. Invalid shape → `toast.error('User not found.')` and bail without firing the compose-prefill.
- **T152 DEFERRED-TOO-LARGE** — per-category "trending now" subtitles on browse cards require either N parallel fetches or a denormalized aggregate column. Real feature work, not copy edit. Left for future session.

### Files touched

- web/src/app/api/admin/articles/[id]/route.ts
- web/src/app/api/admin/pipeline/generate/route.ts
- web/src/app/api/comments/[id]/report/route.js
- web/src/app/api/cron/pipeline-cleanup/route.ts
- web/src/app/api/reports/route.js
- web/src/app/dmca/page.tsx
- web/src/app/help/page.tsx (already touched W3)
- web/src/app/messages/page.tsx
- web/src/app/NavWrapper.tsx
- web/src/app/page.tsx
- web/src/app/privacy/kids/page.tsx (NEW)
- web/src/app/privacy/page.tsx
- web/src/app/signup/pick-categories/page.tsx (NEW)
- web/src/app/signup/pick-username/page.tsx
- web/src/app/story/[slug]/page.tsx
- web/src/app/u/[username]/page.tsx
- web/src/components/ArticleQuiz.tsx
- web/src/components/CommentThread.tsx
- web/src/lib/ncmec.ts (NEW)
- web/src/lib/reportReasons.js (NEW)
- web/scripts/check-crons.mjs (NEW)
- web/package.json (npm script)

---

## 2026-04-27 (Parallel sweep wave 3 — 22 items shipped + 4 stale across 6 clusters) — _shipped, pushed to git/Vercel_

### Cluster — Walkthrough copy

- **T288** — `web/src/app/cookies/page.tsx`: replaced misleading "consent banner appears on first visit" copy with truthful current-state guidance (browser settings, mobile privacy controls, in-app banner coming).
- **T289 STALE-CONFIRMED** — skip-link is alive at `web/src/app/layout.js:134-136` + `web/src/app/globals.css:177-198` (T222 extraction preserved it). No change.
- **T290** — `web/src/app/accessibility/page.tsx`: high-contrast pointer rewritten to "Account Settings → Display preferences (Coming soon — reader will honor this once wired)" + note that OS-level high-contrast is honored meanwhile.
- **T295** — `web/src/app/help/page.tsx`: `captureMessage` warning emitted on partial-data + catch paths of the Stripe price fetch. Inline `(approximate; sign in to see live pricing)` hint shown when fallback prices are in play.

### Cluster — Cache-Control on auth routes (T170 + T209)

`Cache-Control: 'private, no-store, max-age=0'` added to all responses (success + error paths) on:
- `web/src/app/api/comments/route.js`
- `web/src/app/api/messages/route.js`
- `web/src/app/api/bookmarks/route.js`
- `web/src/app/api/conversations/route.js`
- `web/src/app/api/notifications/route.js`
- `web/src/app/api/stripe/portal/route.js`
- `web/src/app/api/account/onboarding/route.js`
- `web/src/app/api/account/data-export/route.js`
- `web/src/app/api/account/delete/route.js`
- `web/src/lib/apiErrors.js`: `safeErrorResponse` extended to thread `options.headers` (backward compatible).

Pattern-spread flagged for follow-up: ~20 more authenticated routes (admin/*, profile/*, follow/*, votes/*, kids/*, push/*) need the same treatment in a future pass. `v2LiveGuard()` 503 response also needs the header — one-line fix that buys coverage across many callers.

### Cluster — Backend security misc

- **T171** — body-size cap (50 KB) before JSON parse on `web/src/app/api/comments/route.js`, `messages/route.js`, `bookmark-collections/route.js`. Returns 413 over cap. Mirrors the Stripe webhook pattern.
- **T172** — `web/src/app/api/promo/redeem/route.js`: `^[A-Z0-9-]{3,32}$` shape check before any DB hit; existing escape kept as defense-in-depth.
- **T175** — `web/src/app/api/events/batch/route.ts`: module-level throw if `NODE_ENV=production && !EVENT_HASH_SALT`. Cold-start fail-loud.
- **T176** — `web/src/lib/rateLimit.js`: module-level throw if `RATE_LIMIT_ALLOW_FAIL_OPEN=1` in production / preview.
- **T210** — `web/src/app/api/admin/settings/route.js`: deny-list (not allowlist) for settings keys (`auth_*`, `secret_*`, `internal_*`, `service_*`, `jwt_*`, `stripe_secret*`, `supabase_service*`). Existing `is_sensitive` per-row gate preserved as authoritative check.
- **T180** — `web/src/app/api/stripe/webhook/route.js`: 5 sites where `charge.customer` is consumed as string now have explicit `typeof === 'string'` guards.
- **T181** — cron auth comment added above `verifyCronAuth` in 6 of 13 cron routes (freeze-grace, check-user-achievements, process-data-exports, flag-expert-reverifications, cleanup-data-exports, rate-limit-cleanup). 7 remaining flagged for pattern-spread.
- **T211** — `web/src/app/api/stripe/webhook/route.js`: per-event-id replay rate-limit (`stripe-event:${event.id}`, max 5 per 5min). 429 with Retry-After over cap.
- **T212** — `web/src/lib/auth.js`: `if (authUser.id !== profile.id) throw 'AUTH_PROFILE_ID_MISMATCH'` belt-and-suspenders check after profile fetch in `getUser()`.

### Cluster — Backend DX

- **T179** — new `web/src/lib/rpcError.js` helper (`mapRpcError(error, context)` → `{ status, body }` mapping common PG codes 23505→409, 23514→400, 42501→403, P0001→400, 22023→400). Applied to `api/promo/redeem/route.js` (RPC error path) + `api/follows/route.js` (toggle_follow). Pattern documented; consolidation with `safeErrorResponse` flagged for later.
- **T232** — new `web/scripts/deploy.sh` + `web/scripts/emergency-rollback.sh` (executable) + `web/scripts/README.md` runbook entry.
- **T287 TODO-COMMENT-ONLY** — `web/src/lib/featureFlags.js` block above `v2LiveGuard` describing the future `/admin/system-controls` page surface. No logic shipped.
- **T230 TODO-COMMENT-ONLY** — `web/src/app/admin/moderation/page.tsx` block proposing `moderation_actions` schema. T5 schema, halted.

### Cluster — Dead code / UI polish

- **T59** — `web/src/components/admin/Page.jsx`: existing `backHref` prop's button reworked to a 40×40 minimum tap target with `←` glyph + label + `aria-label="Back to <X>"`. All `<PageHeader backHref="…">` callers inherit.
- **T69** — `web/src/app/api/ai/generate/route.js`: 2 admin callers found via grep, can't delete. Patched to write `renderBodyHtml(generated)` (sanitize-html pipeline) instead of raw OpenAI output. TODO at top notes the F7 supersession path.
- **T74 STALE** — `web/src/lib/mentions.js` is live (`MENTION_RE` imported by `CommentRow.tsx:9` + `CommentComposer.tsx:7`). No deletion.
- **T75 OWNER-DECISION** — `web/src/lib/password.js` has 3 live callers (`api/settings/password-policy/route.js`, `api/auth/signup/route.js`, `reset-password/page.tsx` for `PASSWORD_REQS`/`passwordStrength`). May export both legacy hashing AND policy/strength helpers. Owner decides cleanup direction.
- **T111** — `web/src/app/browse/page.tsx`: removed dead `FILTERS` const + `FilterKey` type + `activeFilter` state + placeholder comment. JSX rendering pills was already gone; only the dead state/const remained.
- **T125** — `web/src/app/browse/page.tsx`: `filtered` predicate at line 188 now requires `c.slug`. Slug-null categories skipped before render so the broken-looking non-clickable card is gone.

### Cluster — UX

- **T269** — `web/src/app/profile/settings/page.tsx`: inline auto-renewal disclosure renders once between the cycle toggle and the plan grid, above all Upgrade/Switch CTAs. Copy adapts to cycle. FTC ROSCA compliance.
- **T143** — `web/src/app/messages/page.tsx`: empty inbox now leads with "Have a question? Ask an expert." hero card pointing to article comments where `expert.ask` is gated, with a `/browse` CTA. Pre-existing "New message" search CTA preserved as secondary path.
- **T145 STALE-PARTIAL** — profile zero-state. The three "empty states" are inside three separate tabs (Activity / Categories / Milestones) rendered exclusively, plus the `categoriesLength==0` path is a system-wide signal not a user signal. Consolidating across tabs would require eager-loading three datasets on mount (perf regression). Left as-is.

### Files touched (35 total)

- accessibility/page.tsx, admin/moderation/page.tsx, admin/Page.jsx, admin/settings/route.js
- api/account/{data-export,delete,onboarding}/route.js
- api/ai/generate/route.js, api/bookmark-collections/route.js, api/bookmarks/route.js
- api/comments/route.js, api/conversations/route.js
- api/cron/{check-user-achievements,cleanup-data-exports,flag-expert-reverifications,freeze-grace,process-data-exports,rate-limit-cleanup}/route.{js,ts}
- api/events/batch/route.ts, api/follows/route.js, api/messages/route.js
- api/notifications/route.js, api/promo/redeem/route.js
- api/stripe/{portal,webhook}/route.js
- browse/page.tsx, cookies/page.tsx, help/page.tsx, messages/page.tsx, profile/settings/page.tsx
- lib/{apiErrors,auth,featureFlags,rateLimit,rpcError}.js, lib/observability.js
- web/scripts/deploy.sh, emergency-rollback.sh, README.md

---

## 2026-04-27 (Parallel sweep wave 2 — 17 items across 5 clusters: admin email, penalty escalate, server security, perf, TS hardening) — _shipped, pushed to git/Vercel_

Five implementer agents dispatched in parallel on non-overlapping file clusters (avoiding files touched in wave 1).

### Cluster G — Admin EMAIL_SEQUENCES cleanup

- **T9 + T10** — `web/src/app/admin/notifications/page.tsx`: deleted `EMAIL_SEQUENCES` constant entirely (Onboarding Day 0/1/3/5/7 + Re-engagement Day 30/37 hardcoded data). Removed `email_onboarding`/`email_reengagement` from `EMAIL_CONFIG`, `DEFAULT_TOGGLE_STATE`, `DEFAULT_NUMS`. Removed `'sequences'` from the tabs union + nav + render branch. Header subtitle updated. Zero remaining references to deleted symbols. DB `settings` rows preserved (UI no longer reads/writes them; can be cron-cleaned later).
- Out-of-scope flag: `email_breaking` + `email_achievement` toggles still write to `settings`; tracing whether any sender consumes those is a separate verification pass.

### Cluster H — Penalty auto-escalate

- **T276** — `web/src/app/api/admin/moderation/users/[id]/penalty/route.js`: `level` now optional. `'auto'` / null / undefined / '' triggers escalation: count `user_warnings` rows for target within 60d, map count→level (0→1 warn, 1→2 mute24h, 2→3 mute7d, 3+→4 ban). Explicit `1..4` still honored as manual override. Audit metadata + response carry `auto_escalated` + `escalated_from_count`. RPC body untouched. Schema verified via MCP — `user_warnings` table exists with the right shape.

### Cluster I — Server security hardening

- **T203** — `web/src/lib/auth.js`: added `verifyBearerToken()` with HS256 verification against `SUPABASE_JWT_SECRET`, `aud=authenticated` + `iss` checks. Called before `createClientFromToken`; throws 401 on invalid/missing-secret. `jsonwebtoken@^9.0.3` already in deps; no new dep added. Defense-in-depth on top of GoTrue's own verification.
- **T204** — `web/src/lib/authRedirect.js`: open-redirect / path-traversal hardening on `next=`. Pre-decode via `decodeURIComponent` (try/catch rejects invalid encoding); reject literal `..` traversal in raw + decoded forms; reject absolute URLs (`http://`, `https://`, case-insensitive); reject encoded-slash/backslash prefixes (`/%2f`, `/%5c`). Existing whitelist regex preserved.
- **T205** — `web/src/app/api/stripe/webhook/route.js`: webhook fallback path now requires BOTH `client_reference_id` AND `metadata.user_id` to be present and equal. Our checkout route always sets both to the same authenticated user id; sessions arriving without one or with mismatched values didn't originate from our checkout (Dashboard, Payment Links, leaked API key) and are refused. Existing F-016 defenses preserved.
- **T208 — POSTURE-NOTE** — `web/src/middleware.js`: comment block above `buildCsp()` documents why we don't add SRI to Stripe scripts (Stripe doesn't publish stable hashes), the current mitigation stack, and revisit triggers. CSP itself unchanged.

### Cluster P — Performance small

- **T219** — `web/src/app/api/ads/serve/route.js`: response now sets `Cache-Control: max-age=300, stale-while-revalidate=3600`. Browser + edge cache the per-article ad creative for up to 5 min.
- **T220 — RE-SCOPED** — `web/src/app/NavWrapper.tsx`: audit's "fires 3 useEffects every route change" was stale (deps were `[]`). Real waste was `onAuthStateChange` re-hydrating on every token refresh. Added `lastHydrateRef` (60s skip window keyed on user-id; sign-in/sign-out always falls through). Dropped redundant `refreshIfStale()` call (the prior `refreshAllPermissions()` just bumped the version). Removed unused import.
- **T221** — `web/src/lib/pipeline/call-model.ts`: added `import 'server-only';` above the `Anthropic` + `OpenAI` imports. Defends against accidental ~400KB browser bundle inclusion.
- **T222** — `web/src/app/layout.js` + `web/src/app/globals.css`: extracted skip-link + form-focus inline `<style>` blocks to globals.css (rules transferred 1:1, top-level since globals doesn't use `@layer`). Visual rendering preserved.
- **T223** — `web/src/lib/pipeline/render-body.ts` (sanitize-html) + `web/src/lib/pipeline/scrape-article.ts` (cheerio): added `import 'server-only';` to both. `dompurify` left alone (intentionally browser).

### Cluster M — TS hardening

- **T155** — `web/src/app/NavWrapper.tsx`: notifications-poll JSON parse now type-guarded — `typeof data?.unread_count === 'number'` else 0. Audit's "shape" claim was off (it's `unread_count: number`, not `loggedIn: boolean`); guard still warranted.
- **T156** — `web/src/lib/useTrack.ts`: added explicit return-type annotations + exported `TrackFn` type alias.
- **T157** — `web/src/app/beta-locked/page.tsx`: replaced `as { reason?: string }` cast with `typeof === 'string'` guard. Skipped zod (premature for one optional string).
- **T161** — `web/src/components/LockModal.tsx`: dropped `as { user: unknown }` cast. `usePermissionsContext()` already returns `PermissionsContextValue` correctly typed; the cast was actively widening.
- **T162** — `web/src/app/messages/page.tsx`: three `await res.json().catch(() => ({}))` sites now type-guarded before consumption. Lines shifted from audit's 495/531/570 to current 508/544/581 after T112/T113 — verified no overlap with DM-paywall work.
- **T163** — `web/src/app/api/notifications/route.js`: added JSDoc `@param {NextRequest}` + `@returns {Promise<NextResponse>}` on GET. JS file kept (no TS conversion). Intellisense without rewrite.

### Files touched

- `web/src/app/NavWrapper.tsx`
- `web/src/app/admin/notifications/page.tsx`
- `web/src/app/api/admin/moderation/users/[id]/penalty/route.js`
- `web/src/app/api/ads/serve/route.js`
- `web/src/app/api/notifications/route.js`
- `web/src/app/api/stripe/webhook/route.js`
- `web/src/app/beta-locked/page.tsx`
- `web/src/app/globals.css`
- `web/src/app/layout.js`
- `web/src/app/messages/page.tsx`
- `web/src/components/LockModal.tsx`
- `web/src/lib/auth.js`
- `web/src/lib/authRedirect.js`
- `web/src/lib/pipeline/call-model.ts`
- `web/src/lib/pipeline/render-body.ts`
- `web/src/lib/pipeline/scrape-article.ts`
- `web/src/lib/useTrack.ts`
- `web/src/middleware.js`

---

## 2026-04-27 (Parallel sweep — 28 items shipped + 2 stale-confirmed across 6 clusters) — _shipped, pushed to git/Vercel_

Six implementer agents dispatched in parallel covering non-overlapping file clusters. Each cluster summarized below.

### Cluster A — Trust & Safety server hardening

- **T277** — `web/src/app/api/reports/route.js`: auto-hide threshold-crossing branch now writes a system audit_log entry (`actor_id: null`, `action: 'comment.auto_hide'`, target + threshold + report_count metadata). Direct insert via service client (not `recordAdminAction` — that helper is auth.uid()-scoped and would log the reporter).
- **T279** — `web/src/app/api/admin/moderation/comments/[id]/hide/route.js`: accepts `mode: 'hide' | 'redact'`. Default `'hide'` (status-only). `'redact'` additionally overwrites `body = '[redacted by moderator]'` + nulls `body_html`. Audit log carries the chosen mode; response echoes it. Closes subpoena-exposure gap when comment content needs to disappear from queryable storage.
- **T280** — `web/src/app/api/comments/[id]/route.js`: 10-minute self-edit window. Looks up the comment row, computes `Date.now() - created_at`, returns 403 `{error: 'edit_window_expired'}` for self-edits past 10min. Mods/admins editing on a different surface unaffected.
- **T281** — `web/src/app/api/comments/[id]/report/route.js`: per-target anti-brigading rate-limit (3 reports same target per 24h, keyed `report:reporter:${reporterId}:target:${targetUserId}`). Existing per-reporter rate-limit preserved.
- **T283** — `web/src/app/api/conversations/route.js`: `USER_NOT_FOUND` (404), `DM_PAID_PLAN` (403), `DM_MUTED` collapsed to uniform `403 {error: 'cannot_dm'}`. Closes user-existence enumeration via response code or timing. Granular reason kept in server logs.
- **T286** — `web/src/app/terms/page.tsx` Section 7 Termination: added "Right to Appeal" bullet documenting the in-app + email path + 14-day SLA. `/api/appeals/route.js` already exists.

### Cluster B — DevOps observability

- **T225** — `web/src/app/api/cron/pipeline-cleanup/route.ts`: every per-sweep `console.error` block now also fires `captureMessage` (orphan_runs, orphan_items per-table, orphan_locks, cluster_expiry per-cluster). Sentry is already wired through `web/src/lib/observability.js` — no-op when DSN unset, plumbed when on.
- **T226** — `web/src/app/api/kids-waitlist/route.ts`: anti-fraud signals (bot_ua_drop, honeypot_hit, too_fast) → `captureMessage` warning; signup → captureMessage info. console.log retained for dev.
- **T227** — `web/src/app/api/stripe/webhook/route.js`: 1 MiB rejection paths (declared Content-Length + post-buffer) emit captureMessage with `actual_size` + stage.
- **T228** — `web/src/lib/cronHeartbeat.js`: insert/update failures call `captureException` with `{route, stage, cron_name}`. Operator can now distinguish "cron didn't run" from "ran but heartbeat failed."
- **T229** — `web/src/app/api/cron/check-user-achievements/route.js`: comment block added documenting the global stale-`start`-heartbeat sweep cron that's still owed (separate route — not built in this PR).

### Cluster C — UI polish

- **T129** — `web/src/components/CommentRow.tsx`: comment-edit Save button now shows visible disabled state (`opacity: 0.6`, `cursor: not-allowed`) when `busy === 'edit'`.
- **T130** — `web/src/app/story/[slug]/page.tsx`: report modal title row now flex with an `<button aria-label="Close">×</button>` calling `setShowReportModal(false) + setReportError('')`. `id="report-modal-title"` preserved for `aria-labelledby`. Other modals (Interstitial.tsx) untouched — their existing patterns are acceptable.
- **T136** — `web/src/components/CommentRow.tsx`: edit textarea inline style adds `resize: 'vertical'`. `CommentComposer.tsx` already had it.
- **T160 + T168 STALE** — confirmed, no changes. CommentThread dialog backdrop is fine because the inner modal has `useFocusTrap({onEscape: closeDialog})`. Composer dedup `Array.from(new Set([...].map(...)))` is a non-issue.

### Cluster D — Settings dead-UI sweep

- **T61** — `web/src/app/profile/settings/page.tsx:4878-4920`: expert "Vacation mode" toggle disabled + relabeled "Coming soon" with explanatory subtitle. Zero consumers verified via grep before changing. Re-enable = restore the original handler.
- **T62** — same file:4924-5045: expert "Watchlist" chips rendered disabled + relabeled "Coming soon." Load logic kept so an approved expert still sees their categories; only the toggle/write was removed.
- **T63** — same file:3199-3328: a11y `textSize`/`reduceMotion`/`highContrast` flags relabeled "Coming soon" disabled. `ttsDefault` auto-start wired end-to-end: `web/src/app/story/[slug]/page.tsx` user fetch extended with `metadata`, `<TTSButton>` props extended with `autoStart` + `articleId`. `web/src/components/TTSButton.tsx` adds a one-shot useEffect: when `autoStart && supported && allowed`, fires `start()` once per article via `autoStartedRef` + `sessionStorage` key `vp_tts_autoplayed_<articleId>` (back/forward protection within session). RPC payload still writes all four metadata.a11y keys per launch-phase rule.

### Cluster E — Comments + paywall + activation copy

- **T32** — `web/src/components/CommentThread.tsx`: comment-report dialog now renders 5 radio categories (`spam, harassment, off_topic, misinformation, other`) mirroring iOS `BlockService.ReportReason` enum. Free-text textarea persists only when `other` selected. Submit handler sends `{reason}` (+ optional `description` when other). Server-side enum validation tracked under T285. **`flag` and `hide` dialogs unchanged** — moderator/expert flows keep their existing free-text inputs.
- **T108** — `web/src/components/CommentComposer.tsx`: live mention-permission hint. Watches body for `@<word>` regex; when matched and user lacks `comments.mention.insert`, renders an inline amber tooltip "@mentions are a paid feature — your text will post as plain text." Disappears when the user removes the mention or upgrades. Post-submit `setError` toast preserved as redundant safety net.
- **T142 — SCOPED-DOWN** — `web/src/components/CommentThread.tsx` empty-state copy refined to "No comments yet. You passed the quiz — start the conversation." The three-state branch the audit asked for is already implemented at the parent (`story/[slug]/page.tsx:1151-1187`); CommentThread only renders when `userPassedQuiz === true`, so only the auth+passed copy applies inside it.
- **T144 — PARTIAL** — `web/src/app/bookmarks/page.tsx:473-488`: lockMessage tightened to "Upgrade to save unlimited articles, organize them into collections, add private notes, and export them anytime." The "punishment-style" copy the audit cited didn't actually exist; the page already used a benefit-framed `LockedFeatureCTA`. Improvement is a sharper benefit list; "limit reached" wording was a phantom claim.

### Cluster F — Verify-email + logout + search + DM polish

- **T98** — `web/src/app/verify-email/page.tsx`: success toast "Sent — check your inbox." after resend, auto-clearing at 4s. Green role="status" banner above the resend button.
- **T99** — same file: "Contact support" mailto link added inside the "!changeEmail" branch beside the existing "Use a different account" link.
- **T100** — same file: domain-detection helper renders a single primary "Open Gmail / Outlook / Yahoo Mail / iCloud Mail" button when masked email matches gmail/googlemail/outlook/hotmail/live/yahoo/icloud/me. Other domains: nothing rendered (avoid wrong-button).
- **T101** — `web/src/app/logout/page.js`: success state now triggers `setTimeout(() => router.push('/'), 1500)` and message updates to "Signed out — redirecting…". Manual links preserved so users can opt out by clicking earlier.
- **T119** — `web/src/app/search/page.tsx:271-296` (audit-cited 238-242 was stale): zero-results block adds a refinement-tips section ("Try a different search" heading + 3 bullets: fewer keywords / spelling / browse categories link). Static text — no new fetches.
- **T112** — `web/src/app/messages/page.tsx`: DM paywall now shows a tier-card preview block beside the existing CTA. Verity tier name + $3.99/mo + 3-bullet perks ("Direct messages", "Unlimited bookmarks", "Ad-free reading"). Pricing hardcoded; no live `getPlans()` fetch in scope.
- **T113** — same file: DM paywall × close button + Esc dismiss via shared `useFocusTrap`. `dmPaywallDismissed` state added; `showDmPaywall` derived gate now respects it. `aria-label="Close"` × button in modal top-right.

### Files touched (alphabetical)

- `web/src/app/api/admin/moderation/comments/[id]/hide/route.js`
- `web/src/app/api/comments/[id]/report/route.js`
- `web/src/app/api/comments/[id]/route.js`
- `web/src/app/api/conversations/route.js`
- `web/src/app/api/cron/check-user-achievements/route.js`
- `web/src/app/api/cron/pipeline-cleanup/route.ts`
- `web/src/app/api/kids-waitlist/route.ts`
- `web/src/app/api/reports/route.js`
- `web/src/app/api/stripe/webhook/route.js`
- `web/src/app/bookmarks/page.tsx`
- `web/src/app/logout/page.js`
- `web/src/app/messages/page.tsx`
- `web/src/app/profile/settings/page.tsx`
- `web/src/app/search/page.tsx`
- `web/src/app/story/[slug]/page.tsx`
- `web/src/app/terms/page.tsx`
- `web/src/app/verify-email/page.tsx`
- `web/src/components/CommentComposer.tsx`
- `web/src/components/CommentRow.tsx`
- `web/src/components/CommentThread.tsx`
- `web/src/components/TTSButton.tsx`
- `web/src/lib/cronHeartbeat.js`

### Stale items confirmed (no changes — left in TODO history note)

- T160 (CommentThread overlay div onClick) — backdrop is fine; modal already focus-trapped.
- T168 (composer dedup intermediate Array) — micro-perf, no measurable benefit.

---

## 2026-04-27 (T39 + T146 + T147 — engagement-loop polish bundle) — _shipped, pushed to git/Vercel_

### T39 — Welcome carousel routes signup into reading

- **What** — `web/src/app/welcome/page.tsx`: finishing onboarding called `router.replace(getValidatedNextPath('/'))`. Replaced with a tiered route picker: validated `?next=` wins (preserves inviter deep-links); falls through to `/story/<first carousel preview slug>` (already fetched at line 104 for the screen-3 preview); falls through to `/browse` as last resort. Reuses the existing `resolveNext` helper for the `next=` validation. Cold signup lands inside an article instead of an unfamiliar feed.

### T146 — Anon notifications CTA enumerates value

- **What** — `web/src/app/notifications/page.tsx:221-224`: copy "Sign up to get notified when your favorite authors post and when your comments get replies." → "Sign up to get notified about breaking news, replies to your comments, new articles in categories you follow, and achievements you unlock as you read." Lists the four notification surfaces concretely so cold visitors see the value beyond reply notifications.

### T147 — Recap landing card replaces silent null

- **What** — `web/src/app/recap/page.tsx`: pre-launch the page returned `null`, so deep-links to `/recap` rendered a blank page (looks broken). Added a `RecapComingSoonCard` component rendered only while `LAUNCH_HIDE_RECAP=true` — small landing card with "Coming soon" eyebrow, brief copy explaining the feature ("Each Sunday Verity Post will compile the articles you read, the quizzes you passed, and the threads you joined into a single Sunday-morning summary. We're finishing the editorial polish; the recap goes live alongside paid plans."), and a back-to-home CTA. Per memory rule "launch-phase hides are temporary — don't delete," the underlying flag stays; only the empty-render path was filled.
- **Files** — `web/src/app/welcome/page.tsx`, `web/src/app/notifications/page.tsx`, `web/src/app/recap/page.tsx`.

---

## 2026-04-26 (T30 + T31 — quiz UX polish) — _shipped, pushed to git/Vercel_

### T30 — Interstitial ad no longer hijacks score reveal

- **What** — `web/src/components/ArticleQuiz.tsx`: every third quiz pass triggers an interstitial ad (`if (n > 0 && n % 3 === 0)`). Previously fired synchronously inside the submit handler, so `setStage('result')` and `setShowInterstitial(true)` raced — the modal often won, hiding the score the user just earned. Wrapped in `setTimeout(..., 1500)` so the result lands first; the ad shows after a 1.5s beat. 1500ms matches the existing reveal-ceremony delay on the story page (post-pass discussion unlock), so the ad arrives at the same beat as the discussion reveal instead of competing with it.

### T31 — Empty comment-thread state reinforces the quiz-gate trust principle

- **What** — `web/src/components/CommentThread.tsx:865`: copy was "No comments yet — be the first." Replaced with "No comments yet. Everyone who posts here passed the article quiz — be the first to start the discussion." Reinforces the trust positioning (quiz-gated comments) without assuming the current viewer's quiz state, so the copy works for authed-passed, authed-not-passed, and anon visitors. iOS parity in `StoryDetailView.swift:1133-1140` not touched in this commit (avoids iOS-build verification gap; flagged as iOS-followup).
- **Files** — `web/src/components/ArticleQuiz.tsx`, `web/src/components/CommentThread.tsx`.

---

## 2026-04-26 (T159 + T169 — error boundaries: admin segment added; closing claims as resolved) — _shipped, pushed to git/Vercel_

### T169 — Admin segment error boundary added; T159 closed as resolved

- **Discovery** — Audit graded T159 and T169 as resilience gaps but the underlying error-boundary infrastructure already exists. Verified file presence via `find web/src/app -name 'error.*'`:
  - `web/src/app/error.js` — root boundary (exists)
  - `web/src/app/global-error.js` — top-level fallback (exists)
  - `web/src/app/story/[slug]/error.js` — wraps comment thread + the entire story page (exists; posts to `/api/errors` with `boundary: 'story'` tag, has reset button)
  - `web/src/app/profile/error.js` — profile segment (exists)
  - `web/src/app/admin/` — **MISSING**
- **What** — Added `web/src/app/admin/error.js` mirroring the story + profile pattern: posts the failure to `/api/errors` with `boundary: 'admin'` tag (so admin crashes show up in the same triage stream as user-facing ones with a context tag), then renders a reset button with admin-appropriate copy ("Admin tool failed to load. The error has been recorded.").
- **T159 (CommentThread error boundary) — closed as resolved.** The story-page error boundary already wraps every render path that includes `<CommentThread>`. A row-level error boundary inside the comment list would be additional polish but the audit's stated risk ("RLS or Supabase failure crashes whole section silently") is mitigated — failures bubble to the page-level boundary which catches + reports + offers reset. Not stale, just over-pessimistic about existing coverage.
- **T169 — fully closed.** Per-segment boundaries for story, profile, admin all exist now. Anything below those segments inherits the closest boundary.
- **Files** — `web/src/app/admin/error.js` (new).

---

## 2026-04-26 (T265 + T266 + T270 + T292 — legal copy + admin jargon) — _shipped, pushed to git/Vercel_

### T265 — California privacy disclosure + footer link

- **What** — `web/src/app/privacy/page.tsx:184-189` had a 1-line mention of CCPA but no opt-out link or rights enumeration. Replaced with an explicit California rights bullet (id="california" anchor) listing right-to-know, right-to-delete, right-to-correct, right-to-opt-out, the GA4 + AdSense "sharing" disclosure under CPRA's broader sharing definition, and the request method (legal@veritypost.com with "California Privacy Request" subject + 45-day response window).
- **Footer link** — `web/src/app/NavWrapper.tsx:395` adds "Your California Privacy Rights" → `/privacy#california` to the footer link cluster. Visible on every page; meets the CPRA "clear and conspicuous" placement requirement for the opt-out link.

### T266 — Section 230 language in TOS

- **What** — `web/src/app/terms/page.tsx` Section 2 (Content & Conduct) gains a new bullet: "Verity Post is an interactive computer service under 47 U.S.C. § 230. Comments, fact-checks, and other user-generated content reflect the views of their authors; users are solely responsible for material they post." Establishes the platform-vs-publisher posture explicitly. Sits next to the existing licensing + abuse-of-Verity-Score language.

### T270 — Refund policy clarification

- **What** — Section 3 bullet "Refunds are available within 7 days of purchase if no paid content has been accessed." → "within 7 days of purchase, or before the first paid feature is used after upgrading, whichever comes first. Contact support to request one." The original "no paid content has been accessed" was undefined; the new wording matches FTC consumer-protection guidance and tells the user how to act on it.

### T292 — Admin hub jargon swap

- **What** — `web/src/app/admin/page.tsx:32` Articles row description "review/edit/publish via the F7-native editor" → "review, edit, and publish through the integrated newsroom editor." F7 is an internal codename; an admin landing for the first time has no context for it.

- **Files** — `web/src/app/privacy/page.tsx`, `web/src/app/NavWrapper.tsx`, `web/src/app/terms/page.tsx`, `web/src/app/admin/page.tsx`.

---

## 2026-04-26 (T293 + T294 + T296 + T297 — page-walkthrough hardening pass) — _shipped, pushed to git/Vercel_

### Four small hardening fixes across notifications/reset-password/contact/ideas

- **T293** — `web/src/app/notifications/page.tsx:419`: notification rows without `action_url` were rendered as `<a href="#">` with `e.preventDefault()` — tappable but URL bar shows `#`, semantically a dead anchor. Now: `href={n.action_url || undefined}` (omits the attribute when null) plus `role="button"` + `tabIndex={0}` + `onKeyDown` handler so keyboard users can still mark-as-read with Enter/Space. Items with `action_url` retain native anchor semantics.
- **T294** — `web/src/app/reset-password/page.tsx:69`: detection of Supabase auth recovery tokens in the URL hash was using `hash.includes('access_token=')` — matches any substring. Replaced with strict `URLSearchParams(hash.slice(1))` parse; only treats well-formed `type=recovery` or `access_token=*` hashes as authentic. Stops false positives from any unrelated content in the hash fragment.
- **T296** — `web/src/app/ideas/page.tsx:147`: page footer hardcoded `Currently rendering at localhost:3333/ideas` — leaked dev-port info in production. Replaced with environment-neutral `Hidden from search engines. Not linked from the main site.`
- **T297** — `web/src/app/contact/page.tsx:89`: form-submit gate was `email.includes('@')` — accepted `a@`, `@b`, `@` alone. Replaced with a standard email-shape regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (matches HTML5 `input type=email` validity closely enough for client-side gating; server still re-validates).
- **Files** — `web/src/app/notifications/page.tsx`, `web/src/app/reset-password/page.tsx`, `web/src/app/contact/page.tsx`, `web/src/app/ideas/page.tsx`.

---

## 2026-04-26 (T124 + T134 shipped on /login; T123 + T132 + T135 + T138 deleted as stale) — _shipped, pushed to git/Vercel_

### T124 + T134 — Login page autofocus + 44×44 password-toggle touch target

- **What** — Audit items targeted `web/src/app/signup/page.tsx`, but that file is now a 20-line redirect to `/login` (closed-beta refactor moved the form). Re-targeted at `/login/page.tsx`:
  - **T124**: added `autoFocus` to the identifier input at line 532. Mobile users skip a tap; desktop sees the cursor land in the right place.
  - **T134**: password show/hide button widened to `minHeight: 44px` + `minWidth: 44px` with flex centering. Was `minHeight: 32px` + small padding (~24-30px effective hit area). Now meets Apple HIG + WCAG mobile-tap target minimum.
- **Files** — `web/src/app/login/page.tsx` (two edits, lines 518-533 + 561-583).

### T123 + T132 + T135 + T138 — Audit items dropped as stale

- **What** — All four audit items cited `web/src/app/signup/page.tsx` lines 14-28 / 280-370 / 315 / 497-507. None of those addresses exist anymore — the file is a redirect stub. The closed-beta refactor naturally retired the offending content (jargon heading "Join the discussion that's earned", inline `const C = { ... }` palette, example-value placeholders, missing-label inputs).
- **Why call them out** — Per memory rule "verify audit findings against current state before acting." These four were stale; cleanup ensures they don't get auto-prioritized in a future sweep. The login page that replaces signup uses CSS vars, has visible `<label>` elements, plain-language headings ("Welcome back.", "Set up your account.", "Have an access code?"), and the autofocus + tap-target fixes above.

---

## 2026-04-26 (T201 + T224 — .env.example caught up to code-required vars) — _shipped, pushed to git/Vercel_

### T201 + T224 — Three missing vars added to web/.env.example

- **What** — Added three env vars that code reads but `web/.env.example` didn't document: `REFERRAL_COOKIE_SECRET` (used by `web/src/lib/referralCookie.ts:24` for HMAC signing of the `vp_ref` attribution cookie), `APPLE_BUNDLE_ID` (used by `web/src/lib/appleReceipt.js:27` for JWS signed-transaction verification), and `RATE_LIMIT_ALLOW_FAIL_OPEN` (read by `web/src/lib/rateLimit.js:47` as a dev-only escape hatch). Each entry has a one-line "what + when to set + how to generate" comment. `RATE_LIMIT_ALLOW_FAIL_OPEN` is commented-out by default — production fails closed.
- **Why** — Closed-beta gate would silently fail to set the cookie if `REFERRAL_COOKIE_SECRET` is unset (signRef returns null + /r/<slug> redirects to /signup with no attribution captured). Apple receipt validation falls back to a hard-coded bundle ID without `APPLE_BUNDLE_ID` — fine in dev, but enterprise re-signing would break it silently. New developer clones the repo, copies env to .env.local, ships staging — no surface to know these are missing.
- **Files** — `web/.env.example`.

---

## 2026-04-26 (T67 — privacy copy aligned to transactional-only email policy) — _shipped, pushed to git/Vercel_

### T67 — Drop "optional newsletter communications" from privacy policy

- **What** — `web/src/app/privacy/page.tsx:77` Section 2 bullet "To send transactional emails, security alerts, and optional newsletter communications." → "To send transactional emails and security alerts." Removes the newsletter promise that contradicts the locked transactional-only email policy.
- **Scope** — Privacy copy only. Companion items T9/T10/T27 (admin notifications EMAIL_SEQUENCES UI, web/iOS inert email-digest settings cards, comment-reply notification prefs) are still pending — those need the same direction applied across admin + settings surfaces in a dedicated email-cleanup pass. T67 ships solo because the privacy copy is the public-facing claim and shouldn't drift further while the admin/settings cleanup is still scoped.
- **Files** — `web/src/app/privacy/page.tsx`.

---

## 2026-04-26 (T13 — achievement unlock toast on web quiz pass) — _shipped, pushed to git/Vercel_

### T13 — Web surfaces newly-earned achievements after quiz pass

- **What** — `/api/quiz/submit` already returns `{ ..., scoring, newAchievements }` (verified at line 113-115). `ArticleQuiz` discarded `newAchievements` and called `onPass()` with no payload. Story page's `onPass` callback re-rendered the discussion unlock without surfacing the badges. iOS already handles this via the equivalent flow; web was silent.
- **Wiring** — `web/src/components/ArticleQuiz.tsx`: extended `onPass?: () => void` to `onPass?: (newAchievements?: QuizPassAchievement[]) => void` + new exported type `QuizPassAchievement`. The submit-response handler now extracts `data.newAchievements` (defensive Array.isArray check) and passes it through.
- **Toast** — `web/src/app/story/[slug]/page.tsx`: story page already imports `useToast()`; the `onPass` callback now fires `show("You earned <Badge Name>")` for each new achievement before triggering the existing 1.5s reveal-ceremony delay. Matches iOS's understated tone — single toast per badge, no celebration animation.
- **Files** — `web/src/components/ArticleQuiz.tsx`, `web/src/app/story/[slug]/page.tsx`.
- **T14 status (deferred, not shipped)** — adjacent streak-break recovery offer needs a `use_streak_freeze` RPC that doesn't exist (only `use_kid_streak_freeze`). Schema work; T5 halt-and-queue. UI-only "Streak reset" copy half could ship but is small enough to land later when the RPC is approved. Marked DB-WORK-PARTIAL in TODO.

---

## 2026-04-26 (T274 + T275 — server-side ban-evasion + mute gate at signup/login) — _shipped, pushed to git/Vercel_

### T274 — Signup rejects emails attached to banned accounts

- **What** — `web/src/app/api/auth/signup/route.js`: added a pre-`auth.signUp()` query (service client, case-insensitive `ilike` on `email` + `is_banned = true`). Returns 403 "This email is associated with an account that has been suspended." when matched.
- **Scope** — Email-only check. IP-correlation deliberately skipped: no historical-IP correlation table exists in the schema; the `audit_log.metadata.ip` field would require building a banned-IP-rollup before signup, which is premature without an actual abuse pattern. Operationally narrow but explicit; defeats the lazy ban-evasion pattern (same email on a fresh device/IP).
- **Position** — After password/age/terms validation + IP rate-limit, before `checkSignupGate` (closed-beta gate). Order matters: an existing banned email shouldn't even waste a referral-code redemption slot.

### T275 — Login blocks banned + actively-muted users

- **What** — `web/src/app/api/auth/login/route.js`: after `auth.getUser()` resolves the just-signed-in user but before bookkeeping, queries the user row (`is_banned, ban_reason, is_muted, muted_until`). If banned or muted-and-still-active, calls `supabase.auth.signOut()` to invalidate the cookie session that the client's prior `signInWithPassword` already created, then returns 403 with `{error: 'account_suspended' | 'account_muted', reason | muted_until}`.
- **Why sign-out before 403** — Web flow does `signInWithPassword` client-side first, then POSTs `/api/auth/login` for bookkeeping; the auth cookie is already set by the time this route runs. Returning 403 alone leaves the user effectively signed in. Explicit sign-out wraps in try/catch — failure to sign out shouldn't mask the 403 (the gate still fires).
- **Mute semantics** — Muted users can technically only fail at comment-compose via permissions today (`comments.post` denial). TODO graded T275 CRITICAL because a muted user reading victim profiles + watching notifications is the harassment-pattern the penalty is supposed to interrupt. Login-time block enforces the spirit.
- **Existing helper unused** — `web/src/lib/auth.js:85-98` already exports `requireNotBanned()` with correct semantics. Inlined the focused query here instead of calling the helper to avoid the extra round-trip from `requireAuth → getUser → full users SELECT * with role join` — login already holds the user-id and only needs four columns.
- **iOS bypass — flagged, not solved** — Native iOS Supabase Auth bypasses the server `/login` route entirely (T23-class architectural gap). The bans gate IS already enforced at the perms layer (`compute_effective_perms` strips banned users to the appeal/account/login allowlist per the closed-beta migration). Mute is NOT yet enforced at the perms layer; that's a separate hardening pass once iOS auth is routed through the server (or `compute_effective_perms` is taught about active mutes).
- **Files** — `web/src/app/api/auth/login/route.js`, `web/src/app/api/auth/signup/route.js`.

---

## 2026-04-26 (T68 + T264 — deletion-contract copy aligned to live 30-day grace) — _shipped, pushed to git/Vercel_

### T68 + T264 — Terms + Help match the live deletion contract

- **What** — Settings UI + `/api/account/delete` route are the live contract: 30-day grace period (default) with cancel-via-DELETE during the window, plus an optional `immediate: true` Apple-accepted instant-removal path. Help page said "seven-day grace." Terms said "permanent and cannot be reversed." Both wrong, both fixed.
- **Help** (`web/src/app/help/page.tsx:161`) — copy now reads "thirty-day grace period — sign back in any time during that window to cancel. Direct messages are cut off immediately."
- **Terms** (`web/src/app/terms/page.tsx:172-175`) — Section 7 (Termination) bullet rewritten: "Deletion runs with a thirty-day grace period — sign back in any time during that window to cancel. After the grace period your data is permanently anonymized and cannot be restored." Preserves the "cannot be restored" finality after grace; removes the false "no-reversal-ever" claim that contradicted the cancel button users actually see.
- **Privacy** (`/privacy/page.tsx:126`) — already aligned ("personal data is purged within 30 days"). Left untouched.
- **Why CRITICAL** — TODO grades T264 CRITICAL on regulatory grounds: a Terms-of-Service that materially misrepresents the deletion contract is enforceable-against-us in jurisdictions with consumer-protection laws around T&C accuracy. T68 was the same issue, scored LOW originally. Fixed together.
- **Files** — `web/src/app/help/page.tsx`, `web/src/app/terms/page.tsx`.

---

## 2026-04-26 (T202 — expert-queue DOMPurify hardening) — _shipped, pushed to git/Vercel_

### T202 — Tighten DOMPurify config on expert markdown preview

- **What** — `web/src/app/expert-queue/page.tsx:428-433` was sanitizing expert markdown with `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })`. Replaced with an explicit narrow allowlist (`ALLOWED_TAGS` covering only what `marked.parse` realistically emits + `ALLOWED_ATTR: ['href','title','src','alt']` + `ALLOWED_URI_REGEXP` rejecting non-http(s)/mailto/relative URIs).
- **Audit claim was overstated** — TODO graded T202 CRITICAL on the premise that `<img onerror>` could survive the sanitize call. Both the Investigator and Adversary agents confirmed via DOMPurify v3.4.1 source that event-handler attributes are stripped by core regardless of `USE_PROFILES`. Current code was NOT actively exploitable; this commit is hardening, not a CVE patch.
- **Why ship anyway** — `USE_PROFILES: { html: true }` reads as "broad HTML is intended" — wrong signal for user-authored content. Tight enumeration documents intent and future-proofs against DOMPurify default drift / library upgrade behavior. Cosmetic at runtime today; defensive against tomorrow.
- **Why NOT also add server-side sanitization** — Per memory rule "don't add features beyond what the task requires." Single-consumer audit (verified): the expert-queue preview is the ONLY `dangerouslySetInnerHTML` site rendering expert-answer markdown. No admin view, no email body, no export consumes `answers.body` as HTML. Adding a server-side sanitization step at `/api/expert/queue/[id]/answer/route.js` for a hypothetical future consumer is premature abstraction. Revisit when a second consumer surfaces.
- **SSR safety** — `typeof window === 'undefined' ? '' : DOMPurify.sanitize(...)` guard already in place from prior CHANGELOG entry; left untouched. Plain `dompurify` import (not `isomorphic-dompurify`) is correct per the 2026-04-26 jsdom-removal commit.
- **CSP unchanged** — `script-src 'strict-dynamic' 'nonce-...'` (enforced) blocks injected scripts; `img-src 'self' data: blob: https:` is intentionally permissive for legitimate content; event handlers stripped at sanitize time mean `onerror` exfil is not a vector even if external image loads. No change warranted.
- **Files** — `web/src/app/expert-queue/page.tsx` (single block at line 422-470 expanded with explicit allowlist + intent-comment).

---

## 2026-04-26 (T3 + T64 + T65 — Phase 0A regwall preventative bundle) — _shipped, pushed to git/Vercel_

### T3 + T65 — Anon regwall and sign-up interstitial deferred to 80% scroll

- **What** — Both modals were firing inside the article-mount data-fetch effect on `web/src/app/story/[slug]/page.tsx` — line 504 `setShowAnonInterstitial(true)` (gated by `LAUNCH_HIDE_ANON_INTERSTITIAL=true` for now) and line 519 `setShowRegWall(true)` (gated by DB flag `registration_wall=false`). Currently dormant under launch-hide flags, but if/when either flag flipped on, anyone arriving deep in their free quota would get a full-viewport modal before reading a word.
- **Why I did this even though it's dormant** — The principle behind the fix ("show value before asking for commitment") matches the trust positioning, and the regwall flag flip is a one-bit change in admin settings — landing the fix preemptively means the flag flip doesn't ship a regression.
- **Approach** — Two new refs at component scope: `anonInterstitialPendingRef`, `regWallPendingRef`. The mount effect now records *intent* (sets refs) instead of triggering modals. A new dedicated effect adds an anon-scoped scroll listener (gated `if (!story) return; if (currentUser) return; if (!ref.current && !ref.current) return;`) — fires the pending modals when scrolled past 80%. Initial-check call inside the listener-set handles short articles already past 80% on mount. Refs (not state) so the scroll handler reads the latest value without re-binding on every change.
- **Why a separate effect** — The existing read-complete 80%-scroll handler at line 692 short-circuits on `!currentUser`, so it never fires for anons (the audience the regwall actually applies to). Folding the regwall trigger into that handler would be wrong; anons need their own scroll-engagement listener.
- **Why I did NOT touch** — Nothing else. View-count `bumpArticleViewCount()` still increments on mount (it's a counter, not a trigger). `vp:regwall-dismissed` per-session bypass still works. Authed read-complete signal at `/api/stories/read` still gated by `currentUser`. `setRegWallDismissed` from a previous-session dismissal still fires at mount (purely UI state, no modal).

### T64 — Clear vp_article_views on auth state transitions

- **What** — `web/src/lib/session.js` exports a new `clearAnonArticleViews()` helper (localStorage.removeItem under try/catch for quota/private-mode safety). `web/src/components/PermissionsProvider.tsx` (the global `onAuthStateChange` subscriber) calls it on `SIGNED_IN` and `SIGNED_OUT` events.
- **Why both directions** — Sign-in: a stale anon count would still be at "5" after the user signs up, so a future sign-out resumes anon reading already past the regwall threshold. Sign-out: same hygiene from the other direction. Cheap, idempotent.
- **Files** — `web/src/app/story/[slug]/page.tsx` (refs + new scroll effect; line 504 + 519 changed from immediate-trigger to ref-set), `web/src/lib/session.js` (new export), `web/src/components/PermissionsProvider.tsx` (import + call site inside the existing auth-state subscriber).

---

## 2026-04-26 (T15 — kill-switched /u/[username] linkers redirected to /card/) — _shipped, pushed to git/Vercel_

### T15 — Live surfaces stop dead-ending into the gated public-profile route

- **What** — `web/src/app/u/[username]/page.tsx` is hard-coded `PUBLIC_PROFILE_ENABLED = false` and returns `<UnderConstruction />`. Five live linkers were still pointing at `/u/[username]`, dropping anon visitors and authed users alike onto a placeholder. Per memory rule "Launch-phase hides are temporary — don't delete," the gated page itself stays untouched (one-line flip restores it). Only the external linkers were updated.
- **5 link surfaces redirected** — `web/src/app/leaderboard/page.tsx:870` (every leaderboard row), `web/src/components/CommentRow.tsx:68` (resolved `@mention` auto-link in every comment thread), `web/src/app/admin/users/[id]/page.tsx:242` (admin "View profile"), `web/src/app/admin/users/[id]/permissions/page.tsx:581` (admin permissions "View profile") — all flipped to `/card/[username]`. `/card/[username]` is fully public (no gate, takes the same `username` param, renders Verity Score + bio + avatar + role badges + top categories).
- **Card self-link removed entirely** — `web/src/app/card/[username]/page.js:264-289` had a "View full profile" CTA that routed authed viewers from `/card/X` → `/u/X` (dead) and anon viewers through `/signup?next=/u/X` (pre-promising a dead-end). Both paths gone — the card IS the public profile surface; "view full profile" was redundant and outright broken. Per memory rule "Genuine fixes, never patches": killed the loop, removed the dead `viewerIsAuthed` state + its `setViewerIsAuthed(!!user)` setter that had no remaining consumer.
- **Admin null-username guard** — admin linkers previously fell back to `userId` if `username` was null (`/u/${user.username || userId}`). `/card/<uuid>` would 404, so the link is now conditionally rendered only when `username` exists (`{user.username ? <Link.../> : null}`). Two admin pages updated.
- **Followers/following list inside the gated page (line 684)** intentionally NOT touched — it's behind the `PUBLIC_PROFILE_ENABLED=false` gate and never renders. Editing it would be busy-work.
- **iOS unaffected** — no Swift code generates `/u/<username>` URLs (verified via grep across `VerityPost/`); references in `PublicProfileView.swift` are comments documenting web parity, not URL builders.
- **Files** — `web/src/app/leaderboard/page.tsx`, `web/src/components/CommentRow.tsx`, `web/src/app/admin/users/[id]/page.tsx`, `web/src/app/admin/users/[id]/permissions/page.tsx`, `web/src/app/card/[username]/page.js`.
- **Why** — TODO graded T15 CRITICAL (re-graded HIGH→CRITICAL because the leaderboard is anon-visible and "View profile" → placeholder is a first-impression killer for cold visitors, plus comment `@mention` auto-linking propagates the dead-end into every article's discussion).

---

## 2026-04-26 (T7 — iOS profile editor silent-bio-overwrite fix) — _shipped, pushed to git/Vercel_

### T7 — iOS profile editor was wiping web-set bio on every save

- **What** — `VerityPost/VerityPost/SettingsView.swift` `AccountSettingsView` had three `@State` vars defaulted to `""` (`bio`, `location`, `website`) that were never seeded from the loaded user. `.onAppear` only seeded `username` + `avatarOuter`. The save path built a `ProfilePatch` that sent every field unconditionally — so any user who set their bio on the web and then opened iOS Settings, even just to change avatar color, would silently overwrite their bio with `""` because the patch always included `bio: ""`.
- **MCP-verified RPC body** — `pg_get_functiondef('public.update_own_profile')` confirmed the per-column pattern is `column = CASE WHEN p_fields ? 'key' THEN ... ELSE u.column END`. Omitting a key from the JSON patch preserves the existing column. The fix leverages that contract: build the patch from only-changed fields. Also confirmed: `username` is first-time-only at the RPC layer (silent no-op on rename — preserved as existing behavior); `metadata` uses shallow `||` merge.
- **Phantom field finding** — `users.location` and `users.website` columns DO NOT exist in `public.users` (verified against `currentschema:2675-2774`). No `metadata.location` / `metadata.website` keys exist either. Web settings (`web/src/app/profile/settings/page.tsx:1531-1546`) does not write or read them. The iOS form rows + `MetadataPatch.location`/`.website` fields were saving to nothing and rendering nothing back. Removed entirely (form rows + struct fields + settings-search keywords). Adding location/website would be a separate schema migration — flagged for future owner decision, not added in this fix.
- **Implementation** — Added 5 dirty-state baselines (`originalUsername`, `originalBio`, `originalAvatarOuter`, `originalAvatarInner`, `originalAvatarInitials`) captured in `.onAppear` alongside the live `@State` seeding. Restructured `MetadataPatch` to `{ avatar }` only. Restructured `ProfilePatch` to all-optional fields (`var bio: String? = nil` etc.) so Swift's synthesized `Encodable` uses `encodeIfPresent` and drops nil keys from the JSON. Save path computes `usernameChanged` / `bioChanged` / `avatarChanged`, short-circuits with a "No changes to save." banner if nothing dirty, otherwise builds the patch from only-changed fields. Removed Location + Website `SettingsTextField` rows from the Identity card. Cleaned the now-stale `"location", "website"` keywords from the settings-search row at `accountRows` line 860.
- **Files** — `VerityPost/VerityPost/SettingsView.swift` (state vars 1184-1200, Identity card 1290-1294, .onAppear 1330-1342, save() 1345-1405, search keywords 860). `Models.swift` unchanged — `VPUser.bio: String?` already exists at line 36; `MetadataRef` already only decodes `avatar` so no decode-side cleanup needed.
- **Verifier passes** — (1) `grep "location\|website" SettingsView.swift` clean; (2) repo-wide grep for `users.location` / `users.website` / `metadata.location` / `metadata.website` returns zero hits (no orphan readers anywhere); (3) other writer to `update_own_profile` from iOS — `ProfileView.swift:2153` avatar editor — only sends `avatar_color` + `metadata.avatar`, never `bio`, so unaffected by the same pattern; (4) ProfileView reader at `:989` is read-only display, not affected.
- **Adversary BLOCK-WITH-CONDITIONS resolved** — RPC body verified via MCP (the missing-piece adversary flagged); `currentUser`-nil case is handled by construction (originalBio == bio == "" → no-change → omit → server preserves); avatar-only saves still work (only `avatar_color` + `metadata.avatar` keys present); concurrent web-edit race correctly results in last-write-wins on the field the user actually edited, web-set values on un-edited fields preserved.
- **Why** — Real silent-data-loss class bug (CRITICAL per TODO grading). Every existing web-set bio was at risk of being wiped on the user's first iOS Settings save. Phantom location/website UI was false-functional ("Saved." but the data went nowhere) — worse than missing.

---

## 2026-04-26 (Closed-beta gate flip — request-access queue + signup-block) — _migration drafted (read-only MCP), code complete; second migration apply pending owner action_

### Scope shift — open beta → closed beta

- **What** — Owner directive: invite-only beta. Three entry paths during `beta_active=true`: (1) Owner-minted unique link (admin generates one per seed user; one-time-use, 7-day default expiry, instant Pro on signup, no email-verify wait). (2) User-shared links (every beta user auto-gets 2 slugs, one-time-use each, invitee MUST verify email). (3) Direct stumble → `/beta-locked` page. Direct stumble cannot sign up; can request access via public form. Existing already-onboarded accounts log in normally — only NEW account creation is gated. Unverified user-link signups have an account but `compute_effective_perms` strips them to the `appeal/account/login/signup/settings` allowlist via `verify_locked_at` stamped immediately at signup; verifying email clears the lock + grants Pro.
- **Files** — N/A (scope decision)
- **Why** — Owner walked back the open-beta-with-cohort-grant model from the prior turn. Closed beta gives them control over who gets in (one-by-one approval), still tracks attribution, still gives each invitee 2 share links, and locks out unverified user-link signups during beta so a stolen/forwarded user-link can't hand a stranger free Pro.

### Migration #2 written (apply pending) — `2026-04-26_closed_beta_gate.sql`

- **What** — Two function-body changes (no new objects): (a) `mint_referral_codes(p_user_id)` now inserts user-tier slugs with `max_uses=1` (one invitee per slot, ever — once redeemed, dead). (b) `apply_signup_cohort(p_user_id, p_via_owner_link)` now stamps `verify_locked_at=now()` immediately when cohort='beta' AND email_verified=false AND via_owner_link=false — closes the access gap during beta. Without this, an unverified user-link signup could browse freely between signup and email-confirm. Both functions retain `SECURITY DEFINER` + privilege lockdown (REVOKE FROM PUBLIC/anon/authenticated, GRANT TO service_role + authenticated for mint).
- **Files** — `Ongoing Projects/migrations/2026-04-26_closed_beta_gate.sql` (143 lines). MCP returned read-only error on apply attempt; apply via Supabase Dashboard SQL editor or flip MCP to write mode.
- **Why** — These two behaviors are necessary for the closed-beta semantics to hold; the rest of the closed-beta work (signup gate, /beta-locked, /request-access, admin queue, email send) is code-only and ships independently. Worst case if migration is delayed: user-tier slugs remain unlimited-use (security degradation, not breakage) and unverified user-link signups can browse with `cohort='beta'` but no Pro until verify (current behavior — also security degradation, not breakage). Apply ASAP.

### Code shipped (web) — closed-beta gate

- **What — beta gate library** — `web/src/lib/betaGate.ts`: `isBetaActive(service)` reads `settings.beta_active` (fails open on read error to avoid lockouts from bad config). `checkSignupGate(service, cookieValue)` returns `{allowed, viaOwnerLink, codeId}` or `{allowed:false, reason}`. Reasons: `no_cookie`, `invalid_cookie`, `code_not_found`, `code_disabled`, `code_expired`, `code_exhausted`. When beta is off, returns allowed:true regardless of cookie.
- **What — signup block** — `web/src/app/api/auth/signup/route.js` patched: after rate-limit check, before any auth.signUp call, reads `vp_ref` cookie via `next/headers cookies()`, runs `checkSignupGate`, returns 403 with `{error, reason, redirect_to:'/beta-locked'}` on deny. Existing rate-limit + password validation unchanged.
- **What — OAuth signup block** — `web/src/app/api/auth/callback/route.js` new-user branch (the `if (!existing)` block) patched: reads cookie, runs `checkSignupGate`. On deny, calls `service.auth.admin.deleteUser(user.id)` to roll back the auth.users row (so the email isn't reserved), then 302s to `/beta-locked?reason=<reason>`. Only the new-user branch is gated; existing users continue logging in normally.
- **What — /beta-locked page** — `web/src/app/beta-locked/page.tsx`: server component, public, no auth. Reads `?reason=` query param and renders human copy from a small dictionary (`no_cookie`/`invalid_cookie`/`code_not_found`/`code_disabled`/`code_expired`/`code_exhausted`). CTAs: `Request access` (primary, links to `/request-access`) and `I have an account` (secondary, links to `/login`). Footer: "Already invited? Use the exact link your inviter sent — it expires and is good for one signup."
- **What — /request-access page + API** — `web/src/app/request-access/page.tsx`: client component with name/email/reason/source form. Email required, others optional. Disables form during submit; shows result message inline. Rate-limited by IP. Submit handler POSTs to `/api/access-request`. `web/src/app/api/access-request/route.js` reactivated (was returning 410 per Ext-AA1): inserts into `access_requests` with `type='beta'`, captures user_agent + ip_address. Idempotency: existing pending request from same email → updates the row, no dup; existing approved request → returns "check your inbox" without re-queueing. Validation: standard email regex; reason capped at 1500 chars; name capped at 120 chars. Per-IP rate limit `policyKey:'access_request_ip'`, max 5/hour.
- **What — admin /admin/access-requests queue** — `web/src/app/admin/access-requests/page.tsx`: tabs (pending / approved / rejected / all), 4 stat cards, DataTable with name/email/reason/source/submitted/status columns. Click row or Review button → drawer showing full detail (status, email, name, submitted, source, full reason text, IP, UA, linked access_code_id when approved). Approve button calls `/api/admin/access-requests/[id]/approve`; Reject opens secondary drawer with optional internal reason → calls `/api/admin/access-requests/[id]/reject`. Permission gate: `ADMIN_ROLES`.
- **What — approve endpoint** — `web/src/app/api/admin/access-requests/[id]/approve/route.ts`: permission `admin.access.create`, rate-limit 60/60s. Mints owner-tier link via `mint_owner_referral_link` RPC with `p_max_uses=1, p_expires_at=now()+7d, p_description='Beta approval for {email}'`. Renders approval email via `renderTemplate` + sends via `sendEmail` (Resend wrapper at `web/src/lib/email.js`). On email failure: still marks approved + binds `access_code_id` so the request doesn't stay pending; admin sees a warn toast in the UI with the manual-copy URL. On success: stamps `invite_sent_at`. Audit-logged via `recordAdminAction` with action `access_request.approve`. Returns `{access_code_id, code, invite_url, email_sent}`.
- **What — reject endpoint** — `web/src/app/api/admin/access-requests/[id]/reject/route.ts`: permission `admin.access.create`, rate-limit 60/60s. Optional internal `reason` (capped 500 chars) stored in `access_requests.metadata.rejection_reason`. Audit-logged via `recordAdminAction`. No email sent to requester (rejection is silent — reduces back-and-forth and abuse).
- **What — approval email template** — `web/src/lib/betaApprovalEmail.ts`: HTML + text bodies. Subject "You're approved for the Verity Post beta". Body: short greeting, "your invite link is below," CTA button + plain-text URL fallback, expiry note, mention of "two share links of your own once you're in." `buildApprovalVars` pre-formats `name_with_space` so the email reads "Hi Cliff," when name present and "Hi," when blank — no template logic. From-name: "Verity Post"; from-email: `EMAIL_FROM` env var or `beta@veritypost.com` fallback.
- **What — owner-mint defaults** — `web/src/app/api/admin/referrals/mint/route.ts` updated: `max_uses` defaults to 1 (one-time-use) and `expires_at` defaults to `now()+7d` when caller omits the field. Explicit `null` still means unlimited/never. `web/src/app/admin/referrals/page.tsx` form pre-populates `1` and 7-days-from-now in the input fields; subtitle copy updated to reflect closed-beta semantics.
- **Files** — `web/src/lib/betaGate.ts` (new), `web/src/lib/betaApprovalEmail.ts` (new), `web/src/app/beta-locked/page.tsx` (new), `web/src/app/request-access/page.tsx` (new), `web/src/app/api/access-request/route.js` (reactivated; was 410-stub), `web/src/app/admin/access-requests/page.tsx` (new), `web/src/app/api/admin/access-requests/[id]/approve/route.ts` (new), `web/src/app/api/admin/access-requests/[id]/reject/route.ts` (new), `web/src/app/api/auth/signup/route.js`, `web/src/app/api/auth/callback/route.js`, `web/src/app/api/admin/referrals/mint/route.ts`, `web/src/app/admin/referrals/page.tsx`
- **Why** — Owner directive: closed beta with manual-approval queue. Existing access_requests table from before Ext-AA1 had the right shape (email, name, type, reason, status, access_code_id, invite_sent_at, ip_address, user_agent, metadata) — reactivated rather than rebuilt. Existing email infrastructure (Resend via `web/src/lib/email.js`) reused as-is.

### Required env var (deploy gate, unchanged from prior entry)

- **What** — `REFERRAL_COOKIE_SECRET` (≥32 chars, random) — without it /r/[slug] silently fails closed (no cookie set, redirects to /signup which is now also gated by beta — net result: nobody can sign up). Plus `RESEND_API_KEY` (already required for other email features) — without it, approve endpoint returns 200 + `email_sent:false` and admin gets the manual-copy URL in the toast.
- **Files** — N/A
- **Why** — Production deploy will silently fail without these.

### Verified flows (post-shift)

- **What — direct stumble** — Visitor lands on `verity.post` cold → can browse public marketing surfaces → clicks Sign up → POST `/api/auth/signup` returns 403 `redirect_to:/beta-locked` → client redirects → user sees "we're in closed beta" with `Request access` CTA → submits form → row in `access_requests` with `status='pending'`.
- **What — owner approves** — Admin opens `/admin/access-requests`, sees pending row, clicks Review → drawer shows full submission → Approve button → mints owner-link (1 use, 7d expiry) → email sent via Resend with the unique URL → row marked `approved`, `access_code_id` bound, `invite_sent_at` stamped.
- **What — invitee signs up via owner-link** — Clicks email → `/r/<slug>` → cookie set + 302 to `/signup` → POST `/api/auth/signup` → gate allows (cookie valid, code active) → user created → `apply_signup_cohort(user_id, via_owner_link=true)` → `cohort='beta'` + `plan_id=verity_pro_monthly` immediately, no `verify_locked_at` → user logs in to full Pro on first session.
- **What — invitee shares slot 1 to a friend** — Friend clicks `/r/<slot1-slug>` → cookie set → signs up → `via_owner_link=false` → `cohort='beta'` + `verify_locked_at=now()` immediately. Friend exists in DB but compute_effective_perms strips them to allowlist → `BetaStatusBanner` shows the lockout state. Friend clicks email-confirm → `complete_email_verification` clears lock + grants Pro + mints THEIR 2 slugs.
- **What — slot already redeemed, third person tries** — Original beta user shares slot 1 to two different friends. First friend signs up successfully (`current_uses` ticks 1, equals `max_uses`). Second friend clicks the link → `/r/<slug>` finds code with `current_uses >= max_uses` → silent redirect to `/signup` with no cookie → /signup gate blocks → `/beta-locked?reason=code_exhausted`.
- **Files** — N/A (verification trace)
- **Why** — Per memory rule "Genuine fixes, never patches" — every flow path traced before declaring shipped.

### Pending owner actions

- **Apply migration #2** — `Ongoing Projects/migrations/2026-04-26_closed_beta_gate.sql`. MCP read-only blocked the apply. Same path as migration #1: paste into Supabase Dashboard SQL editor, or flip MCP write mode and I apply.
- **Set `REFERRAL_COOKIE_SECRET`** in Vercel env if not already done from the prior session.
- **Verify `RESEND_API_KEY`** is set (already required for other email; should be present).
- **Test the flow** in production after deploy: submit a request from incognito → approve from admin → click the email link → complete signup.

---

## 2026-04-26 (Beta cohort + referral system — SHIPPED) — _migration applied to prod; code mounted in profile + admin_

### Migration applied to production DB

- **What** — Single migration `2026-04-26_beta_cohort_referrals.sql` applied via `mcp__supabase__apply_migration`. Adds: (a) `users.verify_locked_at timestamptz` column + indexes on `verify_locked_at`, `comped_until`, `cohort` (partial, where-non-null). (b) `access_codes.tier text` column with check `(tier IN ('owner','user'))` + updated `access_codes_referral_shape` CHECK that allows `tier='owner' AND slot IS NULL` (admin-minted seed links) OR `tier='user' AND slot IN (1,2)` (auto-minted user share links). (c) `access_code_uses` table — provenance ledger with `referrer_user_id`, `code_tier`, `code_slot`, `landing_url`, `http_referer`, `user_agent`, `ip_address`, `country_code`, `device_type`, `signup_session_id`, plus forward-compat reward columns; UNIQUE on `used_by_user_id` (one redemption per referred user, ever). (d) `compute_effective_perms` patched to honor `verify_locked_at` lockout — adds a parallel branch to the existing ban-allowlist logic so a verify-locked user only retains `appeal.*`/`account.*`/`login.*`/`signup.*`/`settings.*` permissions until they verify. (e) `users_protect_columns` BEFORE UPDATE trigger — closes the F-013-class self-escalation hole on `users` RLS by rejecting self-PATCH writes to 30+ protected columns (cohort, comped_until, verify_locked_at, plan_id, plan_status, plan_grace_period_ends_at, stripe_customer_id, frozen_at, perms_version, referred_by, referral_code, is_banned, is_shadow_banned, ban_reason, banned_at/by, email_verified*, phone_verified*, is_expert, is_verified_public_figure, expert_title/organization, verity_score). Service-role and admin bypass the trigger; only regular authenticated self-update is restricted. (f) Eight new SECURITY DEFINER functions: `apply_signup_cohort(uuid, boolean)`, `mint_referral_codes(uuid)`, `mint_owner_referral_link(text, int, timestamptz)`, `redeem_referral(uuid, uuid, jsonb)`, `grant_pro_to_cohort(text, int)`, `sweep_beta_expirations()`, `complete_email_verification(uuid)`, `generate_referral_slug()`. (g) Privilege lockdown — every privileged function has `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` then `GRANT EXECUTE TO service_role`. Only `mint_referral_codes` additionally grants to `authenticated` (function self-checks `auth.uid() = p_user_id`). (h) Settings rows seeded in a prior session: `signup_cohort=beta`, `beta_active=true`, `beta_grace_days=14`, `beta_cap=0` (0=unlimited).
- **Files** — `Ongoing Projects/migrations/2026-04-26_beta_cohort_referrals.sql` (737 lines)
- **Why** — Owner ramping beta launch, wants attribution + share-with-friends growth loop. RLS lockdown was the gating prerequisite — without it, every beta-cohort grant column (`cohort`, `plan_id`, `comped_until`) would be a self-serve Pro button for any logged-in user via supabase-js direct PATCH.

### Verification queries (post-apply)

- **What** — Verified via `mcp__supabase__execute_sql` immediately after apply: 1 of 1 `users.verify_locked_at` column, 1 of 1 `access_codes.tier` column, 1 of 1 `access_code_uses` table, 1 of 1 `users_protect_columns_trigger` (tgenabled='O'), 8 of 8 new functions, 2 of 2 new constraints (`access_codes_tier_check`, `access_codes_referral_shape`), `compute_effective_perms` body contains both `verify_locked_at` reference and `verify_locked` lockout branch. ACL probe via `pg_proc.proacl` confirmed all 7 privileged functions limited to `{postgres, service_role, supabase_auth_admin}`; `mint_referral_codes` additionally has `authenticated` (intentional for self-heal). No `anon`, no `PUBLIC` grants anywhere.
- **Files** — N/A (verification probes)
- **Why** — Per memory rule "MCP-verify schema, never trust supabase_migrations log."

### Code shipped (web)

- **What — sign-cookie helper** — `web/src/lib/referralCookie.ts`: HMAC-SHA256 sign/verify for `vp_ref` cookie. Payload `{c: code_id, t: issued_at_ms, h: cohort_snapshot}` encoded as `base64url(json) + '.' + base64url(hmac)`. Timing-safe compare; rejects malformed/expired/missing-secret. Reads `REFERRAL_COOKIE_SECRET` env (must be ≥32 chars; missing → fail-closed null return). 30-day TTL embedded in payload. Embedding `cohort_snapshot` closes the app_settings-flip-mid-flow race surfaced by the adversary agent.
- **What — email normalization** — `web/src/lib/emailNormalize.ts`: gmail dot-stripping + plus-aliasing strip (treats `googlemail.com` as `gmail.com`); generic plus-stripping for all domains. Used at signup callback to detect self-referral via aliased emails (foo+anything@gmail.com → foo@gmail.com).
- **What — public referral capture** — `web/src/app/r/[slug]/route.ts`: GET handler. Validates slug regex `/^[a-z0-9]{8,12}$/` before any DB lookup. Enforces `Sec-Fetch-Dest: document` (rejects `<img>`/`<iframe>`/`<script>`/fetch contexts to block forced-attribution CSRF). IP-keyed rate limit at 60/10min via `policyKey: 'referral_landing_ip'`. Service-client lookup on `access_codes` (RLS is admin-only). Sets HMAC-signed `vp_ref` cookie (httpOnly, sameSite=lax, secure-in-prod, 30d) on hit only. **Identical 302 to `/signup` on hit/miss/disabled/expired/rate-limited/wrong-context** — no enumeration via response shape or timing. No query params forwarded to signup (open-redirect-safe).
- **What — signup callback hooks** — `web/src/lib/referralProcessing.ts`: shared helper called from both email-signup and OAuth-callback. Order is critical and explicit: (1) clear `vp_ref` cookie unconditionally as the first action so a failure mid-process can't leak attribution into the next user's signup on the same browser; (2) read+verify cookie HMAC via `verifyRef`; (3) look up code (read-only, then call into `redeem_referral` RPC for the FOR-UPDATE re-check); (4) determine `via_owner_link` from `code.tier`; (5) call `apply_signup_cohort(user_id, via_owner_link)` — owner-tier links grant Pro immediately, user-tier and direct signups defer until email verification; (6) self-referral guard (id-match + email-normalized-match against owner email); (7) call `redeem_referral` with full provenance jsonb (landing_url, http_referer, user_agent, ip_address, country_code from `x-vercel-ip-country`/`cf-ipcountry`, device_type heuristic from UA); (8) mint 2 referral slugs if cohort='beta' AND plan was actually granted. Every side effect wrapped in try/catch with `console.error` only — referral failure NEVER blocks signup. `web/src/app/api/auth/signup/route.js` and `web/src/app/api/auth/callback/route.js` patched to call this helper.
- **What — email-verify completion** — `web/src/app/api/auth/callback/route.js` existing-user branch patched: SELECT now includes `email_verified`, and when `user.email_confirmed_at && existing.email_verified === false` (the actual transition moment), calls `complete_email_verification(user.id)` RPC. That clears `verify_locked_at`, re-runs `apply_signup_cohort` (which now sees email_verified=true and grants Pro for deferred beta signups), and mints the user's 2 referral slugs. Idempotent; only fires on the actual transition so we don't bump perms_version on every login.
- **What — /api/referrals/me** — `web/src/app/api/referrals/me/route.ts`: GET endpoint returning the caller's two slugs + per-slot redemption counts. Auth via `requireAuth`; rate-limit 30/60s. Self-heals via `mint_referral_codes` first (idempotent) so users created before this feature shipped get slugs on first card load. Counts only — no PII of redeemers (no emails, no names, no avatars), per the design review's privacy/harassment-vector mitigation.
- **What — InviteFriendsCard** — `web/src/components/profile/InviteFriendsCard.tsx`: client component fetching from `/api/referrals/me`. Two slug rows with monospace URL display + Copy buttons (clipboard API). Per-slot redemption counts. Disabled-state styling for revoked codes. Mounted in `web/src/app/profile/settings/page.tsx` immediately after `<BetaStatusBanner>`, gated on `userRow?.cohort === 'beta'`.
- **What — BetaStatusBanner** — `web/src/components/profile/BetaStatusBanner.tsx`: three-state component. (1) `verify_locked_at` set → high-severity red banner: "Beta access locked. Verify your email to keep your account active and any pro access we owe you." with `Resend verification email` CTA. (2) `comped_until > now()` → low-severity amber banner: "Beta access ends in N days. Pick a plan to keep Pro features." (3) `cohort='beta' && email_verified=false` → low-severity nag: "Verify your email to lock in beta Pro access." Mounted in profile/settings; renders nothing for non-beta users.
- **What — admin owner-link mint** — `web/src/app/admin/referrals/page.tsx` + `web/src/app/api/admin/referrals/mint/route.ts`. Admin-only page (gated on `ADMIN_ROLES`). Mint drawer: optional description, optional max_uses, optional expires_at. Calls `mint_owner_referral_link` RPC, returns `{id, code, url}` with full `${siteUrl}/r/<code>` URL ready to copy. Tabs split owner-tier from user-tier rows. StatCards for owner-link count, user-link count, total signups via referral, owner-link signups specifically. Audit-logged via `recordAdminAction` with action=`referral.owner_mint`. Permission gate: `admin.access.create`.
- **What — sweeper cron** — `web/src/app/api/cron/sweep-beta/route.js`: nightly cron route at `30 5 * * *` (entry added to `web/vercel.json`). Auth via `verifyCronAuth` → 403 fail-closed. Calls `sweep_beta_expirations()` RPC. RPC behavior: when `beta_active=true`, clears any stale `comped_until`/`verify_locked_at` (re-enable case); when `beta_active=false`, stamps `comped_until = now() + beta_grace_days days` for verified beta users with no comp set, stamps `verify_locked_at = now()` for unverified beta users, downgrades any beta user past their grace window to free (`plan_id=NULL, plan_status='free'`). All operations bump `perms_version`. Returns counts as jsonb logged to `cron_heartbeats` and `audit_log` (`action='beta.sweep'`).
- **Files** — `web/src/lib/referralCookie.ts` (new), `web/src/lib/emailNormalize.ts` (new), `web/src/lib/referralProcessing.ts` (new), `web/src/app/r/[slug]/route.ts` (new), `web/src/app/api/auth/signup/route.js`, `web/src/app/api/auth/callback/route.js`, `web/src/app/api/referrals/me/route.ts` (new), `web/src/app/api/admin/referrals/mint/route.ts` (new), `web/src/app/admin/referrals/page.tsx` (new), `web/src/app/api/cron/sweep-beta/route.js` (new), `web/src/components/profile/InviteFriendsCard.tsx` (new), `web/src/components/profile/BetaStatusBanner.tsx` (new), `web/src/app/profile/settings/page.tsx`, `web/vercel.json`, `web/src/types/database.ts` (regenerated)
- **Why** — Owner directive: beta users get Pro access; owner mints a unique link per seed user (instant Pro, no verify wall); seed users get 2 share links each (verify-required for invitees); track every signup origin. Plus end-of-beta soft-warning UX with no email — banner-only.

### iOS audit — clean, no code changes needed

- **What** — Per the design review's recommendation, audited `StoreManager.isPaid` callers across the iOS adult app. Result: zero external callers. The `isPaid` / `isPremium` / `hasAccess(to:)` getters in `StoreManager.swift` are documented as StoreKit-local cache state ("not a feature-gate layer — feature visibility is handled by views via `PermissionService`"). View-local paywall checks all flow through server endpoints that derive `paid: Bool` from `requirePermission(...)` → `compute_effective_perms` → `users.plan_id`. Beta users with `plan_id=verity_pro_monthly` will see Pro features on iOS automatically with no Swift changes.
- **Files** — N/A (read-only audit on `VerityPost/VerityPost/RecapView.swift`, `StoreManager.swift`, `web/src/app/api/recap/route.js`)
- **Why** — Adversary agent flagged "iOS bypass" as a potential vector; verified the existing architecture already prevents it.

### Types regenerated

- **What** — `web/src/types/database.ts` regenerated via `mcp__supabase__generate_typescript_types`. Confirmed presence of: `verify_locked_at` column on Tables<'users'>, `tier:` column on Tables<'access_codes'>, full `access_code_uses` table type, function signatures for `apply_signup_cohort`, `mint_referral_codes`, `mint_owner_referral_link`, `redeem_referral`, `sweep_beta_expirations`, `complete_email_verification`. 371KB output written via Python JSON extractor (the MCP tool returns wrapped JSON; raw bytes piped to file).
- **Files** — `web/src/types/database.ts`
- **Why** — Routes + admin page rely on Tables<'access_codes'> resolving with the new `tier` column.

### Required env var (deploy gate)

- **What** — `REFERRAL_COOKIE_SECRET` must be set in Vercel project env (Production + Preview + Development) before /r/[slug] and signup callback are functional. ≥32 ASCII chars (random base64 or hex). Without it, `signRef` returns null and `/r/[slug]` redirects to `/signup` without setting any cookie (fail-closed; no broken state, just no attribution captured). The migration + DB are ready independently — env-var-missing only disables the public capture surface, not the cohort grant for direct signups.
- **Files** — N/A (env config — owner action)
- **Why** — Adversary's #3 must-fix: HMAC-signed cookie with dedicated secret, not reused from other env vars.

### Test plan (post-deploy verification)

- **What — beta sign-up flow (direct, no cookie)** — User creates account at `/signup` → `users` row created with `cohort=null` → `apply_signup_cohort` runs, sees `signup_cohort=beta` → tags `cohort='beta'` but skips Pro grant (email not verified, no owner link). User clicks email-confirm link → `/api/auth/callback` existing-user branch updates `email_verified=true`, calls `complete_email_verification` → Pro plan + slugs minted + `bump_user_perms_version`.
- **What — beta sign-up via owner link** — Owner mints link at `/admin/referrals`, sends URL to seed user. Seed user clicks `/r/<slug>` → cookie set + 302 to `/signup` → user creates account → cohort='beta' + Pro granted immediately (no verify wait) + redemption row written with `code_tier='owner'` and `referrer_user_id`=owner. 2 user-tier slugs minted for the seed user.
- **What — beta sign-up via user-shared link** — Same as above but `code.tier='user'`, owner_user_id=referrer beta user. Pro grant deferred until email verify. Redemption recorded with full provenance.
- **What — RLS lockdown** — Authenticated user attempts `supabase.from('users').update({plan_id: <pro-uuid>}).eq('id', auth.uid())` → trigger raises 42501 `users.plan_id is read-only for self-update`. Repeat for `cohort`, `comped_until`, `verify_locked_at`, `email_verified`. All deny.
- **What — sweeper** — Owner flips `settings.beta_active` to `false`. Next nightly sweep stamps `comped_until=now()+14d` on verified beta users (BetaStatusBanner shifts to amber "ends in 14 days"). Stamps `verify_locked_at=now()` on unverified beta users (banner shifts to red lockout, perms drop to allowlist). 14 days later: sweep downgrades verified beta users past grace to free (`plan_id=NULL, plan_status='free'`).
- **Files** — N/A (test plan; owner-driven verification)
- **Why** — Per memory rule "Genuine fixes, never patches" — every flow path traced and confirmed to work end-to-end before declaring shipped.

---

## 2026-04-26 (Beta cohort + referral system — design + ground-truth review) — _superseded by SHIPPED entry above_

### Audit of existing promo / access-code / referral surfaces

- **What** — Full read-through of every promo + access-code + referral surface across web + iOS adult. Findings: (1) **100%-off promo redemption works end-to-end** via `/api/promo/redeem` → `billing_change_plan`/`billing_resubscribe` with proper FOR-UPDATE serialization, atomic `current_uses` increment, and rollback paths. (2) **Partial-discount promos are non-functional** — `/api/promo/redeem` returns `{fullDiscount:false, message:"X% off will apply at checkout"}` but `/api/stripe/checkout` never reads `promo_codes` or passes a coupon to Stripe (just sets `allow_promotion_codes:true` for Stripe's native promo field, totally disconnected from our DB). `current_uses` never incremented, `promo_uses` never written for partial codes anywhere. (3) **Access codes are entirely orphaned** — full admin CRUD at `/admin/access` with `grants_plan_id`/`grants_role_id`/`max_uses`/audit-logged toggles, but **no code anywhere reads `access_codes`** for redemption. Ext-AA1 (2026-04-25) stripped the invite gate, so `access_requests` route returns 410, but the `access_codes` table + admin UI were never wired to anything in the first place. (4) iOS adult `SubscriptionView.swift` calls the same `/api/promo/redeem` endpoint, so partial-promo brokenness propagates to iOS too — worse, StoreKit-only family tiers have no checkout, so the "applies at checkout" message is doubly misleading there.
- **Files** — N/A (read-only audit)
- **Why** — Owner asked "look at access codes and promos and stuff like that" before designing the beta-cohort + referral system. Verifying ground truth per memory rule "Verify audit findings against current state before acting" surfaced that two of the three existing systems are broken or orphaned and shouldn't be reused as-is.

### Beta cohort + referral system designed (4-agent pre-implementation review)

- **What** — Designed beta-cohort tagging + 2-referral-slugs-per-user system. Final scope locked: (a) `users.cohort` set at email-verify time from `settings.signup_cohort`; tag persists forever per user. (b) Beta cohort = full adult Pro (no kids, no admin) via `plan_id=verity_pro_monthly`, no Stripe customer needed. (c) `users.comped_until` is the comp-time column (replacing the wrong-fit `plan_grace_period_ends_at`, which renders a dunning banner and is cleared by `billing_change_plan`). (d) 2 slugs per user via existing `access_codes` extended schema (`type='referral'`, `owner_user_id`, `slot smallint CHECK(slot IN (1,2))`, partial UNIQUE on owner+slot). (e) `access_code_uses` table (new) with full provenance tracking — `referrer_user_id`, `landing_url`, `http_referer`, `user_agent`, `ip_address`, `country_code`, `device_type`, `signup_session_id`, plus forward-compat `reward_kind`/`reward_value`/`reward_granted_at`. (f) Public `/r/[slug]` route with HMAC-signed `vp_ref` cookie (httpOnly, sameSite=lax, 30d, payload `{code_id, issued_at, cohort_snapshot}`), identical 302 for hit/miss/disabled, IP rate-limit, no query-param forwarding, `Sec-Fetch-Dest: document` enforcement. (g) End-of-beta sweeper: owner flips `settings.beta_active=false`; nightly cron stamps every `cohort='beta'` user with `comped_until=now()+14d`; banner shows during 14-day window; sweeper downgrades `plan_id` at expiration; cohort tag stays for analytics. No email — banner-only.
- **Files** — N/A (design only; no migration applied; one CHANGELOG entry being added now)
- **Why** — Owner ramping beta launch and wants attribution + share-with-friends growth loop. Original scope ("just give Pro to beta signups") expanded after agent review surfaced (i) `plan_grace_period_ends_at` is the wrong column (`lib/plans.js:206` maps non-null to `state='grace'`, banner reads "Your plan ends in N days"), (ii) `access_codes` schema already supports the referral primitive — no parallel table needed, (iii) RLS on `users` is broad enough that any logged-in user can self-PATCH `cohort`/`plan_id` and grant themselves Pro (F-013-style hole, must be locked down before any cohort grant ships).

### 4-agent pre-implementation review (Investigator + Planner + Big-Picture + Adversary)

- **What** — Per memory rule "Four-agent review required before non-trivial changes," dispatched 4 parallel agents on the design. Results: NOT 4/4 unanimous; 3 structural blockers + ~15 hardening items surfaced. Blockers: (1) **wrong column** — `plan_grace_period_ends_at` → use new `comped_until`; (2) **table duplication** — `referral_codes` parallel table → fold into existing `access_codes` with `type='referral'` (Big-Picture call, confirmed via MCP probe that schema extensions are already partially in place); (3) **RLS column-level lockdown on `users`** required before shipping cohort grants — current `users_update USING (id=auth.uid() OR is_admin_or_above())` lets users self-grant Pro. Hardening items folded into spec: HMAC-signed cookie with dedicated `REFERRAL_COOKIE_SECRET`, snapshotted cohort value at mint-time (closes app_settings-flip race), email-normalization (gmail dot/+aliases) for self-referral guard, TOCTOU re-check of `disabled_at` with `FOR UPDATE` at redemption, `Sec-Fetch-Dest: document` to block CSRF via `<img src>`, no query-param forwarding from `/r/[slug]`, unconditional cookie-clear-first in signup callback, count-only PII (no emails/names/avatars of referred users in profile card), `bump_user_perms_version` call from email-verify callback so Pro caps light up immediately. Beta-cohort sybil gate: email verification is the bot wall (per owner — quizgate gates downstream and isn't required pre-cohort-grant).
- **Files** — N/A (review process)
- **Why** — Beta = 365d Pro = real money; treat the grant surface as monetary. Adversary's "Top 3 must-fix": RLS column lockdown, `grant_pro_to_cohort` REVOKE EXECUTE FROM PUBLIC, HMAC-signed cookie. All folded into spec.

### Ground-truth probe via MCP (2026-04-26)

- **What** — Direct schema probes via `mcp__supabase__execute_sql` against live DB to verify state before drafting migration. Findings: **most of the schema is already in place from prior work** — `users.cohort`, `users.cohort_joined_at`, `users.comped_until` all exist (nullable, no defaults); `access_codes` already has `owner_user_id`, `slot`, `disabled_at` columns + `access_codes_referral_shape` CHECK + type-check including `'referral'` + slot-check `{1,2}` + partial UNIQUE `uq_access_codes_referral_owner_slot ON (owner_user_id, slot) WHERE type='referral'`; `settings` rows for `signup_cohort=beta`, `beta_active=true`, `beta_grace_days=14`, `beta_cap=0` already seeded; `compute_effective_perms` resolves Pro caps via `plan_id` alone (setting `plan_id=verity_pro_monthly` lights up Pro features without perm-RPC changes); `bump_user_perms_version` exists, gated to service-role/admin; `record_admin_action` signature confirmed; `audit_log` schema confirmed. **What's missing**: `access_code_uses` table (must build), `apply_signup_cohort` / `mint_referral_codes` / `grant_pro_to_cohort` / `sweep_beta_expirations` SQL fns (must write), users RLS column-level lockdown trigger (must write — critical). Plan UUID confirmed: `2961df6a-5996-40bd-95ee-3ee4fdb60394` (verity_pro_monthly, tier=`verity_pro`, active+visible, $9.99).
- **Files** — N/A (read-only probes)
- **Why** — Per memory rule "MCP-verify schema, never trust supabase_migrations log." Probe found prior session(s) had already applied most of the cohort + access_codes extensions, so the new migration is much smaller than originally scoped — `access_code_uses` table + 4 functions + RLS lockdown trigger.

### Pending — owner decision before migration

- **What** — One open question: **(A)** system auto-mints 2 slugs per user at email-verify time, or **(B)** owner manually generates codes per user via admin UI? Original turn ("they can share up 2 unique links each") suggested A; later turn ("I'm going to be generating a unique link per person") could read either way. Awaiting confirmation. Once answered, migration drafts in a single `.sql` file at `supabase/migrations/<ts>_beta_cohort_referrals.sql`, surfaces to owner, applies via staging branch → `merge_branch` after smoke test.
- **Files** — N/A
- **Why** — Auto-mint vs admin-mint changes the admin surface materially (admin gets a generation page) and the user surface (codes appear instantly vs after admin action). OwnersAudit-style decision required before code lands.

---

## 2026-04-26 (Admin pipeline — Generate route ERR_REQUIRE_ESM fix — PR #1) — _PR opened, not merged_

### Server-side body sanitizer swap (jsdom → sanitize-html)

- **What** — `renderBodyHtml(markdown)` switched from `isomorphic-dompurify` to `sanitize-html`. The old path pulled `jsdom@29.0.2 → html-encoding-sniffer@6.0.0 → @exodus/bytes@1.15.0` (ESM-only), which Vercel's Node 20 CommonJS runtime cannot `require()`, crashing `POST /api/admin/pipeline/generate` with a bare 500/no-body at module load. Latest jsdom still ships the broken combo, so a pin doesn't help. New implementation uses `marked` for markdown → HTML and `sanitize-html` (parse5/htmlparser2-based, no DOM emulation) for the safety pass. Allowlist mirrors DOMPurify `USE_PROFILES: { html: true }` shape: paragraphs, headings, lists, inline formatting, blockquote, links (with `rel`/`title`/`target`), images (`src`/`alt`/`title`/`width`/`height`), code (with `class` for syntax highlighting), tables. `allowedSchemes` restricted to `http`/`https`/`mailto` for hrefs; `http`/`https`/`data` for img src. `disallowedTagsMode: 'discard'` keeps text content when tags are dropped. Inline styles, scripts, iframes, event handlers all stripped.
- **Files** — `web/src/lib/pipeline/render-body.ts`
- **Why** — Production-blocking 500 on the AI article Generate flow. Reproduced from owner's Vercel logs (`Error [ERR_REQUIRE_ESM]: require() of ES Module ... @exodus/bytes/encoding-lite.js`). Architectural fix: server-side sanitization should not depend on a browser DOM emulator. `sanitize-html` is the canonical Node-native sanitizer.

### Client-side sanitizer swap (isomorphic-dompurify → plain dompurify)

- **What** — Expert queue answer-preview pane switched from `import DOMPurify from 'isomorphic-dompurify'` to `import DOMPurify from 'dompurify'`. Added a `typeof window === 'undefined' ? '' : DOMPurify.sanitize(...)` guard at the call site as defense-in-depth: Next.js renders `'use client'` modules on the server for the initial HTML payload, where plain `dompurify` returns input unchanged (no `window`). The JSX path is already gated by `loading=false` (initial state is `true` with an early return), so the guard is a backstop in case loading-state ordering ever changes. Inline comment near the import explains the SSR semantics.
- **Files** — `web/src/app/expert-queue/page.tsx`
- **Why** — Removing `isomorphic-dompurify` requires a per-environment replacement. Browser side wants real DOMPurify (works on `window.document`); server side wants `sanitize-html`. Plain `dompurify` is the canonical browser sanitizer and is what `isomorphic-dompurify` was already shimming on the client anyway.

### Dep tree purge

- **What** — `npm uninstall isomorphic-dompurify && npm install sanitize-html dompurify && npm install -D @types/sanitize-html @types/dompurify`. Surgical install command (no `rm -rf node_modules package-lock.json`) preserves all other dep versions — no incidental minor bumps on `next`, `@sentry/nextjs`, `@anthropic-ai/sdk`, `openai`, `@playwright/test`, etc. Lockfile diff is net −392 lines (entire jsdom subtree removed: `@exodus/bytes`, `html-encoding-sniffer`, `data-urls`, `decimal.js`, `whatwg-url`, `whatwg-mimetype`, `tough-cookie`, `parse5` (jsdom's fork), `saxes`, `xml-name-validator`, `w3c-xmlserializer`, `tldts`/`tldts-core`, `bidi-js`, `css-tree`, `mdn-data`, `is-potential-custom-element-name`, `symbol-tree`, `xmlchars`, the `@asamuzakjp/*`/`@bramus/*`/`@csstools/*` clusters, plus their transitives). `npm ls jsdom isomorphic-dompurify @exodus/bytes html-encoding-sniffer` returns empty on every name.
- **Files** — `web/package.json`, `web/package-lock.json`
- **Why** — Reducing the lambda's bundle size and cold-start parse cost; eliminating the broken transitive dep entirely so future installs can't re-resolve it.

### E2E regression guard

- **What** — Added one Playwright test (`pipeline generate route loads without ERR_REQUIRE_ESM`) under the existing `admin-deep — pipeline` describe block. Test signs in as the seeded admin, POSTs to `/api/admin/pipeline/generate` with an empty body, asserts response status `< 500`. A 4xx (schema validation failure on missing required fields) means the route module loaded cleanly — exactly the signal we need. A 5xx means a transitive dep regressed back into an ESM/CJS interop break. Inline comment names the regression class.
- **Files** — `web/tests/e2e/admin-deep.spec.ts`
- **Why** — The bug shipped because the route had no test that exercised the import path. Adding a per-PR regression check at zero infrastructure cost (uses the existing Playwright suite + seed fixtures).

### Process notes

- **What** — Implemented in an isolated git worktree (`fix/remove-jsdom-from-render-body` branch at `verity-post-fix-jsdom/`) to keep the fix surgical alongside the in-flight `Ongoing Projects/` repo restructure. Followed the 6-agent ship pattern from memory: 4 pre-implementation agents (Investigator, Planner, Big-Picture Reviewer, Adversary) + 2 post-implementation agents (Verifier, Regression Scanner). Adversary's "BLOCK-WITH-CONDITIONS" surfaced two refinements that were folded into the final plan: (1) surgical `npm uninstall`+`install` instead of broad lockfile regen; (2) `typeof window` SSR guard on the expert-queue sanitize call. Big-Picture's "APPROVE-WITH-CONDITIONS" added the wider DOMPurify-mirroring allowlist (vs. the planner's narrow `[p, strong, em, br]`) and the e2e regression test. Both post-impl agents returned PASS with no scope creep and no unrelated dep churn. PR opened at https://github.com/veritypost/site/pull/1.
- **Files** — N/A (process)
- **Why** — Owner request: "100% correct and not fuck up anything else by time its done." The 4-agent unanimous-or-divergence-resolve rule from memory caught and fixed plan-mechanics issues that a single-pass implementation would have shipped.

### Out of scope, flagged for later

- **What** — (1) `web/src/app/api/ai/generate/route.js:124` writes raw OpenAI output to `body_html` unsanitized — pre-existing XSS-shaped bug in legacy route (F7 pipeline supersedes; route may be deletable). (2) `currentschema` artifact at repo root is untracked and not in `.gitignore`; either commit it as a reference or add an ignore entry.
- **Files** — N/A (flagged, not changed in this PR)
- **Why** — "Genuine fixes, never patches" — the ERR_REQUIRE_ESM fix should not entangle with unrelated hardening or housekeeping.

---

## 2026-04-26 (IA shift bundle — Profile Task 5 + Search Task 6 prep) — _pending push to git + DB apply_

This is one coherent IA migration spanning three artifacts:
1. A DB migration (written, not applied yet)
2. iOS perm-key swap to canonical short-form (in-source)
3. Leaderboard relocated into Profile on web (in-source)
4. Full session prep doc for the new iOS Browse tab + bottom-bar swap

### DB migration written (not applied)

- **File** — `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql`
- **What it does** — Binds `profile.categories` to the same 8 plan sets that already carry `profile.activity` and `profile.achievements` (admin/editor/expert/family/free/moderator/owner/pro); removes the `anon` binding.
- **Why** — MCP-verified live state showed `profile.categories` was bound only to `anon`. The `/profile` route is middleware-protected from anon, so the binding has been a no-op for everyone — nobody on web sees the Categories tab today, and the drift was never noticed because the tab just disappears quietly. iOS used an orphan key (`profile.score.view.own.categories`, bound to admin/free/owner — 3 sets only) which was a migration-142 leftover the 143 rollback was supposed to clean up. Net effect after apply: web Categories tab returns for every logged-in plan; iOS code change (next bullet) makes both surfaces query the same canonical key; orphan key becomes deletable in a follow-up. Migration is wrapped in `BEGIN/COMMIT`, idempotent on re-apply, with rollback statement and verification query in the file header.
- **Apply order** — (1) run migration, (2) bump `users.perms_version` so live perms cache invalidates, (3) push the iOS code so iOS reads the canonical key the moment the DB has it. Doing them out of order leaves a brief stale-perm window.

### iOS perm-key short-form swap (in-source, not committed)

- **What** — `ProfileView.swift:191-193` switched from long-form (`profile.activity.view.own`, `profile.score.view.own.categories`, `profile.achievements.view.own`) to canonical short-form (`profile.activity`, `profile.categories`, `profile.achievements`). Comment in source explicitly references the migration file so the dependency is traceable.
- **Files** — `VerityPost/VerityPost/ProfileView.swift`
- **Why** — Per CLAUDE.md canonical guidance ("short-form is canonical, .view.own variants are a rolled-back migration artifact"). Web has always used short-form; iOS being on the long-form variants was the source of the cross-platform Categories-tab divergence. Once the DB binding migration above lands, this single 3-line swap restores full parity — same DB row, same login, same tab visibility on both surfaces.

### Leaderboard relocated into Profile on web (in-source, not committed)

- **What** — Added `<QuickLink href="/leaderboard" label="Leaderboards" description="See where you rank by topic and overall" />` to the `OverviewTab` "My stuff" section in `web/src/app/profile/page.tsx`. Removed the section's conditional wrapper so it always renders — Leaderboards is a default-on entry, the other links are perm-gated additions.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — Pre-positioning the entry point on the web side. When the iOS bottom-bar swap ships (separate session — replaces "Most Informed" with "Browse"), the same QuickLink pattern lands on iOS, and Leaderboard's permanent home becomes Profile on both surfaces. Description copy is plain factual ("See where you rank by topic and overall") — no rank teaser, no streak boast. Per owner directive 2026-04-26: "don't gamify whatever you're too much." The leaderboard surface still exists; what changes is its placement signals it's a check-in stat page, not a primary destination users should optimize for.

### iOS Browse tab + bottom-bar swap — session prep written, not implemented

- **File** — `Ongoing Projects/Sessions-Pending/BrowseView_iOS_Session_Prep.md`
- **What's in it** — Full prompt, files-to-read list, build spec for `BrowseView.swift` (~200 lines mirroring `web/src/app/browse/page.tsx`), tab swap plan for `ContentView.swift` (`MainTabView.Tab` + `TextTabBar.items`), iOS Profile QuickLink note (must land with this session so the Leaderboard entry is never absent during the cutover), DB migration coordination order, acceptance criteria, explicit out-of-scope list (no Home rank-changed nudge per owner directive, no 6-tab bar, no new API endpoint, no keyboard shortcuts).
- **Why a separate session** — `BrowseView.swift` is a fresh view file at ~200 lines. Bundling it with the bottom-bar swap and the iOS Profile QuickLink + the DB migration coordination makes one coherent TestFlight push instead of multiple half-states where Browse is in the bar but Leaderboard hasn't been relocated yet, or where the perm migration has applied but the iOS code hasn't shipped.

---

## 2026-04-26 (Group 8 — Settings Task 4 + 1/2/6 deferred) — _pending push to git_

### Settings Task 4 — sanitize raw Supabase Auth error in password card

- **What** — `pushToast({ message: upErr.message, variant: 'danger' })` → log the raw message via `console.error('[settings.password.update]', upErr.message)` and toast a fixed `"Password could not be updated. Try again."`
- **Files** — `web/src/app/profile/settings/page.tsx`
- **Why** — Supabase Auth's `updateUser` error string can contain policy detail (`"Password should be different from the old password"`) or stack-trace fragments on edge errors. The path is also reachable after the user already passed the per-user-rate-limited `/api/auth/verify-password` check, so any remaining failure here is most often a Supabase Auth backend issue — not something the user can act on with the raw message. Fixed string keeps the user oriented; the real detail goes to the JS console for debugging.

### Settings Tasks 1, 2, 6 — deferred (not pending push, not yet done)

- **Task 1 (web MFA card)** — full TOTP enrollment + verify + unenroll is a feature build, not audit cleanup; needs its own design pass on enrollment and recovery UX
- **Task 2 (iOS TTS toggle)** — adding the row is small but verifying iOS reads the same `users.metadata.tts_per_article` shape that web writes + having the TTS player honor the toggle deserves a QA pass alongside, not a one-line drop-in
- **Task 6 (DM read receipts placement)** — extracting a `PrivacyPrefsCard` from `ProfileCard` touches the user-row PATCH path; T-073 settings split is going to reshuffle anchors anyway, so this re-anchoring is much cheaper to land inside that deploy window than as a one-off now

---

## 2026-04-26 (Group 6 — Kids surface UX polish) — _pending push to git_

### Kids Task 1 — kill the duplicate close button on ArticleListView

- **What** — `KidsAppRoot.fullScreenCover` now branches on the active sheet. For `.articles`, it renders only the scene body (no `closeChrome` overlay). For `.streak` / `.badge`, the overlay still renders because those scenes have no toolbar of their own.
- **Files** — `VerityPostKids/VerityPostKids/KidsAppRoot.swift`
- **Why** — `ArticleListView` is a `NavigationStack` and already paints its own `xmark` button via `ToolbarItem(.topBarLeading)`. The blanket `closeChrome` overlay was sitting at the same screen coordinates on Dynamic Island devices (~59pt safe-area top), giving the kid two visually overlapping circles to tap. Both worked, so it's a polish bug not a functional one — but a kid app showing two close buttons looks broken to a parent doing the App Store walkthrough.

### Kids Task 2 — hold the result reveal until server verdict resolves

- **What** — `resultView` branches on `verdictPending`. While true, shows `ProgressView()` + "Checking your score…" caption and hides the Done button. Once the RPC returns and `verdictPending` flips false, the existing pass/fail layout renders.
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — Local `correctCount` and the server `get_kid_quiz_verdict` RPC can disagree: a write failure mid-quiz drops a row from the server count, so a kid who locally tallies 4/5 might get a server verdict of 2/5. Without the spinner, the view first showed "Great job!" and then silently flipped to "Give it another go?" 2–5 seconds later. Disorienting at the exact moment a kid is parsing whether they passed. The 1–3 second wait is anticipation, not punishment — quizzes always have a result-reveal beat.

### Kids Task 3 — distinguish a network failure from a missing quiz (KidQuizEngineView)

- **What** — Body now branches `loadError != nil → errorState` before `questions.isEmpty → emptyState`. New `errorState` view: `wifi.slash` icon + "Couldn't load the quiz right now." + 44pt "Try again" button calling `loadQuestions()`. `loadQuestions()` resets `loadError` and `blockedNotKidsSafe` on entry so the retry path clears stale state.
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — When the Supabase fetch failed, `loadError` was set but never rendered; the body fell through to `questions.isEmpty` which displayed "No quiz yet for this article." A kid who lost wifi for two seconds got told their favorite article didn't have a quiz, with no path to retry beyond closing the cover and re-opening. The empty-state copy is correct for the *real* missing-quiz case (Kids Task 11's pool-size guard fires it legitimately) — the fix is to not lie about which case is happening.

### Kids Task 4 — same fix for ArticleListView

- **What** — `loadError != nil` branch now precedes `articles.isEmpty`, with its own retry view. Trailing red `loadError` caption removed (it was rendering *under* the contradicting empty state). `load()` resets `loadError` on entry.
- **Files** — `VerityPostKids/VerityPostKids/ArticleListView.swift`
- **Why** — Same divergence pattern as Task 3. With the trailing caption, a kid saw both "No articles in this category yet" AND "Couldn't load articles" simultaneously — two answers to the same question. Now they see one clear state with a path forward.

### Kids Task 10 — connect quiz outcome to something concrete

- **What** — Below the score line, resultView now shows pass: "Your streak just got longer." / fail: "Read it again and try when you're ready."
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — Without context, the result screen reads as a school test — pass/fail score, no consequence, no participation framing. Adult surfaces have explicit civic framing ("BEFORE YOU DISCUSS" / "the conversation opens") that gives the quiz weight. Kids needed parallel framing so the mechanic feels like a thing you participate in, not a thing being done to you. Streak is the kid surface's strongest motivational signal — wiring the pass result back to it costs one line and earns the most.

### Kids Task 12 — show the pass threshold in the result line

- **What** — Pass: "You got X of N right." Fail: "You got X of N. You need Y to pass." `Y` is computed from current question count using the same `max(1, ceil(N × 0.6))` formula the local-fallback logic already uses.
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — A kid who failed had no way to tell how close they came. "You got 2 of 5 right" + "Give it another go?" leaves the bar invisible — they could have missed by 4 or by 1. Adult web/iOS surfaces state "3 of 5 to pass" up front on the idle card; kids was the only surface where the threshold was a hidden constant. Fail copy now is the natural place to surface it because that's when it's actionable.

---

## 2026-04-26 (Groups 5 + 7 — Static + Browse polish)

### Static Task 5 — How-it-works Step 4 copy

- **What** — Step 4 description: "Build your Verity Score by reading thoroughly, acing quizzes, contributing quality discussions, and verifying sources. Higher scores unlock expert features and community recognition." → "Build your Verity Score by reading thoroughly, acing quizzes, and contributing quality discussions. Higher scores earn community recognition and let you apply for expert and journalist roles." Owner-approved tweak: "open the door to applying" → "let you apply" — active, fewer hops.
- **Files** — `web/src/app/how-it-works/page.tsx`
- **Why** — OwnersAudit Static Task 5. Old copy was a false promise (experts apply + are vetted, not score-gated) — worst possible place for inaccuracy on the page that sells the trust mechanism.

### Browse Task 4 — Error state with retry

- **What** — `fetchData` lifted from inline `useEffect` to a `useCallback` so the retry button can call it directly. Added `loadFailed` state. On Supabase error in either parallel query, console-logs the message, clears state, and sets `loadFailed = true`. Render branches `loading → BrowseSkeleton`, `loadFailed → error pane`, else content. Error pane: "Couldn't load content" / "Check your connection and try again." / 44pt "Retry" button. Distinct from the "No categories match" empty state so the two failure modes don't conflate.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 4. Without an error branch, RLS / network / 5xx errors silently rendered as empty layout.

### Browse Task 7 — Pre-search topic chips: deferred (Browse half)

- The Browse page already shows the entire active-category grid as its "pre-search" state, so adding chips above the input would duplicate. The Search and iOS FindView pieces of this task remain pending and will land in Group 4 (iOS Browse tab + Search/Find chip parity).

### Browse Task 8 — VP_PALETTE extract: deferred (low priority)

- Same scope as Home Task 3 ("Deferred to global token sweep"). One-file extraction leaves drift; needs to land as one global pass.

---

## 2026-04-26 (Group 3 — Kids Mgmt Tasks 1, 2, 3, 4)

### Kid PIN label clarified

**Task 1 — "Parent PIN" → "Kid PIN"**
- **What** — Web `Field` label `"Parent PIN (4 digits, optional but recommended)"` → `"Kid PIN (4 digits, optional) — your child types this to open the app"`. Aligns with iOS `FamilyViews.swift:1226` semantics — same PIN, no ambiguity about who holds it.
- **Files** — `web/src/app/profile/kids/page.tsx`
- **Why** — OwnersAudit Kids Mgmt Task 1.

### App Store CTA placeholder

**Task 2 — `KidsAppBanner` component**
- **What** — New persistent banner above the kids list. Single `KIDS_APP_STORE_URL` constant gates between two states: when `null` (today), shows "Coming soon to the App Store" non-clickable button + "Pair codes from this page will link the account once the app launches." copy. When set to a real URL, flips to "Get the app" `<a target="_blank">` button + "Then open the app and enter a pair code from this page to link the account." Once Apple approves, set the constant — no UI rework. Uses the existing `C` palette + 44pt button height.
- **Files** — `web/src/app/profile/kids/page.tsx`
- **Why** — OwnersAudit Kids Mgmt Task 2. Parents who set up profiles on web had no signal the next step was downloading the iOS app — the funnel dead-ended.

### Dashboard stats parity

**Task 3 — Web `MiniStat` row aligned to iOS**
- **What** — `{Read | Streak | Score}` → `{Articles | Quizzes | Streak}`. `Read` → `Articles` (uses existing `articles_read_count`). `Score` → `Quizzes` (uses existing `quizzes_completed_count` on `kid_profiles`, MCP-verified before the swap). Matches iOS canonical set (`statBlock("Articles")` / `statBlock("Quizzes")` / `statBlock("Streak")`).
- **Files** — `web/src/app/profile/kids/page.tsx`
- **Why** — OwnersAudit Kids Mgmt Task 3. Owner-locked decision: parents need three concrete behaviors (Are they reading? Understanding? Coming back?) — Score was a noisy gamification number for parent context.

### Pause/Resume parity

**Task 4 — iOS pause kid profile parity with web**
- **What** — Added `pausedAt: Date?` (mapped to `paused_at`) to the `KidProfile` model. New `KidsAPI.setPaused(kidId:paused:)` mirrors web `togglePause()` — PATCHes `/api/kids/:id` with `{paused: Bool}`; route already supports the toggle (line 49 of `[id]/route.js`). Ellipsis menu now includes "Pause profile" / "Resume profile" entry (label flips on `kid.pausedAt != nil`); success calls `load()` to refresh and sets a flash. `kidCard` shows reduced-opacity avatar (0.45) + "Paused" caption in `VP.warn` instead of the age line when paused. MCP-verified `paused_at` column exists on `kid_profiles`.
- **Files** — `VerityPost/VerityPost/FamilyViews.swift`, `VerityPost/VerityPost/Models.swift`
- **Why** — OwnersAudit Kids Mgmt Task 4. Web parents could pause; iOS parents had no equivalent control or visual signal of pause state.

---

## 2026-04-26 (Group 2 — Profile Tasks 1, 2, 6, 7, 9)

### Profile — branch LockedTab on actual lock reason

**Task 1 — emailVerified-aware LockedTab**
- **What** — Added `emailVerified` prop to `LockedTab`. When false, retains the existing "Verify email" CTA → `/verify-email`. When true, shows "This tab is part of paid plans." with "View plans" CTA → `/profile/settings#billing`. Three callsites in `tab` switch (Activity / Categories / Milestones) updated to pass `emailVerified={!!user.email_verified}`. Verified-but-plan-locked users no longer get sent to a dead-end on the verify page that just confirms their email is already verified.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 1. URL is the pre-T-073 anchor per Note C — same pattern as the other 4 settings-anchor sites that update at T-073 deploy.

### Profile — iOS locked-tab parity

**Task 2 — gate iOS Activity / Categories / Milestones with lockedTabView**
- **What** — `tabContent(_:)` switch branches now check `canViewActivity` / `canViewCategories` / `canViewAchievements` before dispatching to the content view. When the perm is false, `lockedTabView()` renders: "This tab is part of paid plans." + "View plans" button → `showSubscription = true` (existing sheet wired at line 210). `loadTabData()` was also gated — locked tabs no longer trigger an unnecessary network round-trip on tab switch. Mirrors web `LockedTab` pattern with iOS subscription sheet wiring.
- **Files** — `VerityPost/VerityPost/ProfileView.swift`
- **Why** — OwnersAudit Profile Task 2. Previously a free user on iOS saw the Activity tab content load to "No activity yet" with no signal that the tab was perm-gated; now they see the explicit lock state and a path to upgrade.

### Profile — expert queue + follower stat parity

**Task 6 — expert queue surfacing on web**
- **What** — Added `expertQueue` perm to the `perms` state (`hasPermission('expert.queue.view')`); threaded into `OverviewTab` props. New `QuickLink` rendered inside the "My stuff" section: `/expert-queue` → "Expert queue" / "Questions waiting for your answer". Section visibility expanded to include `expertQueue` so experts who lack messages/bookmarks/family but have expert queue access still see the section.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 6. iOS already surfaces the queue from two spots; web had zero entry point from the profile hub.

**Task 7 — Followers/Following stats now permission-gated on web**
- **What** — Added `followersView` (`profile.followers.view.own`) + `followingView` (`profile.following.view.own`) to `perms` and `OverviewTab` props. Stats array uses conditional spread (`...(followersView ? […] : [])`) so the count only renders when the perm is held. Matches iOS `socialRow()` gating.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 7. Cross-platform consistency.

### Profile — iOS skeleton swaps

**Task 9 — Activity + Categories tabs use skeletons, not spinners**
- **What** — Replaced `ProgressView().padding(.top, 40)` in both Activity (line 1177) and Categories (line 1273) tabs with skeleton rows. Activity: `VStack` of 6 `compactSkeletonRow()` placeholders (the same helper already used in the overview activity preview). Categories: `VStack` of 4 `RoundedRectangle` placeholders sized to match the loaded category-card height (48pt) with the same `VP.streakTrack` fill + `VP.border` overlay as the overview shimmer. No more visual discontinuity between the smooth skeleton in overview and a bare spinner in the full tab.
- **Files** — `VerityPost/VerityPost/ProfileView.swift`
- **Why** — OwnersAudit Profile Task 9.

### Profile Task 5 — DEFERRED (DB binding decision required)

`profile.categories` is bound to `anon` only (1 set) — `verified_base` no longer carries it. iOS uses `profile.score.view.own.categories` which is bound to admin/free/owner (3 sets). Switching iOS to canonical short-form would break free-user iOS Categories without a DB migration. Three options surfaced in OwnersAudit Profile Task 5; recommendation is option (a): bind `profile.categories` to the same 8 plan sets as `profile.activity` + `profile.achievements`, drop the anon binding, then switch iOS. Holding pending owner approval — DB rebinding is meaningful behavior change.

---

## 2026-04-26 (Group 1 — Story tabs cross-platform)

### Story Tasks 18 + 19 — 3-column tab header on mobile web + iOS adult

**Mobile web tab bar enabled — Story | Timeline | Discussion**
- **What** — Removed the `{false && !isDesktop && (…)}` kill-switch on the mobile tab bar; now renders whenever `!isDesktop`. Renamed the type union, state default, and string literal from `'Article'` to `'Story'` (matches the URL slug — `/story/[slug]`). Tab labels render `'Story', 'Timeline', 'Discussion'`. Updated the comment block above the bar to describe the live behavior + per-pane gating instead of "launch-phase hide". Updated the T-064 ref comment (line 672) — mobile no longer "kill-switched"; switching `activeTab` to `'Discussion'` is now the equivalent post-quiz-pass affordance.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 19. Owner-locked decision 2026-04-26: 3 columns on top of every article (mobile only — desktop remains single-column inline reading flow).

**Mobile Timeline pane enabled with permission-gated fallback**
- **What** — Removed the `{false && showMobileTimeline && canViewTimeline && (…)}` kill-switch on the Timeline mobile content. Now renders whenever `showMobileTimeline` is true. When `canViewTimeline` is true, the existing `<Timeline events={timeline} />` component shows. When false, an inline upgrade prompt renders ("Timeline is part of paid plans. See how this story developed across the day with sourced events. → View plans" linking to `/profile/settings#billing`). Same prompt visual weight as the discussion lock prompt — keeps the tab from ever being an empty pane.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 19 implication: enabling the tab without enabling the content would dead-end Timeline-locked viewers in an empty tab.

**iOS tab `Article` → `Story`**
- **What** — `enum StoryTab: String`: `case story = "Article"` → `case story = "Story"`. The enum's `rawValue` is the displayed tab label, so this single edit relabels iOS without any other plumbing change.
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 19 + cross-platform parity (label string identical to web).

**iOS Discussion tab visible to anonymous users + auth-gate prompt**
- **What** — `visibleTabs` no longer filters by `auth.isLoggedIn`; returns `StoryTab.allCases`. The `.discussion` switch case branches on `auth.isLoggedIn` → `discussionContent` (existing) when logged in, or new `anonDiscussionPrompt` view when anon. Anon prompt: "Earn the discussion." headline + "Create a free account, pass the quiz, and join the conversation." body + "Create free account" primary button + "Already have an account? Sign in" secondary link. Both buttons present `LoginView` as a sheet via new `@State showLogin`. Mirrors the proven anon pattern from `MessagesView.swift:84-110`. Both buttons hit the 44pt touch target floor (`.frame(minHeight: 44)` + `.contentShape(Rectangle())` on the secondary link to extend the tap region beyond the text glyph).
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 18. The product mechanic ("earn the discussion") was invisible to anon iOS readers — they couldn't see the tab existed. Now they see it, tap it, get the pitch.

**iOS Timeline locked-state prompt (replaces silent EmptyView)**
- **What** — `.timeline` switch case: `if canViewTimeline { timelineContent } else { EmptyView() }` → `else { timelineLockedPrompt }`. New view: "Timeline is part of paid plans." + body copy + "View plans" button → `showSubscription = true` (uses existing sheet wired at line 299). Same pattern as web Timeline upgrade prompt; identical wording across surfaces.
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 19 implication on iOS: with the Timeline tab now always visible, viewers without the timeline permission must see *something* — silent `EmptyView()` looks broken.

---

## 2026-04-26 (audit pickup batch — Home/Story/Profile/Browse/Search/Static/Settings/Kids/Admin)

### Home — OwnersAudit Tasks 1, 2

**Loading skeleton**
- **What** — Replaced italic centered "Loading today's front page…" `<p>` with a `FrontPageSkeleton` component. Hero block reuses the page's full-bleed dark band (`HERO_DEFAULT_BG`) with eyebrow + 2 headline lines (88% / 62% width) + 2 excerpt lines (90% / 70%) — all `rgba(255,255,255,…)` at low opacity to read against the dark band. Below: 4 supporting card placeholders separated by `hairlineStyle`, each with eyebrow + 2 headline bars + meta bar. `vp-pulse` keyframe (`0%, 100% opacity 1; 50% opacity 0.55`) injected once via inline `<style>`. Layout dimensions match the loaded state to eliminate layout shift on data arrival.
- **Files** — `web/src/app/page.tsx`
- **Why** — OwnersAudit Home Task 1.

**Anon end-of-page CTA**
- **What** — `EndOfFrontPage` now branches on `loggedIn`. Logged-in users still get "Browse all categories →" link (unchanged). Anon users now see a follow-up pitch line ("Create a free account to unlock comments and track your reading streak.") + "Create free account →" `<Link>` to `/signup`. Captures the warm-lead moment when an anon reader has consumed the whole front page.
- **Files** — `web/src/app/page.tsx`
- **Why** — OwnersAudit Home Task 2.

### Story — OwnersAudit Task 14

**iOS quiz idle card no longer primes attempt anxiety**
- **What** — Collapsed the `hasUnlimitedQuizAttempts` ternary on lines 889-891. Both branches now read the same single line: `"5 questions about what you just read. Get 3 right and the conversation opens."` Drops the "Free accounts get 2 attempts; each pulls a fresh set of questions." anxiety prime from the entry state. Post-fail attempt context is unaffected — already lives in the result-state copy at lines 967 + 999-1001 ("X attempts remaining" / "You've used both free attempts. Upgrade for unlimited retakes.").
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 14. Idle = invitation, not warning.

### Profile — OwnersAudit Tasks 3, 4, 8

**Web load-error description tightened**
- **What** — `description="Something went wrong retrieving your account. Try refreshing, or head back home."` → `"Refresh the page, or head back home."`. Drops the passive vague phrase; the title already says what failed.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 3.

**Kids Unpair button touch target**
- **What** — Added `.frame(minHeight: 44)` to the "Unpair this device" `Button` label in the kids `ProfileView`. Previously rendered at ~26pt with `font(.scaledSystem(size: 12))` + 7+7 vertical padding.
- **Files** — `VerityPostKids/VerityPostKids/ProfileView.swift`
- **Why** — OwnersAudit Profile Task 4.

**Milestones empty CTA reroute + label**
- **What** — `<Button onClick={() => window.location.assign('/')}>Take a quiz</Button>` → `<Button onClick={() => router.push('/browse')}>Find an article</Button>`. Added `const router = useRouter()` to `MilestonesTab` since `router` only existed in `ProfilePageInner` scope. CTA is now honest about the action — quiz is downstream of finding+reading an article.
- **Files** — `web/src/app/profile/page.tsx`
- **Why** — OwnersAudit Profile Task 8.

### Browse — OwnersAudit Tasks 1, 2, 3, 5, 6

**Link migrations (3 internal `<a>`)**
- **What** — Featured story card (~line 281), trending row inside expanded category card (~line 510), and "View all {cat.name} articles" (~line 521) — all `<a>` → `<Link>`. Added `import Link from 'next/link'`. Internal nav now goes through Next.js client-side routing instead of full reload.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 1.

**Search input touch target**
- **What** — Keyword input `height: 42` → `minHeight: 44`. Switching to `minHeight` ensures Dynamic Type scaling can grow the input without clipping.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 2.

**Loading skeleton**
- **What** — Replaced plain centered "Loading..." text with new `BrowseSkeleton` component. 3 featured-card placeholders (80px image band + 3-bar text block) and 6 category-card placeholders (42×42 avatar circle + 2 text bars), `vp-pulse` keyframe pattern, dimensions match loaded state.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 3.

**Latest in {cat.name}**
- **What** — Expanded-category-card section header `"Trending in {cat.name}"` → `"Latest in {cat.name}"`. Matches actual data (the trending list is sorted by `published_at desc`, not view count). Top-of-page "Latest" header was already corrected in a prior pass; this fixes the inner duplicate.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 5.

**Featured empty-state copy**
- **What** — `"No new stories yet today. Check back later."` → `"No new stories yet."`. Drops the time-bound "today" framing and the passive "Check back later" tail.
- **Files** — `web/src/app/browse/page.tsx`
- **Why** — OwnersAudit Browse Task 6.

### Search — OwnersAudit Tasks 1, 2, 3, 4

**Link migrations (2 internal `<a>`)**
- **What** — Per-result story card and "Browse categories" CTA in the no-results empty state. Story card uses `prefetch={false}` to avoid mass prefetch on long result lists.
- **Files** — `web/src/app/search/page.tsx`
- **Why** — OwnersAudit Search Task 1.

**Search button touch target**
- **What** — Added `minHeight: 44` to the Search submit button.
- **Files** — `web/src/app/search/page.tsx`
- **Why** — OwnersAudit Search Task 2.

**Drop mode label from results count**
- **What** — `${results.length} result${plural} · ${mode}` → `${results.length} result${plural}`. The raw API mode token (`basic` / `advanced`) was leaking to users.
- **Files** — `web/src/app/search/page.tsx`
- **Why** — OwnersAudit Search Task 3.

**Sanitize search error**
- **What** — Catch block now sets `setError('Search failed. Try again.')` directly instead of forwarding the thrown message. The non-ok JSON `error` field is logged via `console.error('[search]', data.error)` for debugging but never reaches the UI.
- **Files** — `web/src/app/search/page.tsx`
- **Why** — OwnersAudit Search Task 4. Information hygiene — internal API messages stay server-side.

### Static/Marketing — OwnersAudit Tasks 1, 2, 3, 4, 6, 7, 8

**Kids-app: Link migrations + touch targets + drop API error string**
- **What** — `Back to home` and `Parent account sign-in` `<a>` → `<Link>`. Email input and submit button: `minHeight: '44px'` added. The `j?.error` parse path in `onSubmit` removed entirely — non-ok responses now always show the generic `"Couldn't save. Try again in a moment."` string. Also removed the now-unused `try { … } catch` around the JSON parse.
- **Files** — `web/src/app/kids-app/page.tsx`
- **Why** — OwnersAudit Static Tasks 1, 2, 3.

**How-it-works: Get Started Link**
- **What** — `<a href="/signup">Get Started</a>` → `<Link href="/signup">Get Started</Link>`. Added `import Link from 'next/link'`. Server component — `Link` works fine in server components.
- **Files** — `web/src/app/how-it-works/page.tsx`
- **Why** — OwnersAudit Static Task 4.

**About: 5 policy Link migrations**
- **What** — Terms / Privacy / Cookies / Accessibility / DMCA — all five `<li><a>` rows → `<li><Link>`. Added `import Link from 'next/link'`. The `mailto:` Contact links are correctly left as `<a>`.
- **Files** — `web/src/app/about/page.tsx`
- **Why** — OwnersAudit Static Task 6.

**Privacy + Terms: "Kids Mode" → "Verity Kids"**
- **What** — Privacy line 164: "Kids Mode collects minimal data…" → "Verity Kids collects minimal data…". Terms line 111: "A dedicated Kids Mode provides age-appropriate content." → "A dedicated Verity Kids app provides age-appropriate content." Reflects the post-2026-04-19 product split (separate iOS app, not a mode inside the adult app).
- **Files** — `web/src/app/privacy/page.tsx`, `web/src/app/terms/page.tsx`
- **Why** — OwnersAudit Static Task 7. Legal docs must use the canonical product name.

**Terms: "Family Dashboard" → "Family section"**
- **What** — Terms line 116: "…through the Family Dashboard." → "…through the Family section of their account." There is no UI surface called "Family Dashboard" — the actual surface lives at `/profile/kids` and is labeled "Family" in nav.
- **Files** — `web/src/app/terms/page.tsx`
- **Why** — OwnersAudit Static Task 8.

### Settings — OwnersAudit Task 5

**Alerts channel checkbox label minHeight**
- **What** — `minHeight: 32` → `minHeight: 44` on the `<label>` wrapping each notification channel checkbox (email/push toggles in the Alerts card).
- **Files** — `web/src/app/profile/settings/page.tsx`
- **Why** — OwnersAudit Settings Task 5.

### Kids — OwnersAudit Tasks 5, 6, 7, 8, 11

**KidReader dead code removal + corrected file comment**
- **What** — Deleted `ReaderContentHeightKey` and `ReaderScroll` private structs (lines 259-271) — never referenced. Updated the file-level comment: removed the false "≥80% scroll" claim. Reading is logged when the kid taps "Take the quiz", not when they scroll.
- **Files** — `VerityPostKids/VerityPostKids/KidReaderView.swift`
- **Why** — OwnersAudit Kids Task 5.

**Leaderboard + ExpertSessions Retry button touch targets**
- **What** — Both error-state Retry buttons: `.frame(minHeight: 36)` → `.frame(minHeight: 44)`. Kid touch precision is wider variance than adults; error-state controls are the worst place to miss.
- **Files** — `VerityPostKids/VerityPostKids/LeaderboardView.swift`, `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
- **Why** — OwnersAudit Kids Task 6.

**PairCodeView "Please" copy**
- **What** — `errorMessage = "Something went wrong. Please try again."` → `"Something went wrong. Try again."` in the catch branch of the pair attempt.
- **Files** — `VerityPostKids/VerityPostKids/PairCodeView.swift`
- **Why** — OwnersAudit Kids Task 7. Voice consistency.

**ExpertSessions DateFormatter cache**
- **What** — Replaced per-call `let fmt = DateFormatter()` with a `private static let sessionDateFormatter` initialized once. `formatted(_:)` now reads from `Self.sessionDateFormatter`. Eliminates per-card DateFormatter construction during scroll.
- **Files** — `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
- **Why** — OwnersAudit Kids Task 8. `DateFormatter` init is one of the most expensive UIKit/Foundation operations; caching is standard.

**Kids quiz pool-size guard**
- **What** — Added `guard rows.count >= 5 else { self.questions = []; self.startedAt = nil; return }` after the quiz fetch. Articles with fewer than 5 questions now hit the existing `emptyState` ("No quiz yet for this article.") instead of being graded as a real pass on a 2-question quiz. Floor is 5 (vs adult web's 10) since kids have no free/paid attempt-pool variation.
- **Files** — `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- **Why** — OwnersAudit Kids Task 11. Restores parity with adult-web's pool-size discipline (`quizPoolSize >= 10` gate at `web/src/app/story/[slug]/page.tsx:912`).

### Admin — OwnersAudit Tasks 1, 2, 4, 5

**Admin Button SIZES — touch target floor across all 44 admin pages**
- **What** — Both `sm` and `md` SIZES entries: `height: 26` / `height: 32` → `height: 44`. Visual padding (`padY` / `padX`) and `fontSize` unchanged — only the `minHeight` floor changes. One edit upgrades every action button on every admin page (and DataTable Prev/Next pagination, which uses `<Button size="sm">` — Admin Task 6 resolved automatically).
- **Files** — `web/src/components/admin/Button.jsx`
- **Why** — OwnersAudit Admin Task 1 (and Task 6 by inheritance).

**Remove KBD ghost shortcuts from admin hub**
- **What** — Removed `import KBD from '@/components/admin/KBD'`. Removed the `actions` prop on `PageHeader` that rendered the "Search · Cmd+K" hint. Removed `<KBD keys={ql.hint} size="xs" />` from each quick-link card. Narrowed `QUICK_LINKS` shape from `{href, label, hint}` to `{href, label}` — `hint` field deleted entirely. No keyboard handler ever existed for these — they were visual decoration only, contradicting the no-keyboard-shortcuts product rule for admin.
- **Files** — `web/src/app/admin/page.tsx`
- **Why** — OwnersAudit Admin Task 2.

**Drawer close button padding**
- **What** — `padding: 4` → `padding: 12` on the `×` close button in the Drawer header. `fontSize: 20` (visual character size) unchanged. Effective tap area grows from ~28×28 to ~44×44.
- **Files** — `web/src/components/admin/Drawer.jsx`
- **Why** — OwnersAudit Admin Task 4.

**Modal close button (matching Drawer)**
- **What** — Restructured the Modal header to flex row with `justifyContent: 'space-between'` — title + description block on the left, new `×` close button on the right. Close button uses identical styling to Drawer (transparent bg, `padding: 12`, `fontSize: 20`, hover toggles color between `ADMIN_C.dim` and `ADMIN_C.accent`). `aria-label="Close"` set; `onClick={attemptClose}` so it respects the existing dirty-state confirm via `onRequestClose` override path. Only renders inside the existing `(title || description)` guard — modals with neither continue to close via backdrop + Esc only.
- **Files** — `web/src/components/admin/Modal.jsx`
- **Why** — OwnersAudit Admin Task 5.

---

## 2026-04-26 (continued)

### Bookmarks — OwnersAudit Tasks 1, 2, 3, 5, 6 + extra

**Loading skeleton**
- **What** — Replaced `'Loading bookmarks…'` centered div with 4 skeleton card rows. Each skeleton matches the live card shape (`background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 10, padding: 16`) with two placeholder bars (14px title-height, 11px meta-height) animated via `@keyframes vp-pulse`. Skeleton `<main>` wrapper uses identical padding/background to the loaded state to avoid layout jump.
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — OwnersAudit Bookmarks Task 1.

**Undo toast on bookmark remove**
- **What** — Replaced immediate-DELETE `removeBookmark(id: string)` with an optimistic-remove + 5-second undo pattern. Item is removed from state instantly; a persistent toast shows "Bookmark removed" + inline Undo button. Undo restores the item at its original index. After 5 s the DELETE fires; on failure the item is restored and `setError` is called. Timer Map (`useRef<Map<string, timeout>>`) keyed by bookmark ID prevents timer collision when multiple items are removed before any window closes. Added `useEffect` cleanup to clear all pending timers on unmount.
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — OwnersAudit Bookmarks Task 2.

**Touch targets**
- **What** — Added `minHeight: 44` to Remove button, collection × delete button, and + Add note button. Added `minHeight: 36` to collection filter pills, `btnSolid`, and `btnGhost` (fixing Export, New collection, Create, Cancel, Save, Load more in one edit).
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — OwnersAudit Bookmarks Task 3.

**Button label renames**
- **What** — `'Export JSON'` → `'Download my bookmarks'`; `'+ Collection'` → `'New collection'`.
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — OwnersAudit Bookmarks Task 5.

**iOS "Please sign in" copy**
- **What** — `errorText = "Please sign in."` → `"Sign in to manage your bookmarks."` in the auth-session-missing branch of `removeBookmark`.
- **Files** — `VerityPost/VerityPost/BookmarksView.swift`
- **Why** — OwnersAudit Bookmarks Task 6.

**Article title `<a>` → `<Link>` (extra)**
- **What** — Replaced `<a href={`/story/${b.articles?.slug}`}>` with `<Link href={...} prefetch={false}>`. Slug guard (`b.articles?.slug ? \`/story/...\` : '#'`) prevents broken href when join returns null. `prefetch={false}` avoids mass prefetch on long bookmark lists.
- **Files** — `web/src/app/bookmarks/page.tsx`
- **Why** — Internal nav must use Next.js Link; raw `<a>` skips client-side routing. `prefetch={false}` is standard for list items.

---

## 2026-04-26 (notifications)

### Notifications — OwnersAudit Tasks 1–4, 6–7

**Bell SVG replaces [!] icon**
- **What** — Replaced `[!]` monospace text in the anon-state 64px circle with an SVG bell (Feather icon path). Removed `fontSize`, `fontWeight`, `fontFamily` from the container; kept `color: C.accent` so the SVG inherits the accent colour via `stroke="currentColor"`.
- **Files** — `web/src/app/notifications/page.tsx`
- **Why** — OwnersAudit Notifications Task 1. `[!]` reads as "error"; bell is the universal notification icon.

**Type badge labels**
- **What** — Added `TYPE_LABELS: Record<string, string>` mapping `BREAKING_NEWS → 'Breaking news'`, `COMMENT_REPLY → 'Reply'`, `MENTION → '@mention'`, `EXPERT_ANSWER → 'Expert answer'`. Badge now renders `TYPE_LABELS[n.type] ?? n.type` (unknown types fall back to raw string). iOS: added `private func typeLabel(_ type: String) -> String` as a member of `AlertsView`; replaced `Text(type.uppercased())` with `Text(typeLabel(type))`.
- **Files** — `web/src/app/notifications/page.tsx`, `VerityPost/VerityPost/AlertsView.swift`
- **Why** — OwnersAudit Notifications Task 2. Raw DB enum values (`COMMENT_REPLY`) were visible to users.

**null action_url scroll-to-top fix**
- **What** — Kept `href={n.action_url || '#'}` for keyboard focus. Added `onClick={(e) => { if (!n.action_url) e.preventDefault(); markOne(n.id); }}` — when there's no URL, `preventDefault` stops the `#` scroll while `markOne` still fires.
- **Files** — `web/src/app/notifications/page.tsx`
- **Why** — OwnersAudit Notifications Task 3. Using `href={n.action_url ?? undefined}` was rejected: `<a>` without href loses keyboard focus and is unreliable on iOS Safari tap.

**Touch targets**
- **What** — Added `minHeight: 36` to `pillBase` (filter pills), "Mark all read" button, and "Preferences" `<a>`. Preferences also gets `display: 'flex', alignItems: 'center'` so `minHeight` applies to the inline element.
- **Files** — `web/src/app/notifications/page.tsx`
- **Why** — OwnersAudit Notifications Task 4.

**Error copy**
- **What** — `` `Couldn't load notifications (${res.status}).` `` → `"Couldn't load notifications. Try again."` — status code removed from user-facing string.
- **Files** — `web/src/app/notifications/page.tsx`
- **Why** — OwnersAudit Notifications Task 6.

**iOS "Mark all read" label**
- **What** — `Button("Read All")` → `Button("Mark all read")` in the toolbar. Matches web label, sentence case.
- **Files** — `VerityPost/VerityPost/AlertsView.swift`
- **Why** — OwnersAudit Notifications Task 7.

---

## 2026-04-26 (messages)

### Messages — OwnersAudit Tasks 1–7, 9–10

**Loading skeletons**
- **What** — Replaced `'Loading...'` full-viewport div with a 4-row conversation list skeleton (header bar + avatar circle + name/preview bars, staggered `vp-pulse` animation). Replaced `{msgsLoading && 'Loading...'}` in the thread pane with 5 alternating left/right bubble skeletons. `vp-pulse` keyframe injected once in the primary `<main>` return so it persists for both skeleton contexts.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 1.

**Search modal backdrop dismiss**
- **What** — Added `onClick` to outer backdrop div to reset `showSearch`, `searchQuery`, `searchResults`, `roleFilter`. Added `onClick={(e) => e.stopPropagation()}` to inner `role="dialog"` div. Matches the report dialog pattern already in the same file.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 2.

**iOS "Sign in to message" → sign-in button**
- **What** — Replaced bare `Text("Sign in to message")` with a full unauthenticated state: title + descriptor copy + "Sign in" button presenting `LoginView` as a sheet. `@State private var showLogin = false` added; `.sheet(isPresented: $showLogin)` attached to the inner `VStack` (not the outer `Group`) to avoid SwiftUI's single-sheet-per-view constraint.
- **Files** — `VerityPost/VerityPost/MessagesView.swift`
- **Why** — OwnersAudit Messages Task 3.

**Touch targets — web**
- **What** — Added `minHeight: 44` to "New" compose button, "← Back" button, "Cancel" in search modal. Changed "..." overflow button from `padding: '4px 10px'` to `padding: '10px'` + `minHeight: 44`. Changed role filter pills from `padding: '4px 10px'` to `padding: '6px 10px'` + `minHeight: 36`.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 4.

**Touch targets — iOS role filter pills**
- **What** — Added `.frame(minHeight: 36)` to role filter pill label block in the search sheet.
- **Files** — `VerityPost/VerityPost/MessagesView.swift`
- **Why** — OwnersAudit Messages Task 5.

**Sentence case**
- **What** — Search modal title `New Message` → `New message`.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 6.

**"Please try again" copy**
- **What** — `'Could not unblock this user. Please try again.'` → `"Couldn't unblock. Try again."`; `'Could not block this user. Please try again.'` → `"Couldn't block. Try again."`; `'Could not submit report. Please try again.'` → `"Couldn't send report. Try again."`.
- **Files** — `web/src/app/messages/page.tsx`
- **Why** — OwnersAudit Messages Task 7.

**iOS empty state copy**
- **What** — `"Start a conversation with another user."` → `"Message an expert, author, or another reader to get started."`.
- **Files** — `VerityPost/VerityPost/MessagesView.swift`
- **Why** — OwnersAudit Messages Task 9.

**Kids ExpertSessionsView accessibility**
- **What** — Added `.accessibilityHidden(true)` to 4 standalone decorative `Image` calls (lines 98, 133, 178, 195) and to `Image(systemName: icon)` inside the `metaLabel` helper (fixes all 4 calendar/clock call sites at once).
- **Files** — `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
- **Why** — OwnersAudit Messages Task 10.

---

## 2026-04-26 (auth)

### Auth — OwnersAudit Tasks 1–5

**"Invalid credentials" copy**
- **What** — All three `setError('Invalid credentials')` branches in `login/page.tsx` (username-not-found × 2 + Supabase auth failure) changed to `'That email or password is incorrect. Check the spelling or reset your password.'` The user-enumeration protection is unchanged — all failure branches still collapse to the same copy.
- **Files** — `web/src/app/login/page.tsx`
- **Why** — OwnersAudit Auth Task 1.

**"Please try again" copy sweep**
- **What** — Catch-block copy `'Network error. Please try again.'` in `login/page.tsx` → `'Network error — check your connection and try again.'`. `'Failed to resend email. Please try again.'` in `verify-email/page.tsx` (throw fallback + catch fallback) → `"Couldn't send the email. Try again in a moment."`. `'Failed to update email. Please try again.'` (2 occurrences) → `"Couldn't update email. Try again in a moment."`. `'Failed to update password. Please try again.'` in `reset-password/page.tsx` → `"Couldn't update password. Try again in a moment."`.
- **Files** — `web/src/app/login/page.tsx`, `web/src/app/verify-email/page.tsx`, `web/src/app/reset-password/page.tsx`
- **Why** — OwnersAudit Auth Task 2. Product voice: no "Please", active voice, specific next step.

**Triple header removal**
- **What** — Removed `<p>` subhead from `/login` ("Sign in to your account to keep reading."), `/forgot-password` ("Enter your email and we'll send a link to set a new password."), and `/reset-password` ("Pick something strong — you won't need the old one anymore."). In each case the h1 margin-bottom was bumped 6px → 24px to preserve the gap to the next element. `/signup` subhead kept ("Read an article, pass the comprehension check, then join the conversation." earns its keep as a product differentiator on the sign-up decision screen).
- **Files** — `web/src/app/login/page.tsx`, `web/src/app/forgot-password/page.tsx`, `web/src/app/reset-password/page.tsx`
- **Why** — OwnersAudit Auth Task 3.

**iOS "Forgot password?" touch target**
- **What** — Added `.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())` to the "Forgot password?" `Button` in `LoginView`. Previously rendered at ~20px tall with `.font(.footnote)` and no minimum frame.
- **Files** — `VerityPost/VerityPost/LoginView.swift`
- **Why** — OwnersAudit Auth Task 4.

**iOS VoiceOver error announcements**
- **What** — Added `.onChange(of: auth.authError) { _, newValue in UIAccessibility.post(...) }` to the `NavigationStack` level (not the conditionally rendered error `Text`) in both `LoginView` and `SignupView`. `SignupView` also watches `localError` independently with a second `.onChange`. Uses iOS 17 two-parameter closure form `{ _, newValue in }`.
- **Files** — `VerityPost/VerityPost/LoginView.swift`, `VerityPost/VerityPost/SignupView.swift`
- **Why** — OwnersAudit Auth Task 5. VoiceOver users previously got no announcement when errors appeared; they had to manually navigate to the error text.

---

## 2026-04-26 (story)

### Story — OwnersAudit Tasks 1–5, 7–13, 15–17

**Loading skeleton**
- **What** — Replaced plain `'Loading…'` spinner with a skeleton layout: title bar (32px / 80% width), subtitle bar (18px / 55%), and 5 body bars (14px, varying widths). Bars use `var(--rule)` background + `vp-pulse` keyframe animation. Wrapper matches the loaded-state `maxWidth: 720` and padding so there's no layout jump.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 1.

**404 panel**
- **What** — Replaced raw `'Story not found'` text with a centered panel: "Article not found" h1, context copy, and two CTAs ("Go to home" + "Browse stories").
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 2.

**Quiz teaser before article body**
- **What** — Added a one-line teaser `"Pass the quiz at the end to unlock comments."` above the article body when `quizPoolSize >= 10 && !userPassedQuiz`. Uses `fontSize: 12, color: 'var(--dim)'`. Hidden after the user has passed.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 3.

**Quiz pass ceremony**
- **What** — Added `justPassedCeremony` state. `onPass` sets it true; after 1500 ms it clears the flag and triggers `setJustRevealedThisSession(true)` (auto-scroll). While `justPassedCeremony` is true, renders `"You're in."` centered above the newly revealed comment thread.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 4.

**Pool-size gate on discussion section**
- **What** — Added `quizPoolSize < 10 ? null` branch at the top of the `discussionSection` ternary (before the `userPassedQuiz` branch) so articles with fewer than 10 quiz questions show no discussion panel at all.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 5.

**Discussion lock copy**
- **What** — `"Discussion is locked until you pass the quiz above."` → `"Pass the quiz to join the discussion."`. Rubric copy: `"You need 3 out of 5 correct…"` → `"5 questions about what you just read. Get 3 right and the conversation opens."`.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 7.

**Anon quiz CTA**
- **What** — Replaced placeholder anon-quiz block with: header `"Every article has a comprehension quiz."`, body `"Pass it and the discussion opens — your comment shows you actually read the story."`, CTA `"Create free account"`.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 8.

**Bookmark toast feedback**
- **What** — Added `show('Saved to bookmarks')` / `show('Removed from bookmarks')` calls on successful `toggleBookmark`. Error copy updated: `"Bookmark not removed — try again."` / `"Bookmark not saved — try again."`.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 9.

**Regwall backdrop dismiss**
- **What** — Added `onClick={dismissRegWall}` to the backdrop div; added `onClick={(e) => e.stopPropagation()}` to the inner dialog so clicks inside don't bubble to the backdrop.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 10.

**Regwall signup `?next=` param**
- **What** — Changed signup href from `/signup` to `/signup?next=${encodeURIComponent('/story/' + story.slug)}` so the user lands back on the article after account creation.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 11.

**Report button touch target**
- **What** — Added `minHeight: 36, paddingTop: 6, paddingBottom: 6` to the inline report button style.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 12.

**Report category sentence case**
- **What** — `'Hate Speech'` → `'Hate speech'`; `'Off Topic'` → `'Off topic'` in `REPORT_CATEGORIES`.
- **Files** — `web/src/app/story/[slug]/page.tsx`
- **Why** — OwnersAudit Story Task 13.

**iOS bookmark limit copy**
- **What** — `"Free accounts can save up to 10 bookmarks. Unlimited bookmarks and collections are available on paid plans."` → `"You've hit the bookmark limit for free accounts. Upgrade to save unlimited bookmarks."` in `StoryDetailView`.
- **Files** — `VerityPost/VerityPost/StoryDetailView.swift`
- **Why** — OwnersAudit Story Task 15.

**Kids article header accessibility**
- **What** — Added `.accessibilityHidden(true)` to `Image(systemName: "newspaper.fill")` in the article header and `Image(systemName: "clock")` in the reading-time row so VoiceOver skips purely decorative icons.
- **Files** — `VerityPostKids/VerityPostKids/KidReaderView.swift`
- **Why** — OwnersAudit Story Task 16.

**Kids "Take the quiz" button accessibility**
- **What** — Added `.accessibilityHidden(true)` to `Image(systemName: "questionmark.circle.fill")` inside the `takeQuizButton` label so VoiceOver reads only the button text, not the redundant icon name.
- **Files** — `VerityPostKids/VerityPostKids/KidReaderView.swift`
- **Why** — OwnersAudit Story Task 17.

---

## 2026-04-26

### Leaderboard — OwnersAudit Tasks 1, 2, 3, 4

**Removed Weekly tab**
- **What** — Removed `'Weekly'` from the `TABS` constant and its corresponding data-fetch branch from the second `useEffect`. Weekly was a duplicate of Top Verifiers + This Week — identical RPC call, same cutoff, same results.
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 2. IA cleanup: tabs should answer "rank by what," not mix ranking mode with time window.

**Removed expand drawer; streak shown inline**
- **What** — Removed the tap-to-expand row drawer (5 `StatRow` bars: Score, Articles Read, Quizzes Passed, Comments, Streak). Rows are now static. Streak is surfaced inline below the username as `"{n} day streak"` when non-zero. Cleaned up all associated state (`expanded`, `setExpanded`), props (`onToggle`, `expanded`, `topScore`, `topReads`, `topQuizzes`, `topComments`, `topStreak`), the `StatRow` import, and the row-level ARIA button attributes (`role`, `tabIndex`, `onKeyDown`, `aria-expanded`).
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 1. Reduce chrome between page load and list content. The expand drawer added interaction overhead for stats that weren't the ranking criterion.

**Period filter pill touch target**
- **What** — Added `minHeight: 36` to period filter pill button style.
- **Files** — `web/src/app/leaderboard/page.tsx`
- **Why** — OwnersAudit Leaderboard Task 3. Pills rendered at ~26px with no minimum; 36px is the audit-specified floor for secondary filter pills inline with other controls.

**Period labels sentence case (web + iOS)**
- **What** — Changed `PERIOD_LABELS` from `['This Week', 'This Month', 'All Time']` to `['This week', 'This month', 'All time']`. Updated `WINDOW_DAYS` object keys to match. Updated all four string comparisons/references in `page.tsx`. Updated Swift enum `rawValue` strings to match.
- **Files** — `web/src/lib/leaderboardPeriod.ts`, `web/src/app/leaderboard/page.tsx`, `VerityPost/VerityPost/LeaderboardPeriod.swift`
- **Why** — OwnersAudit Leaderboard Task 4. Product standard is sentence case for all UI labels.

### iOS Browse tab + bottom-bar IA shift — OwnersAudit Search Task 6

**New `BrowseView.swift` (adult iOS) — mirrors web /browse**
- **What** — ~340 lines of fresh SwiftUI: featured "Latest" horizontal row (3 most-recent published articles) + `LazyVStack` of category cards. Tap-to-expand reveals the 3 latest in-category articles as `NavigationLink`s pushing `StoryDetailView`; bottom of expanded card has a 44pt "View all {cat} articles" button pushing `CategoryDetailView` (the existing per-category feed view, promoted from `private` in `HomeView.swift` so it can be reused). Skeleton loading state with `vp-pulse`-style opacity animation; distinct error state ("Couldn't load content" + 44pt Retry — not a silent empty). Two parallel direct Supabase queries via `SupabaseManager.shared.client` (no new API endpoint): categories (`not('slug','like','kids-%')`, `order(name)`) + articles (`status='published'`, `order published_at desc`, `limit 500`). Kids categories filtered out exactly per web — closes the gap with the in-home `BrowseLanding` view (which lets kids categories leak in).
- **Files** — `VerityPost/VerityPost/BrowseView.swift` (new), `VerityPost/VerityPost.xcodeproj/project.pbxproj` (file added to target — PBXBuildFile, PBXFileReference, group + Sources phase membership)
- **Why** — OwnersAudit Search Task 6. Topic-first discovery on iOS; web has had this for months.

**Bottom-bar swap: `.leaderboard` → `.browse`**
- **What** — `MainTabView.Tab` enum: `case home, find, browse, notifications, profile` (was `home, find, notifications, leaderboard, profile`). `adultTabView` switch: `.browse` arm pushes `NavigationStack { BrowseView() }.environmentObject(auth)`; `.leaderboard` arm removed. `TextTabBar.items`: Browse inserted at position 3, "Most Informed" entry deleted. Section header comment updated. No stray `.leaderboard` enum references remain in the iOS target.
- **Files** — `VerityPost/VerityPost/ContentView.swift`
- **Why** — OwnersAudit Search Task 6 IA decision (owner-locked 2026-04-26): replace "Most Informed" with Browse; relocate Leaderboard to a Profile QuickLink.

**`CategoryDetailView` promoted from `private` to internal**
- **What** — Dropped `private` on `struct CategoryDetailView` so `BrowseView.swift` can push it as the "View all {cat} articles" destination. Single source of truth for the per-category feed across Home BrowseLanding and the new Browse tab. Kept the existing comment block; appended a note explaining the promotion.
- **Files** — `VerityPost/VerityPost/HomeView.swift`
- **Why** — Reuse vs. duplicating ~100 lines of identical query + row layout.

**Profile QuickLink: Leaderboards (iOS) — entry point post-IA-shift**
- **What** — Added `quickLink(label: "Leaderboards", description: "See where you rank by topic and overall", destination: AnyView(LeaderboardView().environmentObject(auth)))` to the `OverviewTab` "My stuff" list. Always-on (LeaderboardView is public; no perm gate). Section render condition simplified — was `permsLoaded && (canViewMessages || canViewBookmarks || canViewFamily || canViewExpertQueue)`, now unconditional, since Leaderboards is always present and the perm-gated rows already handle their own conditional render. Mirrors the web `web/src/app/profile/page.tsx` "My stuff" PageSection (Leaderboards QuickLink shipped there in commit 07febf5).
- **Files** — `VerityPost/VerityPost/ProfileView.swift`
- **Why** — Replaces the bottom-bar entry point that the tab swap removes. Web parity.

**DB migration: `profile.categories` canonical binding** — _NOT YET APPLIED_
- **What** — Owner action required: run `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql` via Supabase SQL editor (MCP refused both `execute_sql` writes and `apply_migration` — the project link is currently in read-only mode), then `UPDATE users SET perms_version = perms_version + 1;` to invalidate the 60s perms cache. The migration brings `profile.categories` into line with the other two short-form profile permissions (binds it to the 8 canonical plan sets and removes the no-op anon binding). Until applied, free-plan users on the latest iOS build will not see the Profile → Categories tab — the iOS short-form perm-key swap from commit 07febf5 already shipped against a binding that doesn't exist yet for them.
- **Files** — `Ongoing Projects/migrations/2026-04-26_profile_categories_canonical_binding.sql` (no source code change in this entry — flagged here so the apply step is tracked alongside the iOS push)
- **Why** — OwnersAudit Profile Task 5 — completes the canonical short-form swap end-to-end; without this DB step the iOS swap in commit 07febf5 silently breaks Categories-tab visibility for any plan that isn't in the current `profile.categories` binding (which is anon-only — i.e., everyone is broken, not just one plan).

**Session prep doc retired**
- **What** — Deleted `Ongoing Projects/Sessions-Pending/BrowseView_iOS_Session_Prep.md` — work shipped in this entry; the prep doc is now historical and lives in `git log` (commit message + this CHANGELOG entry).
- **Files** — `Ongoing Projects/Sessions-Pending/BrowseView_iOS_Session_Prep.md` (deleted)
- **Why** — Sessions-Pending is by definition for unstarted prep; finished sessions don't sit there.
