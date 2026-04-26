# Current Tasks
Last compiled: 2026-04-26
Source: TASKS.md T-001–T-167, MASTER_TRIAGE_2026-04-23 open items, OwnerQuestions.md spec-ready Tasks, QUESTIONS_AND_CONTRADICTIONS.md §5 runtime bugs.

POST-LAUNCH items, Apple-console-blocked items, and SHIPPED items are excluded. Owner-decision-only items (T-085, T-086, Tasks 2/3 open items, T-143) are excluded. Items deferred to the end-of-sprint audit pass are excluded.

---

## Tier 2 — Security / correctness

2. **Reconstruct missing DR schema sources for migrations 092, 093, 100** (T-003, Q14) — SHIPPED 2026-04-26. `schema/092_rls_lockdown_2026_04_19.sql`, `schema/092b_rls_lockdown_followup_2026_04_19.sql`, and `schema/093_rpc_actor_lockdown_2026_04_19.sql` written from live DB statements (queried via supabase_migrations). Migration 100 already covered by `Archived/100_backfill_admin_rank_rpcs_2026_04_19.sql`. `reset_and_rebuild_v2.sql` not modified per owner instruction.

5. **Remove dead `superadmin` role references from 8 RPCs and 12 policies** (T-004, Q16) — write a migration stripping `superadmin` from `IN (...)` clauses in all affected routine bodies and policies. Affects: `schema/014`, `016`, `026`, `167`, `174` (new migration needed).

6. **Fix `import-permissions.js` calling non-existent `bump_global_perms_version` RPC** (Q17) — create the missing RPC or wire to the correct existing one (`bump_user_perms_version`/`perms_global_version` write). Affects: `scripts/import-permissions.js`.

7. **Fix messages/conversations brittle error-string status mapping** (T-012) — replace `error.message.includes(...)` pattern with stable `[CODE]` prefix checks already landed on the RPC side. Affects: `web/src/app/api/messages/route.js`, `web/src/app/api/conversations/route.js`.

8. **Fix `KidsAppState.completeQuiz` mutating local state before server confirmation** (Q33) — sequence the local state update so it only fires after the server call succeeds. Affects: `VerityPostKids/VerityPostKids/KidsAppState.swift:187-200`.

9. **Rename `hasPermissionServer` to `hasPermissionViaRpc` in permissions.js and its one importer** (OwnerQ Task 20) — purely a name-clarity fix, no behavior change. Affects: `web/src/lib/permissions.js`, `web/src/lib/rlsErrorHandler.js`.

10. **Make `hasPermission` fail-closed when `allPermsCache` is null — remove section-cache fallthrough** (OwnerQ Task 21) — 3-line change eliminating the initial-load window where stale section cache is read. Affects: `web/src/lib/permissions.js:181-185`.

11. **Migrate all admin pages from hardcoded role literals / role-set checks to `hasPermission` gating** (OwnerQ Task 19) — Phase 1: 6 hardcoded pages (`access`, `analytics`, `feeds`, `notifications`, `subscriptions`, `system`); Phase 2: ~38 role-set pages. Affects: `web/src/app/admin/` (all page-level gate code).

---

## Tier 3 — Rate limits, input caps, injection hardening

12. **Add rate limits to comment vote, flag, and report routes** (T-015) — add `checkRateLimit` calls following the established route convention. Affects: `web/src/app/api/comments/[id]/vote/route.js`, `/flag/route.js`, `/report/route.js`.

13. **Add rate limits to expert claim, ask, and back-channel routes** (T-016) — no rate limiting exists on any of these three endpoints. Affects: `web/src/app/api/expert/claim/route.js`, `/ask/route.js`, `/back-channel/route.js`.

14. **Add rate limit to quiz start and comment PATCH routes** (T-017) — add `checkRateLimit` to both handlers. Affects: `web/src/app/api/quiz/start/route.js`, `web/src/app/api/comments/[id]/route.js` PATCH handler.

15. **Add input length caps on all unbounded text inputs** (T-014) — enforce `maxLength` at API layer on support form, expert/ask, expert/back-channel, expert/queue answer, recap submit, appeals, reports, comment report. Affects: the six named API routes.

16. **Strip remaining raw `error.message` leaks from settings and other surfaces** (T-013) — grep `.message` in toast/error handlers across web; route each through `safeErrorResponse` or equivalent. Affects: `web/src/app/profile/settings/page.tsx`, remaining admin and API surfaces not swept in the 2026-04-24 session.

---

## Tier 4 — Data scoping / select hardening

17. **Replace `select('*')` on joins with explicit column lists** (T-019) — scope each query to columns the client actually renders; prevents moderation state and private fields reaching the client. Affects: comments query, `web/src/app/api/expert/back-channel/route.js`, `/expert/sessions/route.js`, `/recap/route.js`, `/support/route.js` GET.

18. **Narrow iOS ProfileView user column selection** (T-020) — replace `select("*, plans(tier)")` with an explicit field list. Affects: `VerityPost/VerityPost/ProfileView.swift`.

19. **Make adult quiz pass threshold DB-driven** (T-006, OwnerQ Task 10) — add a `settings` row `quiz.min_pass_score=3`, update `user_passed_article_quiz()` and `submit_quiz_attempt()` in `schema/012` to read it instead of hardcoding `>= 3`. Affects: `schema/012_phase4_quiz_helpers.sql:85,322` (new migration needed).

20. **Make `CommentRow.tsx` `COMMENT_MAX_DEPTH` read from `settings` table** (Q39) — currently hardcoded to `2`; the `settings` table has the row. Affects: `web/src/components/CommentRow.tsx:31`.

---

## Tier 5 — Dead code removal

21. **Delete `BadgeUnlockScene.swift`, `QuizPassScene.swift`, and strip `biasedSpotted` param** (T-005, OwnerQ Task 11) — both scenes are unreachable dead code; remove files, strip the parameter from `completeQuiz`, remove the badge branch and the `extension BadgeUnlockScene: Identifiable`. Affects: `VerityPostKids/VerityPostKids/BadgeUnlockScene.swift`, `QuizPassScene.swift`, `KidsAppState.swift`, `KidsAppRoot.swift`.

22. **Remove iOS expert insights dead `#if false` block** (T-021) — find and delete. Affects: `VerityPost/VerityPost/` (expert insights file with `#if false`).

23. **Remove iOS `appAwardPoints` dead function** (T-022) — find and delete unused function. Affects: `VerityPost/VerityPost/` (wherever `appAwardPoints` is defined).

24. **Delete `VerityPost/VerityPost/REVIEW.md`** (T-008, OwnerQ Task 16) — stale UI/UX audit from 2026-04-19 that ships inside the app bundle. Affects: `VerityPost/VerityPost/REVIEW.md`.

---

## Tier 6 — iOS bugs

25. **Fix iOS signup `users.upsert` race with auth trigger** (T-031) — make the sequence safe against the DB trigger that fires on auth user creation; prevent orphan auth rows and null usernames. Affects: `VerityPost/VerityPost/AuthViewModel.swift`.

26. **Cache `DateFormatter` instances in iOS views** (T-025) — move from per-render instantiation to a shared static. Affects: iOS views using `DateFormatter`.

27. **Audit `ParentalGateModal` call sites for missing COPPA gates** (T-120) — verify the gate fires on every external link, payment prompt, and mailto; confirm nothing is missing beyond the known 4 callers. Affects: `VerityPostKids/VerityPostKids/` — all external link, payment, and mailto surfaces.

28. **Add illustration support to kid reader** (T-119) — pull `articles.illustration_url` when present; UI-only change; no schema add yet (column does not currently exist — this task is blocked until the column is added). Affects: `VerityPostKids/VerityPostKids/KidReaderView.swift`.

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

41. **Build `LockedFeatureCTA` component** (T-044) — replaces `LockModal.tsx` blocking pattern; inline faded surface with upsell beneath; `gateType` prop: `plan` / `role` / `verification`. Affects: new `web/src/components/LockedFeatureCTA.tsx`, iOS equivalent.

42. **Classify all `hasPermission()` call sites with `gateType`** (T-045) — prerequisite for T-067 swap; ~50 sites across web and iOS must each be classified as plan / role / verification before the LockModal replacement. Affects: ~50 call sites across `web/src/` and `VerityPost/`.

43. **Implement natural-language date format helpers** (T-046) — "Friday afternoon" not "Apr 25, 2026 14:32"; ISO stays in code and admin tables only. Affects: new `web/src/lib/dates.ts`, iOS date utilities.

---

## Tier 9 — Web UX / forms / routing

44. **Migrate non-OAuth `window.location.href` calls to `router.push`** (T-052) — convert the safe-to-migrate callsites only; do NOT touch `login/page.tsx:242`, `signup/page.tsx:120,228` (Set-Cookie requires hard navigation). Affects: `web/src/app/signup/pick-username/page.tsx:96,190,209`, `welcome/page.tsx:16,21`, `verify-email/page.tsx:185-189`, `signup/expert/page.tsx:250`.

45. **Add inline form validation across all forms** (T-053) — validate on blur, show errors inline below the field, not in a toast. Affects: all web and iOS forms.

46. **Fix keyboard-avoidance on iOS forms** (T-056) — keyboard covers inputs on several forms; wrap in `ScrollView` with `KeyboardAdaptive` or equivalent. Affects: iOS form views.

47. **Verify SIWA placement in all auth surfaces — first-position or equal visual weight** (T-058) — App Store Review rejects SIWA buried below other options; verify after any auth layout changes. Affects: `LoginView.swift`, `SignupView.swift`, `web/src/app/login/page.tsx`, `web/src/app/signup/page.tsx`.

48. **Add explicit close buttons to all sheets** (T-051) — every modal/sheet gets a close button; exempt `ParentalGateModal.swift` (its "Not now" is the only sanctioned dismiss path per COPPA). Affects: all modal/sheet components on web and iOS.

---

## Tier 10 — Weekly digest removal (PRELAUNCH §6.1)

49. **Soft-delete `weekly_reading_report` email template** (T-128) — set `is_active=false` on the DB row. Affects: `email_templates` DB table.

50. **Soft-delete `weekly_family_report` email template** (T-129) — set `is_active=false` on the DB row. Affects: `email_templates` DB table.

51. **Remove weekly digests from `send-emails` cron** (T-130) — remove both `weekly_reading_report` and `weekly_family_report` entries from `TYPE_TO_TEMPLATE`. Affects: `web/src/app/api/cron/send-emails/route.js:23-24`.

52. **Remove weekly digest toggles from admin notifications page** (T-131) — remove `email_weekly_reading_report` and `email_weekly_family_report` toggles and their default-true entries. Affects: `web/src/app/admin/notifications/page.tsx:44-45,70`.

53. **Remove weekly digest preference keys from user settings** (T-132) — remove `weekly_reading_report` and `weekly_family_report` keys and labels. Affects: `web/src/app/profile/settings/page.tsx:244,259`.

54. **Remove weekly digest notification row producers** (T-133) — grep `web/src` for `weekly_reading_report|weekly_family_report` and remove any code inserting matching notification rows. Affects: any server code producing those notification types.

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

61. **Rebuild home hero with full-bleed treatment** (T-059) — image bleeds to viewport/screen edges; title overlays bottom-left in serif display type; human date format ("Friday, April 25" not "04/25/26"). Affects: `web/src/app/page.tsx`, `VerityPost/VerityPost/HomeView.swift`.

62. **Add clean stop indicator to home page** (T-060) — small dated mark or thin rule after the last article signaling "that's today's brief"; page ends, not infinite scroll. Affects: `web/src/app/page.tsx`, `VerityPost/VerityPost/HomeView.swift`.

63. **Add anon trial counter pill to story reader** (T-066) — top-right pill showing "1 of 2 free reads" so the paywall arrives expected. Affects: `web/src/app/story/[slug]/page.tsx`, `VerityPost/VerityPost/StoryDetailView.swift`.

64. **Make story reader full-bleed with collapsing chrome** (T-061) — no persistent chrome; top bar collapses on scroll to a 1px progress line. Affects: `web/src/app/story/[slug]/page.tsx`, `VerityPost/VerityPost/StoryDetailView.swift`.

65. **Move source chips inline as superscript citations** (T-062) — sources currently at the bottom; move inline as superscript numbers with tap-to-reveal citation card. Affects: story reader web and iOS.

66. **Make quiz unfold inline in story reader** (T-063) — at ~50% scroll: ribbon whispers quiz availability; at ~95%: ribbon expands into quiz panel. No modal, no nav change. Affects: `web/src/app/story/[slug]/page.tsx`, `StoryDetailView.swift`.

67. **Slide comment panel in beneath article on quiz pass** (T-064) — Discussion panel slides in beneath the article using the 200ms global transition; no tab switch. Affects: story reader web and iOS.

68. **Add comprehension badge and score-tier color to comment avatars** (T-065) — avatar ring colored by commenter's verity score tier; comprehension badge on avatar. Affects: `web/src/components/CommentRow.tsx`, iOS comment views.

69. **Remove curation-attribution language from all user-facing surfaces** (T-121) — no "Why we picked these," "hand-curated by," or any language naming or alluding to story selectors. Affects: home page, marketing pages, any UI copy referencing curation.

70. **Build billing page with one card per tier** (T-081) — tier name in display type, price below, 5-line unlock list from `plan_features` table, annual savings in dollars. Affects: `web/src/app/profile/settings/billing` route, `VerityPost/VerityPost/SubscriptionView.swift`.

71. **Show `verity_family` and `verity_family_xl` as "Coming soon" on billing UI** (T-084, OwnerQ Task 9) — currently filtered out entirely; render as greyed-out "Coming soon" cards instead. Affects: `web/src/app/profile/settings/page.tsx` billing section (~line 3817).

72. **Add family plan visualization to billing** (T-082) — two parent silhouettes + N kid silhouettes captioned "Verity Family: 2 adults + 2 kids." Affects: billing page web and iOS.

73. **Replace promo code field with "Have a code?" link** (T-083) — visible promo field replaced with a small link that expands the field on tap. Affects: billing page web and iOS.

74. **Convert bookmarks to cover-card grid** (T-087) — article thumbnails, title, source, date saved; replace current list view. Affects: `web/src/app/bookmarks/page.tsx`, `VerityPost/VerityPost/BookmarksView.swift`.

75. **Add proactive bookmark cap counter** (T-088) — visible from save #1 ("1 of 10 saved"); escalates at 7 and 9; `LockedFeatureCTA` with `gateType="plan"` on the upgrade half. Affects: bookmarks page web and iOS.

76. **Add bookmark collections as folders** (T-089) — paid feature; first article's image becomes folder cover; gated to Verity tier and above. Affects: bookmarks page web and iOS.

77. **Add full-text search within bookmarks** (T-090) — free for all users; search saved articles. Affects: bookmarks page web and iOS.

78. **Show bookmark notes inline on cover cards** (T-091) — small italic preview if a note exists. Affects: bookmarks page web and iOS.

79. **Style top 3 leaderboard entries with podium treatment** (T-092) — larger cards, tier accent color, score visible for ranks 1-3. Affects: `web/src/app/leaderboard/page.tsx`, `LeaderboardView.swift`.

80. **Make user rank sticky at bottom of leaderboard while scrolling** (T-093) — sticky footer showing the viewer's own rank. Affects: leaderboard web and iOS.

81. **Convert leaderboard category dropdown to horizontal tab strip** (T-094). Affects: leaderboard web and iOS.

82. **Render kids in kid-styled treatment on family leaderboard** (T-095). Affects: leaderboard family view web and iOS.

83. **Add public profile drawer tap from leaderboard names** (T-096) — tap a name to see public profile without leaving leaderboard. Affects: leaderboard web and iOS.

84. **Add verity-score-colored avatar rings to messages** (T-097). Affects: `web/src/app/messages/page.tsx`, `MessagesView.swift`.

85. **Add comprehension badges to message thread contacts** (T-098) — badge for contacts who passed the same quiz as the viewer. Affects: messages web and iOS.

86. **Improve message thread preview density** (T-099) — show last message text + relative time. Affects: messages list web and iOS.

87. **Make message compose full-screen on iOS, modal on web** (T-100). Affects: `MessagesView.swift`, web compose component.

88. **Add block/report action to web message thread header** (T-101) — iOS already has this in thread footer. Affects: web message thread header.

89. **Show free user inbox faded with `LockedFeatureCTA`** (T-102) — instead of the blocking LockModal, free users see the inbox shape faded with `gateType="plan"`. Affects: `web/src/app/messages/page.tsx`, `MessagesView.swift`.

90. **Group notifications by today / this week / older** (T-103). Affects: `web/src/app/notifications/page.tsx`, `AlertsView.swift`.

91. **Replace notification titles with inline message previews** (T-104). Affects: notification list web and iOS.

92. **Add swipe-to-mark-read and swipe-to-archive on mobile** (T-105). Affects: notifications list iOS and mobile web.

93. **Move notification Manage to `/notifications/manage` route** (T-106) — notifications is consumption, Manage is configuration. Affects: `web/src/app/notifications/page.tsx` and routing.

94. **Delay push permission prompt until first quiz pass** (T-107). Affects: iOS push permission flow and web push prompt.

95. **Show asker context on expert queue cards** (T-108) — verity score and tier badge on each question card. Affects: expert queue web and iOS.

96. **Build inline answer composer with markdown preview for web** (T-109). Affects: expert queue web answer form.

97. **Build sheet-based answer composer with live preview for iOS** (T-110). Affects: `ExpertQueueView.swift` or expert answer sheet.

98. **Auto-advance to next question on expert submit** (T-111). Affects: expert queue web and iOS.

99. **Add vacation mode toggle to expert queue header** (T-112). Affects: expert queue web and iOS.

100. **Add unread count badge to expert queue back-channel tab** (T-113). Affects: expert queue tab navigation web and iOS.

101. **Show per-question category in expert queue** (T-114) — for experts in multiple categories. Affects: expert queue question cards web and iOS.

102. **Build recap hub on iOS** (T-115) — vertical list of past recaps with score and date. Affects: `VerityPost/VerityPost/RecapView.swift`.

103. **Make recap detail story-format with source preamble** (T-116) — each question includes "this question came from this article" context. Affects: recap detail web and iOS.

104. **Build iOS Find tab with Search and Browse segments** (T-117) — new top-level tab replacing the absence of either on iOS. Affects: new `VerityPost/VerityPost/FindView.swift`.

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

122. **Add `comment_reply` notification template** (T-134) — new `email_templates` row, add to `TYPE_TO_TEMPLATE` in send-emails and send-push crons, wire producer in comment-create path. Affects: `email_templates` table, `web/src/app/api/cron/send-emails/route.js`, `send-push/route.js`, comment creation route.

123. **Add `expert_answer_posted` notification template** (T-135) — same pattern as T-134; fires when expert posts on a thread the user follows. Affects: `email_templates` table, send-emails and send-push crons, expert answer route.

124. **Add `streak_jeopardy` push notification** (T-136) — push at hour 22 if today's reading log is empty. **Blocked on item 111** (streak grid must exist for the notification to reference). Affects: `web/src/app/api/cron/send-push/route.js`.

---

## Tier 15 — CI, testing, and visual regression

125. **Wire visual regression baseline into CI** (T-049) — set up Playwright `toHaveScreenshot` calls for top 10 surfaces × 5 iOS sizes + 4 web viewports; fail PRs on diff outside tolerance. Affects: `web/tests/` and CI pipeline.

126. **Measure and record bundle-size baseline** (T-050) — capture `npm run build` output before PRELAUNCH UI work starts; establish regression reference point. Affects: `web/` build output.

127. **Create `apple-app-site-association` file** (T-047) — file does not exist; Universal Links are non-functional. Must ship in the same commit as item 129. Covers `/story/*`, `/profile/*`, `/leaderboard/*`, `/search*`, `/bookmarks*`, `/messages*`, `/notifications*`. Affects: `web/public/.well-known/apple-app-site-association` (new file).

128. **Add `associated-domains` entitlement to adult app** (T-048) — `com.apple.developer.associated-domains` is missing from the adult app entitlements; add `applinks:veritypost.com`. Must ship in the same commit as item 128. Affects: `VerityPost/VerityPost/VerityPost.entitlements`, `VerityPostKids/VerityPostKids/VerityPostKids.entitlements`.

---

## Tier 16 — Token sweep (runs after token foundations are built)

129. **Apply spacing and type ramp tokens across all web surfaces** (T-137) — replace raw padding numbers and font sizes with token references after items 34 and 35 ship. **Blocked on items 34, 35.** Affects: all pages and components in `web/src/`.

130. **Apply spacing and type ramp tokens across all iOS views** (T-138) — same sweep on Swift views after items 34 and 35. **Blocked on items 34, 35.** Affects: all Swift views in `VerityPost/` and `VerityPostKids/`.

131. **Add loading skeleton to every data-loading surface** (T-139) — replace every spinner with a shape-matched skeleton after item 40 ships. **Blocked on item 40.** Affects: all pages/views with async data loads web and iOS.

132. **Add error states to all surfaces** (T-140) — every data load failure has an actionable error state after item 39 ships. **Blocked on item 39.** Affects: all pages/views web and iOS.

133. **Consolidate web overlay z-indexes** (T-026) — define a z-index scale in tokens; apply across the 7+ divergent sites. Affects: web CSS across 7+ components.

134. **Centralize inline keyframe definitions** (T-027) — extract 7 identical `@keyframes` blocks from separate components into a shared CSS location. Affects: 7 web animation components.

135. **Migrate `.js` and `.jsx` files in `web/src/` to TypeScript** (T-028) — 50-100+ files violating the CLAUDE.md no-new-js rule; batch migrate with per-file tsc verification. Affects: `web/src/` broadly.

---

## Tier 17 — Doc / repo hygiene

136. **Fix 6 stale facts in `CLAUDE.md`** (T-007, OwnerQ Task 14) — Apple dev account claim, FALLBACK_CATEGORIES (gone from page.tsx), ParentalGate callers (4 not 0), hooks-disable count (25 not 23), settings page size (5247 not 3800), `100_backfill_admin_rank_rpcs_*.sql` path (in `Archived/` not `schema/`). Affects: `CLAUDE.md` (root).

137. **Remove `.mcp.json` from `.gitignore`** (T-010, OwnerQ Task 17) — the file has no secrets; the gitignore entry forces each machine to recreate it manually. Affects: `.gitignore:57`.

138. **Rewrite `Future Projects/02_PRICING_RESET.md` to reflect locked prices** (OwnerQ Task 7) — drop A/B framing; document Verity $3.99/$39.99, Pro $9.99/$99.99, Family $14.99/$149.99, FamilyXL $19.99/$199.99. Affects: `Ongoing Projects/Future/02_PRICING_RESET.md`, `Ongoing Projects/Future/views/ios_adult_subscription.md`.

139. **Strip kid illustration requirement from `PRELAUNCH_UI_CHANGE.md` §3.13** (OwnerQ Task 6) — `articles.illustration_url` column doesn't exist; remove the column-add requirement from the doc. Affects: `Archived/Ongoing Projects/Pre-Launch/PRELAUNCH_UI_CHANGE.md:225,386`.

140. **Fix `localhost:3333` stale port references** (OwnerQ Task 22) — canonical dev port is 3000; update parity docs. Affects: `Reference/parity/Shared.md`, `Web-Only.md`, `iOS-Only.md`.

141. **Patch dead-path references in `Sessions/` logs** (OwnerQ Task 15) — update `site/`, `01-Schema/`, `proposedideas/`, `05-Working/`, `docs/`, etc. references to current paths. Affects: session log files under `Workbench/Sessions/`.

142. **Add historical-archive banners to `Completed Projects/` docs** (ARCHIVED_COMPLETED §4.1) — prepend a short banner to each `Completed Projects/*.md` noting it is a historical record and pointing to `Ongoing Projects/Current/MASTER_TRIAGE_2026-04-23.md` for live status. Affects: all files under `Archived/Completed Projects/`.

143. **Create `Completed Projects/README.md` index** (ARCHIVED_COMPLETED §4.2) — single-page pointer explaining the folder is read-only historical record and directing readers to the canonical trackers. Affects: `Archived/Completed Projects/README.md` (new file).

144. **Add root-level archive index** (ARCHIVED_COMPLETED §4.3) — create or extend a top-level index (e.g. `Archived/README.md`) listing what each sub-folder contains and when it was archived. Affects: `Archived/README.md` (new or extended file).

145. **Move stale retired docs into `Archived/_obsolete-readonly/`** (ARCHIVED_COMPLETED §4.4) — identify the most outdated retired docs (e.g. superseded design specs, replaced reference docs) and relocate them one level deeper to prevent confusion. Affects: files under `Archived/` (owner to designate candidates before execution).
