# W2-03: Kids Product Consistency

## Q1: ParentalGateModal callers — CLAUDE.md WRONG, Z18 RIGHT (4 callers verified)

`grep -rn "ParentalGateModal\|parentalGate" VerityPostKids/`:
- `PairCodeView.swift:143` — `.parentalGate(isPresented: $showHelpGate)` (mailto help link)
- `ProfileView.swift:48` — `.parentalGate(isPresented: $showUnpairGate)` (unpair confirmation)
- `ProfileView.swift:51` — `.parentalGate(isPresented: $showLegalGate)` (legal links)
- `ExpertSessionsView.swift:85` — `.parentalGate(isPresented: $showParentGate)` (session-sticky gate)

Plus the convenience modifier `.parentalGate(...)` defined in `ParentalGateModal.swift:257`.

**CLAUDE.md update needed:** remove the "zero callers (T-tbd)" remark.

## Q2: KidsAppState dual-source — CONFIRMED in code

`KidsAppState.swift`:
- Line 19-21: `@Published var streakDays`, `verityScore`, `quizzesPassed` — local in-memory state.
- Line 89: `loadKidRow()` only reassigns `streakDays = row.streak_current ?? 0`. It does NOT re-read `verityScore` or `quizzesPassed`.
- Line 187: `func completeQuiz(passed:, score:, biasedSpotted:)` — synchronous local mutation.
- Line 197-200: directly increments `verityScore += scoreDelta`, `quizzesPassed += 1`, `streakDays += 1` BEFORE any server call.

**Drift mechanism:** if the server-side quiz pass write fails, the in-memory totals diverge from DB. Next session's `loadKidRow()` will only sync streak. verityScore + quizzesPassed remain stale until app restart triggers a full fetch.

**Recommended fix:** make `completeQuiz` async; on server success, replace local state with the canonical totals returned by the RPC; on failure, revert (or never optimistically apply).

## Q3: QuizPassScene + BadgeUnlockScene — Z18 RIGHT on both

- **QuizPassScene** is orphan: only referenced in its own `#Preview` block (`QuizPassScene.swift:335`) and a comment in `KidQuizEngineView.swift:7`. No external constructor or presenter.
- **BadgeUnlockScene** is wired into `KidsAppState.completeQuiz` (line 202: `var badge: BadgeUnlockScene? = nil`; line 203 `if biasedSpotted { ... badge = BadgeUnlockScene(...) }`) and into `KidsAppRoot.swift:32` as a scene-chain enum case. **BUT:** `KidsAppRoot.swift:199` passes `biasedSpotted: false` hardcoded. The `if biasedSpotted` branch is unreachable — badge will never be assigned, so `KidsAppRoot` never sees a `.badge(...)` enqueue.

**Recommended fix:** either (a) decide product-level whether bias-spotting is a feature and wire `biasedSpotted` from quiz answers, or (b) delete the scene + dead branch.

## Q4: Web kid routes — VERIFIED PER CLAUDE.md
- `/kids/*` redirects (Z13).
- `/kids-app/` is the anon landing (Z13).
- `/profile/kids/*` is parent management (Z13).
- `api/kids/*` endpoints — per Z15: pair, generate-pair-code, [id], verify-pin, reset-pin, set-pin, trial. All gate either parent auth OR kid bearer JWT. (Spot-verify in Wave 3.)

## Q5: Schema kid migrations 094-099 + RLS

Verified RLS state for kid_* tables via `pg_policies`:
- All readable kid tables (`kid_articles`, `kid_quizzes`, `kid_sources`, `kid_timelines`, `kid_discovery_items`) gate read on `is_kid_delegated()` AND content state.
- `kid_profiles` has 6 SELECT policies covering parent ownership, kid-JWT self-read, sibling-read via parent_user_id JWT claim, global-leaderboard opt-in, admin-or-above. Solid.
- `kid_sessions_nowrite` policy with `qual=false` — blocks all direct writes (writes go through service-role RPCs only).
- `kid_pair_codes` blocks kid-JWT entirely; parent-only.
- `kid_expert_questions_insert_kid_jwt` has `qual=null` — RLS allows INSERT, relies on WITH CHECK or RPC validation.

**RLS architecture is sound.** L08-001's "NULL = uuid → FALSE" failure-mode (Z05 finding) does NOT apply because `is_kid_delegated()` short-circuits before any kid_profile_id comparison, AND a kid's `auth.uid()` IS their `kid_profile_id` (per CLAUDE.md custom JWT design).

## Q6: L08-001 vs C15 contradiction — RESOLVED in code's favor

Both Round 2 framings have grains of truth but:
- L08-001 claim "kid RLS blocks writes (NULL = uuid → FALSE)" is **WRONG** for the listed kid tables — most have explicit kid-JWT INSERT policies with proper qualifiers.
- C15 "data egress" framing is **closer to right** — the policies are about preventing cross-kid reads + admin access controls.
- **Net:** neither is fully accurate, but C15 is closer to live behavior.

## Q7: Apple-block iOS items — same items, multiple docs

Per Z17 + Z18:
- Adult: APNs `aps-environment` entitlement MISSING; AppIcon empty; CFBundleVersion=1; KidsAppLauncher fallback URL = `https://veritypost.com/kids-app`.
- Kids: `aps-environment=development` (set, not prod); App Store URL placeholder in `kids/OpenKidsAppButton.tsx`; PrivacyInfo.xcprivacy present.

These map onto OWNER_TODO_2026-04-24 Apple items (Z03). Defer detailed reconciliation to W2-04 (Apple status thread).

## Q8: story-manager vs kids-story-manager — DUPLICATION CONFIRMED

Per Z14: story-manager (1229 lines) ↔ kids-story-manager (1037 lines), near-identical. Both call `/api/ai/generate` (verified in W2-10 Q9). The kid version differs only by a `type: 'kids_story'` body field and presumably a `kid_safe` filter on listing.

**Recommended fix:** merge into a single `story-manager` page with a `?kid=true` toggle (or scope=kids/adult tab). Eliminates 1037 lines of duplication.

## Q9: /api/kids/trial — DEFERRED to Wave 3

Need to read the route directly to confirm it requires parent auth before creating a trial.

## Confirmed duplicates
- `admin/story-manager` ↔ `admin/kids-story-manager` (~1000 lines duplicate)

## Confirmed stale
- CLAUDE.md "ParentalGateModal — zero callers" — actually 4 callers
- Round 2 L08-001 "kid RLS blocks writes" framing — wrong as stated; RLS is correct

## Confirmed conflicts (real bugs)
- KidsAppState dual-source: optimistic local mutation + partial reload; verityScore/quizzesPassed drift on server failure
- BadgeUnlockScene unreachable (biasedSpotted hardcoded false)
- QuizPassScene orphan (no external caller)

## Unresolved (needs Wave 3)
- /api/kids/trial gate
- L08-001 lens reading: was the original claim about a different table or different RLS branch?
- Whether bias-spotting is a real product feature or scrap

## Recommended actions
1. **Update CLAUDE.md** — remove "ParentalGate zero callers" statement.
2. **Make `completeQuiz` async** + reconcile state from server response.
3. **Decide bias-spotting product fate** — wire it or delete `BadgeUnlockScene` + `biasedSpotted` parameter.
4. **Decide QuizPassScene fate** — wire it (it's intended end of pass animation per KidQuizEngineView comment) or delete.
5. **Merge** `admin/story-manager` + `admin/kids-story-manager` with kid filter toggle.
6. **Pin Apple-block items** to W2-04 thread for owner action.
