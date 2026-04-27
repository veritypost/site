# TODO — Autonomous

Items I can ship without owner involvement. Each entry is freshly verified against current code at write time.

**Last full dedup:** 2026-04-27 (single-Explore-agent pass against current code).
- 86 items audited. 16 ALREADY-DONE (consolidated to SHIPPED section at bottom). 1 STALE-PREMISE (T52 — line drift; needs manual re-locate). 69 STILL-VALID.
- Shipped items log: `Ongoing Projects/CHANGELOG-AUTONOMOUS.md`.

**Working order:** bundle by surface (one file → one Plan agent → one adversary → implement → diff + regression review). Don't run items serially. See `CHANGELOG-AUTONOMOUS.md` for the active bundle plan.

---

## SECURITY — CRITICAL

## T299 — Homoglyph bypass on ban-evasion email check — SHIPPED 2026-04-27

Added `isAsciiEmail()` to `web/src/lib/emailNormalize.ts` (rejects any codepoint ≥ 128). Hardened existing `normalizeEmail()` to short-circuit on non-ASCII (defense-in-depth — caller-bypass paths like `auth.admin.createUser` get null comparisons, naturally fail-closed). Gated 6 email-write surfaces:
- `/api/auth/signup` (the originally-cited surface)
- `/api/auth/email-change` (logged-in email change — adversary catch)
- `/api/access-request`
- `/api/kids-waitlist`
- `/api/support/public`
- `/api/kids/[id]/advance-band` (intended_email — kid graduation flow)

Approach: reject all non-ASCII codepoints at input rather than try to TR39-fold (Cyrillic/Latin homoglyphs aren't NFKC-equivalent, so normalization alone wouldn't help; full confusables tables are MB-scale and overkill for an English-only product). Once new emails are pure ASCII, the existing `.ilike('email', email)` ban-check works correctly. See `CHANGELOG-AUTONOMOUS.md` Wave 9. **Follow-ups filed:** T299b (backfill scan for pre-existing non-ASCII emails) + T299c (admin search/lockout sites read-side hardening).

## T206 — Deep-link `setSession()` not validated against issuer/audience — SHIPPED 2026-04-27 (revised per adversary)

**Adversary critical finding:** Supabase Swift SDK 2.43.1's `setSession` ALREADY performs the server round-trip (calls `/user` on unexpired tokens, `refreshSession` on expired). The originally-planned `getUser()` post-validate was duplicate I/O guarding a structurally impossible mismatch. SKIPPED that piece.

**Shipped (genuine pieces):**
1. **Type allowlist** — previously, the only explicit branch was `type == "recovery"`; ANY other value (typo, future SDK type, attacker-supplied) silently took the full-signin branch. Now validates against `{recovery, signup, magiclink, invite, email_change, email_change_current, email_change_new, reauthentication}` (all live Supabase Auth deep-link types). Unknown types rejected outright.
2. **Surfaced failure UX (T48 bundled in)** — added `@Published deepLinkError: String?` on AuthViewModel + `setDeepLinkError()` / `dismissDeepLinkError()` helpers + 8s auto-dismiss. ContentView renders a red banner with xmark. On any rejection path (missing tokens, unknown type, setSession throw), the user now sees "This link expired/isn't valid. Send a new one." instead of a silent no-op.
3. Cleared on logout + cancelled on deinit (memory hygiene).

See `CHANGELOG-AUTONOMOUS.md` Wave 10. **Adversary saved a half-fix that was security theater** — without that catch, this would have shipped 60+ lines of duplicate-I/O code that didn't move the security bar.

## Sentry items — MOVED to TODO-PRE-LAUNCH (do not migrate back)

**S4** (`observability.captureException` extras leak PII) and **S5** (Sentry instrumentation TS hygiene) live exclusively in `TODO-PRE-LAUNCH.md` going forward (per owner 2026-04-27). All Sentry-touching work is gated on the Sentry-launch decision (paid tool; deferred until revenue / paging pain). Do not re-add to TODO-AUTONOMOUS even if "the fix is autonomous" — the cost-of-tool gate is what blocks, not the engineering shape.

---

## SECURITY — Pre-Launch K-tier (autonomous half)

## K13 — Kid soft-delete 30-day hard-purge cron — HIGH

(Listed in TODO-PRE-LAUNCH too — fix is autonomous.)
**Verified:** 2026-04-27 against `web/src/app/api/kids/[id]/route.js:99-104` (soft-delete only) + grep across `web/src/app/api/cron/` (no kid-purge cron).
**Fix:**
1. Draft RPC `purge_soft_deleted_kids()` SECURITY DEFINER — hard-DELETEs from `kid_profiles`, `reading_log`, `quiz_attempts`, `user_achievements`, `parental_consents` where `kid_profiles.is_active=false AND kid_profiles.updated_at < now() - interval '30 days'`. Audits to a `_audit_purged` table.
2. New cron route `web/src/app/api/cron/purge-soft-deleted-kids/route.js` calling the RPC.
3. Schedule in `web/vercel.json` (e.g., `0 4 * * *` daily, low-traffic).
4. Migration file at `Ongoing Projects/migrations/<date>_purge_soft_deleted_kids.sql` for owner SQL editor apply.
**Tier:** T5 (schema work — halt-and-queue + draft migration; the cron route + vercel.json edit are autonomous code).

---

## ANALYTICS — wired-but-incomplete

## T322 — 13 KnownEventName types still unwired — HIGH

**Verified:** 2026-04-27 against `web/src/lib/events/types.ts:74-108` (28 events declared in `KnownEventName`) + grep for `trackServer(` and `trackEvent(` (8 events fire today: `signup_complete`, `verify_email_complete`, `onboarding_complete`, `comment_post`, `bookmark_add`, `page_view`, `quiz_started`, `quiz_completed`).
**What's wrong:** 13+ events declared but never fired:
- `signup_start` (signup form mount)
- `subscribe_start` (Stripe checkout init)
- `subscribe_complete` (Stripe webhook `handleCheckoutCompleted`)
- `article_read_start` (story page mount)
- `article_read_complete` (scroll-to-bottom or N-seconds dwell)
- `scroll_depth` (throttled story-page scroll listener)
- `score_earned` (scoring lib)
- 9 ad events: `ad_requested`, `ad_rendered`, `ad_viewable`, `ad_engaged`, `ad_clicked`, `ad_dismissed`, `ad_unfilled`, `ad_filtered_cap`, `ad_filtered_bot`, `ad_creative_error`.
- Plus `onboarding_complete` fires from BOTH `/api/account/onboarding` and `/app/welcome/page.tsx` — duplicated; pick one.

**Fix:** Wire in priority order:
1. **Server-only batch** (low-risk): `subscribe_complete` in Stripe webhook `handleCheckoutCompleted`; `subscribe_start` at `/api/stripe/checkout` route entry. Both `void trackServer(...)` fire-and-forget.
2. **Client mounts**: `signup_start` (login/signup form mount), `article_read_start` (story page mount with throttle).
3. **Read-completion**: `article_read_complete` — pick threshold (`90% scroll OR 60s dwell`) — fire once per article-session.
4. **Throttled scroll**: `scroll_depth` — fire at 25 / 50 / 75 / 100% with debounce.
5. **Score events**: `score_earned` from `web/src/lib/scoring.js` — fire on each scoring delta.
6. **Ad events** (9): wait until ad pipeline is live (post-AdSense approval). Park separately.
7. Dedupe `onboarding_complete` — keep the server-side fire only; drop the client mirror.

**Tier:** T3 (multi-file, multi-route).

## T328 — GA4 + custom-events parallel pipelines — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 against `web/src/components/GAListener.tsx:45` (GA4 page_view on every route change) + `web/src/app/_HomeFooter.tsx:23` (custom page_view via `usePageViewTrack('home')` only on home).
**What's wrong:** Two independent pipelines. Story / leaderboard / settings / profile views are captured in GA4 but missing from the custom-events table. Admin dashboard reads custom events (T329) — so half the traffic is invisible to in-product analytics.
**Fix:** Pick canonical = custom. Mount a single route-change listener at app root (similar to GAListener) that calls `trackClient('page_view', 'product', { path: pathname, ...searchParams })` on every navigation. Drop the home-only `usePageViewTrack`. Keep GA4 separate (vendor analytics; not the bottleneck).
**Tier:** T2 (single component refactor + remove home-only call).

## T329 — Admin dashboard reads zero events from `events` table — HIGH

**Verified:** 2026-04-27 against `web/src/app/admin/analytics/page.tsx:75-99` (queries users / articles / comments / reading_log / quizzes / quiz_attempts only).
**What's wrong:** 5,846 events/week according to the audit doc are write-only — no admin surface reads them.
**Fix:** Add panels to admin analytics:
- Signup funnel — `signup_start → signup_complete → onboarding_complete → verify_email_complete` count + drop-off ratios over last 7 days.
- Page-view by tier — group `page_view` events by user.tier (joined via user_id), top 10 paths.
- Event-type frequency — top 20 event names ranked by 7-day count.
**Precondition:** T322 wave-2 (more events firing). Until subscribe_complete + signup_start fire, the funnel panel is half-empty.
**Tier:** T3 (admin UI + 3-4 new queries).

---

## REDESIGN TREE — bundles with T357 cutover (or ships standalone within `redesign/*`)

## T331 — `profile_visibility` enum-write mismatch — SHIPPED 2026-04-27

Adopted **Option A** (tri-state with explicit lockdown read-only state). Changes in `PublicProfileSection.tsx`:
- Type extended to include `'hidden'`.
- New derived `isLockedDown` flag.
- Visibility-control renders read-only "Profile is hidden. Manage in Privacy → Lockdown." instead of public/private buttons when locked down.
- `onSave` skips `profile_visibility` from the RPC payload when locked down — bio + activity-hide toggle still save normally; lockdown state is never clobbered.
- `onUserUpdated` callback preserves the existing visibility on lockdown.
- Live preview now shows a "Hidden" pill in addition to the existing "Private" pill.

The original same-page clobber (PublicProfileSection writes 'public'/'private' over PrivacyCard's 'hidden') is now structurally impossible. (Cross-tab freshness — open card in tab A, lockdown in tab B, save in tab A — is a separate state-freshness concern, not T331's scope.) See `CHANGELOG-AUTONOMOUS.md` Wave 12.

## T334 caller-side — PrivacyCard switch to `lockdown_self()` RPC — SHIPPED 2026-04-27

Two-statement client flow replaced with single `lockdown_self` RPC call. Now atomic: visibility flip + follows wipe + audit row + perms_version bump in one server-side transaction. Confirms RLS drift on `follows` can't be a write-to-other-users primitive (RPC asserts `auth.uid() == p_user_id` internally). Git history (`004026e`) confirmed RPC is live server-side; only the caller swap remained. **Type cast note:** uses `(supabase.rpc as any)('lockdown_self', ...)` because `lockdown_self` isn't in the generated `database.ts` types yet — clean up once T4.3 / T4.7 type-regen unblocks. See `CHANGELOG-AUTONOMOUS.md` Wave 11.

## T335 — `Field.tsx` declared transitions but no focus/hover handlers — SHIPPED 2026-04-27

Root cause was simpler than the TODO claimed: `globals.css:173` already provides `*:focus-visible { outline: 2px solid #111111; outline-offset: 2px; }` for every focusable element. But `Field.tsx`'s `inputStyle` had `outline: 'none'` inline, which clobbered the global rule (inline styles win on specificity). Same bug in `AppShell.tsx`'s search input. Fix: dropped `outline: 'none'` from both inline-style sites — global `:focus-visible` now applies. Zero new state, no React handlers, no helper imports needed. The unused `focusRing` helper in `palette.ts:118-121` stays in place for any future custom-ring designs (left untouched). See `CHANGELOG-AUTONOMOUS.md` Wave 13.

## T336 — Focus trap + banner z-index promotion — SHIPPED 2026-04-27

Built `web/src/app/redesign/_lib/useFocusTrap.ts` — `useFocusTrap(ref, { active })` hook that focuses first focusable on open, cycles Tab/Shift+Tab within the ref, restores prior focus on deactivation. Wired into `AppShell.tsx` via a new `railRef` + `useFocusTrap(railRef, { active: drawerOpen })`. Above 860px the rail is always-visible so `drawerOpen` stays false and the hook no-ops — mobile-only behavior. Banner z-index was already correct: `ProfileApp.tsx:536` wraps `AccountStateBanner` in a `position: sticky; zIndex: 40` container, above rail z-30 / overlay z-25 / mobile bar z-20. Added a doc comment so future edits don't regress the stacking context. See `CHANGELOG-AUTONOMOUS.md` Wave 16.

## T337 — Native `window.confirm()` in 3 redesign components — SHIPPED 2026-04-27

Extracted shared `<ConfirmDialog>` at `web/src/app/redesign/_components/ConfirmDialog.tsx` (wraps `<Card variant="danger">` with title / body / confirmLabel / busy / onConfirm / onCancel props — mirrors PrivacyCard's existing inline pattern). Replaced `confirm(...)` in BillingCard (cancel subscription), MFACard (disable 2FA), SessionsSection (sign out other devices). Each call site split into `request*` (opens dialog) + the original action (now invoked from `onConfirm`). PrivacyCard kept its inline lockdown render — that's a unique tri-state body, not the same shape. See `CHANGELOG-AUTONOMOUS.md` Wave 14.

## T351 — §21.3 polish bundle (7 sub-items) — SHIPPED 2026-04-27 (5 of 7; 2 closed-as-not-needed)

**Sub-1 (spacing literals):** CLOSED. `gap: 1` and `padding: '0 4px'` are intentional micro-values (1px hairlines + 4px badge padding) that don't have token coverage. Adding `S.half = 2` for 3 cosmetic call sites would mutate design tokens for low-leverage values; current literals stay.

**Sub-2 (TierBadge extract):** CLOSED. Below threshold — only 2 actual sites (`YouSection.tsx:63`, `PublicProfileSection.tsx:187`); preview/page.tsx had no tier.label per grep. Each is a single inline `<span>` styled with `C.inkMuted`. Extraction is over-engineering for two single-span renders.

**Sub-3:** SHIPPED. PasswordCard rule dots now turn `C.danger` when `newPw.length > 0 && !r.ok` (typed-but-unmet). Empty field stays neutral (no nag).

**Sub-4:** SHIPPED. New `followersError: string | null` state in PrivacyCard captures load failures; render branch shows "Couldn't load your followers." with a Retry button when `followersError && followers.length === 0`.

**Sub-5:** SHIPPED. Hidden-confirm copy now interpolates `followers.length`: singular "your one current follower" / plural "all N current followers".

**Sub-6:** SHIPPED. Back-channel empty state branches on `isAdminScope`: admin → "No experts have posted here yet." / expert → "No messages in this back-channel yet."

**Sub-7:** SHIPPED. ProfileApp rail title "Data & danger" → "Your data" (with "data"/"danger" added to keywords for search compatibility). PublicProfileSection's empty-bio prompt deleted entirely — the textarea below already has a stronger placeholder ("Tell people what you read about, what you've published, who you are.") that serves the same role.

See `CHANGELOG-AUTONOMOUS.md` Wave 15.

## T360 — Build redesign `CategoriesSection` + `MilestonesSection` — SHIPPED 2026-04-27 (Wave 20)

**Verified:** 2026-04-27 — neither file exists under `web/src/app/redesign/`. `ProfileApp.tsx:295-305, 315-322` uses `LinkOutSection` for both with hand-off links to `/profile?tab=categories` and `/profile?tab=milestones`.
**Fix:**
- `CategoriesSection.tsx` — mirror leaderboard pill-row pattern: parent pills + sub-pills under active parent + scope card with stats from `category_scores`. Inline drill-in.
- `MilestonesSection.tsx` — earned + still-ahead achievements with countdown ("76 days to go", "253 articles to go") per the `/redesign/preview` fixture pattern. Reads from `user_achievements`.
- Replace the two `LinkOutSection` entries in `ProfileApp.tsx` with the new section components.
**Tier:** T3 (~300-400 LoC each, single PR).
**Blocks:** T358 (iOS port can't mirror sections that don't exist on web).

---

## STREAK + UI parity

## T14 UI half — Streak break copy fix — HIGH

**Verified:** 2026-04-27 against `web/src/app/profile/page.tsx:833-834` (renders `${user.streak_current ?? 0}d` plain).
**What's wrong:** When streak resets to 0, no copy explains it; if user has freezes available, no recovery offer.
**Fix:** Conditional render —
- If `streak_current === 0 && streak_best > 0 && streak_freeze_remaining > 0` → "Your streak ended. Use a freeze to restore it? (N remaining)" + button. The button is wired only after `use_streak_freeze` RPC ships (TODO-OWNER T14 RPC half) — until then, render the message + a disabled button with a tooltip.
- Else if `streak_current === 0 && streak_best > 0` → "Streak reset — start a new one today."
- Else: render normally.
**Tier:** T2 (UI-only branch).
**Bundling:** Mirror to iOS `ProfileView.swift:495` in same PR.

---

## CROSS-CUTTING WEB

## T303 — Leaderboard hardcoded `email_verified=true` filters — STALE-PREMISE-NEEDS-OWNER-DECISION 2026-04-27

**Wave 7 pre-flight 2026-04-27:** the TODO conflated two different concerns. Reading current code (`web/src/app/leaderboard/page.tsx:161-164, 207, 250, 285`):
- `leaderboard.view` permission gates *viewing* the full leaderboard.
- `.eq('users.email_verified', true)` (and the parallel filter on `public_profiles_v`) gates *who appears* in the rankings — a privacy/quality filter for the public surface.
- The third path (`leaderboard_period_counts` RPC, line 285) applies the same email_verified filter server-side; the comment explicitly documents this as the canonical privacy filter.

These are different concerns. The current filters are reasonable privacy gates (don't surface unverified accounts in public ranking lists), not perm-override bugs. Dropping them changes product semantics, not fixes a bug.

**Owner decision needed:** is the public leaderboard meant to (a) include unverified accounts, or (b) keep them filtered out? If (a), drop the filters from all three paths (incl. the server RPC). If (b), the current code is correct — close this item. Don't ship autonomously either way.

Note: under AUTH-MIGRATION (queued in TODO-OWNER), every signed-in user becomes inherently email-verified, so the question may be moot post-migration. Re-evaluate after AUTH-MIGRATION ships.

## T84 — "Please try again" copy sweep — PARTIALLY SHIPPED 2026-04-27 + REMAINDER CLOSED-AS-OVERSTATED

**Wave 8 pre-flight 2026-04-27:** count drifted to 58 sites (was 47). Read each site. Split:
- **6 admin destructive-toast sites** — were genuinely generic ("Action failed. Please try again."). Shipped: each catch now reads `destructive?.confirmLabel` from the in-scope state and renders specific copy like "Couldn't delete placement. Please try again." Sites updated: `admin/ad-placements`, `admin/recap`, `admin/ad-campaigns`, `admin/sponsors`, `admin/promo`, `admin/subscriptions` (with `setLookupError`). See `CHANGELOG-AUTONOMOUS.md` Wave 8.
- **~50 remaining sites** — already context-specific copy ("Could not freeze account…", "Network error…", "Sweep failed…", "Could not load articles…", etc.). The TODO's "generic copy" framing was overstated; most messages already do say what failed. Mechanical rephrasing for the sake of motion would violate "genuine fixes, never patches."
- **2 truly generic fallback sites** (`request-access:28`, `login:90` — both "Something went wrong. Please try again.") — these are explicit unknown-error catch-alls when the server returns an unclassified error code. Improving them needs server-side error classification work (not a UI sweep). File a separate research item if desired.

Closing the bulk T84 sweep. The 6 admin sites that needed fixing are shipped. Remaining items either don't need work or need server-side prep first.

## T92 — Web push — MOVED to TODO-PRE-LAUNCH (do not migrate back)

Web browser push notifications (OS-level toasts when the tab is closed) lives in `Ongoing Projects/TODO-PRE-LAUNCH.md` as of owner directive 2026-04-27. Engineering shape is autonomous, but launch sequencing + owner-generated VAPID keypair + service-worker operational-risk decision + RLS migration land it as pre-launch work, not autonomous batch work. Do not re-add to TODO-AUTONOMOUS.

## T165 — Inline `style={{...}}` migration — LOW

**Verified:** 2026-04-27 — `grep -r "style={{" web/src --include="*.tsx" | wc -l` = 3,888 (down from prior count of 4,272 — drift confirms shrinkage). 170 unique files.
**What's wrong:** Maintenance burden + bundle size cost. Tailwind PostCSS plugin already wired.
**Fix:** Migrate critical components to CSS modules / Tailwind utility classes. Don't rewrite the whole codebase — pick top-10 most-edited files and convert those. Document the convention so new code uses Tailwind from start.
**Tier:** T3 (incremental).

## T166 — Zero `data-testid` attributes — LOW

**Verified:** 2026-04-27 — `grep -r "data-testid" web/src` = 0.
**What's wrong:** No test selectors. e2e tests are brittle.
**Fix:** Add `data-testid` to interactive elements as new tests are written (add convention to docs). Don't backfill blindly.
**Tier:** T1 (per-feature, not bulk).

## T348 partial — Thread supabase client through dual-perm-call routes — DEBT

**Verified:** 2026-04-27 against `web/src/lib/auth.js:239-278`. Per-client cache shipped (lines 252-276) on `__permsCache: Map<userId, result>`. Most callers don't thread the client — each `requirePermission(...)` mints a fresh client via `resolveAuthedClient(undefined)`.
**Fix:** Audit routes that call BOTH `requirePermission` and `hasPermissionServer` in the same handler. Refactor those to pass the same client through both calls so the cache hits on the second call. The full AsyncLocalStorage / `headers()` request-context memoization is a larger architectural pass — defer.
**Tier:** T3.

---

## iOS — auth/security

(T206 covered above under SECURITY — CRITICAL.)

## T48 — iOS auth deep-link failures silent — SHIPPED 2026-04-27 (bundled into T206)

Wave 10 adversary review collapsed T48 into T206 since they target the same surface. Now `handleDeepLink` sets `deepLinkError` on every rejection path (missing tokens, unknown type, setSession throw); ContentView renders a red banner with xmark. 8s auto-dismiss. **"Send new link" CTA deferred** — the deep-link failure path doesn't always have an email address to send to (only present when `pendingVerificationEmail` is set). If the owner wants the CTA, file a follow-up to surface the email-context-aware button. See `CHANGELOG-AUTONOMOUS.md` Wave 10.

---

## iOS — comments + voting + quiz

## T12 — iOS comment threading missing — SHIPPED 2026-04-27 (Wave 20)

**Verified:** 2026-04-27 against `VerityPost/VerityPost/StoryDetailView.swift:2370-2371` (TODO comment "iOS UI doesn't expose threaded reply yet") + 1921, 2077 (`parent_id` IS fetched).
**Fix:** Surface a Reply button per comment. Pass `parent_id` on submit. Indent replies with a left border. Cap depth at 3 (matches web's collapsed-deeper UI).
**Tier:** T3.

## T52 — iOS comments missing trust header — MEDIUM (STALE-PREMISE — needs re-locate)

**Verified:** 2026-04-27 — cited range (`StoryDetailView.swift:1093-1151`) is the quiz-result UI, not the comments header. Dedup pass flagged this as stale; manual re-locate required before scheduling work.
**Re-locate plan:** open `VerityPost/VerityPost/StoryDetailView.swift`, search for the comments-section render block (look for the symbol that renders the comment list — likely a function or computed view past line 1500). Confirm whether it has the "Every reader here passed the quiz." copy that `web/src/components/CommentThread.tsx` has. If missing, file a fresh entry with the correct line range. If present, mark DONE.
**Tier:** T2 once re-located.

## T106 — iOS quiz submission failure leaves user stuck — SHIPPED 2026-04-27

Start-card "Take the quiz" button now relabels to "Try again" when `quizError != nil`. In-quiz error site wraps text in HStack with retry button calling `submitQuiz()`. See `CHANGELOG-AUTONOMOUS.md` Wave 3.

## T116 — iOS comment rate-limit shows "Wait" without countdown — SHIPPED 2026-04-27

Boolean `commentRateLimited` replaced with `commentRateRemainingSec: Int` + `commentRateTask: Task?`. New `@MainActor` helper `startCommentRateLimit(seconds:)` cancels prior task + spawns 1Hz countdown. Post button label is `"Wait \(N)s"` while > 0. **Pattern not yet ported** to other rate-limited iOS surfaces (kids pair-code lockout etc.) — file as a follow-up if owner wants parity. See `CHANGELOG-AUTONOMOUS.md` Wave 3.

## T245 — iOS quiz auto-submit double-fire — SHIPPED 2026-04-27

`DispatchQueue.main.asyncAfter` replaced with `@State quizAdvanceTask: Task<Void, Never>?`. Tap cancels prior task before re-spawn. Inner Task sleeps 350ms, then re-checks `Task.isCancelled` + `quizStage == .answering` before firing `submitQuiz()` or incrementing `quizCurrent`. Cancelled in `.onDisappear` for teardown safety. See `CHANGELOG-AUTONOMOUS.md` Wave 3.

## T246 — iOS comment post 200-with-error-body silently clears — SHIPPED 2026-04-27

200-OK branch now tries `Resp { comment: VPComment }` decode first; on failure, decodes `Err { error: String? }` from same body and surfaces via `flashModerationToast(...)`. Composer is preserved (not cleared) on the error path. **Side fix:** deleted dead `actionError` state (write-only, observed by zero views); routed all 3 use sites through `flashModerationToast`. See `CHANGELOG-AUTONOMOUS.md` Wave 3.

## T248 — iOS vote silently fails on session expired — SHIPPED 2026-04-27

Combined URL+session guard split. Session-fetch failure → reverts optimistic UI + `flashModerationToast("Please sign in again.")`. Network failure → routed to `flashModerationToast` (was previously dead `actionError` write). See `CHANGELOG-AUTONOMOUS.md` Wave 3.

## T253 — iOS TTSPlayer doesn't release buffer on memory warning — STALE-PREMISE (re-locate)

**Verified:** 2026-04-27 — `StoryDetailView.swift:125` only declares `@StateObject private var tts = TTSPlayer()`. The actual buffer + memory-warning handling belongs in `TTSPlayer.swift`, not StoryDetailView. **Re-locate plan:** open `VerityPost/VerityPost/TTSPlayer.swift`, audit for any `UIApplication.didReceiveMemoryWarningNotification` observer; if missing, add one + release buffers/cancel synthesis. File a fresh entry with the correct file:line.
**Tier:** T1 once re-located.

---

## iOS — onboarding + UX

## T66 — iOS bookmarks empty-state CTA dead button — SHIPPED 2026-04-27

Added `@Published var pendingHomeJump: Bool = false` on `AuthViewModel`. BookmarksView's "Browse articles" button sets the flag; ContentView observes via `.onChange(of: auth.pendingHomeJump)` and applies `selectedTab = .home` + clears the flag. Reset on logout. See `CHANGELOG-AUTONOMOUS.md` Wave 6.

## T81 — iOS TTS-per-article toggle missing — DEFERRED but build-ready

**Verified:** 2026-04-27 — grep across `VerityPost/` for `tts_per_article` returns 0. Web saves the flag.
**Fix:** Add toggle in iOS Settings → Preferences. Gate on `settings.a11y.tts_per_article` perm. Read/write `users.metadata.tts_per_article` via `update_own_profile` RPC.
**Tier:** T2.

## T88 — iOS onboarding stamp failure blocks app entry — SHIPPED 2026-04-27

Added `@Published var bypassOnboardingLocally: Bool = false` on `AuthViewModel`. WelcomeView's stamp-error branch now renders "Continue anyway" alongside the retry copy; tap sets the flag. ContentView's `needsOnboarding` gate ANDs with `!auth.bypassOnboardingLocally` so the user reaches MainTabView. Bypass is local-only; on next launch, if `onboarding_completed_at IS NULL` server-side, the welcome flow re-fires and the stamp retries cleanly. Reset on logout. See `CHANGELOG-AUTONOMOUS.md` Wave 6.

## T89 — iOS unverified user gets entire profile gated — DEFERRED

**Verified:** 2026-04-27 against `ProfileView.swift:143-149`. Hides hero/stats/streak when `emailVerified == false`.
**Fix:** Becomes moot post-AUTH-MIGRATION (every signed-in user inherently verified). Don't ship in current state — wait for AUTH-MIGRATION cutover, then delete the `verifyEmailGate` branch entirely.
**Tier:** T1.

## T137 — iOS email input format validation — SHIPPED 2026-04-27

`EmailSettingsView` now has private `isValidEmail(_:)` helper (regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`, trims whitespace). Send-button `isDisabled` uses the helper; inline "Invalid email" hint renders below the field when typed-but-invalid (uses `VP.wrong`). See `CHANGELOG-AUTONOMOUS.md` Wave 4.

---

## iOS — settings parity

## T27 iOS + T3.5 — Notification settings hygiene (web admin + iOS settings) — MEDIUM

**Verified:** 2026-04-27 against `VerityPost/VerityPost/SettingsView.swift:2015-2049` (iOS `NotificationsSettingsView` reads/writes `metadata.notifications` sub-keys: `breaking`, `digest`, `expert_reply`, `comment_reply`, `weekly_recap`) + `web/src/app/admin/email-templates/page.tsx` (admin UI lets admins edit copy for `breaking_news_alert`, `comment_reply`, `expert_answer_posted`, `kid_trial_day6`, `weekly_family_report`, `weekly_reading_report` — none of these are in the cron whitelist; they never send).
**What's wrong / missing:**
- Per memory, email scope is "security-only" — `data_export_ready`, `kid_trial_expired`, `expert_reverification_due`, plus auth-flow emails via Supabase Auth.
- iOS notifications panel writes metadata keys that may or may not drive APNs delivery — needs audit.
- Web admin email-templates UI exposes 6 templates that never send — surfaces editable lies to admins.
- Web settings page (already shipped earlier) deleted the user-facing engagement-email toggles; admin-side cleanup never happened.
**Fix (single PR, three surfaces):**
1. **iOS notifications audit.** Walk APNs delivery cron consumer (`web/src/app/api/cron/notification-deliveries/route.*` or the publish-time fan-out trigger). For each `metadata.notifications.*` key: if it drives a real delivery decision → keep toggle, remove any "email" framing in copy; if decorative → delete toggle.
2. **Hide dead email templates from admin UI.** Don't delete the rows (preserve state for when email scope expands post-launch). Filter the admin email-templates page to show only the 3 active types: `data_export_ready`, `kid_trial_expired`, `expert_reverification_due`. Add an "Inactive" tab to expose the others if owner wants to edit copy for the parked templates.
3. **Stamp inactive templates explicitly** in the admin UI as "in-app only — not sending email" so a future admin doesn't think editing the copy ships.
**Tier:** T2.

---

## T20 — iOS verification application missing fields — HIGH

**Verified:** 2026-04-27 against `SettingsView.swift:2299-2326`. iOS sends 7 fields. Web sends 6 more: `expertise_areas`, `credentials`, `category_ids`, plus 3 `sample_responses`.
**Fix:** Add iOS form sections matching web:
- Expertise areas (multi-select chips)
- Credentials (free-text textarea)
- Category preferences (multi-select)
- 3× sample-response textareas (with prompt copy from web)
Single shared `expert_application_payload` schema in `web/src/types/database.ts` should be the source of truth — both surfaces validate against it.
Surface failure inline: keep form open with error banner; don't dismiss silently.
**Tier:** T3.

## T44 — iOS settings save failures silent — SHIPPED 2026-04-27

Added shared `SettingsErrorBanner` private component. `NotificationsSettingsView` + `FeedPreferencesSettingsView` save() catches now set `saveError` + render dismissable banner above the save button. (Expert settings deleted by T60 — dropped from scope.) See `CHANGELOG-AUTONOMOUS.md` Wave 4.

## T45 — iOS settings load fallbacks render as "loaded" — SHIPPED 2026-04-27

`NotificationsSettingsView` + `FeedPreferencesSettingsView` `load()` switched from `try?` (swallows) to explicit `do/catch`. On network/decode failure: sets `loadError` + renders retry banner above the form. Form still shows with default values; banner explicitly tells user the data may be stale. (Conservative version vs. the originally-planned full LoadState enum — adversary flagged that hiding the form on first-load could break new accounts.) DM-receipts subsurface (third cited line in original TODO) is in MessagesView, not Settings — not in this bundle. See `CHANGELOG-AUTONOMOUS.md` Wave 4.

## T50 — iOS DM creation/send failures silent — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 against `MessagesView.swift:1107` (`catch { Log.d("Failed to send: \(error)") }`).
**Fix:** Map common HTTP failures → actionable copy. Keep compose surface open. Show error toast with retry button.
**Tier:** T2.

## T58 — iOS Find rows missing category + date — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 against `FindView.swift:138-155`. Result rows render only title + excerpt.
**Fix:** Add category name + relative date (`"2h ago"` / `"3d ago"`) to each row. Match the iOS `HomeView` story-row pattern.
**Tier:** T2.

## T60 — iOS Expert settings save to nowhere — SHIPPED 2026-04-27

`ExpertSettingsView` deleted entirely (~108 lines). HubRow `if canViewExpertSettings { ... } else if canApplyExpert { ... }` collapsed to flat `if canApplyExpert`. Backend grep confirmed zero readers of `metadata.expert.tagLimit` / `.notifPref`. See `CHANGELOG-AUTONOMOUS.md` Wave 4. **Follow-up filed:** T60b — `canViewExpertSettings` permission flag is now unused.

## T139 — iOS Settings error pattern audit — SHIPPED 2026-04-27 (by extension)

Closed by T44 + T45 + T60 in Wave 4. All surviving settings subsurfaces now use the shared `SettingsErrorBanner` pattern. (Expert settings removed; only Notifications + Feed remain in scope.) See `CHANGELOG-AUTONOMOUS.md` Wave 4.

---

## iOS — engagement / browse / search

## T37 — iOS browse subset of web — SHIPPED 2026-04-27 (Wave 20)

**Verified:** 2026-04-27 against `HomeView.swift:577-657`. Plain category list, no counts, no top-3 trending preview.
**Fix:** Add article count + 1-2 article previews per category row. Mirror web Browse's pattern.
**Tier:** T2.

## T41 — iOS notification taps ignore non-story `action_url` — CLOSED-AS-NO-OP 2026-04-27

Wave 6 pre-flight verified the server side: web's notification creation paths (`/api/admin/broadcasts/alert/route.ts`, `notification-deliveries` cron, `send-push`) only emit story-shaped `action_url` values. The TODO claim about `/profile/settings/billing` / `/signup` / signed download URLs was speculative — those shapes don't exist in code. iOS's story-only handler is correct for the current product surface. Re-open if/when the server starts emitting non-story shapes.

## T72 — iOS `.mostInformed` tab drift — DEBT

**Verified:** 2026-04-27 against `ContentView.swift:182, 194, 281-282`. `.mostInformed` case still in the tab enum + switch + label "Most Informed". No `BrowseView.swift` file. Tab routes to `LeaderboardView()`.
**Fix:** Decide: rename "Most Informed" tab → "Browse" with `BrowseView` content (mirror web Browse), OR confirm the leaderboard-as-Most-Informed mapping is intentional and document it.
**Tier:** T2 (either rename + new view, or just rename + doc).

---

## iOS — resilience / lifecycle / data-loss

## T102 — iOS splash 10s timeout no slow-network grace — SHIPPED 2026-04-27 (Wave 19)

**Bundles with:** T189, T247, T193 — all `AuthViewModel.checkSession()` + URLSession config. Adversary flagged a real splash-budget conflict if shipped piecemeal: T193's 15s URLSession timeout + T247's 2x retry backoff = worst case 48s, vs. splash gate at 15s. `retrySession()` doesn't cancel prior `checkSession()`. Must ship together with a single in-flight guard (`sessionCheckTask: Task?` + cancel-on-retry).


**Verified:** 2026-04-27 against `AuthViewModel.swift:79-88`. Hard 10s timeout.
**Fix:** Two-stage budget: at 5s show "Connecting…"; at 15-20s show fallback. Total 20s ceiling. Differentiate transient (retry) vs no-session.
**Tier:** T2.

## T103 — iOS session-expired banner generic — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 against `ContentView.swift:229`. Hardcoded text.
**Fix:** Pass cause through `auth.sessionExpiredReason` enum: `.tokenExpired / .remoteSignout / .accountChange`. Banner branches: "Session expired — please sign in" / "Signed out from another device" / "Account changes detected — please sign in again".
**Tier:** T2.

## T105 — iOS quiz teaser dismiss per-article only — SHIPPED 2026-04-27 (verified ALREADY-DONE)

Wave 3 verification: `@State` per-article scope is the intended design — teaser resets when navigating to a new article. Original TODO claim was wrong. No changes shipped. Closing.

## T118 — iOS adult deep-link no article routing — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 against `VerityPostApp.swift:15-17`. `auth.handleDeepLink(url)` only handles auth deep-links.
**Fix:** Branch on URL host: auth deep-links → existing `auth.handleDeepLink`; story deep-links → push StoryDetailView via NavigationStack programmatic push.
**Tier:** T2 (bundle with K10 if implementing kids deep-link routing).

## T122 — iOS push status not auto-refreshed on foreground — SHIPPED 2026-04-27

`Task { await PushPermission.shared.refresh() }` added to the existing `.onChange(of: scenePhase)` block in `VerityPostApp.swift` (alongside StoreManager + PermissionService refresh). Cleaner than an in-PushPermission singleton-init observer (avoids the singleton-not-touched-yet timing risk the adversary flagged). See `CHANGELOG-AUTONOMOUS.md` Wave 5a.

## T182 — `EventsClient.shared` observer cleanup — SHIPPED 2026-04-27 (Wave 19)

**Bundles with:** T190 + T249 — all `EventsClient.swift`. Adversary flagged: switching from `addObserver(self, selector:...)` to block-based observer + Task hop trades synchronous-on-main for an async hop in the exact 5-second background CPU window the observer exists to use. If kept block-based, must use `MainActor.assumeIsolated` or stay synchronous via the selector pattern.


**Verified:** 2026-04-27 against `EventsClient.swift:18-23`. Singleton — observer lifetime matches app's; missing `[weak self]` + deinit hygiene.
**Fix:** Block-based observer with `[weak self]`. Explicit deinit removal even though singleton.
**Tier:** T1.

## T187 — `setCurrentUser` UUID validation — SHIPPED 2026-04-27

`PushRegistration.setCurrentUser` now validates non-nil input via `UUID(uuidString:)`. `assertionFailure` in DEBUG, `Log.d` always, early return without mutating state on bad input. Nil input still stores cleanly. See `CHANGELOG-AUTONOMOUS.md` Wave 5a.

## T189 — `checkSession` error type discrimination — SHIPPED 2026-04-27 (Wave 19)

**Bundles with:** T102 + T247 + T193. See T102 entry for the splash-budget reconciliation requirement.


**Verified:** 2026-04-27 against `AuthViewModel.swift:91-96`. Catch-all sets `isLoggedIn = false`.
**Fix:** Discriminate `URLError.notConnectedToInternet` / `URLError.timedOut` (transient → keep retrying) from `auth.AuthError.sessionMissing` (real signout). Surface error type to caller.
**Tier:** T2.

## T190 — `Task.detached` analytics flush no cancellation — SHIPPED 2026-04-27 (Wave 19)

**Bundles with:** T182 + T249. See T249 for the bigger persistence-of-in-flight-batch design requirement.


**Verified:** 2026-04-27 against `EventsClient.swift:101-115`. No task handle stored.
**Fix:** Store `Task` handle. Await synchronously in `handleBackground` (or cancel + persist on background).
**Tier:** T2.

## T193 — SupabaseClient timeout config — SHIPPED 2026-04-27 (Wave 19)

**Bundles with:** T102 + T189 + T247. Custom `URLSessionConfiguration(timeoutIntervalForRequest=15, waitsForConnectivity=true)` interacts with the splash retry budget — must be reconciled in the same wave. Also flag: `waitsForConnectivity=true` is a global behavior change (e.g., a buried "Post comment" tap-then-background can fire 14s later — affects every Supabase call).


**Verified:** 2026-04-27 against `SupabaseManager.swift:53-55`. OS default 60s.
**Fix:** Custom `URLSessionConfiguration`: `timeoutIntervalForRequest = 15`, `waitsForConnectivity = true`.
**Tier:** T1.

## T244 — iOS pull-to-refresh stacks parallel calls — SHIPPED 2026-04-27

4 sites updated (HomeView, CategoryDetailView, ProfileView, SettingsView). Each enclosing struct now owns `@State refreshTask: Task<Void, Never>?`; `.refreshable` cancels prior + spawns new + awaits the value (so the spinner stays alive until the load completes). Adversary-flagged pull-vs-`.task` race deferred to T244b. See `CHANGELOG-AUTONOMOUS.md` Wave 5a.

## T247 — iOS splash transient retry — SHIPPED 2026-04-27 (Wave 19)

**Bundles with:** T102 + T189 + T193. See T102 entry.


**Verified:** 2026-04-27 against `AuthViewModel.swift:75-101`. No transient-error detection or auto-retry.
**Fix:** Wrap auth call in Task with explicit timeout. On `URLError`, retry up to 2 times with backoff. Cancel timer on success.
**Tier:** T2 (combine with T102).

## T249 — `EventsClient.flush` events lost on background-then-kill — SHIPPED 2026-04-27 (Wave 19)

**Bundles with:** T182 + T190. Adversary caught a real design gap in the original plan: `toSend` is captured into the detached Task at flush time and is no longer in `buffer`, so persisting `buffer` on background still loses in-flight events on kill. Correct design: move events into a `pendingFlushBatches: [[Event]]` set keyed by an id; persist the whole set on background; remove on flush success.


**Verified:** 2026-04-27 against `EventsClient.swift:92-115`. `Task.detached` uncancellable; buffer cleared before HTTP completes.
**Fix:** Persist buffer to disk on background (`UserDefaults` or `FileManager`). Flush from disk on next launch. Await flush completion before clearing buffer.
**Tier:** T3.

## T250 + T1.3 — iOS APNs token lifecycle (registration race + logout cleanup) — HIGH

**Verified:** 2026-04-27 against `PushRegistration.swift:20-22, 44-80`.
**What's wrong / missing:** Two related lifecycle bugs on the same `user_devices` surface — ship together:
- **T250 (registration race).** Token-before-login → `setCurrentUser` is nil → silent ignore. Subsequent logins don't re-register.
- **T1.3 (logout cleanup).** `setCurrentUser(nil)` only clears in-memory variable. The `user_devices` row is never deleted. Shared device → user A logs out → user B logs in → user A's pushes route to that device. **Pre-launch gate (T1.3 also lives in TODO-PRE-LAUNCH).**
**Fix:**
1. Persist APNs token to local state (UserDefaults).
2. On `setCurrentUser(newId)` (login or account switch): if `newId != previousId`, call `delete_user_push_token` RPC for `previousId`'s token row. Then call `upsert_user_push_token` for `newId` with the persisted token.
3. On `logout()`: call `delete_user_push_token` BEFORE clearing the session.
4. New RPC `delete_user_push_token(p_token text)` — owner-applied via TODO-OWNER (a small migration entry).
**Tier:** T3 (cross-surface — iOS + server RPC + COPPA-adjacent kid device re-pair).
**Cross-link:** T1.3 in TODO-PRE-LAUNCH (Apple Review gate). Same fix; this entry is the iOS code half.

## T251 — Kids quiz pending writes lost when backgrounded — SHIPPED 2026-04-27 (Wave 20)

**Verified:** 2026-04-27 against `KidQuizEngineView.swift:62-68` + `KidsAppState.swift:187-200`. Pending writes Tasks cancelled; counter not persisted; "success" celebration fires on stale state.
**Fix:** Wait for all pending writes (with timeout) before showing result. Show "Couldn't save — try again" path on timeout.
**Tier:** T3.

## T254 — iOS sessionExpired banner sticky — SHIPPED 2026-04-27

Sign-in CTA already existed (live at ContentView:233 pre-edit). Added 8s auto-dismiss via `AuthViewModel.scheduleSessionExpiredAutoDismiss()` (private) + new `dismissSessionExpired()` (public). ContentView's xmark + Sign-in handlers now call `dismissSessionExpired()` so the timer is cancelled cleanly on manual dismiss. Re-fires of `sessionExpired = true` cancel the prior timer + restart. `deinit` cancels any pending dismiss task. See `CHANGELOG-AUTONOMOUS.md` Wave 5a.

## T261 — iOS deployment target 17.0 — LOW (decision call)

**Verified:** 2026-04-27 against `VerityPost.xcodeproj/project.pbxproj` — `IPHONEOS_DEPLOYMENT_TARGET = 17.0`.
**Fix:** Audit code for iOS 17-only APIs. If none required, lower to 16.0 to reach ~10-15% more users. Test build at 16; if API gates surface, document and stay at 17.
**Tier:** T2 (build + test pass).

---

## AI REMEDIATION CLUSTER — additional autonomous items (verified 2026-04-27 via live MCP)

These items came from the audit-derived REMEDIATION pass. Surface-deduped against existing TODO-AUTONOMOUS entries (the merged ones above already absorbed REMEDIATION T1.3 → T250 cluster, REMEDIATION T3.5 → T27 iOS cluster).

### Tier 0 — production-blocker code halves (paired with TODO-OWNER tests)

## T0.4 — `add-kid-with-seat` rollback path — HIGH (Stripe LIVE — flag-gated)

**Verified:** 2026-04-27 against `web/src/app/api/family/add-kid-with-seat/route.ts:410-415, 466`.
**Current state in code:** When the first extra kid is added, the route uses `addSubscriptionItem` (creates a brand-new line item). Neither `priorStripeItemId` nor `priorStripeQuantity` is set. If subsequent `kid_profiles.insert` fails, the rollback guard at line 466 evaluates `null && null = false` and rollback never runs. Parent's Stripe sub keeps the orphan $4.99/mo line item. Replays of the same idempotency key return the cached 400 forever.
**What's wrong:** Billing-side state diverges from app-side state on a failure midway. Customer ends up paying for a kid that doesn't exist in our DB.
**Fix:**
- Track which Stripe op fired during the request (`'add'` for new line item, `'patch'` for quantity bump).
- On `'add'` rollback path, call `removeSubscriptionItem(seatItem.id)` instead of restoring quantity (there's no prior quantity to restore — it's a brand-new item).
- On terminal failure, clear or mark the idempotency row (`kid_seat_idem` or wherever it lives) so the parent can retry with a new key OR refresh-and-retry the same one cleanly.
- Ship behind a flag (`feature_flag.kid_seat_rollback_v2`). Flag flips after owner-test passes (TODO-OWNER T0.4 paired-test).
**Tier:** T4 (billing-touching, security-sensitive, cross-surface).
**Live billing risk:** **HIGH — pair-review before ship.** Mistake here is worse than the bug.

## T2.1 — Cross-platform double-subscription guard — HIGH (Stripe LIVE — flag-gated)

**Verified:** 2026-04-27 against `web/src/app/api/ios/subscriptions/sync/route.js` + Stripe webhook handler symmetry.
**Current state in code:** No partial-unique constraint on `subscriptions(user_id) WHERE status='active'`. iOS sync route doesn't check for active Stripe sub before calling `billing_change_plan`. Stripe webhook doesn't check for active Apple sub. User pays both concurrently; `users.plan_id` flaps between handlers.
**Fix (locked decision: block second platform):**
1. Migration: `CREATE UNIQUE INDEX subscriptions_one_active_per_user ON subscriptions (user_id) WHERE status='active'`. (Owner applies — add to TODO-OWNER schema queue.)
2. Both sync paths refuse the new sub if an active one exists on the other platform; return structured 409: `{ error: 'platform_conflict', existing_platform: 'stripe' | 'apple', message: 'You already have an active Verity Post subscription on [Stripe/Apple]. Manage or cancel it there before subscribing here.' }`.
3. Client UI on web (Stripe checkout) + iOS (StoreKit purchase) handles 409 by showing the friendly copy.
4. Ship behind flag `feature_flag.cross_platform_guard`. Flag flips after owner-test (TODO-OWNER T2.1 paired-test).
**Tier:** T4.
**Live billing risk:** **HIGH — wrong UX leaves customers stuck.**

### Tier 0 — production-blocker code-only

## T0.6 — Kid refresh TTL drift (7d → 24h) — HIGH (BLOCKED on iOS pair-fix)

**Verified:** 2026-04-27 against `web/src/app/api/kids/refresh/route.js:23` (`60*60*24*7`) vs `web/src/app/api/kids/pair/route.js:32` (24h after T301).
**What's wrong:** Pair shipped with reduced 24h leak window; refresh undoes it. Kid JWT becomes 7 days again on first refresh.
**Adversary finding (2026-04-27 Wave 2 review):** A server-only TTL change creates a refresh-loop regression. iOS `VerityPostKids/VerityPostKids/PairingClient.swift:213` triggers `refreshIfNeeded()` when `secondsLeft < 24h`. With a 24h refresh TTL, every fresh refresh-token has ~24h-or-less left → next foreground call refreshes again → token churn on every app foreground.
**Revised fix (paired):** Ship server constant change AND iOS rotation threshold change in the same bundle:
1. `refresh/route.js:23`: `60*60*24*7` → `60*60*24`. Update comment to mirror pair's threat-model.
2. `refresh/route.js:1-5` docstring: drop "re-signs a fresh 7-day JWT" — replace with 24h.
3. `PairingClient.swift:213`: lower the refresh-when threshold from `<24h` to `<6h` (or similar) so a freshly refreshed 24h token doesn't immediately re-trigger.
4. Re-verify the iOS rotation threshold contract documented in `pair/route.js:1-5`.
**Tier:** T4 (kids/auth, paired surface).
**Bundle:** Ships in a kids-iOS bundle (alongside T250+T1.3, T3.10, T251). Do NOT ship server-side alone.
**Test:** Pair a kid; foreground app 6 times in 30 min on a real device; verify only ONE refresh request lands; decode token; confirm `exp - iat = 86400`.

## T0.7 — Pro-grandfather notify silently lies — SHIPPED 2026-04-27

Stamp removed from notify branch; only `captureMessage` remains (operator-visible log). Migrate branch unchanged — gates on `notifiedAt && STRIPE_SECRET_KEY`, so it now never fires for new users (intended). Existing stamps in prod (if any) will still satisfy the migrate gate; backfill is a separate operator decision not bundled here. See `CHANGELOG-AUTONOMOUS.md` Wave 2. **Follow-up filed:** T0.7b (fully park migrate branch behind feature flag once owner confirms engagement-email pipeline is permanently parked).

## T0.9 — DOB correction outcome silently disappears on rejection — SHIPPED 2026-04-27

UI: extended `history` row type with `decision_reason`; added `lastRejected` finder (most-recent rejected when no pending/approved); rendered a danger-bordered card with status pill, reason text, and a "Resubmit with corrected info" CTA that opens the existing form. The lifetime constraint only blocks one *approved* correction per kid, so resubmission after rejection is intentional and the CTA is correct. Server: admin reject handler now inserts a `notifications` row when `decision === 'rejected'` — fetches `parent_user_id + kid_profile_id` from the request, builds a notification with `type='kid_dob_correction.rejected'`, body = the decision reason, action_url linking back to the kid page. Best-effort: a notify failure logs but doesn't fail the decision (matches the audit-write pattern). See `CHANGELOG-AUTONOMOUS.md` Wave 18.

### Tier 2 — compliance + security

## T2.4 — Ad-system PATCH lacks URL allowlist — SHIPPED 2026-04-27

Extracted `isSafeAdUrl` to `web/src/lib/adUrlValidation.js` (was inline in POST handler) so POST and PATCH share one regex — a render-filter regression in `Ad.jsx` can't slip an XSS payload through one write path while the other rejects it. PATCH now mirrors POST's `creative_url` + `click_url` validation — `javascript:alert(1)` returns 400. Added rank-guard for `approval_status` changes only: when the row already has an `approved_by`, calls `requireAdminOutranks(prior.approved_by, user.id)` so a junior admin can't override a higher-ranked admin's prior approval/rejection. First-time approvals + non-status edits are unaffected. See `CHANGELOG-AUTONOMOUS.md` Wave 17.

## T2.5 — iOS password change doesn't require current password — DEFERRED (moot post-AUTH-MIGRATION)

**Verified:** 2026-04-27 against `VerityPost/VerityPost/SettingsView.swift:1520-1533`.
**Status:** Becomes moot under magic-link AUTH-MIGRATION (no password to change). Listed for traceability — DO NOT ship as a defense-in-depth pre-migration patch since AUTH-MIGRATION will delete the entire password change surface.
**If owner indicates AUTH-MIGRATION will be delayed >2 months:** revisit. Pre-migration fix is iOS calling `/api/auth/verify-password` (already exists, rate-limited) before `client.auth.update(password:)`. Surface error in UI.

## T2.6 — Admin routes skip audit_log — SHIPPED 2026-04-27 (Wave 20)

**Verified:** 2026-04-27 — REMEDIATION enumerated the 21 routes including expert approve/reject (changes user role), billing/sweep-grace, broadcasts/breaking, sponsors POST/PATCH, ad-* POST/PATCH, recap mutations, settings/invalidate. RPC-level: `admin_apply_dob_correction` writes `kid_dob_history` but not `audit_log` (COPPA RBAC trail gap).
**What's wrong:** No traceable record of who changed what. RBAC audit trail incomplete.
**Fix:**
1. Wrap each mutation route's success path with `recordAdminAction(...)` matching the pattern used by already-audited routes (action namespace: `admin:<resource>:<verb>`).
2. RPC fix: add `INSERT INTO audit_log` inside `admin_apply_dob_correction` body. Owner applies the migration.
3. List of routes to retrofit comes from REMEDIATION's audit pass — work through them in one PR. Pair-review the action namespace consistency.
**Tier:** T3 (multi-file, rate-of-change risk if action names drift).

### Tier 3 — product correctness

## T3.1 — Phase 3.5 dual-band kid generation — MEDIUM (cost ↑, content fit ↑)

**Verified:** 2026-04-27 against `GenerationModal.tsx:312-348`. Modal fires the route once per kid run, defaulting `age_band='tweens'`. Every kid article ships as tweens-voice. Kids 7-9 see tween-voice content; tweens-voice prompts produce nothing-voice content because no kids run produces a kids-band article either.
**Fix:** Modal splits kid lane into `kid-kids` + `kid-tweens`, fires serially (`await` between bands to avoid cluster-lock contention). Route is already correctly per-band; no route changes needed.
**Tier:** T3.
**Depends on:** TODO-OWNER T0.5 (kid JWT RLS fix). Without T0.5, kids can't see the new banded articles.
**Test:** Click Generate with audience=kid → two `pipeline_runs` rows, two `articles` rows (`age_band='kids'` + `'tweens'`), `feed_clusters` has both sibling FKs populated.
**Cost note:** Roughly doubles per-kid-cluster generation cost. Acceptable.

## T3.3 — DOB correction younger-direction abuse path — SHIPPED 2026-04-27 (Wave 20)

**Verified:** 2026-04-27 against `web/src/app/api/dob-correction-cooldown/route.ts`.
**What's wrong:** Cooldown evaluates 4 fraud signals with loose thresholds. A parent with >30-day-old profile, no prior correction, sub >14 days, can submit a 2-year-younger DOB (must be `> 2y` to flag — boundary loophole) and silently downgrade their tween to kids-band after 7-day cooldown.
**Fix:** Tighten signal thresholds. Specifically: change `large_shift > 2y` → `large_shift >= 1y AND direction='younger'` for younger-direction. Require admin review for any younger-direction shift exceeding 1 year.
**Tier:** T2.

## T3.6 — Comment fetch unbounded — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 against `web/src/components/CommentThread.tsx:127-135`. `.select('*').eq('article_id', ...)` with no `.limit()`. 50k-comment article = full row blast.
**Fix:** Initial fetch `.range(0, 49)`; cursor-based load-more pattern. Keep top-N logic for initial render.
**Tier:** T2.

## T3.7 — `unhide_comment` admin UI missing — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 — RPC + route exist; no UI button.
**Fix:** Add Unhide action to admin moderation comment list. Gate on `admin.moderation.comments.unhide` permission.
**Tier:** T1.

## T3.10 — Kids iOS app push registration — HIGH

**Verified:** 2026-04-27 — `VerityPostKids` entitlement declares `aps-environment` but no Swift code calls `registerForRemoteNotifications`. Kids app can never receive push.
**Fix:** Add `PushRegistration` to kids app, mirror adult pattern, register on session creation. Verify server-side `upsert_user_push_token` RPC supports `kid_profile_id` targets (likely needs a small RPC tweak — owner-applied if so).
**Tier:** T4 (kids surface — COPPA payload review needed).
**Cross-link:** TODO-PRE-LAUNCH K15 (kids push payload PII review). After this lands, K15 owner-side review pass before Apple Kids submission.

## T3.11 — iOS logout cleanup leaves caches — SHIPPED 2026-04-27 (Wave 20)

**Verified:** 2026-04-27 — `AuthViewModel.logout()` clears @Published fields but NOT: `PermissionService` cache, `BlockService`, `StoreManager.purchasedProductIDs`, several UserDefaults keys.
**What's wrong:** Next user inherits stale state — sees prior user's permissions, blocks, IAP entitlements.
**Fix:** Centralized `cleanupOnLogout()` that clears every cached singleton + UserDefaults keys. Call from `logout()` AND from `setCurrentUser(newId)` when account switches.
**Tier:** T2.
**Depends on:** TODO-PRE-LAUNCH T1.3 (push token cleanup) — same logout flow; ship together.

## T3.12 — Stale "server-side profanity filter" comment in iOS — SHIPPED 2026-04-27

Comment edited to remove the false profanity-filter claim; lists only the four filters that actually run (rate-limit, quiz-gate, banned-user check, counters). Regression hunt confirmed no real filter wired. See `CHANGELOG-AUTONOMOUS.md` Wave 1. **Follow-up filed:** T4.12 (admin profanity_filter UI is dead — wire it or delete it).

### Tier 4 — hygiene / dead code / drift

## T4.1 — Drop 7 dead permission keys — SHIPPED 2026-04-27 (Wave 19, migration drafted)

**Verified:** 2026-04-27 — REMEDIATION confirmed zero callers for: `kids.bookmark.add`, `kids.bookmarks.add`, `kids.streak.use_freeze` (live key is `kids.streak.freeze.use`), `kids.leaderboard.global_opt_in`, `kids.leaderboard.global.opt_in`, `kids.streak.view_own`, `kids.streaks.view_own`.
**Fix:** Migration `DELETE FROM permissions WHERE key IN (...)`. Owner applies via SQL editor (small enough to be inline; doesn't need a migration file).
**Tier:** T1.

## T4.2 — Delete RETRACTED partition file — SHIPPED 2026-04-27

Both files removed. See `CHANGELOG-AUTONOMOUS.md` Wave 1.

## T4.3 — Delete `IdemTableClient` cast — BLOCKED-ON-OWNER 2026-04-27

**Wave 7 pre-flight 2026-04-27:** `add_kid_idempotency` is still missing from `web/src/types/database.ts` (grep confirmed zero hits). Removing the cast without regenerating types causes compile errors. The Supabase MCP type-regen tool is currently disconnected per the system notice. **Owner action needed:** run `npx supabase gen types typescript ...` (or whatever the project's type-regen command is); after that the cast can be dropped autonomously in seconds. Bundles with T4.7 — same blocker.

## T4.4 — Delete legacy `KID_*` prompt imports — SHIPPED 2026-04-27

Comment block in `generate/route.ts` removed; three legacy exports in `editorial-guide.ts` deleted (zero callers confirmed via grep). See `CHANGELOG-AUTONOMOUS.md` Wave 1.

## T4.5 — Delete unused `POST /api/family/seats` handler — SHIPPED 2026-04-27

POST handler + unused imports (`checkRateLimit`, `recordAdminAction`) removed; docstring shrunk to GET-only. File 219 → 96 lines. Active mutation path is `/api/family/add-kid-with-seat` (called by `AddKidUpsellModal.tsx`). See `CHANGELOG-AUTONOMOUS.md` Wave 2.

## T4.6 — Verify all migrations applied — DEBT

**Verified:** 2026-04-27 — REMEDIATION called this out.
**Fix:** Walk every file in `Ongoing Projects/migrations/`. Live MCP-verify (via `pg_proc` / `information_schema` / `pg_class`) that each is applied. Drop any obsolete or already-rolled-up migration files. Don't trust prior status notes.
**Tier:** T2.

## T4.7 — Audit type lag in `database.ts` — DEBT

**Verified:** 2026-04-27 — Several `as unknown as` casts in routes flag "types lag behind migration X".
**Fix:** Regen types via Supabase CLI / MCP `generate_typescript_types`. Remove all such casts in one pass. Bundle with T4.3.
**Tier:** T2.
**Cross-link:** T334 caller-side (PrivacyCard cast) and several leaderboard `as never` casts will be cleared as part of this regen.

## T4.8 — Redesign cluster TS errors (14 errors) — SHIPPED 2026-04-27

Pre-flight `npx tsc --noEmit` enumeration grouped the 14 errors into 3 buckets: (1) 6 errors using `tier.label / tier.slug` on `ScoreTier` — fixed by updating call sites to the actual field names (`display_name` / `name`) at AppShell, TierProgress (×2), YouSection, PublicProfileSection. The TODO's suggested "(A) add `label` + `slug` to `ScoreTier` type" would have entrenched the drift between DB columns and UI; updating call sites keeps a single source of truth. (2) 3 errors at `update_own_profile` RPC boundary where `Json` was the expected type — added `as Json` casts at AvatarEditor / PublicProfileSection / PrivacyCard, with `Json` imported from `@/types/database` (matches established supabase-caller idiom). (3) 1 wrong column name (`expert_application_id` → `application_id`) at ExpertProfileSection. Final typecheck → clean. T357 cutover no longer blocked. See `CHANGELOG-AUTONOMOUS.md` Wave 16.

## T4.9 — Stale "Tech (Kids)" category row — LOW

**Verified:** 2026-04-27 — REMEDIATION cited it. Phase 3 category dedup migration left one stale row that should have been collapsed into base "Tech".
**Fix:** Verify via SQL whether the row exists + has FKs referencing it. If FKs exist, repoint to base "Tech" first; then DELETE the stale row.
**Tier:** T2.

## T4.10 — `support` admin page direct DB writes — DEBT

**Verified:** 2026-04-27 against `web/src/app/admin/support/page.tsx`. Bypasses the API-route pattern; writes `ticket_messages` and `support_tickets` directly. No rate limit, no audit on most state flips.
**Fix:** Refactor to call new API routes for each mutation. Add audit_log writes in the routes. Bundle with T2.6 (audit_log sweep).
**Tier:** T3.

## T299b — Backfill scan for pre-existing non-ASCII emails — MEDIUM (NEW 2026-04-27)

**Verified:** 2026-04-27 — Wave 9 T299 ship gates new bad input but doesn't retroactively detect any non-ASCII emails already stored in `users.email`, `kid_profiles.intended_email`, `access_requests.email`, `kids_waitlist.email`, `support_tickets.email`. If a banned user pre-T299 signed up with a Cyrillic homoglyph, the ban-check still misses them.
**Fix:** Run a one-shot SQL scan: `SELECT id, email FROM users WHERE email !~ '^[[:ascii:]]*$';` (and parallel for the other tables). Owner reviews the matches. Decision per match: (a) admin-update the email to its Latin equivalent; (b) flag `is_banned=true` on the homoglyph row to lock it out; (c) ignore (verified-legitimate IDN signup, unlikely but possible).
**Tier:** T2 (read-only scan + per-match admin action).
**Owner-side.** SQL scan goes in TODO-OWNER once filed there.

---

## T299c — Hardener pass on email read-side / lockout sites — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 — Wave 9 T299 adversary identified read-side sites that don't write emails but still compare them: `/api/auth/check-email`, `/api/auth/login-precheck`, `/api/auth/login-failed`, admin search at `admin/auth-recovery/page.tsx`, `admin/permissions/page.tsx`, `admin/users/[id]/permissions/page.tsx`. Per-call fixes vary: some need to reject non-ASCII input (pre-T299 Cyrillic stored emails won't be findable via Latin search anyway, so this is post-T299b cleanup); others need consistent canonicalization (lockout-counter keys).
**Fix:** Walk each cited site post-T299b. Apply `isAsciiEmail` gate or normalize the comparison key, depending on read semantics. Largely cosmetic for security (T299 main ship blocks the actual bypass); this pass closes secondary leaks.
**Tier:** T2.

---

## T244b — iOS `.task` vs `.refreshable` initial-load race — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 — surfaced by Wave 5a T244 adversary review. T244 fixed pull-vs-pull races, but `.task` initial-load and `.refreshable` are still independent: a user pulling-to-refresh while the initial `.task` load is mid-flight gets two parallel writes to the same `@Published` state. Each load function (`loadData`, `refreshAll`, `load`) doesn't guard against concurrent execution.
**Fix:** Either (A) wrap both `.task` initial load and `.refreshable` with the same `refreshTask` handle, OR (B) add a `loadInFlight: Bool` guard at the top of each load function. (A) is cleaner; (B) is less invasive.
**Tier:** T2.

---

## T0.7b — Park pro-migration migrate branch behind feature flag — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 — surfaced by T0.7 adversary review. After T0.7 ship, the notify branch no longer stamps `pro_migration_notified_at`, so the migrate branch (gated on `notifiedAt && STRIPE_SECRET_KEY`) will never fire for NEW users. But any subs already stamped in prod (from prior cron runs) will still auto-migrate at next renewal — silently, without ever having been actually notified.
**What's wrong:** Memory says engagement-email pipeline is permanently parked. If that's true, the migrate branch is dead code that could fire on legacy state. Better to fully park it behind a flag.
**Fix:** Add `process.env.PRO_GRANDFATHER_MIGRATE_ENABLED === 'true'` gate around the migrate branch. Default to false. Owner flips ON only when engagement-email pipeline ships and a notify campaign has actually run.
**Tier:** T2.
**Owner-side check needed:** SQL query to count existing `pro_migration_notified_at` stamps in prod. If non-zero, decide: (a) flush them via a one-shot `UPDATE subscriptions SET metadata = metadata - 'pro_migration_notified_at' WHERE metadata ? 'pro_migration_notified_at'`, OR (b) leave + park branch. Either way, surface in TODO-OWNER.

---

## T60b — Drop unused `canViewExpertSettings` perm gate — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 — surfaced by Wave 4 T60 ship. `canViewExpertSettings` is still declared as `@State` and assigned via `PermissionService.shared.has(...)` after the ExpertSettingsView delete; no view consumes it now.
**Fix:** Remove the `@State` declaration + the assignment line in the `.task(id: perms.changeToken)` block. Don't touch the underlying `expert.settings.view` permission key in DB — that may still be referenced by web (verify via grep before any DB cleanup).
**Tier:** T1.

---

## T4.12 — Admin profanity_filter UI is dead — SHIPPED 2026-04-27 (Wave 19)

**Verified:** 2026-04-27 — surfaced by T3.12 regression hunt. `web/src/app/admin/words/page.tsx` + `web/src/app/admin/comments/page.tsx` expose `profanity_filter` + `profanity_cooldown` toggles to admins. The `post_comment` RPC + `web/src/app/api/comments/route.*` never consult them. Toggling does nothing.
**What's wrong:** Admin UI lies — admins think they're enabling a filter; the filter doesn't run. Either wire it or delete the UI.
**Fix (recommend):** Delete the admin UI panels (T1) — wiring a profanity filter is a product decision (false positives, allowlists, kid-app vs adult-app threshold). If the product wants the feature, file a separate item with proper scope.
**Tier:** T2 (admin-touching, but pure deletion).

---

## T4.11 — Sponsor DELETE may orphan revenue rows — LOW (verify FK first)

**Verified:** 2026-04-27 — REMEDIATION flagged as `[UNVERIFIED]` pending FK behavior check.
**Fix:** Query `pg_constraint` for FKs from any revenue/billing table to `sponsors`. If FK is `ON DELETE CASCADE`, decide: (A) soft-delete sponsors (`is_deleted=true` flag) instead of hard-delete; or (B) change FK to `ON DELETE RESTRICT` — no delete if dependent rows exist.
**Tier:** T2.

---

## TIER classification reminder

T1 trivial = direct, 0 agents. T2 small = 2 agents. T3 medium = 4-stream. T4 large = 6 agents. T5 schema = halt-and-queue (don't ship autonomously).

**Anything touching auth / payments / RLS / admin / kids = at least T4 regardless of LoC.**

---

## SHIPPED / verified DONE

Items the dedup pass (2026-04-27) confirmed are already correct in code or are intentional design choices. Kept here for traceability — do not re-open unless owner explicitly disagrees.

| ID | What's correct | Where verified |
|----|----------------|----------------|
| T18 | iOS email change uses Supabase SDK; server flow enforces verification (sends confirmation email). Original concern was overstated. | `VerityPost/VerityPost/SettingsView.swift:1463` |
| T28 | iOS expert back-channel queue is intentional "Coming soon" placeholder; tab properly labeled. | `VerityPost/VerityPost/ExpertQueueView.swift:188-200` |
| T29 | iOS empty-alerts dead CTA is gated by `manageSubscriptionsEnabled = false`; auto-flips when T25 (topic alerts) ships. | `VerityPost/VerityPost/AlertsView.swift:300` |
| T38 | iOS Find advanced filters are intentional MVP scope ("basic mode only — no filter UI"). | `VerityPost/VerityPost/FindView.swift:8` |
| T46 | iOS sign-in activity reads `get_own_login_activity` (audit log); no session-revoke action by design. | iOS settings audit pattern |
| T104 | iOS bottom-nav 4th tab Sign-up/Profile flip is intentional UX. | `VerityPost/VerityPost/ContentView.swift:282` |
| T121 | iOS push 7-day cooldown is the deliberate value. | `VerityPost/VerityPost/PushPermission.swift:32` |
| T126 | iOS onboarding "Skip" is in outer header above all 3 pages — design intent. | `VerityPost/VerityPost/WelcomeView.swift:35` |
| T131 | iOS comment vote-button disabled state changes `foregroundColor` + stroke based on `active`. | `VerityPost/VerityPost/StoryDetailView.swift:2525-2540` |
| T148 | iOS Alerts Manage tab properly gated behind sign-in via `anonHero` + `activeSection`. | `VerityPost/VerityPost/AlertsView.swift:29-77` |
| T185 | iOS i18n parked by design (0 uses of `String(localized:)`). | both iOS apps, grep |
| T194 | Kids `loadUser` errors include `localizedDescription` with context + fallback data; acceptable for kids app. | `VerityPostKids/VerityPostKids/KidsAppState.swift:141, 183` |
| T195 | Kids quiz verdict timeout falls through to local computation on RPC failure. | `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:355-392` |
| T197 | `LoginView.canSubmit` is normal SwiftUI computed property; no perf concern. | iOS LoginView |
| T198 | `VerityPostApp` `scenePhase` `.active` handler is correct iOS lifecycle pattern. | `VerityPost/VerityPost/VerityPostApp.swift` |
| T214 | Keychain `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` is the correct security level. | `VerityPost/VerityPost/Keychain.swift:20` |
| T263 | `PrivacyInfo.xcprivacy` exists for both adult + kids apps. | both apps |

---

## DEFERRED (tracked here, not autonomous)

- **T2.5** — iOS password change requires-current-password. Moot post-AUTH-MIGRATION (no password to change). Listed for traceability only.
- **T89** — iOS unverified-user profile gate. Moot post-AUTH-MIGRATION; the entire `verifyEmailGate` branch deletes when migration ships.

---
