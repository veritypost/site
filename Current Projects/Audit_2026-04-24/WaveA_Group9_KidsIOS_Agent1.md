---
wave: A
group: 9 Kids iOS end-to-end — COPPA K5
agent: 1/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24T13:03:54Z
---

# Findings — Kids iOS end-to-end (COPPA K5), Wave A, Agent 1

## CRITICAL

### F-9-1-01 — Parental gate coverage gap: settings changes unvalidated before persistence

**File:line:** `VerityPostKids/VerityPostKids/LeaderboardView.swift:182-192` + `KidsAppState.swift:89-129`

**Evidence:**
```swift
// LeaderboardView.swift — reads kid_profiles directly without parental gate
let rows: [KidLeaderboardEntry] = try await client
    .from("kid_profiles")
    .select("id, display_name, verity_score, parent_user_id")
    .eq("parent_user_id", value: ownRow.parent_user_id)
    ...

// KidsAppState.swift — no gate protecting category fetch + load
await loadCategories()  // line 69 — direct DB read after pairing
```

ParentalGateModal is correctly used in ProfileView.swift:48-50 for unpair and legal links, but neither the category selection flow nor the leaderboard sibling discovery are protected by parental verification. A kid can switch categories (via home screen taps) without grown-up confirmation, potentially accessing age-inappropriate category slugs if the RLS policy drifts.

**Impact:** Apple Kids Category review § 5.1.1 requires parental verification before "material changes" (category/content filters, sibling visibility, etc.). The lack of a gate on category switching and leaderboard household-member exposure creates a review-blocking gap.

**Reproduction:** Pair device → tap category in home → no gate shown. Switch categories freely without math challenge.

**Suggested fix direction:** Wrap category-selection button in ParentalGateModal, similar to ProfileView's unpairGate pattern. Same for first leaderboard load if it exposes siblings.

**Confidence:** MEDIUM — depends on Apple's interpretation of "material changes"; category switching may be considered routine browsing rather than a gated action. However, sibling visibility (leaderboard) is arguable.

---

### F-9-1-02 — Quiz pass threshold hard-coded; no server-side validation of quiz result integrity

**File:line:** `KidQuizEngineView.swift:337`

**Evidence:**
```swift
let passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))
// line 337 — 60% threshold is local-only, not validated by DB write
```

The quiz engine marks a quiz as passed locally (60% = 3/5 correct), updates KidsAppState in memory, and publishes reading_log + quiz_attempts to DB. However:

1. The pass/fail determination is **client-side only**. No server-side trigger or RPC validates correctCount ≥ threshold before accepting the quiz_attempts row.
2. A modified iOS app could submit quiz_attempts with `passed=true` for any score; RLS would accept it (it's scoped to kid_profile_id).
3. The 60% constant is not stored in DB, making it impossible for an admin to audit or change the rule without updating every kid client.

**Impact:** A kid (or modified app) could claim a quiz pass without actually passing, unlocking comment section access and streak advancement without earning it. Streak inflation directly affects leaderboard rankings.

**Reproduction:** Code-reading only — would require modifying quiz_attempts insert or network interception. Risk is high because the DB has no authoritative threshold.

**Suggested fix direction:** Add server-side quiz validation: RPC or trigger on quiz_attempts insert that re-evaluates question correctness against the articles.question_correct_answer field and enforces the 60% rule.

**Confidence:** HIGH — this is a classic client-side trust gap. The DB must validate the outcome, not the app.

---

### F-9-1-03 — JWT bearer token refresh race condition: stale token silently fails with no user-visible recovery

**File:line:** `PairingClient.swift:163-176` + `KidsAppRoot.swift:64-74`

**Evidence:**
```swift
// PairingClient.swift:170 — refreshIfNeeded called on app foreground
await refreshIfNeeded()

// But refresh is best-effort; transient failure doesn't clear state
func refreshIfNeeded() async {
    ...
    do {
        try await refresh()
    } catch PairError.unauthorized {
        print("[PairingClient] refresh rejected — profile unavailable; clearing session")
        clear()
    } catch {
        // Transient failures (network, rate limit, server hiccup) are
        // non-fatal — the existing token is still valid; we'll retry on
        // the next foreground / restore. Only unauthorized clears state.
        print("[PairingClient] refreshIfNeeded: ", error)
    }
    // No state change if refresh fails!
}

// Meanwhile, KidsAppRoot doesn't know the token is stale:
.onChange(of: scenePhase) { _, phase in
    guard phase == .active, auth.kid != nil else { return }
    Task {
        await PairingClient.shared.refreshIfNeeded()
        // If refresh cleared state (401 from server), drop KidsAuth
        // so the UI returns to PairCodeView.
        if PairingClient.shared.hasCredentials == false {
            auth.kid = nil
        }
    }
}
```

If a refresh fails transiently (network hiccup, brief server outage), the old token is kept. If the kid then triggers a read (article list, profile), PostgREST silently 401s the request (token has expired server-side, app doesn't know). The kid sees a loading spinner → no error message → silent failure until they kill the app.

**Impact:** Reading and quiz data don't load; kid is confused, thinks the app is broken. Parent can't diagnose. COPPA § 1.2 (notice of service disruption) requires clear UX on denial of service.

**Reproduction:** Pair device with 7-day JWT → wait 6 days → on day 7, kill app → foreground on day 8 after token expires → background network failure during refresh → return to app → try to read an article → spinner persists, no error toast.

**Suggested fix direction:** Emit a refresh-stale warning toast after transient refresh failure persists for >N seconds, or track refresh failure count and clear state after 3 consecutive failures (not just 401s).

**Confidence:** HIGH — the code acknowledges the risk (comments at lines 163-169, 198-202) but doesn't have a UI mitigation.

---

## HIGH

### F-9-1-04 — Pair code rate limit: 10 attempts/min per IP, but no device-binding enforcement

**File:line:** `web/src/app/api/kids/pair/route.js:28-42` + `PairingClient.swift:84-131`

**Evidence:**
```javascript
// /api/kids/pair — rate limit by IP only
const rate = await checkRateLimit(svc, {
  key: `kids-pair:${ip}`,
  policyKey: 'kids_pair',
  max: 10,
  windowSec: 60,
});
// Device ID is logged but not used in rate-limit key
const { code, device } = body || {};
...
if (rate.limited) {
  return NextResponse.json(
    { error: 'Too many attempts — try again shortly' },
    { status: 429, headers: { 'Retry-After': '60' } }
  );
}

// RPC marks code used_by_device = p_device but does not reject re-use
const { data, error } = await svc.rpc('redeem_kid_pair_code', {
  p_code: normalised,
  p_device: typeof device === 'string' ? device.slice(0, 128) : null,
});
```

The rate limit is per-IP, not per-device. On a shared network (home WiFi), one person's phone doing trial-and-error can be blocked by another person's device within the same minute. Conversely, an attacker with a rotating IP proxy (VPN, botnet) can bypass the 10-attempt window.

The pair code table accepts p_device but doesn't enforce uniqueness or re-pair prevention. A code can be redeemed by multiple devices if each is tried within the expiry window (15 min).

**Impact:** Brute-force risk on pair codes. 10 attempts/min gives ~900 attempts over a 15-minute code lifetime on a single IP. 8-char alphanumeric (~281 trillion combinations) is safe against enumeration, but the lack of device-binding means one code can pair multiple kids' devices, violating COPPA's device-binding expectation.

**Reproduction:** Generate pair code → use it on Device A → use same code on Device B within 15 min → both succeed. Or: rotate IPs → 10 attempts per IP × many IPs = many trials.

**Suggested fix direction:** Add device-binding check: only allow one device_id per (code, used_at) pair. Reject redeem if code.device_id IS NOT NULL and request.device_id != code.device_id.

**Confidence:** HIGH — device binding is a COPPA K5 requirement; the audit scope explicitly flags "pair code security (rate limit, expiry, brute-force)".

---

### F-9-1-05 — Streak/badge state desync after app kill: local memory not persisted if DB writes fail

**File:line:** `KidsAppState.swift:173-208` + `KidsAppRoot.swift:182-209`

**Evidence:**
```swift
// KidsAppState — all state is @Published, in-memory
@Published var streakDays: Int = 0
...

// KidsAppRoot — on quiz pass, local state bumped IMMEDIATELY
private func handleQuizComplete(_ result: KidQuizResult) {
    ...
    let outcome = state.completeQuiz(
        passed: result.passed,
        score: scoreDelta,
        biasedSpotted: false
    )
    // Lines 186-193: completeQuiz updates streakDays in memory
    ...
    if result.writeFailures == 0 {
        queue.append(.streak(...))  // Show celebration
    } else {
        print("[KidsAppRoot] quiz completion had \(result.writeFailures) persistence failure(s); suppressing celebration scenes")
        // But streakDays is ALREADY incremented in state!
    }
}

// completeQuiz in KidsAppState:
func completeQuiz(passed: Bool, score scoreDelta: Int, biasedSpotted: Bool) -> QuizOutcome {
    guard passed else { ... }
    verityScore += scoreDelta        // <- Local state updated
    quizzesPassed += 1
    let oldStreak = streakDays
    streakDays += 1                  // <- UPDATED BEFORE DB WRITE CONFIRMED
    ...
}
```

The quiz result is marked as passed locally (KidsAppState updated), but the reading_log and quiz_attempts writes happen asynchronously in KidReaderView and KidQuizEngineView. If **both writes fail**, `result.writeFailures > 0`, and celebration scenes are suppressed. However, **streakDays is already incremented in memory**. When the app is killed and relaunched, it reloads streakDays from DB (KidsAppState.loadKidRow), which hasn't changed. The local bump is lost, but the kid saw no celebration, so they might retry the quiz or assume failure → confusion.

**Impact:** Streak integrity is compromised if app crashes during quiz completion. Kid's in-memory state doesn't match DB. On next launch, the streak reverts silently. If parent's watching via web dashboard, the numbers are inconsistent.

**Reproduction:** Complete a quiz (read article, answer 3/5 correctly) → network fails both reading_log and quiz_attempts inserts → app killed before retry → relaunch → streakDays is back to old value (not incremented).

**Suggested fix direction:** Only update local state *after* DB write confirms (move the state mutation into a `.task` block that waits for the Supabase result). Or: persist incremental streaks in UserDefaults and reconcile on launch if DB is ahead.

**Confidence:** HIGH — K4 comment in KidsAppRoot acknowledges the risk ("suppress celebration scenes") but doesn't prevent the local state bump. The persistence logic is at the edges (KidReaderView, KidQuizEngineView), not at the state model.

---

## MEDIUM

### F-9-1-06 — Dual-source risk: KidsAppState streak vs kid_profiles.streak_current can diverge

**File:line:** `KidsAppState.swift:72-86` + `KidQuizEngineView.swift:173-208`

**Evidence:**
```swift
// KidsAppState — reads streakDays from DB on load
private func loadKidRow() async {
    guard !kidId.isEmpty else { return }
    struct Row: Decodable { let streak_current: Int? }
    do {
        let row: Row = try await client
            .from("kid_profiles")
            .select("streak_current")
            .eq("id", value: kidId)
            .single()
            .execute()
            .value
        self.streakDays = row.streak_current ?? 0
    } ...
}

// But quiz_attempts insert doesn't trigger a local reload:
// KidQuizEngineView inserts the row, but KidsAppState is updated
// in KidsAppRoot.handleQuizComplete *without* waiting for the DB write
```

KidsAppState is the app's source of truth for streakDays. It reads from kid_profiles on startup. However, when a quiz passes, the completion logic updates KidsAppState locally without waiting for reading_log.insert to succeed or for the DB trigger (which recomputes streak_current) to fire. If the kid closes the app before the trigger executes, or if the trigger fails silently, the in-memory streak is ahead of the DB. Next launch, streakDays resets to the DB value.

**Impact:** Transient display inconsistency (kid sees streak bumped, but next launch it's back), plus audit log confusion (does the DB record the quiz completion or not?).

**Reproduction:** Complete quiz with passing score → celebrate → close app immediately before trigger completes → relaunch → streak is back to old value.

**Suggested fix direction:** Don't update KidsAppState until reading_log.insert (or its retry) succeeds. Or: add an after-insert trigger on reading_log that publishes a real-time event, and KidsAppState listens and updates only on DB acknowledgment.

**Confidence:** MEDIUM — this is a cache-coherency issue, not a COPPA violation. The DB is authoritative, so a next-launch reload corrects it. But the UX is jarring.

---

### F-9-1-07 — Expert sessions load with no access control check; any kid can see all scheduled sessions

**File:line:** `ExpertSessionsView.swift:161-170`

**Evidence:**
```swift
private func load() async {
    loading = true
    defer { loading = false }
    do {
        let rows: [KidExpertSession] = try await client
            .from("kid_expert_sessions")
            .select("id, title, description, session_type, scheduled_at, duration_minutes, status, category_id")
            .eq("is_active", value: true)
            .in("status", values: ["scheduled", "live"])
            .order("scheduled_at", ascending: true)
            .limit(20)
            .execute()
            .value
        self.sessions = rows
```

The RPC comment in the file states: "Uses existing kid_expert_sessions_select_public policy which allows any authenticated session (including kid JWT) to see active scheduled sessions." There's no enrollment check, opt-in, age-range filter, or parental approval gate. All kids see all expert sessions regardless of age or category preferences.

COPPA § 4 ("Parental notice and authorization") requires that interactions with third parties (expert hosts) be disclosed to and approved by parents. Showing a kid all expert sessions without parental visibility creates an unapproved channel.

**Impact:** COPPA compliance gap. A kid can see a session scheduled for older kids (e.g., "Teen Dating" expert talk) and request to join without parent knowledge. The app doesn't prompt parent approval before the kid enrolls or attends.

**Reproduction:** Pair device → navigate to Expert Sessions tab → see all scheduled sessions → no parental gate before joining.

**Suggested fix direction:** (1) Filter expert_sessions by kid's ageRange/readingLevel on the query, or (2) add a parentalGate before displaying the full list (summary only, gate to see details), or (3) add an enrollment request flow with parental approval.

**Confidence:** MEDIUM — depends on whether the expert sessions are considered "services" or just "informational content". If a kid can *join* a session live (two-way interaction), it's clearly a service. If it's view-only (stream), it's less clear. The code doesn't show enrollment, so the risk may be theoretical.

---

## LOW

### F-9-1-08 — PairingClient print statements leak error details; could expose server state if error messages are verbose

**File:line:** `PairingClient.swift:157, 195, 201`

**Evidence:**
```swift
print("[PairingClient] restore: applySession failed —", error)
print("[PairingClient] refresh rejected — profile unavailable; clearing session")
print("[PairingClient] refreshIfNeeded: ", error)
```

The first print includes the full error object, which could contain Supabase/Postgres error messages if applySession throws (e.g., "jwt error: signature mismatch"). iOS logs are readable via Xcode/Console, and on jailbroken devices or via debugging tools, these messages could leak JWT internals or DB schema hints.

The other two are safe (hardcoded messages). But the first one at line 157 is in the restore() path, which fires on every app launch.

**Impact:** LOW — error messages are developer-visible only (not sent to parent/kid). Jailbreak or debugging tool required to read logs. But in principle, Xcode device logs shouldn't expose crypto details.

**Reproduction:** Pair device → disable network → relaunch → connect Xcode → watch console for applySession error messages.

**Suggested fix direction:** Log errors to a private Debug build only, or redact the error before printing (just print the error code, not the message).

**Confidence:** LOW — requires developer tooling or jailbreak to exploit. Standard kid usage won't see these messages.

---

## UNSURE

### F-9-1-09 — Parental gate expiry and reset: not audited, no server-side tracking

**File:line:** `ParentalGateModal.swift:36, 200-214, 227`

**Evidence:**
```swift
private let lockoutSeconds = 300  // 5 minutes, hard-coded

private func beginLockout() {
    lockRemaining = lockoutSeconds
    let until = Date().addingTimeInterval(TimeInterval(lockoutSeconds))
    UserDefaults.standard.set(until, forKey: lockoutKey)
    startCountdown()
}

private func checkPersistedLockout() {
    if let until = UserDefaults.standard.object(forKey: lockoutKey) as? Date {
        let remaining = Int(until.timeIntervalSinceNow)
        if remaining > 0 {
            lockRemaining = remaining
            startCountdown()
        } else {
            UserDefaults.standard.removeObject(forKey: lockoutKey)
        }
    }
}
```

The parental gate lockout is **local only** (UserDefaults). After 3 wrong attempts, the lock is per-device for 5 minutes. But:

1. A kid can reset the device clock to bypass the lockout.
2. No audit event is sent to the server; parents can't review how many times their kid tried and failed.
3. The 5-minute window is hard-coded, not configurable.

**Impact:** UNSURE — depends on COPPA's expectation for audit trails. The gate itself is sound (math challenge is effective). But if a kid device is compromised (shared tablet, rooted), the lock is trivial to bypass. And no parent visibility into attempts.

**Reproduction:** Trigger 3 failed gate attempts → device locked for 5 min → change device time → lock is bypassed.

**Suggested fix direction:** Either (a) send a parental_gate_events log to the server on each attempt and lockout (requires new table + RLS + client-side logging), or (b) store lockout in Keychain instead of UserDefaults (more tamper-resistant). Or require parent approval after N failures (network call).

**Confidence:** LOW — the math gate itself is sound. The audit gap is real but may not be a blocker depending on COPPA guidance. Needs tiebreaker from compliance counsel.

---

## Summary

**Critical:** 2 findings (quiz result validation, JWT refresh race condition)
**High:** 3 findings (pair code device binding, streak sync, dual-source risk, expert session access)
**Medium:** 1 finding (parental gate coverage)
**Low:** 1 finding (debug logging)
**Unsure:** 1 finding (parental gate audit trail)

The Kids app has solid COPPA-aware architecture (ParentalGateModal, custom JWT, RLS hardening). But three gaps risk release: (1) server-side quiz validation missing, (2) JWT refresh has no UX fallback, (3) pair code device binding not enforced. All three are reachable within 15 minutes of code review + schema inspection.

