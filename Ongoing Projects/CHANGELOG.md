# Change Log

Every change made during audit execution sessions. Format per entry:
- **What** — the specific change
- **Files** — files touched
- **Why** — the reason; OwnersAudit task reference where applicable

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
