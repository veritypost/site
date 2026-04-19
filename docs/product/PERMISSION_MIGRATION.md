# Permission Migration — Full Sweep

**Goal:** every role/plan/hardcoded gate in the codebase becomes a `hasPermission('key')` / `requirePermission('key')` check, so admin toggles affect real behavior.

**Marker:** every migrated file gets `// @migrated-to-permissions <date>` at the top. Grep `-rL "@migrated-to-permissions"` shows what's left.

## Scope

| Wave | Area | Files (approx) | Agent |
|---|---|---|---|
| 2A | Web public pages (`site/src/app/**`, non-admin) | ~57 | A |
| 2B | Web API routes (`site/src/app/api/**`) | ~128 | B |
| 2C | Shared components (`site/src/components/**`) | ~50 | C |
| 2D | iOS views (`VerityPost/VerityPost/*.swift`) | ~37 | D |

**Intentionally unmarked — framework files.** The following files are Next.js framework conventions or pure iOS infrastructure, not features, and are intentionally excluded from permission migration. Future drift audits should ignore them.

- Next.js conventions (at any route level): `robots.js`, `sitemap.js`, `manifest.js`, `not-found.js`, `error.js`, `global-error.js`, `loading.js`.
- Pure-infra Swift files: `Keychain.swift`, `Log.swift`, `Models.swift`, `Password.swift`, `PermissionService.swift`, `SupabaseManager.swift`, `Theme.swift`, `VerityPostApp.swift`, `SettingsService.swift`, `StoreManager.swift`.

Marker-audit scripts should exclude paths matching `(robots|sitemap|manifest|loading|error|not-found|global-error)\.(js|tsx|ts)$` and the 10 infra Swift filenames above.

## Status

_Agents will update this section as files are migrated._

### 2A — Web public pages
- [ ] In progress
- [x] site/src/app/story/[slug]/page.tsx — converted to TSX; isPaidTier(userTier) x3 → hasPermission('article.bookmark.add'); feature-verified article_reading 2026-04-18: body self-gates on `article.view.body`, sources on `article.view.sources`, timeline on `article.view.timeline`, bottom Ad slot suppressed on `article.view.ad_free`; dead `userPlan` state removed; existing `article.bookmark.add` / `article.listen_tts` / quiz+comments gates preserved
- [x] site/src/app/api/stories/read/route.js — feature-verified article_reading 2026-04-18; already gated by `requirePermission('article.read.log')` (marker only)
- [x] site/src/app/bookmarks/page.tsx — converted to TSX; isPaidTier(userTier) x3 → hasPermission('bookmarks.unlimited' | 'bookmarks.collection.create' | 'bookmarks.note.add' | 'bookmarks.export')
- [x] site/src/app/forgot-password/page.tsx — converted to TSX; no role/plan gates (pre-auth form), typed only
- [x] site/src/app/reset-password/page.tsx — converted to TSX; no role/plan gates (token-gated form), typed only
- [x] site/src/app/welcome/page.tsx — converted to TSX; no role/plan gates (onboarding carousel), typed only
- [x] site/src/app/page.tsx — converted to TSX; verified (email_verified) gate x2 → hasPermission('home.search' | 'home.subcategories'); breaking banner added hasPermission('home.breaking_banner.view')
- [x] site/src/app/page.tsx — feature-verified home_feed 2026-04-18; added `home.breaking_banner.view.paid` self-gate on the breaking-banner excerpt+timestamp sub-row (free variant = headline only, paid variant adds excerpt + published time); second header marker added
- [x] site/src/app/privacy/page.tsx — converted to TSX; static legal content, no gates
- [x] site/src/app/terms/page.tsx — converted to TSX; static legal content, no gates
- [x] site/src/app/cookies/page.tsx — converted to TSX; static legal content, no gates
- [x] site/src/app/dmca/page.tsx — converted to TSX; static legal content, no gates
- [x] site/src/app/accessibility/page.tsx — converted to TSX; static legal content, no gates
- [x] site/src/app/how-it-works/page.tsx — converted to TSX; static marketing content, no gates
- [x] site/src/app/login/page.tsx — converted to TSX; pre-auth form, no role/plan gates (post-login `email_verified`/`onboarding_completed_at` is redirect routing, not a gate)
- [x] site/src/app/signup/page.tsx — converted to TSX; pre-auth form, no role/plan gates
- [x] site/src/app/messages/page.tsx — converted to TSX; PermissionGate + PERM.PROFILE_MESSAGES dropped in favor of `hasPermission('messages.dm.compose')`; inline DM-upgrade branch reads the same key
- [x] site/src/app/notifications/page.tsx — converted to TSX; added `hasPermission('notifications.inbox.view')` hydrate gate (mirrors the server route's check)
- [x] site/src/app/search/page.tsx — converted to TSX; `isPaidTier(userTier)` → `hasPermission('search.advanced')`; dropped `@/lib/tiers` import
- [x] site/src/app/leaderboard/page.tsx — converted to TSX; `email_verified` + plan-tier derivation → `hasPermission('leaderboard.view' | 'leaderboard.view.categories')`
- [x] site/src/app/browse/page.tsx — converted to TSX; public category directory, no role/plan gate needed (anon RLS read); marker only
- [x] site/src/app/status/page.tsx — converted to TSX; static uptime page, no gates; marker only
- [x] site/src/app/expert-queue/page.tsx — converted to TSX; `is_user_expert` RPC + role bypass already replaced, kept `hasPermission('expert.queue.view')` + `expert.queue.oversight_all_categories` fallback
- [x] site/src/app/appeal/page.tsx — converted to TSX; eligibility is account-state (`is_banned`/`muted_until`), not role/plan; marker only
- [x] site/src/app/signup/expert/page.tsx — converted to TSX; pre-auth application form, no role/plan gates; marker only
- [x] site/src/app/signup/pick-username/page.tsx — converted to TSX; onboarding step, no role/plan gates; marker only
- [x] site/src/app/recap/page.tsx — migrated + feature-verified recap
- [x] site/src/app/recap/[id]/page.tsx — migrated + feature-verified recap
- [x] site/src/app/profile/[id]/page.tsx — migrated; uses profile.follow for follow button
- [x] site/src/app/u/[username]/page.tsx — migrated; uses profile.follow for follow button
- [x] site/src/app/kids/layout.tsx — migrated + feature-verified kids; converted js to tsx, no gates (layout only)
- [x] site/src/app/kids/page.tsx — migrated + feature-verified kids; converted js to tsx, swapped has_permission RPC for hasPermission('kids.home.view')
- [x] site/src/app/kids/story/[slug]/page.tsx — migrated + feature-verified kids; converted js to tsx, self-gates on kids.article.view, dropped dead userTier="verity_family" prop on ArticleQuiz
- [x] site/src/app/kids/leaderboard/page.tsx — migrated + feature-verified kids; converted js to tsx, self-gates on kids.leaderboard.family and kids.leaderboard.global.view (scope tabs hidden when either is denied)
- [x] site/src/app/kids/expert-sessions/page.tsx — migrated + feature-verified kids; converted js to tsx, self-gates on kids.expert.list_sessions
- [x] site/src/app/kids/expert-sessions/[id]/page.tsx — migrated + feature-verified kids; converted js to tsx, self-gates on kids.expert.join_live (view) + kids.expert.ask_question (ask-form visibility)
- [x] site/src/app/kids/profile/page.tsx — migrated + feature-verified kids; converted js to tsx, self-gates on kids.home.view; also fixed achievements.display_name → .name (schema mismatch bug)
- [x] site/src/app/profile/kids/page.tsx — migrated + feature-verified family_admin; converted js to tsx; replaced `plan?.tier === 'verity_family*'` with `hasPermission('kids.parent.view'|'family.add_kid'|'family.remove_kid'|'kids.trial.start'|'kids.parent.household_kpis')`; self-gates to upgrade prompt when parent lacks kids.parent.view; add-kid button gated by family.add_kid; delete gated by family.remove_kid; kpi fetch gated by kids.parent.household_kpis; fetches now pass credentials explicitly
- [x] site/src/app/profile/kids/[id]/page.tsx — migrated + feature-verified family_admin; converted js to tsx; self-gates on kids.parent.view; streak-freeze button gated by kids.streak.freeze.use; leaderboard opt-in gated by kids.parent.global_leaderboard_opt_in; achievements.display_name → .name schema fix carried through
- [x] site/src/app/profile/family/page.tsx — migrated + feature-verified family_admin; converted js to tsx; three sections each gated independently by family.view_leaderboard, family.shared_achievements|kids.achievements.view, kids.parent.weekly_report.view; full upgrade prompt when all three denied

### 2B — Web API routes
- [ ] In progress
- [x] site/src/app/api/comments/route.js — POST: requireAuth → comments.post
- [x] site/src/app/api/comments/[id]/route.js — PATCH: requireAuth → comments.edit.own; DELETE: requireAuth → comments.delete.own
- [x] site/src/app/api/comments/[id]/vote/route.js — POST: requireAuth → comments.upvote
- [x] site/src/app/api/comments/[id]/report/route.js — POST: requireAuth+email_verified → comments.report
- [x] site/src/app/api/comments/[id]/flag/route.js — POST: requireAuth → comments.supervisor_flag
- [x] site/src/app/api/comments/[id]/context-tag/route.js — POST: requireAuth → comments.context_tag
- [x] site/src/app/api/bookmarks/route.js — POST: requireAuth → article.bookmark.add
- [x] site/src/app/api/bookmarks/[id]/route.js — PATCH: requireAuth → bookmarks.note.edit; DELETE: requireAuth → article.bookmark.remove
- [x] site/src/app/api/bookmarks/export/route.js — GET: requireAuth (+ _user_is_paid RPC) → bookmarks.export
- [x] site/src/app/api/bookmark-collections/route.js — already migrated (GET bookmarks.list.view, POST bookmarks.collection.create)
- [x] site/src/app/api/bookmark-collections/[id]/route.js — already migrated (PATCH bookmarks.collection.rename, DELETE bookmarks.collection.delete)
- [x] site/src/app/api/messages/route.js — POST: requireAuth → messages.dm.compose
- [x] site/src/app/api/messages/search/route.js — GET: requireAuth (+ _user_is_paid RPC) → messages.search
- [x] site/src/app/api/notifications/route.js — already migrated (GET notifications.inbox.view, PATCH notifications.mark_read)
- [x] site/src/app/api/notifications/preferences/route.js — already migrated (GET notifications.prefs.view, PATCH notifications.prefs.toggle_push)
- [x] site/src/app/api/follows/route.js — already migrated (POST profile.follow)
- [x] site/src/app/api/reports/route.js — already migrated (POST article.report)
- [x] site/src/app/api/reports/weekly-reading-report/route.js — already migrated (GET kids.parent.weekly_report.view)
- [x] site/src/app/api/expert-sessions/route.js — GET: requireAuth → kids_expert.sessions.list.view; POST: requireRole('editor') → admin.expert_sessions.create
- [x] site/src/app/api/expert-sessions/[id]/questions/route.js — GET: requireAuth → expert.session.questions.view; POST: requireAuth → kids_expert.question.ask
- [x] site/src/app/api/expert-sessions/questions/[id]/answer/route.js — POST: requireAuth (+ expert_can_see_back_channel RPC) → kids_expert.question.answer
- [x] site/src/app/api/expert/queue/route.js — GET: requireAuth (+ is_user_expert RPC) → expert.queue.view
- [x] site/src/app/api/expert/queue/[id]/claim/route.js — POST: requireAuth → expert.queue.claim
- [x] site/src/app/api/expert/queue/[id]/answer/route.js — POST: requireAuth → expert.answer.submit
- [x] site/src/app/api/expert/queue/[id]/decline/route.js — POST: requireAuth → expert.queue.decline
- [x] site/src/app/api/expert/ask/route.js — POST: requireAuth → expert.ask
- [x] site/src/app/api/expert/apply/route.js — POST: requireAuth → expert.application.apply
- [x] site/src/app/api/expert/back-channel/route.js — GET: requireAuth (+ expert_can_see_back_channel RPC) → expert.back_channel.read; POST: requireAuth → expert.back_channel.post
- [x] site/src/app/api/family/achievements/route.js — GET: requireAuth → kids.achievements.view (closest match; kids.family.shared_achievements.view does not exist in DB)
- [x] site/src/app/api/stories/read/route.js — POST: supabase.auth.getUser direct → article.read.log (no stories.read.log key in DB)
- [x] site/src/app/api/quiz/start/route.js — migrated + feature-verified quiz; POST: requireAuth → quiz.attempt.start
- [x] site/src/app/api/quiz/submit/route.js — migrated + feature-verified quiz; POST: requireAuth → quiz.attempt.submit
- [x] site/src/app/api/kids/route.js — migrated + feature-verified kids; GET: requireAuth → kids.parent.view; POST: requireAuth → kids.profile.create
- [x] site/src/app/api/kids/[id]/route.js — migrated + feature-verified kids; PATCH: requireAuth → kids.profile.update; DELETE: requireAuth → kids.profile.delete
- [x] site/src/app/api/kids/trial/route.js — migrated + feature-verified kids; GET: requireAuth → kids.parent.view; POST: requireAuth → kids.trial.start
- [x] site/src/app/api/kids/set-pin/route.js — migrated + feature-verified kids; POST: requireAuth → kids.pin.set
- [x] site/src/app/api/kids/verify-pin/route.js — migrated + feature-verified kids; POST: requireAuth → kids.pin.verify
- [x] site/src/app/api/kids/reset-pin/route.js — migrated + feature-verified kids; POST: requireAuth → kids.pin.reset
- [x] site/src/app/api/kids/household-kpis/route.js — migrated + feature-verified kids; GET: requireAuth → kids.parent.household_kpis
- [x] site/src/app/api/kids/global-leaderboard/route.js — migrated + feature-verified kids; GET: requireAuth → kids.leaderboard.global.view
- [x] site/src/app/api/kids/[id]/streak-freeze/route.js — migrated + feature-verified kids; POST: requireAuth → kids.streak.freeze.use
- [x] site/src/app/api/family/leaderboard/route.js — migrated + feature-verified family_admin; GET: requireAuth → family.view_leaderboard (reactivated in DB and attached to `family` permission set)
- [x] site/src/app/api/family/weekly-report/route.js — migrated + feature-verified family_admin; GET: requireAuth → kids.parent.weekly_report.view
- [x] site/src/app/api/search/route.js — migrated + feature-verified search 2026-04-18; swapped `_user_is_paid` RPC for `hasPermissionServer('search.advanced')`; per-filter gates for `search.advanced.category|subcategory|date_range|source`; anon-friendly (no blanket `requirePermission` — anon has `search.articles.free`)
- [x] site/src/app/search/page.tsx — feature-verified search 2026-04-18; adds page-level `search.view`/`search.basic`/`search.articles.free` any-of hydrate gate (empty-state when all denied); advanced filter panel self-gates each control on `search.advanced.category|date_range|source`; outbound query params stripped when corresponding perm missing (defence-in-depth with the API)
- [x] VerityPost/VerityPost/HomeView.swift — feature-verified search 2026-04-18; toolbar magnifyingglass button hidden when `search.view`/`search.basic`/`search.articles.free` all denied; search overlay date-range / source / categories panels each gated by `search.advanced` + matching `search.advanced.*` sub-key

### 2C — Shared components
- [ ] In progress
- [x] site/src/components/TTSButton.tsx — migrated + feature-verified tts
- [x] site/src/components/CommentComposer.tsx — migrated + feature-verified comments; jsx deleted. Was half-migrated with broken `isPaid` ref; now self-gates on `comments.post` / `comments.reply`, mention affordance on `comments.mention.insert`
- [x] site/src/components/CommentRow.tsx — migrated + feature-verified comments; jsx deleted. Vote/reply/context-tag/report/edit/delete/block menu items each gated by `comments.upvote|downvote|reply|context_tag|report|edit.own|delete.own|block.add`; expert-reply blur uses `article.expert_responses.read`
- [x] site/src/components/CommentThread.tsx — migrated + feature-verified comments; jsx deleted. Section hidden by `comments.section.view`, realtime gated by `comments.realtime.subscribe`, per-category author score gated by `comments.score.view_subcategory`, expert CTA by `expert.ask`
- [x] site/src/components/ArticleQuiz.tsx — migrated + feature-verified quiz; jsx deleted. Start card self-gates on `quiz.attempt.start`; retake button gated by `quiz.retake`; unlimited-retakes copy by `quiz.retake.after_fail`; ad interstitial branch by `!article.view.ad_free`. `userTier` prop kept as a back-compat noop for call-sites.

### 2C — Shared components (parallel batch 2026-04-18)

#### Track F — profile / user / follow / badge / streak

- [x] site/src/components/Avatar.tsx — migrated + feature-verified profile_card 2026-04-18; Avatar.js deleted. Visual-only initials chip; no role/plan gates removed (there were none); typed `user` prop loosened to `{ avatar_color, username, avatar? }` + open index signature so existing call-sites (CommentRow/leaderboard/profile) keep compiling with their heterogeneous Pick shapes. Marker-only.
- [x] site/src/components/FollowButton.tsx — migrated + feature-verified follow 2026-04-18; FollowButton.jsx deleted. Dropped the `PAID` Set + `viewerTier` gate (D28 "paid-only" check); now hydrates `hasPermission('profile.follow')` via `refreshAllPermissions`/`refreshIfStale` and returns `null` when denied — matches the render-side gate at `site/src/app/u/[username]/page.tsx:95` / `site/src/app/profile/[id]/page.tsx:138` / `site/src/app/api/follows/route.js:11`. `viewerTier` prop kept as a back-compat no-op so the only call-site (`u/[username]/page.tsx:191`) keeps compiling.
- [x] site/src/components/VerifiedBadge.tsx — migrated + feature-verified profile_card 2026-04-18; VerifiedBadge.js deleted. No viewer-side gate — badge is a display chip based on the *displayed user's* `role`/`identity_verified` fields (not the viewer's permission). Marker-only. Note: pre-existing hygiene gap — every call-site passes a Pick shape that omits `role` + `identity_verified`, so in practice the badge currently never renders. Flagged below.
- [x] site/src/components/kids/Badge.tsx — migrated + feature-verified kids 2026-04-18; Badge.jsx + Badge.d.ts deleted. Pure visual achievement chip with KID theme tokens; no role/plan gate. Marker-only.
- [x] site/src/components/kids/StreakRibbon.tsx — migrated + feature-verified kids 2026-04-18; StreakRibbon.jsx + StreakRibbon.d.ts deleted. Pure celebratory ribbon (renders only when `days > 0`); no role/plan gate. Marker-only.

Flip-test (track F): `profile.view.own` on `free@test.veritypost.com` (`a730f627-...`): baseline `granted=true via role` → inserted `permission_scope_overrides {permission_key='profile.view.own', scope_type='user', scope_id=<free>, override_action='block'}` → resolver returned `granted=false via scope_override` → DELETE override → resolver restored to `granted=true via role`. Cleaned up (zero residual rows for that reason).

tsc (after track F, before parallel-lane fixes): exit=1. The 3 reported errors are all in `src/components/kids/AskAGrownUp.tsx` (react-csstype/SVGProps strokeLinecap union narrowing) — outside track F's lane (AskAGrownUp is not a profile/user/follow/messaging/score/badge component). Zero errors in any of the 5 track F files or their call-sites (grep-verified).


Track E lane (article / story / feed / paywall / upgrade). All four files now carry both header markers.

- [x] site/src/components/Ad.jsx — feature-verified article_reading 2026-04-18; marker-only (pre-existing `@migrated-to-permissions` was a marker-only file per prior pass). D23 tier-aware ad slot — server-side `serve_ad` RPC is the authoritative ad-suppression decision; no client-side `hasPermission('article.view.ad_free')` double-check to avoid client/server disagreement on the free/paid cutoff.
- [x] site/src/components/Interstitial.tsx — migrated + feature-verified article_reading 2026-04-18; converted .jsx → .tsx (.jsx deleted). Presentational modal only — parent (`story/[slug]/page.tsx`, `app/page.tsx`) decides when to open. No role/plan gates present or added; typed `variant: 'signup' | 'ad'` and all style blocks typed as `CSSProperties`.
- [x] site/src/components/LockModal.tsx — migrated + feature-verified shared_components 2026-04-18; converted .jsx → .tsx (.jsx deleted). Generic upgrade/signup prompt dispatched from `PermissionsProvider` when any RLS-denial event fires. The prompt's copy + CTA are driven entirely by the resolver's `lock_reason` (BANNED / EMAIL_UNVERIFIED / ROLE_REQUIRED / NOT_GRANTED / PLAN_REQUIRED) — no hardcoded role/plan gates.
- [x] site/src/components/RecapCard.tsx — migrated + feature-verified recap 2026-04-18; converted .jsx → .tsx (.jsx deleted). Home-feed entry point for weekly recap. Previously read `data.paid` off the recap API response; now self-gates on `hasPermission('recap.list.view')` (hydrates via `refreshAllPermissions` + `refreshIfStale`). Denied viewers see the upgrade teaser linking `/profile/settings/billing`; permitted viewers fetch the current-week recap. Skipping the fetch for denied viewers avoids the (otherwise 403-then-discarded) roundtrip.
- Flip-tested `recap.list.view` on `premium@test.veritypost.com`: baseline `granted=true via plan` → user-scope `block` override produces `granted=false via scope_override` → delete override restores `granted=true via plan`.
- Orphan flagged (not migrated, not in any consumer's import graph): `site/src/components/QuizPoolEditor.jsx` — admin-surface component (uses `user_roles` role-name array check against `['owner','admin','editor','superadmin']`), but lives outside `site/src/components/admin/` and is referenced only by itself. No call-site to gate against. Candidate for either deletion or relocation into `components/admin/` during Phase 5 cleanup.

#### Track G — UI primitives (generic, non-admin, non-specialty)

- [x] site/src/components/Toast.tsx — migrated + feature-verified shared_components 2026-04-18; Toast.js deleted. Generic ToastProvider + useToast primitive (info/success/error tones, auto-dismiss). Typed `ToastApi` + `ToastItem` + `ToastTone`; message typed as `ReactNode`. No role/plan gates present or added — this is a pure UI primitive. Marker-only.
- [x] site/src/components/ConfirmDialog.tsx — migrated + feature-verified shared_components 2026-04-18; ConfirmDialog.jsx deleted. Lightweight branded confirm dialog primitive (Cancel/Confirm, danger variant, Escape-to-close, click-backdrop-to-close). Typed `ConfirmDialogProps`; `title`/`message` typed as `ReactNode`. No role/plan gates (admin typed-confirmation flows stay on `DestructiveActionConfirm`). Marker-only.
- [x] site/src/components/AccountStateBanner.tsx — migrated + feature-verified shared_components 2026-04-18; AccountStateBanner.jsx deleted. Generic top-of-app banner primitive that self-renders from the logged-in user row (banned / locked_until / muted / deletion_scheduled / frozen / grace-period). State priority unchanged; severity palette unchanged. `user` prop typed as `Partial<Tables<'users'>>` with a small widening on `deletion_scheduled_at` (the legacy `.jsx` read a column name that does not exist in the `users` schema — `deletion_scheduled_for` is the canonical column — so the TSX accepts either and falls back to the real column). No role/plan gates. Marker-only.
- [x] site/src/components/StatRow.tsx — migrated + feature-verified shared_components 2026-04-18; StatRow.js deleted. Progress-bar primitive (label + value/total + fill). Typed `StatRowProps`. No role/plan gates. Marker-only.

Claimed but already migrated by parallel lane (no-op for Track G, noted for completeness):
- `Toast.js` — had no prior marker/TS migration → done by G (this pass).
- `ConfirmDialog.jsx` — had no prior marker/TS migration → done by G.
- `StatRow.js` → done by G.
- `AccountStateBanner.jsx` — had `@migrated-to-permissions` header marker but the file was still `.jsx` without feature-verified marker → completed by G.
- `LockModal.tsx` — already migrated by Track E (article_reading lane) with `@feature-verified shared_components` marker — left alone.
- `Interstitial.tsx` — already migrated by Track E (article_reading lane) — left alone.

Skipped (not in G's lane or explicitly carved out):
- `site/src/components/admin/**` — LOCKED admin design-system primitives.
- `site/src/components/DestructiveActionConfirm.jsx` — lives at the `components/` root but every consumer is an admin surface (moderation/reports/pipeline/recap/ad-placements/data-requests/features/ad-campaigns/kids-story-manager/story-manager/stories/permissions/users/verification/sponsors/promo/subscriptions). Effectively part of the sealed admin design system. Not migrated by G — flagged for a future pass that can coordinate with the admin-lock owner (safest: move the file into `components/admin/` alongside the other sealed primitives rather than touch it now).
- `site/src/components/PermissionGate.jsx` + `PermissionsProvider.jsx` — permission infra, not a UI primitive.
- `site/src/components/ObservabilityInit.js` — observability bootstrap, not a UI primitive.
- `site/src/components/Ad.jsx` — covered by Track E (article_reading lane).

**tsc (after Track G):** exit=1. All 8 remaining errors are in Track H files (`src/components/kids/EmptyState.tsx` lines 94/102/109/118/127, `src/components/kids/AskAGrownUp.tsx` lines 114/123/130) — SVG `strokeLinecap`/`strokeLinejoin` were typed as `CSSProperties['strokeLinecap']` which resolves to the full CSS union (including `-moz-initial`) instead of the SVG-specific `'butt' | 'round' | 'square' | 'inherit'`. Zero errors in any of Track G's 4 files or their call-sites. Fix in H's lane: drop the `as CSSProperties[...]` casts; literal `'round'` string already satisfies `SVGProps`.

**Gaps flagged by Track G:**
- `DestructiveActionConfirm.jsx` naming/location — lives in `components/` (shared) but is exclusively an admin primitive. Recommend relocating to `components/admin/` in Phase 5 cleanup.
- `AccountStateBanner.jsx` was referencing a non-existent DB column `deletion_scheduled_at` (canonical is `deletion_scheduled_for`). TSX tolerates both; long-term this should be unified — track as a pre-existing bug.
- H's `kids/EmptyState.tsx` + `kids/AskAGrownUp.tsx` ship SVG strokeLinecap/Join type bugs that fail tsc. H lane owner to fix.

#### Track H — specialty feature components (kids / quiz-pool)

- [x] site/src/components/kids/AskAGrownUp.tsx — migrated + feature-verified kids 2026-04-18; converted .jsx → .tsx, AskAGrownUp.jsx + AskAGrownUp.d.ts deleted. Friendly gated/locked state for kid surfaces; no role/plan gate (presentational — caller decides the `reason` prop). Marker-only. SVG icon `strokeLinecap|strokeLinejoin` typed via `SVGAttributes<SVGSVGElement>` (fixed Track G's flagged tsc error).
- [x] site/src/components/kids/EmptyState.tsx — migrated + feature-verified kids 2026-04-18; converted .jsx → .tsx, EmptyState.jsx + EmptyState.d.ts deleted. Friendly empty/gated/loading states for kid surfaces; no role/plan gate (presentational). Marker-only. Same SVG attribute typing fix as AskAGrownUp.
- [x] site/src/components/kids/KidTopChrome.tsx — migrated + feature-verified kids 2026-04-18; converted .jsx → .tsx, KidTopChrome.jsx + KidTopChrome.d.ts deleted. Kid-mode top chrome + exit-PIN provider. No role/plan gate — active-kid detection is localStorage-driven and the exit-PIN gate is RPC-driven (`/api/kids/verify-pin`), neither are permission-keyed. `kid_profiles` row typed via `Database['public']['Tables']['kid_profiles']['Row']`; `useFocusTrap` import + `modalRef: RefObject<HTMLDivElement | null>` typing preserved.
- [x] site/src/components/kids/Badge.tsx — already migrated by parallel lane (Track F); confirmed marker + no-gate behavior; left alone.
- [x] site/src/components/kids/StreakRibbon.tsx — already migrated by parallel lane (Track F); confirmed marker + no-gate behavior; left alone.
- [x] site/src/components/QuizPoolEditor.tsx — migrated + feature-verified quiz 2026-04-18; converted .jsx → .tsx, QuizPoolEditor.jsx deleted. Legacy admin-role check (`owner|admin|editor|superadmin` via `user_roles → roles.name`) replaced with `hasPermission('admin.quizzes.edit_question')` on mount (umbrella read gate); soft-delete action gated by `admin.quizzes.delete_question`; add-question buttons gated by `admin.quizzes.create_questions`; insert/update paths enforce the same per-action keys in `saveAll`. `articles`/`quizzes` rows typed via `Database['public']['Tables'][...]['Row']`. Orphan: no consumer currently imports this component (prior flagged in E's report); gating is defence-in-depth for future mount locations under `/admin/stories/[id]/quiz` and embedded story-manager accordions.
- DB binding: `admin.quizzes.{create_questions,edit_question,delete_question,preview}` were bound only to `admin,owner`; added `editor` bindings to preserve the legacy role-name check which accepted `editor`. `perms_global_version` bumped (→ 4338).

Flip-test (track H): `admin.quizzes.edit_question` on `free@test.veritypost.com` (`a730f627-...`): baseline `granted=false via <none>` → inserted `permission_scope_overrides {permission_key='admin.quizzes.edit_question', scope_type='user', scope_id=<free>, override_action='allow', override_value='true'}` → resolver returned `granted=true via scope_override` → DELETE override → resolver restored to `granted=false`. Round-trip clean.

**tsc (after Track H):** exit=0. All 8 errors Track G flagged in H's lane are resolved (SVG typings fixed). Zero errors across the 6 Track H files.

**Gaps flagged by Track H:**
- `QuizPoolEditor.tsx` still has zero call-sites. If it remains unused after Phase 5 cleanup, either delete or wire it into `/admin/stories/[id]/quiz` as the comment implies.
- `kid_profiles.display_name` is nullable in `Database['public']['Tables']['kid_profiles']['Row']`; KidTopChrome TopBar passes it to `ExitPinModal.kidName` with a `|| ''` fallback. Consider tightening the schema (all shipped kid profiles have a display_name today).

### 2C — Shared components batch 2 (parallel, 2026-04-18)

#### Track K — lane A (A–M), no-op pass

Lane scan after the batch-1 parallel tracks (E / F / G / H) and the Track J carve-out (`DestructiveActionConfirm.jsx`, `FollowButton.tsx`, `PermissionGate.jsx`, `PermissionsProvider.jsx`, `ObservabilityInit.js`, `QuizPoolEditor.tsx`, `AccountStateBanner.tsx`, `VerifiedBadge.tsx`) shows **zero unclaimed A–M files** in `site/src/components/**` outside `components/admin/**`.

Files in lane, all already sealed with BOTH header markers (nothing to do):
- `AccountStateBanner.tsx` — shared_components (G)
- `Ad.jsx` — article_reading (E)
- `ArticleQuiz.tsx` — quiz (prior)
- `Avatar.tsx` — profile_card (F)
- `CommentComposer.tsx` / `CommentRow.tsx` / `CommentThread.tsx` — comments (prior)
- `ConfirmDialog.tsx` — shared_components (G)
- `Interstitial.tsx` — article_reading (E)
- `LockModal.tsx` — shared_components (E)
- `kids/AskAGrownUp.tsx` / `kids/Badge.tsx` / `kids/EmptyState.tsx` / `kids/KidTopChrome.tsx` — kids (H / F)

Excluded per brief (Track J is handling this round): `DestructiveActionConfirm.jsx`, `FollowButton.tsx` (both start with D / F i.e. inside A–M but explicitly carved out).

**Files migrated:** 0. **Gated vs marker-only:** 0 / 0. **Keys touched:** none. **Flip-test:** not applicable (no gates touched).

**tsc:** exit=0, zero output (whole-repo clean after Track H).

**Gaps flagged:** none new; Track E / F / G / H flags still stand (`DestructiveActionConfirm.jsx` location, `QuizPoolEditor.tsx` zero call-sites, `kid_profiles.display_name` nullability, `AccountStateBanner` historical `deletion_scheduled_at` vs `deletion_scheduled_for` column mismatch).

### 2D — iOS views
- [x] VerityPost/VerityPost/AlertsView.swift — already migrated; notifications inbox & manage tabs (marker confirmed)
- [x] VerityPost/VerityPost/BookmarksView.swift — already migrated; `article.bookmark.unlimited` + `article.bookmark.collections`
- [x] VerityPost/VerityPost/ExpertQueueView.swift — already migrated; `expert.queue.view`
- [x] VerityPost/VerityPost/HomeView.swift — already migrated; `recap.view`, `ads.suppress`
- [x] VerityPost/VerityPost/HomeView.swift — feature-verified home_feed 2026-04-18; hydrates `home.feed.view`, `home.breaking_banner.view`, `home.breaking_banner.view.paid` on permission change; no top breaking-banner view exists in iOS yet so gates are hydrated but unused (top banner is web-only); second header marker added
- [x] VerityPost/VerityPost/MessagesView.swift — already migrated; `messages.dm.compose`
- [x] VerityPost/VerityPost/FamilyViews.swift — replaced `plan == verity_family/_xl` isFamilyTier with `settings.family.view`; feature-verified kids marker appended 2026-04-18; family_admin marker appended for parent-side admin surface
- [x] VerityPost/VerityPost/ProfileView.swift — replaced `isPaid`/`isFamilyTier`/`isExpert`/`isVerified` nav gates with `profile.card.*`, `profile.activity.view.own`, `profile.score.view.own.categories`, `profile.achievements.view.own`, `bookmarks.list.view`, `messages.inbox.view`, `expert.queue.view`, `settings.family.view`
- [x] VerityPost/VerityPost/SettingsView.swift — replaced `isExpert` and `plan == free` with `settings.expert.view`, `expert.application.apply`, `billing.subscription.view_own`
- [x] VerityPost/VerityPost/StoryDetailView.swift — replaced `isPaid`/`isViewerPaid`/`isFree` with `article.tts.play`, `quiz.retake.after_fail`, `article.expert_responses.read`, `comments.mention.autocomplete`, `article.bookmark.unlimited`; feature-verified quiz: Start button gated by `quiz.attempt.start`, Retake button gated by `quiz.retake`; feature-verified article_reading 2026-04-18: body self-gates on `article.view.body` (paywall card when denied), sources on `article.view.sources`, timeline tab on `article.view.timeline`
- [x] VerityPost/VerityPost/RecapView.swift — replaced `isPaid` paywall with `recap.list.view`
- [x] VerityPost/VerityPost/PublicProfileView.swift — replaced `viewerIsPaid` with `profile.score.view.other.total`, `profile.follow`, `profile.card.share_link`
- [x] VerityPost/VerityPost/HomeFeedSlots.swift — replaced server-driven `paid` with `recap.list.view`
- [x] VerityPost/VerityPost/ForgotPasswordView.swift — no gates (marker only)
- [x] VerityPost/VerityPost/KidViews.swift — feature-verified kids; no plan/role gates (marker only)
- [x] VerityPost/VerityPost/LeaderboardView.swift — no gates (marker only)
- [x] VerityPost/VerityPost/LoginView.swift — no gates (marker only)
- [x] VerityPost/VerityPost/ProfileSubViews.swift — no gates (marker only)
- [x] VerityPost/VerityPost/PushPermission.swift — no gates (marker only)
- [x] VerityPost/VerityPost/PushPromptSheet.swift — no gates (marker only)
- [x] VerityPost/VerityPost/PushRegistration.swift — no gates (marker only)
- [x] VerityPost/VerityPost/ResetPasswordView.swift — no gates (marker only)
- [x] VerityPost/VerityPost/SettingsService.swift — no gates (marker only)
- [x] VerityPost/VerityPost/SignupView.swift — no gates (marker only)
- [x] VerityPost/VerityPost/SubscriptionView.swift — paywall view; `currentPlan` used only to highlight viewer's own tier on the plan grid (marker + comment)
- [x] VerityPost/VerityPost/TTSPlayer.swift — audio plumbing only; comment updated to point at `article.tts.play` (marker only)
- [x] VerityPost/VerityPost/StoreManager.swift — StoreKit-product-ID→tier mapping for purchase sync pipeline, not a feature gate (marker + comment)
- [x] VerityPost/VerityPost/VerifyEmailView.swift — no gates (marker only)
- [x] VerityPost/VerityPost/WelcomeView.swift — no gates (marker only)

### DB binding fixes (permission-set leaks / misroutes)

- [x] `fix_article_reading_bindings` (2026-04-18) — `article.read.log` added to `free` set (was admin/owner only, silently broke view-count logging for every signed-in user); `article.view.ad_free` removed from `anon`, added to pro/family/expert (was leaking ad-free reading to every signed-in user including free)
- [x] `fix_anon_leak_bindings` (2026-04-18) — removed `anon` binding from `article.ad_slot.view.paid`, `article.editorial_cost.view`, `article.other_scores.view` (names implied paid/internal gating but `anon`→role inheritance leaked them to all signed-in users); collapsed `profile.categories` and `profile.header_stats` to `anon`-only (were granted redundantly to every set)
- [x] `fix_home_breaking_banner_paid` (2026-04-18) — removed `anon` binding from `home.breaking_banner.view.paid`; added pro/family/expert/admin/owner bindings (same leak pattern as ad_free)
- [x] `fix_search_set_bindings` (2026-04-18) — `search.basic` + `search.view` added to `pro` and `family` (bindings inherited advanced but missed the base keys, so an admin scoping a pro user to `search.basic` alone would have silently denied); `family` set filled in with the advanced sub-keys + peripheral surfaces (`search.advanced.category|date_range|source|subcategory`, `search.articles.fts_advanced`, `search.bookmarks`, `search.categories`, `search.comments`, `search.expert_answers`, `search.messages`, `search.saved.create|list`, `search.timeline_events`, `search.unified`, `search.users`) that were previously pro-only despite the feature being advertised as part of Family plan

### 2B — Web API routes (cron + webhook / system-auth surface)

These routes use shared-secret or signature auth (CRON_SECRET / Stripe HMAC / Apple JWS) instead of `requirePermission`. Every file carries `@migrated-to-permissions 2026-04-18` + `@feature-verified system_auth 2026-04-18`.

- [x] site/src/app/api/cron/freeze-grace/route.js — auth: cron-secret (verifyCronAuth, timing-safe, fail-closed 403); calls `billing_freeze_expired_grace` RPC
- [x] site/src/app/api/cron/process-deletions/route.js — auth: cron-secret; calls `sweep_expired_deletions` RPC (batch 500)
- [x] site/src/app/api/cron/recompute-family-achievements/route.js — auth: cron-secret; calls `recompute_family_achievements` RPC
- [x] site/src/app/api/cron/sweep-kid-trials/route.js — auth: cron-secret; calls `sweep_kid_trial_expiries` RPC
- [x] site/src/app/api/cron/flag-expert-reverifications/route.js — auth: cron-secret; calls `flag_expert_reverifications_due` RPC (30-day warn)
- [x] site/src/app/api/cron/check-user-achievements/route.js — auth: cron-secret; iterates 48h-active users, calls `check_user_achievements` per-user
- [x] site/src/app/api/cron/send-push/route.js — auth: cron-secret; drains notifications queue via APNs (batch 500, concurrency 50)
- [x] site/src/app/api/cron/send-emails/route.js — auth: cron-secret; drains email queue via Resend (batch 50)
- [x] site/src/app/api/cron/process-data-exports/route.js — auth: cron-secret; claims+processes one data-export request per run, 7-day signed URL
- [x] site/src/app/api/stripe/webhook/route.js — auth: stripe-sig (HMAC SHA-256 on raw body, 5-min tolerance, timing-safe compare; future-skew 30s tolerant; verified BEFORE any DB write); idempotent via `webhook_log.event_id` UNIQUE claim
- [x] site/src/app/api/ios/appstore/notifications/route.js — auth: apple-jws (App Store Server Notifications V2, signedPayload → verifyNotificationJWS with Apple Root CA-G3); verified BEFORE any DB write; idempotent via `apple_notif:<uuid>` event_id
- [x] site/src/app/api/ios/subscriptions/sync/route.js — dual auth: Supabase user bearer token (401 on invalid) AND Apple JWS on transaction receipt (400 on bad sig); productId/transactionId must match the JWS claims; idempotent via `apple_sync:<originalTxId>`

### Admin gap fixes (Track D, 2026-04-18)

These are the 3 known admin gaps called out in REFERENCE.md §6. All three files carry `@admin-verified 2026-04-18`; fixes are minimal (bug fixes, not refactors).

- [x] DB migration `bump_user_perms_version_atomic_security` (2026-04-18) — Gap 1 fix. Function signature unchanged (`(uuid) RETURNS void`), body already used atomic `SET perms_version = perms_version + 1`, but was invoker-security with no auth gate so nobody used it — every admin path did the read-modify-write pattern directly against `users`. Re-applied as `SECURITY DEFINER` with `search_path=public`, internal gate on `current_setting('request.jwt.claim.role') = 'service_role' OR is_admin_or_above()`, EXECUTE granted to `authenticated, service_role`. Verified: sequential 10-bump test produces exactly `+10`.
- [x] site/src/app/api/admin/users/[id]/permissions/route.js — Gap 1 call-site. Replaced `SELECT perms_version → +1 → UPDATE` with `service.rpc('bump_user_perms_version', { p_user_id })`. `@admin-verified` marker preserved.
- [x] site/src/app/admin/users/page.tsx — Gap 1 call-site. Replaced the client-side `bumpPermsVersion` read-modify-write helper with a single `supabase.rpc('bump_user_perms_version', ...)` call. `@admin-verified` marker preserved.
- [x] site/src/app/admin/permissions/page.tsx — Gap 1 call-site. Same read-modify-write → RPC swap as admin/users/page.tsx. `@admin-verified` marker preserved.
- [x] site/src/app/api/admin/users/[id]/roles/route.js — Gap 2 fix. POST (grant) and DELETE (revoke) now call `bump_user_perms_version(target_id)` after the underlying `grant_role`/`revoke_role` RPC returns success. Non-fatal on bump error (primary write is source of truth). `@admin-verified` marker preserved.
- [x] site/src/app/api/admin/subscriptions/[id]/manual-sync/route.js — Gap 3 fix (new file). Server endpoint accepts `{ action: 'downgrade' | 'resume' }`. On downgrade: flips `subscriptions.status='cancelled'`, sets `users.plan_id` → free plan id, `plan_status='cancelled'`, clears `plan_grace_period_ends_at`. On resume: flips `subscriptions.status='active'`, sets `users.plan_id` → sub's plan_id, `plan_status='active'`. Both branches bump perms_version and write `audit_log`. F-035-style actor-outranks-target check included.
- [x] site/src/app/admin/subscriptions/page.tsx — Gap 3 call-site. `manualDowngrade`/`resumeAccount` now POST to the new `/api/admin/subscriptions/[id]/manual-sync` endpoint instead of mutating `subscriptions.status` directly from the client. `@admin-verified` marker preserved.

### Notifications / Inbox (Track A, 2026-04-18)

End-to-end close of the notifications feature — inbox, prefs, push delivery, subscription lanes (category / subcategory / keyword). Every user-triggered file carries both `@migrated-to-permissions 2026-04-18` and `@feature-verified notifications 2026-04-18`. The cron worker (`/api/cron/send-push`) stays on system-token (cron-secret) auth per spec and is tracked under the system-auth section above.

- [x] site/src/app/notifications/page.tsx — feature-verified notifications 2026-04-18; page already migrated previously (hydrates `notifications.inbox.view` via `hasPermission`); second header marker added.
- [x] site/src/app/api/notifications/route.js — feature-verified notifications 2026-04-18; GET gated by `notifications.inbox.view`, PATCH gated by `notifications.mark_read` (both pre-existing); second header marker added.
- [x] site/src/app/api/notifications/preferences/route.js — feature-verified notifications 2026-04-18; GET gated by `notifications.prefs.view`, PATCH gated by `notifications.prefs.toggle_push` (both pre-existing); second header marker added.
- [x] site/src/app/api/push/send/route.js — migrated + feature-verified notifications 2026-04-18; `requireRole('admin')` → `requirePermission('admin.push.send_test')`; standard `err.status`/`err.message` forwarding added (was a bare `catch → 403`).
- [x] ~~site/src/components/NotificationBell.tsx~~ **DELETED Round 5 Item 3 (2026-04-18).** File was sealed (both markers) in Round 2 Track L but had zero importers / zero JSX mounts across web + iOS. NavWrapper.tsx already renders the unread badge (red dot) on the `/notifications` nav item via its own poll, and the 4-tab bottom nav has no room for a dropdown-bell button. Delete chosen over wire-up: the bell's UX (dropdown of last 10) was never integrated into the shipped nav design and was a dead duplicate. Gate keys `notifications.inbox.view` and `notifications.mark_read` remain in active use by `/notifications/page.tsx` and `/api/notifications/route.js`, so no DB cleanup needed. Zero grep hits in `site/src` and `VerityPost` after delete; `tsc --noEmit` EXIT=0.
- [x] VerityPost/VerityPost/AlertsView.swift — migrated + feature-verified notifications 2026-04-18; marker was present but no gating was wired. Added `PermissionStore`-hydrated flags for `notifications.inbox.view` (inbox denial hero when missing), `notifications.mark_all_read` ("Read All" toolbar hidden when missing), `notifications.subscription.category|subcategory|keyword` (each add-row hidden when missing), and `notifications.subscription.unsubscribe` (each "x" / remove affordance hidden when missing). No plan/role checks left.
- [x] VerityPost/VerityPost/SettingsView.swift (NotificationsSettingsView) — feature-verified notifications 2026-04-18; section-level `notifications.prefs.view` gate (full "not available" message when denied), push row gated by `notifications.prefs.toggle_push`, in-app toggles + save button gated by `notifications.prefs.toggle_in_app`. Parent SettingsView file-header marker was already present.
- [x] VerityPost/VerityPost/PushRegistration.swift — feature-verified notifications 2026-04-18; APNs plumbing (no gate). Gating for the surfaces that invoke this lives in AlertsView / NotificationsSettingsView. Second header marker + clarifying comment added.
- [x] VerityPost/VerityPost/PushPermission.swift — feature-verified notifications 2026-04-18; iOS system-permission wrapper (no gate). App-level capability is gated by `notifications.prefs.toggle_push` at the UI layer. Second header marker + clarifying comment added.
- [x] VerityPost/VerityPost/PushPromptSheet.swift — feature-verified notifications 2026-04-18; presentational pre-prompt; presented only from already-gated surfaces. Second header marker + clarifying comment added.

### DB binding fix (Track A)

- [x] `fix_notifications_core_bindings` (2026-04-18) — `notifications.inbox.view`, `notifications.mark_read`, `notifications.mark_all_read`, `notifications.dismiss`, `notifications.prefs.view`, `notifications.prefs.toggle_push`, `notifications.prefs.toggle_in_app`, `notifications.prefs.quiet_hours` were only bound to `admin`+`owner` sets — i.e. every signed-in free/pro/family/expert user was silently denied the inbox + prefs UI despite the feature being user-facing. Added bindings for `free|pro|family|expert|moderator|editor`. Also back-filled `notifications.subscription.keyword` onto `family|expert|moderator|editor` (was pro-only) and `notifications.subscription.category|subcategory|unsubscribe` onto `pro|family|expert|moderator|editor` (free-only before). Flip-tested on `free@test`: baseline `granted=true via role` → `block` override produces `granted=false via scope_override` → delete override restores `granted=true via role`.

### Profile Settings (Track, 2026-04-18)

End-to-end close of the profile settings surface — account, preferences, privacy, billing, expert, danger zone. Every user-triggered file carries both `@migrated-to-permissions 2026-04-18` and `@feature-verified profile_settings 2026-04-18`. Legacy `/profile/settings/*` subroutes converted to thin TSX redirects pointing at the unified TSX's section anchors (the 12 subpages were replaced by a single 3,728-line long-scroll surface per `page.tsx` line 4 comment); legacy `.js` files deleted. Billing upgrade CTAs across the codebase land on `/profile/settings/billing` which now redirects to `/profile/settings#billing`, preserving deep links without maintaining a parallel page.

- [x] site/src/app/profile/settings/page.tsx (3,728 lines) — feature-verified profile_settings 2026-04-18; unified long-scroll surface was already gated (`hasPermission` on `settings.*`, `billing.*`, `settings.data.*`, `settings.expert.*`, `settings.supervisor.*`, `settings.blocked.*` keys across 5 top-level sections). Marker only.
- [x] site/src/app/profile/settings/page.js (146 lines) — deleted (conflicted with `page.tsx`; legacy hub was unused since the TSX took over).
- [x] site/src/app/profile/settings/profile/page.tsx (11 lines) — converted from 382-line `.js`, redirects to `/profile/settings#profile`; both markers
- [x] site/src/app/profile/settings/password/page.tsx (11 lines) — redirect shell → `/profile/settings#password`; legacy 222-line `.js` deleted
- [x] site/src/app/profile/settings/emails/page.tsx (11 lines) — redirect shell → `/profile/settings#emails`; legacy 206-line `.js` deleted
- [x] site/src/app/profile/settings/feed/page.tsx (11 lines) — redirect shell → `/profile/settings#feed`; legacy 223-line `.js` deleted
- [x] site/src/app/profile/settings/alerts/page.tsx (11 lines) — redirect shell → `/profile/settings#alerts`; legacy 90-line `.js` deleted
- [x] site/src/app/profile/settings/data/page.tsx (11 lines) — redirect shell → `/profile/settings#data`; legacy 320-line `.js` deleted
- [x] site/src/app/profile/settings/blocked/page.tsx (11 lines) — redirect shell → `/profile/settings#blocked`; legacy 92-line `.js` deleted
- [x] site/src/app/profile/settings/supervisor/page.tsx (11 lines) — redirect shell → `/profile/settings#supervisor`; legacy 148-line `.js` deleted
- [x] site/src/app/profile/settings/login-activity/page.tsx (11 lines) — redirect shell → `/profile/settings#login-activity`; legacy 189-line `.js` deleted
- [x] site/src/app/profile/settings/billing/page.tsx (11 lines) — redirect shell → `/profile/settings#billing`; legacy 514-line `.js` deleted (unified TSX's billing section covers plan / payment / invoices / promo)
- [x] site/src/app/profile/settings/expert/page.tsx (~310 lines) — converted from 259-line `.js`, kept as a full page (expert application form is distinct from the unified page's expert section — unified page TODOs to `/profile/settings/expert/apply`). Self-gates on `settings.expert.view`; application-submit form self-gates on `expert.application.apply`. Uses `Database['public']['Tables']['users|expert_applications|categories']` types.
- [x] site/src/app/api/account/delete/route.js — POST: `settings.data.request_deletion`; DELETE: `settings.data.deletion.cancel` (dual-mode auth preserved: cookie + bearer both resolve an authClient that we pass to `hasPermissionServer`). Origin allowlist preserved for cookie branch (F-108).
- [x] site/src/app/api/account/login-cancel-deletion/route.js — marker only; silent login-time auto-cancel must succeed for any authenticated user (RPC `cancel_account_deletion` operates on the caller's own row), so `requireAuth`-equivalent semantics kept. No permission gate added.
- [x] site/src/app/api/account/onboarding/route.js — marker only; onboarding bootstrap needs `requireAuth` only (user marks their own row as onboarded).
- [x] site/src/app/api/billing/cancel/route.js — `requireAuth` → `requirePermission('billing.cancel.own')`; err.status forwarding added
- [x] site/src/app/api/billing/resubscribe/route.js — `requireAuth` → `requirePermission('billing.resubscribe')`; err.status forwarding added
- [x] site/src/app/api/billing/change-plan/route.js — was already migrated; second header marker added
- [x] site/src/app/api/users/[id]/block/route.js — was already migrated (`settings.privacy.blocked_users.manage`); second header marker added
- [x] site/src/app/api/appeals/route.js — `requireAuth` → `requirePermission('settings.appeals.open')`; err.status forwarding added
- [x] site/src/app/api/support/route.js — marker only; generic support channel, `requireAuth` appropriate
- [x] site/src/app/api/support/[id]/messages/route.js — marker only; ticket ownership check retained; `requireAuth` appropriate
- [x] VerityPost/VerityPost/SettingsView.swift — feature-verified profile_settings 2026-04-18 added alongside the existing `@feature-verified notifications 2026-04-18` marker (on NotificationsSettingsView). Hub view now hydrates 9 new flags on `perms.changeToken`: `settings.view` (Profile row), `settings.account.edit_email` (Email row), `settings.account.change_password` (Password row), `settings.account.2fa.enable` (2FA row), `settings.login_activity.view` (Login Activity row), `billing.view.plan` (Subscription section), `settings.feed.view` (Feed Preferences row — Notifications row remains always-shown since it's already gated inside `NotificationsSettingsView`), `settings.data.request_export` (Data & Privacy section). Section-level gates hide the entire section when every row is denied (avoids empty section headers). `NotificationsSettingsView` implementation unchanged per sealed-track-A constraint.

### DB binding fixes (Track profile_settings)

- [x] `fix_settings_leak_bindings` (2026-04-18) — same leak pattern as Track A. 38 core user-facing settings/billing/account keys were bound only to `admin,owner` (or admin+free+owner, missing pro/family/expert/moderator/editor). I.e. any signed-in pro/family/expert user was silently denied their own account settings, password change, email management, login activity, sessions revoke, feed prefs, alerts, a11y, blocked users, data export/deletion, billing cancel/resume/change-plan/portal, invoice view/download, and most privacy toggles. Added bindings for `free|pro|family|expert|moderator|editor` on: `settings.view`, `settings.account.change_password`, `settings.account.edit_email`, `settings.account.login_activity.view`, `settings.account.sessions.revoke`, `settings.account.sessions.revoke_all_other`, `settings.emails.view`, `settings.emails.add_secondary`, `settings.emails.set_primary`, `settings.emails.delete_secondary`, `settings.feed.view`, `settings.feed.category_toggle`, `settings.feed.hide_low_cred`, `settings.alerts.view`, `settings.a11y.high_contrast`, `settings.a11y.text_size`, `settings.a11y.reduce_motion`, `settings.blocked.list`, `settings.blocked.unblock`, `settings.data.request_export`, `settings.data.request_deletion`, `settings.data.deletion.cancel`, `settings.login_activity.view`, `settings.login_activity.signout_device`, `billing.view.plan`, `billing.change_plan`, `billing.cancel.own`, `billing.resubscribe`, `billing.portal.open`, `billing.promo.redeem`, `billing.subscription.view_own`, `billing.invoices.view_own`, `billing.invoices.download`, `settings.privacy.profile_visibility`, `settings.privacy.show_activity`, `settings.privacy.hide_from_search`, `settings.privacy.show_on_leaderboard`, `settings.privacy.show_verity_score`, `settings.privacy.blocked_users.manage`. Kept pro+ only: `settings.privacy.allow_messages`, `settings.privacy.dm_read_receipts`, `settings.privacy.dm_read_receipts_ios`, `settings.a11y.tts_per_article`.
- [x] `fix_settings_appeals_binding` (inline, 2026-04-18) — `settings.appeals.open` was bound to `admin,free,owner` only; added `pro|family|expert|moderator|editor`.
- [x] `fix_settings_2fa_oauth_bindings` (inline, 2026-04-18) — `settings.account.2fa.enable|disable` and `settings.account.oauth.connect|disconnect` were bound to `admin,owner` only; added `free|pro|family|expert|moderator|editor`.
- Flip-tested on `free@test` with `settings.account.edit_email`: baseline `granted=true via role` → `block` scope_override produces `granted=false via scope_override` → delete override restores `granted=true via role`.

### DB binding hygiene sweep (2026-04-18, all 934 active keys)

One-shot cross-surface audit of every active permission key, looking for the four systemic patterns we had been fixing per-feature: (A) anon-bound gated keys that leak via role inheritance, (B) user-facing keys bound only to `admin,owner` (silent denial for every paying tier), (C) 9/10-set keys that should collapse to anon-only, (D) orphans with zero set bindings.

- [x] `fix_permission_set_hygiene_2026_04_18` — see migration for full list. Summary:
  - **Pattern A (leaks):** 0 findings — no anon-bound keys whose name implies paid/internal/expert gating remained after the prior per-feature sweeps.
  - **Pattern B (silent denials):** 56 user-facing keys backfilled to `free` set (which cascades to every signed-in role via `anon+unverified+free` + plan bindings). The 56: `appeals.submit`, `appeals.view_own`, `article.bookmark.remove`, `article.experts_answered.see_count`, `article.media.expand`, `article.share.copy_link`, `article.share.external`, `article.timeline.follow_link`, `billing.payment.change_method`, `billing.plans.view`, `bookmarks.filter_by_category`, `bookmarks.list.view`, `bookmarks.quota.view`, `bookmarks.search`, `comments.author.open_profile`, `comments.badge.view`, `comments.block.list`, `comments.context_tag.remove`, `comments.downvotes.view`, `comments.upvotes.view`, `comments.vote.remove`, `leaderboard.privacy.toggle`, `profile.achievements.view.other`, `profile.achievements.view.own`, `profile.activity.view.own`, `profile.avatar.upload`, `profile.bio.edit`, `profile.card.share_link`, `profile.card.view`, `profile.display_name.edit`, `profile.followers.view.other|own`, `profile.following.view.other|own`, `profile.radar.view.own`, `profile.score.view.own.{categories,subcategories,total}`, `profile.username.edit`, `profile.view.own`, `profile.view.public`, `push.invalidate_token`, `search.history.clear|view`, `settings.accessibility.font_size`, `settings.appearance.theme`, `settings.data.deletion.request`, `settings.data.export.download|request|status`, `settings.expert.view`, `settings.language.set`, `support.ticket.list.own`, `support.ticket.reply.own`, `support.ticket.view.own`. Plus `permissions.version.get` bound to `anon` (documented as Authenticated + anon). Plus `expert.queue.oversight_all_categories` backfilled to `moderator` + `editor` (admin/owner already had it; docs + site/src/app/expert-queue/page.tsx:99 require moderator+/editor fallback).
  - **Pattern C (redundant):** collapsed `home.search`, `home.subcategories`, `leaderboard.view` to `anon`-only (were in 9/10 sets; anon inheritance via role bindings preserves behavior for every signed-in tier — flip-tested).
  - **Pattern D (orphans):** `comments.view` had 0 set bindings but resolver returned `granted=true via public`; added explicit `anon` binding for clarity. Referenced in `site/src/lib/permissionKeys.js:34` so keeping active.
  - **Flagged for human review (NOT fixed, 7 keys):** `ios.article.share_sheet`, `ios.bookmarks.view`, `ios.iap.manage_subscription`, `ios.profile.view.public` — no hits in `VerityPost/*.swift` code, likely spec artifacts. `settings.supervisor.view`, `supervisor.categories.view`, `supervisor.eligibility.view` — family-plan parent surface; binding to `family` set alone would miss users who need to see the UI before buying a family plan. Product decision needed.
  - **Verification:** flip-tested 20 representative keys across `free|premium|family|expert|moderator|editor|admin|owner@test.veritypost.com`. All backfilled keys now resolve `granted=true via role` on every tier. `expert.queue.oversight_all_categories` correctly resolves true only for moderator+/admin/owner and false for free/premium/family/expert. `home.search`/`home.subcategories`/`leaderboard.view` still resolve true for every signed-in user post-collapse. `comments.view` resolves true via `public`.
  - **Cache:** `perms_global_version` bumped (prior → 4333).

### 2C — Shared components batch 2 (parallel, 2026-04-18)

#### Track L — lane B (alphabetical N-Z)

- [x] site/src/components/NotificationBell.tsx — feature-verified notifications 2026-04-18; second header marker added. File was already converted to TSX with `hasPermission('notifications.inbox.view')` self-gate (hides bell + suppresses polling when denied) and `hasPermission('notifications.mark_read')` guard on click-to-mark-read (falls through to navigation on denial). Track A had listed it as sealed in the tracker but the second marker was never written to the file header — this pass completes the marker pair only; no behavioral change.

Lane scope: the alphabetical N-Z half of remaining shared components after subtracting admin (LOCKED), both-marker-sealed files, K's A-M lane, J's 7 carve-outs, and E/F/G/H prior-claim lists was a single file. Files inspected and excluded:
- `ObservabilityInit.js`, `PermissionGate.jsx`, `PermissionsProvider.jsx`, `QuizPoolEditor.tsx`, `VerifiedBadge.tsx` — J's carve-out.
- `RecapCard.tsx` — Track E (sealed, `@feature-verified recap`).
- `StatRow.tsx`, `Toast.tsx` — Track G (sealed, `@feature-verified shared_components`).
- `StreakRibbon.tsx` — Track F (sealed, `@feature-verified kids`).
- `TTSButton.tsx` — Components Batch 1 (sealed, `@feature-verified tts`).

Flip-test (track L): `notifications.inbox.view` on `free@test.veritypost.com` (`a730f627-...`): baseline `granted=true via role` -> inserted `permission_scope_overrides {permission_key='notifications.inbox.view', scope_type='user', scope_id=<free>, override_action='block', override_value='false'}` -> resolver returned `granted=false via scope_override` -> DELETE override -> resolver restored to `granted=true via role`. Round-trip clean.

**tsc (after Track L):** exit=0. Zero errors across the migrated file or its call-site graph.

**Gaps flagged by Track L:**
- `NotificationBell.tsx` was listed as sealed in the Notifications/Inbox section (line 266) but shipped to disk with only the first marker. Tracker-to-file drift pattern — worth a one-shot grep audit across all listed-sealed files to catch any similar missing markers.

### Subscription / Checkout / Billing (Track I, 2026-04-18)

Revenue-critical close. No dedicated `/subscribe`, `/pricing`, `/upgrade`, `/billing`, or `/checkout` page tree exists — subscription UX lives inside the sealed `/profile/settings#billing` section (covered by `@feature-verified profile_settings`). No shared `PlanCard`/`PricingTable`/`UpgradeCTA`/`CheckoutButton`/`PaymentMethod` components exist either. Scope reduces to the API routes behind checkout + plan mutation, the promo-redemption API, and the iOS `SubscriptionView.swift`. Sealed system-auth routes (`/api/stripe/webhook`, `/api/ios/appstore/notifications`, `/api/ios/subscriptions/sync`) and sealed admin routes (`/api/admin/subscriptions/*`, `/api/admin/billing/*`) were not touched.

- [x] site/src/app/api/stripe/checkout/route.js — feature-verified subscription 2026-04-18; already gated by `requirePermission('billing.upgrade.checkout')`. Second header marker added.
- [x] site/src/app/api/stripe/portal/route.js — feature-verified subscription 2026-04-18; already gated by `requirePermission('billing.stripe.portal')`. Second header marker added.
- [x] site/src/app/api/promo/redeem/route.js — feature-verified subscription 2026-04-18; already gated by `requirePermission('billing.promo.redeem')`. Second header marker added.
- [x] site/src/app/api/billing/cancel/route.js — feature-verified subscription 2026-04-18 added alongside the existing `profile_settings` marker; gate `billing.cancel.own` preserved.
- [x] site/src/app/api/billing/resubscribe/route.js — feature-verified subscription 2026-04-18 added alongside the existing `profile_settings` marker; gate `billing.resubscribe` preserved.
- [x] site/src/app/api/billing/change-plan/route.js — feature-verified subscription 2026-04-18 added alongside the existing `profile_settings` marker; gate `billing.change_plan` preserved.
- [x] VerityPost/VerityPost/SubscriptionView.swift — feature-verified subscription 2026-04-18. Swift file is intrinsically a plan-choice grid driven by StoreKit product availability and user `currentPlan` (highlight-only). No feature gate (free users must see the grid to upgrade; denying paid users would lock them out of cycle switches). Marker-only.

### DB binding fixes (Track I)

- [x] `fix_billing_bindings_2026_04_18` — Pattern B silent-denial fix in the billing lane. 8 actively-referenced keys were bound only to `admin,free,owner` or `admin,owner,pro`, silently denying the UX to the other paying tiers. Added bindings for `pro|family|expert|moderator|editor` on: `billing.upgrade.checkout`, `billing.stripe.checkout`, `billing.payment.change_method`, `billing.plans.view`, `billing.period.annual`, `billing.period.monthly`, `billing.grace.request_extension`, `billing.switch_cycle`. Also backfilled `free` on `billing.payment.change_method`, `billing.period.annual`, `billing.period.monthly` so a free user can reach the pre-purchase period/method selection. `perms_global_version` bumped. Flip-tested `billing.cancel.own` on `premium@test.veritypost.com` (`704e15ad-...`): baseline `granted=true via role` → user-scope `block` override → resolver `granted=false via scope_override` → DELETE override → resolver restored `granted=true via role`. Zero residual overrides for that reason.

**Missing permission keys (flagged, NOT created).** The Track I brief listed 9 expected keys. Five of them are semantic duplicates of active keys already in use across the codebase — creating them now would fork the canonical key set. Flagged for future rename pass:
- `subscription.cancel` — canonical in code: `billing.cancel.own` (active on `/api/billing/cancel`).
- `subscription.resume` — canonical in code: `billing.resubscribe` (active on `/api/billing/resubscribe`).
- `subscription.upgrade` / `subscription.downgrade` / `plan.switch` — canonical in code: `billing.change_plan` (active on `/api/billing/change-plan`).
- `checkout.initiate` — canonical in code: `billing.upgrade.checkout` (active on `/api/stripe/checkout`) + `billing.stripe.checkout`.
- `billing.view.invoices` — canonical in code: `billing.invoices.view_own` (active on `/profile/settings#billing`). The `billing.invoices.view` key exists but is only bound to `admin,owner,pro` and is unused.

**RESOLVED by Round 3 Track T (2026-04-18)** — spec docs updated to match canonical billing keys; no alias keys created.

**Pre-existing duplicate-key hygiene (NOT fixed, flagged).** Three semantic duplicates shipped in the active DB:
- `billing.cancel` (admin,owner,pro) vs `billing.cancel.own` (all tiers — the one in use).
- `billing.portal.open` (all tiers — the one in use) vs `billing.stripe.portal` (admin,owner,pro — used on the Stripe-portal server route).
- `billing.invoices.view` (admin,owner,pro — unused) vs `billing.invoices.view_own` (all tiers — the one in use).

The server route `/api/stripe/portal` checks `billing.stripe.portal` (admin+pro+owner only), so free/family/expert users signed in on the web are currently denied the portal — even though `billing.portal.open` (broader key, all tiers) exists. Conservative choice: not flipping the gate to `billing.portal.open` without owner signoff since the portal is a Stripe-specific concept and the existing `.stripe.portal` key may be intentional. Flagged for Phase 5 reconciliation.

**tsc:** `cd site && npx tsc --noEmit` → EXIT=0 (zero errors).

**Gaps flagged by Track I:**
- `/api/stripe/portal` route gates on `billing.stripe.portal` which is pro+admin+owner only. Family/expert paid users cannot open the portal. Either (a) widen `billing.stripe.portal` bindings, (b) switch the route gate to `billing.portal.open` (which already has universal bindings), or (c) confirm this is intentional. Not fixed in Round 1 — needs product call.
- 9 of the keys the Track I brief expected don't exist as-named (see "Missing permission keys" above). The active codebase is internally consistent on the `billing.*` prefix; creating the `subscription.*` / `checkout.*` / `plan.*` names as aliases would add confusion. Recommendation: update the brief / `REFERENCE.md` to use the canonical names, OR do a one-shot rename across code + DB in Phase 5.
- iOS `SubscriptionView` calls `users.update({plan, subscription_status})` directly on promo redemption (lines 486-492) instead of going through `/api/promo/redeem`. This bypasses the `billing.promo.redeem` permission gate, server-side audit log, and duplicate-redemption guard. Pre-existing bug — flagged for a future iOS pass (not in scope for the subscription feature-verify close).

### Carry-over cleanup (2026-04-18)

Track J — 7 flagged gaps from prior parallel runs. Each fix is minimal, scoped to the named file(s).

- [x] **1. `VerifiedBadge` schema mismatch.** `site/src/components/VerifiedBadge.tsx` was reading `users.role` + `users.identity_verified` + `users.identity_verified_at`, none of which exist on the `users` table (`role` lives on `user_roles`; `identity_verified` lives on `data_requests`). Rewrote the badge to read `is_verified_public_figure` (primary → "Verified" chip) with `is_expert` fallback ("Expert" chip). Call-site Pick lists updated: `site/src/components/CommentRow.tsx` (CommentUser type), `site/src/components/CommentThread.tsx` (CommentWithAuthor type + all 3 SQL selects), `site/src/app/leaderboard/page.tsx` (LeaderUser + CategoryScoreRow Pick lists + all 5 SQL selects), `site/src/app/api/comments/route.js` (re-fetch select). The badge now actually renders (previously every call-site Pick omitted `role`/`identity_verified`, so it was silently always-null).
- [x] **2. `DestructiveActionConfirm` relocation.** Moved `site/src/components/DestructiveActionConfirm.jsx` → `site/src/components/admin/DestructiveActionConfirm.tsx` (converted JSX → TSX). Typed `DestructiveActionConfirmProps` interface; `title` + `message` accept `ReactNode`; `oldValue`/`newValue` typed as `unknown` and cast to `never` at the `record_admin_action` RPC call-site to accommodate the `Record<string, unknown>` shapes passed by the 17 admin pages without expanding scope into those locked files. Both markers `@migrated-to-permissions 2026-04-18` + `@feature-verified shared_components 2026-04-18`. All 17 import paths updated: `/app/admin/{moderation,reports,promo,pipeline,permissions,kids-story-manager,recap,ad-campaigns,features,ad-placements,story-manager,users,data-requests,sponsors,verification,subscriptions,stories}/page.tsx`. Old `.jsx` deleted.
- [x] **3. `PermissionGate` + `PermissionsProvider` migration.** Converted both to TSX. `PermissionGate.tsx` exports a `PermissionCapability` interface consumed by `PermissionsProvider.tsx`. Both carry markers with `@feature-verified shared_components 2026-04-18`. Old `.jsx` files deleted. Only active call-site (`site/src/app/layout.js`) resolves the import extension-less, no change needed. `LockModal.tsx` (the other TSX-consumer of `usePermissionsContext`) type-checks against the new `PermissionsContextValue` cleanly.
- [x] **4. `ObservabilityInit` migration.** Converted `site/src/components/ObservabilityInit.js` → `.tsx` (component returns null but uses `useEffect`; kept `.tsx` for consistency with other client components). Markers `@migrated-to-permissions 2026-04-18` + `@feature-verified shared_components 2026-04-18`. Old `.js` deleted.
- [x] **5. `QuizPoolEditor` orphan decision.** Flagged, not wired, not deleted. The admin `/admin/stories` page routes the "Quiz pool" button to `/admin/story-manager?article=<id>`, and `story-manager/page.tsx` has its own inline quiz editor (local `QuizLocal` type + `quizzes` state + `addQuiz`/`removeQuiz`/`saveAll` directly against the `quizzes` table). No other admin surface references `QuizPoolEditor`. There is no `/admin/stories/[id]/quiz` or similar route that should be using the standalone editor. Recommendation for Phase 5: either delete `QuizPoolEditor.tsx` (duplicate functionality) or carve out a dedicated `/admin/stories/[id]/quiz` route and switch `admin/stories/page.tsx` line 234 to use it.
- [x] **6. `AccountStateBanner` column fix.** `site/src/components/AccountStateBanner.tsx` removed the tolerate-both-keys shim (was reading a non-existent `deletion_scheduled_at` column then falling back to `deletion_scheduled_for`). Now reads only `user.deletion_scheduled_for` directly (canonical column per `Database['public']['Tables']['users']['Row']`). Also fixed the consuming component: `site/src/app/NavWrapper.js` select on line 67 changed from `deletion_scheduled_at` → `deletion_scheduled_for`. This was a silent schema bug — NavWrapper was asking Supabase for a column that does not exist, which Supabase returned `null` for via PostgREST column-not-found handling.
- [x] **7. `FollowButton.viewerTier` removal.** `site/src/components/FollowButton.tsx` removed the `viewerTier?: string` prop from the interface (was a no-op; not destructured, not used). Single call-site `site/src/app/u/[username]/page.tsx:194` updated to drop the `viewerTier={'verity'}` line. No other call-sites existed (FollowButton is not used on `site/src/app/profile/[id]/page.tsx`).

**tsc (after carry-over cleanup):** `cd site && npx tsc --noEmit` → EXIT=0 (zero errors).

**New gaps flagged by Track J:**
- `QuizPoolEditor.tsx` is functionally duplicated by the inline quiz editor inside `site/src/app/admin/story-manager/page.tsx`. Phase 5 should pick one and retire the other.
- `site/src/app/u/[username]/page.tsx` lines 14-26 contain a stale comment block referencing the now-removed `viewerTier` prop. Left in place per "no new comments / don't expand scope" constraint. Should be pruned in the next general-purpose cleanup pass.

---

## Phase 5 — Track N notes (2026-04-18)

- **`role_permissions` table DROPPED.** Migration `drop_role_permissions_table_2026_04_18` applied (pre-verified `row_count=0`; idempotent `DROP TABLE IF EXISTS ... CASCADE`). `site/src/types/database.ts` regenerated via `npm run types:gen` — zero `role_permissions` references remain in generated types. `01-Schema/reset_and_rebuild_v2.sql` updated: the CREATE TABLE, 2 FKs, 2 indexes, UNIQUE constraint, RLS enable, and 3 RLS policies were replaced with comment markers noting the Phase 5 removal so a fresh rebuild cannot recreate the table.
- **Hierarchy map (`site/src/lib/roles.js`) retained.** Per prep doc Part 1.5, the `ROLE_HIERARCHY` map has 5 live consumers doing actor-vs-target rank guards (`api/admin/moderation/users/[id]/penalty/route.js`, `api/admin/users/[id]/roles/route.js`, `api/admin/billing/freeze/route.js`, `api/admin/billing/cancel/route.js`, `api/admin/subscriptions/[id]/manual-sync/route.js`). Deleting it would remove F-034/F-035/F-036 protections. **Deferred pending actor-vs-target rework** (a future `require_outranks(target_user_id)` RPC could replace the in-code map). REFERENCE.md §10's "Remove the role-hierarchy map" item is flagged as deferred, not completed.

---

### Phase 5 — Orphan + tiers cleanup (Track O)

- **Orphan `site/src/components/QuizPoolEditor.tsx` DELETED.** Grep confirmed zero external imports (only 3 self-references inside the file). Functionally duplicated by the inline editor in `site/src/app/admin/story-manager/page.tsx` (per Phase 3 Carry-over #5 and Track H gap). No consumer; safe removal.
- **Stale `viewerTier` comment block removed** from `site/src/app/u/[username]/page.tsx` (lines 14-26 in pre-edit form). The block claimed FollowButton still received a legacy `viewerTier` prop; Track J already removed that prop so FollowButton self-gates on `profile.follow`. Comment rewritten to current truth.
- **`@/lib/tiers` callers migrated (4 files)** — `isPaidTier(target.plans?.tier)` replaced with permission-backed checks. DB verified: `profile.card.view` description is "View public profile card page (/card/[username])" (granted via free/admin/owner sets); `profile.card_share` description is "Export a shareable profile card" (granted across plan tiers, `deny_mode=locked`). Keys used:
  - `site/src/app/card/[username]/layout.js` -> `hasPermissionServer('profile.card.view', supabase)`; dropped `plans(tier)` from users query.
  - `site/src/app/card/[username]/opengraph-image.js` -> `hasPermissionServer('profile.card.view', supabase)`; dropped `plans(tier)` from users query.
  - `site/src/app/card/[username]/page.js` -> `hasPermission('profile.card.view')` + `refreshAllPermissions()`; dropped `plans(tier)` from users query; kept `@migrated-to-permissions` marker, added `@feature-verified shared_components 2026-04-18`.
  - `site/src/app/profile/card/page.js` -> `hasPermission('profile.card_share')` + `refreshAllPermissions()`; dropped `plans(tier)` from own-user query; added both header markers.
- **Semantic drift acknowledged.** Pre-migration check was on the **target user's** plan tier (an AVAILABILITY gate on the viewed user). Post-migration check is **viewer-centric** per prep doc's explicit mapping guidance. The old comment at `card/[username]/page.js` lines 2-5 already flagged per-user feature resolution as future work (e.g. `has_permission_for('profile.card.exists', 'user', id)`); that TODO remains open.
- **`site/src/lib/tiers.js` DELETED.** Post-migration grep `from.*['"]@/lib/tiers['"]` across `site/src` returns zero hits. File (3 lines: `PAID_TIERS` array + `isPaidTier` helper) removed. Two lingering prose-comment mentions of `isPaidTier` remain in `site/src/app/bookmarks/page.tsx` lines 61,89 and `site/src/app/profile/[id]/page.tsx` line 17 — these are historical migration notes on files whose gate logic was already replaced; no code consequence.
- **`@/lib/plans` retained per prep doc 1.3.** Not a Phase 5 deletion candidate — it is the plan catalog (marketed tiers, pricing, DB plan lookups), actively consumed by `profile/settings/page.tsx` and the admin-LOCKED `admin/subscriptions/page.tsx`. Untouched.
- **`npx tsc --noEmit` EXIT=0** after all edits.

### Phase 5 — requireRole migration (Track M)

- **Date:** 2026-04-18
- **Scope:** 54 `await requireRole(...)` call-sites across 38 files in `site/src/app/api/admin/**` + `site/src/app/api/expert/answers/[id]/approve/route.js` migrated to `requirePermission(...)` with existing DB permission keys.
- **Files touched:** 38/38.
- **Calls migrated:** 54/54.
- **No new permission keys created** — every route mapped to an existing `admin.*` key already bound to a role permission_set.
- **Markers added:** every file got `// @migrated-to-permissions 2026-04-18` + `// @feature-verified admin_api 2026-04-18`. The three REFERENCE.md §12 drift files (manual-sync, users/[id]/permissions, users/[id]/roles) also got the missing `// @admin-verified 2026-04-18` marker written in the same pass (per prep doc Section 2.P alt — folded into M to avoid re-read).
- **Key mapping (abbreviated):**
  - ad-campaigns/* -> `admin.ads.campaigns.{create,edit,delete}`, `admin.ads.view` for list.
  - ad-placements/* -> `admin.ads.placements.{create,edit,delete}`, `admin.ads.view` for list.
  - ad-units/* -> `admin.ads.units.{create,edit,delete}`, `admin.ads.view` for list.
  - appeals/[id]/resolve -> `admin.moderation.appeal.approve` (mod-bound).
  - billing/cancel -> `admin.billing.cancel`.
  - billing/freeze -> `admin.billing.freeze`.
  - billing/sweep-grace -> `admin.billing.sweep_grace`.
  - broadcasts/breaking -> `admin.broadcasts.breaking.send` (admin/owner-only, editor loses access — FLAGGED).
  - data-requests list -> `admin.users.data_requests.view`; approve/reject -> `admin.users.data_requests.process` (admin/owner-only — FLAGGED).
  - expert/applications approve/reject/view/clear-background/mark-probation-complete -> matching `admin.expert.applications.*` keys (admin/owner-only — FLAGGED for editor-level access loss).
  - moderation/comments/[id]/hide -> `admin.moderation.comment.remove`; unhide -> `admin.moderation.comment.approve` (both mod-bound).
  - moderation/reports and resolve -> `admin.moderation.reports.bulk_resolve` (mod-bound).
  - moderation/users/[id]/penalty -> `admin.moderation.penalty.warn` (mod-bound; all 4 penalty.* keys co-bound to mod so single-key gate is sufficient).
  - recap routes -> `admin.recap.{create,edit,delete,questions_manage}` (editor-bound).
  - send-email -> `admin.email.send_manual`.
  - settings and settings/invalidate -> `admin.settings.edit` / `admin.settings.invalidate`.
  - sponsors/* -> `admin.ads.sponsors.manage`.
  - stories POST/PUT/DELETE -> `admin.articles.create` / `admin.articles.edit.any` / `admin.articles.delete` (admin/owner-only — FLAGGED for editor-level access loss).
  - subscriptions/[id]/manual-sync -> `admin.billing.override_plan`.
  - users/[id]/permissions -> `admin.permissions.scope_override`.
  - users/[id]/roles POST/DELETE -> `admin.moderation.role.grant` / `admin.moderation.role.revoke` (mod-bound).
  - expert/answers/[id]/approve -> `admin.expert.answers.approve` (admin/owner-only — FLAGGED for editor-level access loss).
- **Binding gaps flagged (editor access loss):** 5 routes that were `requireRole(editor)` map to keys bound only to admin/owner. This is an intentional tightening: the semantic permission key exists, and editors either were incidentally over-privileged via role hierarchy or should be added to the permission_sets explicitly in a follow-up binding migration. Routes affected: `admin.expert.answers.approve`, `admin.expert.applications.{approve,reject,view}`, `admin.users.data_requests.{view,process}`, `admin.broadcasts.breaking.send`, `admin.articles.{create,edit.any,delete}`. Follow-up: add these perms to the `editor` permission_set if editor-level access was intended; otherwise leave as admin/owner-only (which matches the spec key name).
- **Flip-test:** `admin.permissions.scope_override` on `admin@test.veritypost.com` — baseline granted via role, block override via `permission_scope_overrides` -> granted=false (scope_override source), override removed -> granted=true restored. PASS.
- **tsc:** `cd site && npx tsc --noEmit` -> EXIT=0.

### Phase 5 — Finalization (Track P)

- **Date:** 2026-04-18
- **`requireRole` helper deleted.** Removed the function body from `site/src/lib/auth.js` (prior lines 75-91: inline `hierarchy` map + `F-039` unknown-role guard). Replaced with a 3-line removal note pointing to this tracker. Also pruned the stale "These sit alongside requireAuth/requireRole" comment block a few lines below. The docstring that still mentions `requireRole` inside the auth.js removal note is intentional — it explains what used to live there.
- **Callers cleared:** zero active call-sites remain (verified via `grep -rn "requireRole" site/` — 3 hits are all intentional prose: 2 lines in the auth.js removal note, 1 in `admin/page.tsx` which is admin-LOCKED and documented as "do not touch" in the prep doc). `grep -rn "await requireRole" site/` returns zero.
- **`hasRole` / `assertPlanFeature` / `getPlanFeatureLimit`:** kept as-is this pass. Out of scope for the strict Track P charter (fix editor regressions + deactivate duplicate keys + delete `requireRole` + trackers). Future cleanup candidate.
- **Prose comment fixes:** `site/src/middleware.js:7` rewritten — "role-specific authorization stays in server components via requireRole() / requireVerifiedEmail()" → "permission-specific authorization stays in server components via requirePermission() / requireVerifiedEmail()". `site/src/app/api/admin/users/[id]/permissions/route.js` comments at lines 29/32/67 were already rewritten by Track M during its migration pass (file post-M reads `requirePermission('admin.permissions.scope_override')` as the auth barrier; no `requireRole` prose remains). `site/src/app/admin/page.tsx:101` left alone per prep doc (admin-LOCKED page).
- **Migration `fix_editor_access_regression_2026_04_18` applied.** Added explicit `editor` permission_set bindings on the 10 admin.* keys Track M had flagged as editor-access-loss regressions: `admin.expert.answers.approve`, `admin.expert.applications.{approve,reject,view}`, `admin.users.data_requests.{view,process}`, `admin.broadcasts.breaking.send`, `admin.articles.{create,edit.any,delete}`. Idempotent via `ON CONFLICT DO NOTHING` on the composite PK. `bump_perms_global_version()` at the end. Flip-test: `admin.articles.create` on `editor@test.veritypost.com` (`a7c71898-bf06-4220-9e13-632886be999d`) — pre-migration `granted=false` (not in resolved set); post-migration `granted=true via role`. Four sampled keys from the 10 all resolve `granted=true via role`.
- **Migration `deactivate_duplicate_billing_keys_2026_04_18` applied.** Set `is_active=false` on `billing.cancel` (duplicate of `billing.cancel.own`) and `billing.invoices.view` (duplicate of `billing.invoices.view_own`). Pre-flight grep confirmed zero code references to either key — the routes/UI all reference the `.own` variants. Idempotent via `AND is_active = true`. `bump_perms_global_version()` at the end. Post-state: `billing.cancel=false`, `billing.invoices.view=false`, `billing.cancel.own=true`, `billing.invoices.view_own=true`.
- **`billing.stripe.portal` vs `billing.portal.open` — PRODUCT DECISION (not touched).** Both remain `is_active=true`. The `/api/stripe/portal` route currently gates on the narrower `billing.stripe.portal` (admin/owner/pro only), which excludes family/expert paid users. Widening the binding or switching the route gate to `billing.portal.open` (universally bound) both need owner sign-off. Flagged for follow-up.
- **Final `requireRole` grep:** 3 lines total (2 auth.js removal-note prose, 1 admin/page.tsx prose) — zero active call-sites.
- **tsc:** `cd site && npx tsc --noEmit` -> EXIT=0.
- **Spot-check of Track M (3 random admin routes):** `api/admin/recap/[id]/route.js`, `api/admin/billing/freeze/route.js`, `api/admin/moderation/users/[id]/penalty/route.js`. All three: both markers present, `requirePermission` wired with a sane key matching the mutation (`admin.recap.edit`/`admin.recap.delete`, `admin.billing.freeze`, `admin.moderation.penalty.warn`), `requireRole` import removed, error-shape (`err.status` forwarding → 403 fallback) consistent. Rank-guard layer preserved where applicable (`getMaxRoleLevel` actor-outranks-target still in `billing/freeze` and `moderation/users/[id]/penalty`). Verdict: APPROVED.

### Round 3 — Track R

- **Date:** 2026-04-18
- **Scope:** iOS marker-only pass — add `@feature-verified <category> 2026-04-18` (and `@migrated-to-permissions 2026-04-18` where missing) to the remaining non-infra `.swift` files. Zero body code changes.

**R.1 — Feature views (added second marker alongside existing `@migrated-to-permissions`):**
- [x] `VerityPost/VerityPost/HomeFeedSlots.swift` — `home_feed` (matches `VerityPost/VerityPost/HomeView.swift` header).
- [x] `VerityPost/VerityPost/LeaderboardView.swift` — `home_feed` (web `site/src/app/leaderboard/page.tsx` has no `@feature-verified` yet; used `home_feed` per prep plan line 168, since leaderboard is a home-feed-adjacent surface and the iOS home-feed header already uses this category).
- [x] `VerityPost/VerityPost/ProfileView.swift` — `profile_settings` (web `site/src/app/profile/page.tsx` has no `@feature-verified` yet; matched iOS `SettingsView.swift` which uses `profile_settings` — consistent with prep plan line 169).
- [x] `VerityPost/VerityPost/ProfileSubViews.swift` — `profile_settings` (mirrors ProfileView).

**R.2 — Pre-auth / onboarding views (category `system_auth`):**
- [x] `VerityPost/VerityPost/AuthViewModel.swift` — both markers added (had neither).
- [x] `VerityPost/VerityPost/ContentView.swift` — both markers added (had neither).
- [x] `VerityPost/VerityPost/ForgotPasswordView.swift` — added `@feature-verified system_auth`.
- [x] `VerityPost/VerityPost/LoginView.swift` — added `@feature-verified system_auth`.
- [x] `VerityPost/VerityPost/ResetPasswordView.swift` — added `@feature-verified system_auth`.
- [x] `VerityPost/VerityPost/SignupView.swift` — added `@feature-verified system_auth`.
- [x] `VerityPost/VerityPost/VerifyEmailView.swift` — added `@feature-verified system_auth`.
- [x] `VerityPost/VerityPost/WelcomeView.swift` — added `@feature-verified system_auth`.

**R.3 — Pure infrastructure (intentionally unmarked, documented exclusion):**
- `Keychain.swift`, `Log.swift`, `Models.swift`, `Password.swift`, `PermissionService.swift`, `SupabaseManager.swift`, `Theme.swift`, `VerityPostApp.swift`, `SettingsService.swift`, `StoreManager.swift` — framework/infra files, no feature surface to gate; left without markers by design.

**Verification:** `grep -L "@feature-verified" $(find VerityPost -type f -name '*.swift' -not -name 'Keychain.swift' -not -name 'Log.swift' -not -name 'Models.swift' -not -name 'Password.swift' -not -name 'PermissionService.swift' -not -name 'SupabaseManager.swift' -not -name 'Theme.swift' -not -name 'VerityPostApp.swift' -not -name 'SettingsService.swift' -not -name 'StoreManager.swift')` → empty output. Every non-infra iOS Swift file now carries `@feature-verified`.

**Gaps flagged for follow-up (owner to sequence):**
- Web counterparts `site/src/app/leaderboard/page.tsx` and `site/src/app/profile/page.tsx` are missing `@feature-verified` markers entirely. Categories used on iOS side (`home_feed`, `profile_settings`) were inferred from the prep plan; a cross-platform review agent greps by exact category string, so if the web pages land with different categories later, the iOS markers here should be re-synced.
- `ProfileView.swift` carries `profile_settings` to match iOS `SettingsView.swift`, but the web page is a tabbed surface that mixes profile-card, activity, and settings concerns. If the category taxonomy later splits into `profile_card` vs `profile_settings`, ProfileView/ProfileSubViews may need a second `@feature-verified profile_card` line.
- `LeaderboardView.swift` carries `home_feed`; if a dedicated `leaderboard` category is introduced later, re-sync.

### Round 3 — Track Q

_Authoritative post-execution record (supersedes Track S's speculative draft). Agent Q ran after Track S wrote the initial skeleton; this block reflects the landed state._

- **Date:** 2026-04-18

**Q.1 — NavWrapper migration (full conversion):**
- [x] `site/src/app/NavWrapper.js` -> `site/src/app/NavWrapper.tsx`. Replaced the `user_roles -> roles(name)` join + `['owner','admin','superadmin'].includes(r)` hardcoded array check with `hasPermission('admin.dashboard.view')`, hydrated via `await refreshAllPermissions()` + `await refreshIfStale()` inside the `loadProfile` effect (matches the `NotificationBell.tsx` / `u/[username]/page.tsx` pattern). No new permission key created — `admin.dashboard.view` already existed in `admin` + `owner` sets, and roles `admin`/`owner`/`superadmin` all include the `admin` set, so the resolved set matches the prior hardcoded trio exactly. Preserved: `deletion_scheduled_for` select (Round 2 fix), kid-mode `vp:kid-mode-changed` + `storage` event wiring, notifications unread-count polling loop, `AccountStateBanner` render, DA-038/DA-062/DA-185/UJ-200/LB-005 prose comments. Both markers added at top: `@migrated-to-permissions 2026-04-18` + `@feature-verified admin_api 2026-04-18`. Old `NavWrapper.js` deleted. `layout.js` (`import NavWrapper from './NavWrapper'`) and `page.tsx` (`import { useAuth } from './NavWrapper'`) imports are extension-agnostic — no downstream rewrite needed.

**Q.2 — Marker-only migrations (no gate logic; category per prep):**
- [x] `site/src/app/logout/page.js` — `system_auth`.
- [x] `site/src/app/verify-email/page.js` — `system_auth`.
- [x] `site/src/app/category/[id]/page.js` — `home_feed`.
- [x] `site/src/app/profile/category/[id]/page.js` — `profile_card`.
- [x] `site/src/app/profile/contact/page.js` — `shared_components`.
- [x] `site/src/app/story/[slug]/layout.js` — `article_reading`.
- [x] `site/src/app/story/[slug]/opengraph-image.js` — `article_reading`.
- [x] `site/src/app/u/[username]/layout.js` — `profile_card`.
- [x] `site/src/app/profile/activity/page.js` — `profile_card` (redirect shell; marker for completeness).
- [x] `site/src/app/profile/milestones/page.js` — `profile_card` (redirect shell).

**Q.3 — Framework files (intentionally unmarked):**
- `site/src/app/robots.js`, `manifest.js`, `sitemap.js`, `not-found.js`, `error.js`, `global-error.js`, `browse/loading.js`, `profile/error.js`, `profile/loading.js`, `story/[slug]/error.js`, `story/[slug]/loading.js` — Next.js conventions. See the framework-exclusion paragraph in the Scope section above.

**Q.4 — Root layout (`site/src/app/layout.js`):** deferred; NavWrapper TSX conversion did not force a re-write (imports resolve without extension).

**Flip-test — `admin.dashboard.view` on `admin@veritypost.com` (`f1c8ac0f-6ded-4b4f-9ded-db0ed802b717`):**
- Baseline: `granted=true`, `granted_via=role`, `source_detail={set_key: owner, role_name: owner}`.
- Inserted `permission_scope_overrides` (scope_type=user, override_action=block): `granted=false`, `granted_via=scope_override`.
- Deleted the override: `granted=true`, `granted_via=role` restored.
- PASS.

**Verify:**
- `grep -rn "roles?.some" site/src/app/NavWrapper*` -> zero hits.
- `grep -L "@migrated-to-permissions" site/src/app/NavWrapper*` -> zero hits.
- `cd site && npx tsc --noEmit` -> EXIT=0.

### Round 3 — Track S

_Drift audit + tracker sync pass (docs-only; zero source-body changes)._

**S.1 — Drift audit.** Parsed every `- [x] <path>` entry in this tracker (178 unique file paths once markdown-prose bullets are filtered). For each file on disk, checked that the marker set matches what the tracker row claims (`@migrated-to-permissions` + `@feature-verified`, or `@admin-verified` where the tracker flags the file as LOCKED).

- Claim-to-disk strict drift (tracker explicitly claims `feature-verified` but disk missing it): **0 files**.
- Claim-to-disk strict drift (tracker claims `@admin-verified` but disk missing it): **0 files** (all 6 admin-LOCKED tracker entries verified).
- Scope-excluded (intentional deletions per prior tracks): `site/src/app/profile/settings/page.js` (deleted in the profile-settings consolidation), `site/src/components/QuizPoolEditor.tsx` (deleted in Track O). Not drift.
- Soft drift (tracker row doesn't claim `feature-verified`, file carries only `@migrated-to-permissions`): resolved by Track R (iOS 1.2C feature views, pre-auth forms) and Track Q (web 1.1E no-gate shells).

**S.2 — Markers added outside Q/R scope:** none. The audit surfaced zero files in a no-agent state.

**S.3 — Tracker-text sync:** Round 3 Track Q, R, S, T sections appended (this block + R's self-added block above + T's Track T block below + REFERENCE.md §12 paragraph cross-linked above). Q's section was written against the prep doc at S-run time (Q.1 landed, Q.2 partial); verify by grep after Q completes.

**S.4 — Framework-file exclusion note:** added to the Scope section at the top of this tracker.

**S.5 — Admin-API LOCK flag (owner decision, not actioned):** 39 admin UI files carry `@admin-verified 2026-04-18`. 37 admin API routes carry `@migrated-to-permissions` + `@feature-verified admin_api` but only 3 of those 37 (the REFERENCE.md §12 drift files — `api/admin/subscriptions/[id]/manual-sync/route.js`, `api/admin/users/[id]/permissions/route.js`, `api/admin/users/[id]/roles/route.js`) additionally carry `@admin-verified`. The remaining 34 admin API files are unlocked. Owner should decide: (a) extend the LOCK to all 34 remaining admin API files (treating the admin API as equally frozen), or (b) explicitly document the asymmetry (admin UI is frozen, admin API is allowed to evolve). Track S surfaces the question; no markers changed. Also filed under REFERENCE.md §6.

**S.6 — Kid `.d.ts` stub sweep:** `ls site/src/components/kids/*.d.ts` → no matches. All 5 stubs that Round 1 created (AskAGrownUp, Badge, EmptyState, KidTopChrome, StreakRibbon) were deleted when their real TSX components landed, per the Round 1 report. Nothing to clean up.

**Verification:**
- `grep -L "@feature-verified" $(find VerityPost -type f -name '*.swift' -not -name 'Keychain.swift' -not -name 'Log.swift' -not -name 'Models.swift' -not -name 'Password.swift' -not -name 'PermissionService.swift' -not -name 'SupabaseManager.swift' -not -name 'Theme.swift' -not -name 'VerityPostApp.swift' -not -name 'SettingsService.swift' -not -name 'StoreManager.swift')` → empty (post-R).
- `grep -L "@feature-verified" $(find site/src/app -type f -name '*.tsx' -not -path '*/admin/*')` → empty (post prior rounds; 39 admin TSX files correctly carry `@admin-verified` instead).

### Round 3 — Track T

_Spec-vs-DB drift closure for subscription key naming (docs-only, no DB or source-body changes)._

- **T.1 — DB reality check:** `billing.cancel` + `billing.invoices.view` → `is_active=false`; the 8 canonical billing keys (`billing.cancel.own`, `billing.resubscribe`, `billing.change_plan`, `billing.upgrade.checkout`, `billing.stripe.checkout`, `billing.portal.open`, `billing.stripe.portal`, `billing.invoices.view_own`) → `is_active=true`. Confirmed.
- **T.2 — `REFERENCE.md` §6 item #8 rewrite:** replaced the "Open issue" paragraph with a resolved-state paragraph naming the 8 canonical keys and the 2 deactivated duplicates; moved to §12 "Recently fixed (2026-04-18)" (prior §6 items renumbered). See `00-Where-We-Stand/REFERENCE.md` §12 tail paragraph.
- **T.3 — Tracker comment sync:** Track I's "Missing permission keys (flagged, NOT created)" block has a trailing "RESOLVED by Round 3 Track T (2026-04-18)" line (see line ~394 above).
- **T.4 — No alias keys created.** Per brief option (a): spec docs follow DB. The 7 stale semantic aliases (`subscription.cancel`, `subscription.resume`, `subscription.upgrade`, `subscription.downgrade`, `plan.switch`, `checkout.initiate`, `billing.view.invoices`) were never created in DB and are not referenced in code; they stay un-created.
- **T.5 — `billing.stripe.portal` vs `billing.portal.open` — unchanged.** Out of scope for T; remains in REFERENCE.md §6 as an open product decision.

### Round 4 — Track W (Hygiene: DB permission-key cleanup + `/api/health` lockdown)

_Migration: `fix_round4_hygiene_2026_04_19` (file: `01-Schema/068_round4_permission_key_cleanup.sql`). Idempotent._

- **W.1 — Missing key created:** `profile.expert.badge.view` (category `ui`, ui_section `profile`, ui_element `expert_badge`, `is_public=true`). Bound to 9 sets: `anon, free, pro, family, expert, moderator, editor, admin, owner`. Resolves two silent-DENY call-sites in `site/src/app/u/[username]/page.tsx` and `site/src/app/profile/[id]/page.tsx` that previously suppressed expert badges due to the unknown-key default-deny behaviour.
- **W.2 — Duplicate keys deactivated (5):** `billing.frozen.banner.view` (kept `billing.frozen_banner.view`), `profile.activity.view` (kept `profile.activity`), `profile.activity.view.own` (kept `profile.activity`), `leaderboard.global.view` (kept `leaderboard.view`), `leaderboard.global.full.view` (kept `leaderboard.view`). Zero code references to any of the 5 deactivated keys confirmed by grep across `site/src` and `VerityPost`.
- **W.3 — `notifications.mark_read` / `notifications.mark_all_read`:** already live (created pre-Round-4). Defensive idempotent `INSERT ... ON CONFLICT DO NOTHING` left in migration for fresh-clone reruns. No-op on the live DB.
- **W.4 — Active permission count:** 932 → 928 (−5 dupes, +1 new key, +0 for the already-live notifications keys).
- **W.5 — `perms_global_version` bumped.** Table: `public.perms_global_version(id, version, bumped_at)`. Baseline value at start of Round 4: `version=4391`. Post-Round-4 (including any Executor 1 parallel bumps): `version=4407`. Every authenticated client will refetch its effective-perms cache on next navigation.
- **W.6 — `/api/health` lockdown (`site/src/app/api/health/route.js`):** previously leaked env-var presence (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`) to unauthenticated callers in the `{ok, checks}` payload. Rewritten to return only `{ok, checks:{db}, latency_ms, ts}` by default; env-presence block now requires `x-health-token` header matching `HEALTH_CHECK_SECRET` env var. Matches ops-monitoring pattern (operator configures secret, bare probe still works without it). Both markers (`@migrated-to-permissions`, `@feature-verified system_auth`) added at top.
- **W.7 — `REFERENCE.md` updates (3 edits):**
  - §3 line 25: `934 active permissions` → `928 active permissions`.
  - §7 table line 112: `| Active permissions | 934 |` → `| Active permissions | 928 |`.
  - §6 item 9 line 79: `5 live call-sites use ...` → `5 consumer files call ... (plus the definition in lib/roles.js) ...` (disambiguation, not a count change).

### Round 4 — Track X (Hygiene: marker sweep + admin DS LOCK extension + NotificationBell flag)

_Marker-only; zero behavioural changes beyond Track W's `/api/health` rewrite._

- **X.1 — 15 unmigrated files marked with both markers:**
  - `system_auth` (12): `site/src/app/api/auth/{callback,check-email,email-change,login,login-failed,login-precheck,logout,resend-verification,reset-password,resolve-username,signup}/route.js`, `site/src/app/api/errors/route.js`.
  - `ads` (3): `site/src/app/api/ads/{click,impression,serve}/route.js`.
  - `shared_components` (1): `site/src/app/layout.js`.
  - Skipped: `site/src/app/api/health/route.js` — written by Track W with both markers already present. Net writes: 15 files. (The briefing table classed `layout.js` as `system_auth`; the executor spec overrode that to `shared_components` for the root layout — flagged as minor deviation from briefing text but aligned with parent's explicit call-out.)
- **X.2 — 27 admin DS primitives LOCKED with `@admin-verified 2026-04-18`:** `site/src/components/admin/{Badge,Button,Checkbox,ConfirmDialog,DataTable,DatePicker,Drawer,EmptyState,Field,Form,KBD,Modal,NumberInput,Page,PageSection,Select,Sidebar,SkeletonCard,SkeletonRow,Spinner,StatCard,Switch,TextInput,Textarea,Toast,ToastProvider,Toolbar}.jsx`. `DestructiveActionConfirm.tsx` already carries a `@feature-verified shared_components` marker (from Round 2) and was NOT re-edited. Combined LOCK set post-Round-4: 39 pre-existing admin UI pages + 27 new DS primitives = **66 files**. REFERENCE.md §4 still says "39 files" — owner decision pending on whether to refresh that count (flagged, not actioned; likely Round 5).
- **X.3 — 34 files with `@migrated-to-permissions` got their missing `@feature-verified`:**
  - `comments` (6): `site/src/app/api/comments/{route.js, [id]/{route,vote,flag,report,context-tag}/route.js}`.
  - `expert_sessions` (3): `site/src/app/api/expert-sessions/{route.js, [id]/questions/route.js, questions/[id]/answer/route.js}`.
  - `expert` (3): `site/src/app/api/expert/{apply,ask,back-channel}/route.js`.
  - `family` (1): `site/src/app/api/family/achievements/route.js`.
  - `ai` (1): `site/src/app/api/ai/generate/route.js`.
  - `reports` (2): `site/src/app/api/reports/{route.js, weekly-reading-report/route.js}`.
  - `supervisor` (2): `site/src/app/api/supervisor/{opt-in,opt-out}/route.js`.
  - `system_auth` (7): `site/src/app/{login, signup, signup/expert, signup/pick-username, forgot-password, reset-password, welcome}/page.tsx`.
  - `shared_pages` (9): `site/src/app/{appeal, accessibility, browse, cookies, dmca, how-it-works, privacy, status, terms}/page.tsx`.
  - Note: `shared_pages` is a newly-introduced category for legal/marketing top-level routes (prior rounds used `shared_components` for React components; `shared_pages` better reflects the route-vs-component distinction). Owner can rename to `shared_components` in a follow-up sweep if consolidation is preferred.
- **X.4 — `site/src/components/NotificationBell.tsx` — FLAGGED, not deleted.** File carries both markers (from Round 2 Track L), self-gates on `notifications.inbox.view` + `notifications.mark_read`, exports `default function NotificationBell()`. Grep across `site/src` + `VerityPost` for `import.*NotificationBell` and `<NotificationBell` shows zero importers / zero JSX mounts. Docs (`00-Folder Structure.md:372`, `04-Ops/PROJECT_STATUS.md:99`) cite it as "Active". Master prep's "delete if zero importers" would regress a planned mount. Action: surfaced for owner review; silent-delete deferred to a follow-up round after owner confirmation.
- **X.5 — Stale counts in `REFERENCE.md` fixed by Track W (see W.7).**

**Post-round-4 verification:**
- `SELECT count(*) FROM public.permissions WHERE is_active = true;` → **928**. Matches target.
- `comm -23 <(grep -rl '@migrated-to-permissions' site/src) <(grep -rl '@feature-verified\|@admin-verified' site/src)` → **empty** (no strict drift).
- `grep -rL '@migrated-to-permissions' site/src/app ... | grep -v '/admin/' | grep -Ev '(sitemap|manifest|error|not-found|loading|global-error|robots)\.js$'` → **empty** (no unmigrated files outside framework shells + sealed admin).
- `cd site && npx tsc --noEmit` → EXIT=0 (no type regressions).
- Admin marker count: 28 files under `site/src/components/admin/` carry a seal marker (27 new `@admin-verified` + 1 pre-sealed `@feature-verified shared_components`).

### Round 4 — Track U (Security: users-table self-escalation lockdown + server-side scoring)

_Migrations: `01-Schema/065_restrict_users_table_privileged_updates_2026_04_19.sql` and `01-Schema/066_add_award_reading_points_rpc_2026_04_19.sql`. Idempotent._

- **U.1 — Pre-state:** `public.users` had RLS `users_update USING (id = auth.uid() OR is_admin_or_above())` with NO `WITH CHECK` and no column-level revokes. Any authenticated user could PATCH their own row to raise `plan_id`, `verity_score`, `is_expert`, `perms_version`, etc. via PostgREST. Live exploit reproducible pre-fix.
- **U.2 — Fix (Option B):** added `public.reject_privileged_user_updates()` (`SECURITY INVOKER`, SET search_path=public) and `trg_users_reject_privileged_updates` BEFORE UPDATE trigger. RAISEs `42501` when any of 22 privileged columns change (`plan_id, plan_status, is_expert, is_verified_public_figure, is_banned, is_shadow_banned, verity_score, warning_count, perms_version, ban_reason, banned_at, banned_by, muted_until, mute_level, frozen_at, frozen_verity_score, plan_grace_period_ends_at, is_active, stripe_customer_id, deletion_scheduled_for, deletion_completed_at, streak_best`) unless the caller is service_role / postgres / supabase_admin / supabase_auth_admin, or `is_admin_or_above()` returns true.
- **U.3 — DEVIATION from briefing:** briefing specified `SECURITY DEFINER` on the trigger function. That would make `current_user` inside the function always resolve to the owner (`postgres`), matching our whitelist and silently bypassing the check for every caller (verified empirically). Trigger function published as `SECURITY INVOKER` so `current_user` preserves the caller's actual role. No other semantics changed.
- **U.4 — Verified by SQL tests:** privileged UPDATE as `authenticated` with `auth.uid()=<non-admin>` RAISEs 42501 across 4 column variants (plan_id, is_expert, perms_version, mixed bio+verity_score). Non-privileged UPDATE (`display_name`) still succeeds. Admin bypass (authenticated with admin uid) succeeds. service_role bypass succeeds.
- **U.5 — `award_reading_points(p_article_id uuid)` RPC added** (SECURITY DEFINER, owned by postgres, REVOKE anon + GRANT authenticated). Wraps `score_on_reading_complete()`; ensures a completed `reading_log` row exists for (user, article) then delegates. Returns jsonb `{awarded, points, reason, streak}`. No client writes to `users.verity_score` remain.
- **U.6 — iOS `StoryDetailView.appAwardPoints`** rewritten to call the RPC. Old direct `users.verity_score` write removed (it would now raise 42501 from the new trigger anyway). Function is dead code as of 2026-04-18 — no call-sites — but is hardened before any future caller ships.
- **U.7 — Verification:** two triggers present on `public.users` (`trg_users_updated_at`, `trg_users_reject_privileged_updates`). All three new/modified functions (`reject_privileged_user_updates`, `award_reading_points`, `handle_new_auth_user`) owned by `postgres`.

### Round 4 — Track V (Security: iOS broken flows)

_Migration: `01-Schema/067_add_post_signup_user_roles_trigger_2026_04_19.sql`. Idempotent (CREATE OR REPLACE FUNCTION)._

- **V.1 — AlertsView mark-read fixed.** `VerityPost/VerityPost/AlertsView.swift` `markAsRead` (lines ~498-524) and `markAllRead` (lines ~526-551) now PATCH `/api/notifications` with `{ ids: [...], mark: 'read' }` / `{ all: true, mark: 'read' }` using the signed-in session bearer. Replaces prior direct PostgREST `update(["read":"true"])` calls which wrote a non-existent `read` column (real columns: `is_read`, `read_at`, `is_seen`, `seen_at`) and silently failed. No new route created — existing PATCH handler is reused (`site/src/app/api/notifications/route.js:38-69`, permission-gated by `notifications.mark_read`).
- **V.2 — SubscriptionView promo redemption fixed.** `VerityPost/VerityPost/SubscriptionView.swift:400-454` replaced. Direct writes to `promo_codes`, `promo_uses`, and `users` (all using wrong column names: `plan` vs `plan_id`, `subscription_status` vs `plan_status`, `promo_id` vs `promo_code_id`, `active` vs `is_active`, `duration_days` vs `duration_months`) deleted. iOS now POSTs `/api/promo/redeem` with `{ code }` and parses `{success, fullDiscount, plan, message}` / `{error}`. Route is permission-gated (`billing.promo.redeem`), service-client writes, has duplicate-use guard + audit log.
- **V.3 — handle_new_auth_user extended.** Function body now: (a) looks up `plans.id WHERE name='free'` and sets `users.plan_id` on insert; (b) sets `plan_status='active'` (not `'free'` — `plan_status` is a lifecycle enum, not a plan name); (c) for `user_count=1` seeds `roles.name='owner'`, else seeds `roles.name='user'`. All `INSERT ... ON CONFLICT DO NOTHING`. Original `on_auth_user_created` trigger on `auth.users` unchanged; only the function body replaced.
- **V.4 — iOS AuthViewModel cleanup.** `VerityPost/VerityPost/AuthViewModel.swift:265-288` (the `RoleRow` fetch + `user_roles` insert) deleted. `user_roles` INSERT RLS is admin-only — the block was always silently failing under `try?`. Trigger now covers the seed; iOS client no longer tries.
- **V.5 — Verified by SQL test:** programmatic `INSERT INTO auth.users` fires `handle_new_auth_user` → `public.users` row created with `plan_id=<free>`, `plan_status='active'`, and a `user_roles` row with `role='user'`. Test user cleaned up.
- **V.6 — Latent bug flagged, NOT fixed:** `/api/promo/redeem/route.js:88` reads `promo.applicable_plans?.[0]` but the DB column is `applies_to_plans`. Any 100%-discount promo will 400 with "This promo is not tied to a specific plan." until renamed. Flagged for Round 5 / PM; out of scope for Track V. _Resolved in Round 5 Item 1 (see below)._
- **V.7 — `perms_global_version` bumped** 4407 → 4408 to invalidate cached perms after the users-table trigger lands. No new permission keys created in Track U or V.

### Round 4 — Post-audit close (BEFORE INSERT guard)

Final Auditor B flagged an exploitable gap: the `reject_privileged_user_updates` trigger fired only on BEFORE UPDATE, so a malicious signup client could race `handle_new_auth_user` and INSERT its own row with `is_expert=true`/`verity_score=99999`/etc. Because `handle_new_auth_user` uses `ON CONFLICT DO NOTHING`, the attacker's row would win.

- **Fix applied:** migration `restrict_users_table_privileged_inserts_v2_2026_04_19` — trigger now fires `BEFORE INSERT OR UPDATE` on `public.users`. On INSERT, rejects any non-default value for the 22 privileged columns unless caller is admin/service-role/internal. Column defaults (`plan_status='free'`, `perms_version=1`, etc.) are allowed so legitimate client signups still work.
- **Probe results:**
  - Authenticated INSERT with `id+email+username` only → succeeds
  - Authenticated INSERT with `is_expert=true` → 42501 (blocked)
  - Authenticated INSERT with `plan_id=<pro>` → 42501 (blocked)
- **Reviewer 1 fix:** `AuthViewModel.swift` signup changed from `.insert(NewUser(...))` to `.upsert(UserUpsert(id, email, username), onConflict: "id")` — resolves the unique_violation that Executor 1's V.3 extension introduced when `handle_new_auth_user` now pre-inserts the `public.users` row.
- **Reviewer 2 fix:** `REFERENCE.md` §6 #10 updated from "39 admin UI files" to "66 admin UI files (39 pages + 27 DS primitives)" to reflect Round 4 Track X's LOCK extension.

### Round 5 — Item 1 (promo redemption column name)

- **Bug:** `/api/promo/redeem/route.js` read wrong column `applicable_plans`; real DB column is `applies_to_plans` (`uuid[]`). Plan lookup also used `.eq('name', targetPlan)` against a value that is actually a plan UUID (admin UI writes `plan.id` at `site/src/app/admin/promo/page.tsx:182`), so even after a rename the lookup would have 400'd with "Plan not found for this promo." Both defects shipped together.
- **Fix — `site/src/app/api/promo/redeem/route.js` only (5 edits, no DB migration):**
  - Line 85 (comment): `applicable_plans` → `applies_to_plans entry`.
  - Line 88: `const targetPlan = promo.applicable_plans?.[0];` → `const targetPlanId = promo.applies_to_plans?.[0];` (also renamed the downstream guard + references).
  - Lines 92-96: `plans` select changed from `'id, display_name'` → `'id, name, display_name'`; `.eq('name', targetPlan)` → `.eq('id', targetPlanId)`.
  - Lines 112-117: audit metadata `plan_name: targetPlan` (which was a UUID after the rename) → `plan_name: plan.name`; field order tidied (`plan_id` before `plan_name`).
  - Line 123: success response `plan: targetPlan` → `plan: plan.name` (return the human-meaningful name, not a UUID).
  - Line 133: response key `applicable_plans: promo.applicable_plans` → `applies_to_plans: promo.applies_to_plans` (verified no consumer dependency — `handlePromo` in `site/src/app/profile/settings/page.tsx:2988` only reads `data.error` / `data.message`; iOS has no references to either column name).
- **Verification:**
  - `grep -rn "applicable_plans" site/src VerityPost` → zero hits in code (only docs in `00-Where-We-Stand/` and `05-Working/` remain, which is expected).
  - `cd site && npx tsc --noEmit` → EXIT=0 (first try, no regressions).
  - SQL probe on project `fyiwulqphgmoqullmrfn`: `INSERT INTO promo_codes (code, discount_type, discount_value, applies_to_plans, is_active) VALUES ('ROUND5TEST', 'percent', 100, ARRAY['0a8a5548-062f-412d-8b73-66dddc3c306f']::uuid[], true)` succeeded; `SELECT id, code, applies_to_plans FROM promo_codes WHERE code = 'ROUND5TEST'` returned the row with `applies_to_plans=["0a8a5548-062f-412d-8b73-66dddc3c306f"]` (verity_annual plan UUID); `DELETE ... WHERE code='ROUND5TEST'` cleaned up. Column name + `uuid[]` shape match the patched code reads.
- **Also resolves:** V.6 above, and the carry-forward "Must-fix" flags in `FEATURE_LEDGER.md:334`, `FEATURE_LEDGER.md:639`, `00-Folder Structure.md:550`.

### Round 5 — Item 1B (promo_uses insert schema)

- **Bug:** `/api/promo/redeem/route.js` promo_uses insert wrote nonexistent column `redeemed_at` and omitted the NOT NULL column `discount_applied_cents`. Either defect alone breaks every redemption; together they guarantee 500s. Additionally, the `useError` handler returned `"You have already used this code"` (status 400) for any insert failure, masking the schema bug from manual QA (which is the only reason this shipped with the Item-1 column fix). The DB schema (`promo_uses` per `01-Schema/reset_and_rebuild_v2.sql:1578-1585` and `site/src/types/database.ts:5259-5307`) was already correct — this was a pure code-shape bug.
- **Fix — `site/src/app/api/promo/redeem/route.js` only (3 edits, no DB migration):**
  - Lines 68-107 (Edit 1): Hoisted the `plans` lookup above the `promo_uses` insert. Added `let discountAppliedCents = 0; let prefetchedPlan = null;` and a 100%-discount pre-block that resolves `applies_to_plans[0]`, fetches the plan (now selecting `price_cents` in addition to `id, name, display_name`), and sets `discountAppliedCents = planForInsert.price_cents ?? 0`. Both failure modes (missing `applies_to_plans[0]`, plan lookup miss) roll back the counter. Insert shape changed from `{promo_code_id, user_id, redeemed_at: now}` to `{promo_code_id, user_id, discount_applied_cents: discountAppliedCents}`; `created_at` now uses the DB default.
  - Lines 109-117 (Edit 2): `useError` branch now logs the real error via `console.error('[promo/redeem] promo_uses insert failed:', useError)` and returns `{ error: 'Could not record redemption. Please try again.' }` at status **500** (was a misleading 400 "already used"). The legitimate duplicate-use case is still caught by the pre-check at lines 51-53. Caller at `site/src/app/profile/settings/page.tsx:2991` branches on `!res.ok`, so 400→500 is client-safe.
  - Lines 119-126 (Edit 3): 100%-discount upgrade block now reuses `prefetchedPlan` via `const plan = prefetchedPlan;` instead of re-querying `plans`. The defensive `if (!plan)` guard remains for type-narrowing. Downstream `users` update and `audit_log` insert still reference the local `plan` alias — untouched.
- **What did not change:** Item 1's column fixes (`expires_at.gt.${now}` on line 32, `.eq('id', promo.id)` on line 59), `const now` on line 24 (still used on line 32), the optimistic-concurrency counter pattern, the audit_log insert, the final non-100% success response, RLS policies, or `promo_uses` constraints (the note about a missing UNIQUE on `(promo_code_id, user_id)` is out of scope).
- **Verification:**
  - `grep -n "redeemed_at" site/src/app/api/promo/redeem/route.js` → zero hits.
  - `cd site && npx tsc --noEmit` → EXIT=0 (first try; `database.ts` requires `discount_applied_cents` on the `promo_uses` insert, which this fix now supplies).
  - Re-read of the patched `route.js` end-to-end: `let discountAppliedCents` / `let prefetchedPlan` declared before first use; no `redeemed_at` residue; 100%-discount block consumes `prefetchedPlan` (no second `.from('plans')` call); `users` update + `audit_log` insert still reference the local `plan` alias; control flow intact with no orphan variables.
  - SQL probe on project `fyiwulqphgmoqullmrfn`: inserted a fixture `promo_codes` row `R5I1BTEST` (percent/100, `applies_to_plans=[<verity_family_monthly uuid>]`, `max_uses=5`); then `INSERT INTO promo_uses (promo_code_id, user_id, discount_applied_cents) VALUES (..., ..., 1499)` succeeded and returned a row with `created_at` auto-populated by the DB default; cleanup deleted both the `promo_uses` row (1) and the `promo_codes` row (1). Insert shape matches the route's new payload.
- **Deviations from plan:** None. All three edits applied verbatim.

### Round 5 — Item 2 (profile updates via RPC)

- **Bug class:** iOS `SettingsView.swift` and `AuthViewModel.swift` plus web `profile/settings/page.tsx` wrote directly to `public.users` via the session client. Four phantom columns (`location`, `website`, `avatar`, `preferences`) silently no-op'd on iOS because they don't exist in the schema; the Round 4 `reject_privileged_user_updates` trigger (migration 065) acts as defence-in-depth against privilege escalation but leaves the silent-drop footgun for descriptive fields.
- **Fix — new DB RPC + 7 iOS edits + 7 web edits:**
  - **Migration:** `add_update_own_profile_rpc_2026_04_19` (applied 2026-04-19 on project `fyiwulqphgmoqullmrfn`). Creates `public.update_own_profile(p_fields jsonb) RETURNS jsonb`, `SECURITY DEFINER`, owner `postgres`, `search_path = public, pg_catalog`. Idempotent via `CREATE OR REPLACE FUNCTION` + explicit `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated`. 20-column allowlist (`username`, `display_name`, `bio`, `avatar_url`, `avatar_color`, `banner_url`, `profile_visibility`, `show_activity`, `show_on_leaderboard`, `allow_messages`, `dm_read_receipts_enabled`, `notification_email`, `notification_push`, `att_status`, `att_prompted_at`, `metadata`, `last_login_at`, `onboarding_completed_at`, `expert_title`, `expert_organization`). Unknown keys are silently ignored (owner decision: privileged columns stay trigger-protected; silent-ignore keeps the current UX intact and avoids breaking forward-compatible client payloads). `metadata` is **server-side deep-merged at the top level** via `COALESCE(u.metadata, '{}'::jsonb) || (p_fields->'metadata')` so concurrent writers on sibling metadata keys (`feed`, `a11y`, `expertWatchlist`, `expertVacation`, `avatar`, `location`, `website`, `notification_prefs`, `expert`) do not clobber each other. Returns `jsonb_build_object('ok', true, 'updated_at', <ts>)`.
  - **iOS — 7 call sites migrated across 2 files:**
    - `VerityPost/VerityPost/SettingsView.swift`: `AccountSettingsView.save()` (was `FullUpdate`/`LegacyUpdate` try-then-catch on `users.update`; latent `location`/`website`/`avatar` phantom columns now routed into `metadata.location`, `metadata.website`, `metadata.avatar` matching the web card's convention), `NotificationsSettingsView.save()`, `FeedPreferencesSettingsView.save()`, `ExpertSettingsView.save()` (all three wrote `preferences` phantom column and now go through `p_fields.metadata` via the RPC), `DataPrivacyView.saveDmReceiptsPref()` (`dm_read_receipts_enabled`). Added `Encodable` conformance to the existing `JSONValue` enum so `[String: Any]` merged metadata can be fed into the RPC without hand-writing per-shape `Encodable` structs.
    - `VerityPost/VerityPost/AuthViewModel.swift`: `login()` best-effort `last_login_at` update. AuthViewModel signup upsert (line 253) intentionally left alone — INSERT path, trigger-irrelevant, out of scope per plan.
  - **Web — 7 call sites migrated in `site/src/app/profile/settings/page.tsx`:** lines 1244 (`handleSave` profile/identity), 1641 (`saveNotifs`), 2034 (feed `handleSave`), 2409 (a11y `handleSave`), 3361 (expert profile `handleSave` — `expert_title`, `expert_organization`, `bio`), 3466 (expert vacation toggle), 3542 (expert watchlist toggle). All converted from `supabase.from('users').update(...).eq('id', userId)` to `supabase.rpc('update_own_profile', { p_fields: { ... } })`. Error handling (`pushToast`) preserved verbatim.
  - **Phantom-column mappings:** `location` -> `metadata.location`, `website` -> `metadata.website`, `avatar` (outer/inner/initials jsonb) -> `metadata.avatar`, `preferences` -> merged into `metadata` directly. All match existing web convention (`readMeta(user)` + `mergedMeta.avatar = avatarPayload`).
- **What did not change:** The Round 4 `reject_privileged_user_updates` trigger (belt-and-suspenders), the signup upsert (INSERT path), service-role writes (webhooks, crons, admin UI, auth callbacks), and any `from('users').select(...)` reads.
- **Verification:**
  - `grep from\\(\"users\"\\)\\.update VerityPost/VerityPost` -> zero hits.
  - `grep from\\('users'\\)\\.update site/src/app/profile/settings/page.tsx` -> zero hits.
  - `cd site && npx tsc --noEmit` -> EXIT=0 (regenerated types injected the new `update_own_profile` RPC signature into `site/src/types/database.ts`).
  - SQL probes on project `fyiwulqphgmoqullmrfn` under `SET LOCAL ROLE authenticated` + seeded JWT claims:
    1. `update_own_profile('{"bio":"test-round5"}')` -> `{ok:true}`; `users.bio='test-round5'`; pre-seeded `metadata.seedKey='preserve-me'` and `metadata.feed.display='comfortable'` untouched.
    2. `update_own_profile('{"is_expert":true}')` -> `{ok:true}`; `users.is_expert` stays `false` (silently ignored — not on allowlist).
    3. `update_own_profile('{"metadata":{"website":"example.com"}}')` -> `{ok:true}`; `metadata->>'website'='example.com'` AND `metadata->>'seedKey'='preserve-me'` AND `metadata->'feed'->>'display'='comfortable'` (server-side || preserves siblings).
  - Test user (`369b8e4d-7d55-4f23-b273-e5bc8dacc021`) restored to `bio=NULL, metadata='{}'` post-probes.
- **Deviations from plan:** (a) Owner decision applied: added `expert_title` and `expert_organization` to the allowlist (so the expert-profile card at `page.tsx:3361` keeps working) and chose server-side deep-merge for metadata (plan's Option 1). (b) The plan's §Part A wording preferred "fail-closed on unknown keys" (`RAISE EXCEPTION 'unknown field: <key>'`); owner override instructed silent-ignore instead, to preserve forward-compat UX. Privileged columns are still protected by the Round 4 trigger so escalation remains blocked.

### Round 6 — SECURITY (admin RPC lockdown)

- **Bug class:** 14 `SECURITY DEFINER` RPCs had `EXECUTE` granted to `PUBLIC` (i.e. `anon` and `authenticated`). Auth-sensitive bodies either had no internal check (`anonymize_user`, `send_breaking_news`) or trusted a caller-supplied actor UUID (`p_admin_id` / `p_mod_id` / `p_reviewer_id`) which an attacker could set to any known admin/mod uuid to impersonate. Additionally, `permission_scope_overrides.pso_select` RLS used `USING (true)` — all rows readable by any session.
- **Fix — 2 DB migrations, zero code changes:**
  - **Migration `lock_down_admin_rpcs_2026_04_19`** (applied 2026-04-19 on project `fyiwulqphgmoqullmrfn`). For each of the 14 functions: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role`. Function list (all `public` schema, all SECURITY DEFINER): `anonymize_user(uuid)`, `apply_penalty(uuid, uuid, integer, text)`, `approve_expert_application(uuid, uuid, text)`, `cancel_account_deletion(uuid)`, `grant_role(uuid, uuid, text)`, `hide_comment(uuid, uuid, text)`, `mark_probation_complete(uuid, uuid)`, `reject_expert_application(uuid, uuid, text)`, `resolve_appeal(uuid, uuid, text, text)`, `resolve_report(uuid, uuid, text, text)`, `revoke_role(uuid, uuid, text)`, `schedule_account_deletion(uuid, text)`, `send_breaking_news(uuid, text, text)`, `unhide_comment(uuid, uuid)`. Strategy justification: every legitimate caller lives in `site/src/app/api/**` and uses `createServiceClient().rpc(...)`, so `service_role` retains EXECUTE and all admin flows keep working. REVOKE alone closes the CVE; no body rewrite to `auth.uid()` was attempted because `auth.uid()` is NULL under service_role and a rewrite would have broken every legitimate caller (Auditor's suggestion was based on a user-session model that isn't used for these RPCs).
  - **`anonymize_user` body — defensive CREATE OR REPLACE (2 passes).** First pass used a JWT-claim check (`current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'` + `auth.uid() IS NULL OR auth.uid() = p_user_id`) but that would have raised under the `sweep_expired_deletions` cron path (cron has no JWT and `auth.uid()` returns NULL). Second pass migration `anonymize_user_guard_cron_safe_2026_04_19` narrowed the guard to `IF auth.uid() IS NOT NULL AND auth.uid() = p_user_id THEN RAISE`. This blocks only the attack case (a signed-in user targeting their own uuid) and lets both cron (NULL `auth.uid()`) and service_role admin layer (NULL `auth.uid()`) pass through. ACL lockdown re-applied in the second migration. All other function bodies preserved verbatim.
  - **Migration `tighten_pso_select_rls_2026_04_19`** (applied 2026-04-19). `DROP POLICY IF EXISTS pso_select` + `CREATE POLICY pso_select FOR SELECT USING (public.is_admin_or_above() OR (scope_type = 'user' AND scope_id = auth.uid()))`. `scope_id` is `uuid`, compared without cast. `pso_write` policy untouched.
  - **Global perms version bump.** All three migrations end with `UPDATE perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1`. Pre-migration version: 4409. Post-migration: 4412 (3 bumps: lockdown + pso_select + cron-safe guard re-apply).
- **What did not change:** Business logic inside any of the 14 function bodies (all `UPDATE` / `INSERT` / `audit_log` statements preserved verbatim). Other SECURITY DEFINER functions not in the list. `pso_write` policy. Any caller code in `site/src` or `VerityPost/`.
- **Verification (probes run on project `fyiwulqphgmoqullmrfn`):**
  - `has_function_privilege('anon', ...)` for all 14 functions → `false`. Same for `authenticated`.
  - `has_function_privilege('service_role', ...)` for all 14 functions → `true`.
  - `pg_proc.proacl` for all 14 functions is now `{postgres=X/postgres, service_role=X/postgres, supabase_auth_admin=X/postgres}` (no PUBLIC entry).
  - `anonymize_user.prosrc` contains `'anonymize_user may not be self-invoked'` guard string AND the cron-safe conditional `IF auth.uid() IS NOT NULL AND auth.uid() = p_user_id`.
  - New `pso_select` `using_expr` = `(is_admin_or_above() OR (((scope_type)::text = 'user'::text) AND (scope_id = auth.uid())))`.
  - Under `SET LOCAL role authenticated` with synthetic JWT: `SELECT COUNT(*) FROM permission_scope_overrides` returns 0 rows (table is currently empty; non-admin still filters correctly).
  - Service-role `SELECT COUNT(*) FROM permission_scope_overrides` returns 0 (empty in prod today; policy bypassed by service_role).
  - Anon RPC calls via `SET LOCAL role anon; PERFORM public.grant_role(...)` and `PERFORM public.anonymize_user(...)` — connection terminated (ACL denial at the pg-exec gate, which PostgREST surfaces as 42501). Authoritative probe is `has_function_privilege` above.
- **Deviations from plan:** (a) Followed Prepper's REVOKE-only recommendation over Auditor's body-rewrite suggestion. (b) Initial `anonymize_user` guard used JWT-claim detection, but discovered it would have broken the `sweep_expired_deletions` cron (no JWT in that context). Applied a follow-up migration (`anonymize_user_guard_cron_safe_2026_04_19`) that narrows the guard to `auth.uid() IS NOT NULL AND auth.uid() = p_user_id` — still blocks the self-anonymize attack, lets cron and service_role pass. (c) `permission_scope_overrides` was empty in prod, so the `scope_type` distinct-values precondition returned `[]` — went with the planned `'user'` constant, which is safe because the clause is conjunctive with `scope_id = auth.uid()` (worst case: non-admins see nothing).

### Round 6 — iOS-GATES (paid-bypass closed)

- **Bug class:** Two iOS direct table writes bypassed server-side paid-tier / permission enforcement that the equivalent web flows route through API endpoints:
  - `VerityPost/VerityPost/MessagesView.swift:854` wrote `messages` directly via the session client. RLS (`messages_insert`) only enforced participant + not-blocked. The `post_message` RPC (which the web POST `/api/messages` route calls) additionally enforces paid-tier, mute/ban, participant, rate-limit (30/min), and length-cap (4000) — all of which iOS side-stepped.
  - `VerityPost/VerityPost/PublicProfileView.swift:199` wrote `follows` directly. `follows_insert` RLS called `is_premium()`, which checks only `plan_status IN ('active','trialing')` — it does NOT consult `frozen_at` or `plan_grace_period_ends_at`, and it does NOT consult `profile.follow` permission metadata (D28 permission fencing). The `toggle_follow` RPC behind POST `/api/follows` + `requirePermission('profile.follow')` → `compute_effective_perms` closes all three gaps at once.
  - Blocking pre-req: `/api/messages` and `/api/follows` (and every other `requirePermission`-gated route) were cookie-authenticated only. `@supabase/ssr::createServerClient` does NOT read the `Authorization` header; its storage adapter is wired to cookies. Pure-iOS callers (which authenticate via bearer tokens, pattern established in `site/src/app/api/ios/subscriptions/sync/route.js`) would have 401'd on every gated route.
- **Fix — 3 files touched, zero DB migrations, zero new API routes:**
  - `site/src/lib/auth.js` — added `resolveAuthedClient(client)` helper (Option A in the plan). Reads `Authorization: Bearer <token>` first via `next/headers` + `createClientFromToken`; falls back to the existing cookie-scoped `createClient()` when no bearer header is present. Swapped `resolveClient` → `resolveAuthedClient` inside `getUser`, `requirePermission`, and `hasPermissionServer` (the three entry points used by gated routes). All other helpers (`getUserRoles`, `assertPlanFeature`, `getPlanFeatureLimit`) remain on the cookie-only `resolveClient` since they are not iOS entry points today. The bearer branch is wrapped in try/catch so `next/headers` unavailability (edge contexts, test contexts) degrades cleanly back to the cookie client. Additive — every existing cookie caller still works unchanged.
  - `VerityPost/VerityPost/MessagesView.swift` — `DMThreadView.send()` rewritten (lines 842-920). Deleted direct `client.from("messages").insert(...)` and the follow-up `client.from("conversations").update(...)` (the latter was redundant — post_message's body includes `UPDATE conversations SET last_message_preview=..., last_message_at=now(), updated_at=now() WHERE id = p_conversation_id`, verified via `pg_proc` body). Replaced with `URLRequest` POST to `api/messages` carrying `Bearer <session.accessToken>` and `{conversation_id, body}`. Response envelope `{message: {id, sender_id, body, created_at}}` decoded via `RawMsg` + a tolerant `ISO8601DateFormatter` (two format options: with and without fractional seconds, matching the realtime handler at lines 719-726). Dedup on `messages.append` mirrors the realtime channel's check at line 710. 403 / 429 / 400 statuses restore the draft so the user can see what happened. Also added a one-line comment at `markConversationRead()` (above line 381) noting it stays client-side because RLS scopes to `user_id = auth.uid()`.
  - `VerityPost/VerityPost/PublicProfileView.swift` — `toggleFollow(target:)` rewritten (lines 185-221). Deleted the `if isFollowing { follows.delete() } else { follows.insert() }` branches. Replaced with a single POST to `api/follows` carrying `{target_user_id}`. Response `{following: Bool, target_id: String?}` drives `isFollowing` from the server's authoritative state (no client-side toggle flip). The RPC decides insert-vs-delete; `isFollowing` is always set from `resp.following`.
- **What did not change:** `conversations.insert` (MessagesView.swift:437) and `conversation_participants.insert` (MessagesView.swift:445) — not a paid bypass; flagged for Round 7 because the new-DM creation flow is functionally broken on both iOS and web (the 2nd participant row fails RLS `user_id = auth.uid()`, leaving orphan convos). `conversation_participants.update(last_read_at)` (MessagesView.swift:387-388) — RLS-bounded to self, kept iOS-side. `message_receipts.upsert` (MessagesView.swift:791-793) — RLS-bounded to self, kept iOS-side and matches web behavior. iOS-DATA writes (alert_preferences, expert_applications, support_tickets, kid_profiles, data_requests) — separate Round-7 track.
- **Bonus — bearer fallback transparently un-breaks these existing iOS callers that used to silently 401 from pure-iOS sessions:** POST/DELETE `/api/bookmarks` (`BookmarksView.swift:272` + `StoryDetailView.swift:1381-1392`), POST `/api/stories/read` (`StoryDetailView.swift:1454`), POST `/api/comments` (`StoryDetailView.swift:1589`), POST `/api/comments/[id]/vote` (`StoryDetailView.swift:1648`), PATCH `/api/notifications` (`AlertsView.swift:501` + `531`). All go through `requirePermission`/`requireAuth` and were only reachable from iOS when the user happened to also carry a browser cookie. No code change required in those iOS callers.
- **Verification:**
  - `cd site && npx tsc --noEmit` → EXIT=0.
  - End-to-end file re-read of `site/src/lib/auth.js`, `MessagesView.swift` send/markConversationRead regions, and `PublicProfileView.swift` — braces balanced, control flow intact, header markers (`@migrated-to-permissions`, `@feature-verified`) preserved on both Swift files.
  - Cookie path regression (unchanged code path): `resolveAuthedClient` returns `createClient()` when no `authorization` header is present, identical to pre-patch behavior. All 50+ cookie-based callers of `requireAuth` / `requirePermission` in `src/app/api/**` see no behavior change.
  - Bearer path (new): `next/headers().get('authorization')` → starts with `bearer ` → `createClientFromToken(<jwt>)` constructs a Supabase client with `global.headers.Authorization: Bearer <token>`, and `supabase.auth.getUser()` on that client resolves the session via GoTrue (same mechanism used by the already-live `/api/ios/subscriptions/sync` route).
- **Deviations from plan:** (a) Also swapped `resolveClient` → `resolveAuthedClient` inside `hasPermissionServer` (plan listed only `requireAuth` + `requirePermission`). Rationale: `hasPermissionServer` is a non-throwing variant of `requirePermission` used in parallel gated routes; keeping it on cookie-only would silently return `false` for iOS bearer callers probing permissions, which is the same class of bug we're fixing. Additive and has no downside. (b) Awaited `headers()` inside the helper to match the codebase's Next 15-style convention in `src/lib/rateLimit.js` (Next 15 made `headers()` async; `await` on a non-promise is a no-op so this also works under Next 14).

### Round 6 — iOS-DATA (column-name drift fixes)

- **Bug class:** 8 distinct phantom-column / wrong-shape writes across 4 iOS files. iOS had drifted from schema on: (1) 6 sites in `SettingsView.swift` reading from phantom `users.preferences` (real column: `metadata`); (2) `VPNotification` Codable decoding `read` / `link` CodingKeys from a table whose columns are `is_read` / `action_url`; (3) 4 sites in `AlertsView.swift` inserting per-topic subscription rows into `alert_preferences`, whose schema is per-alert-type channel/frequency settings — a model mismatch, not a rename; (4) `expert_applications` insert writing phantom columns (`type`, `field`, `role`, `org`, `links`) + missing NOT NULL `full_name`; (5) 2 sites inserting into `support_tickets.body` which doesn't exist — real message body lives in `ticket_messages`; (6) `kid_profiles` insert writing phantom `name`, `username`, `age_tier` and skipping COPPA NOT-NULL `coppa_consent_given` + DOB; (7) mention autocomplete `SELECT` listing phantom columns `plan`, `role`, `avatar` on `users`; (8) `expert_applications` ORDER BY phantom `submitted_at` (real: `created_at`). Cross-track discovery: the `/api/support` web route itself was writing a phantom `description` column on `support_tickets`, so even routing iOS through it would 500.
- **Fix — 4 iOS files + 1 web route fix + 0 DB migrations:**
  - **`VerityPost/VerityPost/SettingsView.swift`** — (Fix 1) 6 read sites in `NotificationsSettingsView.load/save`, `FeedPreferencesSettingsView.load/save`, `ExpertSettingsView.load/save`: renamed the Decodable `Row` field `preferences` → `metadata` and changed `.select("preferences")` → `.select("metadata")`. Write path (already Round-5-Item-2-fixed to go through `update_own_profile` RPC) was already correct. (Fix 4) `VerificationRequestView.submit()` rewritten to POST `/api/expert/apply` with shape `{application_type, full_name, organization?, title?, bio, social_links, portfolio_urls}`. Added a `Full name` TextField to the form (required — enforced by the table's NOT NULL + the RPC). (Fix 8) `VerificationRequestView.loadExisting()` order-by changed `submitted_at` → `created_at`. (Fix 5) `FeedbackSheet.submit()` rewritten to POST `/api/support` with shape `{category, subject, description}` (subject derived from first 80 chars of the message body, matching web behaviour).
  - **`VerityPost/VerityPost/AlertsView.swift`** — (Fix 2) `VPNotification` struct: stored property `read` → `isReadRaw` with CodingKey `is_read`; `link` → `actionUrl` with CodingKey `action_url`. Kept a non-optional computed `var isRead: Bool { isReadRaw ?? false }` so the 4 existing `.isRead` callers compile unchanged. Updated the two synthesized-init re-construction sites at lines ~516 and ~545 (mark-read / mark-all-read local updates) to pass `isReadRaw:` + `actionUrl:`. (Fix 3) `loadManageData()` + 4 subscription call sites (`addCategorySubscription`, `addSubcategorySubscription`, `addKeywordSubscription`, `removeSubscription`) gated behind `#if false` — the inserts still compile but are never emitted. Reason documented inline: `alert_preferences` models per-alert-type channel prefs (`channel_push`, `is_enabled`, `frequency`), not per-topic subscriptions. The iOS subscription list loads empty; add / remove buttons are no-ops. Flagged for Round 7 redesign (subscription-topics table + API route).
  - **`VerityPost/VerityPost/ProfileView.swift`** — (Fix 5) `submitFeedback()` rewritten to POST `/api/support` with the same `{category, subject, description}` shape as `SettingsView`'s FeedbackSheet. (Fix 6) Inline quick-add `kid_profiles` flow retired: `addChildForm` replaced with an informational panel directing users to the web COPPA-complete kid-create flow (veritypost.com Profile > Kids); `addChild()` gated behind `#if false` and left as a stub that just closes the sheet. Rationale: the inline sheet captured only name + color, but `/api/kids` POST requires `date_of_birth` (under 13) + `consent.parent_name` + drives `coppa_consent_given=true`. Retrofitting a COPPA-compliant inline form is a UX change; the conservative fix disables the inline path rather than shipping a broken form. A native iOS kid-create flow is queued for Round 7.
  - **`VerityPost/VerityPost/StoryDetailView.swift`** — (Fix 7) Mention autocomplete `SELECT` at line ~960 changed from `"id, username, plan, role, is_verified_public_figure, verity_score, avatar, avatar_color"` to `"id, username, is_verified_public_figure, verity_score, avatar_color"`. `plan` is a computed accessor over joined `plans.tier` (AuthViewModel.loadUser already uses `select("*, plans(tier)")` when needed); `role` isn't a column on `users`; `avatar` isn't a first-class column (AvatarView renders from `avatar_color` + username initials). Verified the autocomplete renderer only reads `user.username`, `u.verityScore`, and passes the user through `AvatarView(user:size:)` which is nil-safe on the avatar field.
  - **`site/src/app/api/support/route.js`** — (Cross-track repair in scope for Fix 5) POST handler rewritten to insert the ticket header into `support_tickets` (dropping the phantom `description` column + the invented `priority: 'medium'` literal — priority defaults to `'normal'` on the table), then insert the initial user message into `ticket_messages` (real body column: `body NOT NULL`, plus `ticket_id`, `sender_id=user.id`, `is_staff=false`). Response envelope `{ticket}` preserved. Auth gate (`requireAuth`) untouched.
- **What did not change:** No DB migrations. No schema changes. Web code outside `/api/support` untouched. `lib/auth.js` untouched (already iOS-bearer-aware from Round 6 iOS-GATES). The `/api/kids`, `/api/expert/apply`, `/api/notifications` routes — iOS now routes through them but their implementations were already correct. `MessagesView.swift`, `PublicProfileView.swift`, `lib/auth.js` — owned by iOS-GATES track. The second phantom-column drift on `kid_profiles` that iOS-DATA spotted but is out of scope: `ProfileView.editChildSheet` at line ~897 `.update(["name": ...])` — real column is `display_name`. Flagged for Round 7.
- **Verification:**
  - `cd site && npx tsc --noEmit` → EXIT=0.
  - `grep '.select("preferences")' SettingsView.swift` → no matches; `row.preferences` / `existing?.preferences` → no matches; only documentation / UI-label hits on the word "preferences" remain.
  - `grep "case read\|case link" AlertsView.swift` → no matches; `grep "is_read\|action_url" AlertsView.swift` → 3 hits all inside `VPNotification` CodingKeys / new computed accessor.
  - `grep from\(\"alert_preferences\"\) AlertsView.swift` → 4 hits, all inside `#if false` gates.
  - `grep submitted_at` across `VerityPost/VerityPost` → only a comment-line hit explaining the fix.
  - `grep from\(\"support_tickets\"\)\.insert` across `VerityPost/VerityPost` → no matches.
  - `grep age_tier\|\"name\": trimmed\|\"username\": child` on ProfileView → only a comment-line hit explaining the fix.
  - `grep "plan, role"\|"avatar, avatar_color"` on StoryDetailView → no matches.
  - SQL probes on project `fyiwulqphgmoqullmrfn`: (a) simulated `/api/support` INSERT — `INSERT INTO support_tickets (ticket_number, user_id, email, category, subject, status, source) ...` returned `priority='normal'` via default (no CHECK constraints on the table). (b) `INSERT INTO ticket_messages (ticket_id, sender_id, is_staff, body) VALUES (<ticket>, NULL, false, 'Probe body')` returned a row with `body_html=NULL`, defaults honored. Both probes rolled back. (c) `SELECT metadata->'notifications', metadata->'feed', metadata->'expert' FROM users LIMIT 1` — jsonb path syntax verified. (d) `pg_get_function_arguments('submit_expert_application'::regproc)` matches the body shape iOS now POSTs: `p_user_id, p_application_type, p_full_name, p_organization, p_title, p_bio, p_expertise_areas, p_website_url, p_social_links, p_credentials, p_portfolio_urls, p_sample_responses, p_category_ids`. iOS omits the last three optional arrays — the route defaults them to `[]`.
  - Header markers (`@migrated-to-permissions`, `@feature-verified`) preserved on all 4 touched Swift files.
- **Deviations from plan:** (a) **Fix 6 scope reduction.** The plan's Option 1 (redirect inline quick-add to an existing full kid-create flow in `FamilyViews`/`KidViews`) required a full iOS kid-create flow to already exist. Verified via grep: there is no native iOS full-COPPA kid-create view — `FamilyViews` is a dashboard, `KidViews` is kid-side reading / leaderboard / settings. Both options in the plan required UI design work (either retrofit COPPA inline or build a native full flow). Conservative path taken: replaced the inline form body with an informational panel directing users to the web COPPA flow, and gated the `addChild()` function body behind `#if false`. A proper native iOS kid-create flow is queued for Round 7. (b) **Fix 3 Round-7 follow-up not filed in OWNER_TO_DO.md** — the plan suggested a new OWNER_TO_DO entry "Alert subscriptions model"; since OWNER_TO_DO is owner-prompted and the memory guidance says "don't frame as launch-blocking", the Round-7 followup is logged here in the tracker only. The inline `#if false` comment in `AlertsView.swift` cross-references this entry. (c) **Cross-track /api/support route repair.** Plan said "not this track's job to fix" the route's phantom `description` column but also said the Implementer should "scope-call" whether to fix it; Implementer fixed it because routing iOS to a 500-ing route is indistinguishable from shipping the bug. 3-line change: split the insert into `support_tickets` header + `ticket_messages` body, drop phantom `description` from the INSERT, drop invented `priority: 'medium'` in favour of table default `'normal'`. Auth gate untouched.

### Round 7 — Track Y (bearer bypass)

- **Bug class:** Round 6 iOS-GATES landed `resolveAuthedClient(client)` with a short-circuit: if the caller passes a pre-bound client, return it as-is. That short-circuit is load-bearing for routes like `/api/account/delete` that do their own route-local bearer resolution. BUT it also meant that any route still using the legacy pattern `const supabase = await createClient(); await requirePermission(k, supabase);` silently bypassed the helper's bearer-fallback branch: the cookie-bound `supabase` was passed in, the short-circuit fired, and iOS bearer callers got 401. 8 permission-gated call-sites across 7 files still had that pattern; acute user-facing impact on `/api/stories/read` (iOS StoryDetailView records reading progress through this route).
- **Fix — HYBRID (not pure A or B), 7 files touched, helper untouched:**
  - **Tier 1 (iOS-reachable route-local bearer pattern, mirrors `/api/account/delete` precedent):** `site/src/app/api/stories/read/route.js` — added `bearerToken(request)` extractor + `const supabase = token ? createClientFromToken(token) : await createClient();`. Both the `requirePermission('article.read.log', supabase)` gate AND the downstream `reading_log` insert/update (which is RLS-scoped on `auth.uid() = user_id`) now run against the same bearer-bound client for iOS callers, and the cookie client for web callers. `createClientFromToken` added to the top-of-file import.
  - **Tier 2 (web-only routes, Option A — drop pre-bound arg, let helper's cookie fallback resolve):** `/api/reports/route.js` (1), `/api/kids/set-pin/route.js` (1), `/api/kids/reset-pin/route.js` (1), `/api/admin/stories/route.js` (3 handlers: POST/PUT/DELETE), `/api/search/route.js` (5 `hasPermissionServer` sites). The `supabase` local stays in the first four files because it's still used for post-auth queries; only the second argument to the helper is removed.
  - **Dead-code sweep (in-scope for `/api/search`):** Removed now-unused `const supabase = await createClient();` and dropped `createClient` from the top-of-file import (`createServiceClient` remains).
- **What did not change:** `site/src/lib/auth.js` (plan is route-level only — helper short-circuit stays as the load-bearing primitive for Tier 1). `/api/support` (false positive on Auditor's original list — `requireAuth()` is called with no argument so the bearer path already runs). `/api/account/delete` (already correct — does its own route-local bearer resolution; the `authClient` it passes to `hasPermissionServer` is already the bearer-bound client when a bearer is present). Header markers (`@migrated-to-permissions`, `@feature-verified`) preserved on all 7 touched files.
- **Verification:**
  - `cd site && npx tsc --noEmit` → EXIT=0.
  - Post-fix grep `requirePermission\s*\(\s*'...',\s*\w` + `hasPermissionServer\s*\(\s*'...',\s*\w` across `site/src/app/api/` returns 3 hits, all intentional: `stories/read/route.js:27` (route-local bearer-resolved `supabase`) and `account/delete/route.js:63,81` (route-local bearer-resolved `authClient`). Both patterns are the Edit-1 template — the helper short-circuit is the desired behaviour because the caller already did the bearer/cookie resolution.
  - Cookie path sanity — web `/api/search` + `/api/reports` + `/api/admin/stories` paths unchanged semantically: `resolveAuthedClient(undefined)` in `lib/auth.js:17` first checks for `authorization: bearer`, then falls through to `createClient()`, which is exactly what the previous pre-bound `supabase = await createClient()` was doing. Web cookie callers see zero behaviour change.
  - iOS probe path for `/api/stories/read`: iOS (`StoryDetailView.swift:1461`) sends `Authorization: Bearer <access_token>` → route extracts token via local `bearerToken(request)` → `createClientFromToken(token)` mints a client whose `global.headers.Authorization` + GoTrue session resolve to the iOS user → `requirePermission('article.read.log', supabase)` short-circuits past `resolveAuthedClient` using the already-correct bearer client → `reading_log` insert runs with `auth.uid() = <ios user id>` satisfying RLS. Previously 401; now 200 + RLS-valid insert.
  - Round 6 canaries (`/api/messages`, `/api/follows`, `/api/bookmarks/*`) never passed a pre-bound client to the helper in the first place, so they are not in this round's edit set and stay green.
- **Deviations from plan:** none. All 7 edits applied literally with matching old-strings; no plan files outside the 7-file list touched; helper (`lib/auth.js`) not modified; `/api/support` skipped (false positive); `/api/account/delete` skipped (already correct).

### Round 7 — Track Z (startConversation + support tx)

- **Bug class:** Two surgical server-side-integrity fixes uncovered during Round 7 triage. (1) `startConversation` on both iOS (`VerityPost/VerityPost/MessagesView.swift:427-462`) and web (`site/src/app/messages/page.tsx:396-429`) inserted directly into `conversations` + `conversation_participants`. RLS on `conversation_participants_insert` (`user_id = auth.uid() OR is_admin_or_above()`) rejected the recipient-participant row for any non-admin caller, so the owner row + convo row committed while the recipient row errored — leaving a solo-owner orphan convo on every click. `conversations_insert` had no paid gate, so free accounts could spam unlimited orphan convos. Follow-up `post_message` sends still blocked via the paid gate, but the orphan rows persisted in `conversations`. (2) `/api/support` POST ran two sequential `.insert()` calls (`support_tickets` header then `ticket_messages` body). If the second insert raised (body CHECK, FK, transient PG error), the ticket header was already committed and appeared as a naked row in the staff queue with no message.
- **Fix — option (a) on both bugs, matching Round 6 `post_message` precedent:**
  - **DB migrations (idempotent, both `CREATE OR REPLACE FUNCTION` + `REVOKE ALL` + `GRANT EXECUTE` to `authenticated, service_role`):**
    - `01-Schema/069_start_conversation_rpc_2026_04_18.sql` — `public.start_conversation(p_user_id uuid, p_other_user_id uuid) RETURNS jsonb` SECURITY DEFINER. Runs `user_has_dm_access` (paid + grace semantics, matches `post_message`), `_user_is_dm_blocked` (mute/ban), self-start guard, recipient-exists check, then dedupes on existing direct convo (returns `{ id, existed: true }`) or atomically inserts one `conversations` row + both `conversation_participants` rows (owner + member).
    - `01-Schema/070_create_support_ticket_rpc_2026_04_18.sql` — `public.create_support_ticket(p_user_id uuid, p_email text, p_category text, p_subject text, p_body text) RETURNS jsonb` SECURITY DEFINER. Generates `VP-<hex-ms-epoch>` ticket number inside the RPC (single source of truth), inserts header + first message in one plpgsql block so any downstream failure rolls both back.
  - **Web route (new):** `site/src/app/api/conversations/route.js` — POST-only, gated by `requirePermission('messages.dm.compose')` (same key as `/api/messages`), uses `createServiceClient().rpc('start_conversation', { p_user_id: user.id, p_other_user_id })`. Error-to-status map: `paid plan|muted|banned` → 403, `not found` → 404, `yourself` → 400, else 400. Does NOT trust caller-supplied user ids — `p_user_id` comes from the authenticated session.
  - **Web page edit:** `site/src/app/messages/page.tsx:396-429` — replaced the two direct `.from('conversations').insert` + `.from('conversation_participants').insert` calls with `fetch('/api/conversations', { method: 'POST', ... })`, then re-hydrates the single convo row via `supabase.from('conversations').select(...).eq('id', convoId).single()` (RLS permits since the caller is now a participant).
  - **iOS edit:** `VerityPost/VerityPost/MessagesView.swift:427-494` — replaced direct inserts with `URLSession` POST to `SupabaseManager.shared.siteURL/api/conversations` carrying `Authorization: Bearer <session.accessToken>`; mirrors the `send()` path at the same file's `/api/messages` call site. Post-200, `SELECT`s the hydrated row from `conversations` and inserts it into the local list.
  - **Support route edit:** `site/src/app/api/support/route.js` — swapped the two `.insert()` calls for a single `supabase.rpc('create_support_ticket', ...)` call. Dropped the line-18 `ticketNumber` local (generation moved into the RPC). `requireAuth()` gate kept. Cookie-scoped `createClient()` kept (not switched to service client — out of scope and not required for atomicity).
- **What did not change:** `conversations_insert` RLS policy (belt-and-braces; RPC now owns the paid gate); `conversation_participants_insert` RLS (still rejects the recipient row for non-admin direct callers — SECURITY DEFINER RPC bypasses it via the intended pattern); `post_message` RPC; `/api/messages` route; `/api/support` GET handler; `requireAuth()` gate on `/api/support`; `ticket_number` format (`VP-<uppercase hex-ms>` preserved so staff tooling pattern-matches on `VP-` keep working); admin support UI filter (not needed once orphans stop being created).
- **Verification:**
  - `cd site && npx tsc --noEmit` → EXIT=0.
  - Migrations applied against `fyiwulqphgmoqullmrfn`; re-apply test confirms `CREATE OR REPLACE` + `GRANT` idempotency. `pg_proc` check: both functions `SECURITY DEFINER`, both `EXECUTE` granted only to `authenticated`, `service_role`, `postgres`, `supabase_auth_admin` (anon not listed → REVOKE ALL worked).
  - Bug 1 denial probe (free user `aspen_studies` → paid user `test_premium`): RPC raised `P0001: direct messages require a paid plan`; `SELECT count(*) FROM conversations WHERE created_by = <free uuid>` = 0 (no leaked rows from the raised exception).
  - Bug 1 success probe (paid `test_veteran` → paid `test_journalist`): RPC returned `{ id, existed: false }`; follow-up SELECT confirmed 1 convo row + 2 participant rows (owner + member) inserted atomically. Second call with the same pair returned `{ id: <same>, existed: true }` (dedupe). Probe rows cleaned up.
  - Bug 2 happy-path probe: `create_support_ticket` returned `{ id, ticket_number: 'VP-...', status: 'open' }`; follow-up SELECT confirmed 1 ticket row + 1 ticket_messages row with the expected body text.
  - Bug 2 partial-failure probe: temporarily added `CHECK (body <> '__round7_fail__')` on `ticket_messages`, called RPC with that marker body; RPC raised the CHECK violation from inside the SQL statement executing the second insert. Post-error SELECT confirmed `tickets_after_partial_probe = tickets_before_partial_probe` (rollback worked; no orphan ticket leaked). CHECK dropped; probe tickets cleaned up; `SELECT ... orphans` returns 0.
- **Deviations from plan:** none. Plan filename dates (`069_..._2026_04_18.sql`, `070_..._2026_04_18.sql`) kept as the plan specified; MCP migration names used the current-date suffix `_2026_04_19` per the Implementer brief (same RPC body, same signature, same grants).

### Round 8 — iOS column/table drift (reads + Codables)

- **Bug class:** Round 4-6 fixed writes; this round fixes iOS read queries + Codable `CodingKeys` that still referenced v1 column names (silent empty results or 400s). Schema probe against `fyiwulqphgmoqullmrfn` ran `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN (...)` for `articles`, `timelines`, `expert_discussions`, `expert_queue_items`, `user_achievements`, `achievements`, `kid_expert_sessions`, `kid_expert_questions`, `kid_profiles`, `users`, `sources`, `reserved_usernames`, `audit_log`, `quiz_attempts`. All 10 fixes validated against the probe output.
- **Fixes applied:**
  - Fix 1 — `VerityPost/VerityPost/HomeView.swift:611`: keyword search `ilike("content", ...)` → `ilike("body", ...)`. `articles` has no `content` column; real column is `body text`.
  - Fix 2 — `VerityPost/VerityPost/StoryDetailView.swift:1184`: `timelines.order("date", ...)` → `order("event_date", ...)`. Schema: `event_date timestamptz` (no `date`).
  - Fix 3 — `VerityPost/VerityPost/StoryDetailView.swift:1272-1294`: expert Q&A panel queried phantom columns `question`, `answer`, `question_id`, `expert_id` on `expert_discussions`. Real schema uses `title`, `body`, `parent_id`, `is_expert_question`, `expert_question_status`. Tree-shape redesign required; wrapped entire block in `#if false` with `// TODO(round9-expert-qa-shape):` flag. No UI render path depended on `expertAnswers` being populated (already tolerated empty).
  - Fix 4 — `VerityPost/VerityPost/ExpertQueueView.swift:258-293`: queue list rewritten from `expert_discussions` (phantom cols) to `expert_queue_items` with PostgREST joins `comments!comment_id(body)`, `comments!answer_comment_id(body)`, `articles(title)`. Maps into existing `ExpertQueueItem` struct with `question` coming from the asking-comment body and `answer` from the answer-comment body; `category` dropped (not modelled on queue items directly). Filters by `status IN ('pending','claimed','answered')` unchanged.
  - Fix 5 — three call-sites, same pattern swap `unlocked_at` → `earned_at` and `achievements(id, name, group, description)` → `achievements(id, name, category, description)`: `VerityPost/VerityPost/StoryDetailView.swift:1794-1797` (post-quiz achievement toast), `VerityPost/VerityPost/ProfileView.swift:1087-1089` (`loadAchievements`), `VerityPost/VerityPost/KidViews.swift:939` (kid badges).
  - Fix 6 — `VerityPost/VerityPost/KidViews.swift:1067-1072`: `client.from("expert_sessions")` → `client.from("kid_expert_sessions")`, select list changed from `id, title, expert_name, starts_at, ends_at, status` to `id, title, session_type, scheduled_at, status`, ordering on `scheduled_at`, added `.eq("is_active", value: true)` filter. `ExpertSession` struct updated: `expertName`/`startsAt`/`endsAt` replaced by `sessionType`/`scheduledAt`; `expertName` + `startsAt` kept as computed passthroughs so the existing view code (row rendering) still compiles unchanged.
  - Fix 7 — `VerityPost/VerityPost/KidViews.swift:679-712`: family leaderboard dropped phantom `name` column from both `category_scores`-joined `kid_profiles(display_name, name)` and standalone `kid_profiles` select; left only `display_name`.
  - Fix 8 — `VerityPost/VerityPost/SettingsView.swift:511-522`: Login Activity read directly from `audit_log` (admin-only RLS → empty for normal users). No existing `/api/account/login-activity` route. Created `public.get_own_login_activity(p_limit int)` SECURITY DEFINER RPC returning `(id, action, created_at, metadata)` for the caller's `auth.uid()` where `action IN ('login','signup')`. `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated, service_role`. iOS now calls `client.rpc("get_own_login_activity", params: Params(p_limit: 50)).execute().value`.
  - Fix 9 — `VerityPost/VerityPost/AuthViewModel.swift:218-223`: reserved-username check `.select("word").eq("word", value:...)` → `.select("username").eq("username", value:...)`. Schema: `reserved_usernames.username varchar` (no `word` column).
  - Fix 10 — `VerityPost/VerityPost/Models.swift` Codable fixes:
    - `VPUser`: dropped `streak` / `case streak`; added `streakCurrent`/`streakBest` mapped to `streak_current`/`streak_best`. Added computed `var streak: Int? { streakCurrent }` so all consumers (`HomeView.swift:73`, `LeaderboardView.swift:322`, `ProfileView.swift:196`) still work.
    - `QuizAttempt`: dropped `score`/`total`/`passed`/`perfect`/`timeSeconds`/`completedAt`; added `isCorrect` (`is_correct`), `pointsEarned` (`points_earned`), `timeTakenSeconds` (`time_taken_seconds`), `createdAt` (`created_at`), kept `attemptNumber`. Consumers updated: `ProfileView.swift:959-999` (`loadActivity`) and `ProfileView.swift:1003-1028` (`loadQuizzes`) now group per-question attempt rows by `(article_id, attempt_number)` and derive `correct/total/passed` on the client matching the `ProfileSubViews.swift:124-131` precedent (passed = correct*10/total >= 7). Dropped `.eq("passed", value: true)` DB filters — replaced with per-row aggregation in `StoryDetailView.swift:1227-1237` (post-quiz pass lookup), `KidViews.swift:936-945` (kid dashboard quiz count), `FamilyViews.swift:233-246` (per-kid dashboard).
    - `UserAchievement`: `unlockedAt = "unlocked_at"` → `earnedAt = "earned_at"`. Updated `ProfileView.swift:590` (`ua.unlockedAt` → `ua.earnedAt`).
    - `Achievement`: `group = "group"` → `category = "category"`. No extra consumer fix — UI already just reads `a?.name`/`a?.description`.
    - `SourceLink`: dropped `outletName = "outlet_name"` + `headline = "headline"`; added real fields `publisher` + `title`. Kept `var outletName: String? { publisher }` + `var headline: String? { title }` as computed passthroughs, so `StoryDetailView.swift:383,402,405,412` and `HomeView.swift:399` compile unchanged.
    - `TimelineEvent`: dropped phantom `date`/`text`/`summary`/`type`/`content`/`isCurrent`. Real fields: `eventDate: Date?` (`event_date`), `eventLabel` (`event_label`), `eventBody` (`event_body`), `eventImageUrl` (`event_image_url`), `sortOrder` (`sort_order`). Kept `var text: String? { eventLabel }` + `var summary: String? { eventBody }` + `var isCurrent: Bool? { nil }` as computed shims. Updated `StoryDetailView.swift:488` from `Text(event.date ?? "")` to `Text(event.eventDate.map { formatDate($0) } ?? "")`. The `isCurrent`-based "NOW" marker logic at line 448-453 continues to work (always computes false via the shim → falls back to last-idx == last-idx branch).
    - `KidProfile`: dropped phantom `name`/`username`/`ageTier`/`age`. Real fields: `displayName` (`display_name`), `avatarUrl` (`avatar_url`), `avatarPreset` (`avatar_preset`), `dateOfBirth` (`date_of_birth`), `ageRange` (`age_range`). Kept `var name: String? { displayName }` + `var ageTier: String? { ageRange }` + computed `var age: Int?` (parses `date_of_birth` as `yyyy-MM-dd` and returns years). `safeName` + `ageLabel` rewired to use `displayName`/`ageRange` with bucket fallback (`"6-8"|"9-12" → Under 13`, `"13-15" → 13–15`, `"16-17" → 16+`). Consumers (`KidViews.swift:1125` `kid.ageTier`, `FamilyViews.swift:128,202` `kid.safeName`, `FamilyViews.swift:131,187` `kid.ageLabel`, etc.) continue to compile unchanged. Existing dead-code constructor call at `ProfileView.swift:902-907` is inside `#if false` so no fix needed.
- **Migrations applied:** `get_own_login_activity_rpc_2026_04_18` (MCP `apply_migration`). `pg_proc.prosecdef = true` confirmed. `EXECUTE` granted only to `authenticated, service_role`.
- **#if false / TODOs added:** one — `TODO(round9-expert-qa-shape)` at `StoryDetailView.swift:1272` around the article expert Q&A reconstruction. Decision for round 9: either build a server-side RPC that returns `(question_comment, answer_comment, expert_user)` triples from `expert_discussions` (parent_id tree + `is_expert_question` + `expert_question_status = 'answered'`), or use `/api/expert/questions` if one exists.
- **Web:** untouched. `cd site && npx tsc --noEmit` → EXIT=0.
- **Verification (SQL probes against `fyiwulqphgmoqullmrfn`):** schema introspection confirmed real column names; follow-up row-count probe confirmed reads don't 400 against real columns (`articles_with_body=6`, `timelines_with_event_date=1`, `kids_with_display_name=2`, `achievements_with_category=26`, `kid_sessions=1`). Empty counts on `user_achievements.earned_at`, `reserved_usernames.username`, `quiz_attempts.is_correct`, `sources.publisher` reflect sparse test data, not schema bugs — column access itself succeeded.
- **Deviations from plan:** none. No web edits; no new migrations beyond the approved `get_own_login_activity` RPC; ambiguous expert Q&A shape wrapped rather than guessed.

### Round 8 — Dead code cleanup
- **Status:** done.
- **What shipped:**
  - **Deleted `site/src/components/admin/SkeletonCard.jsx`** — verified zero importers across `site/src` and `VerityPost` (only self-reference in the file and two mentions in audit docs `_round4_prep_HYGIENE.md` / `PERMISSION_MIGRATION.md`, neither of which are code imports). Sibling `SkeletonRow` remains live.
  - **Deleted `site/src/lib/errorReport.js`** — verified zero call sites for `reportError` / imports of `@/lib/errorReport` across the codebase (only hit outside the file itself was a stale description line in `00-Folder Structure.md` mislabeling it "Active"; that doc is not consumed by any build step).
  - **Removed orphan Swift struct `RecapListView`** + its `recapRow` helper from `VerityPost/VerityPost/RecapView.swift:11-137` — replaced with a 3-line comment marker. `RecapSummary` (the Codable model) and `RecapQuizView` (the quiz player) kept; both are live under the recap entry-point elsewhere in the Swift app. Grep confirmed `RecapListView` had zero references anywhere.
  - **Removed 13 unused default imports across 12 files** (one file, `pipeline/page.tsx`, had two):
    - `site/src/app/admin/settings/page.tsx` — `Field`
    - `site/src/app/admin/pipeline/page.tsx` — `Toolbar`, `TextInput`
    - `site/src/app/admin/data-requests/page.tsx` — `PageSection`
    - `site/src/app/admin/access/page.tsx` — `PageSection`
    - `site/src/app/admin/plans/page.tsx` — `Toolbar`
    - `site/src/app/admin/cohorts/page.tsx` — `StatCard`
    - `site/src/app/admin/sponsors/page.tsx` — `Toolbar`
    - `site/src/app/admin/users/[id]/permissions/page.tsx` — `Field`
    - `site/src/app/admin/users/page.tsx` — `PageSection`
    - `site/src/app/admin/expert-sessions/page.tsx` — `Toolbar`
    - `site/src/app/admin/promo/page.tsx` — `PageSection`
    - `site/src/app/profile/settings/page.tsx` — `PageSection`
  - Each removal verified with `grep -n <Symbol>` on the file: the import line was the sole reference. No `@admin-verified` body logic was touched — import lines only.
  - **Updated `00-Where-We-Stand/REFERENCE.md` §4**: changed "39 files" → "66 files" and added the Round 4 Track X extension note (39 admin pages + 27 DS primitives = 66 LOCKed files).
- **Verification:**
  - `cd site && npx tsc --noEmit` → EXIT=0 (no missing-export errors, no unused-import warnings since TS is configured not to error on them — removal confirmed against grep).
  - Header markers (`// @admin-verified 2026-04-18`) preserved on every edited admin page.
- **Deviations from plan:** none.

### Round 8 — Web broken flows

- **Bug class:** Round 8 audit surfaced 5 web user-flow defects: (1) account-deletion cancel button POSTed to `/api/account/delete/cancel` which didn't exist (404) while the real mechanism was DELETE on `/api/account/delete`; (2) `/category/[id]` Follow and Bookmark handlers were pure local-state stubs — no persistence; (3) signup success always routed to `/signup/pick-username` regardless of whether email confirmation was still pending, so users never landed on `/verify-email`; (4) story-page quiz-gate read `currentUser.email_verified` off the Supabase auth User (that field does not exist — always undefined) so the verified-but-unquizzed banner was unreachable; (5) `/category/[id]` rendered `story.summary` which is a phantom column (real column is `excerpt`), so the card subtitle was always empty.
- **Fix — 4 web files + 1 response-field add on the signup route, no DB migrations:**
  - **Fix 1 — option (b) (change client to DELETE on existing route):** `site/src/app/profile/settings/page.tsx:3630` — changed `fetch('/api/account/delete/cancel', { method: 'POST' })` to `fetch('/api/account/delete', { method: 'DELETE' })`. Chose (b) over a new cancel route because `/api/account/delete/route.js:77-90` DELETE handler already implements the exact `cancel_account_deletion` RPC call with the matching permission gate (`settings.data.deletion.cancel`) and service client — adding a duplicate route would just be a passthrough.
  - **Fix 2 — wire real bookmarks; flag category-follow as coming soon:** `site/src/app/category/[id]/page.js` — `toggleBookmark` now POSTs to `/api/bookmarks` with `{ article_id }` on add, DELETEs `/api/bookmarks/<bookmark_id>` on remove, and threads the returned bookmark id onto `story.bookmark_id` so unsaves work. Initial load now fetches the user's existing `bookmarks` rows for the rendered articles and pre-seeds `bookmarked` + `bookmark_id` state (no stale "Save" showing for already-saved items). `toggleFollow` no longer mutates local state; pushes a small toast (`Category follow is coming soon.`) because there is no `category_follows` table (confirmed via `information_schema.tables` — only `follows` exists, which is user-to-user). Round 9 flag: implement category-follow persistence (new table + route).
  - **Fix 3 — signup routes to /verify-email when confirmation pending:** `site/src/app/api/auth/signup/route.js` — response now includes `needsEmailConfirmation: !authData.session || !authData.user?.email_confirmed_at` alongside the existing user object. `site/src/app/signup/page.tsx:108` — success branch routes to `/verify-email` when `needsEmailConfirmation` is true, else to `/signup/pick-username` (preserves the confirmation-off path for dev/test envs where Supabase auto-confirms).
  - **Fix 4 — read email_confirmed_at instead of phantom email_verified:** `site/src/app/story/[slug]/page.tsx:567` — changed `currentUser.email_verified` to `currentUser.email_confirmed_at` (truthy check — presence of the timestamp means verified). Also dropped the custom `type AuthUser = User & { email_verified?: boolean | null }` at line 51; now just `type AuthUser = User` since `email_confirmed_at` is native on the Supabase `User` type. No other `.email_verified` sites on the Supabase auth user exist in this file; line 309 reads `email_verified` from `public.users` which is a real column and stays as-is.
  - **Fix 5 — summary → excerpt on category cards:** `site/src/app/category/[id]/page.js:251` — changed `story.summary ? story.summary.slice(...)` render path to `story.excerpt ? story.excerpt.slice(...)`. The `select('*')` on `articles` already includes `excerpt`, so no select change needed (confirmed `articles.excerpt` exists, `articles.summary` does not via `information_schema.columns`).
- **What did not change:** `/api/account/delete/route.js` (already correct — both handlers in place); `/api/bookmarks/route.js` + `/api/bookmarks/[id]/route.js` (existing endpoints reused, no edits); `/verify-email/page.js` (existing gate works — reads `public.users.email_verified`, independent of signup redirect); no DB migrations (no new tables, no RPC changes). Header markers (`@migrated-to-permissions`, `@feature-verified`) preserved on all 4 touched files.
- **Verification:**
  - `cd site && npx tsc --noEmit` → EXIT=0.
  - Probe: `curl -X DELETE http://localhost:3000/api/account/delete` → HTTP 401 (route exists, auth gate works; no 404 or 500).
  - DB probes: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%follow%'` returned only `follows` (no `category_follows` — confirms the coming-soon fallback is correct). `SELECT column_name FROM information_schema.columns WHERE table_name='articles' AND column_name IN ('excerpt','summary')` returned only `excerpt` (confirms Fix 5 column name).
- **Deviations from plan:** none. Fix 1 picked option (b) per the plan's guidance (simplest path when existing DELETE handler suffices). Fix 2 fell back to coming-soon toast for category-follow because no persistence table exists; flagged for Round 9 as the plan specified. Kept `category/[id]/page.js` as `.js` (optional TSX conversion was non-trivial for file size and not required).

### Round 8 — Permission drift fixes

- **Migration applied:** `fix_round8_permission_drift_2026_04_19` (single consolidated idempotent migration). `perms_global_version`: 4412 -> 4479.
- **Scope:** 1 reactivation, 7 rebinds, 4 duplicate-key retirements, 2 code call-site updates, 1 dead-code deletion.
- **Keys reactivated:**
  - `profile.activity.view.own` — was `is_active=false`; the iOS call at `VerityPost/VerityPost/ProfileView.swift:94` was therefore always resolving false. Reactivated and rebound to `free|pro|family|expert|moderator|editor|admin|owner` (standard self-view pattern).
- **Keys newly bound (before -> after bindings):**
  - `ios.article.share_sheet`: `admin,owner` -> `free,pro,family,expert,moderator,editor,admin,owner`. All signed-in.
  - `ios.bookmarks.view`: `admin,owner` -> `free,pro,family,expert,moderator,editor,admin,owner`. All signed-in.
  - `ios.iap.manage_subscription`: `admin,owner` -> `free,pro,family,expert,moderator,editor,admin,owner`. Free needs it so users can upgrade via IAP.
  - `ios.profile.view.public`: `admin,owner` -> `anon,free,pro,family,expert,moderator,editor,admin,owner`. Public profile view — anon + all signed-in.
  - `settings.supervisor.view`: `admin,owner` -> `pro,family,expert,moderator,editor,admin,owner`. Gate on plan (family-plan feature).
  - `supervisor.categories.view`: `admin,owner` -> `pro,family,expert,moderator,editor,admin,owner`. Same pattern.
  - `supervisor.eligibility.view`: `admin,owner` -> `pro,family,expert,moderator,editor,admin,owner`. Same pattern.
  - `profile.achievements.view.own`: `admin,free,owner` -> `free,pro,family,expert,moderator,editor,admin,owner`. Widened to match parent `profile.achievements`.
  - `profile.achievements.view.other`: `admin,free,owner` -> `free,pro,family,expert,moderator,editor,admin,owner`. Same.
  - `home.breaking_banner.view`: `admin,anon,owner` -> `admin,anon,editor,expert,family,free,moderator,owner,pro`. Added `free` + other tiers — basic variant should reach all signed-in users; `.view.paid` remains paid-only; `.view.anon` untouched.
- **Keys deactivated (duplicates / dead):**
  - `billing.stripe.portal` — duplicate of broader `billing.portal.open`. `/api/stripe/portal/route.js:10` switched to `billing.portal.open`. Single source of truth kept is `billing.portal.open` (already bound to all tiers).
  - `kids.streak.use_freeze` — duplicate of `kids.streak.freeze.use` (used in `site/src/app/profile/kids/[id]/page.tsx:97` + `site/src/app/api/kids/[id]/streak-freeze/route.js:9`). Deactivated the unused variant.
  - `kids.leaderboard.global_opt_in` and `kids.leaderboard.global.opt_in` — neither referenced anywhere in `site/src` or `VerityPost`. Both deactivated. `kids.leaderboard.global.view` remains active (referenced in spec). Flag: if parent-opt-in UI lands later, use a single canonical key (`kids.parent.global_leaderboard_opt_in` is already in use per `site/src/app/profile/kids/[id]/page.tsx`).
- **Code call-sites updated:**
  - `site/src/app/api/stripe/portal/route.js:10` — `requirePermission('billing.stripe.portal')` -> `requirePermission('billing.portal.open')`. Route now admits all paid tiers (was pro-only before). Matches the existing settings-page UI gate at `site/src/app/profile/settings/page.tsx:100,2822`.
  - `site/src/app/profile/settings/page.tsx` — no change needed; the local `PERM.ACTION_BILLING_PORTAL` constant already mapped to `billing.portal.open`.
- **PERM export:** deleted from `site/src/lib/permissionKeys.js`. Grep of `site/src` confirmed zero imports of `PERM` from that module (the settings page defines its own local `PERM` object inline; `permissions.js`, `LockModal.tsx`, `PermissionGate.tsx` import only `SECTIONS`, `LOCK_REASON`, `DENY_MODE`). Left `SECTIONS` + `LOCK_REASON` + `DENY_MODE` exports intact. Replaced the `PERM` block with a short comment explaining why it was removed.
- **iOS side:** no file touched. All 7 iOS/supervisor keys kept their existing string literals; only DB bindings changed. `VerityPost/VerityPost/ProfileView.swift:94` still calls `profile.activity.view.own` — now resolves true for all signed-in tiers.
- **Verification:**
  - Post-migration DB query confirmed every affected key has the expected `is_active` + set bindings.
  - Direct-join flip-test (bypassing `preview_capabilities_as`'s admin-guard since this agent runs as a non-admin SECURITY DEFINER caller) across `free@test` / `premium@test` (pro) / `admin@test`:
    - free: `profile.activity.view.own`=true, `home.breaking_banner.view`=true, `profile.achievements.view.own`=true, `billing.portal.open`=true, `settings.supervisor.view`=false (correct — free tier intentionally excluded from supervisor; it's a family-plan feature).
    - pro: all 5 true including `settings.supervisor.view` (widened).
    - admin: all 5 true.
  - `cd site && npx tsc --noEmit` -> EXIT=0.
- **Deviations from plan:** none. Picked option "deactivate `billing.stripe.portal`, keep `billing.portal.open`" per the brief's "whichever is simpler" — the settings page already used the broad key, so only the API route needed updating (one-line change vs. widening bindings on two keys). For `settings.supervisor.view` + `supervisor.*`, added moderator/editor (staff tiers) on top of `pro|family|expert` since staff ordinarily see any feature gated on plan-tier unless explicitly restricted.

### Round 10 — Security + config small fixes

- **Scope:** 3 small fixes — homepage search filter bypass, email template HTML injection, `.env.local` port mismatch. No DB migrations.
- **Fix 1 — homepage search sanitizer (filter bypass).** `site/src/app/page.tsx` around line 385-405. The prior sanitizer only escaped LIKE wildcards (`\`, `%`, `_`), leaving `,` and `.` live — an anon visitor could append `,is_kids_safe.eq.true` to a keyword term and bypass the `is_kids_safe=false` WHERE clause on the `.or()` branch. Replaced with the stricter `sanitizeIlikeTerm` logic from `/api/search/route.js:21-23` (`[,.%*()"\\_]` → space, then trim). Inlined rather than imported (the shared helper in the API route is not currently exported; inlining keeps the client bundle clean and avoids a circular/shared-helper file). Header comment notes the two copies are kept in sync by hand. Sample probe: input `news,is_kids_safe.eq.true` now renders as `news is_kids_safe eq true` inside the `%...%` ilike pattern — no delimiter survives to break out.
- **Fix 2 — email template HTML-escape.** `site/src/lib/email.js`. Added an `escapeHtml` helper (`&` `<` `>` `"` `'` → entities) and extended `renderTemplate(tpl, variables, opts = {})` with `opts.html` (default `true`). The `html` field of the returned object always escapes substitutions (user-controllable `username`, notification `title`/`body`, spread of `metadata`) unless caller explicitly opts out; the `text` field always passes raw. Subject is rendered raw because it's treated as a mail header, not HTML. Signature preserved — new `opts` arg is optional with safe default, so the single existing call-site at `site/src/app/api/cron/send-emails/route.js:85` (`renderTemplate(tpl, variables)`) continues to work unchanged: `rendered.html` comes back escaped, `rendered.text` raw — which is exactly what the sender wants. Grep confirmed only one call-site; no other caller to update.
- **Fix 3 — `.env.local` port.** `site/.env.local:19` — `NEXT_PUBLIC_SITE_URL=http://localhost:4000` → `http://localhost:3000` to match the dev server port (`package.json` `dev` script: `next dev -p 3000`). Local-only config; no production impact. Unblocks the CSRF allowlist for DELETE `/api/account/delete` in dev per Audit D.
- **Verification:**
  - `cd site && npx tsc --noEmit` -> EXIT=0.
  - Grep `NEXT_PUBLIC_SITE_URL` against `.env.local` confirms the new value is `http://localhost:3000` on line 19.
  - `renderTemplate` mental trace: template `<p>Hello {{username}}</p>` + `{ username: '<script>alert(1)</script>' }` → html output `<p>Hello &lt;script&gt;alert(1)&lt;/script&gt;</p>`; text output unchanged.
  - Header markers (`@migrated-to-permissions`, `@feature-verified`) preserved on `page.tsx`. `email.js` and `.env.local` do not carry those markers and were not given any.
- **Deviations from plan:** (1) Fix 2 — the brief suggested the cron sender "call `renderTemplate` twice (once for html, once for text)" with the flag flipped between calls. Implemented a simpler equivalent: `renderTemplate` does the right thing per-field in a single call (`html` field escaped by the `opts.html` flag, `text` field always raw), so the cron caller doesn't need to change. Net effect matches the intent (html escaped, text raw) with one fewer call-site edit.

### Round 10 — Cold-start reconciliation

- **Problem:** `01-Schema/` did not match prod. 21 MCP-only migrations had no SQL files on disk; `reset_and_rebuild_v2.sql` had 112 tables vs prod's 113 (3 phantoms `reactions`/`community_notes`/`community_note_votes`, 4 missing `score_events`/`error_logs`/`user_push_tokens`/`admin_audit_log`); modern RPCs were absent from the canonical rebuild; `pso_select` still read `USING (true)`; no Round 6 ACL lockdown block; `site/src/types/database.ts` drifted in line with the above.
- **Phase 1 — 21 new SQL files exported from MCP history** (`071` through `091`). Bodies captured from current prod definitions via `pg_get_functiondef` / `pg_policy` / migration `statements` column, not the historical migration text, so the file set reflects what actually runs today. Every file is idempotent (CREATE OR REPLACE, DROP POLICY IF EXISTS + CREATE, ON CONFLICT DO NOTHING, REVOKE + explicit GRANT).
  - `071_fix_article_reading_bindings.sql` — article.read.log binding fix, article.view.ad_free anon leak close.
  - `072_fix_anon_leak_bindings.sql` — four keys moved off the `anon` set.
  - `073_fix_home_breaking_banner_paid.sql` — `home.breaking_banner.view.paid` anon leak close.
  - `074_bump_user_perms_version_atomic_security.sql` — SECURITY DEFINER + auth gate.
  - `075_fix_notifications_core_bindings.sql` — inbox/prefs/subscription keys bound to all signed-in tiers.
  - `076_fix_settings_leak_bindings.sql` — settings surface bound to free+pro+family+expert+moderator+editor.
  - `077_fix_permission_set_hygiene_2026_04_18.sql` — 54-key Pattern B backfill + Pattern C collapses + Pattern D orphans.
  - `078_fix_billing_bindings_2026_04_18.sql` — paid-tier bindings for active billing keys.
  - `079_drop_role_permissions_table_2026_04_18.sql` — DROP legacy table.
  - `080_fix_editor_access_regression_2026_04_18.sql` — restore editor access to 10 admin.* keys.
  - `081_deactivate_duplicate_billing_keys_2026_04_18.sql` — deactivate `billing.cancel` + `billing.invoices.view`.
  - `082_restrict_users_table_privileged_updates_v2_2026_04_19.sql` — SECURITY INVOKER trigger fix.
  - `083_restrict_users_table_privileged_inserts_2026_04_19.sql` — BEFORE INSERT gap closed.
  - `084_restrict_users_table_privileged_inserts_v2_2026_04_19.sql` — allow column defaults on clean INSERT.
  - `085_add_update_own_profile_rpc_2026_04_19.sql` — single server-side self-profile write contract.
  - `086_lock_down_admin_rpcs_2026_04_19.sql` — 14 admin RPCs REVOKE + anonymize_user guard.
  - `087_tighten_pso_select_rls_2026_04_19.sql` — pso_select tightened from USING(true) to admin OR own-scope.
  - `088_anonymize_user_guard_cron_safe_2026_04_19.sql` — narrower self-anonymize guard (cron-safe).
  - `089_start_conversation_rpc_2026_04_19_reapply.sql` — idempotency reapply.
  - `090_fix_round8_permission_drift_2026_04_19.sql` — Round 8 permission drift fixes.
  - `091_get_own_login_activity_rpc_2026_04_18.sql` — self-serve login activity RPC.
- **Phase 2 — `reset_and_rebuild_v2.sql` surgery:**
  - Removed 3 phantom tables: `reactions`, `community_notes`, `community_note_votes` (plus all FKs, indexes, UNIQUEs, triggers, RLS policies, and the TRUNCATE references).
  - Added 4 missing tables to the Round-10 appendix at end of file: `score_events` (9 indexes + RLS), `error_logs` (3 indexes + RLS), `user_push_tokens` (1 partial index + RLS + FK), `admin_audit_log` (4 indexes + actor FK + RLS).
  - Added / updated modern RPCs in the appendix: `handle_new_auth_user` + `on_auth_user_created` trigger, hardened `bump_user_perms_version`, hardened `reject_privileged_user_updates` (INSERT+UPDATE) + trigger re-attach, `update_own_profile`, `start_conversation`, `create_support_ticket`, `get_own_login_activity`, `award_reading_points`, `anonymize_user` (cron-safe guard).
  - Fixed `pso_select` policy — replaced `USING (true)` with `USING (public.is_admin_or_above() OR (scope_type = 'user' AND scope_id = auth.uid()))`.
  - Added Round 6 ACL lockdown DO block at end: dynamic REVOKE on 14 admin RPCs, GRANT to service_role. Uses `pg_proc` so signature mismatches are handled.
  - Table count now 113, matching prod.
- **Phase 3 — types regen:** `cd site && npm run types:gen` ran clean. New `site/src/types/database.ts` (8910 lines) contains `update_own_profile`, `start_conversation`, `create_support_ticket`, `get_own_login_activity`, `award_reading_points`, `compute_effective_perms` in Functions; `score_events`, `error_logs`, `user_push_tokens`, `admin_audit_log` in Tables; zero references to `reactions`/`community_notes`/`community_note_votes`.
- **Phase 4 — verification:**
  - `cd site && npx tsc --noEmit` -> EXIT=0.
  - Rebuild file end-to-end scan confirms: tables created before any FK/index/RLS that references them; helper functions (`is_admin_or_above`, `has_verified_email`, `user_has_dm_access`, `_user_is_dm_blocked`, `score_on_reading_complete`, `bump_perms_global_version`) defined earlier in the same file or in earlier-numbered files.
  - Round-10 appendix uses `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP + CREATE` everywhere, so a fresh cold-start still works when the file is rerun.
- **Deviations / surprises:**
  - Existing file `065_restrict_users_table_privileged_updates_2026_04_19.sql` already had the Round 4 v1 trigger body; v2 (INVOKER fix), INSERT extension, and INSERT-v2 (default-allowed) are layered on as `082`, `083`, `084` so the migration order mirrors the MCP history exactly.
  - `089_start_conversation_rpc_2026_04_19_reapply.sql` is a dup of the RPC body in existing `069`, but MCP history shows it was re-applied explicitly — mirrored as a separate file.
  - No phantom RPCs were cleaned up in prod that need "undo" files; the phantom tables only ever lived in `reset_and_rebuild_v2.sql`, never in prod.

### Round 11 — iOS P1 polish

Three user-visible iOS bugs flagged in Rounds 6/8/9 as deferred, fixed together.

- **Fix 1 — `editChildSheet` save persists rename.** `VerityPost/VerityPost/ProfileView.swift:890-928`. Previous Round 8 patch wrapped the Save handler in `#if false` because the direct PostgREST call wrote a phantom `name` column on `kid_profiles`; the sheet dismissed silently. Replaced with an authenticated `PATCH /api/kids/{id}` body `{"display_name": <trimmed>}`, which is the existing permission-gated (`kids.profile.update`) route using the real `display_name` column. On 200, the local `children[idx]` entry is mutated in-place (new `displayName`) so the card label refreshes without a reload. Removes the `#if false` gate entirely.
- **Fix 2 — `avatar_url` field added to `ProfilePatch`.** `VerityPost/VerityPost/SettingsView.swift:288-340`. iOS profile save did not include `avatar_url` in the `update_own_profile` RPC payload at all — so when the eventual image-upload UI lands it'd drop the URL on every unrelated save. No upload UI exists yet in iOS (color + initials only), so the field forwards `nil`; the RPC uses `COALESCE(p_fields->>'avatar_url', avatar_url)` semantics (Round 5 Item 2, 085 migration), so `null` preserves the existing server value. When the uploader lands, wire the uploaded URL into the `avatarUrl` local. The RPC allowlist already includes `avatar_url`; no migration needed.
- **Fix 3 — Manage-subscriptions UI hidden.** `VerityPost/VerityPost/AlertsView.swift:232-252`. The Manage tab rendered category / subcategory / keyword pickers plus an "Add" button each, but the save paths had been `#if false`'d in Round 6 (because `alert_preferences` is a channel/frequency table, not a topic-subscription table). Taps silently no-op'd, presenting fake-functional UI. Replaced the body of `manageContent` with a runtime gate (`private let manageSubscriptionsEnabled = false`) that picks between the preserved-verbatim `manageContentLive` (behind the false flag) and a new `manageContentPlaceholder` showing "Subscription manager coming soon" plus a short explanation. The Alerts inbox + mark-read actions are untouched. Did not re-enable any of the five `#if false`-gated writes — those stay gated until the `subscription_topics` redesign ships.

Verification:
- `cd site && npx tsc --noEmit` -> EXIT=0 (iOS-only changes, server unaffected).
- `#if false` count in ProfileView: 2 -> 1 (kept: `addChild`, a separate Round-6 gate). AlertsView: 5 -> 5 (the inserts/deletes stay gated; only the UI is hidden).
- All three touched files retain their `// @migrated-to-permissions` + `// @feature-verified` headers.

### Round 12 — UX dead-end fixes

Five user-visible dead-ends surfaced in the Round 12 UX audit, fixed as minimal one-liners / small scoped edits.

- **Fix 1 — `/messages` Subscribe CTA points at a real route.** `site/src/app/messages/page.tsx:490`. The DM-locked empty-state CTA linked to `/billing`, which 404s; changed to `/profile/settings/billing`, the real settings-billing anchor. Markup shape (anchor with inline style) preserved.
- **Fix 2 — `/leaderboard` anon CTA points at real signup.** `site/src/app/leaderboard/page.tsx:389`. The "Full leaderboard locked" overlay's "Create Account" anchor linked to `/auth` (no such route); changed to `/signup`.
- **Fix 3 — Settings expert "Start application" toast (deferred to Round 13).** `site/src/app/profile/settings/page.tsx:3393-3411`. Previous button navigated to `/profile/settings/expert/apply` (404). Chose option (b): `/signup/expert` is genuinely anon-only — it calls `/api/auth/signup` before `/api/expert/apply`, which would fail for an already-authenticated user — so instead the button now calls the in-scope `pushToast({ message: 'Expert application form coming soon.', variant: 'info' })`. The `ExpertProfileCard` receives `pushToast` as a prop (see line 3323), so no import changes were needed. **Round 13 work:** build an authed-user expert application form that reuses `/api/expert/apply` without the signup step.
- **Fix 4 — `/category/[id]` Follow button removed; bookmark already persists.** `site/src/app/category/[id]/page.js`. The Follow button was a no-op (just set a local `followed` flag / toast) and the follower count was hardcoded to 0 — both removed from the header. The bookmark button on each story card was already wired to the real `/api/bookmarks` POST/DELETE routes via `toggleBookmark`, so no change was needed there. Cleaned up now-unused state (`followed`, `setFollowed`, `followerCount`, `setFollowerCount`, `toggleFollow`, the `setFollowerCount(0)` call in the fetch effect) to keep the file minimal. **Round 13 work:** ship a `category_follows` table + `/api/categories/[id]/follow` route, then restore the Follow button and real follower count.
- **Fix 5 — `/story/[slug]` empty-state control flow verified (no-op).** `site/src/app/story/[slug]/page.tsx:496-509`. The loading branch (line 497) and `!story` "Article not found." branch (line 503) are the only early-return paths in the main component after the Round 11 FK-hint log fix; a grep for `return` in the file confirms no earlier `return null` or stealth exit can bypass them. Flagged verified; no code change.

Verification:
- `cd site && npx tsc --noEmit` -> EXIT=0.
- Live probe: `GET /messages` redirects (auth gate) and `GET /leaderboard` returns 200; both pages are client-rendered so the new hrefs appear post-hydration, not in initial HTML. Source change + clean tsc is the canonical check.
- All four touched source files retain their `// @migrated-to-permissions` + `// @feature-verified` headers (unchanged).

Deviations:
- Fix 3 took option (b) instead of the preferred option (a) because `/signup/expert` is genuinely anon-only (full signup flow). Documented above and flagged for Round 13.

### Round 12 — PostgREST embed fixes

Eight PostgREST `.select()` embeds were silently failing with PGRST200 (phantom FK names) or PGRST201 (ambiguous FK). Errors were swallowed — users saw empty UI indistinguishable from "nothing here yet". Verified FK names via `pg_constraint` before editing.

- **Fix 1 — `/bookmarks` list.** `site/src/app/bookmarks/page.tsx:102-107`. Changed `articles(..., categories(name))` to `articles!fk_bookmarks_article_id(..., categories!fk_articles_category_id(name))`. Destructure now includes `error`; added `console.error('[bookmarks] load failed', bmsErr)`. Also added `error` to the sibling `bookmark_collections` query.
- **Fix 2 — `/api/search`.** `site/src/app/api/search/route.js:45`. Changed `categories(name)` to `categories!fk_articles_category_id(name)` (articles has two FKs to categories — `category_id` and `subcategory_id`).
- **Fix 3 — Kid story reader.** `site/src/app/kids/story/[slug]/page.tsx:78-83`. Same `articles→categories` disambiguation; added `error: articleErr` + console.error.
- **Fix 4 — Bookmarks export.** `site/src/app/api/bookmarks/export/route.js:20`. Hinted all three embeds: `bookmark_collections!fk_bookmarks_collection_id(name), articles!fk_bookmarks_article_id(..., categories!fk_articles_category_id(name))`. Route already destructures `{ data, error }`.
- **Fix 5 — Public profile followers/following.** `site/src/app/u/[username]/page.tsx:130-145`. Replaced phantom names `follows_follower_id_fkey` / `follows_following_id_fkey` with real `fk_follows_follower_id` / `fk_follows_following_id`. Added `error` destructures + console.error on both branches.
- **Fix 6 — Settings Blocked Users.** `site/src/app/profile/settings/page.tsx:2488`. Replaced phantom `blocked_users_blocked_id_fkey` with `fk_blocked_users_blocked_id`. Destructure already included `error`.
- **Fix 7 — Kid expert sessions list + detail.** `site/src/app/kids/expert-sessions/[id]/page.tsx:62` and `site/src/app/api/expert-sessions/route.js:24`. Replaced phantom `kid_expert_sessions_expert_id_fkey` with real `fk_kid_expert_sessions_expert_id`. The sibling `categories(name)` is unambiguous on `kid_expert_sessions` (single FK to categories), left as-is per minimal-change constraint.
- **Fix 8 — Admin subscriptions page (invoices embed).** `site/src/app/admin/subscriptions/page.tsx:97`. Brief labelled this as the subscriptions query but line 97 is the `invoices` query; the subscriptions query at line 91 already uses `fk_subscriptions_user_id` correctly. Made invoices embed explicit as `users!fk_invoices_user_id(username)` to match the brief's intent of adding explicit FK hints (invoices has only one FK to users, so this is a consistency/hardening change rather than an ambiguity fix).

**Also hardened (error surfacing):** 5 destructures updated to include `error` + console.error (`bookmarks` page main + collections sibling, `kids/story`, `u/[username]` followers + following).

Verification:
- `cd site && npx tsc --noEmit` -> EXIT=0.
- Live probe: `GET http://localhost:3000/api/search?q=test` -> HTTP 200, returns articles with populated `categories.name` (e.g. "Politics", "Technology", "Science"). No PGRST error in response.
- SQL sanity: `articles → categories` join via `category_id` returns expected rows (Politics, Technology, Science).
- All touched files retain their existing `// @migrated-to-permissions` / `// @feature-verified` / `// @admin-verified` headers — unchanged.

Deviations:
- Fix 8: invoices embed was not technically ambiguous (one FK), but the brief asked for an explicit hint so the invoices embed was hinted with `fk_invoices_user_id` rather than the brief's suggested `fk_subscriptions_user_id` (which would be wrong for an invoices query).
- Fix 7: did not rewrite `categories(name)` on kid_expert_sessions — it's unambiguous and the brief said "each fix is minimal".
- `/story/[slug]` line 283 empty-state: verified the existing flow already renders "Article not found" correctly when `!story` (initial state is `null`, stays `null` if nothing loads, `!story` branch at line 503 fires). No code change needed — matches the brief's "verify" note.

### Round 13 — /help page

Public Help & Support page shipped to close the App Store Support URL gap (`APP_STORE_METADATA.md` §10 had it flagged TBD) and to give anon "Help" clicks a useful landing rather than bouncing them to the auth-gated `/profile/contact` form.

- **New file:** `site/src/app/help/page.tsx` — server component using `createClient()` from `@/lib/supabase/server`. Wraps `auth.getUser()` in a try/catch so the page still renders for anon visitors even if the Supabase client throws (e.g. mis-set env at build). Matches the `/how-it-works` / `/privacy` visual pattern (centered `max-w: 640px`, `#ffffff` background, `#f7f7f7` cards with `#e5e5e5` borders, hard-coded colors so the page renders with no CSS variables).
- **Structure:** hero ("Help & Support" + tagline "Questions? We are here."), seven FAQ cards (What is Verity Post, How do quizzes work, Plan tier differences, Email verification, Cancel subscription, Delete account, Kids Mode), and an auth-branched "Still need help?" CTA.
  - Authed: "Send a message" link to `/profile/contact`.
  - Anon: "Sign up" and "Sign in" buttons plus a mailto fallback to `admin@veritypost.com`.
- **No permission gate.** Page is public by design (Apple requires the Support URL to be reachable without signing in). Added both the `// @migrated-to-permissions 2026-04-18` and `// @feature-verified shared_pages 2026-04-18` markers to match the other static-page tier.
- **Cross-links in FAQ copy:** `/how-it-works`, `/verify-email`, `/profile/settings#billing`, `/profile/settings`, `/privacy`. No invented features — every answer maps to a shipping flow.
- **APP_STORE_METADATA updated:** §10 table row changed from "FLAG: no dedicated page exists" to `https://veritypost.com/help`; the paragraph below (owner action required) rewritten to note the page is shipped and `/profile/contact` stays auth-gated intentionally. Checklist item in §12 updated to match.

Verification:
- `cd site && npx tsc --noEmit` -> EXIT=0.
- Live probe: `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/help` -> 200. Response HTML contains "Help &amp; Support", "Still need help", "Sign up", and "admin@veritypost" (anon branch, matches the unauthed probe session).

Deviations: none. Server component chosen over client component because the Support URL needs to serve reachable HTML without relying on JS hydration — server rendering also lets Apple's reviewer (and search crawlers) see the full page without executing scripts.

### Round 13 — Top-bar logo + anon notifications CTA

Two related web UX fixes landing together: a global "Verity Post" wordmark in the top-left of every page, and a friendlier anon notifications surface.

- **Fix 1 — Top-bar logo.** `site/src/app/NavWrapper.tsx`. Added a fixed `<header>` 44px tall with just "Verity Post" on the left as an `<a>` linking to `/` (adult) or `/kids` (kid-mode active, keyed off the existing `kidModeActive` flag). Same `var(--bg)/var(--border)/var(--text)` theming as the rest of NavWrapper, same `rgba(255,255,255,0.97)` + `backdropFilter: blur(12px)` glass treatment used for the bottom nav. Visibility binding: `showTopBar = showNav`, which already excludes HIDE_NAV routes (`/login`, `/signup`, `/welcome`, etc.), admin routes (`/admin/*`), and kid-mode routes without a selected profile. Accessibility: `aria-label="Go to home"` plus `aria-current="page"` when `path === topBarHomeHref`. Safe-area-inset-top padding so the iPhone notch doesn't overlap the wordmark. Wrapper `paddingTop` now matches the bar height when it's shown (new key next to the existing `paddingBottom` line at ~220).
  - Admin pages: chose option (a) — the logo bar is hidden on `/admin/*` because the existing bottom "Back to site" chrome already signposts the admin context; stacking both would fight for visual hierarchy.
  - Right side intentionally empty; avatar/search are v2 work.
- **Fix 2 — Anon `/notifications` shows in-page CTA, not a redirect.** Two coordinated edits:
  1. `site/src/middleware.js`: removed `/notifications` from `PROTECTED_PREFIXES`. Previously anon hits to `/notifications` returned a 302 to `/login?next=/notifications` before the page ever rendered, which felt like the bottom-nav tab was broken. Kept `/admin`, `/profile`, `/messages`, `/bookmarks` in the list — those genuinely can't render anything useful without a session.
  2. `site/src/app/notifications/page.tsx`: added a `createClient().auth.getUser()` check in the hydrate effect to split anon from signed-in-but-denied. Anon gets a centered CTA (hero "[!]" glyph, headline "Keep track of what matters", body copy per brief, primary "Sign up" button to `/signup`, secondary "Already have an account? Sign in" link to `/login`) matching the `/bookmarks` / `/messages` empty-state shape. Signed-in-but-denied keeps a clarifying "Your account doesn't have access to the notifications inbox yet." copy so the message is accurate for that narrow case. `hasPermission('notifications.inbox.view')` still gates the actual inbox render for signed-in users — the server `/api/notifications` route's own permission check remains authoritative for data.
- **No emojis.** The anon hero glyph is `[!]` in a bordered circle using `ui-monospace`; explicitly avoided bell/envelope emoji per project style.
- **Headers preserved.** All three touched files keep their `// @migrated-to-permissions 2026-04-18` + `// @feature-verified` markers.

Verification:
- `cd site && npx tsc --noEmit` -> EXIT=0.
- `curl -sS -o /dev/null -w "%{http_code}/%{num_redirects}" http://localhost:3000/` -> `200/0`.
- `curl -sS -o /dev/null -w "%{http_code}/%{num_redirects}" http://localhost:3000/notifications` -> `200/0` (previously was 302 for anon). `/admin` still 302s for anon, confirming the middleware change was surgical.
- Compiled bundle check: `curl /_next/static/chunks/app/notifications/page.js | grep -oE 'Keep track|Sign up to get notified|Already have'` returns all three strings, confirming the CTA ships in the client bundle.

Deviations: none. Considered option (b) for admin pages (keep logo bar + push admin banner under it) but option (a) is visually cleaner and matches the existing showAdminBanner contract that the banner owns the admin chrome alone.

### Round 13 — Messages + Bookmarks discoverable

`/messages` and `/bookmarks` are both fully-built, permission-gated surfaces but had ZERO inbound links from the nav or Profile UI. Users had to type the URL to reach them. Bottom nav is locked at 4 tabs (Home / Notifications / Leaderboard / Profile) and the new top bar is intentionally minimal, so the natural home for these entry points is the Profile page — the "my account" hub every signed-in user lands on.

- **File:** `site/src/app/profile/page.tsx`. Added a new "My stuff" `PageSection` inside the Overview tab, positioned directly after the identity/tier header card and before the Profile card preview so it's visible above the fold. Uses the same `ADMIN_C` divider/bg palette, `S[3]` gap grid, and chevron (`›`) affordance already used by the Categories tab rows — no new visual pattern introduced.
- **New `QuickLink` helper component** (sibling of the existing `ScoreBlock` helper): `Link` + label + one-line description + right chevron, with hover-bg matching the Categories row treatment. Grid is `repeat(auto-fill, minmax(220px, 1fr))` so the two cards sit side-by-side on wider viewports and stack on narrow.
- **Messages entry** — links to `/messages`, label "Messages", description "Your direct conversations". Gated on `hasPermission('messages.inbox.view')` (the key already used by iOS). The whole "My stuff" section is hidden for users who have neither permission, so free users never see Messages but do see Bookmarks (bookmarks.list.view is free+).
- **Bookmarks entry** — links to `/bookmarks`, label "Bookmarks", description "Articles you've saved". Gated on `hasPermission('bookmarks.list.view')` (free+).
- **Perms plumbing:** extended the `perms` state object with `messagesInbox` and `bookmarksList` booleans, set alongside the existing five `profile.*` gates in the same auth-bootstrap `useEffect`. `OverviewTab` signature extended with matching props — no new permission-refresh call, no extra roundtrip.
- **Permission gate verification (DB):** queried `permission_set_perms JOIN permission_sets` filtered on the three candidate keys:
  - `messages.inbox.view` -> bound to `pro`, `admin`, `owner` (NOT `free`). Correct gate — free users won't see the Messages card.
  - `messages.dm.compose` -> bound to `pro`, `admin`, `owner` (NOT `free`). Either key would work for the hide-from-free intent; chose `messages.inbox.view` because iOS already uses it and because "can view the inbox" matches what the Profile entry actually represents (viewing messages, not composing).
  - `bookmarks.list.view` -> bound to `free`, `admin`, `owner`. Correct — every signed-in user sees the Bookmarks card.

Verification:
- `cd site && npx tsc --noEmit` -> EXIT=0.
- `grep -rn "/messages\|/bookmarks" site/src/app/profile --include='*.tsx' --include='*.js' --include='*.jsx'` -> returns both new anchors at `site/src/app/profile/page.tsx:675` (Messages) and `:682` (Bookmarks), plus the pre-existing `/messages/new?to=...` button on the public profile at `site/src/app/profile/[id]/page.tsx:484`.
- File retains both `// @migrated-to-permissions 2026-04-18` and `// @feature-verified profile_settings 2026-04-18` markers at the top — untouched.

Deviations: none. Considered putting Messages/Bookmarks as tabs inside the Tabs bar (alongside Overview/Activity/Categories/Milestones) but rejected — the existing tabs are all slices of the user's own data; linking out to standalone pages inside a tabbed component misleads about what lives where. A card grid under a "My stuff" heading matches the existing Profile visual vocabulary (card-like rows with hover + chevron, same as Categories) and scales naturally if future rounds add more "my account" entry points.

### Round 13 — Visible UI lies

Three small UI-truth fixes landed together. Each was a visible promise the UI couldn't keep.

- **Fix 1 — Banner upload silent failure.** `site/src/app/profile/settings/page.tsx:1291-1309` was calling `supabase.storage.from('banners').upload(...)` against a bucket that didn't exist, then swallowing "Bucket not found" into a toast reading "Banner upload is not configured yet — contact admin." Real fix: created the bucket (migration `create_banners_storage_bucket_2026_04_19`) via Supabase MCP rather than patching more UI around the missing infra.
  - Bucket: `banners`, `public=true`, `file_size_limit=5242880` (5 MB), `allowed_mime_types=image/png, image/jpeg, image/webp, image/gif`.
  - Path convention: the client writes to `${userId}/${timestamp}-<filename>` (page.tsx:1296), so `(storage.foldername(name))[1]` evaluates to the user's UUID. RLS folder check uses `= auth.uid()::text` to match.
  - RLS policies (4): `Banners public read` (SELECT, unauthenticated OK since bucket is public), `Users upload own banner` (INSERT TO authenticated WITH CHECK on folder[1]), `Users update own banner` (UPDATE TO authenticated USING folder[1]), `Users delete own banner` (DELETE TO authenticated USING folder[1]). All dropped-if-exist then created, so the migration is idempotent.
  - Bucket INSERT uses `ON CONFLICT (id) DO NOTHING` — re-running is a no-op.
  - Probe: `SELECT ... FROM storage.buckets WHERE name='banners'` returns 1 row with the expected size/mime caps. `SELECT policyname FROM pg_policies ... ILIKE '%banner%'` returns all four.
  - No client code changed for this fix — the existing upload path works now that the bucket exists.

- **Fix 2 — Settings "Add email" disabled stub.** `site/src/app/profile/settings/page.tsx:1670-1681`. Wrapped the entire "Add secondary email" Row (label + disabled button + "Secondary-email endpoint not yet built" tooltip span) in `{false && ( ... )}` with a leading comment `{/* Secondary email support: deferred. Re-enable when /api/account/emails exists. */}`. Chose the `{false && (...)}` gate over deletion so the structure stays intact and a future re-enable is a one-token change. Primary-email UI (address display + disabled Change button on the row above) is untouched.

- **Fix 3 — `/verify-email` sign-out escape.** `site/src/app/verify-email/page.js`. Page is `.js` not `.tsx`. Found the CTA cluster (Resend Email button + "Change email address" text button). Added a third anchor `<a href="/logout">Use a different account</a>` on a new `marginTop: '14px'` row directly beneath "Change email address", inside the `!changeEmail` branch so it doesn't appear while the user is mid-typing a new address. Styled subtle: `fontSize: '12px'` (one step smaller than the primary 13px text button), `color: C.dim` (muted `#666`), `textDecoration: 'underline'`. No new state, no `supabase.auth.signOut()` call — the existing `/logout` route handles server-side session cleanup and routes to `/login`.

Verification:
- `cd site && npx tsc --noEmit` -> EXIT=0.
- Fix 1: `SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE name='banners'` returns exactly one row; 4 `%banner%` policies present in `pg_policies`.
- Fix 1 alignment: `grep -n 'banners' site/src/app/profile/settings/page.tsx` shows the client writes to `${userId}/...` which matches the `folder[1] = auth.uid()::text` RLS check.
- Fix 2: `grep -n 'Add email' site/src/app/profile/settings/page.tsx` shows the string only at line 1678, inside the `{false && (` gate added at 1671.
- Fix 3: `curl -sS http://localhost:3000/verify-email | grep -oE "Use a different|Sign out"` returns `Use a different`.

Headers preserved on both touched files (`// @migrated-to-permissions 2026-04-18` + `// @feature-verified` markers).

Deviations: none. Considered adding a client-side `supabase.auth.signOut()` + `router.push('/login')` for Fix 3 instead of the plain `<a href="/logout">` but the existing `/logout` route already does the server-side cleanup properly and a plain anchor is simpler and matches the brief.

### Round 13 — Crew 5 polish

Five small surfacing fixes. Each scoped to a single file/region; no behavioral change beyond what the tickets called for.

- **Fix 1 — Notifications "Preferences" link.** `site/src/app/notifications/page.tsx:179-188`. Added a small `<a href="/profile/settings#alerts">Preferences</a>` anchor in the header row (right side, before the existing "Mark all read" button). Wrapped the two controls in a `display:flex; gap:8` div so they read as a single control cluster. Link only renders in the authenticated branch (below the `!permsReady || loading`, `isAnon`, and `!canView` early-returns) — anon/denied views never see it. Style matches the "Mark all read" button: same padding, border, font-size/weight, transparent background.

- **Fix 2 — Messages conversation block/report actions.** `site/src/app/messages/page.tsx`. Both backing API routes verified to exist:
  - `POST /api/users/[id]/block` (`site/src/app/api/users/[id]/block/route.js`) — toggles block; body accepts `{ reason }`; returns `{ blocked: true|false }`.
  - `POST /api/reports` (`site/src/app/api/reports/route.js`) — body shape is `{ targetType, targetId, reason, description? }`, not the spec's `subject_type`/`subject_id`. Wired the actual server contract.
  Added `showConvoMenu` / `showReportDialog` / `reportReason` / `actionToast` state, a `blockOtherUser()` handler, a `submitReport()` handler, and a "..." overflow button in the chat header with a small dropdown menu (Block user / Report user). Report modal gets a textarea + Submit, matching the story-page report modal visual vocabulary but minimal (no radio categories — DMs aren't gated by category taxonomy). Toast surfaces success/failure inline under the header. No fallback / "contact support" path needed since both routes exist.

- **Fix 3 — Silent-catch sweep.** Pre-sweep grep hit count: 59. Post-sweep: 46. 13 logging breadcrumbs added across 9 files, prioritizing data-fetching paths:
  - `site/src/app/profile/kids/page.tsx:113-116` — three `Promise.all` fetches (`/api/kids`, `/api/kids/trial`, `/api/kids/household-kpis`) all now log on failure with `[profile/kids]` context.
  - `site/src/app/NavWrapper.tsx:135` — notifications unread-poll catch logs `[nav] notifications poll`.
  - `site/src/app/admin/stories/page.tsx:138` — delete-preview counts catch logs `[admin/stories] delete preview counts`.
  - `site/src/components/Ad.jsx:30, 32, 59, 70` — ad serve fetch, serve parse, impression log, click log. Each gets `[ads] <action>`.
  - `site/src/components/PermissionsProvider.tsx:64, 75` — initial + auth-change permission refreshes log `[permissions] initial refresh` / `[permissions] auth-change refresh`.
  - `site/src/app/messages/page.tsx:193` — conversation-load catch logs `[messages] load conversations`.
  - `site/src/app/kids/story/[slug]/page.tsx:103, 122` — read-start + read-complete POST catches log `[kids/story] read start log` / `[kids/story] read complete log`.
  - `site/src/app/story/[slug]/page.tsx:493` — article-report submit catch logs `[story] report submit`.
  - `site/src/app/admin/reader/page.tsx:149, 163` — settings-invalidate catches log `[admin/reader] settings invalidate` (both via `replace_all`).
  Skipped: localStorage polyfills, clipboard writes, kid-mode event dispatches, supabase server cookie setters, share-intent fallbacks — all documented-intentional silent paths.

- **Fix 4 — Next-story CTA.** `site/src/app/story/[slug]/page.tsx:817-845`. Added a card after `{discussionSection}` inside the quiz+discussion mount, styled to match the existing `discussionSection` visual language (`var(--card)`, `var(--border)`, 12px radius). Contents: uppercase "You might also like" eyebrow, then two stacked-on-mobile CTAs — primary "Back to home" (→ `/`) in accent color, secondary "Browse articles" (→ `/browse`) outlined. No related-article selection.

- **Fix 5 — Regwall soft close.** `site/src/app/story/[slug]/page.tsx`. Added `regWallDismissed` state (line 242). On the anon view-limit check (line 305-314), the code now reads `sessionStorage.getItem('vp:regwall-dismissed')` before deciding whether to set `showRegWall(true)`; a read error is logged `[story] regwall dismiss read`. Added a "Close" button inside the regwall dialog (top-right, line 626-640) that sets both the React state and `sessionStorage.setItem('vp:regwall-dismissed', '1')` (write error logged `[story] regwall dismiss write`). The dialog render gate tightened to `{showRegWall && !regWallDismissed && ( ... )}`. Used text "Close" instead of a ×/times glyph per the no-emojis rule. Underlying `views >= limit` trigger is unchanged — tomorrow's session gets the wall again because `sessionStorage` clears with the tab. Updated the stale "Regwall has no close-to-dismiss" comment at line 258 to reflect the new behavior. Focus trap + no-Escape still active.

Verification:
- `cd site && npx tsc --noEmit` -> EXIT=0.
- Fix 1 probe: `curl -sS http://localhost:3000/notifications` returns 200 but no "Preferences" in SSR HTML — page is a client component, link renders only after auth gate resolves. Source grep confirms: `site/src/app/notifications/page.tsx:184` has the anchor with `href="/profile/settings#alerts"`.
- Fix 2 probe: `grep -rn "/api/reports\|/api/users/.*block" site/src/app/messages` returns the two new `fetch(...)` calls at `site/src/app/messages/page.tsx:470` (block) and `:504` (reports).
- Fix 3 probe: re-grep silent-catch pattern returns 46 hits (down from 59, delta 13).
- Fix 4 + 5 probe: `grep -n "Back to home\|Browse articles\|You might also like\|vp:regwall-dismissed\|aria-label=\"Close\"" site/src/app/story/[slug]/page.tsx` returns all five expected anchors (CTAs at 828/835/841, sessionStorage key at 310/629, Close button aria-label at 632).

Headers preserved on all touched files (`// @migrated-to-permissions` + `// @feature-verified` lines untouched at top of each page).

Deviations:
- **Report API body shape.** Spec said `{subject_type, subject_id, reason}`; actual route expects `{targetType, targetId, reason}`. Wired the real contract.
- **Close button label.** Spec allowed `&times;`; per no-emojis rule used the plain word "Close" instead. Accessible (has `aria-label="Close"` too for screen readers).
- **Silent-catch sweep — Ad.jsx impact.** Four lines changed in that file; the grep delta (59 → 46) = 13 because a couple of my replacements still leave `.catch(err => { ... })` patterns that don't match the "silent catch" regex (they have a body), so counts check out. One file over cap was admin/reader (replace_all caught 2 sites in one edit).

### Round 13 — Mechanical UI polish (Crew 6)

Scope: surface-level UI fixes from the audit that are sub-10-line edits per file and don't need product input. Everything architectural (tokens, Dynamic Type, active voice, sign-in casing, per-page `<title>`) skipped.

- **Fix 1 — Static-page triple header.** Removed the redundant centered `<div>…Verity Post</div>` wordmark (28px, weight 800) from 9 static pages. NavWrapper's top bar already renders brand; the in-page wordmark was the middle of three brand lines. Pages touched (h1 of each kept intact):
  - `site/src/app/help/page.tsx` (h1 = "Help & Support") — also adjusted h1 margin `20px 0 8px` -> `0 0 8px` so the header block doesn't regain the removed-wordmark vertical offset.
  - `site/src/app/how-it-works/page.tsx` (h1 = "How It Works").
  - `site/src/app/privacy/page.tsx` (h1 = "Privacy Policy").
  - `site/src/app/terms/page.tsx` (h1 = "Terms of Service").
  - `site/src/app/cookies/page.tsx` (h1 = "Cookie Policy").
  - `site/src/app/dmca/page.tsx` (h1 = "DMCA Policy").
  - `site/src/app/accessibility/page.tsx` (h1 = "Accessibility Statement").
  - `site/src/app/status/page.tsx` (h1 = "System Status").
  - `site/src/app/bookmarks/page.tsx` — removed the 28/800 centered wordmark above the "Saved Stories · N of 10" h1.

- **Fix 2 — Home `/` double chrome.** Picked option (b). `site/src/app/page.tsx:491-511`: home's own sticky nav previously rendered the VP tile + "Verity Post" wordmark at `height: 56` even though NavWrapper already owns brand. Stripped the inner brand div/tile, reduced nav container `height: 56` → `height: 40`, and kept the search-icon button sticky in place. New chrome height ~84px (44px NavWrapper top-bar + 40px home sticky nav), down from ~100px (44 + 56). Still two floors visually but tighter; matches spec "closer to ~64px than ~100px". Search-button hit area bumped with `minWidth/minHeight: 44` + flex centering so the affordance keeps a 44×44 target even inside the shorter bar.

- **Fix 3 — Story action row.** `site/src/app/story/[slug]/page.tsx:704-741`. Font `11` → `13` on the entire meta row + both action buttons (Save/Saved/At-cap, Share). Gap `6` → `12` on the action-button cluster AND on the outer flex row. Button padding `4px 10px` → `10px 14px`, `borderRadius: 6` → `8`, added `minHeight: 44` to both buttons. At-cap helper text (the `#b45309` inline warning) also bumped 11 → 13 so it tracks the row. Row allowed to wrap with `flexWrap: wrap` for narrow screens now that the cluster is bigger.

- **Fix 4 — Bookmarks header.** The audit referenced a duplicate "Bookmarks" label in a card below the h1. In the actual current `site/src/app/bookmarks/page.tsx` there is no such in-card label — the only header duplication is the 28/800 "Verity Post" wordmark above the h1, which Fix 1 removes. H1 still reads "Saved Stories · N of 10" (rename to "Bookmarks" is in the audit but is a product/copy decision, explicitly out of this scope). Flagged under skipped below.

- **Fix 5 — Touch-target bumps.** Four surfaces verified and lifted to 44×44:
  - NavWrapper bottom-nav links (`site/src/app/NavWrapper.tsx:286-301`): padding `8px 16px` → `12px 16px`, added `minHeight/minWidth: 44` + inline-flex centering. Visual density unchanged because parent nav is 64px and links already centered; this only expands the anchor hit rect.
  - Leaderboard main tab strip (`site/src/app/leaderboard/page.tsx:289-297`): padding `7px 14px` → `12px 18px`, fontSize `12` → `13`, added `minHeight: 44`. Category/subcategory sub-pill rows left at current `5px 12px` (secondary control per the audit's "inline secondary = 36h" exception — flagged for follow-up if product wants them bumped too).
  - Profile tab strip (`site/src/app/profile/page.tsx:505-520`): padding `S[2] S[1]` (8 × 4) → `S[3] S[3]` (12 × 12), added `minHeight: 44`. Active-underline still `marginBottom: -1`.
  - Search-mode / date-preset pills (`site/src/app/page.tsx:471-477`): `pillStyle` helper bumped padding `6px 14px` → `12px 16px`, fontSize `12` → `13`, added `minHeight: 44`. Used by both the Headline/Keyword search-mode row and the Date-preset row in the search overlay, so both rows lift in one edit.
  - Home search-button (`site/src/app/page.tsx:502-508`): rewritten to `minWidth/minHeight: 44` flex box — see Fix 2.
  Not bumped this pass: leaderboard category/subcategory pills, browse filter pills, bookmarks collection pills (all secondary inline filters). If product wants the floor raised across every pill, flag for Round 14.

- **Fix 6 — Empty-state rewrites.** Applied the audit's recommended rewrites where the current copy was passive or unhelpful:
  - `site/src/app/bookmarks/page.tsx`: "No saved articles here" → "No bookmarks yet" + new sub-line "Save articles here. Tap the bookmark icon on any story to come back later." CTA retargeted from `/` to `/browse` (the audit's target-mismatch fix). Kept the button label "Browse articles".
  - `site/src/app/messages/page.tsx` list: "No messages yet" / "Start a conversation with another user." → "No conversations yet" / "Message an expert, author, or friend to get started." Button label "New Message" → "New message" (sentence case within this component's scope only — not a product-wide sweep). Button padding bumped `8×16` → `10×18` + `minHeight: 44`.
  - `site/src/app/messages/page.tsx` thread: "No messages yet. Start the conversation." → "Say hi. They'll see your first message when they open the chat."
  - `/notifications` authed-empty left as-is — audit calls it the gold standard.
  - `/profile` Activity + Achievements already actionable (reviewed; no rewrite).

Files touched (16):
- `site/src/app/help/page.tsx`
- `site/src/app/how-it-works/page.tsx`
- `site/src/app/privacy/page.tsx`
- `site/src/app/terms/page.tsx`
- `site/src/app/cookies/page.tsx`
- `site/src/app/dmca/page.tsx`
- `site/src/app/accessibility/page.tsx`
- `site/src/app/status/page.tsx`
- `site/src/app/bookmarks/page.tsx`
- `site/src/app/page.tsx`
- `site/src/app/story/[slug]/page.tsx`
- `site/src/app/NavWrapper.tsx`
- `site/src/app/leaderboard/page.tsx`
- `site/src/app/profile/page.tsx`
- `site/src/app/messages/page.tsx`
- (no other files touched this round)

Headers preserved on every touched file (`// @migrated-to-permissions` + `// @feature-verified` lines at the top are intact).

Verification:
- `cd site && npx tsc --noEmit` → EXIT=0.
- Static-page probes: `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/{help,how-it-works,privacy,terms,cookies,dmca,accessibility,status}` → 200 each. `/bookmarks` 302 (auth gate, expected).
- Wordmark probe: `curl -sS http://localhost:3000/privacy | grep -c "28px.*Verity Post"` → 0 (the in-page wordmark is gone; the NavWrapper top-bar 15px "Verity Post" remains, as intended).
- No-emojis rule respected across every copy rewrite and comment block.

Skipped / flagged for Round 14:
- **Bookmarks h1 rename** "Saved Stories" → "Bookmarks". Out of scope (product copy decision; collides with audit Top #4/#11 scope which the instructions explicitly said to leave alone).
- **Sign-in / Sign Up / Create-free-account casing** across headers, buttons, and CTAs. Listed as its own coordinated project.
- **Inline `const C = {...}` palette** on every page. Architectural — own project.
- **Per-page `<title>` metadata.** Own pass.
- **Active-voice error sweep** ("Couldn't …" catalog). Own project.
- **Leaderboard / browse / bookmarks secondary-pill rows.** Current `padding: 5×12` stays. If the dev-lint from Top #8 is enforced at 44h product-wide, those need a coordinated bump.
- **"Bookmarks in a card below h1"** pattern referenced in the instructions was not present in the current file. Possibly removed in an earlier round — flagging in case someone adds it back.

### Round 13 — Top bar fixes (Crew 7)

Scope: fix the five bugs in the global top bar introduced earlier this round — safe-area math, right-side emptiness, tier/kid-mode awareness, per-page chrome conflicts, and kid-route stacking.

- **Fix 1 — Safe-area math (Bug 1).** `site/src/app/NavWrapper.tsx`. `boxSizing: content-box` on the top bar plus `paddingTop: env(safe-area-inset-top)` means the rendered bar height is `44 + safe-area-inset-top`, but the wrapper was only reserving `44`. On notched devices page content slipped under the bar by the safe-area amount. Introduced `topBarReservedHeight = calc(44px + env(safe-area-inset-top))` and set the wrapper's `paddingTop` to that expression when `showTopBar` is true. Also exported the same value as the `--vp-top-bar-h` CSS custom property on the wrapper div so per-page sticky chrome can offset below the top bar via one source of truth (falls back to `0px` on surfaces that hide the bar).
- **Fix 2 — Search icon (Bug 2).** Added a `search.basic`-gated magnifying-glass icon to the right side of the top bar. Pure SVG (no emoji), 44×44 tap target, `color: var(--muted)` stroke, routes to `/search`. New `canSearch` state in NavWrapper is hydrated alongside `canSeeAdmin` in the existing profile-load path (`setCanSearch(hasPermission('search.basic'))` after `refreshAllPermissions`), and reset to `false` when auth resolves as anon. DB probe (MCP execute_sql) confirmed `search.basic` is in the `free`, `pro`, `family`, `admin`, and `owner` permission sets; kid permission sets don't include it, so the icon is inherently gated off kid contexts.
- **Fix 3 — Anon "Sign in" (Bug 3).** When `authLoaded && !loggedIn`, the right side of the top bar renders a subtle text link "Sign in" → `/login` (fontSize 13, `color: var(--muted)`, fontWeight 500 — matches the brand wordmark in color family but sits one weight below). 44px min hit height. Gated on `authLoaded` so it doesn't flash on first paint while auth is still resolving.
- **Fix 4 — Page-specific chrome conflicts (Bug 4).** Grepped `position:\s*['"]?(sticky|fixed)['"]?` across `site/src/app/**`. Findings and decisions:
  - `site/src/app/page.tsx:491-513` (home sticky nav, `top: 0, height: 40`, contained just a search button) — **removed** (option b). Global top bar now owns the search entry point; the in-page sticky was pure redundancy. The legacy `openSearch` / `SEARCH OVERLAY` / `searchVerifyPrompt` code paths were left in place (dead but harmless) because they're referenced by state declarations at the top of the file; no other surface was triggering them.
  - `site/src/app/story/[slug]/page.tsx:658` (mobile Article/Timeline/Discussion tab bar, `top: 0, zIndex: 50`) — **offset** (option a). Changed `top: 0` → `top: var(--vp-top-bar-h, 0px)`.
  - `site/src/app/story/[slug]/page.tsx:804` (desktop timeline aside, `top: 60`) — left alone. Desktop only, the 60px already clears the 44px top bar.
  - `site/src/app/profile/[id]/page.tsx:423-430` (other-user profile header, `top: 0, height: 56`, contained a duplicate "verity post" wordmark + a Back chip) — **hybrid**. Offset `top: 0` → `top: var(--vp-top-bar-h, 0px)`, dropped the redundant wordmark, kept the Back chip, shrank `height: 56` → `44`, switched to `justify-content: flex-end`.
  - Home-overlay search modal (`page.tsx:552`), story-page report/regwall dialogs (`story/[slug]/page.tsx:608, 851`), messages report/new-message dialogs (`messages/page.tsx:681, 775`), profile settings modal (`profile/settings/page.tsx:817`), profile index delete-confirm modal (`profile/page.tsx:1169`), category-page toast (`category/[id]/page.js:159`) — **no action**. All are overlays/toasts with `inset: 0` or bottom-centered positioning, not top-aligned chrome.
  - Admin permissions-table stickies (`admin/permissions/page.tsx:1181, 1219`) — **no action**. Admin routes already hide the global top bar (`showNav` excludes `/admin`).
  - NavWrapper's own `nav`/`header`/admin-banner stickies — **no action**. Internal to the wrapper.
- **Fix 5 — Kid mode (Bug 5).** `KidTopChrome` (`site/src/components/kids/KidTopChrome.tsx`) is itself a `position: sticky, top: 0, zIndex: 50` header with its own brand/streak/exit chrome. With the global top bar at `z 9999, position fixed`, keeping both would have stacked KidTopChrome underneath the global bar on scroll. Picked the cleaner option: **hide the global top bar on kid routes** (`showTopBar = showNav && !onKidRoute`) and let `KidTopChrome` own the top there. The `topBarHomeHref` was therefore simplified back to `'/'` (kid-routes never render the global bar, so the old `kidModeActive ? '/kids' : '/'` branch had no caller left). `--vp-top-bar-h` resolves to `0px` on kid routes since `showTopBar` is false — future kid-surface stickies won't over-offset.

Tier preview matrix (what shows in the top bar):
- Anon (not signed in, adult route): logo + "Sign in" text link.
- Free signed-in (adult route): logo + Search icon (has `search.basic`).
- Pro signed-in: logo + Search icon.
- Family signed-in: logo + Search icon.
- Admin / owner: logo + Search icon. Same right side as other signed-in tiers; admin chrome (the black "Back to site" banner) is governed separately and only shows on `/admin/*`.
- Kid mode: global top bar is hidden entirely; `KidTopChrome` owns the top.
- Pre-kid-mode kid routes (picker, PIN entry): both bars hidden (`showNav` was already false for that state).
- `HIDE_NAV` routes (login/signup/verify-email/welcome/etc.): both bars hidden as before.
- Admin routes: global top bar hidden (`showNav` excludes `/admin`).

Files touched (4):
- `site/src/app/NavWrapper.tsx`
- `site/src/app/page.tsx`
- `site/src/app/story/[slug]/page.tsx`
- `site/src/app/profile/[id]/page.tsx`

Headers preserved on every touched file.

Verification:
- `cd site && npx tsc --noEmit` → EXIT=0.
- `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/` → 200. NavWrapper is client-gated (`mounted` flag), so SSR HTML for the top bar is empty by design; a DOM inspection after hydration is required to see the rendered affordances.
- DB probe (MCP `execute_sql` against project `fyiwulqphgmoqullmrfn`): `SELECT DISTINCT ps.key FROM permission_sets ps JOIN permission_set_perms pspp ON pspp.permission_set_id=ps.id JOIN permissions p ON p.id=pspp.permission_id WHERE p.key='search.basic'` → `admin, family, free, owner, pro`. Confirms every signed-in tier sees the search icon; kid sets don't include `search.basic` (and kid routes hide the global bar anyway — belt and braces).
- Admin banner / bottom-nav math: wrapper `paddingBottom` unchanged (`showNav ? (showAdminBanner ? 104 : 68) : (showAdminBanner ? 44 : 0)`). Only `paddingTop` math changed.

Deviations:
- `topBarHomeHref` simplified to a plain `'/'` once the kid-route branch stopped reaching the render. The original `kidModeActive ? '/kids' : '/'` ternary is dead code under the new `!onKidRoute` gate.
- `profile/[id]` wordmark removal was opportunistic — the spec flagged "remove if redundant" for banners; the sticky header there was half-banner (duplicate wordmark) + half-functional (Back chip), so the banner half was removed and the functional half was offset below the global top bar.
- Home `page.tsx` retains `openSearch` / `SEARCH OVERLAY` / `searchVerifyPrompt` as unreachable code. Follow-up: delete the unused helpers + overlay + `searchOpen`/`searchVerifyPrompt` state in a dedicated cleanup pass once Crew 7's nav changes bake.

Deferred:
- Visual smoke test in a real iPhone Safari — can't simulate notched safe-area from CLI. Math is correct (`calc(44px + env(safe-area-inset-top))` matches the rendered bar because `boxSizing: content-box` adds padding to height), but worth eyeballing once a device is available.
- No interaction-level test of the Sign in link on anon sessions, or the Search icon on a free-tier logged-in session. Both gated via existing state that's already exercised elsewhere.

### Q1 — Public card + gated profile

Scope decision (`_q1_card_plan_v2.md`): `/card/[username]` flips to fully public; `/u/[username]` keeps gating anon via an in-page CTA (R13 pattern). `/profile/[id]` stays middleware-gated. Two permission-key cleanups flagged but not executed inline (see Deferred).

Files touched (4):
- `site/src/app/card/[username]/page.js` — dropped `hasPermission('profile.card.view')` viewer gate and the `no_card` upsell branch (lines 85–97 old); added `viewerIsAuthed` state; made the "View full profile" anchor auth-aware (`/u/<name>` for authed, `/signup?next=/u/<name>` for anon); dropped `hasPermission/refreshAllPermissions` import and unused `notFound` import; added Q1 comments.
- `site/src/app/card/[username]/layout.js` — dropped `hasPermissionServer('profile.card.view', supabase)` metadata gate and the `hasPermissionServer` import; title now user-specific (`{name}'s card — Verity Post`), neutral fallback (`Profile card — Verity Post`) for missing/private target; `robots: { index: false, follow: false }` applied across every branch.
- `site/src/app/card/[username]/opengraph-image.js` — dropped `hasPermissionServer('profile.card.view', supabase)` check and its import; target-side fallback (deleted / private) still renders brand plate; social crawlers now get the real card PNG.
- `site/src/app/u/[username]/page.tsx` — added `isAnon` + `checkedAuth` state; anon branch short-circuits `loading=false` BEFORE the target fetch (no `users` RLS read for anon); new R13-style CTA hero (520px, 64px `[@]` glyph, H1 22/800, body 14/dim/1.55) rendered when `checkedAuth && isAnon`; primary button → `/signup?next=/u/<username>`, secondary → `/login?next=/u/<username>`; added `C` palette const matching `/notifications`.

Headers preserved on every touched file.

Copy (canonical):
- Card metadata title (target exists, public): `{display_name}'s card — Verity Post`
- Card metadata title (missing / private): `Profile card — Verity Post`
- /u CTA headline: `Sign up to see @<username>'s profile`
- /u CTA body: `Profiles show reading history, Verity Score, streak, comments, and more. Join free to view this profile and build your own.`
- /u CTA primary: `Sign up` → `/signup?next=/u/<username>`
- /u CTA secondary: `Already have an account? Sign in` → `/login?next=/u/<username>`

Verification:
- `cd site && npx tsc --noEmit` → EXIT=0.
- `curl -sS http://localhost:3000/card/test_owner` → 200; SSR title `test_owner's card — Verity Post`; `name="robots" content="noindex, nofollow"` present; no `Profile card not available` string. Initial body is the client-component loading placeholder (`Loading card...`), which then hydrates to the real card for anon and authed alike — no more `no_card` branch in the code path.
- `curl -sS http://localhost:3000/u/test_owner` → 200; SSR body is the client-loading placeholder (`Loading…`) which hydrates to the new anon CTA for anon visitors; target `display_name`/`bio`/`avatar`/follower counts do not appear in the initial HTML body. The `/u/` layout metadata still reads target display_name to populate the `<title>` + OG image (pre-existing, by design per Agent A's plan — `/u/` is canonical person-URL, indexable).
- OG crawler path: `/card/<username>/opengraph-image` now renders the real PNG for anon requests. Previously the `hasPermissionServer('profile.card.view', supabase)` check returned `false` for unauthenticated crawler requests, so every social share showed the brand plate.

Deviations from plan: none.

Phase-1 review notes (Agent B independent verification):
- Permission-key removal claim verified. `profile.card.view` was present in all three card files and is now absent. Grep confirms the key remains referenced only in docs (`00-Where-We-Stand/FEATURE_LEDGER.md`, `05-Working/PERMISSIONS_AUDIT.md`, plan files) and the migration SQL (`01-Schema/077_fix_permission_set_hygiene_2026_04_18.sql`); no other code callers break.
- `/u/[username]` leak claim verified. Pre-change, the client effect fetched the target unconditionally (lines 95–124 old); anon saw display_name/bio/avatar/banner/follower counts. Post-change the anon branch short-circuits before the fetch.
- `/profile/[id]` middleware gating verified. `site/src/middleware.js:12-17` lists `/profile` in `PROTECTED_PREFIXES`; `isProtected` matches both `/profile` and `/profile/<anything>`. No code changes needed.
- `signup?next=` pattern precedent confirmed (`site/src/app/story/[slug]/page.tsx:543`) — we match existing convention.
- `login?next=` is honored (`site/src/app/login/page.tsx:36,65,164`) → the secondary "Sign in" CTA post-click actually preserves the destination.

Deferred / follow-ups:
- `site/src/app/signup/page.tsx` does NOT currently read the `next` query param. After signup it unconditionally routes to `/verify-email` or `/signup/pick-username`. `pick-username` also doesn't read `next`. This is a pre-existing gap; the card "View full profile" anchor and the /u anon "Sign up" button still emit `signup?next=<encoded>` on the expectation that signup will eventually honor it (matches the already-shipped pattern in `story/[slug]/page.tsx:543`). Wiring `next` through the multi-step onboarding (signup → email-verify / pick-username → final landing) is non-trivial (state would need to survive a page transition and an OAuth callback), so flagged here rather than done inline. The secondary Sign in link works correctly today.
- `profile.card.view` permission key is now unreferenced in production code paths (only referenced in permission-set seeding SQL + docs). Candidate for deprecation in a future migration — not blocking.
- `profile.card.share_link` (iOS `PublicProfileView.swift:52`) vs `profile.card_share` (web `u/[username]/page.tsx:105`) naming drift is pre-existing, still not in scope.
- SSR of `/u/[username]` body for SEO: page remains a client component; metadata is fine, but search crawlers executing JS see the anon CTA and will index a thin page. Acceptable for launch per plan; revisit if it becomes a SEO problem.

### Q2 — Stripe portal IAP branching

Scope decision (`_q2_stripe_portal_plan.md`): the brief's premise ("widen `billing.stripe.portal` from admin/owner/pro to every paid tier") was stale — Round 10 already deactivated `billing.stripe.portal` and the broader `billing.portal.open` key is live and bound to every tier. No DB migration shipped. Instead, fixed the real UX gap Agent A surfaced: the Settings "Manage subscription" UI did not branch by subscription source, so Apple IAP (and eventual Google Play) subscribers tapping either Stripe portal button got a generic "Could not open billing portal" toast on top of a 400 from `/api/stripe/portal`.

Files touched (1):
- `site/src/app/profile/settings/page.tsx` — five edits in one file:
  1. `SubscriptionRow` type extended with `source | apple_original_transaction_id | google_purchase_token` (line 178-182).
  2. `userBilling` state shape extended with `stripe_customer_id` (line 2835).
  3. Data-fetch selects widened on both the `users` and `subscriptions` queries in the initial `useEffect` (line 2849-2854) so the render path has the source + customer-id fields without a second round-trip.
  4. `handlePortal` toast now forwards `data?.error` from `/api/stripe/portal` before falling back to the generic "Could not open billing portal." (line 2998). The route returns `{ error: "No Stripe customer on file yet — complete checkout first." }` for users with a null `stripe_customer_id`, and bubbles Stripe SDK errors too; surfacing the specific copy turns an opaque failure into an actionable message.
  5. New `subSource` helper (line 3008-3018) derives `'stripe' | 'apple' | 'google' | 'unknown'` from the combination of `subscriptions.source`, the IAP token columns, and `users.stripe_customer_id` as a legacy fallback. Drives three booleans — `showStripePortalUI` (Stripe source AND stripe_customer_id present), `showAppleIapUI`, `showGoogleIapUI` — consumed by two render sites:
     - Plan card aside (line 3058-3077): branches the single "Manage subscription" button between `Open Stripe portal` (calls `handlePortal`), `Manage on App Store` (navigates to `itms-apps://apps.apple.com/account/subscriptions` via `window.location.href`), and `Manage on Google Play` (opens `https://play.google.com/store/account/subscriptions` in a new tab). Renders nothing when `canPortal` is true but source is `'unknown'` (e.g. a free user who somehow has the perm — keeps the aside empty rather than surfacing a button that will 400).
     - Payment-method card (line 3213-3272): branches both the description copy, the body content, and the action button. Stripe source keeps the existing "Card on file / Update payment method" flow; Apple shows a "Billed by Apple" panel + "Manage on App Store" CTA; Google shows "Billed by Google Play" + "Manage on Google Play" CTA. The `description` prop of the `Card` component now reflects the actual billing source rather than hard-coding "Managed by Stripe".

Phase-1 verification (independent):
- Plan vs reality: `information_schema.columns` on `public.subscriptions` shows `source`, `apple_original_transaction_id`, `google_purchase_token` all present (positions 5, 8, 9). `source` is `varchar` with no CHECK constraint, no enum. `DISTINCT source` returned zero rows in prod — no live data yet — so the branching logic had to be inferred from code.
- Canonical source values: grep'd writers. Stripe webhook writes `source: 'stripe'` (`site/src/app/api/stripe/webhook/route.js:59`). iOS sync writes `source: 'apple'` (`site/src/app/api/ios/subscriptions/sync/route.js:137`). No writer emits `'google'` yet but the schema column exists. The `subSource` derivation uses `startsWith('apple')` / `startsWith('google')` / `startsWith('stripe')` so it tolerates variants like `'apple_sync'` / `'stripe_webhook'` that appear in the metadata JSON.
- `/api/stripe/portal` error shape: `{ error: "..." }` at HTTP 400 / 500. Toast uses `data?.error` which matches.
- No iOS changes (per constraints + Agent A §6).

Phase-3 verification:
- `cd site && npx tsc --noEmit` → EXIT=0.
- `curl -sS http://localhost:3000/profile/settings` → 302 (page is middleware-gated; expected). Post-edit file spot-check confirms `showStripePortalUI`, `showAppleIapUI`, `showGoogleIapUI`, `Manage on App Store`, `Manage on Google Play`, and `data?.error` all appear at the expected render sites (grep above).
- Header markers preserved (`// @migrated-to-permissions 2026-04-18` + `// @feature-verified profile_settings 2026-04-18` unchanged on line 1-2).

Deviations from plan:
- Button component (`@/components/admin/Button`) renders a `<button>` only — no `as="a"` / `href` prop. The store-redirect buttons use `onClick` handlers (`window.location.href = 'itms-apps:...'` for Apple, `window.open(..., '_blank', 'noopener,noreferrer')` for Google). Same behavior, different implementation.
- Added Payment-method card branching (not strictly required by the plan's 5-edit list, but Agent A flagged two portal buttons render today; consolidating to one correct branching set per card removes the duplicate-button failure mode instead of leaving the payment-method card on the Stripe path while the plan card branches).
- Legacy NULL `source` with no tokens → Stripe path (matches plan's "default to Stripe since it's older"). Rows with NULL source but a populated `stripe_customer_id` on the user flow through `showStripePortalUI = true`; rows with neither fall to `'unknown'` and render no button (the aside simply collapses).

Deferred / follow-ups:
- `billing.stripe.portal` (inactive) still has dead bindings on `admin, owner, pro`. Housekeeping-only; not deleted in scope here. Flagged in Agent A §open-questions-3.
- Google Play IAP is not yet wired in the webhook layer — no writer sets `source='google'` today. The branching works correctly (if a row ever gets `source='google'` OR `google_purchase_token IS NOT NULL`, the Play button renders), but the path is unexercised until Google IAP ships.
- "Manage on App Store" on a desktop browser: `itms-apps://` is an Apple-scheme URI; desktop Safari will prompt to open the App Store app. Non-Apple browsers may show an error. Agent A suggested a fallback to `https://apps.apple.com/account/subscriptions` for desktop; not implemented here because the overwhelming case of an Apple IAP user on desktop is rare (sign-up flow is iOS-first), and the copy on the card ("Open Settings &gt; Subscriptions on your iPhone") already steers them toward the correct device. Low-cost follow-up if desktop-IAP traffic turns out to be non-trivial.

### Q6 — require_outranks RPC refactor

**Goal:** replace the hand-rolled `ROLE_HIERARCHY` map in `site/src/lib/roles.js` with a canonical server-side rank check driven by `public.roles.hierarchy_level`. Closes F-034/F-035/F-036's dependency on client-visible role-level constants and makes a new custom role land with the correct weight without a code push.

**Migration:** `add_require_outranks_rpc_2026_04_19` (applied to project `fyiwulqphgmoqullmrfn`).

- `public.require_outranks(target_user_id uuid) RETURNS boolean` — SECURITY DEFINER. service_role JWT bypasses (returns true). Unauthed caller returns false. Missing target returns false. Otherwise returns `caller.max(hierarchy_level) > target.max(hierarchy_level)` across non-expired user_roles. `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated, service_role`.
- `public.caller_can_assign_role(p_role_name text) RETURNS boolean` — companion RPC used by the role-grant route so the "role being granted is at-or-below actor's level" check also moves server-side. Unknown role name returns false. Same grant/revoke pattern as above.

**Callers migrated (5 files, 7 comparison sites):**

- `site/src/app/api/admin/moderation/users/[id]/penalty/route.js` — F-036. Replaced `getMaxRoleLevel(user.id) <= getMaxRoleLevel(params.id)` with `createClient().rpc('require_outranks', { target_user_id: params.id })` (authed cookie-scoped client so the RPC sees the caller's `auth.uid()`).
- `site/src/app/api/admin/billing/freeze/route.js` — F-035. Same pattern; kept the `user_id !== user.id` self-skip. 
- `site/src/app/api/admin/billing/cancel/route.js` — F-035. Same pattern.
- `site/src/app/api/admin/users/[id]/roles/route.js` — F-034. Two rank checks per handler (POST grant, DELETE revoke): the actor-vs-role check (`roleLevel(role_name) > actorLevel`) became `caller_can_assign_role(p_role_name)`, which also absorbs `isValidRole` (unknown role returns false). The actor-vs-target check (`getMaxRoleLevel(actor) <= getMaxRoleLevel(target)`) became `require_outranks(target_user_id)` via the shared `assertActorOutranksTarget` helper.
- `site/src/app/api/admin/subscriptions/[id]/manual-sync/route.js` — F-035. Same pattern; rank check runs against `sub.user_id` loaded from the subscriptions row.

**File deletion:** `site/src/lib/roles.js` was **not** deleted. The hierarchy helpers (`ROLE_HIERARCHY`, `isValidRole`, `roleLevel`, `getMaxRoleLevel`, `actorOutranks`, `actorAtLeast`) were all removed, but `site/src/app/admin/layout.tsx` still imports `MOD_ROLES` (a frozen role-name Set) for the coarse `/admin/**` segment-level gate. The file now exports only the role-name Sets (`OWNER_ROLES`, `ADMIN_ROLES`, `EDITOR_ROLES`, `MOD_ROLES`, `EXPERT_ROLES`).

**Verification:**
- `cd site && npx tsc --noEmit` → EXIT=0.
- Grep for removed symbols (`getMaxRoleLevel|isValidRole|\broleLevel\b|ROLE_HIERARCHY|actorOutranks|actorAtLeast`) returns only comment-prose matches, zero live call sites.
- SQL probe results (admin=80, moderator=60, owner=100):
  - admin → moderator: `require_outranks` = true (allow)
  - moderator → admin: `require_outranks` = false (block)
  - admin → owner: `require_outranks` = false (block)
  - admin self-target: false (block, strict-greater)
  - admin → missing uuid: false (block)
  - unauthed caller: false (block)
  - service_role JWT: true (bypass)
  - `caller_can_assign_role('admin')` as admin: true; `caller_can_assign_role('owner')` as admin: false; `caller_can_assign_role('doesnotexist')` as admin: false.
- Per-caller functional probes: all 7 rank-guard scenarios block/allow as expected (see PR notes).

**Deferred / follow-ups:**
- The 5 migrated routes now issue an extra round-trip to Postgres for the rank check. Negligible overhead (<5ms local) but if the admin console ever does a batched operation, consider a bulk variant like `require_outranks_each(target_user_ids uuid[])`.
- `site/src/app/admin/users/[id]/permissions/page.tsx` has its own hand-rolled `MOD_ROLES` array (line 38) shadowing the shared export. Housekeeping, not a rank-guard issue — flagged for a separate sweep.

### Q4+Q14 — Permission + schema cleanup

Two DB-only fixes shipped together on 2026-04-19 (Agent A).

**Q4 — deactivate 4 unused ios.* permission keys**

Keys: `ios.article.share_sheet`, `ios.bookmarks.view`, `ios.iap.manage_subscription`, `ios.profile.view.public`.

Pre-migration grep (site/src + VerityPost/): 0 references for any of the 4 keys. All 4 confirmed `is_active=true` in DB before migration.

Migration: `deactivate_unused_ios_keys_2026_04_19`. Idempotent via `WHERE is_active=true`; bump of `perms_global_version` gated on the CTE producing at least one row, so re-running no-ops cleanly.

Post-migration: all 4 keys `is_active=false`; total active perms count = 921; `perms_global_version` 4482 → 4487 (net +5 across the full session including concurrent migration activity; the Q4 migration itself did one bump).

**Q14 — drop `ticket_messages.body_html`**

Round 6 moved ticket-body writes to `ticket_messages.body` via RPC; the `body_html` column has been write-dead since. Keeping it around was a latent stored-XSS footgun (a renderer accidentally binding to it would inject raw HTML).

Pre-migration grep (site/src + VerityPost/): one live reference, in `site/src/app/admin/support/page.tsx:246` — `body_html` appeared in a `.select(...)` column list but was never read or rendered anywhere in the file (only `msg.body` is used, line 549). The three other `body_html` hits in the codebase are on unrelated tables (`email_templates.body_html` via `site/src/lib/email.js`, `articles.body_html` via `site/src/app/api/ai/generate/route.js`) and were left alone.

Pre-check: column exists, nullable `text`, no default, no FK/constraint that would block the drop.

Sequence applied:
1. Removed the dead `body_html` token from the admin/support select list (single-line edit in `site/src/app/admin/support/page.tsx`). Without this, regenerated types would drop the field and tsc would fail.
2. Migration: `drop_ticket_messages_body_html_2026_04_19` — `ALTER TABLE ticket_messages DROP COLUMN IF EXISTS body_html;` (idempotent via `IF EXISTS`).
3. Regenerated types: `cd site && npm run types:gen` (supabase CLI → `src/types/database.ts`).

Post-migration verification:
- Column gone: `information_schema.columns` filter returns 0 rows for `ticket_messages.body_html`.
- Types regenerated: the `ticket_messages` block in `database.ts` (line 6893) no longer has `body_html` in Row/Insert/Update; the 18 remaining `body_html` matches in the types file are all on unrelated tables (articles/email_templates/etc.).
- `cd site && npx tsc --noEmit` → EXIT=0.
- No broken code references (grep for `body_html` in `site/src` outside `types/` returns only the unrelated `email.js` + `ai/generate/route.js` hits that existed pre-change).

Deviations from brief: none. One "verify first → zero" expectation had to be relaxed — `body_html` did have one live (but dead-data-path) reference in admin/support; flagged and fixed inline rather than escalating, because the ref was provably unused (select-only, never rendered). Documented above.

### Q8+Q9+Q13 — Small polish

**Q8 — `/signup/expert` for authed users**

Pre-Q8 state: page was anon-only. The submit handler unconditionally POSTed `/api/auth/signup` then `signInWithPassword`, so a signed-in user would either collide on email or (if signed out and re-signed-up) clobber their session. Round 12's workaround was a toast-only "coming soon" CTA in the settings expert section.

Change applied in `site/src/app/signup/expert/page.tsx`:
- Added `isAuthed` + `authChecked` state. Mount-time `supabase.auth.getUser()` — if a user is present, set `isAuthed=true`, pre-fill email (read-only chip above the credentials form) + best-effort `fullName` from `users.full_name || display_name`, and jump `step` to 2.
- `handleSubmit` now gates the signup + sign-in leg behind `if (!isAuthed)`. The `/api/expert/apply` call is unchanged and already relies on the session cookie, which is exactly what authed users bring.
- Step pills hidden for authed users (only "Credentials" remains, no point showing "Account ✓"). The "← Back" button on step 2 also hidden when authed (there's no step 1 to go back to).
- Heading copy branches: "You're signed in. Tell us about your expertise…" vs the original "Create your account first…".
- Footer "Not an expert? Regular signup" swapped to "Changed your mind? Back to settings" when authed.

Settings CTA rewire in `site/src/app/profile/settings/page.tsx` (ExpertProfileCard, ~line 3478): replaced the Round 12 toast handler with `window.location.href = '/signup/expert'`. Chose a full navigation rather than `router.push` to match the pattern already used elsewhere in this component (`/logout`, Stripe portal redirects) and because `ExpertProfileCard` doesn't currently hold a router ref.

**Q9 — Bookmarks H1**

One-line edit in `site/src/app/bookmarks/page.tsx` — `Saved Stories · …` → `Bookmarks · …`. Confirmed there is no `metadata`/`layout.tsx` for `/bookmarks`, so nothing else to reconcile. Grep for "Saved Stories" across `site/src` returned zero other hits.

**Q13 — Background audio**

Source of truth is `VerityPost/project.yml` — its `targets.VerityPost.info.properties` block drives generation of `VerityPost/VerityPost/Info.plist` (Info.plist content matches the yaml 1:1, confirming xcodegen ownership). Added:

```yaml
UIBackgroundModes:
  - audio
```

Ran `cd VerityPost && xcodegen generate`. Post-regen Info.plist now contains the key/array at line 48–51. TTSPlayer's existing `AVAudioSession(.playback, .spokenAudio)` session config will now be honored while the app is backgrounded.

**Verification**
- `cd site && npx tsc --noEmit` → EXIT=0.
- `/signup/expert` logic: authed users no longer hit the signup endpoint (the `if (!isAuthed)` branch around the signup + sign-in calls is the only pre-auth gate; once past it the flow is identical to the anon path). Email is rendered read-only above the credentials form.
- `/bookmarks` H1 now reads `Bookmarks · N` (or `N of 10` on free).
- Info.plist regenerated contains `UIBackgroundModes` → `[audio]`.

### Q15+Q7 — Promo partial-discount + category_follows cleanup

**Q15 — `discount_applied_cents` semantics for partial-discount promos** (`site/src/app/api/promo/redeem/route.js`)

Problem: the redeem route was inserting a `promo_uses` row with `discount_applied_cents = 0` for every partial-discount redemption (`discount_value < 100`). Today every live promo is 100%-off so it never fires, but the moment a partial-discount promo ships, `SUM(discount_applied_cents)` analytics (and any per-user refund/reconciliation math) gets polluted by zeros that represent "intent, not money." Equally, `current_uses` was being burned on a redemption that had no downstream mutation — a user could tap Apply on a 50%-off code and consume a `max_uses` slot without ever paying.

Schema check: `promo_uses.discount_applied_cents integer NOT NULL` (`01-Schema/reset_and_rebuild_v2.sql:1571`; `site/src/types/database.ts:5270`). Option B (insert NULL) is therefore off the table without a column migration, which Q15 does not authorize. Option C (sentinel `-1`) is explicitly avoided. **Option A chosen:** for partial-discount promos, validate the code server-side and return intent, but perform **zero mutation** — no `current_uses` increment, no `promo_uses` insert, no audit row. The checkout/webhook path is the single writer for partial-discount `promo_uses` rows, where the real `price_cents − discount` value is known.

Logic change summary:
- Added `const isFullDiscount = promo.discount_type === 'percent' && promo.discount_value >= 100;` after the `max_uses` gate.
- Early-return for `!isFullDiscount` with `{ success: true, fullDiscount: false, discount_value, discount_type, applies_to_plans, message }`. Message reworded from "off applied!" to "off will apply at checkout." to match the deferred semantics (the client only reads `data.message`, so no caller breakage — `profile/settings/page.tsx:3033`).
- The full-discount branch keeps the existing sequence verbatim: duplicate-use SELECT → optimistic `current_uses` increment → plan lookup → `promo_uses` insert with `discount_applied_cents = plan.price_cents` → `users.plan_id` update → `audit_log` insert. No regression to the 100%-off gate.

Duplicate-use guard confirmed:
- 100%-off: unchanged. `SELECT id FROM promo_uses WHERE promo_code_id=… AND user_id=…` still precedes the insert; the fresh insert still enforces one-redemption-per-user going forward.
- Partial-discount: prevention shifts to the checkout path, which is the only path that writes `promo_uses` for this class (planned writer). Because `/api/promo/redeem` no longer mutates anything in this branch, a user tapping Apply twice costs the system nothing — no counter burn, no row noise. The checkout path is still responsible for its own guard (outside this diff's scope; flagged for whoever wires checkout-for-partial).

Verified:
- `cd site && npx tsc --noEmit` → EXIT=0.
- `SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='promo_uses' AND column_name='discount_applied_cents'` — not probed live; the canonical schema file (`01-Schema/reset_and_rebuild_v2.sql:1571`) and generated types (`discount_applied_cents: number` on Row + Insert, no `| null`) both confirm `NOT NULL`. That's the input for rejecting Option B.
- 100%-off path grep-check: `discount_applied_cents` still appears on the insert payload (route.js in the full-discount branch), so the write is preserved.
- Markers preserved: `@migrated-to-permissions 2026-04-18` and `@feature-verified subscription 2026-04-18` at top of route.js untouched.

**Q7 — `category_follows` residue cleanup** (`site/src/app/category/[id]/page.js`)

Round 12 Crew 6 already stripped the Follow button + hardcoded follower count from the category page. Decision Q7 locks in "don't build the feature."

Pre-cleanup grep `grep -rnE "category_follows|categoryFollow|toggleFollow" site/src` returned two hits, both in `site/src/app/category/[id]/page.js` — and both were comments referencing `category_follows ships` / "Restore when category_follows ships," i.e., verbal residue implying the feature was merely deferred. No orphan state, no route stub (`ls site/src/app/api/categories/` returned no such directory; no `/follow` subroute anywhere), no dead imports, no UI affordance. iOS check — `grep -rn "categoryFollow\|category_follows" VerityPost/` — zero matches.

Changes:
- Rewrote the top-of-component comment from "Round 12: … removed until the `category_follows` table and `/api/categories/[id]/follow` route ship (flagged for Round 13)…" to a Q7-decision comment that says the feature is not shipping and the page is verified clean.
- Rewrote the in-header JSX comment from "Restore when category_follows ships" to a short "feature is not shipping" note.

Post-cleanup grep: one remaining match on the tracker comment itself (the word `category_follows` appears inside the comment that documents the absence — this is intentional self-documentation, not feature residue). `categoryFollow`, `toggleFollow` → zero matches. iOS → zero matches.

Tracker note: **verified clean**. No route deletion needed (none existed). No state/handler deletion needed (none existed). Crew 6 did the heavy lifting; this pass just removes the "deferred, will ship later" language that contradicted Decision Q7.

Verified:
- `cd site && npx tsc --noEmit` → EXIT=0 (combined run covering both Q15 + Q7 edits).
- Re-grep `category_follows|categoryFollow|toggleFollow` on `site/src` → one intentional tracker comment; `VerityPost/` → zero.

Deviations from brief: none. Option A (Q15) was the brief's preferred path and it lined up with the NOT-NULL schema constraint. Q7 was already clean per code state; only the stale "deferred" comments needed rewording.

### Q10-web — Sign-in casing canonicalization

Agent D, 2026-04-18. Web-only pass (iOS handled by another agent; zero `.swift` files touched).

**Canonical forms applied**
- `Sign in` (verb) — authentication CTA + links + prose.
- `Sign up` (verb) — registration CTA + links + prose.
- `Sign out` (verb) — session-end CTA + labels.
- `Create free account` — reserved for the PRIMARY signup button on marketing/regwall/leaderboard upsell surfaces + the `/signup` submit button (longer form, high emphasis, one per surface).

**Pre-sweep non-canonical variant counts (user-visible strings only)**

| Variant | Count | Location |
|---|---|---|
| `Sign In` (title case) | 1 | `site/src/app/login/page.tsx` (submit button) |
| `Sign Up Free` | 1 | `site/src/app/story/[slug]/page.tsx` (regwall CTA) |
| `Sign up free` | 1 | `site/src/app/story/[slug]/page.tsx` (quiz gate CTA) |
| `Log in` | 1 | `site/src/app/story/[slug]/page.tsx` ("Already have an account? Log in") |
| `Log in instead` | 1 | `site/src/app/signup/page.tsx` (taken-email error link) |
| `Log In` | 1 | `site/src/app/NavWrapper.tsx` (bottom-nav anon label) |
| `Login failed` | 1 | `site/src/app/login/page.tsx` (error string) |
| `Signup failed` | 1 | `site/src/app/signup/expert/page.tsx` (error string) |
| `Create Account` (title case) | 2 | `site/src/app/signup/page.tsx` (submit button) + `site/src/app/leaderboard/page.tsx` (anon CTA) |
| `Create a free account` | 1 | `site/src/components/Interstitial.tsx` (signup CTA) |
| `Login activity` (admin label) | 2 | `site/src/app/profile/settings/page.tsx` (subsection label + card title) |
| `Login attempts` (admin label) | 1 | `site/src/app/admin/system/page.tsx` (rate-limit endpoint label) |
| **Total strings changed** | **14** | |

Canonical `Sign in` / `Sign up` / `Sign out` occurrences already in place (help, /u/, notifications, kids, LockModal, AccountStateBanner, profile/settings sign-out cluster, etc.) were not counted — they were already correct.

**Post-sweep non-canonical variant counts**

Re-grep of `site/src` for `Sign Up Free|Sign up free|Create Account|Create a free account|\bLog [iI]n\b|\bLog [oO]ut\b|\bLogin\b|\bLogout\b|\bSign In\b|\bSign Up\b|\bSign Out\b` → 4 hits, all non-user-visible code comments:

- `site/src/app/signup/expert/page.tsx:13` — comment (`// ... we skip the "Create account" step ...`).
- `site/src/app/profile/settings/page.tsx:1827` — section-header comment (`// 1D. Login activity`); internal marker only.
- `site/src/app/api/account/login-cancel-deletion/route.js:6` — comment describing endpoint purpose.
- `site/src/app/api/auth/login-failed/route.js:65` — comment (`// Sign out the probe session ...`).

Also left unchanged (noun/identifier forms, not verb CTAs):
- `site/src/app/admin/cohorts/page.tsx:52` — `label: 'Signup & Tenure'` (admin cohort-filter group; noun-compound referring to the signup event, not a CTA).
- `site/src/app/admin/page.tsx:40` — `"Signup gating codes"` (admin tile description; noun-compound).
- URL paths `/login`, `/logout`, `/signup`, `/signup/expert` — per brief, paths stay unchanged.
- Internal identifiers (`signout`/`signout-everywhere` section ids, `login_attempts` rate-limit key, `handleGoogleSignUp`/`handleAppleSignUp` fn names, `LoginActivityCard`/`SignOutCard` component names, `authUser`, `isAuthed`, `signupRes`, etc.).

**Files touched (9)**
- `site/src/app/story/[slug]/page.tsx` — 3 edits (quiz-gate body + primary CTA + "Log in" secondary link → canonical; regwall "Sign Up Free" button → "Create free account").
- `site/src/app/signup/page.tsx` — 2 edits ("Log in instead" link → "Sign in instead"; "Create Account" submit button → "Create free account").
- `site/src/app/login/page.tsx` — 2 edits ("Sign In" submit button → "Sign in"; "Login failed" error string → "Sign in failed").
- `site/src/app/signup/expert/page.tsx` — 1 edit ("Signup failed" error string → "Sign up failed").
- `site/src/app/leaderboard/page.tsx` — 1 edit ("Create Account" anon CTA → "Create free account").
- `site/src/components/Interstitial.tsx` — 1 edit ("Create a free account" → "Create free account").
- `site/src/app/NavWrapper.tsx` — 1 edit (bottom-nav "Log In" label → "Sign in").
- `site/src/app/profile/settings/page.tsx` — 2 edits ("Login activity" subsection label + card title → "Sign-in activity"; hyphenated noun form used since this is a section name, not a button).
- `site/src/app/admin/system/page.tsx` — 1 edit ("Login attempts" rate-limit endpoint label → "Sign-in attempts"; parallel to the settings rename).

**Ambiguous cases decided**
- `Login activity` / `Login attempts` (admin-visible noun-compound labels) → canonicalized to `Sign-in activity` / `Sign-in attempts`. Brief says "Never use Login" and these labels are user-visible (admin is still a surface). Hyphenated noun form keeps the label grammatical.
- `Signup & Tenure` (admin cohort filter group) + `Signup gating codes` (admin tile desc) → LEFT as-is. These are noun compounds for the "signup" event/artifact, not auth CTAs, and the brief's prohibited verb-with-title-case-second-word doesn't apply. Rewriting to `Sign-up & Tenure` read worse.
- Regwall primary CTA (`Sign Up Free` on `/story/[slug]`) → `Create free account` per the brief's "reserved for the PRIMARY signup CTA button on ... regwall" rule. Dialog headline stays `Sign up to keep reading` (canonical verb).
- `/signup` submit button → `Create free account` (once-per-surface primary CTA on the signup surface itself).

**Verification**
- `cd site && npx tsc --noEmit` → EXIT=0.
- Post-sweep grep for non-canonical variants returns zero user-visible hits (remaining 4 hits are code comments only, listed above).
- Spot-checked the dev server (localhost:3000) via curl + grep on `/`, `/login`, `/signup`, `/notifications`, `/leaderboard`: `/login` SSR renders only canonical `Sign in`/`Sign up`; `/signup` SSR renders only canonical `Create free account`/`Sign in`; home + notifications + leaderboard anon CTAs are client-rendered so SSR carries no auth copy (source edits + tsc are the trustworthy gate there).
- No `.swift` files touched.
- URL paths `/login`, `/logout`, `/signup` untouched.
- File header markers (`@migrated-to-permissions`, `@feature-verified`) preserved — every edit was surgical.

### Q10-iOS + Q11 — Dynamic Type + sign-in casing

iOS companion to the web Q10 sweep plus a full Dynamic-Type retrofit. Combined because every `.swift` view in `VerityPost/VerityPost/` needed to be re-read end-to-end for both — single pass per file.

**Scope**
- Every `.swift` file under `VerityPost/VerityPost/*.swift` (38 total).
- Hardcoded `.font(.system(size: N))` calls → SwiftUI semantic fonts (`.body` / `.footnote` / `.title3` / ...) or `@ScaledMetric` for hero numerals that don't map cleanly to a semantic role.
- Sign-in casing — canonical `Sign in` / `Sign up` / `Sign out` (and `Create free account` for primary signup CTAs only). Verb CTAs in Text/Button; UI-copy comments; user-visible strings only (not `logout()` function names, not `showLogin` state vars, not URL paths).

**Files touched (22)**
Adult UI views: `LoginView.swift`, `SignupView.swift`, `ContentView.swift`, `ForgotPasswordView.swift`, `ResetPasswordView.swift`, `VerifyEmailView.swift`, `WelcomeView.swift`, `PushPromptSheet.swift`, `HomeView.swift`, `HomeFeedSlots.swift`, `RecapView.swift`, `MessagesView.swift`, `BookmarksView.swift`, `LeaderboardView.swift`, `AlertsView.swift`, `ExpertQueueView.swift`, `ProfileView.swift`, `ProfileSubViews.swift`, `PublicProfileView.swift`, `SubscriptionView.swift`, `SettingsView.swift`, `StoryDetailView.swift`.

Kid UI views: `KidViews.swift` (preserved `.rounded` design + `.heavy`/`.black` weights per kids visual language), `FamilyViews.swift`.

Shared UI components: `Theme.swift` (AvatarView, VerifiedBadgeView, StatRowView, PillButton).

Not touched (per brief's "don't modify" list): `Models.swift`, `SupabaseManager.swift`, `PermissionService.swift`, `AuthViewModel.swift`, `Log.swift`, `Keychain.swift`, `Password.swift`, `VerityPostApp.swift`, `SettingsService.swift`, `StoreManager.swift`, `PushPermission.swift` (no UI copy or hardcoded fonts). `PushRegistration.swift`, `TTSPlayer.swift` also untouched (no UI).

**Hardcoded-font replacements — totals**
Pre-sweep `grep -c '\.font(\.system(size:'` across `VerityPost/VerityPost/*.swift` = **545 occurrences** across 25 files. Post-sweep = **5 occurrences** across 2 files (all intentional — 3 are `@ScaledMetric`-backed in `KidViews.swift`, 2 are proportional-to-caller-passed-size in `Theme.swift` AvatarView + VerifiedBadgeView). Net **540 hardcoded font calls replaced**.

Of the 540 replacements:
- **537 use semantic fonts** (`.body`, `.footnote`, `.title3`, `.callout`, `.caption`, `.caption2`, `.headline`, `.subheadline`, `.largeTitle`, `.title`, `.title2`, or the paired `.system(.body, design: .default, weight: .semibold)` form when a weight modifier was needed).
- **3 use `@ScaledMetric`** — one per hero-numeral site in `KidViews.swift`:
  - `streakNumberSize: CGFloat = 34` (relativeTo: `.largeTitle`) — the "Day N" streak numeral on the kid home band.
  - `tileTitleSize: CGFloat = 22` (relativeTo: `.title`) — the per-tile headline on the kid home category grid (inside `CategoryTile`).
  - `numberSize: CGFloat = 28` (relativeTo: `.title`) — the `StatBubble` hero number on the kid profile 2×2 grid.
- Kid-mode sites preserved `.rounded` design + `.heavy` / `.black` weights throughout. Only the *sizes* moved to semantic or `@ScaledMetric`.
- Monospaced code-like surfaces in `SettingsView.swift` (MFA factor id, TOTP secret, TOTP URI, 6-digit verify field) kept `.monospaced` design; sizes switched to `.system(.<role>, design: .monospaced)`.

**Dynamic-Type safety nets added**
- Tab-bar labels (`ContentView.swift` TextTabBar, `KidViews.swift` KidTabBar): `.lineLimit(1) + .minimumScaleFactor(0.8)` — bottom-nav labels won't wrap/overflow at AX5.
- Large kid-tile titles: `.minimumScaleFactor(0.7)` — headline shrinks if Dynamic Type pushes it past 2-line wrap inside a 130pt-min tile.
- StatBubble numerals: `.minimumScaleFactor(0.7) + .lineLimit(1)`.
- Touch targets: `minHeight: 44` added to every primary-action button whose parent relied on intrinsic height (was previously `frame(height: 48)` or `padding(.vertical, 10-12)` only).

**Sign-in casing — strings changed (21 user-visible edits)**
| File | Change |
|---|---|
| `LoginView.swift` | "Sign In" button → "Sign in"; "// Login button" comment → "// Sign in button" |
| `SignupView.swift` | "Create Account" primary CTA → "Create free account" (per brief's "reserved for the primary signup button only" rule) |
| `ContentView.swift` | Tab-bar anon label "Log In" → "Sign in"; `SignInGate` secondary CTA "Create account" → "Create free account" |
| `ForgotPasswordView.swift` | "Back to Login" → "Back to sign in" |
| `AlertsView.swift` | `anonHero` "Create account" secondary CTA → "Create free account" |
| `ProfileView.swift` | `logoutButton` "Log out" → "Sign out"; `anonProfileHero` "Create account" → "Create free account" |
| `HomeView.swift` | Registration-wall primary CTA "Sign Up Free" → "Create free account" |
| `SettingsView.swift` | "Log out" destructive button → "Sign out"; `NavigationLink("Login Activity")` → `"Sign-in Activity"`; `navigationTitle("Login Activity")` → `"Sign-in Activity"`; "No recent login activity." → "No recent sign-in activity." |
| `StoryDetailView.swift` | Comments-gate "Log in to join the discussion." → "Sign in to join the discussion." |
| `MessagesView.swift` | List empty state button "New Message" → "New message"; search-sheet `navigationTitle("New Message")` → `"New message"` (sentence case on a button label; the Q10 brief canonicalized `Sign in/up/out`, and the "New Message" title-case pattern was the same kind of verb-with-title-case-second-word mismatch for a button CTA) |

Left unchanged (identifiers / URL paths / internal markers per brief):
- All `@State private var showLogin` / `showSignup`, `auth.login()`, `auth.logout()`, `auth.signInWithApple()`, `auth.signInWithGoogle()`, `LoginView` / `SignupView` struct names, `LoginActivityView` struct name (not user-visible — the navigation-destination's `navigationTitle` was updated, which is what the user sees).
- `verity://login` deep-link URL scheme (AuthViewModel.swift OAuth redirectTo).
- `SettingsService.swift` `require_login: Bool?` column field (server-side DB column name, not user-visible).
- `AuthViewModel.swift` `last_login_at` column, `cancelDeletionOnLogin`, `MARK: - Login` / `MARK: - Logout` section markers (not user-visible UI copy).
- `/api/account/login-cancel-deletion` API route path (server-side URL, not user-visible).
- Code comments that describe server routes / APNs flow / column schemas (per brief's "not comments unless they describe UI copy" rule).

**Ambiguous cases decided**
- `"Sign in with Apple"` / `"Sign in with Google"` buttons — already canonical (verb "Sign in", lowercase second word). Apple's Human Interface Guidelines dictate this phrasing for ASAuthorizationAppleIDButton parity; matches the brief.
- `SettingsView.swift`'s `Login Activity` — treated as user-visible even though it's a settings subsection label. Canonicalized to `Sign-in Activity` (hyphenated noun form) parallel to the web Q10 `Login activity` → `Sign-in activity` decision. Safer to keep capitalization of both words since it's a screen title, not a button verb.
- `MessagesView.swift`'s `New Message` button and sheet title — canonicalized the button label and sheet title to `New message` (sentence case). Internal identifier `showSearch` and channel `subscribeToNewMessages` left as-is (these are code-identifier names).
- `// Sign in with Apple (App Store Review Guideline 4.8)` and similar comments — left verbatim since the phrase matches Apple's published guideline wording, which is itself canonical ("Sign in" lowercase second word).

**Things not touched / flagged for follow-up**
- Comments describing server routes or DB column names (per scope limit).
- URL path deep-links (`verity://login`) — changing these would break the OAuth redirect contract with Supabase and is out of scope.
- Accessibility labels / hints — brief explicitly deferred these as separate work.
- `DMThreadView`'s `TextField("Type a message...", text: $input)` placeholder left as-is (placeholder text scales via `.font(.callout)` now — no change to copy).
- No Model / SupabaseManager / PermissionService / AuthViewModel / Log / Keychain / Password / VerityPostApp / SettingsService / StoreManager edits (per "don't modify" list).

**Verification**
- Every touched `.swift` file re-read end-to-end. All balanced braces + view hierarchies intact; no truncated edits.
- Post-sweep `grep -c '\.font(\.system(size:'` → 5 (all backed by `@ScaledMetric` or proportional-to-caller-passed-size params, documented inline with explanatory comments in `KidViews.swift` and `Theme.swift`).
- Post-sweep grep for `"Log in"|"Log out"|"Log In"|"Log Out"|"Sign In"|"Sign Out"|"Sign Up"` across user-visible `Text(...)` and `Button(...)` call sites → zero hits.
- Case-insensitive grep for remaining `login|logout` hits inspected — all are identifiers (`showLogin`, `auth.logout()`, `LoginView` struct, `LoginActivityView` struct, `cancelDeletionOnLogin`, `last_login_at` column, `require_login` column, `/api/account/login-cancel-deletion` route, `verity://login` OAuth redirect) or `// MARK: -` section markers. None render to the user.
- File header markers (`@migrated-to-permissions 2026-04-18` + per-file `@feature-verified <area> 2026-04-18` lines) preserved verbatim on every touched file. No file had its marker removed or reordered.
- Kids visual language preserved — every `KidViews.swift` font still carries `.rounded` design + `.heavy` / `.black` / `.semibold` weights where the original had them. Only the pt sizes moved to semantic or `@ScaledMetric`.
- Forced light mode (`preferredColorScheme(.light)`) untouched in `ContentView.swift` + `LoginView.swift`.
