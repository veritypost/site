# UI/UX Review — Index

Source of truth for "where are we." Status: `pending` | `in-review` | `findings` | `fixed` | `verified`.

Findings docs live at `UI_UX_REVIEW/<wave>-<n>-<slug>.md`.

---

## Wave A — Web public / reading (every visitor)

| #  | Unit | Surfaces | Status |
|----|------|----------|--------|
| 1  | Home | `/` | fixed (Slice 3 shipped 2026-05-02) |
| 2  | Article reader | `/[slug]` (+ `?a=` multi-article, `/story/[slug]` redirect) | findings — build-ready (Slices 4 + 5) |
| 3  | Browse | `/browse` | pending |
| 4  | Search | `/search` | pending |
| 5  | Category | `/category/[id]` | pending |
| 6  | Leaderboard | `/leaderboard` | pending |
| 7  | Public profile + card | `/u/[username]`, `/card/[username]` *(KILL-SWITCHED — chrome only)* | pending |
| 8  | Marketing bundle | `/pricing`, `/how-it-works`, `/about`, `/contact`, `/kids-app` | pending |
| 9  | Legal/info sweep | `/privacy`, `/privacy/kids`, `/terms`, `/cookies`, `/dmca`, `/corrections`, `/editorial-standards`, `/methodology`, `/help`, `/accessibility` | pending |
| 10 | Auth flow | `/login`, `/signup` (redirect), `/request-access` (redirect), `/welcome`, `/beta-locked` | pending |
| 11 | Logout flow | `/logout` | pending |

## Wave B — Web authed surfaces

| #  | Unit | Surfaces | Status |
|----|------|----------|--------|
| 12 | Profile shell | `/profile` (+ `/profile/settings`, `/profile/settings/billing`, `/profile/settings/expert`, `/profile/family`, `/profile/contact`) | pending |
| 13 | Profile kids | `/profile/kids`, `/profile/kids/[id]` | pending |
| 14 | Bookmarks | `/bookmarks` | pending |
| 15 | Notifications | `/notifications` | pending |
| 16 | Messages | `/messages` | pending |
| 17 | Following | `/following` | pending |
| 18 | Recap | `/recap`, `/recap/[id]` | pending |
| 19 | Billing | `/billing` | pending |
| 20 | Appeal | `/appeal` | pending |
| 21 | Expert queue | `/expert-queue` | pending |

## Wave C — Kids iOS (COPPA-critical)

| #  | Unit | Surfaces | Status |
|----|------|----------|--------|
| 22 | Pairing + parental gate | `PairCodeView`, `ParentalGateModal` | pending |
| 23 | Reading→celebration chain | `ArticleListView` → `KidReaderView` → `KidQuizEngineView` → `QuizPassScene` → `StreakScene` → `BadgeUnlockScene` | pending |
| 24 | Home / greeting | `GreetingScene` | pending |
| 25 | Leaderboard (3 scopes) | `LeaderboardView` | pending |
| 26 | Expert sessions | `ExpertSessionsView` | pending |
| 27 | Profile | `ProfileView` (kids) | pending |

## Wave D — iOS adult

| #  | Unit | Surfaces | Status |
|----|------|----------|--------|
| 28 | Auth chain | `SignInGate`, `LoginView`, `SignupView`, `VerifyEmailView`, `PickUsernameView`, `WelcomeView`, `ForgotPasswordView`, `ResetPasswordView` | pending |
| 29 | Tabs shell | `ContentView` tab bar (Today / Browse / Following / Profile) | pending |
| 30 | Today / Home | `HomeView` | pending |
| 31 | Browse | `BrowseLanding` | pending |
| 32 | Following | `FollowingView` | pending |
| 33 | Profile | `ProfileView` (4 inner tabs + `AvatarQuickEditSheet`) | pending |
| 34 | Story detail | `StoryDetailView` (story / timeline / discussion + inline quiz + comments) | pending |
| 35 | Find / search | `FindView` | pending |
| 36 | Alerts | `AlertsView` (alerts + manage tabs + `PushPromptSheet`) — *manage subs section KILL-SWITCHED* | pending |
| 37 | Messages | `MessagesView`, `DMThreadView` | pending |
| 38 | Leaderboard | `LeaderboardView` (adult) | pending |
| 39 | Bookmarks | `BookmarksView` | pending |
| 40 | Expert queue | `ExpertQueueView` | pending |
| 41 | Family suite | `FamilyDashboardView`, `KidDashboardView`, `FamilyLeaderboardView`, `FamilyAchievementsView` (+ sheets) | pending |
| 42 | Settings hub | `SettingsView` + 11 sub-views | pending |
| 43 | Subscription | `SubscriptionView`, `UpgradePromptInline` | pending |
| 44 | Invite friends | `InviteFriendsView` | pending |
| 45 | Public profile | `PublicProfileView` *(KILL-SWITCHED parity — chrome only)* | pending |
| 46 | Recap | `RecapListView`, `RecapQuizView` | pending |

## Wave E — Web admin (lower bar: works + not broken, not "looks great")

| #  | Unit | Surfaces | Status |
|----|------|----------|--------|
| 47 | Admin hub + nav | `/admin` | pending |
| 48 | Newsroom cluster | `/admin/newsroom`, `/admin/newsroom/clusters/[id]` | pending |
| 49 | Pipeline cluster | `/admin/pipeline-config`, `/admin/pipeline/runs` (+ `[id]`), `/admin/pipeline/costs`, `/admin/pipeline/cleanup`, `/admin/pipeline/settings`, `/admin/breaking`, `/admin/top-stories`, `/admin/feeds`, `/admin/story-manager`, `/admin/prompt-presets` | pending |
| 50 | Kids admin cluster | `/admin/kids-story-manager`, `/admin/expert-sessions`, `/admin/kids-dob-corrections` (+ `[id]`) | pending |
| 51 | Moderation cluster | `/admin/comments`, `/admin/reports`, `/admin/moderation` | pending |
| 52 | Users / identity cluster | `/admin/users` (+ `[id]`, `[id]/permissions`), `/admin/access`, `/admin/access-requests`, `/admin/verification`, `/admin/auth-recovery`, `/admin/data-requests`, `/admin/permissions` | pending |
| 53 | Configuration cluster | `/admin/features`, `/admin/settings`, `/admin/plans`, `/admin/words`, `/admin/categories`, `/admin/email-templates` | pending |
| 54 | Revenue cluster | `/admin/subscriptions`, `/admin/promo`, `/admin/ad-campaigns`, `/admin/ad-placements`, `/admin/sponsors`, `/admin/referrals` | pending |
| 55 | Analytics / monitoring cluster | `/admin/analytics`, `/admin/notifications`, `/admin/system`, `/admin/support`, `/admin/webhooks`, `/admin/cohorts`, `/admin/streaks`, `/admin/reader`, `/admin/recap` | pending |

---

## Wave verification

| Wave | Verification status | Date |
|------|--------------------|------|
| A    | not started | — |
| B    | not started | — |
| C    | not started | — |
| D    | not started | — |
| E    | not started | — |

## Sweep units

*Created lazily when a finding repeats across 5+ units. Format:*

`S<n> — <pattern>` — e.g. `S1 — Empty-state CTA missing on list views (web)`. Listed inline in the wave they're discovered in.

**Sweep candidates surfaced from Unit 2:**
- `dark-mode-token-sweep` — hardcoded hex colors across ~10+ files violating PRINCIPLE §1.1. Includes `not-found.tsx`, `ArticleSurface.tsx`, `ArticleQuiz.tsx`, `CommentThread.tsx`, `CommentRow.tsx`, `CommentComposer.tsx`, `BookmarkButton.tsx`. Defer formal sweep until 2-3 more units confirm the pattern holds beyond the article reader.
- `edition-copy-sweep` — "today's edition" / "back to edition" / "today's front page" framing across multiple surfaces, violating DECISION #021. Findings #2 + #3 in Unit 2; likely repeats elsewhere.
- `<h2>-section-headings-sweep` — Sources / Timeline / Discussion / Quiz card all use `<p>` or `<div>` for section headings (Reviewer A finding #47). Document outline broken.

---

## Execution slices

When a unit's findings exceed in-session fix scope, the build is broken into **slices** tracked in `UI_UX_REVIEW_SLICES.md`. Slices are sequentially numbered in build order with explicit prerequisites. The continuation protocol auto-detects the next valuable slice and runs it; owner pastes the same prompt every time.

Active slice plan (as of 2026-05-02):

| # | Slice | Type | Prereq |
|---|---|---|---|
| 1 | `admin.god_mode` → `admin.owner_mode` rename | Foundation | — |
| 2 | Subcategory schema | Foundation | — |
| 3 | Unit 1 / Home cleanup (49 findings, placeholder) | Unit fix | 1 + 2 |
| 4 | Unit 2 / Article reader / Layout overhaul | Unit fix | 1 + 2 |
| 5 | Unit 2 / Article reader / Broken-state cleanup (126 findings) | Unit fix | 1 + 2 + 4 |
| 6 | Registration wall | Cross-cutting | 1 + 2 |
| 7 | Admin ad system completion | Cross-cutting | 2 + 4 |
| 8 | iOS CSAM-trio bridge | Cross-cutting | — |
| 9 | Cross-platform parity bridges | Cross-cutting | 4 |
| 10 | Wave A verification sweep | Verification | all Wave A unit-fix slices |

**Future slices** (added when reviews complete): Slice 11 (Unit 3 / Browse), Slice 12 (Unit 4 / Search), Slice 13 (Unit 5 / Category), Slice 14 (Unit 6 / Leaderboard), Slice 15 (Unit 7 / Public profile chrome), Slice 16 (Unit 8 / Marketing bundle), Slice 17 (Unit 9 / Legal/info sweep), Slice 18 (Unit 10 / Auth flow), Slice 19 (Unit 11 / Logout). Wave B onward continues numbering.

See `UI_UX_REVIEW_SLICES.md` for per-slice scope, file paths, test plans, decisions consumed, and ready-state.

---

## Deep-coverage units (extra scrutiny when reached)

These units have **queue states × multiple roles × permission gates** that compound. Per PRINCIPLE §3.6, every cell of the role × state × permission matrix must be designed. Per-unit session for these allocates extra time and explicitly enumerates the matrix before reviewing.

| Unit | Why deep |
|------|----------|
| 2 — Article reader (web) | Discussion area: anon viewer / commenter / quiz-passed / expert / moderator / admin / Owner Mode holder × pending / posted / flagged / hidden / deleted comment states. Plus mobile tab persistence (#011) + per-article comment binding (#010). |
| 21 — Expert queue (web) | Expert claims / pending / in-review / answered / rejected / appealed states × viewer / claimant / other-expert / moderator / admin / owner roles. |
| 26 — Expert sessions (kids iOS) | Kid viewer / parent-gated / paired / expert × scheduled / live / ended / no-show states. COPPA-critical. |
| 34 — Story detail (iOS adult) | Story / timeline / discussion (mirror of unit 2) — same matrix, iOS-side. Inline quiz + comments. |
| 40 — Expert queue (iOS adult) | iOS-side mirror of unit 21. Parity check across both queues required. |
| 50 — Kids admin cluster | `/admin/expert-sessions` includes the moderator-side of unit 26. Every kid-safety state needs an admin-side counterpart. |
| 51 — Moderation cluster | `/admin/comments`, `/admin/reports`, `/admin/moderation` — overlap with unit 2's report/flag/hide modal flows. |
| 52 — Users / identity cluster | `/admin/users` + `[id]` + `[id]/permissions` — Owner Mode editor + audit trail (DECISIONS #013–#020). High-stakes UI, full matrix required. |

When a deep-coverage unit's session opens, the per-unit doc must include:
1. **Role enumeration** at the top — every role that can see the surface, and what they see.
2. **State enumeration** at the top — every state an item on this surface can be in.
3. **Matrix coverage check** — confirm every (role × state) cell has a designed UX, or log the gap as a finding.
4. **Permission gates** — every gated action verified against the perms catalog and the Owner Mode bypass.

---

**Total units: 55** (~11 + 10 + 6 + 19 + 9). Plus seeding session (1) and wave verifications (5). ≈ 61 sessions worst case; many will be fast. Deep-coverage units (8 of 55) get longer sessions.
