---
wave: B
group: 9 (Kids iOS — COPPA K5)
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Kids iOS COPPA K5, Wave B, Agent 1

## CRITICAL

### F-9-1-01 — ParentalGateModal NOT enforced on expert sessions access
**File:line:** `VerityPostKids/VerityPostKids/KidsAppRoot.swift:104`; `ExpertSessionsView.swift:1–177`
**Evidence:**
```swift
// KidsAppRoot.swift:103-104
case .expert:
    ExpertSessionsView()

// ExpertSessionsView.swift loads kid_expert_sessions with no parental gate:
let rows: [KidExpertSession] = try await client
    .from("kid_expert_sessions")
    .select(...)
    .execute()
    .value
```
**Impact:** Kids can browse, view titles/descriptions of expert sessions without parental verification. COPPA requires parental approval before any material interaction with external experts. Expert contact details (if exposed in future) would leak pre-approval.
**Reproduction:** Pair iOS app → tap "Experts" tab → expert sessions load and display without a ParentalGateModal.
**Suggested fix direction:** Wrap `ExpertSessionsView()` or the session fetch in a `parentalGate()` modifier before rendering/loading.
**Confidence:** HIGH

### F-9-1-02 — Kid JWT bearer token leak in GlobalOptions headers (pre-logout vulnerability)
**File:line:** `SupabaseKidsClient.swift:70–80`
**Evidence:**
```swift
private static func makeClient(url: URL, anonKey: String, bearer: String?) -> SupabaseClient {
    var headers: [String: String] = [:]
    if let bearer {
        headers["Authorization"] = "Bearer \(bearer)"
    }
    let options = SupabaseClientOptions(
        global: SupabaseClientOptions.GlobalOptions(headers: headers)
    )
    return SupabaseClient(supabaseURL: url, supabaseKey: anonKey, options: options)
}
```
**Impact:** Bearer token is stored in a global SupabaseClient header. If the client is discarded/recreated without clearing the reference, debug logs, or introspection, the kid JWT could leak. On `signOut()` (ProfileView.swift:49), `PairingClient.shared.clear()` clears Keychain + UserDefaults, then `setBearerToken(nil)` is called—but if an in-flight request holds a reference to the old client or if options are retained elsewhere, the bearer could be exposed.
**Reproduction:** Code-reading only. Verify that no cached client references exist after `setBearerToken(nil)`.
**Suggested fix direction:** Document explicit client invalidation on logout; consider using weak references or request-level headers instead of global options.
**Confidence:** MEDIUM

### F-9-1-03 — Dual-source streak/badge state creates out-of-sync risk
**File:line:** `KidsAppState.swift:173–208` (in-memory mutations); `KidQuizEngineView.swift:297–331` (DB write); `KidsAppRoot.swift:187–213` (celebration gating on writeFailures)
**Evidence:**
```swift
// KidsAppState in-memory mutation (always fires):
func completeQuiz(passed: Bool, ...) -> QuizOutcome {
    if !passed { return QuizOutcome(...streakDays...) }
    streakDays += 1  // ← always increments if passed
    ...
}

// DB write (can fail after retry):
try? await client.from("quiz_attempts").insert(attempt).execute()
try? await Task.sleep(nanoseconds: 1_000_000_000)
try await client.from("quiz_attempts").insert(attempt).execute()
// ← throws on second failure, but KidsAppState already incremented

// Celebration scenes only suppressed if writeFailures > 0, NOT if initial pass calc is stale
```
**Impact:** If quiz_attempts DB write double-fails, KidsAppState shows `streakDays = N+1` locally, but DB and server-side trigger see only the last attempt (no new reading_log increment). Next app launch resyncs from `kid_profiles.streak_current`, revealing the drift to the kid. The app briefly celebrated a streak that never persisted.
**Reproduction:** Simulate network failure during quiz completion (throttle/kill network mid-insert); pass quiz; observe local streak bumps immediately, but DB insert fails twice. Close app → relaunch → streak resets to pre-quiz value.
**Suggested fix direction:** Block the in-memory `completeQuiz()` call until the DB write succeeds, or use a two-phase commit pattern (write-then-update-local).
**Confidence:** MEDIUM

## HIGH

### F-9-1-04 — Data collection (reading_log, quiz_attempts) begins BEFORE parental verification
**File:line:** `KidReaderView.swift:145–156`; `KidQuizEngineView.swift:284–330`
**Evidence:**
```swift
// KidReaderView.swift: reading_log logged when kid taps "Take quiz"
Button {
    if !logged {
        logged = true
        Task {
            try await logReading()  // ← writes immediately, no gate
        }
        showQuiz = true
    }
} label: { Text("Take the quiz") }

// KidQuizEngineView.swift: quiz_attempts logged after EACH answer
private func revealAnswer(q: QuizQuestion, chosen: QuizOption) {
    if chosen.isCorrect { correctCount += 1 }
    Task { await writeAttempt(...) }  // ← no gate
}
```
**Impact:** COPPA compliance issue: kid's reading behavior and quiz attempts are persisted to the database (and visible to parent on the dashboard) BEFORE the parent explicitly approves the content. The parental gate on settings/unpair (ProfileView) comes AFTER data collection has already begun. A parent who hasn't actively paired might find their child's reading history populated without consent.
**Reproduction:** Pair app → kid taps article → reading_log is inserted → kid taps "Take quiz" → quiz_attempts inserted before any quiz question is answered. Check DB: rows exist even if kid never submits answers.
**Suggested fix direction:** Add a parental gate modal between pairing completion and the first article load, or defer reading_log/quiz_attempts writes until parental verification of the article/quiz.
**Confidence:** HIGH

### F-9-1-05 — ParentalGateModal 60% quiz pass threshold is hard-coded, not enforced server-side
**File:line:** `KidQuizEngineView.swift:337`
**Evidence:**
```swift
let passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))
```
**Impact:** Client-side calculation; a patched app binary could lower the threshold locally without affecting DB. Quiz pass determination (and streak advancement) should be validated server-side in the quiz_attempts RLS policy or a trigger that re-evaluates correctCount.
**Reproduction:** Modify KidQuizEngineView line 337 to `0.5` locally; pass with 3/5 correct; locally shows "Great job!" but server-side quiz_attempts still logs the attempt—no actual pass validation happens server-side.
**Suggested fix direction:** Add a Postgres trigger or RLS policy on quiz_attempts that rejects inserts where correctCount < 0.6 * total, or validate pass in a write-side RPC.
**Confidence:** MEDIUM

## MEDIUM

### F-9-1-06 — Pair code rate limit is IP-based, not device-based; shared networks bypass protection
**File:line:** `/web/src/app/api/kids/pair/route.js:31–36`
**Evidence:**
```javascript
const rate = await checkRateLimit(svc, {
    key: `kids-pair:${ip}`,  // ← IP-based rate limit
    policyKey: 'kids_pair',
    max: 10,
    windowSec: 60,
});
```
**Impact:** Kids in the same school/home network (shared NAT) all compete for the same 10 attempts/minute. A malicious actor on the same network could exhaust the quota for all kids. The generate-pair-code endpoint (line 36 of generate-pair-code/route.js) correctly uses `user.id` (per-parent), but the pair endpoint uses IP. No brute-force protection per code or device ID.
**Reproduction:** Two devices on the same WiFi both attempt to pair simultaneously → both hit the 10-attempt window; second device gets 429 earlier.
**Suggested fix direction:** Rate limit by `device_id` (sent in pair request) instead of IP, or add a per-code attempt counter server-side.
**Confidence:** MEDIUM

### F-9-1-07 — Missing ParentalGateModal on ExpertSessionsView prevents access control auditing
**File:line:** `ExpertSessionsView.swift:156–176`
**Evidence:**
```swift
// No gate between load() and presentation
private func load() async {
    loading = true
    defer { loading = false }
    do {
        let rows: [KidExpertSession] = try await client
            .from("kid_expert_sessions")
            .select("id, title, description, ...")
            .execute()
            .value
        self.sessions = rows
    } catch { ... }
}
// Renders immediately without any parental verification step
```
**Impact:** Unlike settings/unpair (ProfileView) and external links (PairCodeView), expert sessions are a new category-4 interaction that could expose kids to external adult contact. No parental gate means no audit trail, no parental consent checkpoint, and no mechanism to pause/resume expert access per-kid.
**Reproduction:** Tap "Experts" tab → sessions list loads and displays without any modal.
**Suggested fix direction:** Add a boolean `showExpertGate: Bool` state; present ParentalGateModal before rendering the session list (or before navigating into a session).
**Confidence:** MEDIUM

## LOW

### F-9-1-08 — Quiz pass threshold comment may not reflect future refactors
**File:line:** `KidQuizEngineView.swift:337` (comment on line 9)
**Evidence:**
```swift
// K10: outcome payload handed back ... K4: writeFailures counts quiz_attempts rows
// [no comment explaining the 0.6 threshold or how it maps to pass/fail logic]
```
**Impact:** The 60% threshold is implied by the code but not documented. A future refactor might change the constant without realizing its COPPA/product significance.
**Reproduction:** Search for "60" or "threshold" in the file—no documentation found.
**Suggested fix direction:** Add a top-level comment: "// COPPA: quiz pass threshold is 60% (hardcoded as 0.6). Server-side validation required."
**Confidence:** LOW

---

## Summary

**Critical issues:** ParentalGateModal missing on expert sessions (F-9-1-01); potential bearer token leak if client references retained (F-9-1-02).

**High-priority issues:** Data collection (reading_log, quiz_attempts) happens pre-pairing, before any parental gate (F-9-1-04); dual-source state drift between local KidsAppState and DB (F-9-1-03).

**Medium-priority issues:** Client-side quiz pass threshold lacks server-side validation (F-9-1-05); pair code rate limiting is IP-based instead of device-based (F-9-1-06); expert sessions have no gating pattern established (F-9-1-07).

**Total time:** ~12 minutes.
