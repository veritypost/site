# Round 2 Notification Digest

**Anchor SHA:** `10b69cb99552fd22f7cebfcb19d1bbc32ae177fe`

Seven of the fifteen Layer-1 lens specialists returned findings in the completion notification but did not run the Write tool to persist their outputs to disk. This digest captures the substantive findings so nothing orphans. The remaining eight lenses wrote files directly (L03, L05, L06, L07, L09, L10, L14).

Each section below is paraphrased from the agent's completion summary — original evidence file:line citations preserved. Consider this a summary record; if a finding needs deeper triage, re-run that specific lens with explicit Write-to-disk enforcement.

---

## L01 — Anonymous Reader Path (5 findings)

**L01-01 HIGH** — Missing metadata on 5 major anon-accessible pages (SEO blind). `web/src/app/page.tsx`, `browse/page.tsx`, `search/page.tsx`, `how-it-works/page.tsx`, `kids-app/page.tsx` — no `export const metadata` or `generateMetadata()`. Story + legal pages have metadata; these don't. Once coming-soon flips off, these high-traffic entry points will have blank titles/descriptions. **NEW.** Autonomous-fixable.

**L01-02 HIGH** — Home page fetches inactive categories (extends C11; now fixed in commit c08e592).

**L01-03 MEDIUM** — Anon home page has dead-end in empty-day state. Footer `/browse` link is gated behind `loggedIn`; anon hitting "no stories today" gets no onward path. **NEW.** Owner-input on whether to offer `/search` or sign-up CTA for anon.

**L01-04 MEDIUM** — Coming-soon 307 redirects may cache on clients; browser-cached redirects could silently land on `/welcome` for external shared links. Low priority. Polish.

**L01-05 LOW** — `ArticleQuiz.tsx:220-250` lacks explicit loading state when stage='loading-start'. Button disables but no spinner or "Fetching questions…" message. Polish.

---

## L02 — Auth Flows Path (3 NEW findings)

**L2-02-auth-001 MEDIUM (extends H2)** — Email signup path doesn't preserve `?next=` through onboarding. `web/src/app/signup/page.tsx:209-211` hardcodes redirect to `/verify-email` or `/signup/pick-username` without `readValidatedNext()` helper. OAuth callback preserves correctly; email signup breaks the chain. Autonomous-fixable.

**L2-02-auth-002 MEDIUM** — Verify-email Continue button doesn't preserve `?next=`. `verify-email/page.tsx:169-170` hardcodes `/signup/pick-username` or `/welcome`. Breaks chain for users who verified email as part of an OAuth flow. Autonomous-fixable.

**L2-02-auth-003 MEDIUM** — Signup page `onAuthStateChange` SIGNED_IN listener redirects to `/signup/pick-username` without reading current URL's `?next=`. `signup/page.tsx:109-112`. Variant of H2 that occurs on the signup page itself. Autonomous-fixable.

---

## L04 — Social + Messages (5 findings)

**L2-L04-01 CRITICAL (NEW)** — `post_message` RPC (schema/049_post_message_rpc.sql:38-40) + `start_conversation` RPC (schema/150_dm_rpc_error_prefixes.sql:85-127) do not check bidirectional block status. A user who has blocked another can still receive DMs if they're existing conversation participants. Block enforcement is one-directional at the RPC layer. Owner-input on whether blocks should be bidirectional (recommended yes).

**L2-L04-02 HIGH (NEW)** — `toggle_follow` RPC (schema/015_phase7_helpers.sql:183-225) lacks block-validation check. Users can follow each other after blocking, creating mutual-follow edges that contradict block intent. Autonomous-fixable — add block check after target-existence check.

**L2-L04-03 HIGH (extends H7)** — Notifications PATCH gate (`/api/notifications/preferences/route.js:43`) requires `notifications.prefs.toggle_push` for ALL channels including email, in-app, SMS, quiet-hours. Gate per-field based on which channel is being modified. Autonomous-fixable.

**L2-L04-04 HIGH (NEW)** — Messages page loads only outgoing blocks (`messages/page.tsx:174-184`); inbound blocks (someone who blocked me) are invisible. Conversations from a user who blocked me still appear active. Owner-input on whether to surface "blocked by this user" indicator.

**L2-L04-05 MEDIUM (NEW)** — `message_receipts` upsert with `ignoreDuplicates: true` (`messages/page.tsx:304-308`) silently fails to update `read_at` on repeat opens. Same convo re-opened from another device doesn't refresh read timestamp. Autonomous-fixable — use standard upsert or add BEFORE UPDATE trigger to bump read_at if newer.

---

## L08 — Kid iOS Walkthrough (7 findings)

**L08-001 CRITICAL (NEW, extends C15)** — Kid JWT has `sub = kid_profile_id`, so `auth.uid()` resolves to the kid profile ID. iOS writes `user_id = NULL, kid_profile_id = <uuid>`. RLS policy on `reading_log`/`quiz_attempts` requires `user_id = auth.uid()` — which becomes `NULL = <uuid>` → FALSE → write blocked. Either writes are silently failing (data egress claims in C15 are wrong) or a bypass path exists that's undocumented. Owner-input to diagnose + fix RLS or document the bypass.

**L08-002 CRITICAL (extends C16)** — ExpertSessionsView.swift:156-176 has no parental gate before querying `kid_expert_sessions`. Pattern from ProfileView:48-50 (`.parentalGate(...)`) should wrap the entry tab. Autonomous-fixable.

**L08-003 HIGH (extends H9)** — Global Authorization header in `SupabaseKidsClient.swift:70-80` + singleton `static let shared = SupabaseKidsClient()`. On logout, old client instance can persist with in-flight Authorization header. Autonomous-fixable — per-request auth header, invalidate in-flight on logout, rotate client on token rotation.

**L08-004 CRITICAL (NEW, extends C15)** — `KidsAppRoot.swift:189` calls `state.completeQuiz()` which bumps local streak BEFORE `writeAttempt()` (KidQuizEngineView:284) fires. If app force-quit mid-async-write, DB has no quiz_attempts row but local state shows bumped streak. On next launch, `loadKidRow()` reverts local to DB value. Parent dashboard shows no supporting quiz row. Owner-input on ordering.

**L08-005 HIGH (extends C26)** — `kid_expert_sessions` has RLS enabled but zero policies (schema/reset_and_rebuild_v2.sql:3004 with no CREATE POLICY following). Queries from ExpertSessionsView return empty silently. Part of C26's 14-table list; specifically surfaced here as user-visible broken feature. Autonomous-fixable.

**L08-006 HIGH (NEW)** — Kid-safe content filtering depends on slug convention (`KidsAppState.swift:96-101` filters `.like("slug", pattern: "kids-%")`). Articles RLS (schema/reset_and_rebuild_v2.sql:3580-3584) has no `is_kids_safe` check — only `status='published'`. KidReaderView has explicit re-check on line 211, but RLS should be a hard gate. Autonomous-fixable — update articles RLS to include `is_kids_safe = true` in kid-accessible path.

**L08-007 MEDIUM (NEW)** — Pairing state corruption window: PairingClient.refresh() writes Keychain then UserDefaults sequentially. App crash between writes leaves token/expires mismatch. Autonomous-fixable — atomic persistence or version field.

---

## L11 — UI/UX Visual (4 findings)

**L11-01 HIGH (NEW)** — `VerityPost/Theme.swift:14` has `static let dim = Color(hex: "666666")` but web `globals.css` was updated per DA-054 to `--dim: #5a5a5a` for improved contrast (5.95:1 vs 5.13:1 against `--card`). iOS theme not synced. Cross-platform design-token drift. Autonomous-fixable.

**L11-02 HIGH (NEW)** — 24 files across `web/src/` define local `const C = {...}` palettes with hardcoded hex, bypassing CSS variables entirely. `success` is `#16a34a` in ArticleQuiz but `#22c55e` in 8 others. `danger` is `#dc2626` in some, `#b91c1c` (canonical) in others. `dim` ranges from `#666` / `#666666` / `#5a5a5a`. Owner-input on consolidation approach (single theme lib, CSS-var reads, or accept as intentional).

**L11-03 HIGH (NEW)** — `AccountStateBanner.tsx:10-11` uses `redBorder: '#dc2626'` + `redText: '#991b1b'` — specific values used only here, not mapped to any CSS variable. Owner-input — document as named tokens in globals.css.

**L11-04 MEDIUM (NEW)** — 146 inline `style={{}}` objects use hardcoded hex. Prevents future dark-mode or rebranding via CSS variable updates. Autonomous-fixable in batches.

---

## L12 — Accessibility (7 findings)

**L12-a01 HIGH (NEW)** — `ConfirmDialog.tsx:30-37` has `role="dialog" aria-modal="true"` but does NOT use `useFocusTrap()`. Only listens for Escape. Tab/Shift+Tab can escape dialog to page behind. Modal.jsx and LockModal correctly use useFocusTrap; ConfirmDialog is inconsistent. WCAG 2.1.2 + 2.4.3 violation. Autonomous-fixable.

**L12-a02 HIGH (NEW)** — `PermissionGate.tsx:124-132` `PermissionGateInline` uses `<span role="button" tabIndex={0}>` with `onClick` but no `onKeyDown`. Keyboard-only users can Tab to it but Enter/Space does nothing. WCAG 2.1.1 violation. Leaderboard page shows correct pattern. Autonomous-fixable.

**L12-a03 HIGH (NEW)** — iOS adult `VerityPost/VerityPost/Theme.swift:141, 176` + many views hardcode `.font(.system(size: <constant>, weight:))` ignoring Dynamic Type. Apple HIG requires Dynamic Type support. Autonomous-fixable — port to semantic font styles or `@Environment(\.sizeCategory)`.

**L12-a04 HIGH (NEW)** — `signup/page.tsx:627-631` uses `color: C.muted` (#999999) on white = 3.54:1 contrast, fails WCAG AA (4.5:1). `C.dim` (#666666) would pass at 5.92:1. Multiple pages affected. Autonomous-fixable — replace muted with dim in hint/helper text.

**L12-m01 MEDIUM (NEW)** — Password show/hide button has no minHeight/minWidth; clickable area is text-width only. Below 44×44 touch target (WCAG 2.5.5). Owner-input on implementation approach.

**L12-m02 MEDIUM (NEW)** — Signup checkbox has implicit label wrapping, no explicit `<input id> <label for>`, and 18×18px size (below 44×44 touch target). Autonomous-fixable.

**L12-m03 MEDIUM (NEW)** — VerityPostKids `GreetingScene`/`StreakScene`/`QuizPassScene` respect `accessibilityReduceMotion`; `ArticleListView`/`KidReaderView` don't. Inconsistent. Autonomous-fixable — audit all animated transitions.

---

## L13 — States and Copy (8 findings)

**L13-001 CRITICAL (extends H1)** — `verify-email/page.tsx:104-109` maps 429 rate-limit to `status='expired'` conflating two states; button UX identical across. Owner decided Option A (add `rate_limited` state) — already queued for implementation.

**L13-002 HIGH (extends C7)** — Admin numeric inputs persist on blur only; edit lost on navigate. Confirms C7 with flow mapping. Autonomous-fixable.

**L13-003 HIGH (NEW)** — `CommentComposer.tsx:86-125` mention validation shows error banner but doesn't block submit. Copy says "post as plain text" but user may think mention worked. Owner-input on block-submit vs allow-with-strip behavior.

**L13-004 HIGH (NEW)** — `messages/page.tsx:476, 510, 548` multiple `.catch(() => ({}) as ...)` silently swallow JSON decode errors. Message send failure silently restores draft with no toast. Autonomous-fixable — add `pushToast` on each failure path.

**L13-005 MEDIUM (NEW)** — Signup password `failedRules` computed but never rendered inline with password field (only at form level). Validation on blur, not on-type. Polish.

**L13-006 MEDIUM (NEW)** — `NavWrapper.tsx:513` `aria-label={${unreadCount} unread}` doesn't pluralize ("1 unread notification" vs "2 unread notifications"). Polish.

**L13-007 MEDIUM (NEW)** — `SkeletonRow.jsx:26` shimmer at 1.4s with no min-duration or delay-show threshold. Fast APIs cause flicker. Polish — add `minDuration` or `delayShow` prop.

**L13-008 MEDIUM (NEW)** — iOS `SettingsView.swift` has no Toast/Alert system wired to alert-preference mutation failures. Errors silently logged; user sees optimistic state revert with no explanation. Owner-input on iOS Toast system.

---

## L15 — Compliance and Sync (8 findings, summary only)

**L15-01 CRITICAL (extends C15)** — Reading and quiz data collected before parental verification (same pattern as C15).

**L15-02 CRITICAL (NEW)** — Web-to-iOS session sync gap. `/api/auth/logout` calls `supabase.auth.signOut()` but doesn't propagate to iOS bearer tokens via Realtime. iOS sessions persist post-logout until token natural expiry (7 days). Autonomous-fixable — add session revocation broadcast.

**L15-03 HIGH (NEW)** — `consent_records` table exists in schema but is never populated or queried. COPPA consent stored in `kid_profiles.metadata.coppa_consent` with no audit trail or structured record. Autonomous-fixable — write to consent_records during pair-time COPPA gate (pairs with Q8 decision on pair-time gate + `parental_consents` table).

**L15-04 HIGH (NEW)** — `export_user_data()` RPC doesn't include kid-profile-specific data (streaks, badges, family relationships) when parent requests export. GDPR completeness gap. Autonomous-fixable.

**L15-05 HIGH (NEW)** — iOS `logout()` doesn't call `PermissionService.shared.invalidate()`. Post-logout permission cache from previous session persists in memory until app kill. Autonomous-fixable.

**L15-06 MEDIUM (NEW)** — No breach-notification pipeline. Sentry tracks errors but not security incidents. Owner-input on whether GDPR/state law breach-response is in scope pre-launch.

**L15-07 MEDIUM (NEW)** — `revoke_session()` + `revoke_all_other_sessions()` RPCs exist but never called from logout flows. Sessions table maintained but not actively managed. Autonomous-fixable.

**L15-08 MEDIUM (NEW)** — No WCAG compliance testing, accessibility scanner, or CI/CD a11y gate. Owner-input on whether automated a11y in CI is pre-launch priority.

---

## How to action this digest

The findings above join the master fix list. To avoid inflation, they should be mapped as:

- **EXTENDS-CI:** extends an existing master-list item (already on fix queue) — no new entry, evidence merged
- **NEW-CRITICAL / NEW-HIGH:** add as a new item in the master fix list, in severity-order
- **OWNER-INPUT required:** add to OWNER_ACTIONS_2026-04-24.md as a new design question

I'll fold these into the Phase-7 implementation queue as the next batches roll — L14 full report is on disk; the other eight lenses are captured here. If you want full per-lens files resurrected for any specific lens, I can re-run that lens with explicit Write enforcement.
