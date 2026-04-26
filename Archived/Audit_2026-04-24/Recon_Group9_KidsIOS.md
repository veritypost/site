---
group: 9 Kids iOS — COPPA K5
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — Group 9: Kids iOS (COPPA K5)

## AGREED findings (≥2 agents, both waves)

### R-9-AGR-01 — Quiz pass threshold (60%) hard-coded in client; no server-side validation
**Severity:** CRITICAL
**File:line:** `KidQuizEngineView.swift:337`
**Surfaced by:** WaveA Agent1, WaveA Agent2, WaveB Agent1, WaveB Agent2, WaveB Agent3 (5/5 agents)
**Consensus description:** 
The quiz pass threshold is calculated locally as 60% correctness (`correctCount >= 0.6 * total`). No server-side validation exists: quiz_attempts INSERT is accepted by RLS without re-evaluating the pass/fail determination against the authoritative threshold. A modified client could submit pass=true with a 20% score, and the DB would accept it. Streak advancement, leaderboard inflation, and badge unlocks all bypass server-side audit.

**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Add Postgres trigger on quiz_attempts INSERT that re-evaluates `correct_count >= 0.6 * total_questions` before acceptance, or move threshold to quizzes/kid_profiles table and fetch at quiz load.

---

### R-9-AGR-02 — Reading log and quiz_attempts written immediately with no prior parental gate
**Severity:** CRITICAL
**File:line:** `KidReaderView.swift:149`, `KidQuizEngineView.swift:284`
**Surfaced by:** WaveA Agent2, WaveB Agent1, WaveB Agent2 (3/5 agents)
**Consensus description:**
When a kid taps "Take quiz" (KidReaderView), a reading_log row is inserted immediately to Supabase. When the kid answers a question (KidQuizEngineView), quiz_attempts is written immediately. Neither write is gated by ParentalGateModal. COPPA § 3.2 requires parental authorization before collection of child data. The app collects activity and quiz answers without explicit parent consent between pairing and first data write.

**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Batch reading_log and quiz_attempts writes server-side and defer insertion until a post-pairing parental approval flow, OR add a mandatory ParentalGateModal before the first article read of each session, OR implement defer-on-write with deferred server-side insertion after parental acknowledgment.

---

### R-9-AGR-03 — Streak and score dual-source: in-memory state vs. kid_profiles DB can diverge
**Severity:** HIGH
**File:line:** `KidsAppState.swift:173-208`, `KidQuizEngineView.swift:297-331`, `KidsAppRoot.swift:187-213`
**Surfaced by:** WaveA Agent1, WaveA Agent2, WaveB Agent1, WaveB Agent2, WaveB Agent3 (5/5 agents)
**Consensus description:**
completeQuiz() in KidsAppState updates streakDays in memory immediately on quiz pass. The reading_log/quiz_attempts writes happen asynchronously. If both writes fail (flagged via writeFailures > 0), celebration scenes are suppressed, but streakDays remains incremented locally. On app kill before next load(), the in-memory state is lost; next launch resyncs from kid_profiles.streak_current (which was never updated by the failed DB writes), reverting the streak. Kid sees brief celebration, then next launch the streak is gone. Parent dashboard shows inconsistent progression.

**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Refactor to await reading_log INSERT before updating local streakDays. Alternatively, defer all state mutations until DB write confirms, or refresh kid_profiles.streak_current from server before displaying celebration scene.

---

### R-9-AGR-04 — Bearer token leak via global headers and URLSession.shared
**Severity:** HIGH
**File:line:** `PairingClient.swift:218`, `SupabaseKidsClient.swift:62-80`
**Surfaced by:** WaveA Agent1, WaveA Agent2, WaveB Agent1, WaveB Agent2, WaveB Agent3 (5/5 agents)
**Consensus description:**
PairingClient.refresh() sets the kid JWT in the Authorization header on URLSession.shared (line 218). SupabaseKidsClient injects the bearer token into global SupabaseClientOptions headers. If the app later opens external URLs or if HTTP logs are collected, the shared session could expose the JWT in plaintext. Additionally, after logout (setBearerToken(nil)), old client references or retained options could still hold the token in memory.

**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Use URLSession(configuration: .ephemeral) for sensitive requests. Isolate token headers to per-request scope instead of global options. Document explicit client invalidation/cleanup on logout.

---

### R-9-AGR-05 — Expert sessions load without parental gate
**Severity:** HIGH
**File:line:** `ExpertSessionsView.swift:156-176`
**Surfaced by:** WaveA Agent1, WaveB Agent1 (2/2 instances), WaveB Agent2, WaveB Agent3 (4/5 agents)
**Consensus description:**
ExpertSessionsView fetches and displays kid_expert_sessions (scheduled and live) with no ParentalGateModal. Unlike ProfileView (unpair, legal links) which enforce .parentalGate(), expert sessions are a new category of third-party interaction that COPPA § 4 (parental notice and authorization) requires to be disclosed and approved. A kid can discover and potentially enroll in expert sessions without parent knowledge or audit trail.

**Suggested disposition:** AUTONOMOUS-FIXABLE
**Rationale:** Wrap ExpertSessionsView or the session load in a .parentalGate() modifier before rendering. Or gate the "Experts" tab itself in TabBar navigation.

---

### R-9-AGR-06 — Pair code rate limit is IP-based, not device-based
**Severity:** HIGH
**File:line:** `web/src/app/api/kids/pair/route.js:31-36`
**Surfaced by:** WaveA Agent1, WaveB Agent1, WaveB Agent3 (3/5 agents)
**Consensus description:**
Rate limit on pair endpoint uses IP address as the key (`kids-pair:${ip}`, max 10 attempts/min). On shared home/school networks, one device's failed pairing attempts can block another device's legitimate pairing. Conversely, an attacker with rotating IPs (VPN, botnet) can enumerate pair codes faster than the per-IP window allows. The pair code table accepts p_device but does not enforce device uniqueness or prevent code re-use across devices.

**Suggested disposition:** OWNER-ACTION
**Rationale:** Rate limit by device_id (sent in pair request) instead of IP, or add server-side per-code attempt counter. Add device-binding check: reject redeem if code.device_id is set and differs from request.device_id. Requires API endpoint modification and RLS policy update (may need product decision on device tracking).

---

## UNIQUE-A findings (Wave A only)

### R-9-UA-01 — Parental gate coverage gap on category switching and leaderboard
**Severity:** MEDIUM
**File:line:** `LeaderboardView.swift:182-192`, `KidsAppState.swift:89-129`
**Surfaced by:** WaveA Agent1 only
**Description:**
ParentalGateModal is correctly used in ProfileView for unpair and legal links, but neither the category selection flow nor the leaderboard sibling discovery are protected by parental verification. A kid can switch categories (via home screen taps) without grown-up confirmation, potentially accessing age-inappropriate content. Sibling visibility on the leaderboard (household-member exposure) is a material change that Apple Kids Category review § 5.1.1 requires to be gated.

**Tiebreaker question:** Does category switching (vs. content browsing) constitute a "material change" per Apple's definition, or is it routine navigation? Does leaderboard visibility of siblings require explicit per-sibling parental approval, or is household-level approval sufficient?

---

### R-9-UA-02 — JWT refresh race condition: stale token fails silently
**Severity:** MEDIUM
**File:line:** `PairingClient.swift:163-176`, `KidsAppRoot.swift:64-74`
**Surfaced by:** WaveA Agent1 only
**Description:**
refreshIfNeeded() is best-effort: transient network failures do not clear state. If refresh fails, the old token is retained. If the token has expired on the server (7-day window), subsequent reads will 401 silently, and the kid sees a loading spinner with no error toast. COPPA § 1.2 requires clear notice of service disruption.

**Tiebreaker question:** Should transient refresh failures trigger an explicit error toast after N seconds, or should the app assume stale tokens and force re-pair after 3 consecutive refresh failures?

---

### R-9-UA-03 — Parental gate lockout local-only; no server-side audit trail
**Severity:** LOW
**File:line:** `ParentalGateModal.swift:36-38, 200-214`
**Surfaced by:** WaveA Agent1 only
**Description:**
Parental gate lockout (5 min after 3 wrong answers) is stored in UserDefaults. A kid can bypass it by resetting the device clock. No audit event is sent to the server; parents cannot review how many times their kid failed and when. The 5-minute window is hard-coded and not configurable.

**Tiebreaker question:** Does COPPA require an audit trail of parental gate attempts visible to parents, or is per-device lockout sufficient?

---

## UNIQUE-B findings (Wave B only)

### R-9-UB-01 — Pair code expiry check is lenient; server is real enforcement
**Severity:** MEDIUM
**File:line:** `PairingClient.swift:140-147`
**Surfaced by:** WaveB Agent2 only
**Description:**
Client-side expiry check (line 142-147) is lenient—comments state "let server reject if really expired." The server-side RPC (redeem_kid_pair_code) is the authoritative gate. If a kid keeps the app open with an expired token and then transitions to a new code, a brief stale-token window could allow one more action before 401 clears the session.

**Tiebreaker question:** Should client expiry check be strict (hard-fail) or optional (advisory only)? Current design is advisory; is that acceptable, or should there be explicit sync/warning between client and server?

---

### R-9-UB-02 — Quiz write failure suppresses celebration but doesn't show error
**Severity:** MEDIUM
**File:line:** `KidsAppRoot.swift:196-209`
**Surfaced by:** WaveB Agent2 only
**Description:**
When quiz_attempts or reading_log write fails (after retry), the quiz still shows the result screen and dismisses. No error banner tells the kid "your quiz might not have saved." The kid thinks they passed; next app launch the streak resets, confusing the kid and parent.

**Tiebreaker question:** Should failed quiz writes show a non-blocking warning banner, or require explicit parent acknowledgment before dismissing the quiz UI?

---

### R-9-UB-03 — Custom JWT issuer has no revocation; old tokens valid until exp
**Severity:** MEDIUM
**File:line:** `web/src/app/api/kids/pair/route.js:87`, `web/src/app/api/kids/refresh/route.js:105`
**Surfaced by:** WaveB Agent2 only
**Description:**
Custom JWTs lack jti (JWT ID) claim and revocation list. On refresh, a new token is issued, but the old token remains valid until original exp time (up to 7 days). If a device is stolen or compromised, an attacker can use the old token for the full 7-day window with no server-side way to revoke it.

**Tiebreaker question:** Is 7-day token lifetime acceptable, or should it be shorter (1 day) with mandatory refresh? Should a parent logout trigger immediate revocation of all prior kid JWTs?

---

## STALE / CONTRADICTED findings

None. All agents align on the core CRITICAL and HIGH findings. No contradictions detected; some findings are Wave-specific elaborations, not disputes.

---

## Summary counts

- **AGREED CRITICAL:** 2 (quiz threshold, data collection pre-gate)
- **AGREED HIGH:** 4 (streak dual-source, bearer token leak, expert sessions no gate, pair rate limit)
- **UNIQUE-A:** 3 (category gate, JWT refresh race, lockout audit)
- **UNIQUE-B:** 3 (pair expiry lenience, write failure UX, JWT revocation)
- **STALE:** 0

**Total findings reconciled:** 12

---

## Risk summary

The Kids iOS app has solid COPPA-aware architecture (ParentalGateModal framework, custom JWT, RLS hardening) but has six agreed-upon gaps that block release:

1. **Quiz integrity** (CRITICAL): Server must validate pass threshold, not trust client.
2. **Data collection timing** (CRITICAL): reading_log and quiz_attempts must not write before parental approval.
3. **Streak persistence** (HIGH): State mutation order causes silent reversion on app kill; must await DB write before local state change.
4. **Token security** (HIGH): Bearer token in global headers and shared session; use ephemeral/isolated session.
5. **Expert sessions** (HIGH): Missing parental gate on third-party interaction; gating required per COPPA § 4.
6. **Pair rate limiting** (HIGH): IP-based limits are network-shared; device-based limits required for accurate brute-force defense.

The three UNIQUE-A and three UNIQUE-B findings are secondary (pairing UX, audit trails, error messaging) and can be resolved post-release with tiebreaker confirmation.

