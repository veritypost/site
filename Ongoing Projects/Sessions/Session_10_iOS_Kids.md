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
🟦 **Source:** TODO A6. **CRITICAL — defeats pass-to-comment / pass-to-streak mechanic.**
**Files:**
- iOS: `VerityPostKids/VerityPostKids/Models.swift:147-156, 199`.
- Server: route kids quiz fetch through a server endpoint (e.g., `/api/kids/quiz/[id]`) that strips `is_correct` from each option before returning. Mirror adult `APIQuizQuestion` shape. Server-side `get_kid_quiz_verdict` RPC stays SoT.
**Action:** Build the new server endpoint at `web/src/app/api/kids/quiz/[id]/route.ts`. Update iOS Models to decode the stripped shape. Update kids fetch path to use the new endpoint.

### S10-A7 — Kids reader falls back to adult body when `kids_summary` empty
🟦 **Source:** TODO A7.
**File:** `VerityPostKids/VerityPostKids/KidReaderView.swift:218`.
**Action:** If `kids_summary` empty, render empty state ("Story not ready yet — try another"). Never fall through to `body`.

### S10-A8 — 26 `DispatchQueue.main.asyncAfter` chains
🟦 **Source:** TODO A8.
**Files:**
- `VerityPostKids/VerityPostKids/BadgeUnlockScene.swift:224-289`
- `VerityPostKids/VerityPostKids/QuizPassScene.swift:281-321`
- `VerityPostKids/VerityPostKids/StreakScene.swift:210-272`
- `VerityPostKids/VerityPostKids/KidsAppRoot.swift:281`
**Action:** Convert each scene to `try await Task.sleep` inside `.task` so SwiftUI cancels on disappear. Pattern proven on `GreetingScene`.

### S10-A39 — Kid app launches into PairCodeView before GraduationHandoffView (200-500ms flash)
🟦 **Source:** TODO A39.
**Files:**
- `VerityPostKids/VerityPostKids/KidsAuth.swift:34-36`
- `VerityPostKids/VerityPostKids/KidsAppRoot.swift:14-16`
**Action:** Add `KidsAuth.isBusy: Bool` published property. While restore Task runs, `KidsAppRoot` shows neutral "Loading..." gate. Only after restore Task completes does the view branch.

### S10-A40 — Kids app `loadError` set but never displayed
🟦 **Source:** TODO A40.
**File:** `VerityPostKids/VerityPostKids/KidsAppState.swift:140-185`.
**Action:** Add subtle banner in `GreetingScene` or `KidsAppRoot` that surfaces `state.loadError` when set. Don't block the kid's session.

### S10-A41 — Kid quiz pass falls back to local 60% threshold when server fails
🟦 **Source:** TODO A41.
**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:443-448`.
**Action:** Fail closed — show error state with retry button rather than guessing the verdict.

### S10-A42 — Resolved (false positive in audit)
🟩 No work.

### S10-A70 — Kid pair JWT signed with same `SUPABASE_JWT_SECRET`
🟨 Bundle with S10-Q3b-pair. Long-term fix is separate signing key (per memory, this is AR2 — multi-week, parked).

### S10-A84 — KidQuizEngineView writeAttempt single retry no backoff
🟦 **Source:** TODO A84.
**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:395-429`.
**Action:** 2 retries with 0.5s / 1.5s backoff. Mirror S9-A81 pattern.

### S10-A85 — KidsAppState.loadProgressCounts indexes by position
🟦 **Source:** TODO A85.
**File:** `VerityPostKids/VerityPostKids/KidsAppState.swift:209-226`.
**Action:** Map by `id` not position. Build `Dictionary<UUID, Count>` keyed on category id.

### S10-A86 — KidQuizEngineView in-flight writes hang on dismiss
🟦 **Source:** TODO A86.
**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:347-354`.
**Action:** Detach in-flight writes from view-task dependency. Kick off as fire-and-forget tasks; fire `onDone` immediately. Persist results to a queue if needed.

### S10-A87 — ArticleListView.openArticle dismiss races onQuizComplete
🟦 **Source:** TODO A87.
**File:** `VerityPostKids/VerityPostKids/ArticleListView.swift:90-95`.
**Action:** Explicit completion-then-dismiss ordering: callback fires first, sets state; dismiss fires after via `.task(id:)` watching post-completion state.

### S10-A88 — ParentalGateModal Timer fires on .default RunLoop mode
🟦 **Source:** TODO A88.
**File:** `VerityPostKids/VerityPostKids/ParentalGateModal.swift:226`.
**Action:** Schedule on `.common` mode: `RunLoop.current.add(timer, forMode: .common)`. Or migrate to `Task { while !Task.isCancelled { try? await Task.sleep(...) } }`.

### S10-A89 — KidsAppRoot celebration scenes no top-level a11y label
🟦 **Source:** TODO A89.
**File:** `VerityPostKids/VerityPostKids/KidsAppRoot.swift:128-149`.
**Action:** Add top-level `.accessibilityElement(children: .combine)` with labeled summary on `StreakScene` and `BadgeUnlockScene` content.

### S10-A90 — KidQuizEngineView fetchServerVerdict conflates write vs read failures
🟦 **Source:** TODO A90.
**File:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:388-391`.
**Action:** Split into `verdictUnavailable` (separate flag) vs `writeFailures` (only true persist failures).

### S10-A91 — KidReaderView body loaded once, never refreshed
🟦 **Source:** TODO A91.
**File:** `VerityPostKids/VerityPostKids/KidReaderView.swift:20, 196-224`.
**Action:** Subscribe to article UPDATEs filtered by `id` OR re-fetch on `scenePhase` foreground transition.

### S10-A92 — BadgeUnlockScene shimmer rotation accumulates
🟦 **Source:** TODO A92.
**File:** `VerityPostKids/VerityPostKids/BadgeUnlockScene.swift:241`.
**Action:** Reset `shimmerRotation = 0` in `.onAppear` before kicking off animation.

### S10-A93 — Quiz pass threshold drift (60% iOS vs 67% admin)
🟦 **Source:** TODO A93.
**Files:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:447, 464` + new public settings endpoint.
**Action:** Single source of truth (server settings). iOS reads on first launch via public settings endpoint, caches locally. Pair with A41 fix.

### S10-A94 — KIDS_QUIZ_PROMPT doesn't enforce "exactly one option correct"
🟦 **Source:** TODO A94. **Lives in `web/src/lib/pipeline/editorial-guide.ts:1007-1032`** which is **S6-owned (pipeline)**. Hand off to S6.

### S10-A27 — `/api/kids` POST silently swallows seat-cap check errors
🟦 **Source:** TODO A27.
**File:** `web/src/app/api/kids/route.js:135-142`.
**Action:** Fail-closed: if seat-check throws, return 503 with `Retry-After`. Better — wrap entire create-kid flow in a SECURITY DEFINER RPC enforcing the cap atomically.
**RPC creation goes to S1.** S10 wires the route to call the new RPC.

### S10-A53-kids — "Verity Post Kids" vs "Verity Kids" / "Verity" alone
🟦 **Source:** TODO A53 (kids slice).
**Files:**
- `VerityPostKids/VerityPostKids/Info.plist:8` — currently "Verity Post Kids" — keep.
- `VerityPostKids/VerityPostKids/QuizPassScene.swift:202` — "Verity Score" — replace with "Score" or "Reading score".
- `VerityPostKids/VerityPostKids/GraduationHandoffView.swift:65, 72, 108` — "Verity" alone three times — replace with "Verity Post" or product name.

### S10-A52-kids — Brand casing in kids
🟦 **Source:** TODO A52 (kids slice). Sweep `grep -rn "verity post\|verityPost" VerityPostKids/`. Pick canonical "Verity Post Kids" or "Verity Post".

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
