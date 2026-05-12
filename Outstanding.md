# Outstanding

Running list of things that need to be updated, fixed, or looked at. Curated from the audits and review sessions; not auto-generated. Items are numbered sequentially and grouped by theme. Numbers are stable — don't renumber, just add to the end.

---

## How to work an item

Every item below is a research-and-fix task, not a code instruction. Run it through this discipline:

1. **Trust code, not docs.** This file is a pointer. Don't take the description as truth — go read the actual code, the actual DB schema (via Supabase MCP), and the actual route handlers before deciding what to do. If you find the description is stale, fix the file when you fix the item.
2. **Dispatch a team.** Send at least 3 investigators in parallel before touching anything: one on the implementation surface, one on the downstream effects (callers, listeners, RLS, audit log, analytics, push, email, billing), and one on the upstream effects (what feeds this surface — webhooks, cron, admin tools, other clients). Then dispatch one adversary specifically charged with finding what the investigators missed and what would break a real user.
3. **Pressure-test every path.** For each item, enumerate: signed-in vs anon, web vs iOS adult vs kids iOS, desktop vs mobile, free vs Verity+, owner vs non-owner, normal vs edge (network failure, race, expired token, dead cookie, permission revoked mid-session). Don't only test the happy path.
4. **Cover code + DB + integrations.** Code changes alone are rarely the whole picture. For every fix ask: is there a DB column / RLS policy / migration that needs to move with it? Is there an audit row that should fire? Is there an admin UI that will show stale counts? Is there an iOS contract that diverges? Is there an analytics consumer that breaks?
5. **No half-measures.** If a fix needs server + iOS + web to move together, all three move. If only one is in scope, say "not applicable" for the others explicitly — don't leave it implicit.
6. **No push without owner approval.** Commit when work is verified; don't push until owner says go.

---

## Execution queue (locked 2026-05-12)

26 owner decisions locked inline below. The 5-session execution arc:

1. **Session 1 — Tokens.** Group D: radius alias + spacing scale + semantic color swap (with text/background classification) + Bright variants. All token files in one diff.
2. **Session 2 — Web sweep + chrome.** High-traffic `borderRadius:` sweep (Q-NEW8) + mobile/desktop search icon in NavWrapper (item 14 / Q-Misc1). Same PR.
3. **Session 3 — iPad infrastructure.** Items 5 + 6: layout-mode plumbing (`@AppStorage("ui.layoutMode")`), size-class branches, Appearance picker, rail landscape-only, sheet detents, HomeView cap + 2-col grid, avatar bump with width gate.
4. **Session 4 — Profile master/detail.** Group E part 1: 21-section shell on iOS, `NavigationSplitView` on iPad, auto-push You on iPhone, iOS Help section.
5. **Session 5 — Settings IA + hygiene.** Group E part 2: 7 group headers on web rail, three-tier save UX rule, 4 iOS bugs + iOS password parity bug + 2 web confirm-dialog gaps, step-specific auth labels.
6. **Out-of-band, any time** — Item 21 / Q-Misc2: drop explicit `loadUser` in `AuthViewModel.swift:1441`.

Sessions ship in order — Session N depends on tokens/scaffolding from Sessions 1..N-1.

Items 2, 4, 18, 19, 20, 23 are unaffected by this arc and remain independently scoped.

---

## Group D — Design tokens harmonization (DECISIONS LOCKED 2026-05-12 — Session 1)

**Rolls up items 12, 15, 16, 17.** Six locked questions (Q-D1..Q-D4 + Q-NEW8 sweep scope + Q-NEW9 sync mechanism) baked in below. Adversary corrections applied. One bounded design-token pass.

**Kids iOS:** N/A — `VerityPostKids/KidsTheme.swift` uses a separate `K.*` token namespace; no `VP.*` consumers.

**Execution prompt:**
> Session 1 of the 5-session arc. Land all token files in one diff: `Theme.swift` (alias legacy radius, swap semantic hexes with the text/background classification, add `Bright` variants), `globals.css` (add `--r-*` and `--s-*` variables in all four theme blocks), `palette.ts` (no value changes, just ensure exported constants reference the new tokens). Migrate the three named web components to `--s-*` and `--r-*`. Pressure-test light + dark + system-dark across both platforms; verify `VP.successBright` is used wherever success was a fill, not text. ESLint rule (`no-restricted-syntax` on `borderRadius:\s*\d+px` and `padding:\s*\d+px`) scoped to the three migrated files only. Do not delete iOS legacy radius constants — alias them.

**Definition of done:** Token files merged, three high-traffic web components migrated, ESLint rule active on those files, items 12/15/16/17 marked CLOSED.

### Q-D1 — Typography model: accept the cross-platform variance
- **Question:** Do we accept that web stays fixed-px (18px article body) and iOS keeps Dynamic Type, even though the same article reads differently on the two platforms?
- **Why it matters:** `ArticleSurface.tsx:80-84` hardcodes `fontSize: 18 / lineHeight: 1.7`; iOS body uses `Font.system(.body)` Dynamic Type — there is no `clamp()` anywhere in `globals.css` today, so adding one would be a new one-off pattern that still wouldn't honor a user's browser font-size preference (rem vs em vs px is the real lever).
- **Recommendation:** Keep both as-is — web stays fixed-px, iOS keeps Dynamic Type — because dropping Dynamic Type triggers App Store accessibility flags and a full em/rem migration on web is a separate, much larger effort.
- **Tradeoff:** A user with large iOS accessibility text gets a noticeably larger article on iPhone than the same article on the web, which permanently breaks pixel-perfect cross-platform parity.
- **ANSWERED 2026-05-12 — Leave it (option a).** Web stays at 18px; iOS keeps Dynamic Type. Accept that an accessibility-text user sees larger article copy on iPhone than on web.

### Q-D2 — Card radius: lock one scale, plan an iOS migration
- **Question:** Do we lock `sm:6 / md:10 / lg:14 / xl:20 / pill:999` as the canonical scale on both platforms, knowing iOS has a parallel legacy ramp (`radiusSM:8, radiusMD:12, radiusLG:16` at `Theme.swift:164-168`) that ~24 Swift files still reference?
- **Why it matters:** `palette.ts:92-98` and `Theme.swift:155-161` already agree on the new scale, but until the legacy `VP.radiusSM/MD/LG` constants are deleted iOS silently runs two systems at once; web cards inline `borderRadius: 8` (`ArticleSurface.tsx:182`) and `borderRadius: 6/9` in CommentRow that need a sweep too.
- **Recommendation:** Lock the new scale and schedule a single execution session that deletes the iOS legacy constants + sweeps the ~24 callers + adds `--r-sm/--r-md/--r-lg/--r-xl/--r-pill` CSS variables and migrates web inline borderRadius usages.
- **Tradeoff:** Every card on iOS shifts 2px (8→6, 12→10, 16→14) and every card on web shifts ~2px (8→10), visible on virtually every screen — small but globally noticeable for a few days post-deploy.
- **ANSWERED 2026-05-12 — Align.** Lock the new scale `sm:6 / md:10 / lg:14 / xl:20 / pill:999`. Execution session **aliases** iOS legacy constants (`VP.radiusSM = VP.Radius.sm`, etc. at `Theme.swift:164-168`) instead of deleting — actual callsite count is **268 in adult iOS alone**, not ~24; deleting in one session is a wall of changes. Adds `--r-sm/--r-md/--r-lg/--r-xl/--r-pill` CSS variables on web. iOS legacy-callsite sweep deferred to a follow-up wave (post-launch park).

### Q-D3 — Spacing scale on web: introduce `--s0..--s10`, migrate gradually
- **Question:** Do we add `--s0` through `--s10` CSS variables mirroring iOS's `VP.Spacing` (0/4/8/12/16/20/24/32/40/56/72) and migrate high-traffic web components, or keep web freeform?
- **Why it matters:** iOS has `VP.Spacing.s0–s10` (`Theme.swift:128-140`) and `palette.ts:62-74` already exports an identical `S` constant, but no `--s*` CSS variables exist in `globals.css` and `CommentRow.tsx` alone inlines off-grid values (14/18px).
- **Recommendation:** Add the `--s0..--s10` variables to `:root` and migrate only `CommentRow`, `ArticleSurface`, and `HomeLayout` in the first pass, leaving admin/legacy inline values alone — no big-bang sweep.
- **Tradeoff:** Reader/profile surfaces snap to a 4-base grid while admin keeps off-grid values for months, creating intentional inconsistency that needs a "// magic — intentional" comment policy to stay honest.
- **ANSWERED 2026-05-12 — Add the ruler (option a).** Introduce `--s0..--s10` CSS variables in `:root` matching iOS's `VP.Spacing` (0/4/8/12/16/20/24/32/40/56/72). Migrate `CommentRow`, `ArticleSurface`, `HomeLayout` in the first pass; admin/legacy stays freeform.

### Q-D4 — Semantic color: iOS adopts web's deeper hexes
- **Question:** For success/warn/danger/info, do both platforms use web's deeper hexes (#15803d / #b45309 / #b91c1c / #1d4ed8), or do we roll web back to iOS's brighter values?
- **Why it matters:** Web's `--p-success: #15803d` and `--p-warn: #b45309` (`globals.css:124-130`) were chosen to pass WCAG AA on tinted backgrounds (per the `DA-055` comment at `globals.css:50-52`); iOS's `VP.success: #22c55e` and `VP.warn: #f59e0b` (`Theme.swift:20-22`) likely fail AA when used as text on `VP.successSoft: #dcfce7`.
- **Recommendation:** iOS adopts web's deeper hexes for text uses, and we add `VP.successBright` / `VP.warnBright` to keep `#22c55e` / `#f59e0b` available for dots/bars/non-text decoration where punch matters.
- **Tradeoff:** iOS pills lose visual punch (deeper green and rust read more conservative than the brights), in exchange for WCAG AA across both platforms and one source of truth per semantic role.
- **ANSWERED 2026-05-12 — iOS adopts web's deeper hexes (option a).** `VP.success → #15803d`, `VP.warn → #b45309`, `VP.danger → #b91c1c` (already matches), `VP.info → #1d4ed8`. Keep `#22c55e` / `#f59e0b` available as `VP.successBright` / `VP.warnBright` for non-text decoration (dots, bars). Pre-session: grep every `VP.success` / `VP.warn` / `VP.info` callsite and classify text-on-tint vs fill-as-background; reroute background uses to the `Bright` variants instead of swapping the hex.

### Q-NEW8 — Inline borderRadius sweep scope (Session 2)
- **Question:** Sweep all 985 inline `borderRadius:` callsites, only high-traffic surfaces, or bridge to CSS variables without changing values?
- **Why it matters:** Grep of `web/src/` returned 985 inline callsites (978 JSX + 7 CSS); only 3 reference a token today. Heaviest non-user-facing files: kids profile (37+33), messages (29), admin home (17), legacy `category/[id]/page.js` (18).
- **Recommendation:** Sweep high-traffic surfaces only — CommentRow/Composer/Thread, StoryEditor, article/home/category/leaderboard pages, profile, modals. Admin + `mockup-*` + legacy `category/[id]/page.js` stays freeform until rewritten.
- **Tradeoff:** Admin pages keep off-grid radius values until those screens get rewritten; intentional inconsistency that needs a "// freeform" policy.
- **ANSWERED 2026-05-12 — High-traffic only (option b, REVISED framing).** Sweep high-traffic surfaces in execution session. Admin / mockup / legacy `borderRadius:` callsites are **prelaunch-parked**, not freeform-forever — schedule a single sweep session post-launch (after AdSense/Apple approval), following the kill-switch-inventory pattern.

### Q-NEW9 — Token sync mechanism after Group D
- **Question:** Hand-sync forever, single JSON source with codegen, or shared TS module with a CI step?
- **Why it matters:** Current state is hand-sync and already drifting — `Theme.swift:155-161` matches web (new scale) but `:163-168` keeps legacy `radiusXS/SM/MD/LG/Full` (4/8/12/16/99); 982 of 985 web callsites don't consume tokens, so codegen has no consumers today.
- **Recommendation:** Hand-sync for now; defer codegen until after Group D ships and the Q-NEW8 sweep lands.
- **Tradeoff:** Drift continues until codegen is built — but building codegen before consumers exist is premature.
- **ANSWERED 2026-05-12 — Hand-sync (option a).** Revisit codegen after Group D ships and high-traffic sweep is in.

---

## Group E — Profile + Settings architecture (DECISIONS LOCKED 2026-05-12 — Sessions 4 + 5)

**Rolls up items 7 and 8.** Seven locked questions (Q-E1..Q-E5 + Q-NEW6 iPhone landing + Q-NEW7 auth labels + iOS password parity bug). Adversary surfaced a real Q-E4 gap — web has the same destructive-without-confirm bugs as iOS — corrections baked in. Splits into Session 4 (Profile master/detail) and Session 5 (Settings IA + hygiene).

**Bugs to fix (locked in Q-E4 + Q-NEW7):**

iOS:
- (a) Duplicate DM toggle — delete hub copy at `SettingsView.swift:1050`, keep DataPrivacy version with revert at `:3846`.
- (b) Add `.alert` confirms to MFA disable (`SettingsView.swift:1982`), all session-revoke buttons (`:1755, :1781`), per-row Unblock (`:4229`).
- (c) Add dirty gate to FeedPreferences Save button (`SettingsView.swift:2374`, no dirty flag today).
- (d) Vacation pause + Quiet hours DatePickers must save on commit, not every drag tick (`SettingsView.swift:3004, :3132`).
- (e) **Password parity bug** — `PasswordSettingsView` is missing the current-password verification step that web's `PasswordCard.tsx:109` requires. Add the field.

Web:
- (f) `BlockedSection.tsx:73-91` per-row Unblock fires immediately — wrap in existing `ConfirmDialog` from `_components/ConfirmDialog.tsx`.
- (g) `SessionsSection.tsx:57-72` per-row Revoke fires immediately — wrap in `ConfirmDialog`.

**Kids iOS:** N/A — kids product is iPhone-only reader/family UX; no parent-facing 21-section profile or settings rail.

**Deep-link / push migration:** Audit every `verity://profile*` deep link and every push notification payload that targets Profile before Session 4 opens — old tab-index params (`Overview/Activity/Categories/Milestones`) need to map to the new section IDs.

**Execution prompts:**

> **Session 4 — Profile master/detail.** Port iOS to the 21-section master/detail shell. iPhone uses `NavigationStack` with auto-push of "You" on appear; iPad uses `NavigationSplitView` two-column. Cap HomeView hero/cards at 680pt with a 2-column `LazyVGrid` for iPad landscape (Q-NEW3). Bump profile hero avatar to 96pt when `horizontalSizeClass == .regular` AND width > 768pt (Q-NEW5, gate corrected). Add iOS Help section (Q-E5). Last commit of the session must be the avatar bump for clean bisect. Cross-platform check: web stays on its existing 21-section shell.

> **Session 5 — Settings IA + hygiene.** Add the 7 group headers to web's settings rail (Q-E3). Apply the three-tier save UX rule everywhere (Q-E4). Fix the 4 iOS bugs (a–d), the iOS password parity bug (e), and the 2 web confirm-dialog gaps (f, g). Add step-specific verbs to MFA and password flows (Q-NEW7). Pressure-test optimistic-revert pattern on every RLS-allowlisted single-value control.

### Q-E1 — Profile shell: master/detail wins on both platforms
- **Question:** Does iOS port web's 21-section master/detail shell (with the "You" dashboard preserved as one section), or does web port iOS's 4-tab dashboard?
- **Why it matters:** Web's `ProfileApp.tsx:249-525` declares 21 sections (you, public, background, activity, messages, categories, milestones, family, expert-queue, expert-profile, identity, security, sessions, notifications, appearance, privacy, plan, refer, help, data, signout); iOS's `ProfileView.swift` is a 4-tab dashboard — owner's stated parity goal means one model has to move.
- **Recommendation:** Master/detail wins on both — iOS ports the section list (iOS's 7-group Settings hub already proves the IA scales) and preserves the dashboard density inside a "You" section so casual users still land on the at-a-glance view.
- **Tradeoff:** iOS loses its single-screen "everything visible" feel for casual sessions, which mitigates by making "You" the default-selected section but the first scroll on iPhone gets longer.
- **ANSWERED 2026-05-12 — Master/detail wins (option a).** iOS ports web's 21-section list. iPhone Profile becomes "pick a section"; "You" is the default-selected section and preserves the dashboard density (hero, stats, social, quick actions, previews).

### Q-E2 — Split-view primitive on iPad: stock `NavigationSplitView`
- **Question:** On iPad master/detail, do we use stock `NavigationSplitView`, or a custom two-column split modeled on the article reader's sticky-timeline rail?
- **Why it matters:** Profile/Settings traffic doesn't justify a bespoke split — `NavigationSplitView` gives state restoration, column visibility, and Dynamic Type behavior for free.
- **Recommendation:** Stock `NavigationSplitView` two-column on iPad, plain `NavigationStack` push on iPhone — reserve custom split patterns for reader surfaces where the rail earns its weight.
- **Tradeoff:** iPad Profile/Settings won't visually match the article reader's custom rail, so the app has two split primitives instead of one.
- **ANSWERED 2026-05-12 — Stock `NavigationSplitView` (option a).** Two-column on iPad, plain `NavigationStack` push on iPhone. Reader can keep its custom rail; Profile/Settings use the standard primitive.

### Q-E3 — Settings IA: keep iOS's 7 grouped hub, mirror on web
- **Question:** Does web collapse its 21 settings sections into iOS's 7 grouped hub (Account / Preferences / Privacy / Billing / Expert / About / Danger zone), or does iOS expand to 21 flat sections?
- **Why it matters:** iOS already clusters rows under 7 `HubSection` headers (`SettingsView.swift:833-882`, plus a conditional 8th "Invite friends" under `canInvite`); web's flat rail also encodes a `SectionDef.group` (`ProfileApp.tsx:291, 326, 346, 409, 473`) so both already use the same grouping spine — the gap is smaller than the framing suggested.
- **Recommendation:** Keep iOS's 7 grouped hub structure on both, with web's rail showing the same 7 group headings and the 21 sections nested underneath — no IA collapse, just consistent grouping language.
- **Tradeoff:** Web users keep deep-link `?section=` URLs, so every group label must stay character-identical across platforms forever or the parity claim breaks.
- **ANSWERED 2026-05-12 — Keep 7-header grouping on both (option a).** Web's sidebar gains the same 7 headers (Account / Preferences / Privacy / Billing / Expert / About / Danger zone) with the 21 sections nested underneath. Headers + sections, identical labels across platforms.

### Q-E4 — Per-setting save UX: optimistic for toggles, explicit Save for forms
- **Question:** Across both platforms, do we use optimistic-with-toast for single-value controls (toggles, radios, theme picker) and explicit Save buttons for multi-field forms (profile, password, email change), and ban debounced auto-save on text inputs?
- **Why it matters:** Today iOS mixes all three patterns in one surface — optimistic-with-revert on the DM-receipts toggle (`SettingsView.swift:1055, 1249`), explicit Save on profile edit (`SettingsView.swift:1451-1538`), 100ms debounce only for the settings search box (`SettingsView.swift:721-727`) — and web's 21 sections are similarly inconsistent.
- **Recommendation:** Optimistic + toast for single-value controls, explicit Save for multi-field forms — never debounce-save text inputs because invisible saves break user trust and complicate validation errors.
- **Tradeoff:** Two save patterns to maintain instead of one, but each maps cleanly to a control type so users learn the rule once.
- **ANSWERED 2026-05-12 — Three-tier rule, aligned with web + DB-permitted operations.** (1) Optimistic-with-revert for RLS-allowlisted single-value controls (toggles/radios/theme); canonical impl = `SettingsView.swift:3846` DataPrivacy DM toggle. (2) Explicit Save for multi-field forms and anything that goes through Supabase Auth or billing RPCs (email, password, MFA setup, plan, profile edit). (3) Confirm dialog (`.alert` on iOS, `ConfirmDialog` on web) for destructive or external-side-effect actions: account delete, plan cancel, MFA disable, session revokes (all + per-row), lockdown, unblock. Never debounce saves. See bug list above for the 7 named fixes (a–g).

### Q-E5 — Feature gaps: only web's richer Help/linkouts are real
- **Question:** Of the supposed iOS gaps surfaced by mapping (Appearance, data export, Help & support), only Help/linkouts is real — do we add a Help section to iOS inside this group, or spin it out as its own Outstanding.md item?
- **Why it matters:** Adversary verified that iOS already ships an Appearance row (`SettingsView.swift:1029-1035` → `AppearanceSettingsView` at 4297-4309) and a full data-export flow (`SettingsView.swift:3829-3945`); the only real gap is web's richer Help section (FAQ + status linkouts) vs iOS's single "Send feedback" row at `SettingsView.swift:1137`.
- **Recommendation:** Fix the Help gap inside this group — it's one new iOS row that adds the FAQ/status linkouts web already has, and skipping it means the unified IA ships with a known-missing twin.
- **Tradeoff:** Adds ~30 minutes to the execution session, but spinning it out re-opens `SettingsView.swift` twice for the same surface.
- **ANSWERED 2026-05-12 — Fix inside Group E.** Only real gap is iOS's thin Help section (just a feedback sheet at `SettingsView.swift:1137`); web has FAQ + status linkouts on top. Add a Help section to iOS in the same execution session — fix everything correctly, no spin-outs.

### Q-NEW6 — iPhone Profile landing after master/detail port
- **Question:** When a user taps Profile on iPhone, do we auto-push "You" detail on appear, show the section list first, or render You inline-expanded at the top of the list?
- **Why it matters:** Web already chose: `AppShell.tsx:60` defaults to `"you"` and on mobile (<860px) the rail collapses to a drawer so users land directly on the You detail — exactly the same tap count as today's iOS dashboard.
- **Recommendation:** Auto-push "You" on appear; matches web mobile, preserves today's tap count to reach hero, section list reachable via back button or top-bar menu.
- **Tradeoff:** Reaching a non-You section costs one extra tap vs. today's flat tab bar (tap Profile → back → tap other section).
- **ANSWERED 2026-05-12 — Auto-push You on appear (option a).** Matches web mobile.

### Q-NEW7 — Multi-step Auth button labels + iOS password parity bug
- **Question:** What do the buttons say at each step of MFA enrollment and password change, and do we fix the missing current-password step on iOS?
- **Why it matters:** iOS today is inconsistent — `SettingsView.swift:2017` "Generate setup code", `:2045` "Verify & enable", `:1647` "Update password" with NO current-password field; web `MFACard.tsx:166` "Set up 2FA" → `:236` "Verify and turn on"; web `PasswordCard.tsx:109` requires current password before allowing new.
- **Recommendation:** Step-specific verbs matching web — MFA: "Set up 2FA" → "Verify and turn on"; password: "Update password" with a current-password field added to iOS to match web.
- **Tradeoff:** Three different verbs across Auth surfaces means more copy to maintain; offset is each verb describes exactly what the tap does.
- **ANSWERED 2026-05-12 — Step-specific verbs (option a) + fix iOS password parity bug.** Add current-password field to `PasswordSettingsView` in the same execution session per the "everything fixed correctly" standing directive.

---

## 2. Apple submission readiness for the just-shipped auth changes

The waitlist removal + OTP session-body fix in commit `e4cad79d` is committed locally and not pushed. Before it goes to production and TestFlight, the iOS binary needs to be built, the Swift SDK behavior of `setSession` on iOS 17+ confirmed, and the API change tested end-to-end against the live deploy.

**Prompt for the agent team:**
> Pressure-test the auth changes in commit `e4cad79d` end-to-end on a real iOS build. Verify: (a) anon user can launch the app and reach Home without ever seeing a signup prompt; (b) an iOS user typing the 8-digit code into the OTP field successfully signs in and `client.auth.session` returns the installed session afterward; (c) the tapped-from-email Universal Link path still works; (d) signing out, then signing back in via OTP, works without showing the stale "Check your inbox" card; (e) the audit_log row for an iOS signup tags `client: "ios"` and `signup_source: "ios"`; (f) the web waitlist UI still functions correctly with no regressions. Verify the Supabase Swift SDK 2.43.1 `setSession(accessToken:refreshToken:)` semantics — does it emit `.signedIn` synchronously, async, or both? If it races the auth listener's own `loadUser`, document the race and decide if a fix is needed. Use the methodology above (3 investigators + 1 adversary).

## 4. Analytics distinction between per-login client and durable signup_source

A returning web user who installs iOS and signs in will produce audit_log rows tagged `client: "ios"` even though their canonical `signup_source` is `"web"`. Per-login client and durable origin are now two different things. Any dashboard that conflates them will misattribute iOS logins as iOS acquisitions.

**Prompt for the agent team:**
> Audit every consumer of `audit_log.metadata.client` and `users.raw_user_meta_data.signup_source` (via grep + Supabase MCP). For each, decide whether it wants the per-login client or the durable origin. Fix any that read the wrong field. Build a one-page reference under `/admin/` that explicitly documents the distinction so future analytics queries don't get it wrong. Include funnel reports, cohort retention queries, and any growth dashboard.

---

## 5 + 6. iPad layout + swap-mode toggle (DECISIONS LOCKED 2026-05-12 — Session 3)

**Rolls up items 5 and 6.** Eleven locked questions (Q-iPad1..Q-iPad6 + Q-NEW1 rail revert + Q-NEW2 sheet detents + Q-NEW3 HomeView cap + Q-NEW4 hit targets + Q-NEW5 avatar size) baked in below. Owner directive: fastest turnaround.

**Kids iOS:** N/A — kids product is iPhone-only.

**Execution prompt:**
> Session 3 of the 5-session arc. Land the layout-mode plumbing in one PR: size-class branches in HomeView, StoryDetailView, ProfileView, SettingsView; `@AppStorage("ui.layoutMode")` wired to a picker in `AppearanceSettingsView` (below theme toggle); the phone-hide rule on the picker; the rail-landscape-only rendering; the three sheet detents; the HomeView 680pt cap + 2-col iPad-landscape grid; the avatar bump with width-gate. Pressure-test on Split View / Slide Over / Stage Manager — width changes mid-session must reflow cleanly. Snapshot test at 320 / 375 / 414 / 768 / 1024 / 1180 / 1366 pt. Session 4 (Profile master/detail port) consumes this scaffolding for the `NavigationSplitView` work.

**Definition of done:** PR merged. Closes items 5 and 6.

### Q-iPad1 — Default iPad layout: target web's outcomes, use native primitives
- **Question:** Does iPad mirror web desktop's breakpoint *outcomes* (2-col reader, 3-col home, sidebar profile) using native iOS primitives (`NavigationSplitView`, `LazyVGrid`, size-class branches), rather than a literal CSS-breakpoint port?
- **Why it matters:** Adult iOS today has zero `horizontalSizeClass`, zero `NavigationSplitView`, zero `userInterfaceIdiom` branches (grep confirmed), so iPad runs phone UI stretched — a literal web port would force iPad to inherit the "awkward zone" comment at `globals.css:613-618` where rails collapse below ~280px.
- **Recommendation:** Use `@Environment(\.horizontalSizeClass)` plus width gates that target the same outcomes as web's 720/1100/1180 breakpoints, but render via iOS primitives — not a CSS port.
- **Tradeoff:** iPad and web diverge in implementation forever (two codepaths to maintain), but a literal port forces iPad to live with Stage Manager and Split View width changes it was never designed for.
- **ANSWERED 2026-05-12 — Web-outcomes via native primitives (option b).** `@Environment(\.horizontalSizeClass)` + width gates target the same outcomes as web's 720/1100/1180 breakpoints (multi-column reader, grid home, sidebar profile), built with `NavigationSplitView` / `LazyVGrid` so Split View / Slide Over / Stage Manager work.

### Q-iPad2 — Article reader on iPad: rail in landscape only
- **Question:** On the iPad article reader, does the sticky timeline rail activate only in landscape (≥1180pt effective width), with portrait staying on the existing tabbed reader?
- **Why it matters:** Web's rail only activates ≥1180px (`globals.css:755-773`) because 1024–1179 is the explicitly-named "awkward zone" (`globals.css:613-618, 749`) — iPad portrait at 1024pt would land squarely there.
- **Recommendation:** Sticky rail in iPad landscape only, tabbed reader in portrait and Split View — explicitly avoid the awkward zone instead of recreating its pain.
- **Tradeoff:** Rotating mid-article re-renders the reader and can lose scroll position if not handled, but it's the only way to skip the documented 1024-1179 truncation problem.
- **ANSWERED 2026-05-12 — Rail in landscape only (REVERTED to original option a via Q-NEW1).** Code investigation found iOS has no rail asset — `StoryDetailView.swift:1032-1143` renders timeline as a tab; "rail on iPad" would require building a new SwiftUI sticky sidebar from scratch. Web's own threshold rejects rail rendering below 1180px (`globals.css:613-618`). Final: rail in iPad landscape (≥1180pt effective width); iPad portrait keeps today's Timeline tab.

### Q-iPad3 — Layout swap-mode values: `auto | compact | expanded`, default `auto`
- **Question:** Do we ship the user-toggleable layout setting as `auto | compact | expanded` with `auto` default, or do you want different naming/values?
- **Why it matters:** This becomes an `@AppStorage("ui.layoutMode")` key alongside the existing `@AppStorage("vp_theme")` (`HomeView.swift:57`, `SettingsView.swift:671, 4300`) — naming persists per-user forever.
- **Recommendation:** Ship `auto | compact | expanded` with `auto` default — "compact" reads as phone-like, "expanded" as desktop-like, and the labels translate cleanly to web's cookie/`localStorage`.
- **Tradeoff:** Three values means three QA matrices per surface (Home / Reader / Profile / Settings × 3 modes × portrait/landscape × Split View) — but two values lose the viewport-driven default that 95% of users will leave alone.
- **ANSWERED 2026-05-12 — Expanded on iPad with orientation-aware reader (REVISED after Q-NEW1).** Values `auto | compact | expanded`, default `auto`. On `auto`: iPad renders expanded (multi-column home, sidebar profile), iPhone renders compact. Exception: article reader rail is landscape-only on iPad (per Q-iPad2 revert) because iOS has no rail asset to ship at 1024pt portrait. User can override with explicit `compact` or `expanded`.

### Q-iPad4 — Layout-mode setting placement: Settings → Appearance
- **Question:** Does the layout-mode control live in Settings → Appearance directly below the existing theme toggle?
- **Why it matters:** `SettingsView.swift:4297-4309` already parks `vp_theme` in a dedicated `AppearanceSettingsView`, so a sibling Layout control reuses the cell pattern and persistence layer with zero new IA.
- **Recommendation:** Settings → Appearance, directly below the theme toggle — same cell pattern, same persistence layer.
- **Tradeoff:** Burying it in Settings means low discoverability for iPad users who'd benefit most, but surfacing it in the top bar clutters chrome for the 95% who never touch it.
- **ANSWERED 2026-05-12 — Settings → Appearance (option a).** Layout-mode picker lives directly below the theme toggle in `AppearanceSettingsView` (`SettingsView.swift:4297-4309`); same cell pattern, same persistence layer.

### Q-iPad5 — Flip behavior: live re-render, no relaunch
- **Question:** Does flipping the layout mode mid-session re-render mounted views live (free with `@AppStorage`), or require an app relaunch (simpler but feels broken)?
- **Why it matters:** `@AppStorage` triggers SwiftUI re-renders automatically — the question is whether mid-session re-renders are safe across `StoryDetailView`'s 4664-line hierarchy with 6+ sheets and a scroll-position-sensitive reader.
- **Recommendation:** Live re-render — relaunch-required is a UX smell that no native iOS setting actually has; accept the engineering cost of scroll-position preservation in the reader.
- **Tradeoff:** Live re-render risks scroll-position loss and sheet-state desync mid-article, which the reader needs explicit handling for.
- **ANSWERED 2026-05-12 — Live re-render (option a).** `@AppStorage("ui.layoutMode")` triggers SwiftUI re-render automatically. Execution session preserves scroll position in `StoryDetailView` across layout flips; sheet-state handling reviewed in the same pass. Spike scroll-restore first — if it's >1 session of work, downgrade to relaunch-required on first ship and upgrade live-flip in a follow-up.

### Q-iPad6 — Phone-width "expanded" mode: hide the option entirely
- **Question:** On a phone-width viewport (<720px), does the layout picker hide the `expanded` option entirely, snap back to `auto` with a toast, or actually render desktop layout at 360px (likely broken)?
- **Why it matters:** Web's 3-col home (`_home/styles.tsx:45-46`) and 2-col reader (`globals.css:755`) hard-require 1100/1180px — forcing them at 360px produces horizontal overflow, not a usable layout.
- **Recommendation:** Hide the `expanded` option in the picker on phone-width — silent constraint beats a toast every time the setting screen loads.
- **Tradeoff:** A user who sets `expanded` on desktop then opens phone sees a different option list (mildly confusing), but rendering desktop at 360px is unambiguously broken.
- **ANSWERED 2026-05-12 — Hide expanded on phone-width (option a).** When viewport <720px, picker shows only `auto | compact`. A user who set `expanded` on iPad/desktop and opens phone keeps the stored preference (so reopening on iPad still shows expanded), but the picker hides the third option silently.

### Q-NEW1 — iPad article-reader rail: revert to landscape-only
- **Question:** Since iOS has no rail asset (timeline is only a tab today) and web refuses to render the rail below 1180px, do we revert Q-iPad2 to landscape-only and let iPad portrait keep the existing Timeline tab?
- **Why it matters:** Code review found `StoryDetailView.swift:1032-1143` renders timeline as a tab (no sidebar exists); web's awkward-zone comment (`globals.css:613-618`) explicitly avoids rail at 1024-1179px because columns truncate ugly.
- **Recommendation:** Revert to landscape-only — building a SwiftUI rail variant for a width web's own designers reject is principled-wrong.
- **Tradeoff:** Rotating mid-article re-renders between rail-and-tabs; reader must preserve scroll position across the flip.
- **ANSWERED 2026-05-12 — Revert to landscape-only.** Q-iPad2 and Q-iPad3 both updated above with this revision.

### Q-NEW2 — Three sheets default to 540×620 on iPad
- **Question:** For the three `StoryDetailView` sheets that don't declare detents (linked-article :408, SubscriptionView :457, LoginView :638), do we force full-screen on iPad, use detented `.large`, or hybrid?
- **Why it matters:** Without detents these default to iPad's 540×620 formSheet — the worst case is a full article reader inside a postage-stamp box that overrides the 680pt reading-column cap.
- **Recommendation:** Hybrid — linked-article full-screen (it's a whole reading experience), Login + Subscription detented `.large` (smaller forms benefit from the dismissible feel).
- **Tradeoff:** Full-screen linked-article loses the swipe-down-to-bail affordance; user must use the back button instead.
- **ANSWERED 2026-05-12 — Hybrid (option c).** linked-article full-screen on iPad; Login + Subscription get `.presentationDetents([.large])`.

### Q-NEW3 — HomeView hero + cards on iPad
- **Question:** Should the Home hero and headline cards stay edge-to-edge on iPad, or get capped at a reading width like the article body already is?
- **Why it matters:** `HomeView.swift:390-506` sets `frame(maxWidth: .infinity)` on hero + every supporting card with no cap, while `StoryDetailView.swift:825` caps article body at 680pt — front page reads as one absurdly wide column of serif text on a 12.9" iPad landscape.
- **Recommendation:** Cap at 680pt (same as article body), centered, hero color background still runs edge-to-edge as a banner.
- **Tradeoff:** Leaves a lot of empty gutter on iPad landscape until something fills it (related stories, ads, multi-column grid).
- **ANSWERED 2026-05-12 — Cap at 680pt + pair with 2-column compact grid on iPad landscape (REVISED).** Adversary flagged the 680pt cap standalone looks like a thin column floating on iPad landscape. Pair the cap with a 2-column `LazyVGrid` for cards when `horizontalSizeClass == .regular` AND width > 1100pt; iPhone and iPad portrait stay single-column 680pt-capped.

### Q-NEW4 — Hit targets on iPad
- **Question:** Should tappable buttons/rows stay 44pt tall on iPad, or shrink to ~32pt to match web's visual density?
- **Why it matters:** ~90 sites use `.frame(minHeight: 44)` across the codebase with zero size-class branching; web uses ~32pt for the same controls because mouse cursors don't need 44.
- **Recommendation:** Keep 44pt everywhere — Apple HIG is unambiguous and iPad is still touch-first.
- **Tradeoff:** Profile/Settings rows on iPad look airier than the web version side-by-side, which is the price of accessibility.
- **ANSWERED 2026-05-12 — Keep 44pt (option a).**

### Q-NEW5 — Profile hero avatar size on iPad
- **Question:** Should the profile avatar and name scale up on iPad, or stay iPhone-sized?
- **Why it matters:** `ProfileView.swift:366` hardcodes `AvatarView(user: user, size: 68)` and the display name uses `VP.Size.xl` serif at `:374`; on a 12.9" iPad the header looks postage-stamp.
- **Recommendation:** Bump hero avatar to 96pt and name one type-size step up when `horizontalSizeClass == .regular`; leave stats/tabs at iPhone sizes.
- **Tradeoff:** Adds a size-class branch in ProfileView.swift; iPad multitasking thirds might trigger the .regular check when we'd want compact.
- **ANSWERED 2026-05-12 — Bump on iPad (option b, REVISED gate).** Hero avatar 96pt, name +1 type step, when `horizontalSizeClass == .regular` AND viewport width > 768pt — bare `.regular` triggers in iPad Split View thirds (320pt+) where the 96pt avatar overflows.

---

## 7. Profile architecture mismatch — CLOSED 2026-05-12

Folded into Group E above. Locked: master/detail wins on both platforms (Q-E1). iOS ports web's 21-section list; "You" auto-pushed on iPhone appear (Q-NEW6). Execution lands in Session 4.

## 8. Settings IA mismatch — CLOSED 2026-05-12

Folded into Group E above. Locked: iOS's 7 grouped hub headers (Account / Preferences / Privacy / Billing / Expert / About / Danger zone) used on both platforms (Q-E3); web's rail gains the same headers with 21 sections nested underneath. Execution lands in Session 5.

## 12. Typography model mismatch — CLOSED 2026-05-12

Folded into Group D above (Q-D1). Locked: leave both as-is. Web stays fixed-px (18px article body); iOS keeps Dynamic Type. Accept cross-platform variance.

---

## 14. Web mobile has no visible search entry point (LOCKED — Session 2)

### Q-Misc1 — Web mobile search button: global top bar, both mobile and desktop
- **Question:** Does the magnifying-glass search button render in the global top bar on every page (gated on `canSearch`) for both mobile and desktop?
- **Why it matters:** `NavWrapper.tsx:199, 283` (path is `web/src/app/NavWrapper.tsx`, not `web/src/components/`) computes `canSearch` from `hasPermission('search.basic')` but the variable is never read in JSX, and `SectionsMenu` only renders when `topBarActive` (`NavWrapper.tsx:601`) — so mobile users on every non-home page have zero search entry points.
- **Recommendation:** Render a permission-gated `<Link href="/search">` magnifying-glass icon in the global top bar's right cluster (sit it immediately left of `<ThemeToggle />`) on both mobile and desktop.
- **Tradeoff:** Adds a third right-side icon on mobile and tightens the 16px-padded top bar, but the alternative of a sticky bottom-nav slot burns one of only two nav slots.
- **ANSWERED 2026-05-12 — Top bar, both mobile and desktop, every page.** Magnifying-glass `<Link href="/search">` in the right cluster of `NavWrapper.tsx`, sit it immediately left of `<ThemeToggle />`, gated on existing `canSearch` permission.

**Execution prompt:**
> Ships in Session 2 alongside the high-traffic radius sweep. Use the new `--r-pill` token from Session 1 for the icon button radius. Snapshot test at 320 / 360 / 375 / 414 / 768 viewports — three right-cluster icons on a 320px viewport may need the wordmark to truncate; confirm before merging.

---

## 15. Card radius alignment — CLOSED 2026-05-12

Folded into Group D above (Q-D2). Locked: `sm:6 / md:10 / lg:14 / xl:20 / pill:999` canonical on both platforms. iOS legacy constants aliased (not deleted); 268 iOS callsites deferred to a follow-up sweep wave.

**SHIPPED Session 1 (2026-05-12):** `Theme.swift:164-168` aliases `radiusXS/SM/MD/LG/Full` onto the `VP.Radius` enum; web gains `--r-sm/-md/-lg/-xl/-pill` in all four `globals.css` theme blocks. Three high-traffic web components (CommentRow / ArticleSurface / HomeLayout) consume `var(--r-*)` where on-grid.

## 16. Spacing scale alignment — CLOSED 2026-05-12

Folded into Group D above (Q-D3). Locked: `--s0..--s10` CSS variables added in `:root` matching iOS's `VP.Spacing` (0/4/8/12/16/20/24/32/40/56/72). Migrate CommentRow, ArticleSurface, HomeLayout in first pass only.

**SHIPPED Session 1 (2026-05-12):** `--s0..--s10` added to all four `globals.css` theme blocks. CommentRow + ArticleSurface migrated for on-grid values; off-grid sites tagged `magic, intentional`. HomeLayout has no inline spacing (CSS-class driven). ESLint `no-restricted-syntax` warns on hardcoded pixel strings, scoped to the three files only.

## 17. Semantic color harmonization — CLOSED 2026-05-12

Folded into Group D above (Q-D4). Locked: iOS adopts web's deeper hexes for text uses (`VP.success → #15803d`, `VP.warn → #92400e` (corrected post-adversary), `VP.danger → #b91c1c`, `VP.info → #1d4ed8`); add `VP.successBright` / `VP.warnBright` for non-text decoration. Pre-session classification of every callsite text-on-tint vs fill-as-background is mandatory.

**SHIPPED Session 1 (2026-05-12):** `Theme.swift` swaps semantic colors to the deeper hexes and adds `VP.info` + `VP.successBright` / `VP.warnBright`. Aliases `VP.right`/`amber`/`wrong` track their semantic parent. Pre-flight classification reviewed every `VP.success`/`warn`/`info`/`right`/`amber`/`wrong` callsite; only two fill-as-background sites needed Bright rerouting — `SubscriptionView.swift:307` (3px feature accent bar) and `StoryDetailView.swift:1398` (10×5 quiz-result dots). All other "fill" sites carry overlay text where the deeper hex is the AA-safe choice.

**Adversary-pass corrections (2026-05-12):** Two issues surfaced after the initial swap:
1. **Warn light hex bumped `#b45309 → #92400e`** (amber-800). The original deepening was 0.16 short of AA normal on warn-soft (4.34:1); the new hex clears 6.35:1. Web `--p-warn` updated in both light blocks; dark blocks already use `#fbbf24` and stay unchanged.
2. **Semantic colors are now DYNAMIC.** `VP.success`/`warn`/`danger`/`info` converted to `Color(UIColor { tc in ... })` closures so they flip to bright variants (`#22c55e` / `#fbbf24` / `#f87171` / `#60a5fa` — matching web's dark-block `--p-*` values) in dark mode. Without this, the light-mode deep hexes dropped to ~3:1 against `systemBackground` (#000) on the ~20 callsites that put semantic text directly on system surfaces. `VP.successBright`/`warnBright` stay static — they're decoration-only and already luminous on either mode.

---

## 18. Admin rate-limit cleanup (deferred — owner-paused)

Per memory `project_admin_rate_limit_cleanup_deferred.md`: 10 admin mutation endpoints are permission-gated but not rate-limited. Defense-in-depth; not exploitable without admin compromise. Deferred until owner says go.

**Prompt for the agent team:**
> Only execute this item when owner explicitly says "the admin rate-limit cleanup is back on." When it is: enumerate the 10 mutations (grep `/api/admin/.../route.ts` for unguarded POST/PATCH/DELETE handlers), add rate-limit policies in `lib/rateLimits.ts` keyed appropriately (per-actor or per-target), and wire them through `checkRateLimit`. Pressure-test: confirm the rate-limit isn't so tight it locks out a legitimate batch-import admin flow.

## 19. Unified search session (deferred — owner-paused)

Per memory `project_unified_search_session_pending.md`: one shared lib for the home overlay search, the `/search` page, the expert directory, and the `@-mention` autocomplete. Owner-deferred. Pick up when owner says "the search session."

**Prompt for the agent team:**
> Only execute when owner explicitly opens this. When opened: investigate all four search surfaces and propose a single `useUnifiedSearch()` hook (web) + Swift equivalent (iOS) that handles query construction, debounce, permission gating, result shaping. Pressure-test the four surfaces' differing UX contracts (overlay vs page vs autocomplete vs directory) before unifying.

## 20. Verity Monthly Stripe price — mint required

Per memory `project_verity_monthly_stripe_pending.md`: pricing page shows "Subscribe via iOS App" because `plans.verity_monthly.stripe_price_id IS NULL`. Owner must click Mint at `/admin/plans` (credential-gated, can't shortcut from CLI).

**Prompt for the agent team:**
> Owner-action item, not a coding task. When owner is ready, walk through: navigate to `/admin/plans`, locate the Verity Monthly row, click Mint, confirm the resulting `stripe_price_id` populates, reload the pricing page, confirm the "Subscribe via iOS App" copy is gone and the Stripe checkout button is live. Verify the equivalent annual / lifetime plans don't need the same mint. After mint: smoke-test a real checkout in Stripe test mode end to end.

---

## 21. iOS verifyMagicCode setSession race (LOCKED — ships out-of-band)

### Q-Misc2 — iOS verifyMagicCode setSession race: drop the explicit loadUser
- **Question:** In `verifyMagicCode`, do we drop the explicit `loadUser` at `AuthViewModel.swift:1441` and rely solely on the auth listener's `loadUser` at `AuthViewModel.swift:466`, or keep both (idempotent) or gate the listener (option b)?
- **Why it matters:** Supabase Swift SDK 2.43.1 emits `.signedIn` inside `setSession` on `AuthViewModel.swift:1437`, which wakes the listener's `loadUser` — both the listener and the explicit call hit the same endpoint and both kick a `PermissionService.invalidate()+loadAll()` cycle, racing.
- **Recommendation:** Option (c) — drop the explicit `loadUser` and let the listener be the single source of truth, since the listener already handles password login, deep link, token refresh, and initial session the same way.
- **Tradeoff:** OTP success UX is now coupled to listener latency (~10-50ms post-`setSession`), so the `isLoggedIn = true` flip on line 1446 momentarily leads `currentUser` — fine unless a caller of `verifyMagicCode`'s return value reads `currentUser` immediately.
- **ANSWERED 2026-05-12 — Drop the explicit loadUser (option c).** Delete the `await loadUser(...)` at `AuthViewModel.swift:1441`; let the auth listener at `:466` handle it like every other sign-in path. Adversary verified safe: both callers (`LoginView.swift:356`, `SignupView.swift:408`) use `_ = await ...` and do not read `currentUser` from the return value.

**Execution prompt:**
> Single-line iOS change. Ships out-of-band any time (no dependencies). Delete `await loadUser(...)` at line 1441 of `AuthViewModel.swift`. Add an XCTest that asserts `currentUser != nil` within 200ms of `verifyMagicCode` returning `true` to validate the listener-only contract.

---

## 23. Regenerate `web/src/types/database.ts` after recent migrations

The auto-generated Supabase TypeScript types file still references `bookmarks`, `bookmark_collections`, `articles.bookmark_count`, and the seven dropped bookmark functions — all gone from the live DB as of migration `20260512190000`. Same file is also missing the three new `access_requests` columns (`consumed_at`, `consumed_by_user_id`, `consumption_source`) and the `consume_access_request` RPC. The local `as never` casts and inline `Req` type extensions added during the access_requests work were specifically commented as "drop after the next `supabase gen types` run."

**Prompt for the agent team:**
> Run `supabase gen types typescript --linked > web/src/types/database.ts` (or the project's equivalent script) to regenerate the file from the current live schema. Then sweep the codebase for: (a) any `as never` casts on `service.rpc('consume_access_request', ...)` calls — drop the casts now that the function is typed; (b) the `ConsumeUpdate` type alias in `web/src/app/api/admin/access-requests/[id]/approve/route.ts` — replace with bare `TableUpdate<'access_requests'>`; (c) the inline `Req` type extension at the top of `web/src/app/admin/access-requests/page.tsx` that adds `consumed_at`, `consumed_by_user_id`, `consumption_source` — those become part of the generated Row type; (d) the `updateRow as never` cast in the bulk-approve route. Pressure-test by running `tsc --noEmit` before and after the regen — the only error should remain the pre-existing `CommentThread.tsx:921`.
