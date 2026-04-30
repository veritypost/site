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
