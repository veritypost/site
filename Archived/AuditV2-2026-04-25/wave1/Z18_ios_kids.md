# Zone Z18: VerityPostKids/ (kids iOS)

## Summary

Kids iOS app — SwiftUI, iOS 17+, target `com.veritypost.kids`, supports iPhone + iPad (`TARGETED_DEVICE_FAMILY = "1,2"`). Auth is exclusively pair-code → server-minted custom JWT (`is_kid_delegated`/`kid_profile_id` claims) injected as a global `Authorization: Bearer …` header on the shared `SupabaseClient`; GoTrue is intentionally bypassed because `kid_profile_id` is not in `auth.users` (COPPA: no child accounts). The CLAUDE.md claim that ParentalGateModal has "zero callers" is STALE — the modal has 4 live callers (PairCodeView help-mailto, ProfileView unpair, ProfileView legal links, ExpertSessionsView session listing) plus the convenience `.parentalGate(...)` modifier defined alongside it. All four V3 animation scenes are present (Greeting/Streak/QuizPass/BadgeUnlock) and respect `accessibilityReduceMotion`. `PrivacyInfo.xcprivacy` is present and declares OtherUserContent + UserID + DeviceID (linked, non-tracking, AppFunctionality), plus UserDefaults API reason `CA92.1`. Pairing token storage uses Keychain with an Ext-W.1 install-id sentinel that detects uninstall/reinstall and refuses leaked tokens. Quiz pass/fail is now server-authoritative via `get_kid_quiz_verdict` RPC (C14) with local 60% ceiling fallback. Two real concerns surfaced: `KidsAppState` keeps the in-memory `@Published` mirror of `streak_current`/`verity_score`/`quizzesPassed` that is locally mutated by `completeQuiz(...)` BEFORE any server confirmation (so a passing quiz with `writeFailures > 0` still bumps in-memory score but the next `load()` resyncs from DB) — the dual-source risk in MASTER_TRIAGE is real and lives in `completeQuiz` lines 197–222; and `QuizPassScene.swift` is fully implemented but has no live caller in the runtime tree (`KidsAppRoot` only enqueues `.streak` + `.badge`, never `.quizPass`) — orphan UI.

## Files

### VerityPostKids/VerityPostKidsApp.swift
- Purpose: `@main` entry point. Mounts `KidsAppRoot()` + `.onOpenURL` URL scheme/Universal Links handler.
- Services: none.
- URLs: stub handler logs host/path in DEBUG and drops the URL. Marker `Ext-BBB3` references Apple Kids Category review for the link-catch requirement.
- TODO/FIXME: explicit comment "expand when deep-link routes into kid surfaces are wired" — informational, not a TODO marker.
- COPPA notes: comment notes kid surfaces accept very little deep-linking by design.
- Concerns: none. Universal Link domain `applinks:veritypost.com` declared in entitlements; the URL handler is a no-op stub that's intentionally kid-safe.

### VerityPostKids/KidsAppRoot.swift
- Purpose: live root view. Pair-only entry: not paired → `PairCodeView`; paired → tab-bar app + scene full-screens.
- View hierarchy: ZStack { tabContent + KidTabBar } + `.fullScreenCover(item: $activeSheet)` for `.streak` / `.articles` / `.badge` cases. Tabs: home (GreetingScene), leaderboard, expert, profile.
- Services: `KidsAuth` (`@StateObject`), `KidsAppState` (`@StateObject`), `PairingClient.shared` (refreshIfNeeded on `.active` scenePhase).
- URLs: none direct; via `PairingClient.shared.refreshIfNeeded()`.
- TODO/FIXME: none.
- COPPA notes: K2 marker — token rotation on foreground when <24h remaining; clears on 401 to drop UI back to PairCodeView.
- Concerns: K10 sceneQueue (`StreakScene` then `BadgeUnlockScene`) replaces a single-badge slot; collisions handled by 0.35s gap. `QuizPassScene` is NOT in the queue — it's an orphan view. `handleQuizComplete(_:)` mutates `KidsAppState` via `completeQuiz(passed:score:biasedSpotted:)` which locally bumps `verityScore += scoreDelta`, `quizzesPassed += 1`, `streakDays += 1` — these are the in-memory dual-source values the MASTER_TRIAGE flag covers. `biasedSpotted: false` is hardcoded — the badge-on-5 path is unreachable from this caller.

### VerityPostKids/KidsAppState.swift
- Purpose: scoped in-memory app state for the paired kid; reads streak from `kid_profiles`, categories from `categories`, and progress counts from `reading_log` + `articles`.
- Services: `SupabaseKidsClient.shared.client`.
- URLs: PostgREST tables `kid_profiles`, `categories`, `reading_log`, `articles`.
- TODO/FIXME: none.
- COPPA notes: filters categories by `slug LIKE 'kids-%'` + limit 8.
- Concerns: **CONFIRMED dual-source-with-DB risk.** `@Published var streakDays`, `verityScore`, `quizzesPassed`, `biasedHeadlinesSpotted` are mutated locally by `completeQuiz(...)` independently of the server triggers that own `kid_profiles.streak_current` and any score column. Comment at top says "Streak is recomputed server-side via trigger on reading_log insert, so this file just mirrors the result," but `completeQuiz` lines 199–200 do `streakDays += 1` immediately. On next `load()`/foreground refresh the row is re-read from `kid_profiles.streak_current`, which corrects drift, but between events the UI shows a value the DB may not have. Also `verityScore` is bumped from `correctCount * 10` (a comment in KidsAppRoot says "mirrors the server's approximate points rule" — this approximation is itself the drift). `streakBest`, `streakFreezeRemaining` from the data model exist but are never read by UI (loadKidRow only selects `streak_current`).

### VerityPostKids/KidsAuth.swift
- Purpose: `@MainActor` ObservableObject wrapping pair-state with a `KidReference(id, name)`.
- Services: `PairingClient.shared`.
- URLs: indirect (PairingClient).
- TODO/FIXME: none.
- COPPA notes: comment "No adult credentials ever live on this device."
- Concerns: `init` fires `Task { await restore() }` — fine. `signOut()` calls `PairingClient.shared.clear()` which scrubs Keychain + UserDefaults + the bearer header.

### VerityPostKids/PairingClient.swift
- Purpose: kid-side pair-code redemption + JWT persistence + 24h refresh.
- Services: `URLSession.shared`, `SecItem*` (Keychain), `UserDefaults`, `SupabaseKidsClient.shared.{siteURL, setBearerToken}`.
- URLs: `POST /api/kids/pair` and `POST /api/kids/refresh` against `SupabaseKidsClient.shared.siteURL` (defaults to `https://veritypost.com`).
- TODO/FIXME: none.
- COPPA notes: `Authorization: Bearer <kid JWT>` is set as a global header — explicitly bypasses GoTrue (`applySession(token:)` skips `client.auth.setSession` and just calls `setBearerToken(token)`). Ext-W.1 install-id sentinel: keychain-stored install UUID is compared with UserDefaults UUID on every read; mismatch → uninstall happened → token is invalidated and cleared.
- Concerns: `clear()` is not `async` despite being awaited from `KidsAuth.signOut()` — `await` on a non-async function is harmless in Swift but slightly noisy. `refreshIfNeeded()` is best-effort and only treats 401 as fatal; transient 5xx/network is logged and dropped, which is the right call but the kid will keep using a soon-expiring token until the next foreground. `restore()` on launch correctly surfaces `applySession` failure (T-022) by clearing local state. `expires_at` is decoded as `String` not `Date` and parsed with `ISO8601DateFormatter` — relies on server emitting strict ISO-8601.

### VerityPostKids/SupabaseKidsClient.swift
- Purpose: shared `SupabaseClient` factory that injects bearer token into global headers.
- Services: `SupabaseClient` from `Supabase` package.
- URLs: reads `SUPABASE_URL`, `SUPABASE_KEY`, `VP_SITE_URL` from Info.plist (DEBUG also from env).
- TODO/FIXME: none.
- COPPA notes: extensive top-of-file note on why GoTrue is bypassed.
- Concerns: `setBearerToken(_:)` rebuilds the entire `SupabaseClient` each call (passes new `GlobalOptions(headers:)`) — heavy but called rarely (login + logout + refresh). `siteURL` falls back to `https://veritypost.com` apex hardcode if `VP_SITE_URL` unset; comment justifies the nil-coalesce as "static-analysis friendly." `fatalError` on missing `SUPABASE_URL`/`SUPABASE_KEY` — appropriate for misconfigured build, but means a release build with missing INFOPLIST_KEYs crashes on launch instead of degrading. Verify the build settings inject these.

### VerityPostKids/PairCodeView.swift
- Purpose: pair-code entry surface; redeems via PairingClient and adopts kid session on success.
- View hierarchy: ZStack { K.bg + VStack { logo + textField + cooldown text + Pair button + help-text + "Need help?" button } } + `.parentalGate(isPresented: $showHelpGate)` modifier.
- Services: `PairingClient.shared.pair(code:)`, `KidsAuth.adoptPair(_:)`, `UIApplication.shared.open` for mailto.
- URLs: `mailto:support@veritypost.com?subject=Kids%20app%20pair%20code%20help` (gated).
- TODO/FIXME: none.
- COPPA notes: T-042 (no raw error to child UI), T-043 (visible 60s cooldown), Ext-W5 (8-char code length tied to schema/095 generator with debug-time `assert`).
- Concerns: `assertServerCodeLengthMatches` only fires in DEBUG; production silently refuses non-8-char input. Cooldown timer uses `Timer.scheduledTimer` (UIKit) without an `onDisappear` invalidation — if the view is dismissed mid-cooldown, the closure leaks one self-reference until expiry (minor).

### VerityPostKids/ParentalGateModal.swift
- Purpose: math-challenge gate modal (Apple Kids Category requirement).
- View hierarchy: ZStack { K.bg + VStack { header + (locked|challenge) + "Not now" } }.
- Services: `UserDefaults` (lockout key), `Timer`.
- URLs: none.
- TODO/FIXME: none.
- COPPA notes: Ext-W9 — bumped from 4..15 + 4..15 addition (max 30) to 12..49 × 2..9 multiplication; explicit reasoning that Apple expects "not easily completed by a child." 3 attempts → 5-min lockout persisted in `vp.kids.parental_gate.lockout_until`.
- Concerns: lockout key is shared globally — passing the gate in PairCodeView clears the lockout for ProfileView/ExpertSessionsView. Probably intentional. Persisted lockout uses a `Date` value via `UserDefaults` — `.object(forKey:) as? Date` only works because Foundation autoboxes; safe but the persistence shape is fragile if a future iOS deprecates that bridging.

### VerityPostKids/ArticleListView.swift
- Purpose: kid-safe article list per category.
- View hierarchy: NavigationStack { ScrollView { card grid } } + `.fullScreenCover(item: $openArticle) { KidReaderView }`.
- Services: `SupabaseKidsClient.shared.client`.
- URLs: PostgREST `categories` (slug→id resolve), `articles` (filter `is_kids_safe=true`, `status=published`).
- TODO/FIXME: none.
- COPPA notes: explicit `is_kids_safe=true` filter (defense in depth alongside RLS).
- Concerns: K3 fallback when slug lookup fails returns the unfiltered kid-safe list — better than empty state, but a stale slug typo is silent (only debug print). Limit 30 — not paginated; will need to scroll-paginate at scale.

### VerityPostKids/KidReaderView.swift
- Purpose: kid article reader; logs `reading_log` with retry; opens `KidQuizEngineView`.
- View hierarchy: ZStack { K.bg + ScrollView { header + paragraphs + takeQuizButton } + dismissButton } + `.fullScreenCover(isPresented: $showQuiz)`.
- Services: `SupabaseKidsClient.shared.client`, `KidsAuth` for `kid?.id`.
- URLs: `articles` SELECT, `reading_log` INSERT.
- TODO/FIXME: none.
- COPPA notes: T-026 explicit `is_kids_safe=true` belt-and-suspenders alongside RLS; K4 propagates reading_log double-fail into `KidQuizResult.writeFailures` so celebration scenes can soften. T-018 single-retry pattern.
- Concerns: scroll progress (the 80% threshold the file header claims) is NOT measured in code — `read_percentage: 1.0` is hardcoded, log fires on takeQuiz button tap. The comment header is stale relative to the implementation. `ReaderContentHeightKey`/`ReaderScroll` private types are defined but unused — dead code remnants of an earlier scroll-tracking attempt.

### VerityPostKids/KidQuizEngineView.swift
- Purpose: real quiz engine; per-question quiz_attempts insert + server-authoritative verdict via `get_kid_quiz_verdict` RPC (C14).
- View hierarchy: ZStack { (loading|notKidsSafe|empty|result|question) + close X }.
- Services: `SupabaseKidsClient.shared.client`, `KidsAuth`, `KidsAppState`.
- URLs: `articles` (safety check), `quizzes` SELECT, `quiz_attempts` INSERT, RPC `get_kid_quiz_verdict(p_kid_profile_id, p_article_id)`.
- TODO/FIXME: stale telemetry note "Parent-visible telemetry path: follow-up when /api/kids/errors lands" — informational, not a TODO marker.
- COPPA notes: pre-flight `is_kids_safe` check refuses to load quiz for non-safe articles (`blockedNotKidsSafe = true`); T-018 single-retry on quiz_attempts.
- Concerns: pendingWrites Tasks are awaited before fetching server verdict — correct. Local fallback (`correctCount >= ceil(total * 0.6)`) only fires when the RPC fails, with verdictPending UI hint. Bug-bait: `writeAttempt(...)` on second-fail bumps `writeFailures` but is *not* `@MainActor`-isolated, so the increment happens on a Task continuation; works in practice because the property is `@State` on the View (which is value-typed) — Swift will route mutations through MainActor by virtue of SwiftUI's contract, but a future refactor that pulls this into an actor will break.

### VerityPostKids/LeaderboardView.swift
- Purpose: kid leaderboard (Family / Global / Category scopes).
- View hierarchy: ScrollView { scopePills + (categoryPills if .category) + entries }.
- Services: `SupabaseKidsClient.shared.client`, `KidsAuth`, `KidsAppState`.
- URLs: `kid_profiles` (Global, opt-in filter), RPC `kid_family_leaderboard(p_kid_profile_id)`, RPC `get_kid_category_rank(p_category_id)`, `categories` (kids-safe pill list).
- TODO/FIXME: none.
- COPPA notes: Global only shows kids with `global_leaderboard_opt_in=true`. K11/K13/Ext-W16 markers covering rank semantics + RPC hops.
- Concerns: `loadCategoryOptions` fetches the kids-safe category list directly via PostgREST, separate from `KidsAppState.categories` — small dual-source for category list with different fields. Acceptable because pills need `category_id` while home grid uses slug.

### VerityPostKids/ProfileView.swift
- Purpose: kid profile (header + stats + badges + about/legal links + unpair).
- View hierarchy: ScrollView { header + statsGrid + badgesSection + aboutSection } + 2× `.parentalGate(...)`.
- Services: `SupabaseKidsClient.shared.client`, `KidsAuth`, `KidsAppState`, `UIApplication.shared.open` for legal URLs.
- URLs: `user_achievements` SELECT (+ join to `achievements`); legal links `https://veritypost.com/privacy`, `https://veritypost.com/terms`.
- TODO/FIXME: none.
- COPPA notes: T-013 — parental gate before unpair (de-facto logout); legal links also gated.
- Concerns: `Self.fallbackLegalURL` is force-unwrapped (`URL(string: "https://veritypost.com")!`) — comment justifies ("hardcoded RFC 3986 URL") but it's still a `!` in production. Stats grid value sources: `state.streakDays`, `state.verityScore`, `state.quizzesPassed`, `badges.count` — first three are the dual-source values; badge count is fetched live from `user_achievements`.

### VerityPostKids/ExpertSessionsView.swift
- Purpose: scheduled expert sessions list (read-only).
- View hierarchy: ScrollView { header + (parentGatePlaceholder | sessions list) } + tap → detail sheet.
- Services: `SupabaseKidsClient.shared.client`.
- URLs: `kid_expert_sessions` SELECT (status in ('scheduled','live'), is_active=true).
- TODO/FIXME: none.
- COPPA notes: C16 — entire tab gated behind parental check session-stickily (`parentGatePassed` flag); fetch is suppressed until gate passes. Apple Kids Category requires gate before adult-contact discovery.
- Concerns: `parentGatePassed` is `@State`, so backgrounded → returns to gate on next launch (intentional, comment says "session-sticky").

### VerityPostKids/Models.swift
- Purpose: Codable structs mirroring DB tables (`kid_profiles`, `categories`, `articles`, `reading_log`, `quizzes`, `quiz_attempts`, `achievements`, `user_achievements`, `category_scores`, `kid_expert_sessions`).
- Services: none.
- URLs: none.
- TODO/FIXME: header comment "Verified against live Supabase schema 2026-04-19" — date stamp is now ~6 days stale; verify on the next migration touching these tables.
- Concerns: `LeaderboardEntry` is not Codable (it's not a wire shape — local view-model only). All other types map snake_case via `CodingKeys`.

### VerityPostKids/KidsTheme.swift
- Purpose: design tokens (`enum K`) + `Font.scaledSystem(...)` + `Color(hex:)`.
- Services: `UIFontMetrics`, `Scanner`.
- URLs: none.
- TODO/FIXME: none.
- COPPA notes: T-029 — Dynamic Type support via `UIFontMetrics`; required for Apple Kids accessibility review. Limitation noted: changing text size mid-foreground doesn't auto-recompute (deferred).
- Concerns: `Font.scaledSystem(...)` snapshots `UIFontMetrics.default` at call time; correctly described in comments. K9 fuchsia sentinel for unparseable hex.

### VerityPostKids/KidPrimitives.swift
- Purpose: shared display primitives (StatBubble, BadgeTile, LeaderRow).
- Services: none.
- TODO/FIXME: none.
- COPPA notes: none.
- Concerns: `BadgeTile.iconFor(_:)` whitelist of SF Symbols — small allowlist; unknown DB icon names silently fall back to `star.fill`. Acceptable.

### VerityPostKids/TabBar.swift
- Purpose: bottom tab bar (Home/Ranks/Experts/Me).
- Services: none.
- TODO/FIXME: none.
- Concerns: none.

### VerityPostKids/GreetingScene.swift
- Purpose: V3 morning ritual / home greeting scene with typewriter name + staggered reveal.
- Services: `ParticleEmitter`.
- URLs: none.
- TODO/FIXME: none.
- COPPA notes: K6 — uses Task-based `try await Task.sleep` so SwiftUI auto-cancellation propagates (replaces fire-and-forget `DispatchQueue.main.asyncAfter`). K7 — typewriter walks Characters (extended grapheme clusters). Reduce-motion path snaps to final state.
- Concerns: `nameTextFrame` measured via PreferenceKey for sparkle anchor; falls back to hardcoded coords if zero.

### VerityPostKids/StreakScene.swift
- Purpose: V3 streak +1 scene (flame + ring pulses + 70-particle burst + milestone card).
- Services: `ParticleEmitter`, `Timer` for 30 sparkle emissions.
- URLs: none.
- TODO/FIXME: none.
- COPPA notes: reduce-motion → static end-state.
- Concerns: choreography uses `DispatchQueue.main.asyncAfter` (NOT structured Task.sleep) — same fire-and-forget pattern that GreetingScene migrated away from in K6. If the scene dismisses mid-choreography, the queued blocks still fire against `@State` on a vanished view. Minor; SwiftUI tolerates it but it's the inconsistency K6 explicitly called out as a fix.

### VerityPostKids/QuizPassScene.swift
- Purpose: V3 quiz-pass celebration (radial chip sweep + score ring + 80-particle confetti).
- Services: `ParticleEmitter`.
- URLs: none.
- TODO/FIXME: none.
- COPPA notes: reduce-motion → static end-state.
- Concerns: **NOT REFERENCED ANYWHERE in the runtime tree.** `KidsAppRoot.ActiveSheet` enum has cases `.streak`, `.articles`, `.badge` — no `.quizPass`. Search shows the only references to `QuizPassScene` are the file itself + `KidQuizEngineView.swift` comment "ends with the V3 QuizPassScene or a 'Try again' state" (stale — actual quiz engine renders its own `resultView` inline). This is orphan UI. Either wire it from `handleQuizComplete` or delete.

### VerityPostKids/BadgeUnlockScene.swift
- Purpose: V3 badge unlock (badge enter + shimmer + pulse rings + 50-particle burst).
- Services: `ParticleEmitter`.
- URLs: none.
- TODO/FIXME: none.
- COPPA notes: reduce-motion → static end-state.
- Concerns: same `DispatchQueue.main.asyncAfter` pattern as StreakScene. `BadgeUnlockScene: Identifiable` extension lives in `KidsAppRoot.swift` (not here) — minor cohesion smell. Currently only enqueued when `biasedSpotted: true` & `biasedHeadlinesSpotted == 5`, but the only call-site (`KidsAppRoot.handleQuizComplete`) hardcodes `biasedSpotted: false`, so this scene is also unreachable in current runtime.

### VerityPostKids/CountUpText.swift
- Purpose: animatable count-up Text (rolling number).
- Concerns: none.

### VerityPostKids/FlameShape.swift
- Purpose: animated teardrop flame (TimelineView-driven path morph).
- Concerns: none.

### VerityPostKids/ParticleSystem.swift
- Purpose: SwiftUI particle emitter + ParticleLayer canvas.
- Concerns: `ParticleLayer.body` ticks emitter via `.onChange(of: timeline.date)` — runs at 60 FPS via `TimelineView(.animation)`. Could have unbounded particles if a caller spams burst; sane bounds would be a defensive add.

### VerityPostKids/Info.plist
- `CFBundleURLSchemes` registers `veritypostkids` scheme.
- Reads `SUPABASE_URL`, `SUPABASE_KEY`, `VP_SITE_URL` from build settings.
- Portrait-locked (`UIInterfaceOrientationPortrait`), `UIRequiresFullScreen=true`.
- `ITSAppUsesNonExemptEncryption=false` (export-compliance flag).

### VerityPostKids/VerityPostKids.entitlements
- `aps-environment=development` — APNs dev only; needs production swap before TestFlight.
- `com.apple.developer.associated-domains=[applinks:veritypost.com]` — Universal Links.

### VerityPostKids/PrivacyInfo.xcprivacy
- `NSPrivacyTracking=false`.
- `NSPrivacyCollectedDataTypes`: OtherUserContent + UserID + DeviceID (all linked, non-tracking, AppFunctionality only).
- `NSPrivacyAccessedAPITypes`: UserDefaults (`CA92.1` reason).
- No tracking domains.

### VerityPostKids/Assets.xcassets/{AppIcon, kidsLaunchBackground}
- AppIcon set + launch-screen color asset.

### VerityPostKidsUITests/SmokeTests.swift
- 4 XCUITests: cold launch, pair-code prompt visible, Pair button initially disabled, seeded code `VPE2E001` flips Pair-button enabled state.
- Concerns: `test_seededPairCodeUnlocksPairButton` assumes web E2E seed has run; doesn't verify post-pair surface. Comment in test says PairCodeView uses one TextField per slot ("codeLength = 8 by default") — INCORRECT: actual implementation uses a single `TextField("XXXXXXXX", ...)` (single field, one input). The test logic still works (taps first textfield + types 8 chars) but the intent comment is wrong.

## Verification checklist
- **PairingClient custom-JWT path:** CONFIRMED. `applySession(token:)` (PairingClient.swift line 272–278) explicitly skips `client.auth.setSession` and routes through `SupabaseKidsClient.shared.setBearerToken(token)`, which rebuilds the SupabaseClient with `Authorization: Bearer <token>` in `GlobalOptions.headers`. Inline comment cites the COPPA reason: `kid_profile_id` not in `auth.users`. `SupabaseKidsClient.swift` repeats the same explanation at the top of file.
- **ParentalGateModal callers:** CLAUDE.md claim "zero callers (T-tbd)" is STALE. Found 4 live callers via `.parentalGate(isPresented:onPass:)` modifier:
  - `PairCodeView.swift:143` — gates the Need-help mailto.
  - `ProfileView.swift:48` — gates Unpair (T-013).
  - `ProfileView.swift:51` — gates Privacy/Terms outbound links.
  - `ExpertSessionsView.swift:85` — gates the entire Expert Sessions tab fetch (C16, session-sticky).
  Plus the convenience `View.parentalGate(isPresented:onPass:)` modifier defined in `ParentalGateModal.swift:257–272`. This matches the user-memory note `feedback_verify_audit_findings_before_acting.md` ("ParentalGate has live COPPA callers").
- **KidsAppState dual-source risk:** CONFIRMED. `KidsAppState.completeQuiz(passed:score:biasedSpotted:)` directly mutates `verityScore`, `quizzesPassed`, `streakDays`, `biasedHeadlinesSpotted` in memory before any server confirmation. The next `load()` (foreground refresh, K2 path) re-reads `streak_current` from `kid_profiles` and corrects, but the score/quizzesPassed columns aren't reloaded at all in `loadKidRow()` — only `streak_current` is selected. So `verityScore` and `quizzesPassed` shown in ProfileView statsGrid are pure local accumulators across the session. KidsAppRoot's K4 guard suppresses CELEBRATION when `writeFailures > 0` but still calls `state.completeQuiz(passed: result.passed, ...)` which still bumps the in-memory values.
- **V3 scenes present:** All four present.
  - `GreetingScene.swift` — confirmed.
  - `StreakScene.swift` — confirmed.
  - `QuizPassScene.swift` — present BUT orphan (no live caller; not in KidsAppRoot.ActiveSheet).
  - `BadgeUnlockScene.swift` — confirmed; only path that produces it (biasedSpotted) is hardcoded false at the only call-site, so unreachable in current build.
- **PrivacyInfo.xcprivacy present:** YES — `VerityPostKids/VerityPostKids/PrivacyInfo.xcprivacy`. Contents reviewed above (no tracking, three linked data types, UserDefaults API reason CA92.1).
- **Any GoTrue auth in kid flow:** NO. `client.auth.*` and `setSession` are explicitly NOT called anywhere in the kids target — only references are explanatory comments in `SupabaseKidsClient.swift` and `PairingClient.swift` describing why they're avoided. The only `auth.signOut()` reference (`ProfileView.swift:49`) is calling our local `KidsAuth.signOut()` (not Supabase GoTrue). Clean.

## pbxproj target inventory

- Application target: `VerityPostKids` (productType `com.apple.product-type.application`)
  - Bundle ID: `com.veritypost.kids`
  - Deployment target: iOS 17.0
  - Device family: 1,2 (iPhone + iPad)
- UI test target: `VerityPostKidsUITests` (productType `com.apple.product-type.bundle.ui-testing`)
  - Bundle ID: `com.veritypost.kids.uitests`
  - Deployment target: iOS 17.0
  - Device family: 1,2

## Notable claims worth verifying in later waves

1. **CLAUDE.md claim "ParentalGateModal — defined, zero callers (T-tbd)" is stale.** The modal has 4 live callers across 3 files. CLAUDE.md / MASTER_TRIAGE should drop this entry or rewrite. (User-memory `feedback_verify_audit_findings_before_acting.md` already notes this.)
2. **`QuizPassScene.swift` is orphan UI.** Implemented + previewed but never enqueued in `KidsAppRoot.ActiveSheet`. Either wire from `handleQuizComplete` (replace inline `KidQuizEngineView.resultView`) or delete the file. Worth a triage item.
3. **`BadgeUnlockScene` is unreachable.** Only call-site (`KidsAppRoot.handleQuizComplete`) passes `biasedSpotted: false` hardcoded; the badge path requires `biasedSpotted == true` AND `biasedHeadlinesSpotted == 5`. The "spotted a biased headline" feature is not wired through quiz_attempts → KidsAppState. Either wire the bias-spotting signal or scope down the badge logic. Triage item.
4. **`KidReaderView` 80% scroll-progress claim is stale code-comment.** File header says "when the kid scrolls to ≥80% of the article, emits a reading_log INSERT" but the implementation logs on takeQuiz button tap with `read_percentage: 1.0` hardcoded. Dead types `ReaderContentHeightKey` + `ReaderScroll` confirm an abandoned scroll-tracking pass. Either rewire the threshold or update the comment + delete the dead types.
5. **`KidsAppState.loadKidRow()` only refreshes `streak_current`, not `verity_score`/`quizzesPassed`/`biasedHeadlinesSpotted`.** The dual-source risk is asymmetric — streak heals on foreground, score/quiz-count drift across a paired session until cold launch. If those columns exist on `kid_profiles`, the SELECT should include them; if they don't, the in-memory fields are session-only counters and the comment header should reflect that.
6. **`StreakScene` + `BadgeUnlockScene` still use fire-and-forget `DispatchQueue.main.asyncAfter`** for choreography — the same pattern K6 explicitly migrated `GreetingScene` away from for cancellation safety. Worth a small follow-up to bring them in line.
7. **`Models.swift` "Verified against live schema 2026-04-19" stamp** is now ~6 days stale relative to current date 2026-04-25; verify on next schema touch involving `kid_profiles`/`articles`/`quizzes`/`quiz_attempts`/`reading_log`/`achievements`/`user_achievements`/`kid_expert_sessions`.
8. **Entitlements declares `aps-environment=development`.** Needs production swap on Apple Dev account enrollment (matches the standing Apple-block items in MASTER_TRIAGE).
9. **`PrivacyInfo.xcprivacy` only declares UserDefaults API access.** Keychain access via `SecItemAdd`/`SecItemCopyMatching` is also used (PairingClient) — Apple's required-reason API list does NOT currently include Keychain Services, so this is fine, but worth re-checking when Apple's PR-RQ-1 list updates.
10. **Hardcoded fallback `https://veritypost.com`** in `SupabaseKidsClient.siteURL` will be hit in any release build that doesn't set `VP_SITE_URL` — OK for prod, breaks any preview/staging environment silently. Confirm build settings in Xcode targets.
11. **`KidQuizEngineView.writeAttempt` mutates `writeFailures` from a non-MainActor Task continuation.** Currently safe because of SwiftUI's `@State` value-type semantics, but a future actor refactor would break it. Worth flagging.
12. **PairCodeView `Timer.scheduledTimer` cooldown isn't invalidated on `.onDisappear`.** Minor leak (1 timer ref + 60s lifetime).
13. **Smoke test comment about "one TextField per slot"** is wrong — actual UI is a single TextField. Update the comment.
