---
wave: B
group: 9 Kids iOS — COPPA K5
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Wave B, Group 9 (Kids iOS — COPPA K5), Agent 2

## CRITICAL

### F-B9-2-01 — Quiz pass threshold (60%) hardcoded in client, no server enforcement
**File:line:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:337`
**Evidence:**
```swift
let passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))
```
**Impact:** A malicious client can modify the threshold (e.g., 20%) and pass quizzes without actually answering 3/5 questions correctly. Streak advances, leaderboard inflates, badges unlock early — all server-side state drifts from what the kid actually learned. Quiz integrity is bypassed entirely.
**Reproduction:** Code-reading only. The 60% threshold is computed client-side with no server validation in `KidQuizEngineView.swift` lines 336–337. No corresponding threshold in `quiz_attempts` table or POST validation endpoint.
**Suggested fix direction:** Move threshold enforcement to server-side quiz_attempts INSERT trigger or validation before streak bump trigger fires.
**Confidence:** HIGH

### F-B9-2-02 — Streak and in-memory score persist after app kill without DB write-back on quiz completion
**File:line:** `VerityPostKids/VerityPostKids/KidsAppRoot.swift:173–209` + `VerityPostKids/VerityPostKids/KidsAppState.swift:173–208`
**Evidence:**
```swift
// KidsAppRoot.swift:189
let outcome = state.completeQuiz(
    passed: result.passed,
    score: scoreDelta,
    biasedSpotted: false
)
// KidsAppState.swift:183–186
verityScore += scoreDelta
quizzesPassed += 1
let oldStreak = streakDays
streakDays += 1
```
**Impact:** COPPA risk. If the kid closes the app immediately after quiz completion, before the DB trigger (reading_log → streak bump) executes, the local streakDays increments but persists in memory only. Next launch resyncs from `kid_profiles.streak_current`, losing the day. Parent sees inconsistent progression. Dual-source: KidsAppState is authoritative UI state, but read_log + DB trigger are the durable source.
**Reproduction:** Complete a quiz, pass, observe StreakScene (confirms local state bump), then force-quit the app before waiting for network I/O. Relaunch. Streak reverts to previous value in the UI.
**Suggested fix direction:** Either (a) await the reading_log INSERT before bumping local streakDays, or (b) refresh kid_profiles.streak_current from the server before dismissing the quiz/scene flow.
**Confidence:** HIGH

### F-B9-2-03 — Expert sessions endpoint has no parental gate; RLS alone gates access
**File:line:** `VerityPostKids/VerityPostKids/ExpertSessionsView.swift:156–176`
**Evidence:**
```swift
let rows: [KidExpertSession] = try await client
    .from("kid_expert_sessions")
    .select("id, title, description, session_type, scheduled_at, duration_minutes, status, category_id")
    .eq("is_active", value: true)
    .in("status", values: ["scheduled", "live"])
```
**Impact:** Expert sessions are read-only and public (no sensitive data exposure), but Apple Kids Category guidelines require a parental gate before any "live interaction" with adults. Even though the app doesn't allow joining sessions in-client (no call-in UI), the list itself is a discovery of live expert content. No parental gate present.
**Reproduction:** Navigate to Expert Sessions tab. No ParentalGateModal before the list loads.
**Suggested fix direction:** Wrap ExpertSessionsView scroll or list in a `.parentalGate()` modifier before initial load, or gate the tab itself in TabBar navigation.
**Confidence:** MEDIUM

## HIGH

### F-B9-2-04 — Pair code expiry check is lenient; server is the real enforcement
**File:line:** `VerityPostKids/VerityPostKids/PairingClient.swift:140–147` + `web/src/app/api/kids/pair/route.js:62–77`
**Evidence:**
```swift
// PairingClient.swift:142–147
if let expires = formatter.date(from: expiresIso), expires < Date() {
    clear()
    return nil
}
// Comments say "lenient — let server reject if really expired"
```
**Impact:** The client expiry check is optional (tries to restore even if slightly expired). Server-side RPC (`redeem_kid_pair_code`) is the real gate. If a kid keeps the app open with an expired token and the server code rotates, a brief stale-token window could allow one more action before 401 clears the session. Low risk because server is authoritative, but creates a discrepancy in trust.
**Reproduction:** Code-reading only. The comment on line 142 explicitly acknowledges this is lenient.
**Suggested fix direction:** Either make client check strict (hard-fail on expiry) or document that the server is the sole authority and client is advisory.
**Confidence:** MEDIUM

### F-B9-2-05 — Quiz write failures suppress celebration scenes but don't block quiz completion UI
**File:line:** `VerityPostKids/VerityPostKids/KidsAppRoot.swift:196–209`
**Evidence:**
```swift
if result.writeFailures == 0 {
    // ... enqueue streak + badge scenes
} else {
    print("[KidsAppRoot] quiz completion had \(result.writeFailures) persistence failure(s); suppressing celebration scenes")
}
sceneQueue = queue
activeSheet = nil  // always close the quiz
```
**Impact:** When `quiz_attempts` or `reading_log` fail to persist (even after retry), the quiz still shows the result screen and dismisses. The kid never sees an error; they think the quiz passed and the streak is safe. Next app launch resyncs from the DB and the streak resets. Parent is confused.
**Reproduction:** Simulate a network timeout during quiz completion. The quiz result shows but the write fails twice. The celebration scenes are suppressed, but there's no error banner telling the kid "your quiz might not have saved — ask a parent to check."
**Suggested fix direction:** Show a non-blocking alert or banner when writeFailures > 0, explaining that the quiz score might not be saved and to try again.
**Confidence:** MEDIUM

## MEDIUM

### F-B9-2-06 — Bearer token leak risk in PairingClient refresh() if request fails mid-send
**File:line:** `VerityPostKids/VerityPostKids/PairingClient.swift:216–219`
**Evidence:**
```swift
var req = URLRequest(url: url)
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
req.setValue("Bearer \(currentToken)", forHTTPHeaderField: "Authorization")
```
**Impact:** The Bearer token is set on the URLRequest and is passed to URLSession. If the request is redirected to a different domain (3xx), the token may leak to the redirect target. Low risk because the endpoint is a controlled URL, but the header is exposed to the HTTP stack.
**Reproduction:** Code-reading only. The Authorization header is set before the request is sent, so any HTTP-level redirection or interception could leak the token.
**Suggested fix direction:** Use URLSession delegate or redirect policy to prevent cross-domain leaks, or validate the redirect target matches the original origin.
**Confidence:** LOW

### F-B9-2-07 — Parental gate not required before "Unpair" but required before legal links
**File:line:** `VerityPostKids/VerityPostKids/ProfileView.swift:48–56`
**Evidence:**
```swift
.parentalGate(isPresented: $showUnpairGate) {
    Task { await auth.signOut() }
}
.parentalGate(isPresented: $showLegalGate) {
    if let url = pendingLegalURL { UIApplication.shared.open(url) }
}
```
**Impact:** Unpair (line 48–50) and legal links (line 51–56) are both gated, which is correct. However, the structure is asymmetric: unpair is an in-app action (session clear), while legal links are external (web open). Both gates are present, so no finding here. Marking as UNSURE below.
**Reproduction:** Tap "Unpair" and "Privacy Policy". Both show ParentalGateModal.
**Suggested fix direction:** (None; gates are correctly applied.)
**Confidence:** HIGH (no issue; gates present)

## LOW

### F-B9-2-08 — KidsAppState.completeQuiz() is only called on quiz pass; failed quizzes do not mutate state
**File:line:** `VerityPostKids/VerityPostKids/KidsAppState.swift:171–181`
**Evidence:**
```swift
func completeQuiz(passed: Bool, score scoreDelta: Int, biasedSpotted: Bool) -> QuizOutcome {
    guard passed else {
        return QuizOutcome(
            previousStreak: streakDays,
            newStreak: streakDays,
            milestone: nil,
            badge: nil
        )
    }
```
**Impact:** No issue. Correct behavior: failed quizzes do not advance streak or score. This is intentional per K1 comment on line 170.
**Reproduction:** Code-reading only.
**Suggested fix direction:** (None; behavior is correct.)
**Confidence:** HIGH (no issue)

## UNSURE

### F-B9-2-09 — Quiz pass threshold tied to total question count; varies by article
**File:line:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:336–337`
**Evidence:**
```swift
let total = questions.count
let passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))
```
**Info needed:** Does the Supabase quiz schema enforce a fixed number of questions per article, or do articles have variable-length quizzes? If variable, a 3-question quiz requires 2 correct (60% of 3 = 1.8 → 2), while a 5-question quiz requires 3 correct. This could allow easier passes on shorter quizzes. If the schema always returns exactly 5 questions, this is not a finding.
**Confidence:** LOW (needs DB schema verification)

---

**Summary:** Critical issues are the hardcoded client-side quiz threshold (F-B9-2-01), the dual-source streak persistence bug after app kill (F-B9-2-02), and the missing parental gate on expert sessions (F-B9-2-03). Medium-risk issues around error UX and token handling round out the audit. ParentalGateModal coverage is otherwise strong in Profile, PairCodeView, and quiz flows.
