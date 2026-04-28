# Session 9 — iOS Adult App

**Owns (strict):** `VerityPost/**`

**Hermetic guarantee:** No edits to web, kids iOS, server, or shared schema. iOS-only.

**Major workstreams:**
- AUTH-MIGRATION iOS half (consumes S3's API contracts).
- Profile redesign iOS port (T358 — multi-week, blocked by S8 T357 stabilization).
- Cross-platform parity (comments, bookmarks, realtime).
- iOS correctness sweep (~25 individual items).

---

## Items

### S9-Q2-iOS — Magic-link auth iOS half
🟩 **Shipped** (ce42012). Magic-link end-to-end: AuthViewModel.sendMagicLink + 30s resend cooldown + clearMagicLinkState; LoginView/SignupView email-only forms with "Check your inbox" cards; PickUsernameView (new file) gated by `auth.needsPickUsername`; OAuth buttons preserved behind `VPOAuthEnabled = false`. **Source:** OWNER-ANSWERS_READ_ONLY_HISTORICAL.md Q2.
**Files:**
- `VerityPost/VerityPost/AuthViewModel.swift` — replace `signInWithPassword` and `auth.signUp` with `signInWithOTP(email:)`. Hide Apple + Google OAuth buttons via feature flag (default false). Keep code intact for one-line unhide.
- `VerityPost/VerityPost/LoginView.swift` — email-only form posting to `/api/auth/send-magic-link`.
- `VerityPost/VerityPost/SignupView.swift` — magic-link signup flow.
- New `VerityPost/VerityPost/PickUsernameView.swift` — post-signin username pick.
- Deep-link callback in `handleDeepLink` (`AuthViewModel.swift:389`) — detect `username IS NULL` post-`setSession()`, route to `PickUsernameView` before Home.
**Wait for:** S3's `/api/auth/send-magic-link` route + `/api/auth/check-username` collapsed-to-boolean.
**TODO2 items resolved:** T22, T23, T200, T252.

### S9-T42 — iOS data export uses old direct-insert path
🟧 **OWNER-PENDING** — TODO2 T42. Owner picks: route through `/api/account/data-export` for parity, or accept iOS divergence.
**File when answered:** `VerityPost/VerityPost/SettingsView.swift:2557-2566`.

### S9-T43 — iOS can't see/cancel pending deletion while signed in
🟧 **OWNER-PENDING** — TODO2 T43. Owner picks UX: countdown + cancel button, or stay with current "log back to cancel" message.
**Files when answered:**
- `VerityPost/VerityPost/SettingsView.swift:2504-2529`
- `VerityPost/VerityPost/Models.swift:5-60` — add `deletion_scheduled_for` field.

### S9-T49-iOS — Username editable contract
🟧 **OWNER-PENDING** — TODO2 T49. Aligns with web (S8). When owner picks A/B/C, iOS slice lands here.

### S9-T358 — iOS adult profile redesign port
🟨 **Source:** TODO2 T358. **Multi-week build.** Blocked by S8 T357 stabilization + S8 T360 (CategoriesSection + MilestonesSection).
**Files:** new `ProfileShell.swift`, `Palette.swift`, `AccountStateBanner.swift`, `AvatarEditorView.swift`, plus 16 section views per the web→iOS mapping table.
**Pre-flight:** T359 (`profile_visibility='hidden'` audit on iOS — parallel to T330's web fix).

### S9-A12-iOS — `colorHex` reads from `score_tiers`
🟩 **Shipped** (6a1b9b5). Three colorHex reads collapsed to VP.muted; tierColorFor helper kept (returns muted) so callers don't reach for the palette token directly. **Source:** TODO A12 (iOS slice). Owner-locked rule violation.
**Files:** `VerityPost/VerityPost/ProfileView.swift:400, 1447, 1660`.
**Action:** Drop the three `colorHex` reads. Replace with neutral palette token (`VP.muted`).

### S9-A14 — `Color(hex:)` parser silently produces black
🟩 **Shipped** (506cddf). 6-hex-digit gate + Log.d on failure + VP.muted fallback. **Source:** TODO A14.
**File:** `VerityPost/VerityPost/Theme.swift:75-86`.
**Action:** Port the kids parser pattern: on parse failure, log input + return `VP.muted` (not black).

### S9-A15 — Force-unwrapped URLs in 4 production paths
🟩 **Shipped** (ba16915). SubscriptionView Terms/Privacy + KidsAppLauncher + SupabaseManager siteURL routed through SupabaseManager.siteURL.appendingPathComponent or URLComponents (RFC-clean by construction). **Source:** TODO A15.
**Files:**
- `VerityPost/VerityPost/SupabaseManager.swift:65`
- `VerityPost/VerityPost/KidsAppLauncher.swift:22`
- `VerityPost/VerityPost/SubscriptionView.swift:92, 96`
**Action:** Replace each `!` with `?? URL(string: "https://veritypost.com")!` (known-safe fallback).

### S9-A16 — Reg-wall counter persists across sign-out
🟩 **Shipped** (0a5a192). Counter keyed by `auth.currentUser?.id ?? "_anon"`. **Source:** TODO A16.
**File:** `VerityPost/VerityPost/HomeView.swift:540`.
**Action:** Namespace key by user-id (`vp_articles_viewed_ids_<userId>`). Survives account-switch.

### S9-A36 — `fatalError` on missing Supabase config
🟩 **Shipped** (e063073). configValid Bool + os.Logger fault + ContentView build-config-error gate before any other branch. **Source:** TODO A36.
**File:** `VerityPost/VerityPost/SupabaseManager.swift:38, 41, 47`.
**Action:** Replace `fatalError` with launch-time error screen — `RootView` shows "Build configuration error — contact support@veritypost.com" if config missing. Log to `os_log` with structured fault.

### S9-A37 — Realtime channel leaks on view recreation (5 sites)
🟩 **Shipped** (4748fad). New `RealtimeHelpers.swift` exports `drainRealtimeChannel(_:stream:onChange:)` with detached unsubscribe on both loop-end and onCancel. Migrated subscribeToNewComments, subscribeToConversationUpdates, subscribeToCrossConvoMessages, subscribeToNewParticipants, subscribeToNewMessages, subscribeToReadReceipts (audit cited 5; counted 6th too). **Source:** TODO A37.
**Files:**
- `VerityPost/VerityPost/StoryDetailView.swift:2093-2132` (1 channel)
- `VerityPost/VerityPost/MessagesView.swift:671-747` (4 channels)
**Action:** Build a `subscribeToChannel(client, name, filter)` helper returning `(stream, cleanup)`; always attach cleanup to calling Task's cancellation handler. Migrate all 5 sites.

### S9-A38 — EventsClient device ID semantic ambiguity
🟧 **OWNER-PENDING** — TODO A38. Owner picks (A) reset on uninstall (UserDefaults, document) or (B) continuity via Keychain.
**File when answered:** `VerityPost/VerityPost/EventsClient.swift:45-52`.

### S9-A47-iOS — Banned timeline copy
🟩 **Shipped** (e4fd38c). AlertsView placeholder + ExpertQueueView back-channel both rewritten to present-state ("not available in this build"); no timelines. **Source:** TODO A47 (iOS slice).
**File:** `VerityPost/VerityPost/AlertsView.swift:318` ("Subscription manager coming soon").
**Action:** Rewrite to describe present state OR render unavailable state. No softer-timeline replacement.
**Plus audit `VerityPost/VerityPost/ExpertQueueView.swift:194` for similar.**

### S9-A52-iOS — Brand casing
🟩 **Shipped** (56ceaf7). HomeView + ProfileView mastheads flipped from "verity post" to canonical "Verity Post" Title Case. **Source:** TODO A52 (iOS slice).
**Files:** every Swift file with a brand string. Search `grep -rn "verity post\|verityPost\|VerityPost\|Verity Post" VerityPost/`. Pick "Verity Post" Title Case where user-visible.

### S9-A53-iOS — "Verity Post Kids" vs "Verity Kids" / "Verity" alone
🟩 **Shipped** (56ceaf7). Adult-app slice swept; only "Verity Post Kids" present (FamilyViews kid-product reference). **Source:** TODO A53. **Adult-app slice:**
- `VerityPost/VerityPost/...` — search for "Verity Post Kids" / "Verity Kids" / "Verity" variants. Pick canonical "Verity Post" (or "Verity Post Kids" for kid-product references).
**Kids-app slice goes to S10.**

### S9-A73 — 22 `@StateObject` for shared singletons
🟩 **Shipped** (0d1e706). Mechanical sed across 13 files. Only AuthViewModel() (truly View-owned) stays @StateObject; ArticleRouter.shared in App scope flipped to @ObservedObject too. **Source:** TODO A73.
**Files:** `HomeView.swift`, `MessagesView.swift`, `ProfileView.swift`, plus 19 others.
**Action:** Mechanical swap: `@StateObject` → `@ObservedObject` for any property assigned `.shared`. One PR.

### S9-A74 — Password show/hide toggle dismisses keyboard
🟩 **Moot — superseded by Q2-iOS** (ce42012). Password fields (and the Hide/Show toggle) deleted from LoginView + SignupView. There is nothing left to fix. **Source:** TODO A74. **Note:** Under Q2 (magic-link), there are no passwords. This item is moot once Q2 ships. **Drop unless Q2 is delayed.**

### S9-A75 — AnswerComposerSheet TextEditor a11y label
🟩 **Shipped** (e4fd38c). `.accessibilityLabel("Answer this question")` on the TextEditor. **Source:** TODO A75.
**File:** `VerityPost/VerityPost/ExpertQueueView.swift:424-427`.
**Action:** `.accessibilityLabel("Answer this question")`.

### S9-A76 — AlertsView empty-state cluster a11y
🟩 **Shipped** (e4fd38c). `.accessibilityElement(children: .combine)` + unified `.accessibilityLabel`. **Source:** TODO A76.
**File:** `VerityPost/VerityPost/AlertsView.swift:159-177`.
**Action:** `.accessibilityElement(children: .combine)` with unified label.

### S9-A77 — Bookmark realtime subscription missing
🟩 **Shipped** (228cbfd). INSERT + DELETE channel subscription on `bookmarks` filtered by user_id. INSERT triggers full re-load to pick up the joined article+categories shape; DELETE drops the row immediately. Cleanup owned by withTaskCancellationHandler with detached unsubscribe hops. **Source:** TODO A77.
**File:** `VerityPost/VerityPost/BookmarksView.swift:267-284`.
**Action:** Subscribe to bookmarks INSERT/DELETE filtered by `user_id`. Use the helper from A37.

### S9-A78 — TTS reads markdown raw
🟩 **Shipped** (5cc213b). `stripMarkdownForTTS` static helper preprocesses links, bold/italic, inline code, heading prefixes via regex before AVSpeechUtterance. **Source:** TODO A78.
**File:** `VerityPost/VerityPost/StoryDetailView.swift:734`.
**Action:** Strip markdown via regex preprocessor before `AVSpeechUtterance`. At minimum: `[text](url)` → `text`, `**text**` → `text`, `__text__` → `text`.

### S9-A79 — `onChange` deprecated single-param form (5 sites)
🟩 **Shipped** (d186395). Audit cited 5 sites; current code only had 2 deprecated single-param forms (MessagesView 350 + 862); the AlertsView/ProfileView/VerityPostApp sites already use the new no-arg or two-param form. Both deprecated forms updated. **Source:** TODO A79 (corrected to 5 sites in sixth-pass).
**Files:**
- `VerityPost/VerityPost/MessagesView.swift:856, 350`
- `VerityPost/VerityPost/AlertsView.swift:120`
- `VerityPost/VerityPost/ProfileView.swift:219`
- `VerityPost/VerityPost/VerityPostApp.swift:77`
**Action:** `.onChange(of: X) { _, _ in ... }`. One PR.

### S9-A80 — StoreManager doesn't post `vpSubscriptionDidChange` after foreground re-check
🟩 **Shipped** (d186395). `checkEntitlements` diffs the active SKU set vs purchasedProductIDs and posts `.vpSubscriptionDidChange` on change. **Source:** TODO A80.
**File:** `VerityPost/VerityPost/StoreManager.swift:250-263`.
**Action:** Post `Notification.Name.vpSubscriptionDidChange` whenever `activeIDs != purchasedProductIDs`.

### S9-A81 — WelcomeView.complete retries onboarding stamp once with no backoff
🟩 **Shipped** (d186395). 3-attempt retry (initial + 2 retries) with 500ms / 1.5s backoff before flipping `stampError`. **Source:** TODO A81.
**File:** `VerityPost/VerityPost/WelcomeView.swift:255-301`.
**Action:** 2x retry with 500ms / 1.5s backoff before showing failure UI.

### S9-A82 — StoryDetailView.loadData uses `try?` on 3 critical reads
🟩 **Shipped** (5cc213b). Bookmark check + quiz_attempts read converted to throwing `try` with explicit catch; not-found (PGRST116 / "no rows") still treated as legitimate empty case; other failures propagate to `loadError`. Comment-vote reads stay best-effort per the audit's split. **Source:** TODO A82.
**File:** `VerityPost/VerityPost/StoryDetailView.swift:1986, 1991, 2041`.
**Action:** Propagate errors to a `loadError` state for paths affecting persisted state (bookmark, quiz pass). Comment votes can stay best-effort.

### S9-A83 — EventsClient.AnyCodable.decode falls through to NSNull
🟩 **Shipped** (d186395). Decode path tries Bool first (so `true` doesn't promote to `Int(1)`) then Int/Double/String, and throws `DecodingError` on any unsupported shape (the persistence layer already deletes the file on a decode failure, so unsupported batches drop explicitly instead of becoming ghost rows). Encode unchanged. **Source:** TODO A83.
**File:** `VerityPost/VerityPost/EventsClient.swift:122-152`.
**Action:** Make encode-only (delete `init(from:)`). Encode-only is simpler given current usage.

### S9-A118 — iOS bookmark cap-check race condition
🟩 **Shipped** (5cc213b). iOS pre-count dropped end-to-end. `attemptBookmark` collapsed; `toggleBookmark` parses the server's 403 `error: "bookmark_cap_exceeded"` reply into the upgrade affordance. **Source:** TODO A118.
**File:** `VerityPost/VerityPost/StoryDetailView.swift:2282-2286`.
**Action:** Drop the iOS pre-check. Trust the server trigger; on failure parse the P0001 error and surface upgrade affordance.

### S9-A119 — iOS bookmarks list hardcoded `.limit(200)`
🟩 **Shipped** (134bcfd). pageSize=50 + cursor-based pagination on created_at; first page probes pageSize+1 to know whether to render Load-more; `loadMore()` uses oldest current item's created_at as `lt` cursor. Dedupe by id handles realtime/page-fetch races. **Source:** TODO A119.
**File:** `VerityPost/VerityPost/BookmarksView.swift:276`.
**Action:** Implement load-more pagination mirroring web's cursor pattern. At minimum, "Showing 200 of N" footer linking to web.

### S9-A120 — iOS bookmarks no delete confirmation
🟩 **Shipped** (134bcfd). `.confirmationDialog` on Remove tap with article title in body; Confirm queues the optimistic remove; Cancel dismisses. **Source:** TODO A120. Bundle with A121.
**File:** `VerityPost/VerityPost/BookmarksView.swift:183-190`.

### S9-A121 — iOS bookmarks no undo
🟩 **Shipped** (134bcfd). Optimistic remove + 5s undo banner pinned to bottom; Undo cancels the queued delete Task and restores the row at its original index. Stacked removes commit the prior pending one immediately. **Source:** TODO A121.
**File:** same as A120.
**Action:** Mirror web's 5s undo. Optimistic remove from list, queue delayed task, cancel on undo tap.

### S9-A122-resolved — iOS comment report CSAM categories
🟩 **Already shipped Q3a.** No work.

### S9-A123 — iOS comments no edit affordance
🟩 **Shipped** (4fdb6fd). Edit button gated on `comments.edit.own` permission + own authorship; inline TextEditor with Cancel/Save; PATCH /api/comments/[id]; server still owns the edit window. (edited) label rendered in the byline row when `is_edited=true`. **Source:** TODO A123.
**File:** `VerityPost/VerityPost/StoryDetailView.swift` (comment row UI).
**Action:** Add edit affordance + PATCH call. Gate on `comments.edit.own` permission. Mirror web's edit window.

### S9-A124 — iOS comment realtime listens INSERT only
🟩 **Shipped** (4fdb6fd). UpdateAction added to the comments channel; handler decodes the comment id, re-fetches the joined shape, replaces the existing row in the comments array. Both Action types ride one channel via withTaskGroup; cleanup owned by withTaskCancellationHandler. **Source:** TODO A124.
**File:** `VerityPost/VerityPost/StoryDetailView.swift:2193-2232`.
**Action:** Add `UpdateAction` to realtime channel. Handler decodes the comment, finds existing row in `comments` state, replaces it.

### S9-A125 — iOS comment threading silent truncation at 3
🟧 **OWNER-PENDING** — TODO A125. Owner picks (A) match web full depth, (B) cap with "Continue this thread →" affordance.
**File when answered:** `VerityPost/VerityPost/StoryDetailView.swift:1297`.

### S9-A126 — iOS Comment model missing soft-delete + mentions fields
🟩 **Shipped** (4fdb6fd). VPComment extended with `deletedAt`, `status`, `isEdited`, `contextTagCount`, `mentions: [Mention]`. Computed `isDeleted` flips on deleted_at / status ∈ {removed, hidden_by_user}. Tombstone "[deleted]" italic render path; (edited) label; mention runs split via `splitOnMentions` static helper (longest-first match + word-boundary trailing-edge check), rendered as accent-color semibold inline runs. Both select queries (initial load + realtime fan-out) updated to pull the new columns. **Source:** TODO A126.
**File:** `VerityPost/VerityPost/Models.swift:297-342`.
**Action:** Extend `VPComment` to decode `deleted_at`, `status`, `is_edited`, `mentions`, `context_tag_count`, `is_context_pinned`. Add `[deleted]` tombstone render path. Add mention rendering (tap → profile route).

### S9-T25 — Topic/category alerts iOS UI
🟨 **Source:** TODO2 T25. Cross-surface; S1 owns schema, S5 owns subscription API routes, S9 owns the iOS UI half.
**File:** `VerityPost/VerityPost/AlertsView.swift:300` — currently `manageSubscriptionsEnabled = false`.
**Action when S1 + S5 land:**
- Flip the flag.
- Build subscription-management UI: list categories the user is subscribed to, add/remove rows via `/api/alerts/subscriptions`.
- Empty-state copy from T29 (if extant) or new copy.
**Wait for:** S1-T25 schema applied + S5-T25 routes shipped.

### S9-Q3b-iOS — Kid JWT issuer flip iOS coordination
🟨 None — adult app doesn't mint or hold kid JWTs.

---

## Out of scope

- Web (S3, S4, S5, S6, S7, S8).
- Kids iOS (S10).
- Server-side auth contract (S3).

## Final verification

- [ ] Build succeeds in Xcode.
- [ ] All `force-unwrap` URLs replaced with safe fallbacks.
- [ ] No `Color(hex:)` parser failures produce black.
- [ ] Realtime helper used at 5 channel sites.
- [ ] Magic-link signup works end-to-end on simulator.
- [ ] Commits tagged `[S9-Annn]` or `[S9-Tnnn]`.
