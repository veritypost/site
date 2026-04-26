---
wave: B
group: 9 Kids iOS—COPPA K5
agent: 3/3
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
dispatched: 2026-04-24
---

# Findings — Kids iOS COPPA K5, Wave B, Agent 3/3

## CRITICAL

### F-B9-3-01 — ParentalGateModal coverage gap: quiz pass threshold not gated

**File:line:** 
- `KidQuizEngineView.swift:337`
- `ParentalGateModal.swift:1-282`
- `ProfileView.swift:48-56`

**Evidence:**
```
KidQuizEngineView.swift:337
let passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))

ParentalGateModal.swift (documentation):
// Parental gate — math challenge modal shown before any external link,
// IAP, settings change, or similar sensitive action.

ProfileView.swift:48-56 (only uses):
.parentalGate(isPresented: $showUnpairGate) { Task { await auth.signOut() } }
.parentalGate(isPresented: $showLegalGate) { UIApplication.shared.open(url, ...) }
```

**Impact:** Quiz pass threshold (60% hard-coded) unlocks comment privileges and streak advancement without parental approval. Kids can pass quizzes → advance streaks → unlock badges → gain social standing, all without parent visibility or consent. No gate before quiz attempt submission or pass acknowledgment. COPPA risk: data flows (quiz attempts, streaks) tied to child identity without parental review per attempt.

**Reproduction:** Code-reading only. Quiz passes at 60% (3/5) with no parental gate invocation in KidQuizEngineView. ParentalGateModal is defined but used only for unpair + legal links in ProfileView, not quiz progression.

**Suggested fix direction:** Add `.parentalGate(isPresented: $showQuizResultGate) { ... }` wrapper before streaks/badges are applied on quiz pass, or gate quiz *entry* if parent approval is intended before any quiz attempt.

**Confidence:** HIGH

---

### F-B9-3-02 — Bearer token leaked via URLSession shared singleton across app

**File:line:**
- `PairingClient.swift:218`
- `SupabaseKidsClient.swift:62-80`

**Evidence:**
```
PairingClient.swift:218
req.setValue("Bearer \(currentToken)", forHTTPHeaderField: "Authorization")
let (data, response) = try await URLSession.shared.data(for: req)

SupabaseKidsClient.swift:62-80
func setBearerToken(_ token: String?) {
  self.client = SupabaseKidsClient.makeClient(
    url: supabaseURL, anonKey: supabaseKey, bearer: token)
}
// makeClient injects into global headers: headers["Authorization"] = "Bearer \(bearer)"
```

**Impact:** Refresh endpoint (`/api/kids/refresh`) sends bearer token via `URLSession.shared`, which is a singleton. If app later opens any URL (e.g., help email, privacy policy via UIApplication.open), the shared session could leak the JWT in HTTP headers if the app's HTTP stack is misconfigured or future code adds logging. RLS depends on JWT claims; leaking the token compromises isolation of all kid_profile_id-scoped reads/writes.

**Reproduction:** Code-reading only. `PairingClient.refresh()` at line 218 explicitly sets `Authorization` header on shared session. No session isolation or custom ephemeral config used.

**Suggested fix direction:** Use `URLSession(configuration: .ephemeral)` or a custom session with isolated header handling for sensitive tokens; do not share headers with global singleton.

**Confidence:** HIGH

---

## HIGH

### F-B9-3-03 — Quiz pass threshold hard-coded: no DB flexibility

**File:line:** `KidQuizEngineView.swift:337`

**Evidence:**
```swift
let passed = correctCount >= max(1, Int(ceil(Double(total) * 0.6)))
```

**Impact:** Pass threshold fixed at 60% in client code. Cannot adjust via parent settings, server config, or A/B test without app release. If product later requires 70% or adaptive thresholds per age, requires forced app update. No server-side enforcement visible.

**Reproduction:** Code-reading only. Literal 0.6 multiplier in client; no DB query for threshold.

**Suggested fix direction:** Move threshold to kid_profiles table or quizzes table; fetch on quiz load and use in calculation.

**Confidence:** HIGH

---

### F-B9-3-04 — Pair code brute-force: rate limit client-side duration mismatch

**File:line:**
- `PairCodeView.swift:27, 178-205`
- `/api/kids/pair/route.js:31-42`

**Evidence:**
```
PairCodeView.swift:27, 178-205
private let cooldownWindow = 60
if case .rateLimited = err { startCooldown(cooldownWindow) }
// 1Hz countdown timer, visible to user

/api/kids/pair/route.js:31-42
max: 10,
windowSec: 60,
// 10 attempts per minute per IP
```

**Impact:** Server enforces 10 attempts/minute per IP; client shows 60s countdown on 429. No account-level rate limit—multiple devices on same IP share quota. Sophisticated attacker with multiple IPs or botnet can still brute-force codes faster than human retry rhythm. Code expiry not visible to client, only "try again" message.

**Reproduction:** Code-reading only. Rate limit is IP-based, not device/code-based.

**Suggested fix direction:** Implement exponential backoff on client; log and alert parent of repeated failed pair attempts.

**Confidence:** HIGH

---

### F-B9-3-05 — Streak/badge persistence survives app kill without DB verification

**File:line:**
- `KidsAppState.swift:19-23, 173-208`
- `KidQuizEngineView.swift:335-346`

**Evidence:**
```
KidsAppState.swift:19-23
@Published var streakDays: Int = 0
@Published var verityScore: Int = 0
@Published var biasedHeadlinesSpotted: Int = 0

KidsAppState.swift:173-208 (completeQuiz)
// Logic runs in memory; no DB fetch to validate before incrementing
func completeQuiz(passed: Bool, score scoreDelta: Int, biasedSpotted: Bool) {
  guard passed else { return QuizOutcome(...) }
  verityScore += scoreDelta
  quizzesPassed += 1
  let oldStreak = streakDays
  streakDays += 1
```

**Impact:** `KidsAppState` holds streak/score in memory and increments locally on quiz pass. If quiz_attempts write fails (flagged in `writeFailures`), the in-memory state still advances. On app kill, state reverts to last DB load, but celebration scenes already fired. Parent sees inflated claims ("Day 8!") if write degraded. No real-time sync after app resume.

**Reproduction:** Code-reading only. Memory state is independent from DB; no refresh on foreground.

**Suggested fix direction:** After quiz pass, fetch fresh kid_profiles row to confirm streak was incremented server-side before showing celebration scene.

**Confidence:** MEDIUM

---

### F-B9-3-06 — Expert sessions read-only RLS: no age-gating on session access

**File:line:**
- `ExpertSessionsView.swift:156-176`
- Comment line 6: `kid_expert_sessions_select_public policy`

**Evidence:**
```
ExpertSessionsView.swift:156-176
let rows: [KidExpertSession] = try await client
  .from("kid_expert_sessions")
  .select("id, title, description, session_type, scheduled_at, duration_minutes, status, category_id")
  .eq("is_active", value: true)
  .in("status", values: ["scheduled", "live"])
  .limit(20)
  .execute()
```

**Impact:** All authenticated kids see all active expert sessions. No age/grade filtering, no parental approval per session. If parent enrolls 7-year-old, they see same expert sessions as 10-year-old. RLS policy mentioned but not verified for age/capability gating.

**Reproduction:** Code-reading only. No age check in client; relies on RLS policy which is not visible.

**Suggested fix direction:** Add age_min/age_max columns to kid_expert_sessions; client-side filter or RLS-enforce.

**Confidence:** MEDIUM

---

## MEDIUM

### F-B9-3-07 — Dual-source risk: KidsAppState vs DB streak after app resume

**File:line:**
- `KidsAppState.swift:72-87`
- `KidQuizEngineView.swift:335-346`

**Evidence:**
```
KidsAppState.swift:72-87 (loadKidRow)
let row: Row = try await client
  .from("kid_profiles")
  .select("streak_current")
  .eq("id", value: kidId)
  .single()
  .execute()
  .value
self.streakDays = row.streak_current ?? 0

KidQuizEngineView.swift:335-346 (local increment, returns value)
let newStreak = streakDays
streakDays += 1
return QuizOutcome(previousStreak: oldStreak, newStreak: streakDays, ...)
```

**Impact:** KidsAppState holds cache of streak_current; KidQuizEngineView increments local state. If user completes quiz but reading_log INSERT succeeds while quiz_attempts fails (or vice versa), the two sources diverge. On next app resume, loadKidRow fetches DB state (ground truth), potentially showing regressed streak if the DB transaction never committed.

**Reproduction:** Code-reading only. No transactional coupling between reading_log + quiz_attempts + kid_profiles streak update.

**Suggested fix direction:** Wrap reading_log + quiz_attempts + streak bump in a single RPC or transaction; or validate DB state matches in-app state on quiz result presentation.

**Confidence:** MEDIUM

---

### F-B9-3-08 — Custom JWT structure assumes SUPABASE_JWT_SECRET static across app life

**File:line:**
- `PairingClient.swift:87-101`
- `/api/kids/pair/route.js:57-101`
- `/api/kids/refresh/route.js:49-119`

**Evidence:**
```
/api/kids/pair/route.js:57-101
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const token = jwt.sign({...}, jwtSecret, { algorithm: 'HS256' })

PairingClient.swift (stores token)
keychainWriteToken(success.access_token)
// Token persisted; if secret rotates server-side, stale tokens still validate
```

**Impact:** If SUPABASE_JWT_SECRET ever rotates (key compromise, migration), old tokens stored in Keychain will no longer validate. Server cannot invalidate in-flight tokens. Refresh endpoint will reject 401, clearing session and forcing re-pair. No grace period or key versioning.

**Reproduction:** Code-reading only. Tokens are stateless; no token revocation list or versioning.

**Suggested fix direction:** Add `kid` claim to JWTs with timestamp; allow server-side grace period for key rotation.

**Confidence:** MEDIUM

---

## LOW

### F-B9-3-09 — ParentalGateModal lockout persisted in UserDefaults (no Keychain)

**File:line:** `ParentalGateModal.swift:36-38, 200-204`

**Evidence:**
```swift
private let lockoutKey = "vp.kids.parental_gate.lockout_until"
let until = Date().addingTimeInterval(TimeInterval(lockoutSeconds))
UserDefaults.standard.set(until, forKey: lockoutKey)
```

**Impact:** Parental gate lockout (5 min after 3 wrong answers) stored in UserDefaults, which is not encrypted on device. Sophisticated attacker with device access could delete the lockout entry and bypass the 5-min cooldown. Keychain would be more resilient. Low severity because physical device compromise is out-of-scope for COPPA.

**Reproduction:** Code-reading only. UserDefaults is user-readable; Keychain is required for secrets.

**Suggested fix direction:** Migrate lockout timestamp to Keychain.

**Confidence:** LOW

---

## UNSURE

### F-B9-3-10 — Quiz article safety filtering: is RLS sufficient?

**File:line:**
- `KidQuizEngineView.swift:103-122`
- `KidReaderView.swift:207-214`

**Evidence:**
```
KidQuizEngineView.swift:103-122
struct ArticleSafety: Decodable { let is_kids_safe: Bool? }
let safetyRows: [ArticleSafety] = try await client
  .from("articles")
  .select("is_kids_safe")
  .eq("id", value: article.id)
  .limit(1)
  .execute()
  .value
if safetyRows.first?.is_kids_safe != true {
  blockedNotKidsSafe = true
```

**Impact:** ASSUMPTION: RLS policy on articles table filters by is_kids_safe for kid JWT. Codebase adds explicit `.eq("is_kids_safe", value: true)` as defense-in-depth (line 103, 211). If RLS policy ever drifts or is removed, the explicit filter is still present. However, no evidence of the RLS policy definition in this audit scope; relies on comment in KidReaderView line 203-206.

**Reproduction:** Would require inspecting Supabase RLS policies directly (outside this file scope).

**Suggested fix direction:** Verify RLS policy exists and is tested; document in code comment.

**Confidence:** LOW (requires RLS policy inspection)

---

