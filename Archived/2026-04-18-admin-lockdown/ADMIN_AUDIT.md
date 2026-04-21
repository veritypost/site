# Admin Panel Audit

Date: 2026-04-18
Auditor: pure code review, no runtime execution
Scope: every page under `site/src/app/admin/**/page.js`

## Section 1: Summary

- **Pages audited:** 39 (36 top-level + root hub `/admin/page.js` + nested `users/[id]/permissions/page.js` + `stories/[id]/quiz/page.js` wrapper)
- **Hard data-layer bugs:** 23
- **UX issues:** 47
- **Top 10 most urgent issues:**
  1. `/admin/feeds` reads and writes `rss_feeds` table — table does not exist (only `feeds` exists). Entire page non-functional. Columns it tries to write (`outlet`, `fail_count`, `last_pull`, `stale_since`, `active`) also do not exist on `feeds`.
  2. `/admin/ingest` reads `story_clusters` — table does not exist (it is `feed_clusters`). Page loads empty forever; the "Draft selected" button already admits it is a no-op.
  3. `/admin/webhooks` retry handler writes to `webhooks` table — does not exist. Read of `webhook_log` is fine; retry is broken.
  4. `/admin/users/[id]/permissions` line 129 embeds `user_roles(roles(name))` without FK disambiguation — identical shape to the PGRST201 bug we just fixed on `/admin/users`. Page will load the target user as null and stay stuck.
  5. `/admin/support` line 190 embeds `users ( username, plan_status, plans(tier, display_name) )` — `support_tickets` has two FKs to `users` (`user_id`, `assigned_to`). Same PGRST201 shape. Support inbox will not load any tickets.
  6. `/admin/moderation` line 59 uses FK hint `users!user_warnings_user_id_fkey` — actual constraint name is `fk_user_warnings_user_id`. Appeals list always empty.
  7. `/admin/breaking` inserts rows into `articles` with columns `text`, `story`, `sent_by`, `target`, `recipients` — none exist. INSERT fails not-null on `title`. Feature is dead.
  8. `/admin/analytics` reads `quiz_attempts.passed` — column is `is_correct`. Also reads `articles.avg_read_time`, `articles.quiz_pass_rate`, `articles.tags` for pattern — first two do not exist. Quiz-failure tab shows 0% for everything.
  9. `/admin/subscriptions` writes `invoices.refund_status` and reads same — column does not exist. Refund-review tab will not persist status.
 10. `/admin/system` rate-limits tab upserts into `feature_flags` with columns `name`, `type`, `enabled` — schema is `key`, `is_enabled`. Every rate-limit toggle silently fails. Belongs in the `rate_limits` table.

The `/admin/users` "all / banned / verified" filter tab-bar is the loudest **UX over-emphasis of a rare state** (owner's explicit critique). Banned users are the headline filter on a general-purpose user list. Same pattern on the detail panel where `BANNED` / `SHADOW` / `MUTED` pills crowd the verified-user badge.

---

## Section 2: Per-page findings

### `/admin/access/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - L18: `max_uses` default `'10'` is a string — minor, will still insert correctly because it is parsed, but the form state is inconsistent.
  - No pagination on `access_codes` / `access_requests` selects (L62–78). Fine for now, flag for Wave 2.
- **Quick wins:**
  - Sort access_requests by `status` first so pending bubble up.
  - Add a tiny "copy code" button on each row.

### `/admin/ad-campaigns/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Delete confirms via `DestructiveActionConfirm`. Good.
  - Stats row "advertiser, status, spent, impressions / clicks" cramped on narrow screens (L152).
- **Quick wins:**
  - Default to filtering out `ended` campaigns — add an `Active / All / Ended` pill row.

### `/admin/ad-placements/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Hardcoded plan-tier strings `['free', 'verity', 'verity_pro', 'verity_family', 'verity_family_xl']` at L11 — Wave 2 should pull from `plans` table.
- **Quick wins:**
  - Show a small preview mock of where the placement will render.

### `/admin/analytics/page.js`
- **Status:** partial (quiz tab broken)
- **Data bugs:**
  - L93 reads `quiz_attempts.passed` — column is `is_correct`. Pass rate always 0.
  - L147 reads `topStories[].quiz_pass_rate` — column does not exist on `articles`. `avgQuizPassRate` always `NaN`/0.
  - L260 reads `story.avg_read_time` — does not exist.
  - L8–15 `RESOURCE_USAGE` is fully hardcoded fake data — labelled "Free tier limits shown" but it is not live.
- **UX smells:**
  - Tailwind-sized stat cards rely on ADMIN_C but the thresholds are persisted only in local state (L27–30). Resets every reload.
  - "Flag for Review" button (L327) calls `flagQuestion` which only flips local state — nothing persists.
- **Quick wins:**
  - Fix `passed` → `is_correct` on L93.
  - Either wire RESOURCE_USAGE to an API endpoint or delete the tab.

### `/admin/breaking/page.js`
- **Status:** broken
- **Data bugs:**
  - L74–84 inserts `{ text, story, sent_by, target, is_breaking, published_at }` into `articles`. None of `text`, `story`, `sent_by`, `target` are columns on `articles`. `title` is NOT NULL so the insert fails. Legacy-facing display code at L112–120 normalizes `a.text ?? a.headline ?? a.title` — this page was written against an older shape.
- **UX smells:**
  - L7 D14 comment can stay (internal); display copy is clean.
  - "Target Audience" free/paid/all plus reach estimate is good UX.
- **Quick wins:**
  - Rewrite the insert to use `title`, `body`, `author_id`, plus maybe `metadata: { target }`, and post the audit record in the same transaction.
  - Gate the `Send Breaking Alert` button off until a category is picked (currently category is missing from the form entirely — the alert lands with no category).

### `/admin/categories/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Delete of subcategory has no confirm (L203) — only an audit-log precheck. A subcategory deletion could orphan articles. Should require confirm.
  - Batched reorder (L155–157) fires one UPDATE per row — fine at small counts, flag if categories grow.
- **Quick wins:**
  - Add `confirm()` or DestructiveActionConfirm to `removeSub`.
  - Show article count next to each category (blocks accidental deletes of in-use categories).

### `/admin/cohorts/page.js`
- **Status:** partial (filter builder is local-only)
- **Data bugs:** none
- **UX smells:**
  - L13–94 massive `FILTER_CATEGORIES` is pure client-side state. `resetFilters`, `activeFilterCount` are real; but there is no "Save as cohort" action — filters are never persisted to `cohorts.criteria`. So the entire filter UI is a prop display, not a cohort builder.
  - L15 `Verity, Verity Pro, Verity Family, Verity Family XL` are hardcoded plan strings — flag for Wave 2.
  - L43 `lastActive` uses `Inactive 14+ days`, `Inactive 30+ days` — edge states shown alongside active states; fine here because this screen *is* for segmenting.
  - `sendMessage` (L194) writes a campaigns row with `completed_at = NOW()` — no actual send. Pill "sent" will be misleading.
- **Quick wins:**
  - Add a `Save as cohort` button that writes `cohorts.criteria = filters`.
  - Wire `sendMessage` to `/api/admin/campaigns` (or remove the compose sheet until the send pipeline exists).

### `/admin/comments/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Entirely static toggle panel. All keys (L20–80) map to `settings` rows; no readback per-article validation.
  - `quiz_required` guarded by confirm (L171) — good.
- **Quick wins:**
  - Show the current platform-wide `quiz_required` value near the top as a live status pill.

### `/admin/data-requests/page.js`
- **Status:** works
- **Data bugs:** none (all fetches go through API routes)
- **UX smells:**
  - Filter defaults to `pending` (L25) — correct emphasis on actionable state.
- **Quick wins:** clean.

### `/admin/email-templates/page.js`
- **Status:** partial (category filter broken)
- **Data bugs:**
  - L51 filters by `t.category` — `email_templates` has no `category` column. Any filter other than `All` returns empty.
- **UX smells:**
  - `CATEGORIES` (L8) is hardcoded. Even if the column existed, the list should come from `DISTINCT category`.
  - No pagination (fine).
- **Quick wins:**
  - Add a `category` column to `email_templates` (or drop the filter) and backfill from the `key` prefix.
  - Show a "Send test email" button on the editor — currently the Edit form gives no way to preview delivery.

### `/admin/expert-sessions/page.js`
- **Status:** works
- **Data bugs:** none (FK-disambiguated at L39–40)
- **UX smells:**
  - L8 `D9` comment should be removed — per owner note about D-number references.
- **Quick wins:**
  - Show a "Join as moderator" link when a session is `live`.

### `/admin/features/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Dense form; advanced targeting is JSON free-text. Error-prone.
- **Quick wins:**
  - Add a "Duplicate flag" button.
  - Warn if `expires_at` is in the past when saving.

### `/admin/feeds/page.js`
- **Status:** broken
- **Data bugs:**
  - L47, L84, L93, L99, L118 all use `from('rss_feeds')` — table does not exist. Should be `feeds`.
  - L82–103 reads/writes columns that do not exist on `feeds`: `outlet`, `active`, `fail_count`, `stale_since`, `last_pull`. Correct columns: `name`/`source_name`, `is_active`, `error_count`, `last_error_at`, `last_polled_at`. The `normFeed` function (L57–69) papers over this by testing many aliases, but **every write path still uses the wrong column names and will no-op or error**.
- **UX smells:**
  - Table doesn't exist so the whole page is dead.
- **Quick wins:**
  - Rewrite against `feeds` (ALL fields aliased). Possibly the largest single rewrite needed.

### `/admin/ingest/page.js`
- **Status:** broken
- **Data bugs:**
  - L37 `from('story_clusters')` — table does not exist (it is `feed_clusters`). Page always shows "No clusters found".
  - L38 selects columns `topic`, `category`, `subcategory`, `audience`, `article_ids`, `confidence`, `story_id` — `feed_clusters` has `title`, `summary`, `primary_article_id`, `category_id`, `keywords`, `similarity_threshold`. **Zero overlap**.
- **UX smells:**
  - L81 `draftChecked` pops an alert admitting the pipeline is not wired — candid, but the tab remains visible as if it works.
- **Quick wins:**
  - Rewrite against `feed_clusters` + `feed_cluster_articles`, or hide this page from the hub until the pipeline exists.

### `/admin/kids-story-manager/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Confirm on delete uses `DestructiveActionConfirm` (L352) — good.
  - Inline `confirm('Delete this entry?')` on timeline entries at L692 — inconsistent with the rest of the page.
- **Quick wins:**
  - Unify timeline-entry delete to the shared confirm component.

### `/admin/moderation/page.js`
- **Status:** broken (appeals list)
- **Data bugs:**
  - L59 embed hint `users!user_warnings_user_id_fkey` — actual FK constraint name is `fk_user_warnings_user_id`. Appeals query fails; `loadAppeals` writes `[]`. Pending appeals always empty.
- **UX smells:**
  - L150 copy mentions "Pending appeals listed below" and they are always 0 because of the bug above — confusing.
  - `prompt()` on L133 for appeal notes — primitive.
- **Quick wins:**
  - Fix the FK hint to `fk_user_warnings_user_id`.
  - Replace `prompt()` with the DestructiveActionConfirm reason field.

### `/admin/notifications/page.js`
- **Status:** partial
- **Data bugs:**
  - L188–190 "send to all users" selects every `users.id` without a limit and fans out one `notifications` row per user. At 10k users this posts 10k rows. Unbounded.
- **UX smells:**
  - EMAIL_SEQUENCES (L46–58) is a purely static preview of sequences that do not exist in DB. Confusingly rendered as if editable.
  - Send-notification form is gated only by "title required + body required" — no preview, no confirm, no dry-run.
- **Quick wins:**
  - Add a confirm dialog that shows `targetUserIds.length` before inserting.
  - Replace the "all users" path with an API route that chunks inserts and enforces the notification batch cap.

### `/admin/page.js` (hub)
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Hub copy is clean — no D-numbers, no Verity+ noise. Good.
  - L93 fetches featured articles with no limit on comments/readers — embed is minimal.
- **Quick wins:**
  - none.

### `/admin/permissions/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - L1117 total lines — single biggest admin file. Three tabs worth of logic fused.
  - L756 "Delete permission row (two-step confirm)" good wording.
  - Inline hex colors in places (e.g. the grid) intentional per adminPalette.js note.
- **Quick wins:**
  - Add a "Search permissions" input to the Sets tab (it is only on Registry).

### `/admin/pipeline/page.js`
- **Status:** partial
- **Data bugs:**
  - L103 `order('date', { ascending: false })` on `pipeline_costs` — table has no `date` column (it has `created_at`). Cost dashboard stays empty.
- **UX smells:**
  - L10–19 `STEPS`, L21–28 `PROMPTS`, L32–42 `DEFAULT_CATEGORY_PROMPTS`, L44–50 `COST_TIPS` — all hardcoded.
  - `handleRunCustomIngest` POSTs to `/api/ai/generate` which exists but the screen does not tell the admin what just happened beyond an `alert()`.
  - L202 TODO comment about a kill switch — leftover, fine to keep.
- **Quick wins:**
  - Fix `.order('date'...)` to `.order('created_at', ...)`.
  - Show the pipeline run it just triggered inline.

### `/admin/plans/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Uses `confirm()` for feature removal (L200) — inconsistent with the rest of the app's DestructiveActionConfirm pattern.
- **Quick wins:**
  - Replace `confirm()` with DestructiveActionConfirm.

### `/admin/promo/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Status pill is "active / expired" only; no "paused/scheduled" even though `starts_at` is supported. Minor.
- **Quick wins:**
  - Filter `expired` codes out of the default view.

### `/admin/reader/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - L62–70 `DEFAULT_ONBOARDING_STEPS` toggle/edit UI is purely local state — not persisted.
  - "Welcome copy" edits save only to React state (L193–196).
- **Quick wins:**
  - Either persist onboarding-step edits to `settings` or mark the panel as "preview only".

### `/admin/recap/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:** clean
- **Quick wins:**
  - Sort recaps by `week_start DESC`; currently relies on API default order.

### `/admin/reports/page.js`
- **Status:** works
- **Data bugs:** none (L71 FK-disambiguated correctly)
- **UX smells:**
  - Supervisor pill at L166 and supervisor-filter checkbox at L148 are both correct — matches the "fast lane for rare state but not forced as default" principle.
- **Quick wins:**
  - Default to `pending` filter (already does).

### `/admin/settings/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:** clean
- **Quick wins:**
  - Show `updated_by` next to each row.

### `/admin/sponsors/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:** clean
- **Quick wins:**
  - Show active/inactive filter.

### `/admin/stories/page.js`
- **Status:** partial
- **Data bugs:** none
- **UX smells:**
  - L306 "+ New Article" button is a dead handler: `onClick={() => { showToast('Creating new article...'); }}` — shows a toast and does nothing.
  - L352–353 `Find Articles` panel has `Clear` and `Scan New` buttons with no onClick handlers (inert buttons).
  - L184–190 inline hex colors (`'#222222'`, `'#111111'`, `'#ffffff'`) instead of ADMIN_C — deliberately excluded per adminPalette.js comment (structural outlier), but the dead buttons remain.
  - Filter pill exposes 5 statuses (`all, published, draft, scheduled, updated`); `updated` isn't a real article status.
- **Quick wins:**
  - Wire `+ New Article` to route to `/admin/story-manager?new=1`.
  - Remove the `Find Articles` panel until it is wired, or convert it into a link to `/admin/ingest`.
  - Drop the `updated` filter or define what it means.

### `/admin/story-manager/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - Timeline-entry delete at L693 uses inline `confirm()` — inconsistent with the page's own DestructiveActionConfirm for article delete.
- **Quick wins:**
  - Unify delete confirms.

### `/admin/stories/[id]/quiz/page.js`
- **Status:** works
- **Data bugs:** none (thin wrapper over `QuizPoolEditor`)
- **UX smells:** clean
- **Quick wins:** none.

### `/admin/streaks/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - L28–46 WRAPPED and GAMIFICATION configs — toggles save to `settings` but nothing downstream reads most of them. Reader will only see `wrapped_enabled` and a few others. Rest are aspirational.
- **Quick wins:**
  - Label sections that have no downstream wiring as "Preview" or remove.

### `/admin/subscriptions/page.js`
- **Status:** partial
- **Data bugs:**
  - L193 `.from('invoices').update({ refund_status: ... })` — `invoices` has no `refund_status` column.
  - L103 filters `i.refund_status` on the same non-existent column.
  - L165 writes status `'cancelled_pending_stripe'` — not in the enum list `subscriptions.status` uses (there is a CHECK constraint). Will likely fail.
  - Plan counts at L112 assume `s.plans?.name` in a predetermined set (`PRICING.verity_pro` etc.) — a Supabase plan named `verity` doesn't line up with PRICING keys used at L60.
- **UX smells:**
  - `handleAdminFreeze` uses `confirm()` (L259). All other destructive actions use DestructiveActionConfirm. Inconsistent.
  - L231 message text `"DMs revoke immediately. The 7-day grace period..."` contains logic the admin can't actually change here.
- **Quick wins:**
  - Add a `refund_status` column to `invoices` or move refund tracking into `subscription_events`.
  - Replace `confirm()` with DestructiveActionConfirm on freeze.
  - Validate `subscriptions.status` writes against the CHECK constraint before submit.

### `/admin/support/page.js`
- **Status:** broken
- **Data bugs:**
  - L190 `.select('id, ..., users ( username, plan_status, plans(tier, display_name) )')` — `support_tickets` has 2 FKs to `users` (`user_id`, `assigned_to`). Ambiguous embed. PGRST201. Tickets list always empty.
- **UX smells:**
  - ChatWidgetConfig is likely static preview — I didn't read it in full.
- **Quick wins:**
  - Disambiguate: `users!fk_support_tickets_user_id ( ... )`.
  - Show assignee name (which is the second FK) in a separate column.

### `/admin/system/page.js`
- **Status:** broken (rate-limits tab)
- **Data bugs:**
  - L124 reads `feature_flags` with `.eq('type', 'rate_limit')` — `feature_flags` has no `type` column. Returns `[]`, falls back to defaults.
  - L172–184 upserts into `feature_flags` with `{ name, type, enabled, metadata }` — schema uses `key`, `is_enabled`. Every toggle silently fails (or errors with "column 'name' does not exist").
  - The whole rate-limits tab belongs in the `rate_limits` table (which has the right schema).
- **UX smells:**
  - L47–58 hardcoded RATE_LIMIT_DEFAULTS shadow what would be in `rate_limits`.
- **Quick wins:**
  - Repoint reads/writes at `rate_limits` table with correct column mapping.

### `/admin/users/page.js`
- **Status:** works (after recent PGRST201 fix)
- **Data bugs:** none (L117 already disambiguated with `!fk_user_roles_user_id`)
- **UX smells:**
  - **L354 `['all', 'banned', 'verified']` filter pill row — this is exactly the "edge case promoted to default affordance" the owner flagged.** Banned users will be a tiny fraction; elevating them to the tab bar wastes the most prominent control real estate.
  - L378 `(banned)` inline suffix on every row — fine.
  - L411 `SHADOW` pill red-highlighted in detail panel when the user is shadow-banned — also edge-case-forward; acceptable because it only shows on affected users.
  - L438–487 `Linked Devices` section always renders "No devices linked" because `sel.devices` is never populated — the page never reads `sessions` or `user_sessions`. Dead section.
  - Dead filter "verified" at L354 — `is_verified_public_figure` is a valid column but the filter predicate at L129 is `u.is_verified_public_figure`, which is sparse.
  - ACHIEVEMENTS (L34) is a hardcoded list — not derived from `achievements` table.
- **Quick wins:**
  - Replace the `['all', 'banned', 'verified']` bar with `['all', 'active', 'flagged']` where `flagged` rolls up banned + shadow + muted into one non-default view.
  - Wire `sel.devices` by joining `sessions` where `is_active = true`, or remove the section.
  - Pull ACHIEVEMENTS options from the `achievements` table.

### `/admin/users/[id]/permissions/page.js`
- **Status:** broken
- **Data bugs:**
  - L129 `.select('..., user_roles(roles(name))')` — unqualified, ambiguous FK on `user_roles` (two FKs to `users`). PGRST201. Target user never loads; page stuck on `userLoadError = 'users'`.
- **UX smells:**
  - L529 `else if (reason === 'banned') detailParts.push('denied: banned');` — fine, it's a per-rule detail string, not a default-view emphasis.
- **Quick wins:**
  - Fix the embed to `user_roles!fk_user_roles_user_id(roles(name))`.

### `/admin/verification/page.js`
- **Status:** works
- **Data bugs:** none (goes through API routes)
- **UX smells:**
  - L7 D3 comment — remove.
- **Quick wins:**
  - Show a "days waiting" counter next to each pending app.

### `/admin/webhooks/page.js`
- **Status:** partial (retry broken)
- **Data bugs:**
  - L91 `.from('webhooks').update(...)` — no such table. Retry always errors.
  - L87 `oldValue: { status: log.status, retries: log.retries || 0 }` — `webhook_log` has `processing_status`, `retry_count`. Columns being read don't exist on `log`.
- **UX smells:** none notable.
- **Quick wins:**
  - Repoint retry to `/api/admin/webhooks/${id}/retry` or to `webhook_log` with the correct column names.

### `/admin/words/page.js`
- **Status:** works
- **Data bugs:** none
- **UX smells:**
  - No confirm on word removal (L193) despite audit log entry. Low risk because words are easily re-added.
- **Quick wins:**
  - Surface which words actually blocked a post in the past week.

---

## Section 3: Cross-cutting patterns

### FK-embed ambiguity
- **Count:** 3 un-fixed cases, 1 wrong-name hint
- **Files:**
  - `/admin/users/[id]/permissions/page.js` L129 (unqualified `user_roles(...)`)
  - `/admin/support/page.js` L190 (unqualified `users ( ... )` on support_tickets)
  - `/admin/moderation/page.js` L59 (wrong FK hint: uses `user_warnings_user_id_fkey`, actual is `fk_user_warnings_user_id`)
  - `/admin/users/page.js` L117 **ALREADY FIXED** — included here only for contrast
- **Pattern:** any table with multiple FKs to `users` needs `users!<constraint_name>(...)`. The confusing detail: existing pages hand-write the short-form hint `users!<table>_user_id_fkey` that ships with Supabase auto-generation — but Blueprint v2 named the constraints `fk_<table>_<column>`. So ANY PostgREST embed using the auto-generated hint shape is wrong.

### Missing table / dropped table references
- `rss_feeds` → `feeds` (admin/feeds)
- `story_clusters` → `feed_clusters` (admin/ingest)
- `webhooks` → `webhook_log` (admin/webhooks retry)
- These are from the old schema. All three pages need rewriting against Blueprint v2 tables.

### Column-doesn't-exist on SELECT/UPDATE
- `quiz_attempts.passed` (admin/analytics)
- `articles.avg_read_time`, `articles.quiz_pass_rate`, `articles.tags` (admin/analytics)
- `articles.text`, `articles.story`, `articles.sent_by`, `articles.target`, `articles.recipients` (admin/breaking inserts)
- `feeds.outlet`, `feeds.active`, `feeds.fail_count`, `feeds.stale_since`, `feeds.last_pull` (admin/feeds writes)
- `feature_flags.name`, `feature_flags.type`, `feature_flags.enabled` (admin/system rate limits)
- `email_templates.category` (admin/email-templates filter)
- `pipeline_costs.date` (admin/pipeline ordering)
- `invoices.refund_status` (admin/subscriptions)
- `webhook_log` accessed via non-existent `status` and `retries` columns (admin/webhooks retry)

### RPCs called
- All RPCs referenced (`record_admin_action`, `compute_effective_perms`) exist in the live schema. No broken RPC calls.

### Hardcoded role / plan strings
- **Count:** ≥ 30 occurrences across 21 files.
- **Most egregious files:**
  - `/admin/users/page.js` L75–85 (9-plan `PLAN_OPTIONS`)
  - `/admin/cohorts/page.js` L17 (plan dropdown)
  - `/admin/ad-placements/page.js` L11 (tier array)
  - `/admin/subscriptions/page.js` L60–63 (`PRICING.verity_*`)
  - Every page's auth check: `['owner', 'admin']`, `['owner', 'superadmin', 'admin']`, `['owner', 'superadmin', 'admin', 'editor']` etc. 22 distinct hardcoded role arrays.
- **Wave 2 fix:** adopt a `requireRole('X')`-style client helper that reads from a `roles` table cache and compares via `hierarchy_level`.

### Missing pagination
- **Count:** 18 `.select('*')`-style calls without `.limit()` or `.range()`.
- **Tables:** `users` (notifications compose, users admin, moderation, cohorts), `articles` (stories, story-manager, kids-story-manager), `access_codes`, `access_requests`, `subscriptions` (ordered but unlimited), `invoices`, `support_tickets`, `feature_flags`, `cohorts`, `notifications` (limit 100 — OK), `pipeline_runs` (limit 50 — OK), `admin_audit_log` (limit 50 — OK), `webhook_log`.
- Fine at current scale (tens to low hundreds of rows per table). **Break at ~10k+.** Flag for Wave 2.

### D-number references in page body
- **Count:** 6 residual in-page comments/text; NONE in user-facing copy.
- Files: `/admin/expert-sessions/page.js` L8, `/admin/reports/page.js` L7, L137 body text "Supervisor flags (D22)", `/admin/breaking/page.js` L89 comment, `/admin/ad-placements/page.js` L7, `/admin/verification/page.js` L7, `/admin/users/page.js` L258 (inline comment "D1: 3/5 = 60% passing").
- L137 in `/admin/reports/page.js` is the only one rendered in-page copy (`Supervisor flags (D22) jump to the top...`). The rest are code comments.

### "Verity+" parenthetical references
- **Count:** 0 in admin pages. Clean.

### Dead buttons / no-op handlers
- `/admin/stories/page.js` L306 `+ New Article` (toast-only)
- `/admin/stories/page.js` L352–353 `Clear` and `Scan New`
- `/admin/analytics/page.js` L327 `Flag for Review` (local state only)
- `/admin/analytics/page.js` L328 `Edit Question` (no handler)
- `/admin/reader/page.js` L193 `saveStepCopy` (local state only)

### Destructive actions missing proper confirm
- `/admin/categories/page.js` L203 subcategory delete (no confirm)
- `/admin/words/page.js` L193 word remove (no confirm; low risk)
- `/admin/plans/page.js` L200 feature removal (basic `confirm()` instead of DestructiveActionConfirm)
- `/admin/subscriptions/page.js` L259 freeze (basic `confirm()`)
- `/admin/story-manager/page.js` L693 timeline entry delete (`confirm()`)
- `/admin/kids-story-manager/page.js` L692 timeline entry delete (`confirm()`)

### Inconsistent styling
- `/admin/stories/page.js` uses inline hex colors instead of ADMIN_C (intentional per palette doc — `stories` is a structural outlier).
- `/admin/permissions/page.js` similarly deliberate.
- No Tailwind classes anywhere — confirmed. Inline styles everywhere else use ADMIN_C or ADMIN_C_LIGHT correctly.

### TODOs / FIXME
- Only `/admin/pipeline/page.js` L202 (`TODO: wire a persisted pipeline kill switch here`).
- Comment style is fine; does not leak into UI.

### Empty-state emphasis
- `/admin/users/page.js` `all/banned/verified` filter IS the owner-flagged pattern.
- `/admin/moderation/page.js` "Pending appeals" section always-empty due to FK bug (see data layer).
- Otherwise most pages have reasonable empty states ("No campaigns.", "Pick a report.", etc.).

### Silent error-swallow on `setLoading(false)`
- 28 files set `loading = false` after a query without surfacing errors to the user. `reader`, `streaks`, `settings`, `permissions` handle errors well. The rest generally silently proceed with partial data.

---

## Section 4: Recommended fix order

### ≤ 5 minutes each

1. `/admin/users/[id]/permissions/page.js` L129 — change `user_roles(roles(name))` to `user_roles!fk_user_roles_user_id(roles(name))`. Fixes per-user permissions screen.
2. `/admin/support/page.js` L190 — disambiguate `users` embed: `users!fk_support_tickets_user_id (...)`. Fixes support inbox.
3. `/admin/moderation/page.js` L59 — change FK hint from `user_warnings_user_id_fkey` to `fk_user_warnings_user_id`. Fixes appeals list.
4. `/admin/analytics/page.js` L93 — change `.select('quiz_id, passed')` to `.select('quiz_id, is_correct')` and update `if (!r.passed)` to `if (!r.is_correct)` at L98. Fixes quiz-failure analytics.
5. `/admin/pipeline/page.js` L103 — change `.order('date', ...)` to `.order('created_at', ...)`. Fixes cost dashboard order.
6. `/admin/email-templates/page.js` L51 — either remove `CATEGORIES` filter entirely, or set every template's `category` field in DB. Fastest: delete the category filter row (L108–115).
7. `/admin/stories/page.js` L306 — wire `+ New Article` to `router.push('/admin/story-manager?new=1')` OR hide the button.
8. Remove the 6 D-number code comments (grep for `// D\d+`, delete).
9. `/admin/categories/page.js` L203 — add `if (!confirm(...)) return;` before the delete.
10. `/admin/plans/page.js` L200 — already uses `confirm()`; upgrade to DestructiveActionConfirm for consistency (moderate, not quick — move to next bucket).

### 15–30 minutes each

1. `/admin/users/page.js` L354 — replace `['all', 'banned', 'verified']` with `['all', 'active', 'flagged']` where flagged covers banned+shadow+muted, and drop the "BANNED" emphasis from being a first-level filter. Direct owner critique.
2. `/admin/users/page.js` L438–487 — either populate `sel.devices` from `sessions` or remove the Linked Devices section.
3. `/admin/analytics/page.js` resources tab (L337–368) — either wire to a real API or delete the tab.
4. `/admin/webhooks/page.js` L86–97 — repoint retry to `/api/admin/webhooks/${id}/retry` API route (create it) or change table/columns to `webhook_log` with `processing_status`/`retry_count`.
5. `/admin/subscriptions/page.js` L193, L103 — add `refund_status` to `invoices` (migration) OR store refund state in `subscription_events`. Either requires DB change; 30 min.
6. `/admin/subscriptions/page.js` L259, `/admin/plans/page.js` L200, story-manager/kids L692–693 — convert to DestructiveActionConfirm (repeatable pattern, easy per site).
7. `/admin/reports/page.js` L137 — remove `(D22)` from body copy.
8. `/admin/notifications/page.js` L187–191 — add a confirm with user count before fanning out to all users; chunk the INSERT.
9. `/admin/pipeline/page.js` L202 — remove the TODO comment or track in the PM log instead.
10. `/admin/system/page.js` rate-limits tab — move reads/writes from `feature_flags` to `rate_limits` (the table already exists). Add column mapping.

### > 1 hour each

1. `/admin/feeds/page.js` — full rewrite against `feeds` table, with new column mapping (`name`/`source_name`, `is_active`, `error_count`, `last_polled_at`, etc.). Re-enable the page behind correct schema.
2. `/admin/ingest/page.js` — full rewrite against `feed_clusters` + `feed_cluster_articles`, or hide from hub until the pipeline exists.
3. `/admin/breaking/page.js` — rewrite the insert path to target real `articles` columns, and route the target-audience selection into the fan-out API rather than a fake articles-column.
4. `/admin/cohorts/page.js` — wire "Save as cohort" (writes filters to `cohorts.criteria`), and wire `sendMessage` to the real campaigns API with a proper send pipeline. Currently ~80% ornament.
5. Wave 2 permission-driven role checks: replace every `['owner', 'admin']`-style hardcoded array (≥22 files) with `useHasPermission('admin.users.manage')`-style hooks. Requires a client-side permission cache and a `hasPermission` API. 1–2 days total.
6. Pagination pass: add `.range()` + a "load more" affordance to the 18 tables listed above. ~1 day.

---

*End of audit.*
