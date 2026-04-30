# Phase 3 — Research

**Written:** 2026-04-30 (Session 3)
**Status:** Complete. Priority Group 1 (Session 3): OQ-NEW-1, OQ-NEW-2, OQ5, OQ7, OQ8, OQ9, OQ10. Priority Group 2 (Session 4): OQ1, OQ2, OQ3, OQ4, OQ6/WG3.
**Sources:**
- Agent A: MCP Supabase SQL queries (4 queries) — OQ-NEW-1
- Agent B: Read `IdentitySection.tsx`, `SecuritySection.tsx`, `NotificationsSection.tsx`, `DataSection.tsx`, `profile/contact/page.js`, `/api/support/route.js` — OQ-NEW-2 + OQ8
- Agent C: Read `ProfileView.swift` (activity/achievement preview sections), `SettingsView.swift` (LoginActivityView), `SessionsSection.tsx`, `/api/account/sessions/route.js` — OQ9 + OQ7
- Agent D: Read `BlockedSection.tsx`, `SettingsView.swift` (BlockedAccountsView + NotificationsSettingsView), `NotificationsCard.tsx`, `/api/notifications/preferences/route.js` — OQ5 + OQ10

---

## How to read this document

Each OQ section follows the same structure:
- **(a) Current state** — what the code/DB actually does (quoted)
- **(b) Options** — discrete choices available
- **(c) Tradeoffs** — per option
- **(d) Recommendation** — what the research supports
- **(e) Q&A-ready question** — formatted per README rules (context + stake + recommendation + question)

Sections marked **RESOLVED** require no Q&A — the research established a clear factual answer. Sections marked **DECISION NEEDED** go to Phase 4.

---

## OQ-NEW-1 — DB vs. UI contradiction on gated feature keys

**Status: RESOLVED (no Q&A needed — factual answer)**

### (a) Current state

Four SQL queries via MCP Supabase. Raw results:

**Query 1 — Is `profile.achievements` / `profile.activity` / `profile.categories` / `bookmarks.list.view` / `messages.inbox.view` in the `free` permission set?**

Rows returned (4 of 5 keys match):
- `bookmarks.list.view` — YES, in `free`
- `profile.achievements` — YES, in `free`
- `profile.activity` — YES, in `free`
- `profile.categories` — YES, in `free`
- `messages.inbox.view` — **NOT in `free`**

**Query 2 — Which sets contain each of the 5 keys?**

| set | key |
|---|---|
| `free`, `admin`, `owner` | `bookmarks.list.view` |
| `pro`, `admin`, `owner` ONLY | `messages.inbox.view` |
| `free`, `pro`, `family`, `editor`, `expert`, `moderator`, `admin`, `owner` | `profile.achievements` |
| `free`, `pro`, `family`, `editor`, `expert`, `moderator`, `admin`, `owner` | `profile.activity` |
| `free`, `pro`, `family`, `editor`, `expert`, `moderator`, `admin`, `owner` | `profile.categories` |

**Query 3 — What does the `user` role grant (every signed-in user)?**

Rows: `anon`, `unverified`, `free`

Every signed-in user — regardless of plan — inherits the `free` permission set via the `user` role.

**Query 4 — What does each plan grant on top of the user-role baseline?**

| plan | extra sets |
|---|---|
| `free` | (none beyond user-role baseline) |
| `verity_pro_monthly` / `verity_pro_annual` | `pro` |
| `verity_family_monthly` / `verity_family_annual` | `pro` + `family` |

### Verdict

**Four of the five keys: the UI is the bug.**

`profile.achievements`, `profile.activity`, `profile.categories`, and `bookmarks.list.view` are all in the `free` set. The `user` role — granted to every signed-in account — already includes the `free` set. Therefore every signed-in user holds all four of these permissions at the DB level, regardless of their plan.

Yet the UI in both web and iOS locks these features for free-tier users with upsell prompts. That is incorrect behavior: the DB has already granted access.

**One key: the UI is correct.**

`messages.inbox.view` is exclusively in `pro`, `admin`, and `owner` sets. A free-tier user does not hold it. The locked-for-free behavior on messages is correct.

### What this means for Phase 4

The four incorrectly gated features need a decision: should the DB be corrected (move the keys to `pro`-only) or should the UI be corrected (remove the locks for free users)? This is a **product design decision**, not a technical one — the DB and UI disagree on whether activity, categories, milestones, and bookmarks are free features.

This question goes to Phase 4 Q&A.

---

## OQ-NEW-2 — Should web add permission gates for account-settings rows?

**Status: DECISION NEEDED**

### (a) Current state

**Web (from code):** All four account-settings sections render with no permission gate:

- `IdentitySection.tsx` — no gate; renders `<IdentityCard>` unconditionally
- `SecuritySection.tsx` — no gate; renders `<EmailsCard>`, `<PasswordCard>`, `<MFACard>` unconditionally
- `NotificationsSection.tsx` — no gate; renders `<NotificationsCard>` unconditionally
- `DataSection.tsx` — no gate; renders `<DataCard>` unconditionally

The only behavioral gate on web is the `preview` prop — which blocks mutations (e.g. saving changes) but does not hide the UI. The `preview` prop is not a permission gate; it's a "public profile view" flag.

**iOS (from Phase 2):** Each equivalent row is gated by an explicit `PermissionService.shared.has()` call:
- Profile edit row → `settings.view`
- Email row → `settings.account.edit_email`
- Password row → `settings.account.change_password`
- MFA row → `settings.account.2fa.enable`
- Data export → `settings.data.request_export`

**DB verdict (from OQ-NEW-1 findings):** These 5 keys were not in the queried set, but by pattern they almost certainly live in the `free` set (all auth users need to manage their account). If they are in the `free` set, then every signed-in user already holds them — adding the gates to web would be **cosmetically correct but behaviorally no-op** for real accounts.

### (b) Options

**Option 1 — Add permission gates to web (match iOS)**
Add `hasPermission('settings.view')` etc. to each web section/card, mirroring iOS.

**Option 2 — Remove permission gates from iOS (match web)**
Remove the `PermissionService.shared.has()` calls from iOS account-settings rows.

**Option 3 — Accept asymmetry (no change)**
Leave web ungated, iOS gated. Document the discrepancy.

### (c) Tradeoffs

| Option | Pro | Con |
|---|---|---|
| 1 (add to web) | Code symmetry across platforms; future-proofs if these keys ever become tier-gated | Extra code complexity on web; no behavioral effect today if keys are in `free`; gates on account-management features are unusual UX (a user who can't edit their email is broken, not tiered) |
| 2 (remove from iOS) | Simpler iOS code; matches web; account settings should never be tier-gated | Removes intentional iOS code without knowing why it was added; may have been added for a specific future-proofing reason |
| 3 (accept asymmetry) | Zero code change | Ongoing confusion for anyone reading the codebase; violates platform-consistency rule |

### (d) Recommendation

Option 2 — **remove the gates from iOS**. Account-management operations (edit email, change password, enable 2FA, export data) should never be tier-gated. These are GDPR/security obligations, not features. The iOS gates appear to be defensive scaffolding added speculatively; since web never implemented them and real users hold these keys anyway, the iOS gates add complexity for no benefit. Confirm first that the 5 keys are in the `free` set (very likely but not yet verified for these specific keys).

### (e) Q&A-ready question

> **OQ-NEW-2:** iOS gates your account-settings rows (edit email, change password, MFA, data export) with permission checks that web doesn't have. Both platforms look up whether the user holds the key, but web never implemented these checks. Based on DB evidence, every signed-in user likely holds all 5 of these keys already — so the gates have no real effect, they're just extra code. **Recommendation: remove the gates from iOS** (simplifies code, matches web, account management should never be tier-gated). Alternative: add matching gates to web (symmetric but cosmetic). Do you want to remove the iOS gates, add them to web, or leave the asymmetry?

---

## OQ8 — Is /profile/contact intentionally open to anon?

**Status: RESOLVED (no Q&A needed — behavior is correct by design)**

### (a) Current state

**Component (`web/src/app/profile/contact/page.js`):** No auth check. Renders unconditionally for any visitor, including unauthenticated users. The form allows filling in topic, subject, and body without signing in.

**API handler (`web/src/app/api/support/route.js`):**
```javascript
export async function POST(request) {
  const token = bearerToken(request);
  const supabase = token ? createClientFromToken(token) : await createClient();
  await requireAuth(supabase);  // throws 401 if not authenticated
```

`requireAuth()` throws HTTP 401 if `getUser()` returns null. An unauthenticated POST returns a 401 error, which the form surfaces as "Failed to submit. Please try again."

### Verdict

**This is intentional design, not an oversight.** Anon users can *see and fill* the contact form — this is good UX for a support surface (users who are locked out need to reach support). But they cannot *submit* it — the backend enforces auth at the API layer.

The WG4 finding from Phase 1 was based on the component having no auth check. That was accurate but incomplete — the auth enforcement is in the API route, not the component. **WG4 is closed.** No action needed.

**Platform note:** iOS equivalent is `FeedbackSheet` in SettingsView (F15) — only reachable by authenticated users (it's in Settings). The web contact page being reachable by anon is not an inconsistency; it's the correct platform behavior (web has a public URL that anon can navigate to).

---

## OQ9 — iOS activity/achievement previews: intentional free teaser or oversight?

**Status: DECISION NEEDED (but recommendation is clear)**

### (a) Current state

**iOS E9 (Recent Activity Preview) — `loadActivity` function, `ProfileView.swift:1738–1766`:**
Fetches via direct table reads (no RPC):
```swift
client.from("reading_log").select(...).eq("user_id", uid).limit(50)
client.from("quiz_attempts").select(...).eq("user_id", uid).limit(200)
client.from("comments").select(...).eq("user_id", uid).limit(50)
client.from("bookmarks").select(...).eq("user_id", uid).limit(50)
```

**iOS E10 (Achievements Preview) — `loadAchievements` function, `ProfileView.swift:1888–1915`:**
```swift
client.from("user_achievements").select(...).eq("user_id", uid)
client.from("achievements").select(...).eq("is_active", true).eq("is_secret", false)
```

**Load timing:** Both are called in the `.task` block that fires on view appear — **before the permission check resolves**. The permission gates (`canViewActivity`, `canViewAchievements`) are set asynchronously after the data is already loading.

**Web comparison:**
- `ActivitySection.tsx`: Uses same direct table reads (`reading_log`, `comments`, `bookmarks`) — but wrapped in `if (!perms.activity) return <EmptyState>`. The permission is checked before any data is displayed.
- `MilestonesSection.tsx`: Uses same `user_achievements` + `achievements` table reads — no server-side RPC guard. Frontend check only.

**Server-side guard:** No RLS policies found in `supabase/migrations/` for `reading_log`, `user_achievements`, `achievements` tables that would block a free-tier user. The data is not guarded at the database level — the gates are entirely client-side.

### (b) Assessment

This is an **oversight**, not intentional design. Evidence:
1. The full Activity Tab (E12) IS gated by `profile.activity` (locked UI)
2. The full Milestones Tab (E14) IS gated by `profile.achievements` (locked UI)
3. But the Overview tab previews of the same content (E9, E10) have no gate
4. The data loads eagerly before the permission check, and since there's no server-side RLS, free users receive real data — not empty previews

A free user currently sees a real preview of their activity and achievements on the Overview tab, even though the full Activity and Milestones tabs are locked behind a paywall. If this were intentional (e.g. a "teaser" to drive upgrades), it would be designed differently — showing truncated data with an upsell CTA, not just showing the full preview with no lock indication.

**However:** The OQ-NEW-1 finding complicates this. If `profile.activity` and `profile.achievements` are in the `free` set (which they are, per Agent A's DB queries), then the tabs themselves are incorrectly locked. If the locks are removed for free users (the OQ-NEW-1 resolution path), then E9 and E10 are no longer "free previews of locked content" — they're just previews of freely accessible content, which is correct design.

### (c) Options

**Option 1 — Fix as oversight: add permission gates to E9/E10 (if the tab locks stay)**
Add `PermissionService.shared.has("profile.activity")` / `"profile.achievements"` guards to the Overview preview renders. Matching web's gate behavior.

**Option 2 — Accept as intentional teaser (if the tab locks stay)**
Document E9/E10 as deliberately free; add an upsell CTA beneath each preview block pointing to the locked tab.

**Option 3 — Moot if OQ-NEW-1 unlocks for free: no gate needed anywhere**
If the Phase 4 decision on OQ-NEW-1 is to unlock activity/achievements for free users (DB is correct), then the preview gates and tab locks should all be removed. E9/E10 having no gate becomes correct.

### (d) Recommendation

**Defer to OQ-NEW-1 resolution.** OQ-NEW-1 must be decided first:
- If owner decides free users should NOT have `profile.activity` / `profile.achievements` → fix E9/E10 as an oversight (Option 1): add gates to the Overview previews.
- If owner decides free users SHOULD have these (DB is correct) → remove the tab locks and the oversight disappears (Option 3).

Do not ask this as a standalone Q&A question — it's dependent on OQ-NEW-1.

### (e) Q&A-ready question

> **OQ9 (dependent on OQ-NEW-1):** iOS shows a real activity preview and a real achievements preview on the Profile Overview tab — with no permission gate — even though the full Activity tab and Milestones tab are locked for free users. This appears to be an oversight (the data loads before permission checks, and there's no server-side guard). **But this question's answer depends on OQ-NEW-1:** if we unlock activity/milestones for free users (DB says they should have it), the oversight disappears. If we keep the locks, the Overview previews need gates added. Decide OQ-NEW-1 first.

---

## OQ7 — SessionsSection (web) vs. LoginActivityView (iOS): same feature or two?

**Status: DECISION NEEDED**

### (a) Current state

**Web (`SessionsSection.tsx`):**
- Fetches from `/api/account/sessions` → `sessions` table filtered to `is_active = true`
- Fields: `id`, `user_agent`, `ip`, `last_seen_at`, `created_at`, `is_current`
- **Supports revocation:** DELETE `/api/account/sessions/[id]` (revoke one) and DELETE `/api/account/sessions` (revoke all others)
- Permission keys: `settings.account.sessions.revoke`, `settings.account.sessions.revoke_all_other`
- **Does NOT show historical login events** — active sessions only
- **No permission gate on the section itself** — all signed-in users see it

**iOS (`LoginActivityView` in `SettingsView.swift:1688`):**
- Fetches via RPC `get_own_login_activity` → limit 50 rows
- Fields: `action`, `created_at`, `id`, `metadata` (device, browser, ip)
- **Read-only:** no revocation buttons
- Shows timestamped historical login/auth events (audit trail)
- Gated by: `settings.login_activity.view`

**Permission key discrepancy:** Web uses `settings.account.login_activity.view` (found in sessions route.js); iOS uses `settings.login_activity.view`. These may be two different DB keys. Needs cross-check in Phase 4.

**Conclusion:** These are **two genuinely different features**:
| | Web SessionsSection | iOS LoginActivityView |
|---|---|---|
| Data | Active sessions only | Historical login events (audit log) |
| Actions | Revoke session(s) | Read only |
| Purpose | Manage current logins | Audit who/when/where logged in |

### (b) Options

**Option A — Add audit log to web** (web gets history; web already has revocation)
**Option B — Add session revocation to iOS** (iOS gets management; iOS already has audit log)
**Option C — Build both on both platforms** (full parity)
**Option D — Accept asymmetry** (web = session manager; iOS = audit viewer; each platform does one thing)

### (c) Tradeoffs

| Option | Pro | Con |
|---|---|---|
| A (audit log to web) | Low effort (RPC already exists); high security value; parity on transparency | Adds UI complexity to SessionsSection or requires a new card |
| B (revocation to iOS) | Power users on mobile can sign out specific sessions | Higher effort (new UI + permission enforcement on mobile); rare use case |
| C (both) | Full parity; best UX | Highest scope; doubles maintenance surface |
| D (asymmetry) | Zero scope | Confusing — users expect the same security features everywhere; web users can't see audit history |

### (d) Recommendation

**Option A — Add audit log to web.** The historical login event table (`get_own_login_activity` RPC) already exists. Adding a read-only log beneath or alongside the active sessions list on web is low effort and high value — security-conscious users on web want to know when and where their account has been accessed. Revocation on iOS (Option B) is a lower priority because most session revocation happens at a desktop; mobile-initiated revocation is a rare pattern.

### (e) Q&A-ready question

> **OQ7:** Web and iOS implement two different security features under the same concept of "account activity." Web (`SessionsSection`) shows only active sessions and lets you revoke them. iOS (`LoginActivityView`) shows a historical audit log of all login events but has no revocation. Neither platform has both features. **Recommendation: add the historical audit log to web** (the RPC already exists; it's a read-only display). Revocation on iOS is lower priority — would you like to add the audit log to web, revocation to iOS, both, or leave them as-is?

---

## OQ5 — Canonical home for blocked accounts: profile rail (web) vs. Settings (iOS)

**Status: DECISION NEEDED**

### (a) Current state

**Web (`BlockedSection.tsx`):**
- In the profile rail as section #9 (Settings group, always visible)
- Fetches directly: `blocked_users.select('blocked_id, user:users!fk_blocked_users_blocked_id(...)')` filtered by `blocker_id`
- Actions: unblock via DELETE `/api/users/{blockedId}/block`
- Permission gate: none on the section; DELETE endpoint enforces `settings.privacy.blocked_users.manage`
- Display: always in rail; shows empty-state text "You haven't blocked anyone" when list is empty (never hides itself)

**iOS (`BlockedAccountsView` in `SettingsView.swift:2890–3020`):**
- Under Settings → Privacy → Blocked Accounts
- Fetches via `GET /api/users/blocked` (dedicated REST endpoint, not direct Supabase select)
- Actions: unblock via `BlockService.shared.unblock(targetId:)` → DELETE `/api/users/{targetId}/block`
- Permission gate: none on the view; API enforces auth only; DELETE enforces `settings.privacy.blocked_users.manage`
- Display: shown only when navigated to from Settings; lazy-loaded

**Functional parity:** Near-identical. Same data source (`blocked_users` table via join), same unblock action (same DELETE endpoint), same UX states (loading / empty / list / error). The only implementation difference is web uses direct Supabase client read vs. iOS using a REST wrapper.

### (b) Options

**Option 1 — Keep web in profile rail, document asymmetry**
Web stays at section #9. iOS stays in Settings > Privacy. Both work; platforms differ.

**Option 2 — Move web blocked accounts to Settings (match iOS)**
Remove `BlockedSection` from the profile rail. Add blocked accounts to the web Settings page (Privacy section, alongside DataCard/PrivacyCard).

**Option 3 — Move iOS blocked accounts to profile view (match web)**
Add a Blocked tab or section to iOS ProfileView. Unlikely — iOS profile doesn't have a settings rail.

### (c) Tradeoffs

| Option | Pro | Con |
|---|---|---|
| 1 (status quo, asymmetry) | Zero change; works today | Platform inconsistency; blocked accounts is a privacy concern living in profile content area on web |
| 2 (move web to Settings) | Matches iOS canonical location; semantically correct (privacy management belongs in Settings); reduces profile rail noise; lazy-loaded (only fetched when user visits Settings) | Discoverability drop (users accustomed to web location); requires minor restructuring |
| 3 (move iOS to profile) | Matches web | iOS profile has no settings-rail pattern; would be jarring design addition |

**Technical note:** Web currently fetches blocked users as part of the profile rail load — always, even when the user has no blocked accounts. Moving to Settings makes it lazy (only fetched when Privacy section is visited). This is strictly better for performance.

### (d) Recommendation

**Option 2 — Move web to Settings.** Blocked accounts is a privacy management function. The iOS location (Settings > Privacy) is semantically correct. The web profile rail showing blocked accounts always — including the empty "You haven't blocked anyone" state — is noise. Implementation cost is low (component exists; move it to the Privacy card area in Settings).

### (e) Q&A-ready question

> **OQ5:** Web shows blocked accounts in the profile rail (always visible, even when empty). iOS shows them in Settings → Privacy. Both are functionally identical. **Recommendation: move web blocked accounts to Settings/Privacy** — it's a privacy-management function, not profile content; matches iOS; eliminates an always-rendered empty-state from the rail; and makes the fetch lazy instead of always-on. Would you like to move blocked accounts to Settings on web, keep it in the profile rail, or leave the asymmetry and just document it?

---

## OQ10 — Dead notification per-type toggles on iOS: remove or revive?

**Status: RESOLVED — already removed; no Q&A needed**

### (a) Current state

**iOS `NotificationsSettingsView`:** The dead toggles were already removed in commit `24f655e`. What existed before removal:

Old `@State` variables (deleted):
- `breakingAlerts` ("Breaking news alerts")
- `morningDigest` ("Morning digest")
- `expertReplies` ("Expert replies")
- `commentReplies` ("Replies to my comments")
- `weeklyRecap` ("Weekly recap")

These wrote to `users.metadata.notifications.*` via `update_own_profile` RPC. Nothing in the backend reads `users.metadata.notifications` — the actual notification preferences store is the `alert_preferences` table.

**Why they were dead:** The toggles wrote to the wrong column. The canonical preferences system (`alert_preferences` table) is what the web uses. iOS was writing to a JSON blob that no cron, trigger, or API consumer reads.

**Current iOS state:** Only the system push permission toggle remains (reads iOS native push state via `PushPermission.shared`; no per-alert-type controls). This matches the web MVP scope.

**Web `NotificationsCard.tsx`:** Exposes channel-level toggles only (push/email/in-app via `/api/notifications/preferences`). A comment in the code explicitly says: *"Per-category rules are intentionally NOT surfaced here for the first pass."*

### Verdict

**The dead toggles are correctly removed.** Both platforms are intentionally at channel-level only for the first pass. If per-alert-type preferences are ever added, they should be built for both platforms simultaneously, using the existing `alert_preferences` endpoint that web already wires to. The `users.metadata.notifications` column is a dead column and can be ignored.

**Finding ND5 is closed.** No action needed and no Q&A question needed.

---

---

## OQ1 — Should web get a streak heatmap visualization?

**Status: DECISION NEEDED**

### (a) Current state

**iOS (E5 — Streak Strip):**

`ProfileView.swift` has a dedicated `streakStrip()` function (lines 461–523) rendering a 30-day heatmap grid:
- 10×3 grid (`LazyVGrid`) of colored `RoundedRectangle` cells: `VP.streakActive` (read day), `VP.streakMissed` (missed day), `VP.streakTrack` (future)
- Header row: "Last 30 days" label + `"{N} read · {current}-day streak"` caption
- Legend + best streak badge below the grid

**Data source — `loadStreak()` function (lines 1680–1706):**
```swift
client.from("reading_log")
    .select("created_at")
    .eq("user_id", userId)
    .is("kid_profile_id", nil)
    .gte("created_at", iso)  // last 30 days
    .execute()
```
The function deduplicates by `cal.startOfDay(for: d)` to get a `Set<Date>` of read days. `streakCurrent` and `streakBest` come from `users.streak_current` and `users.streak_best` columns.

**No separate streak table.** Streak data is computed client-side from `reading_log`. No `user_streaks` or `streaks` table found in `supabase/migrations/`.

**Web (`ActivitySection.tsx`):**

No streak or heatmap visualization exists. The section renders only a flat filterable list of activity items (reads, comments, bookmarks). `streak_current` and `streak_best` columns exist in the DB and are accessible via `database.ts` types, but are not displayed anywhere on web. The `reading_log` table is already queried by ActivitySection.

### (b) Options

**Option 1 — Add streak heatmap to web**
New `StreakSection.tsx` (or inline in ActivitySection) with a 30×1 or 10×3 CSS grid, reading 30 days of `reading_log` + `users.streak_current`/`streak_best`.

**Option 2 — Accept asymmetry (iOS-only)**
Document the gap; streak heatmap remains iOS-only.

### (c) Tradeoffs

| Option | Pro | Con |
|---|---|---|
| 1 (add to web) | Full platform parity; streak is a retention driver — gamification that works better when visible on both platforms; zero backend work (data already exists) | New component to build; ActivitySection already has reading_log data (reuse is easy but still a UI task) |
| 2 (asymmetry) | Zero scope | Engagement metric (streaks drive daily returns) hidden from the web audience; web users have no visibility into their reading consistency |

**Implementation scope (Option 1):** New React component (~80–120 lines). Data is available: `reading_log` is already fetched by ActivitySection; `streak_current`/`streak_best` come with the user row. No backend changes.

### (d) Recommendation

**Add to web (Option 1).** Streak visualization is a retention mechanic — hiding it on web means the majority of desktop readers never see it. The implementation is very low effort (data already available, no new API). Matches iOS. Add as a component at the top of ActivitySection or as a dedicated StreakSection above it.

**Kids iOS (G1 reference):** Not applicable — kids iOS `ProfileView.swift` has its own achievement/streak section (`G1–G4` in inventory). Any web heatmap is for adult accounts only.

### (e) Q&A-ready question

> **OQ1:** iOS shows a 30-day reading heatmap (color-coded grid) with current streak and best streak on the Profile Overview. Web has no streak visualization — the activity section is a flat list only. The data already exists: streak counts are on the `users` row, and `reading_log` is already fetched by ActivitySection. **Recommendation: add the heatmap to web** (new component, ~100 lines of React, zero backend work). Would you like to add a streak heatmap to web, or keep it iOS-only?

---

## OQ4 — Should web get a feed preferences section?

**Status: DECISION NEEDED**

### (a) Current state

**iOS (`FeedPreferencesSettingsView` in `SettingsView.swift:2055–2182`):**

A dedicated settings page under Settings → Feed with 5 toggles in 3 sections:

| Section | Toggle | DB field |
|---|---|---|
| What surfaces | Show breaking at top | `metadata.feed.showBreaking` |
| What surfaces | Show trending | `metadata.feed.showTrending` |
| What surfaces | Show recommended | `metadata.feed.showRecommended` |
| Filters | Hide low-credibility stories | `metadata.feed.hideLowCred` |
| Display | Compact layout | `metadata.feed.display` ("compact"/"comfortable") |

**Read/write path:** Loads `users.metadata` via direct Supabase select; saves via `update_own_profile` RPC merging into `metadata.feed`. The JSONB structure is already defined.

**Web:** No feed preferences UI exists anywhere. `NotificationsCard.tsx` contains a code comment reading *"Per-topic rules live in your feed preferences"* — acknowledging feed prefs exist on iOS but not web. No `/api/feed/preferences` route. No component. The `update_own_profile` RPC is already used on web for other metadata writes (identity, privacy, notifications).

### (b) Options

**Option 1 — Add FeedPreferencesCard to web**
New settings card (`FeedPreferencesCard.tsx`) in the web settings rail. Mirrors iOS: 5 toggle rows, 3 sections, reads/writes `users.metadata.feed` via `update_own_profile` RPC.

**Option 2 — Accept asymmetry (iOS-only)**
Feed preferences remain iOS-only. Document and close.

### (c) Tradeoffs

| Option | Pro | Con |
|---|---|---|
| 1 (add to web) | Full parity; web readers can control their feed content; same data, same RPC — writes from iOS sync to web behavior and vice versa | New component (~150 lines, copy-paste from NotificationsCard pattern); need to decide if web feed rendering actually reads these flags |
| 2 (asymmetry) | Zero scope | Web users cannot control what appears in their feed; feed flags set on iOS silently affect web without a web toggle to change them |

**Key dependency:** If the web feed does not currently read `metadata.feed.*` flags, adding the UI without wiring it to the feed renderer is cosmetic. Needs confirmation that the feed actually reads these keys. However, the data structure exists and the RPC is used — implementing the UI gives the owner a path to wire it up.

### (d) Recommendation

**Add to web (Option 1).** Feed preferences are core personalization — users should control their feed on both platforms. The `update_own_profile` RPC and `metadata.feed` JSONB structure already exist; implementation is ~150 lines following the exact pattern of `NotificationsCard.tsx`. The NotificationsCard comment already acknowledges the gap ("Per-topic rules live in your feed preferences") — web should close it.

**Kids iOS:** Not applicable (kids feed is curated; no feed preference controls).

### (e) Q&A-ready question

> **OQ4:** iOS has a full Feed Preferences settings page (5 toggles: breaking/trending/recommended content, hide low-credibility, compact layout). Web has no equivalent — there's even a code comment in web NotificationsCard saying "Per-topic rules live in your feed preferences." The storage mechanism already exists (`users.metadata.feed` via `update_own_profile` RPC, which web already uses for other settings). **Recommendation: add feed preferences to web** (~150 lines, copy-paste from existing settings cards). Would you like to add feed preferences to web, or keep them iOS-only?

---

## OQ2 — Should iOS get a full ExpertQueueSection?

**Status: RESOLVED — iOS already has full parity; no action needed**

### (a) Current state

**Research finding (Session 4, Agent B):** A dedicated `ExpertQueueView.swift` file exists. This is **not a routing stub** — it is a complete, feature-parity implementation:

- Four-tab interface (Pending, Claimed, Answered, Back-channel)
- Queue list rendering with item cards, categories, asker info, timestamps
- Inline action buttons per tab: Claim and Decline (Pending tab), Answer (Claimed tab)
- Answer composer sheet (modal) with edit/preview tabs
- Authorization check: `PermissionService.has("expert.queue.view")`
- Data fetched from same `/api/expert/queue?status=` endpoint as web
- Entry points: quick-action chip in E8 (Quick Actions Row, line 645) and overview quick-link (line 1035)

**Web parity:** Web's `ExpertQueueSection.tsx` has the same 4 tabs, same actions, same endpoint. The only gap on both platforms: Back-channel tab is a placeholder ("coming soon").

### (b) Verdict

**G2 finding from Phase 1 inventory was incorrect.** Phase 1 concluded "expert queue no iOS surface" because `ProfileView.swift` was read and no ExpertQueueView was found inline — it is a separate file (`ExpertQueueView.swift`) that ProfileView navigates to. The Phase 1 agent missed the separate file.

iOS expert queue is **fully built**. OQ2 is closed. No Q&A needed.

**Back-channel placeholder:** Both iOS and web show a "coming soon" state for back-channel. This is an intentional stub, consistent with the launch-hide pattern. Not an OQ.

---

## OQ3 — Should expert credentials/vacation management exist on iOS?

**Status: DECISION NEEDED**

### (a) Current state

**Web (`ExpertProfileSection.tsx`):**

Manages the full post-verification expert profile:
- **Application status** display (approved / pending / rejected / revoked + rejection reason)
- **Verified areas** display (categories from `expert_application_categories`)
- **Credentials editor** — freetext (max 600 chars), saved via `PATCH /api/expert/apply`
- **Vacation toggle** — activates 14-day vacation via `POST /api/expert/vacation`; can be ended early; shows `vacation_until` timestamp
- Permission gating: `expert.profile.manage` for writes

**iOS — what exists:**

- `ExpertApplyForm` in `SettingsView.swift` (lines 2190–2573): One-time application submission form. POST-only — collects all fields for a new application. Not post-verification management.
- `// MARK: - Expert settings (role=expert)` comment at line 2579 — **empty**. No code follows it.
- Zero references to `vacation`, `vacation_until`, credential update, verified areas display, application status display, or `expert.profile.manage` permission in iOS codebase.

**Summary:** iOS has expert *application* (one-time form) but zero post-verification expert *management*.

| Feature | Web | iOS |
|---|---|---|
| Apply for expert status | ✓ | ✓ (`ExpertApplyForm`) |
| View expert queue | ✓ | ✓ (`ExpertQueueView`) |
| Edit credentials after approval | ✓ | **Missing** |
| Vacation mode toggle | ✓ | **Missing** |
| View verified areas | ✓ | **Missing** |
| View application status / rejection reason | ✓ | **Missing** |

### (b) Options

**Option 1 — Build ExpertProfileView on iOS**
New view (extend SettingsView or new file) implementing the 4 missing features. All API endpoints already exist (`/api/expert/apply` PATCH, `/api/expert/vacation`). No backend work.

**Option 2 — Accept asymmetry (web-only)**
Expert profile management stays web-only. iOS experts must go to the web to edit credentials or toggle vacation.

### (c) Tradeoffs

| Option | Pro | Con |
|---|---|---|
| 1 (build on iOS) | Full parity; experts managing their account on mobile can do everything on-device; the empty MARK comment signals this was planned | Moderate effort (~200–300 lines new Swift view, 4 data operations, error states); no new API needed but UI infrastructure is real work |
| 2 (asymmetry) | Zero scope | Experts who are primarily on mobile have no way to manage their expert status on-device; vacation toggle especially — being on a trip and needing to pause questions requires opening a browser |

### (d) Recommendation

**Build on iOS (Option 1)** — but deprioritize relative to OQ1/OQ4. The empty `// MARK: - Expert settings (role=expert)` comment is a clear signal this was always intended. Vacation toggle is the highest-value piece (mobile use case: travel). Credentials editor is medium-value. Both API endpoints exist; scope is bounded.

**Kids iOS:** Not applicable.

### (e) Q&A-ready question

> **OQ3:** iOS has the expert application form and the full expert queue — but there is no post-verification expert profile management on iOS at all. There is even a placeholder comment in SettingsView.swift (`// MARK: - Expert settings (role=expert)`) with nothing implemented under it. Web has credentials editing, vacation toggle, verified-area display, and application status. All the API endpoints exist. **Recommendation: build the expert profile management view on iOS** — especially the vacation toggle (mobile-first use case when traveling). Would you like to build this, or keep expert profile management web-only?

---

## OQ6/WG3 — `profile.card_share` vs. `profile.card.share_link`: canonicalize

**Status: DECISION NEEDED**

### (a) Current state

**DB query results** (exact rows from `permission_sets JOIN permission_set_perms JOIN permissions`):

| permission_set_key | perm_key |
|---|---|
| admin, editor, expert, family, free, moderator, owner, pro | `profile.card_share` |
| admin, free, owner | `profile.card.share_link` |
| admin, free, owner | `profile.card.view` |

**Web (`profile.card_share`):**
- `ProfileApp.tsx`: `cardShare: hasPermission('profile.card_share')` (line 170) — passed to `YouSection` to gate a share button/link in the profile overview panel
- `/profile/card/page.js`: Direct `hasPermission('profile.card_share')` check. If the user has the key → redirects to `window.location.replace('/card/${me.username}')`. If not → "Shareable profile cards are available on paid plans" upsell. This is **the user sharing their own card URL**.

**iOS (`profile.card.share_link`):**
- `ProfileView.swift` line 196: `canShareProfileCard = await PermissionService.shared.has("profile.card.share_link")`
- Used in E8 Quick Actions Row (lines 607–656): `ShareLink(item: url)` chip, visible only if `canShareProfileCard && username != nil`
- Used in Overview tab profile-card section (lines 991–1002): Second share button, same `ShareLink` behavior
- URL shared: `https://veritypost.com/card/[username]` — same destination as web

**Both keys gate exactly the same user-facing action:** "share my profile card URL." Neither gates viewing a card; that's separately gated by `profile.card.view`.

**The bug caused by the split:** iOS's `profile.card.share_link` is only in 3 sets (admin, free, owner). An expert, editor, family, moderator, or pro user on iOS **cannot see the share chip** — even though web correctly allows them to share via `profile.card_share` (which is in all 8 non-anon sets). The feature is silently broken for 5 of 8 role types on iOS.

### (b) Options

**Option A — Adopt `profile.card_share` everywhere (drop `profile.card.share_link`)**
iOS: change `"profile.card.share_link"` to `"profile.card_share"` in `ProfileView.swift` (one string literal). DB: verify `profile.card_share` coverage is already correct (it is — all 8 non-anon sets). DB: optionally drop `profile.card.share_link` and `profile.card.view` orphan keys.

**Option B — Adopt `profile.card.share_link` everywhere (drop `profile.card_share`)**
Web: update `ProfileApp.tsx` and `/profile/card/page.js` to use `profile.card.share_link`. DB: update coverage of `profile.card.share_link` to match the current 8-set spread of `profile.card_share`. Drop `profile.card_share`.

**Option C — Keep both (accept dual maintenance)**
Not recommended. No product rationale for iOS share to be restricted to 3 sets while web allows 8.

### (c) Tradeoffs

| Option | Pro | Con |
|---|---|---|
| A (`profile.card_share`) | One-line iOS fix; web already correct; 8-set coverage already correct; lower total change | `card_share` uses flat naming style (not dot-separated); minor naming inconsistency with `profile.card.view` |
| B (`profile.card.share_link`) | Dot-separated naming matches `profile.card.view` convention; iOS naming convention preserved | Web requires 2 edits; DB requires 5-set coverage expansion; `share_link` is more verbose |
| C (status quo) | Zero change | Bug persists: expert/editor/family/moderator/pro can't share their card on iOS |

### (d) Recommendation

**Option A — adopt `profile.card_share` everywhere.** The coverage is already correct on this key (all 8 non-anon sets), web is already using it, and iOS needs only a one-string-literal change. Drop `profile.card.share_link` from DB and iOS to eliminate confusion.

**Kids iOS:** Not applicable (kids accounts don't have shareable profile cards).

### (e) Q&A-ready question

> **OQ6/WG3:** Web and iOS use two different permission keys to gate the same action (sharing your profile card URL): web uses `profile.card_share` (in all 8 non-anon permission sets) and iOS uses `profile.card.share_link` (only in 3 sets: admin, free, owner). This means expert, editor, family, moderator, and pro users cannot see the share button on iOS — a real bug. **Recommendation: canonicalize on `profile.card_share`** — it already has correct coverage; iOS needs a one-string-literal change. Would you like to canonicalize on `profile.card_share`, on `profile.card.share_link` (with coverage fix), or is there a naming reason to prefer the dot-separated form?

---

## Summary: OQ statuses after Priority Group 1

| OQ | Status | Next step |
|---|---|---|
| OQ-NEW-1 | **RESOLVED** — 4 keys in `free` (UI is wrong); 1 key (`messages.inbox.view`) in `pro` only (UI is correct). DB is correct. | Phase 4 Q&A: product decision on whether to unlock for free or move keys to pro-only |
| OQ-NEW-2 | **DECISION NEEDED** | Phase 4 Q&A (after OQ-NEW-1 resolved — the two are linked) |
| OQ5 | **DECISION NEEDED** — recommendation: move web to Settings | Phase 4 Q&A |
| OQ7 | **DECISION NEEDED** — recommendation: add audit log to web | Phase 4 Q&A |
| OQ8 | **RESOLVED** — backend enforces auth; WG4 closed | No Q&A |
| OQ9 | **DEPENDS ON OQ-NEW-1** — if free users get the features, oversight disappears; if they stay locked, gate the previews | Ask after OQ-NEW-1 resolved |
| OQ10 | **RESOLVED** — toggles already removed; ND5 closed | No Q&A |
| OQ1 | **DECISION NEEDED** — recommendation: add streak heatmap to web (zero backend work) | Phase 4 Q&A |
| OQ2 | **RESOLVED** — iOS already has full ExpertQueueView with feature parity; G2 finding was wrong (separate file not found by Phase 1 agent). Back-channel tab is placeholder on both platforms (intentional). | No Q&A |
| OQ3 | **DECISION NEEDED** — recommendation: build ExpertProfileView on iOS (credentials, vacation, status display) | Phase 4 Q&A |
| OQ4 | **DECISION NEEDED** — recommendation: add feed preferences card to web (zero backend work; data structure exists) | Phase 4 Q&A |
| OQ6/WG3 | **DECISION NEEDED** — bug confirmed (expert/editor/family/moderator/pro can't share card on iOS); recommendation: canonicalize on `profile.card_share` (one iOS string change) | Phase 4 Q&A |
