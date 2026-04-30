# Phase 5 — Implementation Plan

**Status:** locked  
**Produced:** 2026-04-30 (Session 5)  
**Agent pattern:** Investigator → Planner → Big-picture Reviewer + Adversary (parallel) → resolution pass  
**Next phase:** Phase 6 — Web implementation; Phase 7 — iOS + kids implementation

---

## 4-agent review summary

| Agent | Verdict | Key findings |
|---|---|---|
| Investigator | — | Q8 renderer verdict: **two-part task confirmed** (renderer ignores flags). Exact current state quoted for all 12 decisions. |
| Planner | — | Full change list produced. Two new files (Q4 route, Q8B card). One new iOS struct (Q9). |
| Big-picture Reviewer | APPROVE WITH NOTES | Q1 missing kids iOS statement. Q3 language ambiguity. Q10 narrative backwards (investigator said "name string" but code stores UUID). Ordering confirmed correct. |
| Adversary | APPROVE WITH FIXES | **3 issues:** Q1 has no mechanism to distinguish free vs. pro for 30-day cap (profile.activity will be true for all after unlock). Q10 needs explicit dropdown onChange spec. Q4 has pre-existing web/iOS permission key mismatch. |

**All issues resolved in this plan before writing to disk** (see resolution notes inline at each decision).

---

## Ship order

Changes within a wave can be parallelized. Cross-wave dependencies are hard blockers.

| Wave | Items | Dependency |
|---|---|---|
| **1 — subcategory pipeline (prerequisite)** | Q10 | None. Must land in production before Q11 or Q12 show real data. |
| **2 — independent fixes** | Q6, Q2, Q3 | None. Safe to ship in any order. |
| **3 — data surface expansions** | Q1, Q4, Q7 | Q1 requires the DB migration for `profile.activity.full_history` to ship first within wave. |
| **4 — feed renderer (strictly sequential)** | Q8A then Q8B | Q8B cannot ship until Q8A is verified in production. |
| **5 — browse + analytics rebuild** | Q11, Q12 | Q10 (Wave 1) must be in production. Q12 acceptable with zero subcategory metrics until Q10 ships. |
| **6 — iOS expert profile** | Q9 | None. Self-contained. |

---

## Q1 — Unlock activity / categories / milestones / bookmarks for free users

**Decisions:** Achievements/categories/bookmarks = free for all signed-in users. Activity = 30 days free / full history pro.  
**Design constraint (owner-locked):** Show data. No gamification. No pressure copy. No streak banners. No "N away from next milestone." The features are ambient data — visible if you look, never demanding attention.

### Adversary resolution — free vs. pro distinction

After Q1 removes the UI locks, `profile.activity` is in the `free` permission set (DB already correct). Every signed-in user has it. This means `perms.activity` becomes `true` for all users — it can no longer distinguish free from pro for the 30-day cap. **A new permission key is required.**

**Solution:** Add `profile.activity.full_history` to the database. Free users hold `profile.activity` only (30-day view). Pro/expert/admin/editor/moderator/family users hold both keys (full history). This requires a DB migration as the first step in Wave 3.

---

### `supabase/migrations/` — new migration (Q1, prerequisite for Wave 3)

**Decision:** Q1  
**Current:** No `profile.activity.full_history` key exists in the `permissions` table.  
**Change:** Create a new migration that:
1. Inserts `profile.activity.full_history` into the `permissions` table with description `'Full reading history (all time)'`.
2. Assigns it via `permission_set_perms` to these sets: `pro`, `expert`, `admin`, `editor`, `moderator`, `family`.  
   (Free set does NOT get this key — free users get 30-day view only.)

```sql
-- insert the key
INSERT INTO permissions (key, description)
VALUES ('profile.activity.full_history', 'Full reading history (all time)')
ON CONFLICT (key) DO NOTHING;

-- assign to pro, expert, admin, editor, moderator, family sets
-- (look up set IDs from permission_sets table at migration time)
INSERT INTO permission_set_perms (permission_set_id, permission_key)
SELECT ps.id, 'profile.activity.full_history'
FROM permission_sets ps
WHERE ps.name IN ('pro', 'expert', 'admin', 'editor', 'moderator', 'family')
ON CONFLICT DO NOTHING;
```

**Web:** In scope — this migration backs the web `isPro` flag for ActivitySection.  
**iOS:** In scope — this migration backs the iOS `canViewActivityFullHistory` check in ProfileView.swift.  
**Kids iOS:** Not applicable. Kids accounts use a separate permission model via VerityPostKids; they do not participate in adult activity permission sets.

---

### `web/src/app/profile/_components/ProfileApp.tsx`

**Decision:** Q1  
**Current (section definitions, lines ~276, 298, 308):**
```typescript
{ id: 'bookmarks', locked: !perms.bookmarksList, render: () => <BookmarksSection preview={false} /> },
{ id: 'categories', locked: !perms.categories, render: () => <CategoriesSectionConnected authUserId={authUserId} /> },
{ id: 'milestones', locked: !perms.milestones, render: () => <MilestonesSectionConnected authUserId={authUserId} user={user} /> },
```
**Current (perms useMemo, lines ~165–182):**
```typescript
activity: hasPermission('profile.activity'),
categories: hasPermission('profile.categories'),
milestones: hasPermission('profile.achievements'),
bookmarksList: hasPermission('bookmarks.list.view'),
```
**Current (activity render call):**
```typescript
render: () => <ActivitySection authUserId={authUserId} preview={false} perms={{ activity: perms.activity }} />
```

**Change:**
1. Remove `locked:` from the `bookmarks`, `categories`, and `milestones` section entries. These three sections now mount unconditionally for all authenticated users.
2. Add `activityFullHistory: hasPermission('profile.activity.full_history')` to the perms useMemo.
3. Update the activity render call to pass the new flag:
   ```typescript
   render: () => <ActivitySection authUserId={authUserId} preview={false} perms={{ activity: perms.activity }} isPro={perms.activityFullHistory} />
   ```
4. Do NOT remove `perms.bookmarksList`, `perms.categories`, or `perms.milestones` from the perms useMemo — Q12 will use `perms.categories` for the progressive-unlock logic inside `CategoriesSectionConnected`.

**Web:** In scope.  
**iOS:** Not applicable to this file (iOS handled in ProfileView.swift below).  
**Kids iOS:** Not applicable. VerityPostKids has its own ProfileView.swift separate from this component.

---

### `web/src/app/profile/_sections/ActivitySection.tsx`

**Decision:** Q1  
**Current gate (lines ~90–106):**
```typescript
if (!perms.activity) {
  return (
    <EmptyState
      title="Activity is part of premium"
      body="Upgrade your plan to see a full timeline of your reads, comments, and bookmarks."
      cta={{ label: 'See plans', href: '/profile?section=plan' }}
      variant="full"
    />
  );
}
```
The reading_log fetch has no date filter; the component fetches all history (limit 100).

**Change:**
1. Add `isPro: boolean` to the `Props` interface (alongside existing `perms: { activity: boolean }`).
2. Remove the `if (!perms.activity)` gate block entirely. The section mounts for all signed-in users.
3. Remove the corresponding `useEffect` guard `if (!perms.activity) { setLoading(false); return; }`.
4. In the `load` function, add a 30-day date filter when `isPro === false`:
   ```typescript
   const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
   // Apply to reading_log, comments, and bookmarks fetches when !isPro:
   .gte('created_at', thirtyDaysAgo)  // add after .eq() chains, before .order()
   ```
   When `isPro === true`, no date filter (full history, existing behavior).
5. For free users only (`!isPro`): render a single plain line at the top of the activity list — `<p style={{ fontSize: F.xs, color: C.inkMuted }}>Showing your last 30 days.</p>` — with no CTA, no upsell link, no upgrade prompt of any kind.
6. Empty state for a user with zero reads (new user): current empty state can remain (shows "No activity yet") — do NOT add a "start reading" CTA or gamification prompt.

**Web:** In scope.  
**iOS:** Not applicable to this file.  
**Kids iOS:** Not applicable. Kids iOS has no adult reading activity surface.

---

### `VerityPost/VerityPost/ProfileView.swift`

**Decision:** Q1  
**Current (permission checks in `.task(id: perms.changeToken)` block, lines ~195–214):**
```swift
canViewActivity = await PermissionService.shared.has("profile.activity")
canViewCategories = await PermissionService.shared.has("profile.categories")
canViewAchievements = await PermissionService.shared.has("profile.achievements")
canViewBookmarks = await PermissionService.shared.has("bookmarks.list.view")
```
**Current (tab dispatch, lines ~919–921):**
```swift
case .activity:   if canViewActivity { activityTab } else { lockedTabView() }
case .categories: if canViewCategories { categoriesTab } else { lockedTabView() }
case .milestones: if canViewAchievements { milestonesTab(user) } else { lockedTabView() }
```
**Current (bookmarks guards):**
```swift
if canViewBookmarks { NavigationLink { BookmarksView() } ... }
if canViewBookmarks { quickLink(label: "Bookmarks", ...) }
```
**Current (loadTabData guards):**
```swift
case .activity where !activityLoaded && canViewActivity:
case .categories where !categoriesLoaded && canViewCategories:
if tab == .milestones && !achievementsLoaded && canViewAchievements { ... }
```

**Change (5-part):**

1. **Add new permission check** in the `.task(id: perms.changeToken)` block, after the existing `canViewActivity` line:
   ```swift
   canViewActivityFullHistory = await PermissionService.shared.has("profile.activity.full_history")
   ```
   Add `@State private var canViewActivityFullHistory = false` to the `@State` declarations.

2. **Tab dispatch** — remove `else { lockedTabView() }` from all three cases. All three tabs mount unconditionally:
   ```swift
   case .activity:   activityTab
   case .categories: categoriesTab
   case .milestones: milestonesTab(user)
   ```
   If `lockedTabView()` has no remaining call sites after this change, delete the private function.

3. **Bookmarks guards** — remove both `if canViewBookmarks { ... }` conditionals. `BookmarksView` navigation and the overview quickLink are always shown to authenticated users.

4. **loadTabData guards** — drop the `&& canViewActivity`, `&& canViewCategories`, and `&& canViewAchievements` conditions. Data loading fires unconditionally when a tab is selected:
   ```swift
   case .activity where !activityLoaded:
   case .categories where !categoriesLoaded:
   if tab == .milestones && !achievementsLoaded { ... }
   ```

5. **30-day cap in `loadActivity`** — pass `canViewActivityFullHistory: Bool` into `loadActivity`. When `false`, add `.gte("created_at", value: thirtyDaysAgoISO)` to the `reading_log`, `quiz_attempts`, and `comments` fetches (where `thirtyDaysAgoISO` is an ISO-8601 string computed as `Date().addingTimeInterval(-30*24*3600)`). In `activityTab`, for free users show `Text("Showing last 30 days.").font(.caption).foregroundColor(VP.dim)` at the top of the list. No CTA. No upgrade copy.

**Web:** Not applicable to this file.  
**iOS:** In scope.  
**Kids iOS:** Not applicable. VerityPostKids is a separate Xcode target with its own ProfileView.swift; kids accounts do not participate in adult permission sets.

---

## Q2 — Remove iOS account-settings permission gates

**Decision:** Account management is a legal/security obligation, not a tier feature. Every signed-in user already holds all 5 keys via the `free` set. The gates are dead code.

### `VerityPost/VerityPost/SettingsView.swift`

**Decision:** Q2  
**Current (inside `loadPerms()`, lines ~1165–1173):**
```swift
canEditProfile = await PermissionService.shared.has("settings.view")
canEditEmail = await PermissionService.shared.has("settings.account.edit_email")
canChangePassword = await PermissionService.shared.has("settings.account.change_password")
canViewMFA = await PermissionService.shared.has("settings.account.2fa.enable")
// ...
canViewDataPrivacy = await PermissionService.shared.has("settings.data.request_export")
```
These 5 booleans gate the Profile row, Email row, Password row, MFA row, and Data & Privacy row in the settings hub.

**Change:** Replace the 5 `PermissionService.shared.has()` calls with unconditional `true` assignments:
```swift
canEditProfile = true
canEditEmail = true
canChangePassword = true
canViewMFA = true
canViewDataPrivacy = true
```
Do NOT change or remove `canViewLoginActivity` (line ~1169) — that permission is not part of Q2. Do NOT remove the `@State` declarations for the 5 booleans; they are still referenced in the hub view builders.

**Web:** Not applicable. Web settings pages render account-settings sections unconditionally (no permission gate); already correct.  
**iOS:** In scope.  
**Kids iOS:** Not applicable. VerityPostKids has a separate SettingsView without account-settings rows.

---

## Q3 — Move BlockedSection from profile rail to Settings/Privacy

**Decision:** Blocking is privacy management, not profile content. The always-on profile rail fetch adds noise for users who have never blocked anyone (the vast majority).

### `web/src/app/profile/_components/ProfileApp.tsx`

**Decision:** Q3  
**Current (lines ~413–420, inside the "Settings" group of the sections array):**
```typescript
{
  id: 'blocked',
  glyph: '⊝',
  group: 'Settings',
  title: 'Blocked users',
  reason: 'People you\'ve hidden from your feed and inbox.',
  keywords: ['block', 'mute', 'hide'],
  render: () => <BlockedSection preview={false} />,
},
```

**Change:** Remove the entire `blocked` section entry from the sections array. Remove the `BlockedSection` import at the top of ProfileApp.tsx if it has no other call sites in this file. The "Blocked users" rail link disappears from the profile nav.

**Web:** In scope.  
**iOS:** Not applicable. iOS already hosts blocked accounts in Settings → Privacy via `BlockedAccountsView` in the `privacyRows` computed var in SettingsView.swift. No change.  
**Kids iOS:** Not applicable. Kids iOS has no blocking feature.

---

### `web/src/app/profile/_sections/PrivacySection.tsx`

**Decision:** Q3  
**Current:** `PrivacySection` is a `'use client'` component that renders `<PrivacyCard user={user} preview={preview} />` as its sole child.  
**Current structure:**
```typescript
export function PrivacySection({ user, preview }: Props) {
  return <PrivacyCard user={user} preview={preview} />;
}
```

**Change:** Import `BlockedSection` from `'../BlockedSection'`. Add it as a **sibling** to `<PrivacyCard>` (not nested inside it), wrapped in a `<div>` container:
```typescript
export function PrivacySection({ user, preview }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <PrivacyCard user={user} preview={preview} />
      <BlockedSection preview={preview} />
    </div>
  );
}
```
`BlockedSection` is already a `'use client'` component with its own internal `useEffect`-based load. No Suspense boundary is needed — the component handles its own loading state. Since `PrivacySection` is already a client component, this addition is safe and straightforward.

**Lazy load:** `BlockedSection` fetches on mount only when the user navigates to the Privacy section in the profile rail. This satisfies the Q3 requirement for lazy loading — the fetch does not happen unless Privacy is selected.

**Web:** In scope.  
**iOS:** Not applicable.  
**Kids iOS:** Not applicable.

---

## Q4 — Add login audit log to web

**Decision:** `get_own_login_activity` RPC exists. Zero backend work. Security-conscious web users want to know when and where their account was accessed.

### Adversary resolution — permission key

Pre-existing mismatch: web sessions route uses `'settings.account.login_activity.view'`; iOS uses `'settings.login_activity.view'`. This plan standardizes the new web route on `'settings.account.login_activity.view'` (matching the existing sessions-adjacent pattern). The iOS key mismatch (`'settings.login_activity.view'`) is a pre-existing bug separate from Q4 and must be fixed in a future iOS session; it does not block Q4 web implementation.

---

### `web/src/app/api/account/login-activity/route.ts` (NEW FILE)

**Decision:** Q4  
**Current:** No such file exists. `get_own_login_activity` RPC exists in `web/src/types/database.ts` with signature: `Args: { p_limit?: number }`, returns `{ action: string; created_at: string; id: string; metadata: Json }[]`.

**Change:** Create this GET route:
```typescript
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/server';

export async function GET() {
  const permCheck = await requirePermission('settings.account.login_activity.view');
  if (permCheck) return permCheck; // returns 401/403 response

  const supabase = createRouteHandlerClient();
  const { data, error } = await supabase.rpc('get_own_login_activity', { p_limit: 50 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}
```
Pattern matches the existing `/api/account/sessions` route. Use the same `createRouteHandlerClient` and `requirePermission` imports as that route.

**Web:** In scope.  
**iOS:** Not applicable. iOS calls `get_own_login_activity` directly via the Swift Supabase client in `LoginActivityView` (SettingsView.swift). No change to iOS.  
**Kids iOS:** Not applicable.

---

### `web/src/app/profile/_sections/SessionsSection.tsx`

**Decision:** Q4  
**Current:** Component ends after the active sessions `<Card>` and a `<ConfirmDialog>` (line ~213). No audit log. The pattern: `useState`, `useCallback` load, `useEffect` → render `<Card title="Active sessions">` with revoke buttons.

**Change:** Add a new `LoginAuditLog` component below the existing `SessionsSection` export in the same file. Render it below the sessions Card in `SessionsSection`'s return:

```typescript
// New component at bottom of file
function LoginAuditLog() {
  const [entries, setEntries] = useState<LoginEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/account/login-activity')
      .then(r => r.json())
      .then(d => { setEntries(d.entries ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <Card title="Recent sign-in activity" description="The last 50 logins to your account.">
      {loading ? <SkeletonBlock height={80} /> : entries.length === 0 ? (
        <p style={{ color: C.inkMuted, fontSize: F.sm }}>No sign-in history recorded yet.</p>
      ) : (
        <ul>
          {entries.map(e => (
            <li key={e.id} style={{ padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 500 }}>{e.action}</span>
              <span style={{ color: C.inkMuted, fontSize: F.xs, marginLeft: S[2] }}>
                {formatRelative(e.created_at)} · {(e.metadata as Record<string, string>)?.ip ?? ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

In `SessionsSection`'s return, wrap the existing content and the new component:
```typescript
return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
    <>
      {/* existing sessions Card + ConfirmDialog */}
    </>
    <LoginAuditLog />
  </div>
);
```

The `LoginEntry` type: `{ id: string; action: string; created_at: string; metadata: Record<string, unknown> }`. All fields are display-only. No action buttons on the audit log.

**Web:** In scope.  
**iOS:** Not applicable. iOS already has `LoginActivityView` (read-only audit log) in SettingsView.swift — correct and unchanged.  
**Kids iOS:** Not applicable.

---

## Q5 — CLOSED (mooted by Q1)

Q1 unlocks `profile.activity` and `profile.achievements` for all free users. The iOS Overview tab previews (E9 activity, E10 achievements) are no longer previews of locked content. No action.

**Web:** Not applicable.  
**iOS:** Not applicable (gate removals from Q1 cover this automatically).  
**Kids iOS:** Not applicable.

---

## Q6 — Fix iOS card share key

**Decision:** `"profile.card.share_link"` exists in only 3 permission sets (admin, free, owner). `"profile.card_share"` exists in all 8 non-anon sets. Expert, editor, family, moderator, and pro users cannot see the share button on iOS. This is a bug.

### `VerityPost/VerityPost/ProfileView.swift`

**Decision:** Q6  
**Current (line ~196):**
```swift
canShareProfileCard = await PermissionService.shared.has("profile.card.share_link")
```

**Change:** Replace the string literal:
```swift
canShareProfileCard = await PermissionService.shared.has("profile.card_share")
```
One string literal change. Verify there are no other occurrences of `"profile.card.share_link"` in the file after making this change.

**Web:** Not applicable. Web ProfileApp.tsx already uses `'profile.card_share'` — already correct.  
**iOS:** In scope.  
**Kids iOS:** Not applicable. Kids iOS does not have a profile card share feature.

---

## Q7 — Add 30-day reading heatmap to web

**Decision:** New component at top of ActivitySection. Neutral data display only. No pressure copy whatsoever — no "keep your streak alive," no "you're N days in," no milestone callouts.

### `web/src/app/profile/_sections/ActivitySection.tsx`

**Decision:** Q7  
**Current:** No `ReadingHeatmap` component exists. The reading_log fetch returns up to 100 rows ordered desc — no date filter. No streak data is fetched (streak columns live on the `users` table, not `reading_log`).

**Change (4 additions to this file):**

**1. New state variables:**
```typescript
const [streakCurrent, setStreakCurrent] = useState(0);
const [streakBest, setStreakBest] = useState(0);
```

**2. Extend the `load` function** — add a fourth parallel fetch for streak data:
```typescript
const [r, c, b, streakRes] = await Promise.all([
  supabase.from('reading_log').select('id, created_at, completed, article_id, articles(title, stories(slug))').eq('user_id', authUserId).is('kid_profile_id', null).order('created_at', { ascending: false }).limit(100),
  supabase.from('comments').select(...),
  supabase.from('bookmarks').select(...),
  supabase.from('users').select('streak_current, streak_best').eq('id', authUserId).maybeSingle(),
]);
if (streakRes.data) {
  setStreakCurrent(streakRes.data.streak_current ?? 0);
  setStreakBest(streakRes.data.streak_best ?? 0);
}
```
Note: `users` table RLS allows a user to read their own row — confirmed by existing streak usage in NavWrapper.tsx and leaderboard pages.

**3. New `readDaySet` memo** (after the `reads` state is set):
```typescript
const readDaySet = useMemo(
  () => new Set(reads.filter(r => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return new Date(r.created_at) >= thirtyDaysAgo;
  }).map(r => r.created_at.slice(0, 10))),
  [reads]
);
```
This always shows the 30-day heatmap regardless of whether the user is free or pro (pro users may have more than 30 days of reads loaded, but the heatmap is always a 30-day window).

**4. New `ReadingHeatmap` component** (add below `ActivitySection` export):
```typescript
function ReadingHeatmap({ readDays, streakCurrent, streakBest }: {
  readDays: Set<string>;
  streakCurrent: number;
  streakBest: number;
}) {
  const days = useMemo(() => {
    const result: { date: string; read: boolean }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, read: readDays.has(key) });
    }
    return result;
  }, [readDays]);

  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(30, 1fr)', gap: 3 }}>
        {days.map(({ date, read }) => (
          <div
            key={date}
            title={date}
            style={{
              aspectRatio: '1',
              borderRadius: 2,
              background: read ? C.brand : C.surfaceSunken,
              border: `1px solid ${C.border}`,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: S[4], marginTop: S[2], fontSize: F.xs, color: C.inkMuted }}>
        <span>Current streak · {streakCurrent} {streakCurrent === 1 ? 'day' : 'days'}</span>
        <span>Best · {streakBest} {streakBest === 1 ? 'day' : 'days'}</span>
      </div>
    </div>
  );
}
```
Design notes: binary read/not-read coloring (no gradient). No tooltip beyond the date in `title`. No label copy about streaks being good or worth maintaining. Streak counts are stated as plain facts.

**5. Render `ReadingHeatmap`** above the filter buttons row in `ActivitySection`'s return:
```typescript
<ReadingHeatmap readDays={readDaySet} streakCurrent={streakCurrent} streakBest={streakBest} />
{/* existing filter buttons row */}
```
The heatmap renders even when `reads.length === 0` (an empty grid is correct — the user has no reads in the last 30 days).

**Web:** In scope.  
**iOS:** Not applicable. iOS ProfileView.swift already has `streakStrip()` with a 30-day heatmap grid and streak counts. No change.  
**Kids iOS:** Not applicable. Kids iOS has its own streak display in KidsProfileView.swift; not in scope here.

---

## Q8 — Feed preferences (two-part, strictly sequential)

**Decision:** Conditional on renderer verification. **Verdict:** Two-part task confirmed — renderer ignores flags. Part A (wire renderer) must ship and be verified in production before Part B (ship the card).

---

## Q8 Part A — Wire feed flags into home renderer

### `web/src/app/page.tsx`

**Decision:** Q8 Part A  
**Current:** Server component (`async function HomePage()`). Uses `export const dynamic = 'force-dynamic'`. Has an existing `Promise.all` fetching articles, breaking stories, categories, read log, and top stories. Does **not** fetch `users.metadata` and does **not** read `showBreaking`, `showTrending`, `showRecommended`, `hideLowCred`, or `display` flags anywhere.

**Change (3 parts):**

**1. Add metadata fetch to `Promise.all`:**
```typescript
const metadataPromise = (async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', user.id)
    .maybeSingle();
  return (data?.metadata as { feed?: Record<string, unknown> } | null)?.feed ?? null;
})();

[storiesRes, breakingRes, catsRes, readLogRes, topStoriesRes, feedFlags] = await Promise.all([
  /* existing fetches */,
  metadataPromise,
]);
```

**2. Extend `SELECT_COLS`** to include `credibility_score` (needed for `hideLowCred` flag):
```typescript
const SELECT_COLS = 'id, title, stories(slug, lifecycle_status), excerpt, category_id, subcategory_id, credibility_score, is_breaking, is_developing, published_at';
```

**3. Apply flags before render:**
```typescript
// Breaking section
const showBreaking = (feedFlags as { showBreaking?: boolean } | null)?.showBreaking !== false;
const breakingStory = showBreaking ? breakingRes?.data?.[0] ?? null : null;

// Low-credibility filter
const hideLowCred = (feedFlags as { hideLowCred?: boolean } | null)?.hideLowCred === true;
const CRED_THRESHOLD = 0.4;
let displayedStories = storiesRes?.data ?? [];
if (hideLowCred) {
  displayedStories = displayedStories.filter(s => (s.credibility_score ?? 1) >= CRED_THRESHOLD);
}

// Compact layout
const compact = (feedFlags as { display?: string } | null)?.display === 'compact';
```

Pass `compact` as a prop to the `<Hero>` and `<SupportingCard>` components. If those components do not currently accept a `compact` prop, the implementer must add `compact?: boolean` to their prop types and apply a smaller `fontSize`/tighter `padding` when `compact` is `true`. This is a minor presentational change — the prop does not affect server/client boundary.

For `showTrending` and `showRecommended`: no trending or recommended section currently exists on the home page. Wire these flags with no-op guards and a comment so future sections respect them:
```typescript
// Q8: showTrending wired — no trending section exists yet
const showTrending = (feedFlags as { showTrending?: boolean } | null)?.showTrending !== false;
// Q8: showRecommended wired — no recommended section exists yet
const showRecommended = (feedFlags as { showRecommended?: boolean } | null)?.showRecommended !== false;
```

If user is anonymous or the metadata fetch fails, `feedFlags` is `null`; all flags default to permissive values.

**Web:** In scope.  
**iOS:** Not applicable. iOS has `FeedPreferencesSettingsView` — already ships and saves to `users.metadata.feed`. The iOS home feed renderer (HomeView.swift) flag-application is a separate audit not in Q8's scope.  
**Kids iOS:** Not applicable. Kids home feed is scoped to kids-safe articles only; adult feed preference flags are not used.

---

## Q8 Part B — FeedPreferencesCard — DEPENDENCY: Q8A must be verified in production

### `web/src/app/profile/settings/_cards/FeedPreferencesCard.tsx` (NEW FILE)

**Decision:** Q8 Part B  
**Current:** No such file exists.

**Change:** Create a `'use client'` component with 5 toggles mirroring iOS `FeedPreferencesSettingsView`:

| Toggle | metadata.feed key | Default | Label |
|---|---|---|---|
| Show breaking at top | `showBreaking` | true | "Show breaking stories at top" |
| Show trending | `showTrending` | true | "Show trending stories" |
| Show recommended | `showRecommended` | true | "Show recommended stories" |
| Hide low-credibility | `hideLowCred` | false | "Hide low-credibility stories" |
| Compact layout | `display` (value: `'compact'`/`'standard'`) | standard | "Compact layout" |

Load: `supabase.from('users').select('metadata').eq('id', authUserId).maybeSingle()` → read `data.metadata?.feed`.  
Save: `supabase.rpc('update_own_profile', { p_fields: { metadata: merged } })` where `merged` replaces `metadata.feed` with the new values.  
Pattern matches the existing settings cards (PrivacyCard, DataCard) for loading/saving/error/toast.

**Web:** In scope.  
**iOS:** Not applicable. iOS already has `FeedPreferencesSettingsView`.  
**Kids iOS:** Not applicable.

---

### `web/src/app/profile/_components/ProfileApp.tsx` (Q8B addition)

**Decision:** Q8 Part B  
**Current:** No `feed` section entry in the sections array.

**Change:** Add a new section entry to the "Settings" group, between `notifications` and `privacy` entries:
```typescript
{
  id: 'feed',
  glyph: '◫',
  group: 'Settings',
  title: 'Feed preferences',
  reason: 'Control what appears on your home feed and how it displays.',
  keywords: ['feed', 'home', 'trending', 'breaking', 'recommended', 'compact', 'display'],
  render: () => <FeedPreferencesCard authUserId={authUserId} preview={false} />,
},
```
Add import: `import { FeedPreferencesCard } from '../settings/_cards/FeedPreferencesCard'`.

**Web:** In scope.  
**iOS:** Not applicable. iOS exposes this via `FeedPreferencesSettingsView` in the Preferences section.  
**Kids iOS:** Not applicable.

---

## Q9 — Build ExpertProfileView on iOS

**Decision:** Fill the empty `// MARK: - Expert settings (role=expert)` section in SettingsView.swift. 4 operations. All API endpoints exist — zero new backend work.

### `VerityPost/VerityPost/SettingsView.swift`

**Decision:** Q9  
**Current (lines ~2579–2582):**
```swift
// MARK: - Expert settings (role=expert)
[completely empty]
// MARK: - Data & Privacy
```
`expertRows` (lines ~1081–1103) uses `HubRowSpec` pattern consistently. Currently only has "Verification application" and "Apply to be an expert" rows. State vars `is_expert: Bool` and `expertStatus: String` exist.

**Change:** Build a new `ExpertProfileView` struct between the MARK comments. Add a new `HubRowSpec` to `expertRows` that pushes `ExpertProfileView` when `is_expert == true` OR `expertStatus == "pending"`.

**`ExpertProfileView` struct — 4 sections (priority order):**

**Section 1 — Vacation toggle (highest priority)**
```swift
@State private var vacationUntil: Date? = nil

// Toggle row
SettingsToggleRow(
  label: "On vacation",
  subtitle: vacationUntil != nil ? "Returns \(formatted(vacationUntil!))" : "Pauses your expert assignment queue for 14 days",
  isOn: $isOnVacation
)
.onChange(of: isOnVacation) { _, newVal in
  Task { await toggleVacation(newVal) }
}

// toggleVacation():
func toggleVacation(_ on: Bool) async {
  let until = on ? ISO8601DateFormatter().string(from: Date().addingTimeInterval(14*24*3600)) : nil
  await api.post("/api/expert/vacation", body: ["vacation_until": until])
}
```

**Section 2 — Credentials editor (highest priority)**
```swift
@State private var credentials: String = ""

TextEditor(text: $credentials)
  .frame(minHeight: 100)
  .onChange(of: credentials) { _, val in
    if val.count > 600 { credentials = String(val.prefix(600)) }
  }
Button("Save credentials") {
  Task { await saveCredentials() }
}

// saveCredentials():
// PATCH /api/expert/apply with { credentials: credentials.trimmingCharacters(in: .whitespaces) }
```

**Section 3 — Application status display**
Status from `expert_applications.status`. Four states mapped to label + color:
- `approved` → "Verified expert" / `VP.success`
- `pending` → "Under review" / `VP.brand`
- `rejected` → "Not approved" / `VP.error` + rejection reason text below
- `revoked` → "Revoked" / `VP.error`

**Section 4 — Verified areas display (read-only)**
Load from `expert_application_categories` joined to `categories(id, name)`. Render as a flow of pill-shaped `Text` views. No edit controls.

**Load function:** `load()` async — fetches `expert_applications` (latest, by `user_id`) and `expert_application_categories` (by `application_id`). Sets `credentials`, `vacationUntil`, `status`, `areas`.

**`expertRows` addition:**
```swift
if is_expert || expertStatus == "pending" {
  out.append(HubRowSpec(
    label: "Expert profile",
    icon: "star.fill",
    destination: AnyView(ExpertProfileView().environmentObject(auth))
  ))
}
```

**Web:** Not applicable. Web has `ExpertProfileSection.tsx` — already fully implemented.  
**iOS:** In scope.  
**Kids iOS:** Not applicable. Kids iOS has no expert profile concept.

---

## Q10 — Wire subcategory_id into article save payload

**DEPENDENCY NOTE:** Q12 will show zero subcategory metrics until Q10 ships to production. This is an acceptable transient state. QA must verify the locked/zero state in CategoriesSection renders correctly before Q10 ships.

### Adversary resolution — dropdown onChange

Verified: `story.subcategory` already holds the UUID (not the name). The load code at StoryEditor.tsx line ~389 sets `subcategory: row.subcategory_id || ''`. The subcategory dropdown's `onChange` updates `story.subcategory` with the UUID value from the selected `<option>`. No two-field update is needed. The save fix is simply: add `subcategory_id: story.subcategory || null` to the payload.

---

### `web/src/components/article/StoryEditor.tsx`

**Decision:** Q10  
**Current (save payload, lines ~744–755):**
```typescript
article: {
  title: drivingTitle,
  slug,
  excerpt: drivingSummary,
  body: drivingBody,
  status: effective.status,
  category_id: categoryId,
  is_breaking: effective.is_breaking || false,
  is_developing: effective.is_developing || false,
  hero_pick_for_date: effective.hero_pick_for_date,
  published_at: publishedAtIso,
  // subcategory_id is ABSENT
},
```
`story.subcategory` (the UUID) is in component state but never sent.

**Change:** Add one line to the `article` object:
```typescript
subcategory_id: story.subcategory || null,
```
Add after `category_id`. No other changes to this file.

**Web:** In scope.  
**iOS:** Not applicable. Article creation/editing is admin/web only.  
**Kids iOS:** Not applicable (addressed in KidsStoryEditor separately).

---

### `web/src/components/article/KidsStoryEditor.tsx`

**Decision:** Q10  
**Current:** Same pattern as StoryEditor — `story.subcategory` holds the UUID (set from `row.subcategory_id` in the load), but the save payload at lines ~503–513 does not include `subcategory_id`.

**Change:** Add `subcategory_id: story.subcategory || null` to the `article` object in the save payload. Same single-line addition as StoryEditor.

**Web:** In scope. (KidsStoryEditor is a web admin tool for authoring kids content.)  
**iOS:** Not applicable.  
**Kids iOS:** Not applicable. Kids iOS consumes articles authored via this editor; it does not author them.

---

### `web/src/app/api/admin/articles/save/route.ts`

**Decision:** Q10  
**Current:** `type ArticleFields = Record<string, unknown>`. The `subcategory_id` field in `body.article` will pass through to the DB upsert without any type error (because `Record<string, unknown>` accepts it), but there is no compile-time guarantee.

**Change:** Replace `type ArticleFields = Record<string, unknown>` with an explicit type that includes `subcategory_id?: string | null`. Add the field alongside `category_id` in the type definition:
```typescript
type ArticleFields = {
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: string;
  status?: string;
  category_id?: string | null;
  subcategory_id?: string | null;   // added for Q10
  is_breaking?: boolean;
  is_developing?: boolean;
  is_kids_safe?: boolean;
  kids_summary?: string;
  age_band?: string;
  hero_pick_for_date?: string | null;
  published_at?: string | null;
  [key: string]: unknown; // preserve passthrough for other fields
};
```

**Web:** In scope.  
**iOS:** Not applicable.  
**Kids iOS:** Not applicable.

---

## Q11 — Add subcategory filter bar to category browse pages

**Decision:** When a category has active subcategories, show a filter bar below the category header. Default = all articles. If no subcategories, no filter bar appears.

### `web/src/app/category/[id]/page.js`

**Decision:** Q11  
**Current (lines ~58–63):**
```javascript
const { data: storiesData } = await supabase
  .from('articles')
  .select('*, stories(slug)')
  .eq('category_id', categoryData.id)
  .eq('status', 'published')
  .eq('visibility', 'public');
```
No subcategory fetch, no subcategory state, no filter bar.

**Change (5 additions):**

**1. New state:**
```javascript
const [subcategories, setSubcategories] = useState([]);
const [activeSubId, setActiveSubId] = useState(null);
```

**2. Subcategory fetch** (inside `fetchData`, after `setCategory(categoryData)`):
```javascript
const { data: subData } = await supabase
  .from('categories')
  .select('id, name, slug')
  .eq('parent_id', categoryData.id)
  .eq('is_active', true)
  .order('sort_order');
setSubcategories(subData ?? []);
```

**3. Extend articles select** to include `subcategory_id` (needed for client-side filtering):
```javascript
.select('*, stories(slug), subcategory_id')
```

**4. Client-side subcategory filter** (replace the `const sorted = [...]` derivation):
```javascript
const filtered = activeSubId
  ? stories.filter(s => s.subcategory_id === activeSubId)
  : stories;
const sorted = [...filtered].sort(/* existing sort logic */);
```

**5. Filter bar** (in JSX, between category header and stories column):
```jsx
{subcategories.length > 0 && (
  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
    <button
      onClick={() => setActiveSubId(null)}
      style={pillStyle(activeSubId === null)}
    >
      All
    </button>
    {subcategories.map(sub => (
      <button
        key={sub.id}
        onClick={() => setActiveSubId(sub.id)}
        style={pillStyle(activeSubId === sub.id)}
      >
        {sub.name}
      </button>
    ))}
  </div>
)}
```
`pillStyle(active)` returns inline styles matching the existing sort-button pill style in the file. Add `useEffect(() => { setVisibleCount(5); }, [activeSubId])` so the "Load more" counter resets on filter change.

**Web:** In scope.  
**iOS:** Not applicable. iOS browse uses `FindView.swift` which is a separate filter pattern; subcategory filter on iOS browse is not in scope for this pass.  
**Kids iOS:** Not applicable. Kids browse uses `ArticleListView.swift`; subcategory filter is not in scope for kids.

---

## Q12 — Rebuild CategoriesSection as hierarchical analytics dashboard

**DEPENDENCY NOTE:** Q10 must be in production before subcategory metrics show real data. Until articles are tagged with `subcategory_id`, `get_user_category_metrics` returns zero for subcategory rows. Top-level category metrics work from day one (they key off `articles.category_id` which is always set). QA must verify the locked/zero subcategory state renders correctly.

**Design constraint (owner-locked):** Analytical dashboard aesthetic. No gamification. No progress-toward-next-milestone. No unlock celebrations. No progress bars. Clean, ambient, data-first.

---

### `web/src/app/profile/_sections/CategoriesSection.tsx`

**Decision:** Q12  
**Current (connected wrapper):** Fetches `categories` (all non-kids-safe, active) + `category_scores` (score, articles_read, quizzes_correct per category_id). Renders parent/sub pill nav → scope card (score + reads + quizzes) → all-parents list.

**Current (data source):**
```typescript
const [catsRes, scoresRes] = await Promise.all([
  supabase.from('categories').select(...),
  supabase.from('category_scores').select('category_id, score, articles_read, quizzes_correct').eq('user_id', authUserId)...,
]);
```

**Change — connected wrapper (`CategoriesSectionConnected`):**
Replace the `category_scores` fetch with `get_user_category_metrics` RPC (confirmed parameter names: `p_user_id`, `p_category_id`):
```typescript
const [catsRes, metricsRes] = await Promise.all([
  supabase.from('categories').select('id, name, slug, parent_id, sort_order').eq('is_active', true).is('deleted_at', null).eq('is_kids_safe', false).order('sort_order'),
  supabase.rpc('get_user_category_metrics', { p_user_id: authUserId, p_category_id: null }),
]);
```
Pass `metrics: metricsRes.data ?? []` (not `scores`) to the presentational component.

**New type:**
```typescript
export type CategoryMetricRow = {
  category_id: string;
  reads: number;
  quizzes_aced: number;
  comments: number;
  upvotes: number;
};
```

**Change — presentational component (`CategoriesSection`):**
Complete replacement of the render. Remove: pill navigation, scope card, all-parents list.

New render:

```
CategoryCard (per parent category)
├─ Collapsed: name + reads count (muted)
│   └─ locked state (reads === 0): dimmed, name visible, no metrics, no lock icon
└─ Expanded (reads > 0): 2×2 metric grid + subcategory rows
    ├─ Reads  |  Quizzes aced
    ├─ Comments  |  Upvotes
    └─ SubcategoryRow × N (lazy-loaded on first expand)
        ├─ locked (reads === 0): dimmed name, no metrics
        └─ unlocked: name + 4 metrics inline
```

**Locked state:** `opacity: 0.5`, category name shown, all metrics replaced by a muted text label `"No reads yet"`. No lock icon. No CTA. No subscription reference.

**Subcategory lazy load:** On first expand of a parent card, call `supabase.rpc('get_user_category_metrics', { p_user_id: authUserId, p_category_id: parentId })`. Cache results in `const [subMetrics, setSubMetrics] = useState<Record<string, CategoryMetricRow[]>>({})` — keyed by parent `category_id`. Re-expanding does not re-fetch.

**Metric display:** Plain counts only. `"12 reads"`, `"3 quizzes aced"`, `"7 comments"`, `"2 upvotes"`. No percentages. No progress bars. No totals-toward-goal framing.

**Props change:** `CategoriesSectionProps` replaces `scores: CategoryScoreRow[]` with `metrics: CategoryMetricRow[]`. The `categories: CategoryRow[]` and `loading: boolean` props stay unchanged. `CategoriesSectionConnected` is the only consumer of the prop-driven form and is updated in the same PR.

**Web:** In scope.  
**iOS:** Update `ProfileView.swift` categories display to match hierarchical design. Specifically:
- In `loadCategories()` (lines ~1819–1862): replace the 4 parallel fetches (`allCats`, `reads`, `quiz_attempts`, `comments`) with a call to `get_user_category_metrics` RPC using the Swift Supabase client. The RPC returns `reads`, `quizzes_aced`, `comments`, `upvotes` — already the right shape.
- In `categoryCard` and `subcategoryRow` render functions: replace stats from `catStats[cat.id]` / `subStats[sub.id]` with `metricsMap[cat.id]` / `subMetricsMap[sub.id]` (a `[UUID: CategoryMetricRow]` dictionary built from the RPC result).
- Locked/unlocked check: change `(catStats[cat.id]?.total ?? 0) > 0` to `(metricsMap[cat.id]?.reads ?? 0) > 0`.
- Remove gamification copy: replace `Text("Start reading to unlock")` with `Text("No reads yet").foregroundColor(VP.dim)`. Remove `Image(systemName: "lock.fill")` from locked state — opacity dimming (`0.45`) is the only indicator. Remove `StatRowView` progress bars — replace with plain `Text` counts.  
**Kids iOS:** Not applicable. Kids iOS does not have a categories analytics surface.

---

## New files required

| File | Decision | Notes |
|---|---|---|
| `web/src/app/api/account/login-activity/route.ts` | Q4 | New GET route wrapping `get_own_login_activity` RPC |
| `web/src/app/profile/settings/_cards/FeedPreferencesCard.tsx` | Q8B | New settings card; ships only after Q8A verified in production |

## New DB migration required

| Change | Decision | Contents |
|---|---|---|
| `supabase/migrations/` — new migration | Q1 | Insert `profile.activity.full_history` into `permissions`; assign to pro/expert/admin/editor/moderator/family sets |

## New iOS structs required

| Struct | File | Decision |
|---|---|---|
| `ExpertProfileView` | `VerityPost/VerityPost/SettingsView.swift` | Q9 |

---

## Cross-cutting flags

- **Q4 iOS mismatch (flag for future session):** iOS `LoginActivityView` checks `'settings.login_activity.view'`; web checks `'settings.account.login_activity.view'`. These are different keys. Not blocking Q4 web implementation, but iOS may be calling the RPC with the wrong permission key — verify iOS login history actually works for all users before closing this flag.
- **Q10 → Q12 subcategory data dependency:** Top-level category metrics are available immediately. Subcategory metrics are zero until Q10 ships to production and articles are tagged. This is expected and should be communicated to QA.
- **Q8 sequential dependency:** Q8B must not ship until Q8A feed flag application is confirmed working in production.
