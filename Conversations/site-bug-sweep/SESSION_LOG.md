# Site Bug-Sweep — Session Log

Append-only chronological log. Most recent at the bottom. Each entry: date, session, what happened, what got locked, what's blocked, what next session should pick up.

---

## Session 0 — 2026-04-30 — Founding

**Phase entering:** 0 (no artifacts).
**Phase leaving:** 0 (program founded; no slice started).

**What happened.** The program started cold. Read format references from `article-lifecycle/` (multi-session discipline, session protocol, slice-status vocabulary) and `profile-bugfix/` (bug-sweep discipline: investigation-first, FK hint rule, 6-agent ship pattern, confirmation before implementation, cross-surface deferral). Read auto-memory.

Surface-mapping pass: listed every route under `web/src/app/` and `web/src/app/api/`, read `web/src/middleware.js` for routing gates and permission logic. Noted the large admin tree under `web/src/app/admin/` (~25 sub-routes) and API tree under `web/src/app/api/admin/` (~20 sub-routes), plus the full public API surface.

**Slice design.** Grouped the site into 8 slices:
1. Auth & account gates — login/signup/OTP/PKCE/beta-gate/kid-reject/middleware
2. Navigation & discovery — home, browse, search, leaderboard, categories, NavWrapper, breaking strip
3. Article reading — `/[slug]` story page, all article-lifecycle implementations (quiz mount, comment mount, event tracking, sources, timeline)
4. Reader engagement & social — bookmarks, following, notifications, public profiles, expert queue, recap
5. Messaging — `/messages`, DMs, conversation list
6. Billing & subscription — `/billing`, Stripe checkout/portal/webhook, plan gates, `/pricing`
7. Admin surfaces — full `/admin/` tree and `/api/admin/` routes
8. API routes cross-cut — cron jobs, push, events batch, CSP report, health, webhooks

Slice 03 (article reading) is intentionally positioned third — after auth and nav — because the article-lifecycle implementation (six slices, sessions 1–10, 2026-04-29) is the most recent large-scale change and is unverified by any sweep. Bugs there are highest-probability.

Written: `README.md`, `INDEX.md`, `SESSION_LOG.md`, `00-system-map.md`.

**What got locked.**
- The four foundation artifacts.
- The slice ordering default.
- The slice-status vocabulary.
- The FK hint rule (seeded with two known-fixed mismatches from profile-bugfix).
- The discipline rules (investigation-first, 6-agent ship pattern, adversarial review per slice, memory rules every session).

**No bug investigations or code changes were made.** Session 0 is mapping only.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 01 — Auth & account gates. Re-read the system map's auth section. Spawn parallel Explore agents to read the login, signup, OTP, PKCE, forgot-password, reset-password, verify-email, and beta-gate flows. Cover all account types (anon, free, pro, admin) and all gate variants (beta gate, kid-reject, coming-soon, protected-prefix redirect). Verify middleware logic against actual page components. Surface findings. FK hint rule applies to any query in those routes.

---

## Session 1 — 2026-04-30 — Slice 01: Auth & account gates

**Phase entering:** 1 (slice 01 not-started).
**Phase leaving:** 1 (slice 01 locked; 9 confirmed issues + 1 wont-fix).

**What happened.** Four parallel Explore agents investigated login/signup flows (Agent A), PKCE/callbacks/session (Agent B), middleware gates (Agent C), and beta-gate/waitlist/invite/referral flows (Agent D). After synthesizing 8 prioritized findings, a fresh adversarial agent was spawned with two priority verifications.

Priority Verification 1 confirmed: `web/src/lib/auth.js:346` calls `compute_effective_perms` (the old RPC name), not `my_permission_keys`. Whether this breaks production depends on whether the RPC still exists in the DB — this must be verified via MCP before implementation.

Priority Verification 2 downgraded Finding 4 from P1 to P2: a kid JWT can reach `/profile/kids` via the `/kids` middleware redirect, but `app/profile/kids/page.tsx:132-136` has a `kids.parent.view` permission gate that correctly denies it. No security bypass; the bug is a confusing redirect chain.

Adversarial review also: expanded Finding 5 to include a second orphaning vector in `send-magic-link/route.js:260-278`; confirmed Finding 6 (cookie write) is intentional Supabase SSR pattern (fix is logging-only); confirmed Finding 7 (email fail-open) is intentional design (wont-fix); added new issue 01-08 (`/profile/kids` `refreshAllPermissions()` not error-handled). FK hint check: none found in auth flow files.

**What got locked.** Slice doc written at `slices/01-auth-gates.md` with 9 confirmed issues and 1 wont-fix:
- 01-00 (P0): `auth.js` calls dead RPC `compute_effective_perms` — verify DB first
- 01-01 (P1): False success on waitlist/request-access forms
- 01-02 (P1): OTP resend cooldown starts before success; catch block silent
- 01-03 (P1): Middleware `getUser()` no try/catch
- 01-04 (P1): Beta-gate `deleteUser()` + `createUser()` failures orphan email (two vectors)
- 01-05 (P2): Kid JWT reaches `/profile/kids` via `/kids` redirect (confusing, not a bypass)
- 01-06 (P2): `/api/auth/confirm` ignores `?next=`
- 01-07 (P2): Session cookie write failure not logged
- 01-08 (P2): `/profile/kids` `refreshAllPermissions()` not error-handled
- 01-09 (wont-fix): Magic link email fail-open is intentional

**Cross-surface finding added to INDEX.md:** 01-00 (`compute_effective_perms`) affects all permission-gated API routes — noted as cross-cutting across slices 03–08.

**What's blocked.** 01-00 requires DB verification (MCP query) before fixing. All other issues have complete fix plans.

**What next session should pick up.** Slice 02 — Navigation & discovery. Read `NavWrapper.tsx` (uncommitted changes in git status), `_homeShared.ts` (updated for stories-as-containers), `page.tsx`, `browse/`, `search/`, `leaderboard/`, and the `/story/` directory (check if live route or legacy artifact). Verify all `stories(slug)` join callers use `stories?.slug`, not `articles.slug`. FK hint rule applies to any `.select()` with `!` syntax.

---

## Session 2 — 2026-04-30 — Slice 01: Implementation

**Phase entering:** 1 (slice 01 locked).
**Phase leaving:** 1 (slice 01 shipped — all 9 issues resolved, zero TypeScript errors).

**What happened.** Read slice doc, README, and auto-memory. Opened every cited file and confirmed the code still matched the investigation descriptions before writing a single line. Implemented in three commits.

**P1 commit `55ebd09`** — four fixes:
- 01-01: `_RequestAccessForm.tsx` and `_WaitlistForm.tsx` now capture `res` and check `res.ok` before calling `setStage('sent')`; API errors surface as user-visible error messages.
- 01-02: `_SingleDoorForm.tsx` `handleResend` moves `startResendCooldown()` inside the `if (res.ok)` branch; catch block sets `codeError` instead of swallowing silently.
- 01-03: `middleware.js` wraps `supabase.auth.getUser()` in try/catch; protected routes redirect to `/login?next=<pathname>` on failure, public routes pass through.
- 01-04: `callback/route.js` deleteUser failure now logs `[NEEDS_CLEANUP] auth.users orphan: <uid>`; `send-magic-link/route.js` createUser failure paths get the same marker.

**P2 commit `cefad67`** — five fixes:
- 01-05: `middleware.js` `/kids` redirect now checks `app_metadata.is_kid_delegated` / `kid_profile_id` before choosing destination; kid JWTs go to `/kids-app` rather than `/profile/kids`.
- 01-06: `send-magic-link/route.js` reads `next` from request body (validated via `resolveNext`) and appends `&next=…` to the actionLink URL; `confirm/route.ts` reads `?next` and calls `resolveNextForRedirect`; `_SingleDoorForm.tsx` passes `rawNext` in the fetch body to complete the end-to-end path.
- 01-07: `server.ts` cookie `set`/`remove` catch blocks in both `createClient()` and `createOtpClient()` now log `[supabase] cookie-set/remove failed` with the error message.
- 01-08: `profile/kids/page.tsx` load() wraps `refreshAllPermissions()` in try/catch; on RPC failure `setLoadError(true)` renders the error state instead of the misleading upsell modal.

**01-00 commit `d2da5a0`** — RPC rename:
- `auth.js:346` changed from `compute_effective_perms({ p_user_id })` to `my_permission_keys()` (no params). Rows normalized with `granted: true` on build since `my_permission_keys` only returns granted permissions. Callers (`requirePermission`, `hasPermissionServer`) continue to use `r.granted === true` unchanged. Cross-surface risk across slices 03–08 resolved.

**TypeScript check:** `npx tsc --noEmit` — zero errors after each commit group.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 02 — Navigation & discovery. Read `NavWrapper.tsx` (uncommitted changes in git status at session start), `_homeShared.ts`, `page.tsx`, `browse/`, `search/`, `leaderboard/`, and the `/story/` directory. Verify FK hints on any `.select()` with `!` syntax. Spawn parallel Explore agents as per slice session protocol.

---

## Session 3 — 2026-04-30 — Slice 02: Navigation & discovery investigation

**Phase entering:** 2 (slice 02 not-started).
**Phase leaving:** 2 (slice 02 locked — 3 confirmed issues).

**What happened.** Four parallel Explore agents investigated the home feed (Agent A), browse/search/leaderboard (Agent B), NavWrapper and routing (Agent C), and static/utility pages (Agent D). After synthesizing 4 prioritized findings (one dropped per owner: `/mockup-explore` vs `/browse` mismatch is an in-progress test surface, not a bug), a fresh adversarial agent was spawned.

Adversarial review expanded the scope of two findings: 02-00 scope confirmed to cover `readLogPromise` chain as well as Promise.all; 02-01 scope expanded from 1 page (browse) to 3 pages (browse, category, following). Adversary also identified 4 potential wont-fix items, all triaged out as either defended by existing guards, architectural scope, or already handled by type constraints.

Cross-surface finding #1 (`/community-guidelines` dead link) closed: full-repo grep found zero callers in `web/src`. Route missing but nothing points to it.

Stories-as-containers migration verified clean across home, browse, search, leaderboard. All `stories(slug)` joins correct. FK hint `categories!fk_articles_category_id` verified against `database.ts:1782`. NavWrapper anon/free/pro/admin states all correct. Referral handler, static pages, and `/category/[id]/` all clean.

**What got locked.** Slice doc written at `slices/02-nav-discovery.md` with 3 confirmed issues:
- 02-00 (P1): Home feed `Promise.all` at `page.tsx:156–218` has no try/catch; no app-root error boundary; thrown exceptions show raw Next.js 500
- 02-01 (P2): Article links use `/story/` prefix in `browse/page.tsx:392`, `category/[id]/page.js:395`, `following/page.tsx:150` — extra redirect hop; canonical URL is `/<slug>`
- 02-02 (P3): `_HomeFirstLoginMoment.tsx:88–90` and `114–119` — two silent catch blocks with no logging

**What's blocked.** `following/page.tsx:150` uses `story.slug` directly — implementation agent must read the full file to verify query shape before changing the href.

**What next session should pick up.** Slice 02 implementation. Read `slices/02-nav-discovery.md` in full. Confirm current code still matches investigation descriptions before touching anything. Fix in priority order: 02-00 first (P1 crash risk), then 02-01 (three files), then 02-02 (two catch blocks). TypeScript check after each issue group. One commit per issue.

---

## Session 4 — 2026-04-30 — Slice 02: Implementation

**Phase entering:** 2 (slice 02 locked).
**Phase leaving:** 2 (slice 02 shipped — all 3 issues resolved, zero TypeScript errors).

**What happened.** Read slice doc, README, and auto-memory. Read all cited files and verified current code matched investigation descriptions before writing anything. Key pre-edit finding: `following/page.tsx:150` queries the `stories` table as a flat row (not a join), so `story.slug` is a direct column guarded by the outer ternary — the href fix is a straight `/story/` → `/` drop with no null-guard change needed.

**02-00 commit `2ce74ae`** — try/catch wrap for home fetch:
- Declared five response holders (`storiesRes`, `breakingRes`, `catsRes`, `readLogRes`, `topStoriesRes`) as `let` with null defaults before the try block, plus `lastVisitMs` and `fetchThrew = false`.
- Wrapped `page.tsx:156–218` in a single try/catch covering the `cookies()` call, `readLogPromise` construction, and the `Promise.all` destructuring.
- On catch, logs `[home.fetch]` + error and sets `fetchThrew = true`.
- Updated `fetchFailed` from `topArticles.length === 0 && !!storiesRes.error` to `(topArticles.length === 0 && !!storiesRes.error) || fetchThrew` — routes any throw to `<HomeFetchFailed />`.
- Also updated `readLogPromise` return type and both return objects to include `error: null` so TypeScript accepts the assignment into the typed holder.

**02-01 commit `4523058`** — canonical article URLs:
- `browse/page.tsx:392` — `\`/story/${h.slug}\`` → `\`/${h.slug}\``
- `category/[id]/page.js:395` — `\`/story/${story.stories.slug}\`` → `\`/${story.stories.slug}\``
- `following/page.tsx:150` — `\`/story/${story.slug}\`` → `\`/${story.slug}\``

**02-02 commit `dc6659d`** — observable catch blocks:
- `_HomeFirstLoginMoment.tsx:88–90` catch block: `catch {}` → `catch (e) { console.error('[home.first-login-moment] fetch error', e); }`
- `_HomeFirstLoginMoment.tsx:114–119` catch block: `catch {}` → `catch (e) { console.error('[home.first-login-moment] update error', e); }`
- Fallback behavior (overlay omitted, update skipped) unchanged.

**TypeScript check:** `npx tsc --noEmit` — zero errors after each commit.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 03 — Article reading. Focus on the `web/src/app/[slug]/` story page and the article-lifecycle client islands: `ArticleEngagementZone`, `ArticleTracker`, `SourcesSection`, `TimelineSection`. Verify event tracking, quiz mount, comment mount. Check all `stories(slug)` joins for FK hint correctness. Cover anon, free, pro, and admin account types. Spawn parallel Explore agents as per slice session protocol.

---

## Session 5 — 2026-04-30 — Slice 03: Article reading investigation

**Phase entering:** 3 (slice 03 not-started).
**Phase leaving:** 3 (slice 03 locked — 6 confirmed issues + 1 wont-fix).

**What happened.** Four parallel Explore agents investigated the story page and article surface (Agent A), quiz flow end-to-end (Agent B), comment thread / composer / realtime (Agent C), and event tracking / ArticleTracker (Agent D). After synthesizing 7 prioritized findings, a fresh adversarial agent was spawned.

Adversarial review made three meaningful changes:
1. **Finding 3 upgraded from "unverified" to "confirmed broken":** `users!user_id` in `api/comments/route.js:185` is the wrong FK hint — `database.ts` defines `foreignKeyName: "fk_comments_user_id"`; two other callers in the codebase use the correct form.
2. **Finding 6 (userTier prop) → wont-fix:** `userTier` is declared in `ArticleQuiz` props interface but never destructured or read inside the component. No functionality affected.
3. **New finding added (03-05):** `page.tsx:167–170` accesses `.count` / `.data` from Supabase results without checking `.error` — Supabase errors return `{ data: null, error }`, not thrown exceptions, so they bypass the try/catch from 03-00. Companion issue to 03-00.

The adversary also confirmed: no `error.tsx` exists inside `web/src/app/[slug]/` (only `loading.tsx` and `not-found.tsx`); root `error.js` is the only fallback for unhandled rejections from the article page.

**Large clean surface:** Quiz flow (pool exhaustion stripped, selected_answer as option text, RPC takes article_id UUID), T300 realtime fix (both initial load AND realtime inserts use `public_profiles_v`), comment lock/unlock in-place, notification URLs (`/<slug>`), post_comment story_id, events/batch anon-allowed by design (sendBeacon works correctly), quiz FK sweep clean.

**What got locked.** Slice doc written at `slices/03-article-reading.md` with 6 confirmed issues and 1 wont-fix:
- 03-00 (P0): `page.tsx:126–163` Promise.all() no try/catch; no `[slug]/error.tsx`; root error.js only fallback
- 03-01 (P1): `ArticleTracker.tsx:41` sentinels at `${pct}vh` from document.body, not article-relative — all scroll analytics wrong
- 03-02 (P1): `api/comments/route.js:185` wrong FK hint `users!user_id` — correct is `users!fk_comments_user_id` — response join silently returns no author data
- 03-03 (P2): `page.tsx:161` timeline fetch hardcodes `.eq('type', 'event')` — `type='article'` entries never fetched
- 03-04 (P2): `page.tsx:175` `incrementViewCount` `.catch(() => {})` with no logging
- 03-05 (P2): `page.tsx:167–170` `.count` / `.data` accessed without `.error` check — Supabase errors bypass try/catch
- 03-06 (P3): `page.tsx:119` invalid `?a=` param falls through to first article silently
- wont-fix: `userTier` dead prop in ArticleQuiz

**Implementation order:** 03-00 + 03-05 together (page.tsx), then 03-02 (comments route — one character), then 03-01 (ArticleTracker — element-relative sentinels), then 03-03 + 03-04 (page.tsx batch), then 03-06 (P3 — discuss redirect vs. silent fallback before touching).

**What's blocked.** 03-03 (timeline type filter removal) requires a check of `TimelineSection.tsx` to confirm it handles `type='article'` entries before the filter is removed — if it only renders `type='event'`, the section code needs updating too. The implementation agent must read both files before writing anything.

**What next session should pick up.** Slice 03 implementation. Read `slices/03-article-reading.md` in full. Confirm current code still matches investigation descriptions before touching anything. Fix in priority order: 03-00 + 03-05 first (P0 crash risk + companion), then 03-02 (P1, one-line FK fix), then 03-01 (P1, ArticleTracker sentinel placement), then 03-03 + 03-04 (P2), then 03-06 (P3, confirm owner prefers redirect vs. silent fallback). TypeScript check after each commit group.

---

## Session 6 — 2026-04-30 — Slice 03: Article reading implementation

**Phase entering:** 3 (slice 03 locked).
**Phase leaving:** 4 (slice 03 shipped — all 6 issues resolved, zero TypeScript errors).

**What happened.** Read slice doc, README, and auto-memory. Read all cited files before writing anything: `page.tsx` (confirmed Promise.all at 126–163 without try/catch, `.catch(() => {})` at 175, `.eq('type','event')` filter at 161), `ArticleTracker.tsx` (confirmed `${pct}vh` sentinel placement at 41), `api/comments/route.js:185` (confirmed `users!user_id` wrong hint), `TimelineSection.tsx` (confirmed only `event_label`/`event_body` rendered, no type handling), `database.ts` timelines section (confirmed `linked_article_id` + `type` fields, FK name `timelines_linked_article_id_fkey`). Pre-implementation check found that 03-03 required updating both the query select string AND TimelineSection, since the component had no type field at all.

For 03-06, owner chose Option A (redirect to `/<slug>`) over Option B (silent warn) — stale share links now land on the canonical story URL instead of silently rendering the wrong article.

**Commit `fee1eb5` — 03-00 + 03-05 (P0):**
- `page.tsx`: IIFE pattern wraps Promise.all in try/catch; fetchResult.ok guard returns `<ArticleFetchFailed />` on any thrown exception.
- After destructure: `quizCountResult.error` and `passCheckResult.error` checked; failing results default to `hasQuiz=false` / `initialPassed=false` with console.error.
- Timeline query updated at the same time to include `type, linked_article_id` (needed for 03-03 fix landed in `9df8ca5`).
- New `_ArticleFetchFailed.tsx` — client island with `router.refresh()` retry button, matching `_HomeFetchFailed` pattern.
- New `error.tsx` — Next.js error boundary for the `[slug]` segment; calls `reset()` on retry.

**Commit `8166fde` — 03-02 (P1):**
- `api/comments/route.js:185`: `users!user_id(` → `users!fk_comments_user_id(`. Matches `foreignKeyName` in `database.ts`; matches two other callers in the codebase.

**Commit `9afd119` — 03-01 (P1):**
- `ArticleTracker.tsx`: `placeSentinels()` function queries `[data-article-body]` element; computes `articleTop = el.getBoundingClientRect().top + window.scrollY` and `articleHeight = el.offsetHeight`; places each sentinel at `articleTop + (pct/100) * articleHeight`. Falls back to window.innerHeight with console.warn if element absent. `ResizeObserver` repositions on height change (e.g. lazy image loads).
- `ArticleSurface.tsx`: added `data-article-body` attribute to the body `<div>`.

**Commit `9df8ca5` — 03-03 + 03-04 (P2):**
- `page.tsx:161`: removed `.eq('type', 'event')` filter; select string already included `type, linked_article_id` from the 03-00 commit.
- `TimelineSection.tsx`: `TimelineItem` gains `type: 'event' | 'article' | string` and `linked_article_id: string | null`; component gains optional `storySlug?: string` prop; `type='article'` entries with a non-null `linked_article_id` render as `<a href="/<storySlug>?a=<id>">` anchors. Latent bug — no production type='article' entries exist yet.
- `ArticleSurface.tsx`: passes `storySlug={article.slug}` to `<TimelineSection>`.
- `page.tsx:175`: `.catch(() => {})` → `.catch((e) => console.error('[article] incrementViewCount failed', e))`.

**Commit `291b354` — 03-06 (P3):**
- `page.tsx`: added `redirect` to `next/navigation` import; replaced fallthrough `?? found.article` with an explicit check — if `searchParams.a` is present and no article matches, calls `redirect(\`/${story.slug}\`)`. Clean canonical URL; no ghost param in the reader's address bar.

**TypeScript check:** `npx tsc --noEmit` — zero errors after each commit.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 04 — Reader engagement & social. Surfaces: bookmarks (`/api/bookmarks/`, `BookmarkButton`), following (`/api/follows/`, `FollowButton`), notifications (`/notifications`, `/api/notifications/`), public profiles (`/profile/[username]/`), expert queue (`/api/expert/queue/`), recap. Cover anon, free, pro, and admin. Verify FK hints on any `.select()` with `!` syntax. Spawn parallel Explore agents per slice session protocol.

---

## Session 7 — 2026-04-30 — Slice 04: Reader engagement & social investigation

**Phase entering:** 5 (slice 04 not-started).
**Phase leaving:** 5 (slice 04 locked — 6 confirmed issues + 1 wont-fix).

**What happened.** Carried forward: NotificationsCard GET/PATCH fix (N-01, `09fdb4f`), BookmarksSection null slug fix (P-08, `a548c9a`), and three known-fixed FK mismatches from profile-bugfix and slice 03.

Four parallel Explore agents investigated bookmarks + following (Agent A), notifications + public profiles (Agent B), leaderboard + expert queue + recap (Agent C), and engagement API routes (Agent D). After synthesizing 7 prioritized findings, a fresh adversarial agent reviewed all claimed issues against current code.

Adversarial review: confirmed all 7 claims with exact file:line; classified Finding 4 (follows API RPC-only ownership) as wont-fix — `user.id` is auth-derived, route already has `requirePermission('profile.follow')`, no second user ID exists to spoof; adversary's analysis found no missed bugs beyond what was already captured in Issue 1 (expert queue buttons — A1 and A2 were sub-items, not new findings).

**What got locked.** Slice doc written at `slices/04-engagement-social.md` with 6 confirmed issues and 1 wont-fix:
- 04-01 (P1): Expert queue action buttons (Claim, Decline, Post answer, Post back-channel) — no per-action loading state; double-fire risk. `expert-queue/page.tsx:362, 365, 490, 610`
- 04-02 (P2): Bookmarks delete Remove button — no disabled state; rapid clicks queue multiple DELETEs via undo-timer pattern. `bookmarks/page.tsx:629-642`
- 04-03 (P2): Notifications markAllRead button — no loading/disabled state; double-fire risk. `notifications/page.tsx:354`
- 04-04 (P2): Following page — both queries discard `error`; fetch failures silently show empty state. `following/page.tsx:64-68, 82-88`
- 04-05 (P3): Recap — `.catch(() => ({}))` swallows all fetch errors; "No recaps ready yet" on 500. `recap/page.tsx:112-123`
- 04-06 (P3): Expert queue `btn()` helper — `cursor: 'pointer'` unconditional; disabled buttons show no visual change. `expert-queue/page.tsx:623-644` (implement together with 04-01)
- wont-fix: Follows API passes `p_follower_id: user.id` to RPC only — auth-derived, not spoofable; `requirePermission` already gates.

**Large clean surface:** All FK hints correct. Bookmarks slug pattern correct (`stories?.slug`). Bookmarks API ownership checks all present. Notifications API ownership checks present. Public profile reads only `public_profiles_v`, `notFound()` on missing username, no private field leaks. Leaderboard anon CTA present, bounded queries. Expert queue permission gate correct. Recap empty/launch-hide/paywall states all correct.

**What's blocked.** Nothing. All 6 issues have complete fix plans.

**What next session should pick up.** Slice 04 implementation. Read `slices/04-engagement-social.md` in full. Confirm current code still matches investigation descriptions before writing anything. Suggested implementation order: 04-01 + 04-06 together (expert queue buttons + CSS, same file, same commit), then 04-02 (bookmarks delete), then 04-03 (notifications markAllRead), then 04-04 (following error state), then 04-05 (recap error state). TypeScript check after each commit. One commit per issue (or paired where noted).

---

## Session 8 — 2026-04-30 — Slice 04: Reader engagement & social implementation

**Phase entering:** 5 (slice 04 locked).
**Phase leaving:** 6 (slice 04 shipped — all 6 issues resolved, zero TypeScript errors).

**What happened.** Read all five cited files before writing anything — all descriptions matched current code exactly. Implemented in five commits.

**Commit `5cbc050` — 04-01 + 04-06 (P1/P3):**
- `expert-queue/page.tsx`: Added `pendingId` and `postingBack` state. Wrapped `handleClaim`, `handleDecline`, `handleAnswer` in try/finally — each sets `setPendingId(id)` before fetch, clears in finally. `postBackMessage` sets `setPostingBack(true)` before fetch, clears in finally. All four button callsites updated with `disabled` prop and pass computed disabled state to `btn()` / inline spread for `btnGhost`. `btn()` now accepts `disabled` param: `cursor: 'not-allowed'`, `opacity: 0.5` when true.

**Commit `6577e76` — 04-02 (P2):**
- `bookmarks/page.tsx`: Added `deletingId` state. `removeBookmark()` returns early if `deletingId === id`. Sets `deletingId` before `setItems`. Clears on: undo callback (item restored), DELETE success, DELETE failure (item restored). Remove button: `disabled={deletingId === b.id}`, `cursor`/`opacity` conditional.

**Commit `d47bc60` — 04-03 (P2):**
- `notifications/page.tsx`: Added `markingAll` state. `markAllRead()` wraps in try/finally — `setMarkingAll(true)` before fetch, clears in finally. Now `await`s `load()` so button stays disabled until inbox refreshes. "Mark all read" button: `disabled={markingAll}`, `cursor`/`opacity` conditional.

**Commit `4412bec` — 04-04 (P2):**
- `following/page.tsx`: Extracted IIFE into named `loadStories()`. Added `error` state and `ErrorState` import. Both Supabase queries now destructure `error`; on error, sets message and returns early. Render: `error ?` branch before `stories.length === 0` branch; `onRetry={loadStories}` gives users a recovery path.

**Commit `ae6eb00` — 04-05 (P3):**
- `recap/page.tsx`: Added `fetchError` and `reloadKey` state (both with launch-hide `eslint-disable` comments). `setFetchError(null)` + `setLoading(true)` at start of IIFE. Existing `try/finally` gains explicit `catch` block setting `fetchError`. Effect deps changed from `[]` to `[reloadKey]`. Added `ErrorState` import. Render: `fetchError ?` branch before `recaps.length === 0` branch; retry increments `reloadKey`.

**TypeScript check:** `npx tsc --noEmit` — zero errors after each commit.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 05 — Messaging. Read `web/src/app/messages/page.tsx`, the message thread component, and the conversation list component. Read `web/src/app/api/messages/` and `web/src/app/api/conversations/` routes. Cover: realtime subscription state, pro-only DM gate, silent catch blocks (profile-bugfix P-09 pattern). Spawn parallel Explore agents per slice session protocol.

---

## Session 9 — 2026-04-30 — Slice 05: Messaging (full session)

**Phase entering:** 6 (slice 05 not-started).
**Phase leaving:** 7 (slice 05 shipped — all 8 issues resolved, zero TypeScript errors).

**What happened.** Session ran Phase 1 (slice doc) and Phase 2 (implementation) back-to-back. Before writing anything, opened all cited files and verified every line number exactly. All descriptions matched current code.

Key pre-implementation findings:
- `sendMessage` (line 498): `setInput('')` called before `await fetch()` with no `sending` gate — confirmed double-fire vector.
- `blockOtherUser` (lines 672–704): try/catch present but no `blocking` state — button at 1293 had no `disabled`.
- `submitReport` (lines 709–741): `disabled={!reportReason.trim()}` only — no in-flight guard.
- `startConversation` (lines 570–643): `!res.ok` path at 605 — `console.error` + close, no toast; null convo re-fetch at 632 — close, no toast; no `starting` guard on search result items at 1785+.
- `get_unread_counts` (line 270): error discarded, confirmed.
- `searchUsers` (line 569): `setSearchResults(res.ok ? users : [])` — no error state, confirmed.
- `api/messages/route.js:35` and `api/conversations/route.js:34`: silent catch fallbacks confirmed.

**Commit `0a52580` — 05-01 + 05-02 + 05-03:**
- `messages/page.tsx`: Added `sending`, `blocking`, `submittingReport` states.
- `sendMessage`: `if (sending) return` guard; `setSending(true)` before fetch; try/finally clears; Send button: `disabled={!input.trim() || !!dmLocked || sending}`.
- `blockOtherUser`: `if (blocking) return` guard; `setBlocking(true)` before fetch; finally clears; Block button: `disabled={blocking}`, `cursor`/`opacity` conditional.
- `submitReport`: `if (submittingReport) return` guard; `setSubmittingReport(true)` before fetch; finally clears; Submit button: `disabled={!reportReason.trim() || submittingReport}`.

**Commit `541dc90` — 05-04:**
- `messages/page.tsx`: Added `starting` state. `startConversation`: `if (starting) return` guard; `setStarting(true)` before fetch block; try/finally clears. `!res.ok` path: `toast.error(errMsg || 'Could not start conversation. Try again.')`. Null convo re-fetch path: `toast.error('Could not open conversation. Try again.')`. Search result items: `pointerEvents: starting ? 'none' : 'auto'`, `opacity: starting ? 0.5 : 1`.

**Commit `e6b13b5` — 05-05:**
- `messages/page.tsx:270`: destructured `countsErr`; `if (countsErr) console.error('[messages] get_unread_counts', countsErr)`; continued with existing `|| []` fallback.

**Commit `4e9d0cf` — 05-06:**
- `messages/page.tsx`: Added `searchError` state. `searchUsers`: clears error at start; on `!res.ok` sets `'Search failed. Try again.'` and returns. Modal: error renders in red above results; "No users found." hidden while error is set. Escape handler and backdrop click both clear `searchError`.

**Commit `b78eb3a` — 05-07 + 05-08:**
- `api/messages/route.js:35`: `.catch(() => '')` → `.catch((e) => { console.error('[messages.post] body-read failed', e); return ''; })`.
- `api/conversations/route.js:34`: `.catch(() => ({}))` → `.catch((e) => { console.error('[conversations.post] json-parse failed', e); return {}; })`.

**TypeScript check:** `npx tsc --noEmit` — zero errors after each commit.

**Clean surfaces:** No FK hints found in messaging queries. Realtime channel cleanup correct. DM paywall and pro gate correct. Read receipts opt-out correct. `/api/conversations` rate limit present.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 06 — Billing & subscription. Surfaces: `/billing`, Stripe checkout/portal/webhook, plan gates, `/pricing`. Cover: anon, free, pro, admin. Verify FK hints. Watch for silent fetch failures in Stripe webhook handler and plan-gate checks.

---

## Session 10 — 2026-04-30 — Slice 06: Billing & subscription (full session)

**Phase entering:** 7 (slice 06 not-started).
**Phase leaving:** 8 (slice 06 shipped — 12 issues resolved + 1 wont-fix, zero TypeScript errors).

**What happened.** Session ran Phase 1 (investigation + slice doc) and Phase 2 (implementation) back-to-back. Four parallel Explore agents investigated: billing page + appeal + subscription API routes (Agent A), pricing page + plan gates + promo route (Agent B), Stripe checkout + portal routes (Agent C), and Stripe webhook handler full security audit (Agent D). A fresh adversarial agent reviewed all confirmed findings against current code before locking.

Key pre-implementation findings (all verified against current code before touching anything):

- `billing/page.tsx` is a redirect shim only — no bugs.
- `pricing/page.tsx` is fully static — no fetches, no bugs.
- `api/stripe/checkout/route.js` and `portal/route.js` clean — try/catch present, customer_id verified, idempotency key on checkout.
- Webhook: signature verification, idempotency (UNIQUE constraint + status machine), and raw body handling all correct. 7 DB write sites lacked error checks.
- **Critical regression found in investigation:** `resume()` in `BillingCard.tsx:135` sends POST with no body; `resubscribe/route.js:32` requires `planName`; function permanently broken with 500 response.
- **FK hint check:** zero `!` hints found in any billing file. Clean.
- Adversarial review confirmed all 11 original issues, added 06-12 (webhook `handleChargeRefunded` auto-freeze RPC unguarded) and classified 06-13 as wont-fix.

**Commit `01b188a` — P1 client (06-00 frontend + 06-01 + 06-02 + 06-03):**
- `BillingCard.tsx:135` `resume()`: now sends `planName: plan?.name` in POST body; without it the API always 500d.
- `BillingCard.tsx:56-80` async load IIFE: wrapped in try/catch; `sRes.error` and `pRes.error` now checked; Supabase failures no longer coerce to null and leave spinner stuck.
- `appeal/page.tsx:38-66` `load()`: wrapped in try/catch; `profileErr` and `warnErr` checked; on failure surfaces user-visible error and returns early instead of silently showing wrong penalty state.
- `appeal/page.tsx:212` submit button: `submitting` state tracks in-flight warning ID; button `disabled` + opacity + label change; `finally` clears.

**Commit `023b2e0` — P1 API routes (06-05 + 06-00 backend):**
- `resubscribe/route.js:32` and `change-plan/route.js:29`: `await request.json()` → `await request.json().catch(() => ({}))`. Matches `checkout/route.js:47` pattern. Missing body no longer throws SyntaxError → 500.

**Commit `2bccb70` — P1 webhook (06-04):**
- `webhook/route.js:1175-1186` `handleCustomerDeleted`: destructured `cancelErr`; throws on DB failure so webhook returns 500 and Stripe retries rather than silently skipping the account freeze.

**Commit `28f76cd` — P2 webhook batch (06-06 + 06-07 + 06-08 + 06-09 + 06-12):**
- Line 456: `stripe_customer_id` bind UPDATE — throw on error.
- Line 1053: grace period clear UPDATE — throw on error.
- Line 1210: `stripe_customer_id` clear UPDATE — console.error + throw on error.
- Line 590: uncancel fallback UPDATE — throw on error.
- Line 717: `handleChargeRefunded` auto-freeze RPC — destructured `freezeErr`; throw on error.

**Commit `df4620a` — P2 post-checkout (06-10):**
- `ProfileApp.tsx`: added `useEffect` that fires once `resolved=true` and `searchParams.get('success') === '1'`: fires `toast.success`, calls `refreshAllPermissions()` + bumps `permsTick`, then `router.replace` strips the param. The `void searchParams` placeholder removed. Import of `refreshAllPermissions` added.

**Commit `45cdd99` — P3 logging (06-11):**
- `webhook/route.js:240`: added `console.log('[stripe.webhook] unhandled event type:', event.type)` to the default case. Comment claimed logging; now it's true.

**TypeScript check:** `npx tsc --noEmit` — zero errors after each commit.

**Clean surfaces:** Stripe checkout + portal routes (try/catch, idempotency, validation, customer_id check, null URL guard all present). Pricing page (static, no fetch). Promo route (rate-limited, LIKE-escaped, duplicate-checked, rollback on failure). `billing/page.tsx` redirect shim. No FK hints anywhere in billing files.

**What's blocked.** Nothing.

**What next session should pick up.** Slice 07 — Admin surfaces. Read `web/src/app/admin/layout.tsx` (auth + role check entry point), then spawn parallel Explore agents across the admin sub-tree. Key areas: newsroom, moderation/reports (rewritten in article-lifecycle session 8), pipeline, users, and the service-client routes that bypass RLS — each must verify it checks permission before executing. The `quiz-regenerate` endpoint rejects on any verification disagreement (known gap from article-lifecycle). The `v2_live` kill switch has no admin UI (DB-direct only — known gap). Confirm the AI-flagged tab in reports uses `moderation_actions` rows with `action='ai_flagged'` correctly.
