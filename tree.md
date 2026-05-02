# Verity Post — Route & Screen Tree

## Web (`web/src/app/`)

### User-Facing Pages

| Route | What it is | Key file |
|-------|-----------|----------|
| `/` | Home feed — hero story + supporting cards, breaking strip, edition grouping | `app/page.tsx` |
| `/[slug]` | Article reader — article body, quiz, comments, sources, timeline, next-story footer | `app/[slug]/page.tsx` |
| `/story/[slug]` | Alias route for article reader (same page, different URL shape) | `app/story/[slug]/page.tsx` |
| `/browse` | Story browser — filterable/searchable grid of all published stories with coverage timeline | `app/browse/page.tsx` |
| `/following` | Following feed — stories from categories the user follows | `app/following/page.tsx` |
| `/search` | Full-text search across articles and stories | `app/search/page.tsx` |
| `/bookmarks` | Saved bookmarks grid for signed-in users | `app/bookmarks/page.tsx` |
| `/leaderboard` | Community Verity Score leaderboard | `app/leaderboard/page.tsx` |
| `/notifications` | In-app notification inbox | `app/notifications/page.tsx` |
| `/messages` | Direct messages / conversations list | `app/messages/page.tsx` |
| `/recap` | Daily recap index — list of available recaps | `app/recap/page.tsx` |
| `/recap/[id]` | Individual recap — multi-question quiz format for a story | `app/recap/[id]/page.tsx` |
| `/r/[slug]` | Short redirect — resolves a recap short-link to its full recap page | `app/r/[slug]/` |
| `/category/[id]` | Category detail — stories filtered to a single category | `app/category/[id]/page.js` |
| `/expert-queue` | Expert answer queue — experts review and answer user-submitted questions | `app/expert-queue/page.tsx` |

### Profile & Settings

| Route | What it is | Key file |
|-------|-----------|----------|
| `/profile` | Main profile shell — dashboard, activity, bookmarks, categories, milestones, settings, sign out (all in one master/detail app) | `app/profile/_components/ProfileApp.tsx` |
| `/profile/[id]` | Profile by numeric ID — redirects to `/u/[username]` | `app/profile/[id]/page.tsx` |
| `/profile/settings` | Settings redirect into profile shell | `app/profile/settings/page.tsx` |
| `/profile/settings/billing` | Billing settings section | `app/profile/settings/billing/page.tsx` |
| `/profile/settings/expert` | Expert application / expert profile settings | `app/profile/settings/expert/page.tsx` |
| `/profile/family` | Family plan management — kids seats, pairing, weekly reports | `app/profile/family/page.tsx` |
| `/profile/kids` | Kids accounts list under a family plan | `app/profile/kids/page.tsx` |
| `/profile/kids/[id]` | Individual kid account detail — band, streak, activity | `app/profile/kids/[id]/page.tsx` |
| `/profile/card` | Legacy redirect — profile share card | `app/profile/card/page.js` |
| `/u/[username]` | Public profile by username | `app/u/[username]/page.tsx` |
| `/card/[username]` | Public profile share card (OG image / link preview surface) | `app/card/[username]/page.js` |

### Auth Flow

| Route | What it is | Key file |
|-------|-----------|----------|
| `/login` | Email → magic-link / OTP login, waitlist form, invite gate | `app/login/page.tsx`, `app/login/_SingleDoorForm.tsx` |
| `/signup` | Post-auth username claim + onboarding entry | `app/signup/page.tsx` |
| `/signup/expert` | Expert program application form | `app/signup/expert/` |
| `/logout` | Clears session and redirects to home | `app/logout/page.js` |
| `/welcome` | First-login welcome screen after onboarding | `app/welcome/page.tsx` |
| `/verify-email` | Email verification landing (handles token from link) | `app/verify-email/` |
| `/forgot-password` | Password reset request form | `app/forgot-password/` |
| `/reset-password` | Password reset form (handles token from link) | `app/reset-password/` |
| `/request-access` | Waitlist / access request submission form | `app/request-access/page.tsx` |
| `/beta-locked` | Holding page shown to users whose account is beta-gated | `app/beta-locked/page.tsx` |
| `/appeal` | Account suspension / ban appeal form | `app/appeal/page.tsx` |

### Billing

| Route | What it is |
|-------|-----------|
| `/billing` | Subscription management — plan picker, upgrade/downgrade, cancel |
| `/pricing` | Public pricing page |

### Legal & Static

| Route | What it is |
|-------|-----------|
| `/about` | About page |
| `/how-it-works` | Product explainer |
| `/methodology` | Editorial methodology |
| `/editorial-standards` | Editorial standards doc |
| `/corrections` | Corrections policy |
| `/contact` | Contact form |
| `/help` | Help / FAQ |
| `/privacy` | Privacy policy |
| `/privacy/kids` | Kids privacy policy (COPPA) |
| `/terms` | Terms of service |
| `/cookies` | Cookie policy |
| `/dmca` | DMCA takedown policy |
| `/accessibility` | Accessibility statement |
| `/kids-app` | Marketing / redirect page for the kids iOS app |

### Internal / Utility

| Route | What it is |
|-------|-----------|
| `/preview` | Sitewide holding-mode gate — renders coming-soon when `NEXT_PUBLIC_SITE_MODE=coming_soon` |
| `/mockup-explore` | Internal design mockup for browse page (not linked from nav) |
| `/ideas/*` | Admin-only preview surfaces for feed concepts — middleware hard-gates to admin role |

---

## Web Admin (`/admin/`)

All admin routes require admin or editor role (middleware-enforced).

| Route | What it is |
|-------|-----------|
| `/admin` | Admin dashboard — KPI overview, quick links |
| `/admin/newsroom` | Newsroom — RSS cluster browser, ingest queue, cluster → story promotion |
| `/admin/newsroom/clusters/[id]` | Individual cluster detail — articles, sources, generate action |
| `/admin/story-manager` | Story manager — published stories, edit, reorder articles, lifecycle control |
| `/admin/kids-story-manager` | Kids story manager — same as story-manager but scoped to kids content |
| `/admin/pipeline` | Pipeline overview — runs list, health |
| `/admin/pipeline/runs` | All pipeline run records |
| `/admin/pipeline/runs/[id]` | Individual run detail — logs, cost breakdown, article outputs |
| `/admin/pipeline/settings` | Generation on/off toggles, model settings |
| `/admin/pipeline/costs` | Cost analytics per run / model / category |
| `/admin/pipeline/cleanup` | Orphan article / cluster cleanup tool |
| `/admin/pipeline-config` | Prompt presets, generation config tabs |
| `/admin/breaking` | Breaking news banner manager — set/clear breaking strip |
| `/admin/top-stories` | Top stories pin manager — pin stories to hero positions |
| `/admin/recap` | Recap manager — review and publish daily recaps |
| `/admin/categories` | Category CRUD — add/edit/reorder categories |
| `/admin/users` | User list — search, filter by role/plan |
| `/admin/users/[id]` | Individual user detail — profile, billing, activity |
| `/admin/users/[id]/permissions` | Permission set assignment for a user |
| `/admin/permissions` | Permission set manager — define sets, attach permissions |
| `/admin/access` | Access control — roles, permission set wiring |
| `/admin/access-requests` | Waitlist / access request queue — approve or deny |
| `/admin/moderation` | Moderation queue — flagged comments and reports |
| `/admin/comments` | All-comments browser with moderation actions |
| `/admin/reports` | User-submitted report inbox |
| `/admin/analytics` | Site analytics — reads, quiz completions, engagement |
| `/admin/expert-sessions` | Expert session manager — open/close sessions, review answers |
| `/admin/feeds` | Feed configuration — custom feed slot management |
| `/admin/cohorts` | User cohort manager — define and assign cohorts |
| `/admin/plans` | Subscription plan manager — pricing, features, Stripe wiring |
| `/admin/subscriptions` | Active subscription list with admin actions |
| `/admin/billing` | Billing audit — refund queue, freeze/unfreeze, sweep grace |
| `/admin/promo` | Promo code manager — create/disable discount codes |
| `/admin/sponsors` | Sponsor manager — sponsor profiles for ad attribution |
| `/admin/ad-campaigns` | Ad campaign manager — create and manage ad campaigns |
| `/admin/ad-placements` | Ad placement manager — where ads appear |
| `/admin/email-templates` | Transactional email template editor |
| `/admin/notifications` | Push/in-app notification broadcast tool |
| `/admin/referrals` | Referral code manager — mint and track invite links |
| `/admin/streaks` | Streak management — view and admin-override streaks |
| `/admin/words` | Banned word / content filter list |
| `/admin/verification` | Expert verification queue — review expert applications |
| `/admin/settings` | Global app settings key-value store |
| `/admin/system` | System health — cache, queue depth, service status |
| `/admin/auth-recovery` | Auth recovery tool — manual session/email fix for stuck users |
| `/admin/features` | Feature flag manager |
| `/admin/prompt-presets` | AI prompt preset editor (separate from pipeline-config) |
| `/admin/support` | Support ticket inbox |
| `/admin/webhooks` | Webhook log viewer |
| `/admin/reader` | Admin article reader — preview any article as admin |
| `/admin/data-requests` | GDPR/CCPA data request queue |
| `/admin/kids-dob-corrections` | Kids date-of-birth correction request queue |
| `/admin/kids-dob-corrections/[id]` | Individual DOB correction detail |

---

## iOS Adult App (`VerityPost/`)

| Screen | What it is |
|--------|-----------|
| `ContentView` | Root tab container — Home, Find, Bookmarks, Alerts, Profile tabs |
| `HomeView` | Home feed — hero story, breaking strip, supporting cards, top-stories |
| `FindView` / `BrowseLanding` | Browse — category grid, story list, search |
| `StoryDetailView` | Article reader — article body, quiz, comments |
| `BookmarksView` | Saved bookmarks list |
| `AlertsView` | Category alert subscriptions manager |
| `FollowingView` | Following feed — stories from subscribed categories |
| `LeaderboardView` | Community Verity Score leaderboard |
| `MessagesView` | Direct messages list |
| `RecapView` | Daily recap quiz |
| `ProfileView` | Signed-in user profile — stats, settings, tier |
| `PublicProfileView` | Another user's public profile |
| `SettingsView` | App settings — notifications, privacy, account |
| `SubscriptionView` | In-app subscription plan picker / upgrade |
| `ExpertQueueView` | Expert answer queue (expert-role users only) |
| `LoginView` | Email login / OTP entry |
| `SignupView` | New account creation |
| `WelcomeView` | Post-signup welcome + onboarding |
| `PickUsernameView` | Username selection step in onboarding |
| `VerifyEmailView` | Email verification confirmation |
| `ForgotPasswordView` | Password reset request |
| `ResetPasswordView` | Password reset form |
| `InviteFriendsView` | Invite / referral share sheet |

---

## iOS Kids App (`VerityPostKids/`)

| Screen | What it is |
|--------|-----------|
| `ArticleListView` | Home — age-appropriate story/article list |
| `KidReaderView` | Article reader for kids — simplified layout, large text |
| `KidQuizEngineView` | Quiz flow for kids — animated feedback, streak rewards |
| `ExpertSessionsView` | Expert Q&A view for kids |
| `LeaderboardView` | Kids leaderboard — family and global rankings |
| `ProfileView` | Kid profile — band level, streak, achievements |
| `PairCodeView` | Pairing flow — enter code from parent's family dashboard |
