---
wave: A
group: 9 Kids iOS end-to-end — COPPA K5
agent: 2/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Kids iOS end-to-end, Wave A, Agent 2

## CRITICAL

### F-9-2-01 — Quiz pass threshold (60%) hardcoded in client; server authoritative value missing
**File:line:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:337`
**Evidence:**
```swift
let passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))
```
**Impact:** Kid's pass/fail decision is rendered on client and stored in KidsAppState before persisted writes. If quiz_attempts fails to write but celebration scenes fire (K4 gate check passes), the local pass state persists. A server passing lower threshold (e.g., 55%) would diverge from client belief. More critically, there is no server-side quiz_attempts validation enforcing the threshold — RLS only checks is_correct per answer; the 60% rule is unenforced at write time.
**Reproduction:** Code-reading only. Server does not re-validate pass/fail on quiz_attempts INSERT.
**Suggested fix direction:** Add a server-side trigger or check function to validate cumulative score at quiz completion; return 403 if attempted pass threshold differs from current policy.
**Confidence:** HIGH

### F-9-2-02 — K5 data egress before parent approval: reading_log + quiz_attempts write immediately on page view/answer, no parental gate
**File:line:** `VerityPostKids/VerityPostKids/KidReaderView.swift:149` (takeQuizButton tap), `KidQuizEngineView.swift:284` (revealAnswer)
**Evidence:**
```swift
// KidReaderView line 149: 
Task {
    do {
        try await logReading()  // Immediate INSERT reading_log
    } catch { ... }
    showQuiz = true
}

// KidQuizEngineView line 284:
if chosen.isCorrect { correctCount += 1 }
Task { await writeAttempt(q: q, chosen: chosen) }  // Immediate INSERT quiz_attempts
```
**Impact:** COPPA violation. Parent-delegated kid JWT is set via setBearerToken after pair success, but all subsequent reads and quiz activity log data directly to Supabase before parental gating. ParentalGateModal only guards external links (mailto, web, unpair) — not data collection. The reading activity and quiz answers are persisted server-side immediately, even though COPPA requires parent approval before collection.
**Reproduction:** Pair device → open article → scroll to 80% → "Take quiz" button fires logReading() INSERT without any parental gate. Answer a question → immediate writeAttempt() INSERT.
**Suggested fix direction:** Wrap logReading() and writeAttempt() with a mandatory parental gate before the first write of each session, or batch them server-side and insert them only after explicit parent acknowledgment.
**Confidence:** HIGH

### F-9-2-03 — Dual data source risk: streak/badge persistence can diverge between KidsAppState (in-memory) and kid_profiles (DB)
**File:line:** `VerityPostKids/VerityPostKids/KidsAppState.swift:173` (completeQuiz), `KidsAppRoot.swift:187` (handleQuizComplete)
**Evidence:**
```swift
// KidsAppState.swift line 186:
streakDays += 1  // Local mutation
// Only synced back to DB via kid_profiles.streak_current on next app launch.

// KidsAppRoot.swift line 196-206:
if result.writeFailures == 0 {
    if outcome.newStreak != outcome.previousStreak {
        queue.append(.streak(...))  // Enqueue UI celebration
    }
}
// Celebration fires BEFORE any server re-read of the persisted value.
```
**Impact:** If quiz_attempts double-fails (K4 flag), celebration scenes are suppressed. But KidsAppState.streakDays still incremented locally. On app kill before next load(), the in-memory state is lost; next launch resyncs from kid_profiles.streak_current (which was unchanged by the failed writes). However, if the write *succeeds* but returns transient error (causing writeFailures++ anyway), the streak is both locally claimed AND server-persisted, but the UI suppressed the celebration. Parents see no indication that progress was actually made.
**Reproduction:** Start quiz → answer correctly → quiz_attempts succeeds → but network timeout during response handling → writeFailures incremented due to error handling → celebration suppressed even though DB persisted.
**Suggested fix direction:** Either (a) always re-read streakDays from kid_profiles before firing celebrations, or (b) make writeFailures count only definitive failures (connection loss, 500), not transient parse errors.
**Confidence:** HIGH

## MEDIUM

### F-9-2-04 — Bearer token leaked in refresh() error logs
**File:line:** `VerityPostKids/VerityPostKids/PairingClient.swift:158`
**Evidence:**
```swift
do {
    try await applySession(token: token)
} catch {
    print("[PairingClient] restore: applySession failed —", error)  // Generic error OK
    clear()
    return nil
}
```
But in refresh() on line 201:
```swift
} catch {
    // Transient failures ... 
    print("[PairingClient] refreshIfNeeded: ", error)  // error may contain raw response
}
```
If applySession throws with a network error response that includes the Bearer token echoed back (e.g., some proxies), the token is logged.
**Impact:** Token compromise if logs are exfiltrated or accessed in crash reporting.
**Reproduction:** Trigger a refresh during a network issue with a proxy that echoes Authorization header; check device logs.
**Suggested fix direction:** Sanitize error descriptions; never log raw URLResponse or request errors directly without filtering auth headers.
**Confidence:** MEDIUM

### F-9-2-05 — Custom JWT issuer/algorithm matches no formal spec; refresh rotation doesn't invalidate old token
**File:line:** `web/src/app/api/kids/pair/route.js:87`, `web/src/app/api/kids/refresh/route.js:105`
**Evidence:**
```javascript
// pair route line 87:
const token = jwt.sign({
    aud: 'authenticated',
    exp,
    iat: now,
    iss: 'verity-post-kids-pair',  // Custom issuer
    sub: kid_profile_id,
    role: 'authenticated',
    is_kid_delegated: true,
    kid_profile_id,
    parent_user_id,
}, jwtSecret, { algorithm: 'HS256' });

// refresh route: new token issued but old token valid until exp
```
**Impact:** Old kid JWT remains valid after refresh until original exp time. If a device is stolen or compromised between old and new token, attacker can use the old token for up to 7 days. Lack of jti (JWT ID) claim means no revocation list can be maintained.
**Reproduction:** Code-reading only. No token revocation list or invalidation on refresh.
**Suggested fix direction:** Add jti claim; maintain a revocation list or bump parent_user_id version on logout to mark all prior kid JWTs as invalid.
**Confidence:** MEDIUM

### F-9-2-06 — ParentalGateModal lockout state in UserDefaults; no throttling on fresh pair
**File:line:** `VerityPostKids/VerityPostKids/ParentalGateModal.swift:36-37`, `PairCodeView.swift:178`
**Evidence:**
```swift
// ParentalGateModal.swift line 36:
private let lockoutSeconds = 300  // 5-min lockout
private let lockoutKey = "vp.kids.parental_gate.lockout_until"

// PairCodeView.swift line 178:
if case .rateLimited = err { startCooldown(cooldownWindow) }  // cooldownWindow = 60
```
ParentalGateModal's 5-min lockout is separate from pair code's 60-sec cooldown. A kid can pair rapidly (server-side rate limit: 10 per minute per IP), and each pair code entry is cached in auth.kid. After a failed parental gate (3 wrong answers), the kid cannot retry the math challenge for 5 minutes, but can re-pair on a different device or clear UserDefaults locally.
**Impact:** Parental gate lockout is easily bypassed via re-pairing or app reinstall. The rate limit is IP-based, not device-based; a parent controlling multiple devices can help the kid spam attempts.
**Reproduction:** Fail parental gate 3 times → observe 5-min lockout. Delete app/clear UserDefaults → parental gate usable again. Alternatively, use a second device on the same IP to pair the same kid.
**Suggested fix direction:** Move parental gate lockout to server-side (store in kid_sessions or a new table) so it persists across app reinstalls and devices. Tie to kid_profile_id, not device.
**Confidence:** MEDIUM

## LOW

### F-9-2-07 — Expert sessions read-only view uses kid JWT; no access control beyond RLS
**File:line:** `VerityPostKids/VerityPostKids/ExpertSessionsView.swift:160-169`
**Evidence:**
```swift
let rows: [KidExpertSession] = try await client
    .from("kid_expert_sessions")
    .select("id, title, description, session_type, scheduled_at, duration_minutes, status, category_id")
    .eq("is_active", value: true)
    .in("status", values: ["scheduled", "live"])
    .order("scheduled_at", ascending: true)
    .limit(20)
    .execute()
    .value
```
Assumes RLS policy `kid_expert_sessions_select_public` (mentioned in comment) exists and permits kid JWTs. No error handling if RLS blocks; UI shows empty state.
**Impact:** If RLS policy is missing or drifts, kid sees no sessions. No user-visible error, so parent has no indication access is blocked vs. no sessions exist.
**Reproduction:** Remove `kid_expert_sessions_select_public` RLS policy → load ExpertSessionsView → empty state with no error.
**Suggested fix direction:** Add explicit error UI ("Could not load sessions") when the fetch fails, to distinguish auth failure from empty result.
**Confidence:** LOW

### F-9-2-08 — Quiz question pool not validated on client; server enforces only via RLS
**File:line:** `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:125-135`
**Evidence:**
```swift
let rows: [QuizQuestion] = try await client
    .from("quizzes")
    .select("id, article_id, question_text, question_type, options, explanation, difficulty, points, pool_group, sort_order")
    .eq("article_id", value: article.id)
    .eq("is_active", value: true)
    .is("deleted_at", value: nil)
    .order("sort_order", ascending: true)
    .limit(10)
    .execute()
    .value
```
No client-side check that all questions belong to the current article_id; RLS on quizzes table is the only guard. If RLS is bypassed or the article.id is forged, kid could load questions from any article.
**Impact:** LOW — RLS and the article.id == quiz.article_id join in the WHERE clause mitigate this. But explicit client-side assertion would harden it.
**Reproduction:** Code-reading only. Requires RLS bypass to exploit.
**Suggested fix direction:** Add `guard article.id == loadedQuiz.article_id` after fetch, before displaying.
**Confidence:** LOW

