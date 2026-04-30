# Phase 1 — Inventory

**Written:** 2026-04-30 (Session 1)
**Status:** complete
**Sources:** 3 parallel Explore agents — Agent A (web _sections/ + ProfileApp), Agent B (web settings cards + sub-routes + API), Agent C (iOS ProfileView/SettingsView + kids ProfileView)

---

## How to read this table

- **Platform(s):** W = web, iOS = main iOS, K = kids iOS
- **Permission gate:** the exact key or condition that controls visibility; "none" = all authenticated users see it
- **Roles that see it:** anon / free / pro / expert / admin / parent / kid
- **Kill-switch:** env var, feature flag, or `NEXT_PUBLIC_*` toggle that hides the surface
- **Finding:** correct / gap / redundant / wrong-gate / should-not-exist / needs-design

---

## Part A — Web profile sections (`_sections/`)

Section order follows the ProfileApp mounting array (26 slots; some slots share a component).

| # | Name | Platform(s) | What it does | Permission gate | Roles that see it | Kill-switch | Finding |
|---|---|---|---|---|---|---|---|
| 1 | YouSection | W | Dashboard home: tier progress, 6-stat tiles, polish-your-profile CTA grid | Followers tile: `profile.followers.view.own`; Following tile: `profile.following.view.own`; Family CTA: `settings.family.view`; Expert Queue CTA: `expert.queue.view` + `is_expert` — tiles hidden when perms absent; section always rendered | all auth | none | **correct** |
| 2 | PublicProfileSection | W | Bio + visibility + hide-activity editor with live preview card; avatar editor | none (all auth) | all auth | none | **needs-design** — no iOS equivalent dedicated preview card; iOS shows bio inline in hero but no edit-with-preview surface |
| 3 | ActivitySection | W | Timeline of reads / comments / bookmarks (last 100/50/50); filter pills | `profile.activity` — EmptyState "part of premium" when absent | pro, expert, admin (free sees upsell) | none | **correct** |
| 4 | BookmarksSection | W | Saved articles list (last 50); links to article slugs | `bookmarks.list.view` — section locked in rail when absent | pro, expert, admin | none | **correct** |
| 5 | MessagesSection | W | Conversation thread list from `/api/conversations`; unread badge | `messages.inbox.view` — section locked in rail when absent | pro, expert, admin | none | **correct** |
| 6 | CategoriesSectionConnected | W | Category drill-in: per-category/subcategory scores, reads, quizzes | `profile.categories` — section locked when absent | pro, expert, admin | none | **correct** |
| 7 | MilestonesSectionConnected | W | Earned + locked achievement badges with gap hints | Gate at ProfileApp level: `perms.milestones` (permission key: `profile.achievements`) — but component itself has **no internal gate**; if mounted without the lock it renders to all | pro(?), expert, admin (key needs Phase 2 verification) | none | **wrong-gate** — gate is only in ProfileApp's section array, not enforced inside component; also inconsistent with iOS which checks `profile.achievements` in PermissionService. Web permission key `profile.milestones` vs iOS `profile.achievements` needs reconciliation. |
| 8 | SessionsSection | W | Active login sessions list from `/api/account/sessions`; per-session revoke; sign-out-everywhere | **none** — no permission gate at any level; all authenticated users see all sessions | all auth | none | **wrong-gate** — iOS gates the equivalent (`LoginActivityView`) behind `settings.login_activity.view`; web has no gate. Also: role scope unclear — admins don't need to see their own sessions differently, but should free users see this? |
| 9 | BlockedSection | W | Blocked-users list from `blocked_users` table; per-user unblock | none — all authenticated users | all auth | none | **needs-design** — web puts this in profile sections rail; iOS puts it in SettingsView (more correct home). Location inconsistency across platforms. |
| 10 | ExpertQueueSection | W | Expert question queue (pending/claimed/answered); back-channel messages; admin oversight mode | `expert.queue.view` + `is_expert=true` (AND condition in ProfileApp); admin also has `expert.queue.oversight_all_categories` for broader category view | expert, admin | none | **gap** — no equivalent in iOS ProfileView; only a quick-action button that routes elsewhere. No full expert queue surface on iOS. |
| 11 | ExpertProfileSection | W | Expert credentials + approved categories + vacation toggle; nests ExpertApplyForm when no application exists | `is_expert=true` OR `expertStatus==='pending'` (OR condition in ProfileApp) | expert, expert-pending, admin | none | **gap** — no equivalent expert profile section in iOS ProfileView; iOS SettingsView has application form (VerificationRequestView) but no credentials/areas/vacation management. |
| 12 | ExpertApplyForm | W | Multi-step expert application (type, name, org, bio, areas, credentials, samples) | No internal gate; rendered by ExpertProfileSection when no application exists | all auth (when eligible per ExpertProfileSection gate) | none | **correct** — web-only feature; iOS has equivalent in SettingsView VerificationRequestView |
| 13 | IdentitySection | W | Display name + username + bio fields; wraps IdentityCard | none — all auth | all auth | none | **correct** |
| 14 | SecuritySection | W | Stacks EmailsCard + PasswordCard + MFACard | none — all auth | all auth | none | **correct** |
| 15 | PrivacySection | W | DM + visibility + hide-activity toggles + lockdown; wraps PrivacyCard | none — all auth | all auth | none | **correct** |
| 16 | NotificationsSection | W | In-app / push / security-email channel toggles; wraps NotificationsCard | none — all auth | all auth | none | **correct** |
| 17 | DataSection | W | Data export + account deletion (30-day grace); wraps DataCard | none — all auth | all auth | none | **correct** |
| 18 | PlanSection | W | Subscription tier + billing portal + cancel/resume; wraps BillingCard | none — all auth (free users see upsell to /pricing) | all auth | none | **correct** |
| 19 | SignOutSection | W | Sign out this device / everywhere via `supabase.auth.signOut` | none — all auth | all auth | none | **redundant** — iOS has sign-out in both ProfileView (bottom button) AND SettingsView danger zone (two places on iOS) |
| 20 | InviteLinkCard | W | Personal referral link from `/api/referrals/me`; copy button; invite count | none — all auth (soft gate: username required) | all auth with username | none | **correct** |
| 21 | LinkOutSection | W | Generic launchpad template; used for Family link and Help link | Family slot: `settings.family.view`; Help slot: always rendered | varies by slot | none | **correct** |

---

## Part B — Web settings cards (`settings/_cards/`)

These cards are rendered by their corresponding profile sections (e.g., SecuritySection stacks EmailsCard + PasswordCard + MFACard). They also appear on the legacy `/profile/settings` page. They are shared components — not independent surfaces.

| # | Name | Platform(s) | What it does | Permission gate | Roles that see it | Kill-switch | Finding |
|---|---|---|---|---|---|---|---|
| B1 | IdentityCard | W | Username + display name + bio edit; save via `update_own_profile` RPC | none (gated at parent) | all auth | none | **correct** |
| B2 | EmailsCard | W | Email change initiation via `/api/auth/email-change` with confirmation step | none (gated at parent) | all auth | none | **correct** |
| B3 | PasswordCard | W | Password change: verify-current via `/api/auth/verify-password` then update + sign out other sessions | none (gated at parent) | all auth | none | **correct** |
| B4 | MFACard | W | TOTP enrollment/verification/removal via Supabase GoTrue MFA API | none (gated at parent) | all auth | none | **correct** |
| B5 | NotificationsCard | W | In-app / push / security-email toggles from `/api/notifications/preferences` | none (gated at parent) | all auth | none | **correct** |
| B6 | PrivacyCard | W | Audience (public/followers-only/hidden) + DM gate + hide-activity + followers list with bulk remove/block; lockdown via `lockdown_self` RPC | none (gated at parent) | all auth | none | **correct** |
| B7 | BillingCard | W | Current plan + renewal date + Stripe portal handoff (`/api/stripe/portal`) + cancel/resume | none (gated at parent; free users see upsell) | all auth | none | **correct** |
| B8 | DataCard | W | Export data + typed-confirmation delete account with 30-day grace via `/api/account/*` | none (gated at parent) | all auth | none | **correct** |

---

## Part C — Web profile sub-routes

| # | Route | Platform(s) | What it does | Permission gate | Roles that see it | Kill-switch | Finding |
|---|---|---|---|---|---|---|---|
| C1 | `/profile` | W | ProfileApp shell; `defaultSection="you"` | PermsBoundary `optional=true` (allows preview render) | all (anon gets limited preview) | none | **correct** |
| C2 | `/profile/settings` | W | Same ProfileApp shell; `defaultSection="identity"` | PermsBoundary `optional=true` | all | none | **redundant** — functional duplicate of /profile with different default section; kept as legacy URL alias. Decision needed: keep as permanent redirect vs. keep as real route. |
| C3 | `/profile/settings/billing` | W | Redirects to `/profile/settings?section=plan`; preserves Stripe `?success=1` / `?canceled=1` params | Server-side redirect; no separate auth check | all auth | none | **correct** — thin shim for post-checkout landing |
| C4 | `/profile/settings/expert` | W | Full expert application form OR status card (pending/approved/rejected); gated two ways | `settings.expert.view` (page gate) + `expert.application.apply` (form submit gate) | expert, expert-pending, eligible free/pro | none | **correct** — two-tier permission model is intentional |
| C5 | `/profile/family` | W | Family household dashboard: leaderboard, weekly report, shared achievements | `kids.parent.view` (page gate) + `family.view_leaderboard` + `family.shared_achievements` / `kids.achievements.view` + `kids.parent.weekly_report.view` (feature gates) | parent | none | **correct** |
| C6 | `/profile/kids` | W | Kid profile roster: add/remove kids, trial, COPPA consent, KPIs | `kids.parent.view` (page gate) + `family.add_kid` + `family.remove_kid` + `kids.trial.start` + `kids.parent.household_kpis` | parent | none | **correct** |
| C7 | `/profile/kids/[id]` | W | Individual kid dashboard: stats, activity, achievements, upcoming expert sessions | `kids.parent.view` + parent_user_id ownership check; `kids.streak.freeze.use` + `kids.parent.global_leaderboard_opt_in` (feature gates) | parent | none | **correct** |
| C8 | `/profile/card` | W | Redirects auth+paid users to `/card/[username]` | `profile.card_share` (permission gate, no explicit NEXT_PUBLIC flag) | pro, expert, admin | none | **wrong-gate** — permission key is `profile.card_share` on web but `profile.card.share_link` on iOS; keys must match |
| C9 | `/profile/category/[id]` | W | Per-category subcategory stats via `get_user_category_metrics` RPC | Auth check only; no permission key | all auth | none | **needs-design** — no explicit permission gate (should it be gated the same as CategoriesSection which requires `profile.categories`?); no iOS equivalent standalone route (iOS handles this inline in Categories tab) |
| C10 | `/profile/contact` | W | Support contact form (11 topics) → `/api/support` | No explicit auth check in component | all (including anon?) | none | **wrong-gate** — no auth check; unclear if intentionally open to anon or oversight; web-only surface (iOS has FeedbackSheet in SettingsView) |

---

## Part D — Web API route

| # | Route | Platform(s) | What it does | Permission gate | Roles | Kill-switch | Finding |
|---|---|---|---|---|---|---|---|
| D1 | `POST /api/profile/trial-banner-dismiss` | W | Sets `trial_extended_seen_at` on user row; idempotent (only writes if NULL) | Auth required (`getUser()`) | all auth | none | **correct** |

---

## Part E — iOS main app (`ProfileView.swift`)

iOS profile is a tabbed single-view (Overview / Activity / Categories / Milestones) with a permanent header.

| # | Section/card | Platform(s) | What it does | Permission gate | Roles that see it | Kill-switch | Finding |
|---|---|---|---|---|---|---|---|
| E1 | Anon Hero | iOS | Sign-in / sign-up CTAs when no current user | `auth.currentUser == nil` | anon only | none | **correct** — web equivalent via PermsBoundary optional |
| E2 | Verify Email Gate | iOS | Blocks all profile content until email verified; resend button | `user.emailVerified == false` | all unverified | none | **correct** — web parity confirmed |
| E3 | Frozen Account Banner | iOS | "Score frozen" warning + resubscribe CTA | `user.frozenAt != nil` | frozen accounts | none | **correct** — web has AccountStateBanner equivalent |
| E4 | Hero Card (avatar, name, score, expert badge) | iOS | Avatar (editable), display name, verified badge, expert title, Verity score | Expert title: `user.isExpert == true && expertTitle.notEmpty` | all auth | none | **correct** — web equivalent: YouSection header + PublicProfileSection avatar |
| E5 | Streak Strip (30-day heatmap) | iOS | 10×3 reading-day grid, legend, best streak | none — always shown (when email verified) | all auth | none | **gap** — no streak heatmap on web; ActivitySection shows a timeline but not a visual streak grid. Kids iOS shows streak count (not heatmap). Needs design decision. |
| E6 | Stat Row (3 tiles: reads / quizzes / comments) | iOS | Core engagement stats from `users` table | none — always shown | all auth | none | **correct** — web equivalent: YouSection stat tiles |
| E7 | Social Row (followers / following) | iOS | Follower/following counts | `profile.followers.view.own` + `profile.following.view.own` (tiles hidden individually) | varies by perm | none | **correct** — matches web YouSection parity |
| E8 | Quick Actions Row | iOS | Icon buttons: Bookmarks, Messages, Share card, Kids/Expert Queue (mutually exclusive) | Bookmarks: `bookmarks.list.view`; Messages: `messages.inbox.view`; Share: `profile.card.share_link`; Kids: `settings.family.view`; ExpertQueue fallback: `expert.queue.view` | varies by perm | none | **needs-design** — Kids and Expert Queue are mutually exclusive (one shown as fallback); this is an implicit priority rule not documented. Also ExpertQueue is only a routing tap, not a full surface. |
| E9 | Recent Activity Preview (top 3 + See all) | iOS | Inline preview of recent reads/quizzes/comments/bookmarks | none (always renders when loaded) | all auth | none | **needs-design** — no permission gate; web's ActivitySection requires `profile.activity` (premium). iOS shows activity preview free of charge as part of Overview tab. Inconsistency. |
| E10 | Achievements Preview (top 3 + See all) | iOS | Inline preview of earned/locked badges | none (always renders when loaded) | all auth | none | **needs-design** — no permission gate on Overview tab preview; Milestones tab IS gated by `profile.achievements`. Web MilestonesSection gated via ProfileApp. Inconsistency between preview (free) and full tab (paid). |
| E11 | Overview Tab | iOS | Bio (conditional), profile card preview, "My stuff" quick links | Card preview: `profile.card.view`; always rendered | all auth | none | **correct** |
| E12 | Activity Tab | iOS | Filter pills (All/Articles/Comments/Bookmarks); activity list | `profile.activity` (locked tab if absent) | pro, expert, admin | none | **correct** — matches web ActivitySection |
| E13 | Categories Tab | iOS | Expandable categories with subcategory stats and progress bars | `profile.categories` (locked tab if absent) | pro, expert, admin | none | **correct** — matches web CategoriesSection |
| E14 | Milestones Tab | iOS | Tier progress bar + achievement grid (earned + locked) | `profile.achievements` (locked tab if absent) | pro, expert, admin | none | **correct** — note permission key is `profile.achievements` (confirm vs. web `perms.milestones` key) |
| E15 | Kids/Family top-bar button | iOS | Navigates to family dashboard; shown only when parent | `settings.family.view` | parent | none | **correct** — web equivalent: family LinkOutSection in rail |
| E16 | Logout Button (bottom of ProfileView) | iOS | Signs out current session | none — always shown | all auth | none | **redundant** — sign-out also in SettingsView danger zone; two places on iOS. Web SignOutSection is the only web location. |

---

## Part F — iOS main app (`SettingsView.swift`)

Settings is a search-as-you-type hub with 7 sections. All subpages are pushed from this view.

| # | Section / subpage | Platform(s) | What it does | Permission gate | Roles | Kill-switch | Finding |
|---|---|---|---|---|---|---|---|
| F1 | Account → Profile (AccountSettingsView) | iOS | Username, bio, avatar edit; `update_own_profile` RPC | `settings.view` | all auth | none | **correct** — web equivalent: IdentitySection / IdentityCard |
| F2 | Account → Email (EmailSettingsView) | iOS | Current email display, change via Supabase Auth `.update` | `settings.account.edit_email` | all auth | none | **correct** — web equivalent: EmailsCard |
| F3 | Account → Password (PasswordSettingsView) | iOS | Password change via Supabase Auth `.update` | `settings.account.change_password` | all auth | none | **correct** — web equivalent: PasswordCard |
| F4 | Account → Sign-in Activity (LoginActivityView) | iOS | Login audit log via `get_own_login_activity` RPC (p_limit: 50) | `settings.login_activity.view` | all auth | none | **wrong-gate** — web SessionsSection has NO permission gate; iOS gates this. Also web shows active sessions (revocable), iOS shows historical audit log. These are different features with the same purpose — needs reconciliation. |
| F5 | Account → MFA (MFASettingsView) | iOS | TOTP enrollment/verification/removal via Supabase GoTrue MFA API | `settings.account.2fa.enable` | all auth | none | **correct** — web equivalent: MFACard |
| F6 | Preferences → Alerts (NotificationsSettingsView) | iOS | System push permission viewer; per-type toggles **dead** (writes to unused `users.metadata.notifications.*`) | `notifications.prefs.view` + `notifications.prefs.toggle_push` | all auth | T27+T3.5: per-type toggles dead code — `breaking`, `digest`, `expert_reply`, `comment_reply` toggles are no-ops | **needs-design** — dead per-type toggle code needs cleanup; web NotificationsCard operates on `/api/notifications/preferences` (not the dead metadata path); functional state is push-permission viewer only |
| F7 | Preferences → Feed (FeedPreferencesSettingsView) | iOS | showBreaking/Trending/Recommended, hideLowCred, compactDisplay toggles in `users.metadata.feed` JSONB | `settings.feed.view` | all auth | none | **gap** — no equivalent feed preferences surface on web profile; web may control these elsewhere or not at all |
| F8 | Privacy → DM Read Receipts | iOS | Toggle `dm_read_receipts_enabled` via RPC | none (always shown) | all auth | none | **correct** — web equivalent: PrivacyCard |
| F9 | Privacy → Blocked Accounts (BlockedAccountsView) | iOS | List from `GET /api/users/blocked`; unblock via `DELETE /api/users/[id]/block` | none (always shown) | all auth | none | **needs-design** — web BlockedSection is in profile rail; iOS puts it in SettingsView. Same data, different location. One of these should be the canonical home. |
| F10 | Privacy → Data & Privacy (DataPrivacyView) | iOS | Export data (if `canExport`; `data_requests` table) + delete account (always; `POST /api/account/delete`) | `settings.data.request_export` gates export; delete always shown per Apple 5.1.1(v) | all auth | none | **correct** — web equivalent: DataCard; Apple requirement for always-reachable delete noted |
| F11 | Invite Friends | iOS | Invite link display (two one-time links) | `emailVerified && !frozenAt` (data-driven gate, no permission key) | verified, unfrozen users | none | **needs-design** — web InviteLinkCard uses no permission gate but checks for username; iOS checks email-verified + not-frozen. Different gate conditions. |
| F12 | Billing → Subscription | iOS | Plan display, upgrade/manage, restore purchases, web billing link | `billing.view.plan`; `billing.subscription.view_own` (preview only) | all auth | none | **correct** — web equivalent: BillingCard / PlanSection |
| F13 | Expert → Verification Request (VerificationRequestView) | iOS | Expert/Educator/Journalist application form; shows status if prior application exists | none (always shown in Expert section) | all auth | none | **needs-design** — web ExpertProfileSection has gate (`is_expert || expertStatus==='pending'`); iOS VerificationRequestView has no gate (always rendered in settings). Inconsistency. |
| F14 | Expert → Apply link | iOS | External link to `/signup/expert` | `expert.application.apply` | eligible auth | none | **correct** |
| F15 | About → Send Feedback (FeedbackSheet) | iOS | Bug/feature/other feedback → `POST /api/support` | none | all auth | none | **correct** — web equivalent: `/profile/contact` (though web has 11 topics vs. iOS 3) |
| F16 | About → Legal links | iOS | Privacy Policy + Terms of Service external links | none | all auth | none | **correct** |
| F17 | About → Version | iOS | App version display (read-only) | none | all auth | none | **correct** — not applicable on web |
| F18 | Danger Zone → Sign Out | iOS | Sign out (destructive) | none | all auth | none | **redundant** — see E16; sign-out is also at bottom of ProfileView |

---

## Part G — Kids iOS (`ProfileView.swift`)

| # | Section/card | Platform(s) | What it does | Permission gate | Roles | Kill-switch | Finding |
|---|---|---|---|---|---|---|---|
| G1 | Header (avatar, name, unpair) | K | Gradient avatar circle, kid display name, unpair button | Unpair: parental gate (COPPA) | kid | none | **correct** |
| G2 | Stats Grid (2×2) | K | Streak days, Verity Score, Quizzes passed, Badge count | none — always shown | kid | none | **correct** — web has no kids-specific stats (not applicable); iOS adult has no stats grid, has streak strip separately |
| G3 | Badges Section | K | Earned achievements from `user_achievements` filtered by `kid_profile_id`; rarity coloring | none — always shown | kid | none | **correct** — web MilestonesSection filters by `is('kid_profile_id', null)` (adult only); kids platform has its own badges query |
| G4 | About / Legal (Privacy Policy, Terms) | K | Outbound links to veritypost.com/privacy and /terms | Parental gate required before following link (Apple Kids Category compliance) | kid | none | **correct** |

**Intentional omissions (kids iOS):** billing, security, password, login activity, MFA, adult activity log, categories tab, milestones tab (replaced by simpler badges section), messages, bookmarks, expert queue, followers/following, profile card sharing, all settings except sign-out.

**Kids sign-out:** Handled by the parental-gated unpair button (G1), not a separate sign-out section.

---

## Summary findings by type

### wrong-gate (4 items)

| ID | Surface | Issue |
|---|---|---|
| WG1 | MilestonesSection (web) | Gate only in ProfileApp section array, not inside component; web key may be `profile.milestones` while iOS uses `profile.achievements` — needs reconciliation |
| WG2 | SessionsSection (web) | No permission gate; iOS equivalent (`LoginActivityView`) gated by `settings.login_activity.view` |
| WG3 | `/profile/card` (web) | Permission key is `profile.card_share`; iOS uses `profile.card.share_link` — must match |
| WG4 | `/profile/contact` (web) | No auth check in component; unclear if open to anon by design or oversight |

### gap (5 items)

| ID | Surface | Issue |
|---|---|---|
| G1 | Streak heatmap | iOS ProfileView has 30-day reading streak heatmap; web has no equivalent (ActivitySection is a timeline, not a streak grid); kids iOS shows streak count |
| G2 | Expert Queue | iOS has no full ExpertQueueSection equivalent; only a routing quick-action button |
| G3 | Expert Profile/credentials | iOS has no ExpertProfileSection equivalent (credentials + areas + vacation); iOS SettingsView only has the application form |
| G4 | Feed preferences | iOS has FeedPreferencesSettingsView; no equivalent on web profile |
| G5 | Blocked accounts location | Same feature exists on both platforms but in different locations (profile rail on web, settings on iOS); one should be canonical |

### redundant (3 items)

| ID | Surface | Issue |
|---|---|---|
| R1 | `/profile/settings` route | Functional duplicate of `/profile` with different default section; kept as legacy URL alias |
| R2 | Sign-out (iOS) | Exists in both ProfileView bottom and SettingsView danger zone |
| R3 | BlockedSection location | Same feature, different location on web vs. iOS (see also G5) |

### needs-design (7 items)

| ID | Surface | Issue |
|---|---|---|
| ND1 | PublicProfileSection (web) | No equivalent dedicated preview-with-edit surface on iOS; iOS bio is inline in hero card |
| ND2 | Quick Actions Row (iOS) | Kids/Expert Queue mutual exclusion is implicit; priority rule not documented |
| ND3 | Recent Activity preview on iOS Overview tab | No permission gate; web requires `profile.activity` (premium). Free users see activity preview on iOS. |
| ND4 | Achievements preview on iOS Overview tab | No permission gate on preview rows; full Milestones tab IS gated. Inconsistency between preview (free) and tab (paid). |
| ND5 | Notifications (iOS) | Dead per-type toggle code in NotificationsSettingsView (`breaking`, `digest`, `expert_reply`, `comment_reply` toggles write to unused metadata path) |
| ND6 | `/profile/category/[id]` (web) | No permission gate; CategoriesSection requires `profile.categories`; route bypasses that gate |
| ND7 | Invite link gate mismatch | Web InviteLinkCard: no perm key, requires username. iOS: `emailVerified && !frozenAt`. Different conditions for same feature. |

### should-not-exist (0 items)

None found. Every surface has an identifiable purpose.

### correct (all others)

Web sections: 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17, 18, 20, 21
Web settings cards: B1–B8 all correct
Web sub-routes: C1, C3, C4, C5, C6, C7 correct; C2 redundant; C8–C10 flagged above
Web API: D1 correct
iOS ProfileView: E1–E4, E6, E7, E11–E15 correct; others flagged
iOS SettingsView: F1–F3, F5, F8, F10, F12, F14, F15–F17 correct; others flagged
Kids iOS: G1–G4 all correct

---

## Open questions for Phase 3 research

These are not yet Q&A-ready — they need research before going to the owner.

1. **Streak heatmap (G1):** Should web get a streak visualization in ProfileView? Where would it live? Is the data already available?
2. **Expert Queue on iOS (G2):** Should the iOS app get a full ExpertQueueSection tab or remain routing-only? What is the expert's actual workflow on mobile?
3. **Expert Profile on iOS (G3):** Should credentials/areas/vacation management be added to iOS SettingsView or is web-only acceptable?
4. **Feed preferences on iOS (G4) vs. web gap:** Should web get a feed preferences section? Or is iOS the only platform where this makes sense?
5. **Blocked accounts canonical home (G5/R3):** Should blocked accounts live in profile rail (current web) or settings (current iOS)? One must be chosen.
6. **Permission key reconciliation (WG1, WG3):** `profile.milestones` vs. `profile.achievements`; `profile.card_share` vs. `profile.card.share_link` — which keys are canonical in the DB? (Verify in Phase 2 via `my_permission_keys` RPC.)
7. **Sessions vs. Login Activity (WG2, F4):** Web shows active revocable sessions; iOS shows historical audit log. Are these the same feature or different? Should both platforms have both?
8. **Contact form auth (WG4):** Intentionally open to anon or oversight?
9. **Activity/Achievements previews on iOS free (ND3, ND4):** Intentional free teaser or oversight?
10. **Dead notification toggles on iOS (ND5):** Should these be removed entirely or is there a plan to revive per-type notification preferences?
