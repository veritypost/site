# Changelog

Entries are brief — enough for another agent to know what changed and why, and to spot if something went wrong.

---

## 2026-05-07 (continued)

### TODO 3 + TODO 38 — Sources inline + drop the desktop side rail
**Files:** `web/src/components/article/SourcesSection.tsx`, `web/src/app/[slug]/page.tsx`, `web/src/app/globals.css`. Commit: `a9c53cf5`.
- **TODO 3 — sources moved into the article body.** SourcesSection rewritten as logo-driven rows. Each row is a button showing publisher favicon (Google s2 favicons API at `sz=32`, 16px rendered) + hostname (`bbc.co.uk`, `congress.gov`). Click toggles a panel below with the source's raw headline. Click the headline → opens URL in a new tab with `rel="noopener noreferrer"`. Anon-tease branch unchanged. Component moved out of `timelineSlot` in `[slug]/page.tsx` into `articleSlot`, right after `ArticleActions` — readers see provenance in the same scroll as the body, not in a side rail they often miss.
- **TODO 38 — desktop layout flattened to single column.** The 75/25 flex split with a sticky 25% right rail forced the body (capped at 680px) to sit left-heavy on wide screens, leaving dead space outside the rail. Killed in `globals.css [data-reader-body]`: now `display: block` with `max-width: 760px` centered. `[data-reader-panel="timeline"]` no longer flex/sticky — flows below the article body on desktop. **Mobile 3-tab UI (Article / Timeline / Quiz & Discussion) preserved** per owner skip on TODO-1.
- **Ad slot adjustment.** `article_rail` ad was a sticky right-rail position; with the rail dropped it now flows below the timeline on desktop, inside the Timeline tab on mobile (where it already lived). Same component, same impressions/click tracking.

### TODO 50 piece B — Firsthand context on comments
**Files:** `web/src/components/CommentComposer.tsx`, `CommentRow.tsx`, `CommentThread.tsx`, `web/src/app/api/comments/route.js`, `VerityPost/VerityPost/StoryDetailView.swift`, `Models.swift`. **DB:** `comments.real_world_experience text` (≤80 char CHECK); `post_comment` RPC extended with `p_real_world_experience` (old 5-arg overload dropped); `database.ts` regenerated.
- Composer: italic-serif "I know this firsthand" toggle. When checked, expands a 80-char `How do you know?` input. Pre-fills from `users.background_oneline` if set + composer field is empty.
- Render: em-dash byline below comment body. Same italic-serif treatment on web + iOS.
- Single-column model: presence of trimmed text IS the firsthand claim. Empty + checked → not persisted.
- "Verified Expert" chrome on comments hidden behind `SHOW_EXPERT_CHROME_ON_COMMENTS = false` flag (per locked decision #16 — kept alive in code, single-line flip to restore). Expert filter toggle + dead `{false &&}` gate stripped from CommentThread.

### TODO 48 — Author follow-ups on comments (was deferred, shipped anyway)
**Files:** `CommentRow.tsx`, `CommentThread.tsx`, new `web/src/app/api/comments/[id]/followups/route.js`, `StoryDetailView.swift`, `Models.swift`. **DB:** new `comment_followups` table with cap-of-2 trigger + UNIQUE (comment_id, sort_order) + `_enforce_comment_followup_invariants` raises SQLSTATE `VP001` on cap-hit for stable error-code detection; new `can_view_comment(uuid)` SECURITY DEFINER helper that mirrors `comments_select`; new `create_comment_followup` RPC (locks parent FOR UPDATE + re-counts).
- Italic-serif "Update" pinned beneath parent comment, OP-only composer, immutable. Cap of 2 enforced at trigger + RPC + UNIQUE constraint.
- API route maps RPC errors: SQLSTATE VP001 → 409, author mismatch → 403, parent missing → 404. Author-only DELETE.
- Realtime channel subscribes to INSERT + DELETE on `comment_followups`; refetches the affected comment's followups via the user's authed client (RLS defense-in-depth) and merges into state. Other viewers see updates within ~1s.
- **`supabase_realtime` publication updated to include `comments` AND `comment_followups`** (the existing iOS + web comments realtime had been silently failing because the publication was never extended).

### TODO 50 piece A — Profile background system
**Files:** `web/src/app/profile/_components/ProfileApp.tsx`, new `web/src/app/profile/_sections/BackgroundSection.tsx`, new `web/src/app/profile/settings/_cards/BackgroundCard.tsx` (~1000 lines), `u/[username]/page.tsx`, new `VerityPost/VerityPost/SettingsBackgroundView.swift` (~860 lines), `PublicProfileView.swift`, `SettingsView.swift`, `Models.swift`. **DB:** 7 new `users.background_*` columns (oneline, profession, years, where, lived, languages — varchar with CHECK; `lived_public` boolean default false); 3 new tables (`user_education`, `user_links`, `user_topics_known`); RLS gates SELECT on `profile_visibility` (private profiles hide background everywhere, including future expert-search via topics_known); `update_own_profile` extended to allowlist new fields; new `set_own_education` / `set_own_links` / `set_own_topics_known` replace-set RPCs; `public_profiles_v` view extended.
- Web `/profile` BackgroundCard: progressive-disclosure questionnaire — primary 80-char "In one line, who's writing?" + chip tray of optional sections (profession, years, education multi-entry, lived experience with privacy toggle, where, topics multi-select from `categories` table, languages, links with quick-preset chips for LinkedIn/Personal site/GitHub/Research/Resume).
- iOS `SettingsBackgroundView` mirrors web — chip tray, multi-entry editors, NSDataDetector-style URL handling, 80-char counters, save toolbar button. New row added to Settings → Account.
- Public profile read render on `/u/[username]` (web) and `PublicProfileView` (iOS): italic-serif `— {oneLine}` byline, optional sections only render when populated. `background_lived` gated on `lived_public`. Topic chips. Links auto-link with `rel="nofollow noopener noreferrer ugc"`. Empty-state hint on own profile invites fill-in.

### TODO 51 Part A — Article-gen prompt edits (libel hardening)
**Files:** `web/src/lib/pipeline/editorial-guide.ts`, `web/src/app/api/admin/pipeline/generate/route.ts:1732`. All 9 prompt edits from the 4-adversary panel review:
- **Allegation Mode carve-out** in rule 11: required hedges (`alleged` / `reportedly` / `according to [filing/official]`) for uncharged conduct against named persons. Restores fair-report privilege the prior strip-outlet rule destroyed.
- **BAD/GOOD example** in rule 11 (CBS News / Biden) showing primary-source attribution form.
- **Anti-hallucinated-attribution rule** added to FACTS ONLY: ban inventing `according to` / `sources said` / `a person familiar with the matter` unless those phrasings appear in the corpus. Closes St. Amant "purposeful avoidance" exposure.
- **Wikipedia-as-research-aid rule**: don't paraphrase Wikipedia prose — use it to find primary sources, attribute to those. Closes CC-BY-SA exposure.
- **Conditional length-band ladder dropped** in all 3 summary prompts (HEADLINE / KIDS / TWEENS), replaced with fixed 30–50 word target. Honest about parallel-execution constraint.
- **`route.ts:1732` 250-400 → 250-450** word-count sync between user-turn and `EDITORIAL_GUIDE`.
- **"so what" tightened** to attributable mechanism only (named source or quantitative causal claim, or omit). Removes contradiction with FACTS ONLY rules.
- **Cadence + scale comparisons + on-record statements** protected as carve-outs under EVERY SENTENCE A FACT — prevents over-cutting Jay Jones-class statements and collapsing to monotone declaratives.

### Misc cleanup (same commit)
- `ExpertApplyForm.tsx`: removed `"We review within 5 business days"` toast string (no-user-facing-timelines).
- TODO.md duplicate `#51` (comment-load error) removed — recon confirmed underlying issue already fixed in code.
- iOS xcodebuild + web typecheck clean throughout.

**Commit:** `8110a917` — 19 files, +4,473 / −79.

---

## 2026-05-06 (continued × 4)

### TODO 48 — iOS login activity: active sessions + per-session revoke
**File:** `VerityPost/VerityPost/SettingsView.swift` (`LoginActivityView`)
- Added `SessionRow` decodable struct (id, user_agent, ip, last_seen_at, is_current)
- New "Active sessions" section loads above the audit log via `GET /api/account/sessions`; device label parsed from user_agent (platform + browser detection); IP + last-seen shown as caption; current session gets a "This device" badge
- Per-row `Revoke` button in VP.danger color → `DELETE /api/account/sessions/[id]`; removes row from local state immediately on 200
- "Revoke all other sessions" button → `DELETE /api/account/sessions`; clears non-current rows on 200
- Both revoke actions gated on `settings.account.sessions.revoke` / `settings.account.sessions.revoke_all_other` permissions; in-flight state prevents concurrent taps
- Error banner on network/API failure; audit log section unchanged
- **iOS Kids:** not applicable. **Web:** already existed.

---

## 2026-05-06 (continued × 3)

### TODO 49 — iOS theme toggle
**Files:** `VerityPost/VerityPost/Theme.swift`, `VerityPostApp.swift`, `SettingsView.swift`
- `Theme.swift`: all ink/surface/border/text static tokens swapped from hardcoded hex to `UIKit` adaptive colors (`Color(UIColor.label)`, `.systemBackground`, `.secondarySystemBackground`, `.separator`, `.tertiaryLabel`, etc.); fixed colors (brand, success, danger, warn, tag chips) unchanged; `SkeletonBar` → `Color(.systemGray5)`; `PillButton` → `Color(.systemBackground)`. Added `import UIKit`.
- `VerityPostApp.swift`: `@AppStorage("vp_theme")` + `preferredColorScheme` computed property (`"light"` → `.light`, `"dark"` → `.dark`, anything else → `nil`); `.preferredColorScheme(preferredScheme)` applied to `ContentView()`.
- `SettingsView.swift`: `AppearanceSettingsView` — three-option Light / System / Dark checkmark picker using `SettingsPageShell + SettingsCard`; Appearance `HubRowSpec` added to `preferencesRows` (always visible, no permission gate) with current-value preview text.
- **iOS Kids:** shares root `preferredColorScheme` — applies automatically.
- **Web:** already existed via `AppearanceSection.tsx`.

---

## 2026-05-06 (continued again)

### TODOs 1+2 — Dark mode: chrome + article text
**Files:** `web/src/app/NavWrapper.tsx`, `web/src/components/article/ArticleSurface.tsx`, `ArticleReaderTabs.tsx`, `SourcesSection.tsx`, `MidBodyQuizTeaser.tsx`, `TimelineSection.tsx`, `UpNextSheet.tsx`, `AnonArticleCtaBanner.tsx`, `StoryArticlePicker.tsx`, `web/src/components/CommentRow.tsx`
- **Chrome fix:** `rgba(var(--bg-rgb, 255, 255, 255), 0.97)` → `rgba(var(--bg-rgb), 0.97)` on top bar + bottom nav (NavWrapper lines 398, 431). `--bg-rgb` already had correct dark overrides; the hardcoded white fallback was the entire problem.
- **Article text fix:** Swept 9 files from legacy CSS vars to `--p-*` tokens:
  - `--text-primary` / `--text` → `--p-ink`
  - `--dim` (dark shades #888/#666/#555) → `--p-ink-muted`
  - `--dim` (light shades #bbb/#999/#aaa) → `--p-ink-faint`
  - `--bg` → `--p-bg`
  - `--border` → `--p-border`
  - `--accent` (#0070f3/#2563eb, blue uses) → `--p-accent`
  - `--accent` (#111, dark ink uses) → `--p-ink`
- **iOS / iOS Kids:** not applicable (native theme system)

---

## 2026-05-06 (continued)

### TODO 28 — Inline plan cards in BillingCard
**Files:** `web/src/app/profile/settings/_cards/BillingCard.tsx`, `web/src/app/pricing/_CheckoutButton.tsx` (reused)
- Free-tier users now see Verity + Family plan cards inline in the Plan section — no redirect to /pricing
- Fetches DB pricing via Supabase client; falls back to `pricingCopy.ts` constants if fetch fails
- Verity card: shows live price + `CheckoutButton` (or "Subscribe via iOS App" disabled state when `stripe_price_id` is null)
- Family card: shows price + "Available on iOS →" link to /kids-app
- **iOS / iOS Kids:** not applicable (native subscription flow unchanged)

### TODO 25 — CommentRow bold cleanup
**File:** `web/src/components/CommentRow.tsx`
- "Helpful" chip: `fontWeight: 700` → `600`
- "VS score" chip: `fontWeight: 700` → `600`
- Active tag chip: `fontWeight: active ? 700 : 500` → `active ? 600 : 500`
- Intentional bolds kept: "Pinned as Article Context" label, Expert chrome label, Save button
- **iOS / iOS Kids:** not applicable

### TODO 37 — AvatarEditor responsive grid
**File:** `web/src/app/profile/_components/AvatarEditor.tsx`
- Grid column changed from `auto 1fr` to `min(160px, 40vw) 1fr` — preview column now shrinks on narrow viewports instead of forcing a fixed 160px minimum
- Removed `minWidth: 160` from preview panel (was redundant and overrode the column width)
- **Verify:** open /profile → Avatar on a phone; if overflow persists check `InviteLinkCard` (`minWidth: 96`) via DevTools
- **iOS / iOS Kids:** not applicable (native avatar editor)

### TODO 43 — Bookmark → Follow copy sweep
**Files:** `web/src/components/BookmarkButton.tsx`, `web/src/app/bookmarks/page.tsx`, `web/src/app/profile/_components/ProfileApp.tsx`, `web/src/app/profile/_sections/BookmarksSection.tsx`, `VerityPost/VerityPost/ProfileView.swift`, `VerityPost/VerityPost/StoryDetailView.swift`, `VerityPost/VerityPost/SubscriptionView.swift`
- Web: button label "Bookmark"/"Saved" → "Follow"/"Following"; page title → "Following"; empty state copy updated; toast → "Removed from Following"; rail label → "Following"; Download copy updated
- iOS: quick action chip "Saved" → "Following"; quick link "Bookmarks" → "Following"; article button "Save"/"Saved" → "Follow"/"Following"; upgrade alert updated; plan feature list updated
- Schema untouched — `bookmarks` table, permissions, collections all unchanged
- **Remaining:** story-update surfacing (notify on new articles in followed stories) — awaiting owner decision on channel (Activity badge / push / both)
- **iOS Kids:** not applicable

### TODO 46 — "New since last visit" pill on iOS home feed
- Shipped as part of the iOS nav restructure (commit 925104eb)
- `HomeView.swift`: reads/writes `vp_last_home_visit_at` in UserDefaults; story cards show "New" badge when `publishedAt > lastVisitDate`
- **Web:** already existed via `_HomeVisitTimestamp.tsx`
- **iOS Kids:** not applicable

---

## 2026-05-06

### TODO 41 — iOS comment thread depth capped at 2
**Files:** `VerityPost/VerityPost/SettingsService.swift`, `StoryDetailView.swift`
- `SettingsService.swift:72` — `max_depth` default changed from `1` → `2` (was capping to 1 reply level instead of 2)
- `StoryDetailView.swift:1549` — `maxThreadDepth` changed from `3` → `2` (visual indent cap)
- `StoryDetailView.swift:2160` — Reply button now gates on `depth < SettingsService.shared.commentNumber("max_depth")`; previously had no depth check so reply button showed at any depth
- **iOS Kids:** not applicable (no comments)
- **Web:** already correct; `CommentRow.tsx` gates on `depth < commentMaxDepth` with default 2

### TODO 13 — iOS push notification tap-through
**Files:** `VerityPost/VerityPost/PushRegistration.swift`
- Added `userNotificationCenter(_:didReceive:withCompletionHandler:)` delegate method — previously missing, so tapping a push notification did nothing
- Handler extracts `story_slug` or `article_slug` from `userInfo`, posts `NotificationCenter.default.post(name: .vpOpenStory, ...)` so the app can navigate to the article
- Added `extension Notification.Name { static let vpOpenStory = Notification.Name("VPOpenStory") }`
- **Web / iOS Kids:** not applicable (push is iOS only)

### TODO 30 — Bookmarks removed from Activity feed
**Files:** `web/src/app/profile/_sections/ActivitySection.tsx`, `VerityPost/VerityPost/ProfileView.swift`, `VerityPost/VerityPost/Models.swift`
- Bookmarks already have a dedicated Bookmarks section in the rail — showing them in Activity too was duplicate noise
- **Web:** Dropped `BookmarkJoined` type, `bookmarks` state + query, `'bookmarks'` filter tab option, bookmark merge block, and bookmark render branch
- **iOS:** Dropped `ActivityFilter.bookmarks`, `bookmarkItems` state, `canViewBookmarks`, bookmark fetch, merge, and render branches from `ProfileView.swift`; removed `case bookmark` from `ActivityType` in `Models.swift`
- **iOS Kids:** not applicable (no activity feed)

---

### TODO 35 — Score tier UI removed
**Files:** `web/src/lib/scoreTiers.ts` (deleted), `web/src/app/profile/_components/TierProgress.tsx` (deleted), `ProfileApp.tsx`, `AppShell.tsx`, `YouSection.tsx`, `PublicProfileSection.tsx`, `CommentRow.tsx`, `CommentThread.tsx`, `CommentComposer.tsx`, `admin/users/page.tsx`, `admin/users/[id]/page.tsx`, `u/[username]/page.tsx`, `VerityPost/ProfileView.swift`
- All newcomer/reader/informed/analyst/scholar/luminary labels, the TierProgress bar, and scoreTiers loading logic removed everywhere
- Plan tier (free/pro/family) untouched — only score tier removed
- **iOS Kids:** not applicable

### TODO 42 — Timeline sticky rail overflow fixed
**File:** `web/src/components/article/ArticleReaderTabs.tsx`
- Added `align-self: flex-start` to `[data-reader-panel="timeline"]` — the rail now stops at the article container's bottom edge instead of floating over the footer
- **iOS:** timeline is a separate tab on mobile, not a sticky rail — not applicable
- **iOS Kids:** no timeline — not applicable

### TODO 40 — @mentions paid-gating copy (iOS)
- Swept iOS codebase — no paid-gating mention copy exists in Swift; web was already cleaned last commit
- Item fully done, no code change needed on iOS

---

## Earlier this session (2026-05-06)

### Bold / weight cleanup — article surface
- `TimelineSection.tsx` — removed `fontWeight: 600` from `LABEL_STYLE` (unintentional bold on timeline labels)
- `MidBodyQuizTeaser.tsx` — removed `fontWeight: 600` from `HEADLINE_STYLE`; kept button bold intentionally

### Tag quiz gate — web
- `CommentRow.tsx:642` — tag block now only renders when `quizPassed !== false`; previously showed tag UI before quiz was attempted

### Ad centering — home page bottom ad
- `Ad.jsx` — added `maxWidth: 728, margin: '12px auto'` to `wrapStyle` and `margin: '0 auto'` to img so the ad card self-centers
- `page.tsx` — removed inner redundant `maxWidth` wrapper that was conflicting

### "Better than X% of readers" copy removed
- `ArticleQuiz.tsx` — removed percentile copy from both pass state (lines 535-550) and fail state (lines 581-597); the stat was not meaningful and was distracting

### @mentions paid-gating copy removed
- `CommentComposer.tsx` — removed paid-mentions banner and footer line "@mentions are available on paid plans."
- `copy.ts` — removed `mentionPaid` and `mentionPaidComposerHint` keys
- **iOS:** not applicable (no paid-gating copy existed in Swift)
