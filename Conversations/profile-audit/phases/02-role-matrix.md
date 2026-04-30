# Phase 2 — Role Matrix

**Written:** 2026-04-30 (Session 2)
**Status:** complete
**Sources:**
- Agent A: `ProfileApp.tsx` (section array + `perms` useMemo), `PermsBoundary.tsx`, all 21 `_sections/` files
- Agent B: `settings/page.tsx`, `settings/expert/page.tsx`, `family/page.tsx`, `kids/page.tsx`, `kids/[id]/page.tsx`
- Agent C: `PermissionService.swift`, `ProfileView.swift`, `SettingsView.swift`, `VerityPostKids/ProfileView.swift`
- Agent D: DB — `my_permission_keys` RPC body, `permissions` table full list, `permission_set_perms`, `role_permission_sets`

---

## How to read this document

**Role abbreviations (columns):** anon = unsigned | free = free-tier signed-in | pro = paid pro | expert = expert-role user | admin = admin-role user | parent = family-plan user | kid = kids iOS only

**Cell values:**
- **sees** — visible and fully functional
- **locked** — visible in nav rail with lock badge; upsell or access-denied on click
- **n/a** — not rendered / not applicable for this role or platform
- **?** — genuinely uncertain after research

**gate correct?** column: yes / no / needs-design + one-line note. "no" = definite structural bug. "needs-design" = gate exists but design decision needed on what it should do or whether platforms should match.

---

## System mechanics (verified by agents)

### PermsBoundary (web)

`PermsBoundary` blocks its children behind `refreshAllPermissions()` + `refreshIfStale()`, showing `DashboardSkeleton` until ready. On cache failure: fail-open (renders anyway) + shows `PermsCacheBanner`. Individual `has()` checks remain fail-closed.

Every `/profile/*` route wraps `ProfileApp` in `<PermsBoundary optional>`. The `optional` flag skips the async wait and renders immediately — the profile app mounts at page load and individual section locks resolve as the perm cache populates.

### PermissionService (iOS)

Actor-based cache. Calls `my_permission_keys()` RPC once, stores granted keys in `Set<String>`. `has()` is a synchronous lookup. Invalidates via `my_perms_version()` poll on `changeToken` — matching the web invalidation contract exactly. Kids iOS does not use PermissionService at all.

### ProfileApp perm resolution (web)

`ProfileApp.tsx` resolves 11 `hasPermission()` calls in a single `useMemo`, producing a `perms` object:

| Variable | Key called | Used for |
|---|---|---|
| `perms.activity` | `profile.activity` | ActivitySection internal gate |
| `perms.categories` | `profile.categories` | CategoriesSection locked badge |
| `perms.milestones` | `profile.achievements` | MilestonesSection locked badge |
| `perms.cardShare` | `profile.card_share` | (not in section array; available for card route) |
| `perms.messagesInbox` | `messages.inbox.view` | MessagesSection locked badge |
| `perms.bookmarksList` | `bookmarks.list.view` | BookmarksSection locked badge |
| `perms.family` | `settings.family.view` | Family section locked badge |
| `perms.expertQueue` | `expert.queue.view` | ExpertQueueSection lock (AND `is_expert`) |
| `perms.followersView` | `profile.followers.view.own` | YouSection StatTile |
| `perms.followingView` | `profile.following.view.own` | YouSection StatTile |
| (internal) | `expert.queue.oversight_all_categories` | ExpertQueueSection admin category scope |

Note: the variable `perms.milestones` maps to the DB key `profile.achievements`. The variable name is misleading but functionally correct — web uses the right key.

---

## DB permission system (Agent D findings)

### Schema corrections

Prior audit materials assumed table names that do not exist:
- ~~`permission_keys`~~ → actual table is **`permissions`** (column: `key`)
- ~~`permission_set_keys`~~ → actual join table is **`permission_set_perms`**

### Role → permission set mapping

| Role | Permission sets granted |
|---|---|
| user *(implicit baseline for all signed-in users)* | anon, free, unverified |
| expert | anon, expert, free, unverified |
| moderator | anon, expert, free, moderator, pro, unverified |
| editor | anon, editor, expert, free, pro, unverified |
| educator | anon, expert, free, unverified |
| journalist | anon, expert, free, unverified |
| admin | admin, anon, editor, expert, free, moderator, owner, pro, unverified |
| owner | admin, anon, editor, expert, family, free, moderator, owner, pro, unverified |

Every signed-in user gets the `user` role implicitly, which grants the `free` and `unverified` permission sets. Plan-based grants (`plan_permission_sets`) and per-user grants (`user_permission_sets`) layer on top.

### OQ6 resolution — key existence

| Key | Exists in DB? | Notes |
|---|---|---|
| `profile.achievements` | **YES** | Canonical key for milestones/achievements feature; used by both web and iOS |
| `profile.milestones` | **NO** | Bare key does not exist |
| `profile.milestones.view` | YES | Exists in DB (admin, free, owner sets) but **used nowhere in code** — dead key |
| `profile.card_share` | **YES** | In all non-anon/unverified permission sets |
| `profile.card.share_link` | **YES** | In admin, free, owner sets only |
| `profile.card.view` | YES | In admin, free, owner sets |
| `settings.login_activity.view` | YES | In all non-anon sets |

**OQ6 verdict — milestones:** `profile.achievements` is canonical. Both web (`ProfileApp.tsx:169`) and iOS (`ProfileView.swift:207`) already use it. WG1 was caused by the misleading variable name `perms.milestones` in web code. **WG1 is closed — gate is structurally correct on both platforms.**

**OQ6 verdict — card share:** `profile.card_share` (web) and `profile.card.share_link` (iOS) are **two different DB keys** with different permission-set coverage. They coexist in the DB and are not interchangeable. WG3 stands: platforms check different keys to gate the same user-facing feature.

---

## New Phase 2 findings

| ID | Finding | Type |
|---|---|---|
| PF-1 | iOS gates 5 account-settings rows (`settings.view`, `settings.account.edit_email`, `settings.account.change_password`, `settings.account.2fa.enable`, `settings.data.request_export`) via explicit `PermissionService.shared.has()` calls. Web renders all equivalent surfaces (IdentitySection, SecuritySection cards, DataSection) with no permission gate whatsoever. Web is systematically more permissive than iOS for account settings. | wrong-gate (web missing gates) |
| PF-2 | `profile.milestones.view` exists in DB (in admin, free, owner sets) but is referenced nowhere in web or iOS code. Dead key. | needs-design |
| OQ-NEW-1 | Agent D reports `profile.achievements`, `profile.card_share`, and several other feature-gated keys are in the `free` permission set — yet the UI locks these for free-tier users. Since all signed-in users receive the `free` set (via the implicit `user` role), this is a contradiction. Either (a) the `free` permission set does not contain these keys and the agent's query output is incomplete, or (b) these features are genuinely unlocked for free users and Phase 1 observation was wrong. Requires Phase 3 verification by testing with a free-tier account. | pre-research |
| OQ-NEW-2 | iOS gates `settings.view`, `settings.account.edit_email`, `settings.account.change_password`, `settings.account.2fa.enable`, `settings.data.request_export` — but web renders all equivalent sections unconditionally. Should web add matching permission gates? This is the same set of keys as PF-1 but framed as a design question: are these gates intentional on iOS and simply missing on web, or should neither platform gate them? | pre-research |

---

## Part 1 — Canonical permission key table

37 distinct keys found across web code, iOS code, and DB. Sorted alphabetically.

**Match column:** ✓ = same key on both platforms for same feature | ✗ = key differs | web-only = iOS has no equivalent check | iOS-only = web has no equivalent check

| # | Key | In DB | Web surfaces | iOS surfaces | Roles (code-observed) | Match | Flags |
|---|---|---|---|---|---|---|---|
| 1 | `billing.subscription.view_own` | yes | none | SettingsView subscription status color; SubscriptionSettingsView | all auth | iOS-only | Web PlanSection/BillingCard doesn't check this key |
| 2 | `billing.view.plan` | yes | none | SettingsView billing section visibility | all auth | iOS-only | Web BillingCard always renders |
| 3 | `bookmarks.list.view` | yes | ProfileApp → BookmarksSection locked badge | ProfileView quick-action visibility | pro, expert, admin (free: locked) | ✓ | Same key, same intent |
| 4 | `expert.application.apply` | yes | `/settings/expert` form-submit gate | SettingsView apply link | eligible auth | ✓ | |
| 5 | `expert.queue.oversight_all_categories` | yes | ExpertQueueSection internal gate (admin category scope) | none | admin, moderator | web-only | iOS has no expert queue surface |
| 6 | `expert.queue.view` | yes | ProfileApp → ExpertQueueSection lock (AND `is_expert`) | ProfileView quick action | expert, admin | ✓ | |
| 7 | `family.add_kid` | yes | `/profile/kids` feature gate | none | parent | web-only | iOS manages via native flow |
| 8 | `family.remove_kid` | yes | `/profile/kids` feature gate | none | parent | web-only | |
| 9 | `family.shared_achievements` | yes | `/profile/family` feature gate (OR with #11) | none | parent | web-only | |
| 10 | `family.view_leaderboard` | yes | `/profile/family` feature gate | none | parent | web-only | |
| 11 | `kids.achievements.view` | yes | `/profile/family` (OR with #9) | none | parent | web-only | |
| 12 | `kids.parent.global_leaderboard_opt_in` | yes | `/profile/kids/[id]` feature gate | none | parent | web-only | |
| 13 | `kids.parent.household_kpis` | yes | `/profile/kids` KPI row gate | none | parent | web-only | |
| 14 | `kids.parent.view` | yes | `/profile/family`, `/profile/kids`, `/profile/kids/[id]` primary gate | none | parent | web-only | iOS uses native `FamilyDashboardView` without this key |
| 15 | `kids.parent.weekly_report.view` | yes | `/profile/family` weekly report gate | none | parent | web-only | |
| 16 | `kids.streak.freeze.use` | yes | `/profile/kids/[id]` freeze button | none | parent | web-only | |
| 17 | `kids.trial.start` | yes | `/profile/kids` trial CTA gate | none | parent | web-only | |
| 18 | `messages.inbox.view` | yes | ProfileApp → MessagesSection locked badge | ProfileView quick-action visibility | pro, expert, admin (free: locked) | ✓ | |
| 19 | `notifications.prefs.toggle_push` | yes | none | NotificationsSettingsView push-toggle row | all auth | iOS-only | Web NotificationsSection has no permission gate |
| 20 | `notifications.prefs.view` | yes | none | SettingsView alerts row; NotificationsSettingsView | all auth | iOS-only | |
| 21 | `profile.achievements` | yes | ProfileApp → MilestonesSection locked (`perms.milestones` var) | ProfileView Milestones tab locked | pro, expert, admin (free: locked per UI; contradicts DB — OQ-NEW-1) | ✓ | **WG1 RESOLVED** — correct key on both platforms |
| 22 | `profile.activity` | yes | ProfileApp → ActivitySection internal EmptyState gate | ProfileView Activity tab locked | pro, expert, admin (free: locked) | ✓ | |
| 23 | `profile.card.share_link` | yes | **none** — not used on web | ProfileView share quick-action | admin, free, owner sets (DB) | ✗ | **WG3**: web uses `profile.card_share` (#25) instead; different DB keys |
| 24 | `profile.card.view` | yes | none | ProfileView Overview card preview | admin, free, owner sets (DB) | iOS-only | Web has no card-preview permission gate |
| 25 | `profile.card_share` | yes | `/profile/card` route gate; `perms.cardShare` | **none** — not used on iOS | all non-anon (DB) | ✗ | **WG3**: iOS uses `profile.card.share_link` (#23) instead |
| 26 | `profile.categories` | yes | ProfileApp → CategoriesSection locked badge | ProfileView Categories tab locked | pro, expert, admin (free: locked) | ✓ | |
| 27 | `profile.followers.view.own` | yes | ProfileApp → YouSection StatTile conditional | ProfileView Social Row tile | ? | ✓ | |
| 28 | `profile.following.view.own` | yes | ProfileApp → YouSection StatTile conditional | ProfileView Social Row tile | ? | ✓ | |
| 29 | `settings.account.2fa.enable` | yes | **none** — web MFACard always renders | SettingsView MFA row gate | all auth | ✗ | **PF-1**: iOS gates; web doesn't |
| 30 | `settings.account.change_password` | yes | **none** — web PasswordCard always renders | SettingsView password row gate | all auth | ✗ | **PF-1** |
| 31 | `settings.account.edit_email` | yes | **none** — web EmailsCard always renders | SettingsView email row gate | all auth | ✗ | **PF-1** |
| 32 | `settings.data.request_export` | yes | **none** — web DataCard always renders | SettingsView data row; DataPrivacyView export gate | all auth | ✗ | **PF-1** |
| 33 | `settings.expert.view` | yes | `/settings/expert` page-level visibility gate | **none** — iOS VerificationRequestView always renders | expert, pending-expert | ✗ | Web gates expert settings page; iOS shows VerificationRequestView unconditionally |
| 34 | `settings.family.view` | yes | ProfileApp family section locked; LinkOutSection | ProfileView kids top-bar button | parent | ✓ | |
| 35 | `settings.feed.view` | yes | **none** — no web feed-prefs surface | SettingsView feed preferences row | all auth | iOS-only | Gap G4 confirmed |
| 36 | `settings.login_activity.view` | yes | **none** — web SessionsSection has no gate | SettingsView login activity row | all non-anon (DB) | ✗ | **WG2**: web sessions entirely ungated; iOS gates login activity |
| 37 | `settings.view` | yes | **none** — web IdentitySection always renders | SettingsView profile-edit row gate | all auth | ✗ | **PF-1** |

**Cross-platform mismatch summary (✗ rows):** 8 keys — #23/25 (WG3 card share), #29–32/37 (PF-1 account settings), #33 (expert settings gate), #36 (WG2 login activity). The PF-1 cluster (#29, 30, 31, 32, 37) is a systematic pattern: iOS added permission gates to account-settings rows that web never implemented.

---

## Part 2 — Role × section matrix

### Web profile sections (1–21)

| ID | Section | Gate expression (code) | anon | free | pro | expert | admin | parent | kid | gate correct? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | YouSection | none (social tiles: `perms.followersView`, `perms.followingView`) | n/a | sees | sees | sees | sees | sees | n/a | yes |
| 2 | PublicProfileSection | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — no iOS equivalent preview-with-edit surface (ND1) |
| 3 | ActivitySection | `profile.activity` (internal EmptyState) | n/a | locked | sees | sees | sees | ? | n/a | yes — gate works; parent tier uncertain (OQ-NEW-1) |
| 4 | BookmarksSection | `!perms.bookmarksList` (rail lock) | n/a | locked | sees | sees | sees | ? | n/a | yes |
| 5 | MessagesSection | `!perms.messagesInbox` (rail lock) + unread badge | n/a | locked | sees | sees | sees | ? | n/a | yes |
| 6 | CategoriesSectionConnected | `!perms.categories` (rail lock) | n/a | locked | sees | sees | sees | ? | n/a | yes |
| 7 | MilestonesSection | `!perms.milestones` (rail lock; key=`profile.achievements`) | n/a | locked | sees | sees | sees | ? | n/a | yes — WG1 resolved; correct key; parent/free ambiguity is OQ-NEW-1 |
| 8 | SessionsSection | **none** | n/a | sees | sees | sees | sees | sees | n/a | **no** — WG2: no permission gate at all; iOS equivalent gated by `settings.login_activity.view`; also different features (active sessions vs. audit log) |
| 9 | BlockedSection | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — G5/R3: web puts in profile rail, iOS puts in Settings; canonical home undecided (OQ5) |
| 10 | ExpertQueueSection | `!(perms.expertQueue && u.is_expert)` (rail lock); `expert.queue.oversight_all_categories` (internal) | n/a | n/a | n/a | sees | sees | n/a | n/a | yes — compound gate correct; admin gets oversight view |
| 11 | ExpertProfileSection | `!(u.is_expert \|\| expertStatus==='pending')` (rail lock) | n/a | n/a | n/a | sees | sees | n/a | n/a | yes — G3: no iOS credentials/vacation equivalent |
| 12 | ExpertApplyForm | nested in ExpertProfileSection when no application exists | n/a | n/a | n/a | sees | sees | n/a | n/a | yes — iOS equivalent is VerificationRequestView in Settings |
| 13 | IdentitySection | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: iOS gates profile edit via `settings.view`; web renders unconditionally (OQ-NEW-2) |
| 14 | SecuritySection | none (stacks B2 + B3 + B4) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: iOS gates each sub-row individually; web renders all three cards unconditionally (OQ-NEW-2) |
| 15 | PrivacySection | none | n/a | sees | sees | sees | sees | sees | n/a | yes |
| 16 | NotificationsSection | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — iOS gates via `notifications.prefs.view` + `notifications.prefs.toggle_push`; web has no gate |
| 17 | DataSection | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: iOS gates data export via `settings.data.request_export`; web DataCard always renders (OQ-NEW-2) |
| 18 | PlanSection | none (free sees upgrade CTA) | n/a | sees | sees | sees | sees | sees | n/a | yes |
| 19 | SignOutSection | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — R2: iOS has sign-out in two places (E16 + F18); web has one |
| 20 | InviteLinkCard | none (soft gate: username required) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — ND7: web checks username; iOS checks `emailVerified && !frozenAt`; conditions differ |
| 21 | LinkOutSection | Family slot: `!perms.family`; Help slot: none | n/a | sees | sees | sees | sees | sees | n/a | yes |

### Web settings cards (B1–B8)

Settings cards have no independent gates; they inherit the parent section's visibility.

| ID | Card | Parent section | anon | free | pro | expert | admin | parent | kid | gate correct? |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | IdentityCard | IdentitySection (13) | n/a | sees | sees | sees | sees | sees | n/a | yes (iOS equivalent gated via `settings.view` — PF-1 noted at section level) |
| B2 | EmailsCard | SecuritySection (14) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: iOS gates via `settings.account.edit_email`; web always renders |
| B3 | PasswordCard | SecuritySection (14) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: iOS gates via `settings.account.change_password`; web always renders |
| B4 | MFACard | SecuritySection (14) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: iOS gates via `settings.account.2fa.enable`; web always renders |
| B5 | NotificationsCard | NotificationsSection (16) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — iOS gates via `notifications.prefs.view`; web always renders |
| B6 | PrivacyCard | PrivacySection (15) | n/a | sees | sees | sees | sees | sees | n/a | yes |
| B7 | BillingCard | PlanSection (18) | n/a | sees | sees | sees | sees | sees | n/a | yes |
| B8 | DataCard | DataSection (17) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: iOS gates export via `settings.data.request_export`; web always renders |

### Web sub-routes (C1–C10)

| ID | Route | Gate expression | anon | free | pro | expert | admin | parent | kid | gate correct? |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | `/profile` | `PermsBoundary optional` | n/a | sees | sees | sees | sees | sees | n/a | yes |
| C2 | `/profile/settings` | `PermsBoundary optional` | n/a | sees | sees | sees | sees | sees | n/a | needs-design — R1: functional duplicate of C1 with different default section; redirect vs. live route undecided |
| C3 | `/profile/settings/billing` | server-side redirect only | n/a | sees | sees | sees | sees | sees | n/a | yes — thin shim for post-Stripe-checkout landing |
| C4 | `/profile/settings/expert` | `settings.expert.view` (page) + `expert.application.apply` (form submit) | n/a | ? | ? | sees | sees | n/a | n/a | yes — two-tier gate is intentional; free/pro cells need DB role-set verification |
| C5 | `/profile/family` | `kids.parent.view` primary + feature gates inside | n/a | n/a | n/a | n/a | sees | sees | n/a | yes |
| C6 | `/profile/kids` | `kids.parent.view` primary + feature gates | n/a | n/a | n/a | n/a | sees | sees | n/a | yes |
| C7 | `/profile/kids/[id]` | `kids.parent.view` + ownership check + feature gates | n/a | n/a | n/a | n/a | sees | sees | n/a | yes |
| C8 | `/profile/card` | `profile.card_share` (`perms.cardShare`) | n/a | ? | sees | sees | sees | ? | n/a | **no** — WG3: web uses `profile.card_share`; iOS quick-action uses `profile.card.share_link`; different DB keys for same feature; must be canonicalized |
| C9 | `/profile/category/[id]` | auth only (no permission key) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — ND6: no permission gate; parent section CategoriesSection requires `profile.categories`; route bypasses that gate |
| C10 | `/profile/contact` | **none** | ? | sees | sees | sees | sees | sees | n/a | **no** — WG4: no auth check in component; anon may be able to submit; intentional or oversight unclear (OQ8) |

### Web API route (D1)

| ID | Route | Gate | anon | free | pro | expert | admin | parent | kid | gate correct? |
|---|---|---|---|---|---|---|---|---|---|---|
| D1 | `POST /api/profile/trial-banner-dismiss` | `getUser()` required | n/a | sees | sees | sees | sees | sees | n/a | yes |

### iOS ProfileView (E1–E16)

| ID | Section | Gate expression (code) | anon | free | pro | expert | admin | parent | kid | gate correct? |
|---|---|---|---|---|---|---|---|---|---|---|
| E1 | Anon Hero (sign-in/sign-up CTAs) | `auth.currentUser == nil` | sees | n/a | n/a | n/a | n/a | n/a | n/a | yes |
| E2 | Verify Email Gate | `user.emailVerified == false` | n/a | sees (until verified) | sees (until verified) | sees (until verified) | sees (until verified) | sees (until verified) | n/a | yes |
| E3 | Frozen Account Banner | `user.frozenAt != nil` | n/a | ? | ? | ? | ? | ? | n/a | yes — data-driven; shows when condition true |
| E4 | Hero Card (avatar, name, score) | none; expert title: `user.isExpert && expertTitle != ""` | n/a | sees | sees | sees (expert badge) | sees | sees | n/a | yes |
| E5 | Streak Strip (30-day heatmap) | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — G1: no web equivalent streak visualization; design decision needed (OQ1) |
| E6 | Stat Row (reads/quizzes/comments) | none | n/a | sees | sees | sees | sees | sees | n/a | yes |
| E7 | Social Row (followers/following tiles) | `profile.followers.view.own` + `profile.following.view.own` (per tile) | n/a | ? | sees | sees | sees | ? | n/a | yes — matches web YouSection parity |
| E8 | Quick Actions Row | Bookmarks: `bookmarks.list.view`; Messages: `messages.inbox.view`; Share: `profile.card.share_link`; Kids: `settings.family.view`; ExpertQueue: `expert.queue.view` | n/a | ? | sees | sees | sees | sees | n/a | needs-design — ND2: Kids/Expert Queue mutual exclusion implicit; WG3: share key differs from web |
| E9 | Recent Activity Preview (Overview tab) | **none** | n/a | sees | sees | sees | sees | sees | n/a | needs-design — ND3: no gate; web ActivitySection requires `profile.activity`; free users see activity preview on iOS for free (OQ9) |
| E10 | Achievements Preview (Overview tab) | **none** | n/a | sees | sees | sees | sees | sees | n/a | needs-design — ND4: no gate on preview; full Milestones tab IS gated; inconsistency between preview (free) and tab (paid) (OQ9) |
| E11 | Overview Tab | `profile.card.view` for card-preview subsection; rest always | n/a | sees | sees | sees | sees | sees | n/a | yes |
| E12 | Activity Tab | `profile.activity` (locked tab) | n/a | locked | sees | sees | sees | ? | n/a | yes — matches web #3 |
| E13 | Categories Tab | `profile.categories` (locked tab) | n/a | locked | sees | sees | sees | ? | n/a | yes — matches web #6 |
| E14 | Milestones Tab | `profile.achievements` (locked tab) | n/a | locked | sees | sees | sees | ? | n/a | yes — both platforms use same key ✓ |
| E15 | Kids/Family top-bar button | `settings.family.view` | n/a | n/a | n/a | n/a | sees | sees | n/a | yes |
| E16 | Logout Button (ProfileView bottom) | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — R2: sign-out also in F18; two sign-outs on iOS |

### iOS SettingsView (F1–F18)

| ID | Section | Gate expression (code) | anon | free | pro | expert | admin | parent | kid | gate correct? |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Account → Profile (AccountSettingsView) | `settings.view` | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: web IdentitySection has no equivalent gate (OQ-NEW-2) |
| F2 | Account → Email (EmailSettingsView) | `settings.account.edit_email` | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: web EmailsCard always renders (OQ-NEW-2) |
| F3 | Account → Password (PasswordSettingsView) | `settings.account.change_password` | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: web PasswordCard always renders (OQ-NEW-2) |
| F4 | Account → Sign-in Activity (LoginActivityView) | `settings.login_activity.view` | n/a | sees | sees | sees | sees | sees | n/a | **no** — WG2: iOS gates this; web SessionsSection has no gate; also different features (historical audit log vs. active session revocation) |
| F5 | Account → MFA (MFASettingsView) | `settings.account.2fa.enable` | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: web MFACard always renders (OQ-NEW-2) |
| F6 | Preferences → Alerts (NotificationsSettingsView) | `notifications.prefs.view` + `notifications.prefs.toggle_push` | n/a | sees | sees | sees | sees | sees | n/a | needs-design — ND5: dead per-type toggle code (`breaking`, `digest`, `expert_reply`, `comment_reply` write to unused metadata); web has no permission gate on NotificationsSection (OQ10) |
| F7 | Preferences → Feed (FeedPreferencesSettingsView) | `settings.feed.view` | n/a | sees | sees | sees | sees | sees | n/a | needs-design — G4: no web equivalent; iOS-only feed prefs surface (OQ4) |
| F8 | Privacy → DM Read Receipts | none | n/a | sees | sees | sees | sees | sees | n/a | yes |
| F9 | Privacy → Blocked Accounts (BlockedAccountsView) | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — G5/R3: web BlockedSection in profile rail; iOS here in Settings; canonical home undecided (OQ5) |
| F10 | Privacy → Data & Privacy | `settings.data.request_export` (export gate); delete always per Apple 5.1.1(v) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — PF-1: web DataCard renders export unconditionally; iOS gates it (OQ-NEW-2) |
| F11 | Invite Friends | `emailVerified && !frozenAt` (data-driven; no permission key) | n/a | sees | sees | sees | sees | sees | n/a | needs-design — ND7: web InviteLinkCard checks username; iOS checks emailVerified + notFrozen; different gate conditions |
| F12 | Billing → Subscription | `billing.view.plan` + `billing.subscription.view_own` (status color) | n/a | sees | sees | sees | sees | sees | n/a | yes |
| F13 | Expert → Verification Request (VerificationRequestView) | **none** — always rendered in Expert settings section | n/a | sees | sees | sees | sees | sees | n/a | needs-design — web ExpertProfileSection gated (`is_expert \|\| pending`); iOS VerificationRequestView always shows; inconsistency |
| F14 | Expert → Apply link | `expert.application.apply` | n/a | ? | ? | sees | sees | ? | n/a | yes |
| F15 | About → Feedback (FeedbackSheet) | none | n/a | sees | sees | sees | sees | sees | n/a | yes — web equivalent is /profile/contact (11 topics vs. 3) |
| F16 | About → Legal links | none | n/a | sees | sees | sees | sees | sees | n/a | yes |
| F17 | About → Version | none | n/a | sees | sees | sees | sees | sees | n/a | yes — not applicable on web |
| F18 | Danger Zone → Sign Out | none | n/a | sees | sees | sees | sees | sees | n/a | needs-design — R2: sign-out also in E16; two sign-outs on iOS |

### Kids iOS (G1–G4)

All adult roles (anon through parent) are n/a for kids iOS — the kids app runs as its own session.

| ID | Section | Gate | kid | gate correct? |
|---|---|---|---|---|
| G1 | Header (avatar, name, unpair) | Unpair: `.parentalGate` modifier (COPPA) | sees | yes |
| G2 | Stats Grid (2×2) | none | sees | yes |
| G3 | Badges Section | none | sees | yes |
| G4 | About / Legal | `.parentalGate` before following external links | sees | yes |

---

## Gate summary by finding type

### Wrong-gate (no cells in matrix)

| Finding | Surfaces | Issue |
|---|---|---|
| WG2 | SessionsSection (web #8), LoginActivityView (iOS F4) | Web sessions section has no permission gate; iOS login activity gated by `settings.login_activity.view`; also different features |
| WG3 | /profile/card (C8), iOS share quick-action (E8) | Web uses `profile.card_share`; iOS uses `profile.card.share_link`; two different DB keys for same user-facing feature |
| WG4 | /profile/contact (C10) | No auth check; anon can potentially submit; intentional or oversight unclear (OQ8) |
| PF-1 (new) | #13, #14, B2–B4, B8, F1–F3, F5, F10 | iOS gates 5 account-settings rows; web renders all equivalent surfaces unconditionally |

**WG1 closed:** both platforms use `profile.achievements` — correct. Variable name `perms.milestones` is misleading but not a functional bug.

### Needs-design (open design questions from matrix)

| Finding | Surfaces | OQ |
|---|---|---|
| ND1 | PublicProfileSection (web #2) | No iOS equivalent dedicated preview-with-edit |
| G1, OQ1 | Streak Strip (E5) | No web equivalent streak heatmap |
| G2, OQ2 | ExpertQueueSection (web #10) | iOS has no full expert queue; routing-only quick action |
| G3, OQ3 | ExpertProfileSection (web #11) | No iOS credentials/vacation management surface |
| G4, OQ4 | FeedPreferencesSettingsView (F7) | No web equivalent feed preferences |
| G5/R3, OQ5 | BlockedSection (web #9), BlockedAccountsView (F9) | Same feature in two different locations |
| R1 | /profile/settings (C2) | Duplicate route; redirect vs. live route undecided |
| R2 | E16, F18 | iOS double sign-out |
| ND2 | Quick Actions (E8) | Kids/Expert Queue mutual exclusion undocumented |
| ND3/ND4, OQ9 | Activity Preview (E9), Achievements Preview (E10) | No gate on iOS Overview tab previews; web equivalents gated |
| ND5, OQ10 | Notifications (F6) | Dead per-type toggle code |
| ND6 | /profile/category/[id] (C9) | No permission gate; bypasses CategoriesSection gate |
| ND7 | InviteLinkCard (#20), Invite Friends (F11) | Different gate conditions web vs. iOS |
| OQ-NEW-2 | #13–17, B2–B4, B8, F1–F3, F5, F10 | iOS gates account-settings rows web doesn't |

---

## Updated open questions

| # | Question | Status after Phase 2 |
|---|---|---|
| OQ1 | Streak heatmap on web — where, if anywhere? | pre-research (unchanged) |
| OQ2 | iOS expert queue — full surface or routing-only? | pre-research (unchanged) |
| OQ3 | Expert credentials/vacation on iOS? | pre-research (unchanged) |
| OQ4 | Feed preferences on web? | pre-research (unchanged) |
| OQ5 | Blocked accounts canonical home? | pre-research (unchanged) |
| OQ6 | Key name reconciliation | **Partially answered** — `profile.achievements` canonical (WG1 closed); `profile.card_share` vs `profile.card.share_link` confirmed as two different keys (WG3 open for design decision) |
| OQ7 | Sessions vs. Login Activity — same feature or different? | pre-research (unchanged; Phase 2 confirms they are structurally different: active revocation vs. audit log) |
| OQ8 | /profile/contact open to anon — intentional? | pre-research (unchanged) |
| OQ9 | iOS activity/achievement previews free — intentional? | pre-research (unchanged) |
| OQ10 | Dead notification toggles — remove or revive? | pre-research (unchanged) |
| OQ-NEW-1 | DB reports gated keys (`profile.achievements`, etc.) as in the `free` set, contradicting locked-for-free UI. Which is correct? | **New — pre-research** |
| OQ-NEW-2 | iOS gates 5 account-settings rows (`settings.view`, `settings.account.edit_email`, `settings.account.change_password`, `settings.account.2fa.enable`, `settings.data.request_export`); web renders all equivalent sections unconditionally. Should web add matching gates? | **New — pre-research** |
