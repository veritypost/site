# Verity Post — Code Review Report

Architect-led review. Each PM appends findings under their own `## PM-N — <name>` section.

## Finding format (every entry uses this)

```
### [P0|P1|P2|P3] <one-line title>
- File: <path>:<line>
- Issue: <what is wrong>
- Evidence: <short quote or symbol from current file>
- Impact: <user/system consequence>
- Suggested fix: <concrete change>
- Verified by: <subagent or check that confirmed it on disk>
```

## Severity
- **P0** — crash, data loss, auth bypass, payment bug, RLS hole, COPPA violation
- **P1** — broken user flow, dead-end UX, wrong data shown, race condition with user-visible effect
- **P2** — polish, copy, a11y, dark-mode, minor inconsistency
- **P3** — nice-to-have

## Rules every PM follows
1. Verify against the actual file on disk before logging a finding. Quote the line.
2. Ignore stale md notes at repo root; the code is source of truth.
3. Kill-switched surfaces (see `CLAUDE.md` Kill-Switch Inventory): do NOT flag missing functionality. DO flag broken chrome on the disabled surface itself, prefixed `[KILL-SWITCHED]`.
4. Don't recommend deletes/renames without grepping for callers.
5. If a finding can't be verified, drop it — no speculation.

---

## PM-2 — Web-AppShell

Review scope: signed-in user surfaces (`/browse`, `/search`, `/category`, `/following`, `/leaderboard`, `/[slug]`, `/story`, `/card`, `/r`, `/recap`, `/bookmarks`, `/notifications`, `/messages`, `/expert-queue`, `/profile/*`, `/u`, `/mockup-explore`, `/ideas`), `web/src/components/` (non-admin), and the UI-side `web/src/lib/*` helpers.

Total findings: **15** (P0: 1 · P1: 5 · P2: 8 · P3: 1)

### [P0] `/[slug]` passes inline `onClick` from server to client component (crashes every COPPA article)
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/[slug]/page.tsx:369-377`
- Issue: The page is a server component (`export default async function ArticleSlugPage`, no `'use client'` at top). It builds the `engagementSlot` JSX and passes it to `ArticleReaderTabs` (a `'use client'` component, verified at `/Users/veritypost/Desktop/verity-post/web/src/components/article/ArticleReaderTabs.tsx:1`). Inside that JSX is an `<a onClick={(e) => { ... window.location.href = ...; setTimeout(...) }}>` for the COPPA "Open in Verity Kids" button. Functions cannot be serialized across the RSC boundary.
- Evidence:
  ```tsx
  isCoppa ? (
    <div ...>
      ...
      <a
        href={`veritypostkids://story/${story.slug}`}
        onClick={(e) => {
          e.preventDefault();
          window.location.href = `veritypostkids://story/${story.slug}`;
          if (process.env.NEXT_PUBLIC_KIDS_APP_URL) {
            setTimeout(() => { window.location.href = process.env.NEXT_PUBLIC_KIDS_APP_URL!; }, 800);
          }
        }}
        ...
      >
  ```
- Impact: Every kids/tweens article (`age_band` in `('kids','tweens')` or `is_kids_safe = true`) triggers Next.js's "Functions cannot be passed directly to Client Components" error at SSR. Page returns 500; reader never sees the kids edition.
- Suggested fix: Extract the `<a onClick=...>` block into a tiny client component (e.g. `KidsAppOpenButton.tsx` with `'use client'`) that accepts `slug` as a string prop, and render that here instead of inline JSX. Even simpler: drop the JS handler entirely — the `href="veritypostkids://..."` already deep-links on iOS; the JS only adds the App Store fallback timeout, which can move into the new client component.
- Verified by: Read of `/[slug]/page.tsx` (no `'use client'`), Read of `ArticleReaderTabs.tsx` line 1 confirming it is `'use client'`.

### [P1] `/search` — `?q=` URL param hydrates input but never auto-runs the search
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/search/page.tsx:72-84`
- Issue: On mount, the URL-init effect populates `q`, `category`, `from`, `to`, `source` state and even sets `hasInteracted = true`, but never calls `runSearch()`. The user lands on `/search?q=foo` and sees the populated input but zero results until they re-click Search.
- Evidence: Lines 72-84 set state inside `useEffect(..., [])`. `runSearch()` is only invoked from form submit (line 236) or filter `onKeyDown` (lines 308, 319, 331). No effect chains state → fetch.
- Impact: Every shared / bookmarked search URL is dead. SEO + share-link UX broken; users assume results are empty.
- Suggested fix: After the URL-init effect resolves, if `urlQ` is non-empty and `permsReady && canView`, call `runSearch()`. Add an effect that fires once `canView` is hydrated and `q.trim()` is non-empty on first paint.
- Verified by: Direct read of `search/page.tsx`. `runSearch` is the only fetch path and only called from form/keyboard handlers.

### [P1] `/messages` — DM paywall focus-trap activates whenever it would render, even with no overlay container
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/messages/page.tsx:208-211`
- Issue: `useFocusTrap(!canCompose && dmLocked === false && !dmPaywallDismissed, dmPaywallRef, ...)` is called every render. The condition is recomputed local-to-the-hook (line 209), independent of the `showDmPaywall` value computed AFTER the early loading/error returns at lines 814-891. If `loading` is true, the page returns early at 814, but the hook has already attached the focus trap with a `dmPaywallRef` whose `.current` is null. `useFocusTrap` returns `undefined` when `containerRef.current` is null (line 44 of `lib/useFocusTrap.js`) so this is safe, BUT — the comment at line 207-211 says "Hooks must run on every render, so we declare them above any early return." Correct intent. However, when the paywall flips open after loading resolves, the FIRST render with the paywall mounted has `dmPaywallRef.current === null` because refs attach after render — focus trap fails to focus the dismiss button on initial open. After a tick the trap re-runs (no, it doesn't — `useEffect` only re-runs on dep changes).
- Evidence: `useFocusTrap` deps are `[isActive, containerRef]` (line 100 of `useFocusTrap.js`). Container ref never changes identity, so the effect runs once when `isActive` flips true → at that exact tick `dialogRef.current` may not be set. Subsequent renders don't re-attach the trap.
- Impact: First-time DM paywall open: focus stays on whatever the user was last focused on (likely the underlying body); Tab can escape the modal.
- Suggested fix: Use `useLayoutEffect` inside the focus-trap hook instead of `useEffect`, OR add a tiny delay (`queueMicrotask(() => focusables[0]?.focus())`) to ensure the dialog DOM is mounted before the initial focus.
- Verified by: Read of both files; the paywall renders inside a `showDmPaywall` block that's behind early-return loading branches, and `dialogRef={dmPaywallRef}` is set on the modal's inner div at line 937.

### [P1] `BookmarkButton` — no unbookmark path; once saved, button is dead
- File: `/Users/veritypost/Desktop/verity-post/web/src/components/BookmarkButton.tsx:75-98, 104, 117`
- Issue: After a successful POST to `/api/bookmarks`, `setBookmarked(true)`. The button is then `disabled={busy || bookmarked}` (line 104) with cursor `default`. No DELETE pathway. The user can only un-save by going to `/bookmarks` and clicking Remove there.
- Evidence: The `handleBookmark` function only POSTs (line 80). The button label flips to "Saved" but is non-interactive.
- Impact: Mistaken bookmarks (very common — small button next to other engagement controls) cannot be undone in-context. Compare `category/[id]/page.js` which DOES toggle (line 188 — checks `story.bookmarked && story.bookmark_id` and calls DELETE).
- Suggested fix: Track the bookmark id from the POST response, and when `bookmarked` is true, route a click to a DELETE call against `/api/bookmarks/${bookmarkId}`. Mirror the toggle pattern in `category/[id]/page.js:178-218`.
- Verified by: Read of `BookmarkButton.tsx`; cross-checked with the category page which has working toggle.

### [P1] `NavWrapper` — unread-notification dot is dead code; never renders
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/NavWrapper.tsx:371-383, 599`
- Issue: `navItems` for both anon and signed-in users contains exactly four entries: Home, Browse, Active Stories, and Profile (or Sign up). There is no `/notifications` entry. Line 599 reads `const showDot = item.href === '/notifications' && unreadCount > 0;` — the equality is always false, so the unread badge never appears.
- Evidence: Lines 371-383 enumerate the nav items; `/notifications` is absent. Line 599 keys the dot to that exact href.
- Impact: Signed-in users with unread notifications get NO nav-level visual indicator. The 60s `unreadCount` poll (lines 287-318) is wasted bandwidth.
- Suggested fix: Either add `{ label: 'Inbox', href: '/notifications' }` to both nav arrays, or relocate the unread dot to the Profile slot (where /notifications is reachable through the SPA shell). Right now the polled value lights up nothing.
- Verified by: Direct read; navItems arrays explicit.

### [P1] `/u/[username]` kill-switch flag contradicts CLAUDE.md inventory
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/u/[username]/page.tsx:22`
- Issue: CLAUDE.md kill-switch table line 1 lists `/u/[username]` as kill-switched at `PUBLIC_PROFILE_ENABLED = false` (re-enable by flipping to true). The actual flag value in code is `const PUBLIC_PROFILE_ENABLED = true;`. The kill-switch is OFF (i.e. profiles are live).
- Evidence: `grep -n PUBLIC_PROFILE_ENABLED u/[username]/page.tsx` returns the literal `const PUBLIC_PROFILE_ENABLED = true;`.
- Impact: Either CLAUDE.md is stale, or the flag was flipped without intent. Doc/code drift on a kill-switch is itself a bug — owner consults CLAUDE.md to decide what's hidden. Per CLAUDE.md rule "the code is source of truth", profiles ARE live, but the doc misrepresents it.
- Suggested fix: Owner decision — either flip code back to `false` or update CLAUDE.md kill-switch row 1 to reflect that profiles are live. Same applies to row 2 (`/profile/[id]`) which redirects to `/u/...`.
- Verified by: Bash grep; profile page renders the full UI when flag is true.

### [P2] `RegistrationWall` — primary CTA reads "Sign up — free" but routes to `/login`
- File: `/Users/veritypost/Desktop/verity-post/web/src/components/RegistrationWall.tsx:206, 220`
- Issue: The button text says `Sign up — free` but the `href` is `/login?next=...`. Verity uses single-door auth (login page handles signup), but the user clicks "Sign up" and lands on a "Sign in" UI — confusing.
- Evidence:
  ```tsx
  <a ref={firstFocusRef} href={`/login?next=${next}`} ...>Sign up — free</a>
  ```
- Impact: New users may bounce because they think they hit the wrong page. Also, `/signup` exists as a real route (used elsewhere).
- Suggested fix: Either change `href` to `/signup?next=${next}`, or change copy to match the destination ("Sign in to continue" / "Continue").
- Verified by: Direct read; cross-checked with `/u/[username]` Q1 hero (lines 336/354) which correctly uses `/signup?next=...` for "Sign up" and `/login?next=...` for "Sign in".

### [P2] `/category/[id]` — `<Suspense>` has no fallback, `useSearchParams` may bail SSG
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/category/[id]/page.js:727-733, 22`
- Issue: The page uses `useSearchParams()` at line 22 (inside `CategoryPageInner`). The wrapper uses `<Suspense>` with no fallback at line 729: `<Suspense><CategoryPageInner /></Suspense>`. Next 14 warns/errors when `useSearchParams` is used without a Suspense boundary that has a fallback.
- Evidence:
  ```js
  export default function CategoryPage() {
    return (
      <Suspense>
        <CategoryPageInner />
      </Suspense>
    );
  }
  ```
- Impact: Build-time warnings and missing UX during the prerender bailout — the user sees a blank screen during the search-params load.
- Suggested fix: Provide a `fallback={<div>Loading…</div>}` or a tiny skeleton matching the existing loading state.
- Verified by: Direct read; matches the pattern that `messages/page.tsx` and `search/page.tsx` correctly handle (with explicit fallback).

### [P2] `CommentComposer` — double-submit race window before `setBusy(true)` lands
- File: `/Users/veritypost/Desktop/verity-post/web/src/components/CommentComposer.tsx:240-304, 444-455`
- Issue: `submit()` checks `if (!trimmed || busy) return;` then `setBusy(true)`. Between two rapid clicks, both calls can pass the guard before either commits the React state update. The Post button's `disabled={!body.trim() || busy}` race-condition-suppresses the second click only after the re-render. On a slow network, hitting Enter then Tab+Space (mobile keyboard accessory) double-posts.
- Evidence: Standard React state-update timing; the `if (busy) return` is checking stale state from closure.
- Impact: Duplicate comments. Server may dedupe via `friendlyError`, but no idempotency key is sent.
- Suggested fix: Use a `useRef<boolean>(false)` flag set synchronously before the async work, or rely on an ` { Idempotency-Key: <uuid> }` header (already used by `AddKidUpsellModal` line 140 — would standardize the pattern).
- Verified by: Direct read; same pattern present in many `submit()` functions across the codebase, but Composer is highest-traffic.

### [P2] `/leaderboard` — `myRank` derived from non-blocked `users`, but display message says `visibleUsers.length`
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/leaderboard/page.tsx:423-430, 497-499`
- Issue: `setMyRank` (line 428) calculates rank against `users` (raw fetched list), not `visibleUsers` (post-block-filter list). When the viewer has blockers ahead of them in the rankings, their displayed rank is OFF by however many blockers were filtered out. The user sees `#5` but the page shows only `visibleUsers.length` rows, and #1-#3 may be filtered.
- Evidence:
  ```tsx
  const i = users.findIndex((u) => u.id === me.id);
  setMyRank(i >= 0 ? i + 1 : null);
  ```
  Filter applied at line 418: `const visibleUsers = blockedIds.size === 0 ? users : users.filter(...)`.
- Impact: Inconsistent — the UI shows "Your rank: #5" but the visible top-3 list might exclude entries 2 and 4 (blocked). The user can't reconcile the number with what they see.
- Suggested fix: Calculate rank against `visibleUsers` (which the comment at line 421 says is the intent: "filter is applied BEFORE rank computation so myRank reflects what the viewer sees" — but the implementation reads `users`, not `visibleUsers`).
- Verified by: Direct read of lines 418, 423-430. Comment intent and implementation diverge.

### [P2] `/messages` — chat-header report dialog `onClick={(e) => e.stopPropagation()}` blocks Esc/click-outside dismiss inconsistently
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/messages/page.tsx:1410-1430`
- Issue: The report modal backdrop dismisses on click via the outer div's `onClick`. The inner `role="dialog"` calls `e.stopPropagation()` on click, which is correct. BUT no `useFocusTrap` is installed for this modal (compare the DM paywall which has one). Tab key can move focus outside the modal; Esc isn't bound.
- Evidence: Lines 1410-1505. No `useFocusTrap`, no Esc handler. Backdrop click works.
- Impact: A11y dead-end on the report-user dialog — keyboard-only users may not be able to escape it cleanly. Also doesn't trap focus.
- Suggested fix: Wrap with `useFocusTrap(showReportDialog, reportDialogRef, { onEscape: () => { setShowReportDialog(false); setReportReason(''); } })`. Mirror the DM paywall pattern at line 209.
- Verified by: Direct read; cross-referenced with paywall hook usage at line 209.

### [P2] `Notifications` — Mark-all-read PATCH route + body shape, but client uses POST shape
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/notifications/page.tsx:148-166`
- Issue: `markAllRead` PATCHes `/api/notifications` with body `{ all: true, mark: 'read' }`. This is a fairly unusual contract — usually `POST /api/notifications/mark-all-read` or `PATCH /api/notifications?all=1`. Without auditing the route (out of scope), the contract surface is fragile: if the route key changes, no compile-time error.
- Evidence: Lines 151-155.
- Impact: Decoupled body shape from route surface; minor — but if the API shape evolves silently, the client breaks without typed errors.
- Suggested fix: This is a client/API contract suggestion — would be cleaner with a typed wrapper. Out of pure UI scope; flagging for awareness.
- Verified by: Direct read.

### [P2] Multiple pages call `createClient()` without `useMemo` — supabase identity churns each render
- Files:
  - `/Users/veritypost/Desktop/verity-post/web/src/components/CommentThread.tsx:104` — `const supabase = createClient();`
  - `/Users/veritypost/Desktop/verity-post/web/src/app/expert-queue/page.tsx:91` — same
  - `/Users/veritypost/Desktop/verity-post/web/src/app/notifications/page.tsx:119` — fresh in effect (acceptable)
  - `/Users/veritypost/Desktop/verity-post/web/src/app/recap/[id]/page.tsx:149` — fresh in callback (acceptable)
  - `/Users/veritypost/Desktop/verity-post/web/src/app/category/[id]/page.js:24` — `const supabase = createClient();`
- Issue: Comment in `messages/page.tsx:130-136` documents this exact bug and explicitly fixes it with `useMemo(() => createClient(), [])`. Other components have the same render-identity churn but without the memo. Effects with `[supabase, ...]` in their dep array re-run on every render; effects without it capture a stale client across token refresh.
- Impact: Subtle realtime / auth-stale bugs as documented in the messages comment. Most effects don't include `supabase` in deps, so the actual harm is minimal — but they're skating on the same ice messages was, before that fix.
- Suggested fix: Standardize on `const supabase = useMemo(() => createClient(), []);` in every client component that holds a long-lived client; document as a lint rule or codemod.
- Verified by: Direct read of each file; cross-referenced with the explicit fix comment in `messages/page.tsx:130-136`.

### [P2] `ArticleSurface` — inline mouseEnter/Focus/Blur handlers mutate `style.outline` directly
- File: `/Users/veritypost/Desktop/verity-post/web/src/components/article/ArticleSurface.tsx:182-193`
- Issue: The Upgrade/Sign-in CTA on the locked-body branch attaches `onMouseEnter`, `onMouseLeave`, `onFocus`, `onBlur` and directly mutates `e.currentTarget.style.filter` and `style.outline`. This works at runtime but bypasses React's CSS-in-JS pattern; CSS-only `:hover` and `:focus-visible` rules are simpler and more performant. Also, `e.currentTarget.matches(':focus-visible')` inside `onFocus` is fragile — focus-visible behavior is browser-determined; the JS check duplicates what CSS already handles.
- Evidence: Lines 182-193 use raw DOM mutation.
- Impact: Minor — works fine, but a React anti-pattern that future maintainers will copy.
- Suggested fix: Replace with a single `<style>{`.cta-link:hover { filter: brightness(0.88); } .cta-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`}</style>` and remove the JS handlers.
- Verified by: Direct read.

### [P3] `/profile/[id]` server-side redirect chains lose the search params
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/profile/[id]/page.tsx:18`
- Issue: When a user lands on `/profile/<id>?tab=followers` it redirects to `/u/<username>` without preserving the `?tab=followers`. (`/u/[username]` reads `tab` from local state, not URL — so this isn't a hard break, but the link's intent is lost.)
- Evidence: `redirect(`/u/${data.username}`)` — no query string forwarded.
- Impact: Bookmarked deep-links lose context.
- Suggested fix: Forward `searchParams` to the redirect target.
- Verified by: Direct read.

---

### Summary

- **Total findings: 15** (P0: 1, P1: 5, P2: 8, P3: 1)
- **Top 3 P0/P1 (most urgent):**
  1. **P0 — `/[slug]` server→client function-prop crash on every COPPA article** (single fix-pass: extract a `KidsAppOpenButton` client component)
  2. **P1 — `/search?q=` URL hydrates input but never auto-runs search** (every shared search link is dead)
  3. **P1 — `/u/[username]` kill-switch flag is `true` while CLAUDE.md says `false`** (doc/code drift on a launch-critical surface; owner needs to confirm intent)

### Items outside PM-2 scope (flagged for routing)

- **PM-4 / API:** I did not audit the `/api/*` routes. The Notifications PATCH-with-`{all:true,mark:'read'}` contract should be reviewed by PM-4 for shape/auth.
- **PM-5 / Billing:** The DM paywall renders billing-adjacent UI (Verity tier card, Upgrade button → `/profile/settings#billing`). Visual-shell fine; pricing-source-of-truth and Stripe redirect is PM-5's call.
- **iOS / Swift:** The `veritypostkids://story/...` deep-link is referenced from the slug page (P0 above). Whether the iOS Universal Link is correctly registered is iOS-team scope.
- **Supabase migrations:** The `public_profiles_v` view, `leaderboard_period_counts` RPC, `start_conversation` RPC, and `user_passed_article_quiz` RPC are all referenced; existence/contract correctness is supabase-migrations scope.


## PM-7 — iOS-Kids

Lead reviewer: PM-7 (kid safety + COPPA elevated care).
Scope: every `.swift` + `Info.plist` + entitlements file in `/Users/veritypost/Desktop/verity-post/VerityPostKids/VerityPostKids/`.
Subagents dispatched: bug-hunter-security, adversary, bug-hunter-flow, bug-hunter-runtime (PM ran each pass directly against on-disk source).
Method: read every file, traced every parental-gate caller, cross-checked against COPPA + Apple Kids Category guidance.

### Inventory (24 Swift + 3 metadata)

- `VerityPostKidsApp.swift` (entry, onOpenURL handler stub)
- `KidsAppRoot.swift` (root + scene queue + tab routing)
- Auth/Pair: `KidsAuth.swift`, `PairingClient.swift`, `PairCodeView.swift`
- App state: `KidsAppState.swift`, `Models.swift`, `SupabaseKidsClient.swift`
- Reader/Quiz: `KidReaderView.swift`, `KidQuizEngineView.swift`, `ArticleListView.swift`
- Surfaces: `ProfileView.swift`, `LeaderboardView.swift`, `ExpertSessionsView.swift`, `TabBar.swift`
- Scenes: `GreetingScene.swift`, `StreakScene.swift`, `BadgeUnlockScene.swift`, `QuizPassScene.swift`
- Primitives: `KidPrimitives.swift`, `KidsTheme.swift`, `KidsAuth.swift`, `CountUpText.swift`, `FlameShape.swift`, `ParticleSystem.swift`
- Gate: `ParentalGateModal.swift`
- Metadata: `Info.plist`, `VerityPostKids.entitlements`, `PrivacyInfo.xcprivacy`

### Totals

- P0: 1
- P1: 6
- P2: 6
- P3: 0

### Parental-gate audit table

Every adult-context code path. `Gated?` = does this path run through `ParentalGateModal` before doing the sensitive thing?

| # | Surface | Action | Trigger | File:Line | Gated? | Notes |
|---|---------|--------|---------|-----------|--------|-------|
| 1 | ProfileView | Unpair device (sign out / forget Keychain) | "Unpair this device" button | ProfileView.swift:48–50, 132 | YES | `.parentalGate(isPresented: $showUnpairGate)` then `auth.signOut()`. Correct. |
| 2 | ProfileView | Open Privacy Policy (external https://veritypost.com/privacy) | About row tap | ProfileView.swift:51–56, 73–74, 89–93 | YES | `pendingLegalURL` set, then `showLegalGate=true`, then `UIApplication.shared.open` runs only inside the `.parentalGate { ... }` closure. Correct. |
| 3 | ProfileView | Open Terms of Service (external) | About row tap | ProfileView.swift:51–56, 77–78, 89–93 | YES | Same code path as Privacy. Correct. |
| 4 | PairCodeView | Open mailto: support email | "Need help?" button | PairCodeView.swift:124–135, 149–156 | YES | `showHelpGate = true` then `mailto:` only fires inside `.parentalGate { ... }` closure. Correct. |
| 5 | ExpertSessionsView | Browse "live conversations with experts" (adult-contact discovery) | Tab open + first-tap "Ask a grown-up" | ExpertSessionsView.swift:30–88, 146–149 | YES, but session-only | `parentGatePassed` is `@State` (line 17). Resets to `false` on every `tabbedApp` reconstruction; not persisted. Comment at line 14–16 says "session-sticky"; verified — once gate passes, the kid can re-enter the Experts tab freely until next cold launch. Acceptable per Apple Kids guidance ("each session"); keep as is. |
| 6 | StreakScene | "Share this" button | After streak milestone | StreakScene.swift:183, 193 | NO ACTION (dead button) | `onShare` defaulted to `nil`; KidsAppRoot passes only `previous/current/milestone/onDone` (KidsAppRoot.swift:187–192). Tapping does nothing. Not a bypass — but P1 broken UX (see finding P1-K2). |
| 7 | BadgeUnlockScene | "Share" button | After badge unlock | BadgeUnlockScene.swift:200–210 | NO ACTION (dead button + scene unreachable) | KidsAppState.completeQuiz returns `badge: nil` always (KidsAppState.swift:260); BadgeUnlockScene is only ever instantiated in the `#Preview` block. Production runtime never reaches this Share button. P1 dead feature (see P1-K3). |
| 8 | QuizPassScene | "Share result" button | Quiz pass result card | QuizPassScene.swift:229–237 | NO ACTION (entire scene unused) | `QuizPassScene` is not referenced from any production callsite — only `#Preview` (line 353). The result UI shipped in `KidQuizEngineView.successBody` does NOT have a Share button. P2 unused-code (see P2-K3). |
| 9 | VerityPostKidsApp | onOpenURL deep-link handler | Universal Link / custom scheme | VerityPostKidsApp.swift:13–27 | N/A (intentional no-op) | Logs + drops; comment explicitly says "stub" until real routes wired. Acceptable. |
| 10 | (No StoreKit / IAP / SKProduct anywhere in target) | n/a | n/a | n/a | n/a | Confirmed via grep: zero StoreKit/IAP imports in VerityPostKids/. Apple Kids Category compliant — no payment surface to gate. |

**Net:** Live, real-money / leave-app paths (#1–#5) are correctly gated. The three `onShare` buttons (#6–#8) don't bypass — they're inert UI that confuses kids. Findings below.

### P0 (1)

#### [P0] Color(hex:) returns highly visible fuchsia sentinel in production for unparseable hex strings
- File: `VerityPostKids/VerityPostKids/KidsTheme.swift:118–124, 131, 146`
- Issue: When a DB-driven `color_hex` value (e.g. from `categories.color_hex` consumed by `loadCategoryOptions` in LeaderboardView.swift:328–336) fails to parse, `Color(hex:)` returns `Color(.sRGB, red: 1.0, green: 0.0, blue: 0.8, opacity: 1.0)` — bright magenta — and ships that to the kid's UI in production.
- Evidence:
  ```
  // K9: previous implementation returned black on any parse failure with
  // no signal. ...
  // Now: log the bad input + return a highly visible fuchsia sentinel
  // so unparseable strings show up in dev instead of blending into a
  // dark surface. Production fallback is still a concrete color (no
  // crash, no blank view).
  private static let hexParseFallback: Color = Color(
      .sRGB,
      red: 1.0,
      green: 0.0,
      blue: 0.8,
      opacity: 1.0
  )
  ```
- Impact: Comment claims fuchsia is "for dev" but the implementation is unconditional — there's no `#if DEBUG` guard. A single bad row in `categories.color_hex` (admin typo, future migration drift) puts a flashing magenta block in front of kids in TestFlight + App Store builds. Apple Kids Category review will reject a UI that shows obviously broken styling. Severity P0 because (a) it's user-visible to children and (b) it's in the launch-blocking review path.
- Suggested fix: Wrap the fuchsia + `print` in `#if DEBUG`; production builds fall back to `K.dim` (or a neutral category gradient). Same for both `print` paths at lines 131 + 146.
- Verified by: PM-7 direct file read; grep confirmed no `#if DEBUG` wraps the fallback. The two callsites that pass DB-driven hex (`Achievement.iconName` mapping in KidPrimitives, `VPCategory.colorHex` consumed by LeaderboardView pills) both flow through this initializer.

### P1 (6)

#### [P1-K1] `KidsAppState.didOptimisticallyIncrementStreak` is never reset after a successful server-confirmed sync, causing legitimate streak resets to be silently discarded
- File: `VerityPostKids/VerityPostKids/KidsAppState.swift:97, 116–121, 253`
- Issue: `didOptimisticallyIncrementStreak` is set to `true` on a passing quiz (line 253), reset to `false` only at the start of `loadKidRow()` (line 97). Inside `loadKidRow` the guard at line 116 says: "if we incremented optimistically AND server's incoming streak is lower, discard server value (server trigger may not have fired yet)." Order of operations: line 97 sets flag false → server query → line 116 checks flag (which is now false). The flag flip happens *before* the read, so the guard at line 116 is **never true** — the optimistic-protection branch is unreachable.
- Evidence:
  ```swift
  private func loadKidRow() async {
      guard !kidId.isEmpty else { return }
      didOptimisticallyIncrementStreak = false   // line 97
      ...
      let row: Row = try await client.from("kid_profiles")...
      let incoming = row.streak_current ?? 0
      if didOptimisticallyIncrementStreak && incoming < self.streakDays {
          // discard — server hasn't caught up
      } else {
          self.streakDays = incoming
      }
  ```
- Impact: Either the protection is dead code (kid sees streak rollback on every foreground if server trigger lags) OR the flag should be checked before the reset. Pre-A91 path: kid finishes quiz → streak goes 6→7 in UI → app foregrounds → loadKidRow runs → flag flips to false → server returns 6 (trigger not fired) → kid sees 7→6 rollback. Comment at lines 113–117 says protection is intentional — implementation breaks it.
- Suggested fix: Move `didOptimisticallyIncrementStreak = false` to AFTER the `self.streakDays = incoming` write, OR snapshot the flag before the reset:
  ```swift
  let wasOptimistic = didOptimisticallyIncrementStreak
  didOptimisticallyIncrementStreak = false
  let row: Row = try await ...
  if wasOptimistic && incoming < self.streakDays { /* discard */ } else { self.streakDays = incoming }
  ```
- Verified by: PM-7 direct read of KidsAppState.swift lines 95–129.

#### [P1-K2] StreakScene "Share this" button is dead — taps no-op
- File: `VerityPostKids/VerityPostKids/StreakScene.swift:183–192` and `KidsAppRoot.swift:187–192`
- Issue: `StreakScene.onShare` is `(() -> Void)? = nil` (declaration at line 19). KidsAppRoot constructs the scene without passing `onShare:` (line 187: only `previous`, `current`, `milestone`, `onDone`). The Share button at line 183 calls `onShare?()` which silently does nothing.
- Evidence:
  ```swift
  // KidsAppRoot.swift:187
  StreakScene(
      previous: prev,
      current: cur,
      milestone: milestone,
      onDone: { activeSheet = nil }
  )
  // StreakScene.swift:183
  Button(action: { onShare?() }) {
      Text("Share this")
      ...
  }
  ```
- Impact: Kid hits a milestone, sees a celebration, taps "Share this", nothing happens. Habit-loop demotivator on the very surface designed to celebrate. Either wire a real share sheet (with parental gate per Apple Kids Category review) or remove the button.
- Suggested fix: For launch — remove the Share button from StreakScene's `milestoneCard`. Post-launch — wire `onShare` in KidsAppRoot to a parental-gated `UIActivityViewController` showing a kid-name-stripped achievement card.
- Verified by: PM-7 direct trace of caller.

#### [P1-K3] BadgeUnlockScene is unreachable in production — `KidsAppState.completeQuiz` always returns `badge: nil`
- File: `VerityPostKids/VerityPostKids/KidsAppState.swift:240–262` (especially line 260)
- Issue: The streak/badge celebration chain in KidsAppRoot.handleQuizComplete (lines 243–272) checks `outcome.badge` (line 266) and enqueues a BadgeUnlockScene if non-nil. But `completeQuiz` always sets `badge: nil` (line 260). No client-side or server-side code path produces a non-nil badge.
- Evidence:
  ```swift
  // KidsAppState.swift:240–262
  func completeQuiz(passed: Bool, score scoreDelta: Int) -> QuizOutcome {
      ...
      return QuizOutcome(
          previousStreak: oldStreak,
          newStreak: streakDays,
          milestone: milestoneForCurrentStreak,
          badge: nil    // line 260 — always nil
      )
  }
  ```
- Impact: Kids will never see a badge unlock animation (BadgeUnlockScene with shimmer + pulse rings + 50-particle confetti). Achievements awarded in `user_achievements` are visible in ProfileView's BadgeTile grid (correct), but the user-facing real-time celebration the codebase invests heavily in (BadgeUnlockScene.swift is 354 lines) never plays. Either wire it (query `user_achievements` for new rows on quiz pass + dispatch the scene) or delete the scene file.
- Suggested fix: Either (a) post-quiz, query `user_achievements` for rows earned since the previous load and construct a BadgeUnlockScene from the achievement metadata, or (b) delete `BadgeUnlockScene.swift` and the associated extension at KidsAppRoot.swift:363–365.
- Verified by: PM-7 grep — only `BadgeUnlockScene(` constructor is in the `#Preview` block at line 347.

#### [P1-K4] iOS reads `kid_profiles.display_name` for leaderboard but pair-flow only stores `kid_name` — Family/Global leaderboards may show generic "Reader" instead of the kid's name
- File: `VerityPostKids/VerityPostKids/LeaderboardView.swift:202, 219, 248, 262` and `Models.swift:13–61` and `PairingClient.swift:14–19, 280`
- Issue: Family + Global leaderboard queries select `display_name` from `kid_profiles` and fall back to "Reader" if null (LeaderboardView.swift:219, 262). The pair API response only carries `kid_name` (PairingClient.swift:14–19) which is persisted to UserDefaults under `kidNameKey` and returned via `auth.kid?.name` for the Profile header — but the *server-side* `kid_profiles.display_name` column is the one the leaderboard reads. If parents haven't set `display_name` (default workflow may leave it null and only populate `name`), every kid in the family appears as "Reader" in their own family leaderboard.
- Evidence:
  ```swift
  // LeaderboardView.swift:248–266 (loadFamily)
  struct FamilyRow: Decodable {
      let id: String
      let display_name: String?
      ...
  }
  ...
  self.entries = rows.enumerated().map { i, r in
      LeaderboardEntry(
          id: r.id,
          name: r.display_name ?? "Reader",
          ...
      )
  ```
- Impact: Family leaderboard with three siblings shows "Reader / Reader / Reader" — every kid sees themselves as "Reader" too (loadCategory at line 300 uses `auth.kid?.name` instead, which IS populated, so Category scope works). UX inconsistency + identity confusion. Verify: server's pair endpoint (web-side) — does the schema for `kid_profiles` populate `display_name` from `name` on creation?
- Suggested fix: Fall back through `display_name → name` server-side (column default `coalesce(display_name, name)`), OR change the Decodable to ask for both columns and prefer non-empty. PM-7 cannot verify the server side without that scope; flagging for owner / PM-3 (web) cross-check.
- Verified by: PM-7 direct read; cross-check needed against schema.

#### [P1-K5] Streak-card tap on Home opens StreakScene with `previous == current`, animates 0pt count change
- File: `VerityPostKids/VerityPostKids/KidsAppRoot.swift:170–172`
- Issue: When the kid taps the streak card on home (no quiz just completed), `presentStreak(previous: state.streakDays, current: state.streakDays)` is invoked (line 171). Both arguments equal the current streak. StreakScene then runs its full choreography animating from N to N — `AnimatedCountUp(from: previous, to: current)` is a no-op, but the rings + glow + particle burst all play, so the kid sees a "celebration" with no apparent reason and no number change.
- Evidence:
  ```swift
  // KidsAppRoot.swift:170–172
  onStreakTap: {
      presentStreak(previous: state.streakDays, current: state.streakDays)
  },
  ```
- Impact: Streak card tap is supposed to be a "show me my streak detail" interaction; instead it replays the celebration. Either change to a static streak-detail sheet, or just don't celebrate on tap. Owner intent (KidsAppRoot.swift:8 comment: "Tap streak card → StreakScene") suggests a deliberate replay; if so, the milestone card slide-up + share button (also dead) make this confusing.
- Suggested fix: Either build a separate `StreakDetailSheet` (calendar of read days, current vs best, freeze count from kid_profiles.streak_freeze_remaining) or no-op the tap. The current behavior is half-built.
- Verified by: PM-7 direct read.

#### [P1-K6] `KidQuizEngineView` blocks the entire flow when the article-safety pre-flight fetch errors — kid loses every quiz on flaky networks
- File: `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:355–374`
- Issue: The pre-flight `is_kids_safe` verification fails closed: ANY exception (including transient network errors during the safety check) routes to `blockedNotKidsSafe = true` (line 371) and shows the kid-friendly "This story isn't available right now" body. Server-side RLS ALSO enforces `is_kids_safe = true` on the kid JWT, so the second query (the actual `quizzes` fetch at line 376) would fail closed too. Result: a network blip during the safety check makes the kid believe an article is unsafe + offers "Back" — they'll abandon, then the quiz engine never gets a chance to retry the safety check.
- Evidence:
  ```swift
  // KidQuizEngineView.swift:357–374
  do {
      let safetyRows: [ArticleSafety] = try await client
          .from("articles").select("is_kids_safe")
          ...
      if safetyRows.first?.is_kids_safe != true {
          blockedNotKidsSafe = true
          questions = []
          return
      }
  } catch {
      // If we can't verify, fail closed — refuse to load the quiz.
      blockedNotKidsSafe = true
      questions = []
      return
  }
  ```
- Impact: A momentary network error on the safety pre-flight (which happens before the quiz fetch) puts the kid on a misleading "unsafe content" screen for content that's actually fine, with no retry. Different from `errorState` (which has a retry button). The "fail closed" comment is right for "unsafe was returned" but wrong for "couldn't reach server" — those are distinct outcomes.
- Suggested fix: Distinguish "server returned not-safe" (block, no retry) from "couldn't reach server" (route to `errorState` with retry). Set a separate flag in the catch branch:
  ```swift
  } catch {
      self.loadError = "Couldn't load quiz"  // routes to errorState with retry
      self.questions = []
      return
  }
  ```
- Verified by: PM-7 direct read of lines 355–374; cross-checked errorState path at lines 1045–1067 has retry; notKidsSafeState at 405–427 only has Back.

### P2 (6)

#### [P2-K1] PairingClient persists `kid_name` to UserDefaults (PII at rest with no protection)
- File: `VerityPostKids/VerityPostKids/PairingClient.swift:281`
- Issue: `UserDefaults.standard.set(success.kid_name, forKey: kidNameKey)` writes the kid's display name to UserDefaults, which is stored unencrypted in the app's preferences plist. UserDefaults is readable by any backup tool, jailbreak utility, or restore-to-new-device flow. The token is correctly stored in Keychain (line 295–310, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`) — the kid's *name* should be too, or at least not in UserDefaults.
- Evidence:
  ```swift
  // PairingClient.swift:280–282
  UserDefaults.standard.set(success.kid_profile_id, forKey: kidIdKey)
  UserDefaults.standard.set(success.kid_name, forKey: kidNameKey)
  UserDefaults.standard.set(success.expires_at, forKey: expiresKey)
  ```
- Impact: Low real-world risk because the kid's first name alone isn't a critical leak vector, but Apple Kids Category + COPPA review can flag persistent PII in unprotected storage. PrivacyInfo.xcprivacy (lines 11–37) declares `NSPrivacyCollectedDataTypeUserID` and `NSPrivacyCollectedDataTypeOtherUserContent` as linked data — keeping that match in storage hardening is consistent.
- Suggested fix: Move `kid_name` into Keychain alongside the token. `kid_profile_id` is also worth moving since it's a stable user identifier. Alternative: hash + truncate the name client-side after pair, store only the hash + first letter; PairCodeView/Profile already render initial-letter in some places.
- Verified by: PM-7 direct read.

#### [P2-K2] `URL(string:)!` force-unwraps in two places — comment explicitly defends them but they're still build-time risk
- File: `VerityPostKids/VerityPostKids/SupabaseKidsClient.swift:46` and `VerityPostKids/VerityPostKids/ProfileView.swift:18`
- Issue: Both use `URL(string: <literal>)!`. SupabaseKidsClient.swift:46 is the `placeholderURL` ("https://placeholder.invalid") used as a fallback; ProfileView.swift:18 is the legal-fallback URL. Comments at both sites argue "literal can't fail" — true today, but a future refactor copy-pasting interpolation in (e.g. region-specific URL) crashes the kids app on cold launch with no recovery.
- Evidence:
  ```swift
  // SupabaseKidsClient.swift:46
  private static let placeholderURL: URL = URL(string: "https://placeholder.invalid")!
  // ProfileView.swift:18
  private static let fallbackLegalURL = URL(string: "https://veritypost.com")!
  ```
- Impact: Defensive — no current bug. P2 because the kids app's "no force-unwraps" hardening rule (genuine_fixes_not_patches memory) applies and these are the last two `!` in the target.
- Suggested fix: `URL(string: "...") ?? URL(fileURLWithPath: "/")` mirroring the pattern at SupabaseKidsClient.swift:121.
- Verified by: PM-7 grep; only these two force-unwraps remain in /VerityPostKids/.

#### [P2-K3] `QuizPassScene.swift` is dead code (entire 370-line file is unused)
- File: `VerityPostKids/VerityPostKids/QuizPassScene.swift` (entire file)
- Issue: `QuizPassScene` has zero production callsites — only the `#Preview` at line 353. The actual quiz result UI shipped is `KidQuizEngineView.successBody` (KidQuizEngineView.swift:896–936). The two render different content (QuizPassScene shows score ring + chip highlight + confetti; successBody shows seal/checkmark + threshold text).
- Evidence: `grep -rn "QuizPassScene(" VerityPostKids/` returns one match — the preview at QuizPassScene.swift:353.
- Impact: ~13 KB of compiled binary doing nothing; future maintainers may waste time updating the wrong file. Either wire it or delete it.
- Suggested fix: Delete `QuizPassScene.swift` (and its `Answer` struct). The `successBody` in KidQuizEngineView is the chosen result UI per A93 + A41 server-driven verdict pattern.
- Verified by: PM-7 grep.

#### [P2-K4] `KidsAppState.completeQuiz` writes to local `verityScore` and `quizzesPassed` even when the server hasn't confirmed — but KidsAppRoot's `writeFailures > 0` guard runs *after* `completeQuiz`
- File: `VerityPostKids/VerityPostKids/KidsAppRoot.swift:243–272` and `KidsAppState.swift:240–262`
- Issue: `handleQuizComplete` checks `result.writeFailures == 0` (line 246) BEFORE calling `state.completeQuiz`. Good. But the comment at lines 238–242 says "verityScore, quizzesPassed, streakDays must not mutate unless the server confirmed the attempt persisted." The actual implementation does block on `writeFailures` first, so the guard works — but only because it's in KidsAppRoot, not KidsAppState. A future caller of `state.completeQuiz` without the writeFailures guard (e.g. a unit test, a debug code path, a test harness) would mutate score without server confirmation.
- Evidence:
  ```swift
  // KidsAppRoot.swift:246–251
  guard result.writeFailures == 0 else {
      print("[KidsAppRoot] quiz completion had \(result.writeFailures) persistence failure(s); skipping state update and celebration scenes")
      sceneQueue = []
      activeSheet = nil
      return
  }
  let outcome = state.completeQuiz(passed: result.passed, score: scoreDelta)
  ```
- Impact: Defensive — defense-in-depth would put the writeFailures guard inside `completeQuiz` itself, taking the result struct (or a `writeFailures: Int` arg). Today the guard is one-deep and removable by anyone editing the parent.
- Suggested fix: Change `completeQuiz`'s signature to take `KidQuizResult` and short-circuit on writeFailures internally; KidsAppRoot still owns the scene-queue clear, but the state mutation can't accidentally happen.
- Verified by: PM-7 direct read of both files.

#### [P2-K5] `KidQuizPendingHydrator` retry runs forever for permanently-bad writes — no max-attempt cap, only "next launch" retries
- File: `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:152–203`
- Issue: The hydrator drains pending writes once per launch, removing successful ones from disk. On failure it leaves the entry on disk for next launch. There's no attempt counter — a write that's permanently rejected by the server (e.g. RLS denied because the kid was unpaired and re-paired with a different kid_profile_id; quiz_id no longer exists; article_id deleted by moderation) will retry on every cold launch forever.
- Evidence:
  ```swift
  // KidQuizEngineView.swift:176–186
  Task.detached {
      for write in queued {
          let ok = await Self.send(client: client, write: write)
          guard ok else { continue }   // failures stay queued forever
          ...
      }
  }
  ```
- Impact: Disk grows unbounded over time if the kid hits a sticky-fail write, then runs the kid app for months. JSON file lives in Application Support so won't trigger storage warnings, but it's still a slow leak. Also a privacy concern — a kid's old quiz answers may persist on disk indefinitely after their pair-code changed.
- Suggested fix: Add `attemptCount: Int` to `PendingQuizWrite` (bump persistence version to 2). Drop entries after N attempts (e.g. 5) — log + remove. PendingPersistence.save sees the count grow past N and drops.
- Verified by: PM-7 direct read of hydrator + persistence.

#### [P2-K6] Reader paragraph splitting on `"\n\n"` mishandles single-newline paragraphs
- File: `VerityPostKids/VerityPostKids/KidReaderView.swift:75–87`
- Issue: `body_.components(separatedBy: "\n\n")` assumes the editor or kids_summary content uses double-newline paragraph breaks. If the kids editor saves single-newline (`\n`) breaks (common from web textareas, copy-paste from HTML), the article renders as one wall of text. SwiftUI Text would have rendered them as soft breaks, but the explicit split + paragraph-spacing recipe punishes any non-double-newline content.
- Evidence:
  ```swift
  // KidReaderView.swift:75–78
  let paragraphs = body_
      .components(separatedBy: "\n\n")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  ```
- Impact: Depends on what `kids_summary` content actually looks like in production. PM-7 can't verify without DB sample. If editors use `<br>` or single-newline, kids see a wall of text.
- Suggested fix: Split on a regex `\n+` so any newline density produces paragraph breaks; alternatively render markdown if editors author in markdown.
- Verified by: PM-7 direct read; needs sample of `articles.kids_summary` to confirm impact severity.

### Out-of-scope notes (for the architect)

- **No StoreKit / IAP code in target** — Apple Kids Category compliant by absence. `Purchase`, `SKProduct`, etc. all return zero matches.
- **No realtime subscriptions** — `Realtime`, `channel`, `.subscribe` all zero matches; no kid-to-kid leak vector via realtime.
- **No push notifications wired** — `UNUser`, `Notifi`, `APN` all zero matches in /VerityPostKids/. No kid-to-stranger comms path.
- **No web views** — `WKWebView`, `UIWebView`, `SFSafariViewController` all zero matches. Only outbound is `UIApplication.shared.open` (gated, per audit table above).
- **No DOB collection** — pair flow uses pair-code only; KidProfile.dateOfBirth model field exists (Models.swift:21) but is not written from the iOS app, only read for server-derived band logic.
- **PII in logs** — `print()` statements (19 instances) all log error metadata, not kid name / DOB / location. Acceptable for now; consider promoting to `os.Logger` with `.private` redaction before launch.
- **Keychain `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`** — correct (PairingClient.swift:304, 359). Survives iCloud restore-to-new-device only when the user has set up iCloud Keychain — defensible default.
- **Install-id keychain freshness check** (PairingClient.swift:311–320) — correct defense against keychain-survives-app-uninstall leaks. Reviewed against the W.1 comment, behavior matches.

### Architect questions

1. **P1-K4 (display_name vs name)**: needs cross-check with server — does `kid_profiles.display_name` get populated on pair-code redemption, or is it null until parent edits the kids dashboard? PM-3 (web) should be able to confirm in the same review pass.
2. **P0 Color(hex:) fuchsia**: Is the owner's preference to keep the dev sentinel + `#if DEBUG`-wrap, or replace with a neutral color in all builds?
3. **P1-K2 / P1-K3 / P2-K3** (Share buttons + dead BadgeUnlockScene + dead QuizPassScene): are these post-launch features intentionally in-tree, or genuine dead code to delete? Owner memory `feedback_launch_hides.md` says "hide via gates/flags, keep state alive" — but these aren't gated, they're just unwired.


## PM-4 — Web-API-Public

Reviewer: PM-4 (Web-API-Public).
Scope: ~115 route files under `/web/src/app/api/` excluding admin, auth, billing, stripe, ios, cron, newsroom, csp-report, health.
Hunters: security, runtime, flow.

### Summary

| Severity | Count |
|---|---|
| P0 | 4 |
| P1 | 14 |
| P2 | 8 |
| P3 | 2 |
| Total | 28 |

Top P0/P1:
1. P0 — `support/[id]/messages` POST runs against the cookie-anon client (RLS-only); no length cap, no rate limit; relies on RLS to gate cross-ticket writes.
2. P0 — `kids/route.js` POST + `kids/trial/route.js` POST write `display_name` / `avatar_color` / `reading_level` to `kid_profiles` with no length, type, or charset validation. COPPA surface; renders to other kids on family leaderboard.
3. P0 — `events/batch/route.ts` `article_read_complete` loop scores `reading_log` with caller-supplied `article_id`s without per-user/article rate limit beyond the per-IP batch cap; allows authenticated user to inflate own scoring + achievements at ~50 articles/min.
4. P1 — `comments/[id]/route.js` PATCH self-edit window bypass when `created_at` parses to NaN (e.g., DB-injected non-ISO value); `Number.isFinite(createdAt)` is false → window check is skipped → edit is allowed past the 10-minute cap.

Routes lacking auth, rate-limit, OR meaningful length caps (writes only):

| Route | Method | Missing |
|---|---|---|
| `support/route.js` | POST | rate limit; subject/description length caps |
| `support/[id]/messages/route.js` | POST | rate limit; body length cap; uses anon-cookie client (RLS-only) |
| `expert/queue/[id]/answer/route.js` | POST | rate limit |
| `expert/queue/[id]/decline/route.js` | POST | rate limit |
| `expert/answers/[id]/approve/route.js` | POST | rate limit |
| `expert-sessions/[id]/questions/route.js` | POST | question_text length cap; rate limit |
| `expert-sessions/questions/[id]/answer/route.js` | POST | answer_text length cap (10000 already exists); rate limit |
| `recap/[id]/submit/route.js` | POST | rate limit |
| `stories/read/route.js` | POST | rate limit; readPercentage / timeSpentSeconds type+range validation |
| `supervisor/opt-in/route.js` | POST | rate limit; UUID validation on category_id |
| `supervisor/opt-out/route.js` | POST | rate limit; UUID validation on category_id |
| `kids/route.js` | POST | display_name / avatar_color / reading_level length caps |
| `kids/[id]/route.js` | PATCH | per-field length / type validation |
| `kids/trial/route.js` | POST | display_name / avatar_color length caps; rate limit |
| `kids/[id]/streak-freeze/route.js` | POST | rate limit |
| `follows/route.js` | POST | UUID validation on target_user_id |
| `expert/apply/route.js` | POST | input length validation on bio/full_name/organization/title (relies on RPC) |

---

### [P0] support/[id]/messages POST writes via anon-cookie client; no rate-limit, no body length cap

- File: web/src/app/api/support/[id]/messages/route.js:43-87
- Issue: POST handler calls `createClient()` (cookie-scoped anon client) and then INSERTs into `ticket_messages`. There is no service-client write, no rate limit, no body length cap. Authority is entirely RLS. If RLS on `ticket_messages` is misconfigured or future-modified, any authed user could append messages to any ticket. The ownership precheck on `support_tickets` reads through the same anon client (also RLS-bound) so it is not defence-in-depth — both checks are the same trust path.
- Evidence: `const supabase = await createClient(); ... const { data, error } = await supabase.from('ticket_messages').insert({ ticket_id: params.id, sender_id: user.id, is_staff: false, body: body.trim() })` (lines 46, 64-72).
- Impact: RLS-only authorization on a cross-user write. Reply body has no length cap (50 KB JSON parse limit only — bypassable via large UTF-8 strings). No rate limit.
- Suggested fix: switch to `createServiceClient()` for the write but keep an explicit `.eq('ticket_id', params.id)` ownership check on the previously fetched ticket; cap body to 8000 chars; add a per-user 30/min rate limit keyed on `support-msg:${user.id}`.
- Verified by: read of file (lines 1-98) confirms cookie-client usage and absence of rate limit / length cap.

### [P0] kids/route.js POST + kids/trial/route.js POST accept unbounded display_name/avatar_color/reading_level

- File: web/src/app/api/kids/route.js:64-100; web/src/app/api/kids/trial/route.js:54-99
- Issue: `display_name`, `avatar_color`, and `reading_level` are written directly into `kid_profiles` with no length, type, or charset validation. `display_name` renders on family leaderboard, kid pickers, push notifications. A malicious parent can write a 1 MB string, control characters, or HTML.
- Evidence: `kids/route.js` line 188-201 — `display_name: b.display_name`, no validation. Same in `kids/trial/route.js` line 92-98 (passed to `start_kid_trial` RPC).
- Impact: Storage abuse (no Postgres column cap if `text`), display breakage on leaderboards/family UI, PII overflow. COPPA surface — kid metadata visible to other paired kids on the leaderboard.
- Suggested fix: add `if (typeof b.display_name !== 'string' || b.display_name.trim().length === 0 || b.display_name.length > 50) return 400`; same for avatar_color (regex `/^#[0-9a-f]{6}$/i`); reading_level enum check matching the DEFAULTS list in `family/config/route.js`.
- Verified by: read of both files; no length checks in the POST path.

### [P0] events/batch article_read_complete loop allows scoring inflation by authed users

- File: web/src/app/api/events/batch/route.ts:318-353
- Issue: For each authed batch, every event with `event_name === 'article_read_complete'` and a UUID-shaped `article_id` is inserted into `reading_log` and scored via `score_on_reading_complete`. Per-IP rate limit caps batches at 60/min × 50 events = 3000 events/min. The dedupe via `count: alreadyScored` only prevents re-scoring the SAME article. A user can submit 50 different article_ids per batch and get 50 score events.
- Evidence: lines 318-353 — the loop runs sequentially with no per-user rate limit independent of IP; `await supabase.rpc('score_on_reading_complete', ...)` for each.
- Impact: A user can fake-read 3000 articles/min, inflate verity_score, unlock achievements, climb leaderboards. The scoring system was designed around the `/api/stories/read` rate limit + per-day reading_log dedup, but this endpoint bypasses both.
- Suggested fix: per-user rate limit on `article_read_complete` events specifically (e.g., 60/min); enforce a per-user-per-day cap on completions credited via this endpoint; or require article visit attestation (e.g., started-read event id matched to completion).
- Verified by: trace of the code path in events/batch + comparison with `/api/stories/read` which has no rate limit either but at least has the per-day reading_log dedup.

### [P0] comments/[id] PATCH edit-window bypass when created_at not parseable

- File: web/src/app/api/comments/[id]/route.js:184-190
- Issue: `const createdAt = new Date(existing.created_at).getTime(); if (Number.isFinite(createdAt) && Date.now() - createdAt > EDIT_WINDOW_MS) {...}` — the window check is skipped when `Number.isFinite(createdAt)` is false (NaN, e.g., a non-ISO timestamp value or null). Inverted logic: should be `if (!Number.isFinite(createdAt) || Date.now() - createdAt > EDIT_WINDOW_MS)`.
- Evidence: lines 184-190 quoted above.
- Impact: If a `comments.created_at` ever gets returned as null, an unparseable string (DB type coercion issue), or the row was inserted with a malformed value, the 10-minute self-edit window cap is silently skipped — owner can edit indefinitely.
- Suggested fix: invert the guard. `if (!Number.isFinite(createdAt)) { return 500 'edit_window_check_failed' }` then check `Date.now() - createdAt > EDIT_WINDOW_MS`.
- Verified by: read of file lines 184-190.

### [P1] users/[id]/block POST: params.id interpolated into .or() filter without UUID validation

- File: web/src/app/api/users/[id]/block/route.js:90-93
- Issue: `service.from('follows').delete().or(`and(follower_id.eq.${user.id},following_id.eq.${params.id}),and(follower_id.eq.${params.id},following_id.eq.${user.id})`)` — `params.id` is the URL path parameter and is interpolated into a PostgREST `.or()` filter string with no UUID validation.
- Evidence: lines 90-93.
- Impact: While the FK shape limits write blast radius, the Supabase `.or()` builder accepts comma-delimited parsing — a `params.id` containing PostgREST filter chars (e.g., `,`, parens) could break out of the AND group. Less risky than SQL injection but still defense-in-depth gap.
- Suggested fix: add a UUID regex check at top of the handler before any DB call.
- Verified by: read of file.

### [P1] follows/route.js POST: target_user_id passed to RPC without UUID validation

- File: web/src/app/api/follows/route.js:23-46
- Issue: `target_user_id` from request body is sent directly to `service.rpc('toggle_follow', { p_target_id: target_user_id })` with no UUID shape check.
- Evidence: line 24-25, 42-45.
- Impact: malformed UUIDs produce raw Postgres errors instead of clean 400s; also no defense if RPC accepts text and queries something it shouldn't (RPC signature is uuid, so currently safe — but the boundary check should be there).
- Suggested fix: add `if (!UUID_RX.test(target_user_id)) return 400`.
- Verified by: read of file.

### [P1] stories/read/route.js POST has no rate limit; no validation on readPercentage/timeSpentSeconds

- File: web/src/app/api/stories/read/route.js:21-160
- Issue: No rate limit; `readPercentage` and `timeSpentSeconds` from request body are compared with `>` and saved directly without type/range validation. JS lets a string `"99999"` pass `> existing.read_percentage`. The per-day reading_log dedup limits scoring inflation but not field-pollution.
- Evidence: lines 76-87 — `if (readPercentage != null && readPercentage > (existing.read_percentage || 0)) { updates.read_percentage = readPercentage }`. No `typeof === 'number'` or `0..100` clamp.
- Impact: garbage values written to reading_log; possible scoring trigger oddities (`scoreReadingComplete` may treat string differently); analytics drift.
- Suggested fix: add a per-user rate limit (e.g., 60/min); coerce `readPercentage` to integer 0-100 and `timeSpentSeconds` to integer 0-86400 before comparing/saving.
- Verified by: file read.

### [P1] kids/[id]/route.js PATCH writes whitelisted fields without validation

- File: web/src/app/api/kids/[id]/route.js:44-47
- Issue: `const allowed = ['display_name', 'avatar_color', 'max_daily_minutes', 'reading_level']; for (const k of allowed) if (b[k] !== undefined) update[k] = b[k];` — values are copied straight from request to update without type/length/charset checks.
- Evidence: lines 44-47.
- Impact: same as the kids POST P0 — kid display_name unbounded; max_daily_minutes accepts strings/negative numbers; reading_level accepts arbitrary strings.
- Suggested fix: per-field validators; `display_name` 1-50 chars trimmed; `avatar_color` hex regex; `max_daily_minutes` integer 0-1440; `reading_level` enum membership.
- Verified by: file read.

### [P1] expert-sessions/[id]/questions POST: no length cap, no UUID validation, no rate limit

- File: web/src/app/api/expert-sessions/[id]/questions/route.js:69-120
- Issue: `question_text` written to `kid_expert_questions` with no length cap. `kid_profile_id` from body has no UUID shape check (it's read via `eq` after the lookup, but a malformed value would surface as a Postgres error). No rate limit.
- Evidence: lines 84-119. The check at 100-101 verifies parental ownership but happens after Postgres error potential.
- Impact: a kid with a malicious parent could submit a 1 MB question; admin/expert UI rendering could break; abuse against expert queue moderators.
- Suggested fix: cap `question_text` to 500 chars, validate `kid_profile_id` UUID, add 10/hour per-parent rate limit.
- Verified by: file read.

### [P1] expert-sessions/questions/[id]/answer POST: no answer_text length cap, no rate limit

- File: web/src/app/api/expert-sessions/questions/[id]/answer/route.js:38-81
- Issue: `answer_text` is written to `kid_expert_questions` with no length cap. No rate limit. The route is ownership-scoped (assigned expert OR moderator) so the abuse surface is narrower, but the lack of any cap means a single mis-clicked paste can store arbitrary content.
- Evidence: lines 38-39, 67-74.
- Impact: storage / display abuse on the kid expert UI.
- Suggested fix: cap `answer_text` to 4000 chars, add 30/min rate limit.
- Verified by: file read.

### [P1] expert/queue/[id]/answer POST: no rate limit

- File: web/src/app/api/expert/queue/[id]/answer/route.js:10-48
- Issue: Length cap (10000) is present, but no rate limit. The route uses `expert.answer.submit` permission so the abuser must be an approved expert, but a compromised expert account could spam the queue.
- Evidence: handler has no `checkRateLimit` call (compare to `/api/expert/queue/[id]/claim` which limits at 30/min).
- Suggested fix: add 30/min rate limit per user.
- Verified by: file read.

### [P1] recap/[id]/submit POST: no rate limit

- File: web/src/app/api/recap/[id]/submit/route.js:11-45
- Issue: write endpoint with no rate limit. RPC `submit_recap_attempt` enforces idempotency, but a recap-grade race or scoring-side-effect abuse would still go through.
- Evidence: lines 11-45.
- Suggested fix: add 30/min per-user rate limit.
- Verified by: file read.

### [P1] supervisor/opt-in + opt-out: no rate limit, no UUID validation on category_id

- File: web/src/app/api/supervisor/opt-in/route.js:8-37; web/src/app/api/supervisor/opt-out/route.js:8-37
- Issue: Both routes accept `category_id` without UUID validation and have no rate limit. The RPC will fail on a non-UUID, but at the cost of one DB round-trip per call.
- Evidence: file reads.
- Suggested fix: UUID regex check; 30/min per-user rate limit.
- Verified by: file reads.

### [P1] support/route.js POST: no rate limit, no length caps on subject/description

- File: web/src/app/api/support/route.js:17-59
- Issue: The authed support ticket creation route has no rate limit and no app-layer length cap on `category` / `subject` / `description`. The RPC `create_support_ticket` may enforce internally, but defense-in-depth is missing. Compare to `/api/support/public/route.js` which caps subject 200, description 4000, and rate-limits at 5/hour per IP.
- Evidence: lines 24-46.
- Impact: an authed account can spam the staff queue; large bodies eat moderator-tool render budget.
- Suggested fix: caps to match public route (subject 200, description 4000); per-user rate limit 5/hour.
- Verified by: file read.

### [P1] kids/[id]/streak-freeze: no rate limit

- File: web/src/app/api/kids/[id]/streak-freeze/route.js:8-33
- Issue: write endpoint, no rate limit. `use_kid_streak_freeze` RPC presumably enforces freeze-availability rules, but a runaway client can hammer the RPC.
- Suggested fix: 10/min per-parent rate limit.
- Verified by: file read.

### [P1] expert/apply POST: input passed to RPC without per-field length validation

- File: web/src/app/api/expert/apply/route.js:44-65
- Issue: `bio`, `full_name`, `organization`, `title`, `expertise_areas`, `social_links`, `credentials`, `portfolio_urls`, `sample_responses`, `category_ids` flow straight from body into `submit_expert_application` RPC with no per-field validation. Rate limit (5/hr) is present, length caps are not. Unlike the route's own PATCH (which caps credentials at 600), the POST relies entirely on the RPC.
- Evidence: lines 44-65; PATCH has the 600-char check, POST doesn't.
- Suggested fix: bio 2000, full_name 100, organization 200, title 200; cap arrays to 20 elements each; cap each `sample_responses` entry to 2000; cap `social_links` JSON to 10 keys.
- Verified by: file read.

### [P1] account/sessions/[id] DELETE: only checks `is_current=false`, not session-id binding

- File: web/src/app/api/account/sessions/[id]/route.js:39-55
- Issue: The handler refuses to revoke `is_current=true` sessions but does not verify the `id` belongs to a different session than the caller's. If `is_current` is stale (race between session bookkeeping and a revoke fired from another device), a user could accidentally revoke their own active session — no security impact, but UX pothole. Minor.
- Evidence: lines 40-50.
- Suggested fix: compare `params.id` to the cookie-resolved session id and refuse to revoke self even if `is_current` is stale.
- Verified by: file read.

### [P1] kids/[id]/route.js PATCH error-flow shape

- File: web/src/app/api/kids/[id]/route.js:20-32 (also kids/set-pin, kids/reset-pin, kids/generate-pair-code, kids/verify-pin, kids/trial, etc.)
- Issue: catch block uses redundant block-scoped braces with an unconditional return. The pattern reads as `try { user = ... } catch (err) { { return ... } }` — the inner block is dead structure, hides the fact that `if (err.status)` outside the inner-block branch never runs. Confusing; doesn't correctly distinguish 401 vs unexpected throws (always returns the same 401-or-401 path).
- Evidence: kids/[id]/route.js lines 20-32, repeated across many kids/* and recap routes.
- Impact: an unexpected throw inside `requirePermission` (e.g., RPC outage) is treated as 401 to the client (misleading). Not a security hole — fail-closed — but error-bucket telemetry is wrong.
- Suggested fix: replace with the `comments/route.js`-style pattern: `if (err.status) return ...` else `return 500 'Internal error'`. Also drop the block-braces.
- Verified by: file reads of multiple kids/* routes.

### [P2] ads/serve GET: placement + session_id passed unsanitized to RPC

- File: web/src/app/api/ads/serve/route.js:13-37
- Issue: `placement` query param goes straight into `serve_ad` RPC; `session_id` likewise. No length cap, no shape check. A 10 KB session_id passes.
- Evidence: lines 16-23, 31-37.
- Impact: cache-key bloat, RPC processing cost, but no auth bypass since RPC params are typed.
- Suggested fix: cap `placement` to a 32-char known-shape regex; `session_id` to 100 chars (matching impression POST pattern).
- Verified by: file read.

### [P2] search/route.js source filter: ilike with raw user input

- File: web/src/app/api/search/route.js:43, 113
- Issue: `source = sanitizeIlikeTerm(url.searchParams.get('source'))` strips `,.%*()"'\\` then `service.from('sources').select('article_id').ilike('publisher', `%${source}%`)`. The strip is a list-based filter; a clever input could include `_` (LIKE single-char wildcard) since underscores are not stripped. Compare to `messages/search` which strips `_` explicitly.
- Evidence: line 22-24, 43, 113.
- Impact: enables pattern-scan of publisher field via `_` wildcards; not a data leak (sources are public-readable) but allows query amplification.
- Suggested fix: include `_` in the strip set, matching messages/search pattern.
- Verified by: file read.

### [P2] mention-search GET: ilike with raw user input

- File: web/src/app/api/comments/mention-search/route.js:25-49
- Issue: `q` is trimmed but not sanitized for LIKE metachars. `service.from('users').select(...).ilike('username', `${q}%`)`. Usernames are constrained to `[a-z0-9_]`, but the search term isn't — a user could inject `%` to do a full-table substring scan.
- Evidence: lines 25-26, 47-50.
- Impact: limited (LIMIT 8, paid permission, rate-limited at 60/min); but allows broader scans than intended.
- Suggested fix: strip non-`[a-z0-9_]` chars from `q` after trim+lowercase, before the ilike; or escape the LIKE metachars.
- Verified by: file read.

### [P2] events/batch.ts: clampString returns null on empty trim, but ts schema permits empty fields elsewhere

- File: web/src/app/api/events/batch/route.ts:68-73
- Issue: minor — `clampString` returns null on whitespace-only input, which is correct, but combined with downstream logic, an event with an empty `event_category` short-circuits to `null` and gets `rejected_invalid` rather than treated as malformed-shape. Function works as intended; flagging as a contract clarity item.
- Suggested fix: none required — keep behaviour, document.
- Verified by: file read.

### [P2] notifications/route.js PATCH: no max ids cap shared with iOS clients

- File: web/src/app/api/notifications/route.js:9, 100-108
- Issue: `MAX_IDS_PER_PATCH = 200` is enforced (good), but the constant is not surfaced in any settings response. iOS / web client may guess different caps.
- Suggested fix: surface in `/api/settings/public` so clients pre-batch correctly.
- Verified by: file read.

### [P2] family/leaderboard GET: family_owner_id resolved without verifying caller belongs to the family

- File: web/src/app/api/family/leaderboard/route.js:25-34
- Issue: `subRow.family_owner_id` is read from the caller's own subscription row, then used as `ownerId` for `family_members` RPC. If the RPC doesn't itself check the caller's membership, a stale subscription row (e.g., a former family member whose row wasn't cleaned up) could see a leaderboard for a family they no longer belong to.
- Evidence: lines 25-34.
- Impact: minor — depends on RPC enforcement; not a write surface.
- Suggested fix: verify the RPC enforces caller-is-member; if not, add an explicit check here.
- Verified by: file read.

### [P2] family/achievements + family/weekly-report GET: same family_owner_id trust pattern

- File: web/src/app/api/family/achievements/route.js:25-34; web/src/app/api/family/weekly-report/route.js:24-31
- Issue: same pattern as family/leaderboard.
- Suggested fix: same — verify RPC-side enforcement.
- Verified by: file reads.

### [P2] account/data-export idempotent dedup window may not match cron processing window

- File: web/src/app/api/account/data-export/route.js:71-87
- Issue: dedup query checks `status IN ('pending','processing')`. If the cron picks up a row, marks it 'processing', then crashes leaving status 'processing' indefinitely, the user is locked out of new requests until manual intervention.
- Suggested fix: add an `updated_at < now() - interval '1 hour'` clause to consider stale 'processing' rows.
- Verified by: file read.

### [P2] kids-waitlist captureMessage on bot drop: noisy

- File: web/src/app/api/kids-waitlist/route.ts:51-57, 70-77, 82-90
- Issue: every bot UA, honeypot, and too-fast hit calls `captureMessage` (Sentry). At even modest bot scan volume this floods Sentry and obscures real signals.
- Suggested fix: drop the captureMessage; rely on console.log for these expected drops.
- Verified by: file read; same kind of pattern was rolled back in `/api/errors` per its T-073 comment.

### [P3] comments/[id] DELETE admin path comment_count decrement TOCTOU

- File: web/src/app/api/comments/[id]/route.js:262-273
- Issue: admin delete reads `users.comment_count`, decrements in JS, writes back. Race between two admin deletes on different comments by same author can lose a decrement. Self-acknowledged in code: "Admin deletes are rare so the fetch-then-update race window is acceptable."
- Suggested fix: `decrement_field` RPC similar to `incrementField`.
- Verified by: file read.

### [P3] kids/quiz/[id] GET: kid JWT bound to claim, not request

- File: web/src/app/api/kids/quiz/[id]/route.ts:155-188
- Issue: route validates that the kid JWT is structurally a kid token but does not bind `articleId` to the kid's own paired-articles list. Any kid JWT can fetch any kids-safe article's quiz. By design (kids quizzes are public to all kids), but worth flagging.
- Suggested fix: none required; current behaviour matches RLS intent.
- Verified by: file read.


## PM-3 — Web-Admin

Review scope: `web/src/app/admin/**` (50+ pages), `web/src/app/api/admin/**` (108 routes), `web/src/components/admin/*` (26 files), and admin-related lib helpers (`adminMutation.ts`, `permissions.js`, `roles.js`, `permissionKeys.js`, `rlsErrorHandler.js`, `adminPalette.js`, `adminValidation.ts`, `adUrlValidation.js`).

Total findings: **9** (P0: 1 · P1: 4 · P2: 3 · P3: 1)

**Headline:** the admin surface is in unusually good shape — the canonical 8-step mutation order in `adminMutation.ts` is followed by ~95% of routes I sampled (perm gate → service client → rate limit → body parse → outranks gate → mutation → audit → response), no client-side direct DB writes were found from any admin page (`grep "from('.*').delete\|insert\|update\|upsert" web/src/app/admin/**` returned zero hits), and `requirePermission` coverage is universal (1 route uses the older `requireAuth + hasPermissionServer` pattern but it is functionally equivalent there). RBAC findings cluster around (a) one route missing rank+outranks guard, (b) one moderation route conflating four penalty levels under one permission key, (c) one non-atomic role-replace, and (d) the `/ideas/*` middleware "gate" that doesn't actually gate.

### [P0] `/ideas/*` middleware "admin-gate" is a no-auth pass-through, contradicting CLAUDE.md + layout.tsx
- File: `/Users/veritypost/Desktop/verity-post/web/src/middleware.js:159-168`
- Issue: CLAUDE.md kill-switch row 6 says `/ideas/*` is "Middleware admin-gate" — `web/src/middleware.js:165`, "Admin-only; not a public surface". `web/src/app/ideas/layout.tsx:1-5` also documents the surface as gated: "The middleware admin-gate (S3-owned) is the primary access control; this layout adds defense-in-depth `robots: noindex, nofollow`...". The actual middleware code at line 164 short-circuits `/ideas/*` BEFORE any auth check, returning a passthrough `NextResponse.next()` with no role / cookie / Supabase verification.
- Evidence:
  ```js
  // Standalone-preview short-circuit. /ideas/* renders inline sample data
  // with no DB, no auth, no Supabase. Returning early means this surface
  // keeps working even when Supabase env vars aren't configured locally
  if (pathname.startsWith('/ideas')) {
    const passthrough = NextResponse.next();
    passthrough.headers.set('x-request-id', requestId);
    return passthrough;
  }
  ```
- Impact: `/ideas/*` is publicly accessible to any visitor. The content is inline sample data (per `web/src/app/ideas/sampleData.ts`, `feed/sharedData.ts`) so this is not data exfiltration — but it directly contradicts the kill-switch inventory's stated invariant that admin-only preview routes are gated. Any reviewer / journalist / external party who learns the URL gets to see what was supposed to be internal-only design mockups. Defense-in-depth `robots: noindex` is the only remaining barrier — and it's a hint, not enforcement.
- Suggested fix: Either (a) update CLAUDE.md and layout.tsx to reflect that `/ideas/*` is intentionally public (in which case rename the kill-switch row), or (b) move the `/ideas` short-circuit AFTER the layout-style auth check (replicate the `MOD_ROLES` check from `app/admin/layout.tsx` inside middleware for that prefix). Owner decision — but the current state is doc-drift and can leak design surfaces to launch reviewers.
- Verified by: Direct read of `middleware.js:155-180`, `app/ideas/layout.tsx`, `CLAUDE.md` kill-switch row 6.

### [P1] `/api/admin/permission-sets/role-wiring` — wires permission_set to ANY role, no rank check
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/permission-sets/role-wiring/route.js:13-77`
- Issue: This route attaches a permission set to a role (or detaches). It checks `requirePermission('admin.permissions.assign_to_role')` and rate-limits, but never calls `caller_can_assign_role` or `requireAdminOutranks` against `role_id`. Sibling user-role routes (`/api/admin/users/[id]/roles`, `/api/admin/users/[id]/role-set`) BOTH gate on `caller_can_assign_role(p_role_name)` to prevent an admin from granting an owner-only role — but here, role_id is accepted as an opaque UUID and inserted directly.
- Evidence:
  ```js
  const { role_id, permission_set_id, enabled } = body || {};
  if (!role_id || !permission_set_id || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'role_id, permission_set_id, and enabled required' }, { status: 400 });
  }
  // ... no caller_can_assign check ...
  ({ error: err } = await service
    .from('role_permission_sets')
    .insert({ role_id, permission_set_id }));
  ```
- Impact: An actor holding `admin.permissions.assign_to_role` (presumably mid-tier admin) can wire a permission_set into the `owner` role row. If the permission_set contains owner-only permissions like `admin.owner_mode` or `admin.permissions.scope_override`, every owner now has them — and (more dangerously) by chaining with the user_permission_sets path (`/api/admin/users/[id]/permissions` action: `assign_set`), the actor could grant the owner-elevated set to themselves through a different route. Path: edit a permission_set → wire to a role you have → instant escalation.
- Suggested fix: Mirror the `users/[id]/roles` route — look up the role's `hierarchy_level` from `role_id`, then call `caller_can_assign_role` (or the equivalent `caller_outranks_role`) before allowing the wire. If the role outranks the actor, return 403.
- Verified by: Direct read; cross-checked with `users/[id]/roles/route.js:46-62` and `users/[id]/role-set/route.js:45-58` which DO have the check.

### [P1] `/api/admin/users/[id]/role-set` — non-atomic delete-then-insert of user_roles
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/users/[id]/role-set/route.js:90-99`
- Issue: To "set exactly one role" the route does `DELETE FROM user_roles WHERE user_id = X` then `INSERT INTO user_roles (user_id, role_id, ...)` as two separate service-role queries. There is no transaction. If the INSERT fails (FK error, unique violation, transient pool error), the user is left with ZERO roles — no `user`, no nothing — until an admin notices and reassigns.
- Evidence:
  ```js
  const { error: delErr } = await service.from('user_roles').delete().eq('user_id', targetId);
  if (delErr) return safeErrorResponse(NextResponse, delErr, { route: 'admin.role-set:delete' });

  const { error: insErr } = await service.from('user_roles').insert({
    user_id: targetId,
    role_id: roleRow.id,
    assigned_by: actor.id,
  });
  if (insErr) return safeErrorResponse(NextResponse, insErr, { route: 'admin.role-set:insert' });
  ```
- Impact: A user whose role-set call partial-fails sees their RLS access plummet. They can't read their own profile sections that gate on `user`-role permissions. Fix requires admin re-intervention. The window is small (1-2ms between the two queries on a healthy network) but FK violations from concurrent mutations on `roles` would produce silent permanent damage.
- Suggested fix: Move the two-step "replace" into a SECURITY DEFINER RPC `set_user_role_atomic(p_user_id, p_role_name, p_actor_id)` that runs `DELETE` + `INSERT` inside a single transaction. The existing `grant_role` and `revoke_role` RPCs are halfway there; add a `set_role` RPC OR run both statements via `service.rpc('exec', ...)` if exec-arbitrary-SQL exists.
- Verified by: Direct read of route.js; no `BEGIN`/`COMMIT` or single-RPC encapsulation present.

### [P1] `/api/admin/moderation/users/[id]/penalty` — single permission key gates levels 1–4 (warn, mute, mute, BAN)
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/moderation/users/[id]/penalty/route.js:24, 99-104`
- Issue: The route checks `requirePermission('admin.moderation.penalty.warn')` once at the top. The body's `level` field then chooses the penalty (1=warn, 2=24h mute, 3=7d mute, 4=PERMANENT BAN). A grep confirms this is the ONLY penalty permission key referenced anywhere in the codebase — there is no separate `admin.moderation.penalty.ban` or `.mute`. So a moderator granted "the ability to warn" can also issue a permanent ban via the same endpoint.
- Evidence:
  ```js
  user = await requirePermission('admin.moderation.penalty.warn');
  // ...
  const isAuto = level === undefined || level === null || level === 'auto' || level === '';
  let levelNum;
  // ... no per-level permission check ...
  const { data, error } = await service.rpc('apply_penalty', {
    p_mod_id: user.id, p_target_id: params.id, p_level: levelNum, p_reason: reason,
  });
  ```
  And: `grep -rn "admin.moderation.penalty\." web/src` returns ONLY this one line.
- Impact: Granular moderation cannot be expressed in the permission system — a junior moderator with "warn" effectively has "ban". The DB permission catalog presumably has only `.warn`, so admins cannot give a low-trust moderator a non-banning warning power. This is also an audit-trail problem: every penalty is recorded with action `moderation.penalty` regardless of level, but the gating doesn't differentiate.
- Suggested fix: Either (a) introduce per-level keys (`admin.moderation.penalty.warn`, `.mute_24h`, `.mute_7d`, `.ban`) and switch on `levelNum` to pick the right one, or (b) keep the single key but explicitly rename it to `admin.moderation.penalty.apply` and document that warn/mute/ban are inseparable. The current name implies granularity that doesn't exist.
- Verified by: Direct read; bash grep across the entire `web/src` tree confirmed sole reference.

### [P1] `/admin/moderation` — grantRole / revokeRole click directly, no DestructiveActionConfirm
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/admin/moderation/page.tsx:253-285`
- Issue: The moderation console can grant or revoke a role from a target user via single button click. No confirmation dialog. Compare the same page's `penalty(level)` flow at line 287, which DOES use `DestructiveActionConfirm` with `reasonRequired: true`. Server-side outranks check exists, but the UX is one mis-click away from elevating someone to admin or stripping moderator status.
- Evidence:
  ```tsx
  async function grantRole(roleName: string) {
    if (!target) return;
    setBusy(`grant:${roleName}`);
    const res = await fetch(`/api/admin/users/${target.id}/roles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_name: roleName }),
    });
    // ... no confirm dialog opened ...
  }
  ```
- Impact: Mistaken role grants/revokes happen with one click. Audit log captures the action but does not capture intent. Owner DECISIONS-spec implies role changes should follow the DestructiveActionConfirm pattern.
- Suggested fix: Wrap both `grantRole` and `revokeRole` in a `DestructiveActionConfirm` (`reasonRequired: true`, `confirmText: target.username`) — same pattern the page already uses for `penalty(level)`. Server-side audit then receives the operator-attested reason.
- Verified by: Direct read; the file imports `DestructiveActionConfirm` (line 6) and uses it for penalties (line 597) but not for role grants/revokes.

### [P1] `/admin/top-stories` — pin removal calls DELETE with no confirmation
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/admin/top-stories/page.tsx:120-132`
- Issue: `removeSlot(position)` immediately DELETEs the pin at the given homepage position with zero confirmation. Top-story slots are publicly visible on the homepage; an accidental click rewrites what every visitor sees.
- Evidence:
  ```tsx
  const removeSlot = async (position: number) => {
    if (mutating) return;
    setMutating(true);
    const res = await fetch(`/api/admin/top-stories/${position}`, { method: 'DELETE' });
    // ...
  };
  ```
- Impact: One mis-click clears a curated homepage slot. The action is technically reversible (re-pin), but the public homepage is briefly empty in that slot, and any cache layer (CDN/edge) propagates the "deletion" before the admin can re-pin.
- Suggested fix: Add a `ConfirmDialog` (the lighter sibling of `DestructiveActionConfirm`) — it's already imported on `breaking/page.tsx`, `feeds/page.tsx`, `categories/page.tsx`, etc. for similar "are you sure?" guards. `confirmLabel: 'Clear pin'`, `variant: 'danger'`.
- Verified by: Direct read; no `confirm` / `Modal` / `ConfirmDialog` reference in the file.

### [P2] `/api/admin/auth-recovery/[user_id]` — no rate limit on high-impact account-unlock route
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/auth-recovery/[user_id]/route.ts:37-145`
- Issue: This route can `confirm_email`, `clear_verify_lock`, or `clear_login_lock` for a target user. Each action bypasses a security control — `confirm_email` in particular makes the user count as email-verified without their consent and bumps their `perms_version` so 21 perms re-grant. The route correctly checks `requirePermission('admin.users.delete')` and `requireAdminOutranks`, but does NOT call `checkRateLimit`. Per the canonical mutation order in `adminMutation.ts:7`, rate-limit is step 3 after the perm gate; sibling routes (cancel, freeze, ban, refund-decision, etc.) all enforce 10/60s for destructive operations.
- Evidence: Read of the entire file (146 lines). No `checkRateLimit` import, no `rl.limited` check, no 429 path.
- Impact: A compromised admin token could bulk-unlock dozens of accounts in seconds. The `admin.users.delete` permission is a high-trust gate, but rate-limiting is the defense for token-compromise scenarios. Same gap exists on `/api/admin/kids-dob-corrections/[id]/route.ts` POST handler.
- Suggested fix: Add the standard 10/60s rate-limit block from the canonical order — `checkRateLimit(service, { key: 'admin.auth_recovery:${actor.id}', policyKey: 'admin.auth_recovery', max: 10, windowSec: 60 })`.
- Verified by: Direct read; cross-referenced with the canonical pattern in `adminMutation.ts` lines 26-38.

### [P2] `/admin/auth-recovery` page — Postgres OR-filter built from raw user input
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/admin/auth-recovery/page.tsx:65-94`
- Issue: The lookup builds a Supabase `.or()` filter by interpolating `trimmed` user input directly: ``email.ilike.${trimmed}`` or ``username.eq.${trimmed.toLowerCase()},email.ilike.${trimmed}``. Supabase's `.or()` parser uses commas to separate filter conditions. A username containing a comma (e.g. `foo,is_banned.eq.false`) splits into two filters and could alter query semantics.
- Evidence:
  ```tsx
  const filter = trimmed.includes('@')
    ? `email.ilike.${trimmed}`
    : `username.eq.${trimmed.toLowerCase()},email.ilike.${trimmed}`;
  const { data, error } = await supabase.from('users').select(FIELDS).or(filter).limit(1).maybeSingle();
  ```
- Impact: This is admin-side and the result is `.limit(1)` so direct exfiltration is bounded; users-table reads here also pass through admin-context RLS. But the filter is fragile: a username with `*` or `(` or `,` makes the .or() parser misbehave (likely a 400 error, not data leak). The page would show "No user matched" for a perfectly valid lookup.
- Suggested fix: Use parameterized predicate combinators — `.or()` accepts a string but the safer pattern is two separate queries (one by username, one by email), `Promise.all([...])`, take the first non-null result. Or use `.filter('email','ilike',trimmed)` + `.or(...)` chained programmatically without raw interpolation. Same pattern is fine in `users/page.tsx:100-110` which uses paramterized `.or()` differently.
- Verified by: Direct read.

### [P3] `/api/admin/settings/upsert` — accepts arbitrary new keys, no allowlist
- File: `/Users/veritypost/Desktop/verity-post/web/src/app/api/admin/settings/upsert/route.ts:36-72`
- Issue: The route accepts any `key` string and either updates an existing settings row or inserts a new one. There is one defense-in-depth check: `if (existing?.is_sensitive)` blocks updates to sensitive keys. But that check only triggers for EXISTING rows. A typo'd key (`breakng_alert_char_limit` vs `breaking_alert_char_limit`) silently creates a new row that nothing reads — the source data the rest of the app reads from is unchanged. Worse: a maliciously-named new key (e.g. an attacker creates `stripe.webhook.secret = 'xxx'`) lands in the table with no `is_sensitive=true` and no validation.
- Evidence: Lines 54-72 — the upsert is a flat `{ key, value, ... }` insert with no allowlist check; `is_sensitive` defaults to whatever the DB column default is (likely `false`).
- Impact: Operator typos silently no-op (UX confusion); table pollution; possible vector for masquerade-key attacks if any other route does a fuzzy / prefix-match read on `settings`.
- Suggested fix: Maintain an in-code `ALLOWED_SETTING_KEYS` Set (or read from `settings_schema` table if one exists) and 400 on any key not in it. Alternative: enforce key prefixes (e.g. `^[a-z]+\.[a-z_.]+$`) and a max-length cap.
- Verified by: Direct read.

---

### Summary

- **Total findings: 9** (P0: 1, P1: 4, P2: 3, P3: 1)
- **Top 3 P0/P1 (most urgent):**
  1. **P0 — `/ideas/*` middleware "admin-gate" passes through with no auth check**, contradicting CLAUDE.md and `ideas/layout.tsx`. Owner needs to decide: (a) gate it for real, or (b) update the docs to reflect that it's public.
  2. **P1 — `/api/admin/permission-sets/role-wiring` skips `caller_can_assign_role` rank check** — an admin can attach a permission_set to the `owner` role and chain into self-elevation via `users/[id]/permissions` assign_set.
  3. **P1 — `/api/admin/users/[id]/role-set` non-atomic delete-then-insert** — partial failure leaves the user with zero roles. Needs a SECDEF RPC for atomicity.

### RBAC findings (called out separately per the brief)

1. **[P0] `/ideas/*`** — middleware short-circuits before any auth/role check, despite CLAUDE.md + layout.tsx documenting an admin gate. (`middleware.js:164-168`)
2. **[P1] `permission-sets/role-wiring`** — no rank/outranks check on `role_id`, enabling self-escalation chain via permission_set assignment to a higher-tier role. (`route.js:13-77`)
3. **[P1] `moderation/users/[id]/penalty`** — single permission key (`admin.moderation.penalty.warn`) gates all four levels including permanent ban. Granular moderation impossible. (`route.js:24, 99-104`)

### Owner-mode / migration consistency

- Owner mode is honored consistently: `requirePermission` short-circuits for `admin.owner_mode` holders (`auth.js:421-425`), `hasPermissionServer` short-circuits the same way (`auth.js:474-478`), and the client `permissions.js:179, 187, 206, 217` all check `admin.owner_mode` before any narrower key.
- No `@admin-verified` markers reintroduced (per April 2026 drop). `grep -rn "@admin-verified" web/src/app/admin web/src/app/api/admin` returns zero.
- 99 of 108 admin routes (`api/admin/**`) use `requirePermission`. The 9 routes returned by my "no-permission" grep all turned out to be route files that import perms via a different name (`requireAuth`+`hasPermissionServer` style — `billing/audit/route.js`) or are utility routes invoked by other admin routes.

### Items outside PM-3 scope (flagged for routing)

- **PM-9 / pipeline:** I confirmed the pipeline admin API routes (`/api/admin/pipeline/*`) all use the canonical mutation order. Cron handlers (`/api/cron/*`) are PM-9 scope; `pipeline/cleanup/route.ts:124-131` calls them via internal Request — that wiring should be cross-checked.
- **Supabase migrations / RPCs:** The atomicity fix for `role-set` (P1 above) requires a new SECDEF RPC. `caller_can_assign_role` and `require_outranks` are referenced and assumed correct; their bodies are migration scope.
- **iOS:** No iOS scope in admin.
- **CLAUDE.md doc:** Kill-switch row 6 (`/ideas/*`) needs reconciliation with the middleware reality. Either flip the middleware to gate, or rename the row.


---

## PM-1 — Web-Public

Scope: public/anonymous + auth-entry surfaces (login, signup→login redirect, verify-email, welcome graduation, request-access, beta-locked, appeal, logout, marketing/legal pages, `/api/auth/*`, `/api/csp-report`, `/api/health`, `web/src/middleware.js`, lib/auth + lib/cors + lib/session + lib/password + lib/emailNormalize + lib/betaGate + lib/rateLimit + lib/rateLimits + lib/featureFlags + lib/siteUrl + lib/email + lib/botDetect + lib/access*Email + lib/magicLinkEmail + lib/waitlistEmail).

Total findings: **8** (P0: 0 · P1: 3 · P2: 4 · P3: 1)

### [P1] Beta-gate redirect to `/signup` loses the `next` param (broken closed-beta deep links)
- File: web/src/middleware.js:395-405 → web/src/app/signup/page.tsx:1-7
- Issue: When `NEXT_PUBLIC_BETA_GATE=1`, anonymous deep-links to a gated path are 302'd to `/signup?next=<original>` (middleware lines 396-401). `signup/page.tsx` then unconditionally calls `redirect('/login')` with **no** preservation of the `next` query param.
- Evidence:
  ```js
  // middleware.js:396-401
  signupUrl.pathname = '/signup';
  signupUrl.search = '';
  if (pathname !== '/' && pathname !== '/signup') {
    signupUrl.searchParams.set('next', pathname + request.nextUrl.search);
  }
  ```
  ```tsx
  // signup/page.tsx:5-7
  export default function SignupPage() {
    redirect('/login');
  }
  ```
- Impact: Closed-beta deep-linking is broken — every shared/external link to a gated path loses its bounce-back target after auth, and the user is dumped on `/` instead of the intended page. Two redirects per anon request even when no gating is needed.
- Suggested fix: (a) Make middleware redirect directly to `/login?next=...` when betaGate is on, OR (b) read `searchParams.next` in `signup/page.tsx` and forward it onto the `/login` redirect.
- Verified by: Read of middleware.js + signup/page.tsx on disk.

### [P1] `send-magic-link` ban-evasion + existing-user lookups use `.ilike()` with raw email (wildcard match → false positives)
- File: web/src/app/api/auth/send-magic-link/route.js:189, web/src/app/api/auth/send-magic-link/route.js:215
- Issue: Both lookups call `service.from('users').select('…').ilike('email', email).maybeSingle()` with a user-supplied email. PostgreSQL `ILIKE` interprets `_` and `%` as wildcards, so an input like `f_o@bar.com` matches any one-character-prefix email and `.maybeSingle()` throws when >1 row matches. The catch path falls through to `genericOk()`, silently denying the magic link.
- Evidence:
  ```js
  // line 188-194 (ban-check)
  const { data: blocked } = await service
    .from('users')
    .select('id, is_banned, frozen_at, deleted_at')
    .ilike('email', email)
    .maybeSingle();
  ```
  ```js
  // line 213-217 (existing-user check)
  const { data: existing } = await service
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  ```
- Impact: A legitimate user whose local-part contains `_` or `%` can be silently denied magic links because of an unrelated lookalike row; existing-user detection misclassifies the same case. Email normalization at line 148 already lowercases, so `.ilike` adds no real value over `.eq`.
- Suggested fix: Replace both with `.eq('email', email)`. The route header comment confirms `users.email` is stored lowercased and the input is `.toLowerCase()`-folded at line 148.
- Verified by: Read of route.js on disk; lowercasing confirmed at line 148.

### [P1] Graduation password gate enforces length only (skips uppercase/number policy)
- File: web/src/app/welcome/page.tsx:60-69, web/src/app/api/auth/graduate-kid/claim/route.ts:184
- Issue: Both client and server only check `password.length < 10` for the kid-graduation claim. The shared validator `validatePasswordServer` in `lib/password.js` (PASSWORD_MIN_LENGTH=8 + uppercase + number) is never called, so a graduating kid can set `aaaaaaaaaa` as their adult password — weaker than every other signup path on the site and weaker than the policy advertised in `lib/password.js`.
- Evidence:
  ```tsx
  // welcome/page.tsx:60
  if (password.length < 10) { setError('Password must be at least 10 characters.'); … }
  ```
  ```ts
  // claim/route.ts:184
  if (typeof body.password !== 'string' || body.password.length < 10) { … }
  ```
- Impact: Inconsistent password-strength floor; a kid → adult account graduation produces a weaker credential than any direct signup. Surfaces the platform's lowest-strength credential to every kid graduation cohort.
- Suggested fix: Server: import `validatePasswordServer` from `@/lib/password` and reject with `genericClaimError()` if it returns non-null. Client: import `PASSWORD_REQS` and surface the missing rules before submit.
- Verified by: Read of welcome/page.tsx + claim/route.ts + password.js on disk.

### [P2] OAuth callback redirect-then-WelcomeModal pattern can strand new users on a route they cannot use yet
- File: web/src/app/api/auth/callback/route.js:72-79
- Issue: For brand-new OAuth signups (`!existing` branch), the route redirects to the validated `next` (or `/`) and relies on `WelcomeModal` to mount client-side and pick a username. If a user dismisses the modal mid-flow without setting a username, they land on a page that may assume one exists. Currently dormant — `OAUTH_ENABLED=false` (kill-switched at `_SingleDoorForm.tsx:10`).
- Evidence:
  ```js
  // callback/route.js:73-77
  // New users land at their intended destination (or /). WelcomeModal
  // fires automatically on the client when username is still null.
  const validatedNext = resolveNext(rawNext, null);
  const redirectTarget = validatedNext || '/';
  const oauthRedirect = NextResponse.redirect(`${siteUrl}${redirectTarget}`);
  ```
- Impact: Latent — when OAuth is re-enabled, the post-signup redirect-then-modal pattern can leave users stranded.
- Suggested fix: When `existing` is null, redirect to a dedicated onboarding path (e.g., `/?welcome=1`) regardless of `next`, and have `WelcomeModal` route to `next` on completion. Or gate the redirect on `existing.onboarding_completed_at`.
- Verified by: Read of callback/route.js + `_SingleDoorForm.tsx` OAUTH_ENABLED flag.

### [P2] `/verify-email` GET handler does not validate `type` query param before passing to verifyOtp
- File: web/src/app/verify-email/route.ts:16, web/src/app/verify-email/route.ts:28
- Issue: `const type = searchParams.get('type') as 'email_change' | 'email' | null;` is a TypeScript-only cast — the runtime value is whatever the query string supplied. Passed to `supabase.auth.verifyOtp({ token_hash, type })` directly. Supabase rejects unknown types with a runtime error that surfaces as `email_change_failed` in the redirect.
- Evidence:
  ```ts
  const type = searchParams.get('type') as 'email_change' | 'email' | null;
  // ...
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  ```
- Impact: Users hitting a malformed link with e.g. `type=signup` get a confusing failure rather than a guided message. Not a security issue — Supabase enforces server-side — but a polish gap on a confirmation flow.
- Suggested fix: Add `if (type !== 'email_change' && type !== 'email') return redirect('/profile/settings?error=email_change_failed')` before the verifyOtp call.
- Verified by: Read of verify-email/route.ts on disk.

### [P2] `lib/accessRequestEmail.ts` exports a confirm-email template no route consumes (dead code, contradicts current intake design)
- File: web/src/lib/accessRequestEmail.ts:10-39
- Issue: `REQUEST_CONFIRM_TEMPLATE` references a `confirm_url` flow that the actual `/api/access-request` route header explicitly disclaims: "No confirm-email step; the access codes & invite link admin sends on approval are the actual proof-of-control of the inbox." The empty directories `web/src/app/api/access-request/confirm/` and `web/src/app/request-access/confirmed/` are leftover artifacts from that abandoned design.
- Evidence: `grep -rn "REQUEST_CONFIRM_TEMPLATE" web/src/` returns only the export site — no callers.
- Impact: Future agents reading the templates file would assume a confirm-email step exists. Two empty route directories give the same false signal.
- Suggested fix: Delete `lib/accessRequestEmail.ts` and the two empty directories. If the confirm-flow is intentionally parked, add a `// PARKED:` header comment matching the launch-hide pattern.
- Verified by: grep for callers + `ls` of route directories.

### [P2] `/api/access-redeem` uses inline `max: 30, windowSec: 600` literals (violates `lib/rateLimits.ts` central-policy convention)
- File: web/src/app/api/access-redeem/route.ts:39-44
- Issue: The route reads `policyKey: 'access_redeem_ip'` (so a DB row could override) but the code-level fallback is hand-coded. `lib/rateLimits.ts` is the documented single source of truth ("Direct literals … inside route handlers are forbidden — drift across 40+ endpoints is the exact failure mode this lib exists to prevent"). Every other auth-surface route in scope uses `getRateLimitPolicy('…_PER_…')`.
- Evidence:
  ```ts
  const rate = await checkRateLimit(service, {
    key: `access_redeem:ip:${ip || 'unknown'}`,
    policyKey: 'access_redeem_ip',
    max: 30,
    windowSec: 600,
  });
  ```
- Impact: Drift risk — when the next reviewer tunes the cap in rateLimits.ts they will miss this surface; the DB override `access_redeem_ip` policy row is also undocumented.
- Suggested fix: Add `ACCESS_REDEEM_PER_IP: { windowSec: 600, max: 30 }` to `RATE_LIMITS` in `lib/rateLimits.ts`, then `…getRateLimitPolicy('ACCESS_REDEEM_PER_IP')` here.
- Verified by: Read of access-redeem/route.ts + rateLimits.ts on disk.

### [P3] `send-magic-link/route.js` imports `createOtpClient` but never uses it
- File: web/src/app/api/auth/send-magic-link/route.js:64
- Issue: `import { createOtpClient, createServiceClient } from '@/lib/supabase/server';` — only `createServiceClient` is used in this file. The OTP client is constructed in `verify-magic-code/route.ts` instead.
- Evidence: Line 64 import; only `createServiceClient` referenced (line 149) inside this file.
- Impact: Dead import; lint warning if rules tighten. Cosmetic.
- Suggested fix: Drop `createOtpClient` from the import.
- Verified by: grep within the file confirms no usage.

### [KILL-SWITCHED] Note (not a bug): OAuth disabled at `_SingleDoorForm.tsx:10`
- File: web/src/app/login/_SingleDoorForm.tsx:10, used at line 311
- Status: Kill-switch from CLAUDE.md row 4 (`OAUTH_ENABLED = false`). The form renders cleanly without the OAuth section; no broken chrome.
- Verified by: Read of `_SingleDoorForm.tsx` on disk.

---

### PM-1 summary

- **Total findings: 8** (P0: 0 · P1: 3 · P2: 4 · P3: 1)
- **Top 3 P0/P1 (most urgent):**
  1. **P1 — beta-gate `next` param loss** (`middleware.js:395-405` → `signup/page.tsx`): every closed-beta deep link strips the bounce-back target.
  2. **P1 — `.ilike()` raw-email wildcard match** (`send-magic-link/route.js:189, 215`): silent magic-link denial for users with `_`/`%` in their address.
  3. **P1 — graduation password gate enforces length only** (`welcome/page.tsx:60` + `claim/route.ts:184`): kid-graduation flow ships the weakest credential on the platform.

### Items noticed outside PM-1 scope (forwarding)

- **PM-4 / API or PM-2:** `/api/auth/signup/` directory exists but is empty (route was retired). `lib/password.js:31` still references "POST /api/auth/signup" in a comment. Suggest deleting the empty dir + updating the comment.
- **`lib/auth.js:289-291`**: comment points at `05-Working/PERMISSION_MIGRATION.md` which is outside the canonical product folders per memory. Doc-pointer cleanup.
- **`lib/observability` import** is dynamic in `email-change/route.js:196` and `postLoginBookkeeping.ts:128` — silent swallow on missing module means audit-log failures lose Sentry coverage. Sentry deferred per owner memory; flagging only.
- **Cross-platform consistency** (per CLAUDE.md memory): the password-policy mismatch in graduation should also be checked in `VerityPostKids/` iOS for the parent-side graduation initiation surface — out of PM-1 scope but the kid-graduation flow spans iOS + web.
