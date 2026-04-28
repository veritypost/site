# Session 10 — iOS Kids App + Kids Server Routes

**Owns (strict):**
- `VerityPostKids/**`
- `web/src/app/api/kids/**`
- `web/src/app/api/kids-waitlist/**`

**Hermetic guarantee:** No edits to adult iOS, web pages, admin, billing, or shared libs. Kids-only.

**Major workstreams:**
- COPPA + federal compliance hardening (Q3b kid JWT cluster, A8 async-after, A41 verdict fail).
- Kids correctness sweep (~20 individual items).
- Brand consistency (A53 kids slice).

---

## Items

### S10-Q3b-pair — Kid JWT issuer flip
🟨 **Source:** OWNER-ANSWERS_READ_ONLY_HISTORICAL.md Q3b — RED verdict from audit. Co-ships with S1 (RPC kid-rejects + RLS hardening) + S3 (middleware kid-blind fix + `kindAllowed` param).
**Files:**
- `web/src/app/api/kids/pair/route.js:149` — change `iss: 'verity-post-kids-pair'` to `iss: \`${SUPABASE_URL}/auth/v1\``. Add `is_kid_delegated: true` claim explicitly at top level. Move `kid_profile_id` to top level (currently top level — verify; coordinate with S1's `current_kid_profile_id()` rewrite to read top level).
- `web/src/app/api/kids/refresh/route.js:114` — same iss + claim shape.
**Wait for:** S1 RPC kid-rejects migration + S1 `users` RLS RESTRICTIVE policies + S3 middleware kid-blind fix + S3 `kindAllowed` param. **Do not flip the issuer until all three peer sessions land.**

### S10-A2 — Kid pair JWT issuer mismatch (resolved by Q3b above)
🟩 Same as S10-Q3b-pair.

### S10-A3-iOS — `parental_consents` upsert silently fails
🟨 DB constraint lives in S1-A3. iOS slice: verify the upsert hits the new constraint correctly post-S1 ship. **Pure verification, no code work.**

### S10-A6 — Kids quiz options ship `is_correct` to client
🟨 **PARTIAL — `33ba61e`.** Server endpoint `GET /api/kids/quiz/[id]` shipped with kid-JWT-shape verification, kids-safe defense-in-depth, closed SafeOption projection, rate limiting, and NO_STORE headers. iOS-side cutover deferred — switching the kids client off direct supabase-swift fetch onto the new endpoint requires also building a server-side answer-write endpoint (`POST /api/kids/quiz/[id]/answer`) that takes `selected_answer`, looks up `is_correct` server-side, and writes `quiz_attempts.is_correct` from the lookup. Without that companion endpoint, stripping `is_correct` from the fetch breaks the verdict RPC because `quiz_attempts.is_correct` ends up uniformly false. Companion endpoint is co-design with S1 (RLS on quiz_attempts). Also discovered: `public.get_kid_quiz_verdict` references non-existent `public.quiz_questions` (only `public.quizzes` + `public.quiz_attempts` are base tables) — RPC currently throws on every call, S1 surface to repair.

### S10-A7 — Kids reader falls back to adult body when `kids_summary` empty
🟩 **`7079b60`.** Dropped `body` from the SELECT entirely; decode `kids_summary` only. Empty result renders `notReadyState` empty state ("Story not ready yet — try another.") with back button; quiz button hidden.

### S10-A8 — 26 `DispatchQueue.main.asyncAfter` chains
🟩 **`dd9166d`.** All 26 blocks across BadgeUnlockScene, QuizPassScene, StreakScene, KidsAppRoot converted to `try await Task.sleep` inside `.task`. Each phase calls `Task.checkCancellation()` between sleeps. Reduce-motion branches preserved unchanged. Wall-clock cadence preserved within ~1 frame.

### S10-A39 — Kid app launches into PairCodeView before GraduationHandoffView (200-500ms flash)
🟩 **`187d41c`.** `KidsAuth.isBusy` already existed; added consumer-side third branch in `KidsAppRoot.body` rendering a neutral `launchGate` when (auth.isBusy && auth.kid == nil). Once restore() resolves, the existing two-branch logic takes over.

### S10-A40 — Kids app `loadError` set but never displayed
🟩 **shipped via cross-session leak in `e063073` (S9 commit).** `KidsAppRoot` now renders a subtle `.thinMaterial` banner overlay when `state.loadError` is set; tap retries `state.load()`; auto-dismisses on success. Kid-friendly wording. Full underlying message piped to VoiceOver.

### S10-A41 — Kid quiz pass falls back to local 60% threshold when server fails
🟩 **`8334339`.** Local fallback path eliminated — `currentResult` is now `KidQuizResult?`, returns nil whenever `serverVerdict` is unresolved. New `verdictFetchFailed` flag (split from `verdictPending`) routes the result body to a dedicated `verdictFailureBody` with retry/close buttons. Removed the `writeFailures += 1` bump on RPC failure so a verdict-RPC failure doesn't masquerade as a write failure.

### S10-A42 — Resolved (false positive in audit)
🟩 No work.

### S10-A70 — Kid pair JWT signed with same `SUPABASE_JWT_SECRET`
🟨 Bundle with S10-Q3b-pair. Long-term fix is separate signing key (per memory, this is AR2 — multi-week, parked).

### S10-A84 — KidQuizEngineView writeAttempt single retry no backoff
🟩 **`c6d8b68`.** dispatchWrite now runs primary + 2 retries with 0.5s / 1.5s backoff. Total retry budget = 2s + 3 RPC calls; fits inside the 3s drain-gate window. T251 persistence layer still owns the cross-launch recovery for terminal failures.

### S10-A85 — KidsAppState.loadProgressCounts indexes by position
🟩 **`54e3a33`.** Added `categoryId: String?` to KidCategory; loader sets it from `rows.id`; `loadProgressCounts()` joins purely by `cat.categoryId` against `articles.category_id` map. Dropped the positional `categoryIds[safe: i]` lookup and the now-unused `subscript(safe:)` Array extension. Offline-fallback init leaves categoryId nil so those rows skip count-merge.

### S10-A86 — KidQuizEngineView in-flight writes hang on dismiss
🟩 **already addressed by T251 persistence layer (acknowledged in `c6d8b68`).** Cited line 347-354 was loadQuestions (read path), not write path. Actual write path runs as standalone `Task { }` inside `dispatchWrite()` — already detached from any view-task tree. View dismiss has no effect on in-flight writes; they finish in background and the on-launch hydrator picks up unconfirmed entries from the on-disk queue.

### S10-A87 — ArticleListView.openArticle dismiss races onQuizComplete
🟩 **stale audit citation — verified clean.** Read the current code: KidReaderView's onDone closure fires `onQuizComplete(r)` (sync, completes its state mutations including KidsAppRoot.handleQuizComplete) THEN `dismiss()`. The order is already completion-then-dismiss. KidsAppRoot.handleQuizComplete sets activeSheet=nil synchronously inside onQuizComplete, so dismiss() inside KidReaderView is a no-op against the already-collapsing parent. No race. No code change.

### S10-A88 — ParentalGateModal Timer fires on .default RunLoop mode
🟩 **`bef1621`.** Switched from Timer.scheduledTimer (attaches to .default mode, suspends during UI tracking) to a manually-scheduled Timer added to RunLoop.current in .common mode. Lockout countdown ticks every second regardless of UI tracking state.

### S10-A89 — KidsAppRoot celebration scenes no top-level a11y label
🟩 **`be4e03d`.** Added `.accessibilityElement(children: .combine)` + stitched `.accessibilityLabel` summary on each scene's body root. StreakScene: "<N> day streak. <milestone headline>. <milestone subhead>." BadgeUnlockScene: "<tier> unlocked. <headline> <subhead>". Share + done buttons remain reachable as element actions via SwiftUI's button-hoist behavior.

### S10-A90 — KidQuizEngineView fetchServerVerdict conflates write vs read failures
🟩 **`8334339` (acknowledged in `c6d8b68`).** Split: introduced `verdictFetchFailed` flag separate from `writeFailures` in the A41 commit. Removed the `writeFailures += 1` bump from fetchServerVerdict's catch block — RPC failure no longer poisons the writeFailures gate that drives KidsAppRoot's streak-mutation guard.

### S10-A91 — KidReaderView body loaded once, never refreshed
🟩 **`f719aa5`/`7079b60`.** Added `.onChange(scenePhase)` hook that re-runs loadArticle() on .active transition. Picks up editor revisions (typo fix, factual correction, moderation pull) on the next foreground.

### S10-A92 — BadgeUnlockScene shimmer rotation accumulates
🟩 **`a1e54c2`.** Reset `shimmerRotation = 0` at top of `runChoreography(at:)`, before the reduce-motion branch. Re-presented scenes always start the sweep from 0°.

### S10-A93 — Quiz pass threshold drift (60% iOS vs 67% admin)
🟩 **`8334339`.** Threshold copy in `successBody` now reads `serverVerdict.thresholdPct` (returned per-call by the verdict RPC) instead of a hardcoded 0.6. iOS no longer carries a threshold opinion — both the verdict and the displayed threshold come from the same RPC response. The audit's recommended public settings endpoint is over-engineering for this when the threshold ships alongside every verdict.

### S10-A94 — KIDS_QUIZ_PROMPT doesn't enforce "exactly one option correct"
🟦 **Source:** TODO A94. **Lives in `web/src/lib/pipeline/editorial-guide.ts:1007-1032`** which is **S6-owned (pipeline)**. Hand off to S6.

### S10-A27 — `/api/kids` POST silently swallows seat-cap check errors
🟩 **`c732002`.** seat-check try/catch now fails closed with 503 + Retry-After: 5 + `seat_check_unavailable` code. Plan-cap math is the single guardrail; transient errors no longer bypass it. The audit's preferred SECURITY DEFINER atomic-cap RPC is S1's surface — left as future coordinated work.

### S10-A53-kids — "Verity Post Kids" vs "Verity Kids" / "Verity" alone
🟩 **`f4836f3`.** QuizPassScene "Verity Score" → "Score". ProfileView "Verity score" → "Score". Info.plist already correct ("Verity Post Kids"). `GraduationHandoffView.swift` does not exist in the kids project — that path is adult-iOS-owned (S9); cited audit lines were a stale path. No code change needed for kids slice on that file.

### S10-A52-kids — Brand casing in kids
🟩 **`f4836f3`.** Swept `grep -in "verity post\|verityPost" VerityPostKids/VerityPostKids/*.swift`. Remaining occurrences are all canonical: "Verity Post Kids" (PairCodeView title, Info.plist), "veritypost.com" (URL constants in SupabaseKidsClient, ProfileView, PairCodeView mailto), and code identifiers `VerityPostKidsApp`/`VerityPostKids` (folder/struct names — not user-facing). No bare "Verity" remains in user-facing copy.

### S10-T0.5-iOS — Kid token claim shape coherence
🟨 Kid mint at `kids/pair/route.js:153` puts `kid_profile_id` at top level. S1 migration rewrites `current_kid_profile_id()` to read top-level. **No iOS change.** Verification only after S1 ships.

### S10-T3.2 — Bundle Phase 5.6 graduation deep link with iOS parent UI
🟧 **OWNER-PENDING** — TODO2 T3.2. Owner picks (A) ship Phase 5.5 standalone (~7.5h) or (B) bundle 5.5+5.6 deep-link (~10-11h, requires Universal Links setup which is owner Apple Dev console).
**Files when answered:** `VerityPost/VerityPost/FamilyViews.swift` (1,422 lines). **But that's adult-iOS-owned (S9).** Coordinate.
**Recommendation:** B — half-broken iOS-first family flow is worse than waiting.

### S10-T3.4 — Universal Links setup
🟧 **OWNER-PENDING** — Apple Developer console step. Owner-side. No code.

---

## Out of scope

- Adult iOS (S9).
- Web (S3-S8).
- Server-side billing (S4) / admin (S6).
- Pipeline lib (S6).

## Final verification

- [ ] Kids app builds in Xcode.
- [ ] No `is_correct` flag in kids quiz API response payload.
- [ ] Kids quiz pass uses fail-closed pattern (no local fallback verdict).
- [ ] Q3b kid JWT issuer flip lands ONLY after S1 + S3 ship.
- [ ] Brand strings use "Verity Post Kids" or "Verity Post" — never bare "Verity" or "Verity Score".
- [ ] Commits tagged `[S10-Annn]` or `[S10-Tnnn]`.
