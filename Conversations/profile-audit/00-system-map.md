# Profile Audit — System Map

**Written:** (founding pass)
**Amend, don't rewrite.** Add new findings as dated notes at the end of each section.

---

## Web profile architecture

### Entry points

| Route | Who can reach it | Notes |
|---|---|---|
| `/profile` | Auth-gated (middleware PROTECTED_PREFIXES) | Own profile — the main surface |
| `/profile/settings` | Auth-gated | Settings sub-page |
| `/profile/settings/billing` | Auth-gated | Billing deep-link |
| `/profile/settings/expert` | Auth-gated | Expert settings deep-link |
| `/profile/family` | Auth-gated | Family management (parent role) |
| `/profile/kids` | Auth-gated | Kid profile list (parent role) |
| `/profile/kids/[id]` | Auth-gated | Individual kid profile (parent role) |
| `/profile/[id]` | Auth-gated | Own profile by ID — likely redirects to `/profile` |
| `/u/[username]` | Public | Public profile view of any user |
| `/profile/card` | Auth-gated (probably) | Profile share card — purpose unclear |
| `/profile/category/[id]` | Auth-gated (probably) | Category-specific profile view — purpose unclear |
| `/profile/contact` | Auth-gated (probably) | Contact form — purpose unclear |

### Sections (`web/src/app/profile/_sections/`)

| File | Inferred purpose | Investigation notes |
|---|---|---|
| `YouSection.tsx` | Core identity — name, username, avatar, tier | Primary section on own profile |
| `IdentitySection.tsx` | Identity edit form — name, username, bio | May overlap with YouSection |
| `ActivitySection.tsx` | Reading history, quiz streaks, engagement stats | |
| `MilestonesSection.tsx` | Achievement badges / milestones | |
| `CategoriesSection.tsx` | Followed/preferred categories | |
| `BookmarksSection.tsx` | Saved articles | Also exists as standalone `/bookmarks` route — redundancy risk |
| `MessagesSection.tsx` | Recent DMs / message thread entry | Also exists as standalone `/messages` route — redundancy risk |
| `ExpertApplyForm.tsx` | Expert application form | Only for users eligible to apply |
| `ExpertProfileSection.tsx` | Expert bio, credentials display | Only for verified experts |
| `ExpertQueueSection.tsx` | Expert pending assignment queue | Only for verified experts |
| `NotificationsSection.tsx` | Notification inbox (or prefs?) | Also exists as standalone `/notifications` route — redundancy risk |
| `BlockedSection.tsx` | Blocked users list | |
| `PrivacySection.tsx` | Privacy settings (public/private toggles) | Also exists as settings card `PrivacyCard.tsx` — redundancy risk |
| `SecuritySection.tsx` | Password / 2FA display | Also exists as settings cards — redundancy risk |
| `SessionsSection.tsx` | Active device sessions | |
| `DataSection.tsx` | Data export and account deletion | Also exists as settings card `DataCard.tsx` — redundancy risk |
| `SignOutSection.tsx` | Sign out action | |
| `PlanSection.tsx` | Subscription tier display + upgrade CTA | |
| `PublicProfileSection.tsx` | How the user's public profile looks | May be a preview of `/u/[username]` |
| `InviteLinkCard.tsx` | Referral invite link | |
| `LinkOutSection.tsx` | External links on profile? | Purpose unclear — investigate |

### Settings cards (`web/src/app/profile/settings/_cards/`)

| File | Purpose | Redundancy risk |
|---|---|---|
| `IdentityCard.tsx` | Name, username, avatar edit | Overlaps `IdentitySection.tsx` and `YouSection.tsx` |
| `EmailsCard.tsx` | Email address management | |
| `PasswordCard.tsx` | Password change | |
| `MFACard.tsx` | Multi-factor auth setup | |
| `NotificationsCard.tsx` | Notification preferences | Overlaps `NotificationsSection.tsx` |
| `PrivacyCard.tsx` | Privacy toggles | Overlaps `PrivacySection.tsx` |
| `BillingCard.tsx` | Subscription + billing management | Overlaps `PlanSection.tsx` |
| `DataCard.tsx` | Data export / deletion | Overlaps `DataSection.tsx` |

### Shared components (`web/src/app/profile/_components/`)

| File | Purpose |
|---|---|
| `ProfileApp.tsx` | Top-level profile client shell; loads user, permissions, plan |
| `AppShell.tsx` | Layout wrapper for profile pages |
| `PermsBoundary.tsx` | Role/permission gate wrapper component |
| `AccountStateBanner.tsx` | Warning banner for suspended/banned/trial accounts |
| `AvatarEditor.tsx` | Avatar upload + crop UI |
| `Card.tsx` | Card layout primitive |
| `ConfirmDialog.tsx` | Confirmation modal |
| `EmptyState.tsx` | Empty state display |
| `Field.tsx` | Form field primitive |
| `Skeleton.tsx` | Loading skeleton |
| `StatTile.tsx` | Stats display tile |
| `TierProgress.tsx` | Tier progress indicator |
| `Toast.tsx` | In-profile toast notification |

### Utilities (`web/src/app/profile/_lib/`)
- `palette.ts` — color palette for profile UI
- `states.ts` — account state machine (active, suspended, banned, trial, etc.)
- `useFocusTrap.ts` — accessibility focus trap for modals

### API routes
- `/api/profile/trial-banner-dismiss` — POST; dismisses the trial expiry banner; auth-gated

---

## iOS profile architecture

### Main iOS (`VerityPost/VerityPost/`)

| File | Purpose |
|---|---|
| `ProfileView.swift` | Primary profile surface — contains most profile sections |
| `SettingsView.swift` | Settings surface — notification prefs, account actions, logout |
| `SettingsService.swift` | Settings fetch/save (API calls for settings) |
| `AlertsView.swift` | Notification inbox / alerts tray |
| `BlockService.swift` | Block/unblock logic (separate service, not in ProfileView) |
| `PublicProfileView.swift` | Public view of another user's profile (equivalent to `/u/[username]`) |

**Key question for investigation:** Does `ProfileView.swift` mirror the web section structure or have its own? What sections does it contain? What is gated by plan/role?

### Kids iOS (`VerityPostKids/VerityPostKids/`)

| File | Purpose |
|---|---|
| `ProfileView.swift` | Kids profile — achievements, streak, reading record |

**Scope:** Kids profile is intentionally minimal. It should show: kid's reading record, achievements/badges, streak. It should NOT show: billing, security, sessions, data export, expert sections.

---

## Permission system reference

All permission checks in the profile go through:
- `PermsBoundary.tsx` (web) — wraps sections in permission gate
- `PermissionService.swift` (iOS) — `permissionService.has("key")` calls
- `my_permission_keys` RPC — returns effective keys for the current session

Key permission keys relevant to profile (to be verified in Phase 2):
- `profile.view` — own profile access
- `profile.edit` — edit identity fields
- `profile.follow` — follow other users
- `billing.view` — see billing section
- `billing.manage` — modify subscription
- `expert.apply` — apply for expert status
- `expert.view_queue` — see expert queue
- `admin.*` — admin-only sections

**Note:** The exact key names must be verified against the `my_permission_keys` RPC implementation and the permission sets in the admin UI. Do not assume key names from the above list are correct — they are inferred, not verified.

---

## Known redundancy candidates (pre-investigation)

These are surface-level observations that need investigation to confirm. Do not act on them without Phase 1+2 findings.

1. **Identity**: `YouSection` + `IdentitySection` + `IdentityCard` (settings) — three places that might do the same thing
2. **Notifications**: `NotificationsSection` (profile) + `NotificationsCard` (settings) + `/notifications` (standalone route) — three surfaces
3. **Privacy**: `PrivacySection` (profile) + `PrivacyCard` (settings) — two surfaces
4. **Data**: `DataSection` (profile) + `DataCard` (settings) — two surfaces
5. **Billing**: `PlanSection` (profile) + `BillingCard` (settings) — two surfaces
6. **Bookmarks**: `BookmarksSection` (profile) + `/bookmarks` (standalone route)
7. **Messages**: `MessagesSection` (profile) + `/messages` (standalone route)
8. **Expert**: `ExpertApplyForm` + `ExpertProfileSection` + `ExpertQueueSection` — three expert-related sections

---

## Known unclear surfaces (pre-investigation)

These routes / sections have unclear purposes that must be investigated in Phase 1:

- `/profile/card` — some kind of sharing card; relationship to `/card/[username]` unclear
- `/profile/category/[id]` — a category-scoped profile view; use case unclear
- `/profile/contact` — contact form from the profile; who receives it?
- `LinkOutSection.tsx` — external links? expert credentials? unclear

---

## Cross-platform baseline (what we know before investigation)

| Section | Web | iOS (main) | Kids iOS |
|---|---|---|---|
| Own profile identity | ✓ YouSection + IdentitySection + IdentityCard | ✓ ProfileView | ✓ ProfileView (minimal) |
| Activity / reading history | ✓ ActivitySection | ? | ✓ ProfileView |
| Achievements / milestones | ✓ MilestonesSection | ? | ✓ ProfileView |
| Categories | ✓ CategoriesSection | ? | ✗ (not applicable) |
| Bookmarks | ✓ BookmarksSection | ✓ BookmarksView | ✗ |
| Messages | ✓ MessagesSection | ✓ MessagesView | ✗ |
| Expert sections | ✓ (3 sections) | ? | ✗ |
| Notifications | ✓ NotificationsSection + NotificationsCard | ✓ AlertsView | ✗ |
| Privacy settings | ✓ PrivacySection + PrivacyCard | ? | ✗ |
| Security / password | ✓ SecuritySection + PasswordCard + MFACard | ? | ✗ |
| Sessions | ✓ SessionsSection | ✗ (no equivalent?) | ✗ |
| Billing / plan | ✓ PlanSection + BillingCard | ✓ SubscriptionView | ✗ |
| Data export / deletion | ✓ DataSection + DataCard | ? | Parental gate |
| Blocked users | ✓ BlockedSection | ✓ BlockService | ✗ |
| Family / kids | ✓ /profile/family + /profile/kids | ✓ FamilyViews | ✗ (own profile only) |
| Public profile preview | ✓ PublicProfileSection | ✓ PublicProfileView | ✗ |
| Invite / referral | ✓ InviteLinkCard | ✓ InviteFriendsView | ✗ |
| Sign out | ✓ SignOutSection | ✓ SettingsView | ✓ (somewhere) |
| Streak display | ? (ActivitySection?) | ? | ✓ ProfileView |
