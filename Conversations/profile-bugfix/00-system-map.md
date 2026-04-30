# Profile Section — System Map

**As of:** 2026-04-30 (post-bugfix session 1)

This map describes the profile section's component tree, data flows, and API surface as it exists after the 15-issue fix session. It is the reference document for any future investigation in this program.

---

## Entry point

`/profile` — `web/src/app/profile/page.tsx`

Renders `<ProfileApp />`. All profile state lives in `ProfileApp` or in the sections/cards it renders.

---

## Component tree

```
ProfileApp (web/src/app/profile/_components/ProfileApp.tsx)
│  Loads user row + active_subscription on mount via Promise.all.
│  Owns: user, subscription, resolved, loadError, bannerDismissed state.
│  On loadError: renders an error card (not blank screen).
│  On !resolved: returns null (blank while loading).
│
├── ToastProvider (web/src/app/profile/_components/Toast.tsx)
│   Context provider. Wraps everything including AppShell.
│   useToast() available to all children.
│   value is memoized on [show] — stable across re-renders.
│
├── AccountStateBanner (web/src/app/profile/_components/AccountStateBanner.tsx)
│   Shown when user.state !== 'active'. Variants: suspended, muted, pending, deleted.
│   Dismiss button PATCHes /api/profile/banner-dismiss.
│   muted variant: no CTA link (community-guidelines route doesn't exist; removed 2026-04-30).
│
└── AppShell (web/src/app/profile/_components/AppShell.tsx)
    Renders section nav (tab bar) + active section content.
    Sections filtered by permission.
    If active section list is empty: renders "No sections available / try refreshing" fallback.
    
    Sections (web/src/app/profile/_sections/):
    ├── SecuritySection       → MFACard, PasswordCard, EmailCard, SessionsCard
    ├── AccountSection        → ProfileCard, NotificationsCard
    ├── SubscriptionSection   → PlanCard, BillingCard
    ├── BlockedSection        → blocked user list; fetch + unblock actions
    ├── CategoriesSection     → user category interest scores
    ├── MilestonesSection     → reading milestone tracking
    ├── BookmarksSection      → bookmarked articles (null slug guard: 2026-04-30)
    ├── MessagesSection       → conversation list (soft-fail on load error)
    ├── ActivitySection       → recent article reads (null slug guard: 2026-04-30)
    └── ExpertQueueSection    → (admin/expert role) pending expert submissions
    
    Cards (web/src/app/profile/settings/_cards/):
    ├── MFACard       → TOTP 2FA; listFactors + enrollFactor + challengeAndVerify
    ├── PasswordCard  → updateUser; signOut({ scope: 'others' }) on success
    ├── EmailCard     → updateUser email
    ├── SessionsCard  → listSessions; revoke individual sessions
    ├── ProfileCard   → display name, avatar, bio
    ├── NotificationsCard → email/push preferences
    ├── PlanCard      → current plan display; upgrade CTA
    ├── BillingCard   → billing history
    └── DataCard      → export data; schedule deletion; cancel deletion (loading state: 2026-04-30)
```

---

## Data flows

### User load (ProfileApp)

```
mount
  → Promise.all([
      supabase.from('users').select(...).eq('id', session.user.id).maybeSingle(),
      supabase.from('subscriptions').select(...).eq('user_id', session.user.id).maybeSingle()
    ])
  → if userRes.error: setLoadError(true); setResolved(true); return
  → setUser(userRes.data); setSubscription(subRes.data); setResolved(true)
```

### Banner dismiss (ProfileApp)

```
user clicks dismiss
  → PATCH /api/profile/banner-dismiss
  → if !res.ok: throw (caught → toast.error('Could not dismiss banner.'))
  → if ok: setUser({ ...user, banner_dismissed: true })
```

### Section query pattern (all connected sections)

```
mount / dependency change
  → setLoading(true)
  → supabase query
  → if error: setError(true); setLoading(false); return
  → setData(result); setLoading(false)
render:
  → if loading: <skeleton>
  → if error: <inline error message with retry hint>
  → if empty: <empty state>
  → else: <content>
```

---

## API routes (profile-related)

All under `web/src/app/api/`:

| Route | Method | Purpose |
|---|---|---|
| `/api/profile/banner-dismiss` | PATCH | Mark banner dismissed for session user |
| `/api/profile/block` | POST/DELETE | Block / unblock a user |
| `/api/profile/bookmarks` | GET | Paginated bookmark list |
| `/api/profile/messages` | GET | Conversation list |
| `/api/profile/activity` | GET | Recent reads |
| `/api/profile/milestones` | GET | Milestone data |
| `/api/profile/categories` | GET | Category scores |
| `/api/profile/expert-queue` | GET/POST | Expert submission queue |
| `/api/csp-report` | POST | CSP violation sink (rate-limited 30/min) |

---

## Known gaps (as of 2026-04-30)

- **`/community-guidelines` route doesn't exist.** Removed from `AccountStateBanner` in P-13. If a future session adds this page, the CTA can be re-added.
- **CSP enforce-mode `report-uri` still active.** This will generate a low trickle of legitimate violation reports. The rate limiter handles any bursts. If volume is still non-trivial after a few days, consider removing `report-uri` from the enforce-mode policy as well.
- **`BlockedSection` query error path** now shows a toast via the standard section error pattern. If the query soft-fails (returns empty array instead of error), it silently shows "no blocked users." Worth a future check against the actual RLS policy.

---

## Supabase schema (profile-relevant tables)

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id`, `state`, `role`, `banner_dismissed`, `display_name`, `avatar_url` | `state`: active / suspended / muted / pending / deleted |
| `subscriptions` | `user_id`, `plan`, `status`, `current_period_end` | One row per user; nullable |
| `bookmarks` | `user_id`, `article_id` | Joined to `articles` → `stories` for slug |
| `blocked_users` | `blocker_id`, `blocked_id` | Symmetric; both directions stored |
| `categories` | `id`, `name`, `slug` | Reference table |
| `user_category_scores` | `user_id`, `category_id`, `score` | Computed by pipeline |
| `milestones` | `id`, `name`, `threshold` | Reference table |
| `user_milestones` | `user_id`, `milestone_id`, `achieved_at` | Per-user achievement log |

---

## Toast system

`ToastProvider` mounts once at the `ProfileApp` render root (wraps everything including `AppShell`).

`useToast()` returns `{ show, success, error, info }`. Returns a no-op object if called outside the provider (so isolated dev snapshots don't crash).

Context value is memoized on `[show]`. `show` is stable via `useCallback([])`. Any `useCallback` that lists `toast` as a dependency will not re-run on re-renders.

Auto-dismiss: 4000ms. No manual dismiss UI.
