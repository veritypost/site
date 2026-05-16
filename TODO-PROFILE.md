# TODO-PROFILE

Redesign of `/profile` across web + iOS. Sister doc to TODO-SEARCH.md.

Mock source-of-truth: `redesign-preview.html` — `mock-profile-desktop` (L3401) + `mock-profile-mobile` (L3880).

Session state: **decisions locked, ready for Session A (backend foundation).** All 10 open decisions resolved via 5-expert panel review on 2026-05-15. Three material corrections to the prior audit also captured below.

---

## Corrections to prior audit (uncovered during 5-panel review)

1. **`comment_context_tags.tag_kind` is now reactions only** — `('i_agree','helpful')` after the May 12 migration. The prior mapping "Context = count of context tags" and "Sources = tag_kind='source'" is dead. Live context primitive is `comments.intent='add_context'`. Source has **no honest DB mapping** today.
2. **`public_profiles_v` SECURITY DEFINER view already exists** and is what `/u/[username]/page.tsx` reads today. The prior plan to "add a new `users_public_read` RLS policy" is unnecessary — the right move is to extend the existing view's column list.
3. **Legacy `#billing` / `#emails` hash callers = 9, not 7.** Missed two: `web/src/lib/billingPlatformGuard.ts:103,133` and `web/src/lib/email.js:88`.

---

## Locked decisions (2026-05-15)

### Originally locked (top of session)

1. **5 mode tabs:** Overview / Reading / **Following** / **Discussions** / Settings. Mock used "Timelines / Discussions"; renamed to friendlier "Following / Discussions" per owner.
2. **No bookmarks. Follow is the only reading-list primitive.** Locked memory `feedback_no_save_only_follow.md` holds. The mock's "saved stories" copy line in the public-preview footnote (`redesign-preview.html:3860`) gets rewritten to "followed stories." Existing `bookmarks` table stays dead.
3. **Following tab = canonical management surface.** Full list of followed stories, sorted/filterable, with unfollow controls. Lives only on profile after this redesign.
4. **Home Sections menu drops the followed-stories list.** Sections menu becomes a pure category navigator (Topics: Business / Politics / etc.). Eliminates duplication; gives each surface one clear job. This **overrides** the prior locked memory "Following lives in the home Sections menu only, not in the profile shell" — that rule is reversed.
5. **iOS gets the same Following tab** automatically. iOS has no home Sections menu showing follows today, so nothing on iOS to remove — Profile tab becomes the only management surface, consistent with web.
6. **Discussions tab = stories user has commented in, grouped by story.** One row per story, showing latest comment snippet + count. Tapping a row opens the story scrolled to the latest comment. NOT a flat list of individual comments (which is what today's Activity section does).
7. **Kids exempt.** Kids product is iOS-only with COPPA parental gates; kids `ProfileView.swift` stays as-is. Per `kids_scope` memory.

### Locked via 5-expert panel (UX / iOS / security / editorial / frontend)

8. **Public profile (`/u/[username]`) shape.** Keep as a **real Next.js route**, slimmed. Hero = mock's preview card (avatar + display name + 3 contribution counts + role/verified badge if any). Below the hero: bio + Follow / DM / Block / Report. **Drop** banner, Verity Score number, followers/following sub-tabs, 4-stat grid. **Rebuild as a server component** so SEO / JsonLd / OG tags work — today's 1199-LOC `'use client'` page is part of the problem being fixed. Apple 1.2 forces keeping Block + Report regardless of mock.
9. **Contributions taxonomy = 2 tiles, not 3.** Ship **Questions asked** (`comments.intent='question'`) and **Context added** (`comments.intent='add_context'`). **Drop "Sources shared" from v1** — no honest mapping exists, and faking it off URL regex would incentivize link spam. Revisit when a real source-attachment primitive ships. Do NOT count `intent='different_take'` — rewards contrarianism for credit.
10. **Settings stays as a real `/profile/settings` route** (not a conditional render branch of `/profile?tab=settings`). Visually styled as the 5th pill in the mode-tab row, but structurally a `<Link>` route push. Frontend won: route-level code-split matters (`BillingCard.tsx` is 637 LOC + Stripe SDK — shouldn't ship to Overview visitors), route-level Suspense/streaming, Stripe redirects keep working, deep links stay clean. Sub-sections become real sub-routes (`/profile/settings/billing`, `/profile/settings/privacy`, etc.).
11. **`/profile/category/[id]` deleted.** Unanimous. No inbound `href` outside the Categories section the mock kills.
12. **Editorial role badges = `is_verified_public_figure` only in v1.** Already exposed in `public_profiles_v`, opt-in, low risk. **Skip admin / editor / curator** — security flagged as credential-stuffing / social-engineering attack surface (telling phishers exactly which 5 accounts compromise the newsroom). **Hold `is_expert` badge** until the expert program is launch-flipped.
13. **Public profile data path = extend `public_profiles_v`** (add contributions columns + reading-prefs-visibility column as needed). Convert `/u/[username]/page.tsx` from client component to server component reading via the view. The view pattern is strictly more robust than column-grant RLS or service-role API.
14. **Reading preferences = 3 columns on `users` with CHECK constraints:** `reading_default_mode`, `reading_text_size`, `reading_theme`. CHECK is the security boundary; jsonb is for unknown shapes. Add `users.show_contributions_publicly bool default false` as a discrete column (don't overload `show_activity`).
15. **iOS mode-tab nav pattern = horizontal-scroll pill buttons** with `.matchedGeometryEffect` underline indicator. `ScrollView(.horizontal, showsIndicators: false)` + `LazyHStack`, 44pt tap targets, `UISelectionFeedbackGenerator().selectionChanged()` on switch, `ScrollViewReader` to auto-scroll selected pill into view. Wrap in `ViewThatFits` so iPad / wide-phone-landscape uses a fixed `HStack` fallback. NOT `Picker` (5-item cap), NOT `TabView(.page)` (fights article swipe-back).
16. **Legacy `#billing`/`#emails` hash cleanup = rewrite all 9 callers, no client-side bridge.** Per `feedback_genuine_fixes_not_patches`. Add a CI guard that fails the build on any new `/profile/settings#` literal — drift has happened, so a guard is justified per `feedback_prefer_ci_guards_over_centralization`. The 9 sites: `recap/page.tsx:143`, `messages/page.tsx:1025`, `billing/page.tsx:11`, `help/page.tsx:149`, `LockedFeatureCTA.tsx:92`, `CommentRow.tsx:801`, `CommentComposer.tsx:598`, `RecapCard.tsx:57`, `LockModal.tsx:69`, plus `billingPlatformGuard.ts:103,133` and `lib/email.js:88` (`#emails`).
17. **Analytics = `usePageViewTrack('profile.<tab>')` per mode-tab body on own profile only.** Do **NOT** log viewer→viewee pairs on `/u/[username]` — that's social-graph surveillance and at odds with a credibility-first product. Aggregate page hits on `/u/[username]` are fine. iOS uses existing `EventsClient.shared.track(event: "page_view", page: "profile.<mode>")` per tab body.

### Deferred for later (not in scope for this redesign)

- **A "Following" content firehose** on home — the industry-standard "what's new in stories you follow today" feed. Every big consumer product (X / Instagram / YouTube / Spotify / Reddit / Substack / Apple News) has this. Verity Post has no surface doing this job today. Flag for a future session — not blocking this redesign.
- **"Sources shared" contributions tile** — revisit when a real source-attachment primitive ships on comments. Until then, 2 tiles (Questions + Context).
- **Expert badge on public profile** — revisit when expert program is launch-flipped.
- **Editor / curator / admin badges** — security has vetoed; do not revisit without a security re-review.

---

## Full audit findings (summary)

### Current `/profile` web stack — 21 sections

`ProfileApp.tsx` (575 LOC) orchestrates a 21-row rail (`AppShell.tsx` 433 LOC). Sections grouped into:
- **Ungrouped**: you, publicProfile, background
- **Library**: activity, messages, categories, milestones
- **Family & expert**: family (link-out), expert-queue (launch-hidden), expert-profile (launch-hidden)
- **Settings**: identity, security, sessions, notifications, appearance, privacy
- **Account**: plan, refer, help, data, signout

Each section has a `_sections/<Name>Section.tsx` wrapper around a `settings/_cards/<Name>Card.tsx` editor. URL contract: `?section=<id>`.

Sub-routes that survive as standalone pages:
- `/profile/family`, `/profile/kids`, `/profile/kids/[id]`, `/profile/contact`, `/profile/card`, `/profile/settings/expert`, `/profile/category/[id]` (likely dies)

### Current iOS profile

`ProfileView.swift` (2333 LOC) — 21-section NavigationLink list, iPhone single-column, iPad NavigationSplitView. 4 sections punt to web via `webFallback`.

`SettingsView.swift` (4838 LOC) — orphaned, not in current navigation. Recommend delete.

`PublicProfileView.swift` (640 LOC) — separate stack-pushed view for `/u/[username]` equivalent.

`AccountState.swift` + `AccountStateBannerView.swift` — universal account-state banner above tab content; keep.

### Schema state

- `users` table covers display name, username (case-insensitive unique), bio, avatar_url, avatar_color, banner_url, profile_visibility (private/public/hidden), show_activity, followers_count, following_count, is_verified_public_figure, is_expert, expert_title.
- Reading preferences (mode / text size / theme): **missing**.
- `show_contributions_publicly` toggle: **missing** as a discrete column.
- `users_public_read` RLS policy: **missing**.
- `follows` table exists, rows=0, paid feature (INSERT requires `is_premium()`).
- `story_follows` table exists, rows=2 in prod. Powers Following tab. Indexed.
- `comments` table — 65 rows, indexed on user_id. Powers Discussions tab.
- `reading_log` table — 12 rows, RLS self-only, indexed on user_id + article_id. Powers Continue Reading + Reading tab.
- `bookmarks` table — exists, dead surface, stays dead.
- `quiz_attempts`, `user_achievements`, `comment_votes`, `comment_context_tags` all exist and feed the Comprehension card + Contributions tiles.

### Inbound link sites

~30 inbound `href="/profile..."` references across the codebase. 7 use legacy `#billing` hash anchors that silently no-op. Plus mention chips at `CommentRow.tsx:1381,1505` linking to `/u/${username}`.

### Tests

- `web/tests/e2e/profile-settings.spec.ts`
- `web/tests/e2e/profile-settings-deep.spec.ts`

Likely need rewriting after mode-tab restructure.

---

## Build sequencing (proposed)

Per session-based cleanup pattern. Build-passes-only between sessions; env-flag bridges keep old surfaces live.

### Session A — backend foundation (no UI)
- Migration: 3 new columns on `users` (reading_default_mode, reading_text_size, reading_theme) with CHECK constraints.
- Migration: `users.show_contributions_publicly bool` default false.
- Migration: `users_public_read` RLS policy (column whitelist, `profile_visibility != 'private'`).
- No code changes outside migrations.

### Session B — new `/api/profile` aggregator
- New endpoint `/api/profile/overview` returning the Overview tab payload in one call: hero, caught-up, continue-reading top-3, followed-timelines top-5, comprehension, contributions, public-preview.
- Existing `/api/account/*` and `/api/settings/*` survive untouched.
- Existing `/api/story-follows`, `/api/follows` survive.
- Test coverage on the aggregator.

### Session C — web `/profile` rebuild
- New `ProfileApp.tsx` shell with 5 mode-tabs.
- Mode-tab routing via `?tab=overview|reading|following|discussions|settings`.
- Per-tab body components: `OverviewTab`, `ReadingTab`, `FollowingTab`, `DiscussionsTab`, `SettingsTab`.
- `SettingsTab` absorbs the 11+ current Settings/Account sub-section cards as a list (reuse `settings/_cards/*`).
- Feature-flag behind env var; old `/profile` still works.
- Fix 7 `#billing` legacy hash links to point at the new structure.

### Session D — public profile decision + execution
- Owner-locked decision on whether `/u/[username]` collapses to the mock's tiny preview card or keeps the full page.
- Implement accordingly. If collapse: kill the followers/following tab + Verity Score + 4-stat grid.
- Update `JsonLd.tsx:6` Person schema if shape changes.

### Session E — web cleanup
- Drop env flag.
- Delete `/profile/category/[id]/page.js` (after owner-locked decision).
- Update home Sections menu: drop followed-stories list, keep as pure topic navigator.
- Update inbound mention chips at `CommentRow.tsx:1381,1505` if `/u/[username]` URL changed.

### Session F — iOS rebuild
- New `ProfileTabView.swift` with 5 mode-tab structure replacing `ProfileView.swift`.
- Build 4 new native editors for `publicProfile`, `background`, `refer`, `data` (kill webFallback).
- Delete `SettingsView.swift` (orphaned, 4838 LOC).
- Rebuild `PublicProfileView.swift` to match the public-profile decision from Session D.
- Update `ContentView.swift` pop-to-root to also reset mode tab to Overview.
- Verify Apple 5.1.1(v) deletion path is ≤2 taps.
- Verify Apple 3.1.1 Restore Purchases is reachable.

### Session G — verification
- End-to-end on web desktop, web tablet, web mobile, iPad split, iOS phone, iOS pad.
- Smoke: `/profile/settings#billing` legacy URLs land somewhere reasonable.
- Confirm cross-platform consistency.

---

## Files-to-touch summary

### Web rebuild
- `web/src/app/profile/page.tsx` — rewrite as mode-tab shell
- `web/src/app/profile/_components/ProfileApp.tsx` — replace 21-section catalog with 5-tab catalog
- `web/src/app/profile/_components/AppShell.tsx` — delete (rail dies)
- `web/src/app/profile/_sections/*` — collapse into per-tab body components
- `web/src/app/profile/settings/_cards/*` — keep all editors, remount under Settings tab
- `web/src/app/profile/settings/page.tsx` — alias survives; mounts `?tab=settings`
- `web/src/app/profile/category/[id]/page.js` — likely delete
- `web/src/app/u/[username]/page.tsx` — restructure per Session D decision
- `web/src/app/_home/SectionsMenu.tsx` — drop followed-stories preview, keep topics
- Inbound legacy `#billing` hash links: 7 callers across recap, messages, help, CommentRow, RecapCard, CommentComposer
- `web/src/components/JsonLd.tsx:6` — update Person schema if `/u/[username]` shape changes

### iOS rebuild
- `VerityPost/VerityPost/ProfileView.swift` — rewrite as `ProfileTabView` with 5 mode tabs
- `VerityPost/VerityPost/SettingsView.swift` — delete (4838 LOC orphan)
- `VerityPost/VerityPost/PublicProfileView.swift` — restructure per Session D decision
- `VerityPost/VerityPost/ContentView.swift` — update Profile tab pop-to-root to reset mode
- 4 new native editor screens for publicProfile / background / refer / data
- `VerityPostKids/`: no changes (kids exempt)

### Backend
- 3 migrations (reading prefs columns, show_contributions_publicly column, users_public_read RLS policy)
- New `/api/profile/overview` aggregator endpoint
- All other `/api/account/*` and `/api/settings/*` routes survive

### Permissions
- Keep all existing `profile.*`, `settings.*`, `account.*` keys.
- No new keys required for the locked decisions.

---

## Next session prompt

Paste this into a new session to resume:

```
Continue TODO-PROFILE.md. All 10 open decisions are locked (see "Locked decisions"
block). Start Session A — backend foundation migrations. No UI changes yet.

Session A work:
1. Migration: 3 columns on users for reading prefs (reading_default_mode,
   reading_text_size, reading_theme) with CHECK constraints + NOT NULL DEFAULTs.
2. Migration: users.show_contributions_publicly bool default false.
3. Migration: extend public_profiles_v view to add contributions count columns
   (questions_asked_count, context_added_count) and the reading-prefs-visibility flag
   if needed. Confirm view definition is up to date with anything added since the
   initial creation.
4. No code changes outside migrations. No new RLS policies — view-based path already
   exists.

Then stop and report. Session B (new /api/profile/overview aggregator) is next.

Memory checks to respect:
- feedback_no_save_only_follow
- feedback_no_color_per_tier
- feedback_cross_platform_consistency
- feedback_genuine_fixes_not_patches
- kids_scope
```
