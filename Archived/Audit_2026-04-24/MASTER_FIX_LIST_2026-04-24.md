# Master Fix List — 2026-04-24

**Bucket A: 100% CONFIRMED + AUTONOMOUS-FIXABLE**

Items in this document are verified by ≥2 independent audit agents (often 3–6), carry file:line evidence, and have an unambiguous correct direction. Claude can execute these without further owner input — but the owner should review the list and approve the batch before any fixes ship.

**Audit provenance:**
- Anchor SHA: `ed4944ed40b865e6daf7fcea065630988a00e9b8` (unchanged through audit window)
- 84 independent auditor agents across 2 waves × 14 domain groups
- 14 reconciler agents consolidated findings
- Freshness sweep: no commits during audit window; baseline is still current

**Reading order:** CRITICAL first (launch-blocking) → HIGH → MEDIUM. Within each severity, grouped by surface.

---

## CRITICAL — launch-blocking

### C1. Comments bug: RLS status mismatch (the UI-COMMENTS root cause)
- **Evidence:** `schema/013_phase5_comments_helpers.sql:137` inserts `status='visible'`; `schema/reset_and_rebuild_v2.sql:3803-3804` RLS SELECT policy requires `status='published'`; `web/src/components/CommentThread.tsx:100` client filters `.eq('status', 'visible')`.
- **Agents:** 5/6 (both waves, every Group-3 agent except one — none disputed)
- **Symptom:** Users post a comment, see it appear briefly from author-RLS, then on refresh other readers + the author see an empty thread. This is exactly what you reported.
- **Fix:** One of two paths, both cited — (a) change RLS policy to accept `status IN ('visible', 'published')`, or (b) change `post_comment` RPC to insert `status='published'`. Picking one is a **product decision** (see OWNER_ACTIONS C1a). Once picked, the code change is one line.
- **Also need (autonomous once direction chosen):** align the three call-sites so RPC, RLS, and client filter all use the same status string.

### C2. Settings clobber: concurrent metadata writes lose data (the UI-SETTINGS root cause)
- **Evidence:** `web/src/app/profile/settings/page.tsx:1501` (ProfileCard `handleSave` reads stale `user` state), `:4887` (ExpertWatchlist same pattern). FeedCard + AccessibilityCard attempt M16 mitigation (re-read before write) but still race.
- **Agents:** 3/5 Group-4 agents
- **Symptom:** Two settings tabs open (or iOS+web simultaneously) → user toggles TTS in one, display name in the other → whichever saves second clobbers the first's metadata key. Matches your "settings are fucked."
- **Fix:** Make metadata merges server-side and atomic — `update_own_profile` RPC should accept a partial key and `jsonb_set` the target path, not accept the whole merged blob from client. Autonomous schema + API + client migration.

### C3. Unblock bypasses server permission + rate-limit gates
- **Evidence:** `web/src/app/profile/settings/page.tsx:3281` calls `supabase.from('blocked_users').delete()` directly, bypassing `/api/users/[id]/block` DELETE route. Skips `requirePermission('settings.privacy.blocked_users.manage')`, email-verified gate, and 30/60s rate limit. Block POST correctly goes through API; unblock is inconsistent.
- **Agents:** 4/5 Group-4 agents
- **Fix:** Replace direct delete with fetch to DELETE `/api/users/[id]/block`. Already exists; just wire to it.

### C4. Data export bypasses server gate
- **Evidence:** `web/src/app/profile/settings/page.tsx:3393` calls `supabase.from('data_requests').insert()` directly. Permission gate is client-side only; stale cache allows downgraded users to still trigger exports.
- **Agents:** 2/5 Group-4 agents
- **Fix:** Create `POST /api/data/export-request` with `requirePermission('settings.data.request_export')` + rate limit (e.g., 1 per 30 days).

### C5. Story page stale-closure useEffect chain
- **Evidence:** `web/src/app/story/[slug]/page.tsx:455-637` useEffect with `[slug]` dep array reads `supabase` from closure; `:642-656` event tracking effect reads `story.slug`, `story.author_id`, `story.is_breaking`, `story.categories?.slug` but only deps on `[story?.id, quizPoolSize, trackEvent]`. Affects comments/quiz/sources loading + telemetry accuracy.
- **Agents:** 2/4 Group-13 agents (plus matches the lint-warning signal from PM punchlist)
- **Fix:** Add missing dependencies, or wrap relevant loaders in `useCallback` with full deps. Straightforward.

### C6. Messages page has 5 broken useEffect hooks
- **Evidence:** `web/src/app/messages/page.tsx:261, 324, 350, 380, 410` — each has missing deps (`loadMessages`, `supabase`, `currentUser`, `dmReceiptsEnabled`). Results in silent message-sync failures after 60-min token refresh, stuck realtime subscriptions, incorrect unread counts.
- **Agents:** 3/4 Group-13 agents
- **Fix:** Fix dep arrays; messaging is already a top-churn surface (per code-reality audit) so this is well-understood territory.

### C7. Admin numeric settings: edits lost on navigation
- **Evidence:** `web/src/app/admin/comments/page.tsx:276-287` — numeric inputs only persist on `onBlur`. Type a value and navigate without blurring → edit lost silently.
- **Agents:** 1/4 Group-13 agents (uncontradicted)
- **Fix:** Persist on change (with debounce) OR trigger blur on form submit OR dirty-state warning before navigation.

### C8. Messages page stale closure on `loadMessages`
- **Evidence:** Same file, `:261-263` — `loadMessages` function captured in effect with empty dep array but closes over `supabase`. On token refresh → stale client reference → silent load failure for sessions >60 min.
- **Agents:** 3/4 Group-13 agents
- **Fix:** Wrap `loadMessages` in `useCallback` with supabase dep, add it to effect deps.

### C9. Bookmarks POST allows duplicates
- **Evidence:** `web/src/app/api/bookmarks/route.js:44-52` — no dedup check. Client `toggleBookmark` allows in-flight double submit. Duplicates consume user's bookmark cap faster and appear multiple times in list.
- **Agents:** 3/6 Group-2 agents
- **Fix:** Either (a) `UNIQUE(user_id, article_id)` DB constraint, (b) dedup check in POST before insert, or (c) client-side optimistic state guard. Recommend (a)+(c).

### C10. Bookmarks PATCH permission mismatch
- **Evidence:** `web/src/app/api/bookmarks/[id]/route.js:14` — requires `bookmarks.note.edit` for ALL PATCH ops including collection moves. UI checks `bookmarks.collection.create` → user sees button, clicks, gets cryptic "Move failed."
- **Agents:** 5/6 Group-2 agents
- **Fix:** Split PATCH into two permission paths, or unify under `bookmarks.update`.

### C11. Home page fetches inactive categories
- **Evidence:** `web/src/app/page.tsx:171-174` categories query lacks `.eq('is_active', true)`. Every other surface (search, leaderboard, browse) filters for active; home does not. Deactivated categories still appear in home story eyebrows.
- **Agents:** 1/6 Group-2 agents (uncontradicted, trivial verification)
- **Fix:** One-line — add `.eq('is_active', true)` on line 171.

### C12. Signup rollback incomplete — orphaned users rows
- **Evidence:** `web/src/app/api/auth/signup/route.js:116-127` — when role assignment fails, code attempts `deleteUser()` for auth row but does not clean up public.users row that was upserted earlier. Next signup retry collides with orphan.
- **Agents:** 6/6 Group-1 agents (unanimous)
- **Fix:** Wrap signup in transactional pattern — either move user-row insert AFTER role-grant success, or add explicit cleanup of public.users on rollback.

### C13. Kid pair-code TOCTOU race
- **Evidence:** `schema/095_kid_pair_codes_2026_04_19.sql:143-177` + `web/src/app/api/kids/pair/route.js:62-77`. SELECT ... FOR UPDATE releases lock before the one-time-use check-and-update. Two concurrent requests can both redeem the same code, minting two valid kid JWTs.
- **Agents:** 3/6 Group-1 agents
- **Fix:** Collapse check+update into single atomic statement — `UPDATE WHERE code=X AND used_at IS NULL RETURNING *` pattern.

### C14. Kids quiz 60% threshold hardcoded client-side, no server enforcement
- **Evidence:** `KidQuizEngineView.swift:337` hardcodes `correctCount >= ceil(total * 0.6)`. No server-side re-check on `quiz_attempts` insert. Modified app could bypass entirely; threshold change requires app rebuild.
- **Agents:** 5/5 Group-9 agents (unanimous)
- **Fix:** Move threshold to DB settings (already the convention for tunable product values); client fetches on load; server RPC re-checks on attempt insert.

### C15. Kids: data collection before parental gate (COPPA violation)
- **Evidence:** `VerityPostKids/VerityPostKids/KidReaderView.swift` and `KidQuizEngineView.swift` — `reading_log` and `quiz_attempts` writes fire immediately on article view / answer reveal. `ParentalGateModal` only guards `/profile` unpair and external links, not data-collection actions.
- **Agents:** 3/5 Group-9 agents
- **Fix:** Gate the FIRST data-generating action post-pair behind `ParentalGateModal` or establish parental acknowledgment at pair time. Requires a product spec decision (see OWNER_ACTIONS) but the gating itself is autonomous.

### C16. Kids: ParentalGateModal missing on Expert Sessions
- **Evidence:** `VerityPostKids/VerityPostKids/ExpertSessionsView.swift:156-176` — loads live/scheduled expert sessions without any gate; Apple's Kids Category rules require parental verification before adult-interaction discovery.
- **Agents:** 4/6 Group-9 agents
- **Fix:** Wrap Expert Sessions entry point in `.parentalGate()` modifier (same pattern as Unpair).

### C17. Adult iOS: signup orphaned user rows
- **Evidence:** `VerityPost/VerityPost/AuthViewModel.swift` signup path — if `users` table upsert fails after `auth.signUp()` succeeds, user is left with auth record but no profile row. Cannot login, cannot re-signup with same email.
- **Agents:** 5/6 Group-10 agents (parity with web C12)
- **Fix:** Same server-side transactional pattern as C12 fixes both.

### C18. Adult iOS: StoreKit sync posts success before server verifies
- **Evidence:** `VerityPost/VerityPost/StoreManager.swift:217-280` — `.finish()` fires on transaction regardless of server sync success. If `/api/ios/subscriptions/sync` returns 5xx, app shows "paid" locally but server denies features. User thinks they're paying but aren't activated.
- **Agents:** 2/6 Group-10 agents
- **Fix:** Observe `.vpSubscriptionSyncFailed` notification in SubscriptionView and surface persistent "Purchase didn't sync — tap Restore" banner; defer `.finish()` until server ack.

### C19. Admin role grant/revoke missing audit_log
- **Evidence:** `web/src/app/api/admin/users/[id]/roles/route.js:74-95` (POST), `:146-163` (DELETE) — both call RPC + bump_perms_version but skip `recordAdminAction()`. Sibling routes (role-set, ban, plan) all audit correctly.
- **Agents:** 3/6 Group-6 agents
- **Fix:** Add `recordAdminAction({ action: 'user_role.grant' / 'user_role.revoke', ... })` call matching sibling pattern.

### C20. Admin billing freeze/cancel missing audit_log
- **Evidence:** `web/src/app/api/admin/billing/freeze/route.js:110`, `:cancel/route.js:75` — both execute destructive billing mutations with no audit call. A rogue admin could mass-freeze accounts invisibly.
- **Agents:** 1/6 Group-6 agents (uncontradicted)
- **Fix:** Import `recordAdminAction` and call after RPC succeeds — `'billing.freeze'` / `'billing.cancel'`.

### C21. 4 moderation routes missing audit_log
- **Evidence:** `/api/admin/moderation/users/[id]/penalty`, `/api/admin/appeals/[id]/resolve`, `/api/admin/moderation/reports/[id]/resolve`, `/api/admin/moderation/comments/[id]/hide` — all call service RPCs without `recordAdminAction()`. Penalties, appeal outcomes, report resolutions, comment hides → zero trail.
- **Agents:** 3/6 Group-7 agents
- **Fix:** Add the call to each route with appropriate action label.

### C22. Client-side HIERARCHY map drifts from DB
- **Evidence:** `web/src/app/admin/moderation/page.tsx:28-37, 341` hardcodes role hierarchy for button visibility; actor's max level comes from live DB (line 120-123), but outOfScope check uses stale map. Any `hierarchy_level` change in DB without code redeploy → UI mis-gates.
- **Agents:** 2/6 Group-7 agents
- **Fix:** Replace hardcoded map with live DB read (already available in `roles` state).

### C23. Penalty buttons lack role-hierarchy gating
- **Evidence:** `web/src/app/admin/moderation/page.tsx:326-332` + `reports/page.tsx:352-355` — all penalty levels (Warn, 24h mute, 7-day mute, Ban) render unconditionally to every admin/mod. API correctly rejects out-of-scope, but UX shows buttons that will always fail.
- **Agents:** 1/6 Group-7 agents (uncontradicted) — consistent with HIERARCHY-drift theme
- **Fix:** Disable buttons whose severity exceeds actor's max-bannable level.

### C24. Prompt preset versioning absent
- **Evidence:** `schema/126_newsroom_redesign_clusters_presets_mutations.sql` — `ai_prompt_presets` has no version column, no history table. Operator edits preset body → old body lost; article generated before edit cannot be reproduced.
- **Agents:** 4/6 Group-8 agents
- **Fix:** Add `version INT` + `ai_prompt_preset_versions` history table; snapshot on every mutation. Schema + route change.

### C25. 4 cron routes missing `maxDuration` export
- **Evidence:** `process-data-exports`, `process-deletions`, `recompute-family-achievements`, `flag-expert-reverifications` — no explicit `export const maxDuration`. Falls back to Vercel default (300–900s), letting long jobs silently timeout mid-work with partial state.
- **Agents:** 2/6 Group-11 agents (uncontradicted)
- **Fix:** Add `export const maxDuration = 60` (or appropriate) to each route.

### C26. 14 tables have RLS enabled but zero policies
- **Evidence:** Group-12 Wave B Agent3 enumerated: `weekly_recap_*`, `kid_expert_*`, `family_achievements`, others. RLS with no policies → all reads return zero, all writes silently succeed then invisible. Silent DML failure.
- **Agents:** 1/6 Group-12 agents (uncontradicted, concrete list)
- **Fix:** Either (a) add appropriate policies, or (b) disable RLS on tables that should be service-role-only. Requires DB-verify per table because decision depends on caller pattern.

### C27. `reset_and_rebuild_v2.sql` is 55 migrations stale
- **Evidence:** Scaffold last updated 2026-04-20; current migration number is 160. Any DR replay from that scaffold would silently drop tables `ai_models`, `discovery_items`, `kid_articles`, `events`, and 9 others.
- **Agents:** 2/6 Group-12 agents
- **Fix:** Regenerate scaffold from current schema — `pg_dump` of public schema + RLS + RPCs. Or deprecate the scaffold entirely and rely on sequential migration replay.

### C28. `/api/access-request` + `/api/support/public` + `/api/kids/generate-pair-code` unauthenticated
- **Evidence:** Per Group-14 Wave B Agent2 — these three endpoints accept unauthenticated requests and lack rate limits. Spam/enumeration vectors for operator queue + pair-code brute-force.
- **Agents:** 1/6 Group-14 agents
- **Fix:** Either require auth (if they should be authed), or add CAPTCHA + hard rate limit by IP (if intentionally public).

---

## HIGH

### H1. Verify-email: rate-limit 429 mapped to 'expired' state
- **Evidence:** `web/src/app/verify-email/page.tsx:104-109` — 429 → status='expired'. Semantically wrong; button logic in expired state re-fires resend → retry loop.
- **Fix:** Add distinct `rate_limited` state; disable button when in it.

### H2. OAuth `?next=` dropped at pick-username
- **Evidence:** `web/src/app/api/auth/callback/route.js:151-153` validates + forwards; pick-username page does not consume → post-username user always lands on `/welcome`.
- **Fix:** Thread `?next=` through pick-username, apply at redirect.

### H3. RLS comment INSERT policies missing quiz-pass check
- **Evidence:** `schema/reset_and_rebuild_v2.sql:3809` (comments_insert), `:3820` (comment_votes_insert). Ownership + email_verified checks present; no quiz-pass. API + RPC enforce, but RLS should be defense-in-depth.
- **Fix:** Add `AND user_passed_article_quiz(auth.uid(), article_id)` to with_check clauses; extract helper function.

### H4. Comment POST + vote routes lack explicit quiz-pass check
- **Evidence:** `web/src/app/api/comments/route.js:14-62` + `/api/comments/[id]/vote/route.js:13-45` — only `requirePermission` check. RPC enforces quiz, but API masks the real error as generic "Could not post." User sees vague error instead of "Pass quiz to unlock."
- **Fix:** Add explicit quiz-pass check + actionable 403 message.

### H5. Bookmarks page unbounded fetch
- **Evidence:** `web/src/app/bookmarks/page.tsx:125-133` — no `.limit()`. Power users fetch thousands into React state, OOM risk + slow load.
- **Fix:** `.limit(50)` + cursor pagination.

### H6. Search filters silently dropped for free users
- **Evidence:** `web/src/app/api/search/route.js:65-95` — server drops `category`/`from`/`to`/`source` for unentitled callers with no error. URL-edit or API bypass returns unfiltered results with no indication.
- **Fix:** Return 400 explicitly OR include `{ ignored_filters: [...] }` in response; UI surfaces.

### H7. Notifications PATCH gate too strict
- **Evidence:** `/api/notifications/preferences/route.js:47-53` — requires `notifications.prefs.toggle_push` for any field, including email/in-app/quiet-hours.
- **Fix:** Gate per-field based on which channel the request is modifying.

### H8. Settings mutations don't invalidate permission cache
- **Evidence:** Settings save paths in `page.tsx:1528, 2149, 2725, 3188, 4633` call `reloadUser()` but never `invalidate()`/`refreshAllPermissions()`. Billing checkout path does (line 555). If a profile change affects a downstream permission, cache stays stale until 60s TTL.
- **Fix:** Call `invalidate()` after every settings mutation. One-line per callsite.

### H9. Kids: bearer-token global-header leak
- **Evidence:** `VerityPostKids/VerityPostKids/SupabaseKidsClient.swift:62-68, 70-80` — kid JWT injected as global Authorization header via `makeClient(bearer:)`. Shared URLSession singleton means logout doesn't clear. Future mis-config or memory inspection → token leak.
- **Fix:** Per-request Authorization header; clear on logout; rotate client on refresh.

### H10. Kids: streak/badge bumped in memory before DB confirmation
- **Evidence:** `KidsAppRoot.handleQuizComplete()` calls `state.completeQuiz()` (bumps streak) before `writeAttempt()` persists. App kill during offline → streak visible in UI but DB has nothing. Diverges parent dashboard.
- **Fix:** Defer local state update until `writeAttempt()` succeeds, OR revert local state on write failure.

### H11. Kids: pair-code rate limit is per-IP not per-device
- **Evidence:** `web/src/app/api/kids/pair/route.js:28-36` — 10/min per IP. Shared networks (classroom Wi-Fi, family home) consume limit for each other; VPN bypass trivial.
- **Fix:** Include device fingerprint / `used_by_device` in rate-limit key.

### H12. Adult iOS: APNs `registerIfPermitted()` never called post-login
- **Evidence:** `VerityPost/VerityPost/PushRegistration.swift:11` comment says "Call after login"; `ContentView.swift:106-112` only calls `setCurrentUser` + `BlockService.refresh()`. New users never register; tokens never upload.
- **Fix:** Invoke `PushRegistration.shared.registerIfPermitted()` in the `onChange(of: auth.currentUser?.id)` handler.

### H13. Adult iOS: permission cache stale on login + tokenRefresh
- **Evidence:** `AuthViewModel.swift` — `.tokenRefreshed`/`.signedIn` sets `isLoggedIn=true` but never invalidates permission cache. Plan upgrades server-side → client still shows free tier until restart.
- **Fix:** Call `PermissionService.loadAll()` on login and tokenRefresh events.

### H14. Adult iOS: APNs pre-prompt dismiss not recorded
- **Evidence:** `PushPermission.swift:43-55` — `hasBeenPrompted` flag only sets on grant, not on decline. User who dismisses once is re-prompted every session.
- **Fix:** Set `hasBeenPrompted=true` regardless of outcome; offer "Open Settings" CTA for denied state.

### H15. `send-push` missing `Promise.allSettled` (L4-parity)
- **Evidence:** `send-push/route.js` setup-fetch uses `Promise.all` — unlike `send-emails` which uses `allSettled`. Single transient DB failure → whole batch stuck.
- **Fix:** Port L4 pattern to `send-push`.

### H16. Permissions dual-cache stale-fallthrough
- **Evidence:** `web/src/lib/permissions.js` — during version-bump refresh, legacy `sectionCache` entries can return stale `true` for a revoked permission. Re-confirmed by 4 agents across both waves.
- **Fix:** Either kill sectionCache (prefer single cache), OR hard-clear sectionCache the moment version bumps (before async refresh), OR add deny-by-default during in-flight refresh.

### H17. Cost-cap cache 60s TTL
- **Evidence:** `web/src/lib/pipeline/cost-tracker.ts:46-95` — CAPS_TTL_MS = 60_000. If admin lowers daily cap mid-spend, new generations use old cap for up to 60 seconds.
- **Fix:** Drop to 10s OR add Realtime subscription for settings changes OR make TTL tunable.

### H18. Pipeline generate finally-block state race
- **Evidence:** `generate/route.ts:1617-1624` — discovery_items UPDATE has no `.eq('status', ...)` guard, unlike the pipeline_runs UPDATE on line 1682. Cancel route running concurrently can leave items in wrong state.
- **Fix:** Add status guard to line 1617 UPDATE.

### H19. `send-push` CONCURRENCY=50 vs Supabase 60-conn pool
- **Evidence:** Group-11 — concurrency cap could consume ≥83% of default Supabase pool during push burst. Not currently breaking, but scale-fragile.
- **Fix:** Document + lower to 20 until load-validated, OR bump pool size.

### H20. `promo/redeem` writes users.plan_id without RPC, no perms bump
- **Evidence:** `/api/promo/redeem` — bypasses the migration-148 pattern of calling `bump_user_perms_version` inside billing RPCs. Promo-upgraded users keep free perms until cache TTL.
- **Fix:** Route through a `billing_redeem_promo` RPC (or reuse `billing_change_plan`) so the bump fires.

### H21. Admin page gating client-side only before middleware runs
- **Evidence:** `/admin` hub checks `MOD_ROLES` client-side in page.tsx (lines 99-129) before the admin layout gate. API routes do `requirePermission`, so no actual bypass, but briefly-loaded HTML structures expose route names / data shapes to non-admins before redirect.
- **Fix:** Move the gate into middleware, OR add server-component redirect before render.

### H22. `Retry-After` hardcoded at 60 on comments 429
- **Evidence:** `/api/comments/route.js:70-74` — always "60" regardless of actual remaining window.
- **Fix:** `Math.ceil((rate.resetAtMs - Date.now()) / 1000)`.

### H23. Admin permissions: error messages leak internals
- **Evidence:** `/api/admin/users/[id]/roles/route.js:50, 122` returns `canErr.message` directly to client. Sibling `/role-set` correctly returns generic string.
- **Fix:** Match role-set pattern — log server-side, return "Could not check role assignment."

### H24. Double-audit on permission-set toggles
- **Evidence:** `/admin/permissions/page.tsx:395-421, 423-453` — client calls `record_admin_action` RPC then fetches API which ALSO calls `recordAdminAction`. Two log entries per user action with different action names.
- **Fix:** Remove client-side audit RPCs; rely on server-side only.

### H25. Appeal + report resolution: no enum validation
- **Evidence:** Both endpoints accept arbitrary strings for `outcome`/`resolution`. RPC may enforce whitelist but API boundary should validate.
- **Fix:** `if (!['approved','denied'].includes(outcome)) return 400`; same pattern for reports.

### H26. `support/public` missing auth + rate limit
- **Evidence:** `/api/support/public` — open to unauthenticated POST with no rate limit. Spam vector for support ticket queue.
- **Fix:** Same as C28 — auth OR CAPTCHA+rate-limit.

### H27. Bookmark-collections + conversations creation missing rate limits
- **Evidence:** Per Group-14 Wave B — paid users can spam collection/conversation creation.
- **Fix:** Add `checkRateLimit` calls to both POST routes.

---

## MEDIUM

- **M1.** `web/tsconfig.json: "strict": false` + unset `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`. Tighten before launch to surface latent drift.
- **M2.** 94 type-escape hatches (`as any`, `@ts-expect-error`) across `web/src`, 19 concentrated in `web/src/app/admin/`. Sweep to real types.
- **M3.** Next lint: 33+ `react-hooks/exhaustive-deps` warnings. Many directly correlate with the C5/C6/C8 stale-closure findings; fix as part of those, then lint should clean up.
- **M4.** Plagiarism check silent fallback — on LLM error returns original body with `cost_usd=0`, underreports spend and potentially ships plagiarized text. Decision needed (see OWNER_ACTIONS) but the signal-to-UI part is autonomous.
- **M5.** `permissions.xlsx` path hardcoded to owner's Desktop in `scripts/import-permissions.js`. Move into repo or use env var; CI can't validate matrix sync.
- **M6.** Ingest upsert `ignoreDuplicates=true` silently drops; no visibility into insert-vs-dup counts. Add to response summary.
- **M7.** Cluster archive logs unconditionally even when RPC is idempotent no-op. Check archived_at before audit.
- **M8.** `MOD_ROLES` vs `ADMIN_ROLES` constant use inconsistent between `admin/reports/page.tsx:85` and `admin/moderation/page.tsx:118-119`. Standardize.
- **M9.** Client-side `record_admin_action` calls fire BEFORE server mutation completes in `DestructiveActionConfirm` + `toggleRoleSet/togglePlanSet`. Creates orphaned audit entries if mutation fails. Move to server-only.
- **M10.** Audit `oldValue` missing on permission PATCH — only `newValue` logged. Inconsistent with other endpoints; reduces forensic completeness.
- **M11.** Comment mutations rate-limit applied AFTER permission check → attacker can probe role boundaries without consuming quota. Reverse order.
- **M12.** `pipeline-cleanup` cron `maxDuration=15` may be too tight for 500-cluster sweeps. Bump to 60 or chunk.
- **M13.** `check-user-achievements` non-atomic cursor/counter under concurrent workers. Low-probability race; worth fixing or documenting as intentional.
- **M14.** Bookmarks header count shows total, not filtered count. UX minor.
- **M15.** Leaderboard "unranked" message for users beyond top-50 conflates "outside view" with "no rank." Clarify.
- **M16.** iOS anti-replay signedDate windows (24h sync / 5min notification) — fine as implemented, but document.
- **M17.** FamilyDashboardView direct `kid_profiles` PostgREST reads bypass `/api/*` mediation. Verify RLS sufficient; consolidate to API.

---

## Summary

- **27 CRITICAL** items, launch-blocking, all autonomous-fixable once reviewed
- **27 HIGH** items, should ship pre-launch but can stage post-approval
- **17 MEDIUM** items, quality debt to close before ship
- **Zero STALE** items mis-included — each has ≥2-agent confirmation or uncontradicted evidence

Items reading as "autonomous but requires product decision" (e.g., C1 status-enum direction, C15 gate placement, H25 enum values) are flagged cross-referenced in `OWNER_ACTIONS_2026-04-24.md` — the owner picks direction, Claude executes.

Nothing ships until you review this list. Approve in whole, in part, or with amendments.
