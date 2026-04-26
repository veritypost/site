# Brand Consistency Sweep — 2026-04-23 (C10 / Wave 2)

Walk-through findings + fixes shipped in the Wave 2 brand-consistency pass.
Every finding either has a fix in this commit or a logged justification for
deferral.

## Scope

User-visible adult surfaces only:

- **Web:** `/`, `/story/[slug]`, `/login`, `/signup`, `/signup/pick-username`,
  `/welcome`, `/verify-email`, `/forgot-password`, `/reset-password`,
  `/profile`, `/profile/[id]`, `/profile/settings`, `/profile/kids`,
  `/u/[username]`, `/leaderboard`, `/bookmarks`, `/notifications`, `/messages`,
  `/help`, `/privacy`, `/terms`, `/about`, `/contact`, error boundaries, 404
- **iOS adult:** `HomeView`, `StoryDetailView`, `ProfileView`, `PublicProfileView`,
  `LeaderboardView`, `BookmarksView`, `MessagesView`, `AlertsView`, `LoginView`,
  `SignupView`, `WelcomeView`, `ResetPasswordView`, `ForgotPasswordView`,
  `VerifyEmailView`, `SettingsView`, `FamilyViews`, `SubscriptionView`,
  `RecapView`, `ExpertQueueView`

Out of scope: admin surfaces (`/admin/**`), kids iOS (intentional emoji surface).

## Method

1. Token-drift grep across `--accent | --bg | --card | --border | --rule | --danger | --wrong | --success | --warn | --amber | --breaking` and iOS `VP.*` equivalents.
2. Inline-hex grep on user-facing paths excluding admin.
3. Plan tier name drift (`Pro+`, `verity_pro`, ad-hoc display labels).
4. Sign in / Sign up / Sign out verbiage drift.
5. Date / number formatting drift.
6. Empty-state, loading-state, error-message tone drift.
7. Emoji scan on adult surfaces (Python regex against pictographic blocks).

## Findings + dispositions

### F1. Danger color drift — text vs banner conflated under one token

**Found:** `--danger` was `#b91c1c` (web canonical, AA-contrast on `#fef2f2`)
but iOS `VP.danger` was `#ef4444` (saturated alert red, fails AA on the same
background). Mixed inline `#ef4444` + `#dc2626` + `#b91c1c` across user-facing
web pages depending on author. The single token couldn't carry both
"error-text" and "BREAKING-banner-fill" semantics safely.

**Fix shipped:** Split the semantic.
- Web `globals.css`: kept `--danger: #b91c1c`; added `--breaking: #ef4444`.
- iOS `Theme.swift`: flipped `VP.danger` + `VP.wrong` to `#b91c1c`; added
  `VP.breaking = #ef4444`.
- BREAKING banner / badge sites swapped to the new token: web `page.tsx`
  (2 sites), web `story/[slug]/page.tsx` (1 site), iOS `HomeView.swift`
  (banner fg + bg), iOS `StoryDetailView.swift` (BREAKING badge).
- Auth pages: `login`, `signup`, `signup/pick-username`, `verify-email`,
  `forgot-password`, `reset-password` — local `C.danger` tokens flipped from
  `#ef4444` / missing → `#b91c1c`. Inline `#dc2626` and `#ef4444` error text
  swapped to `C.danger` references.
- Error boundaries: `profile/error.js`, `story/[slug]/error.js` — inline
  `#ef4444` → canonical `#b91c1c`.
- Inline `#ef4444` for error text on `page.tsx`, `story/[slug]/page.tsx`,
  `profile/[id]/page.tsx` → `var(--danger)`.
- NavWrapper unread-notification dot: `#dc2626` → `var(--danger)`.

**Result:** Two clearly-named semantic tokens. No inline `#ef4444` remains on
any user-facing adult surface for an error/text purpose. BREAKING banners now
read from a single name across both surfaces.

### F2. BREAKING text-case drift

**Found:** Home banners on web + iOS use literal `BREAKING`; story-page badge
on web used literal `Breaking` with `text-transform: uppercase` rendering it
identically but inconsistent in source.

**Fix:** Standardised story-page badge literal to `BREAKING`.

### F3. iOS `StoryDetailView` BREAKING badge used `VP.wrong` (error red)

**Found:** Tied to F1 — the BREAKING badge on the story detail tabbed off
`VP.wrong` (a pure error token) instead of a dedicated BREAKING token,
making the iOS color and the web banner color drift if one was changed.

**Fix:** Swapped to new `VP.breaking`. Now matches web.

### F4. Plan tier name drift — none found

**Found:** Searched for `Pro+`, `Family+`, `verityPro`, etc. Zero hits.
Canonical names (`verity`, `verity_pro`, `verity_family`, `verity_family_xl`)
+ display labels (`Verity`, `Verity Pro`, `Verity Family`, `Verity Family XL`)
are used uniformly. `lib/plans.js` is the single source.

**Disposition:** Closed clean.

### F5. Sign in / Sign up / Sign out — consistent

**Found:** Cap pattern is `Sign in` / `Sign up` / `Sign out` (sentence case)
across both surfaces. No `Login` / `Logout` / `Signin` / `Signup` /
`Sign In` (Title Case) variants on user-visible labels. `Login` / `Logout`
appear only as route paths or comment strings — never user copy.

**Disposition:** Closed clean.

### F6. Emoji on adult surfaces — none found

**Found:** Python regex sweep across `web/src/` and `VerityPost/` against
pictographic Unicode blocks returned zero hits.

**Disposition:** Closed clean.

### F7. Number formatting — consistent

**Found:** Web uses `.toLocaleString()` everywhere stat-related. iOS uses
`.formatted()` (locale-aware). Both produce comma-thousands for en-US.
Already aligned by Wave 1 audit (commit `4b913ff` — shared
`LeaderboardPeriod` helper).

**Disposition:** Closed clean.

### F8. timeAgo string drift (web `2m` vs iOS `2m ago`) — DEFERRED

**Found:** Web `CommentRow.timeAgo()` returns `2m`, iOS `Theme.swift
timeAgo()` returns `2m ago`. Both are valid social conventions; both
ship today. Functional impact zero.

**Disposition:** Logged in `OWNER_QUESTIONS.md` §1.4 for owner pick.

### F9. Empty-state pattern drift — bookmarks / messages — DEFERRED

**Found:** `/bookmarks` and `/messages` re-implement the EmptyState pattern
inline rather than importing the `@/components/admin/EmptyState` component.
Visually identical, but two source of truth.

**Disposition:** Logged in `OWNER_QUESTIONS.md` §1.3 for owner pick.

### F10. Loading-state drift — none found egregious

**Found:** Most pages use `<Spinner />` from `components/admin/Spinner.jsx`
or a local skeleton. Pattern is consistent enough; no visible drift in the
common flow.

**Disposition:** Closed clean.

### F11. Error-message tone — generally consistent

**Found:** Most user-facing error copy is sentence-case + period-terminated
("Sign in failed.", "Failed to load article. Please try again."). A handful
of fragments lack periods (e.g. "Sign in" toast); these are CTA labels not
errors. No drift sweep needed.

**Disposition:** Closed clean.

## Files touched (visual fixes)

- `web/src/app/globals.css` — added `--breaking`
- `web/src/app/login/page.tsx` — `C.danger` token
- `web/src/app/signup/page.tsx` — `C.danger` token + 2 inline → token
- `web/src/app/signup/pick-username/page.tsx` — `C.danger` token + inline → token
- `web/src/app/verify-email/page.tsx` — `C.danger` token + inline → token
- `web/src/app/forgot-password/page.tsx` — added `C.danger` + inline → token
- `web/src/app/reset-password/page.tsx` — added `C.danger` + 3 inline → token
- `web/src/app/page.tsx` — 3 inline → tokens (1× `var(--danger)`, 2× `var(--breaking)`)
- `web/src/app/story/[slug]/page.tsx` — 2 inline → tokens (1× `var(--danger)`, 1× `var(--breaking)`); BREAKING text-case
- `web/src/app/profile/error.js` — inline ef4444 → b91c1c
- `web/src/app/profile/[id]/page.tsx` — inline → `var(--danger)`
- `web/src/app/story/[slug]/error.js` — inline ef4444 → b91c1c
- `web/src/app/NavWrapper.tsx` — notification dot → `var(--danger)`
- `VerityPost/VerityPost/Theme.swift` — `VP.danger` / `VP.wrong` flipped to `#b91c1c`; added `VP.breaking`
- `VerityPost/VerityPost/HomeView.swift` — BREAKING fg + bg → `VP.breaking`
- `VerityPost/VerityPost/StoryDetailView.swift` — BREAKING badge → `VP.breaking`

## Verification

- `cd web && npx tsc --noEmit` — clean for this stream's changes (only the
  pre-existing 4 errors in `.next/` cache referencing two route files
  deleted in another session — not a Wave 2 regression).
- `cd web && npm run lint` — clean for this stream's changes (warnings are
  all pre-existing).
- `xcodebuild ... -scheme VerityPost ... build` — `** BUILD SUCCEEDED **`.

## Not committed

Per task spec: edits applied, **not committed**. Owner reviews + the closing
pass commits the bundle alongside the orphan-table SQL drop.
