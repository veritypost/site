# Zone Z16: web/src/components + tests + public

## Summary

54 component files (24 shared, 30 admin, 3 kids), 26 Playwright `.spec.ts` files (≈3.4k LOC of tests + 1.1k LOC of fixtures/seed scaffolding), and a public/ folder containing only `ads.txt`. Components are in solid shape: nine still in `.js`/`.jsx` (all in `components/admin/`), three of them now have TypeScript siblings (e.g. `admin/ConfirmDialog.jsx` vs root `ConfirmDialog.tsx`); same component name across both is intentional but should be reconciled in naming. Three orphans found: `RecapCard.tsx`, `admin/Sidebar.jsx`, and the `admin/ToastProvider.jsx` re-export shim is dead weight (every importer goes through `Toast.jsx` directly). Tests are pure black-box "no 5xx" smokes — they do not exercise UI components themselves; they sign in via Playwright and assert API status codes. Test infrastructure (seed fixture + per-user creation) is solid and honest about its failure modes. `public/` is empty except `ads.txt`; no robots.txt, no favicons, no `apple-app-site-association` despite three CLAUDE.md mentions of it being a launch dependency.

## Components

### components/AccountStateBanner.tsx
- Purpose: top-of-page status banner for banned / locked / muted / deletion-scheduled / frozen-score / grace-period users
- Props: `{ user: Partial<Tables<'users'>> | null | undefined }`
- Context consumed: none — pure derivation from `user` row
- API calls: none
- Used in: `web/src/app/NavWrapper.tsx`
- Lang: TS
- Concerns: none — clean state machine, dates serialized to ISO + rendered with `toLocaleString`. 6 distinct severities, all pure functions.

### components/Ad.jsx
- Purpose: tier-aware ad slot; fetches creative via `serve_ad` RPC, dispatches to AdSense path or sandboxed iframe / direct image path
- Props: `{ placement, page='unknown', position='inline', articleId=null }`
- Context: none
- API calls: `GET /api/ads/serve`, `POST /api/ads/impression`, `POST /api/ads/click`
- Used in: `Interstitial.tsx`
- Lang: **JS** (drift — should be TS)
- Concerns: Ext-D23 marker says client deliberately skips `hasPermission('article.view.ad_free')` (server's `serve_ad` RPC is sole arbiter). Has a security-conscious URL allowlist for `creative_url`/`click_url` but the in-line TODO at line 92-93 (`also validate at /api/admin/ad-units POST so DB never holds a poisoned URL`) is unresolved.

### components/AdSenseSlot.tsx
- Purpose: renders `<ins class="adsbygoogle">` and pushes to `window.adsbygoogle` exactly once per mount
- Props: `{ slotId, publisherId, format='auto', fullWidthResponsive=false, style? }`
- Context: none
- API calls: none
- Used in: `Ad.jsx` (only)
- Lang: TS
- Concerns: none

### components/ArticleQuiz.tsx
- Purpose: 5-question comprehension quiz; passes unlock comments. Multi-stage state machine (idle → answering → result → passed). Triggers ad interstitial every 3rd quiz on free tier
- Props: `{ articleId, initialPassed?, userTier?, kidProfileId?, onPass? }`
- Context: `hasPermission` (quiz.attempt.start, quiz.retake, quiz.retake.after_fail, article.view.ad_free)
- API calls: `POST /api/quiz/start`, `POST /api/quiz/submit`
- Used in: `web/src/app/story/[slug]/page.tsx`
- Lang: TS
- Concerns: none — recently polished with the "calm card / you're in" passed-state UX, results screen for failed attempts. `userTier` prop is destructured but never used (line 67 — could remove).

### components/Avatar.tsx
- Purpose: round avatar with outer/inner color and 1-3 char initials; emoji-safe (uses `Array.from` for first code point)
- Props: `{ user?, size=32 }`
- Context: none
- API calls: none
- Used in: `CommentRow.tsx`, plus `app/leaderboard/page.tsx`, `app/profile/category/[id]/page.js`
- Lang: TS
- Concerns: none

### components/CommentComposer.tsx
- Purpose: textarea + post button; resolves `@username` mentions if user has `comments.mention.insert`
- Props: `{ articleId, parentId?, currentUserTier?, onPosted?, onCancel?, autoFocus? }`
- Context: `hasPermission`, supabase user client (reads `users` row for ban/mute state)
- API calls: `POST /api/comments`
- Used in: `CommentThread.tsx`, `CommentRow.tsx` (reply slot)
- Lang: TS
- Concerns: L-08 comment is correct — uses `.match()` instead of `.test()` to avoid `lastIndex` state leakage on the `/g`-flagged `MENTION_RE`. Mute-state derivation is duplicated logic from `AccountStateBanner.pickState()` — both compute `isActiveMute()` independently; could share a helper.

### components/CommentRow.tsx
- Purpose: single comment + nested replies; vote buttons, context-tag, reply, edit/delete (own), report/block (others), supervisor flag, mod hide
- Props: heavy — `{ comment, replies, currentUserId, currentUserTier?, currentUserVerified, authorCategoryScore, articleId, viewerIsSupervisor, viewerIsModerator, onVote, onToggleTag, onDelete, onEdit, onReport, onBlock, onFlag?, onHide?, onReplied?, depth }`
- Context: `hasPermission` × 8 keys
- API calls: none directly — all callbacks bubble up to `CommentThread`
- Used in: `CommentThread.tsx` only
- Lang: TS
- Concerns: `COMMENT_MAX_DEPTH = 2` mirrors a DB setting (`comment_max_depth` from schema/033). Comment in code (L31) names this drift correctly — it should fetch from `/api/settings/public` someday. Touch targets are 44pt (Ext-O7) — good. `EnrichedComment` type is exported and consumed by `CommentThread`.

### components/CommentThread.tsx
- Purpose: top-level comment list, dialog manager (delete/report/flag/hide/block), realtime subscription, expert-question dialog, "just revealed" comment-stagger animation
- Props: `{ articleId, articleCategoryId, currentUserId, currentUserTier?, justRevealed? }`
- Context: `hasPermission`, MOD_ROLES, supabase user client (heavy reads — comments + votes + tags + blocked_users + supervisor RPC + roles)
- API calls: `POST /api/comments/[id]/vote`, `POST /api/comments/[id]/context-tag`, `POST /api/comments/[id]/report`, `POST /api/comments/[id]/flag`, `POST /api/admin/moderation/comments/[id]/hide`, `POST /api/users/[id]/block`, `PATCH /api/comments/[id]`, `DELETE /api/comments/[id]`, `POST /api/expert/ask`
- Used in: `web/src/app/story/[slug]/page.tsx`
- Lang: TS
- Concerns: this is a 920-line component — the dialog-state machine, realtime subscription, and the moderator/supervisor role derivation could all reasonably split out. `MOD_ROLES.has(name)` is the only non-perm-based gate left in here (line 164); everything else is in the permission matrix. Worth flagging for a future refactor task, not a bug.

### components/ConfirmDialog.tsx
- Purpose: user-facing confirmation modal with focus trap, danger styling
- Props: `{ open, title?, message?, confirmLabel?, cancelLabel?, danger?, busy?, onConfirm?, onClose? }`
- Context: none
- API calls: none
- Used in: `app/u/[username]/page.tsx`, `app/bookmarks/page.tsx`, `app/profile/kids/page.tsx`
- Lang: TS
- Concerns: there is a separate `admin/ConfirmDialog.jsx` for admin use. Both have focus traps; the admin one has the imperative `confirm()`/`ConfirmDialogHost` API while this one is purely controlled. Names colliding is a minor friction (will be read as "the same component" in import searches). Not a bug — by-product of "different audiences need different defaults" — but a single file with a `variant: "user" | "admin"` prop would scale better.

### components/FollowButton.tsx
- Purpose: follow / unfollow toggle, hides itself if viewer === target or viewer lacks `profile.follow`
- Props: `{ targetUserId, initialFollowing?, viewerUserId?, onChange? }`
- Context: `hasPermission`
- API calls: `POST /api/follows`
- Used in: not imported by anything in `app/` or `lib/` — appears to be unused now (orphan); needs follow-up
- Lang: TS
- Concerns: reads as orphan. Last grep for `from .*components/FollowButton` returned zero hits in `app/` or `lib/`. Confirmed by repeated direct grep — the `/api/follows` endpoint exists, but the UI button isn't wired to any current page. **Note as orphan.**

### components/GAListener.tsx
- Purpose: fires GA4 `page_view` on every Next.js client-side navigation
- Props: none
- Context: none
- API calls: none (gtag global)
- Used in: `web/src/app/layout.js`
- Lang: TS
- Concerns: none — comment correctly notes this is a workaround for App Router's no-auto-pageview behavior. `process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID` gate makes it inert in dev.

### components/Interstitial.tsx
- Purpose: full-screen overlay (signup CTA or ad) with body-scroll lock
- Props: `{ open, onClose, variant='ad', adPlacement='interstitial', ctaHref='/signup' }`
- Context: useFocusTrap
- API calls: none
- Used in: `ArticleQuiz.tsx`
- Lang: TS
- Concerns: none

### components/JsonLd.tsx
- Purpose: server-rendered JSON-LD for SEO; helpers for `organizationAndWebSite`, `newsArticle`, `person` schemas
- Props: `{ data: Record<string, unknown> }`
- Context: none — server component (no `'use client'`)
- API calls: none
- Used in: `web/src/app/layout.js`, `web/src/app/story/[slug]/page.tsx`
- Lang: TS
- Concerns: OWASP-correct `</` → `<\/` escape on the JSON; flagged as `<` → `<` instead, equivalent. Looks tight.

### components/LockModal.tsx
- Purpose: shown when an action is blocked by permission/role/email/ban gates; routes user to the right unlock page
- Props: `{ open, onClose, capability? }`
- Context: usePermissionsContext (for `user`), useFocusTrap
- API calls: none
- Used in: `PermissionGate.tsx`, `PermissionsProvider.tsx` (the global RLS-locked overlay)
- Lang: TS
- Concerns: relies on `LOCK_REASON.*` constants from `lib/permissionKeys.js` — need to verify lib/permissionKeys defines BANNED, EMAIL_UNVERIFIED, ROLE_REQUIRED.

### components/ObservabilityInit.tsx
- Purpose: kicks off `initObservability()` from `lib/observability` (client-side Sentry init proxy)
- Props: none
- Context: none
- API calls: none
- Used in: `web/src/app/layout.js`
- Lang: TS
- Concerns: per memory note, Sentry coverage work is deferred — this initializer is harmless if the env var isn't set.

### components/PermissionGate.tsx
- Purpose: wraps children, hides/disables/locks them based on permission caps; `asRoute` triggers `notFound()` for HIDDEN deny mode
- Props: `{ permission, section, children, fallback?, asRoute?, renderLocked? }` + inline variant `PermissionGateInline`
- Context: useCapabilities, LockModal (mounted internally for non-hidden deny)
- API calls: none
- Used in: `web/src/app/messages/page.tsx` (only)
- Lang: TS
- Concerns: only one importer in 30+ admin pages and 50+ feature surfaces — this is the gate-by-component pattern but the codebase has overwhelmingly settled on `hasPermission()` direct calls in components instead. Worth flagging as an underused abstraction.

### components/PermissionsProvider.tsx
- Purpose: top-level context for the perms system; mounts the global LockModal that surfaces RLS denials, schedules `refreshIfStale()` every 60s + on window focus, listens for `auth.onAuthStateChange`
- Props: `{ children }`
- Context: provides PermissionsContext + useCapabilities hook
- API calls: supabase auth + `getCapabilities`
- Used in: `web/src/app/layout.js`
- Lang: TS
- Concerns: `tick` counter pattern works but is the canonical "force-rerender" hack; not strictly a bug, just noteworthy. The 60s polling interval mirrors the cache TTL elsewhere in the codebase.

### components/RecapCard.tsx
- Purpose: weekly-recap promo card (gated by `recap.list.view`); renders score if user already played
- Props: none
- Context: hasPermission
- API calls: `GET /api/recap`
- Used in: **nobody — orphan**
- Lang: TS
- Concerns: zero importers. The /recap page exists in app/, but nothing surfaces this card on the home feed. Either flip to "active surface" or delete; needs an audit decision.

### components/StatRow.tsx
- Purpose: tiny progress-bar row (label + value/total + horizontal bar)
- Props: `{ label, value, total?, color? }`
- Context: none
- API calls: none
- Used in: `web/src/app/profile/category/[id]/page.js`
- Lang: TS
- Concerns: none

### components/TTSButton.tsx
- Purpose: text-to-speech via browser `speechSynthesis`; gated on `article.listen_tts`
- Props: `{ text, title? }`
- Context: hasPermission
- API calls: none
- Used in: not imported by `app/` or `lib/` directly, but defined as a shared piece. Direct grep confirms zero importers — **orphan.**
- Lang: TS
- Concerns: orphan — like FollowButton, code is correct but no callsite.

### components/Toast.tsx
- Purpose: ToastProvider context + `useToast()` hook; bottom-of-screen tone-coded toasts (info/success/error)
- Props: ToastProvider takes `{ children }`, hooks return `{ show, info, success, error, dismiss }`
- Context: ToastContext (created here)
- API calls: none
- Used in: 5 importers in `app/` (per the import index — see `/tmp/component-importers.txt`)
- Lang: TS
- Concerns: defaults: info 4s, success 4s, error 6s; aria-live="polite" container. Falls back to `console.log` if no provider mounted (safe).

### components/UnderConstruction.tsx
- Purpose: branded placeholder for surfaces being polished pre-launch
- Props: `{ surface? }`
- Context: none
- API calls: none
- Used in: `app/profile/[id]/page.js`, `app/u/[username]/page.tsx`
- Lang: TS
- Concerns: none — clean fallback, no emojis, the kind of "launch hide" memory says to keep alive.

### components/VerifiedBadge.tsx
- Purpose: green/blue checkmark pill for verified public figures + experts
- Props: `{ user?, size='sm'|'lg' }`
- Context: none
- API calls: none
- Used in: `CommentRow.tsx`
- Lang: TS
- Concerns: none

## Admin components

All admin components live under a shared design system reading from `lib/adminPalette` (ADMIN_C colors, F font sizes, S spacing) and use inline styles. Pattern is consistent — no Tailwind, no CSS modules.

### admin/Badge.jsx
- Variant pill (neutral/success/warn/danger/info/ghost), optional dot. JS, 43 importers across `/admin/*`.

### admin/Button.jsx
- forwardRef'd; primary/secondary/ghost/danger × sm/md, loading state with internal Spinner. JS, 48 importers.

### admin/Checkbox.jsx
- Native input wrapped with admin styling; supports `indeterminate` via ref-effect. JS, 9 importers.

### admin/ConfirmDialog.jsx
- Imperative confirm + `ConfirmDialogHost` mount-once-at-root pattern. Distinct from the user-facing `components/ConfirmDialog.tsx` (file-level comment correctly calls out the duplication, with a faint reference to a now-stale path `site/src/components/ConfirmDialog.jsx` — the `site/` prefix is gone, source lives at `web/`). JS, 13 importers.

### admin/DataTable.jsx
- Sortable, paginated, sticky-header table with toolbar slot, empty state slot. Density `default|compact`. Page sizes 25/50/100. **Comment at line 100-101 explicitly notes "Keyboard shortcuts removed per owner directive — admin UI is click-driven"** — matches the locked decision. JS, 21 importers.

### admin/DatePicker.jsx
- Thin wrapper over `TextInput` with `type="date"` or `datetime-local`. JS, 9 importers.

### admin/DestructiveActionConfirm.tsx
- Specialized destructive-action modal: type-to-confirm + reason field + auto audit-log via `record_admin_action` RPC. **TS, only TS file in admin/.** 16 importers across high-blast moderation/billing/sponsors pages. Comment at line 64-66 (M9) calls out "run destructive FIRST, audit on success" — important contract. If the audit RPC fails after the action succeeded, surfaces an inline error and explicitly does NOT roll back.

### admin/Drawer.jsx
- Right-side slide panel with focus trap, dirty-prompt close, body-scroll lock. JS, 18 importers.

### admin/EmptyState.jsx
- Icon + title + description + CTA. JS, 42 importers.

### admin/Field.jsx
- Form-field wrapper: label + hint/error row, with `htmlFor` for a11y. JS, 10 importers — **fewer importers than expected given how many admin pages have forms; many pages render their own labels inline.** Worth flagging for consistency sweep.

### admin/Form.jsx
- `<form>` with default `e.preventDefault()` + gap rhythm; `FormActions` for button rows. JS, **only 1 importer (`/admin/prompt-presets/page.tsx`).** Effectively orphaned outside that one page; the codebase otherwise inlines form structure.

### admin/GenerationModal.tsx
- F7 unified-feed pivot's audience picker → 1 or 2 parallel pipeline runs (adult/kid/both). Consumes `provider`, `model`, `freeformInstructions` from PipelineRunPicker; polls `pipeline_runs` then `/api/admin/pipeline/runs/:id`. **TS.** Used by `app/admin/newsroom/page.tsx` only.

### admin/KBD.jsx
- `<kbd>` chip strip. JS, only used in `web/src/app/admin/page.tsx`. Note: the owner has explicitly banned keyboard shortcuts in admin UI, so this exists only for visual documentation, not as an active hotkey UI. Worth checking that the lone `app/admin/page.tsx` use isn't surfacing an active shortcut.

### admin/Modal.jsx
- Focus-trapped overlay with body-scroll lock + dirty prompt + native confirm fallback. JS, 11 importers.

### admin/NumberInput.jsx
- Wrapper over TextInput with `type="number"` + `inputMode="decimal"`. JS, 22 importers.

### admin/Page.jsx
- Outer admin layout (max-width 1280, font stack); also exports `PageHeader` with breadcrumb + actions slot + `searchSlot` reserved for "future Cmd-K launcher" — but per locked decision, that launcher is now permanently no-go. The `searchSlot` prop is reserved-but-vestigial. JS, used by every admin page.

### admin/PageSection.jsx
- Title + description + horizontal rule + content slot, optional `boxed`. JS, 41 importers.

### admin/PipelineRunPicker.tsx
- Sticky sub-header for `/admin/newsroom` with provider+model+freeform pickers. Pulls `ai_models` rows directly via supabase browser client; comment at top claims "two call sites only" but a single grep confirms only `app/admin/newsroom/page.tsx` imports it now (the second site referenced was `clusters/[id]/page.tsx`, which may have been removed/renamed). **Worth verifying second callsite still exists.** TS.

### admin/Select.jsx
- Native select + admin styling. JS, 28 importers.

### admin/Sidebar.jsx
- **Orphan — zero importers.** `usePathname` matcher; designed for nested admin nav. Defined but never wired. Three matches in `app/` are unrelated DOM components/CSS classes, confirmed.

### admin/SkeletonRow.jsx
- Shimmering `<tr>` for table loading states + `SkeletonBar` for inline. JS, 3 importers (`/profile/page.tsx`, `/profile/settings/page.tsx`, internal).

### admin/Spinner.jsx
- 1px-ring rotating circle with aria-label. JS, 47 importers.

### admin/StatCard.jsx
- KPI tile with delta-direction colorization. JS, 13 importers.

### admin/Switch.jsx
- iOS-style toggle with optimistic local mirror + checked-prop sync effect. JS, 13 importers.

### admin/TextInput.jsx
- Native input + admin styling, with optional left/right addons. JS, 33 importers.

### admin/Textarea.jsx
- Native textarea + admin styling, with `autoGrow` mode. JS, 27 importers.

### admin/Toast.jsx
- Admin toast queue + ToastProvider/useToast hook. **47 importers** across the `/admin/*` tree plus `/profile/settings/page.tsx`. Distinct from the user-facing `components/Toast.tsx` — file-level comment correctly references `site/src/components/Toast.js` (stale path; should be `web/`).

### admin/ToastProvider.jsx
- **Dead-weight re-export shim:** `export { ToastProvider as default, ToastProvider, useToast } from './Toast';`. Zero callers actually go through this file; everything imports from `Toast.jsx` directly. Could safely delete.

### admin/Toolbar.jsx
- left/center/right slot toolbar above DataTable. JS, 18 importers.

### kids/Badge.tsx
- Achievement badge for parent-side kid management; inlined kid theme tokens (CARD/CARD_ALT/BORDER/TEXT/DIM/ACHIEVEMENT). Comment at top notes the formerly-shared `kidTheme.js` was retired since this is the only surviving kid-component on web. TS, used only by `web/src/app/profile/kids/[id]/...` (paths via grep).

### kids/OpenKidsAppButton.tsx
- Deep-link to `veritypostkids://` with 1.5s fallback to `/kids-app`. **TODO at line 3** — "swap to real App Store URL once app is published". This is the Apple-block fallback URL item from MASTER_TRIAGE; matches the project state.

### kids/PairDeviceButton.tsx
- Generates an 8-char pair code via `POST /api/kids/generate-pair-code`, shows live countdown + copy button. TS, used in profile/kids/* parent management pages.

## Tests

### tests/e2e/README.md
- Documentation; describes setup contract + per-test user pattern + coming-soon mode handling + troubleshooting.

### tests/e2e/_fixtures/setup.ts (98 lines)
- Global setup: probes Supabase keys (one auth admin listUsers ping), seeds test data via `seedTestData()`, drops the coming-soon bypass cookie into `tests/e2e/.auth/preview.json`. Mocks: none.

### tests/e2e/_fixtures/cleanup.ts (58 lines)
- Global teardown: deletes `vp-e2e-*@example.com` users via Supabase admin API (preserves `vp-e2e-seed-*@veritypost.test` stable seed users — necessary because FKs reference them). Calls `cleanupSeed()` first.

### tests/e2e/_fixtures/createUser.ts (173 lines)
- `createTestUser`: prefer service-role admin createUser, fall back to `/api/auth/signup` with spoofed `x-forwarded-for` per worker. Surfaces 429s with a "your Supabase keys are wrong" diagnostic instead of the misleading "rate limited". `signInViaUi` (form-fill), `signInViaApi` (delegates to UI to land the @supabase/ssr cookie correctly), `signInAsSeededUser` (convenience). Mocks: none — uses real Supabase + dev server.

### tests/e2e/_fixtures/seed.ts (817 lines)
- Heaviest fixture: deterministic seed of 10 role users (owner/admin/editor/moderator/expert/journalist/free/verity/verity_pro/parent), one article + 5-question quiz, bookmarks, follows, notifications, audit_log entries, reports, expert applications, achievements, kid profile + active pair code + 3-day streak. Identifiers stable: `vp-e2e-seed-<role>@veritypost.test`, article slug `vp-e2e-seed-article-quiz-test`, pair code `VPE2E001`. Writes to `tests/e2e/.auth/seed.json` for spec consumption via `getSeed()`.

### tests/e2e/_fixtures/run-seed.mts (6 lines)
- Standalone CLI entry to run `seedTestData()` from outside the playwright runner.

### tests/e2e/admin-deep-batch2.spec.ts (382 lines)
- Tests: ad system, broadcasts, expert applications, newsroom clusters, recap questions, words list, sponsors, plans, data-requests, billing edge cases, sessions, comments hide/unhide, permission-set wiring. **All "POST/GET, expect <500" black-box smokes.** Mocks: none. Status: runs in CI when seed data present; soft-skips otherwise.

### tests/e2e/admin-deep.spec.ts (263 lines)
- Same shape — admin user mutations (mark-read, mark-quiz, achievements, ban, data-export, plan-change, role-set), moderation (penalty levels, appeals), content (article patch, category CRUD), config (feature flag toggle, settings upsert, permission create), billing (promo create + dup → 409, refund-decision, sub-cancel), pipeline (retry/cancel). Promo dup test specifically asserts 409 (not 500) — regression guard for the recent error.message leak fix.

### tests/e2e/admin-surface.spec.ts (78 lines)
- Anon and free user can't reach `/admin` (404 surface). Admin-API routes 401/403 for non-staff. Two `test.fixme` placeholders for "admin grant role" + "admin hide comment + audit row" — not yet wired to seed data.

### tests/e2e/anon-golden-path.spec.ts (53 lines)
- Most important smoke: home loads (or coming-soon redirects cleanly), CSP header set, robots.txt + sitemap.xml don't 5xx.

### tests/e2e/api-health-and-public.spec.ts (60 lines)
- /api/health (200 or 503 with structured body), /api/csp-report accepts violation, /api/settings/password-policy returns boolean fields, /api/auth/check-email handles unknown email, /api/events/batch single-event smoke.

### tests/e2e/auth-edge-cases.spec.ts (123 lines)
- Signup rejects missing email/password, ageConfirmed=false, agreedToTerms=false, weak password. Login wrong-password 401s, non-existent email 401s. Rate-limit burst test (8 requests, expects 429). Reset password returns 200 even for unknown email (anti-enumeration guarantee).

### tests/e2e/auth-signup-login.spec.ts (39 lines)
- Signup creates user, UI login lands on non-login page, API login + page.goto lands authed.

### tests/e2e/billing-flows.spec.ts (76 lines)
- /api/billing/{cancel,change-plan,resubscribe} require auth, cancel rate-limit fires for free user (no Stripe customer), promo redeem with empty code 400, bogus code 404.

### tests/e2e/bookmarks.spec.ts (43 lines)
- /bookmarks page renders, POST /api/bookmarks with fake article_id <500, GET 405/401, no-data fresh user has no Load more button.

### tests/e2e/coming-soon-mode.spec.ts (53 lines)
- Home redirects to /welcome when in coming-soon, /api/* + /admin + /sitemap.xml NOT redirected, /preview route exists.

### tests/e2e/error-pages.spec.ts (39 lines)
- Bogus URL → 404 surface, bogus story slug → graceful 404, bogus username → clean state.

### tests/e2e/expert-deep.spec.ts (160 lines)
- Free asks question, expert claim/decline/answer/back-channel/apply (already-approved 4xx), moderator approve, expert sessions live Q&A round-trip, supervisor opt-in/opt-out.

### tests/e2e/follows-and-blocks.spec.ts (44 lines)
- /api/follows GET 405/401, free POST gets paid-tier 403, /api/users/[id]/block requires auth (POST + DELETE).

### tests/e2e/kids-deep.spec.ts (175 lines)
- Parent CRUD on kids, household-kpis, global-leaderboard, family/config shape, pair-code generation, set/reset/verify-pin, trial start, /profile/kids + /profile/family render.

### tests/e2e/kids-parent.spec.ts (62 lines)
- /kids redirect (authed → /profile/kids, anon → /kids-app/login/welcome), /api/kids requires auth, /api/family/config requires auth, generate-pair-code requires perm, /api/kids/pair rate-limits per IP (12-burst).

### tests/e2e/leaderboard-search.spec.ts (39 lines)
- /leaderboard requires auth, /search loads anon, search API rejects empty query gracefully + sanitizes SQL-injection-shaped query, /browse loads anon.

### tests/e2e/messages-notifications.spec.ts (50 lines)
- /messages page loads authed, anon redirected, /api/conversations no leak. /notifications inbox loads authed, anon lands on coherent surface, /api/notifications/preferences PATCH requires auth.

### tests/e2e/permissions-isolation.spec.ts (59 lines)
- Cross-user RLS sanity: user A bookmarks page does NOT contain user B email, user A cannot patch user B profile via admin API, anon cannot read /api/bookmarks.

### tests/e2e/profile-settings-deep.spec.ts (148 lines)
- Email-change, resend-verification, logout, GET/PATCH notification preferences, blocked users, block+unblock round-trip, data-export, account-delete confirmation gate (critical: must NOT be 200 or we deleted the seed user), login-cancel-deletion, onboarding mark-complete, /profile + /profile/settings + /profile/activity + /profile/milestones + /profile/family render.

### tests/e2e/profile-settings.spec.ts (33 lines)
- Settings page loads authed, anon → login/welcome, /api/auth/password-change <500, /api/auth/email-change requires auth.

### tests/e2e/quiz-and-comments.spec.ts (50 lines)
- Comment composer hidden when quiz not passed, posting comment without quiz pass returns 4xx (gate working).

### tests/e2e/reader-article.spec.ts (33 lines)
- Clicking story card opens article, bogus slug graceful <500.

### tests/e2e/security-headers.spec.ts (96 lines)
- X-Robots-Tag noindex in coming-soon, x-request-id always set, CSP includes default-src 'self' + report-uri + script-src 'self' + strict-dynamic + frame-ancestors 'none', no unsafe-eval/unsafe-inline. CORS preflight from allowed/unlisted origins (allow-origin set/absent). /api/access-request POST returns 410 with `{ action: 'sign_up', action_url: '/signup' }`.

### tests/e2e/seeded-reader-flow.spec.ts (107 lines)
- Anon visit renders seeded article body (matches /honeybee|waggle/i), GET /api/articles/[slug] <500, authed bookmark POST, comment POST rejected before quiz pass, quiz attempt accepts correct answers <500.

### tests/e2e/seeded-roles.spec.ts (194 lines)
- Per-role smoke: owner reaches /admin, owner+admin can read /api/admin/recap, admin reads data-requests + audit-log, editor reaches /admin, moderator reads reports queue + acts on seeded report, expert sees queue, journalist signs in, free sees seeded bookmark + notifications, verity reaches stripe portal, verity_pro signs in, parent lists kids + reaches /profile/kids + reads family config.

### tests/e2e/seo-meta-jsonld.spec.ts (74 lines)
- Home emits Organization + WebSite JSON-LD schemas, story page emits NewsArticle when article loads, home has <title>, home meta description (skipped on /welcome).

### tests/e2e/social-deep.spec.ts (168 lines)
- Follows non-existent target <500, follow journalist (already followed, idempotent), comment vote/flag/report/context-tag/PATCH/DELETE round-trips on fake + seeded comment IDs. Conversation start, message into non-existent conv, messages search. Reports/appeals on fake targets, weekly reading report.

### tests/e2e/static-pages.spec.ts (32 lines)
- /privacy, /terms, /cookies, /dmca, /accessibility, /contact, /login, /signup, /forgot-password all load (>50 chars body content).

### Test integrity assessment

- **Mocks: zero.** Every test runs against a live dev server + live Supabase project. The seed fixture is the orchestration glue.
- **CI status: configured but not enforced** per the README ("two-line addition to a GitHub Actions workflow"). Memory note about `.last-run.json` showing recent runs (Apr 25) suggests they are at least running locally.
- **Per-spec strategy: "POST a valid-shape payload, assert <500."** This catches "route exists but blows up" regressions but NOT semantic correctness. The seeded-roles + seeded-reader-flow specs do positive-path checks.
- **Skip pattern: `test.skip(!seed, 'seed data not available')`** — every deep spec soft-skips if seeding fails, so a Supabase outage doesn't kill the whole suite.
- **Most critical safety check:** `account-delete confirmation gate` (profile-settings-deep.spec.ts:106) explicitly asserts `expect(res.status()).not.toBe(200)` — protects the seeded free user from being nuked by a regression.

## public/ inventory

```
web/public/ads.txt   (480 bytes, last touched 2026-04-21 17:09)
```

That's it. **Nothing else.**

Notable absences (worth flagging in later waves):
- No `robots.txt` — but the e2e test asserts `/robots.txt` returns OK, meaning it must be generated by a route handler. Confirm.
- No `sitemap.xml` — same: tested expecting <500, presumably also dynamic.
- No favicons or `icon.svg` — but `JsonLd.tsx` references `${siteUrl}/icon.svg` in Organization schema. Either app/icon.svg exists at `app/icon.svg` (Next 14 metadata convention) or this URL 404s.
- No `apple-app-site-association` — explicitly mentioned in CLAUDE.md as Apple-block dependency. When Apple Dev account lands, this needs adding.
- No PWA manifest, no `_redirects`, no static assets at all.

## Generated artifacts (test-results/, playwright-report/) — count only

- `web/test-results/`: 14 result directories from the latest run (mostly `mobile-chromium` failures + a few chromium re-runs: `admin-deep-batch2`, `messages-notifications`, `profile-settings-deep`, `seeded-reader-flow`, `social-deep`). Plus `.last-run.json` (datestamp 2026-04-25 15:03).
- `web/playwright-report/`: 141 entries in `data/` (typical trace zips + screenshots) + `index.html` (740KB).
- These are gitignored generated artifacts. Did not read contents per instructions.

## Components in .js/.jsx (drift)

All in `components/admin/` — the admin design-system kit is still mostly JS:

```
admin/Badge.jsx
admin/Button.jsx
admin/Checkbox.jsx
admin/ConfirmDialog.jsx
admin/DataTable.jsx
admin/DatePicker.jsx
admin/Drawer.jsx
admin/EmptyState.jsx
admin/Field.jsx
admin/Form.jsx
admin/KBD.jsx
admin/Modal.jsx
admin/NumberInput.jsx
admin/Page.jsx
admin/PageSection.jsx
admin/Select.jsx
admin/Sidebar.jsx
admin/SkeletonRow.jsx
admin/Spinner.jsx
admin/StatCard.jsx
admin/Switch.jsx
admin/TextInput.jsx
admin/Textarea.jsx
admin/Toast.jsx
admin/ToastProvider.jsx
admin/Toolbar.jsx
```

Plus one in shared `components/`:
```
Ad.jsx
```

Total: **27 files** still in JS. The exceptions in `admin/` are `DestructiveActionConfirm.tsx`, `GenerationModal.tsx`, `PipelineRunPicker.tsx` — all newer additions. CLAUDE.md says "When you touch an existing .js/.jsx file and scope allows, migrate it in the same change." This is the largest concentrated drift surface.

## Duplicate-looking components

- `components/ConfirmDialog.tsx` (user-facing) vs `components/admin/ConfirmDialog.jsx` (admin imperative API + ConfirmDialogHost). Both have focus traps and danger styling; the admin one supports an imperative `confirm({ ... })` queue. Same name across two folders is intentional but confusing in the import index — naming one `UserConfirmDialog`/`AdminConfirmDialog` would remove ambiguity.
- `components/Toast.tsx` (user-facing) vs `components/admin/Toast.jsx` (admin) + `components/admin/ToastProvider.jsx` (re-export shim of admin Toast). Same name pattern; intentional separation but the re-export shim is cruft.
- `components/admin/Badge.jsx` vs `components/kids/Badge.tsx` — different products (admin pill vs kid achievement card), no risk of confusion in practice (separate folders, different prop shapes), but a name search returns both.

## Orphan components (no importers)

Confirmed orphans (zero importers in `web/src/app`, `web/src/lib`, or other components — direct grep):

1. **`components/RecapCard.tsx`** — gated weekly-recap promo card, hits `GET /api/recap`. The /recap page exists; nothing surfaces this card on the home feed.
2. **`components/admin/Sidebar.jsx`** — left-rail nav for admin. Three name-collision matches in `app/` are unrelated (CSS classes + locally-defined Sidebar functions in /ideas/feed/edition).
3. **`components/admin/ToastProvider.jsx`** — re-export shim of `Toast.jsx`; no callers go through this file.
4. **`components/FollowButton.tsx`** — repeatedly grep'd, no `app/` or `lib/` callsite.
5. **`components/TTSButton.tsx`** — same.

Also worth flagging: **`components/admin/Form.jsx`** has only ONE importer (`/admin/prompt-presets/page.tsx`) — effectively a near-orphan, since the rest of the admin pages inline form structure.

## Notable claims worth verifying in later waves

1. **`components/RecapCard.tsx` orphan** — confirm by mtime + audit whether `/recap` page surface still exists or this is dead code from a since-removed home-feed promo slot.
2. **`components/FollowButton.tsx` and `components/TTSButton.tsx` are orphans** — could be cherry-picked into specific surfaces, or deleted. Decision needed.
3. **`components/admin/Sidebar.jsx` orphan** — explicitly designed for nested admin nav but never wired. Decision: build it out for /admin/users/{users,permissions,…} drill-down, or delete.
4. **`components/admin/ToastProvider.jsx` is a dead re-export shim** — safe to delete; no callers use this path.
5. **`components/admin/KBD.jsx`** — only used in `app/admin/page.tsx`; given the locked decision against admin keyboard shortcuts, verify the use isn't surfacing an active hotkey UI (probably just visual `<kbd>` documentation).
6. **`admin/PipelineRunPicker.tsx` claims "two call sites only"** but grep finds only `/admin/newsroom/page.tsx`. The second site (`/admin/newsroom/clusters/[id]/page.tsx`?) may have been removed/renamed; the comment is now drift.
7. **`components/CommentThread.tsx` is 920 lines** with inline dialog state machine, realtime sub, supervisor RPC, role lookup. Worth flagging for a possible split, not as a bug.
8. **`components/CommentRow.tsx` `COMMENT_MAX_DEPTH = 2` constant mirrors the DB `comment_max_depth` setting** — currently mirror-by-hand. The TODO comment says "Future: fetch from /api/settings/public shim instead of mirroring." Drift trap if someone edits the DB without touching the file.
9. **`components/Ad.jsx` URL allowlist TODO** at line 92-93 — also validate at `/api/admin/ad-units POST` so DB never holds a poisoned URL. Genuine open item.
10. **`components/PermissionGate.tsx` only used by `/messages/page.tsx`** — the codebase has overwhelmingly settled on direct `hasPermission()` calls. Worth deciding whether PermissionGate stays as the canonical pattern or gets retired.
11. **No `apple-app-site-association` in `public/`** — explicit Apple-block dependency from CLAUDE.md; tracked elsewhere but worth re-flagging.
12. **No `robots.txt` or `sitemap.xml` in `public/`** — must be served by route handlers. Confirm in Wave 2 (the e2e tests assume they exist).
13. **`JsonLd.tsx` references `${siteUrl}/icon.svg`** but no `icon.svg` in `public/`. Either app/icon.svg exists (Next 14 metadata) or Organization schema 404s.
14. **Admin design-system kit is 27 `.jsx` files** — concentrated TS-migration debt. CLAUDE.md says "When you touch an existing .js/.jsx file and scope allows, migrate it." This is the biggest pile in the codebase.
15. **Stale "site/" path references** in admin component comments (`site/src/components/Toast.js`, `site/src/components/ConfirmDialog.jsx`) — the `site/` prefix retired when the repo restructured to `web/`. Cosmetic but worth a sweep.
16. **`components/admin/Field.jsx` used by only 10 admin pages** out of 40+ admin pages with forms — most pages render their own labels inline. Inconsistent form hygiene; worth a sweep.
