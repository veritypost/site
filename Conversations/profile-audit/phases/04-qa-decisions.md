# Phase 4 — Q&A Decisions

**Opened:** 2026-04-30 (Session 4)
**Status:** in-progress
**Rule:** One question at a time. No bundling. Owner answers are final — recorded here and never re-opened.

---

## Decision order

| # | OQ | Depends on | Status |
|---|---|---|---|
| Q1 | OQ-NEW-1 — free vs. pro for activity/achievements/categories/bookmarks | — | **decided** |
| Q2 | OQ-NEW-2 — iOS account-settings gates: remove or add to web | OQ-NEW-1 | **decided** |
| Q3 | OQ5 — blocked accounts: profile rail vs. Settings | — | **decided** |
| Q4 | OQ7 — add audit log to web | — | **decided** |
| Q5 | OQ9 — iOS Overview previews: fix or moot | OQ-NEW-1 | **closed/mooted** |
| Q6 | OQ6/WG3 — card share key canonicalization | — | **decided** |
| Q7 | OQ1 — streak heatmap on web | — | **decided** |
| Q8 | OQ4 — feed preferences on web | — | **decided** |
| Q9 | OQ3 — expert profile management on iOS | — | **decided** |
| Q10 | SUB-1 — fix subcategory save in story editor | — | **decided** |
| Q11 | SUB-2 — add subcategory filter to category browse pages | — | **decided** |
| Q12 | SUB-3 — rebuild CategoriesSection as hierarchical analytics dashboard | — | **decided** |

---

## Q1 — OQ-NEW-1: free tier access to activity, achievements, categories, bookmarks

**Asked:** 2026-04-30 (Session 4)
**Status:** awaiting owner answer

**Context:** The DB grants `profile.achievements`, `profile.activity`, `profile.categories`, and `bookmarks.list.view` to every signed-in user via the `free` permission set (which the `user` role holds). The UI locks all four of these for free-tier users with upsell prompts. `messages.inbox.view` is correctly pro-only and stays that way regardless.

**What's at stake:**
- **Unlock for free (accept DB as correct):** Remove the UI locks for free users on all four features; the DB already grants them. Fixes OQ9 (iOS Overview previews become correct). A free user can view their reading activity, achievements, followed categories, and bookmarks.
- **Move keys to pro-only (accept UI as intent):** Remove the four keys from the `free` permission set in a DB migration. A free user is correctly locked out. The UI behavior is intentional. This locks down meaningful features to paying users.

**Recommendation:** Accept DB as correct — unlock for free users. Reading activity, followed categories, bookmarks, and achievements are engagement/retention hooks; locking them for free users removes value that the DB schema already intended to grant. Messages inbox staying pro-only is the correct upsell lever.

**Owner answer:** **Accept all four panel decisions.** Implement immediately.

| Feature | Decision |
|---|---|
| Achievements/milestones | Free for all signed-in users |
| Followed categories / expertise map | Free for all signed-in users |
| Bookmarks list view | Free (10-cap stays; pro power features stay locked) |
| Activity log | Hybrid: last 30 days free / full history pro (fix empty-state for new users) |

Applies equally to web and iOS.

**Design principle (owner-locked):** Show the data. Do not gamify it. No "continue your streak" banners, no "N away from your next milestone" pressure hints in-face, no push notifications about streak breaks. The platform is trustworthy journalism, not Duolingo. Features exist as ambient data — visible on the profile if you look, never demanding your attention. The goal is the best possible data display, not the most persuasive habit loop.

---

## Q2 — OQ-NEW-2: iOS account-settings gates

**Decided:** 2026-04-30 (Session 4 — 3/3 panel unanimous)
**Decision: Remove iOS gates (Option A).**

Remove the `PermissionService.shared.has()` calls gating these 5 rows in iOS SettingsView:
- `settings.view` (profile edit row)
- `settings.account.edit_email`
- `settings.account.change_password`
- `settings.account.2fa.enable`
- `settings.data.request_export`

**Rationale:** Account management is a legal/security obligation, not a tier feature. Every signed-in user already holds all 5 keys via the `free` permission set — the gates are dead code and a maintenance trap. Web renders these unconditionally; iOS should match.

**Web:** No change needed (already ungated).
**Kids iOS:** Not applicable.

**Flag:** Confirm `free` set assignment fires for all auth paths (email, OAuth, waitlist) before removing the runtime checks.

---

## Q3 — OQ5: Canonical home for blocked accounts

**Decided:** 2026-04-30 (Session 4 — 3/3 panel unanimous)
**Decision: Move web blocked accounts to Settings/Privacy (Option A).**

Remove `BlockedSection` from the profile rail. Add blocked accounts under the web Settings page in the Privacy section (alongside DataCard/PrivacyCard). Lazy-loaded — only fetched when user navigates to Settings/Privacy.

**Rationale:** Blocking is privacy management, not profile content. The always-on profile rail fetch is noise for users who've never blocked anyone (the vast majority). iOS location (Settings → Privacy) is semantically correct; web should match.

**iOS:** No change (already in Settings → Privacy — correct location).
**Kids iOS:** Not applicable.

**Flag:** Verify web Settings/Privacy has a natural insertion point before implementation.

---

## Q4 — OQ7: Add audit log to web

**Decided:** 2026-04-30 (Session 4 — 3/3 panel unanimous)
**Decision: Add read-only login audit log to web (Option A).**

Add a historical login event log to the web SessionsSection (or as a companion card). Read-only display using the existing `get_own_login_activity` RPC. Shows: action, timestamp, device/browser/IP from metadata. No revocation on this log — revocation already exists on the active sessions list above it.

**Rationale:** RPC exists, ~80 lines, zero backend work. Security-conscious users on web want to know when and where their account was accessed. Revocation on iOS is lower priority — mobile-initiated revocation is rare.

**iOS:** No change to revocation scope this pass. LoginActivityView (read-only audit log) stays as-is.
**Kids iOS:** Not applicable.

---

## Q5 — OQ9: iOS Overview previews (mooted)

**Decided:** 2026-04-30 (Session 4 — closed without Q&A)
**Decision: No action needed. Finding closed.**

Since Q1 unlocked `profile.activity` and `profile.achievements` for all free users, the iOS Overview tab previews (E9 activity, E10 achievements) are no longer "free previews of locked content" — they are previews of freely accessible content. The oversight disappears when the gates are removed.

**All platforms:** Gate removals from Q1 cover this.

---

## Q6 — OQ6/WG3: Card share key canonicalization

**Decided:** 2026-04-30 (Session 4 — 3/3 panel unanimous)
**Decision: Canonicalize on `profile.card_share` (Option A).**

- **iOS:** Change `"profile.card.share_link"` → `"profile.card_share"` in `ProfileView.swift` (2 locations: line 196 permission assignment + anywhere else it appears)
- **Web:** Already correct — no change needed
- **DB:** `profile.card_share` already has 8-set coverage (all non-anon sets). Optionally drop orphan key `profile.card.share_link` from DB after iOS is updated.

**Rationale:** This is a bug — expert, editor, family, moderator, and pro users cannot see the share button on iOS. Option A is one string literal change with zero DB work. Option B requires 5-set DB expansion for no gain.

**Kids iOS:** Not applicable.

---

## Q7 — OQ1: Streak heatmap on web

**Decided:** 2026-04-30 (Session 4 — 3/3 panel unanimous)
**Decision: Add streak heatmap to web (Option A).**

New component at the top of ActivitySection (or as a standalone section above it). 30-day reading heatmap: colored grid showing read days vs. missed days. Show `streak_current` and `streak_best` as ambient data beneath. Data already available: `reading_log` is already fetched by ActivitySection; `users.streak_current` / `users.streak_best` exist in DB. ~80–100 lines React, zero backend work.

**Design constraint (owner-locked):** No pressure copy whatsoever. No "keep your streak alive", no "you're on a X-day streak, don't break it", no milestone callouts inline. The component reads like a calendar — here is your 30-day reading pattern. Neutral data display only.

**iOS:** Already has streakStrip() — no change needed.
**Kids iOS:** Kids iOS has its own streak display in KidsProfileView — not in scope here.

---

## Q8 — OQ4: Feed preferences on web

**Decided:** 2026-04-30 (Session 4 — 3/3 panel unanimous)
**Decision: Add FeedPreferencesCard to web (Option A) — conditional on renderer verification.**

New settings card `FeedPreferencesCard.tsx` in the web settings rail. 5 toggles mirroring iOS:
- Show breaking at top (`metadata.feed.showBreaking`)
- Show trending (`metadata.feed.showTrending`)
- Show recommended (`metadata.feed.showRecommended`)
- Hide low-credibility stories (`metadata.feed.hideLowCred`)
- Compact layout (`metadata.feed.display`)

Reads/writes via `update_own_profile` RPC merging into `users.metadata.feed` (same RPC web already uses for other settings). ~150 lines, zero backend work.

**Condition:** Before shipping the card, verify the web feed renderer reads `users.metadata.feed` flags. If the renderer ignores them, wire the renderer first — a settings card that saves preferences nobody reads is worse than nothing. If the renderer already reads the flags, ship unconditionally.

**iOS:** Already has FeedPreferencesSettingsView — no change.
**Kids iOS:** Not applicable (kids feed is curated).

---

## Q9 — OQ3: Expert profile management on iOS

**Decided:** 2026-04-30 (Session 4 — 3/3 panel unanimous)
**Decision: Build ExpertProfileView on iOS (Option A).**

Fill the existing placeholder `// MARK: - Expert settings (role=expert)` in SettingsView.swift. Build a new view (extend SettingsView or new file) with:
1. **Credentials editor** — freetext bio up to 600 chars, saved via `PATCH /api/expert/apply`
2. **Vacation toggle** — activate/deactivate 14-day pause via `POST /api/expert/vacation`; show `vacation_until` timestamp when active
3. **Verified areas display** — read-only list of categories from `expert_application_categories`
4. **Application status display** — approved / pending / rejected / revoked + rejection reason

All API endpoints exist. Zero new backend work. ~200–300 lines Swift. Scope-locked to these 4 operations — do not expand to queue management or analytics in this pass.

**Priority within the build:** Vacation toggle and credentials edit are highest priority (active workflow tools). Verified areas and status display are lower (read-only, lower urgency).

**Web:** Already has ExpertProfileSection — no change.
**Kids iOS:** Not applicable.

---

## Q10 — SUB-1: Fix subcategory save in story editor

**Decided:** 2026-04-30 (Session 4 — owner decision via conversation)
**Decision: Wire subcategory_id into the article save API call.**

The story editor UI already has a subcategory dropdown (dynamically populated from the selected parent category). The field is captured in state but never sent in the save payload. Fix: add `subcategory_id: story.subcategory || null` to the article object in the save API call.

**Files:** `web/src/components/article/StoryEditor.tsx` (save payload), `web/src/components/article/KidsStoryEditor.tsx` (same), the admin article save API route.

**iOS:** Not applicable — article creation is admin/web only.
**Kids iOS:** Not applicable.

---

## Q11 — SUB-2: Add subcategory filter to category browse pages

**Decided:** 2026-04-30 (Session 4 — owner decision via conversation)
**Decision: Add subcategory tab/filter bar to `/category/[slug]` pages.**

When a category has active subcategories, show a filter bar below the category header. Selecting a subcategory filters the article list to that subcategory. Default = all articles in the category (no filter). If a category has no subcategories, no filter bar appears.

**Intent:** Sports → filter by NFL / MLB / NBA. World News → filter by Asia / Europe / Middle East. User browsing intent drives the subcategory navigation, not forced hierarchy.

**Data:** Subcategories available from the existing categories fetch (filter by `parent_id`). Article filtering by `subcategory_id` already supported by the search/filter layer.

**iOS:** Not in scope for this pass — iOS browse surfaces are separate and lower priority.
**Kids iOS:** Not applicable.

---

## Q12 — SUB-3: Rebuild CategoriesSection as hierarchical analytics dashboard

**Decided:** 2026-04-30 (Session 4 — owner decision via conversation)
**Decision: Replace the current flat CategoriesSection with a hierarchical analytics dashboard.**

**Design:** Category cards that expand to reveal subcategory rows. Each card shows 4 metrics: reads, quizzes aced, comments, upvotes. Subcategories are locked (greyed, no metrics) until the user reads their first article there. Top-level category totals = sum of all subcategory metrics. Progress shown as counts ("12 reads", "3 quizzes aced") — not percentages, not gamified progress bars.

**Design constraint (owner-locked):** Analytical dashboard aesthetic — "the best possible data display, readable for everyone." No gamification. No progress-toward-next-milestone callouts. No unlock celebrations. Clean, ambient, data-first.

**Data source:** `get_user_category_metrics` RPC already handles both levels:
- Call with `p_category_id = null` → top-level categories with metrics
- Call with `p_category_id = <uuid>` → subcategories of that category with metrics
- Returns: reads, quizzes_passed, comments, upvotes_received per category/subcategory

**Progressive unlock logic:** `reads > 0` from the RPC = unlocked. `reads === 0` = locked state (show category name, no metrics, subtle lock indicator).

**Additional data needed:** Article counts per category (denominator for "3/10 reads" style display if used). Query `articles` table grouped by `category_id` / `subcategory_id` separately or add to RPC.

**Note:** This feature depends on Q10 (SUB-1). Until articles are tagged with `subcategory_id`, subcategory metrics will be zero. Top-level category metrics work from day one (they key off `articles.category_id` which is always set).

**iOS:** Update the equivalent iOS categories display to match the hierarchical design. The existing `get_user_category_metrics` RPC is platform-agnostic — iOS can call it the same way.
**Kids iOS:** Kids iOS has its own achievement/reading display — not in scope here.

---
