# Zone Z14: web/src/app/admin/

## Summary

48 files: 1 layout, 1 hub page, 1 not-found, 45 admin tools. All TypeScript/.tsx — zero `.js`/`.jsx` drift. Server-side `app/admin/layout.tsx` enforces `MOD_ROLES` and falls through to `not-found.tsx` (404, not redirect) for anon + signed-in-non-staff. Most pages re-check role/permission client-side after mount and redirect to `/` if denied (defense-in-depth).

The auth-gate strategy is **inconsistent across pages** — three different patterns coexist:

1. `getUser()` + raw `user_roles` → ADMIN_ROLES/MOD_ROLES/EDITOR_ROLES set membership (most pages).
2. `getUser()` + `hasPermission('<key>')` via `compute_effective_perms` resolver (categories, prompt-presets, permissions, users — newer pattern, "AD4" comments).
3. Hardcoded literal role check `'owner' || 'admin'` (analytics, breaking-pre-fix, feeds, kids-story-manager, notifications, subscriptions, system, support — drift).

The newer permission-key pattern is correct (matches the API gates). The set-based ADMIN_ROLES pattern is acceptable. The hardcoded `'owner'/'admin'` pattern is documented drift — `breaking/page.tsx` already migrated to ADMIN_ROLES with an "Ext-K3" comment, but cohorts/notifications/subscriptions/system/support haven't. Newsroom + comments + reports + permissions + categories + prompt-presets all consistently use either ADMIN_ROLES/MOD_ROLES/EDITOR_ROLES or hasPermission.

## Page index

### admin/layout.tsx
- Purpose: Server-side gate for entire `/admin` tree; mounts `ToastProvider`. notFound() for anon + non-staff (consistent 404 to hide the surface).
- Permission: `MOD_ROLES` membership (server-side, via `getUserRoles(supabase, user.id)`).
- Tables/RPCs: `auth.getUser`, indirectly `user_roles` via `getUserRoles`.
- API calls: none.
- Lang: TS. `force-dynamic`.
- Markers: none.

### admin/page.tsx (hub)
- Purpose: hub landing — 9 grouped sections, Quick links, Featured articles strip from `articles where is_featured=true`.
- Permission gate: client-side ADMIN_ROLES OR MOD_ROLES (mods see hub but server-page perm checks still gate sub-pages).
- Tables: `user_roles → roles(name)`, `articles + categories!fk_articles_category_id`.
- API: none.
- Notes: KBD hint `Cmd-K` is "visual placeholder only" per code comment — search launcher not built. Ad-Hub link list is the canonical map of what admin contains. Restricted-role state (`restrictedRole`) is captured but never rendered (dead state).
- TODO: Cmd-K launcher unbuilt.

### admin/not-found.tsx
- Purpose: minimal 404, no admin branding (intentional security-through-obscurity for crawlers).
- Permission: rendered post-notFound() in layout.
- Concerns: none.

### admin/access/page.tsx (Access Codes)
- Purpose: 2-tab manager (codes + requests) for invite-gate. Code generation/toggle/expiry editing.
- Permission gate: hardcoded `'owner' || 'admin'` (drift).
- Tables: `access_codes`, `access_requests`, `plans`, `roles`. RPC `record_admin_action` called client-side before update.
- API: writes via `supabase.from(...)` direct (no API route — client RLS path). Toggle/expiry bypass any service-role audit endpoint.
- Marker: "Ext-AA1" comment — invite-gate stripped per owner decision 2026-04-25; `requests` tab hidden (signup is open). Code paths for `requests` retained for re-enable.
- Concerns: client-side `record_admin_action` RPC + then client-side update is two round-trips and inconsistent with route-based admin pattern. AA1-locked state means the tab + state machinery is dead but kept "for re-enable".

### admin/ad-campaigns/page.tsx
- Purpose: Direct ad campaigns, pricing, budgets, status.
- Permission gate: ADMIN_ROLES.
- Tables: `ad_campaigns`.
- API: `/api/admin/ad-campaigns` GET/POST, `/api/admin/ad-campaigns/[id]` PATCH/DELETE. DestructiveActionConfirm used for delete.
- Lang: TS. ToastProvider local.

### admin/ad-placements/page.tsx
- Purpose: Placement slots + per-placement creatives (units), tier hidden_for/reduced_for matrix.
- Permission gate: ADMIN_ROLES.
- Tables: `ad_placements`, `ad_units`. `ALL_TIERS` array hardcoded (`['free','verity','verity_pro','verity_family','verity_family_xl']`) — drift from DB plans table (matches CLAUDE.md "single source of truth" rule violation).
- API: `/api/admin/ad-placements`, `/api/admin/ad-units` (full CRUD).
- Concerns: Hardcoded tier list duplicates the DB plans tier set.

### admin/analytics/page.tsx
- Purpose: 4-tab dashboard (overview/stories/quizzes/resources) — daily reads chart, top articles, quiz failure analysis, resource usage.
- Permission gate: hardcoded `roleNames.includes('owner') || roleNames.includes('admin')`.
- Tables: `users`, `articles`, `comments`, `reading_log`, `quizzes`, `quiz_attempts`.
- API: none — direct supabase reads.
- Concerns: 
  - `RESOURCE_USAGE` array is **hardcoded demo data** (lines 30-37 — Supabase Database 45MB, Vercel Invocations 28K, etc.). UI shows a yellow "Demo data" warning banner so it's not misleading, but it's still dead config.
  - `period` state is set-but-not-read in fetch (only `7d` works); a TODO comment notes 30d/90d are hidden until fetch reads selected period.
  - "Edit question" button in quiz failures is `disabled` with TODO pointer to `/admin/story-manager`.

### admin/articles/[id]/edit/page.tsx
- Purpose: F7 inline editor for article draft (title/subtitle/excerpt/markdown body + sources + timeline + quiz).
- Permission gate: ADMIN_ROLES.
- API: GET/PATCH `/api/admin/articles/[id]`.
- Notes: Body is plain markdown; server re-renders body_html on save.

### admin/articles/[id]/review/page.tsx
- Purpose: F7 read-only render with Edit/Regenerate/Publish/Reject actions.
- Permission gate: ADMIN_ROLES.
- API: GET/PATCH `/api/admin/articles/[id]`, POST `/api/admin/pipeline/generate` (regenerate).
- Notes: Quiz section deliberately exposes correct_index for reviewers (admin-scope; public reader strips). Reject opens reason modal, archived with retraction_reason.

### admin/breaking/page.tsx
- Purpose: Send breaking-news alerts (text, optional article link, target audience all/paid/free); alert history.
- Permission gate: ADMIN_ROLES (recently migrated from hardcoded; "Ext-K3" comment cites ADMIN_ROLES as single source of truth).
- Tables: `articles where is_breaking=true`, `users` (reach preview).
- API: POST `/api/admin/broadcasts/alert` — single endpoint owns article create + audit + push fan-out (T-012 commit).
- Concerns: charLimit/throttleMin/maxDaily are local state with NumberInputs but never persisted (display-only — drift, "Alert limits" section is config-shaped but does nothing).
- Marker: Ext-K3, Ext-K6, T-012.

### admin/categories/page.tsx
- Purpose: Categories tree editor (top-level + sub, kids-safe gate, archive/restore, move).
- Permission gate: `hasPermission('admin.pipeline.categories.manage')` (correct pattern).
- Tables: `categories`. API `/api/admin/categories` POST/PATCH/DELETE.
- Notes: Archived = soft-delete via `deleted_at`. Restore = PATCH `{ deleted_at: null, is_active: true }`. Inline tree, no audience tabs (single taxonomy with `is_kids_safe` flag).

### admin/cohorts/page.tsx
- Purpose: User cohort builder (filter matrix across 6 categories) + campaign sender (email/push/in-app).
- Permission gate: ADMIN_ROLES.
- Tables: `cohorts`, `campaigns`, joins to `users` for sending.
- Concerns:
  - Filter `FILTER_CATEGORIES` is a 6-category × ~30-filter hardcoded matrix with hardcoded plan + tier + category names. Most filter values (`'Verity Pro'`, `'Distinguished'`, etc.) are display strings but no actual filter execution exists — there's a `Build filters above, then run the query…` placeholder, not a real query path.
  - Sending writes a `campaigns` row directly via supabase client; no fan-out happens, just records the row.
  - Largely a stub UI for an unbuilt feature.

### admin/comments/page.tsx (Discussion settings)
- Purpose: 9-group settings page (quiz gate, AI features, sorting, tags, role badges, threading, health, evolution, moderation). Settings persist to `settings` key/value table via debounced save.
- Permission gate: EDITOR_ROLES.
- API: POST `/api/admin/settings/upsert`, then `/api/admin/settings/invalidate` for cache.
- Notes: `quiz_required` toggle has confirm dialog (platform-wide). Numbers persist on every change (debounced 800ms) — not blur-only ("C7" fix).

### admin/data-requests/page.tsx (GDPR/CCPA)
- Purpose: Approve/reject data export + deletion requests; identity-verify gate.
- Permission gate: EDITOR_ROLES.
- API: GET `/api/admin/data-requests?status=`, POST `/api/admin/data-requests/[id]/approve`, POST `/api/admin/data-requests/[id]/reject`. DestructiveActionConfirm wraps both.
- Tables: `data_requests` joined to `users`.
- Notes: Approve sets identity_verified=true → unblocks the export cron pickup. Legal hold blocks approve.

### admin/email-templates/page.tsx
- Purpose: Browse/edit template subject + body_text. Toggle active. Mobile uses Modal, desktop uses Drawer.
- Permission gate: ADMIN_ROLES.
- Tables: `email_templates`.
- API: PATCH `/api/admin/email-templates/[id]`.

### admin/expert-sessions/page.tsx
- Purpose: Schedule kid expert Q&A sessions.
- Permission gate: EDITOR_ROLES.
- Tables: `kid_expert_sessions`, `user_roles + roles + users` (expert lookup), `categories`.
- API: POST `/api/expert-sessions`.
- Notes: Live moderator UI is iOS-only (kids scope rule); web shows disabled "Live — moderated in iOS" pill.

### admin/features/page.tsx
- Purpose: Feature flags CRUD + rollout %, killswitch, advanced JSON targeting.
- Permission gate: ADMIN_ROLES.
- Tables: `feature_flags`, `plans` (tier list for hint), `cohorts` (cohort list for hint).
- API: `/api/admin/features` POST, `/api/admin/features/[id]` PATCH/DELETE. DestructiveActionConfirm on delete.
- Notes: Toggle Enabled/Killswitch are optimistic with rollback. Advanced targeting is JSON textarea with whitelist of 10 fields.

### admin/feeds/page.tsx
- Purpose: RSS feeds CRUD, health (stale/broken thresholds), re-pull.
- Permission gate: hardcoded `'owner' || 'admin'`.
- Tables: `feeds`. Audience column dropped from UI but kept in DB for back-compat ("Unified-feed pivot" comment).
- API: `/api/admin/feeds` POST, `/api/admin/feeds/[id]` PATCH/DELETE.
- Notes: Re-pull = PATCH `{ action: 'repull' }`.

### admin/kids-story-manager/page.tsx
- Purpose: Kids article editor (timeline of story-or-event entries, inline sources + quizzes per entry).
- Permission gate: EDITOR_ROLES.
- Tables: `articles`, `categories(is_kids_safe=true)`, `sources`, `timelines`, `quizzes`.
- API: POST `/api/admin/articles/save` (custom save endpoint that fans out to all 4 tables), DELETE `/api/admin/articles/[id]`, POST `/api/ai/generate` (3 different `type` values: kids_story / timeline / simplify).
- Concerns: Kid blue accent override `C.accent = '#2563eb'`. Heavy duplication of structure with `/admin/story-manager` (1037 vs 1229 lines). The two pages should share a renderer.

### admin/moderation/page.tsx
- Purpose: User-centric moderation console (lookup by email/username, penalties, role grants, appeal review).
- Permission gate: MOD_ROLES.
- Tables: `users`, `user_roles + roles(name, hierarchy_level)`, `user_warnings`. C22/C23 comments cite live DB hierarchy_level loading + outrank gating.
- API: POST `/api/admin/users/[id]/roles`, DELETE same; POST `/api/admin/moderation/users/[id]/penalty`; POST `/api/admin/appeals/[id]/resolve`.
- Notes: HIERARCHY_FALLBACK still in the file as a last-resort if DB roles fetch fails. UI penalty buttons disable when `actorMaxLevel <= targetMaxLevel` (mirrors server-side `require_outranks`).
- Marker: M8 ("MOD_ROLES single source of truth").

### admin/newsroom/page.tsx (2349 lines — biggest)
- Purpose: F7 unified operator workspace. One feed pool, one cluster list, audience picked at generation time.
- Permission gate: ADMIN_ROLES.
- Tables: `feed_clusters`, `discovery_items` (via service-role API endpoint), articles existence (via service-role API), `feeds`, `categories`, `ai_prompt_presets`, `pipeline_runs`, `settings`.
- API:
  - GET via direct supabase (clusters, runs, glance bar)
  - POST `/api/admin/newsroom/clusters/sources` (service-role, bypasses RLS)
  - POST `/api/admin/newsroom/clusters/articles` (service-role, needed for kid_articles RLS)
  - POST `/api/admin/newsroom/clusters/[id]/move-item, /merge, /split, /dismiss, /unlock`
  - POST `/api/newsroom/ingest/run` (refresh feeds — single button)
  - POST `/api/admin/pipeline/runs/[id]/retry`
  - GenerationModal POSTs to `/api/admin/pipeline/generate`
- Notes: URL persistence (cat/sub/outlet/window/q/dismissed) via `writeUrl`. SearchUrlSync helper avoids debounce loop. Uses `window.prompt()` for dismiss reason — dialog-not-modal.
- Concerns:
  - Single 2349-line file with 13 sub-components inlined. Long; refactor candidate.
  - `window.prompt()` for dismiss reason is jarring — should be a Modal for consistency.

### admin/newsroom/clusters/[id]/page.tsx
- Purpose: 21-line server-side redirect to `/admin/newsroom?cluster=:id`. Newsroom does not yet act on `?cluster` query.
- Concerns: Half-completed deep-link — newsroom workspace ignores the param.

### admin/notifications/page.tsx
- Purpose: 5-tab admin (push/coalescing/email/sequences/log) for notification config + broadcast sender.
- Permission gate: hardcoded `'owner' || 'admin'`.
- Tables: `settings`, `notifications + users`, `users` (estimate count for broadcast).
- API: POST `/api/admin/settings/upsert`, POST `/api/admin/settings/invalidate`, POST `/api/admin/notifications/broadcast`.
- Concerns: `EMAIL_SEQUENCES` array is hardcoded copy + day offsets (not DB-driven). `DEFAULT_TOGGLE_STATE` and `DEFAULT_NUMS` defaults are hardcoded but persisted.

### admin/permissions/page.tsx
- Purpose: Canonical RBAC admin (5 tabs: Registry, Sets, Role grants, Plan grants, User grants).
- Permission gate: `hasPermission('admin.permissions.catalog.view')` (AD4 comment — correct pattern).
- Tables: `permissions, permission_sets, permission_set_perms, roles, plans, role_permission_sets, plan_permission_sets, user_permission_sets, users`.
- API:
  - `/api/admin/permissions` POST, `/api/admin/permissions/[id]` PATCH/DELETE (Round A C-05 — service-role).
  - `/api/admin/permission-sets` POST, `[id]` PATCH/DELETE.
  - `/api/admin/permission-sets/members` POST/DELETE.
  - `/api/admin/permission-sets/role-wiring` POST.
  - `/api/admin/permission-sets/plan-wiring` POST.
  - `/api/admin/permissions/user-grants` POST/DELETE.
- Notes: H24 comment — server endpoint owns audit; client-only optimistic flip + rollback. C-05 — all writes go through service-role endpoints (no direct supabase client mutations).

### admin/pipeline/cleanup/page.tsx
- Purpose: Daily-cron cleanup history + manual trigger.
- Permission gate: ADMIN_ROLES (then API checks `admin.pipeline.clusters.manage`).
- Tables: webhook_log via API.
- API: GET/POST `/api/admin/pipeline/cleanup`. 403 = friendly empty state.

### admin/pipeline/costs/page.tsx
- Purpose: Today vs cap, per-model 24h/7d/30d, daily chart, top-10 outliers, cap settings (read-only).
- Permission gate: not gated — relies on RLS on `pipeline_costs` + `pipeline_runs`.
- Tables: `pipeline_costs`, `pipeline_runs`, `settings`. RPC `pipeline_today_cost_usd`.
- API: none — direct supabase.
- Marker: AD6 — surfaces inline banner + toast on load failure. Ext-K5 — cap to 1000 rows from prior `.range(0, 9999)`.

### admin/pipeline/runs/[id]/page.tsx
- Purpose: Single pipeline run detail (steps, totals, JSON I/O, retry/cancel).
- Permission gate: ADMIN_ROLES.
- API: GET `/api/admin/pipeline/runs/[id]`, POST `/[id]/retry`, POST `/[id]/cancel`.
- Notes: Step latency bar chart in pure CSS flexbox.

### admin/pipeline/runs/page.tsx
- Purpose: Paginated runs list with status/audience/type/date filters.
- Permission gate: ADMIN_ROLES.
- Tables: direct supabase `pipeline_runs`.
- Note: comment "Coexists with the existing @admin-verified /admin/pipeline shell" — that shell no longer exists; comment is stale. (Marker @admin-verified retired 2026-04-23 per memory.)

### admin/pipeline/settings/page.tsx
- Purpose: 12 pipeline.* + ai.* settings rows in 4 groups (kill switches, cost caps, thresholds, default category).
- Permission gate: ADMIN_ROLES.
- API: GET/PATCH `/api/admin/settings`. Categories from direct supabase.

### admin/plans/page.tsx
- Purpose: Plan pricing + plan_features matrix.
- Permission gate: ADMIN_ROLES.
- Tables: `plans`, `plan_features`.
- API: PATCH `/api/admin/plans/[id]` (C-05 — service-role); plan_features uses **direct supabase upsert/insert/delete** (not service-role) — drift relative to C-05 promise on plans.
- Concerns: Stripe-sync warning shown when price changes, but DB-only update (matches MASTER_TRIAGE billing-not-Stripe-synced item).

### admin/promo/page.tsx
- Purpose: Promo codes CRUD with discount type, duration, plan applicability.
- Permission gate: ADMIN_ROLES.
- API: POST/PATCH/DELETE `/api/admin/promo/[id?]`.

### admin/prompt-presets/page.tsx
- Purpose: Reusable prompt blurbs for newsroom dropdown (audience: adult/kid/both, optional category).
- Permission gate: `hasPermission('admin.pipeline.presets.manage')` — correct pattern.
- API: GET/POST `/api/admin/prompt-presets`, PATCH/DELETE `/[id]`. PATCH with `{is_active:true}` = restore.
- Tables: `categories` for dropdown (direct supabase).

### admin/reader/page.tsx
- Purpose: Reader-experience config (themes/typography/reading/onboarding/accessibility) with onboarding-step copy editor.
- Permission gate: ADMIN_ROLES.
- API: POST `/api/admin/settings/upsert`, `/api/admin/settings/invalidate`.
- Concerns: 
  - `record_admin_action` RPC called client-side **before** the settings upsert API call (toggle path) — duplicates the audit-trail responsibility split. Other settings pages let the API endpoint own the audit.
  - `DEFAULT_ONBOARDING_STEPS` hardcoded — onboarding step list isn't DB-driven yet.

### admin/recap/page.tsx
- Purpose: Weekly recap quiz curator.
- Permission gate: EDITOR_ROLES.
- API: GET/POST `/api/admin/recap`, GET `/api/admin/recap/[id]`, POST `/api/admin/recap/[id]/questions`, PATCH/DELETE `/api/admin/recap/questions/[id]`.

### admin/reports/page.tsx
- Purpose: Moderator report queue with supervisor-flag fast-lane.
- Permission gate: MOD_ROLES.
- Tables: direct supabase comments lookup; API for everything else.
- API: GET `/api/admin/moderation/reports?status=`, POST `/api/admin/moderation/comments/[id]/hide`, POST `/api/admin/moderation/users/[id]/penalty`, POST `/api/admin/moderation/reports/[id]/resolve`.
- Notes: C23 mirror — same outrank disable as moderation/page.tsx.

### admin/settings/page.tsx
- Purpose: Generic settings table editor grouped by category. Light-themed parity wording, but uses dark ADMIN_C tokens.
- Permission gate: ADMIN_ROLES.
- API: GET/PATCH `/api/admin/settings`.

### admin/sponsors/page.tsx
- Purpose: Sponsor account CRUD.
- Permission gate: ADMIN_ROLES.
- API: GET/POST `/api/admin/sponsors`, PATCH/DELETE `/api/admin/sponsors/[id]`.

### admin/stories/page.tsx
- Purpose: All articles list (adult + kids) with filter, status toggle, delete, route to review/edit.
- Permission gate: ADMIN_ROLES.
- Tables: `articles + categories + users`. RLS on direct supabase.
- API: PATCH/DELETE `/api/admin/articles/[id]`. Status flip is PATCH.
- Notes: Adult articles → `/admin/articles/[id]/review`; kids articles → `/admin/kids-story-manager?article=[id]` (Y5-#7 comment). Quiz pool button still routes to `/admin/story-manager?article=[id]`.

### admin/story-manager/page.tsx (1229 lines)
- Purpose: Adult article timeline editor (precursor to F7 review/edit pair).
- Permission gate: ADMIN_ROLES.
- Tables: `articles + categories`, `sources`, `timelines`, `quizzes`.
- API: presumably `/api/admin/articles/save` (same as kids-story-manager) + AI endpoints.
- Concerns:
  - Coexists awkwardly with the F7 review+edit pair under `/admin/articles/[id]/{review,edit}`. The Stories list page now routes adults to F7 review and kids to story-manager, but story-manager is still reachable via Quiz pool button + `?new=1` button.
  - Heavy structural duplication with kids-story-manager.
  - Comment line 24-25: `editorial day = America/New_York` — encoded TZ rule.
  - T-018 — categories now DB-loaded; was hardcoded.

### admin/streaks/page.tsx
- Purpose: 3-tab (streaks/wrapped/gamification) settings + top-streaks leaderboard.
- Permission gate: ADMIN_ROLES.
- API: POST `/api/admin/settings/upsert`, `/api/admin/settings/invalidate`.

### admin/subscriptions/page.tsx (801 lines)
- Purpose: 7-tab admin (cancel/overview/revenue/grace/paused/refunds/events).
- Permission gate: hardcoded `'owner' || 'admin'`.
- Tables: `subscriptions + users + plans`, `invoices + users`. Direct supabase reads.
- API:
  - POST `/api/admin/subscriptions/[id]/extend-grace`
  - POST `/api/admin/subscriptions/[id]/manual-sync` (Gap 3 — replaces direct subscriptions.status mutation; bumps users.plan_id + perms_version server-side)
  - POST `/api/admin/billing/refund-decision`
  - POST `/api/admin/billing/cancel`
  - POST `/api/admin/billing/freeze`
  - POST `/api/admin/billing/sweep-grace`
  - POST `/api/admin/settings/upsert`
- Concerns: Plans-overview imports `TIERS, TIER_ORDER, PRICING, formatCents` from `lib/plans` — mostly hardcoded constants. Note: `getWebVisibleTiers` exists to filter family tiers (iOS-only), evidence the hardcoded plan map is being phased out per-page.

### admin/support/page.tsx
- Purpose: Support inbox. Tickets table + thread Drawer + reply-as-team. Chat-widget config (in-page sub-component).
- Permission gate: ADMIN_ROLES.
- Tables: `support_tickets + users + plans`, `ticket_messages` (lazy-loaded on selection).
- API: direct supabase writes for ticket reply + status flip. RPC `record_admin_action` client-side for status=closed.
- Concerns:
  - `ChatWidgetConfig` sub-component holds its own state; nothing persists. Fake `estimated` count math (e.g. `paidPlans ? 3400 : 0`) is hardcoded.
  - Direct ticket_messages insert client-side (no API endpoint); audit is RPC-call from client which is the older pattern.

### admin/system/page.tsx (650 lines)
- Purpose: Rate limits + transparency + monitoring + audit-trail viewer (4 tabs).
- Permission gate: hardcoded `'owner' || 'admin'`.
- Tables: `rate_limits`, `settings`, `admin_audit_log`. Direct supabase reads.
- API: POST `/api/admin/rate-limits` (single endpoint that upserts), `/api/admin/settings/upsert`, `/api/admin/settings/invalidate`.
- Concerns:
  - `RATE_LIMIT_DEFAULTS` is a 10-entry hardcoded array (count/window/scope per endpoint). DB rows take precedence on load, but the page seeds fresh installs from this constant — the source-of-truth-is-DB rule isn't fully honored.
  - `TRANSPARENCY_SETTINGS` and `MONITORING_SETTINGS` are hardcoded item lists keyed to settings rows; settings rows must exist for toggles to surface but the labels/descriptions aren't DB-driven.

### admin/users/page.tsx (897 lines)
- Purpose: User list + filter + drawer-detail (manual actions, role/plan modals, ban/delete via DestructiveActionConfirm).
- Permission gate: `hasPermission('admin.users.list.view')` — correct AD4 pattern.
- Tables: `users`, `user_roles + roles`, `plans` (joined), `achievements` (DB-loaded for award dropdown — T-prior fix vs. hardcoded list), `score_tiers` via `lib/scoreTiers` (cached 60s helper).
- API: 
  - PATCH `/api/admin/users/[id]/role-set` (C-05)
  - PATCH `/api/admin/users/[id]/plan` (C-05)
  - POST `/api/admin/users/[id]/ban`, DELETE `/api/admin/users/[id]`
  - POST `/api/admin/users/[id]/data-export`
  - DELETE `/api/admin/users/[id]/sessions/[deviceId]`
  - POST `/api/admin/users/[id]/mark-read`, `/mark-quiz`, `/achievements`
- Notes: Linked-devices drawer section is **disabled** with `{false && (...)}` pending server-side device fetch — dead UI per inline comment.

### admin/users/[id]/permissions/page.tsx
- Purpose: User-centric effective-permissions console with grant/block/remove-override + assign/remove permission set.
- Permission gate: ADMIN_ROLES (older pattern; could be tightened to `admin.permissions.user_grants.view` for consistency with the catalog page).
- Tables: `users + plans + user_roles`, `permission_sets`, `user_permission_sets`. RPC `compute_effective_perms`.
- API: POST `/api/admin/users/[id]/permissions` with action: grant/block/remove_override/assign_set/remove_set.
- Notes: 404 from API surfaces "Endpoint not yet built" toast — graceful fallback.

### admin/verification/page.tsx
- Purpose: Expert/educator/journalist application review (sample responses, background check, probation).
- Permission gate: EDITOR_ROLES.
- API: GET `/api/admin/expert/applications?status=`, POST `/api/admin/expert/applications/[id]/approve`, `/reject`, `/clear-background`, `/mark-probation-complete`. Three separate DestructiveActionConfirm states for approve/reject/clear-background+probation.

### admin/webhooks/page.tsx
- Purpose: Webhook & integration logs (Stripe/Apple/RSS/Resend/Supabase) with mark-resolved.
- Permission gate: ADMIN_ROLES.
- Tables: `webhook_log`. Direct supabase reads + writes.
- Notes: WEBHOOK_SOURCES hardcoded 5-entry array. Mark-resolved is local-only (does not redispatch — backend retry worker's job).

### admin/words/page.tsx
- Purpose: Reserved usernames + profanity filter list manager.
- Permission gate: ADMIN_ROLES.
- Tables: `reserved_usernames`, `blocked_words`.
- API: POST/DELETE `/api/admin/words` with `kind: 'reserved'|'blocked'`.

## Permission-key vs page mapping (table)

| Page | Server gate | Client gate | Pattern |
|---|---|---|---|
| layout | MOD_ROLES | — | Set |
| page (hub) | (via layout) | ADMIN_ROLES OR MOD_ROLES | Set |
| access | (via layout) | hardcoded 'owner'\|'admin' | **Drift** |
| ad-campaigns | (via layout) | ADMIN_ROLES | Set |
| ad-placements | (via layout) | ADMIN_ROLES | Set |
| analytics | (via layout) | hardcoded 'owner'\|'admin' | **Drift** |
| articles/[id]/edit | (via layout) | ADMIN_ROLES | Set |
| articles/[id]/review | (via layout) | ADMIN_ROLES | Set |
| breaking | (via layout) | ADMIN_ROLES | Set (Ext-K3 fixed) |
| categories | (via layout) | hasPermission('admin.pipeline.categories.manage') | **Key** |
| cohorts | (via layout) | ADMIN_ROLES | Set |
| comments | (via layout) | EDITOR_ROLES | Set |
| data-requests | (via layout) | EDITOR_ROLES | Set |
| email-templates | (via layout) | ADMIN_ROLES | Set |
| expert-sessions | (via layout) | EDITOR_ROLES | Set |
| features | (via layout) | ADMIN_ROLES | Set |
| feeds | (via layout) | hardcoded 'owner'\|'admin' | **Drift** |
| kids-story-manager | (via layout) | EDITOR_ROLES | Set |
| moderation | (via layout) | MOD_ROLES | Set |
| newsroom | (via layout) | ADMIN_ROLES | Set |
| newsroom/clusters/[id] | (server-side) | redirect-only | n/a |
| notifications | (via layout) | hardcoded 'owner'\|'admin' | **Drift** |
| permissions | (via layout) | hasPermission('admin.permissions.catalog.view') | **Key** |
| pipeline/cleanup | (via layout) | ADMIN_ROLES (then API enforces 'admin.pipeline.clusters.manage') | Set |
| pipeline/costs | (via layout) | (none) | RLS only |
| pipeline/runs | (via layout) | ADMIN_ROLES | Set |
| pipeline/runs/[id] | (via layout) | ADMIN_ROLES | Set |
| pipeline/settings | (via layout) | ADMIN_ROLES | Set |
| plans | (via layout) | ADMIN_ROLES | Set |
| promo | (via layout) | ADMIN_ROLES | Set |
| prompt-presets | (via layout) | hasPermission('admin.pipeline.presets.manage') | **Key** |
| reader | (via layout) | ADMIN_ROLES | Set |
| recap | (via layout) | EDITOR_ROLES | Set |
| reports | (via layout) | MOD_ROLES | Set |
| settings | (via layout) | ADMIN_ROLES | Set |
| sponsors | (via layout) | ADMIN_ROLES | Set |
| stories | (via layout) | ADMIN_ROLES | Set |
| story-manager | (via layout) | ADMIN_ROLES | Set |
| streaks | (via layout) | ADMIN_ROLES | Set |
| subscriptions | (via layout) | hardcoded 'owner'\|'admin' | **Drift** |
| support | (via layout) | ADMIN_ROLES | Set |
| system | (via layout) | hardcoded 'owner'\|'admin' | **Drift** |
| users | (via layout) | hasPermission('admin.users.list.view') | **Key** |
| users/[id]/permissions | (via layout) | ADMIN_ROLES | Set |
| verification | (via layout) | EDITOR_ROLES | Set |
| webhooks | (via layout) | ADMIN_ROLES | Set |
| words | (via layout) | ADMIN_ROLES | Set |

**Three patterns coexist** (Drift / Set / Key). 6 pages use the new permission-key pattern; ~30 use role-set membership; 6 use hardcoded literal-string role checks.

## Admin lockdown markers / Developing toggles

- No `@admin-verified` marker comments are currently active. One stale reference in `pipeline/runs/page.tsx:19` mentions "the existing @admin-verified /admin/pipeline shell" — that shell no longer exists; the comment is stale. Memory note `feedback_admin_marker_dropped.md` confirms the marker was retired 2026-04-23.
- "Developing" appears only as a per-article boolean toggle (`is_developing`) in story-manager/kids-story-manager. NOT a page-lock state.
- "Locked" appears only in newsroom for cluster-level mutex (10-min TTL via RPC).
- No page is currently rendered as a "Developing/locked" placeholder.

## .js/.jsx files still present

None. Every admin page is `.tsx`. Migration to TS is complete in this zone.

## Pages with duplicate or near-duplicate purpose

1. **`/admin/story-manager` vs. `/admin/articles/[id]/{review,edit}`** — story-manager is the older, all-in-one editor; the F7 review/edit pair is the newer canonical surface. Stories list now routes adults to F7 review, but story-manager remains reachable via Quiz pool button + `?new=1`. Recommendation in MASTER_TRIAGE-style sweep: kill story-manager once new-article flow + quiz-pool moves into F7.

2. **`/admin/story-manager` vs. `/admin/kids-story-manager`** — 1229 vs 1037 lines, near-identical structure. The two pages should share a renderer parameterized by audience.

3. **`/admin/permissions` (Sets/Roles/Plans/Users tabs) vs. `/admin/users/[id]/permissions`** — permissions page User-grants tab does the same thing as the user-centric permissions page, with fewer affordances. Two surfaces for one operation.

4. **`/admin/settings` (generic editor) vs. `/admin/pipeline/settings` (typed pipeline.* shortcut)** — pipeline/settings has typed inputs and groupings for the same rows the generic page exposes. Acceptable as a curated shortcut, but they share the same PATCH endpoint so a single source of truth lives in the API.

5. **`/admin/comments` (Discussion settings) vs. `/admin/reader` vs. `/admin/streaks` vs. `/admin/notifications`** — all four are settings-key/value editors for different config namespaces. Consistent pattern but each implements its own ConfigGroup. A shared component would dedupe.

6. **`/admin/access` (codes admin)** is half-disabled (Ext-AA1 — invite-gate stripped). Code paths kept "for re-enable", so the page is partly dead. Either delete the dead state or document what stays / what goes.

## Inconsistent patterns spotted

1. **Auth gate inconsistency** — three coexisting patterns (hardcoded literals / role-set membership / hasPermission). Hardcoded `'owner'||'admin'` lives in: access, analytics, feeds, notifications, subscriptions, system. Should migrate to ADMIN_ROLES (cheapest) or to a permission key (best).

2. **Audit log path inconsistency** — three patterns:
   - **API-owned audit** (newer, correct): permissions, ad-campaigns, ad-placements, etc. send the destructive action through `DestructiveActionConfirm` which posts to a server endpoint that calls `record_admin_action`.
   - **Client-side `record_admin_action` RPC** (older, drift): access (toggle/expiry), reader (settings toggle), support (close ticket). Two round-trips: client RPC for audit, then client mutation. Splits responsibility.
   - **No audit at all** for some direct-supabase paths in subscriptions (manual-sync was specifically fixed for this; other paths may still be drifty).

3. **Mutation path inconsistency** — service-role API endpoint vs. direct supabase client:
   - **Service-role endpoint** (correct, C-05): permissions, ad-campaigns, ad-placements, articles, broadcasts, categories, prompt-presets, plans (PATCH), promo, sponsors, users (role/plan/ban/delete/sessions/etc.), pipeline cleanup, etc.
   - **Direct supabase client mutations** (drift): plans page's `plan_features` upsert/insert/delete (C-05 only fixed the plan PATCH, not the features), access (`access_codes` insert/update), feature toggles for several settings pages, support (ticket reply insert), webhook_log retry mark-resolved, cohorts (campaigns insert), subscriptions/grace direct-update was fixed but check the rest.

4. **DB-driven vs. hardcoded config** — multiple violations of "DB is the default":
   - `RESOURCE_USAGE` array in analytics (demo-only, banner shown).
   - `RATE_LIMIT_DEFAULTS` 10-entry array in system.
   - `WEBHOOK_SOURCES` 5-entry array in webhooks.
   - `EMAIL_SEQUENCES` array in notifications (display-only sequences).
   - `TRANSPARENCY_SETTINGS` + `MONITORING_SETTINGS` lists in system (labels/descs hardcoded; settings rows in DB).
   - `STREAK_CONFIG` + `WRAPPED_CONFIG` + `GAMIFICATION_CONFIG` items in streaks.
   - `THEME_SETTINGS` + `TYPOGRAPHY_SETTINGS` etc. in reader.
   - `DEFAULT_ONBOARDING_STEPS` 7-entry copy-and-toggle array in reader.
   - `ALL_TIERS` hardcoded in ad-placements (matches plans table tiers).
   - `CATEGORIES` 11-entry list in support.
   - `RATE_LIMIT_DEFAULTS` and friends seed empty installs but should pull seeds from migration data, not const.

5. **ToastProvider mounting inconsistency** — most pages wrap their inner component in `<ToastProvider>` themselves. The admin layout already mounts a global ToastProvider. So the per-page wrappers nest unnecessarily — they each get their own toast queue and the global one is unused for those pages. Pages that DO use the global toast (just `useToast()`, no wrapper): permissions, users, breaking-style. Refactor would centralize.

6. **DestructiveActionConfirm proliferation** — many pages mount 1-3 separate `DestructiveActionConfirm` instances (verification has 3, data-requests has 2, kids-story-manager has 1 plus ConfirmDialogHost). A single hook-based queue would dedupe.

7. **Inline `<style>` `@media` blocks** for mobile breakpoints (placements, plans, kids-story-manager, recap) — pattern works but is duplicated; a shared responsive helper would centralize.

8. **Search debounce + URL sync** in newsroom uses an inner helper component (SearchUrlSync). The pattern is good but only newsroom has it; other pages with search just live-search.

9. **Tab implementations** — reports/access/expert-sessions/streaks/cohorts/notifications/permissions/system/webhooks each implement tab buttons inline as `<button>` arrays with bespoke styling. A shared `<Tabs>` component would unify.

## Notable claims worth verifying in later waves

1. **Permission-key pages match API gates 1:1** — The 6 hasPermission-keyed pages claim to mirror the API permission. Verify the API actually enforces `admin.permissions.catalog.view`, `admin.users.list.view`, `admin.pipeline.categories.manage`, `admin.pipeline.presets.manage`, `admin.pipeline.clusters.manage` at the route handler level.

2. **`compute_effective_perms` returns the right shape** — users/[id]/permissions assumes the RPC returns rows with `permission_key, granted_via, source_detail, surface, ui_section, category` etc. Schema/RPC definition needs verifying against actual `compute_effective_perms` signature in migration files.

3. **`require_outranks` server-side enforcement** — moderation/page.tsx and reports/page.tsx UI-disable penalty buttons based on hierarchy_level math. They claim server-side `require_outranks` enforces the same rule at the RPC. Verify in api/admin/moderation/users/[id]/penalty.

4. **Service-role endpoints exist for every claimed C-05 migration** — categories: 6 endpoints claimed; permissions: 7 endpoints claimed; users: ~10 endpoints claimed; broadcasts/alert: 1 claimed. Verify each route file exists and uses createServiceClient + record_admin_action + checkRateLimit.

5. **`ai_prompt_presets` table existence** — prompt-presets/page.tsx defines a local `PresetRow` type because `database.ts` types haven't been regenerated since migration 126. Verify the table actually exists in production; if not, the page is shipping for a DB row that doesn't exist.

6. **Newsroom service-role API endpoints handle RLS correctly** — `/api/admin/newsroom/clusters/sources` and `/api/admin/newsroom/clusters/articles` are explicitly described as service-role-bypassing RLS for `discovery_items` and `kid_articles`. Verify these endpoints exist and require the appropriate admin permission before bypassing.

7. **Audit-log dual-writes** — pages that call `record_admin_action` client-side AND then hit an API endpoint that may also write audit (access toggle, reader toggle, support close): verify the server endpoints don't write a duplicate audit entry. H24 comment in permissions claims server owns audit; need to confirm same is true for the older client-side-RPC paths.

8. **Cohorts campaign sender is wired** — the page inserts into `campaigns` table directly with `completed_at` set on insert. Verify whether actual delivery (email/push/in-app) is done by a downstream worker, or if this is purely a stub that records "a campaign was logged".

9. **Stripe-sync state of subscriptions/manual-sync** — page UI says "DB synced; cancel in Stripe" / "DB synced; reactivate in Stripe", flagging that operator must manually mirror in Stripe. MASTER_TRIAGE_2026-04-23.md billing item probably tracks this; verify status.

10. **The `?cluster=:id` deep-link from `/admin/newsroom/clusters/[id]/page.tsx`** is documented as a server-redirect into newsroom that newsroom doesn't yet act on — half-completed feature.

11. **Hardcoded plan tiers in ad-placements/`ALL_TIERS`** vs. live `plans` table — verify they match the DB and that no DB-only tier (like ones gated `is_visible=false`) is missing from the placement-hide-list UI.

12. **Achievements list — `awardAchievement` body sends `{achievement_name: name}`** but the comment says "achievement key, NOT name" was the prior bug. Verify the API endpoint accepts name vs key and matches.

13. **`@admin-verified` marker stale reference** in pipeline/runs/page.tsx comment — doesn't affect runtime but should be cleaned up to avoid confusion in future audits.
