# Current Tasks
Last compiled: 2026-04-26
Source: TASKS.md T-001–T-167, MASTER_TRIAGE_2026-04-23 open items, OwnerQuestions.md spec-ready Tasks, QUESTIONS_AND_CONTRADICTIONS.md §5 runtime bugs.

POST-LAUNCH items, Apple-console-blocked items, and SHIPPED items are excluded. Owner-decision-only items (T-085, T-086, Tasks 2/3 open items, T-143) are excluded. Items deferred to the end-of-sprint audit pass are excluded.

---

## Tier 2 — Security / correctness

5. **Remove dead `superadmin` role references from 8 RPCs and 12 policies** (T-004, Q16) — SHIPPED 2026-04-26. Migration `schema/180_strip_superadmin_references.sql` written. Strips `superadmin` from `IN (...)` clauses in 8 RPCs (`_user_is_moderator`, `approve_expert_answer`, `approve_expert_application`, `expert_can_see_back_channel`, `grant_role`, `mark_probation_complete`, `reject_expert_application`, `revoke_role`) and 2 RLS policies (`weekly_recap_questions_modify`, `weekly_recap_quizzes_modify`). DB confirms 2 policies with superadmin (task estimate of 12 counted per-file expression hits, not distinct live policy objects). Owner applies via Supabase dashboard. Post-apply: both verification queries in migration comments should return 0 rows.

6. **Fix `import-permissions.js` calling non-existent `bump_global_perms_version` RPC** (Q17) — SHIPPED 2026-04-26. Wrong RPC name (`bump_global_perms_version` → `bump_perms_global_version`), corrupt version=999 fallback, and unconditional double-bump removed; replaced with single correct RPC call that throws on error. Commit: ed83cfd.

7. **Fix messages/conversations brittle error-string status mapping** (T-012) — SHIPPED 2026-04-26. Removed 4 `msg.includes(...)` fallbacks from `messages/route.js` and 4 from `conversations/route.js`; simplified `isSelf` to `code === 'SELF_CONV'`. Schema/150 [CODE] prefix path is now the sole error-classification branch. Commit: 78f8f22.

8. **Rename `hasPermissionServer` to `hasPermissionViaRpc` in permissions.js and its one importer** (OwnerQ Task 20) — SHIPPED 2026-04-26. Renamed export in `permissions.js:207`, updated named import and call site in `rlsErrorHandler.js:18,62`. Note: a separate `hasPermissionServer` in `auth.js` (uses `compute_effective_perms`, 5 API-route callers) is unrelated and intentionally untouched. tsc clean. Commit: f8c6328.

10. **Make `hasPermission` fail-closed when `allPermsCache` is null — remove section-cache fallthrough** (OwnerQ Task 21) — SHIPPED 2026-04-26. Removed for-loop (lines 181-184) that iterated sectionCache when allPermsCache was null. hasPermission now returns false immediately on null cache — fail-closed. Updated stale comments at line 23 and lines 171-173. tsc clean. Commit: d5a6647.

11. **Migrate all admin pages from hardcoded role literals / role-set checks to `hasPermission` gating** (OwnerQ Task 19) — Phase 1: 6 hardcoded pages (`access`, `analytics`, `feeds`, `notifications`, `subscriptions`, `system`); Phase 2: ~38 role-set pages. Affects: `web/src/app/admin/` (all page-level gate code).

---

## Tier 3 — Rate limits, input caps, injection hardening

12. **Add rate limits to expert claim, ask, and back-channel routes** (T-016) — SHIPPED 2026-04-26. `checkRateLimit` added to all three routes: ask (5/60s), claim (30/60s), back-channel POST (20/60s). Service client moved above body parse per CLAUDE.md mandate. Migration `schema/183_seed_expert_rate_limit_policies.sql` seeds three `rate_limits` DB rows (apply via Supabase dashboard). Routes fall back to code defaults until migration is applied. Commit: 1e9863f.

14. **Add rate limit to quiz start and comment PATCH routes** (T-017) — SHIPPED 2026-04-26. `checkRateLimit` added to `quiz/start` POST (article-scoped key `quiz-start:{userId}:{articleId}`, 3/600s) and `comments/[id]` PATCH (user-scoped key `comment-edit:{userId}`, 5/60s). Migration `schema/184_seed_quiz_comment_edit_rate_limit_policies.sql` seeds both `rate_limits` rows (owner applies via Supabase dashboard). DELETE handler untouched. tsc clean. Commit: 4040fd6.

15. **Add input length caps on all unbounded text inputs** (T-014) — SHIPPED 2026-04-26. Hard-reject (400) added to: expert/ask body >1000, expert/back-channel body >2000, expert/queue/[id]/answer body >10000 (COPPA), appeals text >2000, reports description >1000, comment report description >1000. Optional fields use `description &&` guard. Each violation logged server-side. tsc clean. Commit: 16f86dd.

16. **Strip remaining raw `error.message` leaks from settings and other surfaces** (T-013) — grep `.message` in toast/error handlers across web; route each through `safeErrorResponse` or equivalent. Affects: `web/src/app/profile/settings/page.tsx`, remaining admin and API surfaces not swept in the 2026-04-24 session.

---

## Tier 4 — Data scoping / select hardening

17. **Replace `select('*')` on joins with explicit column lists** (T-019) — scope each query to columns the client actually renders; prevents moderation state and private fields reaching the client. Affects: comments query, `web/src/app/api/expert/back-channel/route.js`, `/expert/sessions/route.js`, `/recap/route.js`, `/support/route.js` GET.

18. **Narrow iOS ProfileView user column selection** (T-020) — replace `select("*, plans(tier)")` with an explicit field list. Affects: `VerityPost/VerityPost/ProfileView.swift`.

19. **Make adult quiz pass threshold DB-driven** (T-006, OwnerQ Task 10) — SHIPPED 2026-04-26. schema/187 seeds quiz_pass_threshold=3; user_passed_article_quiz and submit_quiz_attempt re-emitted using _setting_int. Owner must apply schema/187 via Supabase dashboard. Commits: b776352, 33bd455.

20. **Make `CommentRow.tsx` `COMMENT_MAX_DEPTH` read from `settings` table** (Q39) — SHIPPED 2026-04-26. COMMENT_MAX_DEPTH constant removed; /api/settings/public endpoint created; CommentRow fetches on mount. Commits: b776352, 33bd455.

---

## Tier 5 — Dead code removal

21. **Delete `BadgeUnlockScene.swift`, `QuizPassScene.swift`, and strip `biasedSpotted` param** (T-005, OwnerQ Task 11) — both scenes are unreachable dead code; remove files, strip the parameter from `completeQuiz`, remove the badge branch and the `extension BadgeUnlockScene: Identifiable`. Affects: `VerityPostKids/VerityPostKids/BadgeUnlockScene.swift`, `QuizPassScene.swift`, `KidsAppState.swift`, `KidsAppRoot.swift`.

22. **Delete `VerityPost/VerityPost/REVIEW.md`** (T-008, OwnerQ Task 16) — stale UI/UX audit from 2026-04-19 that ships inside the app bundle. Affects: `VerityPost/VerityPost/REVIEW.md`.

---

## Tier 6 — iOS bugs

25. **Fix iOS signup `users.upsert` race with auth trigger** (T-031) — make the sequence safe against the DB trigger that fires on auth user creation; prevent orphan auth rows and null usernames. Affects: `VerityPost/VerityPost/AuthViewModel.swift`.

26. **Audit `ParentalGateModal` call sites for missing COPPA gates** (T-120) — verify the gate fires on every external link, payment prompt, and mailto; confirm nothing is missing beyond the known 4 callers. Affects: `VerityPostKids/VerityPostKids/` — all external link, payment, and mailto surfaces.

27. **Add illustration support to kid reader** (T-119) — pull `articles.illustration_url` when present; UI-only change; no schema add yet (column does not currently exist — this task is blocked until the column is added). Affects: `VerityPostKids/VerityPostKids/KidReaderView.swift`.

---

## Tier 7 — Web UI / React correctness

29. **Fix optimistic-update rollback races across four components** (T-018) — on server failure, revert to pre-mutation state; currently the UI desyncs with no rollback. Affects: alerts toggle, `WatchlistButton`, `FollowButton`, `BlockButton`, `CommentRow.tsx`.

30. **Fix `PermissionsProvider` over-firing** (T-029) — filter `onAuthStateChange` events to exclude unnecessary triggers; add `visibilityState` gate to the 60-second poll. Affects: `web/src/` PermissionsProvider component.

31. **Fix Toast ID collision and timeout leak** (T-034) — switch from `Date.now() + Math.random()` to an incrementing ID; clear timeouts on unmount. Affects: Toast context/provider.

32. **Fix `CommentRow` unicode glyph inconsistency** (T-033) — standardize `⋯`/`—`/`…` usage to named constants throughout. Affects: `web/src/components/CommentRow.tsx`.

---

## Tier 8 — Design system / token foundations

33. **Build spacing token system** (T-036) — 4pt grid constants in `web/src/lib/spacing.ts` + `Theme.swift` + `KidsTheme.swift`; add pre-commit lint flagging raw padding numbers. Affects: new file `web/src/lib/spacing.ts`, `VerityPost/VerityPost/Theme.swift`, `VerityPostKids/VerityPostKids/KidsTheme.swift`.

34. **Build type ramp tokens** (T-037) — define display/headline/title/body/label/caption/footnote scales; body in serif, chrome in sans; iOS via `.scaledSystem`. Affects: new file `web/src/lib/typography.ts`, `Theme.swift`, `KidsTheme.swift`.

35. **Define color tokens with score-tier accents from `score_tiers` table** (T-038) — surface tier accent colors as the only decorative colors. Affects: new file `web/src/lib/colors.ts`, `Theme.swift`.

36. **Create elevation scale — three levels only** (T-039) — flat / raised / floating in global CSS and `Theme.swift`. Affects: global CSS, `Theme.swift`.

37. **Establish 200ms global transition with `prefers-reduced-motion` respect** (T-040) — one global rule applied to all state changes on adult surfaces. Affects: global CSS, iOS view transitions.

38. **Build `EmptyState` component** (T-041) — web `EmptyState.tsx` with title/body/cta props; iOS equivalent; replace all ad-hoc empty state patterns. Affects: new `web/src/components/EmptyState.tsx`, iOS equivalent.

39. **Build `Skeleton` component** (T-042) — card/line/avatar variants; replaces every spinner; shape matches content. Affects: new `web/src/components/Skeleton.tsx`, iOS `.redacted(reason: .placeholder)`.

40. **Unify Toast component across all adult mutations** (T-043) — wire success (4s) / error (8s with action) / info (4s) variants to every mutation path that currently produces no toast. Affects: all web mutation call sites, iOS mutation paths.
SHIPPED 2026-04-26 · 9ec6eac — messages/page.tsx sendMessage + blockOtherUser + submitReport wired to global Toast; local actionToast state + inline banner removed.

41. **Build `LockedFeatureCTA` component** (T-044) — replaces `LockModal.tsx` blocking pattern; inline faded surface with upsell beneath; `gateType` prop: `plan` / `role` / `verification`. Affects: new `web/src/components/LockedFeatureCTA.tsx`, iOS equivalent.

42. **Classify all `hasPermission()` call sites with `gateType`** (T-045) — prerequisite for T-067 swap; ~50 sites across web and iOS must each be classified as plan / role / verification before the LockModal replacement. Affects: ~50 call sites across `web/src/` and `VerityPost/`.

43. **Implement natural-language date format helpers** (T-046) — "Friday afternoon" not "Apr 25, 2026 14:32"; ISO stays in code and admin tables only. Affects: new `web/src/lib/dates.ts`, iOS date utilities.
SHIPPED 2026-04-26 · 9ec6eac — created web/src/lib/dates.ts (formatDate, formatDateTime, timeAgo); extracted timeAgo from CommentRow.tsx; swept 16 raw toLocaleDateString/toLocaleString call sites across 11 non-admin pages.

---

## Tier 9 — Web UX / forms / routing

44. **Migrate non-OAuth `window.location.href` calls to `router.push`** (T-052) — convert the safe-to-migrate callsites only; do NOT touch `login/page.tsx:242`, `signup/page.tsx:120,228` (Set-Cookie requires hard navigation). Affects: `web/src/app/signup/pick-username/page.tsx:96,190,209`, `welcome/page.tsx:16,21`, `verify-email/page.tsx:185-189`, `signup/expert/page.tsx:250`.

45. **Add inline form validation across all forms** (T-053) — validate on blur, show errors inline below the field, not in a toast. Affects: all web and iOS forms.

46. **Fix keyboard-avoidance on iOS forms** (T-056) — keyboard covers inputs on several forms; wrap in `ScrollView` with `KeyboardAdaptive` or equivalent. Affects: iOS form views.

47. **Verify SIWA placement in all auth surfaces — first-position or equal visual weight** (T-058) — App Store Review rejects SIWA buried below other options; verify after any auth layout changes. Affects: `LoginView.swift`, `SignupView.swift`, `web/src/app/login/page.tsx`, `web/src/app/signup/page.tsx`.

48. **Add explicit close buttons to all sheets** (T-051) — every modal/sheet gets a close button; exempt `ParentalGateModal.swift` (its "Not now" is the only sanctioned dismiss path per COPPA). Affects: all modal/sheet components on web and iOS.

---

## Tier 11 — Settings split (PRELAUNCH Phase 3 — HIGH RISK, run pre-flight first)

55. **Flip 11 settings sub-routes from redirect shims to real destinations** (T-073) — each sub-route becomes the real page; the unified `/profile/settings` page becomes a sidebar/landing or redirects out. Run full pre-flight in `PRELAUNCH_UI_CHANGE.md` Part 10 before starting. Affects: `web/src/app/profile/settings/{alerts,billing,blocked,data,emails,expert,feed,login-activity,password,profile,supervisor}/page.tsx`.

56. **Audit `email_templates` table for `/profile/settings#anchor` URLs** (T-076) — update anchor-based links to `/profile/settings/{section}` paths in the five live templates. Affects: `email_templates` DB rows: `breaking_news_alert`, `kid_trial_day6`, `kid_trial_expired`, `data_export_ready`, `expert_reverification_due`.

57. **Audit APNs `aps.url` and `notifications.action_url` for anchor URLs** (T-077) — sweep and update `/profile/settings#billing`-style URLs before the settings split ships. Affects: `web/src/app/api/cron/send-push/route.js`, `notifications` table data.

58. **Audit cron routes for URL coupling to settings** (T-078) — find and update any hardcoded `/profile/settings#anchor` URLs. Affects: `process-data-exports`, `flag-expert-reverifications`, `sweep-kid-trials`, `cleanup-data-exports`, `send-emails` cron routes.

59. **Update 6 e2e test files for settings split URL changes** (T-079) — update all assertions for the new URL structure. Affects: `profile-settings.spec.ts`, `billing-flows.spec.ts`, `bookmarks.spec.ts`, `messages-notifications.spec.ts`, `auth-edge-cases.spec.ts`, `anon-golden-path.spec.ts`.

60. **Review `robots.js` for settings sub-route disallow rules** (T-080) — decide whether sub-routes are indexable and update accordingly. Affects: `web/src/app/robots.js`.

---

## Tier 12 — Surface rebuilds (PRELAUNCH Phases 1–6)

62. **Add clean stop indicator to home page** (T-060) — small dated mark or thin rule after the last article signaling "that's today's brief"; page ends, not infinite scroll. Affects: `web/src/app/page.tsx`, `VerityPost/VerityPost/HomeView.swift`.

63. **Make story reader full-bleed with collapsing chrome** (T-061) — no persistent chrome; top bar collapses on scroll to a 1px progress line. Affects: `web/src/app/story/[slug]/page.tsx`, `VerityPost/VerityPost/StoryDetailView.swift`.

64. **Move source chips inline as superscript citations** (T-062) — sources currently at the bottom; move inline as superscript numbers with tap-to-reveal citation card. Affects: story reader web and iOS.

65. **Make quiz unfold inline in story reader** (T-063) — at ~50% scroll: ribbon whispers quiz availability; at ~95%: ribbon expands into quiz panel. No modal, no nav change. Affects: `web/src/app/story/[slug]/page.tsx`, `StoryDetailView.swift`.

66. **Add comprehension badge and score-tier color to comment avatars** (T-065) — avatar ring colored by commenter's verity score tier; comprehension badge on avatar. Affects: `web/src/components/CommentRow.tsx`, iOS comment views.

69. **Remove curation-attribution language from all user-facing surfaces** (T-121) — no "Why we picked these," "hand-curated by," or any language naming or alluding to story selectors. Affects: home page, marketing pages, any UI copy referencing curation.

70. **Build billing page with one card per tier** (T-081) — tier name in display type, price below, 5-line unlock list from `plan_features` table, annual savings in dollars. Affects: `web/src/app/profile/settings/billing` route, `VerityPost/VerityPost/SubscriptionView.swift`.

71. **Show `verity_family` and `verity_family_xl` as "Coming soon" on billing UI** (T-084, OwnerQ Task 9) — currently filtered out entirely; render as greyed-out "Coming soon" cards instead. Affects: `web/src/app/profile/settings/page.tsx` billing section (~line 3817).

72. **Add family plan visualization to billing** (T-082) — two parent silhouettes + N kid silhouettes captioned "Verity Family: 2 adults + 2 kids." Affects: billing page web and iOS.

74. **Convert bookmarks to cover-card grid** (T-087) — article thumbnails, title, source, date saved; replace current list view. Affects: `web/src/app/bookmarks/page.tsx`, `VerityPost/VerityPost/BookmarksView.swift`.

76. **Add bookmark collections as folders** (T-089) — paid feature; first article's image becomes folder cover; gated to Verity tier and above. Affects: bookmarks page web and iOS.

77. **Add full-text search within bookmarks** (T-090) — free for all users; search saved articles. Affects: bookmarks page web and iOS.

78. **Show bookmark notes inline on cover cards** (T-091) — small italic preview if a note exists. Affects: bookmarks page web and iOS.

79. **Style top 3 leaderboard entries with podium treatment** (T-092) — larger cards, tier accent color, score visible for ranks 1-3. Affects: `web/src/app/leaderboard/page.tsx`, `LeaderboardView.swift`.
SHIPPED 2026-04-26. rankAccentColor() on web, podiumColor(for:) on iOS; isPodium prop adds 2px extra vpad to rows 1-3. Commit: a300edc.

80. **Make user rank sticky at bottom of leaderboard while scrolling** (T-093) — sticky footer showing the viewer's own rank. Affects: leaderboard web and iOS.
SHIPPED 2026-04-26. Web: position:fixed bottom bar (zIndex 100) renders when myRank != null. iOS: .safeAreaInset(edge:.bottom) above tab bar, conditional on user being in the loaded list. Commit: a300edc.

81. **Convert leaderboard category dropdown to horizontal tab strip** (T-094). Affects: leaderboard web and iOS.

82. **Render kids in kid-styled treatment on family leaderboard** (T-095). Affects: leaderboard family view web and iOS.

83. **Add public profile drawer tap from leaderboard names** (T-096) — tap a name to see public profile without leaving leaderboard. Affects: leaderboard web and iOS.

84. **Add verity-score-colored avatar rings to messages** (T-097). Affects: `web/src/app/messages/page.tsx`, `MessagesView.swift`.

85. **Add comprehension badges to message thread contacts** (T-098) — badge for contacts who passed the same quiz as the viewer. Affects: messages web and iOS.

86. **Improve message thread preview density** (T-099) — show last message text + relative time. Affects: messages list web and iOS.

87. **Make message compose full-screen on iOS, modal on web** (T-100). Affects: `MessagesView.swift`, web compose component.

88. **Add block/report action to web message thread header** (T-101) — iOS already has this in thread footer. Affects: web message thread header.

89. **Show free user inbox faded with `LockedFeatureCTA`** (T-102) — instead of the blocking LockModal, free users see the inbox shape faded with `gateType="plan"`. Affects: `web/src/app/messages/page.tsx`, `MessagesView.swift`.

90. **Replace notification titles with inline message previews** (T-104). Affects: notification list web and iOS.

91. **Move notification Manage to `/notifications/manage` route** (T-106) — notifications is consumption, Manage is configuration. Affects: `web/src/app/notifications/page.tsx` and routing.

92. **Auto-advance to next question on expert submit** (T-111). Affects: expert queue web and iOS.

96. **Add vacation mode toggle to expert queue header** (T-112). Affects: expert queue web and iOS.

97. **Add unread count badge to expert queue back-channel tab** (T-113). Affects: expert queue tab navigation web and iOS.

103. **Make recap detail story-format with source preamble** (T-116) — each question includes "this question came from this article" context. Affects: recap detail web and iOS.

105. **Make kids home "today's adventure" with single CTA** (T-118) — one primary CTA, today's article; below: yesterday's badges, this week's streak. Affects: `VerityPostKids/VerityPostKids/KidsAppRoot.swift` or home tab.

106. **Add microcopy preview to every settings toggle** (T-074) — one sentence preview of what changes per toggle. Affects: all settings toggle rows web and iOS.

107. **Rebuild settings on iOS as card-based hub** (T-075) — cards on root, push to detail; Account / Profile / Notifications / Reading / Privacy / Billing / Family / Danger. Affects: `VerityPost/VerityPost/SettingsView.swift`.

108. **Swap all `LockModal` call sites to `LockedFeatureCTA`** (T-067) — plan-gated = upsell; role-gated = muted explainer; verification-gated = CTA to verify. **Blocked on item 42 (build component) and item 43 (classify call sites).** Affects: all `LockModal` usage across web and iOS.

109. **Rebuild profile hero with verity score ring** (T-068) — score ring as centerpiece, tier name as soft subhead, delta-to-next as small gauge. **Blocked on T-085 (owner decides nav model — do not start until decided).** Affects: `web/src/app/profile/page.tsx`, `ProfileView.swift`.

110. **Replace streak integer cards with 30-day calendar grid** (T-069) — full-width 30-day calendar with activity-colored cells. **Blocked on T-085.** Affects: profile page web and iOS.

111. **Convert categories tab to reading heatmap** (T-070). **Blocked on T-085.** Affects: profile categories surface web and iOS.

112. **Convert milestones surface to badge wall** (T-071) — earned full color, unearned silhouette with criteria. **Blocked on T-085.** Affects: profile milestones surface web and iOS.

113. **Build public profile as portfolio view** (T-072) — best comments, top categories, earned badges for other-user view. **Blocked on T-085.** Affects: `/u/[username]` web route and iOS equivalent.

---

## Tier 13 — Admin surfaces

114. **Build admin hub daily dashboard** (T-122) — today's reports queue, pipeline runs, revenue, signups, churn; numbers + sparklines. Affects: `web/src/app/admin/` (new hub page).

115. **Build admin newsroom daily workflow** (T-123) — drag-drop ordering of home stories, schedule-for-future, preview-as-anon. Affects: `/admin/newsroom` page.

116. **Rebuild newsroom cluster UI — Kids and Adult horizontal cards per cluster** (OwnerQ Task 2) — replace flat single-row layout with two per-cluster cards; delete `GenerationModal.tsx`; route Generate directly to story-manager pages. Open layout/Both-button items need owner direction before coding. Affects: `web/src/app/admin/newsroom/page.tsx`, `web/src/components/admin/GenerationModal.tsx`.

117. **Delete F7 `articles/[id]/review` and `articles/[id]/edit` pages** (OwnerQ Task 4) — blocked on Task 2 (newsroom rebuild must route Generate to story-manager first). **Blocked on item 117.** Affects: `web/src/app/admin/articles/[id]/review/page.tsx`, `web/src/app/admin/articles/[id]/edit/page.tsx`.

118. **Share chrome between admin moderation queue and expert queue** (T-124) — 4 tabs, claim/resolve, action history inline. Affects: `/admin/moderation/page.tsx` and expert queue admin view.

119. **Build admin permissions live resolver** (T-125) — "If I grant this permission to this user, here's what changes for them" preview before save. Affects: `/admin/permissions/page.tsx`.

120. **Build admin user dossier** (T-126) — history, perms, plan, kids, devices, comments, reports against, reports by in one scroll. Affects: `/admin/users/[id]/page.tsx`.

121. **Add preview-before-save to admin settings page** (T-127) — any value that affects user UX shows a preview of the impact. Affects: `/admin/settings/page.tsx`.

---

## Tier 14 — Notification templates

124. **Add `streak_jeopardy` push notification** (T-136) — push at hour 22 if today's reading log is empty. **Blocked on item 111** (streak grid must exist for the notification to reference). Affects: `web/src/app/api/cron/send-push/route.js`.

---

## Tier 15 — CI, testing, and visual regression

125. **Wire visual regression baseline into CI** (T-049) — set up Playwright `toHaveScreenshot` calls for top 10 surfaces × 5 iOS sizes + 4 web viewports; fail PRs on diff outside tolerance. Affects: `web/tests/` and CI pipeline.

126. **Measure and record bundle-size baseline** (T-050) — SHIPPED 2026-04-26. Commit e147426. 212 routes, First Load JS shared 258 kB, Middleware 141 kB. Heaviest: /profile/settings 352 kB, /story/[slug] 349 kB. Normal build fails locally due to @sentry/nextjs 8.40.0 + Next.js 14.2.35 chunk-path conflict (Vercel unaffected); used SENTRY_DISABLE_WEBPACK_PLUGIN=1 for measurement. Full data in `web/bundle-size-baseline.txt`.

127. **Create `apple-app-site-association` file** (T-047) — file does not exist; Universal Links are non-functional. Must ship in the same commit as item 129. Covers `/story/*`, `/profile/*`, `/leaderboard/*`, `/search*`, `/bookmarks*`, `/messages*`, `/notifications*`. Affects: `web/public/.well-known/apple-app-site-association` (new file).

128. **Add `associated-domains` entitlement to adult app** (T-048) — `com.apple.developer.associated-domains` is missing from the adult app entitlements; add `applinks:veritypost.com`. Must ship in the same commit as item 128. Affects: `VerityPost/VerityPost/VerityPost.entitlements`, `VerityPostKids/VerityPostKids/VerityPostKids.entitlements`.

---

## Tier 16 — Token sweep (runs after token foundations are built)

129. **Apply spacing and type ramp tokens across all web surfaces** (T-137) — replace raw padding numbers and font sizes with token references after items 34 and 35 ship. **Blocked on items 34, 35.** Affects: all pages and components in `web/src/`.

130. **Apply spacing and type ramp tokens across all iOS views** (T-138) — same sweep on Swift views after items 34 and 35. **Blocked on items 34, 35.** Affects: all Swift views in `VerityPost/` and `VerityPostKids/`.

131. **Add loading skeleton to every data-loading surface** (T-139) — replace every spinner with a shape-matched skeleton after item 40 ships. **Blocked on item 40.** Affects: all pages/views with async data loads web and iOS.

132. **Add error states to all surfaces** (T-140) — every data load failure has an actionable error state after item 39 ships. **Blocked on item 39.** Affects: all pages/views web and iOS.

135. **Migrate `.js` and `.jsx` files in `web/src/` to TypeScript** (T-028) — 50-100+ files violating the CLAUDE.md no-new-js rule; batch migrate with per-file tsc verification. Affects: `web/src/` broadly.

---

## Tier 17 — Doc / repo hygiene

136. **Fix 3 remaining stale facts in `CLAUDE.md`** (T-007, OwnerQ Task 14) — 3 of 6 SHIPPED 2026-04-26 (56c8dad): FALLBACK_CATEGORIES note removed, hooks count de-numbered, settings page size updated to ~5,300. Still open: Apple dev account claim accuracy, ParentalGate callers (4 not 0), `100_backfill_admin_rank_rpcs_*.sql` path (in `Archived/` not `schema/`). Affects: `CLAUDE.md` (root).

138. **Rewrite `Future Projects/02_PRICING_RESET.md` to reflect locked prices** (OwnerQ Task 7) — drop A/B framing; document Verity $3.99/$39.99, Pro $9.99/$99.99, Family $14.99/$149.99, FamilyXL $19.99/$199.99. Affects: `Ongoing Projects/Future/02_PRICING_RESET.md`, `Ongoing Projects/Future/views/ios_adult_subscription.md`.

139. **Strip kid illustration requirement from `PRELAUNCH_UI_CHANGE.md` §3.13** (OwnerQ Task 6) — `articles.illustration_url` column doesn't exist; remove the column-add requirement from the doc. Affects: `Archived/Ongoing Projects/Pre-Launch/PRELAUNCH_UI_CHANGE.md:225,386`.

141. **Patch dead-path references in `Sessions/` logs** (OwnerQ Task 15) — update `site/`, `01-Schema/`, `proposedideas/`, `05-Working/`, `docs/`, etc. references to current paths. Affects: session log files under `Workbench/Sessions/`.

145. **Move stale retired docs into `Archived/_obsolete-readonly/`** (ARCHIVED_COMPLETED §4.4) — identify the most outdated retired docs (e.g. superseded design specs, replaced reference docs) and relocate them one level deeper to prevent confusion. Affects: files under `Archived/` (owner to designate candidates before execution).
